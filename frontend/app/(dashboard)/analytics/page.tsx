'use client';

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MetricCard } from '@/components/analytics/MetricCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useAnalyticsOverview, useDailyAnalytics, useCategoryAnalytics, useConversionRate,
} from '@/hooks/useAnalytics';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6'];

export default function AnalyticsPage() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: overview, isLoading: ovLoading } = useAnalyticsOverview();
  const { data: daily, isLoading: dailyLoading } = useDailyAnalytics(startDate, endDate);
  const { data: byCategory, isLoading: catLoading } = useCategoryAnalytics();
  const { data: funnel, isLoading: funnelLoading } = useConversionRate();

  const pieData = overview
    ? [
        { name: 'Interested', value: overview.interested },
        { name: 'Not Interested', value: overview.notInterested },
        { name: 'Callbacks', value: overview.callbacks },
        { name: 'Voicemail', value: overview.voicemails },
        { name: 'Failed', value: overview.failed },
      ].filter((d) => d.value > 0)
    : [];

  const convTrend = daily?.map((d) => ({
    date: d._id,
    rate: d.total > 0 ? Math.round((d.interested / d.total) * 100) : 0,
  }));

  return (
    <ErrorBoundary>
      <PageHeader title="Analytics" description="Performance insights and conversion metrics" />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="category">By Category</TabsTrigger>
          <TabsTrigger value="funnel">Conversion Funnel</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Total Leads" value={overview?.totalLeads ?? '—'} loading={ovLoading} />
            <MetricCard title="Total Called" value={overview?.totalCalled ?? '—'} loading={ovLoading} />
            <MetricCard title="Interested" value={overview?.interested ?? '—'} loading={ovLoading} />
            <MetricCard title="Conversion Rate" value={overview ? `${overview.conversionRate}%` : '—'} loading={ovLoading} />
          </div>

          <div className="flex gap-4">
            <div><Label>Start</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div><Label>End</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Daily Call Volume</CardTitle></CardHeader>
              <CardContent className="h-72">
                {dailyLoading ? <Skeleton className="h-full" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="total" fill="#3b82f6" name="Called" />
                      <Bar dataKey="interested" fill="#22c55e" name="Interested" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Outcome Distribution</CardTitle></CardHeader>
              <CardContent className="h-72">
                {ovLoading ? <Skeleton className="h-full" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={90} label>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Conversion Rate Trend</CardTitle></CardHeader>
            <CardContent className="h-64">
              {dailyLoading ? <Skeleton className="h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={convTrend || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis unit="%" />
                    <Tooltip />
                    <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} name="Conv. Rate %" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category" className="space-y-6">
          {catLoading ? <Skeleton className="h-64" /> : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Called</TableHead>
                    <TableHead>Interested</TableHead>
                    <TableHead>Not Interested</TableHead>
                    <TableHead>Callbacks</TableHead>
                    <TableHead>Conv. Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCategory?.map((row) => (
                    <TableRow key={row.categoryId}>
                      <TableCell>{row.categoryName || '—'}</TableCell>
                      <TableCell>{row.total}</TableCell>
                      <TableCell>{row.called}</TableCell>
                      <TableCell>{row.interested}</TableCell>
                      <TableCell>{row.notInterested}</TableCell>
                      <TableCell>{row.callbacks}</TableCell>
                      <TableCell>{row.called ? `${Math.round((row.interested / row.called) * 100)}%` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Card>
                <CardContent className="h-72 pt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCategory || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="categoryName" />
                      <YAxis unit="%" />
                      <Tooltip />
                      <Bar dataKey="interested" fill="#22c55e" name="Interested" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="funnel">
          {funnelLoading ? <Skeleton className="h-48" /> : funnel && (
            <div className="grid gap-4 md:grid-cols-5">
              {[
                { label: 'Leads Uploaded', value: funnel.total },
                { label: 'Called', value: funnel.called, rate: funnel.calledRate },
                { label: 'Interested', value: funnel.interested, rate: funnel.interestRate },
                { label: 'Callback Scheduled', value: funnel.scheduled, rate: funnel.scheduleRate },
              ].map((step, i) => (
                <Card key={i}>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold">{step.value}</p>
                    <p className="text-sm text-muted-foreground">{step.label}</p>
                    {step.rate !== undefined && (
                      <p className="mt-1 text-xs text-green-600">{step.rate.toFixed(1)}%</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ErrorBoundary>
  );
}
