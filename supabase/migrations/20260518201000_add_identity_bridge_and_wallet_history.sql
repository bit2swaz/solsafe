create table if not exists public.identity_links (
  telegram_user_id text primary key,
  wallet_address text not null,
  linked_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists identity_links_wallet_address_idx
  on public.identity_links (wallet_address);

alter table public.identity_links enable row level security;

alter table public.query_history
  add column if not exists linked_wallet_address text;

create index if not exists query_history_linked_wallet_address_created_at_idx
  on public.query_history (linked_wallet_address, created_at desc);

update public.query_history as history
set linked_wallet_address = identity.wallet_address
from public.identity_links as identity
where history.telegram_user_id = identity.telegram_user_id
  and history.linked_wallet_address is null;