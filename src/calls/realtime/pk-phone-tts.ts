/**
 * Roman Urdu only — conversation + TTS.
 * Never send Nastaliq/Arabic script to the voice pipeline.
 */

import { shapePakistaniSpeech } from './pk-urdu-speak';

/**
 * Urdu-script / Hindi-script STT → Roman Urdu.
 * NOTE: Do NOT use \\b around Arabic/Urdu letters — JS word boundaries only know [A-Za-z0-9_].
 *
 * CRITICAL: Map meaning words BEFORE stripping leftover script — otherwise
 * "rehne ke liye" (in Urdu script) becomes blank and the agent keeps re-asking family/residence.
 */
const STT_URDU_TO_ROMAN: Array<[RegExp, string]> = [
  [/السلام\s*و?\s*علیکم/g, 'assalam o alaikum'],
  [/وعلیکم\s*السلام/g, 'walaikum assalam'],
  [/جی\s*بولیں/g, 'jee boliye'],
  [/جی\s*بولیے/g, 'jee boliye'],
  [/بولئے|بولیے|بولیں|بولیے/g, 'boliye'],
  [/جی ہاں|جیهاں/g, 'jee haan'],
  [/جی|जी/g, 'jee'],
  [/ہاں|हां|हाँ/g, 'haan'],
  [/نہیں|नहीं/g, 'nahi'],
  [/ٹھیک|ठीक/g, 'theek'],
  [/بالکل/g, 'bilkul'],
  [/شکریہ|शुक्रिया/g, 'shukriya'],
  [/معاف|معذرت/g, 'maaf'],
  [/والیکم/g, 'walaikum'],
  [/صبح/g, 'subah'],
  [/شام/g, 'sham'],

  // Purpose / living — MUST map before script strip
  [/رہائش|رہا\s*ئش|رہایش/g, 'rihaish'],
  [/رہائشی|ریذیڈنشل|ریذیڈینشل/g, 'residential'],
  [/رہنے\s*کے\s*لیے|رہنے\s*کے\s*لئے/g, 'rehne ke liye'],
  [/رہنے|رہنا|رہتے|رہتی/g, 'rehne'],
  [/रहने\s*के\s*लिए|रहने\s*के\s*लिये/g, 'rehne ke liye'],
  [/के\s*लिए|के\s*लिये/g, 'ke liye'],
  [/रहने|रहना|रहता|रहती|रहते/g, 'rehne'],
  [/देख\s*रहा|देख\s*रही|देख\s*रहे|دیکھ\s*رہا|دیکھ\s*رہی|دیکھ\s*رہے/g, 'dekh raha'],
  [/देख|دیکھ/g, 'dekh'],
  [/रहा|रही|रहे/g, 'raha'],
  [/हूँ|हूं|ہوں/g, 'hoon'],
  [/अपने\s*लिए|اپنے\s*لیے|اپنے\s*لئے/g, 'apne liye'],
  [/گھر\s*کے\s*لیے|घर\s*के\s*लिए/g, 'ghar ke liye'],
  [/گھر|घर/g, 'ghar'],
  [/کے\s*لیے|کے\s*لئے|ليے|لئے/g, 'ke liye'],
  [/خود\s*کے\s*لیے|खुद/g, 'khud'],
  [/پرسنل|पर्सनल/g, 'personal'],
  [/لونگ|لیونگ|लिविंग/g, 'living'],

  [/ویلا|ولا|وِلا|विला/g, 'villa'],
  [/پلاٹ|پلاٹس|प्लॉट/g, 'plot'],
  [/بجٹ|बजट/g, 'budget'],
  [/انوسٹمنٹ|انویسٹمنٹ|سرمایہ\s*کاری|इन्वेस्टमेंट/g, 'investment'],
  [/فیملی|خاندان|परिवार|फैमिली/g, 'family'],
  [/کیا|क्या/g, 'kya'],
  [/آپ|आप/g, 'aap'],
  [/ہے|ہیں|है|हैं/g, 'hai'],
  [/میں|मैं/g, 'mein'],
  [/اور|और/g, 'aur'],
  [/چاہیے|چاهیئے|چाहیے|चाहिए/g, 'chahiye'],
  [/سمجھ|समझ/g, 'samajh'],
  [/زَرُور|ضرور/g, 'zaroor'],
  [/ویلاز|ویلازِ/g, 'villas'],
  [/انکوائری|انکوایری/g, 'inquiry'],
  [/فارم|फॉर्म/g, 'form'],
  [/پیغام|مैसेज|میسج/g, 'message'],
];

export function normalizeLeadTranscript(raw: string): string {
  let t = (raw || '').trim();
  if (!t) return t;

  const hadScript = /[\u0600-\u06FF\u0900-\u097F]/.test(t);

  for (const [re, rep] of STT_URDU_TO_ROMAN) t = t.replace(re, rep);

  // Common STT mishears of villa
  t = t.replace(/\b(bilo|bila|weela|willa|vela)\b/gi, 'villa');

  // Drop leftover Arabic/Urdu AND Devanagari — agent must always see Latin
  t = t.replace(/[\u0600-\u06FF]+/g, ' ');
  t = t.replace(/[\u0900-\u097F]+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();

  if (!t && hadScript) return 'jee';

  if (isSttHallucinationDump(t)) return '';

  return t;
}

/** True when model echoed its own keyword prompt instead of the caller. */
export function isSttHallucinationDump(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (!t) return false;
  const hits = ['assalam', 'boliye', 'bilkul', 'villa', 'plot', 'budget', 'hampstead', 'whatsapp'];
  const count = hits.filter((h) => t.includes(h)).length;
  if (count >= 4 && t.split(/[,\s]+/).length >= 8) return true;
  if (t.startsWith('assalam o alaikum, jee, boliye')) return true;
  return false;
}

/**
 * Roman Urdu line for ElevenLabs / Twilio Say.
 */
export function prepareTtsText(romanLine: string): string {
  let t = shapePakistaniSpeech(romanLine || '');
  if (!t) return t;

  if (/[\u0600-\u06FF]/.test(t)) {
    t = t.replace(/[\u0600-\u06FF]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  t = t.replace(/\bDHA\b/g, 'D H A');
  t = t.replace(/\bD\s*H\s*A\b/gi, 'D H A');
  t = t.replace(/\s*,\s*/g, ', ');
  t = t.replace(/\.\s*/g, '. ');

  return t.replace(/\s{2,}/g, ' ').trim();
}
