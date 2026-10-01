'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useUpdateCategory, useDeleteCategory } from '@/hooks/useCategories';
import { knowledgeApi } from '@/lib/api';
import type { BusinessKnowledge, Category, KnowledgeBundle } from '@/types';

interface CategoryEditorProps {
  category: Category | null;
  onDeleted?: () => void;
}

const FIELD_ROWS: Array<{ key: keyof BusinessKnowledge; label: string; rows?: number }> = [
  { key: 'businessName', label: 'Business Name' },
  { key: 'projectName', label: 'Project Name' },
  { key: 'industry', label: 'Industry' },
  { key: 'country', label: 'Country' },
  { key: 'city', label: 'City' },
  { key: 'locationLabel', label: 'Location Label' },
  { key: 'agentName', label: 'Agent Name' },
  { key: 'agentRole', label: 'Agent Role' },
  { key: 'agentGender', label: 'Agent Gender (female/male)' },
  { key: 'primaryLanguage', label: 'Primary Language (urdu/english)' },
  { key: 'businessDescription', label: 'Business Description', rows: 3 },
  { key: 'companyIntroduction', label: 'Company Introduction', rows: 3 },
  { key: 'greetingStyle', label: 'Greeting Style', rows: 2 },
  { key: 'businessTone', label: 'Business Tone', rows: 2 },
  { key: 'conversationGoal', label: 'Conversation Goal', rows: 2 },
  { key: 'qualificationStrategy', label: 'Qualification Strategy', rows: 2 },
  { key: 'appointmentStrategy', label: 'Appointment Strategy', rows: 2 },
  { key: 'salesStrategy', label: 'Sales Strategy', rows: 2 },
  { key: 'closingStrategy', label: 'Closing Strategy', rows: 2 },
  { key: 'voicePersonality', label: 'Voice Personality' },
  { key: 'responseLength', label: 'Response Length' },
];

export function CategoryEditor({ category, onDeleted }: CategoryEditorProps) {
  const [name, setName] = useState('');
  const [bundle, setBundle] = useState<KnowledgeBundle | null>(null);
  const [knowledge, setKnowledge] = useState<BusinessKnowledge>({});
  const [voiceId, setVoiceId] = useState('');
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [loading, setLoading] = useState(false);
  const [faqQ, setFaqQ] = useState('');
  const [faqA, setFaqA] = useState('');
  const [productName, setProductName] = useState('');

  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  useEffect(() => {
    if (!category) {
      setBundle(null);
      return;
    }
    setName(category.name);
    setVoiceId(category.voiceSettings?.elevenLabsVoiceId || '');
    setStability(category.voiceSettings?.stability ?? 0.5);
    setSimilarity(category.voiceSettings?.similarityBoost ?? 0.75);
    setLoading(true);
    knowledgeApi
      .bundle(category._id)
      .then((res) => {
        setBundle(res.data);
        setKnowledge(res.data.knowledge || {});
      })
      .catch(() => toast.error('Failed to load knowledge base'))
      .finally(() => setLoading(false));
  }, [category]);

  if (!category) {
    return (
      <Card className="flex h-96 items-center justify-center">
        <p className="text-muted-foreground">Select a category to edit knowledge</p>
      </Card>
    );
  }

  const refresh = async () => {
    const res = await knowledgeApi.bundle(category._id);
    setBundle(res.data);
    setKnowledge(res.data.knowledge || {});
  };

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        id: category._id,
        data: {
          name,
          voiceSettings: {
            elevenLabsVoiceId: voiceId,
            stability,
            similarityBoost: similarity,
          },
        },
      });
      await knowledgeApi.updateBusiness(category._id, knowledge as Record<string, unknown>);
      await knowledgeApi.invalidate(category._id);
      toast.success('Knowledge base saved');
      await refresh();
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(category._id);
      toast.success('Category deleted');
      onDeleted?.();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const addFaq = async () => {
    if (!faqQ.trim() || !faqA.trim()) return;
    try {
      await knowledgeApi.createFaq(category._id, {
        question: faqQ,
        answer: faqA,
        priority: 100,
        keywords: [],
      });
      setFaqQ('');
      setFaqA('');
      await refresh();
      toast.success('FAQ added');
    } catch {
      toast.error('Failed to add FAQ');
    }
  };

  const addProduct = async () => {
    if (!productName.trim()) return;
    try {
      await knowledgeApi.createProduct(category._id, {
        name: productName,
        description: '',
        availableSizes: [],
        price: '',
        paymentPlan: '',
        features: [],
        availability: 'available',
        status: 'active',
      });
      setProductName('');
      await refresh();
      toast.success('Product added');
    } catch {
      toast.error('Failed to add product');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Knowledge Base</CardTitle>
        <p className="text-sm text-muted-foreground">
          Edit business facts — the AI uses these dynamically. No fixed call scripts.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && <p className="text-sm text-muted-foreground">Loading knowledge…</p>}

        <div className="space-y-2">
          <Label>Category Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Voice Settings</h3>
          <div className="space-y-2">
            <Label>ElevenLabs Voice ID</Label>
            <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Stability: {stability.toFixed(2)}</Label>
            <Slider value={[stability]} min={0} max={1} step={0.05} onValueChange={([v]) => setStability(v)} />
          </div>
          <div className="space-y-2">
            <Label>Similarity: {similarity.toFixed(2)}</Label>
            <Slider value={[similarity]} min={0} max={1} step={0.05} onValueChange={([v]) => setSimilarity(v)} />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Business Information</h3>
          {FIELD_ROWS.map((f) => (
            <div key={String(f.key)} className="space-y-1">
              <Label>{f.label}</Label>
              {f.rows ? (
                <textarea
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  rows={f.rows}
                  value={String(knowledge[f.key] ?? '')}
                  onChange={(e) => setKnowledge({ ...knowledge, [f.key]: e.target.value })}
                />
              ) : (
                <Input
                  value={String(knowledge[f.key] ?? '')}
                  onChange={(e) => setKnowledge({ ...knowledge, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Products ({bundle?.products?.length || 0})</h3>
          <ul className="space-y-1 text-sm">
            {(bundle?.products || []).map((p) => (
              <li key={p._id} className="flex items-center justify-between rounded border px-2 py-1">
                <span>{p.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    await knowledgeApi.deleteProduct(p._id);
                    await refresh();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              placeholder="New product name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
            <Button type="button" onClick={addProduct}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">FAQs ({bundle?.faqs?.length || 0})</h3>
          <ul className="space-y-2 text-sm">
            {(bundle?.faqs || []).map((f) => (
              <li key={f._id} className="rounded border p-2">
                <div className="flex justify-between gap-2">
                  <strong>{f.question}</strong>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      await knowledgeApi.deleteFaq(f._id);
                      await refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-muted-foreground">{f.answer}</p>
              </li>
            ))}
          </ul>
          <Input placeholder="Question" value={faqQ} onChange={(e) => setFaqQ(e.target.value)} />
          <textarea
            className="w-full rounded-md border bg-background p-2 text-sm"
            rows={2}
            placeholder="Answer"
            value={faqA}
            onChange={(e) => setFaqA(e.target.value)}
          />
          <Button type="button" onClick={addFaq}>
            Add FAQ
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Conversation Stages ({bundle?.stages?.length || 0})</h3>
          <p className="text-xs text-muted-foreground">
            Stages drive the sales flow. Edit instructions via API / PUT stages — listed here for visibility.
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {(bundle?.stages || []).map((s) => (
              <li key={s._id}>
                <strong>{s.stageName}</strong> ({s.key}) — {s.goal}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={update.isPending}>
            Save Knowledge
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete Category</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete category?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
