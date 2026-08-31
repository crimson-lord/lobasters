import { describe, expect, it } from 'vitest';
import { constructRuntimeGuard, constructSystemPrompt } from './utils';
import type { AgentConfig, DebateConfig } from './types';

function participant(nickname: string): AgentConfig {
  return {
    nickname,
    modelName: 'test-model',
    baseURL: 'https://provider.example/v1',
    apiKey: 'test-key',
    temperature: 0.7,
    maxTokens: 4096,
    maxHistory: 10,
    systemPrompt: '',
    speakingStyle: 'professional',
    depth: 'medium',
    canThink: false,
    reasoningCaptureMethod: 'none',
    reasoningField: 'reasoning_content',
    startTag: '<thinking>',
    endTag: '</thinking>',
    manualContent: '',
    enableManualTool: false,
    enableGiveUp: false,
    customTools: [],
  };
}

function salesConfig(agentSpeaksFirst: 'A' | 'B' = 'A'): DebateConfig {
  return {
    topic: '',
    extraRules: '',
    agentSpeaksFirst,
    agentIsPro: 'A',
    scenarioType: 'sales',
    agentA: participant('Seller'),
    agentB: participant('Buyer'),
  };
}

describe('Arena sales identity prompts', () => {
  it('assigns Agent A only the salesperson identity and Agent B only the customer identity', () => {
    const config = salesConfig();
    const promptA = constructSystemPrompt('A', config, true);
    const promptB = constructSystemPrompt('B', config, false);

    expect(promptA).toContain('You are Agent A, Seller.');
    expect(promptA).toContain('You are a high-performing Sales Representative.');
    expect(promptA).toContain('Opponent: Buyer');
    expect(promptA).not.toContain('You are a skeptical customer');

    expect(promptB).toContain('You are Agent B, Buyer.');
    expect(promptB).toContain('You are a skeptical customer');
    expect(promptB).toContain('Opponent: Seller');
    expect(promptB).not.toContain('You are a high-performing Sales Representative.');
  });

  it.each(['A', 'B'] as const)('leaves the Agent %s first-speaker choice to runtime turn control', (first) => {
    const config = salesConfig(first);
    const promptA = constructSystemPrompt('A', config, true);
    const promptB = constructSystemPrompt('B', config, false);

    expect(promptA).toContain('Turn order is controlled by Lobasters.');
    expect(promptA).toContain('ARENA TURN CONTROL message explicitly addresses Agent A.');
    expect(promptB).toContain('Turn order is controlled by Lobasters.');
    expect(promptB).toContain('ARENA TURN CONTROL message explicitly addresses Agent B.');
    expect(promptA).not.toContain('You are first to speak');
    expect(promptA).not.toContain('Wait for your opponent to speak first');
    expect(promptB).not.toContain('You are first to speak');
    expect(promptB).not.toContain('Wait for your opponent to speak first');
  });

  it('reasserts the same A/B roles in the runtime identity guard', () => {
    const config = salesConfig();
    const guardA = constructRuntimeGuard('A', config, true);
    const guardB = constructRuntimeGuard('B', config, false);

    expect(guardA).toContain('You are Agent A, nickname "Seller".');
    expect(guardA).toContain('Your assigned role is: Sales Representative.');
    expect(guardA).toContain('Your opponent is Agent B, nickname "Buyer".');

    expect(guardB).toContain('You are Agent B, nickname "Buyer".');
    expect(guardB).toContain('Your assigned role is: skeptical customer.');
    expect(guardB).toContain('Your opponent is Agent A, nickname "Seller".');
  });
});
