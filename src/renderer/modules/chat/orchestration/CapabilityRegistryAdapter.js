// @ts-check

const CAPABILITY_METADATA_FIELDS = [
  'name',
  'effect',
  'readSet',
  'writeSet',
  'locks',
  'scope',
  'supportsParallel',
  'idempotency',
  'retry',
  'timeout',
  'confirmation',
  'backgroundJob',
  'artifactTypes',
  'completionContribution',
  'failurePolicy',
  'source',
  'category',
];

const READ_PREFIXES = [
  'get',
  'search',
  'find',
  'list',
  'read',
  'calculate',
  'compute',
  'translate',
  'reverse',
  'analyze',
];
const UI_PREFIXES = ['navigate', 'jump', 'zoom', 'scroll', 'pan', 'toggle', 'open', 'close', 'select', 'highlight'];
const WRITE_PREFIXES = ['load', 'import', 'export', 'save', 'update', 'delete', 'create', 'add', 'apply', 'execute'];
const EXTERNAL_TOKENS = ['blast', 'fetch', 'search_uniprot', 'uniprot', 'interpro', 'alphafold'];
const JOB_SUBMIT_TOKENS = [
  'deep-gene-research',
  'deep_gene_research',
  'start_annotation_research',
  'write-research-plan',
];
const JOB_POLL_TOKENS = ['poll', 'status', 'get-task-status', 'get_annotation_research_workflow'];

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueSorted(values) {
  return [
    ...new Set(
      asArray(values)
        .filter(value => value !== null && value !== undefined && String(value) !== '')
        .map(String)
    ),
  ].sort();
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null);
}

function prefixMatches(name, prefixes) {
  const lowerName = String(name || '').toLowerCase();
  return prefixes.some(
    prefix => lowerName === prefix || lowerName.startsWith(`${prefix}_`) || lowerName.startsWith(`${prefix}-`)
  );
}

class CapabilityRegistryAdapter {
  constructor(options = {}) {
    this.policy = options.policy || null;
    this.toolsByName = new Map();
    this.metadataOverrides = new Map();

    const snapshot = options.snapshot || {};
    const snapshotTools = Array.isArray(snapshot.tools)
      ? snapshot.tools
      : snapshot.toolsByName instanceof Map
        ? [...snapshot.toolsByName.values()]
        : Object.values(snapshot.toolsByName || {});
    const directTools = Array.isArray(options.tools)
      ? options.tools
      : options.tools instanceof Map
        ? [...options.tools.values()]
        : Object.values(options.tools || {});
    const builtInSource = options.builtInTools || snapshot.builtInTools;
    const builtInTools = Array.isArray(builtInSource)
      ? builtInSource
      : builtInSource instanceof Map
        ? [...builtInSource.values()]
        : builtInSource?.builtInToolsMap instanceof Map
          ? [...builtInSource.builtInToolsMap.values()]
          : Object.values(builtInSource || {});

    for (const tool of [...snapshotTools, ...directTools, ...builtInTools]) this.register(tool);
  }

  _nameOf(toolOrName) {
    if (typeof toolOrName === 'string') return toolOrName;
    return String(toolOrName?.name || toolOrName?.tool_name || toolOrName?.toolName || '');
  }

  _metadataSource(tool = {}) {
    const execution = tool.execution && typeof tool.execution === 'object' ? tool.execution : {};
    const capability = tool.capability && typeof tool.capability === 'object' ? tool.capability : {};
    const metadata = tool.metadata && typeof tool.metadata === 'object' ? tool.metadata : {};
    return { ...execution, ...metadata, ...capability, ...tool };
  }

  register(toolOrName, definition = {}) {
    const name = this._nameOf(toolOrName);
    if (!name) throw new Error('Capability registry entry requires a name');
    const tool = typeof toolOrName === 'string' ? { ...definition, name } : { ...toolOrName };
    this.toolsByName.set(name, tool);
    const metadata = this._metadataSource(tool);
    if (this._hasExplicitCapabilityMetadata(metadata)) this.metadataOverrides.set(name, { ...metadata });
    return tool;
  }

