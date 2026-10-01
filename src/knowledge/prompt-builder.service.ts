import { Injectable } from '@nestjs/common';
import { CachedCategoryKnowledge } from './knowledge-cache.service';
import { StructuredMemory } from './schemas/call-conversation-state.schema';
import { ConversationStage } from './schemas/conversation-stage.schema';
import { MemoryEngineService } from './memory-engine.service';

export type PromptBuildInput = {
  bundle: CachedCategoryKnowledge;
  stage: ConversationStage;
  memory: StructuredMemory;
  recentMessages: Array<{ role: string; content: string }>;
  customerUtterance: string;
  customerIntent?: string;
  mode?: 'normal' | 'answer_first' | 'objection';
};

export type ObjectionKind =
  | 'no_budget'
  | 'need_time'
  | 'family_discuss'
  | 'not_interested'
  | 'busy'
  | null;

/**
 * Dynamic consultant brain — database is knowledge only, never a script to read.
 */
@Injectable()
export class PromptBuilderService {
  constructor(private readonly memory: MemoryEngineService) {}

  /** What we still need — coach note for natural next step (never interrogate). */
  missingSlots(memory: StructuredMemory): string[] {
    const miss: string[] = [];
    if (!memory.propertyType) miss.push('property_type (plot vs villa)');
    if (!memory.customerPurpose && !memory.investmentPurpose) {
      miss.push('purpose (living/family vs investment)');
    }
    if (!memory.budget) miss.push('budget_range (soft only)');
    if (!memory.appointmentStatus) miss.push('next_step (site visit / callback)');
    return miss;
  }

