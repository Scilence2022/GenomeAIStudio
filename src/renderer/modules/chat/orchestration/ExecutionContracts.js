const EXECUTION_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed_out',
  QUEUED: 'queued',
});

let sequence = 0;
function createId(prefix) {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}`;
}
function createTurnId() {
  return createId('turn');
}
function createExecutionId() {
  return createId('exec');
}
function createNodeId() {
  return createId('node');
}

function isQueuedExecutionResult(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value.status === EXECUTION_STATUS.QUEUED || (value.queued === true && (value.jobId || value.id)))
  );
}

function normalizeExecutionError(error) {
  if (error == null) return null;
  const source =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : error.message || 'Execution failed');
  const name = error.name || source.name || 'Error';
  const timeout = name === 'TimeoutError' || error.isTimeout === true;
  return {
    name: timeout ? 'TimeoutError' : name,
    message: source.message,
    code: error.code,
    isTimeout: timeout,
  };
}

function unwrapLegacyResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { value, wrapper: null };
  if (
    value.status === EXECUTION_STATUS.QUEUED ||
    (value.queued === true && Object.prototype.hasOwnProperty.call(value, 'jobId'))
  ) {
    return { value, wrapper: 'queued' };
  }
  if (
    (value.__executionWrapper === 'smart-executor' ||
      value.executionMode === 'parallel' ||
      value.executionMode === 'sequential') &&
    Object.prototype.hasOwnProperty.call(value, 'result')
  ) {
    return { value: value.result, wrapper: 'smart' };
  }
  if (
    (value.__executionWrapper === 'mcp' || typeof value.executedVia === 'string') &&
    Object.prototype.hasOwnProperty.call(value, 'result')
  ) {
    return { value: value.result, wrapper: 'mcp' };
  }
  if (value.success === true && Object.prototype.hasOwnProperty.call(value, 'result')) {
    return { value: value.result, wrapper: 'success' };
  }
  return { value, wrapper: null };
}

function createExecutionResult(input = {}) {
  const now = new Date().toISOString();
  return {
    executionId: input.executionId || createExecutionId(),
    nodeId: input.nodeId || null,
    tool: input.tool || null,
    status: input.status || EXECUTION_STATUS.SUCCEEDED,
    value: input.value === undefined ? null : input.value,
    artifacts: Array.isArray(input.artifacts) ? input.artifacts : [],
    error: input.error ? normalizeExecutionError(input.error) : null,
    attempt: input.attempt || 1,
    retryable: input.retryable === true,
    scope: input.scope || null,
    source: input.source || null,
    startedAt: input.startedAt || now,
    finishedAt: input.finishedAt || now,
    jobId: input.jobId,
  };
}

function normalizeExecutionResult(raw, metadata = {}) {
  const startedAt = metadata.startedAt || new Date().toISOString();
  if (raw && raw.status && raw.executionId && raw.nodeId !== undefined) {
    return createExecutionResult({
      ...raw,
      ...metadata,
      executionId: metadata.executionId || raw.executionId,
      nodeId: metadata.nodeId || raw.nodeId,
      tool: metadata.tool || raw.tool,
      scope: metadata.scope || raw.scope,
      source: metadata.source || raw.source,
      startedAt,
    });
  }
  if (raw && typeof raw === 'object' && raw.success === false) {
    return createExecutionResult({
      ...metadata,
      status: EXECUTION_STATUS.FAILED,
      value: null,
      error: raw.error || raw.message || 'Tool reported failure',
      startedAt,
    });
  }
  if (
    raw &&
    typeof raw === 'object' &&
    [
      EXECUTION_STATUS.FAILED,
      EXECUTION_STATUS.BLOCKED,
      EXECUTION_STATUS.CANCELLED,
      EXECUTION_STATUS.TIMED_OUT,
    ].includes(raw.status)
  ) {
    return createExecutionResult({
      ...raw,
      ...metadata,
      status: raw.status,
      value: raw.value === undefined ? null : raw.value,
      error: raw.error || raw.status,
      startedAt,
    });
  }
  const unwrapped = unwrapLegacyResult(raw);
  if (unwrapped.wrapper === 'queued') {
    return createExecutionResult({
      ...metadata,
      status: EXECUTION_STATUS.QUEUED,
      value: raw,
      jobId: raw.jobId,
      startedAt,
    });
  }
  return createExecutionResult({ ...metadata, status: EXECUTION_STATUS.SUCCEEDED, value: unwrapped.value, startedAt });
}

const api = {
  EXECUTION_STATUS,
  createTurnId,
  createExecutionId,
  createNodeId,
  isQueuedExecutionResult,
  createExecutionResult,
  normalizeExecutionResult,
  normalizeExecutionError,
  unwrapLegacyResult,
};
if (typeof globalThis !== 'undefined') Object.assign(globalThis, api);
if (typeof window !== 'undefined') Object.assign(window, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
