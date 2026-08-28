'use client';

import { useEffect } from 'react';

type PageNavigationToolsProps = {
  page: 'home' | 'terms' | 'privacy' | 'dashboard' | 'arena' | 'examination' | 'lab' | 'settings';
};

const noInput = { type: 'object' as const, properties: {} };

function text(message: string) {
  return { content: [{ type: 'text' as const, text: message }] };
}

/**
 * Registers only the actions that are meaningful on the page currently open.
 * The browser owns discovery and invocation; regular UI buttons remain the
 * researcher-facing control surface.
 */
export function PageNavigationTools({ page }: PageNavigationToolsProps) {
  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const registerTools = () => {
      // Chrome's early implementation exposed the API on navigator; newer
      // WebMCP browsers use document. Supporting both keeps the same tools
      // discoverable across challenge test environments.
      const modelContext = document.modelContext ?? navigator.modelContext;
      // Some browser agents inject the experimental WebMCP API immediately
      // after React hydrates. Retry briefly instead of permanently missing the
      // one registration opportunity.
      if (!modelContext) {
        if (attempts++ < 50) retryTimer = setTimeout(registerTools, 100);
        return;
      }

      const register = (tool: WebMcpTool) => {
        void modelContext.registerTool(tool, { signal: controller.signal }).catch(() => {
          // Unsupported browsers and duplicate registrations should not affect
          // the human-facing page.
        });
      };

      if (page === 'home') {
        register({
          name: 'lobasters_open_dashboard',
          description: 'Open the Lobasters main dashboard, where all labs are available.',
          inputSchema: noInput,
          execute: () => {
            window.location.assign('/dashboard');
            return text('Opening the Lobasters dashboard.');
          },
        });
        register({
          name: 'lobasters_open_terms',
          description: 'Open Lobasters Terms of Service.',
          inputSchema: noInput,
          execute: () => {
            window.location.assign('/terms');
            return text('Opening the Terms of Service.');
          },
        });
        register({
          name: 'lobasters_open_privacy',
          description: 'Open the Lobasters Privacy Policy.',
          inputSchema: noInput,
          execute: () => {
            window.location.assign('/privacy');
            return text('Opening the Privacy Policy.');
          },
        });
        register({
          name: 'lobasters_open_github_repository',
          description: 'Open the public Lobasters GitHub repository in a new browser tab.',
          inputSchema: noInput,
          execute: () => {
            window.open('https://github.com/crimson-lord/lobasters', '_blank', 'noopener,noreferrer');
            return text('Opened the public Lobasters GitHub repository in a new tab.');
          },
        });
      } else if (page === 'dashboard') {
        register({
          name: 'lobasters_enter_arena',
          description: 'Open Arena to configure and run a structured debate between two models.',
          inputSchema: noInput,
          execute: () => {
            window.location.assign('/debate');
            return text('Opening Arena.');
          },
        });
        register({
          name: 'lobasters_enter_examination',
          description: 'Open Examination to configure and run a teacher-versus-student model evaluation.',
          inputSchema: noInput,
          execute: () => {
            window.location.assign('/proving-ground');
            return text('Opening Examination.');
          },
        });
        register({
          name: 'lobasters_enter_lab',
          description: 'Open LAB, the autonomous agent environment with a virtual workspace.',
          inputSchema: noInput,
          execute: () => {
            window.location.assign('/lm0');
            return text('Opening LAB.');
          },
        });
        register({
          name: 'lobasters_open_settings',
          description: 'Open Lobasters settings for appearance and workspace preferences.',
          inputSchema: noInput,
          execute: () => {
            window.location.assign('/settings');
            return text('Opening Settings.');
          },
        });
      } else {
        register({
          name: page === 'terms' || page === 'privacy'
            ? 'lobasters_return_home'
            : 'lobasters_return_to_dashboard',
          description: page === 'terms' || page === 'privacy'
            ? `Return from the Lobasters ${page === 'terms' ? 'Terms of Service' : 'Privacy Policy'} to the landing page.`
            : `Return from ${page === 'arena' ? 'Arena' : page === 'examination' ? 'Examination' : page === 'lab' ? 'LAB' : 'Settings'} to the Lobasters dashboard.`,
          inputSchema: noInput,
          execute: () => {
            const destination = page === 'terms' || page === 'privacy' ? '/' : '/dashboard';
            window.location.assign(destination);
            return text(destination === '/' ? 'Returning to the Lobasters landing page.' : 'Returning to the Lobasters dashboard.');
          },
        });
      }
    };

    registerTools();

    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [page]);

  return null;
}
