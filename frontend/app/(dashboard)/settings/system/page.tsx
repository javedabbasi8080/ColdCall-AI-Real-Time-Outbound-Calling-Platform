'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings, useUpsertSetting } from '@/hooks/useSettings';

export default function SystemSettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const upsert = useUpsertSetting();

  const [maxCalls, setMaxCalls] = useState('5');
  const [hoursStart, setHoursStart] = useState('09:00');
  const [hoursEnd, setHoursEnd] = useState('17:00');
  const [twilioRate, setTwilioRate] = useState('0.014');
  const [elevenLabsRate, setElevenLabsRate] = useState('0.18');
  const [openaiInputRate, setOpenaiInputRate] = useState('2.5');
  const [openaiOutputRate, setOpenaiOutputRate] = useState('10');

  useEffect(() => {
    if (!settings) return;
    const get = (key: string) => settings.find((s) => s.key === key);
    // Values are masked — use defaults; user edits to update
    const max = get('MAX_CONCURRENT_CALLS');
    const start = get('CALL_HOURS_START');
    const end = get('CALL_HOURS_END');
    const twilio = get('COST_TWILIO_PER_MINUTE_USD');
    const eleven = get('COST_ELEVENLABS_PER_1K_CHARS_USD');
    const openaiIn = get('COST_OPENAI_INPUT_PER_1M_TOKENS_USD');
    const openaiOut = get('COST_OPENAI_OUTPUT_PER_1M_TOKENS_USD');
    if (max?.maskedValue && !max.maskedValue.startsWith('*')) setMaxCalls(max.maskedValue);
    if (start?.maskedValue && start.maskedValue.includes(':')) setHoursStart(start.maskedValue);
    if (end?.maskedValue && end.maskedValue.includes(':')) setHoursEnd(end.maskedValue);
    if (twilio?.maskedValue && !twilio.maskedValue.startsWith('*')) setTwilioRate(twilio.maskedValue);
    if (eleven?.maskedValue && !eleven.maskedValue.startsWith('*')) setElevenLabsRate(eleven.maskedValue);
    if (openaiIn?.maskedValue && !openaiIn.maskedValue.startsWith('*')) setOpenaiInputRate(openaiIn.maskedValue);
    if (openaiOut?.maskedValue && !openaiOut.maskedValue.startsWith('*')) setOpenaiOutputRate(openaiOut.maskedValue);
  }, [settings]);

  const save = async (key: string, value: string, label: string) => {
    try {
      await upsert.mutateAsync({ key, value, label, group: 'system' });
    } catch {
      throw new Error('Save failed');
    }
  };

  const handleSave = async () => {
    try {
      await save('MAX_CONCURRENT_CALLS', maxCalls, 'Max Concurrent Calls');
      await save('CALL_HOURS_START', hoursStart, 'Call Hours Start (HH:mm)');
      await save('CALL_HOURS_END', hoursEnd, 'Call Hours End (HH:mm)');
      await save('COST_TWILIO_PER_MINUTE_USD', twilioRate, 'Twilio Cost per Minute (USD)');
      await save('COST_ELEVENLABS_PER_1K_CHARS_USD', elevenLabsRate, 'ElevenLabs Cost per 1K Chars (USD)');
      await save('COST_OPENAI_INPUT_PER_1M_TOKENS_USD', openaiInputRate, 'OpenAI Input Cost per 1M Tokens (USD)');
      await save('COST_OPENAI_OUTPUT_PER_1M_TOKENS_USD', openaiOutputRate, 'OpenAI Output Cost per 1M Tokens (USD)');
      toast.success('System settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  return (
    <ErrorBoundary>
      <PageHeader title="System Settings" description="Call engine configuration" />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Call Engine</CardTitle>
          <CardDescription>Changes take effect on the next call cycle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <Skeleton className="h-32" /> : (
            <>
              <div className="space-y-2">
                <Label>Max Concurrent Calls (1–20)</Label>
                <Input type="number" min={1} max={20} value={maxCalls} onChange={(e) => setMaxCalls(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Calling Hours Start (HH:mm)</Label>
                <Input type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Calling Hours End (HH:mm)</Label>
                <Input type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} />
              </div>
              <Button onClick={handleSave} disabled={upsert.isPending}>Save Settings</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <CardTitle>Usage Cost Rates</CardTitle>
          <CardDescription>Used to estimate per-call cost for OpenAI, ElevenLabs, and Twilio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <Skeleton className="h-32" /> : (
            <>
              <div className="space-y-2">
                <Label>Twilio cost per minute (USD)</Label>
                <Input type="number" step="0.001" min={0} value={twilioRate} onChange={(e) => setTwilioRate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>ElevenLabs cost per 1,000 characters (USD)</Label>
                <Input type="number" step="0.01" min={0} value={elevenLabsRate} onChange={(e) => setElevenLabsRate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>OpenAI input cost per 1M tokens (USD)</Label>
                <Input type="number" step="0.1" min={0} value={openaiInputRate} onChange={(e) => setOpenaiInputRate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>OpenAI output cost per 1M tokens (USD)</Label>
                <Input type="number" step="0.1" min={0} value={openaiOutputRate} onChange={(e) => setOpenaiOutputRate(e.target.value)} />
              </div>
              <Button onClick={handleSave} disabled={upsert.isPending}>Save Cost Rates</Button>
            </>
          )}
        </CardContent>
      </Card>
    </ErrorBoundary>
  );
}
