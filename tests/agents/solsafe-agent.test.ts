import type { BaseMemory } from '@langchain/core/memory';
import { describe, expect, it, vi } from 'vitest';

import {
  SOLSAFE_INTENTS,
  SOLSAFE_MEMORY_KEY,
  createSolsafeAgent,
  executeSolsafeTurn,
  type SolsafeSkill,
  type SolsafeRateLimiter,
} from '../../src/agents/solsafe-agent.js';
import {
  ASSESS_WALLET_RISK_SKILL_NAME,
  createAssessWalletRiskSkill,
} from '../../src/skills/assessWalletRisk.js';
import { CHECK_TOKEN_SECURITY_SKILL_NAME } from '../../src/skills/checkTokenSecurity.js';
import { EXPLAIN_PROGRAM_LOGS_SKILL_NAME } from '../../src/skills/explainProgramLogs.js';
import {
  GET_WHALE_ALERTS_SKILL_NAME,
  createGetWhaleAlertsSkill,
} from '../../src/skills/getWhaleAlerts.js';
import { GET_WALLET_SUMMARY_SKILL_NAME } from '../../src/skills/getWalletSummary.js';
import {
  NATURAL_LANGUAGE_SWAP_SKILL_NAME,
  createNaturalLanguageSwapSkill,
} from '../../src/skills/naturalLanguageSwap.js';
import { SIMULATE_TRANSACTION_SKILL_NAME } from '../../src/skills/simulateTransaction.js';

function createMemoryStub(): BaseMemory {
  return {
    memoryKeys: [SOLSAFE_MEMORY_KEY],
    loadMemoryVariables: vi
      .fn()
      .mockResolvedValue({ [SOLSAFE_MEMORY_KEY]: [] }),
    saveContext: vi.fn().mockResolvedValue(undefined),
  } as unknown as BaseMemory;
}

function createRateLimiterStub(): SolsafeRateLimiter {
  return {
    assertWithinRateLimit: vi.fn().mockResolvedValue(undefined),
  };
}

