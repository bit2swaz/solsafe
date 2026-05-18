import { PublicKey } from '@solana/web3.js';

import type { SolsafeIntent, SolsafeSkill } from '../agents/solsafe-agent.js';

export const GET_WHALE_ALERTS_SKILL_NAME = 'getWhaleAlerts';

const GET_WHALE_ALERTS_INTENT: SolsafeIntent = 'whale_alerts';
const DEFAULT_MINIMUM_TRANSFER_SOL = 250;

export interface GetWhaleAlertsInput {
  minimumTransferSol?: number;
  walletAddress: string;
}

export interface WhaleAlertPlan {
  minimumTransferSol: number;
  monitoredEvents: string[];
  nextStep: string;
  provider: string;
  status: 'stub';
  walletAddress: string;
}

export interface GetWhaleAlertsResult {
  status: 'success';
  summary: string;
  data: WhaleAlertPlan;
}

export interface WhaleAlertPlanner {
  planWhaleAlerts(input: GetWhaleAlertsInput): Promise<WhaleAlertPlan>;
}

export interface CreateGetWhaleAlertsSkillOptions {
  planner?: WhaleAlertPlanner;
}

export function createGetWhaleAlertsSkill(
  options: CreateGetWhaleAlertsSkillOptions = {},
): SolsafeSkill<GetWhaleAlertsInput, GetWhaleAlertsResult> {
  const planner = options.planner ?? createDefaultWhaleAlertPlanner();

  return {
    name: GET_WHALE_ALERTS_SKILL_NAME,
    description:
      'Plans Helius enhanced webhook monitoring for large wallet movements and future Telegram whale alerts.',
    intent: GET_WHALE_ALERTS_INTENT,
    async execute(input) {
      const data = await planner.planWhaleAlerts({
        minimumTransferSol: input.minimumTransferSol,
        walletAddress: normalizeWalletAddress(input.walletAddress),
      });

      return {
        status: 'success',
        summary: formatWhaleAlertSummary(data),
        data,
      };
    },
  };
}

function createDefaultWhaleAlertPlanner(): WhaleAlertPlanner {
  return {
    async planWhaleAlerts(input) {
      return {
        walletAddress: normalizeWalletAddress(input.walletAddress),
        minimumTransferSol: normalizePositiveNumber(
          input.minimumTransferSol ?? DEFAULT_MINIMUM_TRANSFER_SOL,
          'minimumTransferSol',
        ),
        provider: 'helius-enhanced-webhooks',
        monitoredEvents: ['large inbound transfers', 'large outbound transfers'],
        status: 'stub',
        nextStep:
          'Create the webhook subscription and route notifications into Telegram delivery.',
      };
    },
  };
}

function formatWhaleAlertSummary(plan: WhaleAlertPlan): string {
  return [
    `Whale alerts stub for ${plan.walletAddress}.`,
    `Planned provider: Helius enhanced webhooks monitoring transfers >= ${formatNumber(plan.minimumTransferSol)} SOL.`,
    `Next step: ${plan.nextStep}`,
  ].join('\n');
}

function normalizeWalletAddress(walletAddress: string): string {
  const normalizedWalletAddress = walletAddress.trim();

  if (!normalizedWalletAddress) {
    throw new Error('walletAddress is required.');
  }

  return new PublicKey(normalizedWalletAddress).toBase58();
}

function normalizePositiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return value;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}