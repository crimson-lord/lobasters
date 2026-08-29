'use client';

import { useEffect, useRef } from 'react';
import type { LM0Checkpoint, LM0State } from '@/app/lm0/types';

export type LabReportFormat = 'markdown' | 'pdf' | 'json' | 'zip';

interface LabSessionToolsProps {
  state: LM0State;
  pauseSession: () => void;
  resumeSession: () => void;
  finishSession: () => void;
  captureCheckpoint: () => LM0Checkpoint;
  restoreCheckpoint: (checkpoint: LM0Checkpoint, status?: 'running' | 'paused') => void;
  queueResearcherInstruction: (instruction: string) => void;
  onRunAnother: () => void;
}

type ActivityScope = 'all' | 'log' | 'history' | 'hub' | 'errors' | 'challenges' | 'messages_to_me';

interface StoredCheckpoint {
  id: string;
  name: string;
  createdAt: string;
  checkpoint: LM0Checkpoint;
}

const labActions = [
  'get_status',
  'pause',
  'resume',
  'stop',
  'inspect_workspace',
  'read_file',
  'get_activity',
  'get_raw_transcript',
  'copy_raw_transcript',
  'steer',
  'checkpoint',
  'restore_checkpoint',
  'export_results',
  'run_another',
] as const;

const sensitiveKeyPattern = /^(?:api[_-]?key|authorization|access[_-]?token|secret)$/i;

function result(message: string) {
  return { content: [{ type: 'text' as const, text: message }] };
}

