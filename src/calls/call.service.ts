import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import twilio from 'twilio';
import { CategoriesService } from '../categories/categories.service';
import { Lead, LeadDocument, LeadStatus } from '../leads/schemas/lead.schema';
import { SettingsService } from '../settings/settings.service';
import { CallQueryDto } from './dto/call-query.dto';
import { ElevenLabsService } from './elevenlabs.service';
import { ScriptEngineService } from './script-engine.service';
import { CallUsageService } from './usage/call-usage.service';
import {
  CallDirection,
  CallOutcome,
  CallSession,
  CallSessionDocument,
  CallSessionStatus,
} from './schemas/call-session.schema';
import {
  ConversationRole,
  ConversationTurn,
  ConversationTurnDocument,
} from './schemas/conversation-turn.schema';
import { shapePakistaniSpeech } from './realtime/pk-urdu-speak';
import { normalizeLeadTranscript, prepareTtsText } from './realtime/pk-phone-tts';
import { MediaStreamServer } from './realtime/media-stream.server';

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);
  /** In-flight AI replies keyed by CallSid — avoids Twilio 15s "response too late". */
  private readonly pendingGather = new Map<
    string,
    { status: 'pending' | 'ready' | 'error'; twiml?: string; createdAt: number }
  >();

  constructor(
    @InjectModel(CallSession.name)
    private readonly callSessionModel: Model<CallSessionDocument>,
    @InjectModel(ConversationTurn.name)
    private readonly turnModel: Model<ConversationTurnDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    private readonly settingsService: SettingsService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly scriptEngineService: ScriptEngineService,
    private readonly categoriesService: CategoriesService,
    private readonly callUsageService: CallUsageService,
    private readonly mediaStreamServer: MediaStreamServer,
  ) {}

  private trackElevenLabsUsage(session: CallSessionDocument, characters: number) {
    if (characters > 0) {
      session.elevenLabsCharacters += characters;
    }
  }

  private trackOpenAiUsage(
    session: CallSessionDocument,
    promptTokens: number,
    completionTokens: number,
  ) {
    if (promptTokens > 0) session.openaiPromptTokens += promptTokens;
    if (completionTokens > 0) session.openaiCompletionTokens += completionTokens;
  }

  private async attachUsage(session: CallSessionDocument) {
    const usage = await this.callUsageService.buildSummary({
      openaiPromptTokens: session.openaiPromptTokens,
      openaiCompletionTokens: session.openaiCompletionTokens,
      elevenLabsCharacters: session.elevenLabsCharacters,
      twilioDurationSeconds: session.durationSeconds,
    });
    return {
      ...session.toObject(),
      usage,
    };
  }

  private async getTwilioClient() {
    const sid = await this.settingsService.get('TWILIO_ACCOUNT_SID');
    const token = await this.settingsService.get('TWILIO_AUTH_TOKEN');
    if (!sid || !token) {
      throw new BadRequestException('Twilio credentials not configured');
    }
    return twilio(sid, token);
  }

  async startCall(leadId: string): Promise<CallSessionDocument> {
    const lead = await this.leadModel.findOne({ _id: leadId, deletedAt: null }).exec();
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if ([LeadStatus.DO_NOT_CALL, LeadStatus.NOT_INTERESTED].includes(lead.status)) {
      throw new BadRequestException(`Cannot call lead with status: ${lead.status}`);
    }

    const session = await this.callSessionModel.create({
      leadId: lead._id,
      categoryId: lead.category,
      status: CallSessionStatus.INITIATED,
      direction: CallDirection.OUTBOUND,
      currentStep: 0,
    });

    const from = await this.settingsService.get('TWILIO_FROM_NUMBER');
    const baseUrl = await this.settingsService.get('TWILIO_WEBHOOK_BASE_URL');
    if (!from || !baseUrl) {
      throw new BadRequestException('Twilio from number or webhook base URL not configured');
    }

    this.logger.log(
      `PIPELINE start_call lead=${leadId} phone=${lead.phone} category=${lead.category} session=${session._id}`,
    );

    const client = await this.getTwilioClient();
    const call = await client.calls.create({
      to: lead.phone,
      from,
      url: `${baseUrl.replace(/\/$/, '')}/calls/webhook/voice`,
      statusCallback: `${baseUrl.replace(/\/$/, '')}/calls/webhook/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      method: 'POST',
    });

    session.twilioCallSid = call.sid;
    session.status = CallSessionStatus.IN_PROGRESS;
    await session.save();
    this.logger.log(
      `PIPELINE dialed CallSid=${call.sid} session=${session._id}`,
    );

    // Preload greeting µ-law while call rings — played instantly on Media Stream start
    void this.mediaStreamServer.preloadGreeting({
      sessionId: session._id.toString(),
      leadName: lead.name,
      categoryId: lead.category.toString(),
      inbound: false,
    });
    // Also warm HTTP mp3 cache for any Gather fallback path
    void this.prewarmLeadGreeting(lead.name, lead.category.toString());

    lead.callAttempts += 1;
    lead.lastCalledAt = new Date();
    lead.status = LeadStatus.CALLED;
    await lead.save();

    return session;
  }

  async handleVoiceWebhook(
    callSid: string,
    meta?: { direction?: string; from?: string; to?: string },
  ): Promise<string> {
    const pipelineStarted = Date.now();
    this.logger.log(
      `PIPELINE voice_start CallSid=${callSid} direction=${meta?.direction || '?'} from=${meta?.from || '?'}`,
    );

    let session: CallSessionDocument | null = await this.callSessionModel
      .findOne({ twilioCallSid: callSid })
      .exec();
    if (!session) {
      this.logger.warn(
        `PIPELINE no_session CallSid=${callSid} — bootstrapping inbound/unknown call`,
      );
      session = await this.bootstrapInboundSession(callSid, meta);
    }

    if (!session) {
      this.logger.error(`PIPELINE abort CallSid=${callSid} — could not create session`);
      return this.voiceErrorFallback();
    }

    this.logger.log(
      `PIPELINE session_ok id=${session._id} direction=${session.direction} step=${session.currentStep} category=${session.categoryId}`,
    );

    const mode =
      (await this.settingsService.get('CALL_VOICE_MODE'))?.trim().toLowerCase() ||
      'media_stream';
    const openaiKey = (await this.settingsService.get('OPENAI_API_KEY'))?.trim();
    const baseUrl = (await this.settingsService.get('TWILIO_WEBHOOK_BASE_URL')) || '';

    // Production voice path: Twilio Media Streams only (no Gather conversational AI)
    if (mode !== 'gather') {
      if (!openaiKey) {
        this.logger.error(
          'OPENAI_API_KEY missing — required for OpenAI Realtime Speech STT.',
        );
        const say = await this.buildTwilioSay(
          'Assalam o Alaikum. System configuration pending. Please try again shortly. Allah hafiz.',
          'urdu',
        );
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say}
  <Hangup/>
</Response>`;
      }
      if (!baseUrl) {
        this.logger.error('TWILIO_WEBHOOK_BASE_URL missing — cannot open Media Stream');
        return this.voiceErrorFallback();
      }
      const wssBase = baseUrl
        .replace(/\/$/, '')
        .replace(/^https:/i, 'wss:')
        .replace(/^http:/i, 'ws:');
      const streamUrl = `${wssBase}/calls/media-stream`;
      this.logger.log(
        `PIPELINE media_stream Connect call=${callSid} session=${session._id} e2e=${Date.now() - pipelineStarted}ms`,
      );
      // Don't block TwiML — preload in background (skip if dial already cached)
      void this.leadModel
        .findById(session.leadId)
        .select('name')
        .lean()
        .exec()
        .then((leadDoc) =>
          this.mediaStreamServer.preloadGreeting({
            sessionId: session!._id.toString(),
            leadName: leadDoc?.name,
            categoryId: session!.categoryId.toString(),
            inbound: session!.direction === CallDirection.INBOUND,
          }),
        );
      void this.turnModel.create({
        callSessionId: session._id,
        role: ConversationRole.SYSTEM,
        message: '(realtime media stream — greeting via WebSocket)',
        scriptStep: session.currentStep,
        detectedIntent: 'media_stream_start',
      });
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${this.escapeXml(streamUrl)}">
      <Parameter name="sessionId" value="${this.escapeXml(session._id.toString())}" />
      <Parameter name="callSid" value="${this.escapeXml(callSid)}" />
    </Stream>
  </Connect>
</Response>`;
    }

    // Explicit CALL_VOICE_MODE=gather only (legacy / debug — not for production sales)
    this.logger.warn(
      `PIPELINE gather_legacy CallSid=${callSid} — set CALL_VOICE_MODE=media_stream for low-latency duplex`,
    );
    let category;
    try {
      category = await this.categoriesService.findById(session.categoryId.toString());
    } catch (err) {
      this.logger.error(
        `PIPELINE category_load_failed categoryId=${session.categoryId}: ${(err as Error).message}`,
      );
      return this.voiceErrorFallback();
    }
    this.validateCategoryScript(session, category);

    const isInbound = session.direction === CallDirection.INBOUND;
    const lead = await this.leadModel
      .findById(session.leadId)
      .select('name')
      .lean()
      .exec();
    const message = this.scriptEngineService.pickGreeting({
      categoryName: category.name,
      inbound: isInbound,
      callKey: callSid,
      leadName: lead?.name,
      playbook: category.playbook,
    });

    this.logger.log(
      `PIPELINE greeting_text (legacy) category="${category.name}" chars=${message.length}`,
    );

    const voiceOverrides = {
      voiceId: category.voiceSettings?.elevenLabsVoiceId,
      stability: category.voiceSettings?.stability ?? 0.4,
      similarityBoost: category.voiceSettings?.similarityBoost ?? 0.72,
    };
    const callLang =
      (category.playbook?.language || '').toLowerCase() === 'english' ? 'english' : 'urdu';

    const spoken = await this.speak(message, callSid, session.currentStep, voiceOverrides, {
      language: callLang,
    });

    void session.save();
    void this.turnModel.create({
      callSessionId: session._id,
      role: ConversationRole.SYSTEM,
      message,
      scriptStep: session.currentStep,
      charactersSynthesized: 0,
    });

    const hints = this.buildSpeechHints(category, session.currentStep);
    const twiml = await this.twimlSpeakThenListen(spoken.twiml, baseUrl, hints);
    this.logger.log(
      `PIPELINE voice_ready (legacy) CallSid=${callSid} e2e=${Date.now() - pipelineStarted}ms`,
    );
    return twiml;
  }

  private async prewarmLeadGreeting(leadName: string, categoryId: string) {
    try {
      const category = await this.categoriesService.findById(categoryId);
      const sample = this.scriptEngineService.pickGreeting({
        categoryName: category.name,
        inbound: false,
        callKey: `prewarm-${categoryId}`,
        leadName,
        playbook: category.playbook,
      });
      await this.elevenLabsService.synthesize(sample, {
        voiceId: category.voiceSettings?.elevenLabsVoiceId,
        stability: category.voiceSettings?.stability ?? 0.35,
        similarityBoost: category.voiceSettings?.similarityBoost ?? 0.8,
      });
    } catch {
      /* optional */
    }
  }

  /**
   * Inbound / unknown CallSid: match lead by From, or create an inbound lead + session.
   */
  private async bootstrapInboundSession(
    callSid: string,
    meta?: { direction?: string; from?: string; to?: string },
  ): Promise<CallSessionDocument | null> {
    const from = (meta?.from || '').trim();
    if (!from) {
      this.logger.error('PIPELINE inbound_fail — missing From number');
      return null;
    }

    let lead = await this.findLeadByPhone(from);
    let categoryId = lead?.category;

    if (!lead) {
      const defaultName =
        (await this.settingsService.get('INBOUND_DEFAULT_CATEGORY'))?.trim() || 'Real estate';
      const category =
        (await this.categoriesService.findByName(defaultName)) ||
        (await this.categoriesService.findFirst());
      if (!category) {
        this.logger.error('PIPELINE inbound_fail — no categories configured');
        return null;
      }
      categoryId = category._id;
      try {
        lead = await this.leadModel.create({
          name: `Inbound ${from}`,
          phone: from,
          category: category._id,
          status: LeadStatus.CALLED,
          notes: 'Auto-created from inbound Twilio call',
          callAttempts: 1,
          lastCalledAt: new Date(),
        });
        this.logger.log(`PIPELINE inbound_lead_created id=${lead._id} phone=${from}`);
      } catch (err) {
        // Race: unique phone — fetch existing
        this.logger.warn(
          `PIPELINE inbound_lead_create race: ${(err as Error).message} — retrying lookup`,
        );
        lead = await this.findLeadByPhone(from);
        if (!lead) return null;
        categoryId = lead.category;
      }
    } else {
      lead.callAttempts += 1;
      lead.lastCalledAt = new Date();
      lead.status = LeadStatus.CALLED;
      void lead.save();
      this.logger.log(`PIPELINE inbound_lead_matched id=${lead._id} phone=${from}`);
    }

    const session = await this.callSessionModel.create({
      leadId: lead._id,
      categoryId,
      twilioCallSid: callSid,
      direction: CallDirection.INBOUND,
      status: CallSessionStatus.IN_PROGRESS,
      currentStep: 0,
    });
    this.logger.log(
      `PIPELINE inbound_session_created id=${session._id} CallSid=${callSid} category=${categoryId}`,
    );
    return session;
  }

  private async findLeadByPhone(rawPhone: string): Promise<LeadDocument | null> {
    const digits = this.digitsOnly(rawPhone);
    if (!digits) return null;

    const exact = await this.leadModel
      .findOne({ phone: rawPhone, deletedAt: null })
      .exec();
    if (exact) return exact;

    const variants = new Set<string>([
      rawPhone,
      `+${digits}`,
      digits,
      digits.slice(-10),
      `+${digits.slice(-10)}`,
    ]);
    if (digits.length >= 10) {
      variants.add(`0${digits.slice(-10)}`);
      variants.add(`+92${digits.slice(-10)}`);
      variants.add(`92${digits.slice(-10)}`);
    }

    const byVariant = await this.leadModel
      .findOne({ phone: { $in: [...variants] }, deletedAt: null })
      .exec();
    if (byVariant) return byVariant;

    // Slow fallback: match by last 10 digits
    const suffix = digits.slice(-10);
    if (suffix.length < 8) return null;
    const candidates = await this.leadModel
      .find({ deletedAt: null })
      .select('phone name category status callAttempts')
      .limit(500)
      .exec();
    return (
      candidates.find((l) => this.digitsOnly(l.phone).endsWith(suffix)) || null
    );
  }

  private digitsOnly(value: string): string {
    return (value || '').replace(/\D/g, '');
  }

  async handleGatherWebhook(
    callSid: string,
    speechResult?: string,
  ): Promise<string> {
    const session = await this.callSessionModel.findOne({ twilioCallSid: callSid }).exec();
    if (!session) {
      return this.twimlHangup('Session not found');
    }

    const baseUrl = (await this.settingsService.get('TWILIO_WEBHOOK_BASE_URL')) || '';
    const transcript = normalizeLeadTranscript((speechResult || '').trim());
    const category = await this.categoriesService.findById(session.categoryId.toString());
    const voiceOverrides = {
      voiceId: category.voiceSettings?.elevenLabsVoiceId,
      stability: category.voiceSettings?.stability ?? 0.4,
      similarityBoost: category.voiceSettings?.similarityBoost ?? 0.72,
    };
    const callLang =
      (category.playbook?.language || '').toLowerCase() === 'english' ? 'english' : 'urdu';

    if (transcript) {
      // Fire-and-forget DB write — do not block Twilio webhook
      void this.turnModel.create({
        callSessionId: session._id,
        role: ConversationRole.LEAD,
        message: transcript,
        rawTranscript: transcript,
        scriptStep: session.currentStep,
      });
    }

    // Empty/noise: respond instantly (no AI/TTS) so Twilio never times out
    if (!transcript || transcript.length < 2) {
      this.logger.log(
        `PIPELINE gather_empty CallSid=${callSid} session=${session._id} step=${session.currentStep}`,
      );
      const recentEmpty = await this.turnModel
        .countDocuments({
          callSessionId: session._id,
          role: ConversationRole.SYSTEM,
          detectedIntent: 'listen_retry',
        })
        .exec();

      if (recentEmpty >= 2) {
        const soft = this.scriptEngineService.pickSoftContinue(category.name, callSid);
        void this.turnModel.create({
          callSessionId: session._id,
          role: ConversationRole.SYSTEM,
          message: soft,
          detectedIntent: 'listen_retry',
          scriptStep: session.currentStep,
        });
        const lang =
          (await this.settingsService.get('TWILIO_SPEECH_LANGUAGE'))?.trim() || 'en-IN';
        const say = await this.buildTwilioSay(soft);
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="${this.escapeXml(lang)}" action="${baseUrl.replace(/\/$/, '')}/calls/webhook/gather" method="POST" timeout="5" speechTimeout="auto" actionOnEmptyResult="true" bargeIn="true" hints="${this.escapeXml(this.buildSpeechHints(category, session.currentStep))}">
    ${say}
  </Gather>
  <Redirect method="POST">${baseUrl.replace(/\/$/, '')}/calls/webhook/gather</Redirect>
</Response>`;
      }

      void this.turnModel.create({
        callSessionId: session._id,
        role: ConversationRole.SYSTEM,
        message: '(listening)',
        detectedIntent: 'listen_retry',
        scriptStep: session.currentStep,
      });
      return this.twimlListenOnly(
        baseUrl,
        this.buildSpeechHints(category, session.currentStep),
      );
    }

    // SYNC FAST PATH: clear yes/hello/no → Twilio Say in ~0ms (no ElevenLabs wait)
    const fast = this.scriptEngineService.tryFastPath(
      category.name,
      session.currentStep,
      transcript,
      category.script,
      callSid,
    );
    if (fast) {
      this.logger.log(
        `PIPELINE gather_fastpath CallSid=${callSid} intent=${fast.intent} step=${session.currentStep}->${fast.nextStep}`,
      );
      const t0 = Date.now();
      const spoken = await this.speak(fast.nextMessage, callSid, fast.nextStep, voiceOverrides, {
        language: callLang,
      });
      this.logger.log(
        `PERF e2e_sync=${Date.now() - t0}ms stt=twilio llm=0 tts=0 fastPath=true intent=${fast.intent}`,
      );

      session.currentStep = fast.nextStep;
      if (fast.shouldEndCall) {
        // Single atomic outcome write — do not also session.save() (ParallelSaveError)
        await this.updateOutcomeFromIntent(session, fast.intent, fast.scheduledCallback);
        void this.turnModel.create({
          callSessionId: session._id,
          role: ConversationRole.SYSTEM,
          message: fast.nextMessage,
          detectedIntent: fast.intent,
          scriptStep: fast.nextStep,
          charactersSynthesized: 0,
        });
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${spoken.twiml}
  <Hangup/>
</Response>`;
      }

      void this.callSessionModel
        .findByIdAndUpdate(session._id, { currentStep: fast.nextStep })
        .exec();
      void this.turnModel.create({
        callSessionId: session._id,
        role: ConversationRole.SYSTEM,
        message: fast.nextMessage,
        detectedIntent: fast.intent,
        scriptStep: fast.nextStep,
        charactersSynthesized: 0,
      });

      return this.twimlSpeakAndListen(
        spoken.twiml,
        baseUrl,
        this.buildSpeechHints(category, fast.nextStep),
      );
    }

    // ASYNC PATH for complex replies: LLM in background, push Twilio Say ASAP (no dead Pause)
    this.logger.log(
      `PIPELINE gather_async CallSid=${callSid} step=${session.currentStep} transcript="${transcript.slice(0, 80)}"`,
    );
    this.pendingGather.set(callSid, {
      status: 'pending',
      createdAt: Date.now(),
    });
    void this.buildGatherReplyInBackground(
      callSid,
      session._id.toString(),
      transcript,
      category,
      voiceOverrides,
      baseUrl,
    );

    const continueUrl = `${baseUrl.replace(/\/$/, '')}/calls/webhook/continue`;
    // Immediate redirect — no Pause — reduces awkward silence while LLM runs
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${continueUrl}</Redirect>
</Response>`;
  }

  /**
   * Polled by Twilio while AI reply is generating. Returns ready TwiML or short wait loop.
   */
  async handleGatherContinue(callSid: string): Promise<string> {
    const pending = this.pendingGather.get(callSid);
    const baseUrl = (await this.settingsService.get('TWILIO_WEBHOOK_BASE_URL')) || '';
    const continueUrl = `${baseUrl.replace(/\/$/, '')}/calls/webhook/continue`;
    const gatherUrl = `${baseUrl.replace(/\/$/, '')}/calls/webhook/gather`;

    // Push already delivered the reply — resume listening without replaying
    if (!pending) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${gatherUrl}</Redirect>
</Response>`;
    }

    if (pending.status === 'ready' && pending.twiml) {
      this.pendingGather.delete(callSid);
      return pending.twiml;
    }

    if (pending.status === 'error') {
      this.pendingGather.delete(callSid);
      const soft = this.scriptEngineService.pickSoftContinue('Real estate', callSid);
      const say = await this.buildTwilioSay(soft);
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say}
  <Redirect method="POST">${gatherUrl}</Redirect>
</Response>`;
    }

    const age = Date.now() - pending.createdAt;
    if (age > 20000) {
      this.pendingGather.delete(callSid);
      const soft = this.scriptEngineService.pickSoftContinue('Real estate', callSid);
      const say = await this.buildTwilioSay(soft);
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say}
  <Redirect method="POST">${gatherUrl}</Redirect>
</Response>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Redirect method="POST">${continueUrl}</Redirect>
</Response>`;
  }

  private async buildGatherReplyInBackground(
    callSid: string,
    sessionId: string,
    transcript: string,
    category: {
      _id?: unknown;
      name: string;
      playbook?: { language?: string };
      script: Array<{
        step: number;
        message: string;
        expectedResponses?: string[];
        objectionRebuttal?: string;
      }>;
      voiceSettings?: {
        elevenLabsVoiceId?: string;
        stability?: number;
        similarityBoost?: number;
      };
    },
    voiceOverrides: {
      voiceId?: string;
      stability?: number;
      similarityBoost?: number;
    },
    baseUrl: string,
  ) {
    const callLang =
      (category.playbook?.language || '').toLowerCase() === 'english' ? 'english' : 'urdu';
    const pipelineStarted = Date.now();
    try {
      const session = await this.callSessionModel.findById(sessionId).exec();
      if (!session) {
        this.pendingGather.set(callSid, { status: 'error', createdAt: Date.now() });
        return;
      }

      const recentTurns = await this.turnModel
        .find({ callSessionId: session._id })
        .sort({ timestamp: -1 })
        .limit(10)
        .select('role message')
        .lean()
        .exec();
      const lead = await this.leadModel.findById(session.leadId).select('name').lean().exec();
      const history = [
        ...recentTurns
          .reverse()
          .filter((t) => t.message && t.message !== '(listening)')
          .map((t) => ({ role: t.role, message: t.message })),
        { role: 'lead', message: transcript },
      ];

      const llmStart = Date.now();
      let result;
      try {
        result = await this.scriptEngineService.process(
          session.categoryId.toString(),
          session.currentStep,
          transcript,
          history,
          category,
          callSid,
          lead?.name,
        );
      } catch (err) {
        this.logger.error(`Script engine failed: ${(err as Error).message}`);
        result = {
          intent: 'rapport',
          nextMessage: this.scriptEngineService.pickSoftContinue(category.name, callSid),
          shouldEndCall: false,
          nextStep: session.currentStep,
          scheduledCallback: null,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        };
      }
      const llmMs = Date.now() - llmStart;

      this.trackOpenAiUsage(session, result.promptTokens, result.completionTokens);

      // Do not staple repetitive closings if the message already ends the call warmly
      let speakText = result.nextMessage;
      if (result.shouldEndCall) {
        const alreadyClosed = /allah hafiz|take care|khayal rakh|goodbye|bye\b/i.test(
          speakText,
        );
        if (!alreadyClosed) {
          speakText = /roofing/i.test(category.name)
            ? `${speakText} Take care!`
            : `${speakText} Allah hafiz!`;
        }
      }

      const ttsStart = Date.now();
      const spoken = await this.speak(
        speakText,
        callSid,
        result.nextStep,
        voiceOverrides,
        { language: callLang },
      );
      const ttsMs = Date.now() - ttsStart;

      if (spoken.audioUrl) {
        this.trackElevenLabsUsage(session, speakText.length);
        session.elevenLabsAudioUrls.push(spoken.audioUrl);
      }
      session.currentStep = result.nextStep;
      if (result.scheduledCallback) {
        session.callbackScheduledAt = new Date(result.scheduledCallback);
      }

      void this.turnModel.create({
        callSessionId: session._id,
        role: ConversationRole.SYSTEM,
        message: speakText,
        audioUrl: spoken.audioUrl,
        detectedIntent: result.intent,
        scriptStep: result.nextStep,
        charactersSynthesized: spoken.audioUrl ? speakText.length : 0,
      });

      let twiml: string;
      if (result.shouldEndCall) {
        await this.updateOutcomeFromIntent(session, result.intent, result.scheduledCallback);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${spoken.twiml}
  <Hangup/>
</Response>`;
      } else {
        await this.callSessionModel
          .findByIdAndUpdate(session._id, {
            currentStep: result.nextStep,
            ...(result.scheduledCallback
              ? { callbackScheduledAt: new Date(result.scheduledCallback) }
              : {}),
          })
          .exec();
        if (spoken.audioUrl) {
          await this.callSessionModel
            .findByIdAndUpdate(session._id, {
              $push: { elevenLabsAudioUrls: spoken.audioUrl },
            })
            .exec();
        }
        twiml = await this.twimlSpeakAndListen(
          spoken.twiml,
          baseUrl,
          this.buildSpeechHints(category, result.nextStep),
        );
      }

      this.pendingGather.set(callSid, {
        status: 'ready',
        twiml,
        createdAt: Date.now(),
      });
      this.logger.log(
        `PERF e2e=${Date.now() - pipelineStarted}ms llm=${llmMs}ms tts=${ttsMs}ms fastPath=${!!result.usedFastPath} intent=${result.intent}`,
      );

      try {
        const pushStart = Date.now();
        const client = await this.getTwilioClient();
        await client.calls(callSid).update({ twiml });
        this.pendingGather.delete(callSid);
        this.logger.log(`PERF playback_push=${Date.now() - pushStart}ms call=${callSid}`);
      } catch (pushErr) {
        this.logger.warn(
          `Could not push TwiML to call (will use Redirect continue): ${(pushErr as Error).message}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Background gather failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      this.pendingGather.set(callSid, { status: 'error', createdAt: Date.now() });
    }
  }

  private async updateOutcomeFromIntent(
    session: CallSessionDocument,
    intent: string,
    scheduledCallback: string | null,
  ) {
    const outcomeMap: Record<string, CallOutcome> = {
      interested: CallOutcome.INTERESTED,
      not_interested: CallOutcome.NOT_INTERESTED,
      callback_request: CallOutcome.CALLBACK,
      objection: CallOutcome.HUNG_UP,
      unclear: CallOutcome.HUNG_UP,
      rapport: CallOutcome.INTERESTED,
    };
    const outcome = outcomeMap[intent] || CallOutcome.HUNG_UP;
    // Atomic update — never session.save() in parallel with other saves on same doc
    await this.callSessionModel
      .findByIdAndUpdate(session._id, {
        outcome,
        status: CallSessionStatus.COMPLETED,
        endedAt: new Date(),
        currentStep: session.currentStep,
      })
      .exec();

    const leadUpdate: Partial<Lead> = {};
    if (intent === 'interested' || intent === 'rapport') {
      leadUpdate.status = LeadStatus.INTERESTED;
    } else if (intent === 'not_interested') {
      leadUpdate.status = LeadStatus.NOT_INTERESTED;
    } else if (intent === 'callback_request') {
      leadUpdate.status = LeadStatus.CALLBACK;
      if (scheduledCallback) {
        leadUpdate.callbackScheduledAt = new Date(scheduledCallback);
      }
    }
    if (Object.keys(leadUpdate).length) {
      await this.leadModel.findByIdAndUpdate(session.leadId, leadUpdate).exec();
    }
  }

  async markCallFailed(callSid: string, reason?: string): Promise<void> {
    if (!callSid) return;
    const session = await this.callSessionModel.findOne({ twilioCallSid: callSid }).exec();
    if (!session) return;
    if (
      session.status !== CallSessionStatus.IN_PROGRESS &&
      session.status !== CallSessionStatus.INITIATED
    ) {
      return;
    }
    session.status = CallSessionStatus.FAILED;
    session.outcome = CallOutcome.HUNG_UP;
    session.endedAt = new Date();
    await session.save();
    await this.turnModel.create({
      callSessionId: session._id,
      role: ConversationRole.SYSTEM,
      message: reason ? `Call failed: ${reason.slice(0, 200)}` : 'Call failed',
      detectedIntent: 'failed',
    });
    this.logger.warn(`Marked call ${callSid} as failed${reason ? `: ${reason}` : ''}`);
  }

  async handleStatusWebhook(
    callSid: string,
    callStatus: string,
    callDuration?: string,
  ): Promise<void> {
    const session = await this.callSessionModel.findOne({ twilioCallSid: callSid }).exec();
    if (!session) return;

    const duration = parseInt(callDuration || '0', 10);
    if (!Number.isNaN(duration) && duration > 0) {
      session.durationSeconds = duration;
    }

    const terminalStatuses = new Set([
      'completed',
      'no-answer',
      'busy',
      'failed',
      'canceled',
      'cancelled',
    ]);

    // Still ringing / answered — keep live, do not clear the card yet.
    if (!terminalStatuses.has(callStatus)) {
      await session.save();
      return;
    }

    session.endedAt = new Date();

    if (callStatus === 'completed') {
      // Always leave live list once Twilio ends the call (drop, hangup, or app error).
      if (
        session.status === CallSessionStatus.IN_PROGRESS ||
        session.status === CallSessionStatus.INITIATED
      ) {
        session.status = CallSessionStatus.COMPLETED;
      }
      if (!session.outcome) {
        session.outcome = CallOutcome.HUNG_UP;
      }
    } else if (callStatus === 'no-answer') {
      session.status = CallSessionStatus.NO_ANSWER;
      session.outcome = CallOutcome.NO_ANSWER;
      await this.leadModel.findByIdAndUpdate(session.leadId, {
        status: LeadStatus.PENDING,
      }).exec();
      await this.turnModel.create({
        callSessionId: session._id,
        role: ConversationRole.SYSTEM,
        message: 'No answer',
        detectedIntent: 'no_answer',
      });
    } else {
      session.status = CallSessionStatus.FAILED;
      if (!session.outcome) {
        session.outcome = CallOutcome.NO_ANSWER;
      }
      await this.turnModel.create({
        callSessionId: session._id,
        role: ConversationRole.SYSTEM,
        message: `Call ${callStatus}`,
        detectedIntent: callStatus,
      });
    }

    await session.save();
    if (terminalStatuses.has(callStatus)) {
      this.scriptEngineService.clearCallMemory(callSid);
      this.pendingGather.delete(callSid);
    }
    this.logger.log(`Call ${callSid} marked ${session.status} (twilio=${callStatus})`);
  }

  /** Close zombie live rows if Twilio status webhook was missed. */
  async reconcileStaleLiveCalls(maxAgeMinutes = 3): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const result = await this.callSessionModel.updateMany(
      {
        status: {
          $in: [CallSessionStatus.IN_PROGRESS, CallSessionStatus.INITIATED],
        },
        startedAt: { $lt: cutoff },
      },
      {
        $set: {
          status: CallSessionStatus.FAILED,
          outcome: CallOutcome.HUNG_UP,
          endedAt: new Date(),
        },
      },
    );
    if (result.modifiedCount > 0) {
      this.logger.warn(`Reconciled ${result.modifiedCount} stale live call(s)`);
    }
    return result.modifiedCount;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Live-call speech.
   * Pakistani Urdu MUST use ElevenLabs + Urdu language (Twilio Say = English/Indian accent).
   */
  private async speak(
    text: string,
    callSid: string,
    step: number,
    voiceOverrides?: {
      voiceId?: string;
      stability?: number;
      similarityBoost?: number;
    },
    opts?: { preferInstant?: boolean; language?: 'urdu' | 'english' },
  ): Promise<{ twiml: string; audioUrl?: string }> {
    text = shapePakistaniSpeech((text || '').replace(/^GOAL:\s*/i, '').trim());
    if (!text) {
      text = this.scriptEngineService.pickSoftContinue('Real estate', callSid);
    }

    const language = opts?.language || 'urdu';
    const mode = (await this.settingsService.get('CALL_TTS_MODE'))?.trim().toLowerCase();
    const elevenKey = (await this.settingsService.get('ELEVENLABS_API_KEY'))?.trim();
    const elevenVoice = (await this.settingsService.get('ELEVENLABS_VOICE_ID'))?.trim();
    const elevenReady = !!(elevenKey && elevenVoice);

    // Urdu accent requires ElevenLabs — never prefer Twilio Say for PK Urdu when ElevenLabs works
    const useEleven =
      elevenReady &&
      (language === 'urdu' || mode === 'elevenlabs' || opts?.preferInstant === false);

    // Roman Urdu only — never Nastaliq for TTS
    const ttsText = language === 'urdu' ? prepareTtsText(text) : text;

    if (!useEleven) {
      const say = await this.buildTwilioSay(ttsText, language);
      this.logger.warn(
        `TTS using Twilio Say (accent limited) — set CALL_TTS_MODE=elevenlabs for Pakistani Urdu. chars=${ttsText.length}`,
      );
      return { twiml: say };
    }

    try {
      const audioUrl = await this.elevenLabsService.streamToTwilio(
        ttsText,
        callSid,
        step,
        {
          ...voiceOverrides,
          languageCode: undefined,
          skipUrduScript: true,
        },
      );
      this.logger.log(
        `PERF tts=elevenlabs lang=roman-urdu chars=${ttsText.length} preview="${ttsText.slice(0, 90)}"`,
      );
      return { twiml: `<Play>${audioUrl}</Play>`, audioUrl };
    } catch (err) {
      this.logger.error(
        `ElevenLabs unavailable, using Twilio Say fallback: ${(err as Error).message}`,
      );
      return { twiml: await this.buildTwilioSay(ttsText, language) };
    }
  }

  private async buildTwilioSay(
    text: string,
    language: 'urdu' | 'english' = 'urdu',
  ): Promise<string> {
    text = language === 'urdu' ? prepareTtsText(text) : shapePakistaniSpeech(text);
    // Twilio has no true Pakistani Urdu neural voice — best effort only as fallback
    const voiceRaw =
      (await this.settingsService.get('TWILIO_SAY_VOICE'))?.trim() || 'Polly.Aditi';
    // Never force en-US — that guarantees an English accent on Urdu text
    const voice = /en-US|Neural2/i.test(voiceRaw) ? 'Polly.Aditi' : voiceRaw;
    const lang = language === 'urdu' ? 'hi-IN' : 'en-US';
    const rate =
      (await this.settingsService.get('TWILIO_SAY_RATE'))?.trim() || '105%';
    const ssml = `<prosody rate="${this.escapeXml(rate)}">${this.escapeXml(text)}</prosody>`;
    return `<Say voice="${this.escapeXml(voice)}" language="${lang}">${ssml}</Say>`;
  }

  private validateCategoryScript(
    session: CallSessionDocument,
    category: {
      name: string;
      knowledge?: { businessName?: string };
      playbook?: { businessName?: string };
      script?: Array<{ step: number; message: string }>;
    },
  ) {
    const biz =
      category.knowledge?.businessName || category.playbook?.businessName || '';
    if (!biz) {
      this.logger.error(
        `Category "${category.name}" (${session.categoryId}) has empty business knowledge for call ${session._id}`,
      );
      return;
    }
    this.logger.log(
      `Loaded knowledge category="${category.name}" business="${biz}" call=${session._id}`,
    );
  }

  private buildSpeechHints(
    category: {
      name: string;
      script: Array<{ step: number; expectedResponses?: string[] }>;
    },
    step: number,
  ): string {
    const fromScript =
      category.script.find((s) => s.step === step)?.expectedResponses || [];
    const base = [
      'ji',
      'haan',
      'nahi',
      'theek hai',
      'bilkul',
      'yes',
      'no',
      'ok',
      'busy',
      'call back',
      'interested',
      'information',
      ...fromScript,
    ];
    // Twilio hints work best with ~50 short phrases
    return [...new Set(base.map((h) => h.trim()).filter(Boolean))].slice(0, 40).join(', ');
  }

  private async prewarmScriptAudio(
    _category: {
      script: Array<{ message: string }>;
      voiceSettings?: {
        elevenLabsVoiceId?: string;
        stability?: number;
        similarityBoost?: number;
      };
    },
    _voiceOverrides: {
      voiceId?: string;
      stability?: number;
      similarityBoost?: number;
    },
  ) {
    // Live turns use Twilio Say (instant). Skip ElevenLabs prewarm on the hot path.
    return;
  }

  /**
   * Greeting path: Speak FIRST (cannot be barge-in cancelled), then listen.
   * This fixes silent/cut-off greetings when the caller is noisy.
   */
  private async twimlSpeakThenListen(
    speakTwiml: string,
    baseUrl: string,
    hints = '',
  ): Promise<string> {
    const language =
      (await this.settingsService.get('TWILIO_SPEECH_LANGUAGE'))?.trim() || 'en-IN';
    const action = `${baseUrl.replace(/\/$/, '')}/calls/webhook/gather`;
    const hintsAttr = hints ? ` hints="${this.escapeXml(hints)}"` : '';
    // No Pause after greeting — listen immediately when Speak ends
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakTwiml}
  <Gather input="speech" language="${this.escapeXml(language)}"${hintsAttr} action="${action}" method="POST" timeout="5" speechTimeout="auto" actionOnEmptyResult="true" bargeIn="true">
  </Gather>
  <Redirect method="POST">${action}</Redirect>
</Response>`;
  }

  /**
   * Later turns: Play inside Gather = barge-in. speechTimeout=auto uses Twilio VAD.
   */
  private async twimlSpeakAndListen(
    speakTwiml: string,
    baseUrl: string,
    hints = '',
  ): Promise<string> {
    const language =
      (await this.settingsService.get('TWILIO_SPEECH_LANGUAGE'))?.trim() || 'en-IN';
    const action = `${baseUrl.replace(/\/$/, '')}/calls/webhook/gather`;
    const hintsAttr = hints ? ` hints="${this.escapeXml(hints)}"` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="${this.escapeXml(language)}"${hintsAttr} action="${action}" method="POST" timeout="5" speechTimeout="auto" actionOnEmptyResult="true" bargeIn="true">
    ${speakTwiml}
  </Gather>
  <Redirect method="POST">${action}</Redirect>
</Response>`;
  }

  private async twimlListenOnly(baseUrl: string, hints = ''): Promise<string> {
    const language =
      (await this.settingsService.get('TWILIO_SPEECH_LANGUAGE'))?.trim() || 'en-IN';
    const action = `${baseUrl.replace(/\/$/, '')}/calls/webhook/gather`;
    const hintsAttr = hints ? ` hints="${this.escapeXml(hints)}"` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="${this.escapeXml(language)}"${hintsAttr} action="${action}" method="POST" timeout="4" speechTimeout="auto" actionOnEmptyResult="true" bargeIn="true">
    <Pause length="1"/>
  </Gather>
  <Redirect method="POST">${action}</Redirect>
</Response>`;
  }

  async gatherErrorFallback(): Promise<string> {
    const baseUrl = (await this.settingsService.get('TWILIO_WEBHOOK_BASE_URL')) || '';
    const action = `${baseUrl.replace(/\/$/, '')}/calls/webhook/gather`;
    const soft = this.scriptEngineService.pickSoftContinue('Real estate', 'fallback');
    const say = await this.buildTwilioSay(soft);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say}
  <Redirect method="POST">${action}</Redirect>
</Response>`;
  }

  async voiceErrorFallback(): Promise<string> {
    const say = await this.buildTwilioSay(
      'Assalam-o-Alaikum, Ayesha Hampstead Villas se — line pe masla aa raha hai, thori der baad call kijiye.',
    );
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say}
  <Hangup/>
</Response>`;
  }

  private twimlHangup(_message: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
  }

  async findAll(query: CallQueryDto) {
    if (
      query.status === CallSessionStatus.IN_PROGRESS ||
      query.status === CallSessionStatus.INITIATED
    ) {
      await this.reconcileStaleLiveCalls();
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const filter: Record<string, unknown> = {};
    if (query.leadId) filter.leadId = query.leadId;
    if (query.status) filter.status = query.status;
    if (query.outcome) filter.outcome = query.outcome;
    if (query.categoryId) filter.categoryId = query.categoryId;
    if (query.startDate || query.endDate) {
      filter.startedAt = {
        ...(query.startDate ? { $gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { $lte: new Date(query.endDate) } : {}),
      };
    }

    let data = await this.callSessionModel
      .find(filter)
      .populate('leadId', 'name phone company')
      .populate('categoryId', 'name script')
      .sort({ startedAt: -1 })
      .exec();

    if (query.search) {
      const s = query.search.toLowerCase();
      data = data.filter((call) => {
        const lead = call.leadId as { name?: string; phone?: string; company?: string } | null;
        return (
          lead?.name?.toLowerCase().includes(s) ||
          lead?.phone?.includes(s) ||
          lead?.company?.toLowerCase().includes(s)
        );
      });
    }

    const total = data.length;
    const paginated = data.slice((page - 1) * limit, page * limit);
    const withUsage = await Promise.all(paginated.map((session) => this.attachUsage(session)));

    return {
      data: withUsage,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const session = await this.callSessionModel
      .findById(id)
      .populate('leadId')
      .populate('categoryId')
      .exec();
    if (!session) {
      throw new NotFoundException('Call session not found');
    }
    const turns = await this.turnModel
      .find({ callSessionId: session._id })
      .sort({ timestamp: 1 })
      .exec();
    return {
      session: await this.attachUsage(session),
      turns,
    };
  }

  async getTranscript(id: string) {
    const turns = await this.turnModel
      .find({
        callSessionId: id,
        detectedIntent: { $ne: 'listen_retry' },
        message: { $ne: '(listening)' },
      })
      .sort({ timestamp: 1 })
      .select('role message timestamp detectedIntent audioUrl')
      .lean()
      .exec();
    return turns;
  }

  async getAudioUrls(id: string) {
    const session = await this.callSessionModel.findById(id).exec();
    if (!session) {
      throw new NotFoundException('Call session not found');
    }
    const turns = await this.turnModel
      .find({ callSessionId: id, role: ConversationRole.SYSTEM })
      .select('message audioUrl scriptStep timestamp')
      .sort({ timestamp: 1 })
      .exec();
    return {
      sessionAudioUrls: session.elevenLabsAudioUrls,
      turns,
    };
  }
}
