import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}), { virtual: true });

import { getDashboardSnapshot } from '../../src/lib/dashboard-data';

describe('dashboard data', () => {
  it('returns linked Telegram bot history for the signed-in SIWS wallet', async () => {
    const getWalletSummary = vi.fn().mockResolvedValue({
      cached: false,
      data: {
        recentTransaction: {
          relativeTime: '2 hours ago',
          summary: 'sent 0.1 SOL to Jupiter',
        },
        recentTransactionCount: 12,
        solBalance: 12.4,
        tokenHoldings: [
          { amount: 1_200, symbol: 'USDC' },
          { amount: 50_000, symbol: 'BONK' },
        ],
        walletAddress: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
        walletAgeDays: 234,
      },
      status: 'success',
      summary: [
        'Wallet 6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8 has been active for 234 days.',
        'Current balance: 12.4 SOL, 1,200 USDC, and 50k BONK.',
        'Last transaction: 2 hours ago (sent 0.1 SOL to Jupiter).',
        'Recent transactions: 12 recent signatures observed.',
        'Risk assessment: No interactions with known scam contracts. ✅',
      ].join('\n'),
      walletAddress: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    });
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
        walletSummaryService: {
          getWalletSummary,
        },
      },
    );

    expect(snapshot.historyState).toBe('live');
    expect(snapshot.health).toEqual(
      expect.objectContaining({
        summary: expect.stringContaining(
          'Recent transactions: 12 recent signatures observed.',
        ),
        title: '6WJw...dAm8 on-chain summary',
      }),
    );
    expect(snapshot.health.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caption: 'Wallet has been active for 234 days.',
          label: 'Wallet age',
          value: expect.any(Number),
        }),
        expect.objectContaining({
          caption: 'Current balance: 12.4 SOL, 1,200 USDC, and 50k BONK.',
          label: 'Current balance',
          value: expect.any(Number),
        }),
        expect.objectContaining({
          caption: 'Recent transactions: 12 recent signatures observed.',
          label: 'Recent transactions',
          value: expect.any(Number),
        }),
      ]),
    );
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
    expect(getWalletSummary).toHaveBeenCalledWith(
      '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    );
  });

  it('returns live wallet health for an authenticated wallet even when no history exists yet', async () => {
    const getWalletSummary = vi.fn().mockResolvedValue({
      cached: false,
      data: {
        recentTransaction: {
          relativeTime: '15 minutes ago',
          summary: 'received 250 USDC',
        },
        recentTransactionCount: 4,
        solBalance: 3.25,
        tokenHoldings: [{ amount: 250, symbol: 'USDC' }],
        walletAddress: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
        walletAgeDays: 45,
      },
      status: 'success',
      summary: [
        'Wallet 6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8 has been active for 45 days.',
        'Current balance: 3.25 SOL and 250 USDC.',
        'Last transaction: 15 minutes ago (received 250 USDC).',
        'Recent transactions: 4 recent signatures observed.',
        'Risk assessment: No interactions with known scam contracts. ✅',
      ].join('\n'),
      walletAddress: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    });

    const snapshot = await getDashboardSnapshot(
      '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
      {
        identityBridge: {
          listTelegramIdsByWallet: vi.fn().mockResolvedValue([]),
        },
        queryHistoryStore: {
          getQueryHistory: vi
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]),
        },
        walletSummaryService: {
          getWalletSummary,
        },
      },
    );

    expect(snapshot.historyState).toBe('empty');
    expect(snapshot.history).toEqual([]);
    expect(snapshot.health.band).not.toBe('Cold start');
    expect(snapshot.health.summary).toContain(
      'Recent transactions: 4 recent signatures observed.',
    );
    expect(snapshot.health.title).toBe('6WJw...dAm8 on-chain summary');
  });
});