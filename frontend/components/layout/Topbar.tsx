'use client';

import { LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function Topbar() {
  const { user, role, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div />
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
        <span className="text-sm font-medium">{user?.name || user?.email}</span>
        {role && (
          <Badge variant="secondary" className="capitalize">
            {role}
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </header>
  );
}
