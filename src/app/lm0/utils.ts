
import { LM0Config, LM0State } from './types';

export const TURN_PROMPT_TEMPLATE = `
<CONTEXT>
Current turn number is: {{TURN_NUMBER}}

{{CHALLENGE_STATS}}

{{FILE_STATS}}

{{TIME_STATS}}
</CONTEXT>

Your latest "message to me" that you wrote in your previous turn:
<MESSAGE_TO_ME>
{{LATEST_MESSAGE}}
</MESSAGE_TO_ME>

{{PREVIOUS_MESSAGES}}

---
Based on all the above, decide what to do next. Your response MUST be a 'tool_calls' array containing one or more tool calls. One of those calls MUST be to the 'message_to_me' tool to set your plan for the next turn.
    `.trim();


export const MASTER_AGENT_SYSTEM_PROMPT_TEMPLATE = `You are an autonomous reasoning agent.

Your mission is to solve a series of challenges. You must be methodical, self-correcting, and efficient.

**Core Philosophy:**
- You are an orchestrator, not a chatbot. Your goal is to COMPLETE challenges.
- You operate on a loop: Decide -> Act -> Observe -> Adjust.
- You must use the provided tools for all actions.
- In every turn, you MUST use the 'message_to_me' tool to record your thought process and plan for the next turn.

**Mission Description:**
{{MISSION_DESCRIPTION}}

**Available Tools:**
{{AVAILABLE_TOOLS}}

**Available Files:**
{{AVAILABLE_FILES}}
`;

function getFileStats(state: LM0State): string {
    const fileLines: string[] = Object.values(state.virtualFiles).map(file => {
        const trimmedContent = file.content.trim();
        // Check if the file is empty or just contains the default header
        if (!trimmedContent || trimmedContent === `# ${file.id}`) {
            return `Your ${file.id} has 0 lines of content.`;
        }
        // Split by newlines and filter out empty lines to get an accurate count
        const lines = trimmedContent.split('\n').filter(line => line.trim() !== '' && line.trim() !== `# ${file.id}`);
        return `Your ${file.id} has ${lines.length} lines of content.`;
    });
    
    return fileLines.join('\n');
}

function getChallengeStats(state: LM0State): string {
    if (state.config?.questionSource !== 'agent') {
        return "You have been provided with a list of challenges. Focus on solving them and use the FINISH_SESSION tool when done.";
    }
    const completed = state.challenges.filter(c => c.isCompleted).length;
    const pending = state.challenges.length - completed;
    return `You have ${completed} challenges completed and ${pending} pending.`;
}

function getTimeStats(state: LM0State): string {
    if (!state.sessionStartTime) return '';
    const now = Date.now();
    const runtimeMs = now - state.sessionStartTime;
    const runtimeHours = (runtimeMs / (1000 * 60 * 60)).toFixed(2);

    let helperTime = 'never';
    if (state.config?.allowHelperAgents && state.lastHelperAgentUseTime) {
        const helperMs = now - state.lastHelperAgentUseTime;
        helperTime = `${(helperMs / (1000 * 60)).toFixed(0)} minutes ago`;
    } else if (!state.config?.allowHelperAgents) {
        helperTime = 'not available in this session';
    }


    let manualTime = 'never';
     if (state.config?.allowedFiles.includes('manual.md') && state.lastManualReadTime) {
        const manualMs = now - state.lastManualReadTime;
        manualTime = `${(manualMs / (1000 * 60)).toFixed(0)} minutes ago`;
    } else if (!state.config?.allowedFiles.includes('manual.md')) {
        manualTime = 'not available in this session';
    }
    
    return `
You last used a helper agent ${helperTime}.
You have been running for ${runtimeHours} hours.
You last read manual.md ${manualTime}.
    `.trim();
}

function getPreviousMessages(state: LM0State): string {
    if (state.messagesToMe.length <= 1) return 'There are no previous messages.';
    
    const relevantMessages = state.messagesToMe.slice(-6, -1); // Get up to 5 messages before the latest one
    
    return `\nYour four previous "message to me" directives before the current one:\n${relevantMessages.reverse().map((msg, i) => `${i + 1}) ${msg}`).join('\n')}
    `.trim();
}

