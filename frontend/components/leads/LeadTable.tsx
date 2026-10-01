'use client';

import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import Link from 'next/link';
import { Loader2, MoreHorizontal, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCategories } from '@/hooks/useCategories';
import { useStartCall } from '@/hooks/useCalls';
import { useLeads, useUpdateLeadStatus, useDeleteLead } from '@/hooks/useLeads';
import type { Category, Lead, LeadStatus } from '@/types';

interface LeadTableProps {
  batchFilter?: string;
}

export function LeadTable({ batchFilter }: LeadTableProps) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [callbackLead, setCallbackLead] = useState<Lead | null>(null);
  const [callbackAt, setCallbackAt] = useState('');

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, limit };
    if (category) p.category = category;
    if (status) p.status = status;
    if (batchFilter) p.batch = batchFilter;
    return p;
  }, [page, limit, category, status, batchFilter]);

  const { data, isLoading } = useLeads(params);
  const { data: categories } = useCategories();
  const updateStatus = useUpdateLeadStatus();
  const deleteLead = useDeleteLead();
  const startCall = useStartCall();
  const [callingId, setCallingId] = useState<string | null>(null);

  const canCallLead = (lead: Lead) =>
    lead.status !== 'do_not_call' && lead.status !== 'not_interested';

  const handleCallNow = async (lead: Lead) => {
    if (!canCallLead(lead)) {
      toast.error('This lead cannot be called');
      return;
    }
    setCallingId(lead._id);
    try {
      await startCall.mutateAsync(lead._id);
      toast.success(`Calling ${lead.name}...`, {
        description: 'View progress on Live Calls',
        action: { label: 'Open', onClick: () => window.open('/calls/live', '_self') },
      });
    } catch (err) {
      const message = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message || 'Failed to start call'
        : 'Failed to start call';
      toast.error(message);
    } finally {
      setCallingId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search || !data?.data) return data?.data || [];
    const s = search.toLowerCase();
    return data.data.filter(
      (l) =>
        l.name.toLowerCase().includes(s) ||
        l.phone.includes(s) ||
        l.company.toLowerCase().includes(s),
    );
  }, [data, search]);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => l._id)));
  };

  const handleStatusChange = async (id: string, newStatus: LeadStatus) => {
    try {
      await updateStatus.mutateAsync({ id, status: newStatus });
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleBulkRequeue = async () => {
    for (const id of Array.from(selected)) {
      await updateStatus.mutateAsync({ id, status: 'pending' });
    }
    toast.success(`${selected.size} leads re-queued`);
    setSelected(new Set());
  };

  const handleCallback = async () => {
    if (!callbackLead || !callbackAt) return;
    try {
      await updateStatus.mutateAsync({
        id: callbackLead._id,
        status: 'callback',
        notes: `Callback scheduled for ${callbackAt}`,
      });
      toast.success('Callback scheduled');
      setCallbackLead(null);
    } catch {
      toast.error('Failed to schedule callback');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search..." className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={category || 'all'} onValueChange={(v) => setCategory(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {categories?.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(['pending', 'called', 'interested', 'not_interested', 'callback', 'voicemail', 'failed', 'do_not_call'] as LeadStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <Button variant="outline" size="sm" onClick={handleBulkRequeue}>
            Re-queue {selected.size} selected
          </Button>
        )}
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Last Called</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No leads found</TableCell></TableRow>
            )}
            {filtered.map((lead) => {
              const cat = lead.category as Category;
              return (
                <TableRow key={lead._id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(lead._id)}
                      onCheckedChange={(c) => {
                        const next = new Set(selected);
                        if (c) next.add(lead._id); else next.delete(lead._id);
                        setSelected(next);
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>{lead.company || '—'}</TableCell>
                  <TableCell>{lead.phone}</TableCell>
                  <TableCell>{typeof cat === 'object' ? cat.name : '—'}</TableCell>
                  <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                  <TableCell>{lead.callAttempts}</TableCell>
                  <TableCell>{lead.lastCalledAt ? format(new Date(lead.lastCalledAt), 'MMM d, HH:mm') : '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        title="Call now"
                        disabled={!canCallLead(lead) || callingId === lead._id}
                        onClick={() => handleCallNow(lead)}
                      >
                        {callingId === lead._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Phone className="h-4 w-4" />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={!canCallLead(lead) || callingId === lead._id}
                            onClick={() => handleCallNow(lead)}
                          >
                            Call Now
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/calls/history?leadId=${lead._id}`}>View Call History</Link>
                          </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(lead._id, 'interested')}>Mark Interested</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setCallbackLead(lead)}>Schedule Callback</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(lead._id, 'do_not_call')}>Mark Do Not Call</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(lead._id)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="flex justify-between">
        <span className="text-sm text-muted-foreground">{data?.meta?.total || 0} total leads</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= (data?.meta?.totalPages || 1)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>This will soft-delete the lead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (deleteId) {
                await deleteLead.mutateAsync(deleteId);
                toast.success('Lead deleted');
                setDeleteId(null);
              }
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!callbackLead} onOpenChange={() => setCallbackLead(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Callback</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Lead: {callbackLead?.name}</p>
            <div className="space-y-2">
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} />
            </div>
            <Button onClick={handleCallback}>Schedule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
