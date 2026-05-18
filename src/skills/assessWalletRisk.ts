import { PublicKey } from '@solana/web3.js';

import type { SolsafeIntent, SolsafeSkill } from '../agents/solsafe-agent.js';

export const ASSESS_WALLET_RISK_SKILL_NAME = 'assessWalletRisk';

const ASSESS_WALLET_RISK_INTENT: SolsafeIntent = 'wallet_risk';

export interface AssessWalletRiskInput {
  walletAddress: string;
}

export type WalletRiskLevel = 'low' | 'medium' | 'high' | 'review_required';

export interface WalletRiskAssessment {
  factors: string[];
  nextStep: string;
  riskLevel: WalletRiskLevel;
  status: 'stub';
  walletAddress: string;
}

export interface AssessWalletRiskResult {
  status: 'success';
  summary: string;
  data: WalletRiskAssessment;
}

export interface WalletRiskAnalyzer {
  analyzeWalletRisk(input: AssessWalletRiskInput): Promise<WalletRiskAssessment>;
}

export interface CreateAssessWalletRiskSkillOptions {
  analyzer?: WalletRiskAnalyzer;
}

export function createAssessWalletRiskSkill(
  options: CreateAssessWalletRiskSkillOptions = {},
): SolsafeSkill<AssessWalletRiskInput, AssessWalletRiskResult> {
  const analyzer = options.analyzer ?? createDefaultWalletRiskAnalyzer();

  return {
    name: ASSESS_WALLET_RISK_SKILL_NAME,
    description:
      'Plans a future wallet risk score based on age, behavior patterns, and malicious program exposure.',
    intent: ASSESS_WALLET_RISK_INTENT,
    async execute(input) {
      const data = await analyzer.analyzeWalletRisk({
        walletAddress: normalizeWalletAddress(input.walletAddress),
      });

      return {
        status: 'success',
        summary: formatWalletRiskSummary(data),
        data,
      };
    },
  };
}

function createDefaultWalletRiskAnalyzer(): WalletRiskAnalyzer {
  return {
    async analyzeWalletRisk(input) {
      return {
        walletAddress: normalizeWalletAddress(input.walletAddress),
        riskLevel: 'review_required',
        factors: [
          'wallet age',
          'counterparty concentration',
          'malicious program exposure',
        ],
        status: 'stub',
        nextStep:
          'Blend Helius history, RugCheck metadata, and scam-contract intelligence into a scored model.',
      };
    },
  };
}

function formatWalletRiskSummary(assessment: WalletRiskAssessment): string {
  return [
    `Wallet risk assessment stub for ${assessment.walletAddress}.`,
    `Planned factors: ${assessment.factors.join(', ')}.`,
    'Current status: manual review required until automated wallet scoring ships.',
  ].join('\n');
}

function normalizeWalletAddress(walletAddress: string): string {
  const normalizedWalletAddress = walletAddress.trim();

  if (!normalizedWalletAddress) {
    throw new Error('walletAddress is required.');
  }

  return new PublicKey(normalizedWalletAddress).toBase58();
}