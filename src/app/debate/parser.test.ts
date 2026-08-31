import { describe, expect, it } from 'vitest';
import { parseResponse } from './parser';
import type { AgentConfig } from './types';

function agentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    nickname: 'Test Agent',
    modelName: 'test-model',
    baseURL: 'https://provider.example/v1',
    apiKey: 'test-key',
    temperature: 0.7,
    maxTokens: 4096,
    maxHistory: 10,
    systemPrompt: 'Stay in character.',
    speakingStyle: 'neutral',
    depth: 'medium',
    canThink: true,
    reasoningCaptureMethod: 'all',
    reasoningField: 'reasoning_content',
    startTag: '<thinking>',
    endTag: '</thinking>',
    manualContent: '',
    enableManualTool: false,
    enableGiveUp: false,
    customTools: [],
    ...overrides,
  };
}

describe('parseResponse', () => {
  it('keeps ordinary final content visible when no reasoning trace is returned', () => {
    expect(parseResponse(
      { role: 'assistant', content: 'A normal visible answer.' },
      agentConfig(),
    )).toEqual({
      thinking: null,
      speak: 'A normal visible answer.',
      usedReasoningAsSpeech: false,
    });
  });

  it('promotes reasoning to visible speech when it is the only text returned', () => {
    expect(parseResponse(
      { role: 'assistant', content: '', reasoning: 'The only usable model output.' },
      agentConfig(),
    )).toEqual({
      thinking: 'The only usable model output.',
      speak: 'The only usable model output.',
      usedReasoningAsSpeech: true,
    });
  });

  it('separates standard thinking and speak tags', () => {
    expect(parseResponse(
      {
        role: 'assistant',
        content: '<thinking>Check the evidence.</thinking><speak>Here is my conclusion.</speak>',
      },
      agentConfig(),
    )).toEqual({
      thinking: 'Check the evidence.',
      speak: 'Here is my conclusion.',
      usedReasoningAsSpeech: false,
    });
  });

  it('removes configured custom reasoning tags from otherwise untagged speech', () => {
    expect(parseResponse(
      {
        role: 'assistant',
        content: '<analysis>Check the evidence.</analysis>Here is my conclusion.',
      },
      agentConfig({
        reasoningCaptureMethod: 'tags',
        startTag: '<analysis>',
        endTag: '</analysis>',
      }),
    )).toEqual({
      thinking: 'Check the evidence.',
      speak: 'Here is my conclusion.',
      usedReasoningAsSpeech: false,
    });
  });

  it('captures a configured native reasoning field case-insensitively', () => {
    expect(parseResponse(
      {
        role: 'assistant',
        content: 'The provider final answer.',
        Reasoning_Content: 'The provider reasoning trace.',
      },
      agentConfig({ reasoningCaptureMethod: 'field' }),
    )).toEqual({
      thinking: 'The provider reasoning trace.',
      speak: 'The provider final answer.',
      usedReasoningAsSpeech: false,
    });
  });

  it('normalizes structured native reasoning details into readable text', () => {
    expect(parseResponse(
      {
        role: 'assistant',
        content: 'The structured-reasoning answer.',
        reasoning_details: [
          { type: 'reasoning.text', text: 'First reasoning step.' },
          { type: 'reasoning.text', text: 'Second reasoning step.' },
        ],
      },
      agentConfig(),
    )).toEqual({
      thinking: 'First reasoning step.\nSecond reasoning step.',
      speak: 'The structured-reasoning answer.',
      usedReasoningAsSpeech: false,
    });
  });

  it('does not invent visible speech for a tool-call-only response', () => {
    expect(parseResponse(
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'check_inventory', arguments: '{}' },
          },
        ],
      },
      agentConfig(),
    )).toEqual({
      thinking: null,
      speak: '',
      usedReasoningAsSpeech: false,
    });
  });

  it('turns a provider refusal into an explicit visible response', () => {
    expect(parseResponse(
      {
        role: 'assistant',
        content: '',
        refusal: 'I cannot help with that request.',
      },
      agentConfig(),
    )).toEqual({
      thinking: null,
      speak: 'Provider refusal: I cannot help with that request.',
      usedReasoningAsSpeech: false,
    });
  });
});
