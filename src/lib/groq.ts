import Groq from 'groq-sdk';

export const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';

export interface GroqProgramLogSummaryInput {
  parsedSummary: string;
  rawLogs: string[];
}

export interface GroqProgramLogSummaryResult {
  model: string;
  summary: string;
}

export interface ProgramLogSummaryClient {
  summarizeProgramLogs(
    input: GroqProgramLogSummaryInput,
  ): Promise<GroqProgramLogSummaryResult>;
}

export interface CreateGroqProgramLogSummaryClientOptions {
  apiKey?: string;
  model?: string;
}

export function createGroqProgramLogSummaryClient(
  options: CreateGroqProgramLogSummaryClientOptions = {},
): ProgramLogSummaryClient {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY ?? '';
  const normalizedApiKey = apiKey.trim();

  if (!normalizedApiKey) {
    throw new Error('GROQ_API_KEY is required to initialize the Groq client.');
  }

  const model = options.model ?? DEFAULT_GROQ_MODEL;
  const client = new Groq({
    apiKey: normalizedApiKey,
  });

  return {
    async summarizeProgramLogs(input) {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content:
              'You explain Solana program logs in plain English. Return one concise sentence that explains what happened, the most likely failure point if any, and avoid JSON or bullets.',
          },
          {
            role: 'user',
            content: [
              'Summarize these Solana program logs for a non-technical user.',
              '',
              'Parsed facts:',
              input.parsedSummary,
              '',
              'Raw logs:',
              input.rawLogs.join('\n'),
            ].join('\n'),
          },
        ],
      });
      const summary = completion.choices[0]?.message?.content?.trim();

      if (!summary) {
        throw new Error('Groq returned an empty log summary.');
      }

      return {
        model,
        summary,
      };
    },
  };
}