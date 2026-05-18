import { describe, expect, it, vi } from 'vitest';

import { SOLSAFE_INTENTS } from '../../src/agents/solsafe-agent.js';
import {
  ASSESS_WALLET_RISK_SKILL_NAME,
  createAssessWalletRiskSkill,
} from '../../src/skills/assessWalletRisk.js';

describe('assessWalletRisk skill', () => {
  it('returns an extensible wallet-risk stub aligned to the SSOT scoring factors', async () => {
    const walletAddress = 'GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME';
    const analyzeWalletRisk = vi.fn().mockResolvedValue({
      walletAddress,
      riskLevel: 'review_required',
      factors: [
        'wallet age',
        'counterparty concentration',
        'malicious program exposure',
      ],
      status: 'stub',
      nextStep:
        'Blend Helius history, RugCheck metadata, and scam-contract intelligence into a scored model.',
    });
    const skill = createAssessWalletRiskSkill({
      analyzer: {
        analyzeWalletRisk,
      },
    });

    expect(skill.name).toBe(ASSESS_WALLET_RISK_SKILL_NAME);
    expect(skill.intent).toBe(SOLSAFE_INTENTS.WALLET_RISK);
    expect(skill.description).toContain('risk');
    await expect(skill.execute({ walletAddress })).resolves.toEqual({
      status: 'success',
      summary: [
        `Wallet risk assessment stub for ${walletAddress}.`,
        'Planned factors: wallet age, counterparty concentration, malicious program exposure.',
        'Current status: manual review required until automated wallet scoring ships.',
      ].join('\n'),
      data: {
        walletAddress,
        riskLevel: 'review_required',
        factors: [
          'wallet age',
          'counterparty concentration',
          'malicious program exposure',
        ],
        status: 'stub',
        nextStep:
          'Blend Helius history, RugCheck metadata, and scam-contract intelligence into a scored model.',
      },
    });
  });
});