import { createRequire } from 'module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const modulePath = require.resolve('../../src/renderer/modules/InternalMCPServer.js');

describe('InternalMCPServer agent chat routing', () => {
  let originalIpcRenderer;
  let ipcRenderer;

  beforeEach(() => {
    originalIpcRenderer = window.ipcRenderer;
    ipcRenderer = {
      on: vi.fn(),
      send: vi.fn(),
    };
    window.ipcRenderer = ipcRenderer;
    delete require.cache[modulePath];
  });

  afterEach(() => {
    delete require.cache[modulePath];
    window.ipcRenderer = originalIpcRenderer;
    delete window.chatManager;
  });

  it('routes codexomicsChat directly to processAgentPrompt', async () => {
    const InternalMCPServer = require(modulePath);
    const executeToolByName = vi.fn(async () => {
      throw new Error('Unknown tool: codexomics_chat');
    });
    const processAgentPrompt = vi.fn(async () => ({ success: true }));
    const server = new InternalMCPServer();

    server.initialize({
      chatManager: {
        executeToolByName,
        processAgentPrompt,
      },
    });

    const result = await server.executeMethod(
      'codexomicsChat',
      {
        prompt: 'navigate to 3M',
        activate_multi_agent: false,
        context: {
          window_id: 'win_1',
        },
      },
      { sessionId: 'session-1', transportSessionId: 'transport-1' },
      'request-1'
    );

    expect(result).toEqual({ success: true });
    expect(executeToolByName).not.toHaveBeenCalled();
    expect(processAgentPrompt).toHaveBeenCalledWith(
      'navigate to 3M',
      expect.objectContaining({
        activateMultiAgent: false,
        context: {
          window_id: 'win_1',
        },
        executionContext: { sessionId: 'session-1', transportSessionId: 'transport-1' },
        requestId: 'request-1',
        source: 'mcp-agent',
        onProgress: expect.any(Function),
      })
    );
  });

  it('preserves the trusted MCP execution context across agent-chat delegation', async () => {
    const AgentChatTools = require('../../src/mcp-tools/utility/AgentChatTools.js');
    const executeToolOnClient = vi.fn(async () => ({ success: true }));
    const tools = new AgentChatTools({ executeToolOnClient });
    const executionContext = Object.freeze({
      authenticated: true,
      sessionId: 'auth-session-1',
      principal: 'agent-1',
      isAdmin: true,
    });

    await tools.executeClientTool('codexomics_chat', { prompt: 'research b0001' }, 'window-1', executionContext);

    expect(executeToolOnClient).toHaveBeenCalledWith(
      'codexomics_chat',
      { prompt: 'research b0001' },
      'window-1',
      executionContext
    );
  });

  it('forwards agent progress without letting IPC callback errors escape', async () => {
    const InternalMCPServer = require(modulePath);
    const sendError = new Error('renderer IPC unavailable');
    ipcRenderer.send.mockImplementation(() => {
      throw sendError;
    });
    const processAgentPrompt = vi.fn(async (_prompt, options) => {
      expect(() => {
        options.onProgress({
          type: 'status',
          message: 'Navigating',
          data: { target: '3M' },
        });
      }).not.toThrow();

      return { success: true };
    });
    const server = new InternalMCPServer();

    server.initialize({
      chatManager: {
        processAgentPrompt,
      },
    });

    await expect(
      server.executeMethod(
        'codexomicsChat',
        {
          prompt: 'navigate to 3M',
        },
        {
          authenticated: true,
          sessionId: 'auth-session-1',
          transportSessionId: 'sse-session-1',
          principal: 'agent-1',
        },
        'request-1'
      )
    ).resolves.toEqual({ success: true });
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      'mcp-agent-progress',
      expect.objectContaining({
        type: 'status',
        message: 'Navigating',
        data: { target: '3M' },
        sessionId: 'auth-session-1',
        transportSessionId: 'sse-session-1',
        requestId: 'request-1',
      })
    );
  });
});
