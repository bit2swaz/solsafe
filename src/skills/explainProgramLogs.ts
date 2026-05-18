import type { SolsafeIntent, SolsafeSkill } from '../agents/solsafe-agent.js';
import {
  createGroqProgramLogSummaryClient,
  type ProgramLogSummaryClient,
} from '../lib/groq.js';

export const EXPLAIN_PROGRAM_LOGS_SKILL_NAME = 'explainProgramLogs';

const EXPLAIN_PROGRAM_LOGS_INTENT: SolsafeIntent = 'program_log_explanation';
const KNOWN_PROGRAM_LABELS: Record<string, string> = {
  11111111111111111111111111111111: 'System Program',
  ComputeBudget111111111111111111111111111111: 'Compute Budget',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token Program',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token Program',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo Program',
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: 'Jupiter',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5Xv2kV7sE: 'Jupiter',
};

export interface ExplainProgramLogsInput {
  logs: readonly string[] | string;
}

export interface ParsedProgramLogs {
  status: 'success' | 'error' | 'unknown';
  programs: string[];
  instructionNames: string[];
  computeUnitsConsumed: number | null;
  errorCode: string | null;
  errorNumber: number | null;
  errorMessage: string | null;
  failedProgram: string | null;
  logs: string[];
}

export interface ExplainProgramLogsResult {
  status: 'success';
  model: string;
  usedLlm: boolean;
  summary: string;
  data: ParsedProgramLogs;
}

export interface CreateExplainProgramLogsSkillOptions {
  summaryClient?: ProgramLogSummaryClient;
}

export function createExplainProgramLogsSkill(
  options: CreateExplainProgramLogsSkillOptions = {},
): SolsafeSkill<ExplainProgramLogsInput, ExplainProgramLogsResult> {
  const summaryClient = options.summaryClient ?? maybeCreateDefaultSummaryClient();

  return {
    name: EXPLAIN_PROGRAM_LOGS_SKILL_NAME,
    description:
      'Parses Solana program logs and uses Groq Llama 3.1 8B to explain failures or successful program flow in plain English.',
    intent: EXPLAIN_PROGRAM_LOGS_INTENT,
    async execute(input) {
      const parsedLogs = parseProgramLogs(input.logs);
      const llmSummary = await summarizeWithFallback(summaryClient, parsedLogs);

      return {
        status: 'success',
        model: llmSummary.model,
        usedLlm: llmSummary.usedLlm,
        summary: formatProgramLogExplanation(llmSummary.summary, parsedLogs),
        data: parsedLogs,
      };
    },
  };
}

export function parseProgramLogs(logsInput: readonly string[] | string): ParsedProgramLogs {
  const logs = normalizeLogs(logsInput);
  const programs = new Map<string, string>();
  const instructionNames: string[] = [];
  let computeUnitsConsumed: number | null = null;
  let errorCode: string | null = null;
  let errorNumber: number | null = null;
  let errorMessage: string | null = null;
  let failedProgram: string | null = null;
  let sawSuccess = false;

  for (const log of logs) {
    const invokeMatch = /^Program ([A-Za-z0-9]+) invoke \[\d+\]$/.exec(log);

    if (invokeMatch) {
      addProgramLabel(programs, invokeMatch[1]);
      continue;
    }

    const instructionMatch = /^Program log: Instruction: (.+)$/.exec(log);

    if (instructionMatch) {
      pushUnique(instructionNames, instructionMatch[1].trim());
      continue;
    }

    const computeMatch =
      /^Program ([A-Za-z0-9]+) consumed (\d+) of \d+ compute units$/.exec(log);

    if (computeMatch) {
      addProgramLabel(programs, computeMatch[1]);
      const consumedUnits = Number(computeMatch[2]);
      computeUnitsConsumed = Math.max(computeUnitsConsumed ?? 0, consumedUnits);
      continue;
    }

    const anchorErrorMatch =
      /^Program log: AnchorError occurred\. Error Code: ([^.]+)\. Error Number: (\d+)\. Error Message: (.+)$/.exec(
        log,
      );

    if (anchorErrorMatch) {
      errorCode = anchorErrorMatch[1].trim();
      errorNumber = Number(anchorErrorMatch[2]);
      errorMessage = normalizeSentence(anchorErrorMatch[3].trim());
      continue;
    }

    const failedProgramMatch = /^Program ([A-Za-z0-9]+) failed:/.exec(log);

    if (failedProgramMatch) {
      addProgramLabel(programs, failedProgramMatch[1]);
      failedProgram = getProgramLabel(failedProgramMatch[1]);
      continue;
    }

    if (/^Program [A-Za-z0-9]+ success$/.test(log)) {
      sawSuccess = true;
    }
  }

  return {
    status: failedProgram || errorCode ? 'error' : sawSuccess ? 'success' : 'unknown',
    programs: Array.from(programs.values()),
    instructionNames,
    computeUnitsConsumed,
    errorCode,
    errorNumber,
    errorMessage,
    failedProgram,
    logs,
  };
}

function maybeCreateDefaultSummaryClient(): ProgramLogSummaryClient | undefined {
  if (!process.env.GROQ_API_KEY?.trim()) {
    return undefined;
  }

  return createGroqProgramLogSummaryClient({
    apiKey: process.env.GROQ_API_KEY,
  });
}

