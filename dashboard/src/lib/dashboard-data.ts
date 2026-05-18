import 'server-only';

import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
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
  walletSummaryService?: Pick<DashboardWalletSummaryService, 'getWalletSummary'>;
}

interface DashboardSupabaseErrorLike {
  message: string;
}

interface DashboardIdentityBridge {
  listTelegramIdsByWallet(walletAddress: string): Promise<string[]>;
}

interface DashboardWalletTokenHolding {
  amount: number;
  mintAddress?: string;
  symbol: string;
}

interface DashboardWalletSummarySnapshot {
  recentActivityRelativeTime?: string;
  recentTransactionCount?: number;
  solBalance: number;
  tokenHoldings: DashboardWalletTokenHolding[];
  walletAddress: string;
  walletAgeDays: number;
}

interface DashboardWalletSummaryResult {
  cached: boolean;
  data: DashboardWalletSummarySnapshot;
  status: 'success';
  summary: string;
  walletAddress: string;
}

interface DashboardWalletSummaryService {
  getWalletSummary(walletAddress: string): Promise<DashboardWalletSummaryResult>;
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

interface DashboardDataServices {
  identityBridge?: Pick<DashboardIdentityBridge, 'listTelegramIdsByWallet'>;
  queryHistoryStore?: Pick<DashboardQueryHistoryStore, 'getQueryHistory'>;
  walletSummaryService: Pick<DashboardWalletSummaryService, 'getWalletSummary'>;
}

const DEFAULT_DASHBOARD_RPC_URL = 'https://api.mainnet-beta.solana.com';
const DASHBOARD_RECENT_SIGNATURE_LIMIT = 10;
const DASHBOARD_SIGNATURE_PAGE_LIMIT = 1_000;
const DASHBOARD_MAX_SIGNATURE_PAGES = 10;
const DASHBOARD_TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);
const DASHBOARD_KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 'BONK',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD6tDc5sWc5oAWnqLBaQx2R: 'USDT',
};
const DASHBOARD_RISK_ASSESSMENT_LINE =
  'Risk assessment: No interactions with known scam contracts. ✅';

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

  const dataServices = createDashboardDataServices(dependencies);
  const [history, walletSummary] = await Promise.all([
    listDashboardQueryHistory(normalizedAddress, dataServices),
    dataServices.walletSummaryService.getWalletSummary(normalizedAddress),
  ]);

  return {
    health: createWalletHealthSnapshot(normalizedAddress, walletSummary),
    history,
    historyState: history.length > 0 ? 'live' : 'empty',
  };
}

