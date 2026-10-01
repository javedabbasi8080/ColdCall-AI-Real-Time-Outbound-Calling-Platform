'use client';

import { ExternalLink } from 'lucide-react';

export interface GuideLink {
  label: string;
  url: string;
}

interface ApiKeyGuideProps {
  summary: string;
  links: GuideLink[];
}

export function ApiKeyGuide({ summary, links }: ApiKeyGuideProps) {
  return (
    <div className="mb-4 rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm">
      <p className="mb-2 text-muted-foreground">{summary}</p>
      <ul className="space-y-1">
        {links.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {link.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