async function summarizeWithFallback(
  summaryClient: ProgramLogSummaryClient | undefined,
  parsedLogs: ParsedProgramLogs,
): Promise<{ model: string; summary: string; usedLlm: boolean }> {
  if (!summaryClient) {
    return {
      model: 'deterministic-parser',
      summary: createDeterministicExplanation(parsedLogs),
      usedLlm: false,
    };
  }

  try {
    const summaryResult = await summaryClient.summarizeProgramLogs({
      parsedSummary: createParsedSummaryPrompt(parsedLogs),
      rawLogs: parsedLogs.logs,
    });

    return {
      model: summaryResult.model,
      summary: summaryResult.summary,
      usedLlm: true,
    };
  } catch {
    return {
      model: 'deterministic-parser',
      summary: createDeterministicExplanation(parsedLogs),
      usedLlm: false,
    };
  }
}

function createParsedSummaryPrompt(parsedLogs: ParsedProgramLogs): string {
  return [
    `Status: ${parsedLogs.status}`,
    `Programs: ${parsedLogs.programs.join(', ') || 'unknown'}`,
    `Instructions: ${parsedLogs.instructionNames.join(', ') || 'unknown'}`,
    `Compute Units: ${parsedLogs.computeUnitsConsumed ?? 'unknown'}`,
    `Error: ${formatErrorDescriptor(parsedLogs) ?? 'none'}`,
    `Failed Program: ${parsedLogs.failedProgram ?? 'none'}`,
  ].join('\n');
}

function createDeterministicExplanation(parsedLogs: ParsedProgramLogs): string {
  const primaryProgram =
    parsedLogs.failedProgram ??
    parsedLogs.programs.find((program) => program !== 'Compute Budget') ??
    parsedLogs.programs[0] ??
    'program';

  if (parsedLogs.status === 'success') {
    return `These logs show a successful ${primaryProgram} instruction with no program error detected.`;
  }

  if (parsedLogs.status === 'error') {
    if (parsedLogs.errorCode && parsedLogs.errorMessage) {
      return `These logs show a failed ${primaryProgram} instruction because ${parsedLogs.errorCode} was raised: ${parsedLogs.errorMessage}`;
    }

    return `These logs show a failed ${primaryProgram} instruction before the program completed successfully.`;
  }

  return `These logs do not show a definitive success or failure, but they mainly involve ${primaryProgram}.`;
}

function formatProgramLogExplanation(
  explanation: string,
  parsedLogs: ParsedProgramLogs,
): string {
  const lines = [explanation.trim()];

  lines.push(`Programs invoked: ${parsedLogs.programs.join(', ') || 'unknown'}.`);
  lines.push(
    `Detected instructions: ${parsedLogs.instructionNames.join(', ') || 'none'}.`,
  );
  lines.push(formatStatusFacts(parsedLogs));

  return lines.join('\n');
}

function formatStatusFacts(parsedLogs: ParsedProgramLogs): string {
  const details = [
    `Status: ${formatStatusLabel(parsedLogs.status)}.`,
  ];

  if (parsedLogs.computeUnitsConsumed !== null) {
    details.push(
      `Compute used: ${parsedLogs.computeUnitsConsumed.toLocaleString('en-US')} units.`,
    );
  }

  const errorDescriptor = formatErrorDescriptor(parsedLogs);

  if (errorDescriptor) {
    details.push(`Error: ${errorDescriptor}.`);
  }

  return details.join(' ');
}

function formatErrorDescriptor(parsedLogs: ParsedProgramLogs): string | null {
  if (!parsedLogs.errorCode) {
    return null;
  }

  const parts = [parsedLogs.errorCode];

  if (parsedLogs.errorNumber !== null) {
    parts.push(`(${parsedLogs.errorNumber})`);
  }

  if (parsedLogs.errorMessage) {
    parts.push(`- ${trimTrailingPunctuation(parsedLogs.errorMessage)}`);
  }

  return parts.join(' ');
}

function formatStatusLabel(status: ParsedProgramLogs['status']): string {
  switch (status) {
    case 'error':
      return 'failed';
    case 'success':
      return 'succeeded';
    default:
      return 'unknown';
  }
}

function normalizeLogs(logsInput: readonly string[] | string): string[] {
  let logs: string[];

  if (typeof logsInput === 'string') {
    logs = logsInput.split(/\r?\n/).map((log: string) => log.trim());
  } else {
    logs = logsInput.map((log) => log.trim());
  }

  const normalizedLogs = logs.filter((log) => log.length > 0);

  if (normalizedLogs.length === 0) {
    throw new Error('Program logs are required for explanation.');
  }

  return normalizedLogs;
}

function addProgramLabel(programs: Map<string, string>, programId: string): void {
  if (!programs.has(programId)) {
    programs.set(programId, getProgramLabel(programId));
  }
}

function getProgramLabel(programId: string): string {
  return KNOWN_PROGRAM_LABELS[programId] ?? shortenAddress(programId);
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function normalizeSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.!?]+$/, '');
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}