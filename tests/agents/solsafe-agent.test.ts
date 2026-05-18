import { describe, expect, it } from 'vitest';

import {
  SOLSAFE_INTENTS,
  SOLSAFE_MEMORY_KEY,
  createSolsafeAgent,
  createSolsafeMemory,
} from '../../src/agents/solsafe-agent.js';

describe('solsafe agent', () => {
  it('creates an agent with initialized memory', async () => {
    const agent = createSolsafeAgent();
    const memoryVariables = await agent.memory.loadMemoryVariables({});

    expect(agent).toBeDefined();
    expect(agent.memory).toBeDefined();
    expect(agent.memoryKey).toBe(SOLSAFE_MEMORY_KEY);
    expect(memoryVariables).toHaveProperty(SOLSAFE_MEMORY_KEY);
  });

  it('allows injecting a memory instance', () => {
    const memory = createSolsafeMemory();
    const agent = createSolsafeAgent({ memory });

    expect(agent.memory).toBe(memory);
  });

  it.each([
    ['check wallet 8vFzXabc123', SOLSAFE_INTENTS.WALLET_LOOKUP],
    ['what about the BONK token? is it safe?', SOLSAFE_INTENTS.TOKEN_SECURITY],
    [
      'can you simulate this transaction before i sign it?',
      SOLSAFE_INTENTS.TRANSACTION_SIMULATION,
    ],
    ['hello there', SOLSAFE_INTENTS.UNKNOWN],
  ])('routes "%s" to %s', (message, expectedIntent) => {
    const agent = createSolsafeAgent();

    expect(agent.routeIntent(message)).toBe(expectedIntent);
  });
});