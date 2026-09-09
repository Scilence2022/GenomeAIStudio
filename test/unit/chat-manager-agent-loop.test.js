/**
 * Behavioural coverage for the ChatManager round loop, driven through the real
 * `sendToLLM()` against a scripted provider (see test/helpers/agent-loop-harness.js).
 *
 * These assert on what the loop does — which tools run, what the next round
 * actually receives, how a turn terminates — rather than on how the source is
 * written.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createAgentLoopHarness, openAiToolCall, openAiToolCalls } = require('../helpers/agent-loop-harness.js');

describe('agent loop', () => {
  describe('basic round-tripping', () => {
    it('executes a native tool call and feeds the result into the next round', async () => {
      const harness = createAgentLoopHarness({
        responses: [openAiToolCall('jump_to_gene', { geneName: 'lysC' }), 'Moved the view to lysC.'],
        tools: { jump_to_gene: () => ({ success: true, position: '1234-5678' }) },
      });

      const answer = await harness.send('jump to the lysC gene');

      expect(harness.toolCalls).toEqual([{ tool_name: 'jump_to_gene', parameters: { geneName: 'lysC' } }]);
      expect(harness.rounds).toBe(2);
      expect(answer).toBe('Moved the view to lysC.');
    });

    it('records gateway executions on the request-local turn context and preserves the next transcript', async () => {
      const harness = createAgentLoopHarness({
        useExecutionGateway: true,
        responses: [openAiToolCall('jump_to_gene', { geneName: 'lysC' }, { id: 'call_ledger' }), 'Done.'],
        tools: { jump_to_gene: () => ({ success: true, position: '10-20' }) },
      });

      await harness.send('jump to lysC');

      expect(harness.chatManager.lastExecutionData.turnContext.executionLedger).toHaveLength(1);
      expect(harness.chatManager.lastExecutionData.turnContext.executionLedger[0]).toMatchObject({
        status: 'succeeded',
        tool: 'jump_to_gene',
        nodeId: 'call_ledger',
      });
      expect(harness.requests[1].some(message => message.role === 'tool')).toBe(true);
      expect(harness.requests[1].find(message => message.role === 'tool').content).toContain('10-20');
    });

    it('maps queued and failed gateway results back to legacy toolResults', async () => {
      const manager = Object.create(require('../../src/renderer/modules/ChatManager.js').prototype);
      manager.throwIfConversationAborted = () => {};
      manager.cloneToolParameters = parameters => ({ ...parameters });
      manager.resolveToolParameterReferences = parameters => parameters;
      const results = [
        {
          executionId: 'queued-exec',
          nodeId: 'queued-call',
          status: 'queued',
          value: { jobId: 'job-1' },
          jobId: 'job-1',
        },
        {
          executionId: 'failed-exec',
          nodeId: 'failed-call',
          status: 'failed',
          value: null,
          error: { message: 'nope' },
        },
      ];
      manager.executeToolByName = async (_name, _parameters, options) => {
        expect(options.gatewayLegacyResult).toBe(true);
        return results.shift();
      };

      const queue = [
        { tool_name: 'first_tool', tool_call_id: 'queued-call', parameters: {} },
        { tool_name: 'second_tool', tool_call_id: 'failed-call', parameters: {} },
      ];
      const toolResults = await manager.executePendingToolExecutionQueue(queue, [], {
        turnContext: { source: 'chat' },
      });

      expect(toolResults).toMatchObject([
        { tool: 'first_tool', success: true, result: { jobId: 'job-1' } },
        { tool: 'second_tool', success: false, result: null, error: 'nope' },
      ]);
    });

    it('answers a conversational question without any tool round', async () => {
      const harness = createAgentLoopHarness({
        responses: ['lysC encodes aspartokinase III.'],
      });

      const answer = await harness.send('What is lysC?');

      expect(harness.toolCalls).toEqual([]);
      expect(harness.rounds).toBe(1);
      expect(answer).toBe('lysC encodes aspartokinase III.');
    });

    it('runs several tool calls from one response in order', async () => {
      const harness = createAgentLoopHarness({
        responses: [
          openAiToolCalls([
            { name: 'jump_to_gene', parameters: { geneName: 'lysC' } },
            { name: 'zoom_in', parameters: {} },
          ]),
          'Both steps are done.',
        ],
        tools: { jump_to_gene: () => ({ success: true }), zoom_in: () => ({ success: true }) },
      });

      await harness.send('jump to lysC and zoom in');

      expect(harness.toolCalls.map(call => call.tool_name)).toEqual(['jump_to_gene', 'zoom_in']);
    });
  });

  describe('failure handling', () => {
    it('reports a non-retryable failure instead of looping on it', async () => {
      const harness = createAgentLoopHarness({
        responses: [
          openAiToolCall('jump_to_gene', { geneName: 'nope' }),
          openAiToolCall('jump_to_gene', { geneName: 'nope2' }),
          openAiToolCall('jump_to_gene', { geneName: 'nope3' }),
        ],
        tools: { jump_to_gene: () => ({ success: false, error: 'gene not found' }) },
      });

      const answer = await harness.send('jump to the nope gene');

      expect(answer).toContain('Tool Execution Failed');
      // One corrective round is allowed; the third attempt must not happen.
      expect(harness.toolCalls.length).toBeLessThanOrEqual(2);
    });

    it('surfaces a thrown tool error to the model before giving up', async () => {
      const harness = createAgentLoopHarness({
        responses: [
          openAiToolCall('jump_to_gene', { geneName: 'boom' }),
          openAiToolCall('jump_to_gene', { geneName: 'boom' }),
        ],
        tools: {
          jump_to_gene: () => {
            throw new Error('renderer offline');
          },
        },
      });

      await harness.send('jump to the boom gene');

      const feedback = harness.lastRequest.map(message => String(message.content ?? '')).join('\n');
      expect(feedback).toContain('renderer offline');
    });
  });

  describe('round budget', () => {
    it('stops at the configured round limit with a deterministic answer', async () => {
      const harness = createAgentLoopHarness({
        config: { 'llm.functionCallRounds': 3 },
        responses: Array.from({ length: 6 }, (_, index) =>
          openAiToolCall('search_features', { query: `q${index}` }, { id: `call_${index}` })
        ),
        tools: { search_features: () => ({ success: true, features: [] }) },
      });

      const answer = await harness.send('search for every feature and then summarise them');

      expect(harness.rounds).toBeLessThanOrEqual(3);
      expect(answer).toBeTruthy();
    });
  });

  describe('abort', () => {
    it('hands the provider an abort signal it can act on', async () => {
      const harness = createAgentLoopHarness({ responses: ['done'] });

      await harness.send('hello');

      expect(harness.lastOptions.signal).toBeInstanceOf(AbortSignal);
    });

    it('propagates an AbortError instead of returning an "Unexpected Error" answer', async () => {
      const harness = createAgentLoopHarness({
        responses: [
          () => {
            harness.abort();
            return 'this response arrives after the user pressed stop';
          },
        ],
      });

      await expect(harness.send('jump to lysC')).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('does not start another round after the user aborts', async () => {
      const harness = createAgentLoopHarness({
        responses: [
          ({ harness: self }) => {
            self.abort();
            return openAiToolCall('jump_to_gene', { geneName: 'lysC' });
          },
          openAiToolCall('zoom_in', {}),
        ],
        tools: { jump_to_gene: () => ({ success: true }), zoom_in: () => ({ success: true }) },
      });

      await expect(harness.send('jump to lysC then zoom in')).rejects.toMatchObject({ name: 'AbortError' });

      expect(harness.rounds).toBe(1);
      expect(harness.toolCalls).toEqual([]);
    });

    it('stops even though endConversation() already cleared the controller', async () => {
      // abortCurrentConversation() tears the conversation state down immediately
      // so the UI unlocks; the in-flight loop must still observe the abort.
      const harness = createAgentLoopHarness({
        responses: [
          ({ harness: self }) => {
            self.chatManager.abortCurrentConversation();
            expect(self.chatManager.conversationState.abortController).toBeNull();
            return 'late response';
          },
          'second round must never run',
        ],
      });

      await expect(harness.send('do something')).rejects.toMatchObject({ name: 'AbortError' });
      expect(harness.rounds).toBe(1);
    });
  });

  describe('duplicate suppression', () => {
    it('does not run the same call with the same parameters twice', async () => {
      const harness = createAgentLoopHarness({
        responses: [
          openAiToolCall('jump_to_gene', { geneName: 'lysC' }, { id: 'a' }),
          openAiToolCall('jump_to_gene', { geneName: 'lysC' }, { id: 'b' }),
          'Already there.',
        ],
        tools: { jump_to_gene: () => ({ success: true }) },
      });

      await harness.send('jump to lysC');

      expect(harness.toolCalls.length).toBe(1);
    });
  });
});
