'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <Button onClick={() => this.setState({ hasError: false })}>Try again</Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
