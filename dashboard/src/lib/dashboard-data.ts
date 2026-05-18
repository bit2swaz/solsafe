import 'server-only';

import { createClient } from '@supabase/supabase-js';

export interface DashboardQueryHistoryItem {
  createdAt: string;
  id: string;
  intent: string;
  queryText: string;
  responseSummary: string;
  source: string;
}

export interface WalletHealthMetric {
  caption: string;
  label: string;
  value: number;
}

export interface WalletHealthSnapshot {
  band: string;
  metrics: WalletHealthMetric[];
  score: number;
  summary: string;
  title: string;
}

export interface DashboardSnapshot {
  health: WalletHealthSnapshot;
  history: DashboardQueryHistoryItem[];
  historyState: 'empty' | 'live' | 'preview';
}

const PREVIEW_QUERY_HISTORY: DashboardQueryHistoryItem[] = [
  {
    createdAt: '2026-05-18T18:08:00.000Z',
    id: 'preview-wallet-summary',
    intent: 'wallet_lookup',
    queryText: 'check wallet 8vFzX...',
    responseSummary:
      'Wallet 8vFzX... has been active for 234 days with 12.4 SOL and recent Jupiter activity.',
    source: 'preview',
  },
  {
    createdAt: '2026-05-18T18:14:00.000Z',
    id: 'preview-token-security',
    intent: 'token_security',
    queryText: 'what about the BONK token? is it safe?',
    responseSummary:
      'BONK scores 92/100 on RugCheck with verified mint metadata and no immediate warnings.',
    source: 'preview',
  },
  {
    createdAt: '2026-05-18T18:22:00.000Z',
    id: 'preview-logs',
    intent: 'program_log_explanation',
    queryText: 'explain these program logs before i sign',
    responseSummary:
      'Simulation logs show a token transfer and no custom program error in the execution path.',
    source: 'preview',
  },
];

export async function getDashboardSnapshot(
  address?: string | null,
): Promise<DashboardSnapshot> {
  const normalizedAddress = normalizeOptionalValue(address);

  if (!normalizedAddress) {
    return {
      health: createPreviewWalletHealth(),
      history: PREVIEW_QUERY_HISTORY,
      historyState: 'preview',
    };
  }

  const history = await listDashboardQueryHistory(normalizedAddress);

  return {
    health: createWalletHealthSnapshot(normalizedAddress, history),
    history,
    historyState: history.length > 0 ? 'live' : 'empty',
  };
}

async function listDashboardQueryHistory(
  address: string,
): Promise<DashboardQueryHistoryItem[]> {
  const credentials = getDashboardSupabaseCredentials();

  if (!credentials) {
    return [];
  }

  const supabase = createClient(credentials.url, credentials.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  });
  const { data, error } = await supabase
    .from('query_history')
    .select('id, intent, query_text, response_summary, created_at, metadata, user_id')
    .in('user_id', [address, `wallet:${address}`])
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) {
    throw new Error(
      `Failed to load dashboard query history from Supabase: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    createdAt: String(row.created_at),
    id: String(row.id),
    intent: String(row.intent),
    queryText: String(row.query_text),
    responseSummary: String(row.response_summary),
    source: extractMetadataSource(row.metadata),
  }));
}

function createPreviewWalletHealth(): WalletHealthSnapshot {
  return {
    band: 'Preview',
    metrics: [
      {
        caption: 'Intent coverage across the SolSafe skills you have enabled.',
        label: 'Coverage',
        value: 84,
      },
      {
        caption: 'How fresh the latest analysis is compared to a 24 hour cadence.',
        label: 'Freshness',
        value: 77,
      },
      {
        caption: 'How much security context the dashboard can surface in one glance.',
        label: 'Trust layer',
        value: 88,
      },
    ],
    score: 83,
    summary:
      'This monochrome preview mirrors the SSOT dashboard layout. Authenticate a wallet to replace the sample timeline with your own SolSafe activity.',
    title: 'Wallet health preview',
  };
}

function createWalletHealthSnapshot(
  address: string,
  history: DashboardQueryHistoryItem[],
): WalletHealthSnapshot {
  if (history.length === 0) {
    return {
      band: 'Cold start',
      metrics: [
        {
          caption: 'No saved query history is available for this wallet yet.',
          label: 'Coverage',
          value: 22,
        },
        {
          caption: 'The dashboard is ready, but there is no recent SolSafe traffic to score.',
          label: 'Freshness',
          value: 18,
        },
        {
          caption: 'Run a few wallet, token, or simulation checks to increase context density.',
          label: 'Trust layer',
          value: 30,
        },
      ],
      score: 24,
      summary:
        'The SIWS session is active, but Supabase has not recorded any dashboard history for this wallet yet.',
      title: `${shortenAddress(address)} is authenticated`,
    };
  }

  const uniqueIntentCount = new Set(history.map((item) => item.intent)).size;
  const freshestTimestamp = Date.parse(history[0]?.createdAt ?? '');
  const hoursSinceFreshest = Number.isFinite(freshestTimestamp)
    ? Math.max(0, (Date.now() - freshestTimestamp) / (1000 * 60 * 60))
    : 24;
  const coverage = clamp(40 + uniqueIntentCount * 18, 0, 100);
  const freshness = clamp(100 - hoursSinceFreshest * 8, 20, 100);
  const trustLayer = clamp(48 + history.length * 9, 0, 100);
  const score = Math.round((coverage + freshness + trustLayer) / 3);

  return {
    band: score >= 80 ? 'Stable' : score >= 60 ? 'Watchful' : 'Thin data',
    metrics: [
      {
        caption: `${uniqueIntentCount} distinct intent surfaces observed in your recent timeline.`,
        label: 'Coverage',
        value: coverage,
      },
      {
        caption: `Latest dashboard activity arrived ${Math.max(1, Math.round(hoursSinceFreshest))} hour(s) ago.`,
        label: 'Freshness',
        value: freshness,
      },
      {
        caption: `${history.length} saved analysis records are enriching the dashboard summary.`,
        label: 'Trust layer',
        value: trustLayer,
      },
    ],
    score,
    summary:
      'This score is derived from stored SolSafe activity only. It is a dashboard readiness signal, not a financial risk model.',
    title: `${shortenAddress(address)} activity profile`,
  };
}

function getDashboardSupabaseCredentials():
  | {
      key: string;
      url: string;
    }
  | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.SUPABASE_URL?.trim();

  if (!key || !url) {
    return null;
  }

  return { key, url };
}

function extractMetadataSource(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') {
    return 'dashboard';
  }

  const source = (metadata as Record<string, unknown>).source;

  return typeof source === 'string' && source.trim() ? source.trim() : 'dashboard';
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}