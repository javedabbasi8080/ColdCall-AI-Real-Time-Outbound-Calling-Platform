'use client';

import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { Phone, TrendingUp, Users, ThumbsUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MetricCard } from '@/components/analytics/MetricCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAnalyticsOverview, useDailyAnalytics } from '@/hooks/useAnalytics';
import { useCalls } from '@/hooks/useCalls';
import { formatDuration } from '@/lib/utils';
import type { CallSession, Category, Lead } from '@/types';

const COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#6b7280'];

export default function DashboardPage() {
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    return {
      startDate: format(subDays(end, 7), 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    };
  }, []);

  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview();
  const { data: daily, isLoading: dailyLoading } = useDailyAnalytics(startDate, endDate);
  const recentCallParams = useMemo(() => ({ limit: 10, page: 1 }), []);
  const { data: recentCalls, isLoading: callsLoading } = useCalls(recentCallParams);

  const pieData = overview
    ? [
        { name: 'Interested', value: overview.interested },
        { name: 'Not Interested', value: overview.notInterested },
        { name: 'Callbacks', value: overview.callbacks },
        { name: 'Voicemail', value: overview.voicemails },
        { name: 'Failed', value: overview.failed },
      ].filter((d) => d.value > 0)
    : [];

  const todayCalls = daily?.find((d) => d._id === endDate)?.total || 0;
  const todayInterested = daily?.find((d) => d._id === endDate)?.interested || 0;

  return (
    <ErrorBoundary>
      <PageHeader title="Dashboard" description="Overview of your cold calling operations" />

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Leads" value={overview?.totalLeads ?? '—'} icon={Users} loading={overviewLoading} />
        <MetricCard title="Calls Today" value={todayCalls} icon={Phone} loading={dailyLoading} />
        <MetricCard title="Interested Today" value={todayInterested} icon={ThumbsUp} loading={dailyLoading} />
        <MetricCard
          title="Conversion Rate"
          value={overview ? `${overview.conversionRate}%` : '—'}
          icon={TrendingUp}
          loading={overviewLoading}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Call Volume (7 days)</CardTitle></CardHeader>
          <CardContent className="h-64">
            {dailyLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="_id" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} name="Calls" />
                  <Line type="monotone" dataKey="interested" stroke="#22c55e" strokeWidth={2} name="Interested" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Outcome Breakdown</CardTitle></CardHeader>
          <CardContent className="h-64">
            {overviewLoading ? (
              <Skeleton className="h-full w-full" />
            ) : pieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Calls</CardTitle></CardHeader>
        <CardContent>
          {callsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCalls?.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">No calls yet</TableCell>
                  </TableRow>
                )}
                {recentCalls?.data?.map((call: CallSession) => {
                  const lead = call.leadId as Lead;
                  const category = call.categoryId as Category;
                  return (
                    <TableRow key={call._id}>
                      <TableCell>{lead?.name || '—'}</TableCell>
                      <TableCell>{lead?.phone || '—'}</TableCell>
                      <TableCell>{category?.name || '—'}</TableCell>
                      <TableCell className="capitalize">{call.outcome?.replace(/_/g, ' ') || call.status}</TableCell>
                      <TableCell>{formatDuration(call.durationSeconds)}</TableCell>
                      <TableCell>{format(new Date(call.startedAt), 'MMM d, HH:mm')}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </ErrorBoundary>
  );
}
