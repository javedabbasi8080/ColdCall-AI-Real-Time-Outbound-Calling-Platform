import { Logger } from '@nestjs/common';
import WebSocket from 'ws';
import { prepareTtsText } from './pk-phone-tts';

export type TtsHandlers = {
  onAudio: (ulawBase64: string) => void;
  onStart?: () => void;
  onFirstChunk?: () => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
  onConnected?: () => void;
};

/**
 * Persistent ElevenLabs stream-input for an entire phone call.
 *
 * - One WebSocket from call start → call end
 * - auto_mode=true → DO NOT send generation_config (avoids invalid_generation_config)
 * - Never send text:"" (closes socket) — use flush:true to end a turn
 * - Stream LLM text via beginTurn/push/endTurn so audio starts mid-sentence
 */
export class ElevenLabsWsTts {
  private readonly logger = new Logger(ElevenLabsWsTts.name);
  private ws: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private initialized = false;
  private listenerAttached = false;
  private generation = 0;
  private turnGen = 0;
  private firstChunk = false;
  private lastAudioAt = 0;
  private turnResolve: (() => void) | null = null;
  private turnReject: ((e: Error) => void) | null = null;
  private turnSettled = true;

  constructor(
    private readonly apiKey: string,
    private readonly voiceId: string,
    private readonly modelId: string,
    private readonly handlers: TtsHandlers,
    private readonly voiceTuning: { stability?: number; similarityBoost?: number; speed?: number } = {},
  ) {}

  async warmup(): Promise<void> {
    await this.ensureSocket();
    this.sendInit();
  }

  /** Cancel current audio generation; keep the socket open. */
  interrupt() {
    this.generation += 1;
    this.turnGen = this.generation;
    this.firstChunk = false;
    this.finishTurn();
  }

  /**
   * Start a reply turn. Call push() as GPT streams, then endTurn().
   */
  async beginTurn(): Promise<void> {
    await this.ensureSocket();
    this.sendInit();
    this.turnGen = ++this.generation;
    this.firstChunk = false;
    this.lastAudioAt = 0;
    this.turnSettled = false;
    this.handlers.onStart?.();
  }

  /** Feed more text into the current turn (LLM token/sentence chunks). */
  push(text: string) {
    const cleaned = prepareTtsText((text || '').replace(/\s+/g, ' ').trim());
    if (!cleaned || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.turnGen !== this.generation) return;
    try {
      this.ws.send(
        JSON.stringify({
          text: `${cleaned} `,
          try_trigger_generation: true,
        }),
      );
    } catch (err) {
      this.handlers.onError?.(err as Error);
    }
  }

  /** Flush remaining buffer and wait until audio finishes (or idle). */
  async endTurn(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.finishTurn();
      return;
    }
    if (this.turnGen !== this.generation) return;

