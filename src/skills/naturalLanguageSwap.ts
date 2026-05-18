import { PublicKey } from '@solana/web3.js';

import type { SolsafeIntent, SolsafeSkill } from '../agents/solsafe-agent.js';

export const NATURAL_LANGUAGE_SWAP_SKILL_NAME = 'naturalLanguageSwap';

const NATURAL_LANGUAGE_SWAP_INTENT: SolsafeIntent = 'natural_language_swap';
const SWAP_REQUEST_PATTERN =
  /\b(?:swap|trade|quote)\s+(\d+(?:\.\d+)?)\s+([a-z0-9]+)\s+(?:for|to)\s+([a-z0-9]+)\b/i;

export interface NaturalLanguageSwapInput {
  confirmed?: boolean;
  request: string;
  walletAddress?: string | null;
}

export interface ParsedSwapRequest {
  inputAmount: string;
  inputTokenSymbol: string;
  outputTokenSymbol: string;
  request: string;
}

export type NaturalLanguageSwapStatus =
  | 'awaiting_confirmation'
  | 'confirmed_but_not_executed';

export interface NaturalLanguageSwapPlan extends ParsedSwapRequest {
  provider: 'jupiter';
  requiresConfirmation: true;
  status: NaturalLanguageSwapStatus;
  walletAddress: string | null;
}

export interface NaturalLanguageSwapResult {
  status: 'success';
  summary: string;
  data: NaturalLanguageSwapPlan;
}

export interface NaturalLanguageSwapPlanner {
  planSwap(input: NaturalLanguageSwapInput): Promise<NaturalLanguageSwapPlan>;
}

export interface CreateNaturalLanguageSwapSkillOptions {
  planner?: NaturalLanguageSwapPlanner;
}

export function createNaturalLanguageSwapSkill(
  options: CreateNaturalLanguageSwapSkillOptions = {},
): SolsafeSkill<NaturalLanguageSwapInput, NaturalLanguageSwapResult> {
  const planner = options.planner ?? createDefaultNaturalLanguageSwapPlanner();

  return {
    name: NATURAL_LANGUAGE_SWAP_SKILL_NAME,
    description:
      'Previews a Jupiter swap from natural language, then stops at an explicit confirmation boundary before execution.',
    intent: NATURAL_LANGUAGE_SWAP_INTENT,
    async execute(input) {
      const data = await planner.planSwap(input);

      return {
        status: 'success',
        summary: formatNaturalLanguageSwapSummary(data),
        data,
      };
    },
  };
}

export function parseNaturalLanguageSwapRequest(
  request: string,
): ParsedSwapRequest {
  const normalizedRequest = request.trim();

  if (!normalizedRequest) {
    throw new Error('request is required.');
  }

  const match = SWAP_REQUEST_PATTERN.exec(normalizedRequest);

  if (!match) {
    throw new Error(
      'A swap request like "swap 0.1 SOL for USDC" is required.',
    );
  }

  return {
    request: normalizedRequest,
    inputAmount: match[1],
    inputTokenSymbol: match[2].toUpperCase(),
    outputTokenSymbol: match[3].toUpperCase(),
  };
}

function createDefaultNaturalLanguageSwapPlanner(): NaturalLanguageSwapPlanner {
  return {
    async planSwap(input) {
      const parsedRequest = parseNaturalLanguageSwapRequest(input.request);

      return {
        ...parsedRequest,
        walletAddress: normalizeOptionalWalletAddress(input.walletAddress),
        provider: 'jupiter',
        requiresConfirmation: true,
        status: input.confirmed
          ? 'confirmed_but_not_executed'
          : 'awaiting_confirmation',
      };
    },
  };
}

function formatNaturalLanguageSwapSummary(plan: NaturalLanguageSwapPlan): string {
  const pair = `${plan.inputAmount} ${plan.inputTokenSymbol} -> ${plan.outputTokenSymbol}`;

  if (plan.status === 'confirmed_but_not_executed') {
    return [
      `Swap confirmation acknowledged for ${pair}.`,
      'Planned Jupiter flow would now assemble and execute the signed transaction, but live execution is still stubbed.',
      'No transaction was submitted.',
    ].join('\n');
  }

  return [
    `Swap preview stub: ${pair}.`,
    'Planned Jupiter flow: fetch a quote, build the swap transaction, and return it for explicit user confirmation.',
    'Execution is blocked until the user confirms the prepared swap.',
  ].join('\n');
}

function normalizeOptionalWalletAddress(
  walletAddress: string | null | undefined,
): string | null {
  if (!walletAddress) {
    return null;
  }

  return new PublicKey(walletAddress.trim()).toBase58();
}