  build(input: PromptBuildInput): string {
    const { bundle, stage, memory, recentMessages, customerUtterance, mode } = input;
    const k = bundle.knowledge;
    const female = (k.agentGender || 'female') !== 'male';
    const speaking = female ? 'bol rahi hoon' : 'bol raha hoon';
    const urdu = (k.primaryLanguage || 'urdu') !== 'english';
    const agent = k.agentName || (female ? 'Ayesha' : 'Ahmed');
    const company = k.businessName || bundle.categoryName;
    const place = k.locationLabel || k.city || 'DHA City';
    const missing = this.missingSlots(memory);

    const products = bundle.products
      .slice(0, 6)
      .map(
        (p) =>
          `${p.name}${p.availableSizes?.length ? ` — sizes ${p.availableSizes.slice(0, 3).join(', ')}` : ''}`,
      )
      .join('; ');

    // Facts only (tiny) — never paste Q→A FAQ pairs to recite
    const factBits = bundle.faqs
      .slice(0, 3)
      .map((f) => f.answer)
      .join(' · ');

    const recent = recentMessages
      .slice(-6)
      .map((m) => `${m.role === 'assistant' ? agent : 'Customer'}: ${m.content}`)
      .join('\n');

    const thinkMode =
      mode === 'answer_first'
        ? `MODE: ANSWER FIRST. Fully answer their question in natural words using business knowledge. Then you may add ONE soft forward step only if it feels human. Never ignore the question. Never jump to budget.`
        : mode === 'objection'
          ? `MODE: OBJECTION. Empathize, reduce pressure, keep door open (WhatsApp / callback / site visit later). Never argue. Never hard-close unless they insist not interested.`
          : `MODE: CONSULT. Think: intent + memory + stage coach → one natural reply.`;

    return [
      `IDENTITY: You are ${agent}, a senior Pakistani real estate consultant at ${company}, ${place}.`,
      `You have years of phone experience. You are ON A LIVE CALL. You are a human — not AI, not IVR, not ChatGPT, not a script reader.`,
      `Speak as "${speaking}".`,
      '',
      thinkMode,
      '',
      'THINK BEFORE EVERY REPLY (silently):',
      '1) What did they mean? (STT may be messy — use intent)',
      '2) What do I already know? (never re-ask)',
      '3) Did they ask something? → answer completely first',
      '4) What is the softest next helpful step toward site visit / consultant meeting?',
      '5) Speak 1–2 short natural Roman Urdu sentences. Max one question.',
      '',
      'MEANING (synonyms — same intent):',
      'living = rehne | rihaish | residential | residence | apna ghar | family home | own use | stay',
      'investment = sarmaya | invest | rental | kiraya',
      'villa = bangla | bilo (STT errors)',
      '',
      `BUSINESS KNOWLEDGE (paraphrase — never read aloud as list):`,
      `Project: ${company} / ${k.projectName || company} @ ${place}`,
      `Inventory: ${products || (k.propertyTypes || []).join(', ')}`,
      `Sizes: ${(k.availableSizes || []).slice(0, 4).join(', ')}`,
      `Payment options: ${(k.paymentPlans || []).join(', ')}`,
      `Call goal: ${k.conversationGoal}`,
      factBits ? `Extra facts to weave naturally: ${factBits}` : '',
      '',
      `MEMORY (already answered — NEVER ask again): ${this.memory.summarize(memory)}`,
      missing.length
        ? `Still unknown (ask at most ONE, softly, only if needed): ${missing[0]}`
        : 'All key facts known — guide to site visit / consultant follow-up.',
      `Soft stage coach (not a script): ${stage.stageName} — ${stage.goal}`,
      `Customer just said: "${customerUtterance}"`,
      '',
      'HARD RULES:',
      '- Database/FAQs = knowledge source only. Never recite FAQ text word-for-word.',
      '- Never sound robotic, corporate, or like filling a form.',
      '- Never say: I am an AI / please repeat / according to our FAQ / I did not understand.',
      '- If they answered with synonyms, acknowledge and move forward.',
      '- Build trust. No pressure. Guide toward site visit or team follow-up.',
      '',
      urdu
        ? 'LANGUAGE: Pakistani Roman Urdu (Latin). Natural phone: Jee Sir, Acha, Bilkul, Theek hai, Shukriya, Allah hafiz.'
        : 'LANGUAGE: Short natural English phone tone.',
      '',
      'OUTPUT: Only the spoken reply. Complete sentence(s). No labels, no bullets, no thinking aloud.',
      recent ? `RECENT:\n${recent}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  isInquiryReasonQuestion(text: string): boolean {
    const t = (text || '').toLowerCase().replace(/[?.,!']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (/\b(inquiry|enquiry|inquery|form|submit|record|hawale|application)\b/.test(t)) {
      return true;
    }
    if (/\b(kis\s*liye|kyun\s*call|call\s*kyun|kaan\s*se|kaun\s*se|kis\s*ke\s*liye)\b/.test(t)) {
      return true;
    }
    if (/\b(maine|mein|main)\b/.test(t) && /\b(kya|di|diya|di\s*thi|bhej|likh|submit|form)\b/.test(t)) {
      return true;
    }
    if (/^(mein|maine|main)(\s+\1)*\s+kya\b/.test(t)) return true;
    if (/\bkya\s+(inquiry|form|di|diya)\b/.test(t)) return true;
    if (/\b(mein|maine|main)\s+aap\b/.test(t)) return true;
    if (/^(mein|maine|main)(\s+(hai|aap|kya|nahi)){1,6}$/.test(t)) return true;
    if (/\bnahi\s+nahi\b/.test(t) && /\b(mein|maine|main)\b/.test(t)) return true;
    return false;
  }

  isEarlyCallConfusion(text: string, stageKey: string): boolean {
    if (!['greeting', 'permission', 'rapport', 'purpose'].includes(stageKey)) {
      return false;
    }
    const t = (text || '').toLowerCase().replace(/[?.,!']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length < 3) return false;
    if (
      /\b(plot|villa|villas|budget|investment|family|site\s*visit|200|300|400|rehne|rihaish|residential|living|residence)\b/.test(
        t,
      )
    ) {
      return false;
    }
    if (
      /^(jee|ji|haan|han|theek|bilkul|ok|yes|boliye|bollo)(\s|$)/i.test(t) &&
      t.split(/\s+/).length <= 4
    ) {
      return false;
    }
    if (this.isInquiryReasonQuestion(t)) return true;
    if (/\bnahi\b/.test(t) && t.split(/\s+/).length <= 10) return true;
    if (/\b(mein|maine|main)\b/.test(t) && t.split(/\s+/).length <= 8) return true;
    return false;
  }

  isCustomerQuestion(text: string): boolean {
    const t = (text || '').toLowerCase().trim();
    if (!t) return false;
    if (
      /^(jee|ji|haan|han|theek|bilkul|ok|yes|boliye|nahi|no)(\s|$)/i.test(t) &&
      t.split(/\s+/).length <= 4
    ) {
      return false;
    }
    if (this.isInquiryReasonQuestion(t)) return true;
    if (/[?]/.test(t)) return true;
    if (
      /\b(kitna|kitne|kitni|kahan|kab|kaise|kyun|price|rate|cost|available|details|info|batao|bataiye|bataen|message|tell me|what|where|how|when|which|size)\b/i.test(
        t,
      )
    ) {
      return true;
    }
    if (
      /\bkya\b/.test(t) &&
      t.split(/\s+/).length >= 2 &&
      !/\b(plot|villa|budget|family|investment|rehne|rihaish)\b/.test(t)
    ) {
      return true;
    }
    return false;
  }

  isReadyToContinue(text: string): boolean {
    const t = (text || '').toLowerCase().trim();
    if (this.isCustomerQuestion(t)) return false;
    return /\b(jee|haan|han|theek|bilkul|ok|okay|yes|chalen|chalo|bataiye|poochiye|koi\s+sawal\s+nahi|aur\s+nahi|samajh\s+gaya|samajh\s+gayi|proceed|acha)\b/i.test(
      t,
    );
  }

  detectObjection(text: string): ObjectionKind {
    const t = (text || '').toLowerCase();
    if (/\b(nahi\s+chahiye|not\s+interested|mat\s+call|dobara\s+mat)\b/.test(t)) {
      return 'not_interested';
    }
    if (/\b(budget\s+nahi|paisa\s+nahi|no\s+budget|mehnga|zyada\s+hai)\b/.test(t)) {
      return 'no_budget';
    }
    if (
      /\b(time\s+chahiye|sochna|baad\s+mein\s+bata|later|abhi\s+decide)\b/.test(t) ||
      /\b(soch\s+kar|time\s+do)\b/.test(t)
    ) {
      return 'need_time';
    }
    if (
      /\b(family\s+se|ghar\s*wal|biwi\s+se|discuss|mashwara|baat\s+kar\s*ke)\b/.test(t) &&
      !/\b(rehne|rihaish|residential|living|apne\s+liye)\b/.test(t)
    ) {
      return 'family_discuss';
    }
    if (/\b(busy|abhi\s+nahi|baad\s+mein\s+call|callback)\b/.test(t)) return 'busy';
    return null;
  }

  humanObjectionReply(
    kind: ObjectionKind,
    female: boolean,
    urdu: boolean,
    varietyKey = 0,
  ): string {
    if (!kind) return '';
    if (!urdu) {
      const en: Record<Exclude<ObjectionKind, null>, string[]> = {
        no_budget: [
          'No worry at all — we have a few options in different ranges. Whenever you are ready we can shortlist calmly.',
        ],
        need_time: [
          'Of course, take your time. I can share details on WhatsApp so you can review with a clear mind.',
        ],
        family_discuss: [
          'Absolutely — family decision makes sense. We can arrange a joint call or site visit whenever suits everyone.',
        ],
        not_interested: [
          'No problem at all — thank you for your time. Take care, Allah hafiz.',
        ],
        busy: ['No issue — should I call this evening or tomorrow?'],
      };
      const list = en[kind];
      return list[Math.abs(varietyKey) % list.length];
    }
    const save = female ? 'kar deti hoon' : 'kar deta hoon';
    const map: Record<Exclude<ObjectionKind, null>, string[]> = {
      no_budget: [
        `Koi baat nahi Sir — budget tension ki cheez nahi. Different options hain, jab comfortable hon shortlist ${save}.`,
        `Bilkul samajh sakti hoon. Range ke hisaab se options hain — pressure bilkul nahi, aap batayein kab suitable ho.`,
      ],
      need_time: [
        `Jee bilkul, time lijiye. Main WhatsApp pe brief details bhej ${save} taake aap araam se dekh len.`,
        `Theek hai Sir, soch lijiye. Jab ready hon site visit ya call schedule kar lenge.`,
      ],
      family_discuss: [
        `Bilkul sahi baat — family se mashwara zaroori hota hai. Jab chahein joint visit ya call arrange ${save}.`,
        `Jee, ghar walon se baat kar lijiye. Main details save ${save}, follow-up unke hisaab se hoga.`,
      ],
      not_interested: [
        'Koi baat nahi Sir, time dene ka shukriya. Khayal rakhiye, Allah hafiz.',
      ],
      busy: [
        'Koi tension nahi — aaj sham theek rahega ya kal subah?',
        'Bilkul, aap busy hain. Kab call karun — sham ya kal?',
      ],
    };
    let line = map[kind][Math.abs(varietyKey) % map[kind].length];
    if (!female) line = line.replace(/samajh sakti hoon/g, 'samajh sakta hoon');
    return line;
  }

  /** Exact consultant style for inquiry reason. */
  humanInquiryAnswer(bundle: CachedCategoryKnowledge, female: boolean, varietyKey = 0): string {
    const k = bundle.knowledge;
    const company = k.businessName || 'Hampstead Villas';
    const place = k.locationLabel || 'DHA City Karachi';
    const talking = female ? 'kar rahi hoon' : 'kar raha hoon';
    const variants = [
      `Jee Sir, hamare record ke mutabiq aap ne ${company}, ${place} me residential property ke hawale se inquiry submit ki thi. Isi silsile me main aaj aap se baat ${talking}.`,
      `Jee Sir, aap ki inquiry ${company}, ${place} residential project pe thi. Usi pe main aaj contact ${talking}.`,
      `Bilkul Sir — form / interest ${company}, ${place} ke liye aaya tha. Main usi silsile me baat ${talking}.`,
    ];
    return variants[Math.abs(varietyKey) % variants.length];
  }

  /** Soft forward step after a full answer — natural, not a quiz dump. */
  softContinueAfterAnswer(
    memory: StructuredMemory,
    female: boolean,
    urdu: boolean,
    varietyKey = 0,
  ): string {
    if (!urdu) {
      if (!memory.propertyType) return ' If you like, tell me roughly plot or villa and I will guide from there.';
      return ' Whenever you are ready I can help shortlist the next step.';
    }
    const help = female ? 'kar sakti hoon' : 'kar sakta hoon';
    if (!memory.propertyType) {
      const opts = [
        ` Agar short bata dein plot dekh rahe hain ya villa, to main better guide ${help}.`,
        ` Jab aap ready hon, bas ye clear kar dein — plot ki side hai ya villa?`,
      ];
      return opts[Math.abs(varietyKey) % opts.length];
    }
    if (!memory.customerPurpose) {
      return ` Rehne ke liye soch rahe hain ya investment — jo easy ho bas itna bata dein.`;
    }
    return ` Agar aap chahein to site visit ya consultant follow-up suggest ${help}.`;
  }

  answerCustomerQuestion(input: {
    bundle: CachedCategoryKnowledge;
    customerText: string;
    female: boolean;
    varietyKey?: number;
  }): string | null {
    const { bundle, customerText, female, varietyKey = 0 } = input;
    const t = (customerText || '').toLowerCase();
    const k = bundle.knowledge;
    const urdu = (k.primaryLanguage || 'urdu') !== 'english';
    const company = k.businessName || bundle.categoryName;
    const place = k.locationLabel || [k.city, k.country].filter(Boolean).join(', ') || 'DHA City';

    if (this.isInquiryReasonQuestion(customerText)) {
      if (!urdu) {
        return `Sure — you showed interest in residential property at ${company}, ${place}. That is why I am calling today.`;
      }
      return this.humanInquiryAnswer(bundle, female, varietyKey);
    }

    if (/\b(plot|plots|zameen)\b/.test(t) && /\b(kya|kitne|available|hain|hai|size|gaz|gaj)\b/.test(t)) {
      const sizes = (k.availableSizes || []).slice(0, 3).join(', ') || '200, 300 aur 400 square yard';
      return urdu
        ? `Jee Sir, plots ki baat karein to ${sizes} available hain ${place} mein.`
        : `For plots, we have ${sizes} available in ${place}.`;
    }
    if (/\b(villa|villas|bangla)\b/.test(t) && /\b(kya|available|hain|hai|size)\b/.test(t)) {
      return urdu
        ? `Jee, villas bhi hain — size aap batayein to main match kar ke bata ${female ? 'deti' : 'deta'} hoon.`
        : `Yes we have villas too — tell me your preferred size and I will match options.`;
    }
    if (/\b(price|rate|cost|qeemat|kitne\s+ka)\b/.test(t)) {
      return urdu
        ? 'Price aap ki requirement pe depend karti hai Sir. Pehle shortlist karte hain, phir clear figure aa jati hai.'
        : 'Price depends on your requirement — once we shortlist, figures are clear.';
    }
    if (/\b(kahan|location|where)\b/.test(t)) {
      return urdu
        ? `${place} mein hai project Sir — D H A City side.`
        : `It is in ${place}.`;
    }
    if (/\b(visit|site|dekhne)\b/.test(t)) {
      return urdu
        ? 'Jee, site pe le aa sakte hain aap ko — jab time mile subah ya sham.'
        : 'Yes we can take you for a site visit — morning or afternoon whenever suits.';
    }
    if (/\b(message|whatsapp|detail)\b/.test(t)) {
      return urdu
        ? `Jee Sir, main aap ki details save ${female ? 'kar deti hoon' : 'kar deta hoon'} aur brief info WhatsApp pe share ho sakti hai.`
        : 'Yes — I can save your details and share a short brief on WhatsApp.';
    }

    // null → GPT paraphrases from knowledge (no FAQ dump)
    return null;
  }

  softContinuePermission(female: boolean, urdu: boolean, varietyKey = 0): string {
    if (!urdu) {
      return 'If you are okay, may I ask just two short questions so I can suggest the right option?';
    }
    const variants = [
      'Sir agar theek ho to main sirf do short baatein pooch loon — taake aap ke liye sahi option suggest kar sakoon.',
      'Agar aap allow karen to do choti si batein poochun, phir clear bataungi kya suit karega.',
    ];
    let line = variants[Math.abs(varietyKey) % variants.length];
    if (!female) line = line.replace(/bataungi/g, 'bataunga');
    return line;
  }

  humanQaBridge(female: boolean, urdu: boolean, varietyKey = 0): string {
    if (!urdu) return 'Of course — I am right here if you want to ask anything else.';
    const variants = [
      'Jee Sir, bilkul. Aur koi baat ho to poochiye — main yahin hoon.',
      'Theek hai Sir. Agar kuch aur clear karna ho to bataiye.',
    ];
    let line = variants[Math.abs(varietyKey) % variants.length];
    if (!female) line = line.replace(/yahin hoon/g, 'yahin hoon');
    return line;
  }

  humanClosing(female: boolean, urdu: boolean, booked = false): string {
    if (!urdu) {
      return 'Thank you — I will save your details and our team will follow up. Take care.';
    }
    const save = female ? 'kar deti hoon' : 'kar deta hoon';
    const confirm = female ? 'kar deti hoon' : 'kar deta hoon';
    if (booked) {
      return `Shukriya Sir. Aap se baat karke bohat khushi hui. Main aap ki details save ${save} aur visit / follow-up confirm ${confirm}. Allah hafiz.`;
    }
    return `Shukriya Sir. Aap se baat karke bohat khushi hui. Main aap ki details save ${save} aur hamari team aap se follow-up karegi. Allah hafiz.`;
  }

  localStageReply(input: {
    bundle: CachedCategoryKnowledge;
    stageKey: string;
    memory: StructuredMemory;
    customerText: string;
    varietyKey?: number;
  }): string | null {
    const { bundle, stageKey, memory, customerText, varietyKey = 0 } = input;
    if (
      this.isCustomerQuestion(customerText) ||
      this.isEarlyCallConfusion(customerText, stageKey) ||
      this.detectObjection(customerText)
    ) {
      return null;
    }

    const k = bundle.knowledge;
    const urdu = (k.primaryLanguage || 'urdu') !== 'english';
    const female = (k.agentGender || 'female') !== 'male';
    const want = female ? 'chahti thi' : 'chahta tha';
    const company = k.businessName || bundle.categoryName;
    const place = k.locationLabel || [k.city, k.country].filter(Boolean).join(', ');
    const text = (customerText || '').toLowerCase();
    const yes =
      /\b(jee|ji|haan|han|boliye|bollo|theek|bilkul|ok|yes|hello|hi|assalam|acha)\b/i.test(text);
    const v = Math.abs(varietyKey);

    if (/\b(nahi chahiye|not interested|mat call)\b/.test(text)) {
      return this.humanClosing(female, urdu, false);
    }

    switch (stageKey) {
      case 'permission':
        if (/\b(busy|baad mein|abhi nahi|callback)\b/.test(text)) {
          return urdu ? 'Koi tension nahi Sir — aaj sham theek rahega ya kal?' : 'This evening or tomorrow?';
        }
        if (yes) return null;
        return urdu
          ? 'Jee Sir, agar abhi mushkil ho to bataiye kab call karun.'
          : 'When would be a better time?';

      case 'rapport': {
        if (!urdu) {
          return `Thanks. Your interest came for ${company}${place ? ` in ${place}` : ''}. Were you looking more at a plot or a villa?`;
        }
        const rapport = [
          `Shukriya Sir. Aap ki taraf se ${company}${place ? `, ${place}` : ''} wali inquiry aayi thi. Main bas ye samajhna ${want} ke aap plot dekh rahe hain ya villa?`,
          `Jee shukriya. ${company}${place ? `, ${place}` : ''} pe aap ka interest aaya tha — is liye call ki. Aap plot soch rahe hain ya villa?`,
        ];
        return rapport[v % rapport.length];
      }

      case 'purpose':
      case 'requirement_discovery':
        if (memory.propertyType) return null;
        if (!urdu) return 'Were you thinking plot or villa?';
        return ['Sir aap plot dekh rahe hain ya villa?', 'Acha — plot ki side hai ya villa?'][
          v % 2
        ];

      case 'qualification':
        if (memory.customerPurpose || memory.investmentPurpose === 'residence') return null;
        if (
          /\b(rehne|rihaish|residential|family|living|apne\s+liye|ghar\s+ke\s+liye)\b/i.test(text)
        ) {
          return null;
        }
        return urdu
          ? `Acha${memory.propertyType ? `, ${memory.propertyType}` : ''} — ye aap khud rehne ke liye dekh rahe hain ya investment ke liye?`
          : 'Is this for you to live in, or more for investment?';

      case 'product_recommendation': {
        const purposeBit =
          memory.customerPurpose === 'family' || memory.investmentPurpose === 'residence'
            ? urdu
              ? 'rehne / family ke liye '
              : 'for living, '
            : memory.customerPurpose === 'investment'
              ? urdu
                ? 'investment ke liye '
                : 'for investment, '
              : '';
        if (memory.propertyType === 'villa') {
          return urdu
            ? `Acha Sir, ${purposeBit}villa — ${company} mein mukhtalif sizes hain. Main aap ki requirement ke hisaab se match ${female ? 'kar deti hoon' : 'kar deta hoon'}.`
            : `Got it — ${purposeBit}villas. I can match a size for you.`;
        }
        return urdu
          ? `Acha Sir, ${purposeBit}${place || 'yahan'} 200, 300 aur 400 square yard plots available hain.`
          : `Got it — we have 200, 300 and 400 square yard plots.`;
      }

      case 'budget_discussion':
        if (memory.budget) return null;
        return urdu
          ? 'Agar aap share karna chahein to budget roughly kis range mein soch rahe hain?'
          : 'Roughly what budget range are you considering?';

      case 'payment_discussion':
        if (memory.paymentPreference) return null;
        return urdu
          ? 'Payment aap cash prefer karenge ya instalments?'
          : 'Would you prefer cash or instalments?';

      case 'appointment':
        return urdu
          ? `Agar aap chahein to consultant se baat ${female ? 'lagwa deti hoon' : 'lagwa deta hoon'}, ya ${place || 'site'} visit — subah theek rahega ya sham?`
          : 'Shall I arrange a consultant call or site visit — morning or afternoon?';

      case 'follow_up':
        return urdu
          ? 'Theek hai Sir — aaj sham call karun ya kal?'
          : 'Should I call this evening or tomorrow?';

      case 'closing':
        return this.humanClosing(female, urdu, !!memory.appointmentStatus);

      case 'greeting':
        return this.buildGreeting(bundle, memory.customerName);

      default:
        return null;
    }
  }

  buildGreeting(bundle: CachedCategoryKnowledge, customerName?: string): string {
    const k = bundle.knowledge;
    const templates = k.greetingTemplates || [];
    const female = (k.agentGender || 'female') !== 'male';
    const speaking = female ? 'bol rahi hoon' : 'bol raha hoon';
    const agent = k.agentName || (female ? 'Ayesha' : 'Ahmed');
    const company = k.businessName || bundle.categoryName;
    const place = k.locationLabel || k.city || '';
    const who =
      customerName && !/^inbound/i.test(customerName)
        ? `${customerName.split(/\s+/)[0]} sahab`
        : 'Sir';

    if (templates[0]) {
      return templates[0]
        .replace(/\{\{agent_name\}\}/gi, agent)
        .replace(/bol raha hoon|bol rahi hoon/gi, speaking)
        .replace(/\bAhmed\b/g, agent)
        .replace(/\bSir\b/, who);
    }

    if ((k.primaryLanguage || 'urdu') === 'english') {
      return `Hi, this is ${agent} from ${company}${place ? `, ${place}` : ''}. Do you have two minutes?`;
    }

    return `Assalam o Alaikum ${who}, main ${agent} ${speaking} ${company}${place ? `, ${place}` : ''} se. Umeed hai aap khairiyat se honge. Agar aap ke paas do minute hon to ek choti si baat karni thi.`;
  }
}
