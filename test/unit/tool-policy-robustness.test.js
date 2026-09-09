/**
 * Tool Policy Robustness Tests
 */
/* eslint-disable no-new-func, max-len */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function evaluateRendererGlobal(relativePath, globalName) {
  const filePath = path.join(process.cwd(), relativePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const fn = new Function(`${content}; return globalThis.${globalName};`);
  return fn();
}

function loadPolicySupport() {
  evaluateRendererGlobal('src/renderer/modules/chat/services/ToolCapabilityPolicy.js', 'ToolCapabilityPolicy');
  evaluateRendererGlobal('src/renderer/modules/chat/services/ToolExecutionPolicy.js', 'ToolExecutionPolicy');
}

// Helper to load LLMContextService in a node-compatible way
function loadLLMContextServiceClass() {
  loadPolicySupport();

  const servicePath = path.join(process.cwd(), 'src/renderer/modules/chat/services/LLMContextService.js');
  let content = fs.readFileSync(servicePath, 'utf-8');
  // Strip window assignment to avoid JSDOM/window requirements
  content = content.replace('window.LLMContextService = LLMContextService;', '');

  // Wrap in a function that returns the class
  const fn = new Function('global', `${content}; return LLMContextService;`);
  return fn({});
}

function loadToolExecutionServiceClass() {
  const servicePath = path.join(process.cwd(), 'src/renderer/modules/chat/services/ToolExecutionService.js');
  const content = fs.readFileSync(servicePath, 'utf-8');
  const fn = new Function('window', `${content}; return ToolExecutionService;`);
  return fn({});
}

// Helper to load ChatManager in a node-compatible way
function loadChatManagerClass() {
  const managerPath = path.join(process.cwd(), 'src/renderer/modules/ChatManager.js');
  const content = fs.readFileSync(managerPath, 'utf-8');

  // ChatManager has various browser/electron-specific dependencies at the top,
  // so we extract only the helper methods we want to test.

  // We can construct a mock class containing these methods
  const cloneToolParametersMatch = content.match(
    /cloneToolParameters\s*\(parameters\s*=\s*\{\}\)\s*\{[\s\S]*?\}\n\n\s*normalizeToolParams/
  );
  const normalizeToolParamsMatch = content.match(
    /normalizeToolParams\s*\(toolName,\s*parameters\s*=\s*\{\}\)\s*\{[\s\S]*?\}\n\n\s*getToolExecutionKey/
  );
  const getToolExecutionKeyMatch = content.match(
    /getToolExecutionKey\s*\(toolName,\s*parameters\s*=\s*\{\}\)\s*\{[\s\S]*?\}\n\n\s*getRequestedToolExecutionLimit/
  );
  const getRequestedToolExecutionLimitMatch = content.match(
    /\n\s{2}getRequestedToolExecutionLimit\s*\(originalMessage,\s*tool\)\s*\{[\s\S]*?\}\n\n\s{2}createToolExecutionState/
  );
  const toolExecutionStateMethodsMatch = content.match(
    /\n\s{2}createToolExecutionState\s*\(originalMessage\)\s*\{[\s\S]*?\}\n\n\s{2}createPendingToolExecutionQueue/
  );
  const createPendingToolExecutionQueueMatch = content.match(
    /\n\s{2}createPendingToolExecutionQueue\s*\([\s\S]*?\n\s{2}\}\n\n\s{2}filterExecutableToolInstances/
  );
  const filterExecutableToolInstancesMatch = content.match(
    /\n\s{2}filterExecutableToolInstances\s*\([\s\S]*?\n\s{2}\}\n\n\s{2}\/\*\*/
  );
  const hasProgressSinceLastSuccessMatch = content.match(
    /\n\s{2}hasProgressSinceLastSuccess\s*\(toolExecutionState,\s*toolKey\)\s*\{[\s\S]*?\n\s{2}\}\n\n\s{2}async executePendingToolExecutionQueue/
  );
  const executePendingToolExecutionQueueMatch = content.match(
    /\n\s{2}async executePendingToolExecutionQueue\s*\(pendingToolExecutionQueue,\s*referenceToolResults\s*=\s*\[\]\s*,?[^)]*\)\s*\{[\s\S]*?\}\n\n\s{2}addToolResultsToReferenceContext/
  );
  const toolReferenceMethodsMatch = content.match(
    /\n\s{2}addToolResultsToReferenceContext\s*\(referenceContext,\s*toolResults\)\s*\{[\s\S]*?\}\n\n\s{2}normalizeParams/
  );
  const normalizeParamsMatch = content.match(/normalizeParams\s*\(params\)\s*\{[\s\S]*?\}\n\n\s*areParametersEqual/);
  const areParametersEqualMatch = content.match(
    /areParametersEqual\s*\(params1,\s*params2\)\s*\{[\s\S]*?\}\n\n\s*\/\*\*/
  );
  const areToolParametersEqualMatch = content.match(
    /areToolParametersEqual\s*\(toolName,\s*params1,\s*params2\)\s*\{[\s\S]*?\}\n\n\s*\/\*\*/
  );
  const extractParametersMatch = content.match(
    /extractParametersFromExecutionMessage\s*\(content\)\s*\{[\s\S]*?\}\n\n\s*\/\*\*/
  );
  const parseToolExecutionFeedbackEntriesMatch = content.match(
    /parseToolExecutionFeedbackEntries\s*\(content\)\s*\{[\s\S]*?\}\n\n\s*\/\*\*/
  );
  const doesFeedbackEntryMatchParametersMatch = content.match(
    /doesFeedbackEntryMatchParameters\s*\(toolName,\s*parsedKeyParams,\s*paramsStr,\s*entry\)\s*\{[\s\S]*?\}\n\n\s*\/\*\*/
  );
  const wasToolExecutedSuccessfullyMatch = content.match(
    /wasToolExecutedSuccessfully\s*\(toolKey,\s*conversationHistory\)\s*\{[\s\S]*?\}\n\n\s*\/\*\*/
  );
  const getToolExecutionCountMatch = content.match(
    /getToolExecutionCount\s*\(toolKey,\s*conversationHistory\)\s*\{[\s\S]*?\}\n\n\s*\/\*\*/
  );
  const getToolExecutionCountByNameMatch = content.match(
    /getToolExecutionCountByName\s*\(toolName,\s*conversationHistory\)\s*\{[\s\S]*?\}\n\n\s*\/\*\*/
  );
  const findExistingExecutionMatch = content.match(
    /findExistingExecution\s*\(toolKey,\s*conversationHistory\)\s*\{[\s\S]*?\}\n\n\s*\/\*\*/
  );

  const cloneToolParametersCode = cloneToolParametersMatch
    ? cloneToolParametersMatch[0].replace('normalizeToolParams', '')
    : '';
  const normalizeToolParamsCode = normalizeToolParamsMatch
    ? normalizeToolParamsMatch[0].replace('getToolExecutionKey', '')
    : '';
  const getToolExecutionKeyCode = getToolExecutionKeyMatch
    ? getToolExecutionKeyMatch[0].replace('getRequestedToolExecutionLimit', '')
    : '';
  const getRequestedToolExecutionLimitCode = getRequestedToolExecutionLimitMatch
    ? getRequestedToolExecutionLimitMatch[0].replace(/\n\n\s{2}createToolExecutionState$/, '')
    : '';
  const toolExecutionStateMethodsCode = toolExecutionStateMethodsMatch
    ? toolExecutionStateMethodsMatch[0].replace(/\n\n\s{2}createPendingToolExecutionQueue$/, '')
    : '';
  const createPendingToolExecutionQueueCode = createPendingToolExecutionQueueMatch
    ? createPendingToolExecutionQueueMatch[0].replace(/\n\n\s{2}filterExecutableToolInstances$/, '')
    : '';
  const filterExecutableToolInstancesCode = filterExecutableToolInstancesMatch
    ? filterExecutableToolInstancesMatch[0].replace(/\n\n\s{2}\/\*\*$/, '')
    : '';
  const hasProgressSinceLastSuccessCode = hasProgressSinceLastSuccessMatch
    ? hasProgressSinceLastSuccessMatch[0].replace(/\n\n\s{2}async executePendingToolExecutionQueue$/, '')
    : '';
  const executePendingToolExecutionQueueCode = executePendingToolExecutionQueueMatch
    ? executePendingToolExecutionQueueMatch[0].replace(/\n\n\s{2}addToolResultsToReferenceContext$/, '')
    : '';
  const toolReferenceMethodsCode = toolReferenceMethodsMatch
    ? toolReferenceMethodsMatch[0].replace(/\n\n\s{2}normalizeParams$/, '')
    : '';
  const normalizeParamsCode = normalizeParamsMatch ? normalizeParamsMatch[0].replace('areParametersEqual', '') : '';
  const areParametersEqualCode = areParametersEqualMatch ? areParametersEqualMatch[0].replace('/**', '') : '';
  const areToolParametersEqualCode = areToolParametersEqualMatch
    ? areToolParametersEqualMatch[0].replace('/**', '')
    : '';
  const extractParametersCode = extractParametersMatch ? extractParametersMatch[0].replace('/**', '') : '';
  const parseToolExecutionFeedbackEntriesCode = parseToolExecutionFeedbackEntriesMatch
    ? parseToolExecutionFeedbackEntriesMatch[0].replace('/**', '')
    : '';
  const doesFeedbackEntryMatchParametersCode = doesFeedbackEntryMatchParametersMatch
    ? doesFeedbackEntryMatchParametersMatch[0].replace('/**', '')
    : '';
  const wasToolExecutedSuccessfullyCode = wasToolExecutedSuccessfullyMatch
    ? wasToolExecutedSuccessfullyMatch[0].replace('/**', '')
    : '';
  const getToolExecutionCountCode = getToolExecutionCountMatch ? getToolExecutionCountMatch[0].replace('/**', '') : '';
  const getToolExecutionCountByNameCode = getToolExecutionCountByNameMatch
    ? getToolExecutionCountByNameMatch[0].replace('/**', '')
    : '';
  const findExistingExecutionCode = findExistingExecutionMatch ? findExistingExecutionMatch[0].replace('/**', '') : '';

  const mockClassCode = `
    class MockChatManager {
      // Abort checkpoint seam. The real method reads this.conversationState;
      // these tests drive the queue without a conversation, so it is a no-op.
      throwIfConversationAborted() {}
      ${cloneToolParametersCode}
      ${normalizeToolParamsCode}
      ${getToolExecutionKeyCode}
      ${getRequestedToolExecutionLimitCode}
      ${toolExecutionStateMethodsCode}
      ${createPendingToolExecutionQueueCode}
      ${filterExecutableToolInstancesCode}
      ${hasProgressSinceLastSuccessCode}
      ${executePendingToolExecutionQueueCode}
      ${toolReferenceMethodsCode}
      ${normalizeParamsCode}
      ${areParametersEqualCode}
      ${areToolParametersEqualCode}
      ${extractParametersCode}
      ${parseToolExecutionFeedbackEntriesCode}
      ${doesFeedbackEntryMatchParametersCode}
      ${wasToolExecutedSuccessfullyCode}
      ${getToolExecutionCountCode}
      ${getToolExecutionCountByNameCode}
      ${findExistingExecutionCode}
      // Declared last so it wins over the extracted copy: ChatManager delegates
      // this to ConversationTranscriptService, and the mock has no services.
      getMessageToolExecutions(message) {
        const executions = message?.__codexomicsToolExecutions;
        return Array.isArray(executions) && executions.length > 0 ? executions : null;
      }
    }
    return MockChatManager;
  `;

  const fn = new Function(mockClassCode);
  return fn();
}

