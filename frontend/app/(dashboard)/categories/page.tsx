'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CategoryEditor } from '@/components/categories/CategoryEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories, useCreateCategory } from '@/hooks/useCategories';
import { cn } from '@/lib/utils';

export default function CategoriesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

  const { data: categories, isLoading } = useCategories();
  const create = useCreateCategory();

  const selected = categories?.find((c) => c._id === selectedId) || null;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const res = await create.mutateAsync({
        name: newName,
        script: [],
        voiceSettings: { stability: 0.5, similarityBoost: 0.75 },
      });
      setSelectedId(res.data._id);
      setShowAdd(false);
      setNewName('');
      toast.success('Category created');
    } catch {
      toast.error('Failed to create category');
    }
  };

  return (
    <ErrorBoundary>
      <PageHeader
        title="Categories"
        description="Manage business knowledge bases — facts the AI uses on calls (not scripts)"
        action={
          <Button onClick={() => setShowAdd(true)}><Plus className="mr-2 h-4 w-4" />Add Category</Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardContent className="p-2">
            {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mb-2 h-12" />)}
            {categories?.map((cat) => (
              <button
                key={cat._id}
                onClick={() => setSelectedId(cat._id)}
                className={cn(
                  'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                  selectedId === cat._id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                <p className="font-medium">{cat.name}</p>
                <p className={cn('text-xs', selectedId === cat._id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {cat.knowledge?.businessName || cat.playbook?.businessName || 'Knowledge base'}
                </p>
              </button>
            ))}
            {!isLoading && categories?.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No categories yet</p>
            )}
          </CardContent>
        </Card>
        <CategoryEditor category={selected} onDeleted={() => setSelectedId(null)} />
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Roofing" />
            </div>
            <Button onClick={handleCreate} disabled={create.isPending}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  );
}