function requireString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} must be a non-empty string.`);
  return value.trim();
}

function optionalLimit(input: Record<string, unknown>) {
  const value = input.limit;
  if (value === undefined) return 20;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 200) {
    throw new Error('limit must be an integer from 1 through 200.');
  }
  return value as number;
}

function collectConfiguredSecrets(value: unknown) {
  const secrets = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (current: unknown) => {
    if (current === null || typeof current !== 'object' || seen.has(current as object)) return;
    seen.add(current as object);
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
      if (sensitiveKeyPattern.test(key) && typeof entry === 'string' && entry) secrets.add(entry);
      else visit(entry);
    }
  };
  visit(value);
  return [...secrets].sort((left, right) => right.length - left.length);
}

/** Remove credential fields and scrub their values before data can leave the page. */
export function sanitizeLabStateForOutput<T>(value: T, secretSource: unknown = value): T {
  const secrets = collectConfiguredSecrets(secretSource);
  const seen = new WeakSet<object>();
  const clean = (current: unknown): unknown => {
    if (typeof current === 'string') {
      return secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), current);
    }
    if (current === null || typeof current !== 'object') return current;
    if (seen.has(current as object)) return '[Circular]';
    seen.add(current as object);
    if (Array.isArray(current)) return current.map(clean);
    return Object.fromEntries(
      Object.entries(current as Record<string, unknown>)
        .filter(([key]) => !sensitiveKeyPattern.test(key) && key !== 'turnCheckpoints')
        .map(([key, entry]) => [key, clean(entry)]),
    );
  };
  return clean(value) as T;
}

export function requestLabReportDownload(state: LM0State, format: LabReportFormat) {
  const safeState = sanitizeLabStateForOutput(state);
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '/api/lab-report';
  form.style.display = 'none';
  for (const [name, value] of Object.entries({ format, state: JSON.stringify(safeState) })) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  // Removing a submitted form synchronously can cancel an attachment request
  // in Chromium, especially when WebMCP initiated the action.
  window.setTimeout(() => form.remove(), 10_000);
}

function statusSnapshot(state: LM0State, checkpoints: Map<string, StoredCheckpoint>) {
  const completedChallenges = state.challenges.filter(challenge => challenge.isCompleted).length;
  return {
    status: state.status,
    turnNumber: state.turnNumber,
    runtimeMilliseconds: state.sessionStartTime ? Math.max(0, Date.now() - state.sessionStartTime) : null,
    challenges: {
      source: state.config?.questionSource ?? null,
      completed: completedChallenges,
      total: state.challenges.length,
    },
    activity: {
      logEntries: state.log.length,
      historyTurns: state.history.length,
      helperMessages: state.hubMessages.length,
      errors: state.errors.length,
      latestLog: state.log.at(-1) ?? null,
    },
    workspaceFiles: Object.values(state.virtualFiles).map(file => ({
      name: file.id,
      characters: file.content.length,
      empty: file.content.trim().length === 0,
    })),
    checkpoints: [...checkpoints.values()].map(checkpoint => ({
      id: checkpoint.id,
      name: checkpoint.name,
      createdAt: checkpoint.createdAt,
    })),
    availableControls: {
      pause: state.status === 'running',
      resume: state.status === 'paused',
      stop: state.status === 'running' || state.status === 'paused',
      steer: state.status === 'paused',
      checkpoint: state.status === 'paused' || state.status === 'finished' || state.status === 'error',
      restoreCheckpoint: state.status !== 'running' && checkpoints.size > 0,
      exportResults: state.status !== 'configuring',
    },
  };
}

function activitySnapshot(state: LM0State, scope: ActivityScope, limit: number) {
  const takeLast = <T,>(values: T[]) => values.slice(Math.max(0, values.length - limit));
  const snapshot: Record<string, unknown> = {
    status: state.status,
    turnNumber: state.turnNumber,
  };
  if (scope === 'all' || scope === 'log') snapshot.log = takeLast(state.log);
  if (scope === 'all' || scope === 'history') snapshot.history = takeLast(state.history);
  if (scope === 'all' || scope === 'hub') snapshot.hub = takeLast(state.hubMessages);
  if (scope === 'all' || scope === 'errors') snapshot.errors = takeLast(state.errors);
  if (scope === 'all' || scope === 'challenges') snapshot.challenges = takeLast(state.challenges);
  if (scope === 'all' || scope === 'messages_to_me') snapshot.messagesToMe = takeLast(state.messagesToMe);
  return sanitizeLabStateForOutput(snapshot, state);
}

async function copyTextToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Older WebMCP hosts may not grant the async clipboard permission. Try
    // the synchronous browser copy command and verify its boolean result.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('The browser denied clipboard access. Use get_raw_transcript instead.');
}

export function LabSessionTools(props: LabSessionToolsProps) {
  const latestRef = useRef(props);
  const checkpointsRef = useRef(new Map<string, StoredCheckpoint>());
  const hasRegisteredRef = useRef(false);
  latestRef.current = props;

  useEffect(() => {
    if (hasRegisteredRef.current) return;
    const controller = new AbortController();
    let retryTimer: number | undefined;
    let attempts = 0;

    const registerTool = () => {
      const modelContext = document.modelContext ?? navigator.modelContext;
      if (!modelContext) {
        if (attempts++ < 50) retryTimer = window.setTimeout(registerTool, 100);
        return;
      }
      if (hasRegisteredRef.current) return;
      hasRegisteredRef.current = true;

      void modelContext.registerTool({
        name: 'lobasters_lab',
        description: [
          'Persistent control plane for the active Lobasters LAB autonomous-agent session.',
          'Use one action per invocation. It controls lifecycle, inspects research artifacts, creates/restores paused checkpoints, exports sanitized results, and can steer only the next turn while paused.',
          'Raw transcript actions expose the captured Master Agent API history; get_activity can separately select logs, history, helper hub, errors, challenges, or self-directives.',
          'Provider API keys are write-only configuration and are never returned by this command or included in exported files.',
        ].join(' '),
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: { type: 'string', enum: labActions },
            fileName: { type: 'string', description: 'Exact virtual filename required by read_file.' },
            scope: {
              type: 'string',
              enum: ['all', 'log', 'history', 'hub', 'errors', 'challenges', 'messages_to_me'],
              description: 'Activity category for get_activity. Defaults to all.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 200,
              description: 'Maximum recent entries per requested activity category. Defaults to 20.',
            },
            instruction: {
              type: 'string',
              description: 'Researcher instruction for the next Master Agent turn. Required by steer; LAB must be paused.',
            },
            checkpointName: { type: 'string', description: 'Optional human label when creating a checkpoint.' },
            checkpointId: { type: 'string', description: 'Checkpoint identifier required by restore_checkpoint.' },
            format: {
              type: 'string',
              enum: ['markdown', 'pdf', 'json', 'zip'],
              description: 'Attachment format required by export_results.',
            },
          },
          required: ['action'],
        },
        execute: (input: Record<string, unknown>) => {
          const action = requireString(input, 'action');
          const current = latestRef.current;
          const liveState = current.state;
          const checkpoints = checkpointsRef.current;

          if (action === 'get_status') {
            return result(JSON.stringify(sanitizeLabStateForOutput(statusSnapshot(liveState, checkpoints), liveState), null, 2));
          }
          if (action === 'pause') {
            if (liveState.status !== 'running') throw new Error('LAB can be paused only while it is running.');
            current.pauseSession();
            latestRef.current = { ...current, state: { ...liveState, status: 'paused' } };
            return result('LAB paused. Any in-flight Master or helper provider request was cancelled.');
          }
          if (action === 'resume') {
            if (liveState.status !== 'paused') throw new Error('LAB can be resumed only while it is paused.');
            current.resumeSession();
            latestRef.current = { ...current, state: { ...liveState, status: 'running' } };
            return result('LAB resumed. The Master Agent will continue with the next turn.');
          }
          if (action === 'stop') {
            if (liveState.status !== 'running' && liveState.status !== 'paused') {
              throw new Error('There is no active LAB session to stop.');
            }
            current.finishSession();
            latestRef.current = { ...current, state: { ...liveState, status: 'finished' } };
            return result('LAB stop requested. The current state remains available for inspection and export.');
          }
          if (action === 'inspect_workspace') {
            return result(JSON.stringify({
              status: liveState.status,
              files: Object.values(liveState.virtualFiles).map(file => ({
                name: file.id,
                characters: file.content.length,
                lines: file.content ? file.content.split(/\r?\n/).length : 0,
                empty: file.content.trim().length === 0,
              })),
            }, null, 2));
          }
          if (action === 'read_file') {
            const fileName = requireString(input, 'fileName');
            const file = liveState.virtualFiles[fileName];
            if (!file) {
              throw new Error(`Unknown LAB file "${fileName}". Use inspect_workspace to list exact names.`);
            }
            return result(JSON.stringify(sanitizeLabStateForOutput({ fileName: file.id, content: file.content }, liveState), null, 2));
          }
          if (action === 'get_activity') {
            const scopeValue = input.scope ?? 'all';
            const allowedScopes: ActivityScope[] = ['all', 'log', 'history', 'hub', 'errors', 'challenges', 'messages_to_me'];
            if (typeof scopeValue !== 'string' || !allowedScopes.includes(scopeValue as ActivityScope)) {
              throw new Error(`scope must be one of: ${allowedScopes.join(', ')}.`);
            }
            return result(JSON.stringify(activitySnapshot(liveState, scopeValue as ActivityScope, optionalLimit(input)), null, 2));
          }
          if (action === 'get_raw_transcript') {
            return result(JSON.stringify(sanitizeLabStateForOutput(liveState.history, liveState), null, 2));
          }
          if (action === 'copy_raw_transcript') {
            const transcript = JSON.stringify(sanitizeLabStateForOutput(liveState.history, liveState), null, 2);
            return copyTextToClipboard(transcript).then(() => result('The sanitized LAB raw transcript was copied to the browser system clipboard.'));
          }
          if (action === 'steer') {
            if (liveState.status !== 'paused') throw new Error('Pause LAB before steering its next turn.');
            const instruction = requireString(input, 'instruction');
            current.queueResearcherInstruction(instruction);
            latestRef.current = { ...current, state: { ...liveState, queuedResearcherInstruction: instruction } };
            return result('Researcher instruction queued for the next Master Agent turn. Resume LAB when ready.');
          }
          if (action === 'checkpoint') {
            if (liveState.status !== 'paused' && liveState.status !== 'finished' && liveState.status !== 'error') {
              throw new Error('Pause or finish LAB before creating a consistent checkpoint.');
            }
            const createdAt = new Date().toISOString();
            const id = `lab-checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const checkpointName = typeof input.checkpointName === 'string' && input.checkpointName.trim()
              ? input.checkpointName.trim()
              : `Turn ${liveState.turnNumber}`;
            checkpoints.set(id, {
              id,
              name: checkpointName,
              createdAt,
              checkpoint: current.captureCheckpoint(),
            });
            return result(JSON.stringify({ id, name: checkpointName, createdAt, turnNumber: liveState.turnNumber }, null, 2));
          }
          if (action === 'restore_checkpoint') {
            if (liveState.status === 'running') throw new Error('Pause or stop LAB before restoring a checkpoint.');
            const checkpointId = requireString(input, 'checkpointId');
            const stored = checkpoints.get(checkpointId);
            if (!stored) throw new Error('Checkpoint not found. Use get_status to list checkpoint identifiers.');
            current.restoreCheckpoint(stored.checkpoint, 'paused');
            latestRef.current = {
              ...current,
              state: { ...liveState, ...stored.checkpoint, status: 'paused' },
            };
            return result(`Restored checkpoint "${stored.name}" in paused state. Inspect it, then resume when ready.`);
          }
          if (action === 'export_results') {
            if (liveState.status === 'configuring' || !liveState.config) throw new Error('No initialized LAB session is available to export.');
            const format = requireString(input, 'format') as LabReportFormat;
            if (!(['markdown', 'pdf', 'json', 'zip'] as const).includes(format)) {
              throw new Error('format must be markdown, pdf, json, or zip.');
            }
            requestLabReportDownload(liveState, format);
            return result(`Downloading a sanitized LAB ${format.toUpperCase()} attachment. Provider API keys are excluded.`);
          }
          if (action === 'run_another') {
            current.onRunAnother();
            return result('Returning to LAB setup for a new research session.');
          }
          throw new Error('Unsupported LAB action.');
        },
      }, { signal: controller.signal }).catch(() => {
        // Unsupported browsers retain the normal researcher-facing workflow.
      });
    };

    // Deferring one task makes this robust to React Strict Effects: the first
    // development-only setup is cleaned before it can register a dead signal.
    retryTimer = window.setTimeout(registerTool, 0);
    return () => {
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, []);

  return null;
}
