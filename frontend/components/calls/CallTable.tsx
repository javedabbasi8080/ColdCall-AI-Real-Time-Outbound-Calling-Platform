'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCalls, useStartCall } from '@/hooks/useCalls';
import { useCategories } from '@/hooks/useCategories';
import { useUpdateLeadStatus } from '@/hooks/useLeads';
import { formatDuration, formatCurrency } from '@/lib/utils';
import type { CallSession, Category, Lead } from '@/types';

interface CallTableProps {
  onViewTranscript: (id: string) => void;
  leadIdFilter?: string;
}

export function CallTable({ onViewTranscript, leadIdFilter }: CallTableProps) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [outcome, setOutcome] = useState('');

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, limit };
    if (search) p.search = search;
    if (categoryId) p.categoryId = categoryId;
    if (outcome) p.outcome = outcome;
    if (leadIdFilter) p.leadId = leadIdFilter;
    return p;
  }, [page, limit, search, categoryId, outcome, leadIdFilter]);

  const { data, isLoading } = useCalls(params);
  const { data: categories } = useCategories();
  const startCall = useStartCall();
  const updateStatus = useUpdateLeadStatus();

  const handleRequeue = async (call: CallSession) => {
    const lead = call.leadId as Lead;
    const leadId = typeof lead === 'string' ? lead : lead._id;
    try {
      await updateStatus.mutateAsync({ id: leadId, status: 'pending' });
      await startCall.mutateAsync(leadId);
      toast.success('Lead re-queued');
    } catch {
      toast.error('Failed to re-queue');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name or phone..."
          className="max-w-xs"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Select value={categoryId || 'all'} onValueChange={(v) => { setCategoryId(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={outcome || 'all'} onValueChange={(v) => { setOutcome(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Outcome" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            {['interested', 'not_interested', 'callback', 'voicemail', 'hung_up', 'no_answer'].map((o) => (
              <SelectItem key={o} value={o}>{o.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">No calls found</TableCell>
              </TableRow>
            )}
            {data?.data?.map((call) => {
              const lead = call.leadId as Lead;
              const category = call.categoryId as Category;
              return (
                <TableRow key={call._id}>
                  <TableCell>{lead?.name || '—'}</TableCell>
                  <TableCell>{lead?.company || '—'}</TableCell>
                  <TableCell>{category?.name || '—'}</TableCell>
                  <TableCell>{lead?.phone || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {call.outcome?.replace(/_/g, ' ') || call.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDuration(call.durationSeconds)}</TableCell>
                  <TableCell>{call.usage ? formatCurrency(call.usage.totalUsd) : '—'}</TableCell>
                  <TableCell>{format(new Date(call.startedAt), 'MMM d, yyyy HH:mm')}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onViewTranscript(call._id)}>
                          View Transcript
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRequeue(call)}>
                          Re-queue Lead
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center justify-between">
        <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[10, 25, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="flex items-center px-2 text-sm">Page {page} of {data?.meta?.totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= (data?.meta?.totalPages || 1)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
