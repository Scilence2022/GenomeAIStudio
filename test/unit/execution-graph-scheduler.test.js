import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Graph = require('../../src/renderer/modules/chat/orchestration/ExecutionGraph.js');
const Scheduler = require('../../src/renderer/modules/chat/orchestration/ExecutionGraphScheduler.js');
describe('ExecutionGraphScheduler', () => {
  it('respects DAG and blocks dependents', async () => {
    const order = [];
    const scheduler = new Scheduler({
      maxConcurrency: 2,
      executor: async node => {
        order.push(node.id);
        if (node.id === 'a') return { success: false, error: 'bad' };
        return node.id;
      },
    });
    const result = await scheduler.run(
      new Graph([
        { id: 'a', tool: 'a', effect: 'read', readSet: [], writeSet: [] },
        { id: 'b', tool: 'b', dependsOn: ['a'], effect: 'read', readSet: [], writeSet: [] },
      ])
    );
    expect(order).toEqual(['a']);
    expect(result[1].status).toBe('blocked');
  });
  it('passes resolved node parameters to the executor', async () => {
    let received;
    await new Scheduler({
      executor: async (_node, _context, parameters) => {
        received = parameters;
        return { ok: true };
      },
    }).run([{ id: 'node', parameters: { raw: true }, parametersResolved: { resolved: true } }]);

    expect(received).toEqual({ resolved: true });
  });

  it('runs independent reads concurrently', async () => {
    let active = 0;
    let max = 0;
    await new Scheduler({
      maxConcurrency: 2,
      executor: async () => {
        active++;
        max = Math.max(max, active);
        await new Promise(r => setTimeout(r, 5));
        active--;
        return 1;
      },
    }).run([
      { id: 'a', effect: 'read', readSet: ['x'], writeSet: [], supportsParallel: true },
      { id: 'b', effect: 'read', readSet: ['y'], writeSet: [], supportsParallel: true },
    ]);
    expect(max).toBe(2);
  });
  it('serializes write/read conflicts and keeps stable output order', async () => {
    const active = [];
    const order = [];
    const result = await new Scheduler({
      maxConcurrency: 2,
      executor: async node => {
        active.push(node.id);
        order.push([...active]);
        await new Promise(resolve => setTimeout(resolve, 2));
        active.splice(active.indexOf(node.id), 1);
        return node.id;
      },
    }).run([
      { id: 'write', effect: 'write', readSet: [], writeSet: ['x'] },
      { id: 'read', effect: 'read', readSet: ['x'], writeSet: [] },
    ]);
    expect(order.every(batch => batch.length === 1)).toBe(true);
    expect(result.map(item => item.nodeId)).toEqual(['write', 'read']);
  });
  it('supports queued results and allows independent nodes after partial failure', async () => {
    const result = await new Scheduler({
      maxConcurrency: 2,
      executor: async node =>
        node.id === 'failed'
          ? { success: false, error: 'bad' }
          : node.id === 'queued'
            ? { status: 'queued', jobId: 'j' }
            : node.id,
    }).run([
      { id: 'failed', effect: 'read', readSet: [], writeSet: [] },
      { id: 'blocked', dependsOn: ['failed'], effect: 'read', readSet: [], writeSet: [] },
      { id: 'queued', effect: 'read', readSet: [], writeSet: [] },
      { id: 'independent', effect: 'read', readSet: [], writeSet: [] },
    ]);
    expect(result.map(item => item.status)).toEqual(['failed', 'blocked', 'queued', 'succeeded']);
  });
  it('detects cycles and reports missing executors clearly', async () => {
    expect(
      () =>
        new Graph([
          { id: 'a', dependsOn: ['b'] },
          { id: 'b', dependsOn: ['a'] },
        ])
    ).toThrow(/cycle/i);
    await expect(new Scheduler().run([{ id: 'a' }])).rejects.toThrow(/executor/i);
  });
  it('maps executor abort and timeout errors to terminal statuses', async () => {
    const result = await new Scheduler({
      executor: async node => {
        if (node.id === 'abort') throw Object.assign(new Error('stop'), { name: 'AbortError' });
        throw Object.assign(new Error('late'), { name: 'TimeoutError', isTimeout: true });
      },
    }).run([
      { id: 'abort', effect: 'read', readSet: [], writeSet: [] },
      { id: 'timeout', effect: 'read', readSet: [], writeSet: [] },
    ]);
    expect(result.map(item => item.status)).toEqual(['cancelled', 'timed_out']);
  });
});
