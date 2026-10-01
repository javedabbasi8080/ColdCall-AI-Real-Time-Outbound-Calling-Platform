import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LeadStatus } from '@/types';

const styles: Record<LeadStatus, string> = {
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  called: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  interested: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  not_interested: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  callback: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  voicemail: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  failed: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300',
  do_not_call: 'bg-gray-900 text-white dark:bg-black',
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge variant="outline" className={cn('capitalize border-0', styles[status])}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
