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
    additionalProperties?: boolean;
  };
  execute: (input: Record<string, unknown>) =>
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
