import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import {
  enforceCategoryIsolation,
  keepShortPkSpeech,
  shapePakistaniSpeech,
  stripHindiVocabulary,
} from '../calls/realtime/pk-urdu-speak';
import { CachedCategoryKnowledge, KnowledgeCacheService } from './knowledge-cache.service';
import { LiveSearchService } from './live-search.service';
import { MemoryEngineService } from './memory-engine.service';
import { PromptBuilderService } from './prompt-builder.service';
import { StageEngineService } from './stage-engine.service';
import {
  CallConversationStateDocument,
  StructuredMemory,
} from './schemas/call-conversation-state.schema';

export type ConversationAgentConfig = {
  openai: OpenAI;
  model: string;
  categoryId: string;
  callSid: string;
  callSessionId?: string;
  leadId?: string;
  leadName?: string;
  inbound?: boolean;
};

/**
 * Production conversation agent: knowledge cache + stage engine + memory + dynamic prompts.
 * Optional live tools: business DB + OpenAI web_search on factual questions.
 */
export class ConversationAgent {
  private readonly logger = new Logger(ConversationAgent.name);
  private bundle!: CachedCategoryKnowledge;
  private state!: CallConversationStateDocument;
  private ready = false;

  constructor(
    private readonly cfg: ConversationAgentConfig,
    private readonly knowledge: KnowledgeCacheService,
    private readonly stages: StageEngineService,
    private readonly memoryEngine: MemoryEngineService,
    private readonly prompts: PromptBuilderService,
    private readonly liveSearch: LiveSearchService,
  ) {}

  async init() {
    this.bundle = await this.knowledge.getBundle(this.cfg.categoryId);
    this.state = await this.knowledge.getOrCreateCallState({
      callSid: this.cfg.callSid,
      categoryId: this.cfg.categoryId,
      callSessionId: this.cfg.callSessionId,
      leadId: this.cfg.leadId,
      customerName: this.cfg.leadName,
    });
    if (this.cfg.leadName && !this.state.memory.customerName) {
      this.state.memory.customerName = this.cfg.leadName;
    }
    this.ready = true;
  }

  getKnowledge() {
    return this.bundle.knowledge;
  }

  getVoiceSettings() {
    return this.bundle.voiceSettings;
  }

  getStageKey() {
    return this.state?.currentStageKey || 'greeting';
  }

  getMemory(): StructuredMemory {
    return { ...(this.state?.memory || {}) } as StructuredMemory;
  }

  private isUrdu() {
    return (this.bundle.knowledge.primaryLanguage || 'urdu') !== 'english';
  }

  private isFemale() {
    return (this.bundle.knowledge.agentGender || 'female') !== 'male';
  }

