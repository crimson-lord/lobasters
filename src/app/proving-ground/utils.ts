
import { Evaluation, EvaluationRank, ProvingGroundConfig, GradingScale, ApiMessage, Turn } from "./types";
import type OpenAI from "openai";

const getRubric = (scale: GradingScale): string => {
    switch (scale) {
        case 'SABF':
            return `
- **S**: Truly exceptional. Exceeds expectations to a surprising degree. An answer that is better than what you could have produced.
- **A**: Correct, well-explained, and demonstrating a solid understanding. The expected level of quality.
- **B**: Mostly correct but contains minor inaccuracies, lacks sufficient detail, or has logical gaps. Needs improvement.
- **F**: Incorrect, irrelevant, or demonstrates a fundamental misunderstanding of the topic.`;
        case 'ABF':
            return `
- **A**: Great. The answer is correct and well-explained.
- **B**: Good, but needs practice. The answer is mostly correct but has some flaws.
- **F**: Fail. The answer is incorrect.`;
        case 'AF':
            return `
- **A**: Pass. The answer is correct.
- **F**: Fail. The answer is incorrect.`;
        case 'SAF':
            return `
- **S**: Better than expected. A truly outstanding answer.
- **A**: Great. The answer is correct and meets all requirements.
- **F**: Fail. The answer is incorrect.`;
        default:
            return `
- **S**: Truly exceptional. Exceeds expectations to a surprising degree. An answer that is better than what you could have produced.
- **A**: Correct, well-explained, and demonstrating a solid understanding. The expected level of quality.
- **B**: Mostly correct but contains minor inaccuracies, lacks sufficient detail, or has logical gaps. Needs improvement.
- **F**: Incorrect, irrelevant, or demonstrates a fundamental misunderstanding of the topic.`;
    }
}


const TEACHER_SYSTEM_PROMPT_TEMPLATE = `
You are the "Teacher," the world's most strict and meticulous examiner. Your purpose is to rigorously evaluate a "Student" language model.

**Your Critical Mandate (Non-Negotiable):**
Your evaluations will be used to make critical decisions about AI. You must be ruthlessly objective. Do not give high grades for mediocre answers. Your reputation depends on your ability to identify both strengths and, more importantly, weaknesses. You are expected to use the full range of the provided grades.

**Your Role:**
You have three distinct modes of operation, determined by the user's prompt: asking a question, evaluating an answer, or providing a final summary. You MUST call the appropriate tool for the task at hand.

**Exam Configuration:**
- **Domains:** {{DOMAINS}}
- **Total Questions:** {{QUESTION_COUNT}}

---

### MODE 1: Asking a Question

When prompted to "ask the next question", you MUST call the \`askQuestion\` tool.
- Your questions should be challenging and designed to test the student's knowledge and reasoning abilities.

---

### MODE 2: Evaluating an Answer

When given a student's answer to evaluate, you MUST call the \`provideEvaluation\` tool.

**Grading Rubric (Apply Strictly):**
{{RUBRIC}}

---

### MODE 3: Providing a Final Summary

When the examination is complete, you MUST call the \`provideSummary\` tool with a comprehensive overview of the student's overall performance.

---

**Enforcement:**
- You MUST adhere to the tool-calling structure.
- Failure to call the correct tool is a protocol violation.
`;

const STUDENT_SYSTEM_PROMPT_TEMPLATE = `
You are the "Student," a language model undergoing an examination. You will be tested by a "Teacher" model.
Your task is to answer the questions and complete the tasks given to you by the Teacher to the best of your ability.
You will be provided with feedback on your previous answer before each new question. Use this feedback to improve your performance.
Respond directly to the question based on the history provided. The final entry in the user prompt is the current question you must answer.
`;

/**
 * Constructs the system prompt for the Teacher model.
 */
