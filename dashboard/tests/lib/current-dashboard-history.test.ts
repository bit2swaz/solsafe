import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}), { virtual: true });

import { getCurrentDashboardHistory } from '../../src/lib/current-dashboard-history';

describe('current dashboard history helper', () => {
  it('returns the signed-in SIWS user history snapshot', async () => {
    const getDashboardSnapshot = vi.fn().mockResolvedValue({
      health: {
        band: 'Stable',
        metrics: [],
        score: 88,
        summary: 'live',
        title: 'wallet',
      },
      history: [
        {
          createdAt: '2026-05-18T20:15:00.000Z',
          id: 'telegram-history',
          intent: 'token_security',
          queryText: 'is BONK safe?',
          responseSummary: 'BONK scores 92/100 on RugCheck.',
          source: 'telegram',
        },
      ],
      historyState: 'live',
    });

    await expect(
      getCurrentDashboardHistory({
        getDashboardSnapshot,
        readDashboardSession: vi.fn().mockResolvedValue({
          address: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
          domain: 'dashboard.solsafe.local',
          issuedAt: '2026-05-18T20:00:00.000Z',
        }),
      }),
    ).resolves.toEqual({
      address: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
      history: [
        {
          createdAt: '2026-05-18T20:15:00.000Z',
          id: 'telegram-history',
          intent: 'token_security',
          queryText: 'is BONK safe?',
          responseSummary: 'BONK scores 92/100 on RugCheck.',
          source: 'telegram',
        },
      ],
      historyState: 'live',
    });

    expect(getDashboardSnapshot).toHaveBeenCalledWith(
      '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    );
  });

  it('returns null when there is no active SIWS session', async () => {
    await expect(
      getCurrentDashboardHistory({
        getDashboardSnapshot: vi.fn(),
        readDashboardSession: vi.fn().mockResolvedValue(null),
      }),
    ).resolves.toBeNull();
  });
});