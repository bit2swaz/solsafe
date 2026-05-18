import { PublicKey } from '@solana/web3.js';

import type { SolsafeIntent, SolsafeSkill } from '../agents/solsafe-agent.js';

export const CHECK_TOKEN_SECURITY_SKILL_NAME = 'checkTokenSecurity';

const CHECK_TOKEN_SECURITY_INTENT: SolsafeIntent = 'token_security';
const DEFAULT_CACHE_TTL_MS = 300_000;
const DEFAULT_RUGCHECK_API_BASE_URL = 'https://api.rugcheck.xyz/v1';
const DEFAULT_TOP_HOLDER_LIMIT = 10;

export interface CheckTokenSecurityInput {
  mintAddress: string;
}

export interface TokenSecurityRisk {
  description: string;
  level: string;
  name: string;
  score: number;
  value: string;
}

export interface TokenSecuritySnapshot {
  mintAddress: string;
  tokenName: string;
  tokenSymbol: string;
  trustScore: number;
  verificationSummary: string;
  liquiditySummary: string;
  topHolderConcentrationPct: number;
  assessment: string;
  warnings: string[];
  risks: TokenSecurityRisk[];
}

export interface CheckTokenSecurityResult {
  status: 'success';
  cached: boolean;
  mintAddress: string;
  summary: string;
  data: TokenSecuritySnapshot;
}

export interface TokenSecurityDataSource {
  getTokenSecuritySnapshot(
    input: CheckTokenSecurityInput,
  ): Promise<TokenSecuritySnapshot>;
}

export interface TokenSecurityCache {
  get(cacheKey: string): Promise<CheckTokenSecurityResult | null>;
  set(cacheKey: string, result: CheckTokenSecurityResult): Promise<void>;
}

export interface CreateCheckTokenSecuritySkillOptions {
  cache?: TokenSecurityCache;
  dataSource?: TokenSecurityDataSource;
}

export interface CreateInMemoryTokenSecurityCacheOptions {
  now?: () => Date;
  ttlMs?: number;
}

export interface CreateRugCheckTokenSecurityDataSourceOptions {
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
}

interface CacheEntry {
  expiresAt: number;
  result: CheckTokenSecurityResult;
}

interface RugCheckTokenReport {
  fileMeta?: {
    name?: string;
    symbol?: string;
  };
  markets?: RugCheckMarket[];
  mint?: string;
  risks?: RugCheckRisk[];
  score?: number;
  score_normalised?: number;
  tokenMeta?: {
    name?: string;
    symbol?: string;
  };
  topHolders?: RugCheckTopHolder[];
  verification?: {
    jup_strict?: boolean;
    jup_verified?: boolean;
    mint?: string;
    name?: string;
    symbol?: string;
  };
}

interface RugCheckMarket {
  lp?: {
    lpLockedPct?: number;
  };
}

interface RugCheckRisk {
  description?: string;
  level?: string;
  name?: string;
  score?: number;
  value?: string;
}

interface RugCheckTopHolder {
  pct?: number;
}

export function createInMemoryTokenSecurityCache(
  options: CreateInMemoryTokenSecurityCacheOptions = {},
): TokenSecurityCache {
  const cache = new Map<string, CacheEntry>();
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? (() => new Date());

  return {
    async get(cacheKey) {
      const cacheEntry = cache.get(cacheKey);

      if (!cacheEntry) {
        return null;
      }

      if (cacheEntry.expiresAt <= now().getTime()) {
        cache.delete(cacheKey);
        return null;
      }

      return cacheEntry.result;
    },
    async set(cacheKey, result) {
      cache.set(cacheKey, {
        expiresAt: now().getTime() + ttlMs,
        result,
      });
    },
  };
}

export function createRugCheckTokenSecurityDataSource(
  options: CreateRugCheckTokenSecurityDataSourceOptions = {},
): TokenSecurityDataSource {
  const apiBaseUrl =
    options.apiBaseUrl?.replace(/\/$/, '') ?? DEFAULT_RUGCHECK_API_BASE_URL;
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async getTokenSecuritySnapshot(input) {
      const mintAddress = normalizeMintAddress(input.mintAddress);
      const response = await fetchFn(`${apiBaseUrl}/tokens/${mintAddress}/report`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw await createRugCheckApiError(response);
      }

      const report = (await response.json()) as RugCheckTokenReport;

      return mapRugCheckReportToSnapshot(report, mintAddress);
    },
  };
}

export function createCheckTokenSecuritySkill(
  options: CreateCheckTokenSecuritySkillOptions = {},
): SolsafeSkill<CheckTokenSecurityInput, CheckTokenSecurityResult> {
  const cache = options.cache ?? createInMemoryTokenSecurityCache();
  const dataSource =
    options.dataSource ?? createRugCheckTokenSecurityDataSource();

  return {
    name: CHECK_TOKEN_SECURITY_SKILL_NAME,
    description:
      'Checks a token mint with RugCheck and summarizes risk score, warnings, liquidity, and holder concentration.',
    intent: CHECK_TOKEN_SECURITY_INTENT,
    async execute(input) {
      const mintAddress = normalizeMintAddress(input.mintAddress);
      const cacheKey = `token-security:${mintAddress}`;
      const cachedResult = await cache.get(cacheKey);

      if (cachedResult) {
        return {
          ...cachedResult,
          cached: true,
        };
      }

      const data = await dataSource.getTokenSecuritySnapshot({
        mintAddress,
      });
      const result: CheckTokenSecurityResult = {
        status: 'success',
        cached: false,
        mintAddress,
        summary: formatTokenSecuritySummary(data),
        data,
      };

      await cache.set(cacheKey, result);

      return result;
    },
  };
}

