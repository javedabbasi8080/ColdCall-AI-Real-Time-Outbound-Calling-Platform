import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import WebSocket from 'ws';
import { ConversationAgent } from '../../knowledge/conversation-agent';
import { normalizeLeadTranscript } from './pk-phone-tts';
import { OpenAiRealtimeStt } from './openai-realtime-stt';
import { ElevenLabsWsTts } from './elevenlabs-ws-tts';
import { PerfTimer } from './perf-timer';

export type RealtimeSessionConfig = {
  callSid: string;
  streamSid: string;
  sessionId: string;
  categoryName: string;
  leadName?: string;
  inbound: boolean;
  agent: ConversationAgent;
  openai: OpenAI;
  openaiModel: string;
  openaiApiKey: string;
  elevenApiKey: string;
  elevenVoiceId: string;
  elevenModelId: string;
  voiceStability?: number;
  voiceSimilarityBoost?: number;
  twilioWs: WebSocket;
  connectedAtMs: number;
  preloadedGreetingUlaw?: string[];
  onPersistTurn: (
    role: 'lead' | 'system',
    message: string,
    meta?: { detectedIntent?: string; rawTranscript?: string },
  ) => void;
  onCallEnd?: () => void;
};

/**
 * Duplex call session — knowledge-driven ConversationAgent (stage + memory + prompt).
 */
export class RealtimeCallSession {
  private readonly logger = new Logger(RealtimeCallSession.name);
  private readonly perf: PerfTimer;
  private readonly agent: ConversationAgent;
  private readonly stt: OpenAiRealtimeStt;
  private readonly tts: ElevenLabsWsTts;
  private speaking = false;
  private processing = false;
  private closed = false;
  private partialBuf = '';
  private lastHeard = '';
  private pendingFinal: string | null = null;
  private lastHandledNorm = '';
  private greeted = false;
  private speculativeStarted = false;
  private sttReady = false;
  private earlyMedia: string[] = [];
  private readonly EARLY_MEDIA_MAX = 80;
  private greetingEndsAt = 0;
  private lastSpeakAt = 0;
  private speechActive = false;

  constructor(private readonly cfg: RealtimeSessionConfig) {
    this.perf = new PerfTimer(cfg.callSid, cfg.connectedAtMs);
    this.perf.mark('WebSocketConnected');
    this.agent = cfg.agent;

    this.tts = new ElevenLabsWsTts(
      cfg.elevenApiKey,
      cfg.elevenVoiceId,
      cfg.elevenModelId,
      {
        onConnected: () => this.perf.mark('ElevenLabsConnection'),
        onStart: () => this.perf.turn('ElevenLabsStarted'),
        onFirstChunk: () => {
          this.speaking = true;
          this.lastSpeakAt = Date.now();
          this.perf.turn('FirstAudioChunk');
          this.perf.turn('AudioPlaybackStarted');
          if (!this.greeted) {
            this.perf.mark('GreetingFirstAudio');
          } else {
            this.perf.turn('ReplyFirstAudio');
          }
        },
        onAudio: (ulawB64) => this.sendTwilioAudio(ulawB64),
        onDone: () => {
          this.speaking = false;
        },
        onError: (err) => this.recordPipelineError('TTS', err),
      },
      {
        stability: cfg.voiceStability ?? 0.5,
        similarityBoost: cfg.voiceSimilarityBoost ?? 0.75,
        speed: 0.95,
      },
    );

    this.stt = new OpenAiRealtimeStt(cfg.openaiApiKey, {
      onOpen: () => {
        this.sttReady = true;
        this.perf.mark('STTReady');
        for (const frame of this.earlyMedia) this.stt.sendAudio(frame);
        this.earlyMedia = [];
      },
      onPartial: (text) => this.onPartial(text),
      onFinal: (text) => void this.onUserUtterance(text, false),
      onError: (err) => this.recordPipelineError('STT', err),
    });
  }

  private onPartial(text: string) {
    this.partialBuf = text;
    this.lastHeard = text;
    if (
      !this.speculativeStarted &&
      !this.processing &&
      !this.speaking &&
      text.trim().split(/\s+/).length >= 3
    ) {
      this.speculativeStarted = true;
    }
  }

  private inGreetingPlayback() {
    return Date.now() < this.greetingEndsAt;
  }

  private sendTwilioAudio(payloadBase64: string) {
    if (this.closed || this.cfg.twilioWs.readyState !== WebSocket.OPEN) return;
    this.cfg.twilioWs.send(
      JSON.stringify({
        event: 'media',
        streamSid: this.cfg.streamSid,
        media: { payload: payloadBase64 },
      }),
    );
  }

  private sendTwilioJson(obj: object) {
    if (this.closed || this.cfg.twilioWs.readyState !== WebSocket.OPEN) return;
    this.cfg.twilioWs.send(JSON.stringify(obj));
  }

