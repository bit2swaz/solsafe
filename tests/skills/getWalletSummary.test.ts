import { describe, expect, it } from 'vitest';

import { SOLSAFE_INTENTS } from '../../src/agents/solsafe-agent.js';
import {
  GET_WALLET_SUMMARY_SKILL_NAME,
  GET_WALLET_SUMMARY_STUB_MESSAGE,
  createGetWalletSummarySkill,
} from '../../src/skills/getWalletSummary.js';

describe('getWalletSummary skill', () => {
  it('creates a wallet summary stub aligned to wallet lookup', async () => {
    const skill = createGetWalletSummarySkill();

    expect(skill.name).toBe(GET_WALLET_SUMMARY_SKILL_NAME);
    expect(skill.intent).toBe(SOLSAFE_INTENTS.WALLET_LOOKUP);
    expect(skill.description).toContain('SOL balance');
    await expect(
      skill.execute({ walletAddress: '8vFzXabc123' }),
    ).resolves.toEqual({
      status: 'not_implemented',
      summary: GET_WALLET_SUMMARY_STUB_MESSAGE,
      walletAddress: '8vFzXabc123',
    });
  });
});