function normalizeMintAddress(mintAddress: string): string {
  const normalizedMintAddress = mintAddress.trim();

  if (!normalizedMintAddress) {
    throw new Error('A valid token mint address is required.');
  }

  try {
    return new PublicKey(normalizedMintAddress).toBase58();
  } catch {
    throw new Error('A valid token mint address is required.');
  }
}

function formatTokenSecuritySummary(snapshot: TokenSecuritySnapshot): string {
  const lines = [
    `${formatTokenLabel(snapshot)} (mint: ${shortenMintAddress(snapshot.mintAddress)})`,
    `RugCheck Score: ${snapshot.trustScore}/100. ${formatStatusLine(snapshot)}`,
    `Top 10 holders own ${formatPercent(snapshot.topHolderConcentrationPct)}% of supply. ${ensureSentence(snapshot.assessment)}`,
  ];

  if (snapshot.warnings.length > 0) {
    lines.push(`Warnings: ${snapshot.warnings.join(', ')}.`);
  }

  return lines.join('\n');
}

function formatTokenLabel(snapshot: TokenSecuritySnapshot): string {
  const label = snapshot.tokenSymbol || snapshot.tokenName || 'UNKNOWN';

  return label.toUpperCase();
}

function formatStatusLine(snapshot: TokenSecuritySnapshot): string {
  const verificationLabel = snapshot.verificationSummary.trim().replace(/\.$/, '');
  const liquidityLabel = snapshot.liquiditySummary.trim().replace(/\.$/, '');
  const prefix = /^verified mint$/i.test(verificationLabel) ? '✅ ' : '⚠️ ';

  return `${prefix}${verificationLabel}, ${liquidityLabel}.`;
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function shortenMintAddress(mintAddress: string): string {
  return `${mintAddress.slice(0, 14)}...`;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
  }).format(value);
}

function mapRugCheckReportToSnapshot(
  report: RugCheckTokenReport,
  mintAddress: string,
): TokenSecuritySnapshot {
  const risks = mapRugCheckRisks(report.risks ?? []);
  const warnings = risks
    .filter((risk) => /warn|danger|high|critical/i.test(risk.level))
    .map((risk) => risk.name)
    .slice(0, 3);
  const trustScore = deriveTrustScore(report);
  const topHolderConcentrationPct = roundToTwo(
    (report.topHolders ?? [])
      .slice(0, DEFAULT_TOP_HOLDER_LIMIT)
      .reduce((totalPct, holder) => totalPct + (holder.pct ?? 0), 0),
  );
  const liquidityLockedPct = roundToOne(getHighestLockedLiquidityPct(report.markets ?? []));
  const tokenName =
    report.verification?.name ??
    report.tokenMeta?.name ??
    report.fileMeta?.name ??
    'Unknown Token';
  const tokenSymbol =
    report.tokenMeta?.symbol ??
    report.verification?.symbol ??
    report.fileMeta?.symbol ??
    tokenName;

  return {
    mintAddress,
    tokenName,
    tokenSymbol,
    trustScore,
    verificationSummary:
      report.verification?.jup_verified || report.verification?.jup_strict
        ? 'Verified mint'
        : 'Unverified mint',
    liquiditySummary:
      liquidityLockedPct > 0
        ? `liquidity locked across LP at ${formatPercent(liquidityLockedPct)}%`
        : 'no locked liquidity detected',
    topHolderConcentrationPct,
    assessment: deriveAssessment(trustScore, risks),
    warnings,
    risks,
  };
}

function mapRugCheckRisks(risks: RugCheckRisk[]): TokenSecurityRisk[] {
  return risks.map((risk) => ({
    description: risk.description ?? '',
    level: risk.level ?? 'unknown',
    name: risk.name ?? 'Unknown risk',
    score: risk.score ?? 0,
    value: risk.value ?? '',
  }));
}

function deriveTrustScore(report: RugCheckTokenReport): number {
  const normalizedScore =
    typeof report.score_normalised === 'number'
      ? report.score_normalised
      : typeof report.score === 'number'
        ? report.score
        : 100;

  return Math.max(0, Math.min(100, 100 - Math.round(normalizedScore)));
}

function getHighestLockedLiquidityPct(markets: RugCheckMarket[]): number {
  let highestLockedLiquidityPct = 0;

  for (const market of markets) {
    const marketLockedLiquidityPct = market.lp?.lpLockedPct ?? 0;

    if (marketLockedLiquidityPct > highestLockedLiquidityPct) {
      highestLockedLiquidityPct = marketLockedLiquidityPct;
    }
  }

  return highestLockedLiquidityPct;
}

function deriveAssessment(
  trustScore: number,
  risks: TokenSecurityRisk[],
): string {
  const hasDangerRisk = risks.some((risk) => /danger|high|critical/i.test(risk.level));

  if (hasDangerRisk || trustScore < 40) {
    return 'High risk.';
  }

  if (trustScore < 70) {
    return 'Use caution.';
  }

  return 'Appears legitimate.';
}

async function createRugCheckApiError(response: Response): Promise<Error> {
  const errorMessage = await readRugCheckErrorMessage(response);

  if (response.status === 404) {
    return new Error(`RugCheck could not find a token report for this mint. ${errorMessage}`.trim());
  }

  if (response.status === 429) {
    return new Error(
      `RugCheck free-tier rate limit hit while fetching token security. ${errorMessage}`.trim(),
    );
  }

  return new Error(
    `RugCheck token security request failed with status ${response.status}. ${errorMessage}`.trim(),
  );
}

async function readRugCheckErrorMessage(response: Response): Promise<string> {
  try {
    const responseBody = (await response.json()) as { error?: string };
    return responseBody.error ?? '';
  } catch {
    return '';
  }
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}