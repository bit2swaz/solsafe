import { createSolsafeSupabaseClient } from './supabase.js';

interface RateLimitErrorLike {
  message: string;
}

interface RateLimitQueryRow {
  created_at: string;
  id: string;
}

interface RateLimitQueryResult {
  data: RateLimitQueryRow[] | null;
  error: RateLimitErrorLike | null;
}

interface RateLimitLimitBuilder {
  limit(limit: number): PromiseLike<RateLimitQueryResult>;
}

interface RateLimitOrderBuilder {
  order(column: string, options: { ascending: boolean }): RateLimitLimitBuilder;
}

interface RateLimitGteBuilder {
  gte(column: string, value: string): RateLimitOrderBuilder;
}

interface RateLimitEqBuilder {
  eq(column: 'user_id', value: string): RateLimitGteBuilder;
}

interface RateLimitTableApi {
  select(columns: string): RateLimitEqBuilder;
}

export interface RateLimitSupabaseClient {
  from(table: 'query_history'): RateLimitTableApi;
}

export interface RateLimitCheckInput {
  userId: string;
}

export interface SolsafeRateLimiter {
  assertWithinRateLimit(input: RateLimitCheckInput): Promise<void>;
}

export interface CreateSupabaseRateLimiterOptions {
  maxRequests?: number;
  now?: () => Date;
  supabaseClient?: RateLimitSupabaseClient;
  windowMs?: number;
}

const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 5;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

export function createSupabaseRateLimiter(
  options: CreateSupabaseRateLimiterOptions = {},
): SolsafeRateLimiter {
  const maxRequests = normalizePositiveInteger(
    options.maxRequests ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    'maxRequests',
  );
  const now = options.now ?? (() => new Date());
  const supabaseClient =
    options.supabaseClient ??
    (createSolsafeSupabaseClient() as unknown as RateLimitSupabaseClient);
  const windowMs = normalizePositiveInteger(
    options.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
    'windowMs',
  );

  return {
    async assertWithinRateLimit(input) {
      const userId = normalizeRequiredValue(input.userId, 'userId');
      const currentTime = now();
      const windowStart = new Date(currentTime.getTime() - windowMs).toISOString();
      const { data, error } = await supabaseClient
        .from('query_history')
        .select('id, created_at')
        .eq('user_id', userId)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: false })
        .limit(maxRequests);

      if (error) {
        throw new Error(
          `Failed to read Supabase rate-limit state: ${error.message}`,
        );
      }

      const requests = data ?? [];

      if (requests.length < maxRequests) {
        return;
      }

      const retryAfterSeconds = calculateRetryAfterSeconds({
        currentTime,
        requests,
        windowMs,
      });

      throw new Error(
        `Per-user rate limit exceeded for ${userId}. Retry after ${retryAfterSeconds} seconds.`,
      );
    },
  };
}

function calculateRetryAfterSeconds(input: {
  currentTime: Date;
  requests: RateLimitQueryRow[];
  windowMs: number;
}): number {
  const oldestRequest = input.requests.at(-1);
  const oldestRequestTimestamp = oldestRequest
    ? Date.parse(oldestRequest.created_at)
    : Number.NaN;

  if (!Number.isFinite(oldestRequestTimestamp)) {
    return Math.max(1, Math.ceil(input.windowMs / 1000));
  }

  const retryAfterMs = oldestRequestTimestamp + input.windowMs - input.currentTime.getTime();

  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer for rate limiting.`);
  }

  return value;
}

function normalizeRequiredValue(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required for per-user rate limiting.`);
  }

  return normalizedValue;
}