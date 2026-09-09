// @ts-check

const contractApi = typeof require === 'function' ? require('./ExecutionContracts.js') : globalThis;
const GraphClass = typeof require === 'function' ? require('./ExecutionGraph.js') : globalThis.ExecutionGraph;
const { createNodeId } = contractApi;

const REFERENCE_PATTERN =
  /\{\{\s*([A-Za-z][\w.-]*(?:\[[^\]]+\])?(?:\.[A-Za-z_$][\w$-]*(?:\[[^\]]+\])?)*)\s*\}\}|\{\s*([A-Za-z][\w.-]*(?:\[[^\]]+\])?(?:\.[A-Za-z_$][\w$-]*(?:\[[^\]]+\])?)*)\s*\}/g;

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

class ToolCallPlanCompiler {
  constructor(options = {}) {
    this.registry = options.registry || null;
  }

  _toolName(call = {}) {
    return String(call.tool_name || call.toolName || call.name || call.tool || call.function?.name || '');
  }

  _parameters(call = {}) {
    const value = call.parameters ?? call.arguments ?? call.function?.arguments ?? {};
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch (_error) {
      return value;
    }
  }

  _metadata(registry, toolName, parameters, context) {
    try {
      if (registry?.getExecutionMetadata) return registry.getExecutionMetadata(toolName, parameters, context);
      if (registry?.metadataFor) return registry.metadataFor(toolName);
    } catch (_error) {
      return {
        name: toolName,
        effect: 'unknown',
        readSet: [],
        writeSet: [],
        locks: [],
        supportsParallel: false,
      };
    }
    return {
      name: toolName,
      effect: 'unknown',
      readSet: [],
      writeSet: [],
      locks: [],
      supportsParallel: false,
    };
  }

  _extractReferences(value, references = []) {
    if (typeof value === 'string') {
      REFERENCE_PATTERN.lastIndex = 0;
      let match;
      while ((match = REFERENCE_PATTERN.exec(value)) !== null) references.push(match[1] || match[2]);
      return references;
    }
    if (Array.isArray(value)) {
      value.forEach(item => this._extractReferences(item, references));
      return references;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(item => this._extractReferences(item, references));
    }
    return references;
  }

