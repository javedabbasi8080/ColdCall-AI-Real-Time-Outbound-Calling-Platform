import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import OpenAI from 'openai';
import { CategoriesService } from '../categories/categories.service';
import { CategoryPlaybook } from '../categories/schemas/category.schema';
import { SettingsService } from '../settings/settings.service';
import { StreamingSalesAgent } from './realtime/streaming-sales-agent';
import { normalizeLeadTranscript } from './realtime/pk-phone-tts';

export interface ScriptEngineResult {
  intent: string;
  nextMessage: string;
  shouldEndCall: boolean;
  nextStep: number;
  scheduledCallback: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  usedFastPath?: boolean;
}

/**
 * Gather / HTTP webhook path — same dynamic knowledge brain as Media Streams.
 * Does NOT read script lines verbatim.
 */
@Injectable()
export class ScriptEngineService implements OnModuleInit {
  private readonly logger = new Logger(ScriptEngineService.name);
  private openai: OpenAI | null = null;
  private readonly agents = new Map<string, StreamingSalesAgent>();

  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit() {
    try {
      const apiKey = await this.settingsService.get('OPENAI_API_KEY');
      if (apiKey) {
        this.openai = new OpenAI({ apiKey });
        void this.openai.models.list().catch(() => undefined);
        this.logger.log('ScriptEngine OpenAI prewarmed (dynamic playbook mode)');
      }
    } catch (err) {
      this.logger.warn(`OpenAI prewarm: ${(err as Error).message}`);
    }
  }

  clearCallMemory(callKey: string) {
    this.agents.delete(callKey);
  }

  rememberSaid(_callKey: string, _line: string) {
    /* agent tracks its own history */
  }

  pickGreeting(opts: {
    categoryName: string;
    inbound: boolean;
    callKey: string;
    leadName?: string;
    playbook?: Partial<CategoryPlaybook>;
  }): string {
    const agent = this.getOrCreateAgent(opts.callKey, {
      categoryName: opts.categoryName,
      leadName: opts.leadName,
      inbound: opts.inbound,
      playbook: opts.playbook || {
        agentName: 'Ayesha',
        agentGender: 'female',
        businessName: opts.categoryName,
        language: 'urdu',
      },
    });
    return agent.getGreeting();
  }

  pickSoftContinue(categoryName: string, callKey: string): string {
    const agent = this.agents.get(callKey);
    const urdu = !categoryName || /real estate|property/i.test(categoryName);
    const line = urdu
      ? 'Jee, bataiye aapke zehen mein kya hai?'
      : 'Sure — what should we focus on?';
    agent?.rememberAgent(line);
    return line;
  }

  tryFastPath(
    categoryName: string,
    currentStep: number,
    leadResponse: string,
    _script: unknown[],
    callKey = 'anon',
  ): ScriptEngineResult | null {
    const agent = this.agents.get(callKey);
    if (!agent) return null;
    const normalized = normalizeLeadTranscript(leadResponse);
    agent.rememberUser(normalized);
    const local = agent.tryDynamicLocal(normalized);
    if (!local) return null;
    agent.rememberAgent(local.text);
    return {
      intent: local.intent,
      nextMessage: local.text,
      shouldEndCall: local.shouldEnd,
      nextStep: currentStep,
      scheduledCallback: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      usedFastPath: true,
    };
  }

  private getOrCreateAgent(
    callKey: string,
    ctx: {
      categoryName: string;
      leadName?: string;
      inbound: boolean;
      playbook: Partial<CategoryPlaybook>;
    },
  ): StreamingSalesAgent {
    let agent = this.agents.get(callKey);
    if (!agent) {
      if (!this.openai) {
        throw new Error('OpenAI not configured');
      }
      agent = new StreamingSalesAgent(this.openai, 'gpt-4o-mini', ctx);
      this.agents.set(callKey, agent);
    } else if (ctx.playbook?.businessName) {
      agent.updatePlaybook(ctx.playbook);
    }
    return agent;
  }

  async process(
    categoryId: string,
    currentStep: number,
    leadResponse: string,
    recentTurns: Array<{ role: string; message: string }> = [],
    categoryDoc?: {
      name: string;
      script?: unknown[];
      playbook?: Partial<CategoryPlaybook>;
    },
    callKey = 'anon',
    leadName?: string,
  ): Promise<ScriptEngineResult> {
    const category = categoryDoc || (await this.categoriesService.findById(categoryId));
    const playbook =
      (category as { playbook?: Partial<CategoryPlaybook> }).playbook ||
      ({
        businessName: category.name,
        agentName: 'Ayesha',
        agentGender: 'female',
        language: /roof/i.test(category.name) ? 'english' : 'urdu',
        products: [],
        qualificationTopics: ['plot_vs_villa', 'family_vs_investment', 'budget_range', 'preferred_area'],
        salesGoals: ['Qualify and soft close'],
      } as Partial<CategoryPlaybook>);

    if (!this.openai) {
      const apiKey = await this.settingsService.get('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OpenAI API key not configured');
      this.openai = new OpenAI({ apiKey });
    }

    const modelConfigured = (await this.settingsService.get('OPENAI_MODEL'))?.trim() || '';
    const model = modelConfigured.includes('mini') ? modelConfigured : 'gpt-4o-mini';

    const agent = this.getOrCreateAgent(callKey, {
      categoryName: category.name,
      leadName,
      inbound: false,
      playbook,
    });

    agent.hydrateFromTurns(recentTurns);

    const normalized = normalizeLeadTranscript(leadResponse);
    let spoken = '';
    const result = await agent.replyStreaming(normalized, async (sentence) => {
      spoken = spoken ? `${spoken} ${sentence}` : sentence;
    });

    this.logger.log(
      `DYNAMIC_REPLY category=${category.name} end=${result.shouldEnd} slots=${JSON.stringify(agent.getSlots())}`,
    );

    return {
      intent: result.shouldEnd ? 'interested' : 'rapport',
      nextMessage: result.text || spoken,
      shouldEndCall: result.shouldEnd,
      nextStep: currentStep,
      scheduledCallback: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      usedFastPath: false,
    };
  }
}
