import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}), { virtual: true });

import { getDashboardSnapshot } from '../../src/lib/dashboard-data';

describe('dashboard data', () => {
  it('returns linked Telegram bot history for the signed-in SIWS wallet', async () => {
    const getQueryHistory = vi
      .fn()
      .mockResolvedValueOnce([
        {
          created_at: '2026-05-18T20:12:00.000Z',
          id: 'wallet-linked-history',
          intent: 'wallet_lookup',
          linked_wallet_address: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
          metadata: { source: 'telegram' },
          query_text: 'check wallet 8vFzX...',
          response_summary:
            'Wallet 8vFzX... has been active for 234 days and was linked from Telegram.',
          session_id: 'telegram-chat:9001',
          telegram_user_id: '42',
          user_id: 'telegram:42',
        },
      ])
      .mockResolvedValueOnce([
        {
          created_at: '2026-05-18T20:15:00.000Z',
          id: 'telegram-history',
          intent: 'token_security',
          linked_wallet_address: null,
          metadata: { source: 'telegram' },
          query_text: 'is BONK safe?',
          response_summary: 'BONK scores 92/100 on RugCheck.',
          session_id: 'telegram-chat:9001',
          telegram_user_id: '42',
          user_id: 'telegram:42',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const snapshot = await getDashboardSnapshot(
      '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
      {
        identityBridge: {
          listTelegramIdsByWallet: vi.fn().mockResolvedValue(['42']),
        },
        queryHistoryStore: {
          getQueryHistory,
        },
      },
    );

    expect(snapshot.historyState).toBe('live');
    expect(snapshot.history).toEqual([
      {
        createdAt: '2026-05-18T20:15:00.000Z',
        id: 'telegram-history',
        intent: 'token_security',
        queryText: 'is BONK safe?',
        responseSummary: 'BONK scores 92/100 on RugCheck.',
        source: 'telegram',
      },
      {
        createdAt: '2026-05-18T20:12:00.000Z',
        id: 'wallet-linked-history',
        intent: 'wallet_lookup',
        queryText: 'check wallet 8vFzX...',
        responseSummary:
          'Wallet 8vFzX... has been active for 234 days and was linked from Telegram.',
        source: 'telegram',
      },
    ]);
    expect(getQueryHistory).toHaveBeenNthCalledWith(1, {
      limit: 6,
      linkedWalletAddress: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    });
    expect(getQueryHistory).toHaveBeenNthCalledWith(2, {
      limit: 6,
      telegramUserId: '42',
    });
    expect(getQueryHistory).toHaveBeenNthCalledWith(3, {
      limit: 6,
      userId: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    });
    expect(getQueryHistory).toHaveBeenNthCalledWith(4, {
      limit: 6,
      userId: 'wallet:6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    });
  });
});