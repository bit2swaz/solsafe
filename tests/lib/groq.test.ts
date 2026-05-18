import { beforeEach, describe, expect, it, vi } from 'vitest';

const { completionsCreateMock, GroqMock } = vi.hoisted(() => {
  const completionsCreateMock = vi.fn();
  const GroqMock = vi.fn(function Groq() {
    return {
      chat: {
        completions: {
          create: completionsCreateMock,
        },
      },
    };
  });

  return {
    completionsCreateMock,
    GroqMock,
  };
});

vi.mock('groq-sdk', () => ({
  default: GroqMock,
}));

import {
  DEFAULT_GROQ_MODEL,
  createGroqProgramLogSummaryClient,
} from '../../src/lib/groq.js';

describe('groq client wrapper', () => {
  beforeEach(() => {
    GroqMock.mockClear();
    completionsCreateMock.mockReset();
  });

  it('uses the Groq chat completions API with the llama 3.1 8b model to summarize program logs', async () => {
    completionsCreateMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              'The Jupiter route failed because the swap moved outside the allowed slippage before it could finish.',
          },
        },
      ],
    });

    const client = createGroqProgramLogSummaryClient({
      apiKey: 'groq-test-key',
    });

    await expect(
      client.summarizeProgramLogs({
        parsedSummary:
          'Status: error\nPrograms: Jupiter, Token Program\nError: SlippageToleranceExceeded (6001)\nCompute Units: 78543',
        rawLogs: [
          'Program log: AnchorError occurred. Error Code: SlippageToleranceExceeded. Error Number: 6001. Error Message: Slippage tolerance exceeded.',
        ],
      }),
    ).resolves.toEqual({
      model: DEFAULT_GROQ_MODEL,
      summary:
        'The Jupiter route failed because the swap moved outside the allowed slippage before it could finish.',
    });

    expect(GroqMock).toHaveBeenCalledWith({
      apiKey: 'groq-test-key',
    });
    expect(completionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_GROQ_MODEL,
        max_tokens: 180,
        temperature: 0.2,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('SlippageToleranceExceeded'),
          }),
        ]),
      }),
    );
  });

  it('requires a Groq API key before creating the client wrapper', () => {
    expect(() => createGroqProgramLogSummaryClient()).toThrow(
      'GROQ_API_KEY is required to initialize the Groq client.',
    );
  });
});