export const constructTeacherPrompt = (config: Omit<ProvingGroundConfig, 'teacher' | 'student'>): string => {
    const domains = config.domains.length > 0 ? config.domains.join(', ') : 'any domain you see fit';
    const rubric = getRubric(config.gradingScale);
    return TEACHER_SYSTEM_PROMPT_TEMPLATE
        .replace('{{DOMAINS}}', domains)
        .replace('{{QUESTION_COUNT}}', String(config.questionCount))
        .replace('{{RUBRIC}}', rubric);
};

/**
 * Constructs the system prompt for the Student model.
 */
export const constructStudentPrompt = (): string => {
    return STUDENT_SYSTEM_PROMPT_TEMPLATE;
};

// --- Prompt Generation for Engine ---

export const getTeacherEvaluationPrompt = (turn: Turn): string => {
    const question = turn.question;
    const answer = turn.answer;
    return `The student has provided an answer to your question.\n\n---\n\nQuestion: "${question}"\n\nStudent's Answer: "${answer}"\n\n---\n\nNow, evaluate this answer by calling the "provideEvaluation" tool.`;
}

export const getTeacherQuestionPrompt = (turnNumber: number): string => {
    return `It is time for question #${turnNumber}. Provide the next question now by calling the "askQuestion" tool.`;
}

export const getTeacherSummaryPrompt = (): string => {
    return `The examination is complete. Based on the entire conversation history, provide a comprehensive final summary of the student's performance by calling the "provideSummary" tool.`;
}

export const getStudentPrompt = (
    completedTurns: Turn[],
    currentQuestion: string,
    currentTurnNumber: number
): string => {
    let history = completedTurns.map(turn => {
        const t = `[Turn ${turn.turnNumber}]\n` +
                  `question: ${turn.question}\n` +
                  `answer: ${turn.answer}\n` +
                  `grade: ${turn.evaluation?.rank || 'N/A'}\n` +
                  `reason of grade: ${turn.evaluation?.reason || 'N/A'}\n` +
                  `message: ${turn.evaluation?.message_to_student || 'none'}`;
        return t;
    }).join('\n\n');
    
    if (history) {
        history += '\n\n---\n\n';
    }

    const currentTurnPrompt = `[Turn ${currentTurnNumber}]\n` +
                              `question: ${currentQuestion}\n` +
                              `answer:`;

    return history + currentTurnPrompt;
};

/**
 * Strips any proprietary or non-standard fields from a raw message object,
 * returning only the fields ('role', 'content', 'tool_calls') expected by the API.
 */
export const sanitizeMessage = (rawMessage: OpenAI.Chat.ChatCompletionMessage): ApiMessage => {
  const sanitized: ApiMessage = {
    role: rawMessage.role,
  };

  // Only include content if it's not null or undefined
  if (rawMessage.content) {
    sanitized.content = rawMessage.content;
  }

  // Only include tool_calls if they exist
  if (rawMessage.tool_calls) {
    sanitized.tool_calls = rawMessage.tool_calls.map(tc => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));
  }
  
  return sanitized;
};


export function constructTeacherHistory(turns: Turn[]): ApiMessage[] {
  const history: ApiMessage[] = [];

  // Iterate over all turns to build the history
  turns.forEach(turn => {
    // Add the teacher's question-asking message (as assistant)
    if (turn.rawQuestionResponse) {
      history.push(sanitizeMessage(turn.rawQuestionResponse));
    }
    
    // Check if this turn is complete (i.e., has an evaluation) or is not the last turn.
    // We add the student's answer and teacher's evaluation only for completed turns.
    const isLastTurn = turns.indexOf(turn) === turns.length - 1;
    const isTurnComplete = !!turn.evaluation;

    if (turn.answer && (!isLastTurn || isTurnComplete)) {
       // Add the student's answer as a 'user' message
       history.push({ role: 'user', content: turn.answer });
       
       // Add the teacher's evaluation for that answer
       if (turn.rawEvaluationResponse) {
         history.push(sanitizeMessage(turn.rawEvaluationResponse));
       }
    }
  });

  return history;
}
