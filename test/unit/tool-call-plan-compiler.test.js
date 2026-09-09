import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const CapabilityRegistryAdapter = require('../../src/renderer/modules/chat/orchestration/CapabilityRegistryAdapter.js');
const ToolCallPlanCompiler = require('../../src/renderer/modules/chat/orchestration/ToolCallPlanCompiler.js');

function createRegistry() {
  return new CapabilityRegistryAdapter({
    tools: [
      { name: 'get_sequence' },
      { name: 'calculate_gc' },
      { name: 'save_result' },
      { name: 'update_annotation' },
      { name: 'read_shared', effect: 'read', readSet: ['shared'], supportsParallel: true },
      { name: 'write_shared', effect: 'write', writeSet: ['shared'], supportsParallel: true },
    ],
  });
}

describe('ToolCallPlanCompiler', () => {
  it('creates stable nodes with tool and capability fields in input order', () => {
    const result = new ToolCallPlanCompiler({ registry: createRegistry() }).compile([
      { tool_name: 'get_sequence', tool_call_id: 'call-a', parameters: {} },
      { name: 'calculate_gc', id: 'call-b', arguments: { sequence: 'ATGC' } },
    ]);

    expect(result.nodes.map(node => node.id)).toEqual(['call-a', 'call-b']);
    expect(result.nodes.map(node => node.toolName)).toEqual(['get_sequence', 'calculate_gc']);
    expect(result.nodes[0]).toMatchObject({ tool: 'get_sequence', capability: 'get_sequence' });
    expect(result.graph.toArray()).toEqual(result.nodes);
  });

  it('creates dependencies for double- and single-braced result references', () => {
    const result = new ToolCallPlanCompiler({ registry: createRegistry() }).compile([
      { tool_name: 'get_sequence', tool_call_id: 'source', parameters: {} },
      { tool_name: 'calculate_gc', tool_call_id: 'consumer', parameters: { sequence: '{{get_sequence.sequence}}' } },
      { tool_name: 'calculate_gc', tool_call_id: 'consumer-2', parameters: { sequence: '{source.length}' } },
    ]);

    expect(result.nodes[1].dependsOn).toContain('source');
    expect(result.nodes[2].dependsOn).toContain('source');
    expect(result.nodes[1].references).toEqual(['get_sequence.sequence']);
  });

  it('reports unresolved references and blocks the affected node', () => {
    const result = new ToolCallPlanCompiler({ registry: createRegistry() }).compile([
      { tool_name: 'calculate_gc', tool_call_id: 'consumer', parameters: { sequence: '{missing.sequence}' } },
    ]);

    expect(result.nodes[0].status).toBe('blocked');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        type: 'unresolved_reference',
        nodeId: 'consumer',
        reference: 'missing.sequence',
      })
    );
  });

  it('blocks duplicate requested IDs with an explicit diagnostic', () => {
    const result = new ToolCallPlanCompiler({ registry: createRegistry() }).compile([
      { tool_name: 'get_sequence', id: 'same', parameters: {} },
      { tool_name: 'calculate_gc', id: 'same', parameters: {} },
      { tool_name: 'calculate_gc', id: 'same', parameters: {} },
    ]);

    expect(result.nodes.map(node => node.id)).toEqual(['same', 'same', 'same']);
    expect(result.diagnostics.filter(item => item.type === 'duplicate_call_id')).toHaveLength(2);
    expect(result.nodes.slice(1).every(node => node.status === 'blocked')).toBe(true);
  });

  it('preserves completion metadata', () => {
    const completion = {
      requiredNodeIds: ['call-a'],
      requiredClauses: ['retrieve sequence', 'calculate GC'],
      finalArtifactTypes: ['sequence-report'],
    };
    const result = new ToolCallPlanCompiler({ registry: createRegistry() }).compile(
      [{ tool_name: 'get_sequence', id: 'call-a', parameters: {} }],
      { completion }
    );

    expect(result.completion).toEqual(completion);
  });

  it('allows independent read capabilities to remain parallel', () => {
    const result = new ToolCallPlanCompiler({ registry: createRegistry() }).compile([
      { tool_name: 'get_sequence', id: 'read-a', parameters: { chromosome: 'chr1' } },
      { tool_name: 'get_sequence', id: 'read-b', parameters: { chromosome: 'chr2' } },
    ]);

    expect(result.nodes[1].dependsOn).toEqual([]);
    expect(result.diagnostics.some(item => item.type === 'implicit_dependency')).toBe(false);
  });

  it('serializes read and write capabilities with conflicting scope resources', () => {
    const result = new ToolCallPlanCompiler({ registry: createRegistry() }).compile([
      { tool_name: 'get_sequence', id: 'read', parameters: { windowId: 'win-1' } },
      { tool_name: 'update_annotation', id: 'write', parameters: { windowId: 'win-1' } },
    ]);

    expect(result.nodes[1].dependsOn).toContain('read');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        type: 'implicit_dependency',
        from: 'read',
        to: 'write',
      })
    );
  });

  it('serializes shared lock conflicts', () => {
    const registry = new CapabilityRegistryAdapter({
      tools: [
        { name: 'first', effect: 'read', supportsParallel: true, locks: ['same-lock'] },
        { name: 'second', effect: 'read', supportsParallel: true, locks: ['same-lock'] },
      ],
    });
    const result = new ToolCallPlanCompiler({ registry }).compile([
      { tool_name: 'first', id: 'first', parameters: {} },
      { tool_name: 'second', id: 'second', parameters: {} },
    ]);

    expect(result.nodes[1].dependsOn).toEqual(['first']);
  });

  it('serializes unknown tools and preserves graph validity', () => {
    const result = new ToolCallPlanCompiler({ registry: createRegistry() }).compile([
      { tool_name: 'vendor_operation', id: 'unknown', parameters: {} },
      { tool_name: 'get_sequence', id: 'read', parameters: {} },
    ]);

    expect(result.nodes[0].metadata.effect).toBe('unknown');
    expect(result.nodes[1].dependsOn).toContain('unknown');
    expect(() => result.graph.validate()).not.toThrow();
  });

  it('does not assume later nodes satisfy an earlier reference', () => {
    const result = new ToolCallPlanCompiler({ registry: createRegistry() }).compile([
      { tool_name: 'calculate_gc', id: 'consumer', parameters: { sequence: '{get_sequence.sequence}' } },
      { tool_name: 'get_sequence', id: 'source', parameters: {} },
    ]);

    expect(result.nodes[0].status).toBe('blocked');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ type: 'unresolved_reference' }));
  });
});
