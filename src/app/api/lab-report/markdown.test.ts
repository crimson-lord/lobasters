import { describe, expect, it } from 'vitest';
import { inlineCode } from './markdown';

describe('LAB report Markdown code spans', () => {
  it('wraps ordinary configuration values as inline code', () => {
    expect(inlineCode('model-name')).toBe('` model-name `');
  });

  it('preserves backslashes without creating an escaping bypass', () => {
    expect(inlineCode('C:\\models\\latest')).toBe('` C:\\models\\latest `');
  });

  it('uses a delimiter longer than every backtick run in the value', () => {
    expect(inlineCode('model`name')).toBe('`` model`name ``');
    expect(inlineCode('model``name')).toBe('``` model``name ```');
  });

  it('uses a safe fallback for missing or empty values', () => {
    expect(inlineCode(undefined)).toBe('` Not configured `');
    expect(inlineCode('   ')).toBe('` Not configured `');
  });
});