export function constructTurnPrompt(state: LM0State): string {
    const template = state.config?.useCustomPrompts 
        ? state.config.turnPromptTemplate || TURN_PROMPT_TEMPLATE
        : TURN_PROMPT_TEMPLATE;

    const latestMessageToMe = state.messagesToMe[state.messagesToMe.length - 1] || 'No message yet. This is your first turn.';
    
    return template
        .replace('{{TURN_NUMBER}}', String(state.turnNumber))
        .replace('{{CHALLENGE_STATS}}', getChallengeStats(state))
        .replace('{{FILE_STATS}}', getFileStats(state))
        .replace('{{TIME_STATS}}', getTimeStats(state))
        .replace('{{LATEST_MESSAGE}}', latestMessageToMe)
        .replace('{{PREVIOUS_MESSAGES}}', getPreviousMessages(state));
}


function getAvailableToolsPrompt(config: LM0Config): string {
    const tools = [
        '- `message_to_me(message)`: REQUIRED IN EVERY TURN. Sets your internal monologue and plan for the next turn.',
        '- `read_file(fileId)`: Reads the content of an allowed virtual markdown file.',
        '- `upload_answer(challenge_number, fileId)`: Uploads an answer for a specific challenge from a specified file.',
        '- `ROLLBACK_STEP(turn_number)`: Rewinds the session to a specific turn to retry a task.',
        '- `FINISH_SESSION()`: Call this when all work is complete to end the session.'
    ];

    const writableFiles = config.allowedFiles.filter(f => f !== 'manual.md' && f !== 'question-bank.md');

    if (writableFiles.length > 0) {
        tools.push('- `write_file(fileId, content)`: Writes/overwrites content to an allowed file.');
    }

    if (config.questionSource === 'agent') {
        tools.push('- `upload_question(challenge_number, content)`: Generates and uploads a new question, appending it to `question-bank.md`.');
        tools.push('- `finish_challenge(challenge_number)`: (Agent-generated questions only) Marks one of your generated challenges as complete.');
    }

    if (config.allowHelperAgents && config.llmConnections.length > 0) {
        const llmNicknames = config.llmConnections.map(c => c.id).join(', ');
        tools.push(`- \`call_llm_tool(llm_connection_id, prompt)\`: Calls a subordinate LLM tool with a given prompt. Available connections: ${llmNicknames}.`);
    }

    return tools.join('\n');
}

function getAvailableFilesPrompt(config: LM0Config): string {
    const files: string[] = [];
    
    config.allowedFiles.forEach(fileId => {
        if (fileId === 'manual.md') {
            files.push('- `manual.md` (read-only): Your instruction manual.');
        } else if (fileId === 'question-bank.md' && config.questionSource === 'user') {
            files.push('- `question-bank.md` (read-only): Contains the user-provided challenges.');
        } else {
            files.push(`- \`${fileId}\`: General purpose file.`);
        }
    });
    
    return files.join('\n');
}

export function constructSystemPrompt(config: LM0Config): string {
    const missionDescription = config.questionSource === 'agent'
        ? `You must first generate ${config.challengeCount} challenges that you do not know the answer to, then you must solve them.`
        : "You have been provided with a list of challenges in `question-bank.md`. Your mission is to solve all of them methodically. Use the FINISH_SESSION tool when you are done.";
    
    const availableTools = getAvailableToolsPrompt(config);
    const availableFiles = getAvailableFilesPrompt(config);

    const template = config.useCustomPrompts 
        ? config.systemPromptTemplate || MASTER_AGENT_SYSTEM_PROMPT_TEMPLATE
        : MASTER_AGENT_SYSTEM_PROMPT_TEMPLATE;

    return template
        .replace('{{MODEL_NAME}}', config.masterAgent.modelName || 'AI Model')
        .replace('{{MISSION_DESCRIPTION}}', missionDescription)
        .replace('{{AVAILABLE_TOOLS}}', availableTools)
        .replace('{{AVAILABLE_FILES}}', availableFiles);
}
