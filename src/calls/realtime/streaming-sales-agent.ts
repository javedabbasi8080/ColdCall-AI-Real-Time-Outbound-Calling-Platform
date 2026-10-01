import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { CategoryPlaybook } from '../../categories/schemas/category.schema';
import {
  enforceCategoryIsolation,
  keepShortPkSpeech,
  shapePakistaniSpeech,
  stripHindiVocabulary,
} from './pk-urdu-speak';

export type AgentContext = {
  categoryName: string;
  leadName?: string;
  inbound: boolean;
  playbook: Partial<CategoryPlaybook>;
};

export type LeadSlots = {
  product?: string;
  purpose?: string;
  budget?: string;
  size?: string;
  area?: string;
  timeline?: string;
  paymentMode?: string;
  visitedDha?: boolean;
  viewingOk?: boolean;
  notInterested?: boolean;
  callback?: boolean;
};

/**
 * Strict conversation stages — never skip ahead unless the customer
 * voluntarily fills a later slot (then skip only that question).
 */
export enum ConversationStage {
  GREETING = 1,
  PERMISSION = 2,
  RAPPORT = 3,
  UNDERSTAND_INQUIRY = 4,
  DISCOVER = 5,
  RECOMMEND = 6,
  OBJECTIONS = 7,
  BOOK = 8,
  CLOSE = 9,
}

/** Ordered discovery questions inside Stage 5 */
type DiscoverField = 'product' | 'purpose' | 'budget' | 'size' | 'payment';

const DISCOVER_ORDER: DiscoverField[] = [
  'product',
  'purpose',
  'budget',
  'size',
  'payment',
];

type TurnResult = { text: string; shouldEnd: boolean; intent: string };

/**
 * Category-isolated sales consultant with a stage state machine.
 * Playbook = business knowledge only — never read as a script.
 */
export class StreamingSalesAgent {
  private readonly logger = new Logger(StreamingSalesAgent.name);
  private history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private recentAgent: string[] = [];
  private slots: LeadSlots = {};
  private stage: ConversationStage = ConversationStage.GREETING;
  /** Track which discover questions we already asked (not volunteered). */
  private askedDiscover = new Set<DiscoverField>();
  private systemPromptCached = '';
  private greetingDelivered = false;

  constructor(
    private readonly openai: OpenAI,
    private readonly model: string,
    private ctx: AgentContext,
  ) {
    this.systemPromptCached = this.buildSystemPrompt();
  }

  updatePlaybook(playbook: Partial<CategoryPlaybook>) {
    this.ctx = { ...this.ctx, playbook };
    this.systemPromptCached = this.buildSystemPrompt();
  }

  getStage(): ConversationStage {
    return this.stage;
  }

  private pb(): Partial<CategoryPlaybook> {
    return this.ctx.playbook || {};
  }

  private isUrdu(): boolean {
    return (this.pb().language || 'urdu') !== 'english';
  }

  private isFemale(): boolean {
    const g = (this.pb().agentGender || 'female').toLowerCase();
    return g !== 'male';
  }

  private agentName(): string {
    return this.pb().agentName || (this.isFemale() ? 'Ayesha' : 'Ahmed');
  }

  private self(): {
    speaking: string;
    sending: string;
    confirming: string;
    willSend: string;
  } {
    if (this.isFemale()) {
      return {
        speaking: 'bol rahi hoon',
        sending: 'bhej rahi hoon',
        confirming: 'confirm kar deti hoon',
        willSend: 'bhej deti hoon',
      };
    }
    return {
      speaking: 'bol raha hoon',
      sending: 'bhej raha hoon',
      confirming: 'confirm kar deta hoon',
      willSend: 'bhej deta hoon',
    };
  }

  private wantVerbPast(): string {
    return this.isFemale() ? 'chahti thi' : 'chahta tha';
  }

  private understand(): string {
    return this.isFemale() ? 'samajh gayi' : 'samajh gaya';
  }

