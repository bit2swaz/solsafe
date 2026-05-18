import { Clock3, DatabaseZap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardQueryHistoryItem, DashboardSnapshot } from '@/lib/dashboard-data';

type QueryHistoryPanelProps = {
  history: DashboardQueryHistoryItem[];
  mode: DashboardSnapshot['historyState'];
};

export function QueryHistoryPanel({ history, mode }: QueryHistoryPanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline">Query history</Badge>
          <Badge variant={mode === 'preview' ? 'secondary' : 'outline'}>
            {mode === 'preview'
              ? 'Preview data'
              : mode === 'live'
                ? 'Supabase live'
                : 'No history yet'}
          </Badge>
        </div>
        <CardTitle>Readable activity timeline</CardTitle>
        <CardDescription>
          {mode === 'preview'
            ? 'Signed-out visitors see a sample of the SSOT conversation flow. Once SIWS succeeds, this panel swaps to Supabase-backed records.'
            : 'Recent SolSafe requests are displayed newest-first with intent, response summary, and source context.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="rounded-[1.4rem] border border-dashed border-border bg-secondary/40 p-8 text-sm leading-7 text-muted-foreground">
            This wallet is authenticated, but there are no stored dashboard queries yet.
            As soon as this address starts generating SolSafe history, the latest
            entries will appear here.
          </div>
        ) : (
          <div className="grid gap-4">
            {history.map((item) => (
              <article
                className="rounded-[1.4rem] border border-border/80 bg-background/85 p-5"
                key={item.id}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">{formatIntentLabel(item.intent)}</Badge>
                  <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatRelativeTime(item.createdAt)}
                  </span>
                  <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    <DatabaseZap className="h-3.5 w-3.5" />
                    {item.source}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-medium tracking-tight text-foreground">
                  {item.queryText}
                </h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {item.responseSummary}
                </p>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatIntentLabel(intent: string): string {
  return intent.replace(/_/g, ' ');
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  return formatter.format(Math.round(diffHours / 24), 'day');
}