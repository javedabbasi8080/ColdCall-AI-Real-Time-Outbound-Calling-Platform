'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Download, Loader2, Play, RefreshCw, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { voiceLabApi, type SynthesizePayload } from '@/lib/api';

const SAMPLE_TEXTS = [
  'Assalam o Alaikum Sir, main ABC Real Estate se baat kar rahi hoon. Aap ko ap  ke liye zabardast investment opportunity ke baare mein batana chahti thi.',
  'Jee bilkul Sir, hamare paas 5 marla aur 10 marla plots available hain, easy installments par. Kya aap site visit prefer karenge?',
  'Hello, this is a quick voice test for the ElevenLabs integration in the portal.',
];

function errMsg(e: unknown, fallback: string): string {
  const ax = e as AxiosError<{ message?: string | string[] }>;
  const m = ax?.response?.data?.message;
  if (Array.isArray(m)) return m.join(', ');
  return m || (e as Error)?.message || fallback;
}

export default function VoiceLabPage() {
  const [text, setText] = useState(SAMPLE_TEXTS[0]);
  const [voiceId, setVoiceId] = useState('');
  const [modelId, setModelId] = useState('eleven_flash_v2_5');
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.75);
  const [style, setStyle] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [useSpeakerBoost, setUseSpeakerBoost] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lastMs, setLastMs] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const voicesQuery = useQuery({
    queryKey: ['voice-lab', 'voices'],
    queryFn: async () => (await voiceLabApi.voices()).data,
    retry: false,
  });

  const modelsQuery = useQuery({
    queryKey: ['voice-lab', 'models'],
    queryFn: async () => (await voiceLabApi.models()).data,
    retry: false,
  });

  useEffect(() => {
    if (!voiceId && voicesQuery.data && voicesQuery.data.length > 0) {
      setVoiceId(voicesQuery.data[0].voiceId);
    }
  }, [voicesQuery.data, voiceId]);

  useEffect(() => {
    if (voicesQuery.error) {
      toast.error(errMsg(voicesQuery.error, 'Failed to load voices'));
    }
  }, [voicesQuery.error]);

  const synth = useMutation({
    mutationFn: async (payload: SynthesizePayload) => {
      const started = performance.now();
      const res = await voiceLabApi.synthesize(payload);
      return { data: res.data, ms: Math.round(performance.now() - started) };
    },
    onSuccess: ({ data, ms }) => {
      const url = `data:${data.mime};base64,${data.audioBase64}`;
      setAudioUrl(url);
      setLastMs(ms);
      setTimeout(() => {
        audioRef.current?.load();
        void audioRef.current?.play().catch(() => undefined);
      }, 50);
      toast.success(`Generated ${data.chars} chars in ${ms} ms`);
    },
    onError: (e) => toast.error(errMsg(e, 'Synthesis failed')),
  });

  const handleGenerate = () => {
    if (!text.trim()) {
      toast.error('Enter some text first');
      return;
    }
    synth.mutate({
      text,
      voiceId: voiceId || undefined,
      modelId: modelId || undefined,
      stability,
      similarityBoost,
      style,
      speed,
      useSpeakerBoost,
    });
  };

  const selectedVoice = useMemo(
    () => voicesQuery.data?.find((v) => v.voiceId === voiceId),
    [voicesQuery.data, voiceId],
  );

  return (
    <ErrorBoundary>
      <PageHeader
        title="Voice Lab"
        description="Test ElevenLabs voices safely — isolated from the live call system"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" /> Text to Speech
            </CardTitle>
            <CardDescription>
              Type Roman Urdu / English, pick a voice, tune settings, and play.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Text ({text.length}/2000)</Label>
              <textarea
                value={text}
                maxLength={2000}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Assalam o Alaikum..."
              />
              <div className="flex flex-wrap gap-2">
                {SAMPLE_TEXTS.map((s, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => setText(s)}
                  >
                    Sample {i + 1}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Voice</Label>
                  <button
                    type="button"
                    onClick={() => voicesQuery.refetch()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${voicesQuery.isFetching ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </button>
                </div>
                <Select value={voiceId} onValueChange={setVoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {(voicesQuery.data || []).map((v) => (
                      <SelectItem key={v.voiceId} value={v.voiceId}>
                        {v.name}
                        {v.category ? ` (${v.category})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedVoice?.voiceId && (
                  <p className="truncate text-xs text-muted-foreground">
                    ID: {selectedVoice.voiceId}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {(modelsQuery.data || []).map((m) => (
                      <SelectItem key={m.modelId} value={m.modelId}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button onClick={handleGenerate} disabled={synth.isPending}>
                {synth.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Generate &amp; Play
              </Button>
              {audioUrl && (
                <a href={audioUrl} download="voice-lab.mp3">
                  <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" /> Download
                  </Button>
                </a>
              )}
              {lastMs !== null && (
                <span className="text-sm text-muted-foreground">{lastMs} ms</span>
              )}
            </div>

            {audioUrl && (
              <audio ref={audioRef} controls className="w-full" src={audioUrl}>
                <track kind="captions" />
              </audio>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voice Settings</CardTitle>
            <CardDescription>Fine-tune the output</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <SliderRow
              label="Stability"
              hint="Lower = more expressive, Higher = more consistent"
              value={stability}
              onChange={setStability}
              min={0}
              max={1}
              step={0.05}
            />
            <SliderRow
              label="Similarity Boost"
              hint="How closely it matches the original voice"
              value={similarityBoost}
              onChange={setSimilarityBoost}
              min={0}
              max={1}
              step={0.05}
            />
            <SliderRow
              label="Style Exaggeration"
              hint="0 for phone calls; higher can add drama"
              value={style}
              onChange={setStyle}
              min={0}
              max={1}
              step={0.05}
            />
            <SliderRow
              label="Speed"
              hint="0.7 slow — 1.2 fast (1.0 normal)"
              value={speed}
              onChange={setSpeed}
              min={0.7}
              max={1.2}
              step={0.01}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="speaker-boost"
                checked={useSpeakerBoost}
                onCheckedChange={(c) => setUseSpeakerBoost(c === true)}
              />
              <Label htmlFor="speaker-boost" className="cursor-pointer">
                Speaker Boost
              </Label>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
}

function SliderRow({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm font-medium tabular-nums">{value.toFixed(2)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
