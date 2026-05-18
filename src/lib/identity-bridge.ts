import { PublicKey } from '@solana/web3.js';

import {
  createSolsafeSupabaseClient,
  type IdentityLinkInsert,
  type IdentityLinkRow,
} from './supabase.js';

interface IdentityBridgeErrorLike {
  message: string;
}

interface IdentityBridgeSelectResult {
  data: IdentityLinkRow[] | null;
  error: IdentityBridgeErrorLike | null;
}

interface IdentityBridgeUpsertBuilder {
  select(columns: string): PromiseLike<IdentityBridgeSelectResult>;
}

interface IdentityBridgeLimitBuilder {
  limit(limit: number): PromiseLike<IdentityBridgeSelectResult>;
}

interface IdentityBridgeFilterBuilder {
  eq(column: string, value: string): IdentityBridgeLimitBuilder;
}

interface IdentityBridgeTableApi {
  select(columns: string): IdentityBridgeFilterBuilder;
  upsert(
    values: IdentityLinkInsert,
    options: { onConflict: string },
  ): IdentityBridgeUpsertBuilder;
}

export interface IdentityBridgeSupabaseClient {
  from(table: 'identity_links'): IdentityBridgeTableApi;
}

export interface IdentityBridgeStore {
  getWalletByTelegramId(telegramUserId: string): Promise<string | null>;
  linkTelegramToWallet(
    telegramUserId: string,
    walletAddress: string,
  ): Promise<IdentityLinkRow>;
  listTelegramIdsByWallet(walletAddress: string): Promise<string[]>;
}

export interface CreateSupabaseIdentityBridgeOptions {
  supabaseClient?: IdentityBridgeSupabaseClient;
}

export { type IdentityLinkRow } from './supabase.js';

const DEFAULT_WALLET_LINK_LIMIT = 25;

export function createSupabaseIdentityBridge(
  options: CreateSupabaseIdentityBridgeOptions = {},
): IdentityBridgeStore {
  const supabaseClient =
    options.supabaseClient ??
    (createSolsafeSupabaseClient() as unknown as IdentityBridgeSupabaseClient);

  return {
    async linkTelegramToWallet(telegramUserId, walletAddress) {
      const identityLinkInsert: IdentityLinkInsert = {
        telegram_user_id: normalizeTelegramUserId(telegramUserId),
        wallet_address: normalizeWalletAddress(walletAddress),
      };

      const { data, error } = await supabaseClient
        .from('identity_links')
        .upsert(identityLinkInsert, {
          onConflict: 'telegram_user_id',
        })
        .select('*');

      if (error) {
        throw new Error(
          `Failed to store Telegram identity link in Supabase: ${error.message}`,
        );
      }

      const linkedRow = data?.[0];

      if (!linkedRow) {
        throw new Error(
          'Failed to store Telegram identity link in Supabase: no row returned.',
        );
      }

      return linkedRow;
    },
    async getWalletByTelegramId(telegramUserId) {
      const { data, error } = await supabaseClient
        .from('identity_links')
        .select('*')
        .eq('telegram_user_id', normalizeTelegramUserId(telegramUserId))
        .limit(1);

      if (error) {
        throw new Error(
          `Failed to read Telegram identity link from Supabase: ${error.message}`,
        );
      }

      return data?.[0]?.wallet_address ?? null;
    },
    async listTelegramIdsByWallet(walletAddress) {
      const { data, error } = await supabaseClient
        .from('identity_links')
        .select('*')
        .eq('wallet_address', normalizeWalletAddress(walletAddress))
        .limit(DEFAULT_WALLET_LINK_LIMIT);

      if (error) {
        throw new Error(
          `Failed to read Telegram identity links from Supabase: ${error.message}`,
        );
      }

      return (data ?? []).map((row) => row.telegram_user_id);
    },
  };
}

function normalizeTelegramUserId(telegramUserId: string): string {
  const normalizedValue = telegramUserId.trim();
  const unprefixedValue = normalizedValue.startsWith('telegram:')
    ? normalizedValue.slice('telegram:'.length)
    : normalizedValue;

  if (!unprefixedValue) {
    throw new Error('telegramUserId is required for Telegram identity linking.');
  }

  return unprefixedValue;
}

function normalizeWalletAddress(walletAddress: string): string {
  const normalizedValue = walletAddress.trim();

  if (!normalizedValue) {
    throw new Error('walletAddress is required for Telegram identity linking.');
  }

  try {
    return new PublicKey(normalizedValue).toBase58();
  } catch {
    throw new Error(
      'walletAddress must be a valid Solana wallet address for Telegram identity linking.',
    );
  }
}