  _hasExplicitCapabilityMetadata(metadata) {
    return [
      'effect',
      'readSet',
      'writeSet',
      'locks',
      'lock',
      'supportsParallel',
      'scope',
      'idempotency',
      'retry',
      'timeout',
      'confirmation',
      'backgroundJob',
      'artifactTypes',
      'completionContribution',
      'failurePolicy',
    ].some(field => Object.prototype.hasOwnProperty.call(metadata, field));
  }

  get(name) {
    return this.toolsByName.get(String(name || '')) || null;
  }

  has(name) {
    return this.toolsByName.has(String(name || ''));
  }

  list() {
    return [...this.toolsByName.values()];
  }

  _defaultEffect(name) {
    const lowerName = String(name || '').toLowerCase();
    if (EXTERNAL_TOKENS.some(token => lowerName.includes(token))) return 'external';
    if (JOB_SUBMIT_TOKENS.some(token => lowerName.includes(token))) return 'job_submit';
    if (JOB_POLL_TOKENS.some(token => lowerName === token || lowerName.includes(token))) return 'job_poll';
    if (prefixMatches(lowerName, UI_PREFIXES)) return 'ui';
    if (prefixMatches(lowerName, WRITE_PREFIXES)) return 'write';
    if (prefixMatches(lowerName, READ_PREFIXES)) return 'read';
    return 'unknown';
  }

  _defaultLock(name) {
    const lowerName = String(name || '').toLowerCase();
    if (prefixMatches(lowerName, ['navigate', 'jump', 'zoom', 'scroll', 'pan'])) return 'ui:viewport';
    if (prefixMatches(lowerName, ['toggle', 'open', 'close'])) return 'ui:layout';
    if (prefixMatches(lowerName, ['select', 'highlight'])) return 'ui:selection';
    return null;
  }

  _defaultMetadata(name, definition = {}) {
    const effect = this._defaultEffect(name);
    const isRead = effect === 'read';
    const isPure = isRead && prefixMatches(name, ['calculate', 'compute', 'translate', 'reverse', 'analyze']);
    const locks = effect === 'ui' ? [this._defaultLock(name)].filter(Boolean) : [];
    const supportsParallel = isRead && !locks.length;
    const execution = definition.execution && typeof definition.execution === 'object' ? definition.execution : {};
    return {
      name,
      effect: isPure ? 'pure' : effect,
      readSet: [],
      writeSet: [],
      locks,
      scope: null,
      supportsParallel,
      idempotency: effect === 'read' || isPure ? 'safe' : effect === 'unknown' ? 'unknown' : 'request',
      retry: { maxAttempts: Number.isFinite(execution.retries) ? Math.max(0, execution.retries + 1) : 1 },
      timeout: Number.isFinite(execution.timeout) ? execution.timeout : null,
      confirmation: false,
      backgroundJob: effect === 'job_submit' || effect === 'job_poll',
      artifactTypes: [],
      completionContribution: null,
      failurePolicy: effect === 'unknown' ? 'block_dependents' : 'stop_dependents',
      source: definition.source || 'default',
      category: definition.category || null,
    };
  }

  _explicitMetadata(name, definition = {}) {
    const metadata = this._metadataSource(definition);
    const explicit = {};
    for (const field of CAPABILITY_METADATA_FIELDS) {
      if (field === 'name' || Object.prototype.hasOwnProperty.call(metadata, field)) explicit[field] = metadata[field];
    }
    if (Object.prototype.hasOwnProperty.call(metadata, 'lock') && explicit.locks === undefined)
      explicit.locks = metadata.lock;
    if (metadata.source === undefined && definition.source !== undefined) explicit.source = definition.source;
    if (metadata.category === undefined && definition.category !== undefined) explicit.category = definition.category;
    return explicit;
  }

  hasExplicitMetadata(name) {
    const toolName = String(name || '');
    const definition = this.get(toolName);
    if (!definition) return false;
    return this._hasExplicitCapabilityMetadata(this._metadataSource(definition));
  }