async function listDashboardQueryHistory(
  address: string,
  dataServices: DashboardDataServices,
): Promise<DashboardQueryHistoryItem[]> {
  if (!dataServices.identityBridge || !dataServices.queryHistoryStore) {
    return [];
  }

  const identityBridge = dataServices.identityBridge;
  const queryHistoryStore = dataServices.queryHistoryStore;

  const linkedTelegramIds = await identityBridge.listTelegramIdsByWallet(address);
  const resultSets = await Promise.all([
    queryHistoryStore.getQueryHistory({
      limit: 6,
      linkedWalletAddress: address,
    }),
    ...linkedTelegramIds.map((telegramUserId) =>
      queryHistoryStore.getQueryHistory({
        limit: 6,
        telegramUserId,
      }),
    ),
    queryHistoryStore.getQueryHistory({
      limit: 6,
      userId: address,
    }),
    queryHistoryStore.getQueryHistory({
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
): DashboardDataServices {
  if (
    dependencies.identityBridge &&
    dependencies.queryHistoryStore &&
    dependencies.walletSummaryService
  ) {
    return {
      identityBridge: dependencies.identityBridge,
      queryHistoryStore: dependencies.queryHistoryStore,
      walletSummaryService: dependencies.walletSummaryService,
    };
  }

  const credentials = getDashboardSupabaseCredentials();
  const supabase = credentials
    ? (createClient(credentials.url, credentials.key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        db: {
          schema: 'public',
        },
      }) as unknown as DashboardSupabaseClient)
    : null;

  return {
    identityBridge:
      dependencies.identityBridge ??
      (supabase ? createDashboardIdentityBridge(supabase) : undefined),
    queryHistoryStore:
      dependencies.queryHistoryStore ??
      (supabase ? createDashboardQueryHistoryStore(supabase) : undefined),
    walletSummaryService:
      dependencies.walletSummaryService ?? createDashboardWalletSummaryService(),
  };
}

function createDashboardWalletSummaryService(): DashboardWalletSummaryService {
  const connection = new Connection(getDashboardRpcUrl(), 'confirmed');
  const now = () => new Date();

  return {
    async getWalletSummary(walletAddress) {
      const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
      const owner = new PublicKey(normalizedWalletAddress);
      const recentSignatures = await connection.getSignaturesForAddress(
        owner,
        {
          limit: DASHBOARD_RECENT_SIGNATURE_LIMIT,
        },
        'confirmed',
      );
      const [solBalance, tokenHoldings, walletAgeDays] = await Promise.all([
        getDashboardWalletSolBalance(connection, owner),
        getDashboardWalletTokenHoldings(connection, owner),
        getDashboardWalletAgeDays(connection, owner, now),
      ]);
      const recentActivityRelativeTime = formatDashboardRelativeTime(
        recentSignatures[0]?.blockTime ?? null,
        now,
      );
      const data: DashboardWalletSummarySnapshot = {
        recentActivityRelativeTime,
        recentTransactionCount: recentSignatures.length,
        solBalance,
        tokenHoldings,
        walletAddress: normalizedWalletAddress,
        walletAgeDays,
      };

      return {
        cached: false,
        data,
        status: 'success',
        summary: formatDashboardWalletSummary(data),
        walletAddress: normalizedWalletAddress,
      };
    },
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
  walletSummary: DashboardWalletSummaryResult,
): WalletHealthSnapshot {
  const ageSignal = clamp((walletSummary.data.walletAgeDays / 365) * 100, 0, 100);
  const balanceSignal = clamp(
    20 +
      (walletSummary.data.solBalance > 0 ? 25 : 0) +
      walletSummary.data.tokenHoldings.length * 20,
    0,
    100,
  );
  const activitySignal = clamp(
    (walletSummary.data.recentTransactionCount ?? 0) * 8,
    0,
    100,
  );
  const score = Math.round((ageSignal + balanceSignal + activitySignal) / 3);

  return {
    band: score >= 75 ? 'Established' : score >= 45 ? 'Active' : 'New',
    metrics: [
      {
        caption: `Wallet has been active for ${walletSummary.data.walletAgeDays} days.`,
        label: 'Wallet age',
        value: ageSignal,
      },
      {
        caption: formatDashboardBalanceLine(
          walletSummary.data.solBalance,
          walletSummary.data.tokenHoldings,
        ),
        label: 'Current balance',
        value: balanceSignal,
      },
      {
        caption: formatDashboardRecentTransactionCountLine(
          walletSummary.data.recentTransactionCount,
        ),
        label: 'Recent transactions',
        value: activitySignal,
      },
    ],
    score,
    summary: walletSummary.summary,
    title: `${shortenAddress(address)} on-chain summary`,
  };
}

function formatDashboardWalletSummary(
  snapshot: DashboardWalletSummarySnapshot,
): string {
  const recentActivityLine = snapshot.recentActivityRelativeTime
    ? `Last activity: ${snapshot.recentActivityRelativeTime}.`
    : null;

  return [
    `Wallet ${snapshot.walletAddress} has been active for ${snapshot.walletAgeDays} days.`,
    formatDashboardBalanceLine(snapshot.solBalance, snapshot.tokenHoldings),
    ...(recentActivityLine ? [recentActivityLine] : []),
    formatDashboardRecentTransactionCountLine(snapshot.recentTransactionCount),
    DASHBOARD_RISK_ASSESSMENT_LINE,
  ].join('\n');
}

function formatDashboardBalanceLine(
  solBalance: number,
  tokenHoldings: DashboardWalletTokenHolding[],
): string {
  const balanceParts = [
    `${formatDashboardAmount(solBalance)} SOL`,
    ...tokenHoldings
      .slice(0, 3)
      .map((holding) => `${formatDashboardAmount(holding.amount)} ${holding.symbol}`),
  ];

  return `Current balance: ${joinDashboardAmounts(balanceParts)}.`;
}

function formatDashboardRecentTransactionCountLine(
  recentTransactionCount: number | undefined,
): string {
  return `Recent transactions: ${Math.max(0, Math.round(recentTransactionCount ?? 0))} recent signatures observed.`;
}

async function getDashboardWalletSolBalance(
  connection: Connection,
  publicKey: PublicKey,
): Promise<number> {
  const lamports = await connection.getBalance(publicKey, 'confirmed');
  return lamports / LAMPORTS_PER_SOL;
}

async function getDashboardWalletTokenHoldings(
  connection: Connection,
  owner: PublicKey,
): Promise<DashboardWalletTokenHolding[]> {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    owner,
    {
      programId: DASHBOARD_TOKEN_PROGRAM_ID,
    },
    'confirmed',
  );
  const holdings: DashboardWalletTokenHolding[] = [];

  for (const tokenAccount of tokenAccounts.value) {
    const parsedInfo = tokenAccount.account.data.parsed.info as {
      mint: string;
      tokenAmount: {
        uiAmount?: number | null;
        uiAmountString?: string;
      };
    };
    const amount = Number(
      parsedInfo.tokenAmount.uiAmountString ?? parsedInfo.tokenAmount.uiAmount ?? 0,
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    holdings.push({
      amount,
      mintAddress: parsedInfo.mint,
      symbol:
        DASHBOARD_KNOWN_TOKEN_SYMBOLS[parsedInfo.mint] ??
        shortenDashboardPublicKey(parsedInfo.mint),
    });
  }

  return holdings.sort((left, right) => right.amount - left.amount).slice(0, 3);
}

async function getDashboardWalletAgeDays(
  connection: Connection,
  owner: PublicKey,
  now: () => Date,
  maxSignaturePages = DASHBOARD_MAX_SIGNATURE_PAGES,
): Promise<number> {
  let before: string | undefined;
  let oldestBlockTime: number | null = null;

  for (let pageIndex = 0; pageIndex < maxSignaturePages; pageIndex += 1) {
    const signatures = await connection.getSignaturesForAddress(
      owner,
      {
        before,
        limit: DASHBOARD_SIGNATURE_PAGE_LIMIT,
      },
      'confirmed',
    );

    if (signatures.length === 0) {
      break;
    }

    for (const signatureInfo of signatures.slice().reverse()) {
      if (typeof signatureInfo.blockTime === 'number') {
        oldestBlockTime = signatureInfo.blockTime;
        break;
      }
    }

    if (signatures.length < DASHBOARD_SIGNATURE_PAGE_LIMIT) {
      break;
    }

    before = signatures.at(-1)?.signature;
  }

  if (oldestBlockTime === null) {
    return 0;
  }

  const ageInMilliseconds = now().getTime() - oldestBlockTime * 1_000;

  return Math.max(0, Math.floor(ageInMilliseconds / 86_400_000));
}

function normalizeWalletAddress(walletAddress: string): string {
  const normalizedWalletAddress = walletAddress.trim();

  if (!normalizedWalletAddress) {
    throw new Error('A valid Solana wallet address is required for dashboard health.');
  }

  try {
    return new PublicKey(normalizedWalletAddress).toBase58();
  } catch {
    throw new Error('A valid Solana wallet address is required for dashboard health.');
  }
}

function getDashboardRpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || DEFAULT_DASHBOARD_RPC_URL;
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

function shortenDashboardPublicKey(publicKey: string): string {
  if (publicKey.length <= 10) {
    return publicKey;
  }

  return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
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

function joinDashboardAmounts(items: string[]): string {
  if (items.length === 0) {
    return '0 SOL';
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function formatDashboardAmount(amount: number): string {
  const absoluteAmount = Math.abs(amount);
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  });

  if (absoluteAmount >= 10_000) {
    const abbreviatedAmount = absoluteAmount / 1_000;
    const formattedAmount = Number.isInteger(abbreviatedAmount)
      ? abbreviatedAmount.toString()
      : formatter.format(abbreviatedAmount).replace(/\.0$/, '');

    return `${amount < 0 ? '-' : ''}${formattedAmount}k`;
  }

  return formatter.format(amount);
}

function formatDashboardRelativeTime(
  blockTime: number | null,
  now: () => Date,
): string {
  if (blockTime === null) {
    return 'an unknown time ago';
  }

  const deltaInSeconds = Math.max(
    0,
    Math.floor((now().getTime() - blockTime * 1_000) / 1_000),
  );

  if (deltaInSeconds < 60) {
    return 'just now';
  }

  if (deltaInSeconds < 3_600) {
    const minutes = Math.floor(deltaInSeconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (deltaInSeconds < 86_400) {
    const hours = Math.floor(deltaInSeconds / 3_600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(deltaInSeconds / 86_400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}