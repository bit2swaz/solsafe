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

export interface DashboardDataDependencies {
  identityBridge?: Pick<DashboardIdentityBridge, 'listTelegramIdsByWallet'>;
  queryHistoryStore?: Pick<DashboardQueryHistoryStore, 'getQueryHistory'>;
}

interface DashboardSupabaseErrorLike {
  message: string;
}

interface DashboardIdentityBridge {
  listTelegramIdsByWallet(walletAddress: string): Promise<string[]>;
}

interface DashboardIdentityLinkLookupRow {
  telegram_user_id: string | null;
}

interface DashboardIdentityLinkLimitBuilder {
  limit(limit: number): Promise<{
    data: DashboardIdentityLinkLookupRow[] | null;
    error: DashboardSupabaseErrorLike | null;
  }>;
}

interface DashboardIdentityLinkSelectBuilder {
  eq(column: string, value: string): DashboardIdentityLinkLimitBuilder;
}

interface DashboardQueryHistoryRow {
  created_at: string;
  id: string;
  intent: string;
  linked_wallet_address: string | null;
  metadata: Record<string, unknown>;
  query_text: string;
  response_summary: string;
  session_id: string | null;
  telegram_user_id: string | null;
  user_id: string;
}

interface DashboardQueryHistoryStore {
  getQueryHistory(input: {
    limit?: number;
    linkedWalletAddress?: string;
    telegramUserId?: string;
    userId?: string;
  }): Promise<DashboardQueryHistoryRow[]>;
}

interface DashboardQueryHistoryLimitBuilder {
  limit(limit: number): Promise<{
    data: DashboardQueryHistoryRow[] | null;
    error: DashboardSupabaseErrorLike | null;
  }>;
}

interface DashboardQueryHistoryOrderBuilder {
  order(
    column: string,
    options: { ascending: boolean },
  ): DashboardQueryHistoryLimitBuilder;
}

interface DashboardQueryHistorySelectBuilder {
  eq(column: string, value: string): DashboardQueryHistoryOrderBuilder;
}

interface DashboardSupabaseClient {
  from(table: 'identity_links'): {
    select(columns: string): DashboardIdentityLinkSelectBuilder;
  };
  from(table: 'query_history'): {
    select(columns: string): DashboardQueryHistorySelectBuilder;
  };
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
  dependencies: DashboardDataDependencies = {},
): Promise<DashboardSnapshot> {
  const normalizedAddress = normalizeOptionalValue(address);

  if (!normalizedAddress) {
    return {
      health: createPreviewWalletHealth(),
      history: PREVIEW_QUERY_HISTORY,
      historyState: 'preview',
    };
  }

  const history = await listDashboardQueryHistory(normalizedAddress, dependencies);

  return {
    health: createWalletHealthSnapshot(normalizedAddress, history),
    history,
    historyState: history.length > 0 ? 'live' : 'empty',
  };
}

async function listDashboardQueryHistory(
  address: string,
  dependencies: DashboardDataDependencies,
): Promise<DashboardQueryHistoryItem[]> {
  const dataServices = createDashboardDataServices(dependencies);

  if (!dataServices) {
    return [];
  }

  const linkedTelegramIds = await dataServices.identityBridge.listTelegramIdsByWallet(
    address,
  );
  const resultSets = await Promise.all([
    dataServices.queryHistoryStore.getQueryHistory({
      limit: 6,
      linkedWalletAddress: address,
    }),
    ...linkedTelegramIds.map((telegramUserId) =>
      dataServices.queryHistoryStore.getQueryHistory({
        limit: 6,
        telegramUserId,
      }),
    ),
    dataServices.queryHistoryStore.getQueryHistory({
      limit: 6,
      userId: address,
    }),
    dataServices.queryHistoryStore.getQueryHistory({
      limit: 6,
      userId: `wallet:${address}`,
    }),
  ]);
  const historyRows = dedupeAndSortHistoryRows(resultSets.flat()).slice(0, 6);

  return historyRows.map((row) => ({
    createdAt: String(row.created_at),
    id: String(row.id),
    intent: String(row.intent),
    queryText: String(row.query_text),
    responseSummary: String(row.response_summary),
    source: extractMetadataSource(row.metadata),
  }));
}

function createDashboardDataServices(
  dependencies: DashboardDataDependencies,
): {
  identityBridge: Pick<DashboardIdentityBridge, 'listTelegramIdsByWallet'>;
  queryHistoryStore: Pick<DashboardQueryHistoryStore, 'getQueryHistory'>;
} | null {
  if (dependencies.identityBridge && dependencies.queryHistoryStore) {
    return {
      identityBridge: dependencies.identityBridge,
      queryHistoryStore: dependencies.queryHistoryStore,
    };
  }

  const credentials = getDashboardSupabaseCredentials();

  if (!credentials) {
    return null;
  }

  const supabase = createClient(credentials.url, credentials.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  }) as unknown as DashboardSupabaseClient;

  return {
    identityBridge: dependencies.identityBridge ?? createDashboardIdentityBridge(supabase),
    queryHistoryStore:
      dependencies.queryHistoryStore ?? createDashboardQueryHistoryStore(supabase),
  };
}

function createDashboardIdentityBridge(
  supabase: DashboardSupabaseClient,
): DashboardIdentityBridge {
  return {
    async listTelegramIdsByWallet(walletAddress) {
      const { data, error } = await supabase
        .from('identity_links')
        .select('telegram_user_id')
        .eq('wallet_address', walletAddress)
        .limit(25);

      if (error) {
        throw new Error(
          `Failed to load dashboard identity links from Supabase: ${error.message}`,
        );
      }

      return (data ?? [])
        .map((row) => row.telegram_user_id)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    },
  };
}

function createDashboardQueryHistoryStore(
  supabase: DashboardSupabaseClient,
): DashboardQueryHistoryStore {
  return {
    async getQueryHistory(input) {
      const limit = input.limit ?? 6;
      const baseQuery = supabase.from('query_history').select(
        'id, intent, query_text, response_summary, created_at, metadata, user_id, telegram_user_id, linked_wallet_address, session_id',
      );
      let filteredQuery: DashboardQueryHistoryOrderBuilder;

      if (input.linkedWalletAddress) {
        filteredQuery = baseQuery.eq(
          'linked_wallet_address',
          input.linkedWalletAddress,
        );
      } else if (input.telegramUserId) {
        filteredQuery = baseQuery.eq('telegram_user_id', input.telegramUserId);
      } else if (input.userId) {
        filteredQuery = baseQuery.eq('user_id', input.userId);
      } else {
        throw new Error(
          'A userId, telegramUserId, or linkedWalletAddress filter is required to query dashboard history.',
        );
      }

      const { data, error } = await filteredQuery
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(
          `Failed to load dashboard query history from Supabase: ${error.message}`,
        );
      }

      return (data ?? []) as DashboardQueryHistoryRow[];
    },
  };
}

function dedupeAndSortHistoryRows(
  rows: DashboardQueryHistoryRow[],
): DashboardQueryHistoryRow[] {
  const uniqueRows = new Map<string, DashboardQueryHistoryRow>();

  for (const row of rows) {
    uniqueRows.set(row.id, row);
  }

  return [...uniqueRows.values()].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  );
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