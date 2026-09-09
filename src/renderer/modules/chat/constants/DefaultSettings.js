/**
 * DefaultSettings - Default configuration values used by ChatManager
 * Extracted from constructor and updateSettingsFromManager().
 */

// eslint-disable-next-line no-unused-vars
const DEFAULT_CHAT_SETTINGS = {
  // Display flags
  showThinkingProcess: true,
  showToolCalls: true,
  showToolCallSource: true,
  showDetailedToolData: true,
  detailedLogging: true,
  hideThinkingAfterConversation: false,
  autoScrollToBottom: true,
  showTimestamps: false,

  // Limits
  maxHistoryMessages: 1000,
  responseTimeout: 30000,

  // Context mode
  contextModeEnabled: true,

  // System Prompt Configuration
  customSystemPrompt: '', // Custom system prompt (empty = use default)
  systemPromptIncludeSystemInstructions: true,
  systemPromptIncludeCurrentContext: true,
  systemPromptIncludeDynamicTools: true,
  systemPromptIncludeToolExamples: true,
  systemPromptIncludeToolGuidelines: true,
  systemPromptIncludeResponseFormat: true,
  systemPromptIncludeToolCategories: true,
  systemPromptIncludeMemoryContext: true,
  enableExecutionGraphScheduler: false,
  systemPromptSectionOrder: [
    'systemInstructions',
    'currentContext',
    'dynamicTools',
    'toolExamples',
    'toolGuidelines',
    'responseFormat',
    'toolCategories',
    'memoryContext',
  ],
};

// eslint-disable-next-line no-unused-vars
const DEFAULT_AGENT_SETTINGS = {
  enabled: false,
  autoOptimize: true,
  showAgentInfo: true,
  memoryEnabled: true,
  cacheEnabled: true,

  // Agent LLM settings
  llmProvider: 'auto',
  llmModel: 'auto',
  llmTemperature: 0.7,
  llmMaxTokens: 4000,
  llmTimeout: 30000,
  llmRetryAttempts: 3,
  llmUseSystemPrompt: true,
  llmEnableFunctionCalling: true,
};
