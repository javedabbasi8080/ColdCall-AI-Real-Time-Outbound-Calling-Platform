'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LeadTable } from '@/components/leads/LeadTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function LeadsContent() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get('batchId') || undefined;
  return <LeadTable batchFilter={batchId} />;
}

export default function LeadsPage() {
  return (
    <ErrorBoundary>
      <PageHeader
        title="All Leads"
        description="Manage your lead database"
        action={
          <Button asChild>
            <Link href="/leads/upload">Upload CSV</Link>
          </Button>
        }
      />
      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <LeadsContent />
      </Suspense>
    </ErrorBoundary>
  );
}
