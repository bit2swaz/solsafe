import { describe, expect, it } from 'vitest';

import { SOLSAFE_INTENTS } from '../../src/agents/solsafe-agent.js';
import {
  NATURAL_LANGUAGE_SWAP_SKILL_NAME,
  createNaturalLanguageSwapSkill,
} from '../../src/skills/naturalLanguageSwap.js';

describe('naturalLanguageSwap skill', () => {
  it('returns a Jupiter preview stub that requires explicit confirmation before execution', async () => {
    const walletAddress = 'GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME';
    const skill = createNaturalLanguageSwapSkill();

    expect(skill.name).toBe(NATURAL_LANGUAGE_SWAP_SKILL_NAME);
    expect(skill.intent).toBe(SOLSAFE_INTENTS.NATURAL_LANGUAGE_SWAP);
    expect(skill.description).toContain('Jupiter');
    await expect(
      skill.execute({
        request: 'swap 0.1 SOL for USDC',
        walletAddress,
      }),
    ).resolves.toEqual({
      status: 'success',
      summary: [
        'Swap preview stub: 0.1 SOL -> USDC.',
        'Planned Jupiter flow: fetch a quote, build the swap transaction, and return it for explicit user confirmation.',
        'Execution is blocked until the user confirms the prepared swap.',
      ].join('\n'),
      data: {
        walletAddress,
        request: 'swap 0.1 SOL for USDC',
        inputAmount: '0.1',
        inputTokenSymbol: 'SOL',
        outputTokenSymbol: 'USDC',
        provider: 'jupiter',
        requiresConfirmation: true,
        status: 'awaiting_confirmation',
      },
    });
  });

  it('stops at the execution boundary even after a user confirms the swap', async () => {
    const skill = createNaturalLanguageSwapSkill();

    await expect(
      skill.execute({
        request: 'swap 0.1 SOL for USDC',
        confirmed: true,
      }),
    ).resolves.toEqual({
      status: 'success',
      summary: [
        'Swap confirmation acknowledged for 0.1 SOL -> USDC.',
        'Planned Jupiter flow would now assemble and execute the signed transaction, but live execution is still stubbed.',
        'No transaction was submitted.',
      ].join('\n'),
      data: {
        walletAddress: null,
        request: 'swap 0.1 SOL for USDC',
        inputAmount: '0.1',
        inputTokenSymbol: 'SOL',
        outputTokenSymbol: 'USDC',
        provider: 'jupiter',
        requiresConfirmation: true,
        status: 'confirmed_but_not_executed',
      },
    });
  });
});