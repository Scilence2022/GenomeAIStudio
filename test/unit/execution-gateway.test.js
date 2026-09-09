import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Gateway = require('../../src/renderer/modules/chat/orchestration/ExecutionGateway.js');
const { TurnContext } = require('../../src/renderer/modules/chat/orchestration/TurnContext.js');
describe('ExecutionGateway', () => {
  it('normalizes and records legacy execution', async () => {
    const ctx = new TurnContext();
    const gateway = new Gateway({ legacyExecutor: async () => ({ success: true, result: 'ok' }) });
    const result = await gateway.execute('x', {}, { turnContext: ctx, nodeId: 'n' });
    expect(result).toMatchObject({ status: 'succeeded', value: 'ok', nodeId: 'n' });
    expect(ctx.executionLedger).toHaveLength(1);
  });
  it('returns legacy business values while recording a unified result', async () => {
    const ctx = new TurnContext();
    const gateway = new Gateway({ legacyExecutor: async () => ({ success: true, result: { ok: true } }) });
    await expect(gateway.executeLegacy('x', {}, { turnContext: ctx, nodeId: 'legacy-node' })).resolves.toEqual({
      ok: true,
    });
    expect(ctx.executionLedger[0]).toMatchObject({ status: 'succeeded', value: { ok: true }, nodeId: 'legacy-node' });
  });

  it('preserves legacy failure semantics for blocked and queued executions', async () => {
    const blocked = new Gateway({ policy: () => false });
    await expect(blocked.executeLegacy('x')).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('blocked'),
    });

    const ctx = new TurnContext();
    const queued = new Gateway({ legacyExecutor: async () => ({ status: 'queued', jobId: 'job-1' }) });
    await expect(queued.executeLegacy('x', {}, { turnContext: ctx })).resolves.toMatchObject({
      status: 'queued',
      jobId: 'job-1',
    });
    expect(ctx.executionLedger[0]).toMatchObject({ status: 'queued', jobId: 'job-1' });
  });

  it('guards recursion via bypassGateway', async () => {
    let options;
    const gateway = new Gateway({
      chatManager: {
        executeToolByName: async (_n, _p, o) => {
          options = o;
          return 1;
        },
      },
    });
    await gateway.execute('x');
    expect(options.bypassGateway).toBe(true);
  });
  it('maps abort', async () => {
    const gateway = new Gateway({
      legacyExecutor: async () => {
        throw Object.assign(new Error('stop'), { name: 'AbortError' });
      },
    });
    expect((await gateway.execute('x')).status).toBe('cancelled');
  });
  it('maps timeout and unwraps explicit MCP wrappers', async () => {
    const timeoutGateway = new Gateway({
      legacyExecutor: async () => {
        throw Object.assign(new Error('late'), { name: 'TimeoutError', isTimeout: true });
      },
    });
    expect((await timeoutGateway.execute('x')).status).toBe('timed_out');
    const mcpGateway = new Gateway({
      legacyExecutor: async () => ({ executedVia: 'ChatManager', result: 'mcp-value' }),
    });
    expect((await mcpGateway.execute('x')).value).toBe('mcp-value');
  });
  it('rejects recursive gateway entry', async () => {
    const gateway = new Gateway({ legacyExecutor: async () => 1 });
    expect((await gateway.execute('x', {}, { gatewayDepth: 1 })).status).toBe('failed');
  });
});
