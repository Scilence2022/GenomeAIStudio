const contracts = typeof require === 'function' ? require('./ExecutionContracts.js') : globalThis;
const { EXECUTION_STATUS, createExecutionResult, normalizeExecutionResult, normalizeExecutionError } = contracts;
const JobDescriptor = typeof require === 'function' ? require('./JobDescriptor.js') : globalThis.JobDescriptor;

class ExecutionGateway {
  constructor(options = {}) {
    this.chatManager = options.chatManager || null;
    this.legacyExecutor = options.legacyExecutor || null;
    this.registry = options.registry || null;
    this.policy = options.policy || null;
    this.clock = options.clock || Date;
  }
  async execute(toolName, parameters = {}, options = {}) {
    const context = options.turnContext;
    const Clock = this.clock;
    const startedAt = new Clock().toISOString();
    if (options.gatewayDepth > 0) {
      return createExecutionResult({
        tool: toolName,
        status: EXECUTION_STATUS.FAILED,
        value: null,
        error: 'ExecutionGateway recursion detected',
        startedAt,
      });
    }
    const metadata = {
      executionId: options.executionId,
      nodeId: options.nodeId || null,
      tool: toolName,
      source: options.source,
      scope: options.scope || context?.scope,
      startedAt,
    };
    try {
      context?.assertActive?.();
      if (this.policy && typeof this.policy === 'function' && !this.policy(toolName, parameters, options)) {
        throw Object.assign(new Error(`Execution blocked by policy: ${toolName}`), { code: 'POLICY_BLOCKED' });
      }
      let raw;
      if (this.legacyExecutor) {
        raw = await this.legacyExecutor(toolName, parameters, {
          ...options,
          bypassGateway: true,
          gatewayDepth: (options.gatewayDepth || 0) + 1,
        });
      } else if (this.chatManager?.executeToolByName) {
        raw = await this.chatManager.executeToolByName(toolName, parameters, {
          ...options,
          bypassGateway: true,
          gatewayDepth: (options.gatewayDepth || 0) + 1,
          internalDispatch: true,
        });
      } else {
        throw new Error(`No executor available for '${toolName}'`);
      }
      const result = normalizeExecutionResult(raw, metadata);
      if (result.status === EXECUTION_STATUS.SUCCEEDED && raw?.success === false) {
        result.status = EXECUTION_STATUS.FAILED;
      }
      context?.recordExecution?.(result);
      if (result.status === EXECUTION_STATUS.QUEUED && context?.addJob) {
        const queued = result.value && typeof result.value === 'object' ? result.value : {};
        context.addJob(
          JobDescriptor?.create
            ? JobDescriptor.create({
                ...queued,
                jobId: result.jobId || queued.jobId || queued.id,
                turnId: context.turnId,
                nodeId: result.nodeId,
                state: queued.state || queued.status || 'queued',
              })
            : {
                ...queued,
                jobId: result.jobId || queued.jobId || queued.id,
                turnId: context.turnId,
                nodeId: result.nodeId,
              }
        );
      }
      return result;
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.isTimeout === true;
      const cancelled = error?.name === 'AbortError' || options.signal?.aborted;
      const blocked = error?.code === 'POLICY_BLOCKED';
      const result = createExecutionResult({
        ...metadata,
        status: cancelled
          ? EXECUTION_STATUS.CANCELLED
          : timeout
            ? EXECUTION_STATUS.TIMED_OUT
            : blocked
              ? EXECUTION_STATUS.BLOCKED
              : EXECUTION_STATUS.FAILED,
        value: null,
        error: normalizeExecutionError(error),
        retryable: timeout,
      });
      context?.recordExecution?.(result);
      return result;
    }
  }
  async executeLegacy(toolName, parameters = {}, options = {}) {
    const result = await this.execute(toolName, parameters, { ...options, gatewayLegacyResult: false });
    if (result.status === EXECUTION_STATUS.SUCCEEDED || result.status === EXECUTION_STATUS.QUEUED) {
      return result.value;
    }
    return {
      success: false,
      error: result.error?.message || result.status,
    };
  }
}
if (typeof globalThis !== 'undefined') globalThis.ExecutionGateway = ExecutionGateway;
if (typeof window !== 'undefined') window.ExecutionGateway = ExecutionGateway;
if (typeof module !== 'undefined' && module.exports) module.exports = ExecutionGateway;
