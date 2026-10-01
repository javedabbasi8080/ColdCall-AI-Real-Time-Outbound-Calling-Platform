'use client';

import { useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpsertSetting } from '@/hooks/useSettings';
import type { AppSetting } from '@/types';

interface ApiKeyRowProps {
  setting: AppSetting;
  helpUrl?: string;
  helpLabel?: string;
}

export function ApiKeyRow({ setting, helpUrl, helpLabel }: ApiKeyRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const upsert = useUpsertSetting();

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        key: setting.key,
        value,
        label: setting.label,
        group: setting.group,
      });
      toast.success(`${setting.label} updated`);
      setEditing(false);
      setValue('');
    } catch {
      toast.error('Failed to save');
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-[140px]">
        <div className="text-sm font-medium">{setting.label}</div>
        {helpUrl && (
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
          >
            {helpLabel || 'Get key'}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {editing ? (
        <Input
          className="flex-1 font-mono text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter new value"
          type="password"
        />
      ) : (
        <code className="flex-1 rounded bg-muted px-2 py-1 font-mono text-sm">
          {setting.maskedValue}
        </code>
      )}
      <div className="flex gap-2">
        {editing ? (
          <>
            <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}