  metadataFor(name) {
    const toolName = String(name || '');
    const definition = this.get(toolName) || { name: toolName };
    const base = this._defaultMetadata(toolName, definition);
    const explicit = this._explicitMetadata(toolName, definition);
    const merged = { ...base, ...explicit, name: toolName };
    merged.effect = merged.effect || 'unknown';
    merged.readSet = uniqueSorted(merged.readSet);
    merged.writeSet = uniqueSorted(merged.writeSet);
    merged.locks = uniqueSorted(merged.locks);
    merged.artifactTypes = uniqueSorted(merged.artifactTypes);
    if (merged.retry == null) merged.retry = { maxAttempts: 1 };
    if (typeof merged.retry === 'number') merged.retry = { maxAttempts: Math.max(1, Math.trunc(merged.retry)) };
    if (merged.effect === 'unknown' && explicit.supportsParallel === undefined) merged.supportsParallel = false;
    return merged;
  }

  _scopeFrom(parameters = {}, context = {}) {
    const contextScope = context?.scope && typeof context.scope === 'object' ? context.scope : {};
    const scope = {};
    const windowId = firstDefined(
      parameters.windowId,
      parameters.window_id,
      parameters.clientId,
      parameters.client_id,
      context.windowId,
      context.window_id,
      contextScope.windowId,
      contextScope.window_id,
      contextScope.clientId
    );
    const genomeId = firstDefined(
      parameters.genomeId,
      parameters.genome_id,
      context.genomeId,
      context.genome_id,
      contextScope.genomeId,
      contextScope.genome_id
    );
    const chromosome = firstDefined(
      parameters.chromosome,
      parameters.chrom,
      parameters.chr,
      context.chromosome,
      contextScope.chromosome
    );
    const start = firstDefined(parameters.start, parameters.position, context.start, contextScope.start);
    const end = firstDefined(parameters.end, context.end, contextScope.end);
    if (windowId != null) scope.windowId = String(windowId);
    if (genomeId != null) scope.genomeId = String(genomeId);
    if (chromosome != null) scope.chromosome = String(chromosome);
    if (start != null) scope.start = start;
    if (end != null) scope.end = end;
    return Object.keys(scope).length ? scope : null;
  }

  getExecutionMetadata(toolName, parameters = {}, context = {}) {
    const metadata = this.metadataFor(toolName);
    const scope = this._scopeFrom(parameters, context);
    const result = { ...metadata, scope };
    const scopeResources = [];
    if (scope?.windowId) scopeResources.push(`window:${scope.windowId}`);
    if (scope?.genomeId) scopeResources.push(`genome:${scope.genomeId}`);
    if (scope?.chromosome) scopeResources.push(`chromosome:${scope.chromosome}`);
    const effectiveEffect = result.effect;
    if (scopeResources.length) {
      if (effectiveEffect === 'write' || effectiveEffect === 'ui' || effectiveEffect === 'job_submit') {
        result.writeSet = uniqueSorted([...result.writeSet, ...scopeResources]);
      } else {
        result.readSet = uniqueSorted([...result.readSet, ...scopeResources]);
      }
      if (effectiveEffect === 'ui' && scope.windowId)
        result.locks = uniqueSorted([...result.locks, `window:${scope.windowId}`]);
    } else if (effectiveEffect === 'write' || effectiveEffect === 'ui' || effectiveEffect === 'job_submit') {
      result.writeSet = uniqueSorted([...result.writeSet, `tool:${toolName}`]);
    }
    if (effectiveEffect === 'external' && !result.readSet.length && !result.writeSet.length) {
      result.readSet = [`external:${toolName}`];
    }
    result.lock = result.locks.length === 1 ? result.locks[0] : result.locks;
    return result;
  }

  isFanoutSafe(name) {
    const metadata = this.metadataFor(name);
    return (
      ['read', 'pure'].includes(metadata.effect) &&
      metadata.writeSet.length === 0 &&
      !metadata.confirmation &&
      !metadata.backgroundJob
    );
  }
}

if (typeof globalThis !== 'undefined') globalThis.CapabilityRegistryAdapter = CapabilityRegistryAdapter;
if (typeof window !== 'undefined') window.CapabilityRegistryAdapter = CapabilityRegistryAdapter;
if (typeof module !== 'undefined' && module.exports) module.exports = CapabilityRegistryAdapter;
