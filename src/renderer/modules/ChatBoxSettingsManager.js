/**
 * ChatBox Settings Manager
 * Handles all ChatBox-related configuration and settings
 */
class ChatBoxSettingsManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.settings = {
      // Display settings
      showThinkingProcess: true,
      showAvailableTools: true, // Show available tools (Dynamic Tool registry) before the first LLM round
      showToolCalls: true,
      showToolCallSource: true, // Show tool call source
      showDetailedToolData: true, // Show detailed tool data
      hideThinkingAfterConversation: false,
      preserveThinkingHistory: true, // Preserve thinking history
      activityDetailLevel: 'compact', // 'compact' | 'detailed' — how much of the activity panel is rendered
      activityAutoCollapse: true, // Collapse the activity panel to its summary line once a request finishes

      // Behavior settings
      autoScrollToBottom: true,
      showTimestamps: false,
      enableStreaming: true, // Render LLM tokens as they arrive instead of after the full response

      // History settings
      maxHistoryMessages: 1000,
      enableHistorySearch: true,

      // Performance settings
      responseTimeout: 30000, // 30 seconds
      typingIndicatorDelay: 500,

      // UI settings
      animateThinking: true,
      compactMode: false,
      fontSize: 'medium', // small, medium, large
      theme: 'auto', // auto, light, dark

      // Advanced settings
      debugMode: false,
      logToolCalls: false,
      enableAbortButton: true,
      useOptimizedPrompt: true, // Use optimized system prompt
      enableDynamicToolsRegistry: true, // Enable Dynamic Tools Registry
      limitDynamicToolsSelection: true, // Bound the candidate set for small-model reliability
      dynamicToolsSelectionLimit: 24, // High-recall default for automatic workflows
      enableNativeFunctionCalling: true,
      enableConstrainedToolOutput: true,
      enableExecutionGraphScheduler: false,

      // Tool priority settings
      toolPriority: ['local', 'genomics', 'plugins', 'mcp'], // Tool priority order

      // Window settings
      rememberPosition: true,
      rememberSize: true,
      startMinimized: false,

      // Multi-Agent System settings
      agentSystemEnabled: false,
      agentAutoOptimize: true,
      agentShowInfo: true,
      agentMemoryEnabled: true,
      agentCacheEnabled: true,

      // Memory System settings
      memorySystemEnabled: true,
      memoryCacheEnabled: true,
      memoryOptimizationEnabled: true,
      memoryCleanupInterval: 300000, // 5 minutes
      memoryMaxEntries: 10000,

      // Multi-Agent LLM settings
      agentLLMProvider: 'auto', // auto, openai, anthropic, google, local
      agentLLMModel: 'auto', // auto or specific model
      agentLLMTemperature: 0.7,
      agentLLMMaxTokens: 4000,
      agentLLMTimeout: 30000,
      agentLLMRetryAttempts: 3,
      agentLLMUseSystemPrompt: true,
      agentLLMEnableFunctionCalling: true,

      // Function Call Settings
      functionCallRounds: 10,
      enableEarlyCompletion: true,
      completionThreshold: 0.7,
      maxSameToolDifferentParams: 3, // Default limit for different parameters
      maxSameToolIdenticalParams: 2, // Default limit for identical parameters
      enableRepeatedOpenNewTab: true,
      maxRepeatedOpenNewTabCalls: 20,

      // ChatBox model selection overrides
      chatboxModelType: 'auto',
      chatboxLLMProvider: 'auto', // Specific provider override
      chatboxLLMModel: 'auto', // Specific model override
      // Low by default: nearly every ChatBox request carries native tool schemas,
      // and the model's job is tool selection plus schema-exact argument
      // extraction, not prose. Raise it here for a chattier assistant.
      chatboxLLMTemperature: 0.3,
      chatboxLLMMaxTokens: 4000,
      chatboxLLMTimeout: 30,
      chatboxLLMUseSystemPrompt: true,
      chatboxLLMEnableFunctionCalling: true,

      // System Prompt Configuration
      customSystemPrompt: '', // Custom system prompt text (empty = use default)
      systemPromptIncludeSystemInstructions: true, // Core identity & behavior definition
      systemPromptIncludeCurrentContext: true, // CodeXomics current state (chromosome, position, etc.)
      systemPromptIncludeDynamicTools: true, // Dynamic tool loading based on query
      systemPromptIncludeToolExamples: true, // Tool usage examples
      systemPromptIncludeToolGuidelines: true, // Tool selection guidelines
      systemPromptIncludeResponseFormat: true, // Response format instructions
      systemPromptIncludeToolCategories: true, // Tool categories & relationships
      systemPromptIncludeMemoryContext: true, // Memory context from memory system
      systemPromptSectionOrder: [
        // Order of prompt sections
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

    // Async initialization - store the promise so callers can await it
    this._initPromise = this.loadSettings();
    this.setupEventListeners();
  }

  /**
   * Load settings from config manager
   */
  async loadSettings() {
    // Wait for ConfigManager to finish initializing before reading settings
    if (this.configManager && this.configManager.waitForInit) {
      await this.configManager.waitForInit();
    }

    const savedSettings = this.configManager.get('chatboxSettings', {});
    this.settings = { ...this.settings, ...savedSettings };
    this.settings.enableRepeatedOpenNewTab = this.settings.enableRepeatedOpenNewTab !== false;
    const repeatedTabLimit = Number(this.settings.maxRepeatedOpenNewTabCalls);
    this.settings.maxRepeatedOpenNewTabCalls = Number.isFinite(repeatedTabLimit)
      ? Math.max(1, Math.min(Math.trunc(repeatedTabLimit), 20))
      : 20;

    // Backward compatibility: migrate llm.systemPrompt to chatboxSettings.customSystemPrompt
    if (!this.settings.customSystemPrompt) {
      const legacyPrompt = this.configManager.get('llm.systemPrompt', '');
      if (legacyPrompt) {
        this.settings.customSystemPrompt = legacyPrompt;
        console.log('📦 Migrated system prompt from llm.systemPrompt to chatboxSettings.customSystemPrompt');
      }
    }

    // Sync Function Call Settings from the main LLM configuration
    const llmFunctionCallRounds = this.configManager.get('llm.functionCallRounds');
    const llmEnableEarlyCompletion = this.configManager.get('llm.enableEarlyCompletion');
    const llmCompletionThreshold = this.configManager.get('llm.completionThreshold');
    const llmMaxDiffParams = this.configManager.get('llm.maxSameToolDifferentParams');
    const llmMaxIdentParams = this.configManager.get('llm.maxSameToolIdenticalParams');

    if (llmFunctionCallRounds !== undefined) {
      this.settings.functionCallRounds = llmFunctionCallRounds;
    }
    if (llmEnableEarlyCompletion !== undefined) {
      this.settings.enableEarlyCompletion = llmEnableEarlyCompletion;
    }
    if (llmCompletionThreshold !== undefined) {
      this.settings.completionThreshold = llmCompletionThreshold;
    }
    if (llmMaxDiffParams !== undefined) {
      this.settings.maxSameToolDifferentParams = llmMaxDiffParams;
    }
    if (llmMaxIdentParams !== undefined) {
      this.settings.maxSameToolIdenticalParams = llmMaxIdentParams;
    }

    console.log('🔧 ChatBox settings loaded:', this.settings);
    console.log('🔄 Synced Function Call Settings from LLM config');
  }

  /**
   * Save settings to config manager
   */
  async saveSettings() {
    await this.configManager.set('chatboxSettings', this.settings);

    // Sync Function Call Settings to the main LLM configuration
    if (Object.prototype.hasOwnProperty.call(this.settings, 'functionCallRounds')) {
      await this.configManager.set('llm.functionCallRounds', this.settings.functionCallRounds);
    }
    if (Object.prototype.hasOwnProperty.call(this.settings, 'enableEarlyCompletion')) {
      await this.configManager.set('llm.enableEarlyCompletion', this.settings.enableEarlyCompletion);
    }
    if (Object.prototype.hasOwnProperty.call(this.settings, 'completionThreshold')) {
      await this.configManager.set('llm.completionThreshold', this.settings.completionThreshold);
    }
    if (Object.prototype.hasOwnProperty.call(this.settings, 'maxSameToolDifferentParams')) {
      await this.configManager.set('llm.maxSameToolDifferentParams', this.settings.maxSameToolDifferentParams);
    }
    if (Object.prototype.hasOwnProperty.call(this.settings, 'maxSameToolIdenticalParams')) {
      await this.configManager.set('llm.maxSameToolIdenticalParams', this.settings.maxSameToolIdenticalParams);
    }

    console.log('💾 ChatBox settings saved:', this.settings);
    console.log('🔄 Synced Function Call Settings to LLM config');
    console.log('📊 Current LLM functionCallRounds:', this.configManager.get('llm.functionCallRounds'));

    // Emit settings changed event
    this.emit('settingsChanged', this.settings);
  }

