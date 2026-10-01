'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CallTable } from '@/components/calls/CallTable';
import { TranscriptDrawer } from '@/components/calls/TranscriptDrawer';
import { PageHeader } from '@/components/layout/PageHeader';

function CallHistoryContent() {
  const searchParams = useSearchParams();
  const leadId = searchParams.get('leadId') || undefined;
  const [transcriptId, setTranscriptId] = useState<string | null>(null);

  return (
    <>
      <CallTable onViewTranscript={setTranscriptId} leadIdFilter={leadId} />
      <TranscriptDrawer callId={transcriptId} open={!!transcriptId} onClose={() => setTranscriptId(null)} />
    </>
  );
}

export default function CallHistoryPage() {
  return (
    <ErrorBoundary>
      <PageHeader title="Call History" description="Browse and manage past call sessions" />
      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <CallHistoryContent />
      </Suspense>
    </ErrorBoundary>
  );
}
