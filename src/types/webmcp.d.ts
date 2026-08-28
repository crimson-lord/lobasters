type WebMcpContent = {
  type: 'text';
  text: string;
};

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  execute: (input: Record<string, never>) =>
    | { content: WebMcpContent[] }
    | Promise<{ content: WebMcpContent[] }>;
};

interface Document {
  modelContext?: {
    registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void>;
  };
}

interface Navigator {
  /** Compatibility alias used by earlier WebMCP browser implementations. */
  modelContext?: {
    registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void>;
  };
}
