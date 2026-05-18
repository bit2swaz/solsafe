create extension if not exists pgcrypto;

create table if not exists public.query_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id text,
  intent text not null,
  query_text text not null,
  response_summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists query_history_user_id_created_at_idx
  on public.query_history (user_id, created_at desc);

create table if not exists public.skill_cache (
  cache_key text primary key,
  skill_name text not null,
  value jsonb not null,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists skill_cache_skill_name_expires_at_idx
  on public.skill_cache (skill_name, expires_at);

create table if not exists public.conversation_memory (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id text,
  memory_key text not null,
  value jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists conversation_memory_user_id_memory_key_idx
  on public.conversation_memory (user_id, memory_key);