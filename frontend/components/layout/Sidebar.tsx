'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, FolderOpen, History, Key, LayoutDashboard, Phone,
  PhoneCall, Settings, Upload, Users, Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { section: 'Calls' },
  { href: '/calls/live', label: 'Live Calls', icon: PhoneCall },
  { href: '/calls/history', label: 'Call History', icon: History },
  { section: 'Leads' },
  { href: '/leads', label: 'All Leads', icon: Users },
  { href: '/leads/upload', label: 'Upload CSV', icon: Upload },
  { section: 'Categories' },
  { href: '/categories', label: 'Categories', icon: FolderOpen },
  { section: 'Analytics' },
  { href: '/analytics', label: 'Overview', icon: BarChart3 },
  { href: '/analytics/category', label: 'By Category', icon: BarChart3 },
  { section: 'Voice Lab' },
  { href: '/voice-lab', label: 'Voice Lab', icon: Mic },
  { section: 'Settings' },
  { href: '/settings/api-keys', label: 'API Keys', icon: Key },
  { href: '/settings/system', label: 'System', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Phone className="h-5 w-5 text-primary" />
        <span className="font-semibold">ColdCall AI</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {nav.map((item, i) => {
          if ('section' in item) {
            return (
              <div key={i} className="mb-2 mt-4 first:mt-0">
                <Separator className="mb-2" />
                <p className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {item.section}
                </p>
              </div>
            );
          }
          const Icon = item.icon!;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href!}
              className={cn(
                'mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
