import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const RLS_MIGRATION_PATH = new URL(
  '../../supabase/migrations/20260518194000_add_storage_rls_policies.sql',
  import.meta.url,
);

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('storage RLS migration', () => {
  it('adds Telegram ownership columns and enables RLS on storage tables', () => {
    expect(existsSync(RLS_MIGRATION_PATH)).toBe(true);

    const sql = normalizeSql(readFileSync(RLS_MIGRATION_PATH, 'utf8'));

    expect(sql).toContain(
      "create or replace function public.current_telegram_user_id() returns text",
    );
    expect(sql).toContain(
      "alter table public.query_history add column if not exists telegram_user_id text generated always as",
    );
    expect(sql).toContain(
      "alter table public.conversation_memory add column if not exists telegram_user_id text generated always as",
    );
    expect(sql).toContain(
      'alter table public.query_history enable row level security;',
    );
    expect(sql).toContain(
      'alter table public.conversation_memory enable row level security;',
    );
    expect(sql).toContain(
      'alter table public.skill_cache enable row level security;',
    );
  });

  it('restricts query history and memory access to the matching telegram_user_id claim', () => {
    const sql = normalizeSql(readFileSync(RLS_MIGRATION_PATH, 'utf8'));

    expect(sql).toContain(
      "select nullif(auth.jwt() ->> 'telegram_user_id', '');",
    );
    expect(sql).toContain(
      'create policy "Users can view their own query history" on public.query_history for select to authenticated using ( (select public.current_telegram_user_id()) = telegram_user_id );',
    );
    expect(sql).toContain(
      'create policy "Users can insert their own query history" on public.query_history for insert to authenticated with check ( (select public.current_telegram_user_id()) = telegram_user_id );',
    );
    expect(sql).toContain(
      'create policy "Users can update their own query history" on public.query_history for update to authenticated using ( (select public.current_telegram_user_id()) = telegram_user_id ) with check ( (select public.current_telegram_user_id()) = telegram_user_id );',
    );
    expect(sql).toContain(
      'create policy "Users can delete their own query history" on public.query_history for delete to authenticated using ( (select public.current_telegram_user_id()) = telegram_user_id );',
    );
    expect(sql).toContain(
      'create policy "Users can view their own conversation memory" on public.conversation_memory for select to authenticated using ( (select public.current_telegram_user_id()) = telegram_user_id );',
    );
    expect(sql).toContain(
      'create policy "Users can insert their own conversation memory" on public.conversation_memory for insert to authenticated with check ( (select public.current_telegram_user_id()) = telegram_user_id );',
    );
    expect(sql).toContain(
      'create policy "Users can update their own conversation memory" on public.conversation_memory for update to authenticated using ( (select public.current_telegram_user_id()) = telegram_user_id ) with check ( (select public.current_telegram_user_id()) = telegram_user_id );',
    );
    expect(sql).toContain(
      'create policy "Users can delete their own conversation memory" on public.conversation_memory for delete to authenticated using ( (select public.current_telegram_user_id()) = telegram_user_id );',
    );
  });
});