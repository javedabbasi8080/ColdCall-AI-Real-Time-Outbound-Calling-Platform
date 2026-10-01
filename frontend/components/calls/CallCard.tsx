'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { categoryColor, cn, formatCurrency, formatDuration } from '@/lib/utils';
import { useCallTranscript } from '@/hooks/useCalls';
import type { CallSession, Category, Lead } from '@/types';

interface CallCardProps {
  call: CallSession;
  onViewTranscript: (id: string) => void;
}

export function CallCard({ call, onViewTranscript }: CallCardProps) {
  const lead = call.leadId as Lead;
  const category = call.categoryId as Category;
  const { data: turns } = useCallTranscript(call._id);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(call.startedAt).getTime();
    if (Number.isNaN(start)) return;
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.startedAt]);

  const systemTurns = turns?.filter((t) => t.role === 'system') || [];
  const leadTurns = turns?.filter((t) => t.role === 'lead') || [];
  const lastSystem = systemTurns[systemTurns.length - 1];
  const lastLead = leadTurns[leadTurns.length - 1];
  const totalSteps = category?.script?.length || 5;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{lead?.name || 'Unknown'}</CardTitle>
            <p className="text-sm text-muted-foreground">{lead?.company}</p>
          </div>
          <Badge className={cn('text-white', categoryColor(category?.name || ''))}>
            {category?.name || '—'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{lead?.phone}</p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-lg">{formatDuration(elapsed)}</span>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              Step {call.currentStep + 1} of {totalSteps}
            </p>
            {call.usage ? (
              <span className="text-sm font-medium">{formatCurrency(call.usage.totalUsd)}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Cost updating...</span>
            )}
          </div>
        </div>
        <div className="rounded-md bg-violet-50 p-2 dark:bg-violet-950/30">
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400">AI</p>
          <p className="line-clamp-2">{lastSystem?.message || 'Starting call...'}</p>
        </div>
        {lastLead && (
          <div className="rounded-md bg-muted p-2">
            <p className="text-xs font-medium">Lead</p>
            <p className="line-clamp-2">{lastLead.message}</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-xs capitalize text-green-600">in progress</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {call.startedAt && !Number.isNaN(new Date(call.startedAt).getTime())
              ? formatDistanceToNow(new Date(call.startedAt), { addSuffix: true })
              : '—'}
          </span>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => onViewTranscript(call._id)}>
          View Full Transcript
        </Button>
      </CardContent>
    </Card>
  );
}
