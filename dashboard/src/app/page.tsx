import { DashboardAuthPanel } from '@/components/dashboard-auth-panel';
import { QueryHistoryPanel } from '@/components/query-history-panel';
import { WalletHealthPanel } from '@/components/wallet-health-panel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isDashboardAuthConfigured, readDashboardSession } from '@/lib/dashboard-auth';
import { getDashboardSnapshot } from '@/lib/dashboard-data';

export default async function Home() {
  const session = await readDashboardSession();
  const snapshot = await getDashboardSnapshot(session?.address);
  const siwsConfigured = isDashboardAuthConfigured();

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:py-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card/80 p-6 shadow-[0_30px_90px_rgba(17,17,17,0.08)] sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(17,17,17,0.08),transparent_38%),linear-gradient(to_bottom,rgba(255,255,255,0.82),rgba(245,245,244,0.98))]" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>Web dashboard</Badge>
                <Badge variant="outline">SSOT aligned</Badge>
                <Badge variant={siwsConfigured ? 'outline' : 'secondary'}>
                  {siwsConfigured ? 'SIWS ready' : 'SIWS config required'}
                </Badge>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  SolSafe at a glance, rendered in grayscale and scoped to a
                  signed wallet session.
                </h1>
                <p className="max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
                  This minimal Next.js surface follows the SSOT: a Telegram-first
                  product with a lightweight web dashboard for query history and a
                  compact wallet health visual. SIWS gates the personalized view,
                  while Supabase backs the activity timeline.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <HeroMetric
                  label="History mode"
                  value={
                    snapshot.historyState === 'preview'
                      ? 'Preview'
                      : snapshot.historyState === 'live'
                        ? 'Live'
                        : 'Empty'
                  }
                />
                <HeroMetric label="Wallet health" value={`${snapshot.health.score}/100`} />
                <HeroMetric
                  label="Authenticated"
                  value={session?.address ? `${session.address.slice(0, 4)}...${session.address.slice(-4)}` : 'No'}
                />
              </div>
            </div>

            <DashboardAuthPanel
              initialSession={session}
              siwsConfigured={siwsConfigured}
            />
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <QueryHistoryPanel
            history={snapshot.history}
            mode={snapshot.historyState}
          />

          <div className="space-y-8">
            <WalletHealthPanel health={snapshot.health} />

            <Card>
              <CardHeader>
                <Badge variant="outline">Implementation notes</Badge>
                <CardTitle className="text-xl">What this dashboard is doing today</CardTitle>
                <CardDescription>
                  The current MVP keeps the scope deliberately narrow and visible.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm leading-7 text-muted-foreground">
                <p>
                  SIWS establishes a signed session cookie on the server after a wallet
                  signs the canonical message challenge.
                </p>
                <p>
                  Supabase query history is read server-side to avoid leaking the service
                  role key into the browser.
                </p>
                <p>
                  The wallet health visual is a dashboard readiness indicator, not a full
                  risk engine. It becomes richer as more post-MVP scoring skills land.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-border/80 bg-background/75 p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}
