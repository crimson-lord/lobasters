'use client';

import { useEffect } from 'react';

type PageNavigationToolsProps = {
  page: 'home' | 'terms' | 'privacy';
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
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
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
    } else {
      register({
        name: 'lobasters_return_home',
        description: `Return from the Lobasters ${page === 'terms' ? 'Terms of Service' : 'Privacy Policy'} to the landing page.`,
        inputSchema: noInput,
        execute: () => {
          window.location.assign('/');
          return text('Returning to the Lobasters landing page.');
        },
      });
    }

    return () => controller.abort();
  }, [page]);

  return null;
}
