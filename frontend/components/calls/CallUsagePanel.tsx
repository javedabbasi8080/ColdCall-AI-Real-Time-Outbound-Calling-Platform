'use client';

import { formatCurrency, formatDuration } from '@/lib/utils';
import type { CallUsageSummary } from '@/types';

interface CallUsagePanelProps {
  usage?: CallUsageSummary;
  compact?: boolean;
}

export function CallUsagePanel({ usage, compact = false }: CallUsagePanelProps) {
  if (!usage) {
    return (
      <p className="text-sm text-muted-foreground">Usage data will appear after the call progresses.</p>
    );
  }

  if (compact) {
    return (
      <div className="text-sm">
        <span className="font-medium">{formatCurrency(usage.totalUsd)}</span>
        <span className="text-muted-foreground"> total</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Call Usage Cost</h4>
        <span className="text-lg font-semibold">{formatCurrency(usage.totalUsd)}</span>
      </div>
      <div className="grid gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">OpenAI</span>
          <span>
            {formatCurrency(usage.openaiUsd)}
            <span className="ml-2 text-xs text-muted-foreground">
              ({usage.openaiTotalTokens.toLocaleString()} tokens)
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">ElevenLabs</span>
          <span>
            {formatCurrency(usage.elevenLabsUsd)}
            <span className="ml-2 text-xs text-muted-foreground">
              ({usage.elevenLabsCharacters.toLocaleString()} chars)
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Twilio</span>
          <span>
            {formatCurrency(usage.twilioUsd)}
            <span className="ml-2 text-xs text-muted-foreground">
              ({formatDuration(usage.twilioDurationSeconds)})
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