  private recordPipelineError(stage: 'STT' | 'TTS' | 'LLM' | 'PIPELINE', err: Error) {
    const msg = err.message || String(err);
    this.logger.error(`[${stage}] call=${this.cfg.callSid} ${msg}`);
    this.cfg.onPersistTurn('system', `(pipeline_error) [${stage}] ${msg}`, {
      detectedIntent: `error_${stage.toLowerCase()}`,
      rawTranscript: msg,
    });
  }

  start() {
    void this.stt.connect();
    void this.tts.warmup().catch((err) => this.recordPipelineError('TTS', err as Error));
    void this.speakGreeting();
  }

  private async speakGreeting() {
    const greeting = this.agent.getGreeting();
    this.perf.mark('GreetingStarted');
    this.cfg.onPersistTurn('system', greeting, { detectedIntent: 'greeting' });
    this.agent.rememberAgent(greeting);

    const pre = this.cfg.preloadedGreetingUlaw;
    if (pre && pre.length > 0) {
      this.logger.log(
        `Greeting PRELOADED frames=${pre.length} call=${this.cfg.callSid}`,
      );
      this.greetingEndsAt = Date.now() + pre.length * 20 + 400;
      this.speaking = true;
      const first = pre[0];
      if (first) {
        this.sendTwilioAudio(first);
        this.perf.mark('GreetingFirstAudio');
        this.perf.mark('FirstAudioChunk');
      }
      for (let i = 1; i < pre.length; i++) {
        if (this.closed) break;
        this.sendTwilioAudio(pre[i]);
        if (i % 4 === 0) await new Promise((r) => setTimeout(r, 15));
      }
      this.speaking = false;
      this.greeted = true;
      this.perf.mark('GreetingPlayed');
      return;
    }

    try {
      await this.tts.warmup();
      this.greetingEndsAt = Date.now() + 5000;
      await this.tts.speak(greeting);
    } catch (err) {
      this.recordPipelineError('TTS', err as Error);
    }
    this.greetingEndsAt = Date.now() + 300;
    this.greeted = true;
    this.perf.mark('GreetingPlayed');
  }

  onTwilioMedia(payloadBase64: string) {
    if (this.closed) return;
    if (this.inGreetingPlayback()) return;
    if (!this.sttReady) {
      if (this.earlyMedia.length < this.EARLY_MEDIA_MAX) {
        this.earlyMedia.push(payloadBase64);
      }
      return;
    }
    this.stt.sendAudio(payloadBase64);
  }

  private interruptPlayback() {
    this.tts.interrupt();
    this.speaking = false;
    this.sendTwilioJson({
      event: 'clear',
      streamSid: this.cfg.streamSid,
    });
  }

  private async onUserUtterance(raw: string, speculative: boolean) {
    const text = normalizeLeadTranscript(raw || '');
    if (!text || text.length < 1) {
      this.logger.warn(`Empty utterance skipped call=${this.cfg.callSid}`);
      return;
    }
    if (this.processing) {
      this.pendingFinal = text;
      return;
    }
    this.processing = true;
    this.partialBuf = '';
    this.lastHeard = '';
    this.lastHandledNorm = text;
    if (this.speaking) this.interruptPlayback();

    this.perf.turn(speculative ? 'FirstPartialTranscript' : 'FinalTranscript');
    this.logger.log(
      `USER call=${this.cfg.callSid} stage=${this.agent.getStageKey()}: "${text.slice(0, 120)}" raw="${(raw || '').slice(0, 120)}"`,
    );
    this.cfg.onPersistTurn('lead', text);
    this.perf.turn('GPTRequestStarted');

    try {
      this.speaking = true;
      let spoken = false;
      const result = await this.agent.reply(
        text,
        async (sentence) => {
          spoken = true;
          this.perf.turn('FirstCompleteSentence');
          await this.tts.speak(sentence);
        },
        { onFirstToken: () => this.perf.turn('FirstGPTToken') },
      );

      // GPT path returns full text without streaming callbacks in some cases
      if (!spoken && result.text) {
        await this.tts.speak(result.text);
      }

      this.speaking = false;
      this.perf.turn('TotalResponseTime');
      this.perf.reportReplyPath();
      this.cfg.onPersistTurn('system', result.text, {
        detectedIntent: this.agent.getStageKey(),
      });

      if (result.shouldEnd) {
        setTimeout(() => this.close(), 1500);
      }
    } catch (err) {
      this.recordPipelineError('LLM', err as Error);
      try {
        await this.tts.speak(
          this.agent.finalizeSpeech('Jee Sir, bilkul. Aap bataiye, main sun rahi hoon.'),
        );
      } catch {
        /* ignore */
      }
    } finally {
      this.processing = false;
      this.speculativeStarted = false;
      if (this.pendingFinal) {
        const next = this.pendingFinal;
        this.pendingFinal = null;
        void this.onUserUtterance(next, false);
      }
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stt.close();
    this.tts.close();
    this.cfg.onCallEnd?.();
  }
}
