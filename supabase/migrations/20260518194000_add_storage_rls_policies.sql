create or replace function public.current_telegram_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'telegram_user_id', '');
$$;

alter table public.query_history
  add column if not exists telegram_user_id text generated always as (
    case
      when user_id like 'telegram:%' then substr(user_id, 10)
      else null
    end
  ) stored;

create index if not exists query_history_telegram_user_id_created_at_idx
  on public.query_history (telegram_user_id, created_at desc);

alter table public.conversation_memory
  add column if not exists telegram_user_id text generated always as (
    case
      when user_id like 'telegram:%' then substr(user_id, 10)
      else null
    end
  ) stored;

create index if not exists conversation_memory_telegram_user_id_memory_key_idx
  on public.conversation_memory (telegram_user_id, memory_key);

alter table public.query_history enable row level security;
alter table public.conversation_memory enable row level security;
alter table public.skill_cache enable row level security;

drop policy if exists "Users can view their own query history" on public.query_history;
drop policy if exists "Users can insert their own query history" on public.query_history;
drop policy if exists "Users can update their own query history" on public.query_history;
drop policy if exists "Users can delete their own query history" on public.query_history;

create policy "Users can view their own query history"
on public.query_history
for select
to authenticated
using ( (select public.current_telegram_user_id()) = telegram_user_id );

create policy "Users can insert their own query history"
on public.query_history
for insert
to authenticated
with check ( (select public.current_telegram_user_id()) = telegram_user_id );

create policy "Users can update their own query history"
on public.query_history
for update
to authenticated
using ( (select public.current_telegram_user_id()) = telegram_user_id )
with check ( (select public.current_telegram_user_id()) = telegram_user_id );

create policy "Users can delete their own query history"
on public.query_history
for delete
to authenticated
using ( (select public.current_telegram_user_id()) = telegram_user_id );

drop policy if exists "Users can view their own conversation memory" on public.conversation_memory;
drop policy if exists "Users can insert their own conversation memory" on public.conversation_memory;
drop policy if exists "Users can update their own conversation memory" on public.conversation_memory;
drop policy if exists "Users can delete their own conversation memory" on public.conversation_memory;

create policy "Users can view their own conversation memory"
on public.conversation_memory
for select
to authenticated
using ( (select public.current_telegram_user_id()) = telegram_user_id );

create policy "Users can insert their own conversation memory"
on public.conversation_memory
for insert
to authenticated
with check ( (select public.current_telegram_user_id()) = telegram_user_id );

create policy "Users can update their own conversation memory"
on public.conversation_memory
for update
to authenticated
using ( (select public.current_telegram_user_id()) = telegram_user_id )
with check ( (select public.current_telegram_user_id()) = telegram_user_id );

create policy "Users can delete their own conversation memory"
on public.conversation_memory
for delete
to authenticated
using ( (select public.current_telegram_user_id()) = telegram_user_id );