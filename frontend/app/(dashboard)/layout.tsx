import { AuthGate } from '@/components/AuthGate';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AuthGate>
        <Sidebar />
        <div className="pl-60">
          <Topbar />
          <main className="p-6">{children}</main>
        </div>
      </AuthGate>
    </div>
  );
}
