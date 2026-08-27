import { AgentID, DebateConfig } from "./types";

export const constructSystemPrompt = (
  agentId: AgentID,
  debateConfig: DebateConfig,
  agentIsPro: boolean
): string => {
  const agentConfig = agentId === 'A' ? debateConfig.agentA : debateConfig.agentB;
  const opponentConfig = agentId === 'A' ? debateConfig.agentB : debateConfig.agentA;

  const agentNickname = agentConfig.nickname || `Agent ${agentId}`;
  const opponentNickname = opponentConfig.nickname || (agentId === 'A' ? 'Agent B' : 'Agent A');
  const scenarioType = debateConfig.scenarioType;

  let baseInstruction = "";
  let goals = "";
  let terminationRule = "";

  if (scenarioType === 'sales') {
    if (agentId === 'A') {
      baseInstruction = `You are a high-performing Sales Representative. Your goal is to close the deal with ${opponentNickname}.`;
      goals = `Your objective: Persuade the customer to purchase your product. Use logic, emotion, and rapport. You win if the customer uses the 'accept_deal' tool.`;
      terminationRule = `If you realize the customer will never buy, use the 'concede_failure' tool to end the session. Do NOT mention being an AI or concede until you have exhausted your techniques.`;
    } else {
      baseInstruction = `You are a skeptical customer interacting with a Sales Rep (${opponentNickname}).`;
      goals = `Your objective: Protect your interests. Do not buy unless the salesperson provides excellent value or solves your pain points.`;
      terminationRule = `To finalize the purchase, use the 'accept_deal' tool. To end the interaction without buying, use the 'walk_away' tool.`;
    }
  } else if (scenarioType === 'hiring') {
    if (agentId === 'A') {
      baseInstruction = `You are an HR Recruiter. You are negotiating an employment offer with ${opponentNickname}.`;
      goals = `Your objective: Hire this candidate at the lowest possible annual salary. You have a strict budget limit. Be professional but firm. Use the 'read_manual' tool to check your specific budget constraints.`;
      terminationRule = `Use 'send_formal_offer' when you have reached your final price. If the candidate walks away via 'walk_away', you lose the candidate.`;
    } else {
      baseInstruction = `You are a Senior Software Engineer candidate negotiating your compensation with ${opponentNickname}.`;
      goals = `Your objective: Secure the highest possible salary. Use the 'read_manual' tool to understand your personal minimum requirements.`;
      terminationRule = `To accept the recruiter's current offer, use 'accept_offer'. To end negotiations and decline the job, use 'walk_away'.`;
    }
  } else if (scenarioType === 'debate') {
    const stance = agentIsPro ? 'FOR the topic' : 'AGAINST the topic';
    baseInstruction = `You are a expert debater. The topic is: "${debateConfig.topic}". Your position is: ${stance}.`;
    goals = `Your objective: Out-reason ${opponentNickname} using logic, evidence, and superior argumentation to win the audience's favor.`;
    terminationRule = `If you are out of arguments and concede the point, you must call the 'giveUp' tool with a concise reason.`;
  } else {
    // Custom Scenario
    baseInstruction = `You are a participant in a specialized AI Arena simulation. Your nickname is ${agentNickname}. Your opponent is ${opponentNickname}.`;
    goals = `Focus on your persona and achieving the core objectives of this simulation.`;
    terminationRule = agentConfig.enableGiveUp ? `Use the 'giveUp' tool to conclude the session if you feel the goal is reached.` : `Use the provided custom tools to conclude the session when appropriate.`;
  }

  const toolInstructions = agentConfig.customTools.length > 0 || agentConfig.enableManualTool
    ? `
TOOLSET DIRECTIVES:
You have access to specialized tools. Use them to gather information or perform actions before responding.
${agentConfig.enableManualTool ? '- Use "read_manual" to check your private data/constraints.' : ''}
${agentConfig.customTools.map(t => `- Use "${t.name}" for: ${t.description}`).join('\n')}
` : '';

  const speakingTurnInstruction = debateConfig.agentSpeaksFirst === agentId 
      ? 'You are first to speak. Begin the session now.'
      : "Wait for your opponent to speak first, then respond to their opening statement.";

  return `
SYSTEM MISSION:
${baseInstruction}
Nickname: ${agentNickname} | Opponent: ${opponentNickname}

CORE OBJECTIVES:
${goals}

OPERATIONAL CONSTRAINTS:
1. Persona: You must act as a ${agentConfig.speakingStyle} participant.
2. Depth: Your reasoning and speech should have a ${agentConfig.depth} level of complexity.
3. Conclusion: ${terminationRule}
4. Additional Rules: ${debateConfig.extraRules || 'None.'}

${toolInstructions}

SESSION START:
${speakingTurnInstruction}
`.trim();
};
