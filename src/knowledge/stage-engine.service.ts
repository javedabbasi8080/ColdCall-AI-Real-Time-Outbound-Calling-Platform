import { Injectable, Logger } from '@nestjs/common';
import { CachedCategoryKnowledge } from './knowledge-cache.service';
import { StructuredMemory } from './schemas/call-conversation-state.schema';
import { ConversationStage } from './schemas/conversation-stage.schema';

export type StageTransition = {
  currentKey: string;
  nextKey: string;
  reason: string;
  skipped: string[];
};

@Injectable()
export class StageEngineService {
  private readonly logger = new Logger(StageEngineService.name);

  orderedKeys(bundle: CachedCategoryKnowledge): string[] {
    return [...bundle.stages]
      .sort((a, b) => a.priority - b.priority)
      .map((s) => s.key);
  }

  getStage(bundle: CachedCategoryKnowledge, key: string): ConversationStage | undefined {
    return bundle.stagesByKey.get(key);
  }

  /** Advance after agent spoke / customer replied — skip stages whose skip rules match memory. */
  advanceAfterCustomer(
    bundle: CachedCategoryKnowledge,
    currentKey: string,
    completed: string[],
    memory: StructuredMemory,
    customerText: string,
  ): StageTransition {
    const skipped: string[] = [];
    let key = currentKey;
    const text = (customerText || '').toLowerCase();

    // Soft exits / objections — never abrupt hard-sell skip
    if (/\b(nahi chahiye|not interested|mat call)\b/.test(text)) {
      return {
        currentKey,
        nextKey: 'closing',
        reason: 'not_interested',
        skipped,
      };
    }
    if (
      /\b(busy|callback|baad mein|abhi nahi)\b/.test(text) &&
      (currentKey === 'permission' || currentKey === 'rapport')
    ) {
      return {
        currentKey,
        nextKey: 'follow_up',
        reason: 'busy',
        skipped,
      };
    }
    if (
      /\b(sochna|time chahiye|family se|ghar wal|discuss|budget nahi)\b/.test(text) &&
      !/\b(rehne|rihaish|residential|living)\b/.test(text)
    ) {
      return {
        currentKey,
        nextKey: 'objection_handling',
        reason: 'objection',
        skipped,
      };
    }

    const done = new Set(completed);
    done.add(currentKey);

    // Complete current based on rules / memory
    const current = this.getStage(bundle, currentKey);
    if (current && this.isStageComplete(current, memory, text, currentKey)) {
      const next = this.resolveNext(bundle, current, memory, done, skipped);
      this.logger.log(`STAGE ${currentKey} → ${next} (${skipped.join(',') || 'none skipped'})`);
      return {
        currentKey,
        nextKey: next,
        reason: 'completed',
        skipped,
      };
    }

    // Stay if not complete
    return {
      currentKey,
      nextKey: currentKey,
      reason: 'incomplete',
      skipped,
    };
  }

  /** After greeting is spoken, move to permission wait. */
  afterGreetingSpoken(bundle: CachedCategoryKnowledge): string {
    const g = this.getStage(bundle, 'greeting');
    return g?.nextPossibleStages?.[0] || 'permission';
  }

  private isCustomerQuestion(text: string): boolean {
    const t = (text || '').toLowerCase().trim();
    if (!t) return false;
    if (/[?]/.test(t)) return true;
    if (/^(jee|ji|haan|han|theek|bilkul|ok|yes|boliye)(\s|$)/i.test(t) && t.split(/\s+/).length <= 3) {
      return false;
    }
    return /\b(kya|kitna|kitne|kitni|kahan|kab|kaise|price|rate|cost|available|details|batao|bataiye|what|where|how|when|which)\b/i.test(
      t,
    );
  }

  private isStageComplete(
    stage: ConversationStage,
    memory: StructuredMemory,
    text: string,
    key: string,
  ): boolean {
    // Customer questions are not stage answers — stay put so we can answer first
    if (this.isCustomerQuestion(text)) return false;

    const yes = /\b(jee|ji|haan|han|boliye|theek|bilkul|ok|yes|hello|hi)\b/i.test(text);

    switch (key) {
      case 'greeting':
        return true;
      case 'permission':
        return yes;
      case 'rapport':
        return true; // rapport is a single agent turn, then advance
      case 'purpose':
        // Never complete on bare "jee" — need real interest signal
        return !!memory.propertyType || !!memory.customerPurpose;
      case 'requirement_discovery':
        return !!memory.propertyType;
      case 'qualification':
        return !!memory.customerPurpose || memory.investmentPurpose === 'residence';
      case 'product_recommendation':
        return true;
      case 'budget_discussion':
        return !!memory.budget || /nahi|baad|later|share nahi/i.test(text);
      case 'payment_discussion':
        return !!memory.paymentPreference || yes;
      case 'objection_handling':
        return yes || /\b(theek|acha|ok|call|visit|whatsapp)\b/i.test(text);
      case 'appointment':
        return (
          !!memory.appointmentStatus ||
          /\b(sham|subah|morning|afternoon|weekend|theek)\b/i.test(text)
        );
      case 'follow_up':
        return /\b(sham|subah|kal|aaj|monday|sunday)\b/i.test(text) || yes;
      case 'closing':
        return true;
      default:
        return yes;
    }
  }

  private resolveNext(
    bundle: CachedCategoryKnowledge,
    current: ConversationStage,
    memory: StructuredMemory,
    done: Set<string>,
    skipped: string[],
  ): string {
    const candidates = current.nextPossibleStages?.length
      ? current.nextPossibleStages
      : this.nextByPriority(bundle, current.key);

    for (let candidate of candidates) {
      candidate = this.skipForward(bundle, candidate, memory, done, skipped);
      if (candidate) return candidate;
    }
    return 'closing';
  }

  private nextByPriority(bundle: CachedCategoryKnowledge, afterKey: string): string[] {
    const keys = this.orderedKeys(bundle);
    const idx = keys.indexOf(afterKey);
    if (idx < 0 || idx >= keys.length - 1) return ['closing'];
    return [keys[idx + 1]];
  }

  /** Skip stages when memory already satisfies skipRules / facts. */
  private skipForward(
    bundle: CachedCategoryKnowledge,
    key: string,
    memory: StructuredMemory,
    done: Set<string>,
    skipped: string[],
  ): string {
    let current = key;
    const guard = 0;
    for (let i = 0; i < 8; i++) {
      const stage = this.getStage(bundle, current);
      if (!stage) return current;

      if (this.shouldSkip(stage, memory)) {
        skipped.push(current);
        done.add(current);
        const nxt =
          stage.nextPossibleStages?.[0] ||
          this.nextByPriority(bundle, current)[0] ||
          'closing';
        current = nxt;
        continue;
      }
      return current;
    }
    return current || 'closing';
  }

  private shouldSkip(stage: ConversationStage, memory: StructuredMemory): boolean {
    const rules = stage.skipRules || [];
    for (const r of rules) {
      if (r === 'property_type_already_known' && memory.propertyType) return true;
      if (r === 'purpose_already_known' && memory.customerPurpose) return true;
      if (r === 'budget_already_known' && memory.budget) return true;
      if (r === 'payment_already_known' && memory.paymentPreference) return true;
    }
    // Extra safety: never re-visit discovery if already known
    if (stage.key === 'requirement_discovery' && memory.propertyType) return true;
    if (stage.key === 'qualification' && memory.customerPurpose) return true;
    if (stage.key === 'budget_discussion' && memory.budget) return true;
    if (stage.key === 'payment_discussion' && memory.paymentPreference) return true;
    return false;
  }
}
