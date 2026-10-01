import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CachedCategoryKnowledge } from './knowledge-cache.service';

export type LiveSearchHit = {
  source: 'business_db' | 'web';
  summary: string;
};

/**
 * Live data for phone replies:
 * 1) Business DB knowledge (fast, preferred)
 * 2) Optional OpenAI hosted web_search (Responses API)
 */
@Injectable()
export class LiveSearchService {
  private readonly logger = new Logger(LiveSearchService.name);
  private openai: OpenAI | null = null;
  private readonly cache = new Map<string, { at: number; text: string }>();
  private readonly CACHE_MS = 5 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  isWebSearchEnabled(): boolean {
    const flag = (
      this.config.get<string>('LIVE_WEB_SEARCH') ||
      process.env.LIVE_WEB_SEARCH ||
      'true'
    ).toLowerCase();
    return flag !== 'false' && flag !== '0' && flag !== 'off';
  }

  private ensureOpenAi(client?: OpenAI): OpenAI | null {
    if (client) {
      this.openai = client;
      return client;
    }
    if (this.openai) return this.openai;
    const key = process.env.OPENAI_API_KEY || '';
    if (!key) return null;
    this.openai = new OpenAI({ apiKey: key });
    return this.openai;
  }

  /** Local inventory / project facts — paraphrase-ready, never FAQ dump. */
  lookupBusiness(bundle: CachedCategoryKnowledge, query: string): LiveSearchHit {
    const q = (query || '').toLowerCase();
    const k = bundle.knowledge;
    const bits: string[] = [];

    bits.push(
      `Business: ${k.businessName || bundle.categoryName}; Project: ${k.projectName || ''}; Location: ${k.locationLabel || k.city || ''}`,
    );

    if (k.availableSizes?.length) {
      bits.push(`Available sizes: ${k.availableSizes.join(', ')}`);
    }
    if (k.propertyTypes?.length) {
      bits.push(`Property types: ${k.propertyTypes.join(', ')}`);
    }
    if (k.paymentPlans?.length) {
      bits.push(`Payment: ${k.paymentPlans.join(', ')}`);
    }
    if (k.features?.length) {
      bits.push(`Features: ${k.features.slice(0, 5).join(', ')}`);
    }

    for (const p of bundle.products.slice(0, 8)) {
      const hay = `${p.name} ${p.description || ''} ${(p.features || []).join(' ')}`.toLowerCase();
      if (!q || hay.includes(q.split(/\s+/)[0] || '') || /plot|villa|size|price|payment|visit/.test(q)) {
        bits.push(
          `Product ${p.name}: ${(p.description || '').slice(0, 120)}; sizes=${(p.availableSizes || []).slice(0, 4).join(', ')}; payment=${p.paymentPlan || ''}`,
        );
      }
    }

    // FAQ answers as fact snippets only (not Q→A script)
    for (const f of bundle.faqs.slice(0, 6)) {
      const hay = `${f.question} ${f.answer} ${(f.keywords || []).join(' ')}`.toLowerCase();
      if (q.split(/\s+/).some((w) => w.length > 3 && hay.includes(w))) {
        bits.push(`Fact: ${(f.answer || '').slice(0, 160)}`);
      }
    }

    const summary = bits.slice(0, 10).join('\n');
    return { source: 'business_db', summary: summary || 'No matching business facts.' };
  }

  /**
   * OpenAI Responses API hosted web_search — public facts only.
   * Fails soft if account/model does not support the tool.
   */
  async webSearch(query: string, openai: OpenAI, model: string): Promise<LiveSearchHit> {
    if (!this.isWebSearchEnabled()) {
      return { source: 'web', summary: 'Web search disabled.' };
    }

    const key = `web:${query.trim().toLowerCase().slice(0, 120)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.CACHE_MS) {
      return { source: 'web', summary: hit.text };
    }

    const client = this.ensureOpenAi(openai);
    if (!client) {
      return { source: 'web', summary: 'Web search unavailable (no API key).' };
    }

    const safeQuery = (query || '').trim().slice(0, 200);
    if (!safeQuery) {
      return { source: 'web', summary: 'Empty query.' };
    }

    try {
      this.logger.log(`LIVE_WEB_SEARCH q="${safeQuery.slice(0, 80)}"`);
      const response = await (client.responses.create as Function)({
        model: model || 'gpt-4o-mini',
        tools: [{ type: 'web_search' }],
        max_tool_calls: 1,
        temperature: 0.2,
        max_output_tokens: 280,
        input: [
          {
            role: 'system',
            content:
              'You assist a Pakistani phone sales consultant. Return 3-5 short factual bullets only. No marketing fluff. Prefer Pakistan / Karachi / DHA City context when relevant. If unsure, say facts are unclear.',
          },
          {
            role: 'user',
            content: safeQuery,
          },
        ],
      });

      const text =
        (response as { output_text?: string }).output_text?.trim() ||
        this.extractOutputText(response) ||
        'No web results.';

      const clipped = text.slice(0, 900);
      this.cache.set(key, { at: Date.now(), text: clipped });
      return { source: 'web', summary: clipped };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`LIVE_WEB_SEARCH failed: ${msg.slice(0, 200)}`);
      return {
        source: 'web',
        summary: `Web search failed (${msg.slice(0, 80)}). Use business knowledge only.`,
      };
    }
  }

  private extractOutputText(response: unknown): string {
    const r = response as {
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    };
    const parts: string[] = [];
    for (const item of r.output || []) {
      for (const c of item.content || []) {
        if (c.text) parts.push(c.text);
      }
    }
    return parts.join('\n').trim();
  }

  /** Tool schemas for GPT function calling on live calls. */
  toolDefinitions(webEnabled: boolean): OpenAI.Chat.ChatCompletionTool[] {
    const tools: OpenAI.Chat.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'lookup_business_knowledge',
          description:
            'Search our company database for project, inventory, sizes, payment, location facts. ALWAYS try this before web search for product questions.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'What to look up, e.g. villa sizes, plot availability, location',
              },
            },
            required: ['query'],
          },
        },
      },
    ];
    if (webEnabled) {
      tools.push({
        type: 'function',
        function: {
          name: 'live_web_search',
          description:
            'Live public web search for general market/location context NOT in our DB. Do NOT use for our private prices or inventory — use lookup_business_knowledge. Max one search.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Short web search query',
              },
            },
            required: ['query'],
          },
        },
      });
    }
    return tools;
  }

  async runTool(
    name: string,
    argsJson: string,
    bundle: CachedCategoryKnowledge,
    openai: OpenAI,
    model: string,
  ): Promise<string> {
    let args: { query?: string } = {};
    try {
      args = JSON.parse(argsJson || '{}') as { query?: string };
    } catch {
      args = { query: argsJson };
    }
    const query = (args.query || '').trim() || 'project overview';

    if (name === 'lookup_business_knowledge') {
      return this.lookupBusiness(bundle, query).summary;
    }
    if (name === 'live_web_search') {
      return (await this.webSearch(query, openai, model)).summary;
    }
    return `Unknown tool: ${name}`;
  }
}
