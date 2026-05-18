import { describe, expect, it, vi } from 'vitest';

import { SOLSAFE_INTENTS } from '../../src/agents/solsafe-agent.js';
import {
  EXPLAIN_PROGRAM_LOGS_SKILL_NAME,
  createExplainProgramLogsSkill,
  parseProgramLogs,
} from '../../src/skills/explainProgramLogs.js';

const FAILED_SWAP_LOGS = [
  'Program ComputeBudget111111111111111111111111111111 invoke [1]',
  'Program ComputeBudget111111111111111111111111111111 success',
  'Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5Xv2kV7sE invoke [1]',
  'Program log: Instruction: Route',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]',
  'Program log: Instruction: TransferChecked',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4645 of 1382328 compute units',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success',
  'Program log: AnchorError occurred. Error Code: SlippageToleranceExceeded. Error Number: 6001. Error Message: Slippage tolerance exceeded.',
  'Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5Xv2kV7sE consumed 78543 of 1400000 compute units',
  'Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5Xv2kV7sE failed: custom program error: 0x1771',
] as const;

const SUCCESS_TRANSFER_LOGS = [
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
  'Program log: Instruction: TransferChecked',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4645 of 200000 compute units',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success',
] as const;

describe('explainProgramLogs skill', () => {
  it('parses failure logs and combines the parsed facts with a Groq summary', async () => {
    const summarizeProgramLogs = vi.fn().mockResolvedValue({
      model: 'llama-3.1-8b-instant',
      summary:
        'The Jupiter route failed because the swap moved outside the allowed slippage before it could finish.',
    });
    const skill = createExplainProgramLogsSkill({
      summaryClient: {
        summarizeProgramLogs,
      },
    });

    expect(skill.name).toBe(EXPLAIN_PROGRAM_LOGS_SKILL_NAME);
    expect(skill.intent).toBe(SOLSAFE_INTENTS.PROGRAM_LOG_EXPLANATION);
    expect(skill.description).toContain('Groq');
    await expect(
      skill.execute({
        logs: FAILED_SWAP_LOGS,
      }),
    ).resolves.toEqual({
      status: 'success',
      model: 'llama-3.1-8b-instant',
      usedLlm: true,
      summary: [
        'The Jupiter route failed because the swap moved outside the allowed slippage before it could finish.',
        'Programs invoked: Compute Budget, Jupiter, Token Program.',
        'Detected instructions: Route, TransferChecked.',
        'Status: failed. Compute used: 78,543 units. Error: SlippageToleranceExceeded (6001) - Slippage tolerance exceeded.',
      ].join('\n'),
      data: {
        status: 'error',
        programs: ['Compute Budget', 'Jupiter', 'Token Program'],
        instructionNames: ['Route', 'TransferChecked'],
        computeUnitsConsumed: 78543,
        errorCode: 'SlippageToleranceExceeded',
        errorNumber: 6001,
        errorMessage: 'Slippage tolerance exceeded.',
        failedProgram: 'Jupiter',
        logs: [...FAILED_SWAP_LOGS],
      },
    });
  });

  it('falls back to a deterministic parser-only explanation when the LLM summary is unavailable', async () => {
    const summarizeProgramLogs = vi.fn().mockRejectedValue(
      new Error('Groq API unavailable'),
    );
    const skill = createExplainProgramLogsSkill({
      summaryClient: {
        summarizeProgramLogs,
      },
    });

    await expect(
      skill.execute({
        logs: SUCCESS_TRANSFER_LOGS,
      }),
    ).resolves.toEqual({
      status: 'success',
      model: 'deterministic-parser',
      usedLlm: false,
      summary: [
        'These logs show a successful Token Program instruction with no program error detected.',
        'Programs invoked: Token Program.',
        'Detected instructions: TransferChecked.',
        'Status: succeeded. Compute used: 4,645 units.',
      ].join('\n'),
      data: {
        status: 'success',
        programs: ['Token Program'],
        instructionNames: ['TransferChecked'],
        computeUnitsConsumed: 4645,
        errorCode: null,
        errorNumber: null,
        errorMessage: null,
        failedProgram: null,
        logs: [...SUCCESS_TRANSFER_LOGS],
      },
    });
  });

  it('parses anchor errors, compute usage, and failed programs from sample logs', () => {
    expect(parseProgramLogs(FAILED_SWAP_LOGS)).toEqual({
      status: 'error',
      programs: ['Compute Budget', 'Jupiter', 'Token Program'],
      instructionNames: ['Route', 'TransferChecked'],
      computeUnitsConsumed: 78543,
      errorCode: 'SlippageToleranceExceeded',
      errorNumber: 6001,
      errorMessage: 'Slippage tolerance exceeded.',
      failedProgram: 'Jupiter',
      logs: [...FAILED_SWAP_LOGS],
    });
  });
});