describe('solsafe agent', () => {
  it('creates an agent with initialized memory', async () => {
    const memory = createMemoryStub();
    const agent = createSolsafeAgent({
      memory,
      rateLimiter: createRateLimiterStub(),
    });
    const memoryVariables = await agent.memory.loadMemoryVariables({
      userId: 'telegram:1234',
    });

    expect(agent).toBeDefined();
    expect(agent.memory).toBe(memory);
    expect(agent.memoryKey).toBe(SOLSAFE_MEMORY_KEY);
    expect(memoryVariables).toHaveProperty(SOLSAFE_MEMORY_KEY);
  });

  it('allows injecting a memory instance', () => {
    const memory = createMemoryStub();
    const agent = createSolsafeAgent({
      memory,
      rateLimiter: createRateLimiterStub(),
    });

    expect(agent.memory).toBe(memory);
  });

  it('delegates per-user rate limiting to the configured limiter', async () => {
    const rateLimiter = createRateLimiterStub();
    const agent = createSolsafeAgent({
      memory: createMemoryStub(),
      rateLimiter,
    });

    await agent.assertWithinRateLimit({ userId: 'telegram:1234' });

    expect(rateLimiter.assertWithinRateLimit).toHaveBeenCalledWith({
      userId: 'telegram:1234',
    });
  });

  it('registers only the four phase 1 MVP skills by default', () => {
    const agent = createSolsafeAgent({
      memory: createMemoryStub(),
      rateLimiter: createRateLimiterStub(),
    });

    expect(agent.skills.map((skill) => skill.name)).toEqual([
      GET_WALLET_SUMMARY_SKILL_NAME,
      CHECK_TOKEN_SECURITY_SKILL_NAME,
      SIMULATE_TRANSACTION_SKILL_NAME,
      EXPLAIN_PROGRAM_LOGS_SKILL_NAME,
    ]);
    expect(agent.skills[0]?.name).toBe(GET_WALLET_SUMMARY_SKILL_NAME);
    expect(agent.getSkillForIntent(SOLSAFE_INTENTS.WALLET_LOOKUP)?.name).toBe(
      GET_WALLET_SUMMARY_SKILL_NAME,
    );
    expect(agent.getSkillForIntent(SOLSAFE_INTENTS.TOKEN_SECURITY)?.name).toBe(
      CHECK_TOKEN_SECURITY_SKILL_NAME,
    );
    expect(
      agent.getSkillForIntent(SOLSAFE_INTENTS.PROGRAM_LOG_EXPLANATION)?.name,
    ).toBe(EXPLAIN_PROGRAM_LOGS_SKILL_NAME);
    expect(
      agent.getSkillForIntent(SOLSAFE_INTENTS.TRANSACTION_SIMULATION)?.name,
    ).toBe(SIMULATE_TRANSACTION_SKILL_NAME);
    expect(agent.getSkillForIntent(SOLSAFE_INTENTS.WHALE_ALERTS)).toBeUndefined();
    expect(agent.getSkillForIntent(SOLSAFE_INTENTS.WALLET_RISK)).toBeUndefined();
    expect(agent.getSkillForIntent(SOLSAFE_INTENTS.NATURAL_LANGUAGE_SWAP)).toBeUndefined();
  });

  it('allows post-mvp Solana skill stubs to be injected explicitly', () => {
    const whaleAlertsSkill = createGetWhaleAlertsSkill();
    const walletRiskSkill = createAssessWalletRiskSkill();
    const swapSkill = createNaturalLanguageSwapSkill();
    const agent = createSolsafeAgent({
      memory: createMemoryStub(),
      rateLimiter: createRateLimiterStub(),
      skills: [whaleAlertsSkill, walletRiskSkill, swapSkill],
    });

    expect(agent.skills.map((skill) => skill.name)).toEqual([
      GET_WHALE_ALERTS_SKILL_NAME,
      ASSESS_WALLET_RISK_SKILL_NAME,
      NATURAL_LANGUAGE_SWAP_SKILL_NAME,
    ]);
  });

  it.each([
    ['check wallet 8vFzXabc123', SOLSAFE_INTENTS.WALLET_LOOKUP],
    ['what about the BONK token? is it safe?', SOLSAFE_INTENTS.TOKEN_SECURITY],
    [
      'can you explain these program logs?',
      SOLSAFE_INTENTS.PROGRAM_LOG_EXPLANATION,
    ],
    [
      'can you simulate this transaction before i sign it?',
      SOLSAFE_INTENTS.TRANSACTION_SIMULATION,
    ],
    [
      'monitor whale alerts for GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME',
      SOLSAFE_INTENTS.UNKNOWN,
    ],
    [
      'assess wallet risk for GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME',
      SOLSAFE_INTENTS.UNKNOWN,
    ],
    ['swap 0.1 SOL for USDC', SOLSAFE_INTENTS.UNKNOWN],
    ['hello there', SOLSAFE_INTENTS.UNKNOWN],
  ])('routes "%s" to %s', (message, expectedIntent) => {
    const agent = createSolsafeAgent({
      memory: createMemoryStub(),
      rateLimiter: createRateLimiterStub(),
    });

    expect(agent.routeIntent(message)).toBe(expectedIntent);
  });

  it('hides post-MVP stub skills from the fallback user response', async () => {
    const memory = createMemoryStub();
    const agent = createSolsafeAgent({
      memory,
      rateLimiter: createRateLimiterStub(),
    });

    const turn = await executeSolsafeTurn({
      agent,
      message: 'swap 0.1 SOL for USDC',
      userId: 'telegram:1234',
    });

    expect(turn.intent).toBe(SOLSAFE_INTENTS.UNKNOWN);
    expect(turn.response).toContain('wallet lookups');
    expect(turn.response).toContain('token security checks');
    expect(turn.response).toContain('transaction simulations');
    expect(turn.response).toContain('program log explanations');
    expect(turn.response).not.toContain('whale alert');
    expect(turn.response).not.toContain('wallet risk');
    expect(turn.response).not.toContain('swap preview');
  });

  it('does not fall back to stale memory when a new token symbol is explicitly named but unresolved', async () => {
    const execute = vi.fn();
    const tokenSkill: SolsafeSkill<{ mintAddress: string }, { summary: string }> = {
      description: 'Checks token safety',
      execute,
      intent: SOLSAFE_INTENTS.TOKEN_SECURITY,
      name: CHECK_TOKEN_SECURITY_SKILL_NAME,
    };
    const memory = {
      memoryKeys: [SOLSAFE_MEMORY_KEY],
      loadMemoryVariables: vi.fn().mockResolvedValue({
        [SOLSAFE_MEMORY_KEY]: [
          {
            content: 'BONK (mint: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263)',
          },
        ],
      }),
      saveContext: vi.fn().mockResolvedValue(undefined),
    } as unknown as BaseMemory;
    const agent = createSolsafeAgent({
      memory,
      rateLimiter: createRateLimiterStub(),
      skills: [tokenSkill],
    });

    await expect(
      executeSolsafeTurn({
        agent,
        message: 'what about the PEPE token? is it safe?',
        userId: 'telegram:1234',
      }),
    ).rejects.toThrow(
      "I couldn't resolve PEPE to a token mint address. Send the mint address to run a token security check.",
    );
    expect(execute).not.toHaveBeenCalled();
  });
});