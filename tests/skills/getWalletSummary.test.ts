import { describe, expect, it, vi } from 'vitest';

import { SOLSAFE_INTENTS } from '../../src/agents/solsafe-agent.js';
import {
  GET_WALLET_SUMMARY_SKILL_NAME,
  createInMemoryWalletSummaryCache,
  createGetWalletSummarySkill,
} from '../../src/skills/getWalletSummary.js';

describe('getWalletSummary skill', () => {
  it('formats a wallet summary that matches the SSOT conversation example fields', async () => {
    const walletAddress = 'GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME';
    const getWalletSummarySnapshot = vi.fn().mockResolvedValue({
      walletAddress,
      solBalance: 12.4,
      tokenHoldings: [
        { symbol: 'USDC', amount: 1_200 },
        { symbol: 'BONK', amount: 50_000 },
      ],
      walletAgeDays: 234,
      recentTransaction: {
        relativeTime: '2 hours ago',
        summary: 'sent 0.1 SOL to Jupiter',
      },
      recentTransactionCount: 12,
    });

    const skill = createGetWalletSummarySkill({
      dataSource: {
        getWalletSummarySnapshot,
      },
    });

    expect(skill.name).toBe(GET_WALLET_SUMMARY_SKILL_NAME);
    expect(skill.intent).toBe(SOLSAFE_INTENTS.WALLET_LOOKUP);
    expect(skill.description).toContain('SOL balance');
    await expect(skill.execute({ walletAddress })).resolves.toEqual({
      status: 'success',
      walletAddress,
      cached: false,
      summary: [
        `Wallet ${walletAddress} has been active for 234 days.`,
        'Current balance: 12.4 SOL, 1,200 USDC, and 50k BONK.',
        'Last transaction: 2 hours ago (sent 0.1 SOL to Jupiter).',
        'Recent transactions: 12 recent signatures observed.',
        'Risk assessment: No interactions with known scam contracts. ✅',
      ].join('\n'),
      data: {
        walletAddress,
        solBalance: 12.4,
        tokenHoldings: [
          { symbol: 'USDC', amount: 1_200 },
          { symbol: 'BONK', amount: 50_000 },
        ],
        walletAgeDays: 234,
        recentTransaction: {
          relativeTime: '2 hours ago',
          summary: 'sent 0.1 SOL to Jupiter',
        },
        recentTransactionCount: 12,
      },
    });
  });

  it('reuses a cached wallet summary on repeat lookups', async () => {
    const walletAddress = 'GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME';
    const getWalletSummarySnapshot = vi.fn().mockResolvedValue({
      walletAddress,
      solBalance: 3.25,
      tokenHoldings: [{ symbol: 'USDC', amount: 250 }],
      walletAgeDays: 45,
      recentTransaction: {
        relativeTime: '15 minutes ago',
        summary: 'received 250 USDC',
      },
    });
    const skill = createGetWalletSummarySkill({
      cache: createInMemoryWalletSummaryCache(),
      dataSource: {
        getWalletSummarySnapshot,
      },
    });

    const firstResult = await skill.execute({ walletAddress });
    const secondResult = await skill.execute({ walletAddress });

    expect(getWalletSummarySnapshot).toHaveBeenCalledTimes(1);
    expect(firstResult.cached).toBe(false);
    expect(secondResult.cached).toBe(true);
    expect(secondResult.summary).toBe(firstResult.summary);
  });
});