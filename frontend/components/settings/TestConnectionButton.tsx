'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTestSetting } from '@/hooks/useSettings';
import type { SettingsGroup } from '@/types';

interface TestConnectionButtonProps {
  group: SettingsGroup;
  label?: string;
}

export function TestConnectionButton({ group, label }: TestConnectionButtonProps) {
  const test = useTestSetting();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTest = async () => {
    try {
      const res = await test.mutateAsync(group);
      setResult(res.data);
      if (res.data.success) toast.success(res.data.message);
      else toast.error(res.data.message);
    } catch {
      toast.error('Test failed');
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={handleTest} disabled={test.isPending}>
        {test.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {label || `Test ${group}`}
      </Button>
      {result && (
        <span className={`flex items-center gap-1 text-sm ${result.success ? 'text-green-600' : 'text-destructive'}`}>
          {result.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {result.message}
        </span>
      )}
    </div>
  );
}
