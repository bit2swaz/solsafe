import { describe, expect, it, vi } from 'vitest';

import { SOLSAFE_INTENTS } from '../../src/agents/solsafe-agent.js';
import {
  GET_WHALE_ALERTS_SKILL_NAME,
  createGetWhaleAlertsSkill,
} from '../../src/skills/getWhaleAlerts.js';

describe('getWhaleAlerts skill', () => {
  it('returns an extensible whale-alert monitoring stub aligned to Helius webhooks', async () => {
    const walletAddress = 'GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME';
    const planWhaleAlerts = vi.fn().mockResolvedValue({
      walletAddress,
      minimumTransferSol: 250,
      provider: 'helius-enhanced-webhooks',
      monitoredEvents: ['large inbound transfers', 'large outbound transfers'],
      status: 'stub',
      nextStep:
        'Create the webhook subscription and route notifications into Telegram delivery.',
    });
    const skill = createGetWhaleAlertsSkill({
      planner: {
        planWhaleAlerts,
      },
    });

    expect(skill.name).toBe(GET_WHALE_ALERTS_SKILL_NAME);
    expect(skill.intent).toBe(SOLSAFE_INTENTS.WHALE_ALERTS);
    expect(skill.description).toContain('Helius');
    await expect(
      skill.execute({
        walletAddress,
        minimumTransferSol: 250,
      }),
    ).resolves.toEqual({
      status: 'success',
      summary: [
        `Whale alerts stub for ${walletAddress}.`,
        'Planned provider: Helius enhanced webhooks monitoring transfers >= 250 SOL.',
        'Next step: Create the webhook subscription and route notifications into Telegram delivery.',
      ].join('\n'),
      data: {
        walletAddress,
        minimumTransferSol: 250,
        provider: 'helius-enhanced-webhooks',
        monitoredEvents: ['large inbound transfers', 'large outbound transfers'],
        status: 'stub',
        nextStep:
          'Create the webhook subscription and route notifications into Telegram delivery.',
      },
    });
  });
});