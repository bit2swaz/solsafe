import type { BaseMemory } from '@langchain/core/memory';
import { describe, expect, it, vi } from 'vitest';

import {
  SOLSAFE_INTENTS,
  SOLSAFE_MEMORY_KEY,
  createSolsafeAgent,
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

  it('registers getWalletSummary as the first wallet lookup skill', () => {
    const agent = createSolsafeAgent({
      memory: createMemoryStub(),
      rateLimiter: createRateLimiterStub(),
    });

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
    expect(agent.getSkillForIntent(SOLSAFE_INTENTS.WHALE_ALERTS)?.name).toBe(
      GET_WHALE_ALERTS_SKILL_NAME,
    );
    expect(agent.getSkillForIntent(SOLSAFE_INTENTS.WALLET_RISK)?.name).toBe(
      ASSESS_WALLET_RISK_SKILL_NAME,
    );
    expect(
      agent.getSkillForIntent(SOLSAFE_INTENTS.NATURAL_LANGUAGE_SWAP)?.name,
    ).toBe(NATURAL_LANGUAGE_SWAP_SKILL_NAME);
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
      SOLSAFE_INTENTS.WHALE_ALERTS,
    ],
    [
      'assess wallet risk for GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME',
      SOLSAFE_INTENTS.WALLET_RISK,
    ],
    ['swap 0.1 SOL for USDC', SOLSAFE_INTENTS.NATURAL_LANGUAGE_SWAP],
    ['hello there', SOLSAFE_INTENTS.UNKNOWN],
  ])('routes "%s" to %s', (message, expectedIntent) => {
    const agent = createSolsafeAgent({
      memory: createMemoryStub(),
      rateLimiter: createRateLimiterStub(),
    });

    expect(agent.routeIntent(message)).toBe(expectedIntent);
  });
});