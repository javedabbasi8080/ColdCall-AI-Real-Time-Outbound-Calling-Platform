'use client';

import { useState, useEffect } from 'react';
import { PhoneCall } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CallCard } from '@/components/calls/CallCard';
import { TranscriptDrawer } from '@/components/calls/TranscriptDrawer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCalls } from '@/hooks/useCalls';
import { useCallStore } from '@/stores/useCallStore';

export default function LiveCallsPage() {
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const { data, isLoading } = useCalls({ status: 'in_progress', limit: 50 }, 3000);
  const setActiveCalls = useCallStore((s) => s.setActiveCalls);

  useEffect(() => {
    if (data?.data) setActiveCalls(data.data);
  }, [data, setActiveCalls]);

  const count = data?.data?.length || 0;

  return (
    <ErrorBoundary>
      <PageHeader
        title="Live Calls"
        description="Real-time view of active outbound calls"
        action={
          <Badge variant="secondary" className="gap-2 px-3 py-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            {count} active
          </Badge>
        }
      />

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      )}

      {!isLoading && count === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-muted-foreground">
          <PhoneCall className="h-12 w-12" />
          <p>No active calls right now</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.data?.map((call) => (
          <CallCard key={call._id} call={call} onViewTranscript={setTranscriptId} />
        ))}
      </div>

      <TranscriptDrawer
        callId={transcriptId}
        open={!!transcriptId}
        onClose={() => setTranscriptId(null)}
      />
    </ErrorBoundary>
  );
}
