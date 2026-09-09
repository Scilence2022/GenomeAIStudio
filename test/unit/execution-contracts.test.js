import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const api = require('../../src/renderer/modules/chat/orchestration/ExecutionContracts.js');
describe('execution contracts', () => {
  it('loads through CommonJS and normalizes wrappers', () => {
    expect(api.EXECUTION_STATUS.SUCCEEDED).toBe('succeeded');
    expect(api.normalizeExecutionResult({ success: true, result: 3 }, { tool: 'x' })).toMatchObject({
      value: 3,
      status: 'succeeded',
      tool: 'x',
    });
    expect(api.normalizeExecutionResult({ success: false, error: 'no' }).status).toBe('failed');
  });
  it('distinguishes abort timeout and queued', () => {
    expect(api.normalizeExecutionError(Object.assign(new Error('a'), { name: 'AbortError' })).name).toBe('AbortError');
    expect(api.normalizeExecutionError(Object.assign(new Error('t'), { isTimeout: true })).name).toBe('TimeoutError');
    expect(api.normalizeExecutionResult({ jobId: 'j', status: 'queued' }).status).toBe('queued');
  });
  it('preserves ordinary result objects and complete queued job information', () => {
    const businessValue = { result: 'business', kind: 'record' };
    expect(api.normalizeExecutionResult(businessValue).value).toBe(businessValue);
    const queued = api.normalizeExecutionResult({ status: 'queued', jobId: 'j', queue: 'analysis' });
    expect(queued).toMatchObject({
      status: 'queued',
      jobId: 'j',
      value: { status: 'queued', jobId: 'j', queue: 'analysis' },
    });
  });
  it('normalizes terminal execution statuses without treating them as business values', () => {
    for (const status of ['failed', 'blocked', 'cancelled', 'timed_out']) {
      expect(api.normalizeExecutionResult({ status, error: `${status} reason` }, { tool: 'x' })).toMatchObject({
        status,
        tool: 'x',
        value: null,
      });
    }
  });

  it('unwraps explicit SmartExecutor and MCP wrappers only', () => {
    expect(api.normalizeExecutionResult({ executionMode: 'parallel', result: 4 }).value).toBe(4);
    expect(api.normalizeExecutionResult({ executedVia: 'ChatManager', result: 5 }).value).toBe(5);
    expect(api.normalizeExecutionResult({ result: 6 }).value).toEqual({ result: 6 });
  });
});
