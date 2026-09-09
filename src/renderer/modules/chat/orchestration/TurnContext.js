const contracts = typeof require === 'function' ? require('./ExecutionContracts.js') : globalThis;
const { createTurnId, createExecutionResult } = contracts;

class TurnContext {
  constructor(options = {}) {
    this.turnId = options.turnId || createTurnId();
    this.parentTurnId = options.parentTurnId || null;
    this.source = options.source || 'chat';
    this.mode = options.mode || 'default';
    this.originalMessage = options.originalMessage || '';
    this.scope = options.scope || null;
    this.abortSignal = options.abortSignal || options.signal || null;
    this.deadline = options.deadline ?? null;
    this.executionLedger = Array.isArray(options.executionLedger) ? [...options.executionLedger] : [];
    this.referenceContext =
      options.referenceContext && typeof options.referenceContext === 'object' ? { ...options.referenceContext } : {};
    this.artifacts = Array.isArray(options.artifacts) ? [...options.artifacts] : [];
    this.jobs = Array.isArray(options.jobs) ? [...options.jobs] : [];
    this.coverage = options.coverage && typeof options.coverage === 'object' ? { ...options.coverage } : {};
    this.diagnostics = Array.isArray(options.diagnostics) ? [...options.diagnostics] : [];
  }
  isAborted() {
    return this.abortSignal?.aborted === true;
  }
  assertActive() {
    if (this.isAborted()) throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    const deadline = this._deadlineInMilliseconds();
    if (deadline != null && Date.now() >= deadline) {
      throw Object.assign(new Error('Execution deadline exceeded'), { name: 'TimeoutError', isTimeout: true });
    }
    return true;
  }
  _deadlineInMilliseconds() {
    if (this.deadline == null) return null;
    if (typeof this.deadline === 'number') return Number.isFinite(this.deadline) ? this.deadline : null;
    if (this.deadline instanceof Date) return this.deadline.getTime();
    if (typeof this.deadline === 'string' && /^\d+$/.test(this.deadline)) return Number(this.deadline);
    const parsed = Date.parse(this.deadline);
    return Number.isFinite(parsed) ? parsed : null;
  }
  recordExecution(result) {
    const normalized = result && result.executionId && result.status ? result : createExecutionResult(result);
    this.executionLedger.push(normalized);
    return normalized;
  }
  addArtifact(artifact) {
    this.artifacts.push(artifact);
    return artifact;
  }
  addJob(job) {
    const descriptor = job && typeof job === 'object' ? { ...job } : job;
    const key = descriptor?.idempotencyKey || descriptor?.jobId;
    const existingIndex = key ? this.jobs.findIndex(item => item?.idempotencyKey === key || item?.jobId === key) : -1;
    if (existingIndex >= 0) {
      this.jobs[existingIndex] = { ...this.jobs[existingIndex], ...descriptor };
      return this.jobs[existingIndex];
    }
    this.jobs.push(descriptor);
    return descriptor;
  }
  updateJob(identifier, updates = {}) {
    const index = this.jobs.findIndex(
      job => job?.jobId === identifier || job?.idempotencyKey === identifier || job === identifier
    );
    if (index < 0) return null;
    this.jobs[index] = { ...this.jobs[index], ...updates };
    return this.jobs[index];
  }
  getJob(identifier) {
    return this.jobs.find(job => job?.jobId === identifier || job?.idempotencyKey === identifier) || null;
  }
  markClause(clause, status = 'succeeded', details = {}) {
    this.coverage[clause] = { status, ...details };
    return this.coverage[clause];
  }
  child(options = {}) {
    return new TurnContext({
      source: this.source,
      mode: this.mode,
      originalMessage: this.originalMessage,
      deadline: this.deadline,
      referenceContext: this.referenceContext,
      artifacts: this.artifacts,
      jobs: this.jobs,
      coverage: this.coverage,
      diagnostics: this.diagnostics,
      ...options,
      turnId: undefined,
      parentTurnId: this.turnId,
      abortSignal: options.abortSignal || this.abortSignal,
      scope: options.scope || this.scope,
    });
  }
  getSummary() {
    return {
      turnId: this.turnId,
      parentTurnId: this.parentTurnId,
      source: this.source,
      mode: this.mode,
      executionCount: this.executionLedger.length,
      artifactCount: this.artifacts.length,
      jobs: this.jobs,
      coverage: this.coverage,
      diagnostics: this.diagnostics,
    };
  }
}
if (typeof globalThis !== 'undefined') globalThis.TurnContext = TurnContext;
if (typeof window !== 'undefined') window.TurnContext = TurnContext;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TurnContext;
  module.exports.TurnContext = TurnContext;
}