  private alignGenderGrammar(text: string): string {
    if (!this.isUrdu()) return text;
    let t = text;
    if (this.isFemale()) {
      t = t.replace(/\bbol raha hoon\b/gi, 'bol rahi hoon');
      t = t.replace(/\bbhej raha hoon\b/gi, 'bhej rahi hoon');
      t = t.replace(/\bkar deta hoon\b/gi, 'kar deti hoon');
      t = t.replace(/\bbhej deta hoon\b/gi, 'bhej deti hoon');
      t = t.replace(/\bkeh raha hoon\b/gi, 'keh rahi hoon');
      t = t.replace(/\bdekh raha hoon\b/gi, 'dekh rahi hoon');
      t = t.replace(/\bsun raha hoon\b/gi, 'sun rahi hoon');
      t = t.replace(/\braha hoon\b/gi, 'rahi hoon');
      t = t.replace(/\bdeta hoon\b/gi, 'deti hoon');
      t = t.replace(/\bsamajh gaya\b/gi, 'samajh gayi');
      t = t.replace(/\bchahta tha\b/gi, 'chahti thi');
      t = t.replace(/\bchahta hoon\b/gi, 'chahti hoon');
      t = t.replace(/\bmain\s+ahmed\b/gi, `main ${this.agentName()}`);
      t = t.replace(/\b(?:I am|I'm)\s+Ahmed\b/gi, `I am ${this.agentName()}`);
    } else {
      t = t.replace(/\bbol rahi hoon\b/gi, 'bol raha hoon');
      t = t.replace(/\bbhej rahi hoon\b/gi, 'bhej raha hoon');
      t = t.replace(/\bkar deti hoon\b/gi, 'kar deta hoon');
      t = t.replace(/\bbhej deti hoon\b/gi, 'bhej deta hoon');
      t = t.replace(/\brahi hoon\b/gi, 'raha hoon');
      t = t.replace(/\bdeti hoon\b/gi, 'deta hoon');
      t = t.replace(/\bsamajh gayi\b/gi, 'samajh gaya');
      t = t.replace(/\bchahti thi\b/gi, 'chahta tha');
      t = t.replace(/\bchahti hoon\b/gi, 'chahta hoon');
    }
    return t;
  }

  private placeLine(): string {
    const p = this.pb();
    return (
      p.location ||
      [p.city, p.country].filter(Boolean).join(', ') ||
      ''
    );
  }

  private company(): string {
    return this.pb().businessName || this.ctx.categoryName || 'hamari company';
  }

  finalizeSpeech(raw: string): string {
    const p = this.pb();
    const allowed = [
      p.businessName || '',
      p.projectName || '',
      p.location || '',
      p.city || '',
      p.country || '',
    ].filter(Boolean);
    let text = stripHindiVocabulary(raw || '');
    text = enforceCategoryIsolation(text, allowed, p.neverMention || []);
    text = shapePakistaniSpeech(text, this.isUrdu());
    text = this.alignGenderGrammar(text);
    text = text.replace(/[\u0600-\u06FF]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (this.isUrdu()) {
      text = keepShortPkSpeech(text, 48);
    }
    return text;
  }

  /** Stage 1 — deliver greeting, then wait at Stage 2 (permission). */
  getGreeting(): string {
    const agent = this.agentName();
    const company = this.company();
    const place = this.placeLine();
    const me = this.self();
    const first =
      this.ctx.leadName && !/^inbound/i.test(this.ctx.leadName)
        ? this.ctx.leadName.split(/\s+/)[0]
        : '';

    this.stage = ConversationStage.GREETING;
    this.greetingDelivered = true;

    let line: string;
    if (!this.isUrdu()) {
      line = `Hi, this is ${agent} from ${company}${place ? `, ${place}` : ''}. Hope you're doing well — do you have two minutes for a quick word?`;
    } else if (this.ctx.inbound) {
      line = `Assalam o Alaikum. Main ${agent} ${me.speaking} ${company}${place ? `, ${place}` : ''} se. Bataiye, kaise madad karun?`;
    } else {
      const who = first ? `${first} sahab` : 'Sir';
      line = `Assalam o Alaikum ${who}, main ${agent} ${me.speaking} ${company}${place ? `, ${place}` : ''} se. Umeed hai aap khairiyat se honge. Agar aap ke paas do minute hon to ek choti si baat karni thi.`;
    }

    // After greeting is spoken we are waiting for permission
    this.stage = ConversationStage.PERMISSION;
    return this.finalizeSpeech(line);
  }

  rememberAgent(line: string) {
    const spoken = this.finalizeSpeech(line);
    this.history.push({ role: 'assistant', content: spoken });
    this.recentAgent.push(spoken.toLowerCase());
    if (this.recentAgent.length > 10) this.recentAgent.shift();
    if (this.history.length > 20) this.history = this.history.slice(-20);
  }

  rememberUser(line: string) {
    this.history.push({ role: 'user', content: line });
    this.extractSlots(line);
    if (this.history.length > 20) this.history = this.history.slice(-20);
  }

  hydrateFromTurns(turns: Array<{ role: string; message: string }>) {
    if (this.history.length > 0) return;
    for (const t of turns.slice(-8)) {
      if (!t.message || t.message.startsWith('(')) continue;
      if (t.role === 'lead') this.rememberUser(t.message);
      else this.rememberAgent(t.message);
    }
  }

  getSlots(): LeadSlots {
    return { ...this.slots };
  }

  private extractSlots(raw: string) {
    const t = raw.toLowerCase();

    if (/\bvilla|villas|bangla|bungalow\b/.test(t)) this.slots.product = 'villa';
    if (/\bplot|plots|zameen\b/.test(t)) this.slots.product = 'plot';
    if (/\bflat|apartment\b/.test(t) && !/\bvilla\b/.test(t)) this.slots.product = 'flat';

    if (/\binvest|investment|sarmaya\b/.test(t)) this.slots.purpose = 'investment';
    if (/\bfamily|rehne|khud|personal|apne liye|ghar ke liye\b/.test(t)) {
      this.slots.purpose = 'family';
    }

    const budget =
      t.match(/(\d+(?:\.\d+)?\s*(?:million|m|lac|lakh|crore|kroad|karor|k))/) ||
      t.match(/\b(\d+)\s*(million|m|crore|kroad)\b/);
    if (budget) this.slots.budget = budget[0].replace(/\s+/g, ' ');

    const size = t.match(/(\d+)\s*(square\s*yards?|sq\.?\s*yards?|gaz|gaj)/i);
    if (size) this.slots.size = size[0];

    if (/\b(cash|nakad|naqad)\b/.test(t)) this.slots.paymentMode = 'cash';
    if (/\b(instal+ment|installment|qist|emi)\b/.test(t)) {
      this.slots.paymentMode = 'instalment';
    }

    if (/\b(visit (kiya|kar|ki)|pehle visit|dha\s*city.*(gaya|gayi|dekha))\b/.test(t)) {
      this.slots.visitedDha = true;
    }
    if (/\b(nahi visit|kabhi nahi|first time|pehli dafa)\b/.test(t)) {
      this.slots.visitedDha = false;
    }

    if (
      /\b(visit|viewing|dekhne|site visit|aunga|aaunga|consultant)\b/.test(t) &&
      !/\bnahi\b/.test(t)
    ) {
      this.slots.viewingOk = true;
    }
    if (/\b(not interested|nahi chahiye|mat call)\b/.test(t)) {
      this.slots.notInterested = true;
    }
    if (/\b(busy|callback|call back|baad mein)\b/.test(t)) this.slots.callback = true;
  }

  private looksRobotic(text: string): boolean {
    return /samajh nahi|sun nahi|dobara kahiye|maaf kijiye|please repeat|didn't understand|i am an ai|as an ai|virtual assistant|language model|GOAL:|dubai|bahria|chat\s*gpt/i.test(
      text,
    );
  }

  private isAffirmative(text: string, words: string[]): boolean {
    return (
      (words.length <= 8 &&
        /\b(hello|hi|hey|assalam|salaam|salam|han\s*jee|haan\s*jee|jee\s*boliye|boliye|sun\s*rahe|haan|han|jee|ji|theek|bilkul|ok|okay|yes)\b/i.test(
          text,
        )) ||
      /^(jee|ji|haan|han|yes|ok|okay|theek|bilkul|boliye|batao|hello|hi)(\s|$)/i.test(text)
    );
  }

  private fieldFilled(field: DiscoverField): boolean {
    switch (field) {
      case 'product':
        return !!this.slots.product;
      case 'purpose':
        return !!this.slots.purpose;
      case 'budget':
        return !!this.slots.budget;
      case 'size':
        return !!this.slots.size;
      case 'payment':
        return !!this.slots.paymentMode;
    }
  }

  /** Next discovery field that is still unknown. Size/payment optional after ask once. */
  private nextDiscoverField(): DiscoverField | null {
    for (const f of DISCOVER_ORDER) {
      if (this.fieldFilled(f)) continue;
      if (f === 'size' && this.askedDiscover.has('size')) continue;
      if (f === 'payment' && this.askedDiscover.has('payment')) continue;
      return f;
    }
    return null;
  }

  private say(text: string, intent: string, shouldEnd = false): TurnResult {
    return { text: this.finalizeSpeech(text), shouldEnd, intent };
  }

  /**
   * State-machine turn — handles stages 1–9 locally so GPT cannot jump ahead.
   * Always returns a reply for early stages.
   */
  tryDynamicLocal(userText: string): TurnResult | null {
    const text = userText.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = text.split(/\s+/).filter(Boolean);
    const urdu = this.isUrdu();
    const company = this.company();
    const place = this.placeLine();
    const yes = this.isAffirmative(text, words);

    this.logger.log(`STAGE=${this.stage} slots=${JSON.stringify(this.slots)}`);

    // Global early exits
    if (
      this.slots.notInterested ||
      (this.stage <= ConversationStage.PERMISSION &&
        /^(nahi|no|nope)(\s|$)/i.test(text)) ||
      /\b(nahi chahiye|not interested|mat call|no thanks)\b/i.test(text)
    ) {
      this.stage = ConversationStage.CLOSE;
      return this.say(
        urdu
          ? 'Koi baat nahi Sir, time dene ka shukriya. Allah hafiz.'
          : 'No problem — thanks for your time. Take care.',
        'not_interested',
        true,
      );
    }

    if (
      this.slots.callback ||
      (this.stage <= ConversationStage.PERMISSION &&
        /\b(busy|call back|callback|baad mein|abhi nahi)\b/i.test(text))
    ) {
      return this.say(
        urdu ? 'Koi baat nahi, kab call karun — aaj sham ya kal?' : 'When should I call back?',
        'callback_request',
      );
    }

    // If greeting somehow never ran
    if (!this.greetingDelivered || this.stage === ConversationStage.GREETING) {
      return {
        text: this.getGreeting(),
        shouldEnd: false,
        intent: 'greeting',
      };
    }

    switch (this.stage) {
      case ConversationStage.PERMISSION:
        return this.handlePermission(yes, urdu, company, place);

      case ConversationStage.RAPPORT:
        // Should rarely linger — rapport line already advances
        this.stage = ConversationStage.UNDERSTAND_INQUIRY;
        return this.handleUnderstandInquiry(text, yes, urdu, company);

      case ConversationStage.UNDERSTAND_INQUIRY:
        return this.handleUnderstandInquiry(text, yes, urdu, company);

      case ConversationStage.DISCOVER:
        return this.handleDiscover(text, yes, urdu, place);

      case ConversationStage.RECOMMEND:
        return this.handleRecommend(yes, urdu, place);

      case ConversationStage.OBJECTIONS:
        return this.handleObjections(text, yes, urdu, place);

      case ConversationStage.BOOK:
        return this.handleBook(text, yes, urdu);

      case ConversationStage.CLOSE:
        return this.say(
          urdu ? 'Shukriya Sir, Allah hafiz.' : 'Thank you — take care.',
          'close',
          true,
        );

      default:
        return null;
    }
  }

  /** Stage 2 → Stage 3+4: permission granted → rapport + inquiry reason (one turn). */
  private handlePermission(
    yes: boolean,
    urdu: boolean,
    company: string,
    place: string,
  ): TurnResult {
    if (!yes) {
      return this.say(
        urdu
          ? 'Jee Sir, agar abhi time nahi hai to bataiye kab call karun?'
          : 'No worries — when is a better time to call?',
        'permission_wait',
      );
    }

    this.stage = ConversationStage.RAPPORT;
    // Speak rapport + inquiry understanding together, then wait at stage 4
    this.stage = ConversationStage.UNDERSTAND_INQUIRY;
    return this.say(
      urdu
        ? `Shukriya Sir. Darasal humein aap ki inquiry receive hui thi ${company}${place ? `, ${place}` : ''} ke hawale se. Bas aap ki requirement samajhna ${this.wantVerbPast()} taake main aap ko behtareen option suggest kar sakoon.`
        : `Thank you. We received your inquiry about ${company}. I just wanted to understand your requirement so I can suggest the best option.`,
      'rapport_inquiry',
    );
  }

  /**
   * Stage 4: listen for interest. Do NOT ask budget here.
   * Only after customer responds, move to Stage 5 and ask plot vs villa
   * (unless they already volunteered product).
   */
  private handleUnderstandInquiry(
    text: string,
    yes: boolean,
    urdu: boolean,
    company: string,
  ): TurnResult {
    // Customer already shared product during this turn
    if (this.slots.product) {
      this.stage = ConversationStage.DISCOVER;
      return this.askNextDiscover(urdu);
    }

    // Soft invitation to share — then move into discover with product question
    if (yes || text.length > 0) {
      this.stage = ConversationStage.DISCOVER;
      // If they rambled without product, ask product first
      return this.askNextDiscover(urdu);
    }

    return this.say(
      urdu
        ? `Jee Sir, aap ${company} ke bare mein kya soch rahe hain — main ${this.isFemale() ? 'sun rahi' : 'sun raha'} hoon.`
        : `Sure — tell me what you had in mind about ${company}.`,
      'understand_wait',
    );
  }

  /** Stage 5: one missing field at a time, strict order. */
  private handleDiscover(
    _text: string,
    yes: boolean,
    urdu: boolean,
    place: string,
  ): TurnResult {
    const next = this.nextDiscoverField();
    if (!next) {
      this.stage = ConversationStage.RECOMMEND;
      return this.handleRecommend(yes, urdu, place);
    }

    // If they just answered the last question, advance to next ask
    return this.askDiscoverField(next, urdu);
  }

  private askNextDiscover(urdu: boolean): TurnResult {
    const next = this.nextDiscoverField();
    if (!next) {
      this.stage = ConversationStage.RECOMMEND;
      return this.handleRecommend(false, urdu, this.placeLine());
    }
    return this.askDiscoverField(next, urdu);
  }

  private askDiscoverField(field: DiscoverField, urdu: boolean): TurnResult {
    this.askedDiscover.add(field);
    const kind = this.slots.product === 'villa' ? 'villa' : 'plot';

    switch (field) {
      case 'product':
        return this.say(
          urdu
            ? 'Jee Sir, bataiye — aap plot dekh rahe hain ya villa?'
            : 'Are you looking at a plot or a villa?',
          'discover_product',
        );
      case 'purpose':
        return this.say(
          urdu
            ? `Acha, ${kind} — ye achi baat hai. Ye family ke liye dekh rahe hain ya investment ke liye?`
            : `Nice — ${kind}. Is this for family or investment?`,
          'discover_purpose',
        );
      case 'budget':
        return this.say(
          urdu
            ? `Bilkul ${this.understand()}. Agar share karna chahein to kis budget range mein dekh rahe hain?`
            : 'What budget range are you considering?',
          'discover_budget',
        );
      case 'size':
        return this.say(
          urdu
            ? 'Theek hai. Size ke hisaab se 200, 300, ya 400 square yard prefer karenge?'
            : 'Which size — 200, 300, or 400 square yards?',
          'discover_size',
        );
      case 'payment':
        return this.say(
          urdu
            ? 'Acha. Payment cash soch rahe hain ya instalments?'
            : 'Cash or instalments?',
          'discover_payment',
        );
    }
  }

  /** Stage 6: recommend from knowledge, then move toward booking. */
  private handleRecommend(yes: boolean, urdu: boolean, place: string): TurnResult {
    const product = this.slots.product;
    let rec: string;
    if (urdu) {
      if (product === 'villa') {
        rec = `Jee, ${this.company()} mein mukhtalif sizes ki luxury villas available hain — aap ki requirement ke mutabiq option ${this.isFemale() ? 'suggest kar sakti hoon' : 'suggest kar sakta hoon'}.`;
      } else {
        rec = `Jee, hamare paas 200, 300 aur 400 square yard residential plots available hain ${place || 'DHA City'} mein.`;
      }
    } else {
      rec =
        product === 'villa'
          ? 'We have luxury villas in a few sizes that I can match to your needs.'
          : 'We have 200, 300 and 400 square yard residential plots available.';
    }

    this.stage = ConversationStage.BOOK;
    const bookAsk = urdu
      ? `Agar aap chahein to property consultant se call arrange ${this.isFemale() ? 'kar deti hoon' : 'kar deta hoon'}, ya ${place || 'DHA City'} site visit schedule karwa ${this.isFemale() ? 'deti' : 'deta'} hoon — subah theek rahega ya sham?`
      : 'Shall I arrange a consultant call or a site visit — morning or afternoon?';

    // One turn: soft recommend + book ask (experienced consultant style)
    return this.say(`${rec} ${bookAsk}`, 'recommend_book');
  }

  private handleObjections(
    text: string,
    yes: boolean,
    urdu: boolean,
    place: string,
  ): TurnResult {
    if (/\b(mehnga|expensive|budget|zyada)\b/i.test(text)) {
      this.stage = ConversationStage.OBJECTIONS;
      return this.say(
        urdu
          ? `Main ${this.isFemale() ? 'samajh sakti' : 'samajh sakta'} hoon. Is budget mein bhi achhe options mil jate hain — site visit pe clear ho jayega.`
          : 'I understand — a visit usually makes the options clearer.',
        'objection_price',
      );
    }
    if (yes || this.slots.viewingOk) {
      this.stage = ConversationStage.BOOK;
      return this.handleBook(text, yes, urdu);
    }
    this.stage = ConversationStage.BOOK;
    return this.say(
      urdu
        ? `${place || 'DHA City'} visit kab theek rahegi, subah ya sham?`
        : 'When works for a visit — morning or afternoon?',
      'objection_to_book',
    );
  }

  private handleBook(text: string, yes: boolean, urdu: boolean): TurnResult {
    if (/\b(mehnga|expensive|zyada|nahi|sochna|baad)\b/i.test(text) && !yes) {
      this.stage = ConversationStage.OBJECTIONS;
      return this.handleObjections(text, yes, urdu, this.placeLine());
    }

    const timeLike =
      /\b(sham|subah|evening|morning|afternoon|saturday|sunday|monday|tuesday|wednesday|thursday|friday|weekend)\b/i.test(
        text,
      );

    if (timeLike || yes || this.slots.viewingOk) {
      if (timeLike) this.slots.timeline = text;
      this.slots.viewingOk = true;
      this.stage = ConversationStage.CLOSE;
      return this.say(
        urdu
          ? `Jee zaroor, details WhatsApp pe ${this.self().sending}. Shukriya Sir, Allah hafiz.`
          : 'Perfect — I will send details on WhatsApp. Take care!',
        'booked',
        true,
      );
    }

    return this.say(
      urdu
        ? 'Jee Sir, site visit subah theek rahega ya sham?'
        : 'Would morning or afternoon work for the visit?',
      'book_wait',
    );
  }

  /**
   * GPT only for late stages / nuanced objection — still bound by CURRENT STAGE.
   * Early stages always resolve via tryDynamicLocal.
   */
  private buildSystemPrompt(): string {
    const p = this.pb();
    const agent = this.agentName();
    const gender = this.isFemale() ? 'female' : 'male';
    const company = this.company();
    const project = p.projectName || company;
    const place = this.placeLine();
    const urdu = this.isUrdu();
    const never = (p.neverMention || []).slice(0, 6).join(', ') || 'Dubai, Bahria';
    const me = this.self();
    const faqs = (p.faqs || [])
      .slice(0, 4)
      .map((f) => `${f.question}→${f.answer}`)
      .join(' | ');

    return `You are NOT an AI. You are ${agent}, a real ${gender} Pakistani property consultant at ${company} (${project}), ${place}.
Speak like a Karachi phone salesperson — warm, natural, never a form.
Knowledge only (paraphrase, never recite): Products ${(p.products || []).slice(0, 4).join(', ')}; Sizes ${(p.sizes || []).slice(0, 3).join('; ')}; FAQ ${faqs}.
Never invent: ${never}.

STRICT STAGE MACHINE — you MUST obey CURRENT_STAGE in the user message:
1 GREETING 2 PERMISSION 3 RAPPORT 4 UNDERSTAND_INQUIRY 5 DISCOVER 6 RECOMMEND 7 OBJECTIONS 8 BOOK 9 CLOSE
Never skip stages. Never ask budget before product AND purpose are known.
Never ask plot/villa before stages 1–4 are done (unless customer already volunteered it).
Discover order inside stage 5: product → purpose → budget → size → payment.
1–3 short sentences. Use "${me.speaking}". Phrases: Jee Sir, Bilkul, Theek hai, Acha, Ye achi baat hai.
Never say you are AI / didn't understand / please repeat.
${urdu ? 'Pakistani Roman Urdu only (Latin). No Nastaliq. No Hindi.' : 'Natural English.'}`;
  }

  private knownFactsBlock(): string {
    const s = this.slots;
    return [
      `STAGE=${this.stage}`,
      s.product && `product=${s.product}`,
      s.purpose && `purpose=${s.purpose}`,
      s.budget && `budget=${s.budget}`,
      s.size && `size=${s.size}`,
      s.paymentMode && `pay=${s.paymentMode}`,
      s.timeline && `time=${s.timeline}`,
      s.viewingOk !== undefined && `viewing=${s.viewingOk}`,
      `askedDiscover=[${[...this.askedDiscover].join(',')}]`,
      `never_repeat=[${this.recentAgent.slice(-2).join(' || ')}]`,
    ]
      .filter(Boolean)
      .join('; ');
  }

  warmupForCall() {
    if (!this.systemPromptCached) {
      this.systemPromptCached = this.buildSystemPrompt();
    }
    void this.getGreeting();
    // Reset stage after warmup touch — real greeting runs again on call start
    this.stage = ConversationStage.GREETING;
    this.greetingDelivered = false;
  }

  async replyStreaming(
    userText: string,
    onSentence: (sentence: string) => Promise<void> | void,
    opts?: { onFirstToken?: () => void },
  ): Promise<{ text: string; shouldEnd: boolean }> {
    if (!this.history.length || this.history[this.history.length - 1]?.content !== userText) {
      this.rememberUser(userText);
    }

    // State machine first — early stages never hit GPT
    const local = this.tryDynamicLocal(userText);
    if (local) {
      this.rememberAgent(local.text);
      this.logger.log(`LOCAL stage=${this.stage} intent=${local.intent}`);
      opts?.onFirstToken?.();
      await onSentence(local.text);
      return { text: local.text, shouldEnd: local.shouldEnd };
    }

    const stream = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.65,
      max_tokens: 90,
      presence_penalty: 0.35,
      frequency_penalty: 0.4,
      stream: true,
      messages: [
        {
          role: 'system',
          content: `${this.systemPromptCached}\nCURRENT_STAGE=${this.stage}\nKNOWN:${this.knownFactsBlock() || 'none'}`,
        },
        ...this.history.slice(-6),
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
        this.logger.log('First GPT token ready');
        opts?.onFirstToken?.();
      }
      buffer += delta;
      full += delta;

      const punct = buffer.match(/^([\s\S]+?[.!?۔])\s*/);
      if (punct) {
        const sentence = this.finalizeSpeech(punct[1].trim());
        buffer = buffer.slice(punct[0].length);
        if (sentence && !this.looksRobotic(sentence)) {
          flushed = true;
          await onSentence(sentence);
        }
      }
    }

    const rem = this.finalizeSpeech(buffer.trim());
    if (rem && !this.looksRobotic(rem)) {
      await onSentence(/[.!?۔]$/.test(rem) ? rem : `${rem}.`);
      flushed = true;
    }

    full = this.finalizeSpeech(full);
    if (!full || this.looksRobotic(full)) {
      full = this.finalizeSpeech(
        this.isUrdu()
          ? 'Jee Sir, bilkul. Aap bataiye, main sun rahi hoon.'
          : 'Sure — go ahead, I am listening.',
      );
      full = this.alignGenderGrammar(full);
      if (!flushed) await onSentence(full);
    }

    this.rememberAgent(full);
    const shouldEnd =
      this.stage === ConversationStage.CLOSE ||
      /allah hafiz|take care|nahi chahiye/i.test(full);

    return { text: full, shouldEnd };
  }
}
