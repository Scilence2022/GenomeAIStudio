const graphClass = typeof require === 'function' ? require('./ExecutionGraph.js') : globalThis.ExecutionGraph;
const contracts = typeof require === 'function' ? require('./ExecutionContracts.js') : globalThis;
const { EXECUTION_STATUS, normalizeExecutionResult, createExecutionResult } = contracts;
class ExecutionGraphScheduler {
  constructor(options = {}) {
    const requestedConcurrency = options.maxConcurrency ?? Infinity;
    this.maxConcurrency =
      requestedConcurrency === Infinity
        ? Infinity
        : Number.isFinite(Number(requestedConcurrency)) && Number(requestedConcurrency) > 0
          ? Math.max(1, Math.floor(Number(requestedConcurrency)))
          : 1;
    this.failureStrategy = options.failureStrategy || 'block_dependents';
    if (!['block_dependents', 'stop_dependents'].includes(this.failureStrategy)) {
      throw new Error(`Unknown execution failure strategy: ${this.failureStrategy}`);
    }
    this.executor = options.executor;
  }
  _conflicts(a, b) {
    if (
      !a ||
      !b ||
      a.effect == null ||
      b.effect == null ||
      a.effect === 'unknown' ||
      b.effect === 'unknown' ||
      a.supportsParallel !== true ||
      b.supportsParallel !== true ||
      !Array.isArray(a.readSet) ||
      !Array.isArray(b.readSet) ||
      !Array.isArray(a.writeSet) ||
      !Array.isArray(b.writeSet)
    ) {
      return true;
    }
    const writesA = new Set(a.writeSet);
    const writesB = new Set(b.writeSet);
    const readsA = new Set(a.readSet);
    const readsB = new Set(b.readSet);
    if ([...writesA].some(x => writesB.has(x) || readsB.has(x)) || [...writesB].some(x => readsA.has(x))) return true;
    const lockValues = node => node.locks ?? node.lock;
    const locksA = (Array.isArray(lockValues(a)) ? lockValues(a) : lockValues(a) ? [lockValues(a)] : []).map(
      x => x.key || x
    );
    const locksB = (Array.isArray(lockValues(b)) ? lockValues(b) : lockValues(b) ? [lockValues(b)] : []).map(
      x => x.key || x
    );
    return locksA.some(x => locksB.includes(x));
  }
  async run(input, context) {
    const GraphClass = graphClass;
    const graph = input instanceof GraphClass ? input : new GraphClass(input.nodes || input);
    if (typeof this.executor !== 'function') throw new Error('ExecutionGraphScheduler requires an executor');
    const results = new Map();
    const running = new Map();
    const terminalFailure = [
      EXECUTION_STATUS.FAILED,
      EXECUTION_STATUS.BLOCKED,
      EXECUTION_STATUS.CANCELLED,
      EXECUTION_STATUS.TIMED_OUT,
    ];
    while (results.size < graph.nodes.size) {
      if (context?.assertActive) {
        try {
          context.assertActive();
        } catch (error) {
          const status =
            error?.name === 'TimeoutError' || error?.isTimeout === true
              ? EXECUTION_STATUS.TIMED_OUT
              : EXECUTION_STATUS.CANCELLED;
          graph
            .toArray()
            .filter(node => node.status === EXECUTION_STATUS.PENDING)
            .forEach(node => {
              graph.setStatus(node.id, status);
              results.set(
                node.id,
                createExecutionResult({
                  status,
                  nodeId: node.id,
                  tool: node.tool || node.capability,
                  scope: node.scope,
                  error,
                })
              );
            });
          break;
        }
      }
      const failedNodeExists = graph.toArray().some(node => terminalFailure.includes(node.status));
      if (this.failureStrategy === 'stop_dependents' && failedNodeExists) {
        graph
          .toArray()
          .filter(node => node.status === EXECUTION_STATUS.PENDING)
          .forEach(node => {
            graph.setStatus(node.id, EXECUTION_STATUS.CANCELLED);
            results.set(
              node.id,
              createExecutionResult({
                status: EXECUTION_STATUS.CANCELLED,
                nodeId: node.id,
                tool: node.tool || node.capability,
                scope: node.scope,
                error: 'Execution stopped after a node failed',
              })
            );
          });
      } else {
        graph
          .toArray()
          .filter(
            node =>
              node.status === EXECUTION_STATUS.PENDING &&
              node.dependsOn.some(id => terminalFailure.includes(graph.getNode(id).status))
          )
          .forEach(node => graph.setStatus(node.id, EXECUTION_STATUS.BLOCKED));
      }
      const capacity = Math.max(0, this.maxConcurrency - running.size);
      const candidates = [];
      for (const node of graph.readyNodes()) {
        if (candidates.length >= capacity) {
          break;
        }
        const conflictsWithRunning = [...running.keys()].some(id => this._conflicts(node, graph.getNode(id)));
        const conflictsWithSelected = candidates.some(selected => this._conflicts(node, selected));
        if (!conflictsWithRunning && !conflictsWithSelected) candidates.push(node);
      }
      if (candidates.length) {
        candidates.forEach(node => {
          graph.setStatus(node.id, EXECUTION_STATUS.RUNNING);
          const parametersResolved = node.parametersResolved !== undefined ? node.parametersResolved : node.parameters;
          const promise = Promise.resolve()
            .then(() => this.executor(node, context, parametersResolved))
            .then(raw => {
              const result = normalizeExecutionResult(raw, {
                nodeId: node.id,
                tool: node.tool || node.capability,
                scope: node.scope,
                source: node.source,
              });
              graph.setStatus(node.id, result.status);
              results.set(node.id, result);
            })
            .catch(error => {
              const result = normalizeExecutionResult(
                { success: false, error },
                { nodeId: node.id, tool: node.tool || node.capability }
              );
              if (result.error?.name === 'AbortError') result.status = EXECUTION_STATUS.CANCELLED;
              if (result.error?.name === 'TimeoutError') result.status = EXECUTION_STATUS.TIMED_OUT;
              graph.setStatus(node.id, result.status);
              results.set(node.id, result);
            });
          running.set(
            node.id,
            promise.finally(() => running.delete(node.id))
          );
        });
        continue;
      }
      if (running.size) {
        await Promise.race(running.values());
        continue;
      }
      graph
        .toArray()
        .filter(node => node.status === EXECUTION_STATUS.PENDING)
        .forEach(node => graph.setStatus(node.id, EXECUTION_STATUS.BLOCKED));
      break;
    }
    await Promise.all(running.values());
    return graph.toArray().map(
      node =>
        results.get(node.id) ||
        createExecutionResult({
          status: node.status,
          error: node.status,
          nodeId: node.id,
          tool: node.tool || node.capability,
        })
    );
  }
}
if (typeof globalThis !== 'undefined') globalThis.ExecutionGraphScheduler = ExecutionGraphScheduler;
if (typeof window !== 'undefined') window.ExecutionGraphScheduler = ExecutionGraphScheduler;
if (typeof module !== 'undefined' && module.exports) module.exports = ExecutionGraphScheduler;
