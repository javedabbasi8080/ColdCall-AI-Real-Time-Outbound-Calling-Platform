'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CsvUploader } from '@/components/leads/CsvUploader';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeadBatches } from '@/hooks/useLeads';
import type { Category, CsvBatch } from '@/types';

export default function UploadLeadsPage() {
  const { data: batches, isLoading, refetch } = useLeadBatches();

  return (
    <ErrorBoundary>
      <PageHeader title="Upload CSV" description="Import leads from a CSV file" />
      <div className="grid gap-6 lg:grid-cols-2">
        <CsvUploader onUploaded={() => refetch()} />
        <Card>
          <CardHeader><CardTitle>Recent Batches</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
            {!isLoading && batches?.length === 0 && (
              <p className="text-sm text-muted-foreground">No uploads yet</p>
            )}
            {batches?.map((batch: CsvBatch) => {
              const cat = batch.categoryId as Category;
              return (
                <Link
                  key={batch._id}
                  href={`/leads?batchId=${batch._id}`}
                  className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <p className="font-medium">{batch.fileName}</p>
                  <p className="text-sm text-muted-foreground">
                    {typeof cat === 'object' ? cat.name : '—'} · {batch.validLeads}/{batch.totalLeads} valid
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(batch.uploadedAt), 'MMM d, yyyy HH:mm')}
                  </p>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
}