  _referencePrefix(reference) {
    return String(reference || '').split(/[.[]/, 1)[0];
  }

  _hasExternalReference(reference, referenceResults = []) {
    const prefix = this._referencePrefix(reference);
    return asArray(referenceResults).some(result => {
      if (!result || result.success === false) return false;
      const names = [result.tool, result.tool_name, result.tool_call_id, result.nodeId].filter(Boolean).map(String);
      return names.some(name => prefix === name);
    });
  }

  _conflicts(a, b) {
    const metadataA = a.metadata || {};
    const metadataB = b.metadata || {};
    if (metadataA.supportsParallel !== true || metadataB.supportsParallel !== true) return true;
    if (metadataA.effect === 'unknown' || metadataB.effect === 'unknown') return true;
    const writesA = new Set(asArray(metadataA.writeSet));
    const writesB = new Set(asArray(metadataB.writeSet));
    const readsA = new Set(asArray(metadataA.readSet));
    const readsB = new Set(asArray(metadataB.readSet));
    if ([...writesA].some(resource => writesB.has(resource) || readsB.has(resource))) return true;
    if ([...writesB].some(resource => readsA.has(resource))) return true;
    const locksA = new Set(asArray(metadataA.locks || metadataA.lock));
    const locksB = new Set(asArray(metadataB.locks || metadataB.lock));
    return [...locksA].some(lock => locksB.has(lock));
  }

  _normalizeCompletion(completion = {}) {
    if (!completion || typeof completion !== 'object') return {};
    return {
      ...completion,
      requiredNodeIds: unique(completion.requiredNodeIds),
      requiredClauses: unique(completion.requiredClauses),
      finalArtifactTypes: unique(completion.finalArtifactTypes),
    };
  }

  compile(toolCalls, options = {}) {
    const calls = Array.isArray(toolCalls) ? toolCalls : toolCalls ? [toolCalls] : [];
    const registry = options.registry || this.registry;
    const context = options.context || {};
    const referenceResults = options.referenceResults || context.referenceResults || [];
    const diagnostics = [];
    const nodes = [];
    const usedIds = new Set();
    const prefixToNodes = new Map();

    calls.forEach((call, index) => {
      const toolName = this._toolName(call);
      const parameters = this._parameters(call);
      const requestedId = call?.tool_call_id ?? call?.id;
      const baseId = String(requestedId || createNodeId());
      const duplicate = usedIds.has(baseId);
      const nodeId = baseId;
      if (duplicate) {
        diagnostics.push({
          type: 'duplicate_call_id',
          nodeId: baseId,
          index,
          toolName,
        });
      }
      usedIds.add(baseId);
      const metadata = this._metadata(registry, toolName, parameters, context);
      const node = {
        ...(duplicate ? { status: 'blocked' } : {}),
        id: nodeId,
        tool: toolName,
        toolName,
        capability: toolName,
        parameters,
        metadata,
        effect: metadata.effect,
        supportsParallel: metadata.supportsParallel === true,
        readSet: [...asArray(metadata.readSet)],
        writeSet: [...asArray(metadata.writeSet)],
        locks: [...asArray(metadata.locks || metadata.lock)],
        lock: metadata.lock || metadata.locks || [],
        scope: metadata.scope || null,
        references: unique(this._extractReferences(parameters)),
        dependsOn: [],
        inputIndex: index,
      };
      nodes.push(node);
      if (toolName) {
        if (!prefixToNodes.has(toolName)) prefixToNodes.set(toolName, []);
        prefixToNodes.get(toolName).push(node);
      }
      if (requestedId) {
        const requestedName = String(requestedId);
        if (!prefixToNodes.has(requestedName)) prefixToNodes.set(requestedName, []);
        prefixToNodes.get(requestedName).push(node);
      }
    });

    for (const [index, node] of nodes.entries()) {
      for (const reference of node.references) {
        const prefix = this._referencePrefix(reference);
        const candidates = prefixToNodes.get(prefix) || [];
        const priorCandidates = candidates.filter(
          candidate => candidate.id !== node.id && candidate.inputIndex < index
        );
        if (priorCandidates.length > 1) {
          node.status = 'blocked';
          diagnostics.push({
            type: 'ambiguous_reference',
            nodeId: node.id,
            toolName: node.toolName,
            reference,
            candidates: priorCandidates.map(candidate => candidate.id),
          });
          continue;
        }
        const target = priorCandidates[0];
        if (!target && !this._hasExternalReference(reference, referenceResults)) {
          node.status = 'blocked';
          diagnostics.push({ type: 'unresolved_reference', nodeId: node.id, toolName: node.toolName, reference });
          continue;
        }
        if (!target) continue;
        if (target.id === node.id) {
          node.status = 'blocked';
          diagnostics.push({ type: 'self_reference', nodeId: node.id, toolName: node.toolName, reference });
          continue;
        }
        if (!node.dependsOn.includes(target.id)) node.dependsOn.push(target.id);
      }
    }

    for (let currentIndex = 0; currentIndex < nodes.length; currentIndex += 1) {
      const current = nodes[currentIndex];
      for (let previousIndex = 0; previousIndex < currentIndex; previousIndex += 1) {
        const previous = nodes[previousIndex];
        if (this._conflicts(previous, current) && !current.dependsOn.includes(previous.id)) {
          current.dependsOn.push(previous.id);
          diagnostics.push({
            type: 'implicit_dependency',
            from: previous.id,
            to: current.id,
            reason: 'capability_conflict',
          });
          break;
        }
      }
      current.dependsOn = unique(current.dependsOn);
    }

    const completion = this._normalizeCompletion(options.completion);
    if (
      completion.requiredNodeIds.length === 0 &&
      completion.requiredClauses.length === 0 &&
      completion.finalArtifactTypes.length === 0
    ) {
      delete completion.requiredNodeIds;
      delete completion.requiredClauses;
      delete completion.finalArtifactTypes;
    }

    let graph = null;
    try {
      graph = new GraphClass(nodes);
    } catch (error) {
      diagnostics.push({ type: 'graph_validation_error', message: error.message });
    }
    return { graph, nodes: graph ? graph.toArray() : nodes, diagnostics, completion };
  }
}

if (typeof globalThis !== 'undefined') globalThis.ToolCallPlanCompiler = ToolCallPlanCompiler;
if (typeof window !== 'undefined') window.ToolCallPlanCompiler = ToolCallPlanCompiler;
if (typeof module !== 'undefined' && module.exports) module.exports = ToolCallPlanCompiler;