  /**
   * Get a specific setting
   */
  getSetting(key, defaultValue = null) {
    return Object.prototype.hasOwnProperty.call(this.settings, key) ? this.settings[key] : defaultValue;
  }

  /**
   * Set a specific setting
   */
  async setSetting(key, value) {
    if (Object.prototype.hasOwnProperty.call(this.settings, key)) {
      this.settings[key] = value;
      await this.saveSettings();
      return true;
    }
    console.warn('⚠️ Unknown ChatBox setting:', key);
    return false;
  }

  /**
   * Update multiple settings at once
   */
  async updateSettings(newSettings) {
    let hasChanges = false;

    for (const [key, value] of Object.entries(newSettings)) {
      if (Object.prototype.hasOwnProperty.call(this.settings, key) && this.settings[key] !== value) {
        this.settings[key] = value;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await this.saveSettings();
    }

    return hasChanges;
  }

  /**
   * Reset settings to default values
   */
  async resetToDefaults() {
    const defaultSettings = {
      // Display settings
      showThinkingProcess: true,
      showAvailableTools: true,
      showToolCalls: true,
      showToolCallSource: true,
      showDetailedToolData: true,
      hideThinkingAfterConversation: false,
      preserveThinkingHistory: true,
      activityDetailLevel: 'compact',
      activityAutoCollapse: true,

      // Behavior settings
      autoScrollToBottom: true,
      showTimestamps: false,
      enableStreaming: true, // Render LLM tokens as they arrive instead of after the full response

      // History settings
      maxHistoryMessages: 1000,
      enableHistorySearch: true,

      // Performance settings
      responseTimeout: 30000,
      typingIndicatorDelay: 500,

      // UI settings
      animateThinking: true,
      compactMode: false,
      fontSize: 'medium',
      theme: 'auto',

      // Advanced settings
      debugMode: false,
      logToolCalls: false,
      enableAbortButton: true,
      useOptimizedPrompt: true,
      enableDynamicToolsRegistry: true,
      limitDynamicToolsSelection: true,
      dynamicToolsSelectionLimit: 24,
      enableNativeFunctionCalling: true,
      enableConstrainedToolOutput: true,
      enableExecutionGraphScheduler: false,

      // Tool priority settings
      toolPriority: ['local', 'genomics', 'plugins', 'mcp'],

      // Window settings
      rememberPosition: true,
      rememberSize: true,
      startMinimized: false,

      // Multi-Agent System settings
      agentSystemEnabled: false,
      agentAutoOptimize: true,
      agentShowInfo: true,
      agentMemoryEnabled: true,
      agentCacheEnabled: true,

      // Memory System settings
      memorySystemEnabled: true,
      memoryCacheEnabled: true,
      memoryOptimizationEnabled: true,
      memoryCleanupInterval: 300000,
      memoryMaxEntries: 10000,

      // Multi-Agent LLM settings
      agentLLMProvider: 'auto',
      agentLLMModel: 'auto',
      agentLLMTemperature: 0.7,
      agentLLMMaxTokens: 4000,
      agentLLMTimeout: 30000,
      agentLLMRetryAttempts: 3,
      agentLLMUseSystemPrompt: true,
      agentLLMEnableFunctionCalling: true,

      // Function Call Settings
      functionCallRounds: 10,
      enableEarlyCompletion: true,
      completionThreshold: 0.7,
      maxSameToolDifferentParams: 3,
      maxSameToolIdenticalParams: 2,
      enableRepeatedOpenNewTab: true,
      maxRepeatedOpenNewTabCalls: 20,

      // ChatBox model selection overrides
      chatboxModelType: 'auto',
      chatboxLLMProvider: 'auto',
      chatboxLLMModel: 'auto',
      // Low by default: nearly every ChatBox request carries native tool schemas,
      // and the model's job is tool selection plus schema-exact argument
      // extraction, not prose. Raise it here for a chattier assistant.
      chatboxLLMTemperature: 0.3,
      chatboxLLMMaxTokens: 4000,
      chatboxLLMTimeout: 30,
      chatboxLLMUseSystemPrompt: true,
      chatboxLLMEnableFunctionCalling: true,

      // System Prompt Configuration
      customSystemPrompt: '',
      systemPromptIncludeSystemInstructions: true,
      systemPromptIncludeCurrentContext: true,
      systemPromptIncludeDynamicTools: true,
      systemPromptIncludeToolExamples: true,
      systemPromptIncludeToolGuidelines: true,
      systemPromptIncludeResponseFormat: true,
      systemPromptIncludeToolCategories: true,
      systemPromptIncludeMemoryContext: true,
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

    this.settings = { ...defaultSettings };
    await this.saveSettings();

    // Reset Welcome Examples to default too
    if (window.welcomeExamplesManager) {
      window.welcomeExamplesManager.resetToDefaults();
    }

    console.log('🔄 ChatBox settings reset to defaults');
  }

  /**
   * Get all settings
   */
  getAllSettings() {
    return { ...this.settings };
  }

  /**
   * Validate settings
   */
  validateSettings() {
    const errors = [];

    // Validate numeric settings
    if (typeof this.settings.maxHistoryMessages !== 'number' || this.settings.maxHistoryMessages < 1) {
      errors.push('maxHistoryMessages must be a positive number');
    }

    if (typeof this.settings.responseTimeout !== 'number' || this.settings.responseTimeout < 1000) {
      errors.push('responseTimeout must be at least 1000ms');
    }

    if (typeof this.settings.typingIndicatorDelay !== 'number' || this.settings.typingIndicatorDelay < 0) {
      errors.push('typingIndicatorDelay must be a non-negative number');
    }

    if (
      typeof this.settings.dynamicToolsSelectionLimit !== 'number' ||
      !Number.isFinite(this.settings.dynamicToolsSelectionLimit) ||
      this.settings.dynamicToolsSelectionLimit < 1 ||
      this.settings.dynamicToolsSelectionLimit > 500
    ) {
      errors.push('dynamicToolsSelectionLimit must be between 1 and 500');
    }

    if (
      typeof this.settings.maxRepeatedOpenNewTabCalls !== 'number' ||
      !Number.isInteger(this.settings.maxRepeatedOpenNewTabCalls) ||
      this.settings.maxRepeatedOpenNewTabCalls < 1 ||
      this.settings.maxRepeatedOpenNewTabCalls > 20
    ) {
      errors.push('maxRepeatedOpenNewTabCalls must be an integer between 1 and 20');
    }

    // Validate enum settings
    const validFontSizes = ['small', 'medium', 'large'];
    if (!validFontSizes.includes(this.settings.fontSize)) {
      errors.push('fontSize must be one of: ' + validFontSizes.join(', '));
    }

    const validThemes = ['auto', 'light', 'dark'];
    if (!validThemes.includes(this.settings.theme)) {
      errors.push('theme must be one of: ' + validThemes.join(', '));
    }

    const validActivityDetailLevels = ['compact', 'detailed'];
    if (!validActivityDetailLevels.includes(this.settings.activityDetailLevel)) {
      errors.push('activityDetailLevel must be one of: ' + validActivityDetailLevels.join(', '));
    }

    return errors;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen for settings UI events
    if (typeof window !== 'undefined') {
      window.addEventListener('chatbox-setting-changed', event => {
        const { key, value } = event.detail;
        this.setSetting(key, value);
      });
    }
  }

  /**
   * Get current main model configuration from LLM Config Manager
   */
  getCurrentMainModelConfig() {
    if (window.llmConfigManager && window.llmConfigManager.modelTypes && window.llmConfigManager.modelTypes.main) {
      const mainConfig = window.llmConfigManager.modelTypes.main;
      const provider = window.llmConfigManager.providers[mainConfig.provider];

      if (provider && provider.enabled) {
        return {
          provider: mainConfig.provider,
          model: mainConfig.model === 'auto' ? provider.model : mainConfig.model,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          enabled: true,
        };
      }
    }

    // Fallback to first enabled provider
    if (window.llmConfigManager && window.llmConfigManager.providers) {
      for (const [providerName, provider] of Object.entries(window.llmConfigManager.providers)) {
        if (provider.enabled) {
          return {
            provider: providerName,
            model: provider.model,
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl,
            enabled: true,
          };
        }
      }
    }

    return null;
  }

  /**
   * Simple event emitter functionality
   */
  emit(eventName, data) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`chatbox-${eventName}`, { detail: data }));
    }
  }

  /**
   * Show settings modal
   */
  showSettingsModal() {
    // Create settings modal if it doesn't exist
    let modal = document.getElementById('chatboxSettingsModal');
    if (!modal) {
      modal = this.createSettingsModal();
      document.body.appendChild(modal);
    }

    // Add reset to defaults button handler
    const resetDefaultsBtn = modal.querySelector('.reset-defaults-btn');
    if (resetDefaultsBtn) {
      resetDefaultsBtn.addEventListener('click', async () => {
        await this.resetToDefaults();
        this.populateSettingsForm(modal);
      });
    }

    // Add reset position button handler
    const resetPositionBtn = modal.querySelector('.reset-position-btn');
    if (resetPositionBtn) {
      resetPositionBtn.addEventListener('click', () => {
        if (window.modalDragManager) {
          window.modalDragManager.resetPosition('#chatboxSettingsModal');
        }
      });
    }

    // Populate current settings
    this.populateSettingsForm(modal);

    // Reset any drag inline styles so the modal re-centers on open
    if (window.modalDragManager) {
      window.modalDragManager.resetPosition('#chatboxSettingsModal');
    }

    // Initialize draggable BEFORE showing the modal so that the 'large' size class
    // is applied before the first render, preventing a layout flash.
    if (window.modalDragManager) {
      window.modalDragManager.makeDraggable('#chatboxSettingsModal');
    }

    // Show modal (centered via CSS flex)
    modal.classList.add('show');

    // Initialize resizable after showing so getBoundingClientRect returns correct dimensions
    if (window.resizableModalManager) {
      window.resizableModalManager.makeResizable('#chatboxSettingsModal');
    }

    // Focus first input
    const firstInput = modal.querySelector('input, select');
    if (firstInput) {
      firstInput.focus();
    }
  }

  /**
   * Create settings modal HTML
   */
  createSettingsModal() {
    const modal = document.createElement('div');
    modal.id = 'chatboxSettingsModal';
    modal.className = 'modal';

    modal.innerHTML = `
            <div class="modal-content resizable llm-config-modal" style="max-width: 800px;">
                <div class="modal-header">
                    <h3><i class="fas fa-comments"></i> ChatBox Settings</h3>
                    <div class="modal-controls">
                        <button class="reset-position-btn" title="Reset Position">
                            <i class="fas fa-crosshairs"></i>
                        </button>
                        <button class="reset-defaults-btn" title="Reset to Defaults">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button class="modal-close" onclick="this.closest('.modal').style.display='none'; this.closest('.modal').classList.remove('show');">
                            &times;
                        </button>
                    </div>
                </div>
                
                <div class="modal-body">
                    <div class="llm-provider-tabs">
                        <button class="tab-button active" data-tab="display">
                            <i class="fas fa-eye"></i> Display
                        </button>
                        <button class="tab-button" data-tab="behavior">
                            <i class="fas fa-comments"></i> Chat
                        </button>
                        <button class="tab-button" data-tab="advanced">
                            <i class="fas fa-tools"></i> Advanced
                        </button>
                        <button class="tab-button" data-tab="welcome-examples">
                            <i class="fas fa-list"></i> Examples
                        </button>
                    </div>
                    
                    <div class="llm-provider-config">
                        <!-- Display Tab -->
                        <div id="display-tab" class="tab-content active">
                            <div class="form-section">
                                <h4>Agent Activity</h4>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="showThinkingProcess" class="setting-checkbox">
                                        Show agent activity
                                    </label>
                                    <small class="help-text">Display the agent's rounds, tool calls, and reasoning</small>
                                </div>

                                <div class="form-group">
                                    <label for="activityDetailLevel">Detail level:</label>
                                    <select id="activityDetailLevel" class="select">
                                        <option value="compact">Compact — tool calls and outcomes</option>
                                        <option value="detailed">Detailed — every step</option>
                                    </select>
                                    <small class="help-text">Compact hides transport chatter (sending/receiving, history size, parameter keys). The full trace is still exported either way.</small>
                                </div>

                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="activityAutoCollapse" class="setting-checkbox">
                                        Collapse activity when a request finishes
                                    </label>
                                    <small class="help-text">Leave only the summary line once the run ends; a run with a failed tool stays expanded. Clicking a finished panel's header also updates this setting.</small>
                                </div>

                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="showAvailableTools" class="setting-checkbox">
                                        Show available tools
                                    </label>
                                    <small class="help-text">List the tools from the Dynamic Tool registry in the activity panel before the first LLM round</small>
                                </div>

                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="hideThinkingAfterConversation" class="setting-checkbox">
                                        Remove activity panel after conversation ends
                                    </label>
                                    <small class="help-text">Discard the panel entirely when the conversation completes, rather than collapsing it</small>
                                </div>

                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="preserveThinkingHistory" class="setting-checkbox">
                                        Preserve activity history
                                    </label>
                                    <small class="help-text">Keep activity panels in chat records</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="showToolCalls" class="setting-checkbox">
                                        Show tool calls
                                    </label>
                                    <small class="help-text">Display detailed information about tool execution</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="showToolCallSource" class="setting-checkbox">
                                        Show tool call source
                                    </label>
                                    <small class="help-text">Display the specific source of each tool call (MCP Server or internal function)</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="showDetailedToolData" class="setting-checkbox">
                                        Show detailed tool data
                                    </label>
                                    <small class="help-text">Display detailed data content returned by tool calls</small>
                                </div>
                            </div>
                            
                            <div class="form-section">
                                <h4>Interface</h4>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="showTimestamps" class="setting-checkbox">
                                        Show message timestamps
                                    </label>
                                    <small class="help-text">Display when each message was sent</small>
                                </div>
                                
                                <div class="form-group">
                                    <label for="fontSize">Font size:</label>
                                    <select id="fontSize" class="select">
                                        <option value="small">Small</option>
                                        <option value="medium">Medium</option>
                                        <option value="large">Large</option>
                                    </select>
                                </div>
                                
                                <div class="form-group">
                                    <label for="theme">Theme:</label>
                                    <select id="theme" class="select">
                                        <option value="auto">Auto</option>
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Behavior Tab -->
                        <div id="behavior-tab" class="tab-content">
                            <div class="form-section">
                                <h4>Interaction</h4>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="autoScrollToBottom" class="setting-checkbox">
                                        Auto-scroll to bottom
                                    </label>
                                    <small class="help-text">Automatically scroll to show new messages</small>
                                </div>

                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="enableStreaming" class="setting-checkbox">
                                        Stream responses
                                    </label>
                                    <small class="help-text">Show the AI's reply as it is generated instead of waiting for the full response</small>
                                </div>

                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="enableAbortButton" class="setting-checkbox">
                                        Enable abort button
                                    </label>
                                    <small class="help-text">Show button to stop ongoing conversations</small>
                                </div>
                            </div>
                            
                            <div class="form-section">
                                <h4>History</h4>
                                <div class="form-group">
                                    <label for="maxHistoryMessages">Max history messages:</label>
                                    <input type="number" id="maxHistoryMessages" class="input-full" min="10" max="10000" step="10">
                                    <small class="help-text">Maximum number of messages to keep in history</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="enableHistorySearch" class="setting-checkbox">
                                        Enable history search
                                    </label>
                                    <small class="help-text">Allow searching through chat history</small>
                                </div>
                            </div>
                        </div>
                        
                        
                        
                        
                        <div id="advanced-tab" class="tab-content">
                            <div class="form-section">
                                <h4>Animation & Effects</h4>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="animateThinking" class="setting-checkbox">
                                        Animate thinking process
                                    </label>
                                    <small class="help-text">Show animations for thinking process updates</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="compactMode" class="setting-checkbox">
                                        Compact mode
                                    </label>
                                    <small class="help-text">Use more compact message layout</small>
                                </div>
                            </div>
                            
                            <div class="form-section">
                                <h4>Window Management</h4>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="rememberPosition" class="setting-checkbox">
                                        Remember window position
                                    </label>
                                    <small class="help-text">Save and restore chat window position</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="rememberSize" class="setting-checkbox">
                                        Remember window size
                                    </label>
                                    <small class="help-text">Save and restore chat window size</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="startMinimized" class="setting-checkbox">
                                        Start minimized
                                    </label>
                                    <small class="help-text">Start chat window in minimized state</small>
                                </div>
                            </div>
                            
                            <div class="form-section">
                                <h4>Tool Selection Priority</h4>
                                <div class="form-group">
                                    <label>Configure tool selection priority order:</label>
                                    <div id="toolPriorityContainer" class="priority-container">
                                        <div class="priority-item" data-type="builtIn" draggable="true">
                                            <div class="priority-drag-handle">⋮⋮</div>
                                            <div class="priority-info">
                                                <span class="priority-label">Built-in Tools</span>
                                                <span class="priority-description">Core application features (navigation, file loading)</span>
                                            </div>
                                            <div class="priority-controls">
                                                <button type="button" class="priority-btn up" title="Move up" onclick="movePriorityUp(this)">↑</button>
                                                <button type="button" class="priority-btn down" title="Move down" onclick="movePriorityDown(this)">↓</button>
                                            </div>
                                        </div>
                                        <div class="priority-item" data-type="genomics" draggable="true">
                                            <div class="priority-drag-handle">⋮⋮</div>
                                            <div class="priority-info">
                                                <span class="priority-label">Genomics Tools</span>
                                                <span class="priority-description">Specialized analysis tools</span>
                                            </div>
                                            <div class="priority-controls">
                                                <button type="button" class="priority-btn up" title="Move up" onclick="movePriorityUp(this)">↑</button>
                                                <button type="button" class="priority-btn down" title="Move down" onclick="movePriorityDown(this)">↓</button>
                                            </div>
                                        </div>
                                        <div class="priority-item" data-type="plugins" draggable="true">
                                            <div class="priority-drag-handle">⋮⋮</div>
                                            <div class="priority-info">
                                                <span class="priority-label">Plugin Tools</span>
                                                <span class="priority-description">Third-party extensions</span>
                                            </div>
                                            <div class="priority-controls">
                                                <button type="button" class="priority-btn up" title="Move up" onclick="movePriorityUp(this)">↑</button>
                                                <button type="button" class="priority-btn down" title="Move down" onclick="movePriorityDown(this)">↓</button>
                                            </div>
                                        </div>
                                        <div class="priority-item" data-type="mcp" draggable="true">
                                            <div class="priority-drag-handle">⋮⋮</div>
                                            <div class="priority-info">
                                                <span class="priority-label">MCP Server Tools</span>
                                                <span class="priority-description">External server tools</span>
                                            </div>
                                            <div class="priority-controls">
                                                <button type="button" class="priority-btn up" title="Move up" onclick="movePriorityUp(this)">↑</button>
                                                <button type="button" class="priority-btn down" title="Move down" onclick="movePriorityDown(this)">↓</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="priority-help">
                                        <small class="help-text">
                                            <strong>How it works:</strong> When the AI assistant needs to use tools, it will prefer tools from higher priority categories first. 
                                            You can drag items or use the arrow buttons to reorder the priority.
                                        </small>
                                        <div class="priority-status" id="priorityStatus">
                                            <small>Current order will be applied to conversations</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="form-section">
                                <h4>Debug</h4>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="debugMode" class="setting-checkbox">
                                        Debug mode
                                    </label>
                                    <small class="help-text">Show detailed debug information in console</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="logToolCalls" class="setting-checkbox">
                                        Log tool calls
                                    </label>
                                    <small class="help-text">Log all tool calls to console for debugging</small>
                                </div>
                            </div>
                        </div>

                        <!-- Welcome Examples Tab -->
                        <div id="welcome-examples-tab" class="tab-content">
                            <div class="form-section">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                    <h4 style="margin: 0;">Welcome Screen Example Prompts</h4>
                                    <button type="button" class="btn btn-sm btn-primary" id="addWelcomeCategoryBtn">
                                        <i class="fas fa-plus"></i> Add Category
                                    </button>
                                </div>
                                <p class="help-text" style="margin-top: -10px; margin-bottom: 15px;">
                                    Configure the clickable example cards shown on the initial ChatBox screen.
                                </p>
                                
                                <div id="welcomeExamplesContainer" class="welcome-examples-editor-container" style="max-height: 400px; overflow-y: auto; padding-right: 5px; display: flex; flex-direction: column; gap: 15px;">
                                    <!-- Dynamic categories & prompts will be rendered here -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.chatBoxSettingsManager.resetToDefaults(); window.chatBoxSettingsManager.populateSettingsForm(this.closest('.modal'));">
                        <i class="fas fa-undo"></i> Reset to Defaults
                    </button>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'; this.closest('.modal').classList.remove('show');">
                            Cancel
                        </button>
                        <button class="btn btn-primary" id="chatboxSaveSettingsBtn">
                            <i class="fas fa-save"></i> Save Settings
                        </button>
                    </div>
                </div>
                
                <!-- Resize handles -->
                <div class="resize-handle resize-handle-n"></div>
                <div class="resize-handle resize-handle-s"></div>
                <div class="resize-handle resize-handle-e"></div>
                <div class="resize-handle resize-handle-w"></div>
                <div class="resize-handle resize-handle-ne"></div>
                <div class="resize-handle resize-handle-nw"></div>
                <div class="resize-handle resize-handle-se"></div>
                <div class="resize-handle resize-handle-sw"></div>
            </div>
        `;

    // Add event listeners for tabs
    const tabButtons = modal.querySelectorAll('.tab-button');
    const tabPanels = modal.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;

        // Update active tab button
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Update active tab panel
        tabPanels.forEach(panel => {
          panel.classList.remove('active');
          if (panel.id === `${targetTab}-tab`) {
            panel.classList.add('active');
          }
        });
      });
    });

    // Setup tool priority functionality
    this.setupToolPriorityHandlers(modal);

    // Setup system prompt section handlers
    this.setupSystemPromptSectionHandlers(modal);

    // Setup system prompt custom controls
    this.setupSystemPromptControls(modal);

    // Setup save button handler
    const saveBtn = modal.querySelector('#chatboxSaveSettingsBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        console.log('💾 ChatBox Settings save button clicked');
        await this.saveSettingsFromForm(modal);
      });
    }

    // Setup Add Category button for Welcome Examples
    const addCatBtn = modal.querySelector('#addWelcomeCategoryBtn');
    if (addCatBtn) {
      addCatBtn.addEventListener('click', () => {
        const manager = window.welcomeExamplesManager;
        if (manager) {
          manager.addCategory();
          this.populateWelcomeExamplesForm(modal);

          // Scroll to the bottom of the container to show the new category
          const container = modal.querySelector('#welcomeExamplesContainer');
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }
      });
    }

    return modal;
  }

  /**
   * Setup tool priority handlers
   */
  setupToolPriorityHandlers(modal) {
    const container = modal.querySelector('#toolPriorityContainer');
    if (!container) return;

    // Add global functions for priority buttons
    window.movePriorityUp = button => {
      const item = button.closest('.priority-item');
      const prevItem = item.previousElementSibling;
      if (prevItem) {
        container.insertBefore(item, prevItem);
        this.updatePriorityNumbers(container);
        this.updatePriorityStatus(container);
      }
    };

    window.movePriorityDown = button => {
      const item = button.closest('.priority-item');
      const nextItem = item.nextElementSibling;
      if (nextItem) {
        container.insertBefore(nextItem, item);
        this.updatePriorityNumbers(container);
        this.updatePriorityStatus(container);
      }
    };

    // Add drag and drop functionality
    const items = container.querySelectorAll('.priority-item');
    items.forEach(item => {
      item.draggable = true;

      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', '');
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        this.updatePriorityNumbers(container);
        this.updatePriorityStatus(container);
      });

      item.addEventListener('dragover', e => {
        e.preventDefault();
      });

      item.addEventListener('drop', e => {
        e.preventDefault();
        const draggingItem = container.querySelector('.dragging');
        if (draggingItem && draggingItem !== item) {
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;

          if (e.clientY < midY) {
            container.insertBefore(draggingItem, item);
          } else {
            container.insertBefore(draggingItem, item.nextSibling);
          }
        }
      });
    });
  }

  /**
   * Update priority numbers after reordering
   */
  updatePriorityNumbers(container) {
    const items = container.querySelectorAll('.priority-item');
    items.forEach((item, index) => {
      // Update button states
      const upBtn = item.querySelector('.priority-btn.up');
      const downBtn = item.querySelector('.priority-btn.down');

      if (upBtn) upBtn.disabled = index === 0;
      if (downBtn) downBtn.disabled = index === items.length - 1;
    });
  }

  /**
   * Update priority status display
   */
  updatePriorityStatus(container) {
    const statusElement = document.querySelector('#priorityStatus');
    if (!statusElement) return;

    const items = container.querySelectorAll('.priority-item');
    const priorityList = Array.from(items).map((item, index) => {
      const label = item.querySelector('.priority-label').textContent;
      return `${index + 1}. ${label}`;
    });

    statusElement.innerHTML = `
            <small>
                <strong>Current Order:</strong> ${priorityList.join(' → ')}
            </small>
        `;
  }

  /**
   * Get current tool priority order from UI
   */
  getToolPriorityFromUI(modal) {
    const container = modal.querySelector('#toolPriorityContainer');
    if (!container) return this.settings.toolPriority;

    const items = container.querySelectorAll('.priority-item');
    return Array.from(items).map(item => item.dataset.type);
  }

  /**
   * Set tool priority order in UI
   */
  setToolPriorityInUI(modal, priority) {
    const container = modal.querySelector('#toolPriorityContainer');
    if (!container || !Array.isArray(priority)) return;

    // Reorder items based on priority array
    const items = Array.from(container.querySelectorAll('.priority-item'));
    const orderedItems = [];

    priority.forEach(type => {
      const item = items.find(item => item.dataset.type === type);
      if (item) orderedItems.push(item);
    });

    // Add any missing items at the end
    items.forEach(item => {
      if (!orderedItems.includes(item)) {
        orderedItems.push(item);
      }
    });

    // Clear container and re-add in correct order
    container.innerHTML = '';
    orderedItems.forEach(item => container.appendChild(item));

    this.updatePriorityNumbers(container);
    this.updatePriorityStatus(container);
  }

  /**
   * Setup system prompt section handlers (drag/reorder + toggle)
   */
  setupSystemPromptSectionHandlers(modal) {
    const container = modal.querySelector('#systemPromptSectionContainer');
    if (!container) return;

    // Up/down buttons
    container.addEventListener('click', e => {
      const btn = e.target.closest('.priority-btn');
      if (!btn) return;

      const item = btn.closest('.priority-item');
      if (!item) return;

      if (btn.classList.contains('up')) {
        const prevItem = item.previousElementSibling;
        if (prevItem) {
          container.insertBefore(item, prevItem);
          this.updatePriorityNumbers(container);
          this.updateSystemPromptSectionStatus(container);
        }
      } else if (btn.classList.contains('down')) {
        const nextItem = item.nextElementSibling;
        if (nextItem) {
          container.insertBefore(nextItem, item);
          this.updatePriorityNumbers(container);
          this.updateSystemPromptSectionStatus(container);
        }
      }
    });

    // Drag and drop
    const items = container.querySelectorAll('.priority-item');
    items.forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', '');
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        this.updatePriorityNumbers(container);
        this.updateSystemPromptSectionStatus(container);
      });

      item.addEventListener('dragover', e => {
        e.preventDefault();
      });

      item.addEventListener('drop', e => {
        e.preventDefault();
        const draggingItem = container.querySelector('.dragging');
        if (draggingItem && draggingItem !== item) {
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;

          if (e.clientY < midY) {
            container.insertBefore(draggingItem, item);
          } else {
            container.insertBefore(draggingItem, item.nextSibling);
          }
        }
      });
    });
  }

  /**
   * Update system prompt section status display
   */
  updateSystemPromptSectionStatus(container) {
    const statusElement = document.querySelector('#systemPromptSectionStatus');
    if (!statusElement) return;

    const items = container.querySelectorAll('.priority-item');
    const enabledSections = [];
    const disabledSections = [];

    items.forEach(item => {
      const label = item.querySelector('.priority-label').textContent;
      const toggle = item.querySelector('.section-toggle input');
      if (toggle && toggle.checked) {
        enabledSections.push(label);
      } else {
        disabledSections.push(label);
      }
    });

    let statusHtml = '<small>';
    if (enabledSections.length > 0) {
      statusHtml += `<strong>Enabled:</strong> ${enabledSections.join(' → ')}`;
    }
    if (disabledSections.length > 0) {
      statusHtml += `${enabledSections.length > 0 ? '<br>' : ''}<strong>Disabled:</strong> ${disabledSections.join(', ')}`;
    }
    statusHtml += '</small>';
    statusElement.innerHTML = statusHtml;
  }

  /**
   * Setup system prompt custom controls (reset + preview)
   */
  setupSystemPromptControls(modal) {
    // Reset button
    const resetBtn = modal.querySelector('#resetCustomSystemPrompt');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const textarea = modal.querySelector('#customSystemPrompt');
        if (textarea) {
          textarea.value = '';
          this.showNotification('Custom system prompt cleared', 'success');
        }
      });
    }

    // Preview button
    const previewBtn = modal.querySelector('#previewCustomSystemPrompt');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        this.previewSystemPromptConfiguration(modal);
      });
    }
  }

  /**
   * Preview the current system prompt configuration
   * Generates a real system prompt using a sample query "Search DNA polymerase"
   */
  async previewSystemPromptConfiguration(modal) {
    const textarea = modal.querySelector('#customSystemPrompt');
    const customPrompt = textarea ? textarea.value.trim() : '';

    // Get section configuration from UI
    const container = modal.querySelector('#systemPromptSectionContainer');
    const sectionOrder = [];
    const sectionToggles = {};

    if (container) {
      container.querySelectorAll('.priority-item').forEach(item => {
        const type = item.dataset.type;
        const toggle = item.querySelector('.section-toggle input');
        sectionOrder.push(type);
        sectionToggles[type] = toggle ? toggle.checked : true;
      });
    }

    // Get other relevant settings from UI
    const dynamicToolsCheckbox = modal.querySelector('#enableDynamicToolsRegistry');
    const limitDynamicToolsCheckbox = modal.querySelector('#limitDynamicToolsSelection');
    const dynamicToolsLimitInput = modal.querySelector('#dynamicToolsSelectionLimit');
    const optimizedPromptCheckbox = modal.querySelector('#useOptimizedPrompt');
    const dynamicEnabled = dynamicToolsCheckbox ? dynamicToolsCheckbox.checked : true;
    const limitDynamicToolsSelection = limitDynamicToolsCheckbox ? limitDynamicToolsCheckbox.checked : false;
    const dynamicToolsSelectionLimit = dynamicToolsLimitInput ? parseInt(dynamicToolsLimitInput.value, 10) || 35 : 35;
    const optimizedEnabled = optimizedPromptCheckbox ? optimizedPromptCheckbox.checked : true;

    // Save current config values so we can restore them after preview
    const savedSettings = this.configManager.get('chatboxSettings', {});
    const savedCurrentMessage = window.chatManager ? window.chatManager.currentMessage : null;

    try {
      // Temporarily apply UI settings to configManager for buildSystemMessage
      const previewSettings = {
        ...savedSettings,
        customSystemPrompt: customPrompt,
        systemPromptSectionOrder: sectionOrder,
        enableDynamicToolsRegistry: dynamicEnabled,
        limitDynamicToolsSelection,
        dynamicToolsSelectionLimit,
        useOptimizedPrompt: optimizedEnabled,
      };
      for (const [key, value] of Object.entries(sectionToggles)) {
        const settingKey = `systemPromptInclude${key.charAt(0).toUpperCase() + key.slice(1)}`;
        previewSettings[settingKey] = value;
      }
      this.configManager.set('chatboxSettings', previewSettings);

      // Set sample query for dynamic tools
      if (window.chatManager) {
        window.chatManager.currentMessage = 'Search DNA polymerase';
      }

      // Generate the real system prompt
      let realPrompt = '';
      if (window.chatManager && window.chatManager.buildSystemMessage) {
        realPrompt = await window.chatManager.buildSystemMessage();
      } else {
        realPrompt = '[ChatManager not available - cannot generate preview]';
      }

      // Restore original settings
      this.configManager.set('chatboxSettings', savedSettings);
      if (window.chatManager) {
        window.chatManager.currentMessage = savedCurrentMessage;
      }

      // Build the preview header with config summary
      let preview = '=== System Prompt Preview ===\n';
      preview += `Sample Query: "Search DNA polymerase"\n`;
      preview += `Prompt Mode: ${dynamicEnabled ? 'Dynamic Tools Registry' : optimizedEnabled ? 'Optimized' : 'Complete'}\n`;
      if (customPrompt) {
        preview += `Custom Prompt: Active (overrides default)\n`;
      }
      preview += '\n--- Section Configuration ---\n';
      sectionOrder.forEach((section, index) => {
        const enabled = sectionToggles[section];
        const name = this.getSystemPromptSectionDisplayName(section);
        preview += `  ${index + 1}. ${name}: ${enabled ? '✓' : '✗'}\n`;
      });
      preview += '\n--- Generated System Prompt ---\n\n';
      preview += realPrompt;

      this.showSystemPromptConfigPreview(preview);
    } catch (error) {
      // Restore settings on error
      this.configManager.set('chatboxSettings', savedSettings);
      if (window.chatManager) {
        window.chatManager.currentMessage = savedCurrentMessage;
      }
      console.error('Preview generation failed:', error);
      this.showSystemPromptConfigPreview(
        `Error generating preview:\n${error.message}\n\nPlease try saving settings first and send a message to test.`
      );
    }
  }

  /**
   * Get display name for system prompt section
   */
  getSystemPromptSectionDisplayName(sectionKey) {
    const displayNames = {
      systemInstructions: 'System Instructions',
      currentContext: 'Current Context',
      dynamicTools: 'Dynamic Tools',
      toolExamples: 'Tool Examples',
      toolGuidelines: 'Tool Guidelines',
      responseFormat: 'Response Format',
      toolCategories: 'Tool Categories',
      memoryContext: 'Memory Context',
    };
    return displayNames[sectionKey] || sectionKey;
  }

  /**
   * Show system prompt configuration preview modal
   */
  showSystemPromptConfigPreview(previewContent) {
    // Remove any existing preview modal
    const existingModal = document.getElementById('systemPromptConfigPreviewModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Estimate token count (rough: ~4 chars per token for English)
    const charCount = previewContent.length;
    const estimatedTokens = Math.round(charCount / 4);

    const escapedContent = previewContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const modalHtml = `
      <div class="modal" id="systemPromptConfigPreviewModal" style="z-index: 10001;">
        <div class="modal-content resizable" style="max-width: 900px; width: 85vw; max-height: 85vh;">
          <div class="modal-header">
            <h3><i class="fas fa-eye"></i> System Prompt Preview</h3>
            <span style="font-size: 12px; color: #6b7280; margin-left: auto; margin-right: 12px;">
              ~${charCount.toLocaleString()} chars / ~${estimatedTokens.toLocaleString()} tokens
            </span>
            <button class="modal-close" type="button">&times;</button>
          </div>
          <div class="modal-body" style="overflow-y: auto; max-height: calc(85vh - 120px);">
            <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; color: #374151;">${escapedContent}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" id="copySystemPromptBtn" style="margin-right: auto;">
              <i class="fas fa-copy"></i> Copy
            </button>
            <button class="btn modal-close" type="button">Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('systemPromptConfigPreviewModal');
    modal.classList.add('show');

    const closeModal = () => {
      if (modal && modal.parentNode) {
        modal.remove();
      }
    };

    modal.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    // Copy button
    const copyBtn = modal.querySelector('#copySystemPromptBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard
          .writeText(previewContent)
          .then(() => {
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
              copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            }, 2000);
          })
          .catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = previewContent;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
              copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            }, 2000);
          });
      });
    }

    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal();
    });

    const handleEscape = e => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Get current system prompt section order from UI
   */
  getSystemPromptSectionOrderFromUI(modal) {
    const container = modal.querySelector('#systemPromptSectionContainer');
    if (!container) return this.settings.systemPromptSectionOrder;

    const items = container.querySelectorAll('.priority-item');
    return Array.from(items).map(item => item.dataset.type);
  }

  /**
   * Set system prompt section order in UI
   */
  setSystemPromptSectionOrderInUI(modal, order) {
    const container = modal.querySelector('#systemPromptSectionContainer');
    if (!container || !Array.isArray(order)) return;

    const items = Array.from(container.querySelectorAll('.priority-item'));
    const orderedItems = [];

    order.forEach(type => {
      const item = items.find(item => item.dataset.type === type);
      if (item) orderedItems.push(item);
    });

    // Add any missing items at the end
    items.forEach(item => {
      if (!orderedItems.includes(item)) {
        orderedItems.push(item);
      }
    });

    container.innerHTML = '';
    orderedItems.forEach(item => container.appendChild(item));

    this.updatePriorityNumbers(container);
    this.updateSystemPromptSectionStatus(container);
  }

  /**
   * Populate settings form with current values
   */
  /**
   * Resolve a settings control by id.
   *
   * Settings stored in `chatboxSettings` are no longer all rendered in the ChatBox
   * Settings modal — the agent-facing ones (model, execution limits, context/prompt,
   * memory) now live in the Agent Settings modal. Storage did not move, so this falls
   * back to a document-wide lookup and both panels drive the same keys. Control ids
   * are unique across the document, so the fallback is unambiguous.
   */
  findSettingControl(modal, id) {
    return modal?.querySelector(`#${id}`) || (typeof document !== 'undefined' ? document.getElementById(id) : null);
  }

  populateSettingsForm(modal) {
    for (const [key, value] of Object.entries(this.settings)) {
      if (key === 'toolPriority') {
        // Handle tool priority specially
        this.setToolPriorityInUI(modal, value);
        continue;
      }

      if (key === 'systemPromptSectionOrder') {
        // Handle system prompt section order specially
        this.setSystemPromptSectionOrderInUI(modal, value);
        continue;
      }

      if (key === 'customSystemPrompt') {
        // Handle custom system prompt textarea
        const textarea = this.findSettingControl(modal, 'customSystemPrompt');
        if (textarea) {
          textarea.value = value || '';
        }
        continue;
      }

      const element = this.findSettingControl(modal, key);
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = value;
        } else if (element.type === 'number') {
          if (key === 'responseTimeout') {
            element.value = value / 1000;
          } else if (key === 'memoryCleanupInterval') {
            element.value = value / 60000; // Convert from ms to minutes
          } else if (key === 'agentLLMTimeout') {
            element.value = value / 1000; // Convert from ms to seconds
          } else {
            element.value = value;
          }
        } else if (element.type === 'range') {
          element.value = value;
          // Update range value display
          const valueDisplay = this.findSettingControl(modal, `${key}Value`);
          if (valueDisplay) {
            if (key === 'completionThreshold') {
              valueDisplay.textContent = Math.round(value * 100) + '%';
            } else if (key === 'chatboxLLMTemperature') {
              valueDisplay.textContent = value;
            } else {
              valueDisplay.textContent = value;
            }
          }
        } else {
          element.value = value;
        }
      }
    }

    // Populate Welcome Examples
    this.populateWelcomeExamplesForm(modal);

    // Update system prompt section status display
    const sectionContainer = modal.querySelector('#systemPromptSectionContainer');
    if (sectionContainer) {
      this.updatePriorityNumbers(sectionContainer);
      this.updateSystemPromptSectionStatus(sectionContainer);
    }

    // Setup range slider event listeners
    this.setupRangeSliders(modal);
    this.setupRepeatedOpenNewTabControls(modal);
  }

  setupRepeatedOpenNewTabControls(modal) {
    const enabledInput = modal.querySelector('#enableRepeatedOpenNewTab');
    const limitInput = modal.querySelector('#maxRepeatedOpenNewTabCalls');
    if (!enabledInput || !limitInput) return;

    const syncDisabledState = () => {
      limitInput.disabled = !enabledInput.checked;
    };

    if (!enabledInput.dataset.repeatControlBound) {
      enabledInput.addEventListener('change', syncDisabledState);
      enabledInput.dataset.repeatControlBound = 'true';
    }
    syncDisabledState();
  }

  /**
   * Setup range slider event listeners
   */
  setupRangeSliders(modal) {
    const rangeSliders = modal.querySelectorAll('input[type="range"]');
    rangeSliders.forEach(slider => {
      const valueDisplay = modal.querySelector(`#${slider.id}Value`);
      if (valueDisplay) {
        slider.addEventListener('input', () => {
          if (slider.id === 'completionThreshold') {
            valueDisplay.textContent = Math.round(slider.value * 100) + '%';
          } else if (slider.id === 'chatboxLLMTemperature') {
            valueDisplay.textContent = slider.value;
          } else {
            valueDisplay.textContent = slider.value;
          }
        });
      }
    });
  }

  /**
   * Save settings from form
   */
  async saveSettingsFromForm(modal) {
    const newSettings = {};

    for (const key of Object.keys(this.settings)) {
      if (key === 'toolPriority') {
        // Handle tool priority specially
        newSettings[key] = this.getToolPriorityFromUI(modal);
        continue;
      }

      if (key === 'systemPromptSectionOrder') {
        // Handle system prompt section order specially
        newSettings[key] = this.getSystemPromptSectionOrderFromUI(modal);
        continue;
      }

      if (key === 'customSystemPrompt') {
        // Handle custom system prompt textarea
        const textarea = this.findSettingControl(modal, 'customSystemPrompt');
        if (textarea) {
          newSettings[key] = textarea.value.trim();
        } else {
          newSettings[key] = this.settings.customSystemPrompt;
        }
        continue;
      }

      const element = this.findSettingControl(modal, key);
      if (element) {
        if (element.type === 'checkbox') {
          newSettings[key] = element.checked;
        } else if (element.type === 'number') {
          const value = parseInt(element.value);
          if (key === 'responseTimeout') {
            newSettings[key] = value * 1000;
          } else if (key === 'memoryCleanupInterval') {
            newSettings[key] = value * 60000; // Convert from minutes to ms
          } else if (key === 'agentLLMTimeout') {
            newSettings[key] = value * 1000; // Convert from seconds to ms
          } else {
            newSettings[key] = value;
          }
        } else if (element.type === 'range') {
          newSettings[key] = parseFloat(element.value);
        } else {
          newSettings[key] = element.value;
        }
      }
    }

    // Serialize and save Welcome Examples
    const examplesContainer = modal.querySelector('#welcomeExamplesContainer');
    if (examplesContainer && window.welcomeExamplesManager) {
      const cards = examplesContainer.querySelectorAll('.welcome-editor-card');
      const data = [];
      cards.forEach(card => {
        const id = card.dataset.id;
        const icon = card.querySelector('.cat-icon-input').value;
        const title = card.querySelector('.cat-title-input').value;
        const cssClass = card.querySelector('.cat-style-select').value;

        const promptItems = card.querySelectorAll('.editor-prompt-item');
        const examples = Array.from(promptItems)
          .map(item => {
            const promptTitle = item.querySelector('.prompt-title-input')?.value.trim() || '';
            const promptText = item.querySelector('.prompt-text-input')?.value.trim() || '';
            return { title: promptTitle, prompt: promptText };
          })
          .filter(ex => ex.title !== '' || ex.prompt !== '');

        data.push({ id, icon, title, cssClass, examples });
      });
      window.welcomeExamplesManager.saveAll(data);
    }

    // Sync customSystemPrompt to llm.systemPrompt for backward compatibility
    if (newSettings.customSystemPrompt !== undefined) {
      this.configManager.set('llm.systemPrompt', newSettings.customSystemPrompt);
    }

    // Validate settings
    const tempSettings = { ...this.settings, ...newSettings };
    const settingsManager = { settings: tempSettings };
    const errors = this.validateSettings.call(settingsManager);

    if (errors.length > 0) {
      alert('Settings validation failed:\n' + errors.join('\n'));
      return;
    }

    // Check which settings will change BEFORE updating them
    const changedKeys = [];
    for (const [key, value] of Object.entries(newSettings)) {
      if (Object.prototype.hasOwnProperty.call(this.settings, key) && this.settings[key] !== value) {
        changedKeys.push(key);
      }
    }

    // Update settings
    const hasChanges = await this.updateSettings(newSettings);

    if (hasChanges) {
      // Show success message with detailed feedback
      this.showSaveSuccessMessage(newSettings, changedKeys);

      // Close modal
      modal.style.display = 'none';
      modal.classList.remove('show');
    } else {
      // Show no changes message
      this.showNotification('No changes detected. Settings are already up to date.', 'info');

      // Close modal
      modal.style.display = 'none';
      modal.classList.remove('show');
    }
  }

  /**
   * Show detailed save success message
   */
  showSaveSuccessMessage(newSettings, changedKeys = null) {
    const changedSettings = changedKeys || [];

    if (!changedKeys) {
      // Check which settings were changed
      for (const [key, value] of Object.entries(newSettings)) {
        if (this.settings[key] !== value) {
          changedSettings.push(key);
        }
      }
    }

    if (changedSettings.length === 0) {
      this.showNotification('Settings saved successfully!', 'success');
      return;
    }

    // Create detailed message
    let message = '✅ Settings saved successfully!\n\n';
    message += 'Updated settings:\n';

    changedSettings.forEach(setting => {
      const value = newSettings[setting];
      const displayValue = typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') : value;
      message += `• ${this.getSettingDisplayName(setting)}: ${displayValue}\n`;
    });

    // Show notification
    this.showNotification(message, 'success');

    // Also log to console for debugging
    console.log('💾 Settings saved:', changedSettings);
  }

  /**
   * Get display name for setting key
   */
  getSettingDisplayName(key) {
    const displayNames = {
      agentSystemEnabled: 'Multi-Agent System',
      agentAutoOptimize: 'Agent Auto-Optimization',
      agentShowInfo: 'Agent Information Display',
      agentMemoryEnabled: 'Agent Memory Integration',
      agentCacheEnabled: 'Agent Execution Caching',
      agentLLMProvider: 'Agent LLM Provider',
      agentLLMModel: 'Agent LLM Model',
      agentLLMTemperature: 'Agent LLM Temperature',
      agentLLMMaxTokens: 'Agent LLM Max Tokens',
      agentLLMTimeout: 'Agent LLM Timeout',
      agentLLMRetryAttempts: 'Agent LLM Retry Attempts',
      agentLLMUseSystemPrompt: 'Agent LLM System Prompt',
      agentLLMEnableFunctionCalling: 'Agent LLM Function Calling',
      functionCallRounds: 'Maximum Function Call Rounds',
      enableEarlyCompletion: 'Enable Early Task Completion',
      completionThreshold: 'Task Completion Confidence Threshold',
      enableRepeatedOpenNewTab: 'Allow Explicit Multi-Tab Requests',
      maxRepeatedOpenNewTabCalls: 'Maximum Tabs per Explicit Request',
      memorySystemEnabled: 'Memory System',
      memoryCacheEnabled: 'Memory Caching',
      memoryOptimizationEnabled: 'Memory Optimization',
      memoryCleanupInterval: 'Memory Cleanup Interval',
      memoryMaxEntries: 'Memory Max Entries',
      showThinkingProcess: 'Agent Activity Display',
      activityDetailLevel: 'Agent Activity Detail Level',
      activityAutoCollapse: 'Collapse Agent Activity When Finished',
      showAvailableTools: 'Available Tools Display',
      showToolCalls: 'Tool Calls Display',
      showToolCallSource: 'Tool Call Source Display',
      showDetailedToolData: 'Detailed Tool Data',
      responseTimeout: 'Response Timeout',
      autoScrollToBottom: 'Auto Scroll to Bottom',
      enableStreaming: 'Stream Responses',
      showTimestamps: 'Show Timestamps',
      maxHistoryMessages: 'Max History Messages',
      animateThinking: 'Animate Thinking',
      compactMode: 'Compact Mode',
      rememberPosition: 'Remember Position',
      rememberSize: 'Remember Size',
      startMinimized: 'Start Minimized',
      useOptimizedPrompt: 'Use Optimized Prompt',
      enableDynamicToolsRegistry: 'Enable Dynamic Tools Registry',
      limitDynamicToolsSelection: 'Limit Dynamic Tools Selection',
      dynamicToolsSelectionLimit: 'Dynamic Tools Selection Limit',
      enableNativeFunctionCalling: 'Enable Native Function Calling',
      enableConstrainedToolOutput: 'Enable Constrained Tool Output',
      debugMode: 'Debug Mode',
      logToolCalls: 'Log Tool Calls',
      chatboxModelType: 'Primary Model Type',
      chatboxLLMProvider: 'LLM Provider Override',
      chatboxLLMModel: 'LLM Model Override',
      chatboxLLMTemperature: 'LLM Temperature',
      chatboxLLMMaxTokens: 'LLM Max Tokens',
      chatboxLLMTimeout: 'LLM Timeout',
      chatboxLLMUseSystemPrompt: 'LLM System Prompt',
      chatboxLLMEnableFunctionCalling: 'LLM Function Calling',
      customSystemPrompt: 'Custom System Prompt',
      systemPromptIncludeSystemInstructions: 'Include System Instructions',
      systemPromptIncludeCurrentContext: 'Include Current Context',
      systemPromptIncludeDynamicTools: 'Include Dynamic Tools',
      systemPromptIncludeToolExamples: 'Include Tool Examples',
      systemPromptIncludeToolGuidelines: 'Include Tool Guidelines',
      systemPromptIncludeResponseFormat: 'Include Response Format',
      systemPromptIncludeToolCategories: 'Include Tool Categories',
      systemPromptIncludeMemoryContext: 'Include Memory Context',
      systemPromptSectionOrder: 'System Prompt Section Order',
    };

    return displayNames[key] || key;
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    // Try to use existing notification system
    if (window.chatManager && window.chatManager.showNotification) {
      window.chatManager.showNotification(message, type);
    } else {
      // Fallback to alert
      alert(message);
    }
  }

  /**
   * Populate Welcome Examples tab form editor
   */
  populateWelcomeExamplesForm(modal) {
    const container = modal.querySelector('#welcomeExamplesContainer');
    if (!container) return;

    const manager = window.welcomeExamplesManager;
    if (!manager) {
      container.innerHTML =
        '<div style="color: #ef4444; padding: 10px;">Welcome Examples Manager not loaded yet.</div>';
      return;
    }

    const categories = manager.getAll();

    if (categories.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px; color: #6b7280; background: #f8fafc; border: 1px dashed #e2e8f0; border-radius: 6px; width: 100%;">
          <i class="fas fa-folder-open" style="font-size: 24px; margin-bottom: 8px; display: block; color: #94a3b8;"></i>
          No categories defined. Click "Add Category" above to create one.
        </div>
      `;
      return;
    }

    container.innerHTML = categories
      .map(
        (cat, catIdx) => `
      <div class="welcome-editor-card" data-id="${cat.id}" style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; gap: 8px; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
          <input type="text" class="cat-icon-input" value="${cat.icon || '💬'}" placeholder="Emoji" title="Category Emoji" style="width: 40px; text-align: center; font-size: 14px; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #1e293b;">
          <input type="text" class="cat-title-input" value="${(cat.title || '').replace(/"/g, '&quot;')}" placeholder="Category Title" title="Category Title" style="flex: 1; font-weight: 600; font-size: 13px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #1e293b;">
          <select class="cat-style-select" title="Card Theme Color" style="width: 140px; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #1e293b; font-size: 12px;">
            <option value="welcome-card-search" ${cat.cssClass === 'welcome-card-search' ? 'selected' : ''}>🔍 Blue (Search)</option>
            <option value="welcome-card-molbio" ${cat.cssClass === 'welcome-card-molbio' ? 'selected' : ''}>🧪 Green (Mol Bio)</option>
            <option value="welcome-card-analysis" ${cat.cssClass === 'welcome-card-analysis' ? 'selected' : ''}>📊 Purple (Analysis)</option>
            <option value="welcome-card-export" ${cat.cssClass === 'welcome-card-export' ? 'selected' : ''}>🔖 Orange (Export)</option>
          </select>
          <div style="display: flex; gap: 2px;">
            <button type="button" class="btn btn-sm btn-secondary move-cat-up-btn" title="Move category up" ${catIdx === 0 ? 'disabled' : ''} style="padding: 4px 8px;">
              <i class="fas fa-arrow-up" style="font-size: 11px;"></i>
            </button>
            <button type="button" class="btn btn-sm btn-secondary move-cat-down-btn" title="Move category down" ${catIdx === categories.length - 1 ? 'disabled' : ''} style="padding: 4px 8px;">
              <i class="fas fa-arrow-down" style="font-size: 11px;"></i>
            </button>
            <button type="button" class="btn btn-sm btn-secondary delete-cat-btn" title="Delete Category" style="padding: 4px 8px; color: #ef4444; border-color: #fee2e2; background: #fef2f2;">
              <i class="fas fa-trash-alt" style="font-size: 11px;"></i>
            </button>
          </div>
        </div>
        
        <div class="editor-prompts-list" style="display: flex; flex-direction: column; gap: 6px;">
          ${(cat.examples || [])
            .map((exObj, prIdx) => {
              const titleStr = typeof exObj === 'string' ? exObj : exObj.title || '';
              const promptStr = typeof exObj === 'string' ? exObj : exObj.prompt || '';
              return `
            <div class="editor-prompt-item" data-index="${prIdx}" style="display: flex; flex-direction: column; gap: 4px; padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;">
              <div style="display: flex; gap: 6px; align-items: center;">
                <span style="color: #94a3b8; font-size: 10px; width: 14px; text-align: right; font-weight: 500;">${prIdx + 1}</span>
                <input type="text" class="prompt-title-input" value="${titleStr.replace(/"/g, '&quot;')}" placeholder="Button Title (e.g. Navigate to Gene)" title="Text displayed on the button" style="flex: 1; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; background: #ffffff; color: #1e293b;">
                <div style="display: flex; gap: 2px;">
                  <button type="button" class="btn btn-sm btn-secondary move-prompt-up-btn" title="Move up" ${prIdx === 0 ? 'disabled' : ''} style="padding: 2px 6px; font-size: 10px;">
                    <i class="fas fa-caret-up"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-secondary move-prompt-down-btn" title="Move down" ${prIdx === cat.examples.length - 1 ? 'disabled' : ''} style="padding: 2px 6px; font-size: 10px;">
                    <i class="fas fa-caret-down"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-secondary delete-prompt-btn" title="Delete Example" style="padding: 2px 6px; font-size: 10px; color: #ef4444; border-color: #fee2e2; background: #fef2f2;">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              </div>
              <div style="display: flex; gap: 6px; align-items: center; padding-left: 20px;">
                <input type="text" class="prompt-text-input" value="${promptStr.replace(/"/g, '&quot;')}" placeholder="Actual prompt sent to AI (e.g. Find genes near position 123)" title="Prompt sent to the AI when clicked" style="flex: 1; padding: 4px 8px; border: 1px dashed #cbd5e1; border-radius: 4px; font-size: 11px; background: #ffffff; color: #475569;">
              </div>
            </div>
          `;
            })
            .join('')}
          <button type="button" class="btn btn-sm btn-secondary add-prompt-btn" style="align-self: flex-start; margin-top: 4px; border-style: dashed; padding: 2px 8px; font-size: 11px; background: #ffffff; border-color: #cbd5e1;">
            <i class="fas fa-plus" style="font-size: 9px; margin-right: 3px;"></i> Add Example
          </button>
        </div>
      </div>
    `
      )
      .join('');

    this.setupWelcomeExamplesEditorEvents(modal);
  }

  /**
   * Setup active interaction event listeners inside Welcome Examples form editor
   */
  setupWelcomeExamplesEditorEvents(modal) {
    const container = modal.querySelector('#welcomeExamplesContainer');
    if (!container) return;

    const manager = window.welcomeExamplesManager;
    if (!manager) return;

    // Helper to serialize inputs directly from DOM
    const getCurrentUISerializedData = () => {
      const cards = container.querySelectorAll('.welcome-editor-card');
      const data = [];
      cards.forEach(card => {
        const id = card.dataset.id;
        const iconInput = card.querySelector('.cat-icon-input');
        const titleInput = card.querySelector('.cat-title-input');
        const cssClassSelect = card.querySelector('.cat-style-select');

        if (!iconInput || !titleInput || !cssClassSelect) return;

        const icon = iconInput.value;
        const title = titleInput.value;
        const cssClass = cssClassSelect.value;

        const promptItems = card.querySelectorAll('.editor-prompt-item');
        const examples = Array.from(promptItems)
          .map(item => {
            const promptTitle = item.querySelector('.prompt-title-input')?.value.trim() || '';
            const promptText = item.querySelector('.prompt-text-input')?.value.trim() || '';
            return { title: promptTitle, prompt: promptText };
          })
          .filter(ex => ex.title !== '' || ex.prompt !== '');

        data.push({ id, icon, title, cssClass, examples });
      });
      return data;
    };

    // Category and Prompt Level Actions
    container.addEventListener('click', e => {
      const card = e.target.closest('.welcome-editor-card');
      if (!card) return;
      const categoryId = card.dataset.id;
      const data = getCurrentUISerializedData();
      const catIdx = data.findIndex(c => c.id === categoryId);

      // Delete Category
      if (e.target.closest('.delete-cat-btn')) {
        if (confirm('Are you sure you want to delete this entire category and all its examples?')) {
          const updated = data.filter(c => c.id !== categoryId);
          manager.saveAll(updated);
          this.populateWelcomeExamplesForm(modal);
        }
        return;
      }

      // Move Category Up
      if (e.target.closest('.move-cat-up-btn')) {
        if (catIdx > 0) {
          const temp = data[catIdx];
          data[catIdx] = data[catIdx - 1];
          data[catIdx - 1] = temp;
          manager.saveAll(data);
          this.populateWelcomeExamplesForm(modal);
        }
        return;
      }

      // Move Category Down
      if (e.target.closest('.move-cat-down-btn')) {
        if (catIdx < data.length - 1) {
          const temp = data[catIdx];
          data[catIdx] = data[catIdx + 1];
          data[catIdx + 1] = temp;
          manager.saveAll(data);
          this.populateWelcomeExamplesForm(modal);
        }
        return;
      }

      // Add Prompt Example
      if (e.target.closest('.add-prompt-btn')) {
        const cat = data.find(c => c.id === categoryId);
        if (cat) {
          cat.examples.push({ title: 'New Example Title', prompt: 'New Example Prompt' });
          manager.saveAll(data);
          this.populateWelcomeExamplesForm(modal);

          // Focus newly added title input
          const titleInputs = container.querySelectorAll(`[data-id="${categoryId}"] .prompt-title-input`);
          if (titleInputs.length > 0) {
            const lastInput = titleInputs[titleInputs.length - 1];
            lastInput.focus();
            lastInput.select();
          }
        }
        return;
      }

      // Prompt specific button handlers
      const promptItem = e.target.closest('.editor-prompt-item');
      if (promptItem) {
        const prIdx = parseInt(promptItem.dataset.index);
        const cat = data.find(c => c.id === categoryId);
        if (!cat) return;

        // Delete prompt example
        if (e.target.closest('.delete-prompt-btn')) {
          cat.examples.splice(prIdx, 1);
          manager.saveAll(data);
          this.populateWelcomeExamplesForm(modal);
          return;
        }

        // Move prompt example up
        if (e.target.closest('.move-prompt-up-btn')) {
          if (prIdx > 0) {
            const temp = cat.examples[prIdx];
            cat.examples[prIdx] = cat.examples[prIdx - 1];
            cat.examples[prIdx - 1] = temp;
            manager.saveAll(data);
            this.populateWelcomeExamplesForm(modal);
          }
          return;
        }

        // Move prompt example down
        if (e.target.closest('.move-prompt-down-btn')) {
          if (prIdx < cat.examples.length - 1) {
            const temp = cat.examples[prIdx];
            cat.examples[prIdx] = cat.examples[prIdx + 1];
            cat.examples[prIdx + 1] = temp;
            manager.saveAll(data);
            this.populateWelcomeExamplesForm(modal);
          }
          return;
        }
      }
    });

    // Save inputs back to WelcomeExamplesManager on value edits
    container.addEventListener('change', () => {
      const data = getCurrentUISerializedData();
      manager.saveAll(data);
    });
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatBoxSettingsManager;
}
