import {
  createSolsafeSupabaseClient,
  type QueryHistoryInsert,
  type QueryHistoryRow,
} from './supabase.js';

interface QueryHistoryErrorLike {
  message: string;
}

interface QueryHistoryInsertSelectResult {
  data: QueryHistoryRow[] | null;
  error: QueryHistoryErrorLike | null;
}

interface QueryHistoryListResult {
  data: QueryHistoryRow[] | null;
  error: QueryHistoryErrorLike | null;
}

interface QueryHistoryInsertBuilder {
  select(columns: string): PromiseLike<QueryHistoryInsertSelectResult>;
}

interface QueryHistoryLimitBuilder {
  limit(limit: number): PromiseLike<QueryHistoryListResult>;
}

interface QueryHistoryOrderBuilder {
  order(column: string, options: { ascending: boolean }): QueryHistoryLimitBuilder;
}

interface QueryHistoryFilterBuilder {
  eq(column: string, value: string): QueryHistoryOrderBuilder;
}

interface QueryHistoryTableApi {
  insert(values: QueryHistoryInsert): QueryHistoryInsertBuilder;
  select(columns: string): QueryHistoryFilterBuilder;
}

export interface QueryHistorySupabaseClient {
  from(table: 'query_history'): QueryHistoryTableApi;
}

export interface SaveQueryHistoryEntryInput {
  intent: string;
  metadata?: Record<string, unknown>;
  queryText: string;
  responseSummary: string;
  sessionId?: string | null;
  userId: string;
}

export interface ListRecentQueryHistoryInput {
  limit?: number;
  userId: string;
}

export interface QueryHistoryStore {
  listRecentQueryHistory(
    input: ListRecentQueryHistoryInput,
  ): Promise<QueryHistoryRow[]>;
  saveQueryHistoryEntry(
    input: SaveQueryHistoryEntryInput,
  ): Promise<QueryHistoryRow>;
}

export interface CreateSupabaseQueryHistoryStoreOptions {
  supabaseClient?: QueryHistorySupabaseClient;
}

export { type QueryHistoryRow } from './supabase.js';

const DEFAULT_QUERY_HISTORY_LIMIT = 20;

export function createSupabaseQueryHistoryStore(
  options: CreateSupabaseQueryHistoryStoreOptions = {},
): QueryHistoryStore {
  const supabaseClient =
    options.supabaseClient ??
    (createSolsafeSupabaseClient() as unknown as QueryHistorySupabaseClient);

  return {
    async saveQueryHistoryEntry(input) {
      const queryHistoryInsert: QueryHistoryInsert = {
        user_id: normalizeRequiredValue(input.userId, 'userId'),
        session_id: normalizeOptionalValue(input.sessionId),
        intent: normalizeRequiredValue(input.intent, 'intent'),
        query_text: normalizeRequiredValue(input.queryText, 'queryText'),
        response_summary: normalizeRequiredValue(
          input.responseSummary,
          'responseSummary',
        ),
        metadata: input.metadata ?? {},
      };

      const { data, error } = await supabaseClient
        .from('query_history')
        .insert(queryHistoryInsert)
        .select('*');

      if (error) {
        throw new Error(
          `Failed to store query history in Supabase: ${error.message}`,
        );
      }

      const insertedRow = data?.[0];

      if (!insertedRow) {
        throw new Error('Failed to store query history in Supabase: no row returned.');
      }

      return insertedRow;
    },
    async listRecentQueryHistory(input) {
      const userId = normalizeRequiredValue(input.userId, 'userId');
      const limit = input.limit ?? DEFAULT_QUERY_HISTORY_LIMIT;

      const { data, error } = await supabaseClient
        .from('query_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(
          `Failed to read query history from Supabase: ${error.message}`,
        );
      }

      return data ?? [];
    },
  };
}

function normalizeRequiredValue(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required for query history storage.`);
  }

  return normalizedValue;
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}