  finalizeSpeech(raw: string): string {
    const k = this.bundle.knowledge;
    const allowed = [
      k.businessName,
      k.projectName,
      k.locationLabel,
      k.city,
      k.country,
      ...(k.locations || []),
    ].filter(Boolean) as string[];
    let text = stripHindiVocabulary(raw || '');
    text = enforceCategoryIsolation(text, allowed, k.doNotSayRules || []);
    text = shapePakistaniSpeech(text, this.isUrdu());
    text = this.alignGender(text);
    text = text.replace(/[\u0600-\u06FF]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (this.isUrdu()) text = keepShortPkSpeech(text, 58);
    return text;
  }

  private alignGender(text: string): string {
    if (!this.isUrdu()) return text;
    let t = text;
    if (this.isFemale()) {
      t = t.replace(/\bbol raha hoon\b/gi, 'bol rahi hoon');
      t = t.replace(/\bbhej raha hoon\b/gi, 'bhej rahi hoon');
      t = t.replace(/\bkar deta hoon\b/gi, 'kar deti hoon');
      t = t.replace(/\bsamajh gaya\b/gi, 'samajh gayi');
      t = t.replace(/\bchahta tha\b/gi, 'chahti thi');
      t = t.replace(/\braha hoon\b/gi, 'rahi hoon');
      t = t.replace(/\bdeta hoon\b/gi, 'deti hoon');
    } else {
      t = t.replace(/\bbol rahi hoon\b/gi, 'bol raha hoon');
      t = t.replace(/\bbhej rahi hoon\b/gi, 'bhej raha hoon');
      t = t.replace(/\bkar deti hoon\b/gi, 'kar deta hoon');
      t = t.replace(/\bsamajh gayi\b/gi, 'samajh gaya');
      t = t.replace(/\bchahti thi\b/gi, 'chahta tha');
      t = t.replace(/\brahi hoon\b/gi, 'raha hoon');
      t = t.replace(/\bdeti hoon\b/gi, 'deta hoon');
    }
    return t;
  }

  getGreeting(): string {
    const line = this.prompts.buildGreeting(
      this.bundle,
      this.state.memory.customerName || this.cfg.leadName,
    );
    this.state.currentStageKey = this.stages.afterGreetingSpoken(this.bundle);
    if (!this.state.completedStages.includes('greeting')) {
      this.state.completedStages.push('greeting');
    }
    void this.knowledge.saveCallState(this.state);
    return this.finalizeSpeech(line);
  }

  rememberAgent(line: string) {
    const spoken = this.finalizeSpeech(line);
    this.pushMessage('assistant', spoken);
  }

  rememberUser(line: string) {
    this.pushMessage('user', line);
    this.state.memory = this.memoryEngine.extract(line, this.state.memory);
    this.state.memory.conversationSummary = this.memoryEngine.summarize(this.state.memory);
  }

  private pushMessage(role: string, content: string) {
    this.state.recentMessages = this.state.recentMessages || [];
    this.state.recentMessages.push({ role, content, at: new Date() });
    if (this.state.recentMessages.length > 12) {
      this.state.recentMessages = this.state.recentMessages.slice(-12);
    }
  }

  /**
   * Consultant turn pipeline:
   * remember → objection? → answer-first? → soft stage advance → natural reply.
   * DB/stages = knowledge + coach notes. Never FAQ/script recital.
   */
  async reply(
    userText: string,
    onSentence: (s: string) => Promise<void> | void,
    opts?: { onFirstToken?: () => void },
  ): Promise<{ text: string; shouldEnd: boolean }> {
    if (!this.ready) await this.init();

    this.rememberUser(userText);

    const before = this.state.currentStageKey;
    const variety =
      (this.cfg.callSid || '').length + (this.state.recentMessages?.length || 0);
    const lastAgentLine =
      [...(this.state.recentMessages || [])]
        .reverse()
        .find((m) => m.role === 'assistant')?.content || '';

    // ── 1) Objections: handle naturally, keep relationship ──
    const objection = this.prompts.detectObjection(userText);
    if (objection) {
      this.logger.log(
        `CALL ${this.cfg.callSid} OBJECTION=${objection} stage=${before}`,
      );
      if (objection === 'not_interested') {
        this.state.currentStageKey = 'closing';
      } else if (objection === 'busy') {
        this.state.currentStageKey = 'follow_up';
      } else {
        this.state.currentStageKey = 'objection_handling';
      }

      let text = this.finalizeSpeech(
        this.prompts.humanObjectionReply(
          objection,
          this.isFemale(),
          this.isUrdu(),
          variety,
        ),
      );
      if (!text) {
        text = await this.gptReply(userText, this.state.currentStageKey, onSentence, opts, 'objection');
      } else {
        opts?.onFirstToken?.();
        await onSentence(text);
      }
      this.rememberAgent(text);
      this.state.lastAgentIntent = `objection_${objection}`;
      const shouldEnd = objection === 'not_interested' || /allah hafiz/i.test(text);
      if (shouldEnd) this.state.currentStageKey = 'closing';
      await this.knowledge.saveCallState(this.state);
      return { text, shouldEnd };
    }

    // ── 2) Any customer question / inquiry confusion → ANSWER FIRST ──
    const inquiryQ =
      this.prompts.isInquiryReasonQuestion(userText) ||
      this.prompts.isEarlyCallConfusion(userText, before);
    const customerAsked = this.prompts.isCustomerQuestion(userText);

    if (customerAsked || inquiryQ) {
      this.logger.log(
        `CALL ${this.cfg.callSid} ANSWER_FIRST${inquiryQ ? '(inquiry)' : ''} stage=${before} q="${userText.slice(0, 80)}"`,
      );
      this.state.inCustomerQa = true;

      let reply = inquiryQ
        ? this.prompts.humanInquiryAnswer(this.bundle, this.isFemale(), variety)
        : this.prompts.answerCustomerQuestion({
            bundle: this.bundle,
            customerText: userText,
            female: this.isFemale(),
            varietyKey: variety,
          });

      // Inquiry: full answer + soft natural continue (not budget quiz)
      if (reply && inquiryQ) {
        reply += this.prompts.softContinueAfterAnswer(
          this.state.memory,
          this.isFemale(),
          this.isUrdu(),
          variety,
        );
      }

      let text = reply;
      let emitted = false;
      if (!text) {
        text = await this.gptReply(
          userText,
          before,
          async (s) => {
            emitted = true;
            await onSentence(s);
          },
          opts,
          'answer_first',
        );
      } else {
        opts?.onFirstToken?.();
        text = this.finalizeSpeech(text);
        await onSentence(text);
        emitted = true;
      }
      if (!emitted && text) await onSentence(this.finalizeSpeech(text));

      this.rememberAgent(text);
      this.state.lastAgentIntent = inquiryQ ? 'answered_inquiry' : 'answered_q';
      // After a clear inquiry answer, resume consult flow on next engaging turn
      if (inquiryQ && ['greeting', 'permission'].includes(before)) {
        this.state.currentStageKey = 'rapport';
      }
      await this.knowledge.saveCallState(this.state);
      return { text, shouldEnd: false };
    }

    // ── 3) Leave QA when they engage / volunteer facts ──
    if (this.state.inCustomerQa) {
      if (
        this.state.memory.propertyType ||
        this.state.memory.customerPurpose ||
        this.prompts.isReadyToContinue(userText)
      ) {
        this.state.inCustomerQa = false;
        if (['greeting', 'permission', 'rapport'].includes(this.state.currentStageKey)) {
          this.state.currentStageKey = this.state.memory.propertyType
            ? this.state.memory.customerPurpose
              ? 'product_recommendation'
              : 'qualification'
            : 'purpose';
        }
      } else if (!this.state.offeredContinuePermission) {
        const spoken = this.finalizeSpeech(
          this.prompts.humanQaBridge(this.isFemale(), this.isUrdu(), variety),
        );
        opts?.onFirstToken?.();
        await onSentence(spoken);
        this.rememberAgent(spoken);
        this.state.lastAgentIntent = 'qa_bridge';
        await this.knowledge.saveCallState(this.state);
        return { text: spoken, shouldEnd: false };
      }
    }

    // ── 4) Soft stage advance from memory (skip what they already said) ──
    const transition = this.stages.advanceAfterCustomer(
      this.bundle,
      before,
      this.state.completedStages,
      this.state.memory,
      userText,
    );
    if (transition.nextKey !== before) {
      if (!this.state.completedStages.includes(before)) {
        this.state.completedStages.push(before);
      }
      for (const s of transition.skipped) {
        if (!this.state.completedStages.includes(s)) this.state.completedStages.push(s);
      }
      this.state.currentStageKey = transition.nextKey;
    }

    let stageKey = this.state.currentStageKey;
    if (before === 'permission' && transition.nextKey === 'rapport') {
      stageKey = 'rapport';
      this.state.currentStageKey = 'rapport';
    }

    this.logger.log(
      `CALL ${this.cfg.callSid} stage=${before}→${stageKey} mem=${this.memoryEngine.summarize(this.state.memory)}`,
    );

    let reply =
      this.prompts.localStageReply({
        bundle: this.bundle,
        stageKey,
        memory: this.state.memory,
        customerText: userText,
        varietyKey: variety,
      }) || null;

    if (reply && this.isSameQuestion(reply, lastAgentLine)) {
      reply = null; // force GPT / listen — never loop the same ask
    }

    if (!reply) {
      const t2 = this.stages.advanceAfterCustomer(
        this.bundle,
        stageKey,
        this.state.completedStages,
        this.state.memory,
        userText,
      );
      if (t2.nextKey !== stageKey) {
        this.state.completedStages.push(stageKey);
        this.state.currentStageKey = t2.nextKey;
        stageKey = t2.nextKey;
        reply = this.prompts.localStageReply({
          bundle: this.bundle,
          stageKey,
          memory: this.state.memory,
          customerText: userText,
          varietyKey: variety + 1,
        });
        if (reply && this.isSameQuestion(reply, lastAgentLine)) reply = null;
      }
    }

    if (stageKey === 'rapport' && reply) {
      if (!this.state.completedStages.includes('rapport')) {
        this.state.completedStages.push('rapport');
      }
      this.state.currentStageKey = 'purpose';
    }
    if (stageKey === 'product_recommendation' && reply) {
      if (!this.state.completedStages.includes('product_recommendation')) {
        this.state.completedStages.push('product_recommendation');
      }
      this.state.currentStageKey = this.state.memory.budget
        ? 'appointment'
        : 'budget_discussion';
    }

    // Prefer dynamic GPT for mid-call so speech stays human; local for latency-critical opens
    const preferGpt =
      !reply ||
      ['qualification', 'budget_discussion', 'appointment', 'objection_handling'].includes(
        stageKey,
      );

    let text = reply;
    let emitted = false;
    if (!text || (preferGpt && !['rapport', 'greeting', 'closing'].includes(stageKey) && !reply)) {
      text = await this.gptReply(
        userText,
        stageKey,
        async (s) => {
          emitted = true;
          await onSentence(s);
        },
        opts,
        'normal',
      );
    } else if (preferGpt && reply && stageKey !== 'rapport') {
      // Local as seed; still OK to speak local for product ack speed
      opts?.onFirstToken?.();
      text = this.finalizeSpeech(reply);
      await onSentence(text);
      emitted = true;
    } else {
      opts?.onFirstToken?.();
      text = this.finalizeSpeech(reply!);
      await onSentence(text);
      emitted = true;
    }

    if (!emitted && text) await onSentence(this.finalizeSpeech(text));

    this.rememberAgent(text);
    this.state.lastAgentIntent = stageKey;
    this.state.lastCustomerIntent = userText.slice(0, 80);

    const shouldEnd =
      this.state.currentStageKey === 'closing' || /allah hafiz/i.test(text);
    if (shouldEnd) {
      this.state.currentStageKey = 'closing';
      if (!this.state.completedStages.includes('closing')) {
        this.state.completedStages.push('closing');
      }
    }
    await this.knowledge.saveCallState(this.state);
    return { text, shouldEnd };
  }

  private isSameQuestion(a: string, b: string): boolean {
    const norm = (s: string) =>
      (s || '')
        .toLowerCase()
        .replace(/[?.!,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    // Same core ask (plot/villa, budget, family/investment)
    const cores = [
      /plot.*villa|villa.*plot/,
      /dilchaspi|interest zyada|kis taraf/,
      /budget/,
      /family.*investment|investment.*family/,
      /cash.*instal|instal.*cash/,
      /subah.*sham|sham.*subah/,
      /inquiry|interest aaya|hawale se/,
    ];
    return cores.some((re) => re.test(x) && re.test(y));
  }

  /** When true, GPT may call business DB + optional live web search. */
  private shouldUseLiveTools(
    userText: string,
    mode: 'normal' | 'answer_first' | 'objection',
  ): boolean {
    if (mode === 'objection') return false;
    if (mode === 'answer_first') return true;
    const t = (userText || '').toLowerCase();
    return /\b(price|rate|cost|qeemat|kitna|kitne|market|latest|current|available|compare|dha|karachi|size|gaz|visit|details|info|batao|bataiye|search|google)\b/i.test(
      t,
    );
  }

  private async gptReply(
    userText: string,
    stageKey: string,
    onSentence: (s: string) => Promise<void> | void,
    opts?: { onFirstToken?: () => void },
    mode: 'normal' | 'answer_first' | 'objection' = 'normal',
  ): Promise<string> {
    const stage =
      this.stages.getStage(this.bundle, stageKey) ||
      this.stages.getStage(this.bundle, 'purpose')!;

    let system = this.prompts.build({
      bundle: this.bundle,
      stage,
      memory: this.state.memory,
      recentMessages: this.state.recentMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      customerUtterance: userText,
      mode,
    });

    const agent = this.bundle.knowledge.agentName || 'Ayesha';
    const userHint =
      mode === 'answer_first'
        ? `Customer said: "${userText}"\nFully answer their question first like ${agent} on a real call. Use tools if you need facts. Then one soft next step only if natural. No budget quiz.`
        : mode === 'objection'
          ? `Customer said: "${userText}"\nHandle the objection warmly. No pressure. Keep follow-up open.`
          : `Customer said: "${userText}"\nReply as ${agent} — natural consultant, use memory, never re-ask known facts. Tools only if facts are missing.`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      { role: 'user', content: userHint },
    ];

    const useTools = this.shouldUseLiveTools(userText, mode);
    if (useTools) {
      system += `\n\nTOOLS: Prefer lookup_business_knowledge for our project/inventory. Use live_web_search only for public context missing from our DB. Never invent prices. Speak results in natural Roman Urdu — never read raw tool JSON.`;
      messages[0] = { role: 'system', content: system };

      const filler = this.finalizeSpeech(
        this.isUrdu()
          ? this.alignGender('Jee Sir, ek second — main check kar rahi hoon.')
          : 'One moment — let me quickly check.',
      );
      opts?.onFirstToken?.();
      await onSentence(filler);

      await this.runToolRound(messages, userText);
    }

    return this.streamSpokenReply(messages, onSentence, opts, mode, !!useTools);
  }

  /** One tool round (business DB + optional web) before speaking the real answer. */
  private async runToolRound(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    userText: string,
  ) {
    const webOn = this.liveSearch.isWebSearchEnabled();
    const tools = this.liveSearch.toolDefinitions(webOn);

    try {
      const prep = await this.cfg.openai.chat.completions.create({
        model: this.cfg.model,
        temperature: 0.2,
        max_tokens: 200,
        tools,
        tool_choice: 'auto',
        messages,
      });

      const msg = prep.choices[0]?.message;
      if (!msg?.tool_calls?.length) {
        // Proactive business lookup even if model skipped tools
        const local = this.liveSearch.lookupBusiness(this.bundle, userText).summary;
        messages.push({
          role: 'user',
          content: `BUSINESS FACTS FROM DB:\n${local}\nAnswer using these facts naturally on the phone.`,
        });
        return;
      }

      messages.push(msg);

      for (const call of msg.tool_calls) {
        if (call.type !== 'function') continue;
        this.logger.log(
          `CALL ${this.cfg.callSid} TOOL ${call.function.name} args=${(call.function.arguments || '').slice(0, 80)}`,
        );
        const result = await this.liveSearch.runTool(
          call.function.name,
          call.function.arguments || '{}',
          this.bundle,
          this.cfg.openai,
          this.cfg.model,
        );
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.slice(0, 1200),
        });
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tool round failed: ${m.slice(0, 160)}`);
      const local = this.liveSearch.lookupBusiness(this.bundle, userText).summary;
      messages.push({
        role: 'user',
        content: `BUSINESS FACTS (tool fallback):\n${local}\nAnswer using these facts naturally.`,
      });
    }
  }

  private async streamSpokenReply(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    onSentence: (s: string) => Promise<void> | void,
    opts?: { onFirstToken?: () => void },
    mode: 'normal' | 'answer_first' | 'objection' = 'normal',
    alreadyFilled = false,
  ): Promise<string> {
    const stream = await this.cfg.openai.chat.completions.create({
      model: this.cfg.model,
      temperature: mode === 'answer_first' ? 0.65 : 0.75,
      max_tokens: mode === 'answer_first' ? 140 : 110,
      presence_penalty: 0.5,
      frequency_penalty: 0.55,
      stream: true,
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'Now speak your phone reply only (1-2 short Roman Urdu sentences). No JSON. No bullet lists. Natural consultant tone.',
        },
      ],
    });

    let buffer = '';
    let full = '';
    let first = true;
    let flushed = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (!delta) continue;
      if (first) {
        first = false;
        this.logger.log('First GPT token');
        if (!alreadyFilled) opts?.onFirstToken?.();
      }
      buffer += delta;
      full += delta;
      const punct = buffer.match(/^([\s\S]+?[.!?۔])\s*/);
      if (punct) {
        const sentence = this.finalizeSpeech(punct[1].trim());
        buffer = buffer.slice(punct[0].length);
        if (sentence) {
          flushed = true;
          await onSentence(sentence);
        }
      }
    }

    const rem = this.finalizeSpeech(buffer.trim());
    if (rem) {
      await onSentence(/[.!?۔]$/.test(rem) ? rem : `${rem}.`);
      flushed = true;
    }

    let text = this.finalizeSpeech(full);
    if (!text || /i am an ai|as an ai|please repeat/i.test(text)) {
      text = this.finalizeSpeech(
        this.isUrdu()
          ? 'Jee Sir, bilkul. Aap bataiye, main sun rahi hoon.'
          : 'Sure — go ahead.',
      );
      text = this.alignGender(text);
      if (!flushed) await onSentence(text);
    }
    return alreadyFilled ? `${text}` : text;
  }

  /** Compatibility shim used by session fast-path. */
  tryDynamicLocal(
    userText: string,
  ): { text: string; shouldEnd: boolean; intent: string } | null {
    // Prefer async reply(); sync local only for known stage templates without advancing twice.
    // Session should call reply() — return null to force async path when possible.
    return null;
  }

  async replyStreaming(
    userText: string,
    onSentence: (s: string) => Promise<void> | void,
    opts?: { onFirstToken?: () => void },
  ) {
    const result = await this.reply(userText, onSentence, opts);
    // GPT path didn't stream sentences — emit once
    if (result.text) {
      // If local path already called onSentence, avoid double — track via remembering last
    }
    return result;
  }
}
