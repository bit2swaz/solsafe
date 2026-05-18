import { afterEach, describe, expect, it, vi } from 'vitest';

import { SOLSAFE_INTENTS } from '../../src/agents/solsafe-agent.js';
import {
  CHECK_TOKEN_SECURITY_SKILL_NAME,
  createCheckTokenSecuritySkill,
  createInMemoryTokenSecurityCache,
  createRugCheckTokenSecurityDataSource,
} from '../../src/skills/checkTokenSecurity.js';

describe('checkTokenSecurity skill', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('formats a token security summary that matches the SSOT conversation example fields', async () => {
    const mintAddress = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const getTokenSecuritySnapshot = vi.fn().mockResolvedValue({
      mintAddress,
      tokenName: 'BONK',
      tokenSymbol: 'BONK',
      trustScore: 92,
      verificationSummary: 'Verified mint',
      liquiditySummary: 'liquidity locked for 1 year',
      topHolderConcentrationPct: 18,
      assessment: 'Appears legitimate.',
      warnings: [],
      risks: [],
    });

    const skill = createCheckTokenSecuritySkill({
      dataSource: {
        getTokenSecuritySnapshot,
      },
    });

    expect(skill.name).toBe(CHECK_TOKEN_SECURITY_SKILL_NAME);
    expect(skill.intent).toBe(SOLSAFE_INTENTS.TOKEN_SECURITY);
    expect(skill.description).toContain('RugCheck');
    await expect(skill.execute({ mintAddress })).resolves.toEqual({
      status: 'success',
      cached: false,
      mintAddress,
      summary: [
        'BONK (mint: DezXAZ8z7PnrnR...)',
        'RugCheck Score: 92/100. ✅ Verified mint, liquidity locked for 1 year.',
        'Top 10 holders own 18% of supply. Appears legitimate.',
      ].join('\n'),
      data: {
        mintAddress,
        tokenName: 'BONK',
        tokenSymbol: 'BONK',
        trustScore: 92,
        verificationSummary: 'Verified mint',
        liquiditySummary: 'liquidity locked for 1 year',
        topHolderConcentrationPct: 18,
        assessment: 'Appears legitimate.',
        warnings: [],
        risks: [],
      },
    });
  });

  it('reuses a cached token security summary on repeat lookups', async () => {
    const mintAddress = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const getTokenSecuritySnapshot = vi.fn().mockResolvedValue({
      mintAddress,
      tokenName: 'BONK',
      tokenSymbol: 'BONK',
      trustScore: 92,
      verificationSummary: 'Verified mint',
      liquiditySummary: 'liquidity locked for 1 year',
      topHolderConcentrationPct: 18,
      assessment: 'Appears legitimate.',
      warnings: [],
      risks: [],
    });

    const skill = createCheckTokenSecuritySkill({
      cache: createInMemoryTokenSecurityCache(),
      dataSource: {
        getTokenSecuritySnapshot,
      },
    });

    const firstResult = await skill.execute({ mintAddress });
    const secondResult = await skill.execute({ mintAddress });

    expect(getTokenSecuritySnapshot).toHaveBeenCalledTimes(1);
    expect(firstResult.cached).toBe(false);
    expect(secondResult.cached).toBe(true);
    expect(secondResult.summary).toBe(firstResult.summary);
  });

  it('maps the RugCheck report endpoint into a token security snapshot', async () => {
    const mintAddress = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mint: mintAddress,
        score: 101,
        score_normalised: 7,
        tokenMeta: {
          name: 'Bonk',
          symbol: 'Bonk',
        },
        verification: {
          mint: mintAddress,
          name: 'Bonk',
          symbol: 'bonk',
          jup_verified: true,
          jup_strict: true,
        },
        risks: [
          {
            name: 'Mutable metadata',
            description: 'Token metadata can be changed by the owner',
            level: 'warn',
            score: 100,
            value: '',
          },
        ],
        topHolders: [
          { pct: 7.95 },
          { pct: 5.35 },
          { pct: 5.35 },
          { pct: 4.8 },
          { pct: 4.75 },
          { pct: 4.3 },
          { pct: 4.1 },
          { pct: 3.7 },
          { pct: 2.8 },
          { pct: 2.46 },
        ],
        markets: [
          {
            lp: {
              lpLockedPct: 58.14,
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const dataSource = createRugCheckTokenSecurityDataSource();
    const snapshot = await dataSource.getTokenSecuritySnapshot({
      mintAddress,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report`,
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: 'application/json',
        }),
        method: 'GET',
      }),
    );
    expect(snapshot).toEqual({
      mintAddress,
      tokenName: 'Bonk',
      tokenSymbol: 'Bonk',
      trustScore: 93,
      verificationSummary: 'Verified mint',
      liquiditySummary: 'liquidity locked across LP at 58.1%',
      topHolderConcentrationPct: 45.56,
      assessment: 'Appears legitimate.',
      warnings: ['Mutable metadata'],
      risks: [
        {
          name: 'Mutable metadata',
          description: 'Token metadata can be changed by the owner',
          level: 'warn',
          score: 100,
          value: '',
        },
      ],
    });
  });
});