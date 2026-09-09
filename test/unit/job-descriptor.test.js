import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const JobDescriptor = require('../../src/renderer/modules/chat/orchestration/JobDescriptor.js');

describe('JobDescriptor', () => {
  it('creates a normalized queued descriptor with turn/node identity', () => {
    const job = JobDescriptor.create({
      turnId: 'turn-1',
      nodeId: 'node-1',
      progress: 0.25,
      resultRef: { store: 'jobs', key: 'result-1' },
      cancelMetadata: { endpoint: '/cancel' },
      resumeMetadata: { token: 'resume-1' },
      idempotencyKey: 'idem-1',
    });

    expect(job).toMatchObject({
      state: 'queued',
      turnId: 'turn-1',
      nodeId: 'node-1',
      progress: 0.25,
      resultRef: { store: 'jobs', key: 'result-1' },
      idempotencyKey: 'idem-1',
    });
    expect(job.jobId).toMatch(/^job_/);
  });

  it('normalizes every supported state and clamps progress', () => {
    for (const state of JobDescriptor.JOB_STATES) {
      expect(JobDescriptor.normalize({ state, progress: 2 }).state).toBe(state);
      expect(JobDescriptor.normalize({ status: state, progress: 2 }).progress).toBe(1);
    }
    expect(JobDescriptor.normalize({ state: 'unknown', progress: -1 }).state).toBe('queued');
    expect(JobDescriptor.normalize({ state: 'unknown', progress: -1 }).progress).toBe(0);
  });

  it('identifies queued execution results without DGR assumptions', () => {
    expect(JobDescriptor.isQueuedResult({ status: 'queued', jobId: 'job-1' })).toBe(true);
    expect(JobDescriptor.isQueuedResult({ queued: true, id: 'job-2' })).toBe(true);
    expect(JobDescriptor.isQueuedResult({ status: 'completed', jobId: 'job-3' })).toBe(false);
  });
});
