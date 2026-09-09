import { describe, expect, it, beforeAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ChatManager = require('../../src/renderer/modules/ChatManager.js');
const CapabilityRegistryAdapter = require('../../src/renderer/modules/chat/orchestration/CapabilityRegistryAdapter.js');
const ToolCallPlanCompiler = require('../../src/renderer/modules/chat/orchestration/ToolCallPlanCompiler.js');
const ExecutionGraphScheduler = require('../../src/renderer/modules/chat/orchestration/ExecutionGraphScheduler.js');
const ExecutionGateway = require('../../src/renderer/modules/chat/orchestration/ExecutionGateway.js');
const TurnContext = require('../../src/renderer/modules/chat/orchestration/TurnContext.js');

describe('ChatManager execution graph integration', () => {
  beforeAll(() => {
    globalThis.ExecutionGraphScheduler = ExecutionGraphScheduler;
    globalThis.ExecutionGateway = ExecutionGateway;
    globalThis.CapabilityRegistryAdapter = CapabilityRegistryAdapter;
    globalThis.ToolCallPlanCompiler = ToolCallPlanCompiler;
    globalThis.TurnContext = TurnContext;
  });

  function createManager({ tools, metadata, maxConcurrency = 4 } = {}) {
    const manager = Object.create(ChatManager.prototype);
    const registry = new CapabilityRegistryAdapter({
      tools: Object.entries(metadata).map(([name, definition]) => ({ name, ...definition })),
    });
    const calls = [];
    manager._capabilityRegistry = registry;
    manager._toolCallPlanCompiler = new ToolCallPlanCompiler({ registry });
    manager.cloneToolParameters = parameters => JSON.parse(JSON.stringify(parameters || {}));
    manager.getCapabilityRegistry = () => registry;
    manager.getToolCallPlanCompiler = () => manager._toolCallPlanCompiler;
    manager.getExecutionGateway = () =>
      new ExecutionGateway({
        legacyExecutor: async (name, parameters) => {
          calls.push({ name, parameters });
          const value = await tools[name](parameters);
          return value;
        },
      });
    manager.maxConcurrency = maxConcurrency;
    return { manager, calls };
  }

  const read = { effect: 'read', readSet: [], writeSet: [], supportsParallel: true };
  const pure = { effect: 'pure', readSet: [], writeSet: [], supportsParallel: true };
  const write = { effect: 'write', supportsParallel: false };

  it('executes references in dependency order and preserves legacy results', async () => {
    const { manager, calls } = createManager({
      metadata: { get_sequence: read, compute_gc: pure },
      tools: {
        get_sequence: async () => ({ sequence: 'ATGC' }),
        compute_gc: async parameters => ({ sequence: parameters.sequence, gc: 0.5 }),
      },
    });
    const context = new TurnContext();
    const results = await manager.executeToolExecutionGraph(
      [
        { tool_name: 'get_sequence', tool_call_id: 'source', parameters: {} },
        { tool_name: 'compute_gc', tool_call_id: 'gc', parameters: { sequence: '{source.sequence}' } },
      ],
      [],
      { turnContext: context }
    );

    expect(calls.map(call => call.name)).toEqual(['get_sequence', 'compute_gc']);
    expect(calls[1].parameters.sequence).toBe('ATGC');
    expect(results.map(result => result.tool_call_id)).toEqual(['source', 'gc']);
    expect(results[1]).toMatchObject({ success: true, result: { gc: 0.5 } });
  });

  it('runs independent reads in parallel and serializes write/read conflicts', async () => {
    let active = 0;
    let maximum = 0;
    const { manager } = createManager({
      metadata: {
        compute_gc: { ...pure, readSet: ['gc-input'] },
        blast_search: { ...read, readSet: ['blast-input'] },
        export_data: { ...write, readSet: [], writeSet: ['export'] },
        read_data: { ...read, readSet: ['export'] },
      },
      tools: {
        compute_gc: async () => {
          active++;
          maximum = Math.max(maximum, active);
          await new Promise(resolve => setTimeout(resolve, 5));
          active--;
          return { artifact: 'gc' };
        },
        blast_search: async () => {
          active++;
          maximum = Math.max(maximum, active);
          await new Promise(resolve => setTimeout(resolve, 5));
          active--;
          return { artifact: 'blast' };
        },
        export_data: async parameters => ({ exported: parameters.input }),
        read_data: async () => ({ data: 'ready' }),
      },
    });
    const results = await manager.executeToolExecutionGraph(
      [
        { tool_name: 'compute_gc', tool_call_id: 'gc', parameters: {} },
        { tool_name: 'blast_search', tool_call_id: 'blast', parameters: {} },
      ],
      [],
      { turnContext: new TurnContext() }
    );
    expect(maximum).toBe(2);
    expect(results.every(result => result.success)).toBe(true);

    const conflict = await manager.executeToolExecutionGraph(
      [
        { tool_name: 'export_data', tool_call_id: 'export', parameters: {} },
        { tool_name: 'read_data', tool_call_id: 'read', parameters: {} },
      ],
      [],
      { turnContext: new TurnContext() }
    );
    expect(conflict.every(result => result.success)).toBe(true);

    const exportAfterRead = await manager.executeToolExecutionGraph(
      [
        { tool_name: 'read_data', tool_call_id: 'input', parameters: {} },
        { tool_name: 'export_data', tool_call_id: 'export-after-read', parameters: { input: '{input.data}' } },
      ],
      [],
      { turnContext: new TurnContext() }
    );
    expect(exportAfterRead[1]).toMatchObject({ success: true, result: { exported: 'ready' } });
  });

  it('blocks dependents after partial failure while independent work continues', async () => {
    const calls = [];
    const { manager } = createManager({
      metadata: { first: read, dependent: pure, independent: read },
      tools: {
        first: async () => {
          calls.push('first');
          return { success: false, error: 'broken' };
        },
        dependent: async () => {
          calls.push('dependent');
          return { ok: true };
        },
        independent: async () => {
          calls.push('independent');
          return { ok: true };
        },
      },
    });
    const results = await manager.executeToolExecutionGraph(
      [
        { tool_name: 'first', tool_call_id: 'first', parameters: {} },
        { tool_name: 'dependent', tool_call_id: 'dependent', parameters: { value: '{first.value}' } },
        { tool_name: 'independent', tool_call_id: 'independent', parameters: {} },
      ],
      [],
      { turnContext: new TurnContext() }
    );

    expect(calls).toContain('first');
    expect(calls).toContain('independent');
    expect(calls).not.toContain('dependent');
    expect(results[1]).toMatchObject({ success: false, status: 'blocked' });
  });

  it('falls back to the legacy queue for unsafe plans', async () => {
    const manager = Object.create(ChatManager.prototype);
    manager.executePendingToolExecutionQueue = async tools =>
      tools.map(tool => ({ tool: tool.tool_name, success: true }));
    manager.getCapabilityRegistry = () => new CapabilityRegistryAdapter();
    manager.getToolCallPlanCompiler = () => new ToolCallPlanCompiler();

    const results = await manager.executeToolExecutionGraph(
      [{ tool_name: 'unknown_vendor_tool', parameters: {} }],
      [],
      { turnContext: new TurnContext() }
    );

    expect(results).toEqual([{ tool: 'unknown_vendor_tool', success: true }]);
  });
});