describe('Tool Policy - Parameter Normalization and Matching', () => {
  const LLMContextService = loadLLMContextServiceClass();
  const ToolExecutionService = loadToolExecutionServiceClass();
  const MockChatManager = loadChatManagerClass();

  it('should keep execution policies in dedicated hardcoded policy classes', () => {
    const contextSource = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/modules/chat/services/LLMContextService.js'),
      'utf8'
    );
    const capabilitySource = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/modules/chat/services/ToolCapabilityPolicy.js'),
      'utf8'
    );
    const executionSource = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/modules/chat/services/ToolExecutionPolicy.js'),
      'utf8'
    );

    expect(contextSource).toContain('getToolExecutionPolicy()');
    expect(contextSource).not.toContain('const toolPolicies = {');
    expect(capabilitySource).toContain('class ToolCapabilityPolicy');
    expect(executionSource).toContain('class ToolExecutionPolicy');
    expect(executionSource).not.toMatch(/\.ya?ml|\.json/);
  });

  it('should include benchmark tools in an explicit system utility policy', () => {
    const ToolCapabilityPolicy = globalThis.ToolCapabilityPolicy;
    const capabilityPolicy = new ToolCapabilityPolicy();

    expect(capabilityPolicy.getPolicyForTool('start_benchmark').name).toBe('system_utility');
    expect(capabilityPolicy.getPolicyForTool('export_benchmark_results').name).toBe('system_utility');
    expect(capabilityPolicy.getPolicyForTool('set_working_directory').name).toBe('system_utility');
  });

  it('should classify open_new_tab as a bounded repeatable UI operation', () => {
    const ToolCapabilityPolicy = globalThis.ToolCapabilityPolicy;
    const capabilityPolicy = new ToolCapabilityPolicy();
    const result = capabilityPolicy.getPolicyForTool('open_new_tab');

    expect(result.name).toBe('repeatable_ui_operations');
    expect(result.policy.policy).toBe('bounded_repeat');
  });

  it('should not apply global repetition limits to system utility tools', () => {
    const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
    const policy = new ToolExecutionPolicy({
      chatManager: {
        configManager: {
          get: (key, fallback) => {
            if (key === 'chatboxSettings') return {};
            return fallback;
          },
        },
        getToolExecutionKey: (toolName, parameters) => `${toolName}:${JSON.stringify(parameters)}`,
        getToolExecutionCount: () => 99,
        getToolExecutionCountByName: () => 99,
        wasToolExecutedSuccessfully: () => true,
      },
    });

    expect(policy.shouldAllowToolExecution({ tool_name: 'start_benchmark', parameters: { suite: 'quick' } }, [])).toBe(
      true
    );
  });

  it('should allow all tool executions when the explicit AI security bypass is enabled', () => {
    const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
    const policy = new ToolExecutionPolicy({
      chatManager: {
        configManager: {
          get: (key, fallback) => {
            if (key === 'generalSettings.disableAiSecurityRestrictions') return true;
            return fallback;
          },
        },
        getToolExecutionKey: (toolName, parameters) => `${toolName}:${JSON.stringify(parameters)}`,
        getToolExecutionCount: () => 99,
        getToolExecutionCountByName: () => 99,
        wasToolExecutedSuccessfully: () => true,
      },
    });

    expect(
      policy.shouldAllowToolExecution({ tool_name: 'unknown_repeat_tool', parameters: { path: '/tmp/a' } }, [])
    ).toBe(true);
  });

  it('should normalize parameters order-independently (LLMContextService)', () => {
    const service = new LLMContextService({}, {});
    const params1 = { sequence: 'GCAATAT', chromosome: 'chr1' };
    const params2 = { chromosome: 'chr1', sequence: 'GCAATAT' };

    const norm1 = service.normalizeParams(params1);
    const norm2 = service.normalizeParams(params2);

    expect(JSON.stringify(norm1)).toBe(JSON.stringify(norm2));
    expect(Object.keys(norm1)[0]).toBe('chromosome');
    expect(Object.keys(norm1)[1]).toBe('sequence');
  });

  it('should handle nested objects in parameter normalization (LLMContextService)', () => {
    const service = new LLMContextService({}, {});
    const params1 = { outer: { b: 2, a: 1 }, z: 100 };
    const params2 = { z: 100, outer: { a: 1, b: 2 } };

    const norm1 = service.normalizeParams(params1);
    const norm2 = service.normalizeParams(params2);

    expect(JSON.stringify(norm1)).toBe(JSON.stringify(norm2));
  });

  it('should canonicalize redundant primer sequence aliases', () => {
    const service = new LLMContextService({}, {});
    const manager = new MockChatManager();

    expect(service.normalizeParams({ primerSequence: 'GCAATAT' })).toEqual({ sequence: 'GCAATAT' });
    expect(
      manager.areParametersEqual({ sequence: 'GCAATAT' }, { sequence: 'GCAATAT', primerSequence: 'GCAATAT' })
    ).toBe(true);
  });

  it('should drop derived target sequences from design primer execution identity', () => {
    const service = new LLMContextService({}, {});
    const manager = new MockChatManager();
    const targetSequence = 'ATGTCTGAAATTGTTGTCTC';

    expect(service.normalizeToolParams('design_primers', { geneName: 'lysC', targetSequence })).toEqual({
      geneName: 'lysC',
    });
    expect(manager.getToolExecutionKey('design_primers', { geneName: 'lysC' })).toBe(
      manager.getToolExecutionKey('design_primers', { geneName: 'lysC', targetSequence })
    );
    expect(manager.getToolExecutionKey('design_primers', { targetSequence })).toContain(targetSequence);
  });

  it('should suppress an identical repeat from a later model round when nothing happened in between', () => {
    const manager = new MockChatManager();
    const tool = { tool_name: 'zoom_out', parameters: { factor: 2 } };
    const toolKey = manager.getToolExecutionKey(tool.tool_name, tool.parameters);
    const successfulCounts = new Map([[toolKey, 1]]);
    const state = manager.createToolExecutionState('zoom out');
    state.records.push({ tool: 'zoom_out', parameters: { factor: 2 }, status: 'success' });

    const result = manager.filterExecutableToolInstances([tool], successfulCounts, state.originalMessage, state);

    // The regression this pins: an already-successful call used to be treated as
    // "fresh" in every later round, so the model could re-issue it once per round
    // and each repeat applied the side effect again. Nothing changed between the
    // two rounds, so the repeat cannot produce anything new.
    expect(result.executableTools).toHaveLength(0);
    expect(result.suppressedTools).toHaveLength(1);
  });

  it('should allow an identical repeat once another tool has succeeded since', () => {
    const manager = new MockChatManager();
    const tool = { tool_name: 'get_track_status', parameters: {} };
    const successfulCounts = new Map([[manager.getToolExecutionKey(tool.tool_name, tool.parameters), 1]]);
    const state = manager.createToolExecutionState(
      'check track status, show GC, hide variants, then check track status again'
    );
    state.records.push(
      { tool: 'get_track_status', parameters: {}, status: 'success' },
      { tool: 'toggle_track', parameters: { trackName: 'gc' }, status: 'success' },
      { tool: 'toggle_track', parameters: { trackName: 'variants' }, status: 'success' }
    );

    const result = manager.filterExecutableToolInstances([tool], successfulCounts, state.originalMessage, state);

    // Re-reading state after something changed it is real work, and the evidence is
    // the intervening success rather than a list of which tools mutate state.
    expect(result.executableTools).toHaveLength(1);
    expect(result.suppressedTools).toHaveLength(0);
  });

  it('should catch a cross-round repeat the LLM disguises by echoing a resolved targetSequence', () => {
    const manager = new MockChatManager();
    const firstTool = { tool_name: 'design_primers', parameters: { geneName: 'lysC' } };
    const repeatedTool = {
      tool_name: 'design_primers',
      parameters: {
        geneName: 'lysC',
        targetSequence: 'ATGTCTGAAATTGTTGTCTC',
      },
    };
    const successfulCounts = new Map([[manager.getToolExecutionKey(firstTool.tool_name, firstTool.parameters), 1]]);
    const state = manager.createToolExecutionState('please design primers to amplify lysC gene');
    state.records.push({ tool: 'design_primers', parameters: { geneName: 'lysC' }, status: 'success' });

    const result = manager.filterExecutableToolInstances(
      [repeatedTool],
      successfulCounts,
      state.originalMessage,
      state
    );

    // Normalization drops the derived targetSequence, so the echoed call has the
    // same execution identity and is recognized as the repeat it is.
    expect(result.executableTools).toHaveLength(0);
    expect(result.suppressedTools).toHaveLength(1);
  });

  it('should allow get_track_status to rerun after track visibility changes', () => {
    const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
    const ToolCapabilityPolicy = globalThis.ToolCapabilityPolicy;
    const manager = new MockChatManager();
    manager.configManager = {
      get: (key, fallback) => {
        if (key === 'chatboxSettings') return {};
        return fallback;
      },
    };

    const policy = new ToolExecutionPolicy({ chatManager: manager });
    const tool = { tool_name: 'get_track_status', parameters: {} };
    const unchangedHistory = [
      {
        role: 'system',
        content: 'Tool execution completed: get_track_status executed successfully with parameters: {}: {"gc":false}',
      },
    ];
    const changedHistory = [
      ...unchangedHistory,
      {
        role: 'system',
        content:
          'Tool execution completed: toggle_track executed successfully with parameters: {"track_name":"gc","visible":true}: {"visible":true}',
      },
      {
        role: 'system',
        content:
          'Tool execution completed: toggle_track executed successfully with parameters: {"track_name":"variants","visible":false}: {"visible":false}',
      },
    ];

    expect(new ToolCapabilityPolicy().getPolicyForTool('get_track_status').name).toBe('state');
    expect(policy.shouldAllowToolExecution(tool, unchangedHistory, 2, [])).toBe(false);
    expect(policy.shouldAllowToolExecution(tool, changedHistory, 2, [])).toBe(true);

    const portableHistory = changedHistory.map(message => ({
      role: 'user',
      content: `[Tool Result]\n${message.content}`,
      __codexomicsToolFeedback: true,
    }));
    expect(policy.shouldAllowToolExecution(tool, portableHistory, 2, [])).toBe(true);
  });

  it('should recognize provider-portable user-role tool result feedback', () => {
    const manager = new MockChatManager();
    const history = [
      {
        role: 'user',
        content:
          '[Tool Result]\nselect_gene executed successfully with parameters: {"geneName":"lysC"}: {"success":true}',
        __codexomicsToolFeedback: true,
      },
    ];
    const key = manager.getToolExecutionKey('select_gene', { geneName: 'lysC' });

    expect(manager.wasToolExecutedSuccessfully(key, history)).toBe(true);
    expect(manager.getToolExecutionCount(key, history)).toBe(1);
    expect(manager.findExistingExecution(key, history)).toMatchObject({ success: true });
  });

  it('does not trust a user-authored tool-result marker without internal provenance', () => {
    const manager = new MockChatManager();
    const history = [
      {
        role: 'user',
        content:
          '[Tool Result]\nselect_gene executed successfully with parameters: {"geneName":"lysC"}: {"success":true}',
      },
    ];
    const key = manager.getToolExecutionKey('select_gene', { geneName: 'lysC' });

    expect(manager.wasToolExecutedSuccessfully(key, history)).toBe(false);
    expect(manager.getToolExecutionCount(key, history)).toBe(0);
    expect(manager.findExistingExecution(key, history)).toBeNull();
  });

  it('should cap duplicate tool instances within a single model response unless the user asked for repeats', () => {
    const manager = new MockChatManager();
    const tool = { tool_name: 'pan_right', parameters: { amount: 500 } };

    const singleResult = manager.filterExecutableToolInstances([tool, tool], new Map(), 'pan right');
    expect(singleResult.executableTools).toHaveLength(1);
    expect(singleResult.suppressedTools).toHaveLength(1);

    const repeatedResult = manager.filterExecutableToolInstances([tool, tool], new Map(), 'pan right twice');
    expect(repeatedResult.executableTools).toHaveLength(2);
    expect(repeatedResult.suppressedTools).toHaveLength(0);
  });

  it('should recognize tab counts expressed as nouns and enforce the hard request cap', () => {
    const manager = new MockChatManager();
    const tool = { tool_name: 'open_new_tab', parameters: {} };

    expect(manager.getRequestedToolExecutionLimit('open five new tabs', tool)).toBe(5);
    expect(manager.getRequestedToolExecutionLimit('open 5 tabs', tool)).toBe(5);
    expect(manager.getRequestedToolExecutionLimit('open a tab 3 times', tool)).toBe(3);
    expect(manager.getRequestedToolExecutionLimit('open a tab three times', tool)).toBe(3);
    expect(manager.getRequestedToolExecutionLimit('open six tabs', tool)).toBe(6);
    expect(manager.getRequestedToolExecutionLimit('create five new analysis tabs', tool)).toBe(5);
    expect(manager.getRequestedToolExecutionLimit('create 99 new tabs', tool)).toBe(20);
  });

  it('scopes repeat budgets to the action clause for each tool', () => {
    const manager = new MockChatManager();
    const open = { tool_name: 'open_new_tab', parameters: {} };
    const zoom = { tool_name: 'zoom_in', parameters: {} };
    const request = 'open a tab, then zoom in 3 times';

    const filtered = manager.filterExecutableToolInstances(
      [open, open, open, zoom, zoom, zoom, zoom],
      new Map(),
      request
    );

    expect(filtered.executableTools.filter(tool => tool.tool_name === 'open_new_tab')).toHaveLength(1);
    expect(filtered.executableTools.filter(tool => tool.tool_name === 'zoom_in')).toHaveLength(3);

    const priorSuccesses = new Map([[manager.getToolExecutionKey('zoom_in', {}), 3]]);
    const afterBudget = manager.filterExecutableToolInstances([zoom], priorSuccesses, request);
    expect(afterBudget.executableTools).toHaveLength(0);
    expect(afterBudget.suppressedTools).toHaveLength(1);

    const variedZooms = [1, 2, 3].map(factor => ({ tool_name: 'zoom_in', parameters: { factor } }));
    const variedResult = manager.filterExecutableToolInstances(variedZooms, new Map(), 'zoom in twice');
    expect(variedResult.executableTools).toHaveLength(2);
    expect(variedResult.suppressedTools).toHaveLength(1);
  });

  it('consumes reordered duplicate tool results at most once', () => {
    const manager = new MockChatManager();
    const state = manager.createToolExecutionState('open two tabs and get the current state');
    const tools = [
      { tool_name: 'open_new_tab', parameters: {}, executionId: 'open_1' },
      { tool_name: 'get_current_state', parameters: {}, executionId: 'state_1' },
      { tool_name: 'open_new_tab', parameters: {}, executionId: 'open_2' },
    ];
    manager.recordToolExecutionState(state, tools[0], 'queued', { id: 'open_1' });
    manager.recordToolExecutionState(state, tools[1], 'queued', { id: 'state_1' });
    manager.recordToolExecutionState(state, tools[2], 'queued', { id: 'open_2' });

    manager.markToolExecutionResults(
      state,
      tools,
      [
        { tool: 'open_new_tab', parameters: {}, success: true, result: { success: true } },
        { tool: 'open_new_tab', parameters: {}, success: false, error: 'failed' },
        { tool: 'get_current_state', parameters: {}, success: true, result: { genomeLoaded: true } },
      ],
      1
    );

    expect(state.records.map(record => record.status)).toEqual(['success', 'success', 'failed']);
  });

  it('should apply ChatBox settings to the explicit tab request budget', () => {
    const manager = new MockChatManager();
    const tool = { tool_name: 'open_new_tab', parameters: {} };

    manager.configManager = {
      get: key =>
        key === 'chatboxSettings' ? { enableRepeatedOpenNewTab: true, maxRepeatedOpenNewTabCalls: 3 } : undefined,
    };
    expect(manager.getRequestedToolExecutionLimit('open five new tabs', tool)).toBe(3);

    manager.configManager.get = key =>
      key === 'chatboxSettings' ? { enableRepeatedOpenNewTab: false, maxRepeatedOpenNewTabCalls: 20 } : undefined;
    expect(manager.getRequestedToolExecutionLimit('open five new tabs', tool)).toBe(1);
  });

  it('should queue five explicitly requested tabs in one model response', () => {
    const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
    const ToolCapabilityPolicy = globalThis.ToolCapabilityPolicy;
    const manager = new MockChatManager();
    const capabilityPolicy = new ToolCapabilityPolicy();
    const policy = new ToolExecutionPolicy({ chatManager: manager, capabilityPolicy });
    manager.services = {
      context: {
        getToolExecutionPolicy: () => policy,
      },
    };
    manager.showThinkingProcess = false;
    manager.updateThinkingMessage = () => {};
    manager.shouldAllowToolExecution = (...args) => policy.shouldAllowToolExecution(...args);

    const tools = Array.from({ length: 6 }, (_, index) => ({
      tool_name: 'open_new_tab',
      parameters: { title: `New Tab ${index + 1}` },
    }));
    const result = manager.createPendingToolExecutionQueue(tools, new Map(), 'open five new tabs', [], 1);

    expect(result.pendingTools).toHaveLength(5);
    expect(result.pendingTools.map(tool => tool.parameters.title)).toEqual([
      'New Tab 1',
      'New Tab 2',
      'New Tab 3',
      'New Tab 4',
      'New Tab 5',
    ]);
    expect(result.suppressedTools).toHaveLength(1);
    expect(result.policyBlockedTools).toHaveLength(0);
  });

  it('should apply a repeatable tool request budget across model rounds', () => {
    const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
    const ToolCapabilityPolicy = globalThis.ToolCapabilityPolicy;
    const manager = new MockChatManager();
    const capabilityPolicy = new ToolCapabilityPolicy();
    const policy = new ToolExecutionPolicy({ chatManager: manager, capabilityPolicy });
    manager.services = {
      context: {
        getToolExecutionPolicy: () => policy,
      },
    };
    manager.showThinkingProcess = false;
    manager.updateThinkingMessage = () => {};
    manager.shouldAllowToolExecution = (...args) => policy.shouldAllowToolExecution(...args);

    const successfulCounts = new Map([
      [manager.getToolExecutionKey('open_new_tab', { title: 'New Tab 1' }), 1],
      [manager.getToolExecutionKey('open_new_tab', { title: 'New Tab 2' }), 1],
    ]);
    const tools = Array.from({ length: 4 }, (_, index) => ({
      tool_name: 'open_new_tab',
      parameters: { title: `Later Tab ${index + 1}` },
    }));
    const result = manager.createPendingToolExecutionQueue(tools, successfulCounts, 'open five new tabs', [], 2);

    expect(result.pendingTools).toHaveLength(3);
    expect(result.suppressedTools).toHaveLength(1);
  });

  it('should allow only one tab when the user did not request a repeat', () => {
    const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
    const ToolCapabilityPolicy = globalThis.ToolCapabilityPolicy;
    const manager = new MockChatManager();
    const capabilityPolicy = new ToolCapabilityPolicy();
    const policy = new ToolExecutionPolicy({ chatManager: manager, capabilityPolicy });
    manager.services = {
      context: {
        getToolExecutionPolicy: () => policy,
      },
    };
    manager.showThinkingProcess = false;
    manager.updateThinkingMessage = () => {};
    manager.shouldAllowToolExecution = (...args) => policy.shouldAllowToolExecution(...args);

    const result = manager.createPendingToolExecutionQueue(
      [
        { tool_name: 'open_new_tab', parameters: { title: 'Requested Tab' } },
        { tool_name: 'open_new_tab', parameters: { title: 'Unrequested Tab' } },
      ],
      new Map(),
      'open a new tab',
      [],
      1
    );

    expect(result.pendingTools).toHaveLength(1);
    expect(result.suppressedTools).toHaveLength(1);
  });

  it('should cap repeatable UI operations at twenty planned calls per round', () => {
    const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
    const ToolCapabilityPolicy = globalThis.ToolCapabilityPolicy;
    const manager = new MockChatManager();
    const policy = new ToolExecutionPolicy({
      chatManager: manager,
      capabilityPolicy: new ToolCapabilityPolicy(),
    });
    const tool = { tool_name: 'open_new_tab', parameters: {} };
    const plannedResults = Array.from({ length: 20 }, () => ({ tool: 'open_new_tab', pending: true }));

    expect(policy.shouldAllowToolExecution(tool, [], 1, plannedResults.slice(0, 19))).toBe(true);
    expect(policy.shouldAllowToolExecution(tool, [], 1, plannedResults)).toBe(false);
  });

  it('should apply ChatBox settings to the per-round tab limit', () => {
    const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
    const ToolCapabilityPolicy = globalThis.ToolCapabilityPolicy;
    const manager = new MockChatManager();
    manager.configManager = {
      get: key =>
        key === 'chatboxSettings' ? { enableRepeatedOpenNewTab: true, maxRepeatedOpenNewTabCalls: 3 } : undefined,
    };
    const policy = new ToolExecutionPolicy({
      chatManager: manager,
      capabilityPolicy: new ToolCapabilityPolicy(),
    });
    const tool = { tool_name: 'open_new_tab', parameters: {} };
    const twoPlanned = Array.from({ length: 2 }, () => ({ tool: 'open_new_tab', pending: true }));
    const threePlanned = Array.from({ length: 3 }, () => ({ tool: 'open_new_tab', pending: true }));

    expect(policy.shouldAllowToolExecution(tool, [], 1, twoPlanned)).toBe(true);
    expect(policy.shouldAllowToolExecution(tool, [], 1, threePlanned)).toBe(false);

    manager.configManager.get = key =>
      key === 'chatboxSettings' ? { enableRepeatedOpenNewTab: false, maxRepeatedOpenNewTabCalls: 20 } : undefined;
    expect(policy.shouldAllowToolExecution(tool, [], 1, [])).toBe(true);
    expect(policy.shouldAllowToolExecution(tool, [], 1, [{ tool: 'open_new_tab', pending: true }])).toBe(false);
  });

  it('should build a pending execution queue from detected tool calls', () => {
    const manager = new MockChatManager();
    manager.showThinkingProcess = false;
    manager.updateThinkingMessage = () => {};
    manager.shouldAllowToolExecution = tool => tool.parameters.search_query !== 'blocked';
    const tools = [
      { tool_name: 'search_uniprot_database', parameters: { search_query: 'DNA polymerase I' } },
      { tool_name: 'search_uniprot_database', parameters: { search_query: 'blocked' } },
    ];

    const result = manager.createPendingToolExecutionQueue(tools, new Map(), 'search polymerases', [], 2);
    tools[0].parameters.search_query = 'mutated after queueing';

    expect(result.pendingTools).toHaveLength(1);
    expect(result.pendingTools[0].parameters.search_query).toBe('DNA polymerase I');
    expect(result.policyBlockedTools).toHaveLength(1);
    expect(result.suppressedTools).toHaveLength(0);
  });

  it('should retain structured execution state for queued, blocked, and same-response suppressed tool calls', () => {
    const manager = new MockChatManager();
    manager.showThinkingProcess = false;
    manager.updateThinkingMessage = () => {};
    manager.shouldAllowToolExecution = tool => tool.tool_name !== 'blocked_tool';

    const completedTool = { tool_name: 'get_coding_sequence', parameters: { gene_name: 'lacZ' } };
    const blockedTool = { tool_name: 'blocked_tool', parameters: { id: 1 } };
    const queuedTool = { tool_name: 'translate_dna', parameters: { dna: 'ATG', reading_frame: 1 } };
    // The 'suppressed' record comes from the same-response duplicate below, which is
    // what this test is about. Seeding a prior-round success instead would now
    // suppress both instances and stop exercising the queued path.
    const successfulCounts = new Map();
    const state = manager.createToolExecutionState('retrieve lacZ, translate it, and calculate molecular weight');

    const result = manager.createPendingToolExecutionQueue(
      [completedTool, completedTool, blockedTool, queuedTool],
      successfulCounts,
      state.originalMessage,
      [],
      2,
      state
    );

    expect(result.pendingTools).toHaveLength(2);
    expect(result.pendingTools[0].executionId).toBeDefined();
    expect(state.records.map(record => record.status)).toEqual(['suppressed', 'queued', 'blocked', 'queued']);
    expect(state.records.map(record => record.tool)).toEqual([
      'get_coding_sequence',
      'get_coding_sequence',
      'blocked_tool',
      'translate_dna',
    ]);
  });

  it('bounds cross-round repeats for a tool no completion heuristic knows about', () => {
    const manager = new MockChatManager();
    manager.showThinkingProcess = false;
    manager.updateThinkingMessage = () => {};
    manager.shouldAllowToolExecution = () => true;

    // Deliberately a name that appears in no capability policy, no task-completing
    // tool list and no single-execution phrase list. The loop still has to bound it:
    // that was the actual defect behind "zoom out" running once per round, and it
    // applied to every tool those lists happen to omit.
    const call = { tool_name: 'some_unlisted_capability', parameters: { level: 1 } };
    const state = manager.createToolExecutionState('do the thing');
    const successfulCounts = new Map();

    const round1 = manager.createPendingToolExecutionQueue(
      [call],
      successfulCounts,
      state.originalMessage,
      [],
      1,
      state
    );
    expect(round1.pendingTools).toHaveLength(1);

    manager.markToolExecutionResults(
      state,
      round1.pendingTools,
      [{ tool: call.tool_name, parameters: call.parameters, success: true, result: { ok: true }, error: null }],
      1
    );
    successfulCounts.set(manager.getToolExecutionKey(call.tool_name, call.parameters), 1);

    const round2 = manager.createPendingToolExecutionQueue(
      [call],
      successfulCounts,
      state.originalMessage,
      [],
      2,
      state
    );

    expect(round2.pendingTools).toHaveLength(0);
    expect(round2.suppressedTools).toHaveLength(1);
  });

  it('stops a genome-wide analysis from re-running every round', () => {
    const manager = new MockChatManager();
    manager.showThinkingProcess = false;
    manager.updateThinkingMessage = () => {};
    manager.shouldAllowToolExecution = () => true;

    // Reported scenario: "genome wide codon usage analysis" ran four times with
    // identical parameters. The message matches the "codon usage analysis" phrase
    // list and the list names codon_usage_analysis, but the tool the model actually
    // picked is genome_codon_usage_analysis, which no list mentions.
    const call = { tool_name: 'genome_codon_usage_analysis', parameters: { clientId: 'U00096' } };
    const state = manager.createToolExecutionState('genome wide codon usage analysis');
    const successfulCounts = new Map();

    const round1 = manager.createPendingToolExecutionQueue(
      [call],
      successfulCounts,
      state.originalMessage,
      [],
      1,
      state
    );
    expect(round1.pendingTools).toHaveLength(1);

    manager.markToolExecutionResults(
      state,
      round1.pendingTools,
      [
        {
          tool: call.tool_name,
          parameters: call.parameters,
          success: true,
          result: { success: true, totalGenes: 3878, totalCodons: 1343883 },
          error: null,
        },
      ],
      1
    );
    successfulCounts.set(manager.getToolExecutionKey(call.tool_name, call.parameters), 1);

    const round2 = manager.createPendingToolExecutionQueue(
      [call],
      successfulCounts,
      state.originalMessage,
      [],
      2,
      state
    );

    expect(round2.pendingTools).toHaveLength(0);
    expect(round2.suppressedTools).toHaveLength(1);
  });

  it('should update execution state with success/failure results and inject it as a user-visible state message', () => {
    const manager = new MockChatManager();
    manager.showThinkingProcess = false;
    manager.updateThinkingMessage = () => {};
    manager.shouldAllowToolExecution = () => true;
    const state = manager.createToolExecutionState('retrieve lacZ, translate it, and calculate molecular weight');
    const tools = [
      { tool_name: 'get_coding_sequence', parameters: { gene_name: 'lacZ' } },
      { tool_name: 'calculate_molecular_weight', parameters: { sequence: 'BAD' } },
    ];

    const queued = manager.createPendingToolExecutionQueue(tools, new Map(), state.originalMessage, [], 1, state);
    manager.markToolExecutionResults(
      state,
      queued.pendingTools,
      [
        {
          tool: 'get_coding_sequence',
          parameters: { gene_name: 'lacZ' },
          success: true,
          result: { codingSequence: 'ATGAAATAG', length: 9 },
          error: null,
        },
        {
          tool: 'calculate_molecular_weight',
          parameters: { sequence: 'BAD' },
          success: false,
          result: null,
          error: 'invalid sequence',
        },
      ],
      1
    );

    expect(state.records[0].status).toBe('success');
    expect(state.records[0].resultSummary.codingSequence).toBe('ATGAAATAG');
    expect(state.records[1].status).toBe('failed');
    expect(state.records[1].error).toBe('invalid sequence');

    const history = [];
    expect(manager.appendToolExecutionStateMessage(history, state)).toBe(true);
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toContain('[Tool Execution State]');
    expect(history[0].content).toContain('"status": "success"');
    expect(history[0].content).toContain('"status": "failed"');
    expect(history[0].content).toContain('Do not call a tool with status "success" again');
  });

  it('should match reordered parallel results by tool identity instead of array index', () => {
    const manager = new MockChatManager();
    manager.showThinkingProcess = false;
    manager.updateThinkingMessage = () => {};
    manager.shouldAllowToolExecution = () => true;
    const state = manager.createToolExecutionState('run two independent checks');
    const queued = manager.createPendingToolExecutionQueue(
      [
        { tool_name: 'first_tool', parameters: { id: 1 } },
        { tool_name: 'second_tool', parameters: { id: 2 } },
      ],
      new Map(),
      state.originalMessage,
      [],
      1,
      state
    );

    manager.markToolExecutionResults(
      state,
      queued.pendingTools,
      [
        { tool: 'second_tool', parameters: { id: 2 }, success: false, error: 'second failed' },
        { tool: 'first_tool', parameters: { id: 1 }, success: true, result: { value: 'first' } },
      ],
      1
    );

    expect(state.records[0]).toMatchObject({ tool: 'first_tool', status: 'success' });
    expect(state.records[1]).toMatchObject({ tool: 'second_tool', status: 'failed', error: 'second failed' });
  });

  it('should translate one-based reading_frame into zero-based MicrobeGenomics frame arguments', () => {
    const service = new ToolExecutionService({}, {});

    expect(service._extractMGFArgs('translate_dna', { dna: 'AAATTT', reading_frame: 1 })).toEqual(['AAATTT', 0]);
    expect(service._extractMGFArgs('translate_dna', { dna: 'AAATTT', reading_frame: 2 })).toEqual(['AAATTT', 1]);
    expect(service._extractMGFArgs('translate_dna', { dna: 'AAATTT', frame: 2 })).toEqual(['AAATTT', 2]);
  });

  it('should consume pending tool calls as each item is dispatched', async () => {
    const manager = new MockChatManager();
    const queue = [
      { tool_name: 'search_uniprot_database', parameters: { search_query: 'DNA polymerase I' } },
      { tool_name: 'search_uniprot_database', parameters: { search_query: 'fail' } },
    ];
    const queueLengthsDuringDispatch = [];
    manager.executeToolByName = async (toolName, parameters) => {
      queueLengthsDuringDispatch.push(queue.length);
      if (parameters.search_query === 'fail') {
        throw new Error('simulated failure');
      }
      return { ok: true, toolName };
    };

    const results = await manager.executePendingToolExecutionQueue(queue);

    expect(queue).toHaveLength(2);
    expect(queueLengthsDuringDispatch).toEqual([2, 2]);
    expect(results).toEqual([
      {
        tool: 'search_uniprot_database',
        tool_name: 'search_uniprot_database',
        tool_call_id: null,
        parameters: { search_query: 'DNA polymerase I' },
        success: true,
        result: { ok: true, toolName: 'search_uniprot_database' },
        error: null,
        executionTime: expect.any(Number),
      },
      {
        tool: 'search_uniprot_database',
        tool_name: 'search_uniprot_database',
        tool_call_id: null,
        parameters: { search_query: 'fail' },
        success: false,
        result: null,
        error: 'simulated failure',
        executionTime: expect.any(Number),
      },
    ]);
  });

  it('should preserve an explicit unsuccessful tool outcome as a failure', async () => {
    const manager = new MockChatManager();
    const queue = [{ tool_name: 'select_gene', parameters: { geneName: 'lysC' } }];
    const referenceContext = [];
    manager.executeToolByName = async () => ({ success: false, error: 'Gene lysC was not found' });

    const results = await manager.executePendingToolExecutionQueue(queue, referenceContext);

    expect(results).toEqual([
      {
        tool: 'select_gene',
        tool_name: 'select_gene',
        tool_call_id: null,
        parameters: { geneName: 'lysC' },
        success: false,
        result: null,
        error: 'Gene lysC was not found',
        executionTime: expect.any(Number),
      },
    ]);
    expect(referenceContext).toHaveLength(0);
  });

  it('should resolve same-batch tool result references before execution', async () => {
    const manager = new MockChatManager();
    const calls = [];
    const queue = [
      { tool_name: 'get_sequence', parameters: { chromosome: 'U00096', start: 100000, end: 101000 } },
      { tool_name: 'calculate_entropy', parameters: { sequence: '{get_sequence.sequence}' } },
      { tool_name: 'reverse_complement', parameters: { sequence: '{{get_sequence.sequence}}' } },
      { tool_name: 'translate_dna', parameters: { dna: 'prefix-{get_sequence.length}', reading_frame: 1 } },
    ];

    manager.conversationState = {};
    manager.executeToolByName = async (toolName, parameters) => {
      calls.push({ toolName, parameters });
      if (toolName === 'get_sequence') {
        return { chromosome: 'U00096', start: 100000, end: 101000, sequence: 'ATGCGT', length: 6 };
      }
      return { ok: true, parameters };
    };

    const results = await manager.executePendingToolExecutionQueue(queue);

    expect(calls).toEqual([
      { toolName: 'get_sequence', parameters: { chromosome: 'U00096', start: 100000, end: 101000 } },
      { toolName: 'calculate_entropy', parameters: { sequence: 'ATGCGT' } },
      { toolName: 'reverse_complement', parameters: { sequence: 'ATGCGT' } },
      { toolName: 'translate_dna', parameters: { dna: 'prefix-6', reading_frame: 1 } },
    ]);
    expect(results[1].parameters).toEqual({ sequence: '{get_sequence.sequence}' });
    expect(results.every(result => result.success)).toBe(true);
  });

  it('should preserve referenced object and array values for whole-parameter references', () => {
    const manager = new MockChatManager();
    const fragments = [
      { start: 1, end: 100, length: 100 },
      { start: 101, end: 250, length: 150 },
    ];
    const referenceResults = [
      {
        tool: 'virtual_digest',
        parameters: {},
        success: true,
        result: { fragmentDetails: fragments },
      },
    ];

    const resolved = manager.resolveToolParameterReferences(
      {
        fragments: '{virtual_digest.fragmentDetails}',
        largest: '{virtual_digest.fragmentDetails[1].length}',
      },
      referenceResults
    );

    expect(resolved.fragments).toBe(fragments);
    expect(resolved.largest).toBe(150);
  });

  it('should fail unresolved tool result references instead of executing literal placeholders', async () => {
    const manager = new MockChatManager();
    const calls = [];
    const queue = [{ tool_name: 'calculate_entropy', parameters: { sequence: '{get_sequence.sequence}' } }];

    manager.conversationState = {};
    manager.executeToolByName = async (toolName, parameters) => {
      calls.push({ toolName, parameters });
      return { ok: true };
    };

    const results = await manager.executePendingToolExecutionQueue(queue);

    expect(calls).toEqual([]);
    expect(results).toEqual([
      {
        tool: 'calculate_entropy',
        tool_name: 'calculate_entropy',
        tool_call_id: null,
        parameters: { sequence: '{get_sequence.sequence}' },
        success: false,
        result: null,
        error: 'Unresolved tool result reference: {get_sequence.sequence}',
        executionTime: 0,
      },
    ]);
  });

  it('should allow external API follow-up calls with different parameters but block exact repeats', () => {
    const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
    const manager = new MockChatManager();
    manager.configManager = {
      get: (key, fallback) => {
        if (key === 'chatboxSettings') return {};
        return fallback;
      },
    };
    const policy = new ToolExecutionPolicy({ chatManager: manager });
    const history = [
      {
        role: 'system',
        content:
          'Tool execution completed: search_uniprot_database executed successfully with parameters: {"organism":"Escherichia coli","reviewed_only":true,"search_query":"polymerase"}: {"count":20}',
      },
    ];

    expect(
      policy.shouldAllowToolExecution(
        {
          tool_name: 'search_uniprot_database',
          parameters: { search_query: 'DNA polymerase I', organism: 'Escherichia coli', reviewed_only: true },
        },
        history,
        2,
        []
      )
    ).toBe(true);
    expect(
      policy.shouldAllowToolExecution(
        {
          tool_name: 'search_uniprot_database',
          parameters: { search_query: 'polymerase', organism: 'Escherichia coli', reviewed_only: true },
        },
        history,
        2,
        []
      )
    ).toBe(false);
  });

  it('should compare parameters correctly (ChatManager areParametersEqual)', () => {
    const manager = new MockChatManager();
    const params1 = { sequence: 'GCAATAT', chromosome: 'chr1' };
    const params2 = { chromosome: 'chr1', sequence: 'GCAATAT' };

    expect(manager.areParametersEqual(params1, params2)).toBe(true);
    expect(manager.areParametersEqual(params1, { sequence: 'GCAATAT' })).toBe(false);
  });

  it('should robustly parse and match parameters in wasToolExecutedSuccessfully', () => {
    const manager = new MockChatManager();
    const toolKey = 'find_primer_binding_sites:{"chromosome":"chr1","sequence":"GCAATAT"}';

    // Exact match in history
    const history1 = [
      {
        role: 'system',
        content:
          'Tool execution completed: find_primer_binding_sites executed successfully with parameters: {"chromosome":"chr1","sequence":"GCAATAT"}: found 1 sites',
      },
    ];
    expect(manager.wasToolExecutedSuccessfully(toolKey, history1)).toBe(true);

    // Permuted keys match in history
    const history2 = [
      {
        role: 'system',
        content:
          'Tool execution completed: find_primer_binding_sites executed successfully with parameters: {"sequence":"GCAATAT","chromosome":"chr1"}: found 1 sites',
      },
    ];
    expect(manager.wasToolExecutedSuccessfully(toolKey, history2)).toBe(true);

    // Mismatched parameters
    const history3 = [
      {
        role: 'system',
        content:
          'Tool execution completed: find_primer_binding_sites executed successfully with parameters: {"chromosome":"chr2","sequence":"GCAATAT"}: found 0 sites',
      },
    ];
    expect(manager.wasToolExecutedSuccessfully(toolKey, history3)).toBe(false);
  });

  it('should parse execution parameters when JSON results are appended', () => {
    const manager = new MockChatManager();
    const toolKey = 'find_primer_binding_sites:{"sequence":"GCAATATGTCTCTGTGTGGAT"}';
    const history = [
      {
        role: 'system',
        content:
          'Tool execution completed: find_primer_binding_sites executed successfully with parameters: {"sequence":"GCAATATGTCTCTGTGTGGAT","primerSequence":"GCAATATGTCTCTGTGTGGAT"}: {"queryLength":21,"sites":[{"start":24,"end":45,"strand":"+","mismatches":0,"sequence":"GCAATATGTCTCTGTGTGGAT"}]}',
      },
    ];

    expect(manager.wasToolExecutedSuccessfully(toolKey, history)).toBe(true);
    expect(manager.getToolExecutionCount(toolKey, history)).toBe(1);
    expect(manager.findExistingExecution(toolKey, history)?.success).toBe(true);
  });

  it('should robustly parse and match parameters in getToolExecutionCount', () => {
    const manager = new MockChatManager();
    const toolKey = 'find_primer_binding_sites:{"chromosome":"chr1","sequence":"GCAATAT"}';

    const history = [
      {
        role: 'system',
        content:
          'Tool execution completed: find_primer_binding_sites executed successfully with parameters: {"chromosome":"chr1","sequence":"GCAATAT"}: 1',
      },
      {
        role: 'system',
        content:
          'Tool execution completed: find_primer_binding_sites executed successfully with parameters: {"sequence":"GCAATAT","chromosome":"chr1"}: 2',
      },
      {
        role: 'system',
        content:
          'Tool execution completed: find_primer_binding_sites executed successfully with parameters: {"sequence":"DIFFERENT","chromosome":"chr1"}: 3',
      },
    ];

    expect(manager.getToolExecutionCount(toolKey, history)).toBe(2);
  });

  describe('multi-tool rounds', () => {
    // A round that runs several tools reports all of them in one feedback message.
    // Every repeat guard reads that message, so a tool that is not listed first must
    // still be recognised — otherwise the model can re-issue it every round and the
    // tool really re-runs (re-opening viewers, re-hitting external APIs) until the
    // turn times out.
    const buildMultiToolFeedback = () => ({
      role: 'system',
      content:
        '[Tool Result]\n' +
        'search_uniprot_database executed successfully with parameters: ' +
        '{"organism":"Escherichia coli","search_query":"DapA"}: {"success":true,"count":5}; ' +
        'search_pdb_structures executed successfully with parameters: ' +
        '{"geneName":"dapA","organism":"Escherichia coli"}: {"success":true,"count":10}',
    });

    const pdbKey = 'search_pdb_structures:{"geneName":"dapA","organism":"Escherichia coli"}';

    it('attributes parameters to the tool that reported them', () => {
      const manager = new MockChatManager();
      const entries = manager.parseToolExecutionFeedbackEntries(buildMultiToolFeedback().content);

      expect(entries.map(entry => entry.toolName)).toEqual(['search_uniprot_database', 'search_pdb_structures']);
      expect(entries.every(entry => entry.success)).toBe(true);
      expect(JSON.parse(entries[0].parametersText)).toEqual({
        organism: 'Escherichia coli',
        search_query: 'DapA',
      });
      expect(JSON.parse(entries[1].parametersText)).toEqual({
        geneName: 'dapA',
        organism: 'Escherichia coli',
      });
    });

    it('detects a tool reported after the first one in the same round', () => {
      const manager = new MockChatManager();
      const history = [buildMultiToolFeedback()];

      expect(manager.wasToolExecutedSuccessfully(pdbKey, history)).toBe(true);
      expect(manager.getToolExecutionCount(pdbKey, history)).toBe(1);
      expect(manager.findExistingExecution(pdbKey, history)).toMatchObject({ success: true });
    });

    it('counts repeats of a non-first tool so the identical-execution limit can fire', () => {
      const manager = new MockChatManager();
      const history = [buildMultiToolFeedback(), buildMultiToolFeedback(), buildMultiToolFeedback()];

      expect(manager.getToolExecutionCount(pdbKey, history)).toBe(3);
    });

    it('does not match a non-first tool called with different parameters', () => {
      const manager = new MockChatManager();
      const otherKey = 'search_pdb_structures:{"geneName":"lysC","organism":"Escherichia coli"}';

      expect(manager.wasToolExecutedSuccessfully(otherKey, [buildMultiToolFeedback()])).toBe(false);
      expect(manager.getToolExecutionCount(otherKey, [buildMultiToolFeedback()])).toBe(0);
    });

    it('lets the execution policy stop a tool the model keeps re-issuing', () => {
      // The end of the chain the parsing bug broke: a PDB search batched behind
      // the UniProt search in every round used to look brand new each time, so it
      // re-ran and re-opened the results viewer until the turn timed out.
      const ToolExecutionPolicy = globalThis.ToolExecutionPolicy;
      const manager = new MockChatManager();
      const policy = new ToolExecutionPolicy({
        chatManager: {
          configManager: { get: (key, fallback) => (key === 'chatboxSettings' ? {} : fallback) },
          getToolExecutionKey: manager.getToolExecutionKey.bind(manager),
          getToolExecutionCount: manager.getToolExecutionCount.bind(manager),
          getToolExecutionCountByName: manager.getToolExecutionCountByName.bind(manager),
          wasToolExecutedSuccessfully: manager.wasToolExecutedSuccessfully.bind(manager),
          findExistingExecution: manager.findExistingExecution.bind(manager),
        },
      });

      const call = {
        tool_name: 'search_pdb_structures',
        parameters: { geneName: 'dapA', organism: 'Escherichia coli' },
      };

      expect(policy.shouldAllowToolExecution(call, [], 1, [])).toBe(true);
      expect(policy.shouldAllowToolExecution(call, [buildMultiToolFeedback()], 2, [])).toBe(false);
    });

    it('reads failure from the tool own entry, not from a sibling that succeeded', () => {
      const manager = new MockChatManager();
      const history = [
        {
          role: 'system',
          content:
            '[Tool Result]\n' +
            'search_uniprot_database executed successfully with parameters: ' +
            '{"organism":"Escherichia coli","search_query":"DapA"}: {"success":true}; ' +
            'search_pdb_structures executed with parameters: ' +
            '{"geneName":"dapA","organism":"Escherichia coli"}: {"success":false}',
        },
      ];

      expect(manager.findExistingExecution(pdbKey, history)).toMatchObject({ success: false });
      expect(manager.wasToolExecutedSuccessfully(pdbKey, history)).toBe(false);
    });
  });

  it('should detect view state changes in hasViewStateChangedSinceLastExecution', () => {
    const service = new LLMContextService({}, {});

    // Scenario 1: No previous successful execution of target tool
    const history1 = [
      {
        role: 'system',
        content: 'Tool execution completed: zoom_in executed successfully',
      },
    ];
    expect(service.hasViewStateChangedSinceLastExecution('find_primer_binding_sites', history1)).toBe(false);

    // Scenario 2: Target tool executed, then view changed
    const history2 = [
      {
        role: 'system',
        content:
          'Tool execution completed: find_primer_binding_sites executed successfully with parameters: {"sequence":"GCAATAT"}: 1',
      },
      {
        role: 'system',
        content: 'Tool execution completed: zoom_in executed successfully',
      },
    ];
    expect(service.hasViewStateChangedSinceLastExecution('find_primer_binding_sites', history2)).toBe(true);

    // Scenario 3: Target tool executed, but view changed BEFORE it, not after
    const history3 = [
      {
        role: 'system',
        content: 'Tool execution completed: zoom_in executed successfully',
      },
      {
        role: 'system',
        content:
          'Tool execution completed: find_primer_binding_sites executed successfully with parameters: {"sequence":"GCAATAT"}: 1',
      },
    ];
    expect(service.hasViewStateChangedSinceLastExecution('find_primer_binding_sites', history3)).toBe(false);
  });

  it('should terminate after successful primer binding site searches', () => {
    const service = new LLMContextService({}, {});

    const shouldTerminate = service.shouldTerminateAfterToolExecution(
      [{ tool_name: 'find_primer_binding_sites' }],
      [
        {
          tool: 'find_primer_binding_sites',
          result: {
            queryLength: 21,
            sites: [{ start: 24, end: 45, strand: '+', mismatches: 0 }],
          },
        },
      ],
      'Find binding sites for primer GCAATATGTCTCTGTGTGGAT on the current genome.'
    );

    expect(shouldTerminate).toBe(true);
  });

  it('should terminate after successful primer design requests', () => {
    const service = new LLMContextService({}, {});

    const shouldTerminate = service.shouldTerminateAfterToolExecution(
      [{ tool_name: 'design_primers', parameters: { geneName: 'lysC' } }],
      [
        {
          tool: 'design_primers',
          result: {
            forward: { sequence: 'ATGTCTGAAATTGTTGTCTC', tm: 62.1, gcContent: 35, length: 20 },
            reverse: { sequence: 'CAAATCATGCGAATGTTGAA', tm: 62.1, gcContent: 35, length: 20 },
            productSize: 1256,
          },
        },
      ],
      'please design primers to amplify lysC gene'
    );

    expect(shouldTerminate).toBe(true);
  });

  it('should terminate after successful simple pan requests', () => {
    const service = new LLMContextService({}, {});

    const shouldTerminate = service.shouldTerminateAfterToolExecution(
      [{ tool_name: 'pan_right' }],
      [
        {
          tool: 'pan_right',
          result: {
            success: true,
            message: 'Panned right',
            newRange: { chromosome: 'U00096', start: 10000, end: 20000 },
          },
        },
      ],
      'pan right'
    );

    expect(shouldTerminate).toBe(true);
  });

  it('should terminate after a successful bare zoom request', () => {
    const service = new LLMContextService({}, {});

    // Regression: "zoom out" was absent from both the single-execution patterns
    // and the task-completing tool list, so a one-word zoom never met the early
    // termination criteria. The model was re-prompted after every successful
    // zoom_out and simply issued it again, zooming the view out once per round
    // until the round limit was reached.
    const zoomResult = {
      success: true,
      factor: 2,
      message: 'Zoomed out by 2x',
      newRange: { chromosome: 'U00096', start: 1, end: 8000, length: 8000, centerPosition: 4000 },
    };

    expect(
      service.shouldTerminateAfterToolExecution(
        [{ tool_name: 'zoom_out', parameters: { factor: 2 } }],
        [{ tool: 'zoom_out', result: zoomResult }],
        'zoom out'
      )
    ).toBe(true);

    expect(
      service.shouldTerminateAfterToolExecution(
        [{ tool_name: 'zoom_in', parameters: { factor: 2 } }],
        [{ tool: 'zoom_in', result: { ...zoomResult, message: 'Zoomed in by 2x' } }],
        'zoom in'
      )
    ).toBe(true);
  });

  it('treats a zoom "Nx" as a magnification, not as N sequential zooms', () => {
    const service = new LLMContextService({}, {});

    // "zoom out 4x" is one zoom_out(factor: 4), so it must still terminate early.
    expect(
      service.shouldTerminateAfterToolExecution(
        [{ tool_name: 'zoom_out', parameters: { factor: 4 } }],
        [
          {
            tool: 'zoom_out',
            result: {
              success: true,
              factor: 4,
              message: 'Zoomed out by 4x',
              newRange: { chromosome: 'U00096', start: 1, end: 16000, length: 16000, centerPosition: 8000 },
            },
          },
        ],
        'zoom out 4x'
      )
    ).toBe(true);

    expect(service.messageHasMultiStepIntent('zoom out 4x')).toBe(false);
    expect(service.messageHasMultiStepIntent('zoom in 10x')).toBe(false);
    expect(service.messageHasMultiStepIntent('zoom out by 4x')).toBe(false);

    // Spelled-out repetition and non-zoom multipliers remain multi-step requests.
    expect(service.messageHasMultiStepIntent('zoom out 3 times')).toBe(true);
    expect(service.messageHasMultiStepIntent('pan right 3x')).toBe(true);
    expect(service.messageHasMultiStepIntent('navigate to lacZ and then zoom in 10x')).toBe(true);
  });

  it('should NOT terminate early when the message chains a follow-up action ("and then")', () => {
    const service = new LLMContextService({}, {});

    // Regression: "Navigate ... and then zoom in 10x" matches the loose
    // "navigate to" single-execution pattern, but the user clearly requested a
    // second step. Early termination after navigate would drop the zoom_in.
    const shouldTerminate = service.shouldTerminateAfterToolExecution(
      [{ tool_name: 'navigate_to_position', parameters: { start: 1230000, end: 1300000 } }],
      [
        {
          tool: 'navigate_to_position',
          result: {
            success: true,
            chromosome: 'U00096',
            start: 1230000,
            end: 1300000,
            message: 'Navigated to U00096:1230000-1300000',
          },
        },
      ],
      'Navigate to region 1230000 to 1300000 and then zoom in 10x to see the features.'
    );

    expect(shouldTerminate).toBe(false);
  });

  it('detects multi-step intent from common sequencing cues', () => {
    const service = new LLMContextService({}, {});

    expect(service.messageHasMultiStepIntent('navigate to gene lacZ and then zoom in')).toBe(true);
    expect(service.messageHasMultiStepIntent('go to position 5000, then pan right')).toBe(true);
    expect(service.messageHasMultiStepIntent('load genome; show genes')).toBe(true);
    expect(service.messageHasMultiStepIntent('navigate to position 1000. after that toggle gc')).toBe(true);

    // Single-action messages must stay eligible for early termination
    expect(service.messageHasMultiStepIntent('navigate to position 1230000-1300000')).toBe(false);
    expect(service.messageHasMultiStepIntent('pan right')).toBe(false);
  });

  it('only completes an explicit gene-selection request after select_gene succeeds', () => {
    const service = new LLMContextService(
      {},
      {
        isGeneSelectionRequest: message => message.startsWith('select lysC gene'),
      }
    );
    const request = 'select lysC gene';

    expect(
      service.shouldTerminateAfterToolExecution(
        [{ tool_name: 'find_gene_by_name', parameters: { name: 'lysC' } }],
        [
          {
            tool: 'find_gene_by_name',
            result: { success: true, genes: [{ name: 'lysC' }] },
          },
        ],
        request
      )
    ).toBe(false);

    expect(
      service.shouldTerminateAfterToolExecution(
        [{ tool_name: 'select_gene', parameters: { geneName: 'lysC' } }],
        [
          {
            tool: 'select_gene',
            result: { success: true, selected: true, gene_info: { name: 'lysC' } },
          },
        ],
        request
      )
    ).toBe(true);

    expect(
      service.shouldTerminateAfterToolExecution(
        [{ tool_name: 'select_gene', parameters: { geneName: 'lysC' } }],
        [{ tool: 'select_gene', result: { success: true, selected: true } }],
        'select lysC gene and tell me what it does'
      )
    ).toBe(false);
  });

  it('detects multi-step intent from enumerated lists and multiple analysis verbs', () => {
    const service = new LLMContextService({}, {});

    // Comma + coordinating conjunction (Oxford-list) enumeration.
    expect(
      service.messageHasMultiStepIntent(
        'calculate sequence statistics for the current genome, perform a genome-wide ' +
          'codon usage analysis, and compute the overall genome gc content.'
      )
    ).toBe(true);
    // Two distinct analysis verbs without a list conjunction.
    expect(service.messageHasMultiStepIntent('calculate sequence statistics, perform codon analysis')).toBe(true);
    expect(service.messageHasMultiStepIntent('calculate the gc content and export the region features')).toBe(true);
    expect(service.messageHasMultiStepIntent('open three tabs')).toBe(true);
    expect(service.messageHasMultiStepIntent('select lysC gene and tell me what it does')).toBe(true);

    // Single analysis verb stays on the fast path even if it repeats.
    expect(service.messageHasMultiStepIntent('analyze codon usage for the genome')).toBe(false);
    expect(service.messageHasMultiStepIntent('calculate the gc content for the current region')).toBe(false);
  });

  it('should NOT terminate early on a compound analysis request that contains a single-execution keyword', () => {
    const service = new LLMContextService({}, {});

    // Regression: the message contains the substring "codon usage analysis"
    // (a single-execution pattern), but it is one of three enumerated steps.
    // Terminating after an exploratory get_genome_info call would drop the
    // remaining analyses and the final summary.
    const shouldTerminate = service.shouldTerminateAfterToolExecution(
      [{ tool_name: 'get_genome_info', parameters: {} }],
      [{ tool: 'get_genome_info', result: { success: true, genomeInfo: { length: 4641652 } } }],
      'Calculate sequence statistics for the current genome, perform a genome-wide ' +
        'codon usage analysis, and compute the overall genome GC content.'
    );

    expect(shouldTerminate).toBe(false);
  });

  it('renders get_genome_info as a readable summary instead of raw JSON', () => {
    const service = new LLMContextService({}, {});

    const response = service.generateSingleToolResponse(
      { tool_name: 'get_genome_info', parameters: {} },
      {
        result: {
          success: true,
          genomeInfo: {
            name: 'Unknown',
            length: 4641652,
            loadedFiles: [{ name: 'ECOLI.gbk', type: 'GenBank' }],
            chromosomes: ['U00096'],
            annotations: { hasData: false, totalFeatures: 0, featureCounts: {} },
            statistics: { chromosomeStats: { U00096: { length: 4641652, gcPercent: 50.79 } } },
          },
        },
      }
    );

    expect(response).toContain('Genome Information');
    expect(response).toContain('4,641,652 bp');
    expect(response).toContain('U00096');
    expect(response).toContain('50.79% GC');
    expect(response).toContain('ECOLI.gbk');
    // Must NOT be a raw JSON dump.
    expect(response).not.toContain('```json');
    expect(response).not.toContain('Full Results');
  });

  it('renders compute_gc as a readable summary instead of raw JSON', () => {
    const service = new LLMContextService({}, {});

    const response = service.generateSingleToolResponse(
      { tool_name: 'compute_gc', parameters: {} },
      { result: { gcContent: 50.79, chromosome: 'U00096', start: 1, end: 4641652, length: 4641652 } }
    );

    expect(response).toContain('GC Content');
    expect(response).toContain('50.79%');
    expect(response).toContain('AT content: 49.21%');
    expect(response).not.toContain('```json');
  });

  it('renders the Dynamic Tool registration listing as a categorized visualization', () => {
    const service = new LLMContextService({}, {});

    const html = service.renderAvailableToolsVisualization({
      success: true,
      tool: 'list_available_tools',
      total_tools: 3,
      categories: {
        navigation: {
          name: 'Navigation & State Management',
          count: 2,
          tools: [
            { name: 'navigate_to_position', description: 'Move the browser to a region' },
            { name: 'zoom_in', description: 'Zoom into the current view' },
          ],
        },
        sequence: {
          name: 'Sequence Analysis',
          count: 1,
          tools: [{ name: 'compute_gc', description: 'Compute GC content' }],
        },
      },
    });

    expect(html).toContain('Available Tools (3)');
    expect(html).toContain('Navigation &amp; State Management'); // HTML-escaped category name
    expect(html).toContain('navigate_to_position');
    expect(html).toContain('Compute GC content'); // descriptions surfaced
    // Readable visualization, not a raw dump.
    expect(html).not.toContain('```');
    expect(html).not.toContain('Object(');
  });

  it('renders the tools visualization from a flat tool list and handles the empty case', () => {
    const service = new LLMContextService({}, {});

    const flat = service.renderAvailableToolsVisualization({ tools: ['alpha_tool', 'beta_tool'] });
    expect(flat).toContain('All Tools');
    expect(flat).toContain('alpha_tool');
    expect(flat).toContain('beta_tool');

    const empty = service.renderAvailableToolsVisualization({ categories: {} });
    expect(empty).toContain('No tools available');
  });

  it('supports a custom title and collapsed categories for the pre-request thinking panel', () => {
    const service = new LLMContextService({}, {});

    const data = {
      total_tools: 1,
      categories: {
        navigation: {
          name: 'Navigation',
          count: 1,
          tools: [{ name: 'navigate_to_position', description: 'Move the browser to a region' }],
        },
      },
    };

    // Default: title is "Available Tools" and categories render expanded.
    const defaultHtml = service.renderAvailableToolsVisualization(data);
    expect(defaultHtml).toContain('Available Tools (1)');
    expect(defaultHtml).toContain('<details style="margin: 6px 0;" open>');

    // Options: custom heading and collapsed categories (no ` open` on the <details>).
    const collapsed = service.renderAvailableToolsVisualization(data, {
      title: 'Registered Tools',
      categoriesOpen: false,
    });
    expect(collapsed).toContain('Registered Tools (1)');
    expect(collapsed).toContain('<details style="margin: 6px 0;">');
    expect(collapsed).not.toContain('<details style="margin: 6px 0;" open>');
    // The tool itself is still listed even while collapsed.
    expect(collapsed).toContain('navigate_to_position');
  });

  it('should allow idempotent case-insensitive track requests through to the tool implementation', () => {
    const mockChatManager = {
      configManager: {
        get: (key, fallback) => {
          if (key === 'chatboxSettings') return {};
          return fallback;
        },
      },
      parseMultipleToolCalls: () => [],
      getToolExecutionKey: (toolName, parameters) => `${toolName}:${JSON.stringify(parameters)}`,
      getToolExecutionCount: () => 0,
    };
    const service = new LLMContextService({}, mockChatManager);

    const toolUpper = { tool_name: 'toggle_track', parameters: { trackName: 'BLAST', action: 'show' } };
    const toolLower = { tool_name: 'toggle_track', parameters: { trackName: 'blast', action: 'show' } };

    const originalGetElementById = global.document.getElementById;
    const checkedState = true;
    global.document.getElementById = id => {
      if (id === 'trackBlast') {
        return { checked: checkedState };
      }
      return null;
    };

    try {
      const allowedUpper = service.shouldAllowToolExecution(toolUpper, []);
      const allowedLower = service.shouldAllowToolExecution(toolLower, []);

      expect(allowedUpper).toBe(true);
      expect(allowedLower).toBe(true);
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  it('should allow explicit show and hide track requests even when tracks are already in that state', () => {
    const mockChatManager = {
      configManager: {
        get: (key, fallback) => {
          if (key === 'chatboxSettings') return {};
          return fallback;
        },
      },
      parseMultipleToolCalls: () => [],
      getToolExecutionKey: (toolName, parameters) => `${toolName}:${JSON.stringify(parameters)}`,
      getToolExecutionCount: () => 0,
    };
    const service = new LLMContextService({}, mockChatManager);

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = id => {
      if (id === 'trackGC') {
        return { checked: true };
      }
      if (id === 'trackVariants') {
        return { checked: false };
      }
      return null;
    };

    try {
      expect(
        service.shouldAllowToolExecution({ tool_name: 'toggle_track', parameters: { track_name: 'gc', visible: true } })
      ).toBe(true);
      expect(
        service.shouldAllowToolExecution({
          tool_name: 'toggle_track',
          parameters: { track_name: 'variants', visible: false },
        })
      ).toBe(true);
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  it('should support toggle action in LLMContextService policy validation', () => {
    const mockChatManager = {
      configManager: {
        get: (key, fallback) => {
          if (key === 'chatboxSettings') return {};
          return fallback;
        },
      },
      parseMultipleToolCalls: () => [],
      getToolExecutionKey: (toolName, parameters) => `${toolName}:${JSON.stringify(parameters)}`,
      getToolExecutionCount: () => 0,
    };
    const service = new LLMContextService({}, mockChatManager);

    const toolToggle = { tool_name: 'toggle_track', parameters: { trackName: 'genes', action: 'toggle' } };

    const originalGetElementById = global.document.getElementById;
    let checkedState = false;
    global.document.getElementById = id => {
      if (id === 'trackGenes') {
        return { checked: checkedState };
      }
      return null;
    };

    try {
      const allowed = service.shouldAllowToolExecution(toolToggle, []);
      expect(allowed).toBe(true);

      checkedState = true;
      const allowed2 = service.shouldAllowToolExecution(toolToggle, []);
      expect(allowed2).toBe(true);
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });
});
