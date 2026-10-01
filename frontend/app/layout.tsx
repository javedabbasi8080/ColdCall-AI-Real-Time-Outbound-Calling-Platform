import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthInitializer } from '@/components/AuthInitializer';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cold Calling System',
  description: 'AI-powered outbound calling platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <AuthInitializer />
          {children}
        </Providers>
      </body>
    </html>
  );
}
