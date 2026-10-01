import { Logger } from '@nestjs/common';
import WebSocket from 'ws';

export type SttHandlers = {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onSpeechStarted?: () => void;
  onUtteranceEnd?: () => void;
  onError?: (err: Error) => void;
  onOpen?: () => void;
};

/**
 * OpenAI Realtime GA — streaming STT (transcription session).
 * Connect with ?intent=transcription.
 * Aggressive VAD for phone turns (target first transcript ≪ 1s after speech end).
 */
export class OpenAiRealtimeStt {
  private readonly logger = new Logger(OpenAiRealtimeStt.name);
  private ws: WebSocket | null = null;
  private closed = false;
  private openPromise: Promise<void> | null = null;
  private partial = '';

  constructor(
    private readonly apiKey: string,
    private readonly handlers: SttHandlers,
  ) {}

  connect(): Promise<void> {
    if (this.openPromise) return this.openPromise;

    this.openPromise = new Promise((resolve) => {
      const url = 'wss://api.openai.com/v1/realtime?intent=transcription';
      this.logger.log('OpenAI STT connecting intent=transcription');

      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      this.ws = ws;

      ws.on('open', () => {
        this.logger.log('OpenAI Realtime GA STT socket open');
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'transcription',
              audio: {
                input: {
                  format: { type: 'audio/pcmu' },
                  transcription: {
                    // No language lock — Urdu + English mix on Pakistan calls
                    model: 'gpt-4o-mini-transcribe',
                    // Keep prompt SHORT — long keyword lists get hallucinated as the transcript
                    prompt:
                      'Transcribe Pakistani Roman Urdu phone speech fully. Keep full questions like: maine kis inquiry ke liye form submit kiya tha.',
                  },
                  // Longer silence — callers pause mid-question; 450ms was cutting to "mein aap"
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.35,
                    prefix_padding_ms: 280,
                    silence_duration_ms: 750,
                  },
                },
              },
            },
          }),
        );
        this.handlers.onOpen?.();
        resolve();
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
          const type = String(msg.type || '');

          if (type === 'error') {
            const errObj = msg.error as Record<string, unknown> | undefined;
            const message =
              (errObj?.message as string) ||
              JSON.stringify(errObj || msg);
            this.logger.error(
              `OpenAI STT error: ${message} | payload=${JSON.stringify(msg).slice(0, 500)}`,
            );
            this.handlers.onError?.(new Error(`STT:${message}`));
            return;
          }

          if (
            type === 'session.created' ||
            type === 'session.updated' ||
            type === 'transcription_session.created' ||
            type === 'transcription_session.updated'
          ) {
            this.logger.log(`OpenAI STT ${type}`);
            return;
          }

          if (type === 'input_audio_buffer.speech_started') {
            this.handlers.onSpeechStarted?.();
            return;
          }

          if (
            type === 'input_audio_buffer.speech_stopped' ||
            type === 'input_audio_buffer.committed'
          ) {
            this.handlers.onUtteranceEnd?.();
            return;
          }

          if (type === 'conversation.item.input_audio_transcription.delta') {
            const delta = String(msg.delta || '');
            if (delta) {
              this.partial += delta;
              this.handlers.onPartial?.(this.partial.trim());
            }
            return;
          }

          if (type === 'conversation.item.input_audio_transcription.completed') {
            const transcript = String(
              (msg.transcript as string) || this.partial || '',
            ).trim();
            const hadPartial = this.partial;
            this.partial = '';
            // Always emit something if we heard speech — empty finals previously caused silence
            const out = transcript || hadPartial.trim();
            if (out) {
              this.handlers.onFinal(out);
            } else {
              this.logger.warn(
                `STT completed with empty transcript payload=${JSON.stringify(msg).slice(0, 300)}`,
              );
              this.handlers.onFinal('');
            }
            return;
          }

          if (type === 'conversation.item.input_audio_transcription.failed') {
            const detail = msg.error as { message?: string } | undefined;
            const failMsg = detail?.message || JSON.stringify(msg);
            this.logger.warn(`Transcription failed: ${failMsg}`);
            this.handlers.onError?.(new Error(`STT_TRANSCRIBE:${failMsg}`));
            this.partial = '';
          }
        } catch (err) {
          this.handlers.onError?.(err as Error);
        }
      });

      ws.on('error', (err) => {
        this.logger.error(`OpenAI Realtime STT WS: ${err.message}`);
        this.handlers.onError?.(new Error(`STT_WS:${err.message}`));
        resolve();
      });

      ws.on('close', (code, reason) => {
        this.logger.warn(
          `OpenAI STT WS closed code=${code} reason=${reason?.toString() || ''}`,
        );
        this.closed = true;
        this.openPromise = null;
      });
    });

    return this.openPromise;
  }

  sendAudio(base64Mulaw: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.closed) return;
    this.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Mulaw,
      }),
    );
  }

  close() {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.openPromise = null;
  }
}
