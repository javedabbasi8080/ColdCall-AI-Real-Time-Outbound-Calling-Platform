export interface CallUsageMetrics {
  openaiPromptTokens: number;
  openaiCompletionTokens: number;
  openaiTotalTokens: number;
  elevenLabsCharacters: number;
  twilioDurationSeconds: number;
}

export interface CallUsageCosts {
  openaiUsd: number;
  elevenLabsUsd: number;
  twilioUsd: number;
  totalUsd: number;
}

export interface CallUsageSummary extends CallUsageMetrics, CallUsageCosts {}

export interface CostRateConfig {
  twilioPerMinuteUsd: number;
  elevenLabsPer1kCharsUsd: number;
  openaiInputPer1mTokensUsd: number;
  openaiOutputPer1mTokensUsd: number;
}

export const DEFAULT_COST_RATES: CostRateConfig = {
  twilioPerMinuteUsd: 0.014,
  elevenLabsPer1kCharsUsd: 0.18,
  openaiInputPer1mTokensUsd: 2.5,
  openaiOutputPer1mTokensUsd: 10,
};

export function parseCostRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function calculateCallUsageCosts(
  metrics: CallUsageMetrics,
  rates: CostRateConfig = DEFAULT_COST_RATES,
): CallUsageCosts {
  const openaiUsd =
    (metrics.openaiPromptTokens / 1_000_000) * rates.openaiInputPer1mTokensUsd +
    (metrics.openaiCompletionTokens / 1_000_000) * rates.openaiOutputPer1mTokensUsd;

  const elevenLabsUsd = (metrics.elevenLabsCharacters / 1000) * rates.elevenLabsPer1kCharsUsd;
  const twilioUsd = (metrics.twilioDurationSeconds / 60) * rates.twilioPerMinuteUsd;

  const round = (n: number) => Math.round(n * 10000) / 10000;

  return {
    openaiUsd: round(openaiUsd),
    elevenLabsUsd: round(elevenLabsUsd),
    twilioUsd: round(twilioUsd),
    totalUsd: round(openaiUsd + elevenLabsUsd + twilioUsd),
  };
}

export function buildCallUsageSummary(
  metrics: CallUsageMetrics,
  rates?: CostRateConfig,
): CallUsageSummary {
  const costs = calculateCallUsageCosts(metrics, rates);
  return { ...metrics, ...costs };
}
