import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface QueryHistoryRow {
  id: string;
  user_id: string;
  session_id: string | null;
  intent: string;
  query_text: string;
  response_summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface QueryHistoryInsert {
  user_id: string;
  session_id?: string | null;
  intent: string;
  query_text: string;
  response_summary: string;
  metadata?: Record<string, unknown>;
}

export interface SkillCacheRow {
  cache_key: string;
  skill_name: string;
  value: Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationMemoryRow {
  id: string;
  user_id: string;
  session_id: string | null;
  memory_key: string;
  value: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SolsafeDatabase {
  public: {
    Tables: {
      conversation_memory: {
        Row: ConversationMemoryRow;
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          memory_key: string;
          value: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ConversationMemoryRow>;
        Relationships: [];
      };
      query_history: {
        Row: QueryHistoryRow;
        Insert: QueryHistoryInsert;
        Update: Partial<QueryHistoryRow>;
        Relationships: [];
      };
      skill_cache: {
        Row: SkillCacheRow;
        Insert: {
          cache_key: string;
          skill_name: string;
          value: Record<string, unknown>;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<SkillCacheRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface CreateSolsafeSupabaseClientOptions {
  supabaseServiceRoleKey?: string;
  supabaseUrl?: string;
}

export interface SupabaseEnv {
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
}

export type SolsafeSupabaseClient = SupabaseClient<SolsafeDatabase>;

export function getSupabaseEnv(): SupabaseEnv {
  return {
    supabaseUrl: process.env.SUPABASE_URL?.trim() ?? '',
    supabaseServiceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
  };
}

export function createSolsafeSupabaseClient(
  options: CreateSolsafeSupabaseClientOptions = {},
): SolsafeSupabaseClient {
  const env = getSupabaseEnv();
  const supabaseUrl = (options.supabaseUrl ?? env.supabaseUrl).trim();
  const supabaseServiceRoleKey =
    (options.supabaseServiceRoleKey ?? env.supabaseServiceRoleKey).trim();

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required to initialize the Supabase client.');
  }

  if (!supabaseServiceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required to initialize the Supabase client.',
    );
  }

  return createClient<SolsafeDatabase>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  });
}