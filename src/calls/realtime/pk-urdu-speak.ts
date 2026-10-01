/**
 * Pakistani Roman Urdu for phone TTS (Karachi sales style).
 * Strip Indian Hindi, keep short conversational PK expressions.
 */

const HINDI_TO_PK: Array<[RegExp, string]> = [
  [/\bturant\b/gi, 'foran'],
  [/\bkripya\b|\bkripaya\b|\bkripaa\b|\bkripa\b|\bkrupaya\b/gi, 'meherbani'],
  [/\bdhanyavaad\b|\bdhanyavad\b|\bshukriyaa\b/gi, 'shukriya'],
  [/\bavashyak\b|\bzaroori\s+hai\s+ki\b/gi, 'zaroori'],
  [/\bparantu\b|\bkintu\b/gi, 'lekin'],
  [/\bnamaste\b|\bnamaskar\b/gi, 'Assalam o Alaikum'],
  [/\bswagat\b|\bswaagat\b/gi, 'khush aamdeed'],
  [/\bkripaya\b/gi, 'meherbani'],
  [/\bachchha\b|\baccha\b/gi, 'acha'],
  [/\bbahut\b/gi, 'bohat'],
  [/\bvichar\b/gi, 'soch'],
  [/\bsamay\b/gi, 'waqt'],
  [/\bprasann\b/gi, 'khush'],
  [/\batyant\b/gi, 'bohat'],
  [/\bshrimaan\b|\bshriman\b/gi, 'sahab'],
  [/\bshrimatee\b|\bshrimati\b/gi, 'aap'],
  [/\bkya\s+aap\s+madad\s+kar\s+sakte\b/gi, 'kya aap madad kar sakte'],
];

/** Places / brands that must never be spoken unless in the active playbook. */
export const GLOBAL_LEAK_WORDS = [
  'dubai',
  'u.a.e',
  'uae',
  'jumeirah',
  'marina',
  'abu dhabi',
  'sharjah',
  'emirates',
];

export function stripHindiVocabulary(text: string): string {
  let out = text;
  for (const [re, rep] of HINDI_TO_PK) out = out.replace(re, rep);
  return out;
}

/**
 * Soft-cap phone turns — NEVER cut mid-sentence.
 * Prefer 1–3 complete sentences under maxWords.
 */
export function keepShortPkSpeech(text: string, maxWords = 55): string {
  const raw = (text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return raw;

  // Keep whole sentences until we would exceed the cap
  const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
  const kept: string[] = [];
  let count = 0;
  for (const s of sentences) {
    const sw = s.trim().split(/\s+/).filter(Boolean).length;
    if (kept.length > 0 && count + sw > maxWords) break;
    if (kept.length >= 3) break;
    kept.push(s.trim());
    count += sw;
  }
  let out = kept.join(' ').trim();
  if (!out) {
    // Fallback: first sentence only even if long
    out = (sentences[0] || raw).trim();
  }
  if (!/[.!?]$/.test(out)) out = `${out}.`;
  return out;
}

/**
 * Shape Roman Urdu for clearer Pakistani phone TTS.
 * @param forcePk — when false, only light cleanup (English mode).
 */
export function shapePakistaniSpeech(text: string, forcePk = true): string {
  let t = stripHindiVocabulary((text || '').replace(/\s+/g, ' ').trim());

  if (forcePk) {
    // Preferred Karachi sales phrases
    t = t.replace(/\bji\s+bilkul\b/gi, 'jee bilkul');
    t = t.replace(/\bji\s+zaroor\b/gi, 'jee zaroor');
    t = t.replace(/\bperfect\b/gi, 'jee bilkul');
    t = t.replace(/\bgreat\b/gi, 'bohat acha');
    t = t.replace(/\bgot\s+it\b/gi, 'bilkul samajh gaya');
    t = t.replace(/\bsamajh\s+gaya\b/gi, 'bilkul samajh gaya');
    t = t.replace(/\bok\b|\bokay\b/gi, 'theek hai');
    t = t.replace(/\bno\s+problem\b/gi, 'koi baat nahi');
    t = t.replace(/\bthank\s+you\b|\bthanks\b/gi, 'shukriya');
  }

  // Salutation & courtesy
  t = t.replace(/assalam[\s\-]*[ou]?[\s\-]*alaikum/gi, 'Assalam o Alaikum');
  t = t.replace(/\balaikum\b/gi, 'Alaikum');
  t = t.replace(/\bkhairiyat\b/gi, 'khairiyat');
  t = t.replace(/\bshukriya\b/gi, 'shukriya');
  t = t.replace(/\bmeherbani\b/gi, 'meherbani');
  t = t.replace(/\bbilot\b/gi, 'bilkul');
  t = t.replace(/\bbohot\b/gi, 'bohat');
  t = t.replace(/\bbahut\b/gi, 'bohat');
  t = t.replace(/\bbohat\s+khoob\b/gi, 'bohat khoob');
  t = t.replace(/\bbohat\s+acha\b/gi, 'bohat acha');
  t = t.replace(/\btheek\s+hai\b/gi, 'theek hai');
  t = t.replace(/\ballah\s*hafiz\b/gi, 'Allah hafiz');
  t = t.replace(/\binshallah\b|\binsha\s*allah\b/gi, 'Insha Allah');
  t = t.replace(/\bsahab\b/gi, 'sahab');
  t = t.replace(/\bjii\b/gi, 'jee');
  t = t.replace(/\bji\b/gi, 'jee');
  t = t.replace(/\bzarur\b/gi, 'zaroor');

  // Project / place clarity
  t = t.replace(/\bDHA\b/g, 'D H A');
  t = t.replace(/\bD\.H\.A\b/gi, 'D H A');
  t = t.replace(/hampstead/gi, 'Hampstead');
  t = t.replace(/hamstead/gi, 'Hampstead');
  t = t.replace(/\bwhatsapp\b/gi, 'WhatsApp');

  // Soft pauses
  t = t.replace(/\s*—\s*/g, ', ');
  t = t.replace(/\s*–\s*/g, ', ');
  t = t.replace(/(\w)\s*-\s*(\w)/g, '$1 $2');

  return t.trim();
}

/** Remove leak mentions that are not part of allowed place phrases. */
export function enforceCategoryIsolation(
  text: string,
  allowedPlaceHints: string[],
  neverMention: string[],
): string {
  let out = text;
  const allowed = allowedPlaceHints.map((s) => s.toLowerCase()).filter(Boolean);
  const banned = [
    ...GLOBAL_LEAK_WORDS,
    ...neverMention.map((s) => s.toLowerCase()),
  ];

  for (const bad of banned) {
    if (!bad) continue;
    const permitted = allowed.some((a) => a.includes(bad) || bad.includes(a));
    if (permitted) continue;
    const re = new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '').replace(/\s{2,}/g, ' ').trim();
  }
  return out;
}
