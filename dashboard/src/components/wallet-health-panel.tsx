import { ShieldCheck, Waves } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { WalletHealthSnapshot } from '@/lib/dashboard-data';

type WalletHealthPanelProps = {
  health: WalletHealthSnapshot;
};

export function WalletHealthPanel({ health }: WalletHealthPanelProps) {
  const degrees = Math.round((health.score / 100) * 360);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline">Wallet health</Badge>
          <Badge variant={health.score >= 70 ? 'default' : 'secondary'}>
            {health.band}
          </Badge>
        </div>
        <CardTitle>{health.title}</CardTitle>
        <CardDescription>{health.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid gap-6 md:grid-cols-[0.85fr_1.15fr] md:items-center">
          <div className="flex items-center justify-center">
            <div
              className="grid h-44 w-44 place-items-center rounded-full border border-border/80 p-3"
              style={{
                background: `conic-gradient(#18181b 0deg ${degrees}deg, rgba(24,24,27,0.12) ${degrees}deg 360deg)`,
              }}
            >
              <div className="grid h-full w-full place-items-center rounded-full bg-background/95 text-center shadow-inner">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    On-chain
                  </p>
                  <p className="mt-2 text-5xl font-semibold tracking-tight text-foreground">
                    {health.score}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">out of 100</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4 text-sm leading-7 text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-medium">Dashboard interpretation</span>
              </div>
              <p className="mt-3">
                This visual now comes from the live wallet summary for the signed-in
                address. It highlights wallet age, visible balances, and recent on-chain
                activity instead of placeholder dashboard readiness data.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5">
          {health.metrics.map((metric) => (
            <div className="space-y-2" key={metric.label}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{metric.label}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {metric.value}/100
                  </p>
                </div>
                <Waves className="h-4 w-4 text-muted-foreground" />
              </div>
              <Progress value={metric.value} />
              <p className="text-sm leading-6 text-muted-foreground">{metric.caption}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}