import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Vitest setup', () => {
  it('should have Vitest configured', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.test).toBe('vitest');
    expect(existsSync(new URL('../vitest.config.ts', import.meta.url))).toBe(true);
  });
});