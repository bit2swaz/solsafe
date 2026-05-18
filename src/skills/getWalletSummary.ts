import type { SolsafeIntent, SolsafeSkill } from '../agents/solsafe-agent.js';

export const GET_WALLET_SUMMARY_SKILL_NAME = 'getWalletSummary';
export const GET_WALLET_SUMMARY_STUB_MESSAGE =
  'getWalletSummary is not implemented yet.';

const GET_WALLET_SUMMARY_INTENT: SolsafeIntent = 'wallet_lookup';

export interface GetWalletSummaryInput {
  walletAddress: string;
}

export interface GetWalletSummaryResult {
  status: 'not_implemented';
  summary: string;
  walletAddress: string;
}

export function createGetWalletSummarySkill(): SolsafeSkill<
  GetWalletSummaryInput,
  GetWalletSummaryResult
> {
  return {
    name: GET_WALLET_SUMMARY_SKILL_NAME,
    description:
      'Stub skill for SOL balance, token holdings, wallet age, and recent transaction activity.',
    intent: GET_WALLET_SUMMARY_INTENT,
    async execute(input) {
      return {
        status: 'not_implemented',
        summary: GET_WALLET_SUMMARY_STUB_MESSAGE,
        walletAddress: input.walletAddress,
      };
    },
  };
}