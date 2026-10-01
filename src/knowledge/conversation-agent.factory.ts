import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { SettingsService } from '../settings/settings.service';
import { ConversationAgent, ConversationAgentConfig } from './conversation-agent';
import { KnowledgeCacheService } from './knowledge-cache.service';
import { LiveSearchService } from './live-search.service';
import { MemoryEngineService } from './memory-engine.service';
import { PromptBuilderService } from './prompt-builder.service';
import { StageEngineService } from './stage-engine.service';

@Injectable()
export class ConversationAgentFactory implements OnModuleInit {
  private readonly logger = new Logger(ConversationAgentFactory.name);
  private openai: OpenAI | null = null;
  private model = 'gpt-4o-mini';

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly knowledge: KnowledgeCacheService,
    private readonly stages: StageEngineService,
    private readonly memory: MemoryEngineService,
    private readonly prompts: PromptBuilderService,
    private readonly liveSearch: LiveSearchService,
  ) {}

  async onModuleInit() {
    const key =
      (await this.settings.get('OPENAI_API_KEY').catch(() => '')) ||
      process.env.OPENAI_API_KEY ||
      '';
    this.model =
      (await this.settings.get('OPENAI_MODEL').catch(() => '')) ||
      process.env.OPENAI_MODEL ||
      'gpt-4o-mini';
    if (key) {
      this.openai = new OpenAI({ apiKey: key });
      this.logger.log('ConversationAgentFactory OpenAI ready');
    }
  }

  private async ensureOpenAi() {
    if (this.openai) return this.openai;
    const key =
      (await this.settings.get('OPENAI_API_KEY').catch(() => '')) ||
      process.env.OPENAI_API_KEY ||
      '';
    if (!key) throw new Error('OPENAI_API_KEY missing');
    this.openai = new OpenAI({ apiKey: key });
    return this.openai;
  }

  async create(
    partial: Omit<ConversationAgentConfig, 'openai' | 'model'>,
  ): Promise<ConversationAgent> {
    const openai = await this.ensureOpenAi();
    const agent = new ConversationAgent(
      { ...partial, openai, model: this.model },
      this.knowledge,
      this.stages,
      this.memory,
      this.prompts,
      this.liveSearch,
    );
    await agent.init();
    return agent;
  }

  /** Sync greeting from cached knowledge (preload path). */
  async pickGreeting(opts: {
    categoryId: string;
    leadName?: string;
    callSid: string;
  }): Promise<string> {
    const agent = await this.create({
      categoryId: opts.categoryId,
      callSid: `preload-${opts.callSid}`,
      leadName: opts.leadName,
    });
    return agent.getGreeting();
  }
}
