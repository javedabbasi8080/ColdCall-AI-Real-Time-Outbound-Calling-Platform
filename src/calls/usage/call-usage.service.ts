import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import {
  buildCallUsageSummary,
  CallUsageMetrics,
  CallUsageSummary,
  DEFAULT_COST_RATES,
  parseCostRate,
} from './call-usage.util';

@Injectable()
export class CallUsageService {
  constructor(private readonly settingsService: SettingsService) {}

  async getCostRates() {
    const [twilio, elevenLabs, openaiIn, openaiOut] = await Promise.all([
      this.settingsService.get('COST_TWILIO_PER_MINUTE_USD'),
      this.settingsService.get('COST_ELEVENLABS_PER_1K_CHARS_USD'),
      this.settingsService.get('COST_OPENAI_INPUT_PER_1M_TOKENS_USD'),
      this.settingsService.get('COST_OPENAI_OUTPUT_PER_1M_TOKENS_USD'),
    ]);

    return {
      twilioPerMinuteUsd: parseCostRate(twilio, DEFAULT_COST_RATES.twilioPerMinuteUsd),
      elevenLabsPer1kCharsUsd: parseCostRate(elevenLabs, DEFAULT_COST_RATES.elevenLabsPer1kCharsUsd),
      openaiInputPer1mTokensUsd: parseCostRate(openaiIn, DEFAULT_COST_RATES.openaiInputPer1mTokensUsd),
      openaiOutputPer1mTokensUsd: parseCostRate(openaiOut, DEFAULT_COST_RATES.openaiOutputPer1mTokensUsd),
    };
  }

  async buildSummary(input: {
    openaiPromptTokens?: number;
    openaiCompletionTokens?: number;
    elevenLabsCharacters?: number;
    twilioDurationSeconds?: number;
  }): Promise<CallUsageSummary> {
    const metrics: CallUsageMetrics = {
      openaiPromptTokens: input.openaiPromptTokens ?? 0,
      openaiCompletionTokens: input.openaiCompletionTokens ?? 0,
      openaiTotalTokens:
        (input.openaiPromptTokens ?? 0) + (input.openaiCompletionTokens ?? 0),
      elevenLabsCharacters: input.elevenLabsCharacters ?? 0,
      twilioDurationSeconds: input.twilioDurationSeconds ?? 0,
    };

    const rates = await this.getCostRates();
    return buildCallUsageSummary(metrics, rates);
  }
}
