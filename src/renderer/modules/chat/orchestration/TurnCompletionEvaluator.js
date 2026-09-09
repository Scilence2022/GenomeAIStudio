const EXECUTION_STATUS = (typeof require === 'function' ? require('./ExecutionContracts.js') : globalThis)
  .EXECUTION_STATUS || {
  SUCCEEDED: 'succeeded',
  QUEUED: 'queued',
  FAILED: 'failed',
  BLOCKED: 'blocked',
};

const TERMINAL_BLOCKED = new Set([
  EXECUTION_STATUS.FAILED,
  EXECUTION_STATUS.BLOCKED,
  EXECUTION_STATUS.CANCELLED,
  EXECUTION_STATUS.TIMED_OUT,
]);

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return [
    ...new Set(
      asArray(values)
        .filter(value => value !== null && value !== undefined && String(value) !== '')
        .map(String)
    ),
  ];
}

function resultStatus(result) {
  if (!result) return null;
  if (result.status) return result.status;
  if (result.success === true) return EXECUTION_STATUS.SUCCEEDED;
  if (result.success === false) return EXECUTION_STATUS.FAILED;
  return null;
}

function resultContributions(result) {
  const contribution = result?.completionContribution ?? result?.metadata?.completionContribution;
  if (contribution === true) return [];
  if (typeof contribution === 'string') return [contribution];
  if (Array.isArray(contribution)) return unique(contribution);
  if (contribution && typeof contribution === 'object') {
    return unique(contribution.clauses || contribution.requiredClauses || contribution.names);
  }
  return [];
}

function resultArtifacts(result) {
  const types = result?.artifactTypes ?? result?.metadata?.artifactTypes;
  const fromArtifacts = asArray(result?.artifacts)
    .map(artifact => artifact?.type || artifact?.artifactType)
    .filter(Boolean);
  return unique([...asArray(types), ...fromArtifacts]);
}

class TurnCompletionEvaluator {
  normalizeCompletion(completion) {
    if (!completion || typeof completion !== 'object') return null;
    const normalized = {
      ...completion,
      requiredNodeIds: unique(completion.requiredNodeIds || completion.requiredNodes),
      requiredClauses: unique(completion.requiredClauses),
      finalArtifactTypes: unique(completion.finalArtifactTypes || completion.finalArtifacts),
    };
    const hasMetadata =
      normalized.requiredNodeIds.length > 0 ||
      normalized.requiredClauses.length > 0 ||
      normalized.finalArtifactTypes.length > 0;
    return hasMetadata ? normalized : null;
  }

  evaluate({ completion, results = [], context = {} } = {}) {
    const metadata = this.normalizeCompletion(completion);
    const entries = Array.isArray(results) ? results : [];
    const successful = entries.filter(result => resultStatus(result) === EXECUTION_STATUS.SUCCEEDED);
    const blocked = entries.filter(result => TERMINAL_BLOCKED.has(resultStatus(result)));
    const queued = entries.filter(result => resultStatus(result) === EXECUTION_STATUS.QUEUED);
    const coveredNodeIds = new Set(
      successful.map(result => String(result.nodeId || result.tool_call_id || result.id || '')).filter(Boolean)
    );
    const blockedNodeIds = new Set(
      blocked.map(result => String(result.nodeId || result.tool_call_id || result.id || '')).filter(Boolean)
    );
    const coveredClauses = new Set(successful.flatMap(resultContributions));
    const blockedClauses = new Set(blocked.flatMap(resultContributions));
    const coveredArtifacts = new Set(successful.flatMap(resultArtifacts));
    const blockedArtifacts = new Set(blocked.flatMap(resultArtifacts));

    const classify = (required, covered, blockedSet) => {
      const classified = {
        covered: required.filter(item => covered.has(item)),
        blocked: required.filter(item => !covered.has(item) && blockedSet.has(item)),
        pending: required.filter(item => !covered.has(item) && !blockedSet.has(item)),
      };
      classified.status =
        classified.blocked.length > 0 ? 'blocked' : classified.pending.length > 0 ? 'pending' : 'covered';
      return classified;
    };

    if (!metadata) {
      return {
        metadataAvailable: false,
        canComplete: null,
        status: 'unavailable',
        requiredNodes: { covered: [], blocked: [], pending: [], status: 'unavailable' },
        requiredClauses: { covered: [], blocked: [], pending: [], status: 'unavailable' },
        finalArtifacts: { covered: [], blocked: [], pending: [], status: 'unavailable' },
        context,
      };
    }

    const requiredNodes = classify(metadata.requiredNodeIds, coveredNodeIds, blockedNodeIds);
    const requiredClauses = classify(metadata.requiredClauses, coveredClauses, blockedClauses);
    const finalArtifacts = classify(metadata.finalArtifactTypes, coveredArtifacts, blockedArtifacts);
    const requiredIds = new Set([
      ...metadata.requiredNodeIds,
      ...metadata.requiredClauses,
      ...metadata.finalArtifactTypes,
    ]);
    const requiredQueued = queued.filter(result => {
      const id = String(result.nodeId || result.tool_call_id || result.id || '');
      return (
        requiredIds.has(id) ||
        resultContributions(result).some(item => requiredIds.has(item)) ||
        resultArtifacts(result).some(item => requiredIds.has(item))
      );
    });
    const hasBlocked =
      requiredNodes.blocked.length > 0 || requiredClauses.blocked.length > 0 || finalArtifacts.blocked.length > 0;
    const hasPending =
      requiredNodes.pending.length > 0 || requiredClauses.pending.length > 0 || finalArtifacts.pending.length > 0;
    const hasCovered =
      requiredNodes.covered.length > 0 || requiredClauses.covered.length > 0 || finalArtifacts.covered.length > 0;
    const canComplete = !hasBlocked && !hasPending && requiredQueued.length === 0;
    const status = hasBlocked
      ? 'blocked'
      : requiredQueued.length > 0
        ? 'queued'
        : hasPending && hasCovered
          ? 'partial'
          : hasPending
            ? 'pending'
            : 'covered';

    return {
      metadataAvailable: true,
      canComplete,
      status,
      requiredNodes,
      requiredClauses,
      finalArtifacts,
      context,
    };
  }
}

if (typeof globalThis !== 'undefined') globalThis.TurnCompletionEvaluator = TurnCompletionEvaluator;
if (typeof window !== 'undefined') window.TurnCompletionEvaluator = TurnCompletionEvaluator;
if (typeof module !== 'undefined' && module.exports) module.exports = TurnCompletionEvaluator;
