import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const CapabilityRegistryAdapter = require('../../src/renderer/modules/chat/orchestration/CapabilityRegistryAdapter.js');

describe('CapabilityRegistryAdapter', () => {
  it('reads snapshot toolsByName, built-ins, and direct tools', () => {
    const registry = new CapabilityRegistryAdapter({
      snapshot: {
        toolsByName: new Map([['snapshot_tool', { name: 'snapshot_tool', category: 'sequence' }]]),
        builtInTools: [{ name: 'built_in_tool', category: 'utility' }],
      },
      tools: { direct_tool: { name: 'direct_tool', category: 'custom' } },
    });

    expect(registry.has('snapshot_tool')).toBe(true);
    expect(registry.get('built_in_tool').name).toBe('built_in_tool');
    expect(registry.list().map(tool => tool.name)).toEqual(['snapshot_tool', 'direct_tool', 'built_in_tool']);
  });

  it('classifies explicit read, pure, and write metadata safely', () => {
    const registry = new CapabilityRegistryAdapter({
      tools: [{ name: 'get_sequence' }, { name: 'calculate_gc' }, { name: 'save_result' }],
    });

    expect(registry.metadataFor('get_sequence')).toMatchObject({ effect: 'read', supportsParallel: true });
    expect(registry.metadataFor('calculate_gc')).toMatchObject({ effect: 'pure', supportsParallel: true });
    expect(registry.metadataFor('save_result')).toMatchObject({ effect: 'write', supportsParallel: false });
  });

  it('classifies external and job tools with conservative execution metadata', () => {
    const registry = new CapabilityRegistryAdapter({
      tools: ['blast_search', 'fetch_alphafold_structure', 'start_annotation_research', 'get-task-status'].map(
        name => ({ name })
      ),
    });

    expect(registry.metadataFor('blast_search').effect).toBe('external');
    expect(registry.metadataFor('fetch_alphafold_structure').effect).toBe('external');
    expect(registry.metadataFor('start_annotation_research')).toMatchObject({
      effect: 'job_submit',
      backgroundJob: true,
    });
    expect(registry.metadataFor('get-task-status')).toMatchObject({ effect: 'job_poll', backgroundJob: true });
  });

  it('keeps unknown tools serial and exposes the full metadata contract', () => {
    const metadata = new CapabilityRegistryAdapter().metadataFor('vendor_operation');
    expect(metadata).toMatchObject({ effect: 'unknown', supportsParallel: false });
    expect(Object.keys(metadata)).toEqual(
      expect.arrayContaining([
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
      ])
    );
  });

  it('adds stable window and genome scope resources', () => {
    const registry = new CapabilityRegistryAdapter({
      tools: [{ name: 'get_sequence' }, { name: 'update_annotation' }],
    });
    const read = registry.getExecutionMetadata('get_sequence', {
      windowId: 'win-2',
      genomeId: 'g-1',
      chromosome: 'chr1',
    });
    const write = registry.getExecutionMetadata('update_annotation', {
      window_id: 'win-2',
      genome_id: 'g-1',
      chromosome: 'chr1',
    });

    expect(read.scope).toMatchObject({ windowId: 'win-2', genomeId: 'g-1', chromosome: 'chr1' });
    expect(read.readSet).toEqual(['chromosome:chr1', 'genome:g-1', 'window:win-2']);
    expect(write.writeSet).toEqual(['chromosome:chr1', 'genome:g-1', 'window:win-2']);
  });

  it('adds a per-window UI lock without making unrelated reads share it', () => {
    const registry = new CapabilityRegistryAdapter({
      tools: [{ name: 'navigate_to_position' }, { name: 'get_sequence' }],
    });
    const navigation = registry.getExecutionMetadata('navigate_to_position', { windowId: 'win-1' });
    const read = registry.getExecutionMetadata('get_sequence', { windowId: 'win-1' });

    expect(navigation.locks).toEqual(['ui:viewport', 'window:win-1']);
    expect(navigation.lock).toEqual(navigation.locks);
    expect(read.locks).toEqual([]);
  });

  it('allows fanout only for explicit read or pure capabilities', () => {
    const registry = new CapabilityRegistryAdapter({
      tools: [
        { name: 'get_sequence' },
        { name: 'calculate_gc' },
        { name: 'save_result' },
        { name: 'confirmed_read', effect: 'read', confirmation: true },
        { name: 'background_read', effect: 'read', backgroundJob: true },
      ],
    });

    expect(registry.isFanoutSafe('get_sequence')).toBe(true);
    expect(registry.isFanoutSafe('calculate_gc')).toBe(true);
    expect(registry.isFanoutSafe('save_result')).toBe(false);
    expect(registry.isFanoutSafe('confirmed_read')).toBe(false);
    expect(registry.isFanoutSafe('background_read')).toBe(false);
    expect(registry.isFanoutSafe('missing')).toBe(false);
  });

  it('prefers registry metadata overrides over name defaults', () => {
    const registry = new CapabilityRegistryAdapter({
      tools: [
        {
          name: 'get_sequence',
          category: 'custom_reads',
          source: 'registry',
          capability: {
            effect: 'write',
            readSet: ['sequence:index'],
            writeSet: ['sequence:cache'],
            locks: ['sequence:lock'],
            supportsParallel: false,
            confirmation: true,
          },
        },
      ],
    });
    const metadata = registry.metadataFor('get_sequence');

    expect(metadata).toMatchObject({
      effect: 'write',
      readSet: ['sequence:index'],
      writeSet: ['sequence:cache'],
      locks: ['sequence:lock'],
      supportsParallel: false,
      confirmation: true,
      source: 'registry',
      category: 'custom_reads',
    });
    expect(registry.isFanoutSafe('get_sequence')).toBe(false);
  });

  it('supports registering and replacing a capability', () => {
    const registry = new CapabilityRegistryAdapter();
    registry.register('custom_tool', { effect: 'read', source: 'test' });
    expect(registry.metadataFor('custom_tool')).toMatchObject({ effect: 'read', source: 'test' });
    registry.register({ name: 'custom_tool', effect: 'write', locks: ['custom'] });
    expect(registry.metadataFor('custom_tool')).toMatchObject({ effect: 'write', locks: ['custom'] });
  });
});
