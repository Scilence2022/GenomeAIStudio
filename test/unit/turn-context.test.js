import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { TurnContext } = require('../../src/renderer/modules/chat/orchestration/TurnContext.js');
describe('TurnContext', () => {
  it('records and creates inheriting child context', () => {
    const controller = new AbortController();
    const ctx = new TurnContext({ originalMessage: 'x', scope: { windowId: 'w' }, abortSignal: controller.signal });
    ctx.recordExecution({ tool: 'x', value: 1 });
    ctx.addArtifact({ id: 'a' });
    const child = ctx.child();
    expect(child.parentTurnId).toBe(ctx.turnId);
    expect(child.turnId).not.toBe(ctx.turnId);
    expect(child.scope).toEqual(ctx.scope);
    expect(ctx.executionLedger).toHaveLength(1);
  });
  it('preserves nested source and parent metadata', () => {
    const parent = new TurnContext({ source: 'mcp-agent', mode: 'agent', scope: { sessionId: 's1' } });
    const child = parent.child({ source: 'tool', scope: { sessionId: 's1', nodeId: 'n1' } });
    expect(child.parentTurnId).toBe(parent.turnId);
    expect(child.source).toBe('tool');
    expect(child.mode).toBe('agent');
    expect(child.scope).toEqual({ sessionId: 's1', nodeId: 'n1' });
  });

  it('detects abort', () => {
    const c = new AbortController();
    const ctx = new TurnContext({ abortSignal: c.signal });
    c.abort();
    expect(ctx.isAborted()).toBe(true);
    expect(() => ctx.assertActive()).toThrow();
  });
  it('preserves normalized executions and copies custom state', () => {
    const normalized = { executionId: 'e', status: 'succeeded', value: 1 };
    const ctx = new TurnContext({ artifacts: ['a'], jobs: [{ jobId: 'j' }], coverage: { c: { status: 'succeeded' } } });
    expect(ctx.recordExecution(normalized)).toBe(normalized);
    const child = ctx.child();
    expect(child.executionLedger).toEqual([]);
    expect(child.artifacts).toEqual(['a']);
    expect(child.artifacts).not.toBe(ctx.artifacts);
    expect(child.jobs).not.toBe(ctx.jobs);
    expect(child.coverage).not.toBe(ctx.coverage);
  });
  it('accepts timestamp and ISO deadlines', () => {
    const timestampContext = new TurnContext({ deadline: Date.now() - 1 });
    expect(() => timestampContext.assertActive()).toThrow(/deadline/i);
    const isoContext = new TurnContext({ deadline: new Date(Date.now() - 1).toISOString() });
    expect(() => isoContext.assertActive()).toThrow(/deadline/i);
  });
});
