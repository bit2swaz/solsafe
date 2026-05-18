import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSupabaseIdentityBridge,
  type IdentityBridgeSupabaseClient,
  type IdentityLinkRow,
} from '../src/lib/identity-bridge.js';

const LINKED_IDENTITY: IdentityLinkRow = {
  linked_at: '2026-05-18T20:00:00.000Z',
  telegram_user_id: '42',
  updated_at: '2026-05-18T20:00:00.000Z',
  wallet_address: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
};

describe('identity bridge store', () => {
  let selectMock: ReturnType<typeof vi.fn>;
  let upsertMock: ReturnType<typeof vi.fn>;
  let fromMock: ReturnType<typeof vi.fn>;
  let supabaseClient: IdentityBridgeSupabaseClient;

  beforeEach(() => {
    selectMock = vi.fn();
    upsertMock = vi.fn();
    fromMock = vi.fn((tableName: string) => {
      if (tableName === 'identity_links') {
        return {
          select: selectMock,
          upsert: upsertMock,
        };
      }

      throw new Error(`Unexpected table requested in test: ${tableName}`);
    });

    supabaseClient = {
      from: fromMock as unknown as IdentityBridgeSupabaseClient['from'],
    };
  });

  it('links a Telegram user id to a verified wallet address with an upsert', async () => {
    const upsertSelectMock = vi.fn().mockResolvedValue({
      data: [LINKED_IDENTITY],
      error: null,
    });
    upsertMock.mockReturnValue({
      select: upsertSelectMock,
    });
    const bridge = createSupabaseIdentityBridge({ supabaseClient });

    await expect(
      bridge.linkTelegramToWallet(
        '42',
        '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
      ),
    ).resolves.toEqual(LINKED_IDENTITY);

    expect(fromMock).toHaveBeenCalledWith('identity_links');
    expect(upsertMock).toHaveBeenCalledWith(
      {
        telegram_user_id: '42',
        wallet_address: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
      },
      {
        onConflict: 'telegram_user_id',
      },
    );
    expect(upsertSelectMock).toHaveBeenCalledWith('*');
  });

  it('retrieves the linked wallet address for a Telegram user id', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [LINKED_IDENTITY],
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ limit: limitMock });
    selectMock.mockReturnValue({ eq: eqMock });
    const bridge = createSupabaseIdentityBridge({ supabaseClient });

    await expect(bridge.getWalletByTelegramId('42')).resolves.toBe(
      '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    );

    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqMock).toHaveBeenCalledWith('telegram_user_id', '42');
    expect(limitMock).toHaveBeenCalledWith(1);
  });

  it('lists linked Telegram ids for a signed wallet address', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [
        LINKED_IDENTITY,
        {
          ...LINKED_IDENTITY,
          telegram_user_id: '84',
          updated_at: '2026-05-18T20:01:00.000Z',
        },
      ],
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ limit: limitMock });
    selectMock.mockReturnValue({ eq: eqMock });
    const bridge = createSupabaseIdentityBridge({ supabaseClient });

    await expect(
      bridge.listTelegramIdsByWallet(
        '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
      ),
    ).resolves.toEqual(['42', '84']);

    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqMock).toHaveBeenCalledWith(
      'wallet_address',
      '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    );
    expect(limitMock).toHaveBeenCalledWith(25);
  });
});