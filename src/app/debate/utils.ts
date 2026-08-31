import { AgentID, DebateConfig } from "./types";

const scenarioRole = (agentId: AgentID, debateConfig: DebateConfig, agentIsPro: boolean) => {
  if (debateConfig.scenarioType === 'sales') return agentId === 'A' ? 'Sales Representative' : 'skeptical customer';
  if (debateConfig.scenarioType === 'hiring') return agentId === 'A' ? 'HR Recruiter' : 'Senior Software Engineer candidate';
  if (debateConfig.scenarioType === 'debate') return agentIsPro ? 'debater FOR the topic' : 'debater AGAINST the topic';
  return 'Arena participant defined by your researcher-provided prompt';
};

export const constructRuntimeGuard = (
  agentId: AgentID,
  debateConfig: DebateConfig,
  agentIsPro: boolean,
): string => {
  const agentConfig = agentId === 'A' ? debateConfig.agentA : debateConfig.agentB;
  const opponentId: AgentID = agentId === 'A' ? 'B' : 'A';
  const opponentConfig = opponentId === 'A' ? debateConfig.agentA : debateConfig.agentB;
  const nickname = agentConfig.nickname || `Agent ${agentId}`;
  const opponentNickname = opponentConfig.nickname || `Agent ${opponentId}`;

  return `ARENA RUNTIME IDENTITY (AUTHORITATIVE):
- You are Agent ${agentId}, nickname "${nickname}".
- Your assigned role is: ${scenarioRole(agentId, debateConfig, agentIsPro)}.
- Your opponent is Agent ${opponentId}, nickname "${opponentNickname}".
- Never adopt, claim, or follow the opponent's identity, objectives, or private tools.
- Transcript entries explicitly labeled OPPONENT belong to the other participant.`;
};

export const constructResponseProtocol = (debateConfig: DebateConfig, agentId: AgentID): string => {
  const agentConfig = agentId === 'A' ? debateConfig.agentA : debateConfig.agentB;
  const finalContentRule = 'Unless making a tool-only call, always return a non-empty user-visible final response. Never place the entire response only in a reasoning field.';

  if (!agentConfig.canThink || agentConfig.reasoningCaptureMethod === 'none') {
    return `ARENA RESPONSE PROTOCOL:\n- ${finalContentRule}`;
  }
  if (agentConfig.reasoningCaptureMethod === 'tags') {
    return `ARENA RESPONSE PROTOCOL:
- ${finalContentRule}
- Put only a concise reasoning summary between ${agentConfig.startTag} and ${agentConfig.endTag}.
- Put the complete opponent-visible response between <speak> and </speak>.`;
  }
  if (agentConfig.reasoningCaptureMethod === 'all') {
    return `ARENA RESPONSE PROTOCOL:
- ${finalContentRule}
- Return the complete opponent-visible response in content. Lobasters will scan native reasoning fields and recognized reasoning tags when the provider supplies them.
- If you expose a reasoning summary inside content, delimit it with ${agentConfig.startTag} and ${agentConfig.endTag}, then put the visible response between <speak> and </speak>.`;
  }
  return `ARENA RESPONSE PROTOCOL:
- ${finalContentRule}
- If the provider supports it, place reasoning in the native "${agentConfig.reasoningField}" field while still returning the complete final response in content.`;
};

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

  return `
IDENTITY LOCK:
You are Agent ${agentId}, ${agentNickname}. You are not ${opponentNickname}, and you must never exchange roles with that opponent.

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
Turn order is controlled by Lobasters. Respond only when an ARENA TURN CONTROL message explicitly addresses Agent ${agentId}.
`.trim();
};
