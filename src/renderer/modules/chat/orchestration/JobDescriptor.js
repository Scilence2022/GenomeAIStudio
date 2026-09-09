const JOB_STATES = Object.freeze(['queued', 'running', 'completed', 'failed', 'cancelled', 'paused']);

let sequence = 0;

function createJobId() {
  sequence += 1;
  return `job_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

function clampProgress(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(1, Math.max(0, number));
}

function normalizeState(state) {
  return JOB_STATES.includes(state) ? state : 'queued';
}

function normalize(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const descriptor = {
    jobId: String(source.jobId || source.id || createJobId()),
    turnId: source.turnId ?? null,
    nodeId: source.nodeId ?? null,
    state: normalizeState(source.state || source.status),
    progress: clampProgress(source.progress),
    resultRef: source.resultRef ?? source.resultReference ?? null,
    cancel: source.cancel && typeof source.cancel === 'object' ? { ...source.cancel } : null,
    resume: source.resume && typeof source.resume === 'object' ? { ...source.resume } : null,
    cancelMetadata:
      source.cancelMetadata && typeof source.cancelMetadata === 'object' ? { ...source.cancelMetadata } : null,
    resumeMetadata:
      source.resumeMetadata && typeof source.resumeMetadata === 'object' ? { ...source.resumeMetadata } : null,
    idempotencyKey: source.idempotencyKey ?? null,
  };
  if (descriptor.state === 'completed' && descriptor.progress === null) descriptor.progress = 1;
  return descriptor;
}

function create(input = {}) {
  return normalize(input);
}

function isQueuedResult(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value.status === 'queued' || (value.queued === true && (value.jobId || value.id)))
  );
}

const api = { JOB_STATES, create, normalize, isQueuedResult };
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { JOB_STATES, JobDescriptor: api });
if (typeof window !== 'undefined') Object.assign(window, { JOB_STATES, JobDescriptor: api });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
