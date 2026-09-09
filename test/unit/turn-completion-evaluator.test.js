import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const TurnCompletionEvaluator = require('../../src/renderer/modules/chat/orchestration/TurnCompletionEvaluator.js');

describe('TurnCompletionEvaluator', () => {
  it('does not block legacy behavior when completion metadata is absent', () => {
    const result = new TurnCompletionEvaluator().evaluate({ results: [{ status: 'succeeded' }] });

    expect(result).toMatchObject({ metadataAvailable: false, canComplete: null, status: 'unavailable' });
  });

  it('keeps queued work pending', () => {
    const result = new TurnCompletionEvaluator().evaluate({
      completion: { requiredNodeIds: ['node-1'], finalArtifactTypes: ['report'] },
      results: [{ nodeId: 'node-1', status: 'queued', artifactTypes: ['report'] }],
    });

    expect(result.canComplete).toBe(false);
    expect(result.status).toBe('queued');
    expect(result.requiredNodes.pending).toEqual(['node-1']);
    expect(result.finalArtifacts.pending).toEqual(['report']);
  });

  it('covers required nodes, clauses, and artifacts from succeeded results', () => {
    const result = new TurnCompletionEvaluator().evaluate({
      completion: {
        requiredNodeIds: ['gc', 'blast'],
        requiredClauses: ['calculate GC', 'run BLAST'],
        finalArtifactTypes: ['gc-report', 'blast-report'],
      },
      results: [
        {
          nodeId: 'gc',
          status: 'succeeded',
          completionContribution: ['calculate GC'],
          artifactTypes: ['gc-report'],
        },
        {
          nodeId: 'blast',
          status: 'succeeded',
          completionContribution: ['run BLAST'],
          artifactTypes: ['blast-report'],
        },
      ],
    });

    expect(result.canComplete).toBe(true);
    expect(result.status).toBe('covered');
    expect(result.requiredNodes.covered).toEqual(['gc', 'blast']);
    expect(result.requiredClauses.covered).toEqual(['calculate GC', 'run BLAST']);
    expect(result.finalArtifacts.covered).toEqual(['gc-report', 'blast-report']);
  });

  it('reports partial and blocked coverage explicitly', () => {
    const result = new TurnCompletionEvaluator().evaluate({
      completion: {
        requiredNodeIds: ['done', 'blocked', 'pending'],
        requiredClauses: ['done clause', 'blocked clause'],
      },
      results: [
        { nodeId: 'done', status: 'succeeded', completionContribution: ['done clause'] },
        { nodeId: 'blocked', status: 'blocked', completionContribution: ['blocked clause'] },
      ],
    });

    expect(result.canComplete).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.requiredNodes.covered).toEqual(['done']);
    expect(result.requiredNodes.blocked).toEqual(['blocked']);
    expect(result.requiredNodes.pending).toEqual(['pending']);
    expect(result.requiredClauses.blocked).toEqual(['blocked clause']);
  });
});
