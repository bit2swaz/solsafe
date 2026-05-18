import { describe, expect, it } from 'vitest';

import {
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
});