'use client';

import { format } from 'date-fns';
import { Play } from 'lucide-react';
import { CallUsagePanel } from '@/components/calls/CallUsagePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useCall, useCallTranscript } from '@/hooks/useCalls';
import type { Lead } from '@/types';

interface TranscriptDrawerProps {
  callId: string | null;
  open: boolean;
  onClose: () => void;
}

export function TranscriptDrawer({ callId, open, onClose }: TranscriptDrawerProps) {
  const { data: callData, isLoading: callLoading } = useCall(callId);
  const { data: turns, isLoading: turnsLoading } = useCallTranscript(callId);

  const lead = callData?.session?.leadId as Lead | undefined;
  const isLoading = callLoading || turnsLoading;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {lead?.name || 'Call Transcript'}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <CallUsagePanel usage={callData?.session?.usage} />
          {isLoading && Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
          {!isLoading && turns?.length === 0 && (
            <p className="text-center text-muted-foreground">No conversation turns yet</p>
          )}
          {turns?.map((turn) => (
            <div
              key={turn._id}
              className={`rounded-lg border p-3 ${turn.role === 'system' ? 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30' : 'bg-muted/50'}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <Badge variant={turn.role === 'system' ? 'default' : 'secondary'}>
                  {turn.role === 'system' ? 'AI' : 'Lead'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {turn.timestamp && !Number.isNaN(new Date(turn.timestamp).getTime())
                    ? format(new Date(turn.timestamp), 'HH:mm:ss')
                    : '—'}
                </span>
              </div>
              <p className="text-sm">{turn.message}</p>
              {turn.detectedIntent && (
                <Badge variant="outline" className="mt-2 capitalize">
                  {turn.detectedIntent}
                </Badge>
              )}
              {turn.audioUrl && (
                <Button variant="ghost" size="sm" className="mt-2" asChild>
                  <a href={turn.audioUrl} target="_blank" rel="noreferrer">
                    <Play className="mr-1 h-3 w-3" /> Play audio
                  </a>
                </Button>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