    try {
      this.ws.send(JSON.stringify({ text: ' ', flush: true }));
    } catch (err) {
      this.handlers.onError?.(err as Error);
      this.finishTurn();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.turnResolve = resolve;
      this.turnReject = reject;
      // Resolve when isFinal OR 450ms silence after last audio (auto_mode often skips isFinal)
      const poll = setInterval(() => {
        if (this.turnSettled) {
          clearInterval(poll);
          return;
        }
        if (this.lastAudioAt && Date.now() - this.lastAudioAt > 450) {
          clearInterval(poll);
          this.handlers.onDone?.();
          this.finishTurn();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(poll);
        if (!this.turnSettled) {
          this.logger.warn('TTS endTurn timeout (4s) — unlocking, socket kept');
          this.finishTurn();
        }
      }, 4_000);
    });
  }

  /** One-shot speak (greeting fallback / short local replies). Always flush. */
  async speak(text: string): Promise<void> {
    const cleaned = prepareTtsText((text || '').replace(/\s+/g, ' ').trim());
    if (!cleaned) return;
    await this.beginTurn();
    // Single message with flush so short lines generate immediately
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.turnGen === this.generation) {
      try {
        this.ws.send(
          JSON.stringify({
            text: `${cleaned} `,
            try_trigger_generation: true,
            flush: true,
          }),
        );
      } catch (err) {
        this.handlers.onError?.(err as Error);
        this.finishTurn();
        return;
      }
      await new Promise<void>((resolve) => {
        this.turnResolve = resolve;
        const poll = setInterval(() => {
          if (this.turnSettled) {
            clearInterval(poll);
            return;
          }
          if (this.lastAudioAt && Date.now() - this.lastAudioAt > 350) {
            clearInterval(poll);
            this.handlers.onDone?.();
            this.finishTurn();
          }
        }, 40);
        setTimeout(() => {
          clearInterval(poll);
          if (!this.turnSettled) {
            this.logger.warn('TTS speak timeout (15s) — unlocking');
            this.finishTurn();
          }
        }, 15_000);
      });
      return;
    }
    this.push(cleaned);
    await this.endTurn();
  }

  private finishTurn() {
    if (this.turnSettled) return;
    this.turnSettled = true;
    const r = this.turnResolve;
    this.turnResolve = null;
    this.turnReject = null;
    r?.();
  }

  private sendInit() {
    if (this.initialized || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    // auto_mode handles chunking — never send generation_config (causes invalid_generation_config)
    this.ws.send(
      JSON.stringify({
        text: ' ',
        voice_settings: {
          // Warmer, less robotic Karachi call-center feel
          stability: this.voiceTuning.stability ?? 0.5,
          similarity_boost: this.voiceTuning.similarityBoost ?? 0.75,
          speed: this.voiceTuning.speed ?? 0.95,
        },
        xi_api_key: this.apiKey,
      }),
    );
    this.initialized = true;
    this.attachListener();
    this.logger.log('ElevenLabs TTS initialized (auto_mode, no generation_config)');
  }

  private attachListener() {
    if (this.listenerAttached || !this.ws) return;
    this.listenerAttached = true;
    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          audio?: string;
          isFinal?: boolean;
          error?: string | { message?: string };
          message?: string;
        };

        if (msg.error) {
          const detail =
            typeof msg.error === 'string'
              ? msg.error
              : msg.error.message || JSON.stringify(msg.error);
          this.logger.error(`ElevenLabs TTS error: ${detail}`);
          this.handlers.onError?.(new Error(`TTS:${detail}`));
          // Drop bad turn but keep socket — do not reconnect unless closed
          this.finishTurn();
          return;
        }

        if (msg.audio && this.turnGen === this.generation) {
          this.lastAudioAt = Date.now();
          if (!this.firstChunk) {
            this.firstChunk = true;
            this.handlers.onFirstChunk?.();
          }
          this.handlers.onAudio(msg.audio);
        }

        if (msg.isFinal && this.turnGen === this.generation) {
          this.handlers.onDone?.();
          this.finishTurn();
        }
      } catch (err) {
        this.handlers.onError?.(err as Error);
      }
    });
  }

  private ensureSocket(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const url =
        `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input` +
        `?model_id=${encodeURIComponent(this.modelId)}` +
        `&output_format=ulaw_8000` +
        `&optimize_streaming_latency=4` +
        `&auto_mode=true` +
        `&inactivity_timeout=180`;

      this.logger.log(
        `ElevenLabs Connection voice=${this.voiceId} model=${this.modelId}`,
      );

      const ws = new WebSocket(url, {
        headers: { 'xi-api-key': this.apiKey },
      });
      this.ws = ws;
      this.initialized = false;
      this.listenerAttached = false;

      ws.on('open', () => {
        this.connecting = null;
        this.logger.log('ElevenLabs socket ready (persistent for call)');
        this.handlers.onConnected?.();
        resolve();
      });

      ws.on('error', (err) => {
        this.logger.error(`ElevenLabs WS error: ${err.message}`);
        this.connecting = null;
        this.handlers.onError?.(new Error(`TTS_WS:${err.message}`));
        reject(err);
      });

      ws.on('close', (code, reason) => {
        this.logger.warn(
          `ElevenLabs closed code=${code} reason=${reason?.toString() || ''}`,
        );
        if (this.ws === ws) {
          this.ws = null;
          this.initialized = false;
          this.listenerAttached = false;
        }
        this.connecting = null;
        this.finishTurn();
      });
    });

    return this.connecting;
  }

  close() {
    this.interrupt();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.connecting = null;
    this.initialized = false;
    this.listenerAttached = false;
  }
}
