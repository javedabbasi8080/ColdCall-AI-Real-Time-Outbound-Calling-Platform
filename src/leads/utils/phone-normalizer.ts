import {
  parsePhoneNumberFromString,
  CountryCode,
} from 'libphonenumber-js';

const AREA_CODE_TIMEZONES: Record<string, string> = {
  '212': 'America/New_York',
  '213': 'America/Los_Angeles',
  '312': 'America/Chicago',
  '415': 'America/Los_Angeles',
  '305': 'America/New_York',
  '404': 'America/New_York',
  '512': 'America/Chicago',
  '602': 'America/Phoenix',
  '617': 'America/New_York',
  '702': 'America/Los_Angeles',
  '713': 'America/Chicago',
  '818': 'America/Los_Angeles',
};

export interface NormalizedPhone {
  phone: string;
  timezone: string;
  valid: boolean;
}

function tryParse(raw: string, defaultCountry: CountryCode) {
  return parsePhoneNumberFromString(raw, defaultCountry);
}

export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode = 'US',
): NormalizedPhone {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { phone: '', timezone: 'America/New_York', valid: false };
  }

  const candidates = [trimmed];
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 10) {
    candidates.push(`+1${digits}`, `1${digits}`);
  } else if (digits.length === 11 && digits.startsWith('1')) {
    candidates.push(`+${digits}`);
  } else if (digits.length > 10) {
    candidates.push(`+${digits}`);
  }

  for (const candidate of candidates) {
    const parsed = tryParse(candidate, defaultCountry);
    if (parsed?.isValid()) {
      const national = parsed.nationalNumber.toString();
      const areaCode = national.slice(0, 3);
      const timezone = AREA_CODE_TIMEZONES[areaCode] || 'America/New_York';
      return {
        phone: parsed.format('E.164'),
        timezone,
        valid: true,
      };
    }
  }

  return { phone: trimmed, timezone: 'America/New_York', valid: false };
}
