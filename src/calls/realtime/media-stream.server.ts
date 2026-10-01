import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import OpenAI from 'openai';
import type { Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { CategoriesService } from '../../categories/categories.service';
import { ConversationAgentFactory } from '../../knowledge/conversation-agent.factory';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { SettingsService } from '../../settings/settings.service';
import { ElevenLabsService } from '../elevenlabs.service';
import {
  CallDirection,
  CallSession,
  CallSessionDocument,
} from '../schemas/call-session.schema';
import {
  ConversationRole,
  ConversationTurn,
  ConversationTurnDocument,
} from '../schemas/conversation-turn.schema';
import { RealtimeCallSession } from './realtime-call-session';

type PipelineKeys = {
  elevenKey: string;
  elevenVoice: string;
  elevenModel: string;
  openaiKey: string;
  openaiModel: string;
  loadedAt: number;
};

/**
 * Twilio Media Streams WebSocket server (/calls/media-stream).
 *
 * Pipeline: Media Streams → OpenAI Realtime STT → GPT stream → ElevenLabs TTS → Media Streams.
 */
@Injectable()
export class MediaStreamServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaStreamServer.name);
  private wss: WebSocketServer | null = null;
  private openai: OpenAI | null = null;
  private readonly live = new Map<string, RealtimeCallSession>();
  private keys: PipelineKeys | null = null;
  private readonly KEYS_TTL_MS = 60_000;
  /** sessionId → pre-baked µ-law greeting frames (base64). */
  private readonly greetingCache = new Map<string, string[]>();

  constructor(
    private readonly settingsService: SettingsService,
    private readonly categoriesService: CategoriesService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly agentFactory: ConversationAgentFactory,
    @InjectModel(CallSession.name)
    private readonly callSessionModel: Model<CallSessionDocument>,
    @InjectModel(ConversationTurn.name)
    private readonly turnModel: Model<ConversationTurnDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
  ) {}

  onModuleInit() {
    // Wired from main.ts via attachToHttpServer after listen
  }

  onModuleDestroy() {
    for (const s of this.live.values()) s.close();
    this.live.clear();
    this.wss?.close();
  }

  attachToHttpServer(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/calls/media-stream' });
    this.wss.on('connection', (ws, req) => {
      this.logger.log(`Media Stream WS connected path=${req.url}`);
      this.handleConnection(ws);
    });
    this.logger.log('Media Stream WebSocket ready at /calls/media-stream');
    void this.prewarm();
  }

  /**
   * Pre-synthesize greeting µ-law BEFORE the Twilio media stream connects
   * so GreetingFirstAudio can be under 300ms.
   */
  async preloadGreeting(opts: {
    sessionId: string;
    leadName?: string;
    categoryId: string;
    inbound?: boolean;
  }): Promise<void> {
    // Keep dial-time preload (often has leadName) — don't overwrite with a second race
    if (this.greetingCache.has(opts.sessionId)) {
      this.logger.log(`Greeting preload skip (already cached) session=${opts.sessionId}`);
      return;
    }
    try {
      const category = await this.categoriesService.findById(opts.categoryId);
      const greeting = await this.agentFactory.pickGreeting({
        categoryId: opts.categoryId,
        leadName: opts.leadName,
        callSid: opts.sessionId,
      });
      const voiceId =
        category.voiceSettings?.elevenLabsVoiceId?.trim() || undefined;
      const frames = await this.elevenLabsService.synthesizeUlawFrames(greeting, {
        voiceId,
        stability: category.voiceSettings?.stability ?? 0.35,
        similarityBoost: category.voiceSettings?.similarityBoost ?? 0.8,
      });
      this.greetingCache.set(opts.sessionId, frames);
      this.logger.log(
        `Greeting preload ready session=${opts.sessionId} frames=${frames.length}`,
      );
    } catch (err) {
      this.logger.warn(
        `Greeting preload failed session=${opts.sessionId}: ${(err as Error).message}`,
      );
    }
  }

  private takeGreeting(sessionId: string): string[] | undefined {
    const frames = this.greetingCache.get(sessionId);
    if (frames) this.greetingCache.delete(sessionId);
    return frames;
  }

  private async prewarm() {
    try {
      await this.refreshKeys();
      if (this.keys?.openaiKey) {
        this.openai = new OpenAI({ apiKey: this.keys.openaiKey });
        void this.openai.models.list().catch(() => undefined);
      }
      this.logger.log(
        `Realtime pipeline prewarmed (openai=${!!this.keys?.openaiKey} eleven=${!!this.keys?.elevenKey})`,
      );
    } catch (err) {
      this.logger.warn(`Prewarm: ${(err as Error).message}`);
    }
  }

  private async refreshKeys(): Promise<PipelineKeys> {
    if (this.keys && Date.now() - this.keys.loadedAt < this.KEYS_TTL_MS) {
      return this.keys;
    }
    const [elevenKey, elevenVoice, elevenModel, openaiKey, openaiModel] =
      await Promise.all([
        this.settingsService.get('ELEVENLABS_API_KEY'),
        this.settingsService.get('ELEVENLABS_VOICE_ID'),
        this.settingsService.get('ELEVENLABS_MODEL_ID'),
        this.settingsService.get('OPENAI_API_KEY'),
        this.settingsService.get('OPENAI_MODEL'),
      ]);
    this.keys = {
      elevenKey: (elevenKey || '').trim(),
      elevenVoice: (elevenVoice || '').trim() || 'EXAVITQu4vr4xnSDxMaL',
      elevenModel: (elevenModel || '').trim() || 'eleven_flash_v2_5',
      openaiKey: (openaiKey || '').trim(),
      openaiModel: (openaiModel || '').trim() || 'gpt-4o-mini',
      loadedAt: Date.now(),
    };
    return this.keys;
  }

  private handleConnection(ws: WebSocket) {
    let streamSid = '';
    let callSid = '';
    let session: RealtimeCallSession | null = null;
    const connectedAtMs = Date.now();
    /** Buffer inbound media while bootSession awaits Mongo — don't drop frames. */
    const bootMediaBuf: string[] = [];

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          event?: string;
          streamSid?: string;
          start?: {
            streamSid?: string;
            callSid?: string;
            customParameters?: Record<string, string>;
          };
          media?: { payload?: string; track?: string };
        };

        if (msg.event === 'connected') {
          this.logger.log('Twilio Media Stream WebSocket Connected');
          return;
        }

        if (msg.event === 'start') {
          streamSid = msg.start?.streamSid || msg.streamSid || '';
          callSid = msg.start?.callSid || '';
          const params = msg.start?.customParameters || {};
          this.logger.log(
            `PERF CallConnected call=${callSid} stream=${streamSid} session=${params.sessionId || '?'}`,
          );
          session = await this.bootSession(
            ws,
            callSid,
            streamSid,
            params,
            connectedAtMs,
          );
          if (session) {
            this.live.set(callSid, session);
            session.start();
            for (const frame of bootMediaBuf) session.onTwilioMedia(frame);
            bootMediaBuf.length = 0;
          } else {
            this.logger.error(`Failed to boot realtime session call=${callSid}`);
            ws.close();
          }
          return;
        }

        if (msg.event === 'media' && msg.media?.payload) {
          if (!msg.media.track || msg.media.track === 'inbound') {
            if (session) session.onTwilioMedia(msg.media.payload);
            else if (bootMediaBuf.length < 100) bootMediaBuf.push(msg.media.payload);
          }
          return;
        }

        if (msg.event === 'stop') {
          this.logger.log(`Media Stream stop call=${callSid}`);
          session?.close();
          if (callSid) this.live.delete(callSid);
          return;
        }
      } catch (err) {
        this.logger.error(`Media Stream message error: ${(err as Error).message}`);
      }
    });

    ws.on('close', () => {
      session?.close();
      if (callSid) this.live.delete(callSid);
    });

    ws.on('error', (err) => {
      this.logger.error(`Media Stream WS error: ${err.message}`);
    });
  }

  private async bootSession(
    twilioWs: WebSocket,
    callSid: string,
    streamSid: string,
    params: Record<string, string>,
    connectedAtMs: number,
  ): Promise<RealtimeCallSession | null> {
    const bootT0 = Date.now();
    const keys = await this.refreshKeys();

    if (!keys.openaiKey) {
      this.logger.error(
        'OPENAI_API_KEY missing — Media Streams requires OpenAI Realtime Speech STT',
      );
      return null;
    }
    if (!keys.elevenKey) {
      this.logger.error('ElevenLabs API key missing for realtime TTS pipeline');
      return null;
    }

    if (!this.openai) this.openai = new OpenAI({ apiKey: keys.openaiKey });

    const callSession = params.sessionId
      ? await this.callSessionModel.findById(params.sessionId).exec()
      : await this.callSessionModel.findOne({ twilioCallSid: callSid }).exec();

    if (!callSession) {
      this.logger.error(`No CallSession for Media Stream call=${callSid}`);
      return null;
    }

    const sessionId = callSession._id.toString();
    const [category, lead] = await Promise.all([
      this.categoriesService.findById(callSession.categoryId.toString()),
      this.leadModel.findById(callSession.leadId).select('name').lean().exec(),
    ]);

    const voiceId =
      category.voiceSettings?.elevenLabsVoiceId?.trim() || keys.elevenVoice;
    const model = keys.openaiModel.includes('mini')
      ? keys.openaiModel
      : 'gpt-4o-mini';

    let preloaded = this.takeGreeting(sessionId);
    // Never block boot on last-chance synthesize — that defeats <300ms greeting.
    // Live path uses persistent WS TTS if preload missed the race.

    this.logger.log(
      `PERF bootSession=${Date.now() - bootT0}ms call=${callSid} category=${category.name} greetingPreload=${preloaded?.length || 0}`,
    );

    const agent = await this.agentFactory.create({
      categoryId: category._id.toString(),
      callSid,
      callSessionId: sessionId,
      leadId: callSession.leadId?.toString(),
      leadName: lead?.name,
      inbound: callSession.direction === CallDirection.INBOUND,
    });

    return new RealtimeCallSession({
      callSid,
      streamSid,
      sessionId,
      categoryName: category.name,
      leadName: lead?.name,
      inbound: callSession.direction === CallDirection.INBOUND,
      agent,
      openai: this.openai,
      openaiModel: model,
      openaiApiKey: keys.openaiKey,
      elevenApiKey: keys.elevenKey,
      elevenVoiceId: voiceId,
      elevenModelId: keys.elevenModel,
      voiceStability: category.voiceSettings?.stability ?? 0.5,
      voiceSimilarityBoost: category.voiceSettings?.similarityBoost ?? 0.75,
      twilioWs,
      connectedAtMs,
      preloadedGreetingUlaw: preloaded,
      onPersistTurn: (role, message, meta) => {
        void this.turnModel.create({
          callSessionId: callSession._id,
          role: role === 'lead' ? ConversationRole.LEAD : ConversationRole.SYSTEM,
          message,
          scriptStep: callSession.currentStep,
          detectedIntent: meta?.detectedIntent || '',
          rawTranscript: meta?.rawTranscript || '',
        });
      },
    });
  }
}
