import { Injectable } from '@nestjs/common';
import { StructuredMemory } from './schemas/call-conversation-state.schema';

/**
 * Structured memory from natural speech — synonyms map to the same intent
 * so the agent never re-asks what the customer already said.
 */
@Injectable()
export class MemoryEngineService {
  private isNoise(raw: string): boolean {
    const t = (raw || '').toLowerCase();
    if (!t.trim()) return true;
    if (
      t.includes('assalam o alaikum') &&
      t.includes('hampstead') &&
      t.includes('whatsapp') &&
      t.split(',').length >= 5
    ) {
      return true;
    }
    if (t.length > 180 && (t.match(/,/g) || []).length >= 8) return true;
    return false;
  }

  /** "Family se discuss" is objection — NOT residence purpose. */
  private isFamilyDiscussObjection(t: string): boolean {
    return (
      /\b(family\s+se|ghar\s*wal|biwi\s+se|mashwara|discuss)\b/.test(t) &&
      !/\b(rehne|rihaish|residential|living|apne\s+liye|residence)\b/.test(t)
    );
  }

  private isResidencePurpose(t: string): boolean {
    if (this.isFamilyDiscussObjection(t)) return false;
    return (
      /\b(rehne|rehna|rehen[ey]|rahaish|rihaish|rihayish|rehaish)\b/.test(t) ||
      /\b(residential|residence|residency|living|reside|stay)\b/.test(t) ||
      /\b(apne\s+liye|khud(\s+ke)?\s*liye|ghar\s+ke\s+liye|apna\s+ghar|own\s+(use|home)|personal\s+use)\b/.test(
        t,
      ) ||
      /\b(rehen[ey]?\s+ke\s+liye|rehne\s+ke\s+liye|basna|basne)\b/.test(t) ||
      (/\b(family|families|khandaan)\b/.test(t) &&
        !/\b(discuss|mashwara|soch)\b/.test(t))
    );
  }

  private isInvestmentPurpose(t: string): boolean {
    return /\b(invest|investment|sarmaya|investment\s+ke\s+liye|rent\s+pe|kiraya|rental\s+income)\b/.test(
      t,
    );
  }

  extract(raw: string, memory: StructuredMemory): StructuredMemory {
    if (this.isNoise(raw)) return { ...memory, knownFacts: this.buildKnownFacts(memory) };

    const t = (raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const next = { ...memory };

    const isMetaQ =
      /\b(inquiry|enquiry|form|submit|kyun\s+call|call\s+kyun|kaan\s+se|kaun\s+se|record)\b/.test(
        t,
      ) ||
      (/\bkis\s+liye\b/.test(t) && /\b(inquiry|form|call|aayi|submit)\b/.test(t));

    if (!isMetaQ) {
      if (/\b(villa|villas|bangla|bungalow|bilo|bila|weela)\b/.test(t)) {
        next.propertyType = 'villa';
      }
      if (/\b(plot|plots|zameen)\b/.test(t)) next.propertyType = 'plot';
      if (/\b(apartment|flat)\b/.test(t) && !/\bvilla\b/.test(t)) {
        next.propertyType = 'apartment';
      }

      if (this.isInvestmentPurpose(t) && !this.isResidencePurpose(t)) {
        next.customerPurpose = 'investment';
        next.investmentPurpose = 'investment';
      } else if (this.isResidencePurpose(t)) {
        next.customerPurpose = 'family';
        next.investmentPurpose = 'residence';
      }

      if (this.isFamilyDiscussObjection(t)) {
        next.notes = [next.notes, 'wants_family_discussion'].filter(Boolean).join('; ');
      }
      if (/\b(budget\s+nahi|no\s+budget|paisa\s+nahi)\b/.test(t)) {
        next.notes = [next.notes, 'budget_sensitive'].filter(Boolean).join('; ');
      }
    }

    const budget =
      t.match(/(\d+(?:\.\d+)?\s*(?:million|m|lac|lakh|crore|kroad|karor|k))/) ||
      t.match(/\b(\d+)\s*(million|m|crore|kroad)\b/);
    if (budget) next.budget = budget[0].replace(/\s+/g, ' ');

    const size = t.match(/(\d+)\s*(square\s*yards?|sq\.?\s*yards?|gaz|gaj)/i);
    if (size) next.preferredSize = size[0];

    if (/\b(cash|nakad|naqad)\b/.test(t)) next.paymentPreference = 'cash';
    if (/\b(instal+ment|installment|qist|emi)\b/.test(t)) {
      next.paymentPreference = 'instalment';
    }

    if (/\b(dha|karachi|city)\b/.test(t) && !isMetaQ) {
      next.locationPreference = next.locationPreference || 'DHA City Karachi';
    }

    const words = t.split(/\s+/).filter(Boolean);
    if (
      words.length <= 12 &&
      /\b(sham|subah|weekend|kal|aaj|saturday|sunday|monday)\b/.test(t) &&
      !isMetaQ
    ) {
      next.timeline = raw.trim();
    }

    if (
      /\b(visit|site\s*visit|appointment|aa\s*jaein|dekhne\s+aa)\b/.test(t) &&
      !/\bnahi\b/.test(t) &&
      !isMetaQ
    ) {
      next.appointmentStatus = 'interested';
    }

    next.knownFacts = this.buildKnownFacts(next);
    return next;
  }

  buildKnownFacts(m: StructuredMemory): string[] {
    const facts: string[] = [];
    if (m.customerName) facts.push(`name=${m.customerName}`);
    if (m.propertyType) facts.push(`property=${m.propertyType}`);
    if (m.customerPurpose) facts.push(`purpose=${m.customerPurpose}`);
    if (m.investmentPurpose) facts.push(`use=${m.investmentPurpose}`);
    if (m.budget) facts.push(`budget=${m.budget}`);
    if (m.preferredSize) facts.push(`size=${m.preferredSize}`);
    if (m.paymentPreference) facts.push(`payment=${m.paymentPreference}`);
    if (m.timeline) facts.push(`timeline=${m.timeline}`);
    if (m.locationPreference) facts.push(`location=${m.locationPreference}`);
    if (m.appointmentStatus) facts.push(`appointment=${m.appointmentStatus}`);
    if (m.notes) facts.push(`notes=${m.notes}`);
    return facts;
  }

  summarize(m: StructuredMemory): string {
    return this.buildKnownFacts(m).join('; ') || 'none yet';
  }
}
