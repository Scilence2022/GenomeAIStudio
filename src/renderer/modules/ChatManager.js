/**
 * ChatManager - Handles LLM chat interface and MCP communication
 */
/**
 * Reason recorded when a model asks for a tool the prompt did not advertise.
 * Produced by analyzeLLMResponse(), consumed by
 * expandAdvertisedToolsForRejectedCalls(); they must not drift apart.
 */
const UNADVERTISED_TOOL_REASON = 'Tool was not advertised for the current request';
/** Bound on how many times one turn may widen its advertised tool set. */
const MAX_TOOL_EXPANSIONS_PER_TURN = 3;

class ChatManager {
  constructor(app, configManager = null) {
    this.app = app;
    this.genomeBrowser = app || window.genomeBrowser;
    this.configManager = configManager;
    this.llmConfigManager = null;
    this.mcpServerManager = null;
    this.chatHistory = [];

    // Dock state
    this.isDocked = false;

    // Event emitter functionality
    this.eventHandlers = new Map();

    // Context mode toggle state - false means send full conversation, true means send only current message
    this.contextModeEnabled = true; // Default to Current message only mode

    this.mcpSocket = null;
    this.clientId = null;
    this.isConnected = false;
    this.activeRequests = new Map();
    this.pendingMessages = [];

    // Conversation state management
    this.conversationState = {
      isProcessing: false,
      currentRequestId: null,
      abortController: null,
      // Sticky abort flag. endConversation() drops the AbortController as soon
      // as the user presses stop so the UI unlocks, but the in-flight loop is
      // still awaiting somewhere; it needs a signal that outlives the teardown.
      aborted: false,
      startTime: null,
      processSteps: [],
      currentStep: 0,
    };

    // Initialize ChatBox Settings Manager
    this.chatBoxSettingsManager = null;
    this.welcomeExamplesManager = null;
    this.initializeChatBoxSettings();

    // Thinking process and tool-call display - now read from the settings manager
    this.showThinkingProcess = true;
    this.showAvailableTools = true;
    this.showToolCalls = true;
    this.showToolCallSource = true;
    this.showDetailedToolData = true;
    this.detailedLogging = true;

    // Activity panel (formerly "AI Thinking Process") display state.
    // 'compact' drops the transport-level chatter — sending/receiving,
    // history size, parameter-key echoes — and keeps the tool calls and
    // their outcomes. Evolution data always records every step regardless.
    this.activityDetailLevel = 'compact';
    this.activityAutoCollapse = true;
    // The round group currently being written into, and the per-request
    // tallies used to build the panel's one-line summary once it finishes.
    this.activityRoundState = null;
    this.activityTotals = null;
    // The panel steps are currently appended to. Tracked as an element rather
    // than resolved from the DOM every time because callers that bypass
    // startConversation() — the benchmark runner drives sendToLLM() directly —
    // have no request id to scope a lookup by.
    this.activityPanelElement = null;
    this.activityPanelSeq = 0;

    // Live token-streaming render state (null when no stream is in flight)
    this.streamingState = null;

    // Live reasoning-streaming render state for the thinking panel. Separate
    // from streamingState because the two render into different containers and
    // have different lifetimes: the answer preview is discarded once the round
    // completes, the reasoning block stays in the thinking log.
    this.reasoningStreamState = null;

    // Use app's LLM configuration manager if available, otherwise create one
    // Ensure we pass arguments correctly: (genomeBrowser, configManager)
    this.llmConfigManager = this.app?.llmConfigManager || new LLMConfigManager(this.app, this.configManager);

    // Initialize MCP Server Manager
    this.mcpServerManager = new MCPServerManager(this.configManager);
    this.setupMCPServerEventHandlers();

    // Initialize MicrobeGenomicsFunctions
    this.initializeMicrobeGenomicsFunctions();

    // Initialize BLAST Function Tools
    this.blastFunctionTools = null;
    this.initializeBlastFunctionTools();

    // Initialize Plugin Manager (async - stores promise for awaiting)
    this._pluginManagerReady = this.initializePluginManager();

    // Initialize Plugin Function Calls Integrator
    this.pluginFunctionCallsIntegrator = null;

    // Initialize Multi-Agent System (Legacy)
    this.multiAgentSystem = null;
    this.memorySystem = null;
    this.agentSystemEnabled = false;
    this.agentSystemSettings = {
      enabled: false,
      autoOptimize: true,
      showAgentInfo: true,
      memoryEnabled: true,
      cacheEnabled: true,
    };

    this.initializePluginFunctionCallsIntegrator();

    // Initialize Multi-Agent System
    this.initializeMultiAgentSystem();

    // Initialize Smart Execution System
    this.smartExecutor = null;
    this.isSmartExecutionEnabled = true; // configurable toggle
    this.initializeSmartExecutor();

    // Removed Conversation Evolution Integration (cleanup completed)

    // Initialize Dynamic Tools Registry System
    this.dynamicTools = null;
    this.dynamicToolsEnabled = true;
    this.currentNativeTools = [];
    this.builtInTools = null;
    this.builtInToolsMap = new Map();
    this.lastSystemPromptMetadata = null;
    this._toolRegistryUpdateListenerRegistered = false;
    this._pendingToolRegistrySnapshot = null;
    this.toolRegistryDiagnostics = [];
    this._dynamicToolsReady = false;
    this._capabilityRegistry = null;
    this._toolCallPlanCompiler = null;
    this.initializeDynamicTools()
      .then(() => {
        this._dynamicToolsReady = true;
      })
      .catch(err => {
        console.error('❌ Failed to initialize dynamic tools:', err);
        this._dynamicToolsReady = true;
      });

    // Initialize Tool Execution Tracker
    this.toolExecutionTracker = null;
    this.initializeToolExecutionTracker();

    // Set global reference for copy button functionality
    window.chatManager = this;

    // Message history browsing state
    this.messageHistory = {
      userMessages: [], // Filtered user messages for browsing
      currentIndex: -1, // Current position in history (-1 means not browsing)
      originalContent: '', // Original input content before browsing
      isBrowsing: false, // Whether currently browsing history
    };

    // DON'T load chat history here - wait for UI to be created

    // Initialize working directory
    this.initializeWorkingDirectory();

    this.services = {};
    this.initializeServices();

    // Legacy MCP connection check (kept for backward compatibility)
    this.checkAndSetupMCPConnection();
    this.initializeUI();

    // Load chat history AFTER UI is initialized
    setTimeout(() => {
      this.loadChatHistory();

      // Update agent system button state after UI is ready
      this.updateMultiAgentToggleButton();
    }, 100);
  }

  /**
   * The transcript service, created lazily so a ChatManager built without the
   * full service registry (tests, benchmark harnesses) still works.
   * @returns {object}
   */
  getTranscriptService() {
    if (!this.services) this.services = {};
    if (!this.services.transcript) {
      const ServiceClass =
        (typeof window !== 'undefined' && window.ConversationTranscriptService) ||
        (typeof globalThis !== 'undefined' && globalThis.ConversationTranscriptService);
      if (!ServiceClass) throw new Error('ConversationTranscriptService is required before ChatManager');
      this.services.transcript = new ServiceClass(this.app, this);
    }
    return this.services.transcript;
  }

  initializeServices() {
    const serviceDefinitions = [
      ['execution', 'ToolExecutionService'],
      ['file', 'FileOperationService'],
      ['analysis', 'GenomeAnalysisService'],
      ['protein', 'ProteinService'],
      ['blast', 'BlastService'],
      ['annotation', 'AnnotationService'],
      ['annotationWorkflow', 'AnnotationResearchWorkflowService'],
      ['intent', 'IntentParserService'],
      ['context', 'LLMContextService'],
      ['ui', 'UIService'],
      ['restriction', 'RestrictionDigestService'],
      ['gel', 'GelElectrophoresisService'],
      ['task', 'TaskService'],
      ['researchProgress', 'ResearchProgressService'],
      ['skill', 'SkillService'],
      ['transcript', 'ConversationTranscriptService'],
    ];

    for (const [key, className] of serviceDefinitions) {
      const ServiceClass = window[className];
      if (typeof ServiceClass !== 'function') {
        console.warn(`[ChatManager] ${className} not available; ${key} service disabled`);
        continue;
      }

      try {
        this.services[key] = new ServiceClass(this.app, this);
      } catch (error) {
        console.warn(`[ChatManager] Failed to initialize ${className}:`, error);
      }
    }
  }

  /**
   * Initialize ChatBox Settings Manager
   */
  async initializeChatBoxSettings() {
    try {
      // Load the settings manager modules
      await this.loadScript('modules/WelcomeExamplesManager.js');
      await this.loadScript('modules/ChatBoxSettingsManager.js');

      // Initialize WelcomeExamplesManager
      if (typeof WelcomeExamplesManager !== 'undefined') {
        this.welcomeExamplesManager = new WelcomeExamplesManager();
        window.welcomeExamplesManager = this.welcomeExamplesManager;

        // Re-render welcome cards whenever the data changes
        this.welcomeExamplesManager.onChange(() => {
          this.renderWelcomeCards();
        });
      }

      // Initialize the settings manager
      if (typeof ChatBoxSettingsManager !== 'undefined') {
        this.chatBoxSettingsManager = new ChatBoxSettingsManager(this.configManager);

        // Wait for async settings loading (awaits ConfigManager initialization)
        if (this.chatBoxSettingsManager._initPromise) {
          await this.chatBoxSettingsManager._initPromise;
        }

        // Update display flags from settings
        this.updateSettingsFromManager();

        // Initial render of welcome cards
        this.renderWelcomeCards();

        // Listen for settings changes
        window.addEventListener('chatbox-settingsChanged', event => {
          this.updateSettingsFromManager();

          // Check if Dynamic Tools Registry setting changed
          this.configManager.get('chatboxSettings.enableDynamicToolsRegistry', true);
        });

        // Set global reference for settings modal
        window.chatBoxSettingsManager = this.chatBoxSettingsManager;

        // Listen for Agent Settings changes
        window.addEventListener('multiAgentSettingsChanged', event => {
          this.updateMultiAgentToggleButton();
        });
      } else {
        console.warn('ChatBoxSettingsManager not available');
      }
    } catch (error) {
      // Silently handle initialization error
      console.warn('[ChatManager] initializeChatBoxSettings error:', error);
    }
  }

  /**
   * Render (or re-render) the welcome screen example cards from WelcomeExamplesManager data.
   * Safe to call at any time; silently no-ops when the container is not yet in the DOM.
   */
  renderWelcomeCards() {
    const container = document.getElementById('welcomeCardsGrid');
    if (!container) return;

    const manager =
      this.welcomeExamplesManager || (typeof WelcomeExamplesManager !== 'undefined' && window.welcomeExamplesManager);
    if (!manager) return;

    const categories = manager.getAll();
    const escapeAttr = value => this.escapeHtml(String(value || '')).replace(/"/g, '&quot;');

    container.innerHTML = categories
      .map(
        cat => `
      <div class="welcome-card ${escapeAttr(cat.cssClass || 'welcome-card-search')}">
        <div class="welcome-card-header">
          <span class="welcome-card-icon">${this.escapeHtml(cat.icon || '💬')}</span>
          <span class="welcome-card-title">${this.escapeHtml(cat.title || '')}</span>
        </div>
        <div class="welcome-card-examples">
          ${(cat.examples || [])
            .map(ex => {
              // Handle both legacy string format and new object format gracefully
              const promptStr = typeof ex === 'string' ? ex : ex.prompt || '';
              const titleStr = typeof ex === 'string' ? ex : ex.title || promptStr;
              return `<button class="welcome-example-btn" data-prompt="${escapeAttr(promptStr)}"><span>${this.escapeHtml(titleStr)}</span></button>`;
            })
            .join('')}
        </div>
      </div>
    `
      )
      .join('');
  }

  /**
   * Update internal settings from settings manager
   */
  updateSettingsFromManager() {
    if (this.chatBoxSettingsManager) {
      this.showThinkingProcess = this.chatBoxSettingsManager.getSetting('showThinkingProcess', true);
      this.showAvailableTools = this.chatBoxSettingsManager.getSetting('showAvailableTools', true);
      this.showToolCalls = this.chatBoxSettingsManager.getSetting('showToolCalls', true);
      this.showToolCallSource = this.chatBoxSettingsManager.getSetting('showToolCallSource', true);
      this.showDetailedToolData = this.chatBoxSettingsManager.getSetting('showDetailedToolData', true);
      this.hideThinkingAfterConversation = this.chatBoxSettingsManager.getSetting(
        'hideThinkingAfterConversation',
        false
      );
      this.activityDetailLevel = this.chatBoxSettingsManager.getSetting('activityDetailLevel', 'compact');
      this.activityAutoCollapse = this.chatBoxSettingsManager.getSetting('activityAutoCollapse', true);
      this.autoScrollToBottom = this.chatBoxSettingsManager.getSetting('autoScrollToBottom', true);
      this.showTimestamps = this.chatBoxSettingsManager.getSetting('showTimestamps', false);
      this.maxHistoryMessages = this.chatBoxSettingsManager.getSetting('maxHistoryMessages', 1000);
      this.responseTimeout = this.chatBoxSettingsManager.getSetting('responseTimeout', 30000);

      // Update agent system settings
      const agentSystemEnabled = this.chatBoxSettingsManager.getSetting('agentSystemEnabled', false);
      if (agentSystemEnabled !== this.agentSystemEnabled) {
        this.agentSystemEnabled = agentSystemEnabled;
        this.agentSystemSettings.enabled = agentSystemEnabled;
        this.updateMultiAgentToggleButton();
      }

      this.agentSystemSettings.autoOptimize = this.chatBoxSettingsManager.getSetting('agentAutoOptimize', true);
      this.agentSystemSettings.showAgentInfo = this.chatBoxSettingsManager.getSetting('agentShowInfo', true);
      this.agentSystemSettings.memoryEnabled = this.chatBoxSettingsManager.getSetting('agentMemoryEnabled', true);
      this.agentSystemSettings.cacheEnabled = this.chatBoxSettingsManager.getSetting('agentCacheEnabled', true);

      // Update agent LLM settings
      this.agentSystemSettings.llmProvider = this.chatBoxSettingsManager.getSetting('agentLLMProvider', 'auto');
      this.agentSystemSettings.llmModel = this.chatBoxSettingsManager.getSetting('agentLLMModel', 'auto');
      this.agentSystemSettings.llmTemperature = this.chatBoxSettingsManager.getSetting('agentLLMTemperature', 0.7);
      this.agentSystemSettings.llmMaxTokens = this.chatBoxSettingsManager.getSetting('agentLLMMaxTokens', 4000);
      this.agentSystemSettings.llmTimeout = this.chatBoxSettingsManager.getSetting('agentLLMTimeout', 30000);
      this.agentSystemSettings.llmRetryAttempts = this.chatBoxSettingsManager.getSetting('agentLLMRetryAttempts', 3);
      this.agentSystemSettings.llmUseSystemPrompt = this.chatBoxSettingsManager.getSetting(
        'agentLLMUseSystemPrompt',
        true
      );
      this.agentSystemSettings.llmEnableFunctionCalling = this.chatBoxSettingsManager.getSetting(
        'agentLLMEnableFunctionCalling',
        true
      );

      // Settings updated from ChatBoxSettingsManager
    }
  }

  /**
   * Initialize MicrobeGenomicsFunctions integration
   */
  initializeMicrobeGenomicsFunctions() {
    // Check if MicrobeGenomicsFunctions is available globally
    if (typeof window !== 'undefined' && window.MicrobeFns) {
      this.MicrobeFns = window.MicrobeFns;
      // MicrobeGenomicsFunctions integrated successfully
    } else {
      // MicrobeGenomicsFunctions not available globally
    }
  }

  /**
   * Initialize Plugin Manager V2 integration
   */
  async initializePluginManager() {
    console.log('📦 [DEBUG] ChatManager.initializePluginManager() called');
    console.log('📦 [DEBUG] PluginManagerV2 available:', typeof PluginManagerV2 !== 'undefined');
    try {
      // Check if PluginManagerV2 is already available globally
      if (typeof PluginManagerV2 !== 'undefined') {
        console.log('📦 [DEBUG] Creating new PluginManagerV2 instance...');
        this.pluginManager = new PluginManagerV2(this.app, this.configManager);

        // Wait for plugin system to fully initialize (including marketplace and installed plugins)
        console.log('🔄 Waiting for PluginManagerV2 initialization...');
        await this.pluginManager.waitForInitialization();
        console.log('✅ PluginManagerV2 fully initialized');

        // Listen to enhanced plugin events
        this.pluginManager.on('system-initialized', data => {
          // Plugin system initialized
        });

        this.pluginManager.on('function-executed', data => {
          // Plugin function executed
        });

        this.pluginManager.on('function-error', data => {
          // Plugin function error
        });

        this.pluginManager.on('plugin-registered', data => {
          // Plugin registered
          // Notify Dynamic Tools about plugin state change
          this.onPluginStateChanged();
        });

        // Connect PluginManager to Dynamic Tools after initialization
        this.connectPluginManagerToDynamicTools();
      } else {
        // PluginManagerV2 not available, loading dynamically...
        await this.loadPluginManager();
      }
    } catch (error) {
      console.error('❌ Failed to initialize PluginManagerV2:', error);
    }
  }

  /**
   * Wait for plugin manager to be fully initialized
   * @returns {Promise<void>}
   */
  async waitForPluginManager() {
    if (this._pluginManagerReady) {
      await this._pluginManagerReady;
    }
    if (this.pluginManager && this.pluginManager.waitForInitialization) {
      await this.pluginManager.waitForInitialization();
    }
  }

  /**
   * Load Plugin Manager V2 dynamically
   */
  async loadPluginManager() {
    try {
      // Load new plugin system files in correct order
      await this.loadScript('modules/PluginAPI.js');
      await this.loadScript('modules/PluginResourceManager.js');
      await this.loadScript('modules/PluginMarketplace.js');
      await this.loadScript('modules/PluginDependencyResolver.js');
      await this.loadScript('modules/PluginSecurityValidator.js');
      await this.loadScript('modules/PluginUpdateManager.js');
      await this.loadScript('modules/PluginManagerV2.js');

      // Load supporting files
      await this.loadScript('modules/PluginUtils.js');
      await this.loadScript('modules/PluginImplementations.js');
      await this.loadScript('modules/PluginVisualization.js');

      // Initialize after loading
      if (typeof PluginManagerV2 !== 'undefined') {
        this.pluginManager = new PluginManagerV2(this.app, this.configManager);
        // PluginManagerV2 loaded and initialized successfully
      } else {
        throw new Error('PluginManagerV2 failed to load');
      }
    } catch (error) {
      // Failed to load PluginManagerV2
      throw new Error('PluginManagerV2 is required for ChatManager functionality');
    }
  }

  /**
   * Load script dynamically with duplicate check
   */
  loadScript(src) {
    return new Promise((resolve, reject) => {
      // Check if script is already loaded
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        // Script already loaded, skipping...
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize Plugin Function Calls Integrator
   */
  async initializePluginFunctionCallsIntegrator() {
    try {
      // Load the integrator module
      await this.loadScript('modules/BlastChatManagerIntegration.js');
      await this.loadScript('modules/PrimerChatManagerIntegration.js');
      await this.loadScript('modules/PluginFunctionCallsIntegrator.js');

      // Initialize after PluginManager is ready
      const initIntegrator = () => {
        if (typeof PluginFunctionCallsIntegrator !== 'undefined' && this.pluginManager) {
          this.pluginFunctionCallsIntegrator = new PluginFunctionCallsIntegrator(this, this.pluginManager);
          // PluginFunctionCallsIntegrator initialized successfully
        } else {
          // PluginFunctionCallsIntegrator or PluginManager not available, retrying...
          setTimeout(initIntegrator, 500);
        }
      };

      // Try to initialize, with retry for timing issues
      setTimeout(initIntegrator, 100);
    } catch (error) {
      // Failed to initialize PluginFunctionCallsIntegrator
    }
  }

  /**
   * Initialize Multi-Agent System (Legacy)
   */
  async initializeMultiAgentSystem() {
    try {
      // Load settings first
      this.loadAgentSystemSettings();

      // Agent System Settings loaded

      // Initializing Legacy Multi-Agent System...
      // Initialize Legacy Multi-Agent System
      await this.initializeLegacyMultiAgentSystem();
    } catch (error) {
      // Failed to initialize Multi-Agent System
    }
  }

  /**
   * Initialize Legacy Multi-Agent System
   */
  async initializeLegacyMultiAgentSystem() {
    try {
      // Initializing Legacy Multi-Agent System...

      // Load required modules
      await this.loadScript('modules/MultiAgentSystem.js');

      // Load all available agent classes
      // AgentBase.js is already loaded via index.html
      await this.loadScript('modules/Agents/NavigationAgent.js');
      await this.loadScript('modules/Agents/AnalysisAgent.js');
      await this.loadScript('modules/Agents/DataAgent.js');
      await this.loadScript('modules/Agents/ExternalAgent.js');
      await this.loadScript('modules/Agents/PluginAgent.js');
      await this.loadScript('modules/Agents/CoordinatorAgent.js');

      // Load memory system modules
      await this.loadScript('modules/MemorySystem.js');

      // Initialize Multi-Agent System
      if (typeof MultiAgentSystem !== 'undefined') {
        this.multiAgentSystem = new MultiAgentSystem(this, this.configManager);
        await this.multiAgentSystem.initialize();

        // Initialize Memory System
        if (typeof MemorySystem !== 'undefined') {
          this.memorySystem = new MemorySystem(this.multiAgentSystem);
          await this.memorySystem.initialize();
        }

        // Legacy Multi-Agent System initialized successfully
        this.agentSystemEnabled = this.agentSystemSettings.enabled;

        // Emit initialization event
        this.emit('agent-system-initialized', {
          enabled: this.agentSystemEnabled,
          agentCount: this.multiAgentSystem.agents.size,
        });
      } else {
        // MultiAgentSystem not available
      }
    } catch (error) {
      // Failed to initialize Legacy Multi-Agent System
    }
  }

  /**
   * Load agent system settings from config
   */
  loadAgentSystemSettings() {
    try {
      const savedSettings = this.configManager.get('agentSystemSettings', {});
      this.agentSystemSettings = {
        ...this.agentSystemSettings,
        ...savedSettings,
      };

      // Also load from multiAgentSettings (used by MultiAgentSettingsManager) for sync.
      // Only the settings the Agent Settings panel actually applies are mapped here; the
      // former per-agent LLM overrides were written but never read by any request path.
      const masSaved = this.configManager.get('multiAgentSettings', {});
      if (masSaved && Object.keys(masSaved).length > 0) {
        if (masSaved.multiAgentSystemEnabled !== undefined) {
          this.agentSystemSettings.enabled = masSaved.multiAgentSystemEnabled;
        }
        if (masSaved.multiAgentShowInfo !== undefined) {
          this.agentSystemSettings.showAgentInfo = masSaved.multiAgentShowInfo;
        }
      }

      // Sync agentSystemEnabled from loaded settings
      this.agentSystemEnabled = this.agentSystemSettings.enabled;
    } catch (error) {
      // Failed to load agent system settings
    }
  }

  /**
   * Save agent system settings to config
   */
  saveAgentSystemSettings() {
    try {
      this.configManager.set('agentSystemSettings', this.agentSystemSettings);
    } catch (error) {
      // Failed to save agent system settings
    }
  }

  /**
   * Toggle multi-agent system on/off (new implementation)
   */
  toggleMultiAgentSystem() {
    // Use current internal state as the authoritative source
    const currentState = this.agentSystemEnabled;
    const newState = !currentState;

    // Update internal state first
    this.agentSystemEnabled = newState;
    this.agentSystemSettings.enabled = newState;

    // Update Agent Settings
    if (this.configManager) {
      this.configManager.set('multiAgentSettings.multiAgentSystemEnabled', newState);
    }

    // Sync to ChatBox settings for backward compatibility
    if (this.chatBoxSettingsManager) {
      this.chatBoxSettingsManager.setSetting('agentSystemEnabled', newState);
    }

    this.saveAgentSystemSettings();

    // Update button appearance immediately
    this.updateMultiAgentToggleButton();

    // Show user notification
    this.showNotification(`Multi-Agent System ${newState ? 'enabled' : 'disabled'}`, newState ? 'success' : 'info');

    // Emit state change event
    this.emit('agent-system-state-changed', {
      enabled: this.agentSystemEnabled,
      settings: this.agentSystemSettings,
    });

    // Multi-Agent system toggled

    return this.agentSystemEnabled;
  }

  /**
   * Update agent system settings
   */
  updateAgentSystemSettings(settings) {
    this.agentSystemSettings = {
      ...this.agentSystemSettings,
      ...settings,
    };
    this.saveAgentSystemSettings();

    // Agent system settings updated

    // Emit settings update event
    this.emit('agent-system-settings-updated', {
      settings: this.agentSystemSettings,
    });
  }

  /**
   * Get agent system status
   */
  getAgentSystemStatus() {
    const status = {
      enabled: this.agentSystemEnabled,
      initialized: this.multiAgentSystem !== null,
      settings: this.agentSystemSettings,
      stats: this.multiAgentSystem ? this.multiAgentSystem.getSystemStats() : null,
      memoryStats: this.memorySystem ? this.memorySystem.getMemoryStats() : null,
      systemType: 'legacy',
    };

    return status;
  }

  /**
   * Initialize Smart Executor for optimized function calls
   */
  async initializeSmartExecutor() {
    try {
      // Load the required modules
      await this.loadScript('modules/FunctionCallsOrganizer.js');
      await this.loadScript('modules/SmartExecutor.js');

      // Initialize the smart executor
      if (typeof SmartExecutor !== 'undefined') {
        this.smartExecutor = new SmartExecutor(this);
        if (this._pendingToolRegistrySnapshot) {
          this.registerToolRegistrySnapshotWithOrganizer(this._pendingToolRegistrySnapshot);
        }
        // SmartExecutor initialized successfully
      } else {
        // SmartExecutor not available, falling back to standard execution
      }
    } catch (error) {
      // Failed to initialize SmartExecutor
      this.isSmartExecutionEnabled = false;
    }
  }

  /**
   * Process a prompt through the AI agent (for MCP Server remote invocation)
   * This is the bridge between MCP Server's codexomics_chat tool
   * and the internal ChatBox + LLM + tool execution loop.
   *
   * The prompt is executed in the ChatBox with a source marker, making the
   * execution process visible to the user — identical to typing in ChatBox.
   *
   * @param {string} prompt - Natural language instruction
   * @param {Object} options - Execution options
   * @param {boolean} options.activateMultiAgent - Enable multi-agent coordination
   * @param {Function} options.onProgress - Optional progress callback for MCP notifications
   *   Receives: { type: string, message: string, data?: Object }
   *   Types: 'round_start', 'completion', 'error'
   * @returns {Object} Execution result with response and mode
   */
  async processAgentPrompt(prompt, options = {}) {
    const { activateMultiAgent = false, onProgress = null } = options;
    const notifyProgress = payload => {
      if (!onProgress) return;
      try {
        onProgress(payload);
      } catch (progressError) {
        console.debug('[AgentMode] Progress callback failed:', progressError.message);
      }
    };

    // Save current agent state
    const previousAgentState = this.agentSystemEnabled;

    try {
      // Validate LLM configuration
      if (this.llmConfigManager && this.llmConfigManager.waitForInitialization) {
        await this.llmConfigManager.waitForInitialization();
      }
      if (!this.llmConfigManager || !this.llmConfigManager.isConfigured()) {
        throw new Error('No LLM configured. Please set up an LLM provider in Settings > LLM Config.');
      }

      // Temporarily activate multi-agent if requested
      if (activateMultiAgent && !this.agentSystemEnabled) {
        this.agentSystemEnabled = true;
        console.log('[AgentMode] Multi-agent mode activated for this request');
      }

      // Notify progress: starting
      notifyProgress({
        type: 'round_start',
        message: `Starting agent execution in ChatBox`,
        data: { mode: activateMultiAgent ? 'multi-agent' : 'single-agent' },
      });

      // Mark the prompt with MCP source so user knows where it came from
      const markedPrompt = `🔗 **[MCP Agent]** ${prompt}`;

      // Check if ChatBox is busy — if so, wait briefly
      if (this.conversationState.isProcessing) {
        notifyProgress({ type: 'error', message: 'ChatBox is busy with another request' });
        return {
          success: false,
          error: 'ChatBox is busy with another request. Please wait and try again.',
          mode: activateMultiAgent ? 'multi-agent' : 'single-agent',
        };
      }

      // Initialize conversation state (same as sendMessage)
      this.startConversation();

      // Add user message to ChatBox with MCP source marker
      this.addMessageToChat(markedPrompt, 'user');

      // Show thinking process
      this.showThinkingProcess && this.addThinkingMessage('🔗 MCP Agent request — analyzing...');
      this.showTypingIndicator();

      try {
        // Execute via the main sendToLLM pipeline — same as user typing in ChatBox
        const response = await this.sendToLLM(prompt, {
          source: 'mcp-agent',
          parentTurnId: options.parentTurnId || options.turnContext?.turnId,
          turnContext: options.turnContext,
          scope: options.scope || options.executionContext,
        });

        // Display response in ChatBox
        this.removeTypingIndicator();
        this.addMessageToChat(response, 'assistant');

        // Notify progress: completion
        notifyProgress({
          type: 'completion',
          message: `Agent execution completed in ChatBox`,
          data: { responseLength: response ? response.length : 0 },
        });

        return {
          success: true,
          response: response,
          mode: activateMultiAgent ? 'multi-agent' : 'single-agent',
        };
      } catch (llmError) {
        this.removeTypingIndicator();
        if (llmError.name === 'AbortError') {
          this.addMessageToChat('MCP Agent request aborted by user.', 'assistant', false, 'warning');
        } else {
          this.addMessageToChat(`MCP Agent request failed: ${llmError.message}`, 'assistant', true);
          console.error('[AgentMode] sendToLLM failed:', llmError);
        }
        throw llmError;
      } finally {
        this.endConversation();
      }
    } catch (error) {
      console.error('[AgentMode] processAgentPrompt failed:', error);

      // Notify progress: error
      notifyProgress({ type: 'error', message: `Agent execution failed: ${error.message}` });

      return {
        success: false,
        error: error.message,
        mode: activateMultiAgent ? 'multi-agent' : 'single-agent',
      };
    } finally {
      // Restore previous agent state
      this.agentSystemEnabled = previousAgentState;
    }
  }

  /**
   * Initialize Dynamic Tools Registry System
   */
  async initializeDynamicTools() {
    try {
      // Initializing Dynamic Tools Registry System...

      // Initialize Blast Function Tools
      if (typeof this.initializeBlastFunctionTools === 'function') {
        await this.initializeBlastFunctionTools();
      }

      // Initialize Primer Function Tools
      if (typeof this.initializePrimerFunctionTools === 'function') {
        await this.initializePrimerFunctionTools();
      }

      if (!window.electronAPI || typeof window.electronAPI.getToolRegistrySnapshot !== 'function') {
        this.toolRegistryDiagnostics = [
          {
            severity: 'warning',
            message: 'Tool registry IPC API is not available',
            source: 'renderer',
          },
        ];
        this.dynamicToolsEnabled = false;
        console.warn('[ChatManager] Dynamic Tools Registry disabled: IPC API is not available');
        return;
      }

      const snapshot = await window.electronAPI.getToolRegistrySnapshot();
      if (!snapshot || (!Array.isArray(snapshot.tools) && !snapshot.toolsByName)) {
        this.toolRegistryDiagnostics = [
          {
            severity: 'error',
            message: 'Tool registry snapshot is invalid',
            source: 'renderer',
          },
        ];
        this.dynamicToolsEnabled = false;
        console.warn('[ChatManager] Dynamic Tools Registry disabled: invalid snapshot');
        return;
      }

      this.toolRegistryDiagnostics = Array.isArray(snapshot.diagnostics) ? snapshot.diagnostics : [];
      if (snapshot.success === false && this.toolRegistryDiagnostics.length > 0) {
        console.warn('[ChatManager] Tool registry snapshot reported diagnostics:', this.toolRegistryDiagnostics);
      }

      if (snapshot.success === false && (!snapshot.tools || snapshot.tools.length === 0)) {
        this.dynamicToolsEnabled = false;
        console.warn('[ChatManager] Dynamic Tools Registry disabled: snapshot contains no usable tools');
        return;
      }

      this.dynamicTools = this.createDynamicToolsSnapshotAdapter(snapshot);
      this.builtInTools = this.dynamicTools.builtInTools;
      this.builtInToolsMap = this.dynamicTools.builtInTools.builtInToolsMap;
      this._capabilityRegistry = null;
      this._toolCallPlanCompiler = null;
      this.registerToolRegistrySnapshotWithOrganizer(snapshot);
      this.dynamicToolsEnabled = true;

      if (
        !this._toolRegistryUpdateListenerRegistered &&
        typeof window.electronAPI.onToolRegistryUpdated === 'function'
      ) {
        window.electronAPI.onToolRegistryUpdated(updatedSnapshot => {
          try {
            this.dynamicTools = this.createDynamicToolsSnapshotAdapter(updatedSnapshot);
            this.builtInTools = this.dynamicTools.builtInTools;
            this.builtInToolsMap = this.dynamicTools.builtInTools.builtInToolsMap;
            this._capabilityRegistry = null;
            this._toolCallPlanCompiler = null;
            this.registerToolRegistrySnapshotWithOrganizer(updatedSnapshot);
            this.dynamicToolsEnabled = true;
            this.connectPluginManagerToDynamicTools();
            console.log('[ChatManager] Tool registry snapshot updated', this.dynamicTools.integrationStatus);
          } catch (updateError) {
            console.warn('[ChatManager] Failed to apply updated tool registry snapshot:', updateError.message);
          }
        });
        this._toolRegistryUpdateListenerRegistered = true;
      }

      console.log('[ChatManager] Dynamic Tools Registry initialized from main-process snapshot', {
        tools: snapshot.counts?.tools || 0,
        builtInTools: snapshot.counts?.builtInTools || 0,
        registryHash: snapshot.registryHash,
      });

      // Connect PluginManager to Dynamic Tools Bridge
      this.connectPluginManagerToDynamicTools();
    } catch (error) {
      // Failed to initialize Dynamic Tools Registry System
      // Error details
      console.warn('[ChatManager] Failed to initialize Dynamic Tools Registry from snapshot:', error.message);
      this.dynamicToolsEnabled = false;
    }
  }

  registerToolRegistrySnapshotWithOrganizer(snapshot) {
    this._pendingToolRegistrySnapshot = snapshot;
    const organizer = this.smartExecutor?.organizer;
    if (!organizer || typeof organizer.registerToolRegistrySnapshot !== 'function') {
      return;
    }

    organizer.registerToolRegistrySnapshot(snapshot);
  }

  getCapabilityRegistry() {
    if (!this._capabilityRegistry) {
      const Adapter =
        (typeof window !== 'undefined' && window.CapabilityRegistryAdapter) ||
        (typeof globalThis !== 'undefined' && globalThis.CapabilityRegistryAdapter);
      if (typeof Adapter !== 'function') return null;
      const snapshot = this._pendingToolRegistrySnapshot || this.dynamicTools?.snapshot || {};
      this._capabilityRegistry = new Adapter({
        snapshot,
        tools: this.dynamicTools?.toolsByName,
        builtInTools: this.builtInTools,
        policy: this.services?.context?.getToolExecutionPolicy?.()?.capabilityPolicy,
      });
    }
    return this._capabilityRegistry;
  }

  getToolCallPlanCompiler() {
    if (!this._toolCallPlanCompiler) {
      const Compiler =
        (typeof window !== 'undefined' && window.ToolCallPlanCompiler) ||
        (typeof globalThis !== 'undefined' && globalThis.ToolCallPlanCompiler);
      if (typeof Compiler !== 'function') return null;
      this._toolCallPlanCompiler = new Compiler({ registry: this.getCapabilityRegistry() });
    }
    return this._toolCallPlanCompiler;
  }

  compileToolCallPlan(toolCalls, options = {}) {
    const compiler = this.getToolCallPlanCompiler();
    return (
      compiler?.compile?.(toolCalls, { ...options, registry: options.registry || this.getCapabilityRegistry() }) || null
    );
  }

  isExecutionGraphSafe(plan, pendingTools, registry) {
    if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length !== pendingTools.length) return false;
    if (
      plan.diagnostics?.some(diagnostic =>
        ['unresolved_reference', 'self_reference', 'graph_validation_error'].includes(diagnostic.type)
      )
    ) {
      return false;
    }
    return plan.nodes.every((node, index) => {
      const tool = pendingTools[index];
      const metadata = node.metadata || {};
      const legacyOnly =
        tool?.legacy === true || tool?.legacyOnly === true || tool?.executionMode || tool?.__executionWrapper;
      return (
        node.id &&
        node.tool === tool?.tool_name &&
        metadata.effect &&
        metadata.effect !== 'unknown' &&
        registry?.has?.(tool.tool_name) === true &&
        Array.isArray(metadata.readSet) &&
        Array.isArray(metadata.writeSet) &&
        Array.isArray(metadata.locks) &&
        !legacyOnly
      );
    });
  }

  async executeToolExecutionGraph(pendingTools, referenceResults = [], options = {}) {
    const tools = Array.isArray(pendingTools) ? pendingTools : [];
    const turnContext = options.turnContext || null;
    if (tools.length === 0) return [];

    let registry;
    let plan;
    try {
      registry = options.registry || this.getCapabilityRegistry();
      plan = this.compileToolCallPlan(tools, {
        registry,
        context: { scope: turnContext?.scope, turnContext, referenceResults },
        referenceResults,
        completion: options.completion,
      });
    } catch (error) {
      plan = null;
      options.onPlanDiagnostic?.({ type: 'plan_compilation_error', message: error.message });
    }

    if (!this.isExecutionGraphSafe(plan, tools, registry)) {
      return this.executePendingToolExecutionQueue(tools.slice(), referenceResults, options);
    }

    const Scheduler =
      (typeof window !== 'undefined' && window.ExecutionGraphScheduler) ||
      (typeof globalThis !== 'undefined' && globalThis.ExecutionGraphScheduler);
    if (typeof Scheduler !== 'function')
      return this.executePendingToolExecutionQueue(tools.slice(), referenceResults, options);

    const referenceContext = Array.isArray(referenceResults) ? referenceResults.slice() : [];
    const startedAt = new Map();
    const scheduler = new Scheduler({
      maxConcurrency: options.maxConcurrency ?? Infinity,
      executor: async (node, context, parametersResolved) => {
        context?.assertActive?.();
        const tool = tools[node.inputIndex];
        const recordedParameters = this.cloneToolParameters(tool?.parameters || {});
        const resolvedParameters = this.resolveToolParameterReferences(
          parametersResolved === undefined ? recordedParameters : parametersResolved,
          referenceContext
        );
        node.parametersResolved = resolvedParameters;
        startedAt.set(node.id, Date.now());
        const gateway = this.getExecutionGateway();
        const executionResult = await gateway.execute(node.tool, resolvedParameters, {
          turnContext: context,
          nodeId: node.id,
          source: context?.source,
          scope: node.scope || context?.scope,
          gatewayLegacyResult: true,
          signal: context?.abortSignal,
        });
        const success = executionResult?.status === 'succeeded' || executionResult?.status === 'queued';
        if (success) {
          referenceContext.push({
            tool: node.tool,
            tool_name: node.tool,
            tool_call_id: node.id,
            parameters: recordedParameters,
            success: true,
            result: executionResult.value,
            status: executionResult.status,
            jobId: executionResult.jobId || executionResult.value?.jobId,
          });
        }
        return executionResult;
      },
    });
    const graphResults = await scheduler.run(plan.graph, turnContext);
    const resultsById = new Map(graphResults.map(result => [result.nodeId, result]));
    return plan.nodes.map((node, index) => {
      const tool = tools[index];
      const result = resultsById.get(node.id);
      const status = result?.status || 'failed';
      const success = status === 'succeeded' || status === 'queued';
      const executionTime = startedAt.has(node.id) ? Date.now() - startedAt.get(node.id) : 0;
      return {
        tool: tool.tool_name,
        tool_name: tool.tool_name,
        tool_call_id: tool.tool_call_id ?? tool.id ?? null,
        parameters: this.cloneToolParameters(tool.parameters),
        success,
        result: success ? result.value : null,
        error: success ? null : result?.error?.message || result?.error || status,
        executionTime,
        status,
        executionId: result?.executionId,
        nodeId: node.id,
        jobId: result?.jobId || result?.value?.jobId,
        artifactTypes: node.metadata?.artifactTypes || [],
        completionContribution: node.metadata?.completionContribution || null,
      };
    });
  }

  /**
   * Create a renderer-side adapter for the main-process tool registry snapshot.
   * The adapter preserves the old SystemIntegration method shape without giving
   * the renderer direct filesystem access to tools_registry/.
   */
  createDynamicToolsSnapshotAdapter(snapshot) {
    if (typeof DynamicToolsSnapshotAdapter === 'undefined') {
      throw new Error('DynamicToolsSnapshotAdapter script is not available');
    }

    return new DynamicToolsSnapshotAdapter(snapshot, this);
  }

  /**
   * Initialize Tool Execution Tracker
   */
  async initializeToolExecutionTracker() {
    try {
      if (typeof ToolExecutionTracker !== 'undefined') {
        this.toolExecutionTracker = new ToolExecutionTracker();
      } else {
        await this.loadScript('modules/ToolExecutionTracker.js');

        if (typeof ToolExecutionTracker !== 'undefined') {
          this.toolExecutionTracker = new ToolExecutionTracker();
        }
      }
    } catch (error) {
      console.warn('[ChatManager] Failed to initialize Tool Execution Tracker:', error.message);
    }
  }

  /**
   * Get the last user query for Dynamic Tools Registry intent analysis
   */
  getLastUserQuery() {
    if (this.currentMessage) {
      return this.currentMessage;
    }

    if (this.chatHistory.length === 0) return '';
    const lastMessage = this.chatHistory[this.chatHistory.length - 1];
    return lastMessage.role === 'user' ? lastMessage.content : '';
  }

  /**
   * Check if we're currently in benchmark mode
   * @returns {boolean} True if in benchmark mode
   */
  isBenchmarkMode() {
    const benchmarkInterface = document.getElementById('benchmarkInterface');
    if (benchmarkInterface && benchmarkInterface.style.display !== 'none') {
      return true;
    }

    if (window.benchmarkUI && window.benchmarkUI.isRunning) {
      return true;
    }

    if (this.app?.benchmarkManager?.isRunning) {
      return true;
    }

    return false;
  }

  async loadGenomeFile(parameters = {}) {
    return this.services.file.loadGenomeFile(parameters);
  }

  async loadAnnotationFile(parameters = {}) {
    return this.services.file.loadAnnotationFile(parameters);
  }

  async loadVariantFile(parameters = {}) {
    return this.services.file.loadVariantFile(parameters);
  }

  async loadReadsFile(parameters = {}) {
    return this.services.file.loadReadsFile(parameters);
  }

  async loadWigTracks(parameters = {}) {
    return this.services.file.loadWigTracks(parameters);
  }

  async loadOperonFile(parameters = {}) {
    return this.services.file.loadOperonFile(parameters);
  }

  async downloadInternetFile(parameters = {}) {
    if (!this.services || !this.services.file) {
      console.error('[ChatManager] file not initialized');
      return;
    }
    return this.services.file.downloadInternetFile(parameters);
  }

  async viewMarkdownFile(parameters = {}) {
    try {
      const { filePath, title } = parameters;

      if (!filePath) {
        throw new Error('File path is required');
      }

      if (!window.electronAPI?.openMarkdownViewer) {
        throw new Error('Markdown viewer IPC bridge is unavailable');
      }

      const result = await window.electronAPI.openMarkdownViewer({ filePath, title });

      if (result.success) {
        return {
          success: true,
          message: `Opened markdown viewer for: ${result.fileName}`,
          filePath: result.filePath,
          fileName: result.fileName,
          windowTitle: result.windowTitle,
          tool: 'view_markdown_file',
        };
      }

      throw new Error(result.error || 'Failed to open markdown viewer');
    } catch (error) {
      console.error('❌ [ChatManager] Error opening markdown viewer:', error);
      return {
        success: false,
        error: error.message,
        tool: 'view_markdown_file',
      };
    }
  }

  async getLoadedFilesList(parameters = {}) {
    try {
      const { includeMetadata = true } = parameters;

      if (!this.app) {
        throw new Error('Application not available');
      }

      const loadedFiles = this.app.loadedFiles || [];
      const filesList = loadedFiles.map(file => {
        const baseInfo = {
          name: file.name,
          path: file.path,
          type: file.type,
        };

        if (includeMetadata) {
          return {
            ...baseInfo,
            size: file.size,
            sizeFormatted: file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
            loadedAt: file.loadedAt,
          };
        }

        return baseInfo;
      });

      return {
        success: true,
        message: `Found ${filesList.length} loaded file(s)`,
        filesCount: filesList.length,
        files: filesList,
        tool: 'get_loaded_files_list',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        filesCount: 0,
        files: [],
        tool: 'get_loaded_files_list',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Set working directory - Built-in function tool
   * @param {Object} parameters - Tool parameters
   * @param {string} parameters.directory_path - Absolute or relative path to set as working directory
   * @param {boolean} parameters.use_home_directory - Set to true to use user home directory
   * @param {boolean} parameters.create_if_missing - Create directory if it doesn't exist (default: false)
   * @param {boolean} parameters.validate_permissions - Validate read/write permissions (default: true)
   * @returns {Object} Set directory result
   */
  async setWorkingDirectory(parameters = {}) {
    // Support both parameter names for compatibility
    const directory_path = parameters.directory_path || parameters.working_directory;
    const { use_home_directory = false, create_if_missing = false, validate_permissions = true } = parameters;

    try {
      let targetPath;
      const previousDirectory = this.getCurrentWorkingDirectory();
      const pathModule = this.getPathModule();
      const isAbsolutePath = candidatePath => {
        if (pathModule && typeof pathModule.isAbsolute === 'function') {
          return pathModule.isAbsolute(candidatePath);
        }
        return /^(?:\/|[A-Za-z]:[\\/])/.test(String(candidatePath || ''));
      };

      if (use_home_directory) {
        const osModule = typeof window !== 'undefined' ? window.os : null;
        targetPath =
          osModule && typeof osModule.homedir === 'function' && osModule.homedir()
            ? osModule.homedir()
            : this.getCurrentWorkingDirectory();
      } else if (directory_path) {
        targetPath = isAbsolutePath(directory_path)
          ? directory_path
          : pathModule && typeof pathModule.resolve === 'function'
            ? pathModule.resolve(this.getCurrentWorkingDirectory(), directory_path)
            : `${this.getCurrentWorkingDirectory().replace(/\/+$/g, '')}/${directory_path}`;
      } else {
        throw new Error('Either directory_path or use_home_directory must be provided');
      }

      let createdDirectory = false;
      const permissions = { readable: false, writable: false };

      if (typeof window !== 'undefined' && window.electronAPI?.approveWorkingDirectory) {
        const approvalResult = await window.electronAPI.approveWorkingDirectory(targetPath, {
          createIfMissing: create_if_missing,
        });
        if (!approvalResult?.success) {
          throw new Error(approvalResult?.error || `Directory '${targetPath}' is not available`);
        }

        targetPath = approvalResult.path || targetPath;
        createdDirectory = !!approvalResult.created;
        permissions.readable = !!approvalResult.permissions?.readable;
        permissions.writable = validate_permissions ? !!approvalResult.permissions?.writable : false;
      } else if (typeof window !== 'undefined' && window.electronAPI?.getSelectedFileInfo) {
        let infoResult = await window.electronAPI.getSelectedFileInfo(targetPath);
        if ((!infoResult || !infoResult.success) && create_if_missing && window.electronAPI.ensureDirectory) {
          const createResult = await window.electronAPI.ensureDirectory(targetPath);
          if (!createResult?.success) {
            throw new Error(createResult?.error || `Failed to create directory '${targetPath}'`);
          }
          createdDirectory = true;
          infoResult = await window.electronAPI.getSelectedFileInfo(targetPath);
        }

        if (!infoResult || !infoResult.success) {
          throw new Error(infoResult?.error || `Directory '${targetPath}' does not exist`);
        }

        if (!infoResult.info?.isDirectory) {
          throw new Error(`Path '${targetPath}' is not a directory`);
        }

        permissions.readable = true;
        permissions.writable = validate_permissions ? true : false;
        targetPath = infoResult.info.path || targetPath;
      } else {
        throw new Error('Working directory validation requires electronAPI.approveWorkingDirectory');
      }

      if (typeof process !== 'undefined' && typeof process.chdir === 'function') {
        process.chdir(targetPath);
      }

      this.currentWorkingDirectory = targetPath;

      if (this.configManager) {
        this.configManager.set('workingDirectory', targetPath);
      }

      return {
        success: true,
        message: createdDirectory
          ? `Working directory set to ${targetPath} (created)`
          : `Working directory set to ${targetPath}`,
        current_directory: targetPath,
        previous_directory: previousDirectory,
        permissions: permissions,
        tool: 'set_working_directory',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        attempted_path: directory_path || (use_home_directory ? 'user home directory' : 'undefined'),
        tool: 'set_working_directory',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get current working directory
   * @returns {string} Current working directory path
   */
  getCurrentWorkingDirectory() {
    if (this.currentWorkingDirectory) {
      return this.currentWorkingDirectory;
    }

    if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
      return process.cwd();
    }

    const os = typeof window !== 'undefined' ? window.os : null;
    const homeDir = os && typeof os.homedir === 'function' ? os.homedir() : '';
    if (homeDir) {
      return homeDir;
    }

    return '/';
  }

  getPathModule() {
    if (typeof window !== 'undefined' && window.path) {
      return window.path;
    }
    return {
      isAbsolute: filePath => /^(?:\/|[A-Za-z]:[\\/])/.test(String(filePath || '')),
      resolve: (...parts) => {
        const joined = parts.filter(part => part !== undefined && part !== null && part !== '').join('/');
        const normalized = joined.replace(/\\/g, '/').replace(/\/+/g, '/');
        return /^(?:\/|[A-Za-z]:[\\/])/.test(normalized) ? normalized : `/${normalized}`;
      },
    };
  }

  /**
   * Initialize working directory on startup
   */
  initializeWorkingDirectory() {
    try {
      // Check if there's a saved working directory
      let savedDirectory = null;
      if (this.configManager) {
        savedDirectory = this.configManager.get('workingDirectory', null);
      }

      if (savedDirectory) {
        this.currentWorkingDirectory = savedDirectory;
        if (typeof process !== 'undefined' && typeof process.chdir === 'function') {
          process.chdir(savedDirectory);
        }
        // [ChatManager] Restored working directory
      } else {
        // Default to user home directory
        const os = typeof window !== 'undefined' ? window.os : null;
        const homeDir = os && typeof os.homedir === 'function' ? os.homedir() : this.getCurrentWorkingDirectory();
        this.currentWorkingDirectory = homeDir;
        if (typeof process !== 'undefined' && typeof process.chdir === 'function') {
          process.chdir(homeDir);
        }
        // [ChatManager] Initialized working directory to home
      }
    } catch (error) {
      // [ChatManager] Error initializing working directory
      // Fallback to a stable renderer-safe directory placeholder.
      this.currentWorkingDirectory = this.getCurrentWorkingDirectory();
    }
  }

  /**
   * List all available tools in the system
   * @param {Object} parameters - Optional parameters
   * @param {string} parameters.category - Optional category filter
   * @param {boolean} parameters.include_details - Include detailed descriptions
   * @param {string} parameters.format - 'summary' or 'detailed'
   * @param {string} parameters.userQuery - Optional user query; when provided and the
   *   dynamic tools registry supports relevance selection, the listing is narrowed to
   *   the same query-relevant subset that is actually sent to the LLM (mirrors
   *   generateDynamicSystemPrompt/selectRelevantTools), instead of the full registry.
   * @param {Object} parameters.context - Optional studio context used for relevance scoring
   * @returns {Object} List of available tools organized by category
   */
  /**
   * List installed Agent Skills (expert multi-step workflows).
   * @param {Object} parameters - Optional category/query filters
   * @returns {Object} Skill index without workflow bodies
   */
  async listSkills(parameters = {}) {
    if (!this.services?.skill) {
      return { success: false, error: 'Skill service is not available' };
    }
    return this.services.skill.listSkills(parameters);
  }

  /**
   * Load one Agent Skill's full workflow body on demand.
   * @param {Object} parameters - Must include skill_id
   * @returns {Object} Skill metadata plus its workflow body
   */
  async getSkill(parameters = {}) {
    if (!this.services?.skill) {
      return { success: false, error: 'Skill service is not available' };
    }
    return this.services.skill.getSkill(parameters);
  }

  async listAvailableTools(parameters = {}) {
    const {
      category = null,
      include_details = false,
      format = 'summary',
      userQuery = null,
      context = null,
    } = parameters;

    console.log('📋 [ChatManager] Listing available tools', { category, include_details, format, userQuery });

    try {
      const result = {
        success: true,
        tool: 'list_available_tools',
        timestamp: new Date().toISOString(),
        total_tools: 0,
        total_registered: 0,
        categories: {},
        tools: [],
        filtered_category: category,
        query_filtered: false,
      };

      // Get tools from dynamic tools registry if available
      if (this.dynamicToolsEnabled && this.dynamicTools) {
        try {
          const fullRegistry = await this.dynamicTools.getAllTools();
          result.total_registered = Array.isArray(fullRegistry) ? fullRegistry.length : 0;

          // When a user query is supplied and the registry can score relevance, narrow
          // the listing to the same subset that will actually be offered to the LLM for
          // this request — otherwise the inventory misleadingly shows every registered
          // tool no matter what the user asked for.
          let toolsToList = fullRegistry;
          if (userQuery && typeof this.dynamicTools.selectRelevantTools === 'function') {
            toolsToList = this.dynamicTools.selectRelevantTools(
              userQuery,
              context || {},
              this.getDynamicToolsSelectionLimit()
            );
            result.query_filtered = true;
          }

          // Organize by category
          for (const tool of toolsToList) {
            const cat = tool.category || 'uncategorized';

            // Skip if category filter is set and doesn't match
            if (category && cat !== category) continue;

            if (!result.categories[cat]) {
              result.categories[cat] = {
                name: cat,
                count: 0,
                tools: [],
              };
            }

            const toolInfo = {
              name: tool.name,
              description: tool.description || 'No description available',
            };

            if (include_details || format === 'detailed') {
              toolInfo.keywords = tool.keywords || [];
              toolInfo.parameters = tool.parameters || {};
            }

            result.categories[cat].tools.push(toolInfo);
            result.categories[cat].count++;
            result.tools.push(toolInfo);
            result.total_tools++;
          }

          console.log(`✅ [ChatManager] Listed ${result.total_tools} tools from dynamic registry`);
        } catch (error) {
          console.warn('⚠️ [ChatManager] Error getting dynamic tools, using fallback:', error);
        }
      }

      // Fallback or supplement with core tools from getCoreToolsByCategory
      if (result.total_tools === 0) {
        const coreTools = this.getCoreToolsInfo(category, include_details);
        result.categories = coreTools.categories;
        result.tools = coreTools.tools;
        result.total_tools = coreTools.total;
        console.log(`✅ [ChatManager] Listed ${result.total_tools} tools from core tools`);
      }

      // Format message based on format type
      if (format === 'summary') {
        result.message = this.formatToolsSummary(result);
      } else {
        result.message = this.formatToolsDetailed(result);
      }

      return result;
    } catch (error) {
      console.error('❌ [ChatManager] Error listing available tools:', error);
      return {
        success: false,
        error: error.message,
        tool: 'list_available_tools',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get core tools information
   */
  getCoreToolsInfo(category = null, includeDetails = false) {
    const coreCategories = {
      navigation: {
        name: 'Navigation & State Management',
        tools: [
          'navigate_to_position',
          'jump_to_gene',
          'find_gene_by_name',
          'open_new_tab',
          'zoom_in',
          'zoom_out',
          'get_current_state',
          'save_view_state',
          'restore_view_state',
        ],
      },
      sequence: {
        name: 'Sequence Analysis',
        tools: [
          'get_sequence',
          'translate_dna',
          'reverse_complement',
          'compute_gc',
          'calc_region_gc',
          'get_coding_sequence',
        ],
      },
      database: {
        name: 'Database Integration',
        tools: ['search_uniprot_database', 'get_uniprot_entry', 'analyze_interpro_domains', 'search_interpro_entry'],
      },
      protein: {
        name: 'Protein Structure',
        tools: ['search_pdb_structures', 'fetch_protein_structure', 'search_alphafold_structures'],
      },
      file_loading: {
        name: 'File Loading',
        tools: ['load_genome_file', 'load_annotation_file', 'load_variant_file', 'load_reads_file'],
      },
      system: {
        name: 'System Management',
        tools: ['set_working_directory', 'list_available_tools'],
      },
      sequence_editing: {
        name: 'Sequence Editing',
        tools: ['copy_sequence', 'paste_sequence', 'insert_sequence', 'delete_sequence', 'execute_actions'],
      },
    };

    const result = { categories: {}, tools: [], total: 0 };

    for (const [catKey, catInfo] of Object.entries(coreCategories)) {
      if (category && catKey !== category) continue;

      result.categories[catKey] = {
        name: catInfo.name,
        count: catInfo.tools.length,
        tools: catInfo.tools.map(name => ({
          name,
          description: `${catInfo.name} tool`,
        })),
      };

      result.tools.push(...result.categories[catKey].tools);
      result.total += catInfo.tools.length;
    }

    return result;
  }

  /**
   * Format tools list as summary
   */
  formatToolsSummary(result) {
    let message = `📋 **Available Tools Summary**\n\n`;
    if (result.query_filtered && result.total_registered > result.total_tools) {
      message +=
        `**Tools selected for this request:** ${result.total_tools} ` +
        `(of ${result.total_registered} registered)\n\n`;
    } else {
      message += `**Total Tools:** ${result.total_tools}\n\n`;
    }

    for (const [catKey, catInfo] of Object.entries(result.categories)) {
      message += `### ${catInfo.name || catKey} (${catInfo.count} tools)\n`;
      message += catInfo.tools.map(t => `- ${t.name}`).join('\n');
      message += '\n\n';
    }

    return message;
  }

  /**
   * Format tools list with details
   */
  formatToolsDetailed(result) {
    let message = `📋 **Available Tools (Detailed)**\n\n`;
    message += `**Total Tools:** ${result.total_tools}\n\n`;

    for (const [catKey, catInfo] of Object.entries(result.categories)) {
      message += `### ${catInfo.name || catKey}\n`;
      for (const tool of catInfo.tools) {
        message += `- **${tool.name}**: ${tool.description}\n`;
      }
      message += '\n';
    }

    return message;
  }

  /**
   * Render the Dynamic Tool registration system's available-tools listing into the
   * thinking-process panel, before the first LLM round of a request. This gives the
   * user visibility into exactly which dynamically-registered tools the agent can use
   * for the current query.
   *
   * The listing is wrapped in a collapsed <details> so it never dominates the panel;
   * the user can expand it to inspect the full categorized registry. Failures are
   * swallowed — surfacing the tool inventory must never block request processing.
   */
  async displayAvailableToolsInThinking() {
    console.log('🧰 [ChatManager] displayAvailableToolsInThinking invoked', {
      showThinkingProcess: this.showThinkingProcess,
      showAvailableTools: this.showAvailableTools,
      dynamicToolsEnabled: this.dynamicToolsEnabled,
    });

    // Controlled by its own ChatBox setting ("Show available tools"). It renders into
    // the thinking-process panel, so the thinking process must also be visible.
    if (this.showAvailableTools === false) return;
    if (!this.showThinkingProcess) return;

    try {
      // Pass the current user query/context through so the listing reflects the same
      // query-relevant subset that buildSystemMessage()/generateDynamicSystemPrompt()
      // actually hands to the LLM, rather than the full static registry — otherwise
      // this panel always reports the same total no matter what the user asked.
      const userQuery = this.getLastUserQuery();
      let context = null;
      if (typeof this.getCurrentContextForDynamicTools === 'function') {
        context = this.getCurrentContextForDynamicTools();
      } else if (this.getCurrentContext) {
        context = this.getCurrentContext();
      }
      const toolsResult = await this.listAvailableTools({ format: 'summary', userQuery, context });

      // Even when enumeration fails, surface a brief note so the panel never goes
      // silently missing — the user explicitly wants tool visibility before round 1.
      if (!toolsResult || toolsResult.success === false) {
        console.warn('🧰 [ChatManager] listAvailableTools returned no usable result', toolsResult);
        this.updateThinkingMessage(
          `<br><span style="color: #888;">🧰 Tool registry unavailable for this request.</span>`
        );
        return;
      }

      const total = toolsResult.total_tools ?? (Array.isArray(toolsResult.tools) ? toolsResult.tools.length : 0);
      console.log(`🧰 [ChatManager] Rendering ${total} available tool(s) into thinking process`);

      const sourceLabel = this.dynamicToolsEnabled && this.dynamicTools ? 'Dynamic Tool registry' : 'core registry';
      const countLabel =
        toolsResult.query_filtered && toolsResult.total_registered > total
          ? `${total} selected for this request, of ${toolsResult.total_registered} registered`
          : `${total}`;

      if (!total) {
        this.updateThinkingMessage(
          `<br><span style="color: #888;">🧰 No tools registered in the ${sourceLabel}.</span>`
        );
        return;
      }

      const contextService = this.services && this.services.context;
      let inner = '';
      if (contextService && typeof contextService.renderAvailableToolsVisualization === 'function') {
        inner = contextService.renderAvailableToolsVisualization(toolsResult, {
          title: 'Registered Tools',
          categoriesOpen: false,
        });
      } else {
        inner = `<div style="color: #555;">${total} tools registered.</div>`;
      }

      const block =
        `<br><details style="margin: 6px 0;">` +
        `<summary style="cursor: pointer; color: #1565C0; font-weight: 600;">` +
        `🧰 Available tools from ${sourceLabel} (${countLabel}) — click to expand</summary>` +
        `${inner}</details>`;

      this.updateThinkingMessage(block);
    } catch (error) {
      console.warn('[ChatManager] Failed to display available tools in thinking process:', error);
      this.updateThinkingMessage(
        `<br><span style="color: #888;">🧰 Tool registry unavailable (${this.escapeHtml ? this.escapeHtml(error.message || 'error') : 'error'}).</span>`
      );
    }
  }

  /**
   * Connect PluginManager to Dynamic Tools Registry
   * This enables plugin tools to be discovered and included in the LLM system prompt
   */
  connectPluginManagerToDynamicTools() {
    if (this.dynamicTools && this.pluginManager) {
      try {
        this.dynamicTools.setPluginManager(this.pluginManager);
        console.log('✅ [ChatManager] PluginManager connected to Dynamic Tools Bridge');

        // Get initial stats
        const stats = this.dynamicTools.integrationStatus;
        console.log(`📊 [ChatManager] Dynamic Tools status: ${stats.pluginToolsLoaded || 0} plugin tools integrated`);

        // Also register plugin tools with FunctionCallsOrganizer
        if (this.smartExecutor && this.smartExecutor.organizer) {
          this.smartExecutor.organizer.registerPluginTools(this.pluginManager);
        }
      } catch (error) {
        console.error('❌ [ChatManager] Failed to connect PluginManager to Dynamic Tools:', error);
      }
    } else {
      // Either dynamicTools or pluginManager is not ready, retry when both are available
      if (!this.dynamicTools) {
        console.log('⚠️ [ChatManager] Dynamic Tools not initialized yet, will connect later');
      }
      if (!this.pluginManager) {
        console.log('⚠️ [ChatManager] PluginManager not initialized yet, will connect later');
      }
    }
  }

  /**
   * Notify Dynamic Tools Registry when plugins are installed/uninstalled
   * Call this method after plugin installation or removal to update the tools cache
   */
  onPluginStateChanged() {
    if (this.dynamicTools && this.dynamicTools.pluginBridge) {
      this.dynamicTools.invalidatePluginCache();
      console.log('🔄 [ChatManager] Plugin state changed, Dynamic Tools cache invalidated');

      // Re-connect to ensure fresh plugin list
      this.connectPluginManagerToDynamicTools();
    }

    // Also update FunctionCallsOrganizer
    if (this.smartExecutor && this.smartExecutor.organizer && this.pluginManager) {
      this.smartExecutor.organizer.registerPluginTools(this.pluginManager);
      console.log('🔌 [ChatManager] FunctionCallsOrganizer updated with plugin tools');
    }
  }

  /**
   * Get current context for Dynamic Tools Registry
   */
  getCurrentContextForDynamicTools() {
    const context = this.getCurrentContext();

    // Check if there's a valid LLM provider configured
    let hasAuth = false;
    if (this.llmConfigManager) {
      const currentProvider = this.llmConfigManager.getProviderForModelType('task');
      if (currentProvider) {
        const provider = this.llmConfigManager.providers[currentProvider];
        hasAuth = !!(provider && provider.apiKey && provider.enabled);
      }
    }

    // Enhanced context with detailed genome browser state
    const genomeState = context.genomeBrowser.currentState;
    const externalCurrentPosition = this.toExternalGenomePosition(genomeState.currentPosition);
    // For navigation tools, consider data available if there's a current chromosome
    const hasData = genomeState.loadedFiles.length > 0 || genomeState.currentChromosome;

    return {
      hasData: hasData,
      hasNetwork: navigator.onLine,
      hasAuth: hasAuth,
      agentSystemEnabled: this.agentSystemEnabled,
      currentCategory: this.getCurrentCategory(),

      // Detailed genome browser state
      genomeBrowser: {
        currentChromosome: genomeState.currentChromosome,
        // The exact names loaded, so the prompt can constrain chromosome
        // parameters to real sequences instead of inviting a guess.
        availableChromosomes: genomeState.availableChromosomes || [],
        currentPosition: externalCurrentPosition,
        visibleTracks: genomeState.visibleTracks || [],
        loadedFiles: genomeState.loadedFiles,
        sequenceLength: genomeState.sequenceLength,
        annotationsCount: genomeState.annotationsCount,
        userDefinedFeaturesCount: genomeState.userDefinedFeaturesCount,
      },

      // Legacy fields for backward compatibility
      loadedGenome: {
        ...genomeState,
        currentPosition: externalCurrentPosition,
        viewingRegion: genomeState.viewingRegion
          ? {
              ...genomeState.viewingRegion,
              start: externalCurrentPosition?.start,
              length:
                externalCurrentPosition && Number.isFinite(externalCurrentPosition.end)
                  ? externalCurrentPosition.end - externalCurrentPosition.start + 1
                  : genomeState.viewingRegion.length,
            }
          : null,
      },
      activeTracks: genomeState.visibleTracks || [],
      currentPosition: externalCurrentPosition,
    };
  }

  /**
   * Get current category based on active tools or context
   */
  getCurrentCategory() {
    // This would be determined based on current analysis context
    if (this.app?.genomeData?.currentAnalysis) {
      return this.app.genomeData.currentAnalysis.category;
    }
    return null;
  }

  toExternalGenomePosition(position) {
    if (!position) {
      return null;
    }

    const start = Number(position.start);
    const end = Number(position.end);

    return {
      ...position,
      start: Number.isFinite(start) ? start + 1 : position.start,
      end: Number.isFinite(end) ? end : position.end,
    };
  }

  /**
   * Get Dynamic Tools Registry statistics
   */
  async getDynamicToolsStats() {
    if (this.dynamicToolsEnabled && this.dynamicTools) {
      return await this.dynamicTools.getRegistryStats();
    }
    return { total_tools: 0, total_categories: 0 };
  }

  /**
   * Get tool usage statistics from Dynamic Tools Registry
   */
  getDynamicToolsUsageStats() {
    if (this.dynamicToolsEnabled && this.dynamicTools) {
      return this.dynamicTools.getToolUsageStats();
    }
    return {};
  }

  /**
   * Search tools by keywords using Dynamic Tools Registry
   */
  async searchDynamicTools(keywords, limit = 10) {
    if (this.dynamicToolsEnabled && this.dynamicTools) {
      return await this.dynamicTools.searchTools(keywords, limit);
    }
    return [];
  }

  /**
   * Get tools by category using Dynamic Tools Registry
   */
  async getDynamicToolsByCategory(categoryName) {
    if (this.dynamicToolsEnabled && this.dynamicTools) {
      return await this.dynamicTools.getToolsByCategory(categoryName);
    }
    return [];
  }

  /**
   * Get Dynamic Tools Registry integration status
   */
  getDynamicToolsStatus() {
    const settingsEnabled = this.configManager.get('chatboxSettings.enableDynamicToolsRegistry', true);
    return {
      enabled: settingsEnabled && this.dynamicToolsEnabled,
      settingsEnabled: settingsEnabled,
      limitSelection: this.configManager.get('chatboxSettings.limitDynamicToolsSelection', false),
      selectionLimit: this.getDynamicToolsSelectionLimit(),
      systemEnabled: this.dynamicToolsEnabled,
      initialized: this.dynamicTools !== null,
      status: this.dynamicTools ? this.dynamicTools.getIntegrationStatus() : null,
    };
  }

  getDynamicToolsSelectionLimit() {
    if (this.benchmarkAutomationActive === true) return 24;

    const shouldLimit = this.configManager.get('chatboxSettings.limitDynamicToolsSelection', true);
    if (!shouldLimit) return Infinity;

    const configuredLimit = Number(this.configManager.get('chatboxSettings.dynamicToolsSelectionLimit', 24));
    if (!Number.isFinite(configuredLimit) || configuredLimit < 1) return 24;

    return Math.floor(configuredLimit);
  }

  setupMCPServerEventHandlers() {
    this.mcpServerManager.on('serverConnected', data => {
      // [ChatManager] MCP Server connected
      // A reconnected server may serve different prompt content.
      this.invalidateMcpPromptCache(data?.serverId);
      this.updateMCPStatus('connected');
    });

    this.mcpServerManager.on('serverDisconnected', data => {
      // [ChatManager] MCP Server disconnected
      this.invalidateMcpPromptCache(data?.serverId);
      // Only update status to disconnected if no servers are connected
      if (this.mcpServerManager.getConnectedServersCount() === 0) {
        this.updateMCPStatus('disconnected');
      } else {
        // Update button state even if some servers are still connected
        this.updateMCPToggleButton();
      }
    });

    this.mcpServerManager.on('serverError', data => {
      data.server?.name || data.serverId || 'Unknown Server';
      // [ChatManager] MCP Server error
    });

    this.mcpServerManager.on('toolsUpdated', data => {
      // [ChatManager] Tools updated for server
      // Refresh the MCP tools list in the UI
      if (window.genomeBrowser && window.genomeBrowser.populateMCPToolsList) {
        setTimeout(() => {
          window.genomeBrowser.populateMCPToolsList();
        }, 100);
      }
    });
  }

  async checkAndSetupMCPConnection() {
    const defaultSettings = {
      allowAutoActivation: false, // NEW: Default to false to avoid unwanted connections
      autoConnect: false, // Default to false to avoid unwanted connections
      serverUrl: 'ws://localhost:3003',
      reconnectDelay: 5,
    };

    const mcpSettings = this.configManager ? this.configManager.get('mcpSettings', defaultSettings) : defaultSettings;

    if (mcpSettings.allowAutoActivation && mcpSettings.autoConnect) {
      this.setupMCPConnection();
    }
  }

  // Legacy single MCP connection (kept for backward compatibility)
  async setupMCPConnection(manualConnection = false) {
    const defaultSettings = {
      autoConnect: false,
      serverUrl: 'ws://localhost:3003',
      reconnectDelay: 5,
    };

    const mcpSettings = this.configManager ? this.configManager.get('mcpSettings', defaultSettings) : defaultSettings;

    try {
      // Update status to connecting
      this.updateMCPStatus('connecting');

      this.mcpSocket = new WebSocket(mcpSettings.serverUrl);

      this.mcpSocket.onopen = () => {
        // [ChatManager] Connected to legacy MCP server
        this.isConnected = true;
        this.updateMCPStatus('connected');

        // Send any pending messages
        this.pendingMessages.forEach(msg => this.sendToMCP(msg));
        this.pendingMessages = [];
      };

      this.mcpSocket.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          this.handleMCPMessage(data);
        } catch (error) {
          // [ChatManager] Error parsing MCP message
        }
      };

      this.mcpSocket.onclose = () => {
        // [ChatManager] Disconnected from legacy MCP server
        this.isConnected = false;
        this.updateMCPStatus('disconnected');

        // Only attempt to reconnect if this is not a manual connection and auto-activation is enabled
        if (!manualConnection) {
          const currentSettings = this.configManager
            ? this.configManager.get('mcpSettings', defaultSettings)
            : defaultSettings;

          if (currentSettings.allowAutoActivation && currentSettings.autoConnect) {
            setTimeout(() => this.setupMCPConnection(), mcpSettings.reconnectDelay * 1000);
          }
        }
      };

      this.mcpSocket.onerror = error => {
        // [ChatManager] Legacy MCP connection error
        this.updateMCPStatus('disconnected');
      };
    } catch (error) {
      // [ChatManager] Failed to setup legacy MCP connection
      this.updateMCPStatus('disconnected');
    }
  }

  disconnectMCP() {
    if (this.mcpSocket) {
      // [ChatManager] Manually disconnecting from legacy MCP server
      this.mcpSocket.close();
      this.mcpSocket = null;
    }
    this.isConnected = false;
    this.updateMCPStatus('disconnected');
  }

  // Update MCP status in the settings modal if it's open
  updateMCPStatus(status) {
    const statusIcon = document.getElementById('mcpStatusIcon');
    const statusText = document.getElementById('mcpStatusText');
    const connectBtn = document.getElementById('mcpConnectBtn');
    const disconnectBtn = document.getElementById('mcpDisconnectBtn');

    if (statusIcon && statusText) {
      statusIcon.className = 'fas fa-circle';

      switch (status) {
        case 'connected': {
          statusIcon.classList.add('connected');
          const connectedCount = this.mcpServerManager.getConnectedServersCount();
          statusText.textContent = connectedCount > 0 ? `Connected (${connectedCount} servers)` : 'Connected';
          if (connectBtn) connectBtn.disabled = true;
          if (disconnectBtn) disconnectBtn.disabled = false;
          break;
        }
        case 'connecting':
          statusIcon.classList.add('connecting');
          statusText.textContent = 'Connecting...';
          if (connectBtn) connectBtn.disabled = true;
          if (disconnectBtn) disconnectBtn.disabled = true;
          break;
        case 'disconnected':
        default:
          statusIcon.classList.add('disconnected');
          statusText.textContent = 'Disconnected';
          if (connectBtn) connectBtn.disabled = false;
          if (disconnectBtn) disconnectBtn.disabled = true;
          break;
      }
    }

    // Also update the toggle button in chat header
    this.updateMCPToggleButton();
  }

  /**
   * Toggle MCP connection
   */
  async toggleMCPConnection() {
    // Instead of toggling all servers, show a server list popup
    this.showMCPServerListPopup();
  }

  /**
   * Show MCP Server list popup
   */
  showMCPServerListPopup() {
    // Remove any existing popup
    const existingPopup = document.getElementById('mcpServerListPopup');
    if (existingPopup) {
      existingPopup.remove();
    }

    // Create popup
    const popup = document.createElement('div');
    popup.id = 'mcpServerListPopup';
    popup.className = 'mcp-server-list-popup';
    popup.innerHTML = `
            <div class="mcp-server-list-container">
                <div class="mcp-server-list-header">
                    <h3>MCP Servers</h3>
                    <button class="close-btn" onclick="document.getElementById('mcpServerListPopup').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="mcp-server-list-content">
                    <div id="mcpServerListItems"></div>
                </div>
                <div class="mcp-server-list-footer">
                    <button class="btn btn-sm btn-secondary" onclick="document.getElementById('mcpServerListPopup').remove()">
                        Close
                    </button>
                </div>
            </div>
        `;

    // Add popup to document
    document.body.appendChild(popup);

    // Populate server list
    this.populateMCPServerListPopup();
  }

  /**
   * Populate MCP Server list popup
   */
  populateMCPServerListPopup() {
    const serverList = document.getElementById('mcpServerListItems');
    if (!serverList) return;

    if (!this.mcpServerManager) {
      serverList.innerHTML = '<div class="empty-state">MCPServerManager not available</div>';
      return;
    }

    const servers = this.mcpServerManager.getServerStatus();

    if (servers.length === 0) {
      serverList.innerHTML = '<div class="empty-state">No MCP servers configured</div>';
      return;
    }

    serverList.innerHTML = '';

    servers.forEach(server => {
      const serverItem = document.createElement('div');
      serverItem.className = 'mcp-server-list-item';
      serverItem.innerHTML = `
                <div class="mcp-server-info">
                    <div class="mcp-server-name">${this.escapeHtml(server.name)}</div>
                    <div class="mcp-server-details">
                        <span class="mcp-server-url">${this.escapeHtml(server.url)}</span>
                        <span class="mcp-server-status ${server.connected ? 'connected' : 'disconnected'}">
                            ${server.connected ? '● Connected' : '○ Disconnected'}
                        </span>
                    </div>
                </div>
                <div class="mcp-server-controls">
                    <label class="toggle-label">
                        <input type="checkbox" 
                               class="mcp-server-toggle" 
                               data-server-id="${server.id}" 
                               ${server.enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                        <span class="toggle-text">${server.enabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                    <button class="btn btn-sm ${server.connected ? 'btn-secondary' : 'btn-primary'}" 
                            onclick="genomeBrowser.chatManager.toggleMCPServerConnection('${server.id}')">
                        ${server.connected ? 'Disconnect' : 'Connect'}
                    </button>
                </div>
            `;
      serverList.appendChild(serverItem);
    });

    // Add event listeners for enable/disable toggles
    const toggles = serverList.querySelectorAll('.mcp-server-toggle');
    toggles.forEach(toggle => {
      toggle.addEventListener('change', e => {
        const serverId = e.target.dataset.serverId;
        const enabled = e.target.checked;
        this.toggleMCPServerEnabled(serverId, enabled);
        e.target.nextElementSibling.nextElementSibling.textContent = enabled ? 'Enabled' : 'Disabled';
      });
    });
  }

  /**
   * Toggle MCP Server enabled state
   * @param {string} serverId - Server ID
   * @param {boolean} enabled - Enabled state
   */
  toggleMCPServerEnabled(serverId, enabled) {
    if (this.mcpServerManager) {
      this.mcpServerManager.updateServer(serverId, { enabled });
      this.showNotification(`${enabled ? 'Enabled' : 'Disabled'} server ${serverId}`, 'info');
    }
  }

  /**
   * Toggle connection to a specific MCP Server
   * @param {string} serverId - Server ID
   */
  async toggleMCPServerConnection(serverId) {
    if (!this.mcpServerManager) return;

    const server = this.mcpServerManager.getServer(serverId);
    if (!server) return;

    try {
      if (server.connected) {
        await this.mcpServerManager.disconnectFromServer(serverId);
        this.showNotification(`Disconnected from ${server.name}`, 'info');
      } else {
        await this.mcpServerManager.connectToServer(serverId);
        this.showNotification(`Connected to ${server.name}`, 'success');
      }
      // Refresh the server list
      this.populateMCPServerListPopup();
    } catch (error) {
      console.error(`Error toggling connection to server ${serverId}:`, error);
      this.showNotification(`Error: ${error.message}`, 'error');
    }
  }

  /**
   * Update MCP toggle button state
   */
  updateMCPToggleButton() {
    const toggleBtn = document.getElementById('mcpToggleBtn');
    if (!toggleBtn) return;

    // Check connection status
    let isConnected = false;
    let connectedCount = 0;

    // Check modern MCP server manager connections
    if (this.mcpServerManager) {
      connectedCount = this.mcpServerManager.getConnectedServersCount();
      isConnected = connectedCount > 0;
    }

    // Also check legacy connection
    if (!isConnected && this.isConnected) {
      isConnected = true;
      connectedCount = 1;
    }

    // Update button state
    toggleBtn.dataset.connected = isConnected.toString();

    // Update button title
    if (isConnected) {
      toggleBtn.title = `MCP Tools Enabled (${connectedCount} connection${connectedCount !== 1 ? 's' : ''})`;
    } else {
      toggleBtn.title = 'MCP Tools Disabled';
    }
  }

  /**
   * Update multi-agent toggle button appearance
   */
  updateMultiAgentToggleButton() {
    const button = document.getElementById('multiAgentToggleBtn');
    if (button) {
      // Use the internal state as the authoritative source
      const isEnabled = this.agentSystemEnabled;

      // Update button attributes
      button.setAttribute('data-enabled', isEnabled.toString());
      button.title = isEnabled ? 'Disable Multi-Agent System' : 'Enable Multi-Agent System';

      // Update button visual state
      button.classList.toggle('enabled', isEnabled);
      button.classList.toggle('active', isEnabled);

      // Update icon
      const icon = button.querySelector('i');
      if (icon) {
        icon.className = 'fas fa-users-cog';
      }

      // Update text content with shorter labels
      const textSpan = button.querySelector('.toggle-text');
      if (textSpan) {
        textSpan.textContent = isEnabled ? 'ON' : 'OFF';
      }

      // Apply visual styling based on state
      if (isEnabled) {
        button.style.backgroundColor = '#4CAF50';
        button.style.color = '#ffffff';
        button.style.border = '1px solid #4CAF50';
        button.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.3)';
      } else {
        button.style.backgroundColor = '#6c757d';
        button.style.color = '#ffffff';
        button.style.border = '1px solid #6c757d';
        button.style.boxShadow = 'none';
      }

      console.log(`🤖 Multi-Agent toggle button updated: ${isEnabled ? 'ON' : 'OFF'}`);
    }
  }

  /**
   * Event emitter functionality
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Remove event handler
   */
  off(eventType, handler) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  emit(eventType, data) {
    // Call local handlers
    if (this.eventHandlers.has(eventType)) {
      this.eventHandlers.get(eventType).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }

    // Emit to window for global event handling
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(`chatmanager-${eventType}`, {
          detail: data,
        })
      );
    }

    console.log(`🔔 ChatManager event: ${eventType}`, data);
  }

  handleMCPMessage(data) {
    switch (data.type) {
      case 'connection':
        this.clientId = data.clientId;
        console.log('Received client ID:', this.clientId);
        break;

      case 'execute-tool':
        this.executeToolRequest(data);
        break;

      case 'tool-response':
        // Handle responses from tool executions
        if (this.activeRequests.has(data.requestId)) {
          const resolve = this.activeRequests.get(data.requestId);
          this.activeRequests.delete(data.requestId);
          resolve(data);
        }
        break;
    }
  }

  async executeToolRequest(data) {
    const { requestId, toolName, parameters } = data;

    try {
      console.log(`📡 [MCP] Executing tool request: ${toolName}`);
      const result = await this.executeToolByName(toolName, parameters);

      // Send success response
      this.sendToMCP({
        type: 'tool-response',
        requestId: requestId,
        success: true,
        result: result,
      });
    } catch (error) {
      console.error(`❌ [MCP] Tool execution failed for ${toolName}:`, error);
      this.sendToMCP({
        type: 'tool-response',
        requestId: requestId,
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Execute a MicrobeGenomicsFunctions method with error handling
   */
  executeMicrobeFunction(methodName, parameters) {
    if (!this.MicrobeFns) {
      throw new Error('MicrobeGenomicsFunctions not available');
    }

    try {
      console.log(`Executing MicrobeFns.${methodName} with parameters:`, parameters);

      if (typeof this.MicrobeFns[methodName] !== 'function') {
        throw new Error(`Method ${methodName} not found in MicrobeGenomicsFunctions`);
      }

      // Handle different parameter patterns
      let result;
      if (!parameters || Object.keys(parameters).length === 0) {
        // No parameters
        result = this.MicrobeFns[methodName]();
      } else if (
        parameters.sequence ||
        parameters.dna ||
        parameters.dna_sequence ||
        parameters.protein ||
        parameters.protein_sequence
      ) {
        // Single sequence parameter — extract the actual string value
        const seq =
          parameters.sequence ||
          parameters.dna ||
          parameters.dna_sequence ||
          parameters.protein ||
          parameters.protein_sequence;
        if (typeof seq !== 'string') {
          throw new Error(
            `Expected a sequence string but received ${typeof seq}. Provide a 'sequence' parameter with a string value.`
          );
        }
        if (methodName === 'calculateMolecularWeight') {
          result = this.MicrobeFns[methodName](seq, parameters.type || 'auto');
        } else if (methodName === 'translateDNA') {
          const frame =
            parameters.frame !== undefined
              ? Number(parameters.frame)
              : parameters.reading_frame !== undefined
                ? Math.max(0, Number(parameters.reading_frame) - 1)
                : 0;
          result = this.MicrobeFns[methodName](seq, frame);
        } else {
          result = this.MicrobeFns[methodName](seq);
        }
      } else if (parameters.chromosome && parameters.start && parameters.end) {
        // Position-based parameters
        result = this.MicrobeFns[methodName](parameters.chromosome, parameters.start, parameters.end);
      } else if (parameters.geneName || parameters.name) {
        // Gene name parameter
        result = this.MicrobeFns[methodName](parameters.geneName || parameters.name);
      } else {
        // Pass all parameters as individual arguments or as object
        const paramKeys = Object.keys(parameters);
        if (paramKeys.length === 1) {
          result = this.MicrobeFns[methodName](parameters[paramKeys[0]]);
        } else {
          // Try passing parameters as individual arguments in common patterns
          const values = Object.values(parameters);
          result = this.MicrobeFns[methodName](...values);
        }
      }

      console.log(`MicrobeFns.${methodName} result:`, result);

      // Wrap result in success format if it's not already an object
      if (typeof result !== 'object' || result === null) {
        return {
          success: true,
          value: result,
          method: methodName,
          parameters: parameters,
        };
      }

      return {
        success: true,
        ...result,
        method: methodName,
        parameters: parameters,
      };
    } catch (error) {
      console.error(`Error executing MicrobeFns.${methodName}:`, error);
      throw new Error(`MicrobeGenomics function ${methodName} failed: ${error.message}`);
    }
  }

  /**
   * Normalize a coordinate supplied by an LLM tool call into base pairs.
   *
   * Models echo the user's own shorthand into numeric parameters — "2M",
   * "1.5 kb", "1,000,000" — and a plain Number()/parseInt() either yields NaN
   * or, worse, silently keeps the leading digits ("2M" -> 2), which navigates
   * to the wrong end of the genome without any visible error.
   *
   * @param {number|string|undefined|null} value
   * @returns {number|undefined} Position in base pairs, or undefined if unparsable
   */
  parseGenomicCoordinate(value) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : undefined;

    const text = String(value)
      .trim()
      .replace(/[,_\s]/g, '');
    const match = text.match(/^([+-]?\d*\.?\d+)(bp|b|kb|k|mb|m|gb|g)?$/i);
    if (!match) return undefined;

    const scale = { '': 1, b: 1, bp: 1, k: 1e3, kb: 1e3, m: 1e6, mb: 1e6, g: 1e9, gb: 1e9 };
    const scaled = parseFloat(match[1]) * scale[(match[2] || '').toLowerCase()];
    return Number.isFinite(scaled) ? Math.round(scaled) : undefined;
  }

  // Tool implementations
  async navigateToPosition(params) {
    let { chromosome } = params;

    if (!this.app || !this.app.navigationManager) {
      throw new Error('NavigationManager not available');
    }

    // Coordinates arrive as numbers, shorthand strings ("2M"), or grouped
    // digits ("2,000,000") depending on the model and the user's phrasing.
    const coordinate = (name, raw) => {
      const parsed = this.parseGenomicCoordinate(raw);
      if (parsed === undefined && raw !== undefined && raw !== null && raw !== '') {
        throw new Error(
          `Invalid ${name} coordinate "${raw}". Use base pairs (2000000) or shorthand such as 2M, 2Mb, 500kb.`
        );
      }
      return parsed;
    };

    let start = coordinate('start', params.start);
    let end = coordinate('end', params.end);
    const position = coordinate('position', params.position);

    if (!chromosome) {
      const chromosomeSelect = document.getElementById('chromosomeSelect');
      if (chromosomeSelect && chromosomeSelect.value) {
        chromosome = chromosomeSelect.value;
      } else if (this.app.currentSequence) {
        const availableChromosomes = Object.keys(this.app.currentSequence);
        if (availableChromosomes.length > 0) {
          chromosome = availableChromosomes[0];
        }
      }
      if (!chromosome) {
        throw new Error(
          'No chromosome specified and unable to auto-detect current chromosome. Please load genome data first.'
        );
      }
    }

    if (position !== undefined && (start === undefined || end === undefined)) {
      const defaultRange = 2000;
      start = Math.max(1, position - Math.floor(defaultRange / 2));
      end = position + Math.floor(defaultRange / 2);
    }

    if (start !== undefined && (end === undefined || start === end)) {
      const halfRange = 1000;
      start = Math.max(1, start - halfRange);
      end = start + 2 * halfRange;
    }

    if (start === undefined || end === undefined) {
      throw new Error('Missing required parameters: either (start, end) or position');
    }

    const result = this.app.navigationManager.navigateToPosition(chromosome, start, end);

    // NavigationManager rejects unknown chromosomes and out-of-range positions.
    // Report its error verbatim: a failure described as "Navigated to ..." tells
    // the agent nothing it can correct on the next round.
    if (!result || result.success === false) {
      const error = result?.error || `Navigation to ${chromosome}:${start}-${end} failed`;
      return {
        success: false,
        chromosome,
        start,
        end,
        error,
        message: error,
        ...(result?.availableChromosomes ? { availableChromosomes: result.availableChromosomes } : {}),
      };
    }

    const resolvedChromosome = result.chromosome || chromosome;

    return {
      success: true,
      chromosome: resolvedChromosome,
      start,
      end,
      message: `Navigated to ${resolvedChromosome}:${start}-${end}`,
      usedDefaultRange: position !== undefined && (params.start === undefined || params.end === undefined),
      ...(result.requestedChromosome && result.requestedChromosome !== resolvedChromosome
        ? { requestedChromosome: result.requestedChromosome }
        : {}),
    };
  }

  async openNewTab(params) {
    const { chromosome, start, end, position, title, geneName } = params;

    console.log('🔧 [ChatManager] openNewTab called with params:', params);

    try {
      // Use window.genomeBrowser instead of this.app for access
      const genomeBrowser = window.genomeBrowser;
      if (!genomeBrowser) {
        throw new Error('Genome browser not available via window.genomeBrowser');
      }

      // Wait for TabManager to be initialized with retry mechanism
      if (!genomeBrowser.tabManager) {
        console.log('⏳ TabManager not ready, waiting...');
        // Wait for TabManager with retry logic
        let retries = 0;
        const maxRetries = 10;
        while (!genomeBrowser.tabManager && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 200));
          retries++;
          console.log(`⏳ Waiting for TabManager... attempt ${retries}/${maxRetries}`);
        }

        if (!genomeBrowser.tabManager) {
          throw new Error('Tab manager not available after waiting - check TabManager initialization');
        }
      }

      let tabId;
      let finalTitle = title;
      let usedDefaultRange = false;

      // Handle different ways to create a new tab
      if (geneName) {
        // Open tab for specific gene
        const geneResults = await this.searchFeatures({ query: geneName, caseSensitive: false });
        if (geneResults.count > 0 && geneResults.results.length > 0) {
          const gene = geneResults.results[0];
          // Use the UI response function instead of direct manager access
          tabId = genomeBrowser.tabManager.createTabForGene(gene, 500, finalTitle);
          finalTitle = finalTitle || `Gene: ${gene.name || gene.id || geneName}`;
        } else {
          throw new Error(`Gene '${geneName}' not found`);
        }
      } else if (chromosome) {
        // Open tab for specific position
        let finalStart = start;
        let finalEnd = end;

        // Handle position parameter with default 2000bp range
        if (position !== undefined && (start === undefined || end === undefined)) {
          const defaultRange = 2000;
          finalStart = Math.max(1, position - Math.floor(defaultRange / 2));
          finalEnd = position + Math.floor(defaultRange / 2);
          usedDefaultRange = true;
          console.log(`Using position ${position} with default ${defaultRange}bp range: ${finalStart}-${finalEnd}`);
        }

        // Handle start=end or start-only: center on position with ~2kb window (±1kb)
        if (start !== undefined && (end === undefined || start === end)) {
          const center = start;
          const halfRange = 1000;
          finalStart = Math.max(1, center - halfRange);
          finalEnd = center + halfRange;
          usedDefaultRange = true;
          console.log(`Centering on position ${center} with ±${halfRange}bp range: ${finalStart}-${finalEnd}`);
        }

        // Check if chromosome exists before defaulting any coordinates.
        if (!genomeBrowser.currentSequence || !genomeBrowser.currentSequence[chromosome]) {
          throw new Error(`Chromosome ${chromosome} not found in loaded genome data`);
        }

        // A chromosome-only call (no start/end/position) legitimately means
        // "open a tab for the current view" when that chromosome is the one
        // being displayed; default to the current view range instead of
        // failing the tool for a perfectly reasonable request.
        if (!finalStart || !finalEnd) {
          const currentPosition = genomeBrowser.currentPosition;
          if (
            genomeBrowser.currentChromosome === chromosome &&
            currentPosition &&
            Number.isFinite(currentPosition.start) &&
            Number.isFinite(currentPosition.end)
          ) {
            finalStart = currentPosition.start;
            finalEnd = currentPosition.end;
            console.log(`[ChatManager] openNewTab chromosome-only: using current view ${finalStart}-${finalEnd}`);
          }
        }

        if (finalStart && finalEnd) {
          // Use the UI response function instead of direct manager access
          tabId = genomeBrowser.tabManager.createTabForPosition(chromosome, finalStart, finalEnd, finalTitle);
          finalTitle = finalTitle || `${chromosome}:${finalStart.toLocaleString()}-${finalEnd.toLocaleString()}`;
        } else {
          throw new Error('Missing required parameters: start and end positions, or position parameter');
        }
      } else {
        // Use the same TabManager operation as the + button while preserving a supplied title.
        tabId = genomeBrowser.tabManager.createNewTab(finalTitle);
        finalTitle = finalTitle || genomeBrowser.tabManager.tabStates?.get(tabId)?.title || 'New Tab';
      }

      if (!tabId) {
        throw new Error('Tab manager did not create a new tab');
      }

      console.log(`✅ [ChatManager] Successfully created new tab: ${tabId} - ${finalTitle}`);

      return {
        success: true,
        tabId: tabId,
        title: finalTitle,
        message: `Opened new tab: ${finalTitle}`,
        usedDefaultRange: usedDefaultRange,
      };
    } catch (error) {
      console.error('❌ [ChatManager] Error opening new tab:', error);
      throw error;
    }
  }

  // NOTE: switchToTab is defined below (after closeTab) as the single authoritative implementation.
  // A previous duplicate definition here was removed — it incorrectly treated
  // TabManager.tabs entries (DOM elements) as state objects with .title properties.

  /**
   * Close a specific tab by ID, name, or index - Built-in function tool
   * @param {Object} params - Tool parameters
   * @param {string} params.tab_id - Specific tab ID to close
   * @param {string} params.tab_name - Tab name/title to search for (partial matching)
   * @param {number} params.tab_index - Zero-based index of tab to close
   * @param {string} params.clientId - Optional client identifier
   * @returns {Object} Close result
   */
  async closeTab(params = {}) {
    const { tab_id, tab_name, tab_index, clientId } = params || {};

    console.log('🔧 [ChatManager] closeTab called with params:', params);

    try {
      // Use window.genomeBrowser instead of this.app for access
      const genomeBrowser = window.genomeBrowser;
      if (!genomeBrowser) {
        throw new Error('Genome browser not available via window.genomeBrowser');
      }

      // Wait for TabManager to be initialized with retry mechanism
      if (!genomeBrowser.tabManager) {
        console.log('⏳ TabManager not ready, waiting...');
        let retries = 0;
        const maxRetries = 10;
        while (!genomeBrowser.tabManager && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 200));
          retries++;
          console.log(`⏳ Waiting for TabManager... attempt ${retries}/${maxRetries}`);
        }

        if (!genomeBrowser.tabManager) {
          throw new Error('Tab manager not available after waiting - check TabManager initialization');
        }
      }

      const tabManager = genomeBrowser.tabManager;

      // Prevent closing the last tab
      if (tabManager.tabs.size <= 1) {
        throw new Error('Cannot close the last remaining tab');
      }

      let targetTabId = null;
      let targetTabTitle = null;
      const tabEntries = Array.from(tabManager.tabs.entries());

      // Strategy 1: Close by specific tab ID
      if (tab_id) {
        if (tabManager.tabs.has(tab_id)) {
          targetTabId = tab_id;
          const tabState = tabManager.tabStates?.get(tab_id);
          targetTabTitle = tabState?.title || `Tab ${tab_id}`;
        } else {
          throw new Error(`Tab with ID '${tab_id}' not found`);
        }
      }
      // Strategy 2: Close by tab name/title (case-insensitive partial matching)
      else if (tab_name) {
        const foundTab = tabEntries.find(([tabId, tabElement]) => {
          const tabState = tabManager.tabStates?.get(tabId);
          if (tabState?.title) {
            return tabState.title.toLowerCase().includes(tab_name.toLowerCase());
          }
          return false;
        });

        if (foundTab) {
          targetTabId = foundTab[0];
          targetTabTitle = tabManager.tabStates?.get(targetTabId)?.title;
        } else {
          throw new Error(`No tab found matching name '${tab_name}'`);
        }
      }
      // Strategy 3: Close by tab index (zero-based)
      else if (tab_index !== undefined) {
        const tabIds = Array.from(tabManager.tabs.keys());
        if (tab_index >= 0 && tab_index < tabIds.length) {
          targetTabId = tabIds[tab_index];
          const tabState = tabManager.tabStates?.get(targetTabId);
          targetTabTitle = tabState?.title || `Tab ${targetTabId}`;
        } else {
          throw new Error(`Tab index ${tab_index} is out of range (0-${tabIds.length - 1})`);
        }
      }
      // Strategy 4: If no parameters are provided, default to currently active tab
      else {
        targetTabId = tabManager.activeTabId;
        if (targetTabId && tabManager.tabs.has(targetTabId)) {
          const tabState = tabManager.tabStates?.get(targetTabId);
          targetTabTitle = tabState?.title || `Tab ${targetTabId}`;
        } else {
          throw new Error('No active tab to close');
        }
      }

      // Perform the tab close
      if (targetTabId) {
        tabManager.closeTab(targetTabId);

        console.log(`✅ [ChatManager] Successfully closed tab: ${targetTabId} - ${targetTabTitle}`);

        return {
          success: true,
          closed_tab_id: targetTabId,
          closed_tab_title: targetTabTitle,
          remaining_tabs: tabManager.tabs.size,
          message: `Closed tab: ${targetTabTitle}`,
          clientId: clientId,
        };
      } else {
        throw new Error('Failed to identify target tab');
      }
    } catch (error) {
      console.error('❌ [ChatManager] Error closing tab:', error);
      return {
        success: false,
        error: error.message,
        clientId: clientId,
      };
    }
  }

  /**
   * Switch to a specific tab by ID, name, or index
   */
  async switchToTab(params) {
    const { tab_id, tab_name, tab_index } = params;

    console.log('🔧 [ChatManager] switchToTab called with params:', params);

    try {
      // Use window.genomeBrowser instead of this.app for access
      const genomeBrowser = window.genomeBrowser;
      if (!genomeBrowser) {
        throw new Error('Genome browser not available via window.genomeBrowser');
      }

      // Wait for TabManager to be initialized
      if (!genomeBrowser.tabManager) {
        console.log('⏳ TabManager not ready, waiting...');
        let retries = 0;
        const maxRetries = 10;
        while (!genomeBrowser.tabManager && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 200));
          retries++;
          console.log(`⏳ Waiting for TabManager... attempt ${retries}/${maxRetries}`);
        }

        if (!genomeBrowser.tabManager) {
          throw new Error('Tab manager not available after waiting - check TabManager initialization');
        }
      }

      // Get current active tab for reference
      const previousTabId = genomeBrowser.tabManager.activeTabId;
      let targetTabId = null;
      let targetTabTitle = null;

      // Strategy 1: Switch by specific tab ID
      if (tab_id) {
        if (genomeBrowser.tabManager.tabs.has(tab_id)) {
          targetTabId = tab_id;
          const tabState = genomeBrowser.tabManager.tabStates.get(tab_id);
          targetTabTitle = tabState?.title || 'Unknown';
        } else {
          throw new Error(`Tab with ID '${tab_id}' not found`);
        }
      }
      // Strategy 2: Switch by tab name/title
      else if (tab_name) {
        const tabEntries = Array.from(genomeBrowser.tabManager.tabStates.entries());
        const foundTab = tabEntries.find(
          ([tabId, tabState]) => tabState.title && tabState.title.toLowerCase().includes(tab_name.toLowerCase())
        );

        if (foundTab) {
          targetTabId = foundTab[0];
          targetTabTitle = foundTab[1].title;
        } else {
          throw new Error(`Tab with name containing '${tab_name}' not found`);
        }
      }
      // Strategy 3: Switch by tab index
      else if (tab_index !== undefined) {
        const tabIds = Array.from(genomeBrowser.tabManager.tabs.keys());
        if (tab_index >= 0 && tab_index < tabIds.length) {
          targetTabId = tabIds[tab_index];
          const tabState = genomeBrowser.tabManager.tabStates.get(targetTabId);
          targetTabTitle = tabState?.title || 'Unknown';
        } else {
          throw new Error(`Tab index ${tab_index} is out of range (0-${tabIds.length - 1})`);
        }
      } else {
        throw new Error('Must provide either tab_id, tab_name, or tab_index');
      }

      // Perform the tab switch
      genomeBrowser.tabManager.switchToTab(targetTabId);

      console.log(`✅ [ChatManager] Successfully switched to tab: ${targetTabId} - ${targetTabTitle}`);

      return {
        success: true,
        tab_id: targetTabId,
        tab_title: targetTabTitle,
        previous_tab_id: previousTabId,
        message: `Switched to tab: ${targetTabTitle}`,
      };
    } catch (error) {
      console.error('❌ [ChatManager] Error switching tab:', error);
      throw error;
    }
  }

  async searchFeatures(params) {
    const { query, caseSensitive } = params;

    // Log tool detection as requested by Song
    console.log('🔍 [Tool Detection] search_features tool called with params:', params);
    console.log(
      '🔍 [Tool Detection] Detected tool: search_features, parameters: query="' +
        query +
        '", caseSensitive=' +
        (caseSensitive || false)
    );

    console.log('searchFeatures called with params:', params);

    // Use existing search functionality from NavigationManager
    if (this.app && this.app.navigationManager) {
      console.log('Using navigationManager.performSearch');

      // Store original settings
      const originalCaseSensitive = document.getElementById('caseSensitive')?.checked;

      // Set case sensitivity for this search
      const caseSensitiveCheckbox = document.getElementById('caseSensitive');
      if (caseSensitiveCheckbox) {
        caseSensitiveCheckbox.checked = caseSensitive || false;
      }

      // Perform the search
      this.app.navigationManager.performSearch(query);

      // Get the results from NavigationManager
      const searchResults = this.app.navigationManager.searchResults || [];

      // Auto-scroll sidebar to search results panel (similar to Gene Details)
      if (searchResults.length > 0 && this.app.scrollSidebarToSection) {
        const searchResultsSection = document.getElementById('searchResultsSection');
        if (searchResultsSection) {
          this.app.scrollSidebarToSection(searchResultsSection);
          console.log('🔄 Auto-scrolled sidebar to search results panel');
        }
      }

      // Restore original setting
      if (caseSensitiveCheckbox && originalCaseSensitive !== undefined) {
        caseSensitiveCheckbox.checked = originalCaseSensitive;
      }

      console.log('Search completed, results:', searchResults);

      // CRITICAL FIX: Filter results to remove verbose data and prevent token overflow
      const optimizedResults = searchResults.map(result => {
        if (result.annotation) {
          // Return only essential annotation data, excluding verbose note field
          return {
            ...result,
            annotation: {
              start: result.annotation.start,
              end: result.annotation.end,
              type: result.annotation.type,
              strand: result.annotation.strand,
              qualifiers: {
                gene: result.annotation.qualifiers?.gene,
                locus_tag: result.annotation.qualifiers?.locus_tag,
                product: result.annotation.qualifiers?.product,
                // NOTE: Intentionally excluding 'note' field to prevent token overflow
              },
            },
          };
        }
        return result;
      });

      console.log(
        '🔍 [Tool Detection] search_features completed, returning',
        optimizedResults.length,
        'optimized results (note fields excluded)'
      );

      return {
        query: query,
        caseSensitive: caseSensitive || false,
        results: optimizedResults, // Return optimized results instead of raw results
        count: optimizedResults.length,
        optimization_note: 'Results optimized to exclude verbose note fields for token efficiency',
      };
    }

    throw new Error('Navigation manager not available');
  }

  async searchGeneByName(params) {
    const { name } = params;

    console.log('searchGeneByName called with params:', params);

    if (!this.app || !this.app.navigationManager) {
      throw new Error('Navigation manager not available');
    }

    // Use improved gene search logic with relevance scoring
    const searchResults = this.performIntelligentGeneSearch(name);

    // Display results in sidebar using NavigationManager's populateSearchResults
    this.app.navigationManager.searchResults = searchResults;
    this.app.navigationManager.populateSearchResults(searchResults, name);

    // Auto-scroll sidebar to search results panel (similar to Gene Details)
    if (searchResults.length > 0 && this.app.scrollSidebarToSection) {
      const searchResultsSection = document.getElementById('searchResultsSection');
      if (searchResultsSection) {
        this.app.scrollSidebarToSection(searchResultsSection);
        console.log('🔄 Auto-scrolled sidebar to search results panel');
      }
    }

    console.log('Intelligent gene search completed, results:', searchResults);

    return {
      name: name,
      results: searchResults,
      count: searchResults.length,
      success: true,
    };
  }

  /**
   * Perform intelligent gene search with relevance scoring and filtering
   */
  performIntelligentGeneSearch(geneName) {
    if (!this.app || !this.app.currentAnnotations) {
      return [];
    }

    const currentChr = document.getElementById('chromosomeSelect')?.value;
    if (!currentChr || !this.app.currentAnnotations[currentChr]) {
      return [];
    }

    const annotations = this.app.currentAnnotations[currentChr];
    const searchTerm = geneName.toLowerCase();
    const results = [];

    console.log(`🔍 Intelligent search for gene: "${geneName}"`);
    console.log(`📊 Searching in ${annotations.length} annotations`);

    annotations.forEach(annotation => {
      if (!annotation.qualifiers) return;

      const geneNameValue = this.app.getQualifierValue(annotation.qualifiers, 'gene') || '';
      const locusTag = this.app.getQualifierValue(annotation.qualifiers, 'locus_tag') || '';
      const product = this.app.getQualifierValue(annotation.qualifiers, 'product') || '';
      const note = this.app.getQualifierValue(annotation.qualifiers, 'note') || '';

      // Debug logging for problematic values
      if (
        typeof geneNameValue !== 'string' ||
        typeof locusTag !== 'string' ||
        typeof product !== 'string' ||
        typeof note !== 'string'
      ) {
        console.warn('Non-string qualifier values found:', {
          gene: { value: geneNameValue, type: typeof geneNameValue },
          locus_tag: { value: locusTag, type: typeof locusTag },
          product: { value: product, type: typeof product },
          note: { value: note, type: typeof note },
        });
      }

      // Calculate relevance score with error handling
      let relevanceScore;
      try {
        relevanceScore = this.calculateGeneRelevanceScore(
          searchTerm,
          geneNameValue,
          locusTag,
          product
          // Note: removed note parameter to reduce token usage
        );
      } catch (error) {
        console.error('Error calculating relevance score for annotation:', {
          geneName: geneNameValue,
          locusTag: locusTag,
          product: product,
          note: note,
          error: error.message,
        });
        // Skip this annotation if there's an error
        return;
      }

      // Only include results with meaningful relevance (score > 0)
      if (relevanceScore && relevanceScore.score > 0) {
        const result = {
          type: 'gene',
          position: annotation.start,
          end: annotation.end,
          name: geneNameValue || locusTag || annotation.type,
          details: `${annotation.type}: ${product || 'No description'}`,
          // Remove full annotation object to reduce token usage
          // Only include essential annotation data without note information
          annotation: {
            start: annotation.start,
            end: annotation.end,
            type: annotation.type,
            strand: annotation.strand,
            qualifiers: {
              gene: geneNameValue,
              locus_tag: locusTag,
              product: product,
              // Note: intentionally excluding 'note' field to reduce token usage
            },
          },
          relevanceScore: relevanceScore.score,
          matchType: relevanceScore.matchType,
          matchedField: relevanceScore.matchedField,
        };

        results.push(result);
        console.log(
          `✅ Found match: ${result.name} (score: ${relevanceScore.score}, type: ${relevanceScore.matchType})`
        );
      }
    });

    // Sort by relevance score (highest first), then by position
    results.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.position - b.position;
    });

    // Limit results to most relevant ones (max 20 for gene search)
    const limitedResults = results.slice(0, 20);

    console.log(`📈 Search completed: ${limitedResults.length} relevant results found`);
    console.log(
      `🎯 Top results:`,
      limitedResults.slice(0, 5).map(r => `${r.name} (${r.relevanceScore})`)
    );

    return limitedResults;
  }

  /**
   * Calculate relevance score for gene search
   */
  calculateGeneRelevanceScore(searchTerm, geneName, locusTag, product) {
    let maxScore = 0;
    let matchType = 'none';
    let matchedField = '';

    const fields = [
      { name: 'gene', value: geneName, weight: 100 },
      { name: 'locus_tag', value: locusTag, weight: 80 },
      { name: 'product', value: product, weight: 20 },
      // Note: removed 'note' field to reduce token usage and improve search relevance
    ];

    fields.forEach(field => {
      if (!field.value) return;

      // Ensure field.value is a string and convert to lowercase
      let fieldValue;
      if (typeof field.value === 'string') {
        fieldValue = field.value.toLowerCase();
      } else if (Array.isArray(field.value)) {
        // Handle array values (join them)
        fieldValue = field.value.join(' ').toLowerCase();
      } else if (typeof field.value === 'object' && field.value !== null) {
        // Handle object values (convert to string)
        fieldValue = String(field.value).toLowerCase();
      } else {
        // Handle other types (numbers, booleans, etc.)
        fieldValue = String(field.value).toLowerCase();
      }

      let score = 0;
      let type = 'none';

      // Exact match (highest priority)
      if (fieldValue === searchTerm) {
        score = field.weight * 10;
        type = 'exact';
      }
      // Starts with search term
      else if (fieldValue.startsWith(searchTerm)) {
        score = field.weight * 8;
        type = 'starts_with';
      }
      // Ends with search term
      else if (fieldValue.endsWith(searchTerm)) {
        score = field.weight * 6;
        type = 'ends_with';
      }
      // Contains search term as whole word
      else if (new RegExp(`\\b${searchTerm}\\b`).test(fieldValue)) {
        score = field.weight * 5;
        type = 'whole_word';
      }
      // Contains search term (partial match)
      else if (fieldValue.includes(searchTerm)) {
        score = field.weight * 2;
        type = 'partial';
      }
      // Fuzzy match for gene names (allow some character differences)
      else if (field.name === 'gene' || field.name === 'locus_tag') {
        const fuzzyScore = this.calculateFuzzyMatch(searchTerm, fieldValue);
        if (fuzzyScore > 0.7) {
          // 70% similarity threshold
          score = field.weight * fuzzyScore;
          type = 'fuzzy';
        }
      }

      if (score > maxScore) {
        maxScore = score;
        matchType = type;
        matchedField = field.name;
      }
    });

    return {
      score: maxScore,
      matchType: matchType,
      matchedField: matchedField,
    };
  }

  /**
   * Calculate fuzzy match score between two strings
   */
  calculateFuzzyMatch(str1, str2) {
    if (str1.length === 0) return str2.length === 0 ? 1 : 0;
    if (str2.length === 0) return 0;

    const matrix = [];

    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }

  /**
   * Names of every sequence in the loaded genome, exactly as keyed internally.
   * These are the only valid values for a `chromosome` tool parameter.
   */
  getAvailableChromosomeNames() {
    const sequences = this.app?.currentSequence;
    return sequences && typeof sequences === 'object' ? Object.keys(sequences) : [];
  }

  /**
   * Render the loaded sequence names for a system prompt. Fragmented assemblies
   * can carry thousands of contigs, so the list is capped — get_chromosome_list
   * remains the complete, paginated source.
   */
  formatAvailableChromosomesForPrompt(names, limit = 25) {
    const list = Array.isArray(names) ? names.filter(Boolean) : [];
    if (list.length === 0) return 'None loaded';
    const shown = list.slice(0, limit).join(', ');
    return list.length > limit
      ? `${shown} (+${list.length - limit} more, use get_chromosome_list for the full list)`
      : shown;
  }

  getCurrentState() {
    if (!this.app) {
      throw new Error('Genome browser not initialized');
    }

    // Debug logging to understand the app state
    // console.log('ChatManager getCurrentState - this.app:', this.app);
    // console.log('ChatManager getCurrentState - this.app.currentChromosome:', this.app.currentChromosome);
    // console.log('ChatManager getCurrentState - this.app.currentAnnotations:', this.app.currentAnnotations);
    // console.log('ChatManager getCurrentState - this.app.currentPosition:', this.app.currentPosition);

    const chromosomeNames = this.getAvailableChromosomeNames();

    const state = {
      // Multi-window support: include window identifier
      windowId: this.app.windowId || null,
      currentChromosome: this.app.currentChromosome,
      // Capped: a fragmented assembly can hold thousands of contigs, and this
      // state object is serialized into prompts and tool results.
      availableChromosomes: chromosomeNames.slice(0, 50),
      availableChromosomeCount: chromosomeNames.length,
      currentPosition: this.app.currentPosition,
      visibleTracks: this.getVisibleTracks(),
      loadedFiles: this.app.loadedFiles || [],
      sequenceLength: this.app.sequenceLength || 0,
      annotationsCount: (this.app.currentAnnotations || []).length,
      userDefinedFeaturesCount: Object.keys(this.app.userDefinedFeatures || {}).length,

      // Enhanced: Add working directory information
      workingDirectory: {
        current: this.getCurrentWorkingDirectory(),
        timestamp: new Date().toISOString(),
      },

      // Enhanced: Add selected gene information
      selectedGene: this.app.selectedGene
        ? {
            geneName: this.app.selectedGene.gene?.qualifiers?.gene || 'Unknown',
            locusTag: this.app.selectedGene.gene?.qualifiers?.locus_tag || 'Unknown',
            product: this.app.selectedGene.gene?.qualifiers?.product || 'Unknown',
            position: `${this.app.selectedGene.gene?.start}-${this.app.selectedGene.gene?.end}`,
            strand: this.app.selectedGene.gene?.strand === -1 ? '-' : '+',
            type: this.app.selectedGene.gene?.type || 'Unknown',
            hasOperonInfo: !!this.app.selectedGene.operonInfo,
          }
        : null,

      // Enhanced: Add sequence selection information
      sequenceSelection: this.app.sequenceSelection
        ? {
            active: this.app.sequenceSelection.active,
            start: this.app.sequenceSelection.start,
            end: this.app.sequenceSelection.end,
            length:
              this.app.sequenceSelection.active && this.app.sequenceSelection.start && this.app.sequenceSelection.end
                ? this.app.sequenceSelection.end - this.app.sequenceSelection.start + 1
                : null,
          }
        : null,

      // Enhanced: Add current viewing region details
      viewingRegion: this.app.currentPosition
        ? {
            chromosome: this.app.currentChromosome,
            start: this.app.currentPosition.start,
            end: this.app.currentPosition.end,
            length: this.app.currentPosition.end - this.app.currentPosition.start + 1,
            centerPosition: Math.floor((this.app.currentPosition.start + this.app.currentPosition.end) / 2),
          }
        : null,

      // Enhanced: Add open tabs information
      openTabs: this.getOpenTabsInfo(),
    };

    console.log('ChatManager getCurrentState - final state:', state);
    return state;
  }

  /**
   * Get information about all open tabs
   * @returns {Array} Array of tab objects with id, title, position, chromosome, and isActive
   */
  getOpenTabsInfo() {
    try {
      if (!this.app?.tabManager?.tabs) {
        return [];
      }

      const activeTabId = this.app.tabManager.activeTabId;
      const tabs = [];

      for (const [tabId, tabState] of this.app.tabManager.tabs.entries()) {
        tabs.push({
          id: tabId,
          title: tabState.title || `Tab ${tabId}`,
          chromosome: tabState.chromosome || this.app.currentChromosome,
          position: tabState.position
            ? {
                start: tabState.position.start,
                end: tabState.position.end,
              }
            : null,
          isActive: tabId === activeTabId,
          index: tabs.length,
        });
      }

      return tabs;
    } catch (error) {
      console.warn('Error getting open tabs info:', error);
      return [];
    }
  }

  async getSequence(params) {
    return this.services.analysis.getSequence(params);
  }

  async calcRegionGc(params) {
    return this.services.analysis.calcRegionGc(params);
  }

  async toggleTrack(params) {
    // Support both camelCase and snake_case parameter names
    const trackName = params.trackName || params.track_name;
    let visible = params.visible;
    const action = params.action || params.actionType || params.action_type || params.state || params.visibility;

    if (!trackName) {
      throw new Error('trackName or track_name parameter is required');
    }

    if (typeof visible === 'string') {
      const normalizedVisible = visible.trim().toLowerCase();
      if (['true', 'show', 'shown', 'visible', 'on', 'enable', 'enabled', 'display'].includes(normalizedVisible)) {
        visible = true;
      } else if (['false', 'hide', 'hidden', 'off', 'disable', 'disabled'].includes(normalizedVisible)) {
        visible = false;
      } else {
        throw new Error('Invalid visible parameter. Must be boolean or a show/hide string');
      }
    }

    // Convert action to visible if visible is not specified
    if (visible === undefined && action) {
      const normalizedAction = String(action).trim().toLowerCase();
      if (['show', 'shown', 'display', 'visible', 'on', 'enable', 'enabled', 'true'].includes(normalizedAction)) {
        visible = true;
      } else if (['hide', 'hidden', 'off', 'disable', 'disabled', 'false'].includes(normalizedAction)) {
        visible = false;
      } else if (['toggle', 'switch'].includes(normalizedAction)) {
        visible = undefined;
      } else {
        throw new Error('Invalid action parameter. Must be "show", "hide", "toggle", or a recognized synonym');
      }
    }

    // Map track names to checkbox IDs
    const trackMapping = {
      genes: 'trackGenes',
      gc: 'trackGC',
      gc_content: 'trackGC',
      variants: 'trackVariants',
      reads: 'trackReads',
      proteins: 'trackProteins',
      primers: 'trackPrimers',
      primer: 'trackPrimers',
      wigtracks: 'trackWIG',
      wigTracks: 'trackWIG',
      sequence: 'trackSequence',
      actions: 'trackActions',
      action: 'trackActions',
      blast: 'trackBlast',
      blast_results: 'trackBlast',
    };

    const normalizedTrackName = String(trackName)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const trackAliases = {
      gccontent: 'gc_content',
      gc_content_track: 'gc_content',
      gc_track: 'gc',
      genes_track: 'genes',
      gene_track: 'genes',
      variants_track: 'variants',
      variant_track: 'variants',
      reads_track: 'reads',
      read_track: 'reads',
      proteins_track: 'proteins',
      protein_track: 'proteins',
      primers_track: 'primers',
      primer_track: 'primers',
      wig: 'wigtracks',
      wig_track: 'wigtracks',
      wig_tracks: 'wigtracks',
      sequence_track: 'sequence',
      actions_track: 'actions',
      action_track: 'actions',
      blast_track: 'blast',
      blast_results_track: 'blast_results',
    };
    const trackKey = trackAliases[normalizedTrackName] || normalizedTrackName;
    const checkboxId = trackMapping[trackKey] || trackMapping[trackName];
    if (!checkboxId) {
      throw new Error(`Unknown track: ${trackName}. Available tracks: ${Object.keys(trackMapping).join(', ')}`);
    }

    const trackCheckbox = document.getElementById(checkboxId);
    if (!trackCheckbox) {
      throw new Error(`Track checkbox not found: ${checkboxId}`);
    }

    // If visible not specified, toggle current state
    if (visible === undefined) {
      visible = !trackCheckbox.checked;
    }

    // Check current state before making changes
    const currentState = trackCheckbox.checked;

    // If the track is already in the desired state, no need to change it
    if (currentState === visible) {
      return {
        success: true,
        track: trackName,
        visible: visible,
        message: `Track ${trackName} is already ${visible ? 'shown' : 'hidden'}`,
        noChangeNeeded: true,
      };
    }

    trackCheckbox.checked = visible;
    trackCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    // Also sync with sidebar checkbox
    const sidebarCheckboxId = 'sidebar' + checkboxId.charAt(0).toUpperCase() + checkboxId.slice(1);
    const sidebarCheckbox = document.getElementById(sidebarCheckboxId);
    if (sidebarCheckbox) {
      sidebarCheckbox.checked = visible;
      sidebarCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return {
      success: true,
      track: trackName,
      visible: visible,
      message: `Track ${trackName} ${visible ? 'shown' : 'hidden'}`,
    };
  }

  async toggleAnnotationTrack(params) {
    // Alias for toggleTrack for annotation-specific tracks
    return await this.toggleTrack(params);
  }

  async createAnnotation(params) {
    const {
      type,
      name,
      chromosome,
      start,
      end,
      strand,
      description,
      product,
      codonStart,
      translTable,
      translation,
      anticodon,
      regulatoryClass,
      sequence,
      direction,
      qualifiers,
    } = params;

    // Normalize coordinates: start must be <= end
    const parsedStart = Math.min(parseInt(start), parseInt(end));
    const parsedEnd = Math.max(parseInt(start), parseInt(end));
    const parsedStrand = strand === -1 || strand === '-1' ? -1 : 1;
    const requestedType = type ? type.trim().toLowerCase() : 'gene';

    if (requestedType === 'primer' && this.app?.primerManager) {
      const primer = await this.app.primerManager.addPrimer({
        name,
        sequence,
        description,
        source: 'create_annotation',
        bindingSites: [
          {
            chromosome,
            start: parsedStart,
            end: parsedEnd,
            strand: parsedStrand,
            source: 'create_annotation',
          },
        ],
      });

      return {
        success: true,
        primerId: primer.id,
        primer,
        track: 'primers',
        message: `Created primer: ${name} (${parsedStart}-${parsedEnd})`,
      };
    }

    if (this.app && this.app.addUserDefinedFeature) {
      const finalQualifiers = {
        gene: name,
        note: description || '',
        user_defined: true,
        ...qualifiers,
      };

      let finalType = type ? type.trim() : 'gene';
      const featureTypeLower = finalType.toLowerCase();

      // Handle unique characteristics for each type of feature
      if (featureTypeLower === 'cds') {
        finalType = 'CDS';
        const finalCodonStart = codonStart ? parseInt(codonStart) : 1;
        const finalTranslTable = translTable ? parseInt(translTable) : 11;

        finalQualifiers.codon_start = finalCodonStart;
        finalQualifiers.transl_table = finalTranslTable;
        finalQualifiers.product = product || description || name;

        if (translation) {
          finalQualifiers.translation = translation;
        } else {
          // Attempt to extract DNA and auto-translate
          try {
            const dnaSeq = await this.app.getSequenceForRegion(chromosome, parsedStart, parsedEnd);
            if (dnaSeq) {
              const frame = finalCodonStart - 1;
              let translatedProt = '';

              if (window.UnifiedDNATranslation) {
                const transResult = window.UnifiedDNATranslation.translateDNA({
                  sequence: dnaSeq,
                  frame: frame,
                  strand: parsedStrand,
                  geneticCode: finalTranslTable === 11 ? 'standard' : 'standard',
                  includeStops: true,
                });
                if (transResult && transResult.success) {
                  translatedProt = transResult.protein;
                }
              } else {
                translatedProt = this.app.translateDNA(dnaSeq, parsedStrand);
              }

              if (translatedProt) {
                finalQualifiers.translation = translatedProt;
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('Failed to auto-translate CDS sequence:', e);
          }
        }
      } else if (featureTypeLower === 'trna') {
        finalType = 'tRNA';
        let finalProduct = product || description || name;
        if (finalProduct && !finalProduct.startsWith('tRNA-')) {
          const aaMatch = finalProduct.match(/(?:tRNA[- ])?([A-Za-z]{3})/);
          if (aaMatch) {
            finalProduct = `tRNA-${aaMatch[1].charAt(0).toUpperCase() + aaMatch[1].slice(1).toLowerCase()}`;
          } else {
            finalProduct = `tRNA-${finalProduct}`;
          }
        }
        finalQualifiers.product = finalProduct;
        if (anticodon) {
          finalQualifiers.anticodon = anticodon;
        }
      } else if (featureTypeLower === 'rrna') {
        finalType = 'rRNA';
        finalQualifiers.product = product || description || name;
      } else if (['promoter', 'terminator', 'ribosome_binding_site', 'rbs', 'regulatory'].includes(featureTypeLower)) {
        finalType = 'regulatory';
        let rc = regulatoryClass;
        if (!rc) {
          if (featureTypeLower === 'promoter') {
            rc = 'promoter';
          } else if (featureTypeLower === 'terminator') {
            rc = 'terminator';
          } else if (featureTypeLower === 'ribosome_binding_site' || featureTypeLower === 'rbs') {
            rc = 'ribosome_binding_site';
          } else {
            rc = 'other';
          }
        }
        finalQualifiers.regulatory_class = rc;
        finalQualifiers.note = description || `Regulatory region (${rc})`;
      } else if (featureTypeLower === 'mrna') {
        finalType = 'mRNA';
        finalQualifiers.product = product || description || name;
        finalQualifiers.transcript_id = params.transcript_id || `${name}_t1`;
      } else if (featureTypeLower === 'primer') {
        finalType = 'primer';
        let finalSeq = sequence;

        if (!finalSeq) {
          try {
            const dnaSeq = await this.app.getSequenceForRegion(chromosome, parsedStart, parsedEnd);
            if (dnaSeq) {
              if (parsedStrand === -1) {
                const comp = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N', a: 't', t: 'a', g: 'c', c: 'g' };
                finalSeq = dnaSeq
                  .split('')
                  .reverse()
                  .map(b => comp[b] || b)
                  .join('');
              } else {
                finalSeq = dnaSeq;
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('Failed to extract primer sequence from region:', e);
          }
        }

        if (finalSeq) {
          finalQualifiers.sequence = finalSeq;
          let calculatedGc = 0;
          let calculatedTm = 0;

          const g = (finalSeq.match(/G/gi) || []).length;
          const c = (finalSeq.match(/C/gi) || []).length;
          const valid = g + c + (finalSeq.match(/[AT]/gi) || []).length;
          calculatedGc = valid === 0 ? 0 : ((g + c) / valid) * 100;

          if (finalSeq.length < 14) {
            const a = (finalSeq.match(/[AT]/gi) || []).length;
            const gcCount = (finalSeq.match(/[GC]/gi) || []).length;
            calculatedTm = 2 * a + 4 * gcCount;
          } else {
            calculatedTm = 81.5 + 0.41 * calculatedGc - 675 / finalSeq.length;
          }

          finalQualifiers.gc_content = calculatedGc.toFixed(1);
          finalQualifiers.tm = calculatedTm.toFixed(1);
        }

        finalQualifiers.direction = direction || (parsedStrand === -1 ? 'reverse' : 'forward');
      } else {
        finalQualifiers.product = product || description || name;
      }

      const feature = {
        type: finalType,
        name: name,
        chromosome: chromosome,
        start: parsedStart,
        end: parsedEnd,
        strand: parsedStrand,
        description: description || '',
        qualifiers: finalQualifiers,
      };

      const featureId = await this.app.addUserDefinedFeature(feature);

      return {
        success: true,
        featureId: featureId,
        feature: feature,
        message: `Created ${finalType} annotation: ${name} (${parsedStart}-${parsedEnd})`,
      };
    }

    throw new Error('Annotation creation not available');
  }

  /**
   * Generic export entry point.
   *
   * Delegates to the same FileOperationService implementations the dedicated
   * export_* tools use, so `filename`/`auto_save` behave identically here. The
   * previous implementation called ExportManager's menu handlers, which write
   * through an anchor download with a hard-coded default name — a tool call
   * could only ever open a native save dialog nobody is there to dismiss during
   * automation, and the exported content was discarded from the result.
   */
  async exportData(params = {}) {
    const { format = 'genbank', chromosome, start, end } = params;
    const normalizedFormat = String(format).toLowerCase();
    const fileService = this.services?.file;

    if (!fileService) {
      throw new Error('Export manager not available');
    }

    const delegate = async (toolName, method) => {
      const result = await fileService[method](params);
      return { ...result, tool: 'export_data', delegated_tool: toolName, format: normalizedFormat };
    };

    try {
      switch (normalizedFormat) {
        case 'fasta':
          if (chromosome && start && end) {
            return await this.exportRegionFasta(params, normalizedFormat);
          }
          return await delegate('export_fasta_sequence', 'exportFastaSequence');
        case 'genbank':
        case 'gb':
        case 'gbk':
          return await delegate('export_genbank_format', 'exportGenBankFormat');
        case 'gff':
        case 'gff3':
          return await delegate('export_gff_annotations', 'exportGffAnnotations');
        case 'bed':
          return await delegate('export_bed_format', 'exportBedFormat');
        case 'cds':
          return await delegate('export_cds_fasta', 'exportCdsFasta');
        case 'protein':
          return await delegate('export_protein_fasta', 'exportProteinFasta');
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Region-scoped FASTA export. With a destination the region is written to
   * disk; without one the sequence is returned inline rather than opening a
   * dialog, because a region export has no menu equivalent to fall back to.
   */
  async exportRegionFasta(params, normalizedFormat) {
    const { chromosome, start, end } = params;
    const fileService = this.services.file;
    const sequence = await this.app.getSequenceForRegion(chromosome, start, end);
    let fastaContent = `>${chromosome}:${start}-${end}\n`;
    for (let i = 0; i < sequence.length; i += 80) {
      fastaContent += sequence.substring(i, i + 80) + '\n';
    }

    const base = {
      success: true,
      tool: 'export_data',
      delegated_tool: 'export_fasta_sequence',
      exported_format: 'FASTA',
      format: normalizedFormat,
      chromosome,
      start,
      end,
      length: sequence.length,
    };

    if (!fileService.shouldAutoSaveExport(params)) {
      return {
        ...base,
        content: fastaContent,
        message: `Extracted ${chromosome}:${start}-${end} as FASTA (no destination given, returned inline)`,
      };
    }

    const outputFilename = fileService.getExportFilename(params, `${chromosome}_${start}-${end}.fasta`);
    const writeResult = await fileService.saveExportContent(
      fastaContent,
      outputFilename,
      'FASTA sequence',
      params,
      'export_data'
    );

    return {
      ...base,
      filename: outputFilename,
      file_path: writeResult?.filePath || outputFilename,
      filePath: writeResult?.filePath || outputFilename,
      message: `Successfully exported ${chromosome}:${start}-${end} as FASTA`,
      details: `Saved to ${writeResult?.filePath || outputFilename}`,
    };
  }

  /**
   * Open the export configuration dialog (built-in tool equivalent of the
   * Export Config menu action).
   */
  async configureExportSettings(parameters = {}) {
    if (this.app && this.app.exportManager && typeof this.app.exportManager.showExportConfigDialog === 'function') {
      this.app.exportManager.showExportConfigDialog();
      return {
        success: true,
        tool: 'configure_export_settings',
        message: 'Export configuration dialog opened',
      };
    }
    throw new Error('Export manager not available');
  }

  /**
   * Export full genome sequence as FASTA format
   * Built-in tool equivalent for "FASTA Sequence" export dropdown option
   */
  async exportFastaSequence(parameters = {}) {
    return this.services.file.exportFastaSequence(parameters);
  }

  /**
   * Export genome data as GenBank format
   * Built-in tool equivalent for "GenBank Format" export dropdown option
   */
  async exportGenBankFormat(parameters = {}) {
    return this.services.file.exportGenBankFormat(parameters);
  }

  /**
   * Export coding sequences as FASTA format
   * Built-in tool equivalent for "CDS FASTA" export dropdown option
   */
  async exportCDSFasta(parameters = {}) {
    return this.services.file.exportCDSFasta(parameters);
  }

  /**
   * Export protein sequences as FASTA format
   * Built-in tool equivalent for "Protein FASTA" export dropdown option
   */
  async exportProteinFasta(parameters = {}) {
    return this.services.file.exportProteinFasta(parameters);
  }

  /**
   * Export feature annotations as GFF format
   * Built-in tool equivalent for "GFF Annotations" export dropdown option
   */
  async exportGFFAnnotations(parameters = {}) {
    return this.services.file.exportGFFAnnotations(parameters);
  }

  /**
   * Export feature annotations as BED format
   * Built-in tool equivalent for "BED Format" export dropdown option
   */
  async exportBEDFormat(parameters = {}) {
    return this.services.file.exportBEDFormat(parameters);
  }

  /**
   * Export current visible region as FASTA format
   * Built-in tool equivalent for "Current View (FASTA)" export dropdown option
   */
  async exportCurrentViewFasta(parameters = {}) {
    return this.services.file.exportCurrentViewFasta(parameters);
  }

  /**
   * Capture the application interface or rendered genome tracks as an image.
   */
  async captureScreenshot(parameters = {}) {
    if (!this.app?.screenshotManager) {
      throw new Error('Screenshot manager not available');
    }
    const screenshotParameters = this.withAiScreenshotDefaults(parameters);
    const result = await this.app.screenshotManager.captureScreenshot(screenshotParameters);
    if (result?.success === false && !result.canceled) {
      throw new Error(result.error || 'Screenshot capture failed');
    }
    return result;
  }

  hasScreenshotOutputPath(parameters = {}) {
    return Boolean(
      parameters.filePath ||
      parameters.file_path ||
      parameters.outputPath ||
      parameters.output_path ||
      parameters.savePath ||
      parameters.save_path ||
      parameters.filename ||
      parameters.fileName
    );
  }

  withAiScreenshotDefaults(parameters = {}) {
    const screenshotParameters = {
      ...parameters,
      aiInitiated: true,
      source: parameters.source || 'ai',
    };

    const hasAutoSaveSetting =
      screenshotParameters.auto_save !== undefined || screenshotParameters.autoSave !== undefined;
    const copyOnly = Boolean(screenshotParameters.copyToClipboard || screenshotParameters.copy_to_clipboard);
    const saveDisabled = screenshotParameters.save === false || screenshotParameters.saveFile === false;
    const returnsImageData = Boolean(
      screenshotParameters.returnImageData ||
      screenshotParameters.return_image_data ||
      screenshotParameters.includeImageData ||
      screenshotParameters.include_image_data ||
      screenshotParameters.embedImage ||
      screenshotParameters.embed_image
    );

    if (
      !this.hasScreenshotOutputPath(screenshotParameters) &&
      !hasAutoSaveSetting &&
      !copyOnly &&
      !saveDisabled &&
      !returnsImageData
    ) {
      screenshotParameters.auto_save = true;
    }

    return screenshotParameters;
  }

  async openImageFile(parameters = {}) {
    try {
      const filePath =
        parameters.filePath ||
        parameters.file_path ||
        parameters.path ||
        parameters.imagePath ||
        parameters.image_path ||
        parameters.filename ||
        parameters.fileName;

      if (!filePath) {
        throw new Error('Image file path is required');
      }

      if (!window.electronAPI?.openImageFile) {
        throw new Error('Image viewer IPC bridge is unavailable');
      }

      const resolvedFilePath = this.resolvePathAgainstWorkingDirectory(filePath);
      const result = await window.electronAPI.openImageFile({
        ...parameters,
        filePath: resolvedFilePath,
        aiInitiated: true,
        source: parameters.source || 'ai',
      });

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to open image file');
      }

      return {
        success: true,
        message: `Opened image file: ${result.filePath}`,
        filePath: result.filePath,
        fileName: result.fileName,
        tool: 'open_image_file',
      };
    } catch (error) {
      console.error('❌ [ChatManager] Error opening image file:', error);
      return {
        success: false,
        error: error.message,
        tool: 'open_image_file',
      };
    }
  }

  resolvePathAgainstWorkingDirectory(filePath) {
    const pathModule = this.getPathModule();
    if (pathModule && typeof pathModule.isAbsolute === 'function' && pathModule.isAbsolute(filePath)) {
      return filePath;
    }

    if (pathModule && typeof pathModule.resolve === 'function') {
      return pathModule.resolve(this.getCurrentWorkingDirectory(), filePath);
    }

    return `${this.getCurrentWorkingDirectory().replace(/\/+$/g, '')}/${filePath}`;
  }

  /**
   * Helper method to show save dialog for export operations
   * Uses Electron's native save dialog for file selection
   */
  async showExportSaveDialog(content, defaultFilename, formatType, mimeType = 'text/plain') {
    return this.services.file.showExportSaveDialog(content, defaultFilename, formatType, mimeType);
  }
  /**
   * Helper method for browser-based file download (fallback)
   */
  downloadFileAsBrowser(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    console.log(`💾 [ChatManager] Browser download triggered: ${filename}`);
  }

  /**
   * Helper method to write file directly without showing dialog
   * Uses Electron IPC for secure file system access
   */
  async writeFileDirectly(content, filename, formatType) {
    return this.services.file.writeFileDirectly(content, filename, formatType);
  }

  getVisibleTracks() {
    const tracks = [];

    // Define track mappings with their checkbox IDs
    const trackMappings = [
      { name: 'genes', id: 'trackGenes' },
      { name: 'gc', id: 'trackGC' },
      { name: 'variants', id: 'trackVariants' },
      { name: 'reads', id: 'trackReads' },
      { name: 'proteins', id: 'trackProteins' },
      { name: 'primers', id: 'trackPrimers' },
      { name: 'wigTracks', id: 'trackWIG' },
      { name: 'sequence', id: 'trackSequence' },
      { name: 'actions', id: 'trackActions' },
      { name: 'blast', id: 'trackBlast' },
      { name: 'blast_results', id: 'trackBlast' },
    ];

    // Check each track checkbox
    trackMappings.forEach(track => {
      const checkbox = document.getElementById(track.id);
      if (checkbox && checkbox.checked) {
        tracks.push(track.name);
      }
    });

    return tracks;
  }

  sendToMCP(message) {
    if (this.isConnected && this.mcpSocket) {
      this.mcpSocket.send(JSON.stringify(message));
    } else {
      this.pendingMessages.push(message);
    }
  }

  // Send state updates to MCP server
  sendStateUpdate(partialState) {
    this.sendToMCP({
      type: 'state-update',
      state: partialState,
    });
  }

  sendNavigationUpdate(chromosome, position) {
    this.sendToMCP({
      type: 'navigation',
      chromosome: chromosome,
      position: position,
    });
  }

  sendSearchResults(results) {
    this.sendToMCP({
      type: 'search-results',
      results: results,
    });
  }

  sendFeatureSelection(features) {
    this.sendToMCP({
      type: 'feature-selected',
      features: features,
    });
  }

  sendTrackVisibility(tracks) {
    this.sendToMCP({
      type: 'track-visibility',
      tracks: tracks,
    });
  }

  // UI Management
  initializeUI() {
    this.createChatInterface();
    this.setupEventListeners();
    this.updateTasksPanelToggleButton();
  }

  createChatInterface() {
    const existingChatPanel = document.getElementById('llmChatPanel');
    if (existingChatPanel) {
      existingChatPanel.style.display = 'flex';
      this.ensureChatPanelInViewport(existingChatPanel);
      this.configManager.set('chat.visible', true);
      // Reopening the panel must re-show any research run that is still going.
      this.services?.researchProgress?.render();
      return;
    }

    // Calculate right-bottom position
    const defaultSize = { width: 400, height: 600 };
    const defaultPosition = this.getDefaultChatPosition();

    // Load saved position and size
    const savedSize = this.normalizeChatSize(this.configManager.get('chat.size', defaultSize), defaultSize);
    const savedPosition = this.normalizeChatPosition(
      this.configManager.get('chat.position', defaultPosition),
      savedSize,
      defaultPosition
    );

    // Create chat panel HTML
    const chatHTML = `
            <div id="llmChatPanel" class="chat-panel resizable-movable" style="left: ${savedPosition.x}px; top: ${savedPosition.y}px; width: ${savedSize.width}px; height: ${savedSize.height}px;">
                <div class="chat-header" id="chatHeader">
                    <div class="chat-title">
                        <i class="fas fa-robot"></i>
                        <button id="multiAgentToggleBtn" class="btn btn-sm chat-btn multi-agent-toggle" title="Enable Multi-Agent System" data-enabled="false">
                            <i class="fas fa-users-cog"></i>
                            <span class="toggle-text">OFF</span>
                        </button>
                    </div>
                    <div class="chat-controls">
                        <button id="toggleTasksPanelBtn" class="btn btn-sm chat-btn" title="Show Tasks panel" aria-pressed="false">
                            <i class="fas fa-tasks"></i>
                        </button>
                        <button id="dockChatBtn" class="btn btn-sm chat-btn" title="Dock to right side">
                            <i class="fas fa-columns"></i>
                        </button>
                        <button id="chatBoxSettingsBtn" class="btn btn-sm chat-btn" title="ChatBox Settings">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button id="resetChatPositionBtn" class="btn btn-sm chat-btn" title="Reset position and size">
                            <i class="fas fa-home"></i>
                        </button>
                        <button id="minimizeChatBtn" class="btn btn-sm chat-btn">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button id="closeChatBtn" class="btn btn-sm chat-btn">
                            <i class="fas fa-eye-slash"></i>
                        </button>
                    </div>
                </div>
                <div class="chat-messages" id="chatMessages">
                    <div class="welcome-message">
                        <div class="message assistant-message">
                            <div class="message-content">
                                <div class="message-text">
                                    <div class="welcome-hero">
                                        <div class="welcome-hero-icon">🧬</div>
                                        <div class="welcome-hero-text">
                                            <h3>Welcome to CodeXomics AI</h3>
                                            <p>Your intelligent genomics assistant — click any example below to get started</p>
                                        </div>
                                    </div>
                                    <div class="welcome-cards-grid" id="welcomeCardsGrid">
                                        <!-- Populated dynamically by ChatManager.renderWelcomeCards() -->
                                    </div>
                                    <div class="welcome-tip">
                                        <i class="fas fa-lightbulb"></i>
                                        <span>Ask anything in natural language — e.g. <em>"Navigate to 2M"</em> or <em>"Design primers to amplify gene lysC"</em></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="chat-input-container">
                    <div class="chat-input-options">
                        <div class="chat-model-picker" title="Model used for this conversation">
                            <i class="fas fa-microchip"></i>
                            <select id="chatModelSelect" class="chat-model-select">
                                <option value="auto::auto">Auto</option>
                            </select>
                        </div>
                        <div class="context-mode-toggle">
                            <label class="toggle-label">
                                <input type="checkbox" id="contextModeToggle" checked />
                                <span class="toggle-slider"></span>
                                <span class="toggle-text">Current message only</span>
                            </label>
                        </div>
                    </div>
                    <div class="chat-input-wrapper">
                        <textarea id="chatInput" 
                                placeholder="Ask me anything about your genome data..." 
                                rows="1"></textarea>
                        <div class="chat-send-controls">
                            <button id="sendChatBtn" class="btn btn-primary">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                            <button id="abortChatBtn" class="btn btn-secondary chat-abort-btn" style="display: none;">
                                <i class="fas fa-stop"></i>
                            </button>
                        </div>
                    </div>
                    <div class="chat-actions">
                        <button id="newChatBtn" class="btn btn-sm btn-primary">
                            <i class="fas fa-plus"></i>
                            New Chat
                        </button>
                        <button id="chatHistoryBtn" class="btn btn-sm btn-secondary">
                            <i class="fas fa-history"></i>
                            History
                        </button>
                        <button id="mcpToggleBtn" class="btn btn-sm btn-secondary mcp-tools-btn" title="Toggle MCP Tools" data-connected="false">
                            <i class="fas fa-microchip"></i>
                            MCP Tools
                        </button>
                        <div class="chat-more-menu-container">
                            <button id="chatMoreBtn" class="btn btn-sm btn-secondary" title="More actions">
                                <i class="fas fa-ellipsis-h"></i>
                            </button>
                            <div class="dropdown-menu chat-more-menu" id="chatMoreMenu">
                                <button class="dropdown-item" id="chatSkillsBtn" title="Agent Skills — expert workflows the assistant can load">
                                    <i class="fas fa-book"></i>
                                    Skills
                                </button>
                                <button class="dropdown-item" id="exportChatBtn">
                                    <i class="fas fa-download"></i>
                                    Export
                                </button>
                                <button class="dropdown-item" id="mcpServerMgmtBtn" title="External MCP Servers">
                                    <i class="fas fa-server"></i>
                                    MCP Servers
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Resize handles -->
                <div class="resize-handle resize-handle-n" data-direction="n"></div>
                <div class="resize-handle resize-handle-s" data-direction="s"></div>
                <div class="resize-handle resize-handle-e" data-direction="e"></div>
                <div class="resize-handle resize-handle-w" data-direction="w"></div>
                <div class="resize-handle resize-handle-ne" data-direction="ne"></div>
                <div class="resize-handle resize-handle-nw" data-direction="nw"></div>
                <div class="resize-handle resize-handle-se" data-direction="se"></div>
                <div class="resize-handle resize-handle-sw" data-direction="sw"></div>
            </div>
        `;

    // Insert chat panel into the page
    const appDiv = document.getElementById('app') || document.body;
    if (!appDiv) {
      console.error('ChatBox could not be created because no document container is available');
      return;
    }
    appDiv.insertAdjacentHTML('beforeend', chatHTML);

    // Initial render of welcome cards will be handled in initializeChatBoxSettings()
    // once the WelcomeExamplesManager is loaded and initialized.

    // Ensure ChatBox is visible by default
    const chatPanel = document.getElementById('llmChatPanel');
    if (chatPanel) {
      chatPanel.style.display = 'flex';
      this.ensureChatPanelInViewport(chatPanel);
      this.configManager.set('chat.visible', true);
      console.log('ChatBox created with visibility: visible');
    }

    // Research runs survive panel teardown; rebuild their dock rows now that
    // the panel DOM exists again.
    this.services?.researchProgress?.render();

    // Setup dragging and resizing
    this.setupChatDragging();
    this.setupChatResizing();

    // Add window resize handler to ensure chat stays in bounds
    this.setupWindowResizeHandler();

    // Force recalculation of position after DOM insertion
    setTimeout(() => {
      const chatPanel = document.getElementById('llmChatPanel');
      if (chatPanel) {
        // If using default position, recalculate to ensure it's at bottom-right
        const currentPos = this.configManager.get('chat.position');
        const freshDefaultPos = this.getDefaultChatPosition();

        console.log('Current saved position:', currentPos);
        console.log('Fresh calculated position:', freshDefaultPos);

        // If there's no saved position or if we want to force bottom positioning
        if (!currentPos || currentPos.y < window.innerHeight * 0.3) {
          console.log('Applying bottom-right positioning');
          chatPanel.style.left = freshDefaultPos.x + 'px';
          chatPanel.style.top = freshDefaultPos.y + 'px';
        }

        this.ensureChatPanelInViewport(chatPanel);
      }

      // Restore dock state from config
      const savedDockState = this.configManager.get('chat.docked', false);
      if (savedDockState) {
        this.dockChat();
      }
    }, 50);
  }

  /**
   * Calculate default right-bottom position
   */
  getDefaultChatPosition() {
    const defaultSize = { width: 400, height: 600 };

    // Get the actual available viewport dimensions - use document.documentElement for better accuracy
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    // Calculate bottom-right position
    const x = Math.max(20, viewportWidth - defaultSize.width - 20);
    const y = Math.max(20, viewportHeight - defaultSize.height - 20);

    console.log('Chat position calculation:', { viewportWidth, viewportHeight, x, y, defaultSize });

    return { x, y };
  }

  getChatViewport() {
    return {
      width: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
      height: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0),
    };
  }

  normalizeChatSize(size, fallback = { width: 400, height: 600 }) {
    const viewport = this.getChatViewport();
    const width = Number(size?.width);
    const height = Number(size?.height);
    const maxWidth = Math.max(320, viewport.width - 20);
    const maxHeight = Math.max(420, viewport.height - 20);

    return {
      width: Math.max(300, Math.min(Number.isFinite(width) ? width : fallback.width, maxWidth)),
      height: Math.max(400, Math.min(Number.isFinite(height) ? height : fallback.height, maxHeight)),
    };
  }

  normalizeChatPosition(position, size, fallback = this.getDefaultChatPosition()) {
    const viewport = this.getChatViewport();
    const rawX = Number(position?.x);
    const rawY = Number(position?.y);
    const x = Number.isFinite(rawX) ? rawX : fallback.x;
    const y = Number.isFinite(rawY) ? rawY : fallback.y;
    const maxLeft = Math.max(10, viewport.width - size.width - 10);
    const maxTop = Math.max(10, viewport.height - size.height - 10);

    return {
      x: Math.max(10, Math.min(x, maxLeft)),
      y: Math.max(10, Math.min(y, maxTop)),
    };
  }

  ensureChatPanelInViewport(chatPanel) {
    if (!chatPanel || chatPanel.classList.contains('docked')) return;

    const currentSize = {
      width: parseInt(chatPanel.style.width, 10),
      height: parseInt(chatPanel.style.height, 10),
    };
    const size = this.normalizeChatSize(currentSize);
    const position = this.normalizeChatPosition(
      {
        x: parseInt(chatPanel.style.left, 10),
        y: parseInt(chatPanel.style.top, 10),
      },
      size
    );

    chatPanel.style.left = position.x + 'px';
    chatPanel.style.top = position.y + 'px';
    chatPanel.style.width = size.width + 'px';
    chatPanel.style.height = size.height + 'px';
  }

  /**
   * Setup window resize handler to keep chat panel in bounds
   */
  setupWindowResizeHandler() {
    window.addEventListener('resize', () => {
      const chatPanel = document.getElementById('llmChatPanel');
      if (chatPanel) {
        // Use same viewport calculation as getDefaultChatPosition
        const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

        // Ensure chat panel stays within viewport bounds
        const currentLeft = parseInt(chatPanel.style.left, 10);
        const currentTop = parseInt(chatPanel.style.top, 10);
        const panelWidth = parseInt(chatPanel.style.width, 10);
        const panelHeight = parseInt(chatPanel.style.height, 10);

        const maxLeft = viewportWidth - panelWidth - 10;
        const maxTop = viewportHeight - panelHeight - 10;

        let needsUpdate = false;
        let newLeft = currentLeft;
        let newTop = currentTop;

        if (currentLeft > maxLeft) {
          newLeft = Math.max(10, maxLeft);
          needsUpdate = true;
        }

        if (currentTop > maxTop) {
          newTop = Math.max(10, maxTop);
          needsUpdate = true;
        }

        if (needsUpdate) {
          chatPanel.style.left = newLeft + 'px';
          chatPanel.style.top = newTop + 'px';
          this.ensureChatPanelInViewport(chatPanel);
          console.log('Chat position adjusted on resize:', { newLeft, newTop });
        }
      }
    });
  }

  setupEventListeners() {
    // Chat toggle button in toolbar
    this.addChatToggleButton();

    // Chat input handling
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendChatBtn');

    if (chatInput && sendBtn) {
      // Auto-resize textarea and handle input changes during history browsing
      chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = chatInput.scrollHeight + 'px';

        // If user starts typing while browsing history, exit browse mode
        if (this.messageHistory.isBrowsing) {
          this.exitHistoryBrowsing();
        }
      });

      // Send on Enter (Shift+Enter for new line) and handle arrow keys for history
      chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.browseHistoryUp();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.browseHistoryDown();
        } else if (this.messageHistory.isBrowsing && e.key === 'Escape') {
          // Escape cancels history browsing and restores original content
          e.preventDefault();
          this.cancelHistoryBrowsing();
        }
      });

      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    // Chat abort button
    const abortBtn = document.getElementById('abortChatBtn');
    if (abortBtn) {
      abortBtn.addEventListener('click', () => this.abortCurrentConversation());
    }

    // Chat controls
    document.getElementById('minimizeChatBtn')?.addEventListener('click', () => {
      this.toggleChatMinimize();
    });

    document.getElementById('closeChatBtn')?.addEventListener('click', () => {
      this.toggleChatVisibility();
    });

    document.getElementById('exportChatBtn')?.addEventListener('click', () => {
      this.exportChatHistory();
    });

    document.getElementById('mcpServerMgmtBtn')?.addEventListener('click', () => {
      if (window.genomeBrowser && window.genomeBrowser.showMCPSettingsModal) {
        window.genomeBrowser.showMCPSettingsModal();
      }
    });

    // Deep-link to the Skills tab of the Agent Settings modal rather than
    // duplicating the panel, so there is one place where skills are managed.
    document.getElementById('chatSkillsBtn')?.addEventListener('click', () => {
      const settingsManager = window.multiAgentSettingsManager;
      if (!settingsManager || typeof settingsManager.showModal !== 'function') {
        this.showNotification('Skills settings are unavailable in this window', 'warning');
        return;
      }
      settingsManager.currentTab = 'skills';
      settingsManager.showModal();
      window.skillsSettingsManager?.render();
    });

    // Multi-Agent System event listeners
    document.getElementById('multiAgentToggleBtn')?.addEventListener('click', () => {
      this.toggleMultiAgentSystem();
    });

    // New button event listeners
    document.getElementById('newChatBtn')?.addEventListener('click', () => {
      this.startNewChat();
    });

    document.getElementById('chatHistoryBtn')?.addEventListener('click', () => {
      this.showChatHistoryModal();
    });

    // Reset position button
    document.getElementById('resetChatPositionBtn')?.addEventListener('click', () => {
      this.resetChatPosition();
    });

    // Dock/Undock button
    document.getElementById('dockChatBtn')?.addEventListener('click', () => {
      this.toggleDockState();
    });

    // Tasks panel show/hide button
    document.getElementById('toggleTasksPanelBtn')?.addEventListener('click', () => {
      this.toggleTasksPanel();
    });

    // Keep the header toggle in sync when the Tasks panel opens/closes on its own
    window.addEventListener('tasks-panel-visibility-changed', e => {
      this.updateTasksPanelToggleButton(e.detail?.visible);
    });

    // Context mode toggle
    document.getElementById('contextModeToggle')?.addEventListener('change', e => {
      this.contextModeEnabled = e.target.checked;
      console.log('Context mode changed:', this.contextModeEnabled ? 'Current message only' : 'Full conversation');
    });

    // Welcome example buttons - click to auto-fill and send
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
      messagesContainer.addEventListener('click', e => {
        const exampleBtn = e.target.closest('.welcome-example-btn');
        if (exampleBtn) {
          const prompt = exampleBtn.getAttribute('data-prompt');
          if (prompt) {
            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
              chatInput.value = prompt;
              chatInput.style.height = 'auto';
              chatInput.style.height = chatInput.scrollHeight + 'px';
              this.sendMessage();
            }
          }
        }
      });
    }

    // ChatBox settings event handler
    window.addEventListener('chatbox-settings', () => {
      if (this.chatBoxSettingsManager) {
        this.chatBoxSettingsManager.showSettingsModal();
      } else {
        console.warn('ChatBoxSettingsManager not initialized');
      }
    });

    // ChatBox Settings button event handler
    document.getElementById('chatBoxSettingsBtn')?.addEventListener('click', () => {
      if (this.chatBoxSettingsManager) {
        this.chatBoxSettingsManager.showSettingsModal();
      } else {
        console.warn('ChatBoxSettingsManager not initialized');
      }
    });

    // MCP Toggle button event handler
    document.getElementById('mcpToggleBtn')?.addEventListener('click', () => {
      this.toggleMCPConnection();
    });

    // "More" actions dropdown (Skills / Export / MCP Servers)
    document.getElementById('chatMoreBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('chatMoreMenu')?.classList.toggle('show');
    });

    // Guard against duplicate document-level binding if setupEventListeners runs again
    if (!this._chatMoreMenuDismissBound) {
      this._chatMoreMenuDismissBound = true;
      document.addEventListener('click', e => {
        const moreMenu = document.getElementById('chatMoreMenu');
        if (!moreMenu || !moreMenu.classList.contains('show')) return;
        // Close after picking an item, or when clicking anywhere outside the dropdown
        if (e.target.closest('#chatMoreMenu .dropdown-item') || !e.target.closest('.chat-more-menu-container')) {
          moreMenu.classList.remove('show');
        }
      });
    }
  }

  addChatToggleButton() {
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
      const chatSection = document.createElement('div');
      chatSection.className = 'toolbar-section chat-toggle-section';
      chatSection.innerHTML = `
                <button id="toggleChatBtn" class="btn btn-sm toggle-btn">
                    <i class="fas fa-robot"></i>
                </button>
            `;

      toolbar.appendChild(chatSection);

      document.getElementById('toggleChatBtn').addEventListener('click', () => {
        this.toggleChatVisibility();
      });
    }
  }

  toggleChatVisibility() {
    const chatPanel = document.getElementById('llmChatPanel');
    if (chatPanel) {
      const isVisible = chatPanel.style.display !== 'none';
      this.setChatVisibility(!isVisible);
      console.log('ChatBox visibility toggled:', isVisible ? 'hidden' : 'visible');
    }
  }

  setChatVisibility(visible) {
    const chatPanel = document.getElementById('llmChatPanel');
    if (!chatPanel) return;

    chatPanel.style.display = visible ? 'flex' : 'none';

    const isDocked = this.isDocked || chatPanel.classList.contains('docked');
    if (isDocked) {
      const dockContainer = document.getElementById('chatDockContainer');
      const dockSplitter = document.getElementById('chatDockSplitter');
      if (dockContainer) dockContainer.style.display = visible ? 'flex' : 'none';
      if (dockSplitter) dockSplitter.style.display = visible ? 'flex' : 'none';
      this.notifyDockLayoutChanged('visibility');
    }

    this.configManager.set('chat.visible', visible);
  }

  /**
   * Show/hide the Tasks dock from the ChatBox header
   */
  toggleTasksPanel() {
    const taskService = this.services?.task;
    if (!taskService || typeof taskService.togglePanelVisibility !== 'function') {
      console.warn('[ChatManager] TaskService unavailable; cannot toggle Tasks panel');
      return;
    }

    const visible = taskService.togglePanelVisibility();
    this.updateTasksPanelToggleButton(visible);
  }

  /**
   * Reflect Tasks dock visibility on the header toggle button
   * @param {boolean} [visible] - resolved from TaskService when omitted
   */
  updateTasksPanelToggleButton(visible) {
    const btn = document.getElementById('toggleTasksPanelBtn');
    if (!btn) return;

    const isVisible = typeof visible === 'boolean' ? visible : !!this.services?.task?.isPanelVisible?.();

    btn.classList.toggle('active', isVisible);
    btn.setAttribute('aria-pressed', String(isVisible));
    btn.title = isVisible ? 'Hide Tasks panel' : 'Show Tasks panel';
  }

  /**
   * Toggle between docked and floating ChatBox states
   */
  toggleDockState() {
    if (this.isDocked) {
      this.undockChat();
    } else {
      this.dockChat();
    }
  }

  /**
   * Dock the ChatBox to the right side panel
   */
  dockChat() {
    const chatPanel = document.getElementById('llmChatPanel');
    const dockContainer = document.getElementById('chatDockContainer');
    const dockSplitter = document.getElementById('chatDockSplitter');
    const dockBtn = document.getElementById('dockChatBtn');

    if (!chatPanel || !dockContainer || !dockSplitter) return;

    // Save current floating position/size before docking
    this.configManager.set('chat.floatingPosition', {
      x: parseInt(chatPanel.style.left) || 0,
      y: parseInt(chatPanel.style.top) || 0,
    });
    this.configManager.set('chat.floatingSize', {
      width: parseInt(chatPanel.style.width) || 400,
      height: parseInt(chatPanel.style.height) || 600,
    });

    // If minimized, un-minimize first
    if (chatPanel.classList.contains('minimized')) {
      chatPanel.classList.remove('minimized');
    }

    // Move chat panel into dock container
    dockContainer.appendChild(chatPanel);

    // Add docked class and show container/splitter
    chatPanel.classList.add('docked');
    dockContainer.style.display = 'flex';
    dockSplitter.style.display = 'flex';

    // Ensure chat panel is visible
    chatPanel.style.display = 'flex';

    // Restore saved dock width
    const savedDockWidth = this.configManager.get('chat.dockWidth', 400);
    dockContainer.style.width = savedDockWidth + 'px';

    // Update button icon and title
    if (dockBtn) {
      dockBtn.title = 'Undock to floating window';
      dockBtn.innerHTML = '<i class="fas fa-window-restore"></i>';
    }

    // Hide the reset position button when docked (not meaningful)
    const resetBtn = document.getElementById('resetChatPositionBtn');
    if (resetBtn) resetBtn.style.display = 'none';

    this.isDocked = true;
    this.configManager.set('chat.docked', true);

    // Hide any dock indicator
    this.hideDockIndicator();

    // Setup dock splitter dragging
    this.setupDockSplitterDragging();

    this.notifyDockLayoutChanged('dock');
    console.log('ChatBox docked to right panel');
  }

  /**
   * Undock the ChatBox back to floating mode
   */
  undockChat() {
    const chatPanel = document.getElementById('llmChatPanel');
    const dockContainer = document.getElementById('chatDockContainer');
    const dockSplitter = document.getElementById('chatDockSplitter');
    const dockBtn = document.getElementById('dockChatBtn');
    const appDiv = document.getElementById('app');

    if (!chatPanel || !dockContainer || !dockSplitter || !appDiv) return;

    // Save dock width for next time
    this.configManager.set('chat.dockWidth', parseInt(dockContainer.style.width) || 400);

    // Move chat panel back to app root
    appDiv.appendChild(chatPanel);

    // Remove docked class and hide container/splitter
    chatPanel.classList.remove('docked');
    dockContainer.style.display = 'none';
    dockSplitter.style.display = 'none';

    // Restore floating position and size
    const savedPos = this.configManager.get('chat.floatingPosition', this.getDefaultChatPosition());
    const savedSize = this.configManager.get('chat.floatingSize', { width: 400, height: 600 });

    chatPanel.style.left = savedPos.x + 'px';
    chatPanel.style.top = savedPos.y + 'px';
    chatPanel.style.width = savedSize.width + 'px';
    chatPanel.style.height = savedSize.height + 'px';

    // Ensure visibility
    chatPanel.style.display = 'flex';

    // Update button icon and title
    if (dockBtn) {
      dockBtn.title = 'Dock to right side';
      dockBtn.innerHTML = '<i class="fas fa-columns"></i>';
    }

    // Show the reset position button again
    const resetBtn = document.getElementById('resetChatPositionBtn');
    if (resetBtn) resetBtn.style.display = '';

    this.isDocked = false;
    this.configManager.set('chat.docked', false);

    // Hide any undock indicator
    this.hideUndockIndicator();

    this.notifyDockLayoutChanged('undock');
    console.log('ChatBox undocked to floating mode');
  }

  notifyDockLayoutChanged(reason = 'dock-layout') {
    if (typeof window === 'undefined') return;

    window.setTimeout(() => {
      console.log(`🔄 ChatBox ${reason} changed viewport width; triggering adaptive track resize`);
      window.dispatchEvent(new Event('resize'));
    }, 50);
  }

  /**
   * Setup dock splitter dragging for resizable dock width
   */
  setupDockSplitterDragging() {
    const splitter = document.getElementById('chatDockSplitter');
    const dockContainer = document.getElementById('chatDockContainer');
    const mainContent = document.querySelector('.main-content');

    if (!splitter || !dockContainer || !mainContent) return;

    // Remove any existing listeners (in case called multiple times)
    const newSplitter = splitter.cloneNode(true);
    splitter.parentNode.replaceChild(newSplitter, splitter);

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = e => {
      if (e.button !== 0) return;
      isResizing = true;
      startX = e.clientX;
      startWidth = parseInt(dockContainer.style.width) || dockContainer.offsetWidth;

      newSplitter.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      e.preventDefault();
    };

    const onMouseMove = e => {
      if (!isResizing) return;

      const deltaX = startX - e.clientX; // dragging left increases width
      let newWidth = startWidth + deltaX;

      // Enforce min/max
      const maxWidth = mainContent.offsetWidth * 0.5;
      newWidth = Math.max(280, Math.min(maxWidth, newWidth));

      dockContainer.style.width = newWidth + 'px';
    };

    const onMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;

      newSplitter.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save the new width
      const finalWidth = parseInt(dockContainer.style.width) || 400;
      this.configManager.set('chat.dockWidth', finalWidth);
      this.notifyDockLayoutChanged('dock splitter');
    };

    newSplitter.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /**
   * Force show the ChatBox interface
   */
  showChatBox() {
    const chatPanel = document.getElementById('llmChatPanel');
    if (chatPanel) {
      this.setChatVisibility(true);
      this.ensureChatPanelInViewport(chatPanel);
      console.log('ChatBox forced to visible');
    }
  }

  /**
   * Hide the ChatBox interface
   */
  hideChatBox() {
    const chatPanel = document.getElementById('llmChatPanel');
    if (chatPanel) {
      this.setChatVisibility(false);
      console.log('ChatBox hidden');
    }
  }

  toggleChatMinimize() {
    const chatPanel = document.getElementById('llmChatPanel');
    const minimizeBtn = document.getElementById('minimizeChatBtn');

    if (chatPanel) {
      const isMinimized = chatPanel.classList.contains('minimized');
      const icon = minimizeBtn ? minimizeBtn.querySelector('i') : null;

      if (!isMinimized) {
        // Minimizing: just add class to shrink height, leave position alone
        chatPanel.classList.add('minimized');

        if (icon) {
          icon.className = 'fas fa-window-maximize';
          minimizeBtn.title = 'Expand window';
        }
      } else {
        // Expanding: restore original height
        chatPanel.classList.remove('minimized');

        if (icon) {
          icon.className = 'fas fa-minus';
          minimizeBtn.title = 'Minimize window';
        }
      }

      // When minimizing/expanding, don't save position to avoid conflicts
      // Only save the minimized state preference if needed
    }
  }

  /**
   * A DOMException-compatible abort error. `name` is what every caller and
   * every fetch consumer branches on, so a plain `new Error('AbortError')`
   * (whose name is 'Error') reads as an ordinary failure and gets rendered to
   * the user as "Unexpected Error".
   * @returns {Error}
   */
  createAbortError(message = 'Request aborted by user') {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
  }

  /**
   * True for both our own abort errors and the DOMException a cancelled fetch
   * rejects with.
   * @param {any} error
   * @returns {boolean}
   */
  isAbortError(error) {
    return error?.name === 'AbortError' || error?.message === 'AbortError';
  }

  /**
   * True once the user has stopped this request. The sticky flag is what makes
   * this reliable: abortCurrentConversation() drops the AbortController right
   * away so the UI unlocks, and the still-running loop would otherwise see a
   * null controller and read it as "no abort in progress".
   * @returns {boolean}
   */
  isConversationAborted() {
    return (
      this.conversationState?.aborted === true || this.conversationState?.abortController?.signal?.aborted === true
    );
  }

  /** Abort checkpoint for the round loop and the tool queue. */
  throwIfConversationAborted() {
    if (this.isConversationAborted()) {
      throw this.createAbortError();
    }
  }

  async sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();

    if (!message) return;

    // Exit history browsing mode when sending message
    if (this.messageHistory.isBrowsing) {
      this.exitHistoryBrowsing();
    }

    // Check whether processing is in progress
    if (this.conversationState.isProcessing) {
      this.showNotification('Conversation in progress, please wait or click abort button', 'warning');
      return;
    }

    // Initialize the conversation state
    this.startConversation();

    // Add user message to chat
    this.addMessageToChat(message, 'user');
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Show typing indicator and thinking process
    this.showThinkingProcess && this.addThinkingMessage('Analyzing your question...');
    this.showTypingIndicator();

    try {
      // Send to LLM via MCP or direct API
      const response = await this.sendToLLM(message);
      this.removeTypingIndicator();
      this.addMessageToChat(response, 'assistant');
    } catch (error) {
      this.removeTypingIndicator();
      if (error.name === 'AbortError') {
        this.addMessageToChat('Conversation aborted by user.', 'assistant', false, 'warning');
      } else {
        this.addMessageToChat('Sorry, I encountered an error. Please try again.', 'assistant', true);
        console.error('Chat error:', error);
      }
    } finally {
      // End the conversation state
      this.endConversation();
    }
  }

  /**
   * Programmatically send a message to the chat (for API calls from other modules)
   */
  async sendMessageProgrammatically(message) {
    if (!message || !message.trim()) {
      console.warn('No message provided to sendMessageProgrammatically');
      return;
    }

    const trimmedMessage = message.trim();

    // Check whether processing is in progress
    if (this.conversationState.isProcessing) {
      this.showNotification('Conversation in progress, please wait or click abort button', 'warning');
      return;
    }

    // Initialize the conversation state
    this.startConversation();

    // Add user message to chat
    this.addMessageToChat(trimmedMessage, 'user');

    // Show typing indicator and thinking process
    this.showThinkingProcess && this.addThinkingMessage('Analyzing your question...');
    this.showTypingIndicator();

    try {
      // Send to LLM via MCP or direct API
      const response = await this.sendToLLM(trimmedMessage);
      this.removeTypingIndicator();
      this.addMessageToChat(response, 'assistant');
    } catch (error) {
      this.removeTypingIndicator();
      if (error.name === 'AbortError') {
        this.addMessageToChat('Conversation aborted by user.', 'assistant', false, 'warning');
      } else {
        this.addMessageToChat('Sorry, I encountered an error. Please try again.', 'assistant', true);
        console.error('Error in sendMessageProgrammatically:', error);
      }
    } finally {
      this.endConversation();
    }
  }

  /**
   * The provider and model the next ChatBox request will actually use.
   *
   * ChatBox passes its model-selection settings as request-scoped overrides
   * (see the options built in sendToLLM below), so anything that reports the
   * model from the Model Types mapping alone — the Benchmark panel, the
   * interaction records — can disagree with the request that is really sent.
   * This resolves through the exact override chain the request uses.
   *
   * @returns {{providerKey: string, model: string}|null} null when no provider
   *   resolves or the configured override is invalid.
   */
  getChatboxModelSelection() {
    if (!this.llmConfigManager || typeof this.llmConfigManager.getRequestModelSelection !== 'function') {
      return null;
    }
    const options = {
      modelType: this.chatBoxSettingsManager?.getSetting('chatboxModelType', 'auto'),
      providerOverride: this.chatBoxSettingsManager?.getSetting('chatboxLLMProvider', 'auto'),
      modelOverride: this.chatBoxSettingsManager?.getSetting('chatboxLLMModel', 'auto'),
    };
    try {
      const selection = this.llmConfigManager.getRequestModelSelection('task', options);
      return selection && selection.providerKey ? selection : null;
    } catch (error) {
      // An explicit provider that is not enabled throws; reporting the Model
      // Types mapping instead would name a model the request never uses.
      console.warn('[ChatManager] ChatBox model selection unavailable:', error.message);
      return null;
    }
  }

  async sendToLLM(message, options = {}) {
    // Set current message for Dynamic Tools Registry
    this.currentMessage = message;

    // Wait for LLM configuration to be fully loaded
    if (this.llmConfigManager && this.llmConfigManager.waitForInitialization) {
      await this.llmConfigManager.waitForInitialization();
    }

    // Check if LLM is configured
    if (!this.llmConfigManager.isConfigured()) {
      return 'I need to be configured first. Please go to Options → Configure LLM Providers to set up your preferred AI provider (OpenAI, Anthropic, Google, or Custom Endpoint).';
    }

    // Initialize execution tracking for benchmark integration
    const executionData = {
      functionCalls: [],
      toolResults: [],
      rounds: 0,
      startTime: Date.now(),
      endTime: null,
      totalExecutionTime: 0,
    };

    // Store execution data for benchmark access
    this.lastExecutionData = executionData;

    console.log('=== ChatManager.sendToLLM DEBUG START ===');
    console.log('User message:', message);

    // Set up the AbortController
    this.conversationState.abortController = new AbortController();
    console.log('AbortController initialized:', !!this.conversationState.abortController);
    const TurnContextClass =
      (typeof window !== 'undefined' && window.TurnContext) ||
      (typeof globalThis !== 'undefined' && globalThis.TurnContext);
    const turnContext =
      options.turnContext ||
      (typeof TurnContextClass === 'function'
        ? new TurnContextClass({
            parentTurnId: options.parentTurnId,
            source: options.source || 'chat',
            mode: options.mode || 'default',
            originalMessage: message,
            scope: options.scope,
            abortSignal: this.conversationState.abortController.signal,
            deadline: options.deadline,
          })
        : null);
    executionData.turnContext = turnContext;
    try {
      const capabilityRegistry = this.getCapabilityRegistry?.();
      executionData.capabilityRegistry = capabilityRegistry || null;
      if (turnContext && capabilityRegistry) turnContext.capabilityRegistry = capabilityRegistry;
    } catch (error) {
      executionData.orchestrationDiagnostics = [{ type: 'registry_initialization_error', message: error.message }];
    }

    try {
      // Check if multi-agent system is enabled
      const multiAgentEnabled = this.configManager.get('multiAgentSettings.multiAgentSystemEnabled', false);
      const showAgentInfo = this.configManager.get('multiAgentSettings.multiAgentShowInfo', true);

      if (multiAgentEnabled) {
        // Add multi-agent system activation message
        this.addMultiAgentActivationMessage();

        if (showAgentInfo) {
          this.addThinkingMessage(
            `🤖 **Multi-Agent System Activated**\n\n` +
              `🔄 **Agent Coordination Mode**: Enabled\n` +
              `📊 **Available Agents**: 8 specialized agents\n` +
              `🧠 **Decision Process**: Intelligent agent selection and coordination\n` +
              `⚡ **Performance**: Optimized execution with caching\n\n` +
              `*Multi-agent system will now coordinate tool execution across specialized agents...*`
          );
        }
      }

      // Get maximum function call rounds from configuration
      const configuredMaxRounds = Number(this.configManager.get('llm.functionCallRounds', 10));
      const maxRounds = Number.isFinite(configuredMaxRounds)
        ? Math.max(1, Math.min(Math.trunc(configuredMaxRounds), 20))
        : 10;
      const enableEarlyCompletion = this.configManager.get('llm.enableEarlyCompletion', true);
      console.log('🔧 Maximum function call rounds from config:', maxRounds);
      console.log('🔧 Early completion enabled:', enableEarlyCompletion);
      console.log('🔧 LLM config raw value:', this.configManager.get('llm.functionCallRounds'));

      // Show the detailed thinking process
      this.showThinkingProcess &&
        this.addThinkingMessage(
          `🔄 <strong>Starting request processing</strong> (max rounds: ${maxRounds})<br>` +
            `📝 <strong>User Query:</strong> ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`
        );

      // Get current studio context
      const context = this.getCurrentContext();
      console.log('Context for LLM:', context);

      // Display context information
      if (this.showThinkingProcess && context) {
        const contextInfo = [];
        if (context.currentFile) contextInfo.push(`📄 Current file: ${context.currentFile}`);
        if (context.selectedFeatures && context.selectedFeatures.length > 0) {
          contextInfo.push(`🎯 Selected features: ${context.selectedFeatures.length}`);
        }
        if (context.genomeLoaded) contextInfo.push(`🧬 Genome loaded: Yes`);
        if (contextInfo.length > 0) {
          this.updateThinkingMessage(
            `<br>📊 <strong>Current Context:</strong><br>&nbsp;&nbsp;${contextInfo.join('<br>&nbsp;&nbsp;')}`
          );
        }
      }

      // Surface the Dynamic Tool registration inventory before the first LLM round so
      // the user can see exactly which tools the agent has available for this request.
      await this.displayAvailableToolsInThinking();

      // Get memory context for conversation
      let memoryContext = null;
      try {
        memoryContext = await this.getMemoryContext(message, 'general_chat');
        if (memoryContext) {
          console.log('🧠 Retrieved memory context for conversation');
          this.showThinkingProcess &&
            this.updateThinkingMessage(
              `<br>🧠 Memory context retrieved: ${Object.keys(memoryContext).length} memory items`
            );
        }
      } catch (error) {
        console.warn('🧠 Failed to retrieve memory context:', error);
      }

      // Build initial conversation history including the new message
      const conversationHistory = await this.buildConversationHistory(message);
      console.log('Initial conversation history length:', conversationHistory.length);

      let currentRound = 0;
      let finalResponse = null;
      let taskCompleted = false;
      const successfulToolExecutionCounts = new Map(); // Track successful tool instances within this user request
      const toolExecutionState = this.createToolExecutionState(message);
      toolExecutionState.turnContext = turnContext;
      executionData.toolExecutionState = toolExecutionState;
      const toolReferenceResults = [];
      let lastSuccessfulResults = [];
      let lastSuccessfulTools = [];
      let consecutiveEmptyResponseRounds = 0;

      // Iterative function calling loop
      while (currentRound < maxRounds && !taskCompleted) {
        // A missing controller means the conversation was torn down under us —
        // that is an abort, never a reason to mint a fresh controller and keep
        // spending rounds the user already asked to stop.
        this.throwIfConversationAborted();

        currentRound++;
        executionData.rounds = currentRound;
        console.log(`=== FUNCTION CALL ROUND ${currentRound}/${maxRounds} ===`);

        // Update the thinking process - add more detailed information
        if (this.showThinkingProcess) {
          // Opens a collapsible group; every step below lands inside it until
          // the next round starts or the request finishes.
          this.beginActivityRound(currentRound, maxRounds);
          this.updateThinkingMessage(`📤 Sending request to LLM...`, { verbose: true });
          this.updateThinkingMessage(`📚 Conversation history: ${conversationHistory.length} messages`, {
            verbose: true,
          });
        }

        // Keep the payload inside the context budget. Per-result sanitization
        // bounds one tool result; only this bounds their sum across a long turn.
        const budgetReport = this.enforceConversationTokenBudget(conversationHistory, {
          originalMessage: message,
        });
        if (budgetReport && this.showThinkingProcess) {
          this.updateThinkingMessage(
            `✂️ Context budget: trimmed ~${budgetReport.before} → ~${budgetReport.after} tokens ` +
              `(${budgetReport.compactedResults} result(s) compacted, ${budgetReport.droppedMessages} message(s) dropped)`
          );
        }

        // Send conversation history to configured LLM.
        // Tokens stream into a live bubble so the user sees the answer forming
        // instead of waiting for the whole round to resolve.
        console.log('Sending to LLM...');
        this.beginStreamingResponse();
        let response;
        try {
          response = await this.llmConfigManager.sendMessageWithHistory(conversationHistory, context, memoryContext, {
            onToken: token => this.appendStreamingToken(token),
            onReasoningToken: token => this.appendStreamingReasoningToken(token),
            onStreamReset: () => this.resetStreamingResponse(),
            signal: this.conversationState.abortController?.signal,
            modelType: this.chatBoxSettingsManager?.getSetting('chatboxModelType', 'auto'),
            providerOverride: this.chatBoxSettingsManager?.getSetting('chatboxLLMProvider', 'auto'),
            modelOverride: this.chatBoxSettingsManager?.getSetting('chatboxLLMModel', 'auto'),
            tools: this.currentNativeTools,
            nativeFunctionCalling: this.configManager.get('chatboxSettings.enableNativeFunctionCalling', true),
            constrainedToolOutput: this.configManager.get('chatboxSettings.enableConstrainedToolOutput', true),
            toolChoice: 'auto',
            parallelToolCalls: true,
            temperatureOverride: this.benchmarkAutomationActive === true ? 0 : undefined,
            disableFallback: this.benchmarkAutomationActive === true,
            disableStreaming: this.benchmarkAutomationActive === true,
          });
        } finally {
          // The completed message is rendered by the normal path below, so the
          // preview bubble is always retired here — including on error/abort.
          this.endStreamingResponse();
        }
        const responseAnalysis = this.analyzeLLMResponse(response, message);
        const responseText = responseAnalysis.text;

        // Check whether the response was aborted
        this.throwIfConversationAborted();

        // Logged as a single object: the console call is a no-op unless debug
        // logging is on, and passing `response` directly avoids serializing the
        // whole (growing) response on every round the way JSON.stringify did.
        console.log('=== LLM Raw Response ===', {
          type: typeof response,
          length: responseText.length,
          isNull: response === null,
          isUndefined: response === undefined,
          isEmptyString: response === '',
          response,
        });

        // Show the LLM's thinking process (if the response contains thinking tags)
        if (this.showThinkingProcess) {
          // `responseText` holds only the prose part, so a round answered with a
          // native structured tool call measures 0 chars. Report the tool calls
          // and reasoning too, or the line reads as an empty response.
          const receivedParts = [];
          if (responseText.length) receivedParts.push(`${responseText.length} chars`);
          const nativeToolCallCount = responseAnalysis.toolCalls?.length || 0;
          if (nativeToolCallCount) {
            receivedParts.push(`${nativeToolCallCount} tool call${nativeToolCallCount === 1 ? '' : 's'}`);
          }
          if (responseAnalysis.reasoningText?.length) {
            receivedParts.push(`${responseAnalysis.reasoningText.length} chars reasoning`);
          }
          this.updateThinkingMessage(`✅ Response received (${receivedParts.join(', ') || 'empty'})`, {
            verbose: true,
          });
          this.displayLLMThinking(responseText, responseAnalysis.reasoningText, responseAnalysis.toolCalls);
        }

        // Consume one provider-neutral response analysis. It preserves native
        // structured calls while retaining the text-JSON compatibility protocol.
        const detectedTools = responseAnalysis.toolCalls;
        const detectedToolCount = detectedTools.length;
        if (detectedToolCount > 0) {
          // A round that produced a tool call is by definition not empty; reset
          // the guard so only consecutive empty prose rounds count toward it.
          consecutiveEmptyResponseRounds = 0;
        }

        // Tool selection ran once, before round 1, against the opening message
        // alone. A capability it missed would otherwise stay unreachable for the
        // whole turn, with the model burning rounds re-issuing a call that is
        // rejected as unadvertised every time. Offer it and let the model retry.
        const toolExpansion = this.expandAdvertisedToolsForRejectedCalls(responseAnalysis, toolExecutionState);
        if (toolExpansion.expanded) {
          consecutiveEmptyResponseRounds = 0;
          if (this.showThinkingProcess) {
            this.updateThinkingMessage(`🧰 Now advertising ${toolExpansion.addedTools.join(', ')} and retrying`);
          }
          if (responseText.trim()) conversationHistory.push({ role: 'assistant', content: responseText });
          conversationHistory.push(
            this.createToolExecutionFeedbackMessage(this.buildToolAvailabilityMessage(toolExpansion.addedTools))
          );
          continue;
        }

        if (detectedToolCount > 0 && this.shouldRecoverBeforeToolExecution(responseAnalysis)) {
          const recoveryDecision = this.getModelTurnRecoveryDecision(
            responseAnalysis,
            toolExecutionState,
            currentRound,
            maxRounds
          );
          if (recoveryDecision.action === 'retry') {
            if (responseText.trim()) conversationHistory.push({ role: 'assistant', content: responseText });
            conversationHistory.push({
              role: 'user',
              content: this.buildToolProtocolRecoveryMessage(
                recoveryDecision.reason,
                recoveryDecision.outstandingSteps,
                { nativeToolsAvailable: (this.currentNativeTools || []).length > 0 }
              ),
            });
            continue;
          }
          taskCompleted = true;
          finalResponse = recoveryDecision.finalResponse;
          toolExecutionState.terminationReason = recoveryDecision.reason;
          break;
        }

        const pendingExecution = this.createPendingToolExecutionQueue(
          detectedTools,
          successfulToolExecutionCounts,
          message,
          conversationHistory,
          currentRound,
          toolExecutionState
        );
        const pendingToolExecutionQueue = pendingExecution.pendingTools;
        const toolsToExecute = pendingToolExecutionQueue.slice();
        const duplicateSuppressedToolCount = pendingExecution.suppressedTools.length;
        const policyBlockedToolCount = pendingExecution.policyBlockedTools.length;

        try {
          const shadowPlan = this.compileToolCallPlan?.(toolsToExecute, {
            context: { scope: turnContext?.scope, turnContext, referenceResults: toolReferenceResults },
            referenceResults: toolReferenceResults,
          });
          if (shadowPlan) {
            executionData.orchestrationPlan = shadowPlan;
            toolExecutionState.orchestrationPlan = shadowPlan;
            if (turnContext) turnContext.diagnostics.push(...shadowPlan.diagnostics);
          }
        } catch (error) {
          const diagnostic = { type: 'plan_compilation_error', message: error.message };
          executionData.orchestrationDiagnostics = [...(executionData.orchestrationDiagnostics || []), diagnostic];
          turnContext?.diagnostics?.push(diagnostic);
        }

        // Display tool detection information
        if (this.showThinkingProcess) {
          if (toolsToExecute.length > 0) {
            this.updateThinkingMessage(
              `🔍 Detected ${detectedToolCount} tool call(s), queued ${toolsToExecute.length}: ${toolsToExecute.map(t => t.tool_name).join(', ')}`
            );
          } else if (detectedToolCount > 0) {
            this.updateThinkingMessage(`🔍 Detected ${detectedToolCount} tool call(s), none queued for execution`);
          } else if (responseAnalysis.hasToolCallIntent) {
            this.updateThinkingMessage(`⚠️ Tool-like response detected but it could not be normalized`);
          } else {
            this.updateThinkingMessage(`💬 No tool calls detected - conversational response`);
          }
          if (duplicateSuppressedToolCount > 0) {
            this.updateThinkingMessage(
              `♻️ Ignored ${duplicateSuppressedToolCount} duplicate tool instance(s) from this response`
            );
          }
          if (policyBlockedToolCount > 0) {
            this.updateThinkingMessage(`🚫 Policy blocked ${policyBlockedToolCount} tool call(s)`);
          }
        }

        if (
          detectedToolCount > 0 &&
          toolsToExecute.length === 0 &&
          (duplicateSuppressedToolCount > 0 || policyBlockedToolCount > 0)
        ) {
          console.log('=== NON-EXECUTABLE TOOL CALLS DETECTED ===');
          console.log('The LLM produced duplicate tool instances or calls blocked by policy.');
          console.log(
            'Suppressed tools:',
            pendingExecution.suppressedTools.map(tool => tool.tool_name)
          );
          console.log(
            'Policy blocked tools:',
            pendingExecution.policyBlockedTools.map(tool => tool.tool_name)
          );
          console.log('=======================================');

          toolExecutionState.consecutiveSuppressedRounds = (toolExecutionState.consecutiveSuppressedRounds || 0) + 1;

          conversationHistory.push({
            role: 'assistant',
            content: responseText || JSON.stringify(pendingExecution.suppressedTools),
          });
          this.appendToolExecutionStateMessage(conversationHistory, toolExecutionState, {
            reason: 'duplicate tool call suppressed',
            includeAllRecords: false,
          });

          if (toolExecutionState.consecutiveSuppressedRounds >= 2 || currentRound >= maxRounds) {
            taskCompleted = true;
            const verifiedToolOnlyCompletion = this.canFinalizeFromSuccessfulToolResults(
              toolExecutionState,
              lastSuccessfulResults
            );
            finalResponse = verifiedToolOnlyCompletion
              ? this.generateCompletionResponseFromToolResults(lastSuccessfulResults, lastSuccessfulTools)
              : policyBlockedToolCount > 0
                ? 'The requested tool call was blocked by the tool execution policy before every requested step completed.'
                : 'The model repeated a tool call beyond the request limit before every requested step completed.';
            break;
          }

          console.log('Continuing after non-executable tool calls so the model can provide the next requested step.');
          continue;
        }

        // Tool detection is intentionally scoped to the latest LLM response.
        // Previous assistant messages may contain already-executed calls and must not seed a new queue.

        if (detectedToolCount === 0) {
          // Bounded empty-response guard. getModelTurnRecoveryDecision retries
          // empty rounds through its protocol-repair budget, but a model that
          // ends its turn cleanly without any visible answer (for example a
          // reasoning model that streams thinking but never produces prose)
          // must not be given an unbounded share of the round budget. Two
          // consecutive cleanly-stopped empty rounds end the turn with a
          // deterministic message instead of being misread as a finished
          // conversational reply. Truncated rounds (stop_reason length) are
          // intentionally excluded: while a thinking model is mid-reasoning
          // the visible answer is empty by design, and truncation is repaired
          // by the protocol-recovery path below.
          if (
            (responseAnalysis.isEmpty || responseText.trim() === '') &&
            this.isCleanCompletionStop(responseAnalysis)
          ) {
            consecutiveEmptyResponseRounds += 1;
            if (consecutiveEmptyResponseRounds >= 2) {
              console.log('=== REPEATED EMPTY MODEL RESPONSES ===');
              console.log('Terminating after', consecutiveEmptyResponseRounds, 'consecutive empty rounds');
              console.log('=======================================');

              taskCompleted = true;
              finalResponse = this.buildEmptyResponseMessage(currentRound, maxRounds);
              toolExecutionState.terminationReason = 'repeated empty model responses';
              break;
            }
          } else {
            consecutiveEmptyResponseRounds = 0;
          }

          const recoveryDecision = this.getModelTurnRecoveryDecision(
            responseAnalysis,
            toolExecutionState,
            currentRound,
            maxRounds
          );
          if (recoveryDecision.action === 'retry') {
            if (responseText.trim()) {
              conversationHistory.push({ role: 'assistant', content: responseText });
            }
            conversationHistory.push({
              role: 'user',
              content: this.buildToolProtocolRecoveryMessage(
                recoveryDecision.reason,
                recoveryDecision.outstandingSteps,
                { nativeToolsAvailable: (this.currentNativeTools || []).length > 0 }
              ),
            });
            if (this.showThinkingProcess) {
              this.updateThinkingMessage(
                `🔁 Retrying model turn (${toolExecutionState.protocolRecoveryAttempts}/2): ${recoveryDecision.reason}`
              );
            }
            continue;
          }
          if (recoveryDecision.action === 'fail') {
            taskCompleted = true;
            finalResponse = recoveryDecision.finalResponse;
            toolExecutionState.terminationReason = recoveryDecision.reason;
            break;
          }
        }

        // Check for task completion signals if early completion is enabled
        // BUT ONLY if there are NO tool calls to execute
        // The prose heuristic is a fallback, not the primary signal: it is only
        // honored when the provider stop reason is clean (or absent) and the
        // response does not itself announce a follow-up action ("I will ...").
        if (
          enableEarlyCompletion &&
          toolsToExecute.length === 0 &&
          this.isCleanCompletionStop(responseAnalysis) &&
          responseText.trim() !== '' &&
          !this.isInterimActionResponse(responseText)
        ) {
          const completionResult = this.checkTaskCompletion(responseText);
          if (completionResult.isCompleted) {
            console.log('=== TASK COMPLETION DETECTED (NO TOOL CALLS) ===');
            console.log('Completion reason:', completionResult.reason);
            console.log('Completion confidence:', completionResult.confidence);
            console.log('================================================');

            taskCompleted = true;
            finalResponse = completionResult.summary || responseText;
            toolExecutionState.terminationReason = 'completion heuristic';
            this.showNotification(
              `Task completed early (Round ${currentRound}/${maxRounds}): ${completionResult.reason}`,
              'success'
            );
            break;
          }
        } else if (toolsToExecute.length > 0) {
          console.log('=== TOOL CALLS FOUND - SKIPPING EARLY COMPLETION CHECK ===');
          console.log('Tool calls take priority over completion detection');
          console.log('=========================================================');
        }

        if (toolsToExecute.length > 0) {
          console.log(`=== ${toolsToExecute.length} TOOL CALL(S) DETECTED ===`);
          console.log(
            'Tools to execute:',
            toolsToExecute.map(t => t.tool_name)
          );
          console.log('==========================');

          // Show thinking process for tool execution
          if (this.showThinkingProcess) {
            this.noteActivityRoundTools(toolsToExecute.map(t => t.tool_name));
            this.updateThinkingMessage(`<br><br>⚡ <strong>Preparing tool execution...</strong>`, { verbose: true });
            this.updateThinkingMessage(`🛠️ Tools to execute: ${toolsToExecute.map(t => t.tool_name).join(', ')}`, {
              verbose: true,
            });
          }

          // Show the tool-call info
          this.showToolCalls && (await this.addToolCallMessage(toolsToExecute));

          try {
            console.log('Executing tool(s)...');

            // Show execution start in thinking process
            if (this.showThinkingProcess) {
              this.updateThinkingMessage(`🚀 Starting execution...`, { verbose: true });
            }

            // Check whether it was aborted
            this.throwIfConversationAborted();

            let toolResults;
            const hasToolParameterReferences = toolsToExecute.some(tool =>
              this.toolParametersContainReferences(tool.parameters)
            );
            if (hasToolParameterReferences && this.showThinkingProcess) {
              this.updateThinkingMessage(`🔗 Resolving tool result references sequentially`, { verbose: true });
            }

            // Use Smart Executor if available and enabled
            if (this.smartExecutor && this.isSmartExecutionEnabled && !hasToolParameterReferences) {
              console.log('🚀 Using Smart Executor for optimized execution');
              const smartToolsToExecute = pendingToolExecutionQueue.splice(0, pendingToolExecutionQueue.length);
              const smartResult = await this.smartExecutor.smartExecute(message, smartToolsToExecute);

              if (smartResult.success) {
                toolResults = smartResult.results;

                // Provide comprehensive feedback
                if (smartResult.report) {
                  const { summary, categorySummary } = smartResult.report;

                  // Show quick feedback for different categories
                  for (const category of categorySummary) {
                    if (category.successful > 0) {
                      let icon;
                      let message;
                      switch (category.name) {
                        case 'browserActions':
                          icon = '✓';
                          message = 'Browser actions completed';
                          break;
                        case 'dataRetrieval':
                          icon = '📊';
                          message = 'Data retrieved';
                          break;
                        case 'sequenceAnalysis':
                          icon = '🧬';
                          message = 'Analysis completed';
                          break;
                        case 'blastSearch':
                          icon = '🔍';
                          message = 'BLAST search completed';
                          break;
                        default:
                          icon = '✓';
                          message = 'Operations completed';
                      }
                      this.showNotification(
                        `${icon} ${message} (${category.successful}/${category.successful + category.failed})`,
                        'success'
                      );
                    }
                  }

                  console.log('Smart execution summary:', summary);
                  console.log('Execution time:', smartResult.executionTime, 'ms');
                }
              } else {
                console.warn('Smart execution failed, falling back to standard execution:', smartResult.error);
                pendingToolExecutionQueue.push(...smartToolsToExecute);
                toolResults = await this.executePendingToolExecutionQueue(
                  pendingToolExecutionQueue,
                  toolReferenceResults,
                  { turnContext }
                );
              }
            } else {
              const graphEnabled =
                this.configManager?.get('chatboxSettings.enableExecutionGraphScheduler', false) === true;
              toolResults = graphEnabled
                ? await this.executeToolExecutionGraph(pendingToolExecutionQueue, toolReferenceResults, { turnContext })
                : await this.executePendingToolExecutionQueue(pendingToolExecutionQueue, toolReferenceResults, {
                    turnContext,
                  });
            }

            console.log('Tool execution completed. Results:', toolResults);
            this.addToolResultsToReferenceContext(toolReferenceResults, toolResults);
            const planCompletion = executionData.orchestrationPlan?.completion;
            toolExecutionState.consecutiveSuppressedRounds = 0;
            this.markToolExecutionResults(toolExecutionState, toolsToExecute, toolResults, currentRound);
            toolExecutionState.completionEvaluation = this.evaluateTurnCompletion(
              planCompletion,
              toolExecutionState.records.concat(toolResults),
              { turnId: turnContext?.turnId, round: currentRound }
            );

            // Show execution results in thinking process
            if (this.showThinkingProcess) {
              const successCount = toolResults.filter(r => r.success).length;
              const failCount = toolResults.filter(r => !r.success).length;
              this.noteActivityRoundOutcome(successCount, failCount);
              this.updateThinkingMessage(`✅ Execution completed: ${successCount} successful, ${failCount} failed`);

              // Show details for each tool
              toolResults.forEach(result => {
                if (result.success) {
                  this.updateThinkingMessage(`&nbsp;&nbsp;✅ ${result.tool}: Success`);
                } else {
                  this.updateThinkingMessage(`&nbsp;&nbsp;❌ ${result.tool}: Failed - ${result.error}`);
                }
              });
            }

            // BENCHMARK INTEGRATION: Track function calls and results for benchmark access.
            // Write into the request-local `executionData`, never the shared
            // `this.lastExecutionData`: an aborted request whose tool queue is
            // still running in the background must not append its calls/results
            // into the next benchmark test's captured interaction data.
            if (executionData) {
              // Track function calls
              toolsToExecute.forEach(tool => {
                executionData.functionCalls.push({
                  tool_name: tool.tool_name,
                  parameters: tool.parameters,
                  id: tool.tool_call_id ?? tool.id ?? null,
                  round: currentRound,
                  timestamp: new Date().toISOString(),
                });
              });

              // Track tool results
              executionData.toolResults.push(...toolResults);
              executionData.rounds = currentRound;
            }

            // BENCHMARK EARLY STOP: when the benchmark runner supplies a
            // coverage callback, stop as soon as every expected call has been
            // observed and executed successfully. A model that already
            // completed the task must not over-complete with extra
            // viewer/verification/wrap-up calls that the completion scorer
            // would otherwise have to tolerate or penalize one tool at a time.
            if (typeof options?.shouldStopAfterRound === 'function') {
              let covered = false;
              try {
                covered = await options.shouldStopAfterRound({
                  functionCalls: executionData.functionCalls,
                  toolResults: executionData.toolResults,
                  rounds: currentRound,
                });
              } catch (coverageError) {
                console.warn('[Benchmark] shouldStopAfterRound failed:', coverageError);
              }
              if (covered) {
                console.log(`=== [Benchmark] Early stop after round ${currentRound}: expected coverage reached ===`);
                finalResponse = 'Completed all requested tool calls.';
                taskCompleted = true;
                break;
              }
            }

            // Show the tool execution result
            this.showToolCalls && this.addToolResultMessage(toolResults);

            // Process results
            const successfulResults = toolResults.filter(r => r.success);
            const failedResults = toolResults.filter(r => !r.success);

            // Kick off programmatic status polling as soon as a queued Deep
            // Gene Research task descriptor arrives — the research runs for
            // minutes server-side and the LLM cannot poll it reliably itself.
            this.startDgrTaskPollingFromResults(successfulResults);

            const queuedResearchTask = successfulResults.some(result =>
              this.extractDgrTaskDescriptor(result.result, result.parameters)
            );

            // Replay this round into the transcript for the next round. When the
            // model used the provider's native tool protocol this restores the
            // real assistant turn and binds each result to its tool_call_id;
            // otherwise it falls back to the portable prose envelope.
            const replayProtocol = this.appendToolRoundToHistory(conversationHistory, {
              assistantText: responseText,
              toolsToExecute,
              toolResults,
              queuedResearchTask,
            });
            console.log(`Tool round replayed into history using the ${replayProtocol} protocol`);

            if (successfulResults.length > 0) {
              toolExecutionState.consecutiveFailureRounds = 0;
              // Clears the consecutive streak only. The cumulative count in
              // totalProtocolRecoveryAttempts is what bounds the turn, because a
              // repair that just re-runs an already-recorded tool is not progress.
              toolExecutionState.protocolRecoveryAttempts = 0;
              successfulResults.forEach(result => {
                const toolKey = this.getToolExecutionKey(result.tool, result.parameters);
                successfulToolExecutionCounts.set(toolKey, (successfulToolExecutionCounts.get(toolKey) || 0) + 1);
              });
              lastSuccessfulResults = successfulResults;
              lastSuccessfulTools = successfulResults.map(result => ({
                tool_name: result.tool,
                parameters: this.normalizeToolParams(result.tool, result.parameters),
              }));

              // ENHANCED: Check for simple task completion after successful tool execution
              const shouldTerminateEarly =
                this.hasSuccessfulExecutionForRequest(toolExecutionState) &&
                this.shouldTerminateAfterToolExecution(toolsToExecute, successfulResults, message);
              if (shouldTerminateEarly) {
                console.log('=== EARLY TERMINATION AFTER SUCCESSFUL TOOL EXECUTION ===');
                console.log('Simple task completed successfully, terminating early');
                console.log('=========================================================');

                taskCompleted = true;
                // Generate a simple completion response based on the tool results
                finalResponse = this.generateCompletionResponseFromToolResults(successfulResults, toolsToExecute);
                break;
              }

              console.log(
                `${successfulResults.length} tool(s) executed successfully. Continuing to round ${currentRound + 1} to check for follow-up actions.`
              );
            }

            if (failedResults.length > 0) {
              console.log(`${failedResults.length} tool(s) failed:`, failedResults);

              // Give the model one bounded opportunity to correct parameters or
              // choose an alternate capability. Repeated failure still terminates.
              if (successfulResults.length === 0) {
                toolExecutionState.consecutiveFailureRounds += 1;
                const automaticRetryAllowed = this.canAutomaticallyRetryToolFailures(failedResults);
                console.log('=== ALL TOOLS FAILED ===');
                console.log(
                  'Failed tools:',
                  failedResults.map(r => r.tool)
                );
                console.log(
                  'Errors:',
                  failedResults.map(r => r.error)
                );
                console.log('Consecutive failed tool rounds:', toolExecutionState.consecutiveFailureRounds);
                console.log('Automatic retry allowed:', automaticRetryAllowed);
                console.log('========================');

                if (
                  !automaticRetryAllowed ||
                  toolExecutionState.consecutiveFailureRounds >= 2 ||
                  currentRound >= maxRounds
                ) {
                  taskCompleted = true;
                  toolExecutionState.terminationReason = automaticRetryAllowed
                    ? 'repeated tool execution failure'
                    : 'non-retryable tool execution failure';

                  // Generate more informative error response based on the specific tool
                  if (failedResults.length === 1 && failedResults[0].tool === 'get_genome_info') {
                    finalResponse =
                      `ℹ️ **Unable to retrieve genome information**\n\n` +
                      `The genome information tool is currently unavailable. This might be because:\n` +
                      `- No genome file is currently loaded\n` +
                      `- The genome browser is not initialized\n` +
                      `- The requested data is not available\n\n` +
                      `Please try loading a genome file first or check if the genome browser is properly initialized.`;
                  } else {
                    const retryDescription = automaticRetryAllowed
                      ? 'after a recovery attempt'
                      : 'without an automatic retry because the operation may have side effects';
                    finalResponse =
                      `❌ **Tool Execution Failed**\n\n` +
                      `The following tool(s) could not be executed ${retryDescription}:\n` +
                      failedResults.map(r => `- **${r.tool}**: ${r.error || 'Unknown error'}`).join('\n') +
                      `\n\nPlease check your system configuration or try a different approach.`;
                  }
                  break;
                }

                console.log('Returning failure state to the model for one corrective round.');
              }
            }

            if (!taskCompleted && toolResults.length > 0) {
              this.appendToolExecutionStateMessage(conversationHistory, toolExecutionState, {
                reason: 'tool execution results',
                includeAllRecords: false,
              });
            }
          } catch (error) {
            if (this.isAbortError(error)) throw error;
            console.error('=== TOOL EXECUTION EXCEPTION ===');
            console.error('Error:', error);
            console.error('Stack:', error.stack);
            console.error('================================');

            toolExecutionState.consecutiveFailureRounds += 1;
            const automaticRetryAllowed = this.canAutomaticallyRetryToolFailures(
              toolsToExecute.map(tool => ({ tool: tool.tool_name }))
            );
            // Use a user-role protocol message so every provider retains the error;
            // Anthropic and Gemini adapters keep only the leading system message.
            conversationHistory.push(
              this.createToolExecutionFeedbackMessage(
                `[Tool Execution Error]\n${error.message}\n` +
                  'Choose a corrected call or a different available tool. Do not repeat the same failing call unchanged.'
              )
            );
            if (
              !automaticRetryAllowed ||
              toolExecutionState.consecutiveFailureRounds >= 2 ||
              currentRound >= maxRounds
            ) {
              taskCompleted = true;
              toolExecutionState.terminationReason = automaticRetryAllowed
                ? 'repeated tool execution exception'
                : 'non-retryable tool execution exception';
              finalResponse = automaticRetryAllowed
                ? `❌ Tool execution failed repeatedly: ${error.message}`
                : `❌ Tool execution failed and was not retried because the operation may have side effects: ${error.message}`;
              break;
            }
          }
        } else {
          console.log('=== NO TOOL CALL DETECTED ===');
          console.log('Received conversational response, ending function call loop');
          console.log('===============================');

          // No tool call detected - this is our final response
          // The primary completion signal is the provider stop reason: a clean
          // stop (or an absent stop reason from adapters that collapse clean
          // completions into plain strings) means the model ended its turn on
          // its own. A provider-reported abnormal stop must never be presented
          // as a completed answer, even if recovery above did not catch it.
          if (!this.isCleanCompletionStop(responseAnalysis)) {
            const abnormalStop = String(responseAnalysis?.stopReason || 'unknown');
            console.warn('=== ABNORMAL PROVIDER STOP NOT RECOVERED ===');
            console.warn('Stop reason:', abnormalStop);
            console.warn('===========================================');

            taskCompleted = true;
            finalResponse =
              `I stopped responding abnormally (${abnormalStop}) before the request was complete. ` +
              `No further action was taken; please rephrase or retry the request.`;
            toolExecutionState.terminationReason = `abnormal provider stop (${abnormalStop})`;
          } else {
            finalResponse = responseText;
            toolExecutionState.terminationReason = 'final conversational response';
          }
          break;
        }
      }

      // Reaching the configured bound is an incomplete state, not permission for
      // one uncounted and unparsed "summary" call that may emit more tool JSON.
      if (!finalResponse) {
        console.log('=== MAX ROUNDS REACHED ===');
        toolExecutionState.terminationReason = 'maximum rounds reached';
        finalResponse = this.buildRoundLimitResponse(maxRounds, lastSuccessfulResults, lastSuccessfulTools);
        console.log('Returning deterministic incomplete response:', finalResponse);
      }

      // BENCHMARK INTEGRATION: Complete execution data tracking
      if (this.lastExecutionData) {
        this.lastExecutionData.endTime = Date.now();
        this.lastExecutionData.totalExecutionTime = this.lastExecutionData.endTime - this.lastExecutionData.startTime;
        this.lastExecutionData.finalResponse =
          finalResponse || 'I completed the requested actions. Please let me know if you need anything else.';
        this.lastExecutionData.terminationReason = toolExecutionState.terminationReason;
        console.log('📊 Execution data for benchmark:', this.lastExecutionData);
      }

      console.log('=== ChatManager.sendToLLM DEBUG END (SUCCESS) ===');
      return finalResponse || 'I completed the requested actions. Please let me know if you need anything else.';
    } catch (error) {
      // A user-requested stop is not a failure to report as one. Every caller
      // (sendMessage, sendMessageProgrammatically, processAgentPrompt) already
      // branches on error.name === 'AbortError'; swallowing it here is what made
      // pressing stop render "❌ Unexpected Error" and left those branches dead.
      if (this.isAbortError(error)) {
        console.log('=== ChatManager.sendToLLM DEBUG END (ABORTED) ===');
        throw this.createAbortError();
      }

      console.error('=== LLM COMMUNICATION ERROR ===');
      console.error('Error:', error);
      console.error('Stack:', error.stack);
      console.error('==============================');

      let errorMessage;

      // Provide specific error messages based on error type
      if (error.message.includes('HTTP 503') || error.message.includes('Service Unavailable')) {
        errorMessage =
          `🚫 **Service Temporarily Unavailable**\n\n` +
          `The LLM service is currently experiencing high load or maintenance. ` +
          `The system automatically retried your request, but the service remains unavailable.\n\n` +
          `**Suggestions:**\n` +
          `• Wait a few minutes and try again\n` +
          `• Switch to a different LLM provider in Options → Configure LLM Providers\n` +
          `• Check the service status page for your LLM provider`;
      } else if (error.message.includes('HTTP 429') || error.message.includes('Too Many Requests')) {
        errorMessage =
          `⏱️ **Rate Limit Exceeded**\n\n` +
          `You've exceeded the API rate limit for your LLM provider. ` +
          `The system will automatically retry, but you may need to wait.\n\n` +
          `**Suggestions:**\n` +
          `• Wait a few minutes before sending another message\n` +
          `• Consider upgrading your API plan for higher limits\n` +
          `• Switch to a different LLM provider temporarily`;
      } else if (error.message.includes('HTTP 401') || error.message.includes('Unauthorized')) {
        errorMessage =
          `🔐 **Authentication Error**\n\n` +
          `Your API key appears to be invalid or expired.\n\n` +
          `**Please:**\n` +
          `• Go to Options → Configure LLM Providers\n` +
          `• Check and update your API key\n` +
          `• Test the connection before saving`;
      } else if (error.message.includes('HTTP 404') || error.message.includes('Not Found')) {
        errorMessage =
          `🔍 **Model Not Found**\n\n` +
          `The requested model is not available or doesn't exist.\n\n` +
          `**Please:**\n` +
          `• Go to Options → Configure LLM Providers\n` +
          `• Select a different model\n` +
          `• Check your provider's available models`;
      } else if (
        error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('connection')
      ) {
        errorMessage =
          `🌐 **Network Connection Error**\n\n` +
          `Unable to connect to the LLM service. This could be due to:\n\n` +
          `• Internet connectivity issues\n` +
          `• Firewall blocking the connection\n` +
          `• Service endpoint temporarily down\n\n` +
          `**Please check your internet connection and try again.**`;
      } else {
        errorMessage =
          `❌ **Unexpected Error**\n\n` +
          `${error.message}\n\n` +
          `**Troubleshooting:**\n` +
          `• Check your LLM configuration in Options → Configure LLM Providers\n` +
          `• Try switching to a different LLM provider\n` +
          `• Check the browser console for more details`;
      }

      console.log('=== ChatManager.sendToLLM DEBUG END (LLM ERROR) ===');
      return errorMessage;
    }
  }

  /**
   * Sanitize tool result for LLM context
   * Removes or truncates large data arrays to prevent context overflow
   * @param {Object} result - The tool execution result
   * @param {string} toolName - Name of the tool that generated the result
   * @returns {Object} Sanitized result suitable for LLM context
   */
  sanitizeResultForLLM(result, toolName) {
    if (!result || typeof result !== 'object') {
      return result;
    }

    // Create a shallow copy to avoid modifying the original
    const sanitized = { ...result };

    // ─── Tool-specific sanitization rules ───────────────────────────────

    switch (toolName) {
      case 'fetch_alphafold_structure':
      case 'fetch_protein_structure':
        // These tools may return large PDB/structure data that must NEVER
        // be included in LLM context (100KB–1MB per structure).
        // Layer 1 (ProteinService) should already exclude pdbData via _dataRef,
        // but this is a defense-in-depth safety net.
        if (sanitized.pdbData || sanitized.pdb_data) {
          const dataField = sanitized.pdbData ? 'pdbData' : 'pdb_data';
          const dataLength = (sanitized[dataField] || '').length;
          delete sanitized[dataField];
          sanitized._pdbDataOmitted = {
            length: dataLength,
            note: 'Full PDB data omitted to prevent context overflow. Use downloadUrl or _dataRef to access.',
          };
        }
        if (Array.isArray(sanitized.confidenceScores) && sanitized.confidenceScores.length > 50) {
          const residueCount = sanitized.confidenceScores.length;
          sanitized.confidenceScores = {
            residueCount,
            note: 'Per-residue confidence scores omitted from LLM context. The complete scores remain available in the tool result and PDB B-factor column.',
            sample: sanitized.confidenceScores.slice(0, 10),
          };
        }
        break;

      case 'genome_codon_usage_analysis':
        // Keep summary statistics but remove large gene list
        if (sanitized.analyzedGenes && Array.isArray(sanitized.analyzedGenes)) {
          const geneCount = sanitized.analyzedGenes.length;
          const sampleSize = 5;
          sanitized.analyzedGenes = {
            totalCount: geneCount,
            note: `Full list omitted (${geneCount} genes analyzed)`,
            sample: sanitized.analyzedGenes.slice(0, sampleSize).map(g => ({
              name: g.name,
              length: g.length,
              chromosome: g.chromosome,
            })),
          };
        }
        // Truncate codonPreferences to top amino acids only
        if (sanitized.codonPreferences && typeof sanitized.codonPreferences === 'object') {
          const aaEntries = Object.entries(sanitized.codonPreferences)
            .filter(([aa]) => aa !== '*')
            .sort(([, a], [, b]) => (b.totalCount || 0) - (a.totalCount || 0))
            .slice(0, 10); // Keep only top 10 amino acids
          sanitized.codonPreferences = {
            note: `Showing top 10 amino acids by usage`,
            data: Object.fromEntries(aaEntries),
          };
        }
        break;

      case 'codon_usage_analysis':
        // Keep only top codons for summary
        if (sanitized.codonUsage && Array.isArray(sanitized.codonUsage)) {
          sanitized.codonUsage = sanitized.codonUsage.slice(0, 15); // Top 15 codons
        }
        break;

      case 'search_features':
      case 'find_gene_by_name':
      case 'get_gene_details':
        // Limit gene/feature results to reasonable number
        if (sanitized.genes && Array.isArray(sanitized.genes)) {
          const totalGenes = sanitized.genes.length;
          if (totalGenes > 10) {
            sanitized.genes = sanitized.genes.slice(0, 10);
            sanitized.note = `Showing first 10 of ${totalGenes} results`;
          }
        }
        if (sanitized.features && Array.isArray(sanitized.features)) {
          const totalFeatures = sanitized.features.length;
          if (totalFeatures > 10) {
            sanitized.features = sanitized.features.slice(0, 10);
            sanitized.note = `Showing first 10 of ${totalFeatures} results`;
          }
        }
        break;

      case 'find_restriction_sites':
        // Limit array results
        if (sanitized.sites && Array.isArray(sanitized.sites)) {
          const totalSites = sanitized.sites.length;
          if (totalSites > 20) {
            sanitized.sites = sanitized.sites.slice(0, 20);
            sanitized.note = `Showing first 20 of ${totalSites} sites`;
          }
        }
        break;

      case 'get_track_settings_schema': {
        // Schema is large (~14KB). Compact each track to name + setting keys with
        // type and default only — removes verbose descriptions to fit context budget.
        if (sanitized.schema && typeof sanitized.schema === 'object') {
          const compact = {};
          for (const [trackType, trackDef] of Object.entries(sanitized.schema)) {
            if (!trackDef || typeof trackDef !== 'object') continue;
            compact[trackType] = { description: trackDef.description, settings: {} };
            const settings = trackDef.settings || {};
            for (const [key, meta] of Object.entries(settings)) {
              compact[trackType].settings[key] = {
                type: meta.type,
                default: meta.default,
                ...(meta.enum ? { enum: meta.enum } : {}),
              };
            }
          }
          sanitized.schema = compact;
          sanitized._schemaNormalized =
            'Descriptions stripped to reduce context size. Use get_track_settings for live values.';
        }
        break;
      }

      case 'get_all_track_settings': {
        // Keep only the most useful fields per track; skip deep nested objects.
        if (sanitized.settings && typeof sanitized.settings === 'object') {
          const KEY_FIELDS = [
            'height',
            'renderingMode',
            'layoutMode',
            'colorMode',
            'fontSize',
            'maxRows',
            'showCoverage',
            'showIndicators',
            'contentColor',
            'lineWidth',
            'defaultTrackHeight',
            'trackSpacing',
            'resultHeight',
            'resultSpacing',
            'showRuler',
            'adaptiveHeight',
            'error',
            '_note',
          ];
          const compact = {};
          for (const [trackType, trackSettings] of Object.entries(sanitized.settings)) {
            if (!trackSettings || typeof trackSettings !== 'object') {
              compact[trackType] = trackSettings;
              continue;
            }
            compact[trackType] = {};
            for (const field of KEY_FIELDS) {
              if (field in trackSettings) compact[trackType][field] = trackSettings[field];
            }
          }
          sanitized.settings = compact;
          sanitized._settingsNormalized =
            'Only key fields shown. Use get_track_settings with a specific track_type for full details.';
        }
        break;
      }
    }

    // ─── General sanitization for any result ─────────────────────────────

    // Truncate known sequence-like string fields. Chainable sequence tools need
    // enough context for follow-up calls such as CDS → translation → protein MW.
    const sequenceFieldLimit = ['get_coding_sequence', 'translate_dna', 'calculate_molecular_weight'].includes(toolName)
      ? 12000
      : 1000;
    const sequenceFields = ['sequence', 'codingSequence', 'proteinSequence', 'coding_sequence', 'protein_sequence'];
    for (const field of sequenceFields) {
      if (sanitized[field] && typeof sanitized[field] === 'string' && sanitized[field].length > sequenceFieldLimit) {
        const originalLength = sanitized[field].length;
        sanitized[field] =
          sanitized[field].substring(0, 500) +
          '...[truncated]...' +
          sanitized[field].substring(sanitized[field].length - 500);
        sanitized[`${field}Length`] = originalLength;
      }
    }

    // Remove pdbData/pdb_data from ANY tool result (defense-in-depth)
    for (const pdbField of ['pdbData', 'pdb_data']) {
      if (sanitized[pdbField] && typeof sanitized[pdbField] === 'string') {
        const len = sanitized[pdbField].length;
        delete sanitized[pdbField];
        if (!sanitized._pdbDataOmitted) {
          sanitized._pdbDataOmitted = {
            length: len,
            note: 'PDB data omitted to prevent context overflow.',
          };
        }
      }
    }

    // General large-string guard: truncate any string field > 5000 chars
    const LARGE_STRING_THRESHOLD = 5000;
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > LARGE_STRING_THRESHOLD) {
        const originalLength = sanitized[key].length;
        sanitized[key] =
          sanitized[key].substring(0, 2000) +
          `\n...[truncated ${originalLength - 4000} chars]...\n` +
          sanitized[key].substring(sanitized[key].length - 2000);
        sanitized[`_${key}_originalLength`] = originalLength;
      }
    });

    // Limit any large arrays not caught by specific rules
    Object.keys(sanitized).forEach(key => {
      if (Array.isArray(sanitized[key]) && sanitized[key].length > 50) {
        const originalLength = sanitized[key].length;
        sanitized[key] = sanitized[key].slice(0, 50);
        sanitized[`${key}_truncated`] = `Array truncated from ${originalLength} to 50 items`;
      }
    });

    // ─── Total size budget check ─────────────────────────────────────────
    // After all field-level sanitization, check if the total serialized size
    // exceeds the budget. If so, aggressively truncate the largest string fields.
    const MAX_RESULT_SIZE_BYTES = 50 * 1024; // 50KB budget per tool result
    try {
      let serialized = JSON.stringify(sanitized);
      if (serialized.length > MAX_RESULT_SIZE_BYTES) {
        console.warn(
          `[sanitizeResultForLLM] Result for "${toolName}" exceeds ${MAX_RESULT_SIZE_BYTES / 1024}KB budget ` +
            `(${(serialized.length / 1024).toFixed(1)}KB). Applying aggressive truncation.`
        );

        // Find all string fields sorted by length (largest first)
        const stringFields = Object.keys(sanitized)
          .filter(k => typeof sanitized[k] === 'string' && sanitized[k].length > 200)
          .sort((a, b) => sanitized[b].length - sanitized[a].length);

        for (const field of stringFields) {
          if (serialized.length <= MAX_RESULT_SIZE_BYTES) break;
          const originalLength = sanitized[field].length;
          sanitized[field] =
            sanitized[field].substring(0, 200) +
            `\n...[aggressively truncated from ${originalLength} chars to fit context budget]...\n`;
          sanitized[`_${field}_originalLength`] = originalLength;
          serialized = JSON.stringify(sanitized);
        }

        // If still over budget after string truncation, convert large objects to summaries
        if (serialized.length > MAX_RESULT_SIZE_BYTES) {
          const objectFields = Object.keys(sanitized)
            .filter(k => typeof sanitized[k] === 'object' && sanitized[k] !== null)
            .sort((a, b) => JSON.stringify(sanitized[b]).length - JSON.stringify(sanitized[a]).length);

          for (const field of objectFields) {
            if (serialized.length <= MAX_RESULT_SIZE_BYTES) break;
            const fieldSize = JSON.stringify(sanitized[field]).length;
            if (fieldSize > 500) {
              sanitized[field] = {
                _truncated: true,
                originalSize: fieldSize,
                note: 'Object truncated to fit context budget',
              };
              serialized = JSON.stringify(sanitized);
            }
          }
        }
      }
    } catch (e) {
      console.error('[sanitizeResultForLLM] Error during size budget check:', e);
    }

    return sanitized;
  }

  formatToolResult(toolName, parameters, result) {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.formatToolResult(toolName, parameters, result);
  }

  /**
   * Rough token estimate for one transcript message, tool-call payloads
   * included. The same 4-chars-per-token approximation the prompt metadata
   * uses; exact accounting would need a provider tokenizer, and the budget only
   * has to catch runaway growth, not price a request.
   */
  /** @see ConversationTranscriptService */
  estimateMessageTokens(message) {
    return this.getTranscriptService().estimateMessageTokens(message);
  }

  /** @see ConversationTranscriptService */
  estimateConversationTokens(conversationHistory = []) {
    return this.getTranscriptService().estimateConversationTokens(conversationHistory);
  }

  /**
   * Token ceiling for one request payload. Result sanitization bounds a single
   * tool result to 50KB, but nothing bounded the sum: a long turn could append
   * twenty of them and overflow the provider's context window, which surfaced
   * as a generic "Unexpected Error" with the real reason buried in a provider
   * response body.
   * @returns {number} budget in tokens, or 0 to disable enforcement
   */
  /** @see ConversationTranscriptService */
  getConversationTokenBudget() {
    return this.getTranscriptService().getConversationTokenBudget();
  }

  /** A tool result whose body can be replaced with a stub without losing structure. */
  /** @see ConversationTranscriptService */
  isCompactableResultMessage(message) {
    return this.getTranscriptService().isCompactableResultMessage(message);
  }

  /**
   * Replace a tool result body with a stub, keeping the message itself in place.
   * Structure is what makes this safe to do to any age of message: an assistant
   * `tool_calls` entry keeps its matching `tool` message, so the transcript
   * stays a valid protocol exchange.
   * @returns {boolean} whether anything was removed
   */
  /** @see ConversationTranscriptService */
  compactResultMessageContent(message) {
    return this.getTranscriptService().compactResultMessageContent(message);
  }

  /**
   * Spans that have to be dropped together. An assistant turn carrying
   * `tool_calls` and the `tool` messages answering them are one unit: dropping
   * either half alone leaves an unanswered tool call, which providers reject.
   * @returns {Array<{start: number, end: number}>}
   */
  /** @see ConversationTranscriptService */
  buildTranscriptGroups(conversationHistory = []) {
    return this.getTranscriptService().buildTranscriptGroups(conversationHistory);
  }

  /**
   * Trim the transcript to the token budget before it is sent.
   *
   * Two phases, cheapest first: shrink old tool result bodies (structure
   * preserved, always protocol-safe), then drop whole old exchanges. The system
   * message, the user message that started the turn, and the most recent
   * exchanges are never touched — losing those loses the task itself.
   *
   * @returns {{budget: number, before: number, after: number, compactedResults: number, droppedMessages: number}|null}
   *   a report when the transcript was trimmed, otherwise null
   */
  /** @see ConversationTranscriptService */
  enforceConversationTokenBudget(conversationHistory, options = {}) {
    return this.getTranscriptService().enforceConversationTokenBudget(conversationHistory, options);
  }

  async buildConversationHistory(newMessage) {
    const history = [];

    // Add system context message
    const systemMessage = await this.buildSystemMessage();
    history.push({ role: 'system', content: systemMessage });

    // If context mode is enabled (current message only), skip conversation history
    if (this.contextModeEnabled) {
      console.log('Context mode enabled: sending only current message');
      // Add only the new user message
      history.push({ role: 'user', content: newMessage });
      return history;
    }

    // Get conversation memory setting
    const conversationMemory = this.configManager.get('llm.conversationMemory', 10);

    // Get chat history and find the current conversation (after last separator)
    const chatHistory = this.configManager.getChatHistory();
    let currentConversationMessages = [];

    // Find messages after the last conversation separator
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const msg = chatHistory[i];
      if (msg.sender === 'system' && msg.message === '--- CONVERSATION_SEPARATOR ---') {
        break; // Stop at the last separator
      }
      currentConversationMessages.unshift(msg); // Add to beginning to maintain order
    }

    // If no separator found, use the full recent history
    if (currentConversationMessages.length === 0) {
      currentConversationMessages = chatHistory.slice(-conversationMemory * 2);
    }

    // Add conversation messages to history (exclude system messages and separators)
    for (const msg of currentConversationMessages.slice(-conversationMemory * 2)) {
      if (msg.sender === 'user') {
        history.push({ role: 'user', content: msg.message });
      } else if (msg.sender === 'assistant') {
        // App-generated failure notices are displayed in the chat but are not
        // model speech. Replayed as assistant turns they read as the model
        // describing its own failure, and the next request imitates it.
        if (this.isAppGeneratedNotice(msg.message)) continue;
        history.push({ role: 'assistant', content: msg.message });
      }
      // Skip system messages and separators
    }

    // Add the new user message
    history.push({ role: 'user', content: newMessage });

    return history;
  }

  /**
   * MCP prompt fetch, memoized per server and prompt name.
   *
   * buildSystemMessage() runs once per user message, and it fetched this prompt
   * every time — an MCP round-trip on the critical path before the first token,
   * for content that only changes when the server restarts.
   * `invalidateMcpPromptCache()` clears it on reconnect.
   */
  async getCachedMcpPrompt(serverId, promptName) {
    if (!this.mcpPromptCache) this.mcpPromptCache = new Map();
    const key = `${serverId}::${promptName}`;
    if (this.mcpPromptCache.has(key)) return this.mcpPromptCache.get(key);
    const promptResult = await this.mcpServerManager.getPrompt(serverId, promptName);
    this.mcpPromptCache.set(key, promptResult);
    return promptResult;
  }

  /** Drop memoized MCP prompts. Called when a server connects or disconnects. */
  invalidateMcpPromptCache(serverId = null) {
    if (!this.mcpPromptCache) return;
    if (!serverId) {
      this.mcpPromptCache.clear();
      return;
    }
    for (const key of [...this.mcpPromptCache.keys()]) {
      if (key.startsWith(`${serverId}::`)) this.mcpPromptCache.delete(key);
    }
  }

  async buildSystemMessage() {
    this.lastSystemPromptMetadata = null;
    this.currentNativeTools = [];

    // [MCP Integration] Check for specific MCP server prompts first
    if (this.mcpServerManager && this.mcpServerManager.serverPrompts) {
      for (const [serverId, prompts] of this.mcpServerManager.serverPrompts) {
        // Look for Deep Gene Research Assistant prompt
        const deepGenePrompt = prompts.find(
          p =>
            p.name === 'Deep Gene Research Assistant' ||
            p.name === 'deep-gene-research-agent' ||
            p.name === 'deep-gene-research-assistant' ||
            p.name === 'deep_gene_research_assistant'
        );

        if (deepGenePrompt) {
          console.log(`🤖 Found MCP system prompt from server ${serverId}: ${deepGenePrompt.name}`);
          try {
            // Fetch the full prompt content. Cached, because this ran an MCP
            // round-trip on every single user message for a prompt that only
            // changes when the server does.
            const promptResult = await this.getCachedMcpPrompt(serverId, deepGenePrompt.name);

            if (promptResult && promptResult.messages && promptResult.messages.length > 0) {
              console.log(`✅ Using MCP system prompt:`, promptResult.description || deepGenePrompt.name);

              // Extract text content from messages
              // MCP prompts return a list of messages (role + content)
              // We'll combine all system/user/assistant messages into one system instruction for now,
              // or just extract the content if it's primarily a system prompt.
              // For simplicity and compatibility with current single-string system prompt, we join text parts.

              let promptText = '';

              for (const msg of promptResult.messages) {
                if (msg.content) {
                  if (typeof msg.content === 'string') {
                    promptText += msg.content + '\n\n';
                  } else if (msg.content.text) {
                    promptText += msg.content.text + '\n\n';
                  }
                }
              }

              if (promptText.trim()) {
                // Append standard tool context if needed, or rely on the prompt to ask for tools?
                // Usually MCP prompts are standalone system instructions.
                // But we still need our tools available.

                const useOptimizedPrompt = this.configManager.get(
                  'chatboxSettings.useOptimizedPrompt',
                  this.configManager.get('llm.useOptimizedPrompt', true)
                );
                const toolContext = useOptimizedPrompt ? this.getOptimizedToolContext() : this.getCompleteToolContext();

                return `${promptText}\n\n${toolContext}`;
              }
            }
          } catch (error) {
            console.error(`❌ Failed to get/apply prompt '${deepGenePrompt.name}':`, error);
            // Fallback to standard logic if prompt fetching fails
          }
        }
      }
    }

    // Get user-defined system prompt
    // Check chatboxSettings.customSystemPrompt first, then llm.systemPrompt for backward compatibility
    const userSystemPrompt =
      this.configManager.get('chatboxSettings.customSystemPrompt', '') ||
      this.configManager.get('llm.systemPrompt', '');

    // Get system message format preference (optimized or complete)
    // Check both chatboxSettings and llm settings for backward compatibility
    const useOptimizedPrompt = this.configManager.get(
      'chatboxSettings.useOptimizedPrompt',
      this.configManager.get('llm.useOptimizedPrompt', true)
    );

    // Get system prompt section configuration
    const sectionConfig = this.getSystemPromptSectionConfig();

    // Get current user query for memory retrieval
    const currentUserQuery = this.getLastUserQuery() || '';

    // If user has defined a custom system prompt, use it with variable substitution
    if (userSystemPrompt && userSystemPrompt.trim()) {
      const processedPrompt = this.processSystemPromptVariables(userSystemPrompt);
      // Choose context based on optimization setting
      const toolContext = useOptimizedPrompt ? this.getOptimizedToolContext() : this.getCompleteToolContext();

      // Add memory context if enabled in section config
      let memorySection = '';
      if (sectionConfig.toggles.memoryContext) {
        const memoryContext = await this.getMemoryContext(currentUserQuery);
        memorySection = memoryContext ? `\n\n[Memory Context]\n${memoryContext}` : '';
      }

      return `${processedPrompt}\n\n${toolContext}${memorySection}`;
    }

    // Check if Dynamic Tools Registry is enabled in settings
    const dynamicToolsRegistryEnabled = this.configManager.get('chatboxSettings.enableDynamicToolsRegistry', true);
    console.log('🔧 [buildSystemMessage] Dynamic Tools Registry enabled in settings:', dynamicToolsRegistryEnabled);

    // Try to use Dynamic Tools Registry if available and enabled
    console.log('🔧 [buildSystemMessage] Checking Dynamic Tools Registry...');
    console.log('🔧 [buildSystemMessage] dynamicToolsEnabled:', this.dynamicToolsEnabled);
    console.log('🔧 [buildSystemMessage] dynamicTools:', this.dynamicTools);

    if (dynamicToolsRegistryEnabled && this.dynamicToolsEnabled && this.dynamicTools) {
      try {
        console.log('🔧 [buildSystemMessage] Using Dynamic Tools Registry...');
        const context = this.getCurrentContextForDynamicTools();
        const lastUserQuery = this.getLastUserQuery();
        console.log('🔧 [buildSystemMessage] Context:', context);
        console.log('🔧 [buildSystemMessage] Last user query:', lastUserQuery);

        const promptData = await this.dynamicTools.generateDynamicSystemPrompt(lastUserQuery, context, {
          selectionLimit: this.getDynamicToolsSelectionLimit(),
        });
        this.currentNativeTools = Array.isArray(promptData.nativeTools) ? promptData.nativeTools : [];
        console.log('🔧 [buildSystemMessage] Generated prompt data:', promptData);

        // Apply section configuration filtering to dynamic prompt
        const filteredPrompt = await this.applySystemPromptSectionConfig(
          promptData.systemPrompt,
          sectionConfig,
          currentUserQuery
        );
        this.lastSystemPromptMetadata = await this.createSystemPromptMetadata({
          mode: 'dynamic',
          prompt: filteredPrompt,
          promptData,
          context,
          userQuery: lastUserQuery,
        });
        return filteredPrompt;
      } catch (error) {
        console.warn('Dynamic Tools Registry failed, falling back to standard system message:', error);
        console.error('Dynamic Tools Registry error details:', error.message, error.stack);
      }
    } else {
      if (!dynamicToolsRegistryEnabled) {
        console.log('🔧 [buildSystemMessage] Dynamic Tools Registry disabled in settings, using fallback');
      } else if (!this.dynamicToolsEnabled) {
        console.log('🔧 [buildSystemMessage] Dynamic Tools Registry not initialized, using fallback');
      } else if (!this.dynamicTools) {
        console.log('🔧 [buildSystemMessage] Dynamic Tools Registry not available, using fallback');
      }
    }

    // For default system message, use optimized version by default
    // Apply section configuration
    const baseMessage = useOptimizedPrompt ? this.getOptimizedSystemMessage() : this.getBaseSystemMessage();

    // Add memory context if enabled in section config
    let memorySection = '';
    if (sectionConfig.toggles.memoryContext) {
      const memoryContext = await this.getMemoryContext(currentUserQuery);
      memorySection = memoryContext ? `\n\n[Memory Context]\n${memoryContext}` : '';
    }

    const fallbackPrompt = `${baseMessage}${memorySection}`;
    this.lastSystemPromptMetadata = {
      mode: dynamicToolsRegistryEnabled ? 'fallback' : 'non-dynamic',
      generatedAt: new Date().toISOString(),
      userQuery: currentUserQuery,
      dynamicToolsEnabled: dynamicToolsRegistryEnabled && this.dynamicToolsEnabled && !!this.dynamicTools,
      selectedToolCount: 0,
      selectedBuiltInToolCount: 0,
      selectedRegistryToolCount: 0,
      selectedPluginToolCount: 0,
      selectedTools: [],
      selectedToolsByCategory: {},
      promptLength: fallbackPrompt.length,
      promptTokenEstimate: this.estimatePromptTokens(fallbackPrompt),
      baselinePromptLength: fallbackPrompt.length,
      baselineTokenEstimate: this.estimatePromptTokens(fallbackPrompt),
      estimatedTokensSaved: 0,
      estimatedPercentSaved: 0,
    };
    return fallbackPrompt;
  }

  async createSystemPromptMetadata({ mode, prompt, promptData, context, userQuery }) {
    const tools = Array.isArray(promptData?.toolDefinitions)
      ? promptData.toolDefinitions
      : Array.isArray(promptData?.toolsUsed)
        ? promptData.toolsUsed
        : [];
    const selectedTools = tools.map(tool => ({
      name: tool.name || String(tool),
      category: tool.category || 'uncategorized',
      executionType: tool.execution_type || tool.executionType || tool.type || 'unknown',
      source: tool.source || null,
    }));
    const selectedToolsByCategory = selectedTools.reduce((acc, tool) => {
      acc[tool.category] = (acc[tool.category] || 0) + 1;
      return acc;
    }, {});
    const promptTokenEstimate = this.estimatePromptTokens(prompt);
    let baselinePromptLength = prompt.length;
    let baselineTokenEstimate = promptTokenEstimate;
    let baselineToolCount = promptData?.toolCount || selectedTools.length;
    let baselineMode = mode;

    if (
      this.benchmarkAutomationActive === true &&
      this.dynamicTools &&
      typeof this.dynamicTools.generateNonDynamicSystemPrompt === 'function'
    ) {
      try {
        const baselinePromptData = await this.dynamicTools.generateNonDynamicSystemPrompt(context || {});
        if (baselinePromptData?.systemPrompt) {
          baselinePromptLength = baselinePromptData.systemPrompt.length;
          baselineTokenEstimate = this.estimatePromptTokens(baselinePromptData.systemPrompt);
          baselineToolCount = baselinePromptData.toolCount || baselineToolCount;
          baselineMode = baselinePromptData.mode || 'non-dynamic-comprehensive';
        }
      } catch (error) {
        console.warn('⚠️ [buildSystemMessage] Failed to calculate benchmark dynamic tools baseline:', error);
      }
    }

    const estimatedTokensSaved = Math.max(0, baselineTokenEstimate - promptTokenEstimate);
    const estimatedPercentSaved = baselineTokenEstimate > 0 ? (estimatedTokensSaved / baselineTokenEstimate) * 100 : 0;

    return {
      mode,
      generatedAt: new Date().toISOString(),
      userQuery,
      dynamicToolsEnabled: true,
      selectedToolCount: promptData?.toolCount || selectedTools.length,
      selectedBuiltInToolCount: promptData?.builtInToolsIncluded || 0,
      selectedRegistryToolCount: promptData?.registryToolsIncluded || 0,
      selectedPluginToolCount: promptData?.pluginToolsIncluded || 0,
      selectedMcpToolCount: promptData?.mcpToolsIncluded || 0,
      selectedTools,
      selectedToolsByCategory,
      promptLength: prompt.length,
      promptTokenEstimate,
      baselineMode,
      baselineToolCount,
      baselinePromptLength,
      baselineTokenEstimate,
      estimatedTokensSaved,
      estimatedPercentSaved,
    };
  }

  estimatePromptTokens(text) {
    if (!text) return 0;
    return Math.ceil(String(text).length / 4);
  }

  /**
   * Get system prompt section configuration from ChatBox settings
   * @returns {object} Section config with toggles and order
   */
  getSystemPromptSectionConfig() {
    const defaultOrder = [
      'systemInstructions',
      'currentContext',
      'dynamicTools',
      'toolExamples',
      'toolGuidelines',
      'responseFormat',
      'toolCategories',
      'memoryContext',
    ];

    const order = this.configManager.get('chatboxSettings.systemPromptSectionOrder', defaultOrder);
    const toggles = {};
    for (const key of defaultOrder) {
      const settingKey = `chatboxSettings.systemPromptInclude${key.charAt(0).toUpperCase() + key.slice(1)}`;
      toggles[key] = this.configManager.get(settingKey, true);
    }

    return { order, toggles };
  }

  /**
   * Apply section configuration to a dynamically generated system prompt.
   * Filters out disabled sections and reorders them based on user configuration.
   * @param {string} prompt - The original system prompt
   * @param {object} sectionConfig - Section configuration with toggles and order
   * @param {string} userQuery - Current user query for memory context
   * @returns {Promise<string>} - Filtered and reordered system prompt
   */
  async applySystemPromptSectionConfig(prompt, sectionConfig, userQuery) {
    const { order, toggles } = sectionConfig;

    // Parse the dynamic prompt into sections by markdown headers
    const sections = this.parseSystemPromptSections(prompt);

    // Filter and reorder sections based on configuration
    const orderedSections = [];
    for (const sectionKey of order) {
      if (!toggles[sectionKey]) continue; // Skip disabled sections

      const sectionContent = this.mapSectionKeyToContent(sectionKey, sections);
      if (sectionContent) {
        orderedSections.push(sectionContent);
      }
    }

    // Add any sections from the original prompt that weren't mapped
    for (const [header] of Object.entries(sections)) {
      const isMapped = this.mapHeaderToSectionKey(header);
      if (!isMapped || !toggles[isMapped]) continue;
      // Already included above
    }

    // Add memory context if enabled
    if (toggles.memoryContext) {
      const memoryContext = await this.getMemoryContext(userQuery);
      if (memoryContext) {
        orderedSections.push(`## Memory Context\n\n${memoryContext}`);
      }
    }

    return orderedSections.join('\n\n');
  }

  /**
   * Parse a system prompt into sections by markdown headers
   * @param {string} prompt - The system prompt to parse
   * @returns {object} Map of header -> content
   */
  parseSystemPromptSections(prompt) {
    const sections = {};
    const lines = prompt.split('\n');
    let currentHeader = null;
    let currentContent = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        // Save previous section
        if (currentHeader !== null) {
          sections[currentHeader] = currentContent.join('\n').trim();
        } else if (currentContent.length > 0) {
          // Content before any ## header is the preamble (system instructions / role definition)
          sections['_preamble'] = currentContent.join('\n').trim();
        }
        currentHeader = line.replace(/^##\s+/, '').trim();
        currentContent = [line];
      } else if (currentHeader !== null) {
        currentContent.push(line);
      } else {
        // Content before any header - treat as preamble
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentHeader !== null) {
      sections[currentHeader] = currentContent.join('\n').trim();
    } else if (currentContent.length > 0) {
      // No headers found, treat entire prompt as one section
      sections['_preamble'] = currentContent.join('\n').trim();
    }

    return sections;
  }

  /**
   * Map a section key (from config) to content from parsed sections
   * @param {string} sectionKey - Section key from configuration
   * @param {object} sections - Parsed sections map
   * @returns {string|null} - Content for this section
   */
  mapSectionKeyToContent(sectionKey, sections) {
    const headerMappings = {
      systemInstructions: ['CodeXomics', 'Enhanced Dynamic Tools System', 'Comprehensive Tools System'],
      currentContext: ['Current Context', '🧬 Current Context'],
      dynamicTools: [
        'Directly Available Tools',
        '🔧 Directly Available Tools',
        '🔧 Directly Available Tools (Built-in)',
        'Built-in Tools',
        'MCP Server Tools',
      ],
      toolExamples: ['Tool Usage Examples', '📚 Tool Usage Examples'],
      toolGuidelines: ['Tool Selection Guidelines', '🎯 Enhanced Tool Selection Guidelines', 'Tool Usage Guidelines'],
      responseFormat: ['Response Format', '⚡ Response Format'],
      toolCategories: [
        'Tool Categories',
        '🔄 Tool Categories',
        'Tool Categories & Relationships',
        '🔄 Tool Categories & Relationships',
      ],
    };

    // For systemInstructions, combine _preamble (role definition) with any matched header content
    if (sectionKey === 'systemInstructions') {
      const parts = [];
      if (sections['_preamble']) {
        parts.push(sections['_preamble']);
      }
      const possibleHeaders = headerMappings[sectionKey] || [];
      for (const header of possibleHeaders) {
        if (sections[header]) {
          parts.push(sections[header]);
        }
      }
      return parts.length > 0 ? parts.join('\n\n') : null;
    }

    const possibleHeaders = headerMappings[sectionKey] || [];

    // For dynamicTools, combine Built-in + Extended tools sections + Plugin tools
    if (sectionKey === 'dynamicTools') {
      const toolParts = [];
      // Collect all built-in tool sections
      for (const header of possibleHeaders) {
        if (sections[header]) {
          toolParts.push(sections[header]);
        }
      }
      // Also collect Extended Tools and Plugin sections
      for (const [header, content] of Object.entries(sections)) {
        if (
          header.includes('Extended Tools') ||
          header.includes('🌐 Extended Tools') ||
          header.includes('MCP Server Tools')
        ) {
          toolParts.push(content);
        }
      }
      if (toolParts.length > 0) {
        return toolParts.join('\n\n');
      }
    }

    for (const header of possibleHeaders) {
      if (sections[header]) {
        return sections[header];
      }
    }

    return null;
  }

  /**
   * Map a header text back to a section key
   * @param {string} header - Header text
   * @returns {string|null} - Section key or null
   */
  mapHeaderToSectionKey(header) {
    const normalizedHeader = header
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();
    if (normalizedHeader.includes('context')) return 'currentContext';
    if (
      normalizedHeader.includes('built-in') ||
      normalizedHeader.includes('directly available') ||
      normalizedHeader.includes('extended tools') ||
      normalizedHeader.includes('mcp server tools')
    ) {
      return 'dynamicTools';
    }
    if (normalizedHeader.includes('example')) return 'toolExamples';
    if (normalizedHeader.includes('guideline') || normalizedHeader.includes('selection')) return 'toolGuidelines';
    if (normalizedHeader.includes('response format')) return 'responseFormat';
    if (normalizedHeader.includes('categor') || normalizedHeader.includes('relationship')) return 'toolCategories';
    if (normalizedHeader.includes('memory')) return 'memoryContext';
    return 'systemInstructions'; // Default to system instructions
  }

  /**
   * Retrieve memory context for the current user query
   * @param {string} userQuery - Current user query for context matching
   * @returns {Promise<string|null>} - Formatted memory context or null if no relevant memories
   */
  async getMemoryContext(userQuery) {
    try {
      // Check if memory system is available and enabled
      if (!this.memorySystem || !this.configManager.get('chatboxSettings.memorySystemEnabled', false)) {
        return null;
      }

      // Check if ChatBox memory system is enabled (separate from Multi-Agent)
      const memorySystemEnabled = this.configManager.get('chatboxSettings.memorySystemEnabled', false);
      if (!memorySystemEnabled) {
        return null;
      }

      console.log('🧠 [getMemoryContext] Retrieving memory context for query:', userQuery);

      // Infer task type and prepare context for memory search
      const taskType = this.inferTaskType(userQuery);
      const context = {
        userQuery: userQuery,
        currentTime: new Date().toISOString(),
        sessionId: this.getSessionId(),
        taskType: taskType,
      };

      // Call memory system to search for relevant context
      // For general chat context, we use "chat_context" as function name
      const memoryContext = await this.memorySystem.retrieveMemoryContext('chat_context', context, context);

      if (!memoryContext || !memoryContext.results || memoryContext.results.length === 0) {
        console.log('🧠 [getMemoryContext] No relevant memories found for query');
        return null;
      }

      // Format memory context for LLM
      const formattedContext = this.formatMemoryContextForLLM(memoryContext);
      console.log('🧠 [getMemoryContext] Retrieved memory context:', formattedContext);

      return formattedContext;
    } catch (error) {
      console.warn('🧠 [getMemoryContext] Failed to retrieve memory context:', error);
      return null; // Don't fail the entire system message building process
    }
  }

  /**
   * Format memory context for LLM consumption
   * @param {object} memoryContext - Raw memory context from MemorySystem
   * @returns {string} - Formatted memory context
   */
  formatMemoryContextForLLM(memoryContext) {
    if (!memoryContext || !memoryContext.results || memoryContext.results.length === 0) {
      return '';
    }

    let formatted = '';
    const results = memoryContext.results.slice(0, 5); // Limit to top 5 most relevant

    for (const result of results) {
      // Format each memory entry
      let memoryText = `• ${result.concept || 'Relevant previous action'}`;

      // Add relevance score if available
      if (result.score !== undefined) {
        memoryText += ` (relevance: ${(result.score * 100).toFixed(1)}%)`;
      }

      // Add properties if available
      if (result.properties) {
        if (result.properties.usage_count) {
          memoryText += ` - used ${result.properties.usage_count} times`;
        }

        if (result.properties.success_rate !== undefined) {
          memoryText += ` (${Math.round(result.properties.success_rate * 100)}% success rate)`;
        }

        if (result.properties.type) {
          memoryText += ` - type: ${result.properties.type}`;
        }

        if (result.properties.category) {
          memoryText += ` - category: ${result.properties.category}`;
        }
      }

      formatted += memoryText + '\n';
    }

    if (formatted) {
      return `Based on previous similar queries, here are relevant patterns:\n${formatted.trim()}`;
    }

    return '';
  }

  /**
   * Infer task type from user query for better memory retrieval
   * @param {string} userQuery - User query to analyze
   * @returns {string} - Inferred task type
   */
  inferTaskType(userQuery) {
    if (!userQuery) return 'general';

    const query = userQuery.toLowerCase();

    // Gene analysis patterns
    if (query.includes('gene') || query.includes('sequence') || query.includes('protein')) {
      return 'gene_analysis';
    }

    // Search patterns
    if (query.includes('search') || query.includes('find') || query.includes('lookup')) {
      return 'search';
    }

    // Analysis patterns
    if (query.includes('analyze') || query.includes('analysis') || query.includes('compare')) {
      return 'analysis';
    }

    // Navigation patterns
    if (query.includes('navigate') || query.includes('zoom') || query.includes('goto')) {
      return 'navigation';
    }

    // Data retrieval patterns
    if (query.includes('download') || query.includes('get') || query.includes('fetch')) {
      return 'data_retrieval';
    }

    return 'general';
  }

  /**
   * Get current session ID for memory correlation
   * @returns {string} - Session identifier
   */
  getSessionId() {
    return this.sessionId || `session_${Date.now()}`;
  }

  /**
   * Process variables in user-defined system prompts
   * Supports variables like {genome_info}, {current_state}, etc.
   */
  processSystemPromptVariables(systemPrompt) {
    const context = this.getCurrentContext();

    // Create detailed current state
    const detailedCurrentState = this.getDetailedCurrentState(context);

    // Create comprehensive tools list
    const allToolsDetailed = this.getAllToolsDetailed(context);

    // Define available variables
    const variables = {
      genome_info: this.getGenomeInfoSummary(),
      current_state: detailedCurrentState,
      loaded_files: this.getLoadedFilesSummary(),
      visible_tracks: this.getVisibleTracksSummary(),
      current_chromosome: context.genomeBrowser.currentState.currentChromosome || 'None',
      current_position: this.getCurrentPositionSummary(context),
      annotations_count: context.genomeBrowser.currentState.annotationsCount || 0,
      sequence_length: context.genomeBrowser.currentState.sequenceLength || 0,
      user_features_count: context.genomeBrowser.currentState.userDefinedFeaturesCount || 0,
      available_tools: context.genomeBrowser.availableTools.join(', '),
      all_tools: allToolsDetailed,
      total_tools: context.genomeBrowser.toolSources.total,
      local_tools: context.genomeBrowser.toolSources.local,
      plugin_tools: context.genomeBrowser.toolSources.plugins,
      mcp_tools: context.genomeBrowser.toolSources.mcp,
      all_available_tools: context.genomeBrowser.availableTools.map(tool => `- ${tool}`).join('\n'),
      mcp_servers: this.getMCPServersSummary(),
      plugin_functions: this.getPluginFunctionsSummary(),
      microbe_functions: this.getMicrobeGenomicsFunctionsDetailed(),
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
    };

    // Replace variables in the format {variable_name}
    let processedPrompt = systemPrompt;
    for (const [varName, varValue] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${varName}\\}`, 'gi');
      processedPrompt = processedPrompt.replace(regex, varValue);
    }

    return processedPrompt;
  }

  /**
   * Check if the LLM response indicates task completion
   * Returns an object with completion status and details
   */
  checkTaskCompletion(response) {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.checkTaskCompletion(response);
  }

  /**
   * Determine if we should terminate early after successful tool execution
   * This helps prevent infinite loops for simple tasks like gene searches
   */
  shouldTerminateAfterToolExecution(toolsToExecute, successfulResults, originalMessage) {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.shouldTerminateAfterToolExecution(toolsToExecute, successfulResults, originalMessage);
  }

  /**
   * Intelligent tool execution policy - determines if a tool should be re-executed
   * This replaces the simple re-executable sets with sophisticated logic
   */
  shouldAllowToolExecution(tool, conversationHistory, currentRound, toolResults = []) {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.shouldAllowToolExecution(tool, conversationHistory, currentRound, toolResults);
  }

  cloneToolParameters(parameters = {}) {
    if (!parameters || typeof parameters !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(parameters));
    } catch (error) {
      console.warn('[ChatManager] Failed to clone tool parameters, using shallow copy:', error);
      return { ...parameters };
    }
  }

  normalizeToolParams(toolName, parameters = {}) {
    const normalized = this.normalizeParams(parameters);

    if (toolName === 'design_primers') {
      const hasResolvedTarget =
        normalized.geneName ||
        (normalized.chromosome && (normalized.start !== undefined || normalized.end !== undefined));
      if (hasResolvedTarget) {
        delete normalized.targetSequence;
        delete normalized.targetMetadata;
      }
    }

    if (toolName === 'find_primer_binding_sites') {
      const hasTemplateContext = normalized.chromosome || normalized.sequence || normalized.primerSequence;
      if (hasTemplateContext) {
        delete normalized.templateSequence;
      }
    }

    return normalized;
  }

  getToolExecutionKey(toolName, parameters = {}) {
    return `${toolName}:${JSON.stringify(this.normalizeToolParams(toolName, parameters))}`;
  }

  getRequestedToolExecutionLimit(originalMessage, tool) {
    if (!tool || !tool.tool_name) return 1;

    let maximumRequestedExecutions = 20;
    if (tool.tool_name === 'open_new_tab') {
      const chatboxSettings = this.configManager?.get('chatboxSettings', {}) || {};
      if (chatboxSettings.enableRepeatedOpenNewTab === false) {
        return 1;
      }
      const configuredLimit = Number(chatboxSettings.maxRepeatedOpenNewTabCalls);
      if (Number.isFinite(configuredLimit)) {
        maximumRequestedExecutions = Math.max(1, Math.min(Math.trunc(configuredLimit), 20));
      }
    }

    const requestPlan = this.getSequentialActionRequirements(originalMessage);
    if (requestPlan.actionableClauseCount > 0) {
      const matchingRequirements = requestPlan.requirements.filter(requirement =>
        requirement.matcher(tool.tool_name, { tool: tool.tool_name, parameters: tool.parameters || {} })
      );
      if (matchingRequirements.length === 0) return 1;
      const requestedCount = matchingRequirements.reduce(
        (total, requirement) => total + Math.max(1, Number(requirement.count) || 1),
        0
      );
      return Math.min(requestedCount, maximumRequestedExecutions);
    }

    const message = String(originalMessage || '').toLowerCase();
    const numberWords = {
      once: 1,
      one: 1,
      twice: 2,
      two: 2,
      thrice: 3,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };

    const numericMatch = message.match(/\b(\d{1,2})\s*(?:x|times?|rounds?|steps?)\b/);
    if (numericMatch) {
      return Math.max(1, Math.min(parseInt(numericMatch[1], 10), maximumRequestedExecutions));
    }

    const repeatNounsByTool = {
      open_new_tab: '(?:(?:new|additional|analysis|browser)\\s+)*(?:tabs?|windows?)',
    };
    const repeatNoun = repeatNounsByTool[tool.tool_name];
    if (repeatNoun) {
      const nounNumericMatch = message.match(new RegExp(`\\b(\\d{1,2})\\s+${repeatNoun}\\b`));
      if (nounNumericMatch) {
        return Math.max(1, Math.min(parseInt(nounNumericMatch[1], 10), maximumRequestedExecutions));
      }
    }

    for (const [word, count] of Object.entries(numberWords)) {
      const pattern =
        word === 'once' || word === 'twice' || word === 'thrice'
          ? new RegExp(`\\b${word}\\b`)
          : new RegExp(`\\b${word}\\s+(?:times?|rounds?|steps?)\\b`);
      if (pattern.test(message)) {
        return Math.min(count, maximumRequestedExecutions);
      }

      if (repeatNoun && new RegExp(`\\b${word}\\s+${repeatNoun}\\b`).test(message)) {
        return Math.min(count, maximumRequestedExecutions);
      }
    }

    return 1;
  }

  isInstructionalRequest(message) {
    const text = String(message || '').trim();
    return (
      /\b(?:how\s+(?:do|can|should|would)\s+(?:i|we)|how\s+to|show\s+me\s+how|explain\s+how|walk\s+me\s+through|tutorial|examples?\s+(?:of|for)|give\s+me\s+\w*\s*examples?|demonstrate|syntax\s+for|what\s+would[\s\S]{0,80}\bcall\s+look\s+like|what\s+does[\s\S]{0,60}\bdo)\b/i.test(
        text
      ) || /(?:如何|怎么|怎样|请解释|教程|示例|演示).{0,40}(使用|调用|操作|工作|实现)?/.test(text)
    );
  }

  analyzeLLMResponse(response, originalMessage = '') {
    const intentService = this.services?.intent;
    if (intentService && typeof intentService.analyzeResponse === 'function') {
      const analyzed =
        intentService.analyzeResponse(response, {
          allowTextToolCalls: !this.isInstructionalRequest(originalMessage),
        }) || {};
      let toolCalls = Array.isArray(analyzed.toolCalls) ? analyzed.toolCalls : [];
      const invalidToolCalls = Array.isArray(analyzed.invalidToolCalls)
        ? analyzed.invalidToolCalls
        : Array.isArray(analyzed.malformedToolCalls)
          ? analyzed.malformedToolCalls
          : [];
      const actionRequested = this.requestRequiresToolExecutionAnywhere(originalMessage, '');
      const suppressedToolCalls = [];
      toolCalls = toolCalls.filter(toolCall => {
        if (actionRequested || this.isReadOnlyToolForInformationalRequest(toolCall.tool_name)) return true;
        suppressedToolCalls.push({
          ...toolCall,
          reason: 'State-changing tool call suppressed for an informational request',
        });
        return false;
      });
      const selectedToolNames = new Set(
        (this.lastSystemPromptMetadata?.selectedTools || []).map(tool => tool.name).filter(Boolean)
      );
      if (selectedToolNames.size > 0) {
        const advertisedCalls = [];
        for (const toolCall of toolCalls) {
          if (selectedToolNames.has(toolCall.tool_name)) {
            advertisedCalls.push(toolCall);
          } else {
            invalidToolCalls.push({
              ...toolCall,
              reason: `${UNADVERTISED_TOOL_REASON}: ${toolCall.tool_name}`,
            });
          }
        }
        toolCalls = advertisedCalls;
      }
      const requestConsistentCalls = [];
      for (const toolCall of toolCalls) {
        const mismatchReason = this.getToolCallRequestMismatchReason(toolCall, originalMessage);
        if (mismatchReason) {
          invalidToolCalls.push({ ...toolCall, reason: mismatchReason });
          continue;
        }
        if (this.dynamicTools && typeof this.dynamicTools.validateToolCall === 'function') {
          const normalizedParameters = this.normalizeToolParams(toolCall.tool_name, toolCall.parameters || {});
          const validation = this.dynamicTools.validateToolCall(toolCall.tool_name, normalizedParameters);
          if (!validation.valid) {
            invalidToolCalls.push({
              ...toolCall,
              reason: `Tool arguments failed schema validation: ${validation.errors.join('; ')}`,
            });
            continue;
          }
          toolCall.parameters = normalizedParameters;
        }
        requestConsistentCalls.push(toolCall);
      }
      toolCalls = requestConsistentCalls;
      const text = String(analyzed.displayText ?? analyzed.text ?? analyzed.content ?? '');
      return {
        ...analyzed,
        text,
        toolCalls,
        suppressedToolCalls,
        invalidToolCalls,
        stopReason: analyzed.stopReason || analyzed.finishReason || null,
        reasoningText: String(analyzed.reasoningText || ''),
        hasToolCallIntent: Boolean(
          analyzed.hasToolCallIntent ||
          analyzed.hasToolLikeContent ||
          invalidToolCalls.length > 0 ||
          suppressedToolCalls.length > 0
        ),
        isEmpty:
          text.trim() === '' &&
          toolCalls.length === 0 &&
          invalidToolCalls.length === 0 &&
          suppressedToolCalls.length === 0,
      };
    }

    const text =
      typeof response === 'string'
        ? response
        : typeof response?.content === 'string'
          ? response.content
          : response === null || response === undefined
            ? ''
            : JSON.stringify(response);
    const toolCalls = this.parseMultipleToolCalls(response);
    return {
      text,
      toolCalls,
      invalidToolCalls: [],
      stopReason:
        response?.stopReason || response?.stop_reason || response?.finishReason || response?.finish_reason || null,
      hasToolCallIntent: false,
      isEmpty: text.trim() === '' && toolCalls.length === 0,
    };
  }

  /**
   * Widen the advertised tool set when the model asked for a real capability
   * the prompt did not offer.
   *
   * Tool selection runs once, before the first round, off keyword matching
   * against the user's opening message. Anything that selection missed stays
   * missing for the rest of the turn: analyzeLLMResponse() rejects the call as
   * unadvertised, and the model spends the repair budget re-issuing a call that
   * can never succeed. A composite request ("find the gene, then BLAST it")
   * fails exactly this way when only the first clause matched.
   *
   * Expansion is on demand rather than every round on purpose: the advertised
   * tool list is part of the request prefix, so growing it invalidates provider
   * prompt caching. Paying that only when a round actually needed a missing
   * tool keeps the common case cheap.
   *
   * @returns {{expanded: boolean, addedTools: string[], unknownTools: string[]}}
   */
  expandAdvertisedToolsForRejectedCalls(responseAnalysis, toolExecutionState = null) {
    const unavailable = { expanded: false, addedTools: [], unknownTools: [] };

    const rejectedNames = [
      ...new Set(
        (responseAnalysis?.invalidToolCalls || [])
          .filter(call => String(call?.reason || '').startsWith(UNADVERTISED_TOOL_REASON))
          .map(call => call?.tool_name)
          .filter(Boolean)
      ),
    ];
    if (rejectedNames.length === 0) return unavailable;

    const state = toolExecutionState || {};
    if ((state.toolExpansionAttempts || 0) >= MAX_TOOL_EXPANSIONS_PER_TURN) {
      console.log('[Tool Expansion] Budget exhausted for this request; leaving the advertised set unchanged.');
      return unavailable;
    }

    const advertised = this.lastSystemPromptMetadata?.selectedTools;
    if (!this.dynamicTools || !Array.isArray(advertised)) return unavailable;

    const advertisedNames = new Set(advertised.map(tool => tool.name).filter(Boolean));
    const addedTools = [];
    const unknownTools = [];
    const addedSelections = [];
    const addedNativeTools = [];

    for (const name of rejectedNames) {
      if (advertisedNames.has(name)) continue;
      const tool = this.dynamicTools.toolsByName?.get?.(name);
      if (!tool) {
        // Genuinely not a capability this build has; the existing
        // unavailable-tool handling gives the model a better answer than
        // advertising something that does not exist.
        unknownTools.push(name);
        continue;
      }
      const nativeTool = this.dynamicTools.toNativeFunctionTool?.(tool);
      if (!nativeTool) {
        unknownTools.push(name);
        continue;
      }
      addedNativeTools.push(nativeTool);
      addedSelections.push({
        name: tool.name,
        category: tool.category || 'uncategorized',
        executionType: tool.execution_type || tool.executionType || tool.type || 'unknown',
        source: tool.source || null,
      });
      advertisedNames.add(name);
      addedTools.push(name);
    }

    if (addedTools.length === 0) return { ...unavailable, unknownTools };

    // Append rather than rebuild: the existing entries keep their order so only
    // the tail of the request prefix changes.
    this.currentNativeTools = [...(this.currentNativeTools || []), ...addedNativeTools];
    this.lastSystemPromptMetadata.selectedTools = [...advertised, ...addedSelections];
    if (Number.isFinite(this.lastSystemPromptMetadata.selectedToolCount)) {
      this.lastSystemPromptMetadata.selectedToolCount += addedTools.length;
    }
    state.toolExpansionAttempts = (state.toolExpansionAttempts || 0) + 1;

    console.log(
      `[Tool Expansion] Advertised ${addedTools.length} additional tool(s) mid-request: ${addedTools.join(', ')} ` +
        `(attempt ${state.toolExpansionAttempts}/${MAX_TOOL_EXPANSIONS_PER_TURN})`
    );
    return { expanded: true, addedTools, unknownTools };
  }

  /** Protocol message telling the model that a previously missing tool is now callable. */
  buildToolAvailabilityMessage(addedTools) {
    return (
      `[Tool Availability]\n` +
      `${addedTools.join(', ')} ${addedTools.length === 1 ? 'is' : 'are'} now available for this request. ` +
      `The previous call was rejected only because the tool had not been offered yet, not because it is wrong. ` +
      `Issue the call again.`
    );
  }

  shouldRecoverBeforeToolExecution(responseAnalysis) {
    const stopReason = String(responseAnalysis?.stopReason || '').toLowerCase();
    const refusal =
      responseAnalysis?.refusal ||
      responseAnalysis?.isRefusal ||
      /refusal|safety|content_filter|blocked|prohibited|recitation|blocklist|spii/.test(stopReason);
    const incomplete = /length|max_tokens|max_output_tokens|model_context_window_exceeded|incomplete/.test(stopReason);
    const toolProtocolError = /malformed_function_call|unexpected_tool_call|tool_(?:use_)?error/.test(stopReason);
    return Boolean(
      refusal ||
      incomplete ||
      toolProtocolError ||
      stopReason === 'pause_turn' ||
      (responseAnalysis?.invalidToolCalls || []).length > 0
    );
  }

  isReadOnlyToolForInformationalRequest(toolName) {
    const readOnlyPolicyNames = new Set(['search', 'analysis', 'state', 'external_api']);
    const readOnlyTools = new Set([
      'find_gene_by_name',
      'search_features',
      'search_annotations',
      'get_current_state',
      'get_genome_info',
      'get_file_info',
      'get_sequence',
      'get_coding_sequence',
      'design_primers',
      'calculate_primer_properties',
      'find_primer_binding_sites',
      'list_primers',
    ]);
    if (readOnlyTools.has(toolName)) return true;
    if (this.isRetrievalOnlyToolName(toolName)) return true;
    const policyName = this.services?.context
      ?.getToolExecutionPolicy?.()
      ?.capabilityPolicy?.getPolicyForTool?.(toolName)?.name;
    return readOnlyPolicyNames.has(policyName);
  }

  // Retrieval-only tools cannot mutate application state, so answering an
  // informational request with one is always safe. Naming is the reliable
  // signal: the capability policy groups tools by feature area rather than by
  // effect, so get_clipboard_content sits under sequence_editing_actions and
  // get_chromosome_list is absent from the table entirely.
  isRetrievalOnlyToolName(toolName) {
    const name = String(toolName || '');
    const retrievalVerb = /^(?:get|list|search|find|calc|calculate|compute|count|describe|inspect|read|detect)$/;
    const segments = name.split('_');
    // Bare retrieval tools (get_genome_info) and namespaced ones where the
    // provider prefixes the verb (blast_get_installation_status,
    // uniprot_get_protein, blast_list_databases).
    if (retrievalVerb.test(segments[0])) return true;
    if (segments.length > 2 && retrievalVerb.test(segments[1])) return true;
    return /_(?:analysis|status)$/.test(name);
  }

  getToolCallRequestMismatchReason(toolCall, originalMessage) {
    if (toolCall?.tool_name !== 'select_gene') return null;
    const requestedSelection = this.getRequestedGeneSelection(originalMessage);
    if (!requestedSelection) {
      return 'select_gene does not match the selection target in the current request';
    }
    if (!requestedSelection.geneName) return null;

    const parameters = toolCall.parameters || {};
    const selectedGene = parameters.geneName || parameters.gene_name || parameters.name;
    if (typeof selectedGene !== 'string' || selectedGene.toLowerCase() !== requestedSelection.geneName.toLowerCase()) {
      return `select_gene target does not match the requested gene ${requestedSelection.geneName}`;
    }
    return null;
  }

  isInterimActionResponse(responseText) {
    if (!responseText || typeof responseText !== 'string') return false;
    const text = responseText.toLowerCase();
    const planningLanguage =
      /\b(i(?:'|’)ll|i\s+will|let\s+me|i(?:'|’)m\s+going\s+to|i\s+need\s+to|i\s+can\s+start\s+by|first,?\s+i)\b/.test(
        text
      );
    const actionLanguage =
      /\b(?:us(?:e|ing)|call(?:ing)?|search(?:ing)?|find(?:ing)?|locat(?:e|ing)|select(?:ing)?|navigat(?:e|ing)|open(?:ing)?|load(?:ing)?|fetch(?:ing)?|run(?:ning)?|calculat(?:e|ing)|analy[sz](?:e|ing)|check(?:ing)?|retriev(?:e|ing)|execut(?:e|ing))\b/.test(
        text
      );
    const chinesePlanning =
      /(我会|我将|让我|接下来|首先).{0,24}(使用|调用|搜索|查找|定位|选择|导航|打开|加载|运行|计算|分析|执行)/.test(
        responseText
      );
    return (planningLanguage && actionLanguage) || chinesePlanning;
  }

  // The verbs the app's own tools are named after. A gap here is not cosmetic:
  // requestRequiresToolExecution anchors on the leading verb, so a request whose
  // first word is missing from this list is read as informational and every
  // state-changing call the model makes for it is suppressed unexecuted.
  getActionVerbPattern() {
    return '(?:select|highlight|choose|pick|activate|set|open|close|switch|navigate|jump|zoom|pan|scroll|search|find|locate|detect|identify|load|import|export|download|save|archive|delete|create|add|remove|clear|cut|edit|update|modify|rename|replace|apply|configure|calculate|compute|analy[sz]e|assess|predict|translate|align|run|execute|start|stop|pause|resume|show|hide|toggle|expand|collapse|view|check|change|fetch|get|list|retrieve|filter|sort|extract|annotate|compare|convert|summari[sz]e|generate|perform|design|simulate|copy|paste|insert|bookmark|restore|reset|capture|install|uninstall|enable|disable|validate|merge|rollback|reject|cancel|resolve|assign|decompose|balance|optimize|retry)';
  }

  requestRequiresToolExecution(originalMessage, responseText = '') {
    if (this.isInstructionalRequest(originalMessage)) return false;
    const message = String(originalMessage || '')
      .trim()
      .toLowerCase();
    const actionVerb = this.getActionVerbPattern();
    const actionRequest =
      new RegExp(`^(?:please\\s+|kindly\\s+)?${actionVerb}\\b`).test(message) ||
      new RegExp(`\\b(?:can|could|would)\\s+you\\s+(?:please\\s+)?${actionVerb}\\b`).test(message) ||
      new RegExp(`\\b(?:i\\s+(?:want|need)\\s+you\\s+to|help\\s+me(?:\\s+to)?|kindly)\\s+${actionVerb}\\b`).test(
        message
      ) ||
      new RegExp(
        `\\bi\\s+(?:want|need)\\s+to\\s+${actionVerb}\\b|\\bi\\s+would\\s+like\\s+(?:you\\s+)?to\\s+${actionVerb}\\b|\\bi(?:'|’)d\\s+like\\s+(?:you\\s+)?to\\s+${actionVerb}\\b`
      ).test(message) ||
      /\b(?:i\s+(?:want|need)|please\s+have)\s+.+?\b(?:selected|highlighted|activated)\b/.test(message) ||
      /\bmake\s+.+?\b(?:the\s+)?(?:active\s+gene|active\s+selection|selected|highlighted)\b/.test(message) ||
      /^(?:(?:请|帮我|麻烦|能否|可以)\s*)?(?:选择|选中|高亮|打开|关闭|切换|导航|跳转|缩放|搜索|查找|定位|加载|导入|导出|保存|删除|创建|添加|移除|编辑|更新|计算|分析|翻译|运行|显示|隐藏|获取|设计|模拟|复制|粘贴|插入)/.test(
        String(originalMessage || '').trim()
      );
    const knowledgeAction = /\b(?:calculate|compute|analy[sz]e|show)\b/.test(message);
    const contextRequiredAction =
      /\b(?:calculate|compute|analy[sz]e|assess|predict|show|find|search|locate|open|fetch|retrieve)\b/.test(message);
    const genomicsOrAppContext =
      /\b(?:genomes?|genes?|dna|rna|sequences?|annotations?|features?|chromosomes?|tracks?|tabs?|windows?|files?|images?|primers?|proteins?|blast|codons?|gc|domains?|motifs?|regions?|positions?|views?|browsers?|states?|tasks?|actions?|bookmarks?|settings?|themes?|styles?|modes?|models?|providers?|options?|sidebars?|panels?|banners?|modals?|plugins?|workflows?|benchmarks?|databases?|uniprot|interpro|reports?|screenshots?|director(?:y|ies)|folders?|reads?|variants?|wig|operons?|fasta|genbank|bed|gff|vcf|molecular|translations?)\b/.test(
        message
      ) ||
      /(?:基因组|基因|序列|注释|染色体|轨道|标签页|文件|引物|蛋白|区域|位置|视图|状态|任务|设置|数据库|截图|目录|变异|操纵子)/.test(
        String(originalMessage || '')
      );
    const conceptualKnowledgeRequest =
      /\b(?:why|explain|role|essential|function|importance|meaning|how[\s\S]{0,40}\bworks?)\b/.test(message) &&
      !/\b(?:current|loaded|this\s+(?:genome|sequence|gene)|gc|codon|molecular\s+weight|domains?|motifs?|primers?|length|coordinates?|frequency|entropy|restriction|blast)\b/.test(
        message
      );
    const clarification =
      /\b(?:which|what|where|when|how many|do you mean|should i|would you like|can you provide)[^?]*\?\s*$/i.test(
        responseText.trim()
      ) ||
      /\b(?:please|could you)\s+(?:specify|provide|choose|clarify)\b/i.test(responseText) ||
      /(?:哪一个|哪个|什么|哪里|是否|请提供|请指定|请选择|需要您|需要你).*[？?]\s*$/.test(responseText);
    return (
      actionRequest &&
      (!contextRequiredAction || genomicsOrAppContext) &&
      (!knowledgeAction || (genomicsOrAppContext && !conceptualKnowledgeRequest)) &&
      !clarification
    );
  }

  /**
   * True when the request as a whole, or any step within it, asks for an action.
   *
   * requestRequiresToolExecution anchors on the first verb of the text it is
   * given, which is right for a single-step request but wrong for a workflow:
   * "Detect the type of X, run a search, then export the results" hinged
   * entirely on whether "detect" happened to be in the verb list, and when it
   * was not, every state-changing step after it was suppressed as if the user
   * had only asked a question. Checking the clauses too means one unfamiliar
   * leading verb can no longer disarm the rest of the workflow.
   */
  requestRequiresToolExecutionAnywhere(originalMessage, responseText = '') {
    if (this.requestRequiresToolExecution(originalMessage, responseText)) return true;
    if (this.isInstructionalRequest(originalMessage)) return false;
    return this.getSequentialActionRequirements(originalMessage).actionableClauseCount > 0;
  }

  getRequestedGeneSelection(originalMessage) {
    const message = String(originalMessage || '');
    const token = '([A-Za-z][A-Za-z0-9_.-]*)';
    const explicitPatterns = [
      new RegExp(
        `\\b(?:select|highlight|choose|pick|activate)\\s+(?:the\\s+)?gene\\s+(?:(?:named|called)\\s+)?${token}\\b`,
        'i'
      ),
      new RegExp(`\\b(?:select|highlight|choose|pick|activate)\\s+(?:the\\s+)?${token}\\s+gene\\b`, 'i'),
      new RegExp(`\\bset\\s+(?:the\\s+)?(?:active|current|selected)\\s+gene\\s+(?:to|as)\\s+${token}\\b`, 'i'),
      new RegExp(`\\bmake\\s+${token}\\s+(?:the\\s+)?(?:active|current|selected)\\s+gene\\b`, 'i'),
    ];
    for (const pattern of explicitPatterns) {
      const match = message.match(pattern);
      if (match && !/^(?:all|every|multiple|current|active|selected|gene)$/i.test(match[1])) {
        return { geneName: match[1] };
      }
    }

    if (
      /\b(?:select|highlight|choose|pick|activate)\s+(?:the\s+)?(?:(?:active|current|selected)\s+)?gene\b/i.test(
        message
      ) ||
      /(?:选择|选中|高亮)(?:当前|活跃|选定)?基因(?:\s*[:：]?\s*([A-Za-z][A-Za-z0-9_.-]*))?/.test(message)
    ) {
      const chineseTarget = message.match(
        /(?:选择|选中|高亮)(?:当前|活跃|选定)?基因(?:\s*[:：]?\s*([A-Za-z][A-Za-z0-9_.-]*))?/
      )?.[1];
      return { geneName: chineseTarget || null };
    }

    const chineseSuffixTarget = message.match(/(?:选择|选中|高亮)\s*([A-Za-z][A-Za-z0-9_.-]*)\s*基因/)?.[1];
    if (chineseSuffixTarget) return { geneName: chineseSuffixTarget };

    const shorthandMatch = message.match(
      /\b(?:select|highlight|choose|pick|activate)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9_.-]*)\b/i
    );
    if (!shorthandMatch) return null;

    const nonGeneSelectionTarget =
      /\b(?:all|every|multiple|primers?|themes?|styles?|modes?|models?|providers?|options?|items?|tabs?|tracks?|files?|regions?|sequences?|annotations?|features?|chromosomes?|positions?|colou?rs?|accents?|presets?|dna|rna|proteins?)\b/i.test(
        message
      );
    if (nonGeneSelectionTarget) return null;

    const shorthandToken = shorthandMatch[1];
    const looksLikeGeneSymbol = /[A-Z0-9]/.test(shorthandToken.substring(1));
    const looksLikeProviderName = /^(?:gpt|claude|gemini|llama|qwen|deepseek|openai|anthropic)/i.test(shorthandToken);

    return !looksLikeProviderName && looksLikeGeneSymbol ? { geneName: shorthandToken } : null;
  }

  isGeneSelectionRequest(originalMessage) {
    return Boolean(this.getRequestedGeneSelection(originalMessage));
  }

  getSequentialRequestClauses(originalMessage) {
    const actionVerb = this.getActionVerbPattern();
    return String(originalMessage || '')
      .split(
        new RegExp(
          `\\s*(?:[,;，；]\\s*(?:(?:and\\s+)?then\\s+)?|\\b(?:and\\s+then|then|after\\s+that|followed\\s+by|next|finally)\\b|\\band(?=\\s+(?:please\\s+)?${actionVerb}\\b)|(?:然后|接着|之后|下一步|最后))\\s*`,
          'i'
        )
      )
      .map(clause => clause.trim())
      .filter(Boolean);
  }

  /**
   * Match a tool by the verb that says what it does, wherever that verb sits.
   *
   * Tool names in this app are namespaced by provider - blast_create_database,
   * blast_search_local, uniprot_get_annotation - so the acting verb is often not
   * the first segment. Anchoring on the first segment made the effect table blind
   * to every namespaced tool, which read as "the model never did what was asked"
   * for whole BLAST workflows that had in fact run start to finish.
   */
  verbToolMatcher(...verbs) {
    const pattern = new RegExp(`(?:^|_)(?:${verbs.join('|')})_`);
    return toolName => pattern.test(String(toolName || ''));
  }

  /**
   * The part of a clause that says what to do, without the trailing phrase that
   * says why.
   *
   * "perform an InterPro domain analysis to identify key domains" asks for one
   * effect, the analysis. Reading the goal phrase as the effect demands a tool
   * matching "identify", which no analysis tool is named for, so the request can
   * never be satisfied: every finished answer is bounced back for repair, the
   * model re-runs the analysis it already ran, and the turn burns its whole
   * budget. Only unambiguous goal wording is stripped, so "jump to gene lacZ"
   * and "switch to tab 2" keep naming their own action.
   */
  stripClausePurposePhrase(clause) {
    const text = String(clause || '').trim();
    const goalVerb =
      'identify|detect|determine|find|locate|check|verify|confirm|see|understand|' +
      'characteri[sz]e|reveal|assess|evaluate|obtain|discover|explore|examine|study|compare|validate';
    const purposeMarker = new RegExp(`\\s+(?:in order to|so as to|so that|to\\s+(?:${goalVerb})\\b)`, 'i');

    const match = text.match(purposeMarker);
    if (!match || match.index === undefined || match.index === 0) return text;
    return text.slice(0, match.index).trim();
  }

  getRequestClauseEffectRequirement(clause, inheritedDomain = '') {
    const fullClause = String(clause || '').trim();
    const mainAction = this.stripClausePurposePhrase(fullClause);

    if (mainAction && mainAction !== fullClause) {
      const mainRequirement = this.deriveClauseEffectRequirement(mainAction, fullClause, inheritedDomain);
      if (mainRequirement) return mainRequirement;
    }

    return this.deriveClauseEffectRequirement(fullClause, fullClause, inheritedDomain);
  }

  deriveClauseEffectRequirement(actionText, fullClause, inheritedDomain = '') {
    const text = String(fullClause || '').trim();
    const message = String(actionText || '')
      .trim()
      .toLowerCase();
    const contextMessage = `${message} ${inheritedDomain}`.trim();
    const verbTool = (...verbs) => this.verbToolMatcher(...verbs);
    const requirement = (capability, matcher, repeatToolName = capability) => ({
      capability,
      matcher,
      // Kept so a repair prompt can quote the step the user actually asked for.
      // Several capabilities map to more than one tool (update_annotation and
      // edit_annotation both satisfy edit_annotation), so naming one of them
      // would steer the model toward an arbitrary choice; its own wording will not.
      clause: text,
      count: this.getRequestedExecutionCountFallback(text, repeatToolName),
    });

    const requestedGeneSelection = this.getRequestedGeneSelection(text);
    if (requestedGeneSelection) {
      return requirement(
        'gene_selection',
        (toolName, record) => {
          if (toolName !== 'select_gene') return false;
          if (!requestedGeneSelection.geneName) return true;
          const parameters = record?.normalizedParameters || record?.parameters || {};
          const selectedGene = parameters.geneName || parameters.gene_name || parameters.name;
          return (
            typeof selectedGene === 'string' &&
            selectedGene.toLowerCase() === requestedGeneSelection.geneName.toLowerCase()
          );
        },
        'select_gene'
      );
    }
    if (/\b(?:select|highlight|choose|pick|activate)\b|(?:选择|选中|高亮)/.test(message)) {
      return requirement('selection', verbTool('select', 'highlight', 'switch', 'set'), 'select_sequence_region');
    }
    if (
      /\b(?:create|add|open)\b|(?:创建|添加|打开)/.test(message) &&
      /\b(?:tabs?|windows?)\b|标签页|窗口/.test(contextMessage)
    ) {
      return requirement('open_tab', toolName => toolName === 'open_new_tab', 'open_new_tab');
    }
    if (/\b(?:create|add)\b|(?:创建|添加)/.test(message) && /\bannotations?\b|注释/.test(contextMessage)) {
      return requirement(
        'create_annotation',
        toolName => /^(?:create_annotation|batch_create_annotations)$/.test(toolName),
        'create_annotation'
      );
    }
    if (
      /\b(?:edit|update|modify|rename|apply)\b|(?:编辑|更新|修改|重命名|应用)/.test(message) &&
      /\bannotations?\b|注释/.test(contextMessage)
    ) {
      return requirement(
        'edit_annotation',
        toolName =>
          /^(?:edit_annotation|update_annotation|bulk_update_annotations|apply_annotation_changeset)$/.test(toolName),
        'edit_annotation'
      );
    }
    if (/\b(?:delete|remove)\b|(?:删除|移除)/.test(message) && /\bannotations?\b|注释/.test(contextMessage)) {
      return requirement(
        'delete_annotation',
        toolName => /^(?:delete_annotation|apply_annotation_changeset)$/.test(toolName),
        'delete_annotation'
      );
    }
    if (
      /\b(?:insert|replace|cut|paste|delete)\b|(?:插入|替换|剪切|粘贴|删除)/.test(message) &&
      /\bsequences?\b|序列/.test(contextMessage)
    ) {
      return requirement(
        'edit_sequence',
        toolName =>
          /^(?:insert_sequence|replace_sequence|cut_sequence|paste_sequence|delete_sequence|execute_actions)$/.test(
            toolName
          ),
        'execute_actions'
      );
    }
    if (/\b(?:create|add|insert)\b|(?:创建|添加|插入)/.test(message)) {
      return requirement('create', verbTool('create', 'add', 'insert'), 'create_annotation');
    }
    if (
      /\b(?:edit|update|modify|rename|replace|apply|set|configure)\b|(?:编辑|更新|修改|重命名|替换|应用|设置|配置)/.test(
        message
      )
    ) {
      return requirement('edit', verbTool('edit', 'update', 'replace', 'apply', 'set', 'configure'), 'edit_annotation');
    }
    if (/\bsave\b|保存/.test(message) && /\bprimers?\b|引物/.test(contextMessage)) {
      return requirement('save_primer', toolName => toolName === 'save_primer', 'save_primer');
    }
    if (/\bsave\b|保存/.test(message) && /\bviews?\b|视图/.test(contextMessage)) {
      return requirement('save_view', toolName => toolName === 'save_view_state', 'save_view_state');
    }
    if (/\b(?:save|archive)\b|(?:保存|归档)/.test(message)) {
      return requirement('save', verbTool('save', 'archive'), 'save_view_state');
    }
    if (/\b(?:delete|remove|clear|uninstall)\b|(?:删除|移除|清除|卸载)/.test(message)) {
      return requirement(
        'delete',
        toolName =>
          verbTool('delete', 'remove', 'clear', 'uninstall')(toolName) || toolName === 'apply_annotation_changeset',
        'delete_sequence'
      );
    }
    if (/\b(?:export|download)\b|(?:导出|下载)/.test(message)) {
      // Provider-namespaced tools put the verb in the middle of the name, so an
      // anchored prefix silently fails to recognize blast_export_results as the
      // export the user asked for.
      //
      // "download" is the user's word for it; the tools that do it are named
      // fetch_/download_/save_. Matching only export_ left "download its
      // AlphaFold 3D structure" unsatisfiable even though
      // fetch_alphafold_structure had already downloaded it.
      return requirement(
        'export',
        toolName => toolName === 'export_data' || verbTool('export', 'download', 'save', 'fetch')(toolName),
        'export_data'
      );
    }
    if (/\b(?:load|import)\b|(?:加载|导入)/.test(message)) {
      return requirement('load', verbTool('load', 'import'), 'load_genome_file');
    }
    if (/\bopen\b|打开/.test(message)) {
      const isTabRequest = /\b(?:tabs?|windows?)\b|标签页|窗口/.test(message);
      return requirement(
        isTabRequest ? 'open_tab' : 'open',
        toolName => (isTabRequest ? toolName === 'open_new_tab' : verbTool('open', 'view')(toolName)),
        isTabRequest ? 'open_new_tab' : 'open_image_file'
      );
    }
    if (/\bclose\b|关闭/.test(message)) {
      const isTabRequest = /\b(?:tabs?|windows?)\b|标签页|窗口/.test(message);
      return requirement(
        isTabRequest ? 'close_tab' : 'close',
        toolName => (isTabRequest ? toolName === 'close_tab' : verbTool('close', 'hide')(toolName)),
        isTabRequest ? 'close_tab' : 'close'
      );
    }
    if (/\bswitch\b|切换/.test(message)) {
      const isTabRequest = /\b(?:tabs?|windows?)\b|标签页|窗口/.test(message);
      return requirement(
        isTabRequest ? 'switch_tab' : 'switch',
        toolName => (isTabRequest ? toolName === 'switch_to_tab' : verbTool('switch', 'set')(toolName)),
        isTabRequest ? 'switch_to_tab' : 'switch'
      );
    }
    if (/\bzoom\b|缩放/.test(message)) {
      const direction = /\b(?:out|away)\b|缩小/.test(message) ? 'out' : /\bin\b|放大/.test(message) ? 'in' : null;
      return requirement(
        direction ? `zoom_${direction}` : 'zoom',
        toolName => (direction ? toolName === `zoom_${direction}` : verbTool('zoom')(toolName)),
        direction ? `zoom_${direction}` : 'zoom_in'
      );
    }
    if (/\b(?:navigate|jump|pan|scroll)\b|(?:导航|跳转|平移|滚动)/.test(message)) {
      const directionalTool = [
        ['pan_right', /\bpan\s+right\b|向右平移/],
        ['pan_left', /\bpan\s+left\b|向左平移/],
        ['scroll_right', /\bscroll\s+right\b|向右滚动/],
        ['scroll_left', /\bscroll\s+left\b|向左滚动/],
      ].find(([, pattern]) => pattern.test(message))?.[0];
      return requirement(
        directionalTool || 'navigation',
        toolName =>
          directionalTool ? toolName === directionalTool : verbTool('navigate', 'jump', 'pan', 'scroll')(toolName),
        directionalTool || 'navigate_to_position'
      );
    }
    if (/\b(?:search|find|locate)\b|(?:搜索|查找|定位)/.test(message)) {
      return requirement('search', verbTool('search', 'find', 'locate', 'get'), 'search_features');
    }
    if (/\b(?:detect|identify)\b|(?:检测|识别|鉴定)/.test(message)) {
      return requirement('detect', verbTool('detect', 'identify'), 'blast_detect_sequence_type');
    }
    if (/\b(?:filter|sort)\b|(?:筛选|过滤|排序)/.test(message)) {
      return requirement('filter', verbTool('filter', 'sort'), 'blast_filter_results');
    }
    if (/\btranslate\b|翻译/.test(message)) {
      return requirement('translate', verbTool('translate'), 'translate_sequence');
    }
    // "run blast_search against nt" names a search, but \bsearch\b does not match
    // inside blast_search, so the clause used to fall through to the generic
    // execute rule and demand a run_-prefixed tool that does not exist.
    if (/\bblast/.test(message)) {
      return requirement('blast', toolName => /^blast_/.test(toolName), 'blast_search');
    }
    if (/\balign\b|比对/.test(message)) {
      return requirement('align', verbTool('align', 'blast'), 'align');
    }
    if (/\b(?:calculate|compute)\b|计算/.test(message)) {
      return requirement(
        'calculate',
        toolName => verbTool('calculate', 'compute', 'calc')(toolName) || /_analysis$/.test(toolName),
        'calculate_molecular_weight'
      );
    }
    // The noun forms matter as much as the verb: requests phrase this step as
    // "perform a domain analysis" at least as often as "analyze the domains",
    // and only the verb was recognized, so the noun form fell through to a rule
    // that no analysis tool can satisfy.
    if (/\b(?:analy[sz]e|analys[ei]s|assess(?:ment)?|predict(?:ion)?)\b|(?:分析|评估|预测)/.test(message)) {
      return requirement(
        'analysis',
        toolName => verbTool('analy[sz]e', 'assess', 'predict')(toolName) || /_analysis$/.test(toolName),
        'analyze'
      );
    }
    if (/\bdesign\b|设计/.test(message)) {
      return requirement('design', verbTool('design', 'create'), 'design_primers');
    }
    if (
      /\b(?:run|execute|start|stop|pause|resume|simulate|retry)\b|(?:运行|执行|启动|停止|暂停|恢复|模拟|重试)/.test(
        message
      )
    ) {
      return requirement(
        'execute',
        verbTool('run', 'execute', 'start', 'stop', 'pause', 'resume', 'simulate', 'virtual', 'retry'),
        'execute_actions'
      );
    }
    if (/\bcopy\b|复制/.test(message)) {
      return requirement('copy', verbTool('copy'), 'copy_sequence');
    }
    if (/\bpaste\b|粘贴/.test(message)) {
      return requirement('paste', verbTool('paste', 'insert'), 'paste_sequence');
    }
    if (/\b(?:show|hide|toggle)\b|(?:显示|隐藏)/.test(message)) {
      return requirement('display', verbTool('show', 'hide', 'toggle', 'view', 'list', 'get'), 'show');
    }
    // "list the annotations", "get its history" and "review the results" are
    // ordinary closing steps of a workflow. Leaving them unmapped used to make
    // the whole request permanently unsatisfiable, so the model was asked to
    // repair a request it had already carried out and then hard-failed.
    if (/\b(?:fetch|retrieve|list|get|view|inspect|review)\b|(?:获取|列出|查看)/.test(message)) {
      return requirement(
        'retrieve',
        verbTool('fetch', 'retrieve', 'get', 'list', 'search', 'describe', 'read'),
        'list_annotations'
      );
    }

    const directPrefixAction = message.match(
      /\b(bookmark|restore|reset|capture|install|uninstall|enable|disable|validate|merge|rollback|reject|cancel|resolve|assign|decompose|balance|optimize)\b/
    )?.[1];
    if (directPrefixAction) {
      return requirement(
        directPrefixAction,
        toolName => toolName === directPrefixAction || verbTool(directPrefixAction)(toolName),
        directPrefixAction
      );
    }

    return null;
  }

  getRequestObjectDomain(clause) {
    const message = String(clause || '').toLowerCase();
    if (/\bannotations?\b|注释/.test(message)) return 'annotation';
    if (/\bsequences?\b|序列/.test(message)) return 'sequence';
    if (/\bprimers?\b|引物/.test(message)) return 'primer';
    if (/\bviews?\b|视图/.test(message)) return 'view';
    if (/\b(?:tabs?|windows?)\b|标签页|窗口/.test(message)) return 'tab';
    if (/\btracks?\b|轨道/.test(message)) return 'track';
    if (/\bgenes?\b|基因/.test(message)) return 'gene';
    return '';
  }

  getSequentialActionRequirements(originalMessage) {
    const clauses = this.getSequentialRequestClauses(originalMessage);
    const actionableClauses = [];
    const requirementsByCapability = new Map();
    let inheritedDomain = '';

    for (const clause of clauses) {
      inheritedDomain = this.getRequestObjectDomain(clause) || inheritedDomain;
      const clauseWithDomain = inheritedDomain ? `${clause} ${inheritedDomain}` : clause;
      if (!this.requestRequiresToolExecution(clauseWithDomain)) continue;
      actionableClauses.push(clause);
      const requirement = this.getRequestClauseEffectRequirement(clause, inheritedDomain);
      if (!requirement) continue;
      // How many times a capability is required is decided by explicit
      // repetition in the wording ("three times", "2x"), never by how many
      // clauses the splitter produced. Splitting "run the filter and export
      // steps" yields a second export fragment, and counting it demanded two
      // exports of a request that has exactly one export step to perform.
      const existing = requirementsByCapability.get(requirement.capability);
      if (!existing) {
        requirementsByCapability.set(requirement.capability, requirement);
      } else if (Number(requirement.count) > Number(existing.count)) {
        existing.count = requirement.count;
      }
    }

    return {
      actionableClauseCount: actionableClauses.length,
      requirements: [...requirementsByCapability.values()].filter(requirement =>
        this.isRequirementSatisfiableByAnyTool(requirement)
      ),
    };
  }

  /**
   * Tool names this session can execute, or null when the registry is not loaded.
   */
  getRegisteredToolNames() {
    const registry = this.builtInToolsMap;
    if (!registry || typeof registry.keys !== 'function') return null;
    const names = [...registry.keys()].filter(name => typeof name === 'string' && name);
    return names.length > 0 ? names : null;
  }

  /**
   * Whether any registered tool could satisfy a requirement at all.
   *
   * A capability comes from the user's wording while tools are named for the
   * effect, and the two pick different verbs for the same thing: "download its
   * AlphaFold structure" is carried out by fetch_alphafold_structure, "identify
   * key domains" by analyze_interpro_domains. When a requirement matches no
   * registered tool, no response can satisfy it, so holding it against the model
   * sends a finished turn into repair it can never pass. That is missing
   * knowledge on our side, the same reason an unrecognized clause is not held
   * against the model.
   *
   * Only tool-name matchers are probed. A matcher that also inspects the
   * execution record (arity > 1) constrains parameters, not availability, and
   * would always fail against a bare name.
   */
  isRequirementSatisfiableByAnyTool(requirement) {
    if (typeof requirement?.matcher !== 'function' || requirement.matcher.length > 1) return true;

    const toolNames = this.getRegisteredToolNames();
    // Registry unknown: keep the requirement rather than silently dropping every check.
    if (!toolNames) return true;

    return toolNames.some(name => {
      try {
        return requirement.matcher(name, { tool: name, parameters: {}, normalizedParameters: {} });
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * Assign each required occurrence a distinct successful execution, and report
   * how many of each requirement went unassigned.
   *
   * Claiming the first match and moving on makes the verdict depend on the order
   * the model happened to run its tools: "retrieve the entry, download the
   * structure" is satisfied by get_uniprot_entry + fetch_alphafold_structure, but
   * a greedy "retrieve" takes whichever of the two it sees first, and if that is
   * the fetch then "download" is left with nothing and a finished request looks
   * unfinished. Re-assigning through an augmenting path finds an assignment
   * whenever one exists, so the outcome no longer depends on execution order.
   */
  assignRecordsToRequirements(successfulRecords, requirements) {
    const records = successfulRecords.slice();
    const slots = [];
    requirements.forEach((requirement, requirementIndex) => {
      const requiredCount = Math.max(1, Number(requirement.count) || 1);
      for (let occurrence = 0; occurrence < requiredCount; occurrence++) {
        slots.push({ requirement, requirementIndex });
      }
    });

    const recordAssignedTo = new Array(records.length).fill(-1);

    const assign = (slotIndex, visited) => {
      const { requirement } = slots[slotIndex];
      for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
        if (visited.has(recordIndex)) continue;
        const record = records[recordIndex];
        let matches = false;
        try {
          matches = requirement.matcher(record.tool, record);
        } catch (e) {
          matches = false;
        }
        if (!matches) continue;

        visited.add(recordIndex);
        const heldBy = recordAssignedTo[recordIndex];
        if (heldBy === -1 || assign(heldBy, visited)) {
          recordAssignedTo[recordIndex] = slotIndex;
          return true;
        }
      }
      return false;
    };

    const unassignedByRequirement = new Map();
    slots.forEach((slot, slotIndex) => {
      if (assign(slotIndex, new Set())) return;
      unassignedByRequirement.set(slot.requirementIndex, (unassignedByRequirement.get(slot.requirementIndex) || 0) + 1);
    });

    return unassignedByRequirement;
  }

  doSuccessfulRecordsSatisfyRequirements(successfulRecords, requirements) {
    return this.assignRecordsToRequirements(successfulRecords, requirements).size === 0;
  }

  hasSuccessfulExecutionForRequest(toolExecutionState) {
    const successfulRecords = (toolExecutionState?.records || []).filter(record => record.status === 'success');
    if (successfulRecords.length === 0) return false;

    const originalMessage = String(toolExecutionState?.originalMessage || '');
    const requestedActions = this.getSequentialActionRequirements(originalMessage);
    if (requestedActions.actionableClauseCount === 0) return true;
    // Every effect that could be recognized still has to be accounted for. What
    // is deliberately no longer required is that every actionable clause be
    // recognizable: demanding that made an unmapped verb anywhere in a request
    // permanently unsatisfiable, so the model was sent into protocol repair for
    // work it had already completed and the turn ended in a hard failure it had
    // no way to avoid. An unrecognized clause is missing knowledge on our side,
    // not evidence that the model failed to act.
    if (requestedActions.requirements.length === 0) return true;
    return this.doSuccessfulRecordsSatisfyRequirements(successfulRecords, requestedActions.requirements);
  }

  /**
   * The recognized effects a request asked for that no successful execution covers yet.
   */
  getOutstandingRequestSteps(toolExecutionState) {
    const successfulRecords = (toolExecutionState?.records || []).filter(record => record.status === 'success');
    const { requirements } = this.getSequentialActionRequirements(String(toolExecutionState?.originalMessage || ''));
    const unassigned = this.assignRecordsToRequirements(successfulRecords, requirements);

    return requirements
      .map((requirement, requirementIndex) => ({ requirement, remaining: unassigned.get(requirementIndex) || 0 }))
      .filter(entry => entry.remaining > 0)
      .map(entry => ({
        capability: entry.requirement.capability,
        clause: entry.requirement.clause || '',
        remaining: entry.remaining,
      }));
  }

  /**
   * Whether a turn that is already ending can report the work it completed.
   *
   * The bar is that every recognized effect the request asked for is covered by a
   * successful execution — a check derived from the request itself. It used to also
   * require shouldTerminateAfterToolExecution, whose hardcoded tool list decides
   * something else entirely (whether the turn may end a round early). Any tool
   * missing from that list therefore reported "the model repeated a tool call
   * beyond the request limit" for work that had in fact succeeded.
   */
  canFinalizeFromSuccessfulToolResults(toolExecutionState, successfulResults) {
    return Boolean(successfulResults.length > 0 && this.hasSuccessfulExecutionForRequest(toolExecutionState));
  }

  getRequestedExecutionCountFallback(originalMessage, toolName) {
    const message = String(originalMessage || '').toLowerCase();
    const numberWords = {
      once: 1,
      one: 1,
      twice: 2,
      two: 2,
      thrice: 3,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    const repeatNoun =
      toolName === 'open_new_tab' ? '(?:(?:new|additional|analysis|browser)\\s+)*(?:tabs?|windows?)' : null;
    const genericRepeatTarget = '(?:times?|rounds?|steps?)';
    const repeatTarget = repeatNoun ? `(?:${repeatNoun}|${genericRepeatTarget})` : genericRepeatTarget;
    // "zoom in 10x" is a magnification factor, not ten zoom steps, so the bare
    // Nx form is not a repeat count for zoom. Spelled-out repetition ("zoom in
    // 3 times") still is.
    const bareMultiplierIsRepeat = !/^zoom(?:_|$)/.test(String(toolName || ''));
    const numeric = message.match(
      new RegExp(`\\b(\\d{1,2})\\s*(?:${bareMultiplierIsRepeat ? 'x|' : ''}${repeatTarget})\\b`)
    );
    if (numeric) return Math.max(1, Math.min(Number(numeric[1]), 20));
    for (const [word, count] of Object.entries(numberWords)) {
      if (new RegExp(`\\b${word}\\s+${repeatTarget}\\b`).test(message)) {
        return count;
      }
    }
    const standaloneRepeat = message.match(/\b(once|twice|thrice)\b/);
    if (standaloneRepeat) return numberWords[standaloneRepeat[1]];
    return 1;
  }

  canAutomaticallyRetryToolFailures(failedResults = []) {
    const safePolicyNames = new Set([
      'feature_navigation',
      'position_navigation',
      'scroll_operations',
      'zoom_operations',
      'search',
      'analysis',
      'state',
      'external_api',
      'screenshot_operations',
      'display_operations',
    ]);
    const safePrimerTools = new Set([
      'design_primers',
      'calculate_primer_properties',
      'find_primer_binding_sites',
      'list_primers',
    ]);
    const safeFallbackTools = new Set([
      'select_gene',
      'select_sequence_region',
      'jump_to_gene',
      'find_gene_by_name',
      'search_features',
      'get_current_state',
      'get_genome_info',
      'get_file_info',
    ]);
    const capabilityPolicy = this.services?.context?.getToolExecutionPolicy?.()?.capabilityPolicy;

    return (
      failedResults.length > 0 &&
      failedResults.every(result => {
        const toolName = result.tool || result.tool_name;
        if (safePrimerTools.has(toolName) || safeFallbackTools.has(toolName)) return true;
        const policyName = capabilityPolicy?.getPolicyForTool?.(toolName)?.name;
        return safePolicyNames.has(policyName);
      })
    );
  }

  /**
   * Whether the provider stop reason means the model ended its turn cleanly.
   *
   * A missing stop reason counts as clean: adapters that collapse clean
   * OpenAI-compatible completions into plain strings drop the finish reason
   * before ChatManager sees it, so null must keep the legacy behavior instead
   * of being treated as abnormal. Known abnormal reasons (length, refusal,
   * tool protocol errors, ...) are handled earlier by
   * getModelTurnRecoveryDecision; this helper backs the loop's final guard.
   */
  isCleanCompletionStop(responseAnalysis) {
    const stopReason = String(responseAnalysis?.stopReason || '')
      .trim()
      .toLowerCase();
    if (!stopReason) return true;
    return new Set([
      'stop',
      'end_turn',
      'end-turn',
      'stop_sequence',
      'stopsequence',
      'eos',
      'complete',
      'completed',
      'done',
      'finish',
      'finished',
    ]).has(stopReason);
  }

  /** Deterministic message for a turn ended by repeated empty model responses. */
  buildEmptyResponseMessage(currentRound, maxRounds) {
    return (
      `The model returned an empty response for two consecutive rounds ` +
      `(rounds ${Math.max(1, currentRound - 1)}–${currentRound} of ${maxRounds}), so the request could not be ` +
      `completed and no action was taken. Please rephrase the request or switch to a different model.`
    );
  }

  /**
   * True for the completion notices this app writes when a turn fails or is cut
   * short. They are displayed as assistant bubbles but they are not model
   * speech, and replaying them into a later request as an assistant turn hands
   * the model a transcript in which "it" already announced a failure — which it
   * then tends to imitate. buildConversationHistory() filters on this.
   *
   * The prefixes are pinned by unit tests against the builders that produce
   * them; reword a builder and the matching prefix must move with it.
   */
  isAppGeneratedNotice(message) {
    const text = String(message || '').trim();
    return (
      text.startsWith('I could not complete the requested action because the model repeatedly returned') ||
      text.startsWith('The model returned an empty response for two consecutive rounds') ||
      text.startsWith('⚠️ Processing stopped after the configured limit') ||
      text.startsWith('The requested tool call was blocked by the tool execution policy') ||
      text.startsWith('The model repeated a tool call beyond the request limit') ||
      text.startsWith('The model declined this request before the requested action could be completed') ||
      text.startsWith('Sorry, I encountered an error. Please try again.')
    );
  }

  getModelTurnRecoveryDecision(responseAnalysis, toolExecutionState, currentRound, maxRounds) {
    const stopReason = String(responseAnalysis?.stopReason || '').toLowerCase();
    const responseText = String(responseAnalysis?.text || '');
    const invalidToolCalls = responseAnalysis?.invalidToolCalls || [];
    const refusal =
      responseAnalysis?.refusal ||
      responseAnalysis?.isRefusal ||
      /refusal|safety|content_filter|blocked|prohibited|recitation|blocklist|spii/.test(stopReason);

    if (refusal) {
      return {
        action: 'fail',
        reason: 'provider refusal or safety stop',
        finalResponse:
          responseText || 'The model declined this request before the requested action could be completed.',
      };
    }

    let reason = null;
    const requiresToolExecution = this.requestRequiresToolExecution(toolExecutionState?.originalMessage, responseText);
    const hasSuppressedCalls = (responseAnalysis?.suppressedToolCalls || []).length > 0;
    const safeSuppressedInformationalAnswer =
      hasSuppressedCalls &&
      invalidToolCalls.length === 0 &&
      !requiresToolExecution &&
      responseText.trim().length > 0 &&
      !this.isInterimActionResponse(responseText);
    if (/length|max_tokens|max_output_tokens|model_context_window_exceeded|incomplete/.test(stopReason)) {
      reason = `truncated model response (${stopReason})`;
    } else if (stopReason === 'pause_turn') {
      reason = 'provider requested continuation';
    } else if (/malformed_function_call|unexpected_tool_call|tool_(?:use_)?error/.test(stopReason)) {
      reason = `provider rejected the tool protocol (${stopReason})`;
    } else if (
      invalidToolCalls.length > 0 ||
      (responseAnalysis?.hasToolCallIntent && !safeSuppressedInformationalAnswer)
    ) {
      reason =
        responseAnalysis?.suppressedToolCalls?.length > 0
          ? 'a state-changing tool call was not authorized for this informational request'
          : 'malformed or unsupported tool call';
    } else if (responseAnalysis?.isEmpty) {
      reason = 'empty model response';
    } else if (requiresToolExecution && this.isInterimActionResponse(responseText)) {
      reason = 'the response announced an action without issuing a valid tool call';
    } else if (requiresToolExecution && !this.hasSuccessfulExecutionForRequest(toolExecutionState)) {
      const failedExecutionWasExplained =
        toolExecutionState?.records?.some(record => record.status === 'failed') &&
        /\b(?:could not|unable|failed|not found|unavailable|cannot|can(?:'|’)t)\b/i.test(responseText);
      if (!failedExecutionWasExplained) {
        reason = 'an actionable request ended without a verified successful tool execution';
      }
    }

    if (!reason) {
      return { action: 'complete', reason: 'final conversational response' };
    }

    const outstandingSteps = this.getOutstandingRequestSteps(toolExecutionState);
    const maxRepairRounds = 2;
    // A successful tool execution clears the consecutive streak, so a request the
    // model can never satisfy — one whose requirement no available tool matches —
    // used to alternate repair, re-run, repair forever without either budget
    // running out, and the turn only ended when it hit the round cap or the clock.
    // The cumulative count is not cleared, so that alternation terminates.
    const maxTotalRepairRounds = 4;
    const attemptedRepairs = toolExecutionState?.protocolRecoveryAttempts || 0;
    const totalAttemptedRepairs = toolExecutionState?.totalProtocolRecoveryAttempts || 0;
    if (
      currentRound >= maxRounds ||
      attemptedRepairs >= maxRepairRounds ||
      totalAttemptedRepairs >= maxTotalRepairRounds
    ) {
      const unfinished =
        outstandingSteps.length > 0
          ? ` The following requested step(s) were never carried out: ${outstandingSteps
              .map(step => step.capability)
              .join(', ')}.`
          : '';
      return {
        action: 'fail',
        reason,
        outstandingSteps,
        finalResponse:
          `I could not complete the requested action because the model repeatedly returned ${reason} ` +
          `instead of a valid tool call.${unfinished}`,
      };
    }

    if (toolExecutionState) {
      toolExecutionState.protocolRecoveryAttempts = attemptedRepairs + 1;
      toolExecutionState.totalProtocolRecoveryAttempts = totalAttemptedRepairs + 1;
      toolExecutionState.updatedAt = new Date().toISOString();
    }
    return { action: 'retry', reason, outstandingSteps };
  }

  buildToolProtocolRecoveryMessage(reason, outstandingSteps = [], options = {}) {
    // Naming the step that is still missing is what makes this prompt
    // recoverable. Told only that the request was incomplete, a model that had
    // folded two steps into one call had no way to work out which one to redo,
    // and simply restated that it was finished until the round budget ran out.
    const outstanding = Array.isArray(outstandingSteps) ? outstandingSteps : [];
    const outstandingLine =
      outstanding.length > 0
        ? `These requested steps have not been carried out yet:\n` +
          outstanding
            .map(step => `- ${step.clause || step.capability}${step.remaining > 1 ? ` (x${step.remaining})` : ''}`)
            .join('\n') +
          `\nIssue a tool call for each one, even when an earlier call already set a similar value; ` +
          `every step was requested separately and has to be performed separately.\n`
        : '';
    // When native tool schemas ride on the request, teaching the text-JSON
    // protocol actively fights the channel the model should use: a model that
    // follows the JSON instructions stops emitting the native calls it was
    // making and starts hand-writing JSON it often gets wrong.
    const protocolLine = options.nativeToolsAvailable
      ? `If an available tool is needed, invoke it through native function calling: the tools for this request ` +
        `are attached to the API call. Emit the function call itself; never write tool JSON in your reply text.\n` +
        `For dependent steps, return only the next call and wait for its result.\n`
      : `If an available tool is needed, respond with ONLY canonical JSON in this form:\n` +
        `{"tool_name":"exact_tool_name","parameters":{"exact_parameter_name":"value"}}\n` +
        `For independent calls, use a JSON array. For dependent steps, return only the next call and wait for its result.\n`;
    return (
      `[Tool Protocol Repair]\n` +
      `The previous response did not complete the request: ${reason}.\n` +
      outstandingLine +
      protocolLine +
      `Do not announce or describe a tool call without emitting it. If no tool is needed, provide the final answer directly.`
    );
  }

  buildRoundLimitResponse(maxRounds, lastSuccessfulResults = [], lastSuccessfulTools = []) {
    const header =
      `Processing stopped after the configured limit of ${maxRounds} rounds before the model produced a final answer. ` +
      'The request may be incomplete.';
    if (lastSuccessfulResults.length === 0) {
      return `⚠️ ${header}`;
    }

    const lastResults = this.generateCompletionResponseFromToolResults(lastSuccessfulResults, lastSuccessfulTools);
    return `⚠️ ${header}\n\nLast successful tool result:\n${lastResults}`;
  }

  /** @see ConversationTranscriptService */
  createToolExecutionFeedbackMessage(content) {
    return this.getTranscriptService().createToolExecutionFeedbackMessage(content);
  }

  /**
   * Structured record of what a history message actually executed. Policy
   * checks read this instead of grepping the message prose for
   * "<tool> executed successfully", which both misreads external tool output
   * that happens to contain that phrase and stops working the moment results
   * travel in a `tool` message rather than a sentence.
   * @param {object} message
   * @param {Array<{tool: string, parameters: object, success: boolean}>} executions
   */
  /** @see ConversationTranscriptService */
  attachToolExecutionRecords(message, executions) {
    return this.getTranscriptService().attachToolExecutionRecords(message, executions);
  }

  /** @returns {Array<{tool: string, parameters: object, success: boolean}>|null} */
  /** @see ConversationTranscriptService */
  getMessageToolExecutions(message) {
    return this.getTranscriptService().getMessageToolExecutions(message);
  }

  /**
   * True when every call in the round carries a provider tool-call id and every
   * id came back with a result. Anything less cannot be replayed natively:
   * an assistant turn with a tool_call that has no matching `tool` message is a
   * protocol violation, so a partial round falls back to prose as a whole.
   */
  /** @see ConversationTranscriptService */
  canReplayToolRoundNatively(toolsToExecute = [], toolResults = []) {
    return this.getTranscriptService().canReplayToolRoundNatively(toolsToExecute, toolResults);
  }

  /** Assistant turn carrying the model's own native tool calls. */
  /** @see ConversationTranscriptService */
  buildAssistantToolCallMessage(assistantText, toolsToExecute) {
    return this.getTranscriptService().buildAssistantToolCallMessage(assistantText, toolsToExecute);
  }

  /** One provider-native tool result, bound to the call it answers. */
  /** @see ConversationTranscriptService */
  buildToolResultMessage(result, trailingGuidance = '') {
    return this.getTranscriptService().buildToolResultMessage(result, trailingGuidance);
  }

  /** @see ConversationTranscriptService */
  warnOnOversizedToolResult(toolName, serialized) {
    return this.getTranscriptService().warnOnOversizedToolResult(toolName, serialized);
  }

  /**
   * The closing instruction that keeps the model from re-issuing a call it just
   * completed. Without it the next round re-reads a request that still reads as
   * unfulfilled ("zoom out") and the obvious move is to run the same tool again;
   * suppression then has to catch it after the fact.
   */
  /** @see ConversationTranscriptService */
  buildToolRoundGuidance(queuedResearchTask = false) {
    return this.getTranscriptService().buildToolRoundGuidance(queuedResearchTask);
  }

  /**
   * Replay one executed tool round into the transcript the next round will see.
   *
   * Requests already carry native tool schemas on every adapter, so the model
   * answers with real tool calls that have ids. Replaying that round as prose
   * threw the ids away, left parallel calls correlated only by name, and handed
   * the model a transcript in a shape it was never trained on. When ids are
   * present the round is replayed in the provider's own protocol; text-protocol
   * rounds keep the portable prose envelope.
   *
   * @returns {'native'|'text'} which protocol was used
   */
  /** @see ConversationTranscriptService */
  appendToolRoundToHistory(conversationHistory, options = {}) {
    return this.getTranscriptService().appendToolRoundToHistory(conversationHistory, options);
  }

  createToolExecutionState(originalMessage) {
    return {
      originalMessage,
      records: [],
      lastInjectedRecordCount: 0,
      consecutiveSuppressedRounds: 0,
      consecutiveFailureRounds: 0,
      protocolRecoveryAttempts: 0,
      totalProtocolRecoveryAttempts: 0,
      terminationReason: null,
      completionEvaluation: null,
      orchestrationPlan: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  evaluateTurnCompletion(completion, results, context = {}) {
    const Evaluator =
      (typeof window !== 'undefined' && window.TurnCompletionEvaluator) ||
      (typeof globalThis !== 'undefined' && globalThis.TurnCompletionEvaluator);
    if (typeof Evaluator !== 'function') return null;
    try {
      return new Evaluator().evaluate({ completion, results, context });
    } catch (error) {
      console.warn('[ChatManager] Turn completion evaluation failed:', error.message);
      return null;
    }
  }

  recordToolExecutionState(toolExecutionState, tool, status, details = {}) {
    if (!toolExecutionState || !tool || !tool.tool_name) {
      return null;
    }

    const now = new Date().toISOString();
    const record = {
      id: details.id || `tool_exec_${toolExecutionState.records.length + 1}`,
      tool: tool.tool_name,
      parameters: this.cloneToolParameters(tool.parameters || {}),
      normalizedParameters: this.normalizeToolParams(tool.tool_name, tool.parameters || {}),
      status,
      createdAt: now,
      updatedAt: now,
    };

    const optionalFields = [
      'round',
      'queuedRound',
      'completedRound',
      'reason',
      'error',
      'resultSummary',
      'requestedLimit',
    ];
    optionalFields.forEach(field => {
      if (details[field] !== undefined) {
        record[field] = details[field];
      }
    });

    toolExecutionState.records.push(record);
    toolExecutionState.updatedAt = now;
    return record;
  }

  updateToolExecutionStateRecord(toolExecutionState, executionId, updates = {}) {
    if (!toolExecutionState || !executionId) {
      return null;
    }

    const record = toolExecutionState.records.find(item => item.id === executionId);
    if (!record) {
      return null;
    }

    Object.assign(record, updates, { updatedAt: new Date().toISOString() });
    toolExecutionState.updatedAt = record.updatedAt;
    return record;
  }

  createToolResultSummary(result) {
    if (!result) {
      return null;
    }

    const resultData = Object.prototype.hasOwnProperty.call(result, 'result') ? result.result : result;
    if (resultData === null || resultData === undefined) {
      return resultData;
    }

    if (typeof this.sanitizeResultForLLM === 'function') {
      return this.sanitizeResultForLLM(resultData, result.tool);
    }

    return resultData;
  }

  markToolExecutionResults(toolExecutionState, toolsToExecute, toolResults, currentRound) {
    if (!toolExecutionState || !Array.isArray(toolsToExecute) || !Array.isArray(toolResults)) {
      return;
    }

    const unmatchedResultIndices = new Set(toolResults.map((_, index) => index));
    toolsToExecute.forEach((tool, index) => {
      if (!tool.executionId) {
        return;
      }

      const indexedResult = toolResults[index];
      const indexedResultMatches =
        unmatchedResultIndices.has(index) &&
        indexedResult?.tool === tool.tool_name &&
        this.areToolParametersEqual(tool.tool_name, indexedResult.parameters || {}, tool.parameters || {});
      const resultIndex = indexedResultMatches
        ? index
        : toolResults.findIndex(
            (item, candidateIndex) =>
              unmatchedResultIndices.has(candidateIndex) &&
              item.tool === tool.tool_name &&
              this.areToolParametersEqual(tool.tool_name, item.parameters || {}, tool.parameters || {})
          );
      const result = resultIndex === -1 ? null : toolResults[resultIndex];

      if (!result) {
        return;
      }
      unmatchedResultIndices.delete(resultIndex);

      this.updateToolExecutionStateRecord(toolExecutionState, tool.executionId, {
        status: result.success ? 'success' : 'failed',
        completedRound: currentRound,
        error: result.success ? null : result.error || 'Unknown error',
        resultSummary: result.success ? this.createToolResultSummary(result) : null,
      });
    });
  }

  buildToolExecutionStateMessage(toolExecutionState, options = {}) {
    if (!toolExecutionState || !Array.isArray(toolExecutionState.records) || toolExecutionState.records.length === 0) {
      return '';
    }

    const includeAllRecords = options.includeAllRecords === true;
    const startIndex = includeAllRecords ? 0 : toolExecutionState.lastInjectedRecordCount || 0;
    const recordsForMessage = toolExecutionState.records.slice(startIndex);
    if (recordsForMessage.length === 0) {
      return '';
    }

    const counts = toolExecutionState.records.reduce((acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, {});

    const compactRecords = recordsForMessage.map(record => {
      const item = {
        id: record.id,
        tool: record.tool,
        status: record.status,
        parameters: record.normalizedParameters,
      };

      if (record.round !== undefined) item.round = record.round;
      if (record.queuedRound !== undefined) item.queuedRound = record.queuedRound;
      if (record.completedRound !== undefined) item.completedRound = record.completedRound;
      if (record.reason) item.reason = record.reason;
      if (record.error) item.error = record.error;
      if (record.resultSummary !== undefined && record.resultSummary !== null) item.result = record.resultSummary;

      return item;
    });

    return (
      `[Tool Execution State]\n` +
      `This is execution state for the current user request, not a new task.\n` +
      `Original request: ${toolExecutionState.originalMessage}\n` +
      `Status totals: ${JSON.stringify(counts)}\n` +
      `New or updated records:\n${JSON.stringify(compactRecords, null, 2)}\n\n` +
      `Use successful tool results above as context for the next step. ` +
      `Do not call a tool with status "success" again using the same parameters unless the user explicitly requested a repeat. ` +
      `If the original request still has unfinished steps, respond with ONLY the next JSON tool call(s). ` +
      `If all requested steps are complete, provide the final answer.`
    );
  }

  appendToolExecutionStateMessage(conversationHistory, toolExecutionState, options = {}) {
    const message = this.buildToolExecutionStateMessage(toolExecutionState, options);
    if (!message) {
      return false;
    }

    conversationHistory.push({
      role: 'user',
      content: message,
    });
    toolExecutionState.lastInjectedRecordCount = toolExecutionState.records.length;
    return true;
  }

  createPendingToolExecutionQueue(
    detectedTools,
    successfulToolExecutionCounts,
    originalMessage,
    conversationHistory,
    currentRound,
    toolExecutionState = null
  ) {
    const executionFilter = this.filterExecutableToolInstances(
      detectedTools,
      successfulToolExecutionCounts,
      originalMessage,
      toolExecutionState
    );
    const pendingTools = [];
    const policyBlockedTools = [];
    const plannedToolResults = [];

    for (const tool of executionFilter.suppressedTools) {
      this.recordToolExecutionState(toolExecutionState, tool, 'suppressed', {
        round: currentRound,
        reason: 'duplicate tool instance in latest response or requested repeat limit reached',
      });
    }

    for (const tool of executionFilter.executableTools) {
      const shouldAllow = this.shouldAllowToolExecution(tool, conversationHistory, currentRound, plannedToolResults);
      if (!shouldAllow) {
        console.log(`🚫 [Policy] Blocking execution of: ${tool.tool_name}`);
        this.showThinkingProcess && this.updateThinkingMessage(`🚫 Policy blocked: ${tool.tool_name}`);
        policyBlockedTools.push(tool);
        this.recordToolExecutionState(toolExecutionState, tool, 'blocked', {
          round: currentRound,
          reason: 'tool execution policy blocked this call',
        });
        continue;
      }

      console.log(`✅ [Policy] Queueing execution of: ${tool.tool_name}`);
      const executionRecord = this.recordToolExecutionState(toolExecutionState, tool, 'queued', {
        queuedRound: currentRound,
      });
      const queuedTool = {
        tool_name: tool.tool_name,
        parameters: this.cloneToolParameters(tool.parameters),
        tool_call_id: tool.id ?? tool.tool_call_id ?? tool.call_id ?? null,
      };
      if (executionRecord) {
        queuedTool.executionId = executionRecord.id;
      }
      pendingTools.push(queuedTool);
      plannedToolResults.push({
        tool: queuedTool.tool_name,
        parameters: queuedTool.parameters,
        success: true,
        pending: true,
      });
    }

    return {
      pendingTools,
      suppressedTools: executionFilter.suppressedTools,
      policyBlockedTools,
    };
  }

  filterExecutableToolInstances(
    toolsToExecute,
    successfulToolExecutionCounts,
    originalMessage,
    toolExecutionState = null
  ) {
    const plannedToolExecutionCounts = new Map();
    const plannedToolNameCounts = new Map();
    const successfulToolNameCounts = new Map();
    const executableTools = [];
    const suppressedTools = [];

    successfulToolExecutionCounts.forEach((count, toolKey) => {
      const separatorIndex = toolKey.indexOf(':');
      const toolName = separatorIndex === -1 ? toolKey : toolKey.substring(0, separatorIndex);
      successfulToolNameCounts.set(toolName, (successfulToolNameCounts.get(toolName) || 0) + count);
    });

    for (const tool of toolsToExecute) {
      const toolKey = this.getToolExecutionKey(tool.tool_name, tool.parameters);
      const policyEntry = this.services?.context
        ?.getToolExecutionPolicy?.()
        ?.capabilityPolicy?.getPolicyForTool(tool.tool_name);
      const isRequestBoundedRepeat = policyEntry?.policy?.policy === 'bounded_repeat';
      const requestedLimit = this.getRequestedToolExecutionLimit(originalMessage, tool);
      const hasExplicitRepeatBudget = requestedLimit > 1;
      const useToolNameBudget = isRequestBoundedRepeat || hasExplicitRepeatBudget;
      const alreadySucceeded = useToolNameBudget
        ? successfulToolNameCounts.get(tool.tool_name) || 0
        : successfulToolExecutionCounts.get(toolKey) || 0;
      const alreadyPlanned = useToolNameBudget
        ? plannedToolNameCounts.get(tool.tool_name) || 0
        : plannedToolExecutionCounts.get(toolKey) || 0;
      // Successes from earlier rounds count against the budget for every tool, not
      // only the ones budgeted by name. They used to be ignored here ("treat a
      // new-round call as fresh"), which left an identical, already-successful call
      // executable once per round for the whole round budget: the loop re-prompted
      // the model with the request still standing, the model re-issued the same
      // call, and each repeat applied the side effect again — "zoom out" zoomed the
      // view out once per round until the rounds ran out. Nothing about that is
      // specific to zoom; it applied to any tool the completion heuristics did not
      // recognize. The escape hatch below keeps deliberate re-reads working.
      const usedRequestBudget = alreadySucceeded + alreadyPlanned;

      if (usedRequestBudget >= requestedLimit) {
        // A repeat can still return something new when the state it observes has
        // moved on, which another tool's success since then is the generic evidence
        // for ("navigate, then read the position again"). Requesting a repeat by
        // name is an explicit count from the user, so it stays capped at that count.
        const repeatCanObserveNewState =
          !useToolNameBudget && alreadySucceeded > 0 && this.hasProgressSinceLastSuccess(toolExecutionState, toolKey);

        if (!repeatCanObserveNewState) {
          console.log(
            `♻️ [ToolLoop] Suppressing duplicate tool instance: ${tool.tool_name} ` +
              `(request budget ${usedRequestBudget}/${requestedLimit}, previous successes ${alreadySucceeded})`
          );
          suppressedTools.push(tool);
          continue;
        }

        console.log(`🔄 [ToolLoop] Allowing repeat of ${tool.tool_name}: another tool succeeded since its last run`);
      }

      if (useToolNameBudget) {
        plannedToolNameCounts.set(tool.tool_name, alreadyPlanned + 1);
      } else {
        plannedToolExecutionCounts.set(toolKey, alreadyPlanned + 1);
      }
      executableTools.push(tool);
    }

    return { executableTools, suppressedTools };
  }

  /**
   * Whether any other tool has succeeded since this exact call last succeeded.
   *
   * Re-running a call that already succeeded can only produce something new if the
   * state it observes has changed in the meantime, and another tool's success is
   * the generic evidence for that. Deriving it from the execution record keeps the
   * check free of any per-tool knowledge about which capabilities mutate state —
   * a list like that is what let the repeat go unnoticed in the first place.
   *
   * @param {Object|null} toolExecutionState - execution state for the current request
   * @param {string} toolKey - `getToolExecutionKey` output for the call being judged
   * @returns {boolean}
   */
  hasProgressSinceLastSuccess(toolExecutionState, toolKey) {
    const records = toolExecutionState?.records;
    if (!Array.isArray(records) || records.length === 0) return false;

    const keyOf = record => this.getToolExecutionKey(record.tool, record.parameters || {});

    let lastSuccessIndex = -1;
    for (let index = records.length - 1; index >= 0; index--) {
      const record = records[index];
      if (record.status === 'success' && keyOf(record) === toolKey) {
        lastSuccessIndex = index;
        break;
      }
    }
    if (lastSuccessIndex === -1) return false;

    for (let index = lastSuccessIndex + 1; index < records.length; index++) {
      const record = records[index];
      if (record.status === 'success' && keyOf(record) !== toolKey) return true;
    }
    return false;
  }

  async executePendingToolExecutionQueue(pendingToolExecutionQueue, referenceToolResults = [], options = {}) {
    const toolResults = [];
    const referenceContext = Array.isArray(referenceToolResults) ? referenceToolResults.slice() : [];
    const turnContext = options.turnContext || null;
    const signal = options.signal || turnContext?.abortSignal;
    const pendingQueue = Array.isArray(pendingToolExecutionQueue) ? pendingToolExecutionQueue.slice() : [];
    const createNodeId =
      (typeof globalThis !== 'undefined' && globalThis.createNodeId) ||
      (typeof window !== 'undefined' && window.createNodeId) ||
      (() => `tool_node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    while (pendingQueue.length > 0) {
      this.throwIfConversationAborted();
      if (signal?.aborted) {
        const error = new Error('Tool execution cancelled');
        error.name = 'AbortError';
        throw error;
      }

      const tool = pendingQueue.shift();
      const toolCallId = tool.tool_call_id ?? tool.id ?? null;
      const nodeId = toolCallId || createNodeId();
      const recordedParameters = this.cloneToolParameters(tool.parameters);
      let executionParameters;

      try {
        executionParameters = this.resolveToolParameterReferences(recordedParameters, referenceContext);
        const executionStart = Date.now();
        const result = await this.executeToolByName(tool.tool_name, executionParameters, {
          turnContext,
          nodeId,
          source: turnContext?.source,
          scope: turnContext?.scope,
          signal,
          gatewayLegacyResult: true,
        });
        const executionTime = Date.now() - executionStart;
        const isExecutionResult =
          result &&
          typeof result === 'object' &&
          typeof result.status === 'string' &&
          Object.prototype.hasOwnProperty.call(result, 'executionId');
        const status = isExecutionResult ? result.status : result?.success === false ? 'failed' : 'succeeded';
        const isSuccess = status === 'succeeded' || status === 'queued';
        const businessResult = isExecutionResult ? result.value : result;
        const error = isExecutionResult
          ? result.error?.message || result.error || (isSuccess ? null : status)
          : result?.success === false
            ? result.error || result.message || 'Tool reported an unsuccessful result'
            : null;
        const toolResult = {
          tool: tool.tool_name,
          tool_name: tool.tool_name,
          tool_call_id: toolCallId,
          parameters: recordedParameters,
          success: isSuccess,
          result: isSuccess ? businessResult : null,
          error,
          executionTime,
        };
        toolResults.push(toolResult);
        if (toolResult.success) {
          referenceContext.push(toolResult);
        }
      } catch (error) {
        toolResults.push({
          tool: tool.tool_name,
          tool_name: tool.tool_name,
          tool_call_id: toolCallId,
          parameters: recordedParameters,
          success: false,
          result: null,
          error: error.message,
          executionTime: 0,
        });
      }
    }

    return toolResults;
  }

  addToolResultsToReferenceContext(referenceContext, toolResults) {
    if (!Array.isArray(referenceContext) || !Array.isArray(toolResults)) {
      return;
    }

    for (const result of toolResults) {
      if (result && result.success && !referenceContext.includes(result)) {
        referenceContext.push(result);
      }
    }
  }

  toolParametersContainReferences(parameters) {
    if (parameters === null || parameters === undefined) {
      return false;
    }

    if (typeof parameters === 'string') {
      return this.extractToolReferenceExpressions(parameters).length > 0;
    }

    if (Array.isArray(parameters)) {
      return parameters.some(value => this.toolParametersContainReferences(value));
    }

    if (typeof parameters === 'object') {
      return Object.values(parameters).some(value => this.toolParametersContainReferences(value));
    }

    return false;
  }

  resolveToolParameterReferences(parameters, referenceToolResults = []) {
    if (parameters === null || parameters === undefined) {
      return parameters;
    }

    if (typeof parameters === 'string') {
      return this.resolveToolReferenceString(parameters, referenceToolResults);
    }

    if (Array.isArray(parameters)) {
      return parameters.map(value => this.resolveToolParameterReferences(value, referenceToolResults));
    }

    if (typeof parameters === 'object') {
      const resolved = {};
      for (const [key, value] of Object.entries(parameters)) {
        resolved[key] = this.resolveToolParameterReferences(value, referenceToolResults);
      }
      return resolved;
    }

    return parameters;
  }

  resolveToolReferenceString(value, referenceToolResults = []) {
    const references = this.extractToolReferenceExpressions(value);
    if (references.length === 0) {
      return value;
    }

    const trimmed = value.trim();
    const fullReference = this.extractWholeToolReferenceExpression(trimmed);
    if (fullReference) {
      return this.resolveToolReferenceExpression(fullReference, referenceToolResults);
    }

    return value.replace(this.getToolReferencePattern(), (match, doubleBracedReference, singleBracedReference) => {
      const reference = doubleBracedReference || singleBracedReference;
      const resolved = this.resolveToolReferenceExpression(reference, referenceToolResults);
      if (resolved === null || resolved === undefined) {
        return '';
      }
      if (typeof resolved === 'object') {
        return JSON.stringify(resolved);
      }
      return String(resolved);
    });
  }

  extractToolReferenceExpressions(value) {
    if (typeof value !== 'string') {
      return [];
    }

    const references = [];
    const pattern = this.getToolReferencePattern();
    let match;
    while ((match = pattern.exec(value)) !== null) {
      references.push(match[1] || match[2]);
    }
    return references;
  }

  extractWholeToolReferenceExpression(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const wholeReference = value.match(
      /^\{\{\s*([A-Za-z][\w.-]*(?:\[[^\]]+\])?(?:\.[A-Za-z_$][\w$-]*(?:\[[^\]]+\])?)*)\s*\}\}$/
    );
    if (wholeReference) {
      return wholeReference[1];
    }

    const singleBraceReference = value.match(
      /^\{\s*([A-Za-z][\w.-]*(?:\[[^\]]+\])?(?:\.[A-Za-z_$][\w$-]*(?:\[[^\]]+\])?)*)\s*\}$/
    );
    return singleBraceReference ? singleBraceReference[1] : null;
  }

  getToolReferencePattern() {
    return /\{\{\s*([A-Za-z][\w.-]*(?:\[[^\]]+\])?(?:\.[A-Za-z_$][\w$-]*(?:\[[^\]]+\])?)*)\s*\}\}|\{\s*([A-Za-z][\w.-]*(?:\[[^\]]+\])?(?:\.[A-Za-z_$][\w$-]*(?:\[[^\]]+\])?)*)\s*\}/g;
  }

  resolveToolReferenceExpression(referenceExpression, referenceToolResults = []) {
    const reference = String(referenceExpression || '').trim();
    const match = this.findToolResultForReference(reference, referenceToolResults);
    if (!match) {
      throw new Error(`Unresolved tool result reference: {${reference}}`);
    }

    const { toolResult, resultPath } = match;
    const resultData = Object.prototype.hasOwnProperty.call(toolResult, 'result') ? toolResult.result : toolResult;
    if (!resultPath) {
      return resultData;
    }

    const directValue = this.getValueByReferencePath(resultData, resultPath);
    if (directValue !== undefined) {
      return directValue;
    }

    const wrapperValue = this.getValueByReferencePath(toolResult, resultPath);
    if (wrapperValue !== undefined) {
      return wrapperValue;
    }

    throw new Error(`Unresolved tool result reference path: {${reference}}`);
  }

  findToolResultForReference(reference, referenceToolResults = []) {
    if (!Array.isArray(referenceToolResults) || referenceToolResults.length === 0) {
      return null;
    }

    const successfulResults = referenceToolResults.filter(result => result && result.success !== false && result.tool);
    let bestMatch = null;

    for (let index = successfulResults.length - 1; index >= 0; index--) {
      const result = successfulResults[index];
      const toolName = result.tool;
      const referenceName = result.tool_call_id || result.nodeId;
      if (referenceName && (reference === referenceName || reference.startsWith(`${referenceName}.`))) {
        return {
          toolResult: result,
          resultPath: reference === referenceName ? '' : reference.substring(referenceName.length + 1),
        };
      }
      if (reference === toolName || reference.startsWith(`${toolName}.`)) {
        if (!bestMatch || toolName.length > bestMatch.toolResult.tool.length) {
          bestMatch = {
            toolResult: result,
            resultPath: reference === toolName ? '' : reference.substring(toolName.length + 1),
          };
        }
      }
    }

    return bestMatch;
  }

  getValueByReferencePath(source, pathExpression) {
    if (!pathExpression) {
      return source;
    }

    if (source === null || source === undefined) {
      return undefined;
    }

    const tokens = this.parseReferencePath(pathExpression);
    let current = source;
    for (const token of tokens) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[token];
    }

    return current;
  }

  parseReferencePath(pathExpression) {
    const tokens = [];
    const pattern = /([A-Za-z_$][\w$-]*)|\[([^\]]+)\]/g;
    let match;
    while ((match = pattern.exec(pathExpression)) !== null) {
      if (match[1] !== undefined) {
        tokens.push(match[1]);
      } else if (match[2] !== undefined) {
        const rawIndex = match[2].trim().replace(/^['"]|['"]$/g, '');
        const numericIndex = Number(rawIndex);
        tokens.push(Number.isInteger(numericIndex) && String(numericIndex) === rawIndex ? numericIndex : rawIndex);
      }
    }
    return tokens;
  }

  normalizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    if (Array.isArray(params)) {
      return params.map(value => (value && typeof value === 'object' ? this.normalizeParams(value) : value));
    }
    const sorted = {};
    Object.keys(params)
      .sort()
      .forEach(key => {
        const val = params[key];
        if (val !== undefined) {
          sorted[key] = val && typeof val === 'object' ? this.normalizeParams(val) : val;
        }
      });
    if (sorted.primerSequence && (!sorted.sequence || sorted.sequence === sorted.primerSequence)) {
      sorted.sequence = sorted.primerSequence;
      delete sorted.primerSequence;
    }
    return sorted;
  }

  areParametersEqual(params1, params2) {
    if (!params1 && !params2) return true;
    if (!params1 || !params2) return false;
    try {
      const norm1 = this.normalizeParams(typeof params1 === 'string' ? JSON.parse(params1) : params1);
      const norm2 = this.normalizeParams(typeof params2 === 'string' ? JSON.parse(params2) : params2);
      return JSON.stringify(norm1) === JSON.stringify(norm2);
    } catch (e) {
      return false;
    }
  }

  areToolParametersEqual(toolName, params1, params2) {
    if (!params1 && !params2) return true;
    if (!params1 || !params2) return false;
    try {
      const norm1 = this.normalizeToolParams(toolName, typeof params1 === 'string' ? JSON.parse(params1) : params1);
      const norm2 = this.normalizeToolParams(toolName, typeof params2 === 'string' ? JSON.parse(params2) : params2);
      return JSON.stringify(norm1) === JSON.stringify(norm2);
    } catch (e) {
      return false;
    }
  }

  extractParametersFromExecutionMessage(content) {
    const marker = 'with parameters:';
    const markerIdx = content.indexOf(marker);
    if (markerIdx === -1) return null;

    const jsonStart = content.indexOf('{', markerIdx + marker.length);
    if (jsonStart === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = jsonStart; i < content.length; i++) {
      const char = content[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          return content.substring(jsonStart, i + 1);
        }
      }
    }

    return null;
  }

  /**
   * Split one execution-feedback message into a record per tool it reports on.
   *
   * A round that runs several tools joins every outcome into a single feedback
   * message, so reading only the first "with parameters:" block attributes those
   * parameters to every tool named in the message. Every tool after the first
   * then looks like it was never run, and the repeat guards let the model call it
   * again on each subsequent round.
   */
  parseToolExecutionFeedbackEntries(content) {
    if (typeof content !== 'string' || !content) {
      return [];
    }

    const entries = [];
    const headerPattern = /([A-Za-z_][A-Za-z0-9_]*) executed( successfully)?/g;
    const marker = ' with parameters:';
    let match;

    while ((match = headerPattern.exec(content)) !== null) {
      const entry = {
        toolName: match[1],
        success: Boolean(match[2]),
        parametersText: null,
      };

      if (content.startsWith(marker, headerPattern.lastIndex)) {
        const tail = content.slice(headerPattern.lastIndex);
        const parametersText = this.extractParametersFromExecutionMessage(tail);
        if (parametersText) {
          entry.parametersText = parametersText;
          // Resume scanning after this tool's parameters so the next header match
          // belongs to the next tool rather than to text inside these parameters.
          headerPattern.lastIndex += tail.indexOf(parametersText) + parametersText.length;
        }
      }

      entries.push(entry);
    }

    return entries;
  }

  /**
   * Check whether a feedback entry's parameters describe the same call as a tool key
   */
  doesFeedbackEntryMatchParameters(toolName, parsedKeyParams, paramsStr, entry) {
    if (!entry.parametersText) {
      return false;
    }

    try {
      const parsedEntryParams = JSON.parse(entry.parametersText);
      if (parsedKeyParams) {
        return this.areToolParametersEqual(toolName, parsedKeyParams, parsedEntryParams);
      }
    } catch (e) {}

    return entry.parametersText === paramsStr;
  }

  /**
   * Check if a tool with specific parameters was executed successfully in conversation history
   */
  wasToolExecutedSuccessfully(toolKey, conversationHistory) {
    // Look for legacy system feedback and provider-portable protocol feedback.
    const [toolName, ...paramsParts] = toolKey.split(':');
    const paramsStr = paramsParts.join(':');
    let parsedKeyParams = null;
    try {
      parsedKeyParams = JSON.parse(paramsStr);
    } catch (e) {}

    for (const msg of conversationHistory) {
      // Structured records are authoritative: they survive the native `tool`
      // role and cannot be forged by tool output that quotes the prose phrase.
      const executions = this.getMessageToolExecutions(msg);
      if (executions) {
        const matched = executions.some(
          execution =>
            execution.success &&
            execution.tool === toolName &&
            this.areParametersEqual(execution.parameters, parsedKeyParams)
        );
        if (matched) {
          console.log(`🔍 Found structured successful execution record for: ${toolName}`);
          return true;
        }
        continue;
      }

      const isExecutionFeedback = msg.role === 'system' || msg.__codexomicsToolFeedback === true;
      if (!isExecutionFeedback || !msg.content || !msg.content.includes(`${toolName} executed successfully`)) {
        continue;
      }

      if (!msg.content.includes('with parameters:')) {
        // Legacy support: if message doesn't have the "with parameters" part,
        // we fall back to name-only match to be safe
        console.log(`🔍 Found legacy successful execution record for: ${toolName}`);
        return true;
      }

      const matched = this.parseToolExecutionFeedbackEntries(msg.content).some(
        entry =>
          entry.success &&
          entry.toolName === toolName &&
          this.doesFeedbackEntryMatchParameters(toolName, parsedKeyParams, paramsStr, entry)
      );

      if (matched) {
        console.log(`🔍 Found successful execution record for: ${toolName} with matching parameters (robust check)`);
        return true;
      }
    }
    return false;
  }

  /**
   * Find recent execution of a tool within a time window
   */
  findRecentExecution(toolName, conversationHistory, timeWindowMs = 5000) {
    const now = Date.now();

    // Look through conversation history for recent executions
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];

      // Check the structured ledger first, then legacy system feedback and the
      // provider-portable prose envelope.
      const executions = this.getMessageToolExecutions(msg);
      if (executions?.some(execution => execution.success && execution.tool === toolName)) {
        const estimatedTimestamp = now - (conversationHistory.length - 1 - i) * 1000;
        if (now - estimatedTimestamp < timeWindowMs) {
          console.log(`🔍 Found recent execution of ${toolName} within ${timeWindowMs}ms window`);
          return { toolName, timestamp: estimatedTimestamp, messageIndex: i };
        }
      }

      const isExecutionFeedback = msg.role === 'system' || msg.__codexomicsToolFeedback === true;
      if (isExecutionFeedback && msg.content) {
        if (msg.content.includes(`${toolName} executed successfully`)) {
          // Estimate message timestamp (conversations are usually recent)
          const estimatedTimestamp = now - (conversationHistory.length - 1 - i) * 1000;

          if (now - estimatedTimestamp < timeWindowMs) {
            console.log(`🔍 Found recent execution of ${toolName} within ${timeWindowMs}ms window`);
            return {
              toolName,
              timestamp: estimatedTimestamp,
              messageIndex: i,
            };
          }
        }
      }

      // Check assistant messages for tool calls
      if (msg.role === 'assistant' && msg.content) {
        try {
          // Try to parse as single tool call
          const parsed = JSON.parse(msg.content);
          if (parsed.tool_name === toolName) {
            const estimatedTimestamp = now - (conversationHistory.length - 1 - i) * 1000;

            if (now - estimatedTimestamp < timeWindowMs) {
              console.log(`🔍 Found recent tool call of ${toolName} within ${timeWindowMs}ms window`);
              return {
                toolName,
                timestamp: estimatedTimestamp,
                messageIndex: i,
                parameters: parsed.parameters,
              };
            }
          }
        } catch (e) {
          // Try to parse as multiple tool calls
          try {
            const multipleToolCalls = this.parseMultipleToolCalls(msg.content);
            const matchingTool = multipleToolCalls.find(t => t.tool_name === toolName);
            if (matchingTool) {
              const estimatedTimestamp = now - (conversationHistory.length - 1 - i) * 1000;

              if (now - estimatedTimestamp < timeWindowMs) {
                return {
                  toolName,
                  timestamp: estimatedTimestamp,
                  messageIndex: i,
                  parameters: matchingTool.parameters,
                };
              }
            }
          } catch (e2) {
            // Not a tool call, continue
          }
        }
      }
    }

    return null;
  }

  /**
   * Count how many times a tool with specific parameters has been executed
   */
  getToolExecutionCount(toolKey, conversationHistory) {
    const [toolName, ...paramsParts] = toolKey.split(':');
    const paramsStr = paramsParts.join(':');
    let parsedKeyParams = null;
    try {
      parsedKeyParams = JSON.parse(paramsStr);
    } catch (e) {}
    let count = 0;

    for (const msg of conversationHistory) {
      const executions = this.getMessageToolExecutions(msg);
      if (executions) {
        count += executions.filter(
          execution =>
            execution.success &&
            execution.tool === toolName &&
            this.areParametersEqual(execution.parameters, parsedKeyParams)
        ).length;
        continue;
      }

      const isExecutionFeedback = msg.role === 'system' || msg.__codexomicsToolFeedback === true;
      if (!isExecutionFeedback || !msg.content || !msg.content.includes(`${toolName} executed successfully`)) {
        continue;
      }

      if (!msg.content.includes('with parameters:')) {
        // Legacy support
        count++;
        continue;
      }

      count += this.parseToolExecutionFeedbackEntries(msg.content).filter(
        entry =>
          entry.success &&
          entry.toolName === toolName &&
          this.doesFeedbackEntryMatchParameters(toolName, parsedKeyParams, paramsStr, entry)
      ).length;
    }
    return count;
  }

  /**
   * Count how many times a tool name has been executed (any parameters)
   */
  getToolExecutionCountByName(toolName, conversationHistory) {
    let count = 0;
    for (const msg of conversationHistory) {
      const executions = this.getMessageToolExecutions(msg);
      if (executions) {
        count += executions.filter(execution => execution.success && execution.tool === toolName).length;
        continue;
      }
      const isExecutionFeedback = msg.role === 'system' || msg.__codexomicsToolFeedback === true;
      if (isExecutionFeedback && msg.content && msg.content.includes(`${toolName} executed successfully`)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Find existing execution of a tool with specific parameters
   */
  findExistingExecution(toolKey, conversationHistory) {
    const [toolName, ...paramsParts] = toolKey.split(':');
    const paramsStr = paramsParts.join(':');
    let parsedKeyParams = null;
    try {
      parsedKeyParams = JSON.parse(paramsStr);
    } catch (e) {}

    for (const msg of conversationHistory) {
      const executions = this.getMessageToolExecutions(msg);
      if (executions) {
        const execution = executions.find(
          candidate => candidate.tool === toolName && this.areParametersEqual(candidate.parameters, parsedKeyParams)
        );
        if (execution) {
          return { success: execution.success, timestamp: new Date().toISOString() };
        }
        continue;
      }

      const isExecutionFeedback = msg.role === 'system' || msg.__codexomicsToolFeedback === true;
      if (!isExecutionFeedback || !msg.content || !msg.content.includes(`${toolName} executed`)) {
        continue;
      }

      if (!msg.content.includes('with parameters:')) {
        return {
          success: msg.content.includes('successfully'),
          timestamp: new Date().toISOString(), // Approximate
        };
      }

      // Read the outcome off this tool's own entry: a multi-tool round reports
      // every tool in one message, so "successfully" anywhere in it says nothing
      // about the tool being looked up.
      const entry = this.parseToolExecutionFeedbackEntries(msg.content).find(
        candidate =>
          candidate.toolName === toolName &&
          this.doesFeedbackEntryMatchParameters(toolName, parsedKeyParams, paramsStr, candidate)
      );

      if (entry) {
        return {
          success: entry.success,
          timestamp: new Date().toISOString(),
        };
      }
    }
    return null;
  }

  /**
   * Analyze protein domains using InterPro database
   */
  async analyzeInterProDomains(parameters) {
    if (!this.services || !this.services.protein) {
      console.error('[ChatManager] protein not initialized');
      return;
    }
    return await this.services.protein.analyzeInterProDomains(parameters);
  }

  /**
   * Search InterPro database for entries
   */
  async searchInterProEntry(parameters) {
    if (!this.services || !this.services.protein) {
      console.error('[ChatManager] protein service not initialized');
      return { success: false, tool: 'search_interpro_entry', error: 'Protein service not initialized' };
    }
    return await this.services.protein.searchInterproEntry(parameters);
  }

  /**
   * Get detailed information for an InterPro entry
   */
  async getInterProEntryDetails(parameters) {
    if (!this.services || !this.services.protein) {
      console.error('[ChatManager] protein service not initialized');
      return { success: false, tool: 'get_interpro_entry_details', error: 'Protein service not initialized' };
    }
    return await this.services.protein.getInterproEntryDetails(parameters);
  }

  /**
   * Advanced UniProt search with multiple filters
   */
  async advancedUniProtSearch(parameters) {
    if (!this.services || !this.services.protein) {
      console.error('[ChatManager] protein service not initialized');
      return { success: false, tool: 'advanced_uniprot_search', error: 'Protein service not initialized' };
    }
    return await this.services.protein.advancedUniprotSearch(parameters);
  }

  /**
   * Get detailed UniProt entry information
   */
  async getUniProtEntry(parameters) {
    const {
      uniprot_id,
      geneName,
      organism = null, // No default organism - will be 'Homo sapiens' only for gene searches
      include_sequence = true,
      include_features = true,
      include_function = true,
    } = parameters;

    console.log('📖 [ChatManager] Getting UniProt entry:', {
      uniprot_id,
      geneName,
      organism,
    });

    try {
      // Try MCP server first
      if (this.mcpServerManager) {
        const mcpTools = this.mcpServerManager.getAllAvailableTools();
        const mcpTool = mcpTools.find(t => t.name === 'get_uniprot_entry');

        if (mcpTool) {
          try {
            return await this.mcpServerManager.executeToolOnServer(mcpTool.serverId, 'get_uniprot_entry', parameters);
          } catch (mcpError) {
            console.warn('🔄 [ChatManager] MCP execution failed, using fallback:', mcpError.message);
          }
        }
      }

      // Fallback implementation - directly query UniProt REST API
      let accession = uniprot_id || parameters.uniprotId;
      const gene = geneName || parameters.gene_name;
      const includeCrossRefs = parameters.includeCrossRefs ?? parameters.include_cross_refs ?? false;

      if (!accession) {
        if (!gene) {
          throw new Error('Either uniprot_id or geneName is required');
        }

        const queryParts = [`(gene:${gene})`];
        if (organism) queryParts.push(`(organism_name:"${organism}")`);
        const searchUrl = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(queryParts.join(' AND '))}&fields=accession&size=1&format=json`;

        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) {
          throw new Error(`UniProt search error: ${searchResponse.status} ${searchResponse.statusText}`);
        }
        const searchData = await searchResponse.json();
        accession = searchData.results?.[0]?.primaryAccession;
        if (!accession) {
          throw new Error(`No UniProt entry found for gene "${gene}"${organism ? ` in ${organism}` : ''}`);
        }
      }

      const entryUrl = `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(accession)}.json`;
      const response = await fetch(entryUrl);
      if (!response.ok) {
        throw new Error(`UniProt API error: ${response.status} ${response.statusText}`);
      }
      const entry = await response.json();

      const functionComment = (entry.comments || []).find(c => c.commentType === 'FUNCTION');
      const functionDescription = functionComment?.texts?.[0]?.value || '';

      const result = {
        success: true,
        tool: 'get_uniprot_entry',
        timestamp: new Date().toISOString(),
        entry_info: {
          uniprot_id: entry.primaryAccession,
          entry_name: entry.uniProtkbId,
          protein_name:
            entry.proteinDescription?.recommendedName?.fullName?.value ||
            entry.proteinDescription?.submissionNames?.[0]?.fullName?.value ||
            'Unknown',
          organism: entry.organism?.scientificName || 'Unknown',
          genes: (entry.genes || []).map(g => g.geneName?.value).filter(Boolean),
          status: entry.entryType === 'UniProtKB reviewed (Swiss-Prot)' ? 'reviewed' : 'unreviewed',
        },
        sequence_length: entry.sequence?.length || 0,
        message: `Retrieved UniProt entry for ${entry.primaryAccession}`,
      };

      if (include_sequence) {
        result.protein_sequence = entry.sequence?.value || '';
      }

      if (include_features) {
        result.features = (entry.features || []).map(f => ({
          type: f.type,
          description: f.description || '',
          start: f.location?.start?.value,
          end: f.location?.end?.value,
        }));
      }

      if (include_function) {
        result.function = {
          description: functionDescription,
          go_terms: (entry.uniProtKBCrossReferences || []).filter(ref => ref.database === 'GO').map(ref => ref.id),
        };
      }

      if (includeCrossRefs) {
        result.cross_references = (entry.uniProtKBCrossReferences || []).map(ref => ({
          database: ref.database,
          id: ref.id,
        }));
      }

      return result;
    } catch (error) {
      console.error('❌ [ChatManager] UniProt entry retrieval failed:', error);
      return {
        success: false,
        tool: 'get_uniprot_entry',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Generate a completion response based on tool execution results
   */
  generateCompletionResponseFromToolResults(successfulResults, toolsToExecute) {
    if (successfulResults.length === 0) {
      return 'Task completed but no results were obtained.';
    }

    // Handle multiple tools - combine results
    if (successfulResults.length > 1) {
      console.log(`📋 [generateCompletionResponseFromToolResults] Processing ${successfulResults.length} tools`);

      let combinedResponse = '';
      const processedResults = [];

      const findMatchingTool = result =>
        toolsToExecute.find(
          tool =>
            tool.tool_name === result.tool &&
            this.areToolParametersEqual(tool.tool_name, tool.parameters || {}, result.parameters || {})
        ) || { tool_name: result.tool, parameters: result.parameters || {} };

      // Process each tool result individually
      for (let i = 0; i < successfulResults.length; i++) {
        const result = successfulResults[i];
        const tool = findMatchingTool(result);

        console.log(`🔧 [generateCompletionResponseFromToolResults] Processing tool ${i + 1}: ${tool.tool_name}`);

        const singleToolResponse = this.generateSingleToolResponse(tool, result);
        if (singleToolResponse) {
          processedResults.push({
            tool: tool.tool_name,
            response: singleToolResponse,
          });
        }
      }

      // Combine all responses
      if (processedResults.length > 0) {
        combinedResponse = processedResults.map(r => r.response).join('\n\n---\n\n');
        return combinedResponse;
      }
    }

    // Handle single tool (original logic)
    const result = successfulResults[0];
    const tool = toolsToExecute.find(
      candidate =>
        candidate.tool_name === result.tool &&
        this.areToolParametersEqual(candidate.tool_name, candidate.parameters || {}, result.parameters || {})
    ) || { tool_name: result.tool, parameters: result.parameters || {} };

    return this.generateSingleToolResponse(tool, result) || 'Task completed successfully.';
  }

  /**
   * Generate response for a single tool execution
   */
  generateSingleToolResponse(tool, result) {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.generateSingleToolResponse(tool, result);
  }

  /**
   * Get execution data for benchmark integration
   * Returns the function calls and tool results from the last LLM interaction
   */
  getLastExecutionData() {
    return this.lastExecutionData || null;
  }

  /**
   * Clear execution data (for memory management)
   */
  clearExecutionData() {
    this.lastExecutionData = null;
  }

  /**
   * Test function call parsing with sample LLM response
   * This method helps debug function call extraction issues
   */
  testFunctionCallParsing() {
    // Sample LLM response from user
    const sampleResponse = `<think>
Okay, the user wants to search for the gene lacZ. Let me check the available tools. The relevant function here is find_gene_by_name, which is under the SEARCH & NAVIGATION category. The parameters needed are the name of the gene. Since the user specified "lacZ", I should use that as the parameter. I need to make sure the tool call is correctly formatted in JSON. Also, according to the priority, local tools are first, so this should be okay. No other parameters are needed, just the gene name. Let me structure the JSON accordingly.
</think>

{"tool_name": "find_gene_by_name", "parameters": {"name": "lacZ"}}`;

    console.log('🧪 Testing function call parsing with sample response...');
    console.log('Sample response:', sampleResponse);

    // Test parseToolCall
    const parsedToolCall = this.parseToolCall(sampleResponse);
    console.log('Parsed tool call:', parsedToolCall);

    // Test displayLLMThinking
    console.log('Testing thinking display...');
    this.displayLLMThinking(sampleResponse);

    // Expected result
    const expectedResult = {
      tool_name: 'find_gene_by_name',
      parameters: { name: 'lacZ' },
    };

    // Verify result
    if (
      parsedToolCall &&
      parsedToolCall.tool_name === expectedResult.tool_name &&
      JSON.stringify(parsedToolCall.parameters) === JSON.stringify(expectedResult.parameters)
    ) {
      console.log('✅ Function call parsing test PASSED');
      return true;
    } else {
      console.log('❌ Function call parsing test FAILED');
      console.log('Expected:', expectedResult);
      console.log('Got:', parsedToolCall);
      return false;
    }
  }

  /**
   * Store for active tasks being polled
   */
  activeTasks = new Map();

  /**
   * Detect a Deep Gene Research task envelope in a tool result.
   *
   * The DGR server answers `deep-gene-research` immediately with
   * { taskId, status: 'pending', taskUrl, progressUrl, ... } and runs the
   * research asynchronously (typically ~10 minutes); `get-task-status` returns
   * the same envelope while running. Idempotent resubmits and semantic cache
   * hits can also return an already-terminal envelope — still without the
   * result payload. Envelopes that DO carry the final payload
   * (result/finalReport) are not descriptors: they belong to the normal
   * report rendering path.
   */
  extractDgrTaskDescriptor(resultData, toolParameters = {}) {
    const value = resultData && typeof resultData === 'object' ? resultData : null;
    if (!value) return null;

    // Two envelope shapes carry an async Deep Gene Research task:
    //  - direct MCP tool results: { taskId, status, taskUrl, progressUrl, ... }
    //  - annotation workflow results (start_annotation_research /
    //    get_annotation_research_workflow): { success, workflow: { taskId,
    //    status, progress, step, geneSymbol, ... }, result, taskUrl, ... }
    const workflow =
      value.workflow && typeof value.workflow === 'object' && typeof value.workflow.taskId === 'string'
        ? value.workflow
        : null;
    const envelope = workflow || value;

    const taskId = typeof envelope.taskId === 'string' ? envelope.taskId.trim() : '';
    const status = typeof envelope.status === 'string' ? envelope.status.trim() : '';
    if (!taskId || !status) return null;

    // Envelopes that already carry the final payload are not descriptors: they
    // belong to the normal report/completion rendering path. For workflow
    // envelopes the payload is the sibling `result` field; the nested workflow
    // object itself only carries run state.
    const hasFinalPayload =
      workflow !== null ? value.result != null : value.result != null || typeof value.finalReport === 'string';
    if (hasFinalPayload) return null;

    return {
      taskId,
      status,
      kind: workflow ? 'workflow' : 'mcp',
      createdAt: envelope.createdAt || value.createdAt || new Date().toISOString(),
      geneSymbol:
        (typeof toolParameters?.geneSymbol === 'string' && toolParameters.geneSymbol) ||
        envelope.geneSymbol ||
        envelope.parameters?.geneSymbol ||
        value.geneSymbol ||
        'Unknown',
      taskUrl: value.taskUrl || envelope.taskUrl || '',
      progressUrl: value.progressUrl || envelope.progressUrl || '',
      progress: typeof envelope.progress === 'number' ? envelope.progress : null,
      currentStep: typeof envelope.step === 'string' ? envelope.step : null,
    };
  }

  /**
   * Resolve which MCP server owns an async research task tool. Tool-call
   * objects in the LLM loop do not carry serverId, so consult the tool
   * inventory and fall back to the well-known Deep Gene Research server id —
   * it is currently the only server with long-running queued tasks.
   */
  resolveDgrTaskServerId(toolName) {
    const inventoryHit = this.mcpServerManager
      ?.getAllAvailableTools?.()
      ?.find(tool => tool.name === toolName)?.serverId;
    // Deep Gene Research is currently the only server with long-running
    // queued tasks, so it is the safe fallback when the inventory has no hit.
    return inventoryHit || 'deep-gene-research';
  }

  /**
   * Scan executed tool results for queued Deep Gene Research tasks and start
   * programmatic status polling. Runs for every successful tool round so the
   * LLM never has to poll get-task-status itself (repeated identical calls are
   * blocked by policy anyway).
   */
  startDgrTaskPollingFromResults(successfulResults) {
    for (const result of successfulResults || []) {
      const descriptor = this.extractDgrTaskDescriptor(result?.result, result?.parameters);
      if (!descriptor) continue;
      this.startTaskPolling({
        taskId: descriptor.taskId,
        serverId: this.resolveDgrTaskServerId(result.tool),
        toolName: result.tool,
        kind: descriptor.kind,
        geneSymbol: descriptor.geneSymbol,
        status: descriptor.status,
        createdAt: descriptor.createdAt,
        taskUrl: descriptor.taskUrl,
        progressUrl: descriptor.progressUrl,
        progress: descriptor.progress ?? undefined,
        currentStep: descriptor.currentStep || undefined,
        lastUpdated: new Date().toISOString(),
        consecutiveErrors: 0,
        messageElement: null,
      });
    }
  }

  /**
   * Start polling for task status updates (idempotent per taskId)
   */
  startTaskPolling(taskInfo) {
    const existing = this.activeTasks.get(taskInfo.taskId);
    if (existing) {
      // A second start request only contributes fresher metadata (e.g. the
      // message element once the task-started bubble exists); never run two
      // polling intervals for the same task.
      if (taskInfo.messageElement) existing.messageElement = taskInfo.messageElement;
      if (taskInfo.geneSymbol && (!existing.geneSymbol || existing.geneSymbol === 'Unknown')) {
        existing.geneSymbol = taskInfo.geneSymbol;
      }
      this.services?.researchProgress?.upsert(existing);
      return;
    }

    // Add task to active tasks map
    this.activeTasks.set(taskInfo.taskId, taskInfo);

    // Create a dedicated, self-owned status bubble right away. Relying on the
    // LLM's final answer to contain the raw task id (and searching bubbles by
    // text) is brittle — if the model phrases its reply differently, progress
    // updates have nowhere to go.
    this.createTaskStatusBubble(taskInfo);

    // The bubble is pinned where the run was submitted and scrolls away as the
    // conversation continues, so mirror the run into the always-visible
    // progress dock above the composer.
    this.services?.researchProgress?.upsert(taskInfo);

    // Start the polling interval (Deep Gene Research documents 5 seconds)
    const pollInterval = setInterval(async () => {
      await this.checkTaskStatus(taskInfo);
    }, 5000);

    // Store the interval ID for cleanup
    taskInfo.pollInterval = pollInterval;

    // Check immediately so a fast task never waits a full interval.
    this.checkTaskStatus(taskInfo);

    console.log(`🔄 Started polling for task ${taskInfo.taskId} with 5-second interval`);
  }

  /**
   * Check task status and update the message
   */
  async checkTaskStatus(taskInfo) {
    // The task may have completed or been removed between scheduling and run.
    if (!this.activeTasks.has(taskInfo.taskId)) return;

    try {
      // Get the latest status from the server. Workflow-kind tasks go through
      // the annotation workflow service so its durable finalization (report
      // archival, proposal materialization) runs on completion.
      const statusResult =
        taskInfo.kind === 'workflow'
          ? await this.checkWorkflowTaskStatus(taskInfo)
          : await this.mcpServerManager.checkTaskStatus(taskInfo.serverId, taskInfo.taskId);
      if (!this.activeTasks.has(taskInfo.taskId)) return;

      console.log(`📊 Task ${taskInfo.taskId} status:`, statusResult);

      // Update task info
      taskInfo.consecutiveErrors = 0;
      taskInfo.lastStatusResult = statusResult;
      const oldStatus = taskInfo.status;
      taskInfo.status = statusResult.status || taskInfo.status;
      taskInfo.lastUpdated = new Date().toISOString();
      // DGR reports progress as a 0-100 integer and the current step as a
      // machine string (`step`); older servers used currentStep/totalSteps.
      if (typeof statusResult.progress === 'number') {
        taskInfo.progress = statusResult.progress;
      }
      taskInfo.currentStep = statusResult.step || statusResult.currentStep || taskInfo.currentStep;
      taskInfo.totalSteps = statusResult.totalSteps || taskInfo.totalSteps;
      taskInfo.error = statusResult.error || null;

      // Always refresh the always-visible dock, even when nothing changed —
      // it is what carries the ticking elapsed time.
      this.services?.researchProgress?.upsert(taskInfo);

      // If status has changed or we have new progress info, update the message
      // (always render after the first successful check).
      if (
        !taskInfo.hasRendered ||
        oldStatus !== taskInfo.status ||
        statusResult.progress !== undefined ||
        statusResult.step ||
        statusResult.currentStep ||
        statusResult.error
      ) {
        // Update the chat message
        this.updateTaskMessage(taskInfo, statusResult);
        taskInfo.hasRendered = true;
      }

      // If task is completed or failed, stop polling
      if (['completed', 'failed', 'cancelled'].includes(taskInfo.status)) {
        this.stopTaskPolling(taskInfo.taskId);

        // If completed, get the final results
        if (taskInfo.status === 'completed') {
          await this.getFinalTaskResults(taskInfo);
        } else {
          // Make sure the bubble reflects the terminal state even when no
          // progress fields changed on this poll.
          this.updateTaskMessage(taskInfo, statusResult);
          this.handleFailedResearchTask(taskInfo);
        }
      }
    } catch (error) {
      console.error(`❌ Error checking status for task ${taskInfo.taskId}:`, error);

      // Tolerate transient transport failures during long-running research;
      // only give up after several consecutive errors.
      taskInfo.consecutiveErrors = (taskInfo.consecutiveErrors || 0) + 1;
      if (taskInfo.consecutiveErrors < 5) return;

      // Update message with error
      taskInfo.status = 'error';
      taskInfo.error = error.message;
      this.updateTaskMessage(taskInfo, {
        status: 'error',
        error: error.message,
      });
      this.services?.researchProgress?.upsert(taskInfo);

      // Stop polling on persistent error
      this.stopTaskPolling(taskInfo.taskId);

      this.persistTaskOutcomeMessage(
        `❌ **Deep Gene Research task status updates failed**\n\n` +
          `📋 **Task ID**: \`${taskInfo.taskId}\`\n` +
          `❌ **Error**: ${error.message}\n\n` +
          `Status polling stopped after repeated errors — check the Deep Gene Research server connection and ask for a status refresh.`
      );
    }
  }

  /**
   * Poll an annotation-workflow research task through the workflow service.
   * The service persists the authoritative run state and performs durable
   * finalization (report archival, proposal materialization) on completion.
   * Returns the same normalized shape as mcpServerManager.checkTaskStatus.
   */
  async checkWorkflowTaskStatus(taskInfo) {
    const workflowService = this.services?.annotationWorkflow;
    if (!workflowService || typeof workflowService.getAnnotationResearchWorkflow !== 'function') {
      throw new Error('Annotation research workflow service is unavailable');
    }
    const response = await workflowService.getAnnotationResearchWorkflow({ taskId: taskInfo.taskId });
    const workflow = response?.workflow || {};
    if (workflow.geneSymbol && (!taskInfo.geneSymbol || taskInfo.geneSymbol === 'Unknown')) {
      taskInfo.geneSymbol = workflow.geneSymbol;
    }
    return {
      status: typeof workflow.status === 'string' ? workflow.status : 'pending',
      progress: typeof workflow.progress === 'number' ? workflow.progress : undefined,
      step: workflow.step || undefined,
      error: workflow.error || undefined,
      workflow,
      result: response?.result ?? null,
    };
  }

  /**
   * Create the dedicated status bubble for a tracked task and store a direct
   * element reference on taskInfo. The bubble content always contains the task
   * id so the legacy text-based lookup keeps working as a fallback.
   */
  createTaskStatusBubble(taskInfo) {
    try {
      const statusLabel = String(taskInfo.status || 'pending')
        .replace(/_/g, ' ')
        .toUpperCase();
      let content = `🧬 **Deep Gene Research Task — ${statusLabel}**\n\n`;
      if (taskInfo.geneSymbol && taskInfo.geneSymbol !== 'Unknown') {
        content += `🧫 **Gene**: ${taskInfo.geneSymbol}\n`;
      }
      content += `📋 **Task ID**: \`${taskInfo.taskId}\`\n`;
      content += `⏱️ **Started**: ${new Date(taskInfo.createdAt).toLocaleString()}\n`;
      if (typeof taskInfo.progress === 'number') content += `📈 **Progress**: ${taskInfo.progress}%\n`;
      if (taskInfo.currentStep) content += `🔢 **Current step**: \`${taskInfo.currentStep}\`\n`;
      content += `\n🔄 Research runs asynchronously (typically several minutes). This message updates automatically as the run progresses.`;

      this.addMessageToChat(content, 'assistant');

      // addMessageToChat appends synchronously — the new bubble is the last
      // message element in the chat container.
      const container = document.getElementById('chatMessages');
      const bubble = container?.lastElementChild;
      if (bubble && bubble.classList?.contains('message')) {
        taskInfo.messageElement = bubble;
      }
    } catch (error) {
      console.warn(`Failed to create status bubble for task ${taskInfo.taskId}:`, error);
    }
  }

  /**
   * Resolve the DOM element for a task's status bubble. Uses the stored
   * reference while it is connected, falls back to a text search for bubbles
   * that contain the task id (e.g. created before this fix), and recreates
   * the bubble when neither works so progress always has somewhere to render.
   */
  ensureTaskMessageElement(taskInfo) {
    if (taskInfo.messageElement && taskInfo.messageElement.isConnected) {
      return taskInfo.messageElement;
    }
    taskInfo.messageElement = null;

    // Chat bubbles render as div.message.(user|assistant)-message under
    // #chatMessages — the historical '.chat-message' selector matched
    // nothing, which is why task progress never updated on screen.
    const chatMessages = document.querySelectorAll('#chatMessages .message');
    for (const message of chatMessages) {
      if (message.textContent.includes(taskInfo.taskId)) {
        taskInfo.messageElement = message;
        return message;
      }
    }

    // No bubble exists yet (or it was cleared with the chat): create one.
    this.createTaskStatusBubble(taskInfo);
    return taskInfo.messageElement;
  }

  /**
   * Update the chat message with current task status
   */
  updateTaskMessage(taskInfo, statusResult) {
    const messageElement = this.ensureTaskMessageElement(taskInfo);
    if (!messageElement) {
      console.warn(`⚠️ Could not find or create a message element for task ${taskInfo.taskId}`);
      return;
    }

    const statusLabel = String(taskInfo.status || 'unknown')
      .replace(/_/g, ' ')
      .toUpperCase();
    let updatedContent = `🧬 **Deep Gene Research Task — ${statusLabel}**\n\n`;
    if (taskInfo.geneSymbol && taskInfo.geneSymbol !== 'Unknown') {
      updatedContent += `🧫 **Gene**: ${taskInfo.geneSymbol}\n`;
    }
    updatedContent += `📋 **Task ID**: \`${taskInfo.taskId}\`\n`;
    updatedContent += `⏱️ **Started**: ${new Date(taskInfo.createdAt).toLocaleString()}\n`;

    // Add progress information if available
    if (typeof taskInfo.progress === 'number' || taskInfo.currentStep) {
      updatedContent += `📈 **Progress**: ${typeof taskInfo.progress === 'number' ? `${taskInfo.progress}%` : 'N/A'}\n`;
      if (taskInfo.currentStep && taskInfo.totalSteps) {
        updatedContent += `🔢 **Step**: ${taskInfo.currentStep}/${taskInfo.totalSteps}\n`;
      } else if (taskInfo.currentStep) {
        updatedContent += `🔢 **Current step**: \`${taskInfo.currentStep}\`\n`;
      }
    }

    // Add error message if any
    if (taskInfo.error) {
      updatedContent += `\n❌ **Error**: ${taskInfo.error}\n`;
    }

    // Add final status messages
    if (taskInfo.status === 'completed') {
      updatedContent += `\n🎉 Research completed — fetching the final report…\n`;
    } else if (taskInfo.status === 'failed' || taskInfo.status === 'error') {
      updatedContent += `\n❌ Research failed. You can resubmit the request or check the Deep Gene Research server.\n`;
    } else if (taskInfo.status === 'cancelled') {
      updatedContent += `\n⏹️ Research was cancelled.\n`;
    } else {
      updatedContent += `\n🔄 Research typically takes several minutes — this message updates automatically as the run progresses.\n`;
    }

    // Update the message content. Prefer .message-text so the copy-action
    // button in .message-content is preserved.
    const messageText =
      taskInfo.messageElement.querySelector('.message-text') ||
      taskInfo.messageElement.querySelector('.message-content');
    if (messageText) {
      messageText.innerHTML = this.formatMessage(updatedContent);
    }

    console.log(`📝 Updated message for task ${taskInfo.taskId} with status: ${taskInfo.status}`);
  }

  /**
   * Get final task results and update the message
   */
  async getFinalTaskResults(taskInfo) {
    try {
      console.log(`📥 Getting final results for task ${taskInfo.taskId}`);

      // Get the full result payload. Workflow-kind tasks were finalized by the
      // workflow service on the completing poll, so their annotation-mode
      // projection is already on taskInfo.lastStatusResult; direct MCP tasks
      // fetch the full record (resultMode 'full') here.
      const isWorkflow = taskInfo.kind === 'workflow';
      const workflowState = isWorkflow ? taskInfo.lastStatusResult?.workflow || null : null;
      const payload = isWorkflow
        ? taskInfo.lastStatusResult?.result || null
        : await this.mcpServerManager.getTaskResult(taskInfo.serverId, taskInfo.taskId);

      console.log(`✅ Got final results for task ${taskInfo.taskId}:`, payload);

      const geneSymbol =
        (taskInfo.geneSymbol && taskInfo.geneSymbol !== 'Unknown' && taskInfo.geneSymbol) ||
        payload?.parameters?.geneSymbol ||
        payload?.geneResearch?.workflow?.geneIdentification?.geneSymbol ||
        'Unknown';

      const finalReport = typeof payload?.finalReport === 'string' ? payload.finalReport : '';
      const metadata = payload?.metadata || {};
      const proposal = payload?.annotationProposal || null;
      const download = payload?.download || {};

      // Direct MCP tasks: save the markdown report locally (the server's
      // download links live in process memory and expire after 24 h) and
      // archive the full result in the main-process artifact store. Workflow
      // tasks already archive the full report as a gene attachment during the
      // completing poll, and their annotation projection carries no report
      // text to save.
      let savedFileName = null;
      if (!isWorkflow && finalReport.trim()) {
        try {
          const saver = window.electronAPI?.saveGeneResearchReport;
          if (saver) {
            const saveResult = await saver(geneSymbol, finalReport, {
              taskId: taskInfo.taskId || null,
              genomePath: this.app?.loadedGenomePath || this.genomeBrowser?.loadedGenomePath || null,
            });
            if (saveResult?.success) savedFileName = saveResult.fileName || null;
          }
        } catch (saveError) {
          console.warn('Deep Gene Research report save failed:', saveError);
        }
      }
      if (!isWorkflow) {
        try {
          const archiver = window.electronAPI?.archiveDgrTaskResult;
          if (typeof archiver === 'function') await archiver({ taskId: taskInfo.taskId });
        } catch (archiveError) {
          console.warn('Deep Gene Research artifact archival failed:', archiveError);
        }
      }

      let content = `✅ **Deep Gene Research Complete: ${geneSymbol}**\n\n`;
      content += `📋 **Task ID**: \`${taskInfo.taskId}\`\n`;
      if (payload?.title) content += `📄 **Title**: ${payload.title}\n`;
      if (typeof metadata.confidence === 'number') {
        content += `🎯 **Confidence**: ${(metadata.confidence * 100).toFixed(0)}%\n`;
      }
      if (typeof metadata.researchTime === 'number') {
        content += `⏱️ **Research time**: ${(metadata.researchTime / 1000 / 60).toFixed(1)} min\n`;
      }
      const sourceCount = metadata.sourceCoverage?.uniqueSourceCount || payload?.sources?.length || 0;
      if (sourceCount) content += `📚 **Sources**: ${sourceCount}\n`;

      const reportUrl = download.reportUrl
        ? this.mcpServerManager.resolveServerUrl(taskInfo.serverId, download.reportUrl)
        : '';
      const detailsUrl = download.detailsUrl
        ? this.mcpServerManager.resolveServerUrl(taskInfo.serverId, download.detailsUrl)
        : '';
      if (reportUrl || detailsUrl) {
        content += `\n📥 **Downloads** (server links expire after 24 h)\n\n`;
        if (reportUrl) content += `- [Research report (Markdown)](${reportUrl})\n`;
        if (detailsUrl) content += `- [Detailed research data — workflow, sources, metadata (JSON)](${detailsUrl})\n`;
      }
      if (savedFileName) {
        content += `\n💾 Report saved locally to \`reports/${savedFileName}\`\n`;
      }

      if (proposal) {
        content += `\n🧩 **CodeXomics Annotation Proposal**\n\n`;
        if (proposal.status) content += `- **Status**: \`${proposal.status}\`\n`;
        if (typeof proposal.confidence === 'number') {
          content += `- **Confidence**: ${(proposal.confidence * 100).toFixed(0)}%\n`;
        }
        const termLists = [
          ['EC', proposal.ecNumbers],
          ['GO', proposal.goTerms],
          ['KO', proposal.koTerms],
          ['Pathway', proposal.pathwayTerms],
        ];
        for (const [label, terms] of termLists) {
          if (Array.isArray(terms) && terms.length) content += `- **${label}**: ${terms.join(', ')}\n`;
        }
        const updateFields = proposal.updates ? Object.keys(proposal.updates) : [];
        if (updateFields.length) content += `- **Proposed updates**: ${updateFields.join(', ')}\n`;
        const operationCount = Array.isArray(proposal.operations) ? proposal.operations.length : 0;
        if (operationCount) content += `- **Operations**: ${operationCount}\n`;
        if (!isWorkflow) {
          content +=
            `\nThe full proposal JSON is in the detailed research data` + (detailsUrl ? ' download above' : '') + `.\n`;
          // Materialize the proposal now instead of leaving the curator to run
          // create_annotation_changeset by hand.
          content += await this.autoCreateResearchChangeSet(taskInfo, { geneSymbol, payload, proposal });
        }
      }

      if (isWorkflow && workflowState) {
        if (workflowState.reportAttachment) {
          content += `\n🧬 The full report has been archived as a gene attachment for ${geneSymbol} (see the gene's Attachments tab).\n`;
        }
        if (workflowState.changeSetId) {
          content +=
            `\n📋 **Annotation ChangeSet**: \`${workflowState.changeSetId}\`` +
            (workflowState.changeSetStatus ? ` (${workflowState.changeSetStatus})` : '') +
            ` — review it with \`get_annotation_changeset\` and merge it with \`apply_annotation_changeset\`.\n`;
        } else if (workflowState.proposalReason) {
          content += `\n📋 **Annotation proposal**: ${workflowState.proposalReason}\n`;
        }
      }

      if (finalReport.trim()) {
        const preview = finalReport.length > 1200 ? `${finalReport.substring(0, 1200)}…` : finalReport;
        content += `\n<details><summary>📄 Report preview</summary>\n\n<pre>${this.escapeHtml(preview)}</pre>\n\n</details>\n`;
      }

      // Update the tracked bubble in place, and persist the outcome so later
      // turns see the deliverables in the conversation history. When no
      // task bubble can be resolved at all, post the completion as a new
      // visible assistant message instead.
      const messageElement = this.ensureTaskMessageElement(taskInfo);
      const messageText = messageElement
        ? messageElement.querySelector('.message-text') || messageElement.querySelector('.message-content')
        : null;
      if (messageText) {
        messageText.innerHTML = this.formatMessage(content);
        this.persistTaskOutcomeMessage(content);
      } else {
        this.addMessageToChat(content, 'assistant');
      }
    } catch (error) {
      console.error(`❌ Error getting final results for task ${taskInfo.taskId}:`, error);

      // Update message with error
      const failedElement = this.ensureTaskMessageElement(taskInfo);
      if (failedElement) {
        const messageText =
          failedElement.querySelector('.message-text') || failedElement.querySelector('.message-content');
        if (messageText) {
          messageText.innerHTML += this.formatMessage(`\n\n❌ **Error retrieving final results**: ${error.message}`);
        }
      }
    }
  }

  /**
   * Materialize a completed direct Deep Gene Research proposal as a reviewable
   * annotation ChangeSet.
   *
   * Workflow-kind runs (start_annotation_research) are finalized by
   * AnnotationResearchWorkflowService, which archives the report and creates
   * the ChangeSet itself. A direct `deep-gene-research` call has no durable
   * workflow record, so its proposal used to stop at a chat message asking the
   * curator to run `create_annotation_changeset` by hand — the research
   * finished and then nothing happened. This runs that step automatically.
   *
   * The ChangeSet is created `awaiting_approval` and is never applied: curator
   * approval still gates every genome mutation, and a proposal DGR could not
   * ground (or one whose provenance chain is incomplete) is reported rather
   * than forced through.
   *
   * @param {object} taskInfo - the tracked task record
   * @param {{geneSymbol: string, payload: object, proposal: object}} context
   * @returns {Promise<string>} markdown describing the outcome
   */
  async autoCreateResearchChangeSet(taskInfo, { geneSymbol, payload, proposal }) {
    const label = '\n📋 **Annotation ChangeSet**: ';
    const annotationService = this.services?.annotation;
    if (typeof annotationService?.mergeGeneResearchReport !== 'function') {
      return `${label}not created — the annotation service is unavailable.\n`;
    }

    // DGR marks a run it could not ground in evidence, or could not bind to an
    // exact genome feature. Turning either into a ChangeSet would propose
    // unevidenced or mistargeted edits.
    const draftStatus = String(proposal?.status || '');
    if (['draft_requires_evidence', 'draft_requires_target'].includes(draftStatus)) {
      const reason =
        draftStatus === 'draft_requires_evidence'
          ? 'the research found no evidence-backed claims that are safe to propose'
          : 'the research could not bind its proposal to an exact genome target';
      return `${label}not created — ${reason} (\`${draftStatus}\`).\n`;
    }

    if (!this.app?.currentAnnotations) {
      return `${label}not created — no genome annotations are loaded. Load the genome and merge the report with \`merge_gene_research_report\`.\n`;
    }

    // A completed task can reach this path more than once (a resubmitted
    // descriptor, a restarted session). A fixed idempotency key cannot dedupe
    // it: the merge stamps the proposal with the current time, so the second
    // request hashes differently and is rejected as a conflicting reuse of the
    // key. Look the run up in the ledger instead.
    const existing = await this.findResearchChangeSet(taskInfo.taskId);
    if (existing) return this.describeResearchChangeSet(label, existing, true);

    try {
      const result = await annotationService.mergeGeneResearchReport({
        // 'Unknown' is the placeholder for a run whose gene could not be read
        // back; omitting it lets the merge fall back to the selected gene
        // rather than searching the annotations for the literal word.
        identifier: geneSymbol && geneSymbol !== 'Unknown' ? geneSymbol : undefined,
        report: payload,
        annotationProposal: proposal,
        researchRun: taskInfo.taskId,
        principal: 'deep-gene-research',
      });

      const changeSet = result?.changeSet;
      if (!changeSet?.id) {
        return `${label}not created — the annotation service returned no ChangeSet.\n`;
      }
      return this.describeResearchChangeSet(label, changeSet, result.duplicate === true);
    } catch (error) {
      const noEffectiveChanges = window.AnnotationChangeSetService?.NO_EFFECTIVE_CHANGES;
      if (noEffectiveChanges && error?.code === noEffectiveChanges) {
        return `${label}not needed — ${geneSymbol} already carries everything this research proposed.\n`;
      }
      console.warn(`Automatic ChangeSet creation failed for task ${taskInfo.taskId}:`, error);
      return (
        `${label}not created — ${error.message}\n` +
        `\nA target-bound run (\`start_annotation_research\`) archives its report and creates the ChangeSet with full provenance.\n`
      );
    }
  }

  /**
   * Find the ChangeSet an earlier pass already created for a research task.
   * @param {string} taskId
   * @returns {Promise<object|null>}
   */
  async findResearchChangeSet(taskId) {
    const annotationService = this.services?.annotation;
    if (!taskId || typeof annotationService?.listAnnotationChangesets !== 'function') return null;
    try {
      const listed = await annotationService.listAnnotationChangesets({ limit: 1000 });
      return (listed?.changeSets || []).find(changeSet => changeSet?.researchRun === taskId) || null;
    } catch (error) {
      // A ledger that cannot be read is not a reason to skip the proposal;
      // creation below reports its own failure if the ledger is truly broken.
      console.warn(`Could not check for an existing ChangeSet for research task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Render the chat summary for an auto-created research ChangeSet.
   * @param {string} label
   * @param {object} changeSet
   * @param {boolean} existed - true when an earlier pass created it
   * @returns {string}
   */
  describeResearchChangeSet(label, changeSet, existed) {
    const status = changeSet.status ? ` (${changeSet.status})` : '';
    const duplicate = existed ? ' — already created for this research run' : '';
    // A freshly created ChangeSet carries full operations; the ledger listing
    // projects them down to the qualifier names in `fields`.
    const fields = Array.isArray(changeSet.operations)
      ? [...new Set(changeSet.operations.map(operation => operation.field).filter(Boolean))]
      : (changeSet.fields || []).filter(Boolean);
    return (
      `${label}\`${changeSet.id}\`${status}${duplicate}\n` +
      (fields.length ? `- **Qualifiers**: ${fields.join(', ')}\n` : '') +
      (changeSet.riskLevel ? `- **Risk**: ${changeSet.riskLevel}\n` : '') +
      `\nIt has **not** been applied. Review it with \`get_annotation_changeset\`, approve it in the Review panel or with ` +
      `\`request_annotation_approval\`, then commit it with \`apply_annotation_changeset\`. ` +
      `Do NOT call \`create_annotation_changeset\` or \`merge_gene_research_report\` for this run — the ChangeSet already exists.\n`
    );
  }

  /**
   * Record a failed/cancelled research task so later turns know the outcome.
   */
  handleFailedResearchTask(taskInfo) {
    const geneText = taskInfo.geneSymbol && taskInfo.geneSymbol !== 'Unknown' ? ` for ${taskInfo.geneSymbol}` : '';
    const content =
      `❌ **Deep Gene Research${geneText} ${taskInfo.status === 'cancelled' ? 'was cancelled' : 'failed'}**\n\n` +
      `📋 **Task ID**: \`${taskInfo.taskId}\`\n` +
      (taskInfo.error ? `❌ **Error**: ${taskInfo.error}\n` : '');
    if (this.ensureTaskMessageElement(taskInfo)) {
      // The tracked bubble already shows the terminal state.
      this.persistTaskOutcomeMessage(content);
    } else {
      this.addMessageToChat(content, 'assistant');
    }
  }

  /**
   * Persist a task outcome as an assistant chat message without rendering a
   * second bubble — the tracked task bubble already shows the same content.
   * Persisting keeps the result in the conversation history the LLM sees on
   * later turns.
   */
  persistTaskOutcomeMessage(content) {
    try {
      const timestamp = new Date().toISOString();
      this.configManager.addChatMessage(content, 'assistant', timestamp);
      this.addToEvolutionData({
        type: 'message',
        timestamp,
        sender: 'assistant',
        content,
        metadata: { source: 'dgr_task_outcome', visible: true },
      });
    } catch (error) {
      console.warn('Failed to persist research task outcome message:', error);
    }
  }

  /**
   * Download a task report in the specified format
   */
  async downloadTaskReport(taskId, format = 'markdown') {
    try {
      // Get the task info
      const taskInfo = this.activeTasks.get(taskId);
      if (!taskInfo) {
        throw new Error(`Task ${taskId} not found`);
      }

      console.log(`📥 Downloading ${format} report for task ${taskId}`);

      // Download the report from the server
      const downloadResult = await this.mcpServerManager.downloadTaskReport(taskInfo.serverId, taskId, format);

      // Create a download link and trigger it
      const blobUrl = URL.createObjectURL(downloadResult.blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Revoke the blob URL after download
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 1000);

      console.log(`✅ Report downloaded successfully: ${downloadResult.filename}`);
    } catch (error) {
      console.error(`❌ Error downloading report for task ${taskId}:`, error);
      alert(`Failed to download report: ${error.message}`);
    }
  }

  /**
   * Stop polling for a task
   */
  stopTaskPolling(taskId) {
    const taskInfo = this.activeTasks.get(taskId);
    if (taskInfo) {
      // Clear the polling interval
      clearInterval(taskInfo.pollInterval);

      // Remove from active tasks map
      this.activeTasks.delete(taskId);

      console.log(`⏹️ Stopped polling for task ${taskId}`);
    }
  }

  /**
   * Get detailed current state information for system prompts
   */
  getDetailedCurrentState(context) {
    const state = context.genomeBrowser.currentState;
    const currentPosition = this.toExternalGenomePosition(state.currentPosition);
    const tracks = this.getVisibleTracks();
    const mcpServers = this.mcpServerManager.getServerStatus();
    const connectedServers = mcpServers.filter(s => s.connected);

    const detailedState = `GENOME BROWSER CURRENT STATE:

NAVIGATION & POSITION:
- Current Chromosome: ${state.currentChromosome || 'None'}
- Current Position: ${currentPosition ? `${currentPosition.start}-${currentPosition.end}` : 'None'}
- Position Range: ${currentPosition ? `${(currentPosition.end - currentPosition.start + 1).toLocaleString()} bp` : 'N/A'}
- Sequence Length: ${state.sequenceLength ? state.sequenceLength.toLocaleString() : 'Unknown'} bp

DATA STATUS:
- Loaded Files: ${state.loadedFiles.length} file(s)
- Annotations Count: ${state.annotationsCount || 0}
- User-defined Features: ${state.userDefinedFeaturesCount || 0}
- Visible Tracks: ${tracks.length > 0 ? tracks.join(', ') : 'None'}

SYSTEM STATUS:
- MCP Servers Connected: ${connectedServers.length}${connectedServers.length > 0 ? ` (${connectedServers.map(s => s.name).join(', ')})` : ''}
- Plugin System: ${this.pluginFunctionCallsIntegrator ? 'Active' : 'Inactive'}
- MicrobeGenomics Functions: ${this.MicrobeFns ? 'Available' : 'Not Available'}

TOOL AVAILABILITY:
- Total Tools: ${context.genomeBrowser.toolSources.total}
- Local Tools: ${context.genomeBrowser.toolSources.local}
- Plugin Tools: ${context.genomeBrowser.toolSources.plugins}
- MCP Tools: ${context.genomeBrowser.toolSources.mcp}`;

    return detailedState;
  }

  /**
   * Get comprehensive tools information for system prompts
   */
  getAllToolsDetailed(context) {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.getAllToolsDetailed(context);
  }

  /**
   * Get detailed MicrobeGenomics Functions information
   */
  getMicrobeGenomicsFunctionsDetailed() {
    if (!this.MicrobeFns) {
      return 'MicrobeGenomics Functions: Not Available';
    }

    try {
      const categories = this.MicrobeFns.getFunctionCategories();
      const examples = this.MicrobeFns.getUsageExamples();

      let info = `MicrobeGenomics Functions: Available with ${Object.keys(categories).length} categories\n\n`;

      info += 'CATEGORIES:\n';
      Object.entries(categories).forEach(([category, categoryInfo]) => {
        info += `- ${category}: ${categoryInfo.description} (${categoryInfo.functions.length} functions)\n`;
      });

      info += '\nUSAGE EXAMPLES:\n';
      examples.forEach((example, index) => {
        info += `${index + 1}. ${example.task}\n`;
      });

      return info;
    } catch (error) {
      return 'MicrobeGenomics Functions: Available but details unavailable';
    }
  }

  /**
   * Get core tools organized by category for streamlined prompts
   */
  getCoreToolsByCategory() {
    const categories = {
      'SEARCH & NAVIGATION': [
        'find_gene_by_name',
        'search_features',
        'jump_to_gene',
        'navigate_to_position',
        'search_by_position',
        'open_new_tab',
        'zoom_in',
        'zoom_out',
        'save_view_state',
        'restore_view_state',
      ],
      'SYSTEM STATUS': [
        'get_genome_info',
        'check_genomics_environment',
        'get_file_info',
        'get_current_state',
        'get_chromosome_list',
        'get_selected_gene',
        'select_gene',
        'select_sequence_region',
        'get_current_region_details',
        'get_sequence_selection',
        'list_genome_windows',
        'switch_active_window',
      ],
      'SEQUENCE ANALYSIS': [
        'get_coding_sequence',
        'get_multiple_coding_sequences',
        'get_sequence',
        'translate_dna',
        'reverse_complement',
        'compute_gc',
      ],
      'GENOMIC FEATURES': ['predict_promoter', 'predict_rbs', 'search_sequence_motif', 'find_restriction_sites'],
      'PROTEIN STRUCTURE': [
        'search_pdb_structures',
        'open_protein_viewer',
        'fetch_protein_structure',
        'search_alphafold_structures',
        'fetch_alphafold_structure',
      ],
      'DATABASE INTEGRATION': [
        'search_uniprot_database',
        'advanced_uniprot_search',
        'get_uniprot_entry',
        'analyze_interpro_domains',
        'search_interpro_entry',
        'get_interpro_entry_details',
      ],
      'DATA EXPORT': [
        'export_fasta_sequence',
        'export_genbank_format',
        'export_cds_fasta',
        'export_protein_fasta',
        'export_gff_annotations',
        'export_bed_format',
        'export_current_view_fasta',
        'capture_screenshot',
        'open_image_file',
      ],
      'BLAST & SIMILARITY': [
        'blast_search',
        'advanced_blast_search',
        'batch_blast_search',
        'blast_sequence_from_region',
      ],
      'PATHWAYS & NETWORKS': ['show_metabolic_pathway', 'find_pathway_genes', 'analyze_interpro_domains'],
      'SEQUENCE EDITING': [
        'copy_sequence',
        'cut_sequence',
        'paste_sequence',
        'delete_sequence',
        'insert_sequence',
        'replace_sequence',
        'execute_actions',
        'get_action_list',
        'show_action_list',
      ],
      'TRACK SETTINGS': [
        'get_track_settings',
        'set_track_settings',
        'get_all_track_settings',
        'reset_track_settings',
        'get_track_settings_schema',
        'batch_set_track_settings',
      ],
      'PRIMER DESIGN & PCR': [
        'calculate_primer_properties',
        'design_primers',
        'find_primer_binding_sites',
        'save_primer',
        'list_primers',
        'delete_primers',
        'add_primer_annotation',
        'list_primer_annotations',
        'clear_primer_annotations',
      ],
      'SYSTEM & FILE MANAGEMENT': [
        'set_working_directory',
        'list_available_tools',
        'download_internet_file',
        'toggle_settings_modal',
        'toggle_chatbox',
        'set_chatbox_layout',
        'set_chatbox_minimized',
        'toggle_sidebar',
        'toggle_sidebar_panel',
        'toggle_top_banner',
      ],
    };

    // Add plugin tool categories dynamically
    const pluginCategories = this.getPluginToolCategories();
    const allCategories = { ...categories, ...pluginCategories };

    return Object.entries(allCategories)
      .map(([category, tools]) => `${category}: ${tools.join(', ')}`)
      .join('\n');
  }

  /**
   * Get plugin tool categories from plugin manager
   */
  getPluginToolCategories() {
    if (!this.pluginManager || !this.pluginManager.getPluginToolCategories) {
      return {};
    }

    try {
      return this.pluginManager.getPluginToolCategories();
    } catch (error) {
      console.error('Error getting plugin tool categories:', error);
      return {};
    }
  }

  /**
   * Get optimized tool context for system prompts
   * Streamlined version with essential information only
   */
  getOptimizedToolContext() {
    const context = this.getCurrentContext();

    // Get MCP server information (simplified)
    const mcpServers = this.mcpServerManager.getServerStatus();
    const connectedServers = mcpServers.filter(s => s.connected);

    // Core tool categories for better organization
    const coreTools = this.getCoreToolsByCategory();

    // Get current genome info if available
    const genomeInfo = this.getGenomeInfoSummary();

    return `
CURRENT GENOME STATE:
- Chromosome: ${context.genomeBrowser.currentState.currentChromosome || 'None loaded'}
- Loaded chromosome/contig names (the only valid "chromosome" values): ${this.formatAvailableChromosomesForPrompt(
      context.genomeBrowser.currentState.availableChromosomes
    )}
- Position: ${JSON.stringify(context.genomeBrowser.currentState.currentPosition) || 'None'}
- Selected Gene: ${
      context.genomeBrowser.currentState.selectedGene
        ? `${context.genomeBrowser.currentState.selectedGene.geneName} (${context.genomeBrowser.currentState.selectedGene.locusTag})`
        : 'None'
    }
- Sequence Selection: ${
      context.genomeBrowser.currentState.sequenceSelection?.active
        ? `${context.genomeBrowser.currentState.sequenceSelection.start}-${context.genomeBrowser.currentState.sequenceSelection.end} (${context.genomeBrowser.currentState.sequenceSelection.length} bp)`
        : 'None'
    }
- Visible Tracks: ${context.genomeBrowser.currentState.visibleTracks.join(', ') || 'None'}
- Loaded Files: ${context.genomeBrowser.currentState.loadedFiles.length} files
- Sequence Length: ${context.genomeBrowser.currentState.sequenceLength?.toLocaleString() || 'Unknown'}
${genomeInfo ? `- Genome: ${genomeInfo}` : ''}

COORDINATE & NAMING RULES:
- Copy any "chromosome" argument verbatim from the loaded names above or from an earlier tool result.
  Names shown in tool examples (e.g. "chr1") are illustrations — never send one that is not loaded.
- Omit "chromosome" entirely to act on the chromosome currently displayed.
- Coordinates are 1-based base pairs; expand shorthand first ("2M" -> 2000000, "500kb" -> 500000).

AVAILABLE TOOLS: ${context.genomeBrowser.toolSources.total} total
- Local: ${context.genomeBrowser.toolSources.local}
- Genomics: Available (MicrobeGenomicsFunctions)
- Plugins: ${context.genomeBrowser.toolSources.plugins}
- MCP: ${context.genomeBrowser.toolSources.mcp} ${connectedServers.length > 0 ? `(${connectedServers.map(s => s.name).join(', ')})` : '(disconnected)'}

CORE TOOL CATEGORIES:
${coreTools}
`;
  }

  /**
   * Get tool priority string for system message
   */
  getToolPriorityString() {
    // Get tool priority from settings
    const toolPriority = this.configManager.get('chatboxSettings.toolPriority', [
      'local',
      'genomics',
      'plugins',
      'mcp',
    ]);

    const priorityLabels = {
      local: 'Local Tools',
      genomics: 'Specialized Genomics Tools',
      plugins: 'Plugin Tools',
      mcp: 'MCP Server Tools',
    };

    const priorityList = toolPriority.map((type, index) => `${index + 1}) ${priorityLabels[type] || type}`).join('\n');

    return `TOOL SELECTION PRIORITY:\n${priorityList}`;
  }

  /**
   * Execute local tools (built-in browser functions)
   */
  async executeLocalTool(toolName, parameters) {
    const localTools = {
      // File Loading tools
      load_genome_file: () => this.loadGenomeFile(parameters),
      load_annotation_file: () => this.loadAnnotationFile(parameters),
      load_variant_file: () => this.loadVariantFile(parameters),
      load_reads_file: () => this.loadReadsFile(parameters),
      load_wig_tracks: () => this.loadWigTracks(parameters),
      load_operon_file: () => this.loadOperonFile(parameters),

      // Navigation and state tools
      navigate_to_position: () => this.navigateToPosition(parameters),
      open_new_tab: () => this.openNewTab(parameters),
      close_tab: () => this.closeTab(parameters),
      switch_to_tab: () => this.switchToTab(parameters),
      search_features: () => this.searchFeatures(parameters),
      get_current_state: () => this.getCurrentState(),
      get_current_region: () => this.executeMicrobeFunction('getCurrentRegion', parameters),
      jump_to_gene: () => this.executeMicrobeFunction('jumpToGene', parameters),
      scroll_left: () => this.executeMicrobeFunction('scrollLeft', parameters),
      scroll_right: () => this.executeMicrobeFunction('scrollRight', parameters),
      find_gene_by_name: () => this.executeMicrobeFunction('searchGeneByName', parameters),
      find_gene: () => this.executeMicrobeFunction('searchGeneByName', parameters), // legacy alias
      save_view_state: () => this.saveViewState(parameters),
      restore_view_state: () => this.restoreViewState(parameters),
      bookmark_position: () => this.bookmarkPosition(parameters),
      get_bookmarks: () => this.getBookmarks(parameters),

      // Sequence tools
      get_sequence: () => this.getSequence(parameters),
      calc_region_gc: () => this.calcRegionGc(parameters),
      translate_sequence: () => this.executeMicrobeFunction('translateDNA', parameters),
      calculate_gc_content: () => this.calculateGCContent(parameters),

      // Track and display tools
      toggle_track: () => this.toggleTrack(parameters),
      toggle_annotation_track: () => this.toggleAnnotationTrack(parameters),
      get_track_status: () => this.getTrackStatus(),

      // Annotation tools
      create_annotation: () => this.createAnnotation(parameters),
      get_gene_details: () => this.getGeneDetails(parameters),
      get_operons: () => this.getOperons(parameters),
      zoom_to_gene: () => this.zoomToGene(parameters),
      select_gene: () => this.selectGene(parameters),
      select_sequence_region: () => this.selectSequenceRegion(parameters),
      highlight_region: () => this.highlightRegion(parameters),
      remove_highlight: () => this.removeHighlight(parameters),
      list_highlights: () => this.listHighlights(parameters),
      clear_highlights: () => this.clearHighlights(parameters),
      get_nearby_features: () => this.getNearbyFeatures(parameters),
      find_intergenic_regions: () => this.findIntergenicRegions(parameters),

      // Analysis and external tools
      compute_gc: () => this.executeMicrobeFunction('computeGC', parameters),
      translate_dna: () => this.executeMicrobeFunction('translateDNA', parameters),
      reverse_complement: () => this.reverseComplement(parameters),
      codon_usage_analysis: () => this.codonUsageAnalysis(parameters),
      calculate_entropy: () => this.executeMicrobeFunction('calculateEntropy', parameters),
      calculate_molecular_weight: () => this.executeMicrobeFunction('calculateMolecularWeight', parameters),

      // Database tools
      analyze_interpro_domains: () => this.analyzeInterProDomains(parameters),
      search_uniprot_database: () => this.services.protein.searchUniProtDatabase(parameters),
      advanced_uniprot_search: () => this.services.protein.advancedUniprotSearch(parameters),
      get_uniprot_entry: () => this.getUniProtEntry(parameters),
      search_interpro_entry: () => this.services.protein.searchInterproEntry(parameters),
      get_interpro_entry_details: () => this.services.protein.getInterproEntryDetails(parameters),
      search_pattern: () => this.searchPattern(parameters),
      find_restriction_sites: () => this.services.restriction.findRestrictionSites(parameters),
      virtual_digest: () => this.services.restriction.virtualDigest(parameters),
      list_restriction_enzymes: () => this.services.restriction.listEnzymes(parameters),
      simulate_gel_electrophoresis: () => this.services.gel.simulateGelElectrophoresis(parameters),
      list_dna_markers: () => this.services.gel.listMarkers(parameters),
      get_dna_marker_info: () => this.services.gel.getMarkerInfo(parameters),
      search_sequence_motif: () => this.searchMotif(parameters),

      // AlphaFold and protein structure tools
      search_alphafold_structures: () => this.services.protein.searchAlphaFoldStructures(parameters),
      search_alphafold_by_gene: () => this.services.protein.searchAlphaFoldStructures(parameters), // Legacy alias
      alphafold_search: () => this.services.protein.searchAlphaFoldStructures(parameters), // Legacy alias
      alphafold_get_structure: () => this.fetchAlphaFoldStructure(parameters), // Legacy alias
      fetch_alphafold_structure: () => this.fetchAlphaFoldStructure(parameters),
      search_pdb_structures: () => this.services.protein.searchPdbStructures(parameters),
      fetch_protein_structure: () => this.fetchProteinStructure(parameters),
      search_alphafold_by_sequence: () => this.searchAlphaFoldBySequence(parameters),

      // Genome-wide analysis tools
      genome_codon_usage_analysis: () => this.genomeCodonUsageAnalysis(parameters),
      // Annotation CRUD tools (Phase 1 - OpenClaw integration)
      list_annotations: () => this.listAnnotations(parameters),
      assess_annotation_quality: () => this.assessAnnotationQuality(parameters),
      list_annotation_quality_candidates: () => this.listAnnotationQualityCandidates(parameters),
      list_annotation_research_history: () => this.listAnnotationResearchHistory(parameters),
      get_annotation: () => this.getAnnotation(parameters),
      update_annotation: () => this.updateAnnotation(parameters),
      merge_gene_research_report: () => this.mergeGeneResearchReport(parameters),
      delete_annotation: () => this.deleteAnnotation(parameters),
      search_annotations: () => this.searchAnnotations(parameters),
      bulk_update_annotations: () => this.bulkUpdateAnnotations(parameters),
      get_annotation_history: () => this.getAnnotationHistory(parameters),

      // Export tools - built-in equivalents for Export As dropdown menu
      export_fasta_sequence: () => this.exportFastaSequence(parameters),
      export_genbank_format: () => this.exportGenBankFormat(parameters),
      export_cds_fasta: () => this.exportCDSFasta(parameters),
      export_protein_fasta: () => this.exportProteinFasta(parameters),
      export_gff_annotations: () => this.exportGFFAnnotations(parameters),
      export_bed_format: () => this.exportBEDFormat(parameters),
      export_current_view_fasta: () => this.exportCurrentViewFasta(parameters),
      configure_export_settings: () => this.configureExportSettings(parameters),
      capture_screenshot: () => this.captureScreenshot(parameters),
      open_image_file: () => this.openImageFile(parameters),

      // System tools
      get_chromosome_list: () => this.getChromosomeList(),
      get_genome_info: () => this.getGenomeInfo(parameters),
      export_data: () => this.exportData(parameters),
      set_working_directory: () => this.setWorkingDirectory(parameters),
      list_available_tools: () => this.listAvailableTools(parameters),
      list_skills: () => this.listSkills(parameters),
      get_skill: () => this.getSkill(parameters),
      download_internet_file: () => this.downloadInternetFile(parameters),
      utility_download_internet_file: () => this.downloadInternetFile(parameters),
      utility_toggle_settings_modal: () => this.toggleSettingsModal(parameters),
      utility_toggle_chatbox: () => this.toggleChatBox(parameters),
      utility_set_chatbox_layout: () => this.setChatBoxLayout(parameters),
      utility_set_chatbox_minimized: () => this.setChatBoxMinimized(parameters),
      utility_toggle_sidebar: () => this.toggleSidebar(parameters),
      utility_toggle_sidebar_panel: () => this.toggleSidebarPanel(parameters),
      utility_toggle_top_banner: () => this.toggleTopBanner(parameters),

      // Action system tools (if available)
      copy_sequence: () => this.executeActionTool('copy_sequence', parameters),
      action_copy_sequence: () => this.executeActionTool('copy_sequence', parameters),
      cut_sequence: () => this.executeActionTool('cut_sequence', parameters),
      action_cut_sequence: () => this.executeActionTool('cut_sequence', parameters),
      paste_sequence: () => this.executeActionTool('paste_sequence', parameters),
      action_paste_sequence: () => this.executeActionTool('paste_sequence', parameters),
      delete_sequence: () => this.executeActionTool('delete_sequence', parameters),
      action_delete_sequence: () => this.executeActionTool('delete_sequence', parameters),
      insert_sequence: () => this.executeActionTool('insert_sequence', parameters),
      action_insert_sequence: () => this.executeActionTool('insert_sequence', parameters),
      replace_sequence: () => this.executeActionTool('replace_sequence', parameters),
      action_replace_sequence: () => this.executeActionTool('replace_sequence', parameters),
      execute_actions: () => this.executeActionTool('execute_actions', parameters),
      action_execute_actions: () => this.executeActionTool('execute_actions', parameters),
      get_action_list: () => this.executeActionTool('get_action_list', parameters),
      show_action_list: () => this.executeActionTool('show_action_list', parameters),
      action_get_action_list: () => this.executeActionTool('get_action_list', parameters),
      action_show_action_list: () => this.executeActionTool('show_action_list', parameters),
      clear_actions: () => this.executeActionTool('clear_actions', parameters),
      action_clear_actions: () => this.executeActionTool('clear_actions', parameters),
      get_clipboard_content: () => this.executeActionTool('get_clipboard_content', parameters),
      action_get_clipboard_content: () => this.executeActionTool('get_clipboard_content', parameters),

      // Track settings tools
      get_track_settings: () => this.getTrackSettings(parameters),
      set_track_settings: () => this.setTrackSettings(parameters),
      get_all_track_settings: () => this.getAllTrackSettings(parameters),
      reset_track_settings: () => this.resetTrackSettings(parameters),
      get_track_settings_schema: () => this.getTrackSettingsSchema(parameters),
      batch_set_track_settings: () => this.batchSetTrackSettings(parameters),

      // Primer tools are now handled directly by PrimerService at PRIORITY 2
      // in ToolExecutionService — no longer routed through executeLocalTool

      // View control tools
      zoom_in: () => this.zoomIn(parameters),
      zoom_out: () => this.zoomOut(parameters),
      pan_left: () => this.panLeft(parameters),
      pan_right: () => this.panRight(parameters),

      // Multi-window management tools (IPC-based, no MCP server required)
      list_genome_windows: () => this.listGenomeWindows(parameters),
      switch_active_window: () => this.switchActiveWindow(parameters),

      // Task management tools
      add_task: () => this.addTask(parameters),
      update_task: () => this.updateTask(parameters),
      list_tasks: () => this.listTasks(parameters),
      clear_tasks: () => this.clearTasks(parameters),

      // Settings modal tools
      toggle_settings_modal: () => this.toggleSettingsModal(parameters),
      toggle_chatbox: () => this.toggleChatBox(parameters),
      set_chatbox_layout: () => this.setChatBoxLayout(parameters),
      set_chatbox_minimized: () => this.setChatBoxMinimized(parameters),
      toggle_sidebar: () => this.toggleSidebar(parameters),
      toggle_sidebar_panel: () => this.toggleSidebarPanel(parameters),
      toggle_top_banner: () => this.toggleTopBanner(parameters),

      // Benchmark tools
      open_benchmark: () => this.openBenchmark(parameters),
      start_benchmark: () => this.startBenchmark(parameters),
      stop_benchmark: () => this.stopBenchmark(parameters),
      pause_benchmark: () => this.pauseBenchmark(parameters),
      resume_benchmark: () => this.resumeBenchmark(parameters),
      get_benchmark_results: () => this.getBenchmarkResults(parameters),
      get_benchmark_status: () => this.getBenchmarkStatus(parameters),
      export_benchmark_results: () => this.exportBenchmarkResults(parameters),

      // BLAST tools (fallback when BlastService/BlastChatManagerIntegration not available)
      blast_search: () => this.services.blast.blastSearch(parameters),
      blast_search_online: () => this.services.blast.blastSearchOnline(parameters),
      blast_search_local: () => this.services.blast.blastSearchLocal(parameters),
      blast_search_batch: () => this.services.blast.blastSearchBatch(parameters),
      blast_sequence_from_region: () => this.services.blast.blastSequenceFromRegion(parameters),
      blast_create_database: () => this.services.blast.blastCreateDatabase(parameters),
      blast_list_databases: () => this.services.blast.blastListDatabases(parameters),
      blast_delete_database: () => this.services.blast.blastDeleteDatabase(parameters),
      blast_create_db_from_genome: () => this.services.blast.blastCreateDbFromGenome(parameters),
      blast_create_protein_db_from_genome: () => this.services.blast.blastCreateProteinDbFromGenome(parameters),
      blast_create_quick_db_for_current_genome: () =>
        this.services.blast.blastCreateQuickDbForCurrentGenome(parameters),
      blast_filter_results: () => this.services.blast.blastFilterResults(parameters),
      blast_export_results: () => this.services.blast.blastExportResults(parameters),
      blast_detect_sequence_type: () => this.services.blast.blastDetectSequenceType(parameters),
      blast_validate_database: () => this.services.blast.blastValidateDatabase(parameters),
      blast_get_installation_status: () => this.services.blast.blastGetInstallationStatus(parameters),
    };

    if (localTools[toolName]) {
      try {
        const result = await localTools[toolName]();
        console.log(`✅ Local tool '${toolName}' executed successfully`);
        return result;
      } catch (error) {
        console.error(`❌ Local tool '${toolName}' execution failed:`, error);
        throw error;
      }
    }

    return undefined; // Tool not found in local tools
  }

  /**
   * Zoom in the current genome view
   */
  async zoomIn(parameters = {}) {
    const factor = parameters.factor || 2;
    if (!this.app.navigationManager) throw new Error('NavigationManager not available');
    const result = this.app.navigationManager.zoomIn(factor);
    if (result && result.success === false) {
      return { success: false, error: result.error || 'Zoom in failed', factor };
    }
    const state = this.getCurrentState();
    const appliedFactor = result?.factor || factor;
    return {
      success: true,
      factor: appliedFactor,
      message: `Zoomed in by ${appliedFactor}x`,
      newRange: state.viewingRegion,
    };
  }

  /**
   * Zoom out the current genome view
   */
  async zoomOut(parameters = {}) {
    const factor = parameters.factor || 2;
    if (!this.app.navigationManager) throw new Error('NavigationManager not available');
    const result = this.app.navigationManager.zoomOut(factor);
    // NavigationManager reports "no active chromosome or sequence loaded" as
    // success:false. Reporting that as a success made a no-op zoom look completed,
    // so the model kept re-issuing the call instead of surfacing the failure.
    if (result && result.success === false) {
      return { success: false, error: result.error || 'Zoom out failed', factor };
    }
    const state = this.getCurrentState();
    const appliedFactor = result?.factor || factor;
    return {
      success: true,
      factor: appliedFactor,
      message: `Zoomed out by ${appliedFactor}x`,
      newRange: state.viewingRegion,
    };
  }

  /**
   * Pan the view left
   */
  async panLeft(parameters = {}) {
    if (!this.app.navigationManager) throw new Error('NavigationManager not available');
    const amount = parameters.amount || null; // NavigationManager handles default
    this.app.navigationManager.navigatePrevious(amount);
    const state = this.getCurrentState();
    return { success: true, message: 'Panned left', newRange: state.viewingRegion };
  }

  /**
   * Pan the view right
   */
  async panRight(parameters = {}) {
    if (!this.app.navigationManager) throw new Error('NavigationManager not available');
    const amount = parameters.amount || null;
    this.app.navigationManager.navigateNext(amount);
    const state = this.getCurrentState();
    return { success: true, message: 'Panned right', newRange: state.viewingRegion };
  }

  /**
   * List all open genome browser windows via IPC to main process
   * Works without MCP server - directly queries the window registry
   */
  async listGenomeWindows(parameters = {}) {
    console.log(`[ChatManager] listGenomeWindows called`);
    console.log(`[ChatManager] this.app.windowId: ${this.app.windowId}`);
    try {
      const ipc =
        (typeof window !== 'undefined' && window.ipcRenderer) ||
        (typeof ipcRenderer !== 'undefined' ? ipcRenderer : null);
      if (!ipc?.invoke) {
        throw new Error('IPC bridge unavailable');
      }

      console.log(`[ChatManager] Calling ipc.invoke('list-genome-windows')`);
      const windows = await ipc.invoke('list-genome-windows');
      console.log(`[ChatManager] IPC returned ${windows.length} windows:`, windows);

      return {
        success: true,
        windowCount: windows.length,
        windows: windows,
        currentWindowId: this.app.windowId || null,
      };
    } catch (error) {
      console.error('[ChatManager] listGenomeWindows error:', error);
      return {
        success: false,
        error: error.message,
        windowCount: 0,
        windows: [],
      };
    }
  }

  /**
   * Switch focus to a specific genome browser window via IPC
   * Works without MCP server - directly sends focus command to main process
   */
  async switchActiveWindow(parameters = {}) {
    const { windowId } = parameters;
    if (!windowId) {
      return { success: false, error: 'windowId parameter is required. Use list_genome_windows to see available IDs.' };
    }

    try {
      const ipc =
        (typeof window !== 'undefined' && window.ipcRenderer) ||
        (typeof ipcRenderer !== 'undefined' ? ipcRenderer : null);
      if (!ipc?.invoke) {
        throw new Error('IPC bridge unavailable');
      }

      const result = await ipc.invoke('focus-genome-window', windowId);
      return result;
    } catch (error) {
      console.error('[ChatManager] switchActiveWindow error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Toggle settings modal open/close state
   * Provides a unified interface for opening, closing, or toggling any settings modal
   */
  async toggleSettingsModal(parameters = {}) {
    const { modal_name: modalName, action = 'toggle' } = parameters;

    if (!modalName) {
      return {
        success: false,
        error:
          'modal_name parameter is required. Supported: llm_config, chatbox_settings, general_settings, track_settings, mcp_settings, multi_agent_settings, tab_settings, search_settings, gene_detail_settings, external_tools, plugin_management, action_list, literature_settings',
      };
    }

    // Map modal names to their DOM IDs, open functions, and close functions
    const modalRegistry = {
      llm_config: {
        id: 'llmConfigModal',
        open: () => {
          if (window.llmConfigManager) {
            window.llmConfigManager.showConfigModal();
          } else {
            const modal = document.getElementById('llmConfigModal');
            if (modal) modal.classList.add('show');
          }
        },
        close: () => {
          if (window.llmConfigManager) {
            window.llmConfigManager.hideConfigModal();
          } else {
            const modal = document.getElementById('llmConfigModal');
            if (modal) modal.classList.remove('show');
          }
        },
      },
      chatbox_settings: {
        id: 'chatboxSettingsModal',
        open: () => {
          if (window.chatBoxSettingsManager) {
            window.chatBoxSettingsManager.showSettingsModal();
          }
        },
        close: () => {
          const modal = document.getElementById('chatboxSettingsModal');
          if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
          }
        },
      },
      general_settings: {
        id: 'generalSettingsModal',
        open: () => {
          if (window.genomeBrowser && window.genomeBrowser.showGeneralSettingsModal) {
            window.genomeBrowser.showGeneralSettingsModal();
          } else {
            const modal = document.getElementById('generalSettingsModal');
            if (modal) modal.classList.add('show');
          }
        },
        close: () => {
          const modal = document.getElementById('generalSettingsModal');
          if (modal) modal.classList.remove('show');
        },
      },
      track_settings: {
        id: 'trackSettingsModal',
        open: () => {
          if (
            window.genomeBrowser &&
            window.genomeBrowser.trackRenderer &&
            window.genomeBrowser.trackRenderer.openTrackSettings
          ) {
            window.genomeBrowser.trackRenderer.openTrackSettings('genes');
          }
        },
        close: () => {
          const modal = document.getElementById('trackSettingsModal');
          if (modal) modal.classList.remove('show');
        },
      },
      mcp_settings: {
        id: 'mcpSettingsModal',
        open: () => {
          if (window.genomeBrowser && window.genomeBrowser.showMCPSettingsModal) {
            window.genomeBrowser.showMCPSettingsModal();
          } else {
            const modal = document.getElementById('mcpSettingsModal');
            if (modal) modal.classList.add('show');
          }
        },
        close: () => {
          const modal = document.getElementById('mcpSettingsModal');
          if (modal) modal.classList.remove('show');
        },
      },
      multi_agent_settings: {
        id: 'multiAgentSettingsModal',
        open: () => {
          if (window.multiAgentSettingsManager) {
            window.multiAgentSettingsManager.showModal();
          } else {
            const modal = document.getElementById('multiAgentSettingsModal');
            if (modal) modal.classList.add('show');
          }
        },
        close: () => {
          if (window.multiAgentSettingsManager) {
            window.multiAgentSettingsManager.hideModal();
          } else {
            const modal = document.getElementById('multiAgentSettingsModal');
            if (modal) modal.classList.remove('show');
          }
        },
      },
      tab_settings: {
        id: 'tabSettingsModal',
        open: () => {
          if (
            window.genomeBrowser &&
            window.genomeBrowser.tabManager &&
            window.genomeBrowser.tabManager.openTabSettingsModal
          ) {
            window.genomeBrowser.tabManager.openTabSettingsModal();
          } else {
            const modal = document.getElementById('tabSettingsModal');
            if (modal) modal.style.display = 'flex';
          }
        },
        close: () => {
          if (
            window.genomeBrowser &&
            window.genomeBrowser.tabManager &&
            window.genomeBrowser.tabManager.closeTabSettingsModal
          ) {
            window.genomeBrowser.tabManager.closeTabSettingsModal();
          } else {
            const modal = document.getElementById('tabSettingsModal');
            if (modal) modal.style.display = 'none';
          }
        },
      },
      search_settings: {
        id: 'searchSettingsModal',
        open: () => {
          if (
            window.genomeBrowser &&
            window.genomeBrowser.navigationManager &&
            window.genomeBrowser.navigationManager.showSearchSettingsModal
          ) {
            window.genomeBrowser.navigationManager.showSearchSettingsModal();
          } else {
            const modal = document.getElementById('searchSettingsModal');
            if (modal) modal.classList.add('show');
          }
        },
        close: () => {
          const modal = document.getElementById('searchSettingsModal');
          if (modal) modal.classList.remove('show');
        },
      },
      gene_detail_settings: {
        id: 'geneDetailSettingsModal',
        open: () => {
          if (window.genomeBrowser && window.genomeBrowser.showGeneDetailSettings) {
            window.genomeBrowser.showGeneDetailSettings();
          } else {
            const modal = document.getElementById('geneDetailSettingsModal');
            if (modal) modal.classList.add('show');
          }
        },
        close: () => {
          const modal = document.getElementById('geneDetailSettingsModal');
          if (modal) modal.classList.remove('show');
        },
      },
      external_tools: {
        id: 'externalToolsModal',
        open: () => {
          if (window.genomeBrowser && window.genomeBrowser.showExternalToolsModal) {
            window.genomeBrowser.showExternalToolsModal();
          } else {
            const modal = document.getElementById('externalToolsModal');
            if (modal) modal.classList.add('show');
          }
        },
        close: () => {
          const modal = document.getElementById('externalToolsModal');
          if (modal) modal.classList.remove('show');
        },
      },
      plugin_management: {
        id: 'pluginManagementModal',
        open: () => {
          if (window.pluginManagementUI && window.pluginManagementUI.showPluginModal) {
            window.pluginManagementUI.showPluginModal();
          } else {
            const modal = document.getElementById('pluginManagementModal');
            if (modal) {
              modal.style.display = '';
              if (window.modalDragManager) {
                window.modalDragManager.resetPosition('#pluginManagementModal');
              }
              modal.classList.add('show');
            }
          }
        },
        close: () => {
          if (window.pluginManagementUI && window.pluginManagementUI.hidePluginModal) {
            window.pluginManagementUI.hidePluginModal();
          } else {
            const modal = document.getElementById('pluginManagementModal');
            if (modal) {
              modal.classList.remove('show');
              modal.style.display = '';
            }
          }
        },
      },
      action_list: {
        id: 'actionListModal',
        open: () => {
          if (window.actionManager && window.actionManager.showActionList) {
            window.actionManager.showActionList();
          } else {
            const modal = document.getElementById('actionListModal');
            if (modal) modal.classList.add('show');
          }
        },
        close: () => {
          if (window.actionManager && window.actionManager.closeActionList) {
            window.actionManager.closeActionList();
          } else {
            const modal = document.getElementById('actionListModal');
            if (modal) modal.classList.remove('show');
          }
        },
      },
      literature_settings: {
        id: 'literatureSettingsModal',
        open: () => {
          if (window.literatureSettings && window.literatureSettings.showModal) {
            window.literatureSettings.showModal();
          }
        },
        close: () => {
          if (window.literatureSettings && window.literatureSettings.closeModal) {
            window.literatureSettings.closeModal();
          } else {
            const modal = document.getElementById('literatureSettingsModal');
            if (modal) modal.remove();
          }
        },
      },
    };

    const entry = modalRegistry[modalName];
    if (!entry) {
      return {
        success: false,
        error: `Unknown modal: '${modalName}'. Supported: ${Object.keys(modalRegistry).join(', ')}`,
      };
    }

    try {
      // Determine current state and action to perform
      const modal = document.getElementById(entry.id);
      const isOpen = modal
        ? modal.classList.contains('show') || modal.style.display === 'flex' || modal.style.display === 'block'
        : false;

      let effectiveAction = action;
      if (action === 'toggle') {
        effectiveAction = isOpen ? 'close' : 'open';
      }

      if (effectiveAction === 'open') {
        entry.open();
        return {
          success: true,
          message: `Opened ${modalName} settings modal`,
          modal_name: modalName,
          new_state: 'open',
        };
      } else if (effectiveAction === 'close') {
        entry.close();
        return {
          success: true,
          message: `Closed ${modalName} settings modal`,
          modal_name: modalName,
          new_state: 'closed',
        };
      } else {
        return {
          success: false,
          error: `Invalid action: '${action}'. Use 'open', 'close', or 'toggle'.`,
        };
      }
    } catch (error) {
      console.error(`[ChatManager] toggleSettingsModal error:`, error);
      return {
        success: false,
        error: error.message,
        modal_name: modalName,
      };
    }
  }

  /**
   * Show, hide, or toggle the ChatBox panel.
   */
  async toggleChatBox(parameters = {}) {
    const { action = 'toggle' } = parameters;
    const chatPanel = document.getElementById('llmChatPanel');

    if (!chatPanel) {
      return { success: false, error: 'ChatBox panel is not available' };
    }

    if (!['show', 'hide', 'toggle'].includes(action)) {
      return { success: false, error: `Invalid action: '${action}'. Use 'show', 'hide', or 'toggle'.` };
    }

    const isVisible = chatPanel.style.display !== 'none';
    const shouldShow = action === 'show' || (action === 'toggle' && !isVisible);

    if (shouldShow) {
      this.showChatBox();
    } else {
      this.hideChatBox();
    }

    return {
      success: true,
      message: `ChatBox ${shouldShow ? 'shown' : 'hidden'}`,
      new_state: shouldShow ? 'shown' : 'hidden',
    };
  }

  /**
   * Dock, float, or toggle the ChatBox layout.
   */
  async setChatBoxLayout(parameters = {}) {
    const { mode = 'toggle' } = parameters;
    const normalizedMode = String(mode).toLowerCase();
    const modeAliases = {
      dock: 'docked',
      docked: 'docked',
      undock: 'floating',
      undocked: 'floating',
      float: 'floating',
      floating: 'floating',
      toggle: 'toggle',
    };
    const effectiveMode = modeAliases[normalizedMode];

    if (!effectiveMode) {
      return { success: false, error: `Invalid mode: '${mode}'. Use 'docked', 'floating', or 'toggle'.` };
    }

    const chatPanel = document.getElementById('llmChatPanel');
    const dockContainer = document.getElementById('chatDockContainer');
    const dockSplitter = document.getElementById('chatDockSplitter');
    const appDiv = document.getElementById('app');

    if (!chatPanel) {
      return { success: false, error: 'ChatBox panel is not available' };
    }

    if (!dockContainer || !dockSplitter || !appDiv) {
      return { success: false, error: 'ChatBox dock layout controls are not available' };
    }

    const wasVisible = chatPanel.style.display !== 'none';
    const isDocked = this.isDocked || chatPanel.classList.contains('docked');
    const shouldDock = effectiveMode === 'toggle' ? !isDocked : effectiveMode === 'docked';

    if (shouldDock !== isDocked) {
      if (shouldDock) {
        this.dockChat();
      } else {
        this.undockChat();
      }

      if (!wasVisible) {
        this.setChatVisibility(false);
      }
    }

    const newState = shouldDock ? 'docked' : 'floating';
    return {
      success: true,
      message: `ChatBox layout set to ${newState}`,
      new_state: newState,
      minimized: chatPanel.classList.contains('minimized'),
      visible: wasVisible,
    };
  }

  /**
   * Minimize, restore, or toggle the ChatBox compact state.
   */
  async setChatBoxMinimized(parameters = {}) {
    const { action = 'toggle' } = parameters;
    const normalizedAction = String(action).toLowerCase();
    const actionAliases = {
      minimize: 'minimize',
      minimized: 'minimize',
      restore: 'restore',
      maximize: 'restore',
      expand: 'restore',
      unminimize: 'restore',
      toggle: 'toggle',
    };
    const effectiveAction = actionAliases[normalizedAction];

    if (!effectiveAction) {
      return { success: false, error: `Invalid action: '${action}'. Use 'minimize', 'restore', or 'toggle'.` };
    }

    const chatPanel = document.getElementById('llmChatPanel');
    if (!chatPanel) {
      return { success: false, error: 'ChatBox panel is not available' };
    }

    const isMinimized = chatPanel.classList.contains('minimized');
    const shouldMinimize = effectiveAction === 'toggle' ? !isMinimized : effectiveAction === 'minimize';

    if (shouldMinimize !== isMinimized) {
      this.toggleChatMinimize();
    }

    const newState = shouldMinimize ? 'minimized' : 'restored';
    return {
      success: true,
      message: `ChatBox ${newState}`,
      new_state: newState,
    };
  }

  /**
   * Expand, collapse, or toggle the genome browser Sidebar.
   */
  async toggleSidebar(parameters = {}) {
    const { action = 'toggle' } = parameters;
    const normalizedActions = {
      expand: false,
      show: false,
      collapse: true,
      hide: true,
    };

    if (!['expand', 'collapse', 'show', 'hide', 'toggle'].includes(action)) {
      return {
        success: false,
        error: `Invalid action: '${action}'. Use 'expand', 'collapse', or 'toggle'.`,
      };
    }

    const uiManager = this.app?.uiManager || window.genomeBrowser?.uiManager;
    const sidebar = document.getElementById('sidebar');
    if (!uiManager || typeof uiManager.setSidebarCollapsed !== 'function' || !sidebar) {
      return { success: false, error: 'Sidebar controls are not available' };
    }

    const isCollapsed = sidebar.classList.contains('collapsed') || sidebar.offsetWidth === 0;
    const shouldCollapse = action === 'toggle' ? !isCollapsed : normalizedActions[action];
    if (!uiManager.setSidebarCollapsed(shouldCollapse)) {
      return { success: false, error: 'Sidebar state could not be updated' };
    }

    return {
      success: true,
      message: `Sidebar ${shouldCollapse ? 'collapsed' : 'expanded'}`,
      new_state: shouldCollapse ? 'collapsed' : 'expanded',
    };
  }

  /**
   * Show, hide, or toggle a specific Sidebar panel.
   */
  async toggleSidebarPanel(parameters = {}) {
    const { panel_name: panelName, action = 'toggle' } = parameters;
    const normalizedAction = String(action).toLowerCase();
    const actionAliases = {
      show: 'show',
      open: 'show',
      hide: 'hide',
      close: 'hide',
      toggle: 'toggle',
    };
    const effectiveAction = actionAliases[normalizedAction];
    const panelKey = String(panelName || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const panelMap = {
      gene_details: { id: 'geneDetailsSection', label: 'gene details' },
      primer_details: { id: 'primerDetailsSection', label: 'primer details' },
      read_details: { id: 'readDetailsSection', label: 'read details' },
      variant_details: { id: 'variantDetailsSection', label: 'variant details' },
      search_results: { id: 'searchResultsSection', label: 'search results' },
      bookmarks: { id: 'bookmarksSection', label: 'bookmarks' },
      bookmark: { id: 'bookmarksSection', label: 'bookmarks', normalized: 'bookmarks' },
      operon: { id: 'operonsSection', label: 'operons', normalized: 'operons' },
      operons: { id: 'operonsSection', label: 'operons' },
      tracks: { id: 'tracksSection', label: 'tracks' },
      track: { id: 'tracksSection', label: 'tracks', normalized: 'tracks' },
      features: { id: 'featuresSection', label: 'features' },
      feature: { id: 'featuresSection', label: 'features', normalized: 'features' },
      file_info: { id: 'fileInfoSection', label: 'file info' },
      navigation: { id: 'navigationSection', label: 'navigation' },
      statistics: { id: 'statisticsSection', label: 'statistics' },
      stats: { id: 'statisticsSection', label: 'statistics', normalized: 'statistics' },
    };

    if (!panelMap[panelKey]) {
      return {
        success: false,
        error:
          "Invalid panel_name. Use one of: 'gene_details', 'primer_details', 'read_details', 'variant_details', 'search_results', 'bookmarks', 'operons', 'tracks', 'features', 'file_info', 'navigation', 'statistics'.",
      };
    }

    if (!effectiveAction) {
      return { success: false, error: `Invalid action: '${action}'. Use 'show', 'hide', or 'toggle'.` };
    }

    const uiManager = this.app?.uiManager || window.genomeBrowser?.uiManager;
    if (!uiManager || typeof uiManager.showPanel !== 'function' || typeof uiManager.closePanel !== 'function') {
      return { success: false, error: 'Sidebar panel controls are not available' };
    }

    const entry = panelMap[panelKey];
    const panel = document.getElementById(entry.id);
    if (!panel) {
      return { success: false, error: `Sidebar panel '${entry.label}' is not available` };
    }

    const computedDisplay =
      typeof window !== 'undefined' && window.getComputedStyle
        ? window.getComputedStyle(panel).display
        : panel.style.display;
    const isVisible = !panel.hidden && panel.style.display !== 'none' && computedDisplay !== 'none';
    const shouldShow = effectiveAction === 'toggle' ? !isVisible : effectiveAction === 'show';

    if (shouldShow !== isVisible) {
      if (shouldShow) {
        if (entry.id === 'bookmarksSection') {
          this.app?.bookmarkPanelUI?.refresh?.();
        }
        uiManager.showPanel(entry.id);
      } else {
        uiManager.closePanel(entry.id);
      }
    }

    const canonicalName = entry.normalized || panelKey;
    return {
      success: true,
      message: `Sidebar ${entry.label} panel ${shouldShow ? 'shown' : 'hidden'}`,
      panel_name: canonicalName,
      panel_id: entry.id,
      new_state: shouldShow ? 'shown' : 'hidden',
    };
  }

  /**
   * Expand, collapse, or toggle the top banner.
   */
  async toggleTopBanner(parameters = {}) {
    const { action = 'toggle' } = parameters;
    const normalizedActions = {
      expand: false,
      show: false,
      collapse: true,
      hide: true,
    };

    if (!['expand', 'collapse', 'show', 'hide', 'toggle'].includes(action)) {
      return {
        success: false,
        error: `Invalid action: '${action}'. Use 'expand', 'collapse', or 'toggle'.`,
      };
    }

    const tabManager = this.app?.tabManager || window.genomeBrowser?.tabManager;
    if (!tabManager || typeof tabManager.setBannerCollapsed !== 'function') {
      return { success: false, error: 'Top banner controls are not available' };
    }

    const shouldCollapse = action === 'toggle' ? !tabManager.bannerCollapsed : normalizedActions[action];
    if (!tabManager.setBannerCollapsed(shouldCollapse)) {
      return { success: false, error: 'Top banner state could not be updated' };
    }

    return {
      success: true,
      message: `Top banner ${shouldCollapse ? 'collapsed' : 'expanded'}`,
      new_state: shouldCollapse ? 'collapsed' : 'expanded',
    };
  }

  /**
   * Switch UI style / theme
   * Changes the application's visual style preset. Color scheme is always light.
   */
  async switchUiStyle(parameters = {}) {
    const { style_name: styleName, dark_mode: darkMode } = parameters;
    const themeManager = window.themeManager;
    const generalSettingsManager = window.generalSettingsManager;

    if (!themeManager) {
      return {
        success: false,
        error: 'ThemeManager is not available',
      };
    }

    const availableStyles = themeManager.getAvailableStyles().map(s => s.id);
    const results = [];

    try {
      // Apply style preset if specified
      if (styleName) {
        if (!availableStyles.includes(styleName)) {
          return {
            success: false,
            error: `Unknown style: '${styleName}'`,
            available_styles: availableStyles,
            message: `Available styles: ${availableStyles.join(', ')}`,
          };
        }
        await themeManager.switchStyle(styleName);
        results.push(`Style switched to '${styleName}'`);

        // Also sync GeneralSettingsManager
        if (generalSettingsManager) {
          generalSettingsManager.settings.uiStyle = styleName;
          const preset = themeManager.stylePresets[styleName];
          if (preset) {
            generalSettingsManager.settings.accentColor = preset.variables['--primary-color'];
          }
        }
      }

      // Dark mode has been removed from the UI style system; keep light mode.
      if (darkMode) {
        if (generalSettingsManager) {
          generalSettingsManager.settings.themeMode = 'light';
          generalSettingsManager.applyTheme('light');
        } else {
          themeManager.applyDarkModeOverrides(false);
        }
        results.push('Color scheme kept in light mode');
      }

      // If neither specified, just return current state
      if (!styleName && !darkMode) {
        const currentStyle = themeManager.getCurrentStyle();
        return {
          success: true,
          message: `Current UI style: '${currentStyle}' (light mode)`,
          style_name: currentStyle,
          dark_mode: false,
          available_styles: availableStyles,
        };
      }

      return {
        success: true,
        message: results.join('. ') || 'UI style updated',
        style_name: themeManager.getCurrentStyle(),
        dark_mode: false,
      };
    } catch (error) {
      console.error(`[ChatManager] switchUiStyle error:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute action system tools
   */
  async executeActionTool(toolName, parameters) {
    if (!window.actionManager) {
      console.log(`⚡ Action Manager not available for '${toolName}'`);
      return { error: 'Action system not available' };
    }

    try {
      switch (toolName) {
        case 'copy_sequence':
          return await window.actionManager.copySequence(parameters);
        case 'cut_sequence':
          return await window.actionManager.cutSequence(parameters);
        case 'paste_sequence':
          return await window.actionManager.pasteSequence(parameters);
        case 'delete_sequence':
          return await window.actionManager.deleteSequence(parameters);
        case 'insert_sequence':
          return await window.actionManager.insertSequence(parameters);
        case 'replace_sequence':
          return await window.actionManager.replaceSequence(parameters);
        case 'execute_actions':
          // Pass parameters directly — path resolution is handled by
          // resolveSaveFilePath() inside executeAllActionsInternal
          console.log(
            `🔍 [TRACE-EXECUTE_ACTIONS] ChatManager.executeActionTool execute_actions | parameters=${JSON.stringify(parameters)}`
          );
          return await window.actionManager.executeAllActions(parameters);
        case 'get_action_list':
          return await window.actionManager.getActionList(parameters);
        case 'show_action_list':
          return await window.actionManager.showActionListUI(parameters);
        case 'clear_actions':
          return await window.actionManager.clearAllActions(parameters || {});
        case 'get_clipboard_content':
          return await window.actionManager.getClipboardContent(parameters);
        default:
          console.warn(`Unknown action tool: ${toolName}`);
          return { error: `Unknown action tool: ${toolName}` };
      }
    } catch (error) {
      console.error(`❌ Action tool '${toolName}' execution failed:`, error);
      return { error: error.message };
    }
  }

  /**
   * Get optimized system message for better LLM performance
   */
  getOptimizedSystemMessage() {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.getOptimizedSystemMessage();
  }

  /**
   * Get complete tool context for custom system prompts
   * This includes all the tool information that the base system message has
   */
  getCompleteToolContext() {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.getCompleteToolContext();
  }

  /**
   * Get essential tool information that should always be included
   */
  getEssentialToolInformation() {
    const context = this.getCurrentContext();
    const toolCount = context.genomeBrowser.toolSources.total;

    // Get a sample of key tools from each category

    return `
===CRITICAL INSTRUCTION FOR TOOL CALLS===
When a user asks you to perform ANY action that requires using tools, you MUST respond with ONLY a JSON object:

{"tool_name": "tool_name_here", "parameters": {"param1": "value1", "param2": "value2"}}

AVAILABLE TOOLS SUMMARY:
- Total Available Tools: ${toolCount}
- Local Tools: ${context.genomeBrowser.toolSources.local}
- Plugin Tools: ${context.genomeBrowser.toolSources.plugins}  
- MCP Tools: ${context.genomeBrowser.toolSources.mcp}

KEY TOOLS BY CATEGORY:
Navigation & State: navigate_to_position, get_current_state, jump_to_gene, zoom_to_gene, select_gene, select_sequence_region, open_new_tab, save_view_state, restore_view_state
Search & Discovery: search_features, find_gene_by_name, search_sequence_motif
Sequence Analysis: get_sequence, translate_dna, compute_gc, reverse_complement  
Advanced Analysis: predict_promoter, find_restriction_sites
BLAST & External: blast_search, blast_sequence_from_region
Protein Structure: open_protein_viewer, fetch_protein_structure
Data Management: get_genome_info, export_data, create_annotation
System & File Management: set_working_directory, list_available_tools, download_internet_file

For complete tool documentation with all ${toolCount} available tools, ask me to show all available tools.`;
  }

  /**
   * Get the original base system message with all context
   */
  getBaseSystemMessage() {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.getBaseSystemMessage();
  }

  /**
   * Helper methods for generating variable content
   */
  getGenomeInfoSummary() {
    if (!this.app || !this.app.currentSequence) {
      return 'No genome loaded';
    }

    const sequences = Object.keys(this.app.currentSequence);
    const totalLength = Object.values(this.app.currentSequence).reduce((sum, seq) => sum + seq.length, 0);
    const annotationCount = this.app.currentAnnotations
      ? Object.values(this.app.currentAnnotations).reduce((sum, annotations) => sum + annotations.length, 0)
      : 0;

    let summary = `${sequences.length} sequence(s), ${totalLength.toLocaleString()} bp total, ${annotationCount} annotations`;
    if (this.app.windowId) {
      summary = `[Window: ${this.app.windowId}] ${summary}`;
    }
    return summary;
  }

  getCurrentStateSummary(context) {
    const state = context.genomeBrowser.currentState;
    return `Chromosome: ${state.currentChromosome || 'None'}, Position: ${state.currentPosition?.start || 0}-${state.currentPosition?.end || 0}`;
  }

  getLoadedFilesSummary() {
    if (!this.app || !this.app.loadedFiles) {
      return 'No files loaded';
    }
    return `${this.app.loadedFiles.length} file(s) loaded`;
  }

  getVisibleTracksSummary() {
    const tracks = this.getVisibleTracks();
    return tracks.length > 0 ? tracks.join(', ') : 'No tracks visible';
  }

  getCurrentPositionSummary(context) {
    const pos = context.genomeBrowser.currentState.currentPosition;
    if (!pos) return 'No position set';
    return `${pos.start}-${pos.end} (${(pos.end - pos.start + 1).toLocaleString()} bp)`;
  }

  getMCPServersSummary() {
    const servers = this.mcpServerManager.getServerStatus();
    const connected = servers.filter(s => s.connected);
    return connected.length > 0
      ? `${connected.length} connected: ${connected.map(s => s.name).join(', ')}`
      : 'No MCP servers connected';
  }

  getPluginFunctionsSummary() {
    if (this.pluginFunctionCallsIntegrator) {
      const stats = this.pluginFunctionCallsIntegrator.getPluginFunctionStats();
      return `${stats.totalFunctions} plugin functions available`;
    }
    return 'Plugin system not available';
  }

  /**
   * Get plugin system information for system message
   */
  getPluginSystemInfo() {
    // Use the new plugin prompt system (preferred)
    if (this.pluginManager && this.pluginManager.getPluginSystemPromptSection) {
      try {
        return this.pluginManager.getPluginSystemPromptSection();
      } catch (error) {
        console.error('Error getting plugin system prompt section:', error);
      }
    }

    // Use the integrator if available (fallback)
    if (this.pluginFunctionCallsIntegrator) {
      try {
        const systemInfo = this.pluginFunctionCallsIntegrator.getPluginFunctionsSystemInfo();
        const stats = this.pluginFunctionCallsIntegrator.getPluginFunctionStats();

        let info = systemInfo;
        info += '\\n\\nPLUGIN SYSTEM STATISTICS:\\n';
        info += `Total Plugin Functions: ${stats.totalFunctions}\\n`;
        info += `Available Plugins: ${Object.keys(stats.pluginCounts).join(', ')}\\n`;
        info += `Function Categories: ${Object.keys(stats.categoryStats).join(', ')}\\n`;

        return info;
      } catch (error) {
        console.error('Error getting plugin system info from integrator:', error);
      }
    }

    // Fallback to original method
    if (!this.pluginManager) {
      return 'Plugin system not available.';
    }

    try {
      const pluginFunctions = this.pluginManager.getAvailableFunctions();
      const visualizations = this.pluginManager.getAvailableVisualizations();

      let info = '';

      if (pluginFunctions.length > 0) {
        info += 'Available Plugin Functions:\\n';
        pluginFunctions.forEach(func => {
          info += `- ${func.name}: ${func.description}\\n`;
        });

        info += '\\nPlugin Function Examples:\\n';
        info +=
          '- Analyze GC content: {"tool_name": "genomic-analysis.analyzeGCContent", "parameters": {"chromosome": "chr1", "start": 1000, "end": 5000, "windowSize": 1000}}\\n';
        info +=
          '- Find motifs: {"tool_name": "genomic-analysis.findMotifs", "parameters": {"chromosome": "chr1", "start": 1000, "end": 5000, "motif": "GAATTC", "strand": "both"}}\\n';
        info +=
          '- Calculate diversity: {"tool_name": "genomic-analysis.calculateDiversity", "parameters": {"sequences": ["ATGC", "CGTA"], "metric": "shannon"}}\\n';
        info +=
          '- Compare regions: {"tool_name": "genomic-analysis.compareRegions", "parameters": {"regions": [{"chromosome": "chr1", "start": 1000, "end": 2000, "name": "region1"}], "analysisType": "gc"}}\\n';
        info +=
          '- Build phylogenetic tree: {"tool_name": "phylogenetic-analysis.buildPhylogeneticTree", "parameters": {"sequences": [{"id": "seq1", "sequence": "ATGC", "name": "Sequence 1"}], "method": "nj"}}\\n';
        info +=
          '- Predict gene function: {"tool_name": "ml-analysis.predictGeneFunction", "parameters": {"sequence": "ATGCGCTATCG", "model": "cnn", "threshold": 0.7}}\\n';
        info +=
          '- Cluster sequences: {"tool_name": "ml-analysis.clusterSequences", "parameters": {"sequences": [{"id": "seq1", "sequence": "ATGC"}], "algorithm": "kmeans", "numClusters": 3}}\\n';

        // UniProt Database Search Functions
        info += '\\nUNIPROT DATABASE SEARCH FUNCTIONS:\\n';
        info +=
          '- Search UniProt database: {"tool_name": "uniprot-search.searchUniProt", "parameters": {"query": "TP53", "organism": "human", "reviewedOnly": true, "maxResults": 10}}\\n';
        info +=
          '- Search by gene name: {"tool_name": "uniprot-search.searchByGene", "parameters": {"geneName": "INS", "organism": "human", "reviewedOnly": true}}\\n';
        info +=
          '- Search by protein name: {"tool_name": "uniprot-search.searchByProtein", "parameters": {"proteinName": "insulin", "organism": "human"}}\\n';
        info +=
          '- Get protein by ID: {"tool_name": "uniprot-search.getProteinById", "parameters": {"uniprotId": "P04637", "includeSequence": true}}\\n';
        info +=
          '- Search by function: {"tool_name": "uniprot-search.searchByFunction", "parameters": {"keywords": "kinase", "organism": "mouse", "maxResults": 15}}\\n';
      }

      if (visualizations.length > 0) {
        info += '\\nAvailable Visualization Plugins:\\n';
        visualizations.forEach(viz => {
          info += `- ${viz.id}: ${viz.description} (supports: ${viz.supportedDataTypes.join(', ')})\\n`;
        });

        info += '\\nVisualization Examples:\\n';
        info += 'Note: Visualizations are automatically rendered when plugin functions return compatible data.\\n';
        info +=
          'For example, GC content analysis will automatically show a plot, phylogenetic analysis will show a tree.\\n';
      }

      return info;
    } catch (error) {
      console.error('Error getting plugin system info:', error);
      return 'Plugin system available but could not load details.';
    }
  }

  parseToolCall(response) {
    if (!this.services || !this.services.intent) {
      console.error('[ChatManager] intent not initialized');
      return null;
    }
    return this.services.intent.parseToolCall(response);
  }

  parseMultipleToolCalls(response) {
    if (!this.services || !this.services.intent) {
      console.error('[ChatManager] intent not initialized');
      return [];
    }
    return this.services.intent.parseMultipleToolCalls(response);
  }

  getExecutionGateway() {
    if (!this._executionGateway) {
      const Gateway =
        (typeof window !== 'undefined' && window.ExecutionGateway) ||
        (typeof globalThis !== 'undefined' && globalThis.ExecutionGateway);
      if (typeof Gateway !== 'function') throw new Error('ExecutionGateway is required before ChatManager');
      this._executionGateway = new Gateway({
        chatManager: this,
        legacyExecutor: (toolName, parameters, options) => {
          if (options?.bypassGateway) {
            if (!this.services?.execution) throw new Error('ChatManager services not fully initialized');
            return this.services.execution.execute(toolName, parameters, options);
          }
          return this.executeToolByName(toolName, parameters, { ...options, bypassGateway: true });
        },
      });
    }
    return this._executionGateway;
  }

  async executeToolByName(toolName, parameters, options = {}) {
    if ((options.turnContext || options.nodeId) && !options.bypassGateway) {
      const gateway = this.getExecutionGateway();
      if (options.gatewayLegacyResult) {
        return gateway.execute(toolName, parameters, options);
      }
      return gateway.executeLegacy(toolName, parameters, options);
    }
    if (!this.services || !this.services.execution) {
      console.error('[ChatManager] ToolExecutionService not initialized!');
      throw new Error('ChatManager services not fully initialized');
    }
    return await this.services.execution.execute(toolName, parameters, options);
  }

  /**
   * Execute delete sequence function directly
   */
  async executeDeleteSequence(parameters) {
    const { chromosome, start, end, strand = '+' } = parameters;

    // Validate parameters
    if (!chromosome || start === undefined || end === undefined) {
      throw new Error('Missing required parameters: chromosome, start, end');
    }

    if (start > end) {
      throw new Error('Start position must be less than or equal to end position');
    }

    // Use MicrobeGenomicsFunctions if available
    if (window.MicrobeFns && window.MicrobeFns.delete_sequence) {
      const result = window.MicrobeFns.delete_sequence(chromosome, start, end);
      return result;
    }

    // Fallback to ActionManager if MicrobeFns not available
    const genomeBrowser = window.genomeBrowser;
    if (!genomeBrowser || !genomeBrowser.actionManager) {
      throw new Error('Neither MicrobeFns nor ActionManager available');
    }

    const target = `${chromosome}:${start}-${end}`;
    const length = end - start + 1;
    const metadata = { chromosome, start, end, strand, selectionSource: 'function_call' };

    const actionId = genomeBrowser.actionManager.addAction(
      genomeBrowser.actionManager.ACTION_TYPES.DELETE_SEQUENCE,
      target,
      `Delete ${length.toLocaleString()} bp from ${chromosome}:${start}-${end}`,
      metadata
    );

    const result = {
      success: true,
      actionId: actionId,
      action: 'delete',
      target: target,
      length: length,
      message: `Delete action queued for ${chromosome}:${start}-${end} (${length} bp)`,
    };

    return result;
  }

  /**
   * Execute delete gene function by name
   */
  async executeDeleteGene(parameters) {
    const { geneName, chromosome } = parameters;

    // Validate parameters
    if (!geneName) {
      throw new Error('Missing required parameter: geneName (can be gene name or locus tag)');
    }

    // First, find the gene using existing search functionality
    const searchResult = await this.searchGeneByName({ name: geneName, chromosome });

    if (!searchResult.found || !searchResult.genes || searchResult.genes.length === 0) {
      throw new Error(
        `Gene/locus tag "${geneName}" not found${chromosome ? ` in chromosome ${chromosome}` : ''}. Make sure the gene name or locus tag is correct.`
      );
    }

    // Get the first matching gene (prefer CDS over other features)
    const targetGene = searchResult.genes.find(gene => gene.type === 'CDS') || searchResult.genes[0];

    if (!targetGene || !targetGene.start || !targetGene.end) {
      throw new Error(`Invalid gene data for "${geneName}": missing coordinates`);
    }

    const geneChromosome = targetGene.chromosome || searchResult.chromosome;
    const geneStart = targetGene.start;
    const geneEnd = targetGene.end;
    const geneStrand = targetGene.strand || '+';

    // Use the delete_sequence functionality with gene coordinates
    const deleteResult = await this.executeDeleteSequence({
      chromosome: geneChromosome,
      start: geneStart,
      end: geneEnd,
      strand: geneStrand,
    });

    // Enhance the result with gene-specific information
    const result = {
      ...deleteResult,
      deletedGene: {
        name: geneName,
        chromosome: geneChromosome,
        start: geneStart,
        end: geneEnd,
        strand: geneStrand,
        length: geneEnd - geneStart + 1,
        type: targetGene.type,
        product: targetGene.qualifiers?.product || 'Unknown protein',
      },
      message: `Gene/locus tag "${geneName}" deletion queued: ${geneChromosome}:${geneStart}-${geneEnd} (${geneEnd - geneStart + 1} bp)`,
    };

    return result;
  }

  /**
   * Execute action function through UI response functions
   */
  async executeActionFunction(functionName, parameters) {
    // Use window.genomeBrowser for access
    const genomeBrowser = window.genomeBrowser;

    if (!genomeBrowser) {
      throw new Error('Genome browser not available via window.genomeBrowser');
    }

    if (!genomeBrowser.actionManager) {
      throw new Error('ActionManager not available in genome browser');
    }

    // Use ActionManager's executeActionFunction method which delegates to function* methods
    // This ensures parameters are used instead of showing UI dialogs
    const result = await genomeBrowser.actionManager.executeActionFunction(functionName, parameters);

    return result;
  }

  getCurrentContext() {
    // Build comprehensive context for the LLM

    // Collect all available tools from different sources
    const localTools = [
      // Core Navigation & State
      'navigate_to_position',
      'get_current_state',
      'get_current_region',
      'jump_to_gene',
      'select_gene',
      'select_sequence_region',
      'open_new_tab',
      'scroll_left',
      'scroll_right',
      'zoom_in',
      'zoom_out',
      'zoom_to_gene',
      'bookmark_position',
      'get_bookmarks',
      'save_view_state',
      'restore_view_state',

      // Search & Discovery
      'search_features',
      'find_gene_by_name',
      'search_by_position',
      'search_motif',
      'search_pattern',
      'search_sequence_motif',
      'search_intergenic_regions',
      'get_nearby_features',
      'find_intergenic_regions',

      // Sequence Analysis
      'get_sequence',
      'translate_sequence',
      'translate_dna',
      'calculate_gc_content',
      'compute_gc',
      'calc_region_gc',
      'reverse_complement',
      'codon_usage_analysis',
      'analyze_codon_usage',
      'calculate_entropy',
      'calculate_melting_temp',
      'calculate_molecular_weight',

      // Advanced Analysis
      'compare_regions',
      'find_similar_sequences',
      'find_restriction_sites',
      'virtual_digest',
      'predict_promoter',
      'predict_rbs',
      'predict_terminator',
      'get_upstream_region',
      'get_downstream_region',

      // Annotation & Features
      'get_gene_details',
      'get_operons',
      'create_annotation',
      'add_annotation',
      'edit_annotation',
      'delete_annotation',
      'batch_create_annotations',
      'merge_annotations',

      // Track Management
      'toggle_track',
      'get_track_status',
      'add_track',
      'add_variant',

      // Data Export/Import
      'export_data',
      'capture_screenshot',
      'open_image_file',
      'export_region_features',
      'get_file_info',
      'get_chromosome_list',
      'get_genome_info',

      // BLAST & External Analysis
      'blast_search',
      'blast_sequence_from_region',
      'get_blast_databases',
      'batch_blast_search',
      'advanced_blast_search',

      // Protein Structure
      'open_protein_viewer',
      'fetch_protein_structure',
      'search_pdb_structures',
      'search_alphafold_structures',
      'get_pdb_details',

      // Metabolic Pathways
      'show_metabolic_pathway',
      'find_pathway_genes',

      // Action Manager - Sequence Editing
      'copy_sequence',
      'cut_sequence',
      'paste_sequence',
      'delete_sequence',
      'insert_sequence',
      'replace_sequence',
      'get_action_list',
      'show_action_list',
      'execute_actions',
      'clear_actions',
      'get_clipboard_content',

      // System & File Management
      'set_working_directory',
      'list_available_tools',
      'download_internet_file',
      'toggle_settings_modal',
      'toggle_chatbox',
      'set_chatbox_layout',
      'set_chatbox_minimized',
      'toggle_sidebar',
      'toggle_sidebar_panel',
      'toggle_top_banner',
    ];

    // Add plugin functions if available
    const pluginTools = [];
    if (this.pluginFunctionCallsIntegrator) {
      try {
        const pluginFunctions = Array.from(this.pluginFunctionCallsIntegrator.pluginFunctionMap.keys());
        pluginTools.push(...pluginFunctions);
      } catch (error) {
        // Silently handle error
      }
    }

    // Add MCP tools if available
    const mcpTools = [];
    if (this.mcpServerManager) {
      try {
        const allMcpTools = this.mcpServerManager.getAllAvailableTools();
        mcpTools.push(...allMcpTools.map(tool => tool.name));
      } catch (error) {
        // Silently handle error
      }
    }

    // Combine all tools and remove duplicates
    const allAvailableTools = [...new Set([...localTools, ...pluginTools, ...mcpTools])];

    const context = {
      genomeBrowser: {
        currentState: this.getCurrentState(),
        availableTools: allAvailableTools,
        toolSources: {
          local: localTools.length,
          plugins: pluginTools.length,
          mcp: mcpTools.length,
          total: allAvailableTools.length,
        },
      },
    };

    return context;
  }

  addMessageToChat(message, sender, isError = false) {
    const timestamp = new Date().toISOString();

    // Add to configuration manager for persistence (existing ChatBox feature)
    const messageId = this.configManager.addChatMessage(message, sender, timestamp);

    // Add to Evolution data structure for detailed analysis
    this.addToEvolutionData({
      type: 'message',
      timestamp: timestamp,
      messageId: messageId,
      sender: sender,
      content: message,
      isError: isError,
      metadata: {
        source: 'direct_message',
        visible: true,
      },
    });

    // Display the message in UI
    this.displayChatMessage(message, sender, timestamp, messageId);
  }

  copyMessage(messageId) {
    const messageElement = document.getElementById(messageId);
    if (messageElement) {
      // Get the text content, stripping HTML but preserving line breaks
      const textContent = messageElement.innerText || messageElement.textContent;

      // Copy to clipboard
      navigator.clipboard
        .writeText(textContent)
        .then(() => {
          // Show brief success indication
          const copyBtn = messageElement.parentElement.querySelector('.copy-message-btn');
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = '<i class="fas fa-check"></i>';
          copyBtn.style.color = '#10b981';

          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.style.color = '';
          }, 1000);
        })
        .catch(err => {
          console.error('Failed to copy message: ', err);
          // Fallback: select the text
          const range = document.createRange();
          range.selectNodeContents(messageElement);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        });
    }
  }

  /**
   * Enhanced Markdown formatting with proper rendering
   * Handles code blocks, lists, headers, links, tables, and more
   */
  formatMessage(message) {
    if (!message || typeof message !== 'string') {
      return '';
    }
    // Trim leading/trailing whitespace
    let formattedMessage = message.trim();

    // Strip <think>...</think> blocks from final rendered messages to keep them clean
    formattedMessage = formattedMessage.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Remove common leading whitespace while preserving relative indentation
    const lines = formattedMessage.split('\n');
    if (lines.length > 1) {
      const nonEmptyLines = lines.filter(line => line.trim().length > 0);
      if (nonEmptyLines.length > 0) {
        const minIndent = Math.min(
          ...nonEmptyLines.map(line => {
            const match = line.match(/^(\s*)/);
            return match ? match[1].length : 0;
          })
        );

        if (minIndent > 0) {
          formattedMessage = lines
            .map(line => {
              return line.length > 0 ? line.substring(minIndent) : line;
            })
            .join('\n');
        }
      }
    }

    // Preprocess: Convert relative MCP download URLs to absolute clickable links
    formattedMessage = this.convertMCPDownloadUrls(formattedMessage);

    // Use marked library for proper Markdown rendering if available
    if (typeof marked !== 'undefined' && marked.parse) {
      try {
        // Configure marked options for better rendering
        marked.setOptions({
          breaks: true, // Enable GFM line breaks
          gfm: true, // Enable GitHub Flavored Markdown
          headerIds: false, // Disable header IDs for security
          mangle: false, // Don't mangle email addresses
          sanitize: false, // We'll handle sanitization separately
          smartLists: true, // Use smarter list behavior
          smartypants: true, // Use smart typography
          xhtml: false, // Don't use XHTML tags
        });

        // Parse markdown to HTML
        const htmlContent = marked.parse(formattedMessage);

        // Sanitize the HTML output to prevent XSS while preserving formatting
        const sanitizedHtml = this.sanitizeHTML(htmlContent);

        // Post-process to convert any remaining markdown-style MCP links to clickable HTML
        return this.postProcessMCPLinks(sanitizedHtml);
      } catch (error) {
        console.error('Markdown parsing error:', error);
        // Fallback to basic formatting if marked fails
        const basicHtml = this.basicMarkdownFormat(formattedMessage);
        return this.postProcessMCPLinks(basicHtml);
      }
    }

    // Fallback to basic formatting if marked is not available
    const basicHtml = this.basicMarkdownFormat(formattedMessage);
    return this.postProcessMCPLinks(basicHtml);
  }

  /**
   * Basic Markdown formatting fallback
   * Used when marked library is not available
   */
  basicMarkdownFormat(text) {
    return (
      text
        // Code blocks (```)
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Bold
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        // Headers
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        // Unordered lists
        .replace(/^[*+-] (.+)$/gm, '<li>$1</li>')
        // Ordered lists
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        // Line breaks
        .replace(/\n/g, '<br>')
    );
  }

  /**
   * Convert relative MCP download URLs to absolute clickable URLs
   * Converts paths like /api/mcp/download/... to full URLs with the MCP server base URL
   * Generates both markdown links (for markdown contexts) and HTML links (for direct HTML contexts)
   */
  convertMCPDownloadUrls(text) {
    if (!this.services || !this.services.file) {
      console.error('[ChatManager] file not initialized');
      return text;
    }
    return this.services.file.convertMCPDownloadUrls(text);
  }

  /**
   * Post-process HTML to convert remaining markdown-style links to clickable HTML links
   * Called after sanitizeHTML to handle cases where markdown wasn't parsed
   */
  postProcessMCPLinks(html) {
    if (!html || typeof html !== 'string') {
      return html;
    }

    try {
      // Convert escaped markdown links like [text](url) that weren't rendered
      // This handles cases where content wasn't markdown-parsed
      html = html.replace(/\[([^\]]+)\]\((http[s]?:\/\/[^\s)]+\/api\/mcp\/[^\s)]+)\)/g, (match, label, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="mcp-download-link">${label}</a>`;
      });

      // Also convert any remaining raw /api/mcp URLs to clickable links
      html = html.replace(/(?<!href="|">)(http[s]?:\/\/[^\s<>"]+\/api\/mcp\/download\/[^\s<>"]+)/g, (match, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="mcp-download-link">${url}</a>`;
      });

      return html;
    } catch (error) {
      console.error('Error post-processing MCP links:', error);
      return html;
    }
  }

  /**
   * Sanitize HTML to prevent XSS attacks while preserving formatting
   * Allows safe HTML tags and attributes
   */
  sanitizeHTML(html) {
    // Use DOMPurify via SanitizeService if available (much more robust than manual sanitization)
    if (typeof window !== 'undefined' && window.SanitizeService) {
      return window.SanitizeService.sanitizeMarkdown(html);
    }

    // Fallback: if DOMPurify is available directly
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'p',
          'br',
          'strong',
          'b',
          'em',
          'i',
          'u',
          'code',
          'pre',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'ul',
          'ol',
          'li',
          'a',
          'img',
          'blockquote',
          'hr',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
          'div',
          'span',
          'del',
          'ins',
          'sup',
          'sub',
          'details',
          'summary',
          'mark',
          'kbd',
          'var',
          'cite',
        ],
        ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'class', 'id', 'style'],
        ALLOW_DATA_ATTR: true,
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
        ADD_ATTR: ['target'],
      });
    }

    // Last resort fallback: original manual sanitization (less secure than DOMPurify)
    console.warn('[Security] DOMPurify not available, falling back to manual HTML sanitization');
    const allowedTags = [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      'code',
      'pre',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'blockquote',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'div',
      'span',
      'del',
      'ins',
      'sup',
      'sub',
    ];

    const allowedAttributes = {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      code: ['class'],
      pre: ['class'],
      div: ['class', 'style'],
      span: ['class', 'style'],
    };

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const sanitizeNode = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.cloneNode(true);
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();

        if (!allowedTags.includes(tagName)) {
          const textNode = document.createTextNode(node.textContent);
          return textNode;
        }

        const newElement = document.createElement(tagName);

        if (allowedAttributes[tagName]) {
          Array.from(node.attributes).forEach(attr => {
            if (allowedAttributes[tagName].includes(attr.name)) {
              if (tagName === 'a' && attr.name === 'href') {
                const href = attr.value;
                if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
                  newElement.setAttribute(attr.name, attr.value);
                }
              } else {
                newElement.setAttribute(attr.name, attr.value);
              }
            }
          });

          if (tagName === 'a' && !newElement.hasAttribute('target')) {
            newElement.setAttribute('target', '_blank');
          }
          if (tagName === 'a' && !newElement.hasAttribute('rel')) {
            newElement.setAttribute('rel', 'noopener noreferrer');
          }
        }

        Array.from(node.childNodes).forEach(child => {
          const sanitizedChild = sanitizeNode(child);
          if (sanitizedChild) {
            newElement.appendChild(sanitizedChild);
          }
        });

        return newElement;
      }

      return null;
    };

    const sanitizedDiv = document.createElement('div');
    Array.from(tempDiv.childNodes).forEach(child => {
      const sanitizedChild = sanitizeNode(child);
      if (sanitizedChild) {
        sanitizedDiv.appendChild(sanitizedChild);
      }
    });

    return sanitizedDiv.innerHTML;
  }

  /**
   * Display visualization DOM element in chat interface
   * @param {string} toolName - Name of the visualization tool
   * @param {HTMLElement} domElement - DOM element to display
   * @param {Object} parameters - Tool parameters for context
   */
  displayVisualizationInChat(toolName, domElement, parameters = {}) {
    try {
      console.log(`🎨 [ChatManager] Displaying visualization: ${toolName}`);

      const messagesContainer = document.getElementById('chatMessages');
      if (!messagesContainer) {
        console.error('❌ [ChatManager] Chat messages container not found');
        return;
      }

      // Create visualization message container
      const vizMessage = document.createElement('div');
      vizMessage.className = 'chat-message assistant-message visualization-message';
      vizMessage.style.cssText = `
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                border-radius: 12px;
                padding: 0;
                margin: 12px 0;
                max-width: 90%;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.25);
            `;

      // Create header
      const vizHeader = document.createElement('div');
      vizHeader.style.cssText = `
                padding: 12px 16px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                display: flex;
                align-items: center;
                justify-content: space-between;
                color: white;
                font-weight: 600;
                font-size: 14px;
            `;
      vizHeader.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-chart-network" style="font-size: 16px;"></i>
                    <span>🎨 Visualization: ${this.formatToolName(toolName)}</span>
                </div>
                <button class="viz-expand-btn" title="Expand" style="
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                ">
                    <i class="fas fa-expand-alt"></i>
                </button>
            `;

      // Create content container
      const vizContent = document.createElement('div');
      vizContent.className = 'visualization-content';
      vizContent.style.cssText = `
                background: white;
                padding: 16px;
                border-radius: 0 0 12px 12px;
                min-height: 200px;
                max-height: 600px;
                overflow: auto;
            `;

      // Validate and append DOM element
      if (domElement instanceof Node) {
        // Style the visualization element
        domElement.style.width = '100%';
        domElement.style.minHeight = '300px';
        vizContent.appendChild(domElement);
        console.log('✅ [ChatManager] Visualization DOM element appended successfully');
      } else {
        console.error('❌ [ChatManager] Invalid DOM element', domElement);
        vizContent.innerHTML =
          '<div style="color: #e74c3c; padding: 20px; text-align: center;">Invalid visualization element</div>';
      }

      // Assemble message
      vizMessage.appendChild(vizHeader);
      vizMessage.appendChild(vizContent);
      messagesContainer.appendChild(vizMessage);

      // Add expand functionality
      const expandBtn = vizHeader.querySelector('.viz-expand-btn');
      if (expandBtn) {
        expandBtn.addEventListener('click', () => {
          this.expandVisualization(domElement, toolName);
        });
      }

      // Scroll to show the visualization
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // Track in Evolution data
      this.addToEvolutionData({
        type: 'visualization_displayed',
        timestamp: new Date().toISOString(),
        toolName: toolName,
        parameters: parameters,
        success: true,
      });
    } catch (error) {
      console.error('❌ [ChatManager] Error displaying visualization:', error);
    }
  }

  /**
   * Format tool name for display
   * @param {string} toolName - Tool name (e.g., "protein-interaction-network.visualize")
   * @returns {string} Formatted name
   */
  formatToolName(toolName) {
    return toolName
      .split('.')
      .map(part => part.replace(/-/g, ' '))
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' → ');
  }

  /**
   * Expand visualization in full-screen modal
   * @param {HTMLElement} element - Visualization element
   * @param {string} toolName - Tool name
   */
  expandVisualization(element, toolName) {
    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.9);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;

    // Clone the element for modal display
    const clonedElement = element.cloneNode(true);
    clonedElement.style.width = '90%';
    clonedElement.style.height = '80%';
    clonedElement.style.maxWidth = '1200px';
    clonedElement.style.background = 'white';
    clonedElement.style.borderRadius = '8px';
    clonedElement.style.padding = '20px';

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';
    closeBtn.style.cssText = `
            position: absolute;
            top: 30px;
            right: 30px;
            background: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
    closeBtn.onclick = () => document.body.removeChild(modal);

    modal.appendChild(clonedElement);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);

    // Close on escape key
    const escHandler = e => {
      if (e.key === 'Escape' && document.body.contains(modal)) {
        document.body.removeChild(modal);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  showTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'message assistant-message typing';
    typingDiv.innerHTML = `
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  removeTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  clearChat() {
    const messagesContainer = document.getElementById('chatMessages');
    const welcomeMessage = messagesContainer.querySelector('.welcome-message');
    messagesContainer.innerHTML = '';
    if (welcomeMessage) {
      messagesContainer.appendChild(welcomeMessage);
    }

    // The panel and round group just went with the transcript. Benchmark runs
    // clear between tests, so leaving these set would point the next run's
    // steps at detached nodes.
    this.activityPanelElement = null;
    this.activityRoundState = null;
    this.activityTotals = null;

    // Clear chat input box
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = '';
      chatInput.style.height = 'auto'; // Reset height for auto-resize
    }

    // Clear chat history from config
    this.configManager.clearChatHistory();
  }

  /**
   * Export chat history
   */
  async exportChatHistory(format = 'json') {
    try {
      const history = this.configManager.getChatHistory();
      const exportData = {
        exported: new Date().toISOString(),
        messageCount: history.length,
        format: format,
        messages: history,
      };

      let content;
      let filename;
      let mimeType;

      switch (format.toLowerCase()) {
        case 'json':
          content = JSON.stringify(exportData, null, 2);
          filename = `chat-history-${new Date().toISOString().split('T')[0]}.json`;
          mimeType = 'application/json';
          break;

        case 'txt':
          content = history
            .map(msg => {
              const time = new Date(msg.timestamp).toLocaleString();
              return `[${time}] ${msg.sender.toUpperCase()}: ${msg.message}`;
            })
            .join('\n\n');
          filename = `chat-history-${new Date().toISOString().split('T')[0]}.txt`;
          mimeType = 'text/plain';
          break;

        case 'csv': {
          const csvHeader = 'Timestamp,Sender,Message\n';
          const csvContent = history
            .map(msg => {
              const escapedMessage = msg.message.replace(/"/g, '""');
              return `"${msg.timestamp}","${msg.sender}","${escapedMessage}"`;
            })
            .join('\n');
          content = csvHeader + csvContent;
          filename = `chat-history-${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = 'text/csv';
          break;
        }

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      // Download the file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`Chat history exported as ${format.toUpperCase()}: ${history.length} messages`);
      return true;
    } catch (error) {
      console.error('Error exporting chat history:', error);
      throw error;
    }
  }

  /**
   * Load chat history from configuration
   */
  loadChatHistory() {
    try {
      console.log('Loading chat history...');
      const history = this.configManager.getChatHistory();
      console.log(`Found ${history.length} chat messages in history`);

      if (history.length > 0) {
        this.displayChatHistory(history);
        console.log(`Successfully loaded and displayed ${history.length} chat messages`);
      } else {
        console.log('No chat history found');
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      this.showNotification('⚠️ Could not load chat history', 'warning');
    }
  }

  /**
   * Display chat history in the UI
   */
  displayChatHistory(history) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) {
      console.warn('Chat messages container not found, cannot display history');
      return;
    }

    console.log('Displaying chat history with', history.length, 'messages');

    // Preserve welcome message but clear other messages
    messagesContainer.querySelector('.welcome-message');

    // Clear all messages except welcome
    const existingMessages = messagesContainer.querySelectorAll('.message:not(.welcome-message .message)');
    existingMessages.forEach(msg => msg.remove());

    // Display historical messages
    history.forEach((msg, index) => {
      console.log(`Displaying message ${index + 1}:`, msg.message.substring(0, 50) + '...');
      this.displayChatMessage(msg.message, msg.sender, msg.timestamp, msg.id);
    });

    // Scroll to bottom to show most recent messages
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    console.log('Chat history display completed');
  }

  /**
   * Display a single chat message (used for history and new messages)
   */
  displayChatMessage(message, sender, timestamp, messageId) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const displayTime = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    const displayId = messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const safeMessage = this.formatMessage(message);
    const safeDisplayId = displayId.replace(/[^a-zA-Z0-9_-]/g, '');
    // Only the user's turn carries an avatar; assistant replies use the full width.
    const icon = sender === 'user' ? `<div class="message-icon"><i class="fas fa-user"></i></div>` : '';
    messageDiv.innerHTML = `<div class="message-content">${icon}<div class="message-text" id="${safeDisplayId}">${safeMessage}</div><div class="message-actions"><button class="copy-message-btn" onclick="chatManager.copyMessage('${safeDisplayId}')" title="Copy message"><i class="fas fa-copy"></i></button></div></div><div class="message-time">${displayTime}</div>`;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  showConfigOptions() {
    const options = [
      'Export chat history as JSON',
      'Export chat history as TXT',
      'Export chat history as CSV',
      'Clear all chat history',
      'Export all configurations',
      'Show config summary',
      'Debug storage info',
      'Test MicrobeGenomics integration',
      'Test tool execution',
    ];

    const optionsHTML = options
      .map(
        (option, index) =>
          `<button class="suggestion-btn" onclick="chatManager.handleConfigOption(${index})">${option}</button>`
      )
      .join('');

    this.addMessageToChat(
      `<div class="config-options-container">
                <p><i class="fas fa-cog"></i> Configuration Options:</p>
                ${optionsHTML}
            </div>`,
      'assistant'
    );
  }

  async handleConfigOption(optionIndex) {
    try {
      switch (optionIndex) {
        case 0: // Export JSON
          await this.exportChatHistory('json');
          this.addMessageToChat('✅ Chat history exported as JSON', 'assistant');
          break;
        case 1: // Export TXT
          await this.exportChatHistory('txt');
          this.addMessageToChat('✅ Chat history exported as TXT', 'assistant');
          break;
        case 2: // Export CSV
          await this.exportChatHistory('csv');
          this.addMessageToChat('✅ Chat history exported as CSV', 'assistant');
          break;
        case 3: // Clear history
          this.clearChat();
          this.addMessageToChat('🗑️ Chat history cleared', 'assistant');
          break;
        case 4: // Export all config
          await this.configManager.exportConfig();
          this.addMessageToChat('✅ All configurations exported', 'assistant');
          break;
        case 5: {
          // Show summary
          const summary = this.configManager.getConfigSummary();
          this.addMessageToChat(
            `📊 **Configuration Summary:**\n` +
              `• Version: ${summary.version}\n` +
              `• LLM Provider: ${summary.llmProvider || 'None'}\n` +
              `• Enabled Providers: ${summary.llmProvidersEnabled.join(', ') || 'None'}\n` +
              `• Theme: ${summary.theme}\n` +
              `• Chat History: ${summary.chatHistoryLength} messages\n` +
              `• Recent Files: ${summary.recentFilesCount}\n` +
              `• Debug Mode: ${summary.debugMode ? 'On' : 'Off'}`,
            'assistant'
          );
          break;
        }
        case 6: {
          // Debug storage info
          const storageInfo = this.configManager.getStorageInfo();
          this.addMessageToChat(
            `🔧 **Storage Debug Info:**\n` +
              `• Is Electron: ${storageInfo.isElectron}\n` +
              `• Using Files: ${storageInfo.usingFiles}\n` +
              `• Using localStorage: ${storageInfo.usingLocalStorage}\n` +
              `• Is Initialized: ${storageInfo.isInitialized}\n` +
              `• Config Path: ${storageInfo.configPath ? 'Available' : 'None'}\n` +
              `• Storage Method: ${storageInfo.usingFiles ? 'File-based' : 'localStorage'}`,
            'assistant'
          );
          break;
        }
        case 7: {
          // Test MicrobeGenomics integration
          const integrationResult = this.testMicrobeGenomicsIntegration();
          this.addMessageToChat(
            `🧬 **MicrobeGenomics Integration Test:**\n` +
              `• Integration: ${integrationResult.success ? '✅ Success' : '❌ Failed'}\n` +
              `• Functions Available: ${integrationResult.totalFunctions || 0}\n` +
              `• Categories Available: ${integrationResult.categoriesAvailable ? '✅' : '❌'}\n` +
              `• Examples Available: ${integrationResult.examplesAvailable ? '✅' : '❌'}\n` +
              `• Function Test: ${integrationResult.functionCallTest?.success ? '✅ Passed' : '❌ Failed'}\n` +
              (integrationResult.error ? `• Error: ${integrationResult.error}` : ''),
            'assistant'
          );
          break;
        }
        case 8: {
          // Test tool execution
          const executionResult = await this.testToolExecution();
          this.addMessageToChat(
            `🔧 **Tool Execution Test:**\n` +
              `• Status: ${executionResult.success ? '✅ All tests passed' : '❌ Tests failed'}\n` +
              `• GC Calculation: ${executionResult.tests?.gc ? '✅ Working' : '❌ Failed'}\n` +
              `• Reverse Complement: ${executionResult.tests?.reverseComplement ? '✅ Working' : '❌ Failed'}\n` +
              `• Navigation: ${executionResult.tests?.currentRegion ? '✅ Working' : '❌ Failed'}\n` +
              (executionResult.error ? `• Error: ${executionResult.error}` : ''),
            'assistant'
          );
          break;
        }
      }
    } catch (error) {
      this.addMessageToChat(`❌ Error: ${error.message}`, 'assistant', true);
    }
  }

  // New comprehensive function calls
  async getGeneDetails(params) {
    const { geneName, chromosome } = params;

    if (!this.app || !this.app.currentAnnotations) {
      throw new Error('No annotations loaded');
    }

    const chr = chromosome || this.app.currentChromosome;
    if (!chr) {
      throw new Error('No chromosome specified and none currently selected');
    }

    const annotations = this.app.currentAnnotations[chr] || [];
    const matchingGenes = annotations.filter(gene => {
      const name = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.qualifiers?.product || '';
      return name && typeof name === 'string' && name.toLowerCase().includes(geneName.toLowerCase());
    });

    if (matchingGenes.length === 0) {
      return {
        geneName: geneName,
        chromosome: chr,
        found: false,
        message: `No genes found matching "${geneName}" in ${chr}`,
      };
    }

    const geneDetails = matchingGenes.map(gene => ({
      name: gene.qualifiers?.gene || gene.qualifiers?.locus_tag || 'Unknown',
      type: gene.type,
      start: gene.start,
      end: gene.end,
      strand: gene.strand === -1 ? '-' : '+',
      length: gene.end - gene.start + 1,
      product: gene.qualifiers?.product || 'Unknown function',
      locusTag: gene.qualifiers?.locus_tag || 'N/A',
      note: gene.qualifiers?.note || 'No additional notes',
    }));

    return {
      geneName: geneName,
      chromosome: chr,
      found: true,
      count: matchingGenes.length,
      genes: geneDetails,
    };
  }

  async translateSequence(params) {
    // translate_sequence is a backward-compatible alias of translate_dna;
    // route it through the same MicrobeGenomics implementation so both the
    // `sequence` and `dna` parameter spellings and reading_frame work.
    return this.executeMicrobeFunction('translateDNA', params);
  }

  async findOpenReadingFrames(params) {
    return this.services.analysis.findOpenReadingFrames(params);
  }

  reverseComplement(sequence) {
    // Use local SequenceTools implementation
    const SequenceTools = require('../mcp-tools/sequence/SequenceTools');
    const seqTools = new SequenceTools();
    return seqTools.reverseComplement(sequence);
  }

  async getCodingSequence(params) {
    return this.services.analysis.getCodingSequence(params);
  }

  /**
   * Check if the genomics environment is properly set up
   * @returns {Object} Validation result with details
   */
  checkGenomicsEnvironment() {
    return this.services.analysis.checkGenomicsEnvironment();
  }

  /**
   * Get detailed information about the currently selected gene
   * @returns {Object} Selected gene information or null if no gene selected
   */
  getSelectedGene() {
    if (!this.app) {
      throw new Error('Genome browser not initialized');
    }

    if (!this.app.selectedGene) {
      return {
        selected: false,
        message: 'No gene currently selected. Click on a gene in the genome view to select it.',
      };
    }

    const gene = this.app.selectedGene.gene;
    const operonInfo = this.app.selectedGene.operonInfo;

    return {
      selected: true,
      geneName: gene.qualifiers?.gene || 'Unknown',
      locusTag: gene.qualifiers?.locus_tag || 'Unknown',
      product: gene.qualifiers?.product || 'Unknown',
      chromosome: this.app.currentChromosome,
      start: gene.start,
      end: gene.end,
      length: gene.end - gene.start + 1,
      strand: gene.strand === -1 ? '-' : '+',
      type: gene.type || 'Unknown',

      // Additional gene attributes
      qualifiers: gene.qualifiers || {},

      // Operon information if available
      operonInfo: operonInfo
        ? {
            operonName: operonInfo.name,
            operonStart: operonInfo.start,
            operonEnd: operonInfo.end,
            operonStrand: operonInfo.strand === -1 ? '-' : '+',
            geneCount: operonInfo.genes?.length || 0,
            genePosition:
              operonInfo.genes?.findIndex(g => g.start === gene.start && g.end === gene.end) + 1 || 'Unknown',
          }
        : null,
    };
  }

  /**
   * Get detailed information about the current viewing region
   * @returns {Object} Current region details with features and statistics
   */
  async getCurrentRegionDetails() {
    if (!this.app) {
      throw new Error('Genome browser not initialized');
    }

    if (!this.app.currentChromosome || !this.app.currentPosition) {
      return {
        hasRegion: false,
        message: 'No region currently selected. Navigate to a genomic position first.',
      };
    }

    const chromosome = this.app.currentChromosome;
    const start = this.app.currentPosition.start;
    const end = this.app.currentPosition.end;
    const length = end - start + 1;

    // Get sequence for the region if available
    let sequence = null;
    let gcContent = null;
    if (this.app.currentSequence && this.app.currentSequence[chromosome]) {
      sequence = this.app.currentSequence[chromosome].substring(start - 1, end);
      const gcCount = (sequence.match(/[GC]/gi) || []).length;
      gcContent = ((gcCount / sequence.length) * 100).toFixed(2);
    }

    // Get features in the region
    let featuresInRegion = [];
    if (this.app.currentAnnotations && this.app.currentAnnotations[chromosome]) {
      featuresInRegion = this.app.currentAnnotations[chromosome]
        .filter(feature => feature.start <= end && feature.end >= start)
        .map(feature => ({
          type: feature.type,
          name: feature.qualifiers?.gene || feature.qualifiers?.locus_tag || 'Unknown',
          product: feature.qualifiers?.product || 'Unknown',
          start: feature.start,
          end: feature.end,
          strand: feature.strand === -1 ? '-' : '+',
          length: feature.end - feature.start + 1,
        }));
    }

    // Get user-defined features in the region
    let userFeaturesInRegion = [];
    if (this.app.userDefinedFeatures && this.app.userDefinedFeatures[chromosome]) {
      userFeaturesInRegion = Object.values(this.app.userDefinedFeatures[chromosome])
        .filter(feature => feature.start <= end && feature.end >= start)
        .map(feature => ({
          type: feature.type,
          name: feature.name,
          description: feature.description || '',
          start: feature.start,
          end: feature.end,
          strand: feature.strand === -1 ? '-' : '+',
          length: feature.end - feature.start + 1,
        }));
    }

    return {
      hasRegion: true,
      chromosome: chromosome,
      start: start,
      end: end,
      length: length,
      centerPosition: Math.floor((start + end) / 2),

      // Sequence information
      hasSequence: !!sequence,
      gcContent: gcContent,
      sequencePreview: sequence ? sequence.substring(0, 100) + (sequence.length > 100 ? '...' : '') : null,

      // Features information
      featuresCount: featuresInRegion.length,
      features: featuresInRegion,
      userFeaturesCount: userFeaturesInRegion.length,
      userFeatures: userFeaturesInRegion,

      // Statistics
      statistics: {
        totalFeatures: featuresInRegion.length + userFeaturesInRegion.length,
        geneCount: featuresInRegion.filter(f => f.type === 'gene' || f.type === 'CDS').length,
        rnaCount: featuresInRegion.filter(f => f.type.includes('RNA')).length,
      },
    };
  }

  /**
   * Get information about user's sequence selection
   * @returns {Object} Sequence selection details
   */
  getSequenceSelection() {
    return this.services.analysis.getSequenceSelection();
  }

  async getMultipleCodingSequences(params) {
    const { identifiers, includeProtein = true, format = 'object' } = params;

    if (!identifiers || !Array.isArray(identifiers)) {
      throw new Error('Identifiers array is required');
    }

    if (identifiers.length === 0) {
      throw new Error('At least one identifier is required');
    }

    if (identifiers.length > 50) {
      throw new Error('Maximum 50 identifiers allowed per request');
    }

    // Use MicrobeGenomicsFunctions to get multiple coding sequences
    if (!window.MicrobeFns || !window.MicrobeFns.getMultipleCodingSequences) {
      throw new Error('MicrobeGenomicsFunctions not available');
    }

    try {
      const results = window.MicrobeFns.getMultipleCodingSequences(identifiers);

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      const response = {
        totalRequested: identifiers.length,
        successful: successful.length,
        failed: failed.length,
        results: successful.map(result => ({
          identifier: result.identifier,
          geneName: result.geneName,
          locusTag: result.locusTag,
          chromosome: result.chromosome,
          position: `${result.start}-${result.end}`,
          strand: result.strand,
          length: result.length,
          gcContent: result.gcContent,
          geneType: result.geneType,
          codingSequence:
            format === 'sequence_only'
              ? result.codingSequence
              : result.codingSequence.substring(0, 100) + (result.codingSequence.length > 100 ? '...' : ''),
          proteinSequence: includeProtein
            ? format === 'sequence_only'
              ? result.proteinSequence
              : result.proteinSequence.substring(0, 50) + (result.proteinSequence.length > 50 ? '...' : '')
            : undefined,
          proteinLength: result.proteinLength,
        })),
        errors: failed.map(f => ({ identifier: f.identifier, error: f.error })),
      };

      // Add full sequences if requested
      if (format === 'full_sequences') {
        response.fullSequences = successful.map(result => ({
          identifier: result.identifier,
          geneName: result.geneName,
          codingSequence: result.codingSequence,
          proteinSequence: includeProtein ? result.proteinSequence : undefined,
        }));
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to get multiple coding sequences: ${error.message}`);
    }
  }

  async getOperons(params) {
    const { chromosome } = params;

    const chr = chromosome || this.app.currentChromosome;
    if (!chr) {
      throw new Error('No chromosome specified and none currently selected');
    }

    if (!this.app.currentAnnotations || !this.app.currentAnnotations[chr]) {
      throw new Error('No annotations loaded for chromosome');
    }

    const annotations = this.app.currentAnnotations[chr];
    const operons = this.app.detectOperons(annotations, chr);

    const operonSummary = operons.map(operon => ({
      name: operon.name,
      start: operon.start,
      end: operon.end,
      strand: operon.strand === -1 ? '-' : '+',
      geneCount: operon.genes.length,
      genes: operon.genes.map(g => g.qualifiers?.gene || g.qualifiers?.locus_tag || 'Unknown').slice(0, 5),
      length: operon.end - operon.start + 1,
    }));

    return {
      chromosome: chr,
      operonsFound: operons.length,
      operons: operonSummary,
    };
  }

  async zoomToGene(params) {
    const { geneName, chromosome, padding = 1000 } = params;

    const geneDetails = await this.getGeneDetails({ geneName, chromosome });

    if (!geneDetails.found || geneDetails.genes.length === 0) {
      throw new Error(`Gene "${geneName}" not found`);
    }

    const gene = geneDetails.genes[0]; // Use first match
    const newStart = Math.max(0, gene.start - padding);
    const newEnd = gene.end + padding;

    // Navigate to the gene location
    await this.navigateToPosition({
      chromosome: geneDetails.chromosome,
      start: newStart,
      end: newEnd,
    });

    return {
      geneName: geneName,
      gene: gene,
      zoomedRegion: `${newStart}-${newEnd}`,
      padding: padding,
      message: `Zoomed to gene ${gene.name} with ${padding}bp padding`,
    };
  }

  /**
   * Select a gene by name or locus tag, highlighting it in the genome view
   */
  async selectGene(params) {
    const { geneName, chromosome } = params;

    if (!this.app) {
      throw new Error('Genome browser not initialized');
    }

    if (!geneName) {
      throw new Error('Gene name is required');
    }

    // Find the gene across all chromosomes (multi-chromosome support)
    let searchResults = [];
    let foundChromosome = null;

    if (this.app.currentAnnotations) {
      // If a specific chromosome is requested, search only that one
      if (chromosome && this.app.currentAnnotations[chromosome]) {
        foundChromosome = chromosome;
        searchResults = this._searchGeneInChromosome(geneName, chromosome);
      } else {
        // Search across all chromosomes
        const allChromosomes = Object.keys(this.app.currentAnnotations);
        for (const chr of allChromosomes) {
          const chrResults = this._searchGeneInChromosome(geneName, chr);
          // Tag each result with its chromosome
          chrResults.forEach(r => {
            r.chromosome = chr;
          });
          searchResults = searchResults.concat(chrResults);
        }
        // Sort by relevance across all chromosomes
        searchResults.sort((a, b) => {
          if (b.relevanceScore !== a.relevanceScore) {
            return b.relevanceScore - a.relevanceScore;
          }
          return a.position - b.position;
        });
        searchResults = searchResults.slice(0, 20);
      }
    }

    if (searchResults.length === 0) {
      throw new Error(`Gene "${geneName}" not found. Try using find_gene_by_name to find the correct identifier.`);
    }

    // Use the best match
    const bestMatch = searchResults[0];
    const targetChromosome = bestMatch.chromosome || foundChromosome || this.app.currentChromosome;

    // Get the full annotation object for the gene (search results use a slim 'annotation' field)
    const geneAnnotation = bestMatch.annotation;
    if (!geneAnnotation || geneAnnotation.start === undefined) {
      throw new Error(
        `Gene "${geneName}" found but annotation data is incomplete. Try using find_gene_by_name instead.`
      );
    }

    // If the gene is on a different chromosome, switch to it
    if (targetChromosome && targetChromosome !== this.app.currentChromosome) {
      const chromosomeSelect = document.getElementById('chromosomeSelect');
      if (chromosomeSelect) {
        chromosomeSelect.value = targetChromosome;
        // Trigger the change event to actually switch the chromosome
        const event = new Event('change', { bubbles: true });
        chromosomeSelect.dispatchEvent(event);
        // Wait for the chromosome switch to complete
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Resolve the richest annotation object for this gene.
    // _searchGeneInChromosome stores direct references, so geneAnnotation may already
    // be the full object. However, it might be a 'gene' type feature with minimal
    // qualifiers (gene, locus_tag only). In GenBank files, the corresponding CDS
    // feature carries much richer data (product, translation, note, db_xref, etc.).
    // We always prefer CDS > mRNA > gene to match mouse-click sidebar behavior.
    let fullGene = geneAnnotation;
    if (this.app.currentAnnotations && this.app.currentAnnotations[targetChromosome]) {
      const targetName = geneAnnotation.qualifiers?.gene || geneAnnotation.qualifiers?.locus_tag;

      if (targetName) {
        // Find ALL annotations sharing this gene name/locus_tag at the same locus
        const candidates = this.app.currentAnnotations[targetChromosome].filter(a => {
          if (!a.qualifiers) return false;
          const aGene = this.app.getQualifierValue(a.qualifiers, 'gene');
          const aLocus = this.app.getQualifierValue(a.qualifiers, 'locus_tag');
          return (aGene && aGene === targetName) || (aLocus && aLocus === targetName);
        });

        if (candidates.length > 0) {
          // Prefer CDS (richest qualifiers) > mRNA > others > gene (minimal qualifiers)
          const typePriority = type => {
            switch ((type || '').toUpperCase()) {
              case 'CDS':
                return 3;
              case 'MRNA':
                return 2;
              case 'GENE':
                return 0;
              default:
                return 1;
            }
          };
          candidates.sort((a, b) => {
            const typeDiff = typePriority(b.type) - typePriority(a.type);
            if (typeDiff !== 0) return typeDiff;
            // Among same type, prefer the one with more qualifiers
            return Object.keys(b.qualifiers || {}).length - Object.keys(a.qualifiers || {}).length;
          });
          fullGene = candidates[0];
        }
      } else {
        // No gene name available — fall back to exact position match
        const posMatch = this.app.currentAnnotations[targetChromosome].find(
          a =>
            a.start === geneAnnotation.start &&
            a.end === geneAnnotation.end &&
            a.type === geneAnnotation.type &&
            a.strand === geneAnnotation.strand
        );
        if (posMatch) fullGene = posMatch;
      }
    }

    // Navigate to the gene if it's not in the current view
    const currentStart = this.app.currentPosition?.start || 0;
    const currentEnd = this.app.currentPosition?.end || 0;
    const needNavigation = fullGene.end < currentStart || fullGene.start > currentEnd;
    if (needNavigation) {
      // Gene is outside current view, navigate to it
      const padding = Math.max(500, Math.floor((fullGene.end - fullGene.start) * 0.2));
      await this.navigateToPosition({
        chromosome: targetChromosome,
        start: Math.max(0, fullGene.start - padding),
        end: fullGene.end + padding,
      });

      // Wait for the genome view to finish rendering after navigation
      // This ensures DOM elements for the gene are available before highlighting
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    // Use the same function as user click: TrackRenderer.showGeneDetails()
    // This ensures 100% consistent behavior with mouse-click selection
    const operonInfo = bestMatch.operonInfo || null;
    if (this.app.trackRenderer && typeof this.app.trackRenderer.showGeneDetails === 'function') {
      this.app.trackRenderer.showGeneDetails(fullGene, operonInfo);
    } else {
      // Fallback: call the individual methods directly
      if (typeof this.app.selectGene === 'function') {
        this.app.selectGene(fullGene, operonInfo);
      } else {
        this.app.selectedGene = { gene: fullGene, operonInfo };
      }
      try {
        this.app.showGeneDetailsPanel?.();
      } catch (e) {
        console.warn('Could not show gene details panel:', e.message);
      }
      try {
        this.app.populateGeneDetails?.(fullGene, operonInfo);
      } catch (e) {
        console.warn('Could not populate gene details:', e.message);
      }
      try {
        this.app.highlightGeneSequence?.(fullGene);
      } catch (e) {
        console.warn('Could not highlight gene sequence:', e.message);
      }
    }

    // If navigation occurred, re-apply gene highlighting after render
    // (highlightSelectedGene may have missed DOM elements during navigation render)
    if (needNavigation && typeof this.app.highlightSelectedGene === 'function') {
      setTimeout(() => {
        try {
          this.app.highlightSelectedGene(fullGene);
        } catch (e) {
          console.warn('Could not re-highlight gene after navigation:', e.message);
        }
      }, 600);
    }

    return {
      success: true,
      message: `Selected gene: ${fullGene.qualifiers?.gene || fullGene.qualifiers?.locus_tag || fullGene.type}`,
      gene_info: {
        name: fullGene.qualifiers?.gene || 'Unknown',
        locusTag: fullGene.qualifiers?.locus_tag || 'Unknown',
        product: fullGene.qualifiers?.product || 'Unknown',
        start: fullGene.start,
        end: fullGene.end,
        length: fullGene.end - fullGene.start + 1,
        strand: fullGene.strand === -1 ? '-' : '+',
        type: fullGene.type || 'Unknown',
        chromosome: targetChromosome,
      },
    };
  }

  /**
   * Search for a gene in a specific chromosome (helper for multi-chromosome support)
   */
  _searchGeneInChromosome(geneName, chromosome) {
    if (!this.app.currentAnnotations[chromosome]) {
      return [];
    }

    document.getElementById('chromosomeSelect')?.value;
    const annotations = this.app.currentAnnotations[chromosome];
    const searchTerm = geneName.toLowerCase();
    const results = [];

    annotations.forEach(annotation => {
      if (!annotation.qualifiers) return;

      const geneNameValue = this.app.getQualifierValue(annotation.qualifiers, 'gene') || '';
      const locusTag = this.app.getQualifierValue(annotation.qualifiers, 'locus_tag') || '';
      const product = this.app.getQualifierValue(annotation.qualifiers, 'product') || '';

      let relevanceScore;
      try {
        relevanceScore = this.calculateGeneRelevanceScore(searchTerm, geneNameValue, locusTag, product);
      } catch (error) {
        return;
      }

      if (relevanceScore && relevanceScore.score > 0) {
        results.push({
          type: 'gene',
          position: annotation.start,
          end: annotation.end,
          name: geneNameValue || locusTag || annotation.type,
          details: `${annotation.type}: ${product || 'No description'}`,
          // Reference the full annotation object directly (not a slim copy)
          // so that all qualifiers (translation, codon_start, etc.) are preserved
          annotation: annotation,
          relevanceScore: relevanceScore.score,
          matchType: relevanceScore.matchType,
          matchedField: relevanceScore.matchedField,
          chromosome: chromosome,
        });
      }
    });

    // Prioritize CDS > mRNA > gene > other feature types when relevance scores tie.
    // This ensures the richly-annotated CDS feature is selected rather than the
    // minimal 'gene' feature that only carries gene name and locus_tag qualifiers.
    const featureTypePriority = type => {
      switch ((type || '').toUpperCase()) {
        case 'CDS':
          return 3;
        case 'MRNA':
          return 2;
        case 'GENE':
          return 1;
        default:
          return 0;
      }
    };

    results.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      // Same relevance: prefer feature types with richer annotation data
      const typeDiff = featureTypePriority(b.annotation?.type) - featureTypePriority(a.annotation?.type);
      if (typeDiff !== 0) return typeDiff;
      return a.position - b.position;
    });

    return results.slice(0, 20);
  }

  /**
   * Select a sequence region by genomic coordinates
   */
  async selectSequenceRegion(params) {
    const { start, end, chromosome } = params;

    if (!this.app) {
      throw new Error('Genome browser not initialized');
    }

    if (start === undefined || end === undefined) {
      throw new Error('Start and end positions are required');
    }

    const regionStart = parseInt(start);
    const regionEnd = parseInt(end);

    if (isNaN(regionStart) || isNaN(regionEnd)) {
      throw new Error('Start and end positions must be valid numbers');
    }

    if (regionStart > regionEnd) {
      throw new Error(`Invalid region: start (${regionStart}) cannot be greater than end (${regionEnd})`);
    }

    // Determine the chromosome
    const targetChromosome = chromosome || this.app.currentChromosome;
    if (!targetChromosome) {
      throw new Error('No chromosome specified and no current chromosome available');
    }

    // Validate chromosome exists
    if (this.app.currentSequence && !this.app.currentSequence[targetChromosome]) {
      throw new Error(`Chromosome "${targetChromosome}" not found in loaded genome`);
    }

    // Validate positions are within sequence range
    if (this.app.currentSequence && this.app.currentSequence[targetChromosome]) {
      const seqLength = this.app.currentSequence[targetChromosome].length;
      if (regionStart < 1 || regionEnd > seqLength) {
        console.warn(`Region ${regionStart}-${regionEnd} extends beyond sequence length (${seqLength}), clamping`);
      }
    }

    // Clear existing sequence selection
    if (typeof this.app.clearSequenceSelection === 'function') {
      this.app.clearSequenceSelection();
    }

    // Set the sequence selection
    this.app.sequenceSelection = {
      start: regionStart,
      end: regionEnd,
      active: true,
      chromosome: targetChromosome,
      source: 'tool', // Mark that this selection came from a tool call
      geneName: `Region ${regionStart}-${regionEnd}`,
    };

    // Repaint the sequence selection overlay. The legacy this.app.highlightSequenceRegion
    // hook was never implemented (silent no-op); use the HighlightManager render pass,
    // which redraws any persistent highlights over the current view.
    if (this.app.highlightManager && typeof this.app.highlightManager.renderHighlights === 'function') {
      try {
        this.app.highlightManager.renderHighlights();
      } catch (e) {
        console.warn('Could not repaint highlights:', e.message);
      }
    }

    // Update status
    const selectionLength = regionEnd - regionStart + 1;
    const statusMessage = `🔵 Region Selected: ${regionStart.toLocaleString()}-${regionEnd.toLocaleString()} (${selectionLength.toLocaleString()} bp) on ${targetChromosome}`;

    if (typeof this.app.updateStatus === 'function') {
      this.app.updateStatus(statusMessage, {
        highlight: true,
        color: '#3b82f6',
        duration: 3000,
        restore: true,
      });
    }

    if (typeof this.app.showNotification === 'function') {
      this.app.showNotification(statusMessage, 'info');
    }

    return {
      success: true,
      message: `Selected region: ${regionStart}-${regionEnd} on ${targetChromosome}`,
      region: {
        chromosome: targetChromosome,
        start: regionStart,
        end: regionEnd,
        length: selectionLength,
      },
    };
  }

  /**
   * Add a persistent positional highlight (a colored box over a genomic range).
   * Supports multiple and overlapping highlights. Coordinates are 1-based inclusive.
   */
  highlightRegion(params = {}) {
    if (!this.app || !this.app.highlightManager) {
      throw new Error('Highlight manager not available');
    }
    const { start, end, chromosome, label, color } = params;
    if (start === undefined && end === undefined) {
      throw new Error('Start or end position is required');
    }
    const s = start !== undefined ? parseInt(start, 10) : undefined;
    const e = end !== undefined ? parseInt(end, 10) : undefined;
    if ((start !== undefined && isNaN(s)) || (end !== undefined && isNaN(e))) {
      throw new Error('Highlight position must be a valid number');
    }

    const targetChromosome = chromosome || this.app.currentChromosome;
    if (this.app.currentSequence && targetChromosome && !this.app.currentSequence[targetChromosome]) {
      throw new Error(`Chromosome "${targetChromosome}" not found in loaded genome`);
    }

    const highlight = this.app.highlightManager.addHighlight({
      chromosome: targetChromosome,
      start: s,
      end: e,
      label: label ? String(label) : '',
      color: color || undefined,
      createdBy: 'ai',
    });

    const length = highlight.end - highlight.start + 1;
    return {
      success: true,
      message: `Highlighted ${highlight.chromosome || ''}:${highlight.start}-${highlight.end} (${length} bp)`,
      highlight,
      count: this.app.highlightManager.listHighlights().length,
    };
  }

  /**
   * Remove a single highlight by id, or by exact 1-based start/end match.
   */
  removeHighlight(params = {}) {
    if (!this.app || !this.app.highlightManager) {
      throw new Error('Highlight manager not available');
    }
    const { id, start, end } = params;
    if (id === undefined && (start === undefined || end === undefined)) {
      throw new Error('Provide a highlight id, or both start and end, to remove');
    }

    const selector = id !== undefined ? { id } : { start: parseInt(start, 10), end: parseInt(end, 10) };
    const removed = this.app.highlightManager.removeHighlight(selector);

    return {
      success: removed.length > 0,
      message: removed.length > 0 ? `Removed ${removed.length} highlight(s)` : 'No matching highlight found',
      removed,
      count: this.app.highlightManager.listHighlights().length,
    };
  }

  /**
   * List all persistent highlights for the current tab.
   */
  listHighlights() {
    if (!this.app || !this.app.highlightManager) {
      throw new Error('Highlight manager not available');
    }
    const highlights = this.app.highlightManager.listHighlights();
    return {
      success: true,
      count: highlights.length,
      highlights,
      message: highlights.length > 0 ? `${highlights.length} highlighted region(s)` : 'No highlighted regions',
    };
  }

  /**
   * Remove every persistent highlight for the current tab.
   */
  clearHighlights() {
    if (!this.app || !this.app.highlightManager) {
      throw new Error('Highlight manager not available');
    }
    const count = this.app.highlightManager.clearHighlights();
    return {
      success: true,
      message: count > 0 ? `Cleared ${count} highlight(s)` : 'No highlights to clear',
      cleared: count,
      count: 0,
    };
  }

  getChromosomeList() {
    if (!this.app || !this.app.currentSequence) {
      return {
        chromosomes: [],
        count: 0,
        message: 'No genome sequence loaded',
      };
    }

    const chromosomes = Object.keys(this.app.currentSequence);
    const chromosomeInfo = chromosomes.map(chr => ({
      name: chr,
      length: this.app.currentSequence[chr].length,
      isSelected: chr === this.app.currentChromosome,
    }));

    return {
      chromosomes: chromosomeInfo,
      count: chromosomes.length,
      currentChromosome: this.app.currentChromosome || 'None selected',
    };
  }

  getTrackStatus() {
    if (!this.app) {
      throw new Error('Genome browser not initialized');
    }

    const visibleTracks = this.getVisibleTracks();
    const allTracks = ['genes', 'primers', 'sequence', 'gc', 'variants', 'reads', 'proteins'];

    const trackStatus = allTracks.map(track => ({
      name: track,
      visible: visibleTracks.includes(track),
      description: this.getTrackDescription(track),
    }));

    return {
      visibleTracks: visibleTracks,
      totalTracks: allTracks.length,
      tracks: trackStatus,
    };
  }

  getTrackDescription(trackName) {
    const descriptions = {
      genes: 'Gene annotations and features',
      primers: 'Primer annotations and binding direction',
      sequence: 'DNA sequence display',
      gc: 'GC content visualization',
      variants: 'VCF variant data',
      reads: 'Aligned sequencing reads',
      proteins: 'Protein coding sequences',
    };
    return descriptions[trackName] || 'Unknown track';
  }

  // ========================================
  // NEW COMPREHENSIVE GENOMICS FUNCTION CALLS
  // ========================================

  // IUPAC ambiguity code map for motif expansion
  static IUPAC_CODES = {
    A: 'A',
    C: 'C',
    G: 'G',
    T: 'T',
    R: '[AG]',
    Y: '[CT]',
    S: '[GC]',
    W: '[AT]',
    K: '[GT]',
    M: '[AC]',
    B: '[CGT]',
    D: '[AGT]',
    H: '[ACT]',
    V: '[ACG]',
    N: '[ACGT]',
  };

  // IUPAC complement map for reverse complementing IUPAC motifs
  static IUPAC_COMPLEMENT = {
    A: 'T',
    T: 'A',
    G: 'C',
    C: 'G',
    R: 'Y',
    Y: 'R',
    S: 'S',
    W: 'W',
    K: 'M',
    M: 'K',
    B: 'V',
    D: 'H',
    H: 'D',
    V: 'B',
    N: 'N',
  };

  /**
   * Reverse complement a motif string with IUPAC code support.
   * Unlike this.reverseComplement() which only handles ACGTN,
   * this method correctly complements all IUPAC ambiguity codes.
   * @param {string} motif - Motif string (may contain IUPAC codes)
   * @returns {string} Reverse-complemented motif
   */
  _reverseComplementIUPAC(motif) {
    return motif
      .toUpperCase()
      .split('')
      .reverse()
      .map(b => ChatManager.IUPAC_COMPLEMENT[b] || b)
      .join('');
  }

  /**
   * Expand IUPAC ambiguity codes in a motif to a regex pattern string.
   * If the motif contains no IUPAC codes beyond ACGT, returns null (use exact match).
   * @param {string} motif - Motif possibly containing IUPAC codes
   * @returns {string|null} Expanded regex pattern string, or null if no IUPAC codes present
   */
  _expandIUPACToRegex(motif) {
    const pureBases = /^[ACGTacgt]+$/;
    if (pureBases.test(motif)) return null;

    let regex = '';
    let hasAmbiguity = false;
    for (const ch of motif.toUpperCase()) {
      const expanded = ChatManager.IUPAC_CODES[ch];
      if (expanded && expanded !== ch) {
        hasAmbiguity = true;
        regex += expanded;
      } else if (expanded) {
        regex += expanded;
      } else {
        regex += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
    }
    return hasAmbiguity ? regex : null;
  }

  // 1. MOTIF AND PATTERN SEARCHING
  async searchMotif(params) {
    const {
      pattern,
      motif,
      chromosome,
      start,
      end,
      strand = 'both',
      max_mismatches = 0,
      allowMismatches,
      case_sensitive = false,
    } = params;

    // Normalize: accept both 'pattern' and 'motif' parameter names
    const motifPattern = (motif || pattern || '').toUpperCase();
    const maxMismatches = allowMismatches ?? max_mismatches ?? 0;

    if (!motifPattern) {
      return { success: false, error: 'Motif pattern is required (use "motif" or "pattern" parameter)' };
    }

    const chr = chromosome || this.app.currentChromosome;
    if (!chr) {
      return { success: false, error: 'No chromosome specified and none currently selected' };
    }

    const regionStart = start || this.app.currentPosition?.start || 0;
    const regionEnd = end || this.app.currentPosition?.end || this.app.currentSequence?.[chr]?.length || 0;

    const sequence = await this.app.getSequenceForRegion(chr, regionStart, regionEnd);
    if (!sequence || sequence.length === 0) {
      return { success: false, error: 'No sequence data available for the specified region' };
    }

    const searchSeq = case_sensitive ? sequence : sequence.toUpperCase();
    const matches = [];
    const maxResults = 500;

    // Decide search strategy: regex (for IUPAC or mismatches=0) vs brute-force (for mismatches>0 without IUPAC)
    const iupacRegex = this._expandIUPACToRegex(motifPattern);

    if (maxMismatches === 0) {
      // ---- Fast regex path (exact / IUPAC) ----
      const regexPattern = iupacRegex || motifPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = case_sensitive ? 'g' : 'gi';
      const regex = new RegExp(regexPattern, flags);

      // Forward strand
      if (strand === '+' || strand === 'both') {
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(searchSeq)) !== null && matches.length < maxResults) {
          matches.push({
            position: regionStart + m.index + 1, // 1-based
            end: regionStart + m.index + m[0].length,
            sequence: m[0],
            strand: '+',
            mismatches: 0,
          });
          if (m[0].length === 0) regex.lastIndex++; // zero-length match guard
        }
      }

      // Reverse strand
      if (strand === '-' || strand === 'both') {
        const rcMotif = this._reverseComplementIUPAC(motifPattern);
        const rcRegexStr = iupacRegex
          ? this._expandIUPACToRegex(rcMotif) || rcMotif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          : rcMotif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rcRegex = new RegExp(rcRegexStr, flags);
        const rcSeq = this.reverseComplement(searchSeq);
        rcRegex.lastIndex = 0;
        let m;
        while ((m = rcRegex.exec(rcSeq)) !== null && matches.length < maxResults) {
          // Map position from reverse-complement space back to forward coordinates
          const fwdPos = searchSeq.length - m.index - m[0].length;
          matches.push({
            position: regionStart + fwdPos + 1, // 1-based
            end: regionStart + fwdPos + m[0].length,
            sequence: m[0],
            strand: '-',
            mismatches: 0,
          });
          if (m[0].length === 0) rcRegex.lastIndex++;
        }
      }
    } else {
      // ---- Mismatch-tolerant path (brute-force with early exit) ----
      const motifLen = motifPattern.length;

      // Forward strand
      if (strand === '+' || strand === 'both') {
        for (let i = 0; i <= searchSeq.length - motifLen && matches.length < maxResults; i++) {
          const sub = searchSeq.substring(i, i + motifLen);
          const mm = this.countMismatches(sub, motifPattern);
          if (mm <= maxMismatches) {
            matches.push({
              position: regionStart + i + 1, // 1-based
              end: regionStart + i + motifLen,
              sequence: sub,
              strand: '+',
              mismatches: mm,
            });
          }
        }
      }

      // Reverse strand
      if (strand === '-' || strand === 'both') {
        const rcMotif = this._reverseComplementIUPAC(motifPattern);
        const rcMotifLen = rcMotif.length;
        for (let i = 0; i <= searchSeq.length - rcMotifLen && matches.length < maxResults; i++) {
          const sub = searchSeq.substring(i, i + rcMotifLen);
          const mm = this.countMismatches(sub, rcMotif);
          if (mm <= maxMismatches) {
            matches.push({
              position: regionStart + i + 1,
              end: regionStart + i + rcMotifLen,
              sequence: sub,
              strand: '-',
              mismatches: mm,
            });
          }
        }
      }
    }

    // Sort by position
    matches.sort((a, b) => a.position - b.position);

    // Compute summary statistics
    const fwdCount = matches.filter(m => m.strand === '+').length;
    const revCount = matches.filter(m => m.strand === '-').length;
    const regionLen = regionEnd - regionStart;
    const density = regionLen > 0 ? ((matches.length / regionLen) * 1000).toFixed(3) : 0;

    return {
      success: true,
      motif: motifPattern,
      chromosome: chr,
      searchRegion: { start: regionStart, end: regionEnd, length: regionLen },
      strandSearched: strand,
      allowedMismatches: maxMismatches,
      iupacExpanded: iupacRegex !== null,
      totalMatches: matches.length,
      forwardMatches: fwdCount,
      reverseMatches: revCount,
      densityPerKb: parseFloat(density),
      matches: matches.slice(0, maxResults),
    };
  }

  async searchPattern(params) {
    const { regex, chromosome, start, end, description = 'Custom pattern' } = params;

    const chr = chromosome || this.app.currentChromosome;
    if (!chr) {
      throw new Error('No chromosome specified and none currently selected');
    }

    const regionStart = start || this.app.currentPosition?.start || 0;
    const regionEnd = end || this.app.currentPosition?.end || this.app.currentSequence[chr]?.length || 0;

    const sequence = await this.app.getSequenceForRegion(chr, regionStart, regionEnd);
    const pattern = new RegExp(regex, 'gi');
    const matches = [];

    let match;
    while ((match = pattern.exec(sequence)) !== null) {
      matches.push({
        position: regionStart + match.index,
        sequence: match[0],
        length: match[0].length,
      });

      // Prevent infinite loop on zero-length matches
      if (match.index === pattern.lastIndex) {
        pattern.lastIndex++;
      }
    }

    return {
      regex: regex,
      description: description,
      chromosome: chr,
      searchRegion: `${regionStart}-${regionEnd}`,
      matchesFound: matches.length,
      matches: matches.slice(0, 50),
    };
  }

  // 2. NEARBY FEATURES AND CONTEXT
  async getNearbyFeatures(params) {
    const { chromosome, position, distance = 5000, featureTypes = [] } = params;

    const chr = chromosome || this.app.currentChromosome;
    if (!chr) {
      throw new Error('No chromosome specified and none currently selected');
    }

    if (!this.app.currentAnnotations || !this.app.currentAnnotations[chr]) {
      throw new Error('No annotations loaded for chromosome');
    }

    const annotations = this.app.currentAnnotations[chr];
    const nearbyFeatures = annotations.filter(feature => {
      if (featureTypes.length > 0 && !featureTypes.includes(feature.type)) {
        return false;
      }

      const featureDistance = Math.min(Math.abs(feature.start - position), Math.abs(feature.end - position));

      return featureDistance <= distance;
    });

    // Sort by distance
    nearbyFeatures.sort((a, b) => {
      const distA = Math.min(Math.abs(a.start - position), Math.abs(a.end - position));
      const distB = Math.min(Math.abs(b.start - position), Math.abs(b.end - position));
      return distA - distB;
    });

    const featureSummary = nearbyFeatures.map(feature => ({
      name: feature.qualifiers?.gene || feature.qualifiers?.locus_tag || 'Unknown',
      type: feature.type,
      start: feature.start,
      end: feature.end,
      strand: feature.strand === -1 ? '-' : '+',
      distance: Math.min(Math.abs(feature.start - position), Math.abs(feature.end - position)),
      direction: feature.start > position ? 'downstream' : feature.end < position ? 'upstream' : 'overlapping',
    }));

    return {
      chromosome: chr,
      position: position,
      searchDistance: distance,
      featuresFound: nearbyFeatures.length,
      features: featureSummary.slice(0, 20),
    };
  }

  async findIntergenicRegions(params) {
    const { chromosome, minLength = 100 } = params;

    const chr = chromosome || this.app.currentChromosome;
    if (!chr) {
      throw new Error('No chromosome specified and none currently selected');
    }

    if (!this.app.currentAnnotations || !this.app.currentAnnotations[chr]) {
      throw new Error('No annotations loaded for chromosome');
    }

    const annotations = this.app.currentAnnotations[chr];
    const genes = annotations.filter(f => f.type === 'gene' || f.type === 'CDS').sort((a, b) => a.start - b.start);
    const intergenicRegions = [];

    for (let i = 0; i < genes.length - 1; i++) {
      const currentGene = genes[i];
      const nextGene = genes[i + 1];
      const intergenicStart = currentGene.end + 1;
      const intergenicEnd = nextGene.start - 1;
      const length = intergenicEnd - intergenicStart + 1;

      if (length >= minLength) {
        intergenicRegions.push({
          start: intergenicStart,
          end: intergenicEnd,
          length: length,
          upstreamGene: currentGene.qualifiers?.gene || currentGene.qualifiers?.locus_tag || 'Unknown',
          downstreamGene: nextGene.qualifiers?.gene || nextGene.qualifiers?.locus_tag || 'Unknown',
        });
      }
    }

    return {
      chromosome: chr,
      minLength: minLength,
      regionsFound: intergenicRegions.length,
      totalIntergenicLength: intergenicRegions.reduce((sum, region) => sum + region.length, 0),
      regions: intergenicRegions.slice(0, 20),
    };
  }

  // 3. RESTRICTION ENZYME ANALYSIS (delegated to RestrictionDigestService)
  async findRestrictionSites(params) {
    return await this.services.restriction.findRestrictionSites(params);
  }

  async virtualDigest(params) {
    return await this.services.restriction.virtualDigest(params);
  }

  async listRestrictionEnzymes(params = {}) {
    return await this.services.restriction.listEnzymes(params);
  }

  async codonUsageAnalysis(params) {
    return this.services.analysis.codonUsageAnalysis(params);
  }

  /**
   * Genome-wide codon usage analysis
   * Analyzes codon usage patterns across all CDS features in the genome
   */
  async genomeCodonUsageAnalysis(params) {
    if (!this.services || !this.services.analysis) {
      console.error('[ChatManager] analysis not initialized');
      return;
    }
    return await this.services.analysis.genomeCodonUsageAnalysis(params);
  }

  // Amino acid composition analysis
  async aminoAcidComposition(params) {
    if (!this.services || !this.services.analysis) {
      console.error('[ChatManager] analysis not initialized');
      return;
    }
    return await this.services.analysis.aminoAcidComposition(params);
  }

  // 5. BOOKMARK AND SESSION MANAGEMENT
  async bookmarkPosition(params) {
    const { name, chromosome, start, end, notes = '' } = params;

    const chr = chromosome || this.app.currentChromosome;
    const currentPosition = this.toExternalGenomePosition(this.app.currentPosition);
    const bookmarkStart = start ?? currentPosition?.start;
    const bookmarkEnd = end ?? currentPosition?.end;

    if (!chr || bookmarkStart === undefined || bookmarkEnd === undefined) {
      throw new Error('Invalid bookmark parameters');
    }

    const bookmark = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      name: name,
      chromosome: chr,
      start: bookmarkStart,
      end: bookmarkEnd,
      notes: notes,
      created: new Date().toISOString(),
    };

    // Store in configuration
    const bookmarks = this.configManager.get('bookmarks', []);
    bookmarks.push(bookmark);
    await this.configManager.set('bookmarks', bookmarks);
    await this.configManager.save();
    this.app?.bookmarkPanelUI?.refreshIfOpen?.();

    return {
      success: true,
      bookmark: bookmark,
      message: `Bookmarked "${name}" at ${chr}:${bookmarkStart}-${bookmarkEnd}`,
    };
  }

  getBookmarks(params) {
    const { chromosome } = params;
    const bookmarks = this.configManager.get('bookmarks', []);
    const viewStates = this.getAllStoredViewStates();

    let filteredBookmarks = bookmarks;
    if (chromosome) {
      filteredBookmarks = bookmarks.filter(b => b.chromosome === chromosome);
    }

    let filteredViewStates = viewStates;
    if (chromosome) {
      filteredViewStates = viewStates.filter(state => state.chromosome === chromosome);
    }

    return {
      totalBookmarks: bookmarks.length,
      filteredBookmarks: filteredBookmarks.length,
      totalViewStates: viewStates.length,
      filteredViewStates: filteredViewStates.length,
      chromosome: chromosome || 'all',
      bookmarks: filteredBookmarks,
      viewStates: filteredViewStates,
    };
  }

  async saveViewState(params) {
    const { name, description = '' } = params;

    const visibleTracks = this.getVisibleTracks();
    const trackSettings = {};
    try {
      if (this.app.genomeBrowser && this.app.genomeBrowser.trackRenderer) {
        const trackTypes = ['genes', 'sequence', 'gc', 'variants', 'reads', 'proteins'];
        for (const type of trackTypes) {
          try {
            trackSettings[type] = this.app.genomeBrowser.trackRenderer.getTrackSettings(type);
          } catch (e) {
            // Track type may not support settings
          }
        }
      }
    } catch (e) {
      // trackRenderer not available
    }

    let activeTabId = null;
    try {
      if (this.app.tabManager) {
        activeTabId = this.app.tabManager.activeTabId;
      }
    } catch (e) {
      // tabManager not available
    }

    const viewState = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      name: name,
      description: description,
      chromosome: this.app.currentChromosome,
      position: this.app.currentPosition ? { ...this.app.currentPosition } : null,
      visibleTracks: visibleTracks,
      trackSettings: trackSettings,
      activeTabId: activeTabId,
      created: new Date().toISOString(),
    };

    const savedStates = this.configManager.get('viewStates', []);
    savedStates.push(viewState);
    await this.configManager.set('viewStates', savedStates);
    await this.configManager.save();

    this.setStoredViewStates(savedStates);
    this.app?.bookmarkPanelUI?.refreshIfOpen?.();

    return {
      success: true,
      viewState: viewState,
      message: `Saved view state "${name}"`,
    };
  }

  async restoreViewState(params = {}) {
    const { id, name } = params;
    const restoreTrackVisibility = this.coerceViewStateBoolean(
      params.restoreTrackVisibility ?? params.restoreTracks ?? params.applyTrackVisibility,
      true
    );
    const restoreTrackSettings = this.coerceViewStateBoolean(
      params.restoreTrackSettings ?? params.applyTrackSettings,
      true
    );
    const restoreActiveTab = this.coerceViewStateBoolean(params.restoreActiveTab ?? params.switchTab, true);

    if (!id && !name) {
      throw new Error('restore_view_state requires either id or name');
    }

    const { viewState, matchCount } = this.findSavedViewState({ id, name });
    if (!viewState) {
      const identifier = id ? `id "${id}"` : `name "${name}"`;
      throw new Error(`Saved view state with ${identifier} not found`);
    }

    const position = viewState.position || {};
    if (!viewState.chromosome || position.start === undefined || position.end === undefined) {
      throw new Error(`Saved view state "${viewState.name || viewState.id}" does not contain a restorable position`);
    }

    const warnings = [];
    const restored = {
      tab: null,
      position: null,
      trackVisibility: [],
      trackSettings: [],
    };

    if (restoreActiveTab && viewState.activeTabId) {
      try {
        const tabResult = await this.switchToTab({ tab_id: viewState.activeTabId });
        restored.tab = tabResult.tab_id || viewState.activeTabId;
      } catch (error) {
        warnings.push(`Active tab ${viewState.activeTabId} could not be restored: ${error.message}`);
      }
    }

    const navigationResult = await this.navigateToPosition({
      chromosome: viewState.chromosome,
      start: position.start,
      end: position.end,
    });
    restored.position = {
      chromosome: viewState.chromosome,
      start: position.start,
      end: position.end,
      navigationResult,
    };

    if (restoreTrackVisibility && Array.isArray(viewState.visibleTracks)) {
      const visibilityResult = await this.restoreViewStateTrackVisibility(viewState.visibleTracks);
      restored.trackVisibility = visibilityResult.restored;
      warnings.push(...visibilityResult.warnings);
    }

    if (restoreTrackSettings && viewState.trackSettings && typeof viewState.trackSettings === 'object') {
      const settingsResult = this.restoreViewStateTrackSettings(viewState.trackSettings);
      restored.trackSettings = settingsResult.restored;
      warnings.push(...settingsResult.warnings);
    }

    return {
      success: true,
      viewState,
      restored,
      warnings,
      matchCount,
      message: `Restored view state "${viewState.name || viewState.id}"`,
    };
  }

  getAllStoredViewStates() {
    const states = [];
    const seen = new Set();
    const appendStates = candidateStates => {
      if (!Array.isArray(candidateStates)) return;

      for (const state of candidateStates) {
        if (!state || typeof state !== 'object') continue;
        const key = state.id || `${state.name || 'unnamed'}:${state.created || states.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        states.push(state);
      }
    };

    try {
      appendStates(this.configManager?.get('viewStates', []));
    } catch (error) {
      console.warn('Failed to read view states from configManager:', error);
    }

    appendStates(this.getStoredViewStates());
    return states;
  }

  findSavedViewState({ id, name }) {
    const viewStates = this.getAllStoredViewStates();
    let matches = [];

    if (id) {
      matches = viewStates.filter(state => state.id === id);
    } else if (name) {
      matches = viewStates.filter(state => state.name === name);
      if (matches.length === 0) {
        const normalizedName = String(name).trim().toLowerCase();
        matches = viewStates.filter(
          state =>
            String(state.name || '')
              .trim()
              .toLowerCase() === normalizedName
        );
      }
    }

    matches.sort((a, b) => {
      const timeA = Date.parse(a.created || 0) || 0;
      const timeB = Date.parse(b.created || 0) || 0;
      return timeB - timeA;
    });

    return {
      viewState: matches[0] || null,
      matchCount: matches.length,
    };
  }

  coerceViewStateBoolean(value, defaultValue) {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalizedValue = value.trim().toLowerCase();
      if (['true', 'yes', 'y', '1', 'on', 'enable', 'enabled'].includes(normalizedValue)) return true;
      if (['false', 'no', 'n', '0', 'off', 'disable', 'disabled'].includes(normalizedValue)) return false;
    }
    return Boolean(value);
  }

  normalizeViewStateTrackName(trackName) {
    const normalized = String(trackName || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const aliases = {
      gc_content: 'gc',
      gccontent: 'gc',
      wig: 'wigTracks',
      wig_tracks: 'wigTracks',
      wigtracks: 'wigTracks',
      blast_results: 'blast',
      primer: 'primers',
      protein: 'proteins',
    };
    return aliases[normalized] || normalized;
  }

  getRestorableViewStateTrackNames() {
    return ['genes', 'gc', 'variants', 'reads', 'proteins', 'primers', 'wigTracks', 'sequence', 'actions', 'blast'];
  }

  async restoreViewStateTrackVisibility(savedVisibleTracks) {
    const warnings = [];
    const restored = [];
    const targetVisibleTracks = new Set(
      savedVisibleTracks.map(track => this.normalizeViewStateTrackName(track)).filter(Boolean)
    );

    const candidateTracks = new Set([
      ...this.getRestorableViewStateTrackNames(),
      ...Array.from(targetVisibleTracks),
      ...this.getVisibleTracks().map(track => this.normalizeViewStateTrackName(track)),
    ]);

    for (const trackName of candidateTracks) {
      const normalizedTrackName = this.normalizeViewStateTrackName(trackName);
      if (!normalizedTrackName) continue;

      try {
        const result = await this.toggleTrack({
          track_name: normalizedTrackName,
          visible: targetVisibleTracks.has(normalizedTrackName),
        });
        restored.push({
          track: normalizedTrackName,
          visible: result.visible,
          noChangeNeeded: result.noChangeNeeded === true,
        });
      } catch (error) {
        warnings.push(`Track visibility for ${normalizedTrackName} could not be restored: ${error.message}`);
      }
    }

    return { restored, warnings };
  }

  restoreViewStateTrackSettings(trackSettings) {
    const warnings = [];
    const restored = [];
    const browserWindow = typeof window !== 'undefined' ? window : null;
    const genomeBrowser = this.app?.genomeBrowser || this.genomeBrowser || browserWindow?.genomeBrowser;
    const trackRenderer = genomeBrowser?.trackRenderer;

    if (!trackRenderer || typeof trackRenderer.applySettingsToTrack !== 'function') {
      return {
        restored,
        warnings: ['Track settings could not be restored because TrackRenderer is unavailable'],
      };
    }

    for (const [trackType, settings] of Object.entries(trackSettings)) {
      if (!settings || typeof settings !== 'object') continue;

      try {
        const currentSettings =
          typeof trackRenderer.getTrackSettings === 'function' ? trackRenderer.getTrackSettings(trackType) : {};
        const mergedSettings = { ...(currentSettings || {}), ...settings };

        if (typeof trackRenderer.saveTrackSettings === 'function') {
          trackRenderer.saveTrackSettings(trackType, mergedSettings);
        }
        trackRenderer.applySettingsToTrack(trackType, mergedSettings);
        restored.push(trackType);
      } catch (error) {
        warnings.push(`Track settings for ${trackType} could not be restored: ${error.message}`);
      }
    }

    return { restored, warnings };
  }

  getStoredViewStates() {
    try {
      const stored = localStorage.getItem('genome_browser_view_states');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      return [];
    }
  }

  setStoredViewStates(viewStates) {
    try {
      localStorage.setItem('genome_browser_view_states', JSON.stringify(viewStates));
    } catch (error) {
      // localStorage unavailable
    }
  }

  // Helper methods
  countMismatches(seq1, seq2) {
    if (seq1.length !== seq2.length) return Infinity;
    let mismatches = 0;
    for (let i = 0; i < seq1.length; i++) {
      if (seq1[i] !== seq2[i]) mismatches++;
    }
    return mismatches;
  }

  // 6. SEQUENCE COMPARISON AND ANALYSIS
  async compareRegions(params) {
    const { region1, region2 } = params;

    // Parse regions (format: "chr:start-end")
    const parseRegion = regionStr => {
      const parts = regionStr.split(':');
      const chromosome = parts[0];
      const [start, end] = parts[1].split('-').map(Number);
      return { chromosome, start, end };
    };

    const reg1 = parseRegion(region1);
    const reg2 = parseRegion(region2);

    const seq1 = await this.app.getSequenceForRegion(reg1.chromosome, reg1.start, reg1.end);
    const seq2 = await this.app.getSequenceForRegion(reg2.chromosome, reg2.start, reg2.end);

    // Simple comparison metrics
    const similarity = this.calculateSimilarity(seq1, seq2);
    const identity = this.calculateIdentity(seq1, seq2);

    return {
      region1: region1,
      region2: region2,
      length1: seq1.length,
      length2: seq2.length,
      similarity: parseFloat(similarity.toFixed(2)),
      identity: parseFloat(identity.toFixed(2)),
      sequenceData: {
        region1: seq1.substring(0, 100) + (seq1.length > 100 ? '...' : ''),
        region2: seq2.substring(0, 100) + (seq2.length > 100 ? '...' : ''),
      },
    };
  }

  async findSimilarSequences(params) {
    const { querySequence, chromosome, minSimilarity = 0.8, maxResults = 20 } = params;

    const chr = chromosome || this.app.currentChromosome;
    if (!chr) {
      throw new Error('No chromosome specified and none currently selected');
    }

    const chromosomeSequence = this.app.currentSequence[chr];
    if (!chromosomeSequence) {
      throw new Error('No sequence loaded for chromosome');
    }

    const queryLength = querySequence.length;
    const similarRegions = [];

    // Sliding window search
    for (let i = 0; i <= chromosomeSequence.length - queryLength; i += 100) {
      // Step by 100 for efficiency
      const subsequence = chromosomeSequence.substring(i, i + queryLength);
      const similarity = this.calculateSimilarity(querySequence, subsequence);

      if (similarity >= minSimilarity) {
        similarRegions.push({
          start: i,
          end: i + queryLength,
          similarity: parseFloat(similarity.toFixed(3)),
          sequence: subsequence.substring(0, 50) + (subsequence.length > 50 ? '...' : ''),
        });
      }
    }

    // Sort by similarity
    similarRegions.sort((a, b) => b.similarity - a.similarity);

    return {
      querySequence: querySequence.substring(0, 50) + (querySequence.length > 50 ? '...' : ''),
      chromosome: chr,
      minSimilarity: minSimilarity,
      resultsFound: similarRegions.length,
      results: similarRegions.slice(0, maxResults),
    };
  }

  // === NEW ANNOTATION METHODS ===

  _getChangeTracker() {
    if (!this._annotationChangeTracker) {
      if (typeof AnnotationChangeTracker !== 'undefined') {
        this._annotationChangeTracker = new AnnotationChangeTracker();
      } else {
        // Fallback: create a minimal no-op tracker
        this._annotationChangeTracker = {
          recordChange: () => ({}),
          recordMultiFieldUpdate: () => [],
          getHistory: () => [],
          getAllChanges: () => [],
          getSummary: () => ({ totalChanges: 0 }),
          exportChangelog: () => '[]',
          clearHistory: () => {},
          size: 0,
        };
      }
    }
    return this._annotationChangeTracker;
  }

  async listAnnotations(params) {
    return this.services.annotation.listAnnotations(params);
  }

  async assessAnnotationQuality(params) {
    return this.services.annotation.assessAnnotationQuality(params);
  }

  async listAnnotationQualityCandidates(params) {
    return this.services.annotation.listAnnotationQualityCandidates(params);
  }

  async listAnnotationResearchHistory(params) {
    return this.services.annotationWorkflow.listAnnotationResearchHistory(params);
  }

  /**
   * Find annotation by identifier (gene name, locus tag, or protein ID)
   */
  _findAnnotation(identifier, chromosome) {
    return this.services.annotation._findAnnotation(identifier, chromosome);
  }

  async getAnnotation(params) {
    return this.services.annotation.getAnnotation(params);
  }

  async updateAnnotation(params) {
    return this.services.annotation.updateAnnotation(params);
  }

  async mergeGeneResearchReport(params) {
    return this.services.annotation.mergeGeneResearchReport(params);
  }

  async searchAnnotations(params) {
    return this.services.annotation.searchAnnotations(params);
  }

  async bulkUpdateAnnotations(params) {
    return this.services.annotation.bulkUpdateAnnotations(params);
  }

  async getAnnotationHistory(params) {
    return this.services.annotation.getAnnotationHistory(params);
  }

  // 7. ANNOTATION MANAGEMENT (CRUD)
  async editAnnotation(params) {
    return this.services.annotation.editAnnotation(params);
  }

  async deleteAnnotation(params) {
    return this.services.annotation.deleteAnnotation(params);
  }

  async batchCreateAnnotations(params) {
    return this.services.annotation.batchCreateAnnotations(params);
  }

  // 8. FILE AND DATA MANAGEMENT
  getFileInfo(params) {
    const { fileType } = params;

    const fileInfo = {
      genome: null,
      annotations: null,
      tracks: null,
    };

    // Get genome file info
    if (this.app.currentSequence && Object.keys(this.app.currentSequence).length > 0) {
      const chromosomes = Object.keys(this.app.currentSequence);
      const totalLength = chromosomes.reduce((sum, chr) => sum + (this.app.currentSequence[chr]?.length || 0), 0);

      fileInfo.genome = {
        chromosomes: chromosomes.length,
        chromosomeList: chromosomes,
        totalLength: totalLength,
        currentChromosome: this.app.currentChromosome,
      };
    }

    // Get annotation file info
    if (this.app.currentAnnotations) {
      const chromosomes = Object.keys(this.app.currentAnnotations);
      const totalFeatures = chromosomes.reduce((sum, chr) => sum + (this.app.currentAnnotations[chr]?.length || 0), 0);

      const featureTypes = new Set();
      chromosomes.forEach(chr => {
        this.app.currentAnnotations[chr]?.forEach(feature => {
          featureTypes.add(feature.type);
        });
      });

      fileInfo.annotations = {
        chromosomes: chromosomes.length,
        totalFeatures: totalFeatures,
        featureTypes: Array.from(featureTypes),
        chromosomeList: chromosomes,
      };
    }

    // Get track info
    fileInfo.tracks = this.getTrackStatus();

    if (fileType && fileInfo[fileType]) {
      return { fileType, info: fileInfo[fileType] };
    }

    return {
      fileType: fileType || 'all',
      fileInfo: fileInfo,
    };
  }

  async exportRegionFeatures(params) {
    const { chromosome, start, end, featureTypes = [], format = 'json' } = params;

    const chr = chromosome || this.app.currentChromosome;
    if (!chr) {
      throw new Error('No chromosome specified');
    }

    if (!this.app.currentAnnotations || !this.app.currentAnnotations[chr]) {
      throw new Error('No annotations loaded for chromosome');
    }

    const regionStart = start || this.app.currentPosition?.start || 0;
    const regionEnd = end || this.app.currentPosition?.end || this.app.currentSequence[chr]?.length || 0;

    const annotations = this.app.currentAnnotations[chr];
    const regionFeatures = annotations.filter(feature => {
      // Filter by position overlap
      const overlaps = feature.start <= regionEnd && feature.end >= regionStart;

      // Filter by feature type if specified
      const typeMatch = featureTypes.length === 0 || featureTypes.includes(feature.type);

      return overlaps && typeMatch;
    });

    const exportData = {
      region: `${chr}:${regionStart}-${regionEnd}`,
      featureCount: regionFeatures.length,
      exportDate: new Date().toISOString(),
      features: regionFeatures,
    };

    return {
      chromosome: chr,
      region: `${regionStart}-${regionEnd}`,
      featuresExported: regionFeatures.length,
      format: format,
      data: exportData,
    };
  }

  // Helper methods for similarity calculations
  calculateSimilarity(seq1, seq2) {
    const maxLength = Math.max(seq1.length, seq2.length);
    if (maxLength === 0) return 1;

    const minLength = Math.min(seq1.length, seq2.length);
    let matches = 0;

    for (let i = 0; i < minLength; i++) {
      if (seq1[i] === seq2[i]) matches++;
    }

    return matches / maxLength;
  }

  calculateIdentity(seq1, seq2) {
    const minLength = Math.min(seq1.length, seq2.length);
    if (minLength === 0) return 0;

    let matches = 0;
    for (let i = 0; i < minLength; i++) {
      if (seq1[i] === seq2[i]) matches++;
    }

    return matches / minLength;
  }

  // ========================================
  // NEW CHAT FUNCTIONALITY
  // ========================================

  /**
   * Start a new chat conversation
   */

  /**
   * Copy selected text from the page
   */

  /**
   * Show a temporary notification to the user
   */
  showNotification(message, type = 'info') {
    // Remove any existing notification
    const existingNotification = document.getElementById('chatNotification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'chatNotification';
    notification.className = `chat-notification ${type}`;
    notification.innerHTML = `
            <div class="notification-content">
                <span>${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

    // Add to chat panel
    const chatPanel = document.getElementById('llmChatPanel');
    if (chatPanel) {
      chatPanel.appendChild(notification);

      // Auto-remove after 3 seconds
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 3000);
    }
  }

  /**
   * Test function to verify chat functionality
   */
  testChatFunctionality() {
    console.log('=== Testing Chat Functionality ===');

    // Test 1: Check if UI elements exist
    const chatInput = document.getElementById('chatInput');
    const newChatBtn = document.getElementById('newChatBtn');

    console.log('UI Elements Check:');
    console.log('- Chat Input:', chatInput ? '✅' : '❌');
    console.log('- New Chat Button:', newChatBtn ? '✅' : '❌');

    // Test 2: Check chat history loading
    const history = this.configManager.getChatHistory();
    console.log('Chat History:', history.length, 'messages');

    // Test 3: Show notification
    this.showNotification('🧪 Chat functionality test completed', 'success');

    return {
      uiElements: {
        chatInput: !!chatInput,
        newChatBtn: !!newChatBtn,
      },
      historyCount: history.length,
      testCompleted: true,
    };
  }

  /**
   * Show chat history in a modal dialog
   */
  showChatHistoryModal() {
    if (!this.services || !this.services.ui) {
      console.error('[ChatManager] ui not initialized');
      return;
    }
    return this.services.ui.showChatHistoryModal();
  }

  /**
   * Group messages into conversations based on time gaps and conversation separators
   */
  groupMessagesIntoConversations(history) {
    if (history.length === 0) return [];

    const conversations = [];
    let currentConversation = {
      messages: [],
      startTime: null,
      endTime: null,
    };

    for (let i = 0; i < history.length; i++) {
      const currentMsg = history[i];

      // Check for conversation separator
      if (currentMsg.sender === 'system' && currentMsg.message === '--- CONVERSATION_SEPARATOR ---') {
        // End current conversation if it has messages
        if (currentConversation.messages.length > 0) {
          conversations.push(currentConversation);
          currentConversation = {
            messages: [],
            startTime: null,
            endTime: null,
          };
        }
        continue; // Skip the separator message itself
      }

      // Initialize conversation times if this is the first message
      if (currentConversation.messages.length === 0) {
        currentConversation.startTime = currentMsg.timestamp;
        currentConversation.endTime = currentMsg.timestamp;
      }

      // Add message to current conversation
      currentConversation.messages.push(currentMsg);
      currentConversation.endTime = currentMsg.timestamp;

      // Check for time-based conversation break (30 minutes gap)
      if (i > 0) {
        const previousMsg = history[i - 1];
        const timeDiff = new Date(currentMsg.timestamp) - new Date(previousMsg.timestamp);
        const CONVERSATION_GAP = 30 * 60 * 1000; // 30 minutes

        if (timeDiff > CONVERSATION_GAP && currentConversation.messages.length > 1) {
          // Remove the current message from this conversation
          currentConversation.messages.pop();
          currentConversation.endTime = previousMsg.timestamp;

          // End current conversation
          conversations.push(currentConversation);

          // Start new conversation with current message
          currentConversation = {
            messages: [currentMsg],
            startTime: currentMsg.timestamp,
            endTime: currentMsg.timestamp,
          };
        }
      }
    }

    // Add the last conversation if it has messages
    if (currentConversation.messages.length > 0) {
      conversations.push(currentConversation);
    }

    // Sort conversations by start time (newest first)
    conversations.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    return conversations;
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Show detailed view of a specific conversation
   */
  showConversationDetails(conversationIndex) {
    const conversation = this.cachedConversations[conversationIndex];
    if (!conversation) {
      this.showNotification('❌ Conversation not found', 'error');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal conversation-detail-modal show';

    let messagesHTML = '';
    conversation.messages.forEach(msg => {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      messagesHTML += `
                <div class="conversation-message ${msg.sender}">
                    <div class="message-header">
                        <div class="message-sender">
                            <i class="fas fa-${msg.sender === 'user' ? 'user' : 'robot'}"></i>
                            <span>${msg.sender === 'user' ? 'You' : 'AI Assistant'}</span>
                        </div>
                        <div class="message-time">${time}</div>
                    </div>
                    <div class="message-content">${this.formatMessage(msg.message)}</div>
                </div>
            `;
    });

    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas fa-comments"></i>
                        Conversation ${this.cachedConversations.length - conversationIndex}
                        <span class="conversation-meta">${conversation.messages.length} messages</span>
                    </h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="conversation-info">
                        <strong>Started:</strong> ${new Date(conversation.startTime).toLocaleString()}<br>
                        <strong>Duration:</strong> ${this.formatDuration(new Date(conversation.endTime) - new Date(conversation.startTime))}
                    </div>
                    <div class="conversation-messages">
                        ${messagesHTML}
                    </div>
                    <div class="conversation-actions">
                        <button class="btn btn-sm btn-secondary" onclick="chatManager.copyConversation(${conversationIndex})">
                            <i class="fas fa-copy"></i>
                            Copy Conversation
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="chatManager.exportConversation(${conversationIndex})">
                            <i class="fas fa-download"></i>
                            Export Conversation
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="chatManager.showChatHistoryModal()">
                            <i class="fas fa-arrow-left"></i>
                            Back to History
                        </button>
                    </div>
                </div>
            </div>
        `;

    document.body.appendChild(modal);
  }

  /**
   * Copy a conversation to clipboard
   */
  copyConversation(conversationIndex) {
    const conversation = this.cachedConversations[conversationIndex];
    if (!conversation) {
      this.showNotification('❌ Conversation not found', 'error');
      return;
    }

    let conversationText = `Conversation ${this.cachedConversations.length - conversationIndex}\n`;
    conversationText += `Started: ${new Date(conversation.startTime).toLocaleString()}\n`;
    conversationText += `Duration: ${this.formatDuration(new Date(conversation.endTime) - new Date(conversation.startTime))}\n`;
    conversationText += `Messages: ${conversation.messages.length}\n\n`;
    conversationText += `${'='.repeat(50)}\n\n`;

    conversation.messages.forEach(msg => {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const sender = msg.sender === 'user' ? 'You' : 'AI Assistant';
      conversationText += `[${time}] ${sender}:\n${msg.message}\n\n`;
    });

    navigator.clipboard
      .writeText(conversationText)
      .then(() => {
        this.showNotification('Conversation copied to clipboard', 'success');
      })
      .catch(err => {
        console.error('Failed to copy conversation:', err);
        this.showNotification('❌ Failed to copy conversation', 'error');
      });
  }

  /**
   * Export a conversation
   */
  exportConversation(conversationIndex) {
    const conversation = this.cachedConversations[conversationIndex];
    if (!conversation) {
      this.showNotification('❌ Conversation not found', 'error');
      return;
    }

    const exportData = {
      conversationNumber: this.cachedConversations.length - conversationIndex,
      startTime: conversation.startTime,
      endTime: conversation.endTime,
      duration: new Date(conversation.endTime) - new Date(conversation.startTime),
      messageCount: conversation.messages.length,
      messages: conversation.messages,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${exportData.conversationNumber}-${new Date(conversation.startTime).toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showNotification('Conversation exported successfully', 'success');
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationIndex) {
    const conversation = this.cachedConversations[conversationIndex];
    if (!conversation) {
      this.showNotification('❌ Conversation not found', 'error');
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete this conversation with ${conversation.messages.length} messages?`
    );
    if (!confirmed) return;

    try {
      let history = this.configManager.getChatHistory();

      // Remove all messages from this conversation
      const messageIds = conversation.messages.map(m => m.id);
      history = history.filter(msg => !messageIds.includes(msg.id));

      // Save updated history
      this.configManager.setChatHistory(history);
      this.configManager.save();

      this.showNotification('Conversation deleted successfully', 'success');

      // Refresh the modal
      this.closeChatHistoryModal();
      setTimeout(() => this.showChatHistoryModal(), 100);
    } catch (error) {
      console.error('Error deleting conversation:', error);
      this.showNotification('❌ Failed to delete conversation', 'error');
    }
  }

  /**
   * Close chat history modal
   */
  closeChatHistoryModal() {
    const modal = document.getElementById('chatHistoryModal');
    if (modal) {
      modal.remove();
    }
    document.removeEventListener('keydown', this.handleHistoryModalKeydown);
  }

  /**
   * Handle escape key for modal
   */
  handleHistoryModalKeydown(event) {
    if (event.key === 'Escape') {
      this.closeChatHistoryModal();
    }
  }

  /**
   * Show full message in a popup
   */
  showFullMessage(messageId) {
    const history = this.configManager.getChatHistory();
    const message = history.find(msg => msg.id === messageId);

    if (!message) {
      this.showNotification('❌ Message not found', 'error');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal message-detail-modal show';
    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas fa-${message.sender === 'user' ? 'user' : 'robot'}"></i>
                        ${message.sender === 'user' ? 'Your Message' : 'AI Assistant Message'}
                    </h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="message-metadata">
                        <strong>Time:</strong> ${new Date(message.timestamp).toLocaleString()}<br>
                        <strong>ID:</strong> ${message.id}
                    </div>
<div class="full-message-content">${this.formatMessage(message.message)}</div>
                    <div class="message-actions">
                        <button class="btn btn-sm btn-secondary" onclick="chatManager.copyHistoryMessage('${message.id}')">
                            <i class="fas fa-copy"></i>
                            Copy Message
                        </button>
                    </div>
                </div>
            </div>
        `;

    document.body.appendChild(modal);
  }

  /**
   * Copy a message from history
   */
  copyHistoryMessage(messageId) {
    const history = this.configManager.getChatHistory();
    const message = history.find(msg => msg.id === messageId);

    if (!message) {
      this.showNotification('❌ Message not found', 'error');
      return;
    }

    navigator.clipboard
      .writeText(message.message)
      .then(() => {
        this.showNotification('Message copied to clipboard', 'success');
      })
      .catch(err => {
        console.error('Failed to copy message:', err);
        this.showNotification('❌ Failed to copy message', 'error');
      });
  }

  /**
   * Delete a message from history
   */
  deleteHistoryMessage(messageId) {
    const confirmed = confirm('Are you sure you want to delete this message from history?');
    if (!confirmed) return;

    try {
      const history = this.configManager.getChatHistory();
      const messageIndex = history.findIndex(msg => msg.id === messageId);

      if (messageIndex === -1) {
        this.showNotification('❌ Message not found', 'error');
        return;
      }

      // Remove the message
      history.splice(messageIndex, 1);

      // Save updated history
      this.configManager.setChatHistory(history);
      this.configManager.save();

      this.showNotification('Message deleted from history', 'success');

      // Refresh the modal
      this.closeChatHistoryModal();
      setTimeout(() => this.showChatHistoryModal(), 100);
    } catch (error) {
      console.error('Error deleting message:', error);
      this.showNotification('❌ Failed to delete message', 'error');
    }
  }

  /**
   * Confirm clearing all chat history
   */
  confirmClearHistory() {
    const confirmed = confirm('Are you sure you want to delete ALL chat history? This action cannot be undone.');
    if (!confirmed) return;

    const doubleConfirmed = confirm(
      'This will permanently delete all your chat conversations. Are you absolutely sure?'
    );
    if (!doubleConfirmed) return;

    try {
      this.configManager.clearChatHistory();
      this.configManager.save();

      this.showNotification('All chat history cleared', 'success');
      this.closeChatHistoryModal();

      // Also clear the current chat display
      this.clearChat();
    } catch (error) {
      console.error('Error clearing history:', error);
      this.showNotification('❌ Failed to clear history', 'error');
    }
  }

  /**
   * Search through chat history
   */
  searchChatHistory() {
    const searchTerm = prompt('Enter search term to find in chat history:');
    if (!searchTerm) return;

    const history = this.configManager.getChatHistory();
    const results = history.filter(msg => msg.message.toLowerCase().includes(searchTerm.toLowerCase()));

    if (results.length === 0) {
      this.showNotification(`🔍 No messages found containing "${searchTerm}"`, 'info');
      return;
    }

    // Show search results in the modal
    this.showSearchResults(searchTerm, results);
  }

  /**
   * Show search results
   */
  showSearchResults(searchTerm, results) {
    this.closeChatHistoryModal();

    const modal = document.createElement('div');
    modal.className = 'modal chat-search-modal show';

    let resultsHTML = '';
    results.forEach(msg => {
      const time = new Date(msg.timestamp).toLocaleString();
      const highlightedMessage = msg.message.replace(new RegExp(`(${searchTerm})`, 'gi'), '<mark>$1</mark>');

      resultsHTML += `
                <div class="search-result-item" onclick="chatManager.showFullMessage('${msg.id}')">
                    <div class="result-header">
                        <span class="result-sender">
                            <i class="fas fa-${msg.sender === 'user' ? 'user' : 'robot'}"></i>
                            ${msg.sender === 'user' ? 'You' : 'AI Assistant'}
                        </span>
                        <span class="result-time">${time}</span>
                    </div>
                    <div class="result-content">${highlightedMessage}</div>
                </div>
            `;
    });

    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas fa-search"></i>
                        Search Results for "${searchTerm}"
                        <span class="search-count">${results.length} matches</span>
                    </h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="search-actions">
                        <button class="btn btn-sm btn-secondary" onclick="chatManager.showChatHistoryModal()">
                            <i class="fas fa-arrow-left"></i>
                            Back to History
                        </button>
                    </div>
                    <div class="search-results">
                        ${resultsHTML}
                    </div>
                </div>
            </div>
        `;

    document.body.appendChild(modal);
  }

  /**
   * Setup chat panel dragging functionality with drag-and-drop docking support
   */
  setupChatDragging() {
    if (!this.services || !this.services.ui) {
      console.error('[ChatManager] ui not initialized');
      return;
    }
    return this.services.ui.setupChatDragging();
  }

  /**
   * Show visual indicator for docking zone
   */
  showDockIndicator() {
    let indicator = document.getElementById('chatDockIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'chatDockIndicator';
      indicator.innerHTML = '<i class="fas fa-columns"></i><span>Dock Here</span>';
      document.body.appendChild(indicator);

      // Add styles
      indicator.style.cssText = `
        position: fixed;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(13, 110, 253, 0.9);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
      `;
    }
    indicator.style.opacity = '1';
  }

  /**
   * Hide visual indicator for docking zone
   */
  hideDockIndicator() {
    const indicator = document.getElementById('chatDockIndicator');
    if (indicator) {
      indicator.style.opacity = '0';
    }
  }

  /**
   * Show visual indicator for undocking
   */
  showUndockIndicator() {
    let indicator = document.getElementById('chatUndockIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'chatUndockIndicator';
      indicator.innerHTML = '<i class="fas fa-window-restore"></i><span>Release to Undock</span>';
      document.body.appendChild(indicator);

      // Add styles
      indicator.style.cssText = `
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: rgba(25, 135, 84, 0.9);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
      `;
    }
    indicator.style.opacity = '1';
  }

  /**
   * Hide visual indicator for undocking
   */
  hideUndockIndicator() {
    const indicator = document.getElementById('chatUndockIndicator');
    if (indicator) {
      indicator.style.opacity = '0';
    }
  }

  /**
   * Setup chat panel resizing functionality
   */
  setupChatResizing() {
    const chatPanel = document.getElementById('llmChatPanel');
    const resizeHandles = chatPanel.querySelectorAll('.resize-handle');
    let isResizing = false;
    let resizeDirection = '';
    let startX;
    let startY;
    let startWidth;
    let startHeight;
    let startLeft;
    let startTop;

    resizeHandles.forEach(handle => {
      handle.addEventListener('mousedown', e => {
        isResizing = true;
        resizeDirection = handle.dataset.direction;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(window.getComputedStyle(chatPanel).width, 10);
        startHeight = parseInt(window.getComputedStyle(chatPanel).height, 10);
        startLeft = parseInt(window.getComputedStyle(chatPanel).left, 10);
        startTop = parseInt(window.getComputedStyle(chatPanel).top, 10);

        chatPanel.classList.add('resizing');
        document.body.style.userSelect = 'none';

        e.preventDefault();
        e.stopPropagation();
      });
    });

    document.addEventListener('mousemove', e => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;

      // Apply resize based on direction
      if (resizeDirection.includes('e')) {
        newWidth = Math.max(300, startWidth + deltaX);
      }
      if (resizeDirection.includes('w')) {
        newWidth = Math.max(300, startWidth - deltaX);
        newLeft = startLeft + (startWidth - newWidth);
      }
      if (resizeDirection.includes('s')) {
        newHeight = Math.max(400, startHeight + deltaY);
      }
      if (resizeDirection.includes('n')) {
        newHeight = Math.max(400, startHeight - deltaY);
        newTop = startTop + (startHeight - newHeight);
      }

      // Constrain to viewport
      const maxLeft = window.innerWidth - newWidth;
      const maxTop = window.innerHeight - newHeight;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      chatPanel.style.width = newWidth + 'px';
      chatPanel.style.height = newHeight + 'px';
      chatPanel.style.left = newLeft + 'px';
      chatPanel.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;

      isResizing = false;
      resizeDirection = '';
      chatPanel.classList.remove('resizing');
      document.body.style.userSelect = '';

      // Save size and position
      this.saveChatPosition();
      this.saveChatSize();
    });
  }

  /**
   * Save chat panel position to config
   */
  async saveChatPosition() {
    try {
      const chatPanel = document.getElementById('llmChatPanel');
      const position = {
        x: parseInt(chatPanel.style.left, 10),
        y: parseInt(chatPanel.style.top, 10),
      };
      await this.configManager.set('chat.position', position);
      await this.configManager.saveConfig();
    } catch (error) {
      console.error('Error saving chat position:', error);
    }
  }

  /**
   * Save chat panel size to config
   */
  async saveChatSize() {
    try {
      const chatPanel = document.getElementById('llmChatPanel');
      const size = {
        width: parseInt(chatPanel.style.width, 10),
        height: parseInt(chatPanel.style.height, 10),
      };
      await this.configManager.set('chat.size', size);
      await this.configManager.saveConfig();
    } catch (error) {
      console.error('Error saving chat size:', error);
    }
  }

  /**
   * Reset chat panel to default position and size
   */
  async resetChatPosition() {
    try {
      const chatPanel = document.getElementById('llmChatPanel');
      const defaultSize = { width: 400, height: 600 };
      const defaultPosition = this.getDefaultChatPosition();

      chatPanel.style.left = defaultPosition.x + 'px';
      chatPanel.style.top = defaultPosition.y + 'px';
      chatPanel.style.width = defaultSize.width + 'px';
      chatPanel.style.height = defaultSize.height + 'px';

      // Save to config
      await this.configManager.set('chat.position', defaultPosition);
      await this.configManager.set('chat.size', defaultSize);
      await this.configManager.saveConfig();

      // Removed notification message as requested
    } catch (error) {
      console.error('Error resetting chat position:', error);
      // Only show error notifications, not success ones
      this.showNotification('❌ Failed to reset chat position', 'error');
    }
  }

  /**
   * Open protein structure viewer
   */
  async openProteinViewer(params) {
    try {
      // Check if protein structure viewer is available
      if (!window.proteinStructureViewer || !window.proteinStructureViewer.openStructureViewer) {
        return {
          success: false,
          error: 'Protein structure viewer not available. Please ensure the protein viewer module is loaded.',
          message: 'Cannot open protein viewer: viewer module not found.',
        };
      }

      if (!this.services?.protein?.resolveStructureViewerInput) {
        return {
          success: false,
          error: 'Protein structure source resolver is unavailable.',
          message: 'Cannot open protein viewer: protein service not found.',
        };
      }

      const resolved = await this.services.protein.resolveStructureViewerInput(params);
      if (!resolved.success) return resolved;

      // Open the 3D viewer
      window.proteinStructureViewer.openStructureViewer(
        resolved.pdbData,
        resolved.proteinName,
        resolved.structureId,
        resolved.viewerOptions
      );

      return {
        success: true,
        pdbId: resolved.pdbId,
        uniprotId: resolved.uniprotId,
        structureId: resolved.structureId,
        source: resolved.source,
        representationUsed: resolved.viewerOptions.representation,
        colorSchemeUsed: resolved.viewerOptions.colorScheme,
        message: `Opened 3D protein structure viewer for ${resolved.proteinName} (${resolved.structureId}) from ${resolved.source}.`,
      };
    } catch (error) {
      console.error('Error in openProteinViewer:', error);
      // Return structured error instead of throwing — allows tool chain to continue gracefully
      return {
        success: false,
        error: error.message,
        message: `Failed to open protein viewer: ${error.message}`,
      };
    }
  }

  /**
   * Fetch protein structure from PDB database
   */

  /**
   * Download PDB file content from RCSB PDB database
   */
  async downloadPDBFile(pdbId) {
    try {
      console.log(`🌐 [downloadPDBFile] Starting download for PDB ID: ${pdbId}`);

      const url = `https://files.rcsb.org/download/${pdbId}.pdb`;
      console.log(`🌐 [downloadPDBFile] Fetching URL: ${url}`);

      const response = await fetch(url);
      console.log(`🌐 [downloadPDBFile] Response status: ${response.status} ${response.statusText}`);
      console.log(`🌐 [downloadPDBFile] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`🌐 [downloadPDBFile] Reading response text...`);
      const pdbData = await response.text();
      console.log(`🌐 [downloadPDBFile] Response text length: ${pdbData.length}`);
      console.log(`🌐 [downloadPDBFile] First 200 chars:`, pdbData.substring(0, 200));

      if (!pdbData || pdbData.trim().length === 0) {
        throw new Error('Empty PDB file received');
      }

      // Basic validation - check if it looks like a PDB file
      if (!pdbData.includes('HEADER') && !pdbData.includes('ATOM')) {
        console.error(`🌐 [downloadPDBFile] Invalid PDB format. Content preview:`, pdbData.substring(0, 500));
        throw new Error('Invalid PDB file format');
      }

      console.log(
        `✅ [downloadPDBFile] Successfully downloaded PDB file for ${pdbId}, size: ${pdbData.length} characters`
      );
      return pdbData;
    } catch (error) {
      console.error(`❌ [downloadPDBFile] Error downloading PDB file for ${pdbId}:`, error);
      console.error(`❌ [downloadPDBFile] Error type:`, error.constructor.name);
      console.error(`❌ [downloadPDBFile] Error message:`, error.message);
      console.error(`❌ [downloadPDBFile] Error stack:`, error.stack);
      throw new Error(`Failed to download PDB file for ${pdbId}: ${error.message}`);
    }
  }

  /**
   * Search PDB database for experimental protein structures by gene name
   */
  async searchPDBStructures(parameters) {
    return this.services.protein.searchPDBStructures(parameters);
  }

  // Keep the old method name for backward compatibility, but deprecate it
  /**
   * Search UniProt database with various search types and filters
   * @param {Object} parameters - Search parameters
   * @returns {Promise<Object>} Search results
   */
  async searchUniProtDatabase(parameters) {
    return this.services.protein.searchUniProtDatabase(parameters);
  }

  /**
   * Get detailed information about a PDB structure
   */
  async getPDBDetails(pdbId) {
    return this.services.protein.getPDBDetails(pdbId);
  }

  /**
   * Search AlphaFold structures by gene name
   */
  async searchAlphaFoldByGene(parameters) {
    return this.services.protein.searchAlphaFoldStructures(parameters);
  }

  /**
   * Fetch AlphaFold structure data
   */
  async fetchAlphaFoldStructure(parameters) {
    return this.services.protein.fetchAlphaFoldStructure(parameters);
  }

  /**
   * Fetch protein structure data (from PDB or AlphaFold)
   */
  async fetchProteinStructure(parameters) {
    // Delegate to ProteinService which caches PDB data to prevent LLM context overflow.
    // The ProteinService version returns metadata + _dataRef instead of raw pdbData.
    if (this.services && this.services.protein) {
      return this.services.protein.fetchProteinStructure(parameters);
    }

    // Fallback: minimal metadata-only implementation if ProteinService is unavailable
    const pdbId = parameters.pdbId || parameters.pdb_id;
    const uniprotId = parameters.uniprotId || parameters.uniprot_id;

    try {
      if (pdbId) {
        const pdbUrl = `https://files.rcsb.org/download/${pdbId}.pdb`;
        const response = await fetch(pdbUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDB structure ${pdbId}: ${response.status}`);
        }
        // Don't return raw data — just confirm fetch succeeded
        const pdbData = await response.text();
        return {
          success: true,
          tool: 'fetch_protein_structure',
          pdbId: pdbId,
          source: 'RCSB PDB',
          dataLength: pdbData.length,
          downloadUrl: pdbUrl,
          timestamp: new Date().toISOString(),
          message: `Successfully fetched PDB structure for ${pdbId} (${pdbData.length} chars).`,
        };
      }

      if (uniprotId) {
        return await this.fetchAlphaFoldStructure({ uniprotId, geneName: parameters.geneName || parameters.gene_name });
      }

      throw new Error('Either pdbId or uniprotId must be provided');
    } catch (error) {
      console.error('Protein structure fetch error:', error);
      return {
        success: false,
        error: error.message,
        tool: 'fetch_protein_structure',
        parameters: parameters,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Search AlphaFold by protein sequence
   */
  async searchAlphaFoldBySequence(parameters) {
    const sequence = parameters.sequence;
    const maxResults = parameters.maxResults || 10;

    try {
      console.log(`Searching AlphaFold by sequence (length: ${sequence?.length})`);

      if (!sequence || sequence.length < 10) {
        throw new Error('Protein sequence must be at least 10 amino acids');
      }

      // Use UniProt BLAST search
      const searchUrl = `https://rest.uniprot.org/uniprotkb/search?query=${sequence.substring(0, 50)}&format=json&size=${maxResults}`;

      const response = await fetch(searchUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`UniProt sequence search failed: ${response.status}`);
      }

      const data = await response.json();
      const results = (data.results || []).map(protein => ({
        uniprotId: protein.primaryAccession,
        proteinName: protein.proteinDescription?.recommendedName?.fullName?.value || 'Unknown',
        organism: protein.organism?.scientificName,
        alphaFoldUrl: `https://alphafold.ebi.ac.uk/entry/${protein.primaryAccession}`,
      }));

      return {
        success: true,
        tool: 'search_alphafold_by_sequence',
        parameters: { sequenceLength: sequence.length, maxResults },
        results: results,
        count: results.length,
        timestamp: new Date().toISOString(),
        message:
          results.length > 0
            ? `Found ${results.length} potential AlphaFold match(es)`
            : 'No AlphaFold matches found for sequence',
      };
    } catch (error) {
      console.error('AlphaFold sequence search error:', error);
      return {
        success: false,
        error: error.message,
        tool: 'search_alphafold_by_sequence',
        parameters: { sequenceLength: sequence?.length },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Perform AlphaFold search using UniProt API
   */
  async performAlphaFoldSearch(geneName, organism, maxResults = 10) {
    try {
      console.log(`Performing AlphaFold search for gene: ${geneName}, organism: ${organism}`);

      // First, search UniProt for proteins matching the gene name and organism
      const uniprotSearchUrl = `https://rest.uniprot.org/uniprotkb/search?query=gene_exact:${geneName}+AND+organism_name:"${organism}"&format=json&size=${maxResults}`;

      console.log('UniProt search URL:', uniprotSearchUrl);

      const response = await fetch(uniprotSearchUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'CodeXomics/1.0',
        },
      });

      if (!response.ok) {
        // Try alternative search format
        const altUrl = `https://rest.uniprot.org/uniprotkb/search?query=${geneName}+AND+${organism.replace(' ', '+')}&format=json&size=${maxResults}`;
        console.log('Trying alternative UniProt search URL:', altUrl);

        const altResponse = await fetch(altUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'CodeXomics/1.0',
          },
        });

        if (!altResponse.ok) {
          throw new Error(`UniProt search failed: ${response.status} ${response.statusText}`);
        }

        const altData = await altResponse.json();
        console.log('Alternative UniProt search response:', altData);
        return this.processUniProtResults(altData, geneName, organism, maxResults);
      }

      const data = await response.json();
      console.log('UniProt search response:', data);

      return this.processUniProtResults(data, geneName, organism, maxResults);
    } catch (error) {
      console.error('AlphaFold search error:', error);
      throw new Error(`Failed to search AlphaFold: ${error.message}`);
    }
  }

  /**
   * Process UniProt search results and filter for AlphaFold availability
   */
  async processUniProtResults(data, geneName, organism, maxResults) {
    if (!this.services || !this.services.protein) {
      console.error('[ChatManager] protein not initialized');
      return;
    }
    return await this.services.protein.processUniProtResults(data, geneName, organism, maxResults);
  }

  /**
   * Check if AlphaFold structure is available for a UniProt ID
   */
  async checkAlphaFoldAvailability(uniprotId) {
    return this.services.protein.checkAlphaFoldAvailability(uniprotId);
  }

  /**
   * Download AlphaFold structure from AlphaFold database
   */
  async downloadAlphaFoldStructure(uniprotId, format = 'pdb') {
    try {
      const result = await this.services.protein.fetchAlphaFoldStructure({
        uniprotId,
        format,
        includeConfidence: true,
      });
      if (!result.success) {
        throw new Error(result.error || `No AlphaFold structure found for ${uniprotId}`);
      }

      const pdbData = this.services.protein.getCachedStructureData(result._dataRef);
      if (!pdbData) {
        throw new Error('AlphaFold structure was downloaded but could not be read from cache');
      }

      return {
        pdbData,
        confidence: result.confidence,
        modelDate: result.modelCreatedDate,
        source: 'AlphaFold',
        downloadUrl: result.downloadUrl,
      };
    } catch (error) {
      console.error('AlphaFold structure download error:', error);
      throw new Error(`Failed to download AlphaFold structure: ${error.message}`);
    }
  }

  /**
   * Extract confidence information from AlphaFold PDB data
   */
  extractAlphaFoldConfidence(pdbData) {
    try {
      // AlphaFold stores confidence in the B-factor column
      const lines = pdbData.split('\n');
      const atomLines = lines.filter(line => line.startsWith('ATOM'));

      if (atomLines.length === 0) return null;

      const confidenceValues = atomLines.map(line => {
        const bFactor = parseFloat(line.substring(60, 66).trim());
        return isNaN(bFactor) ? 0 : bFactor;
      });

      const avgConfidence = confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length;
      const minConfidence = Math.min(...confidenceValues);
      const maxConfidence = Math.max(...confidenceValues);

      return {
        average: Math.round(avgConfidence * 100) / 100,
        min: Math.round(minConfidence * 100) / 100,
        max: Math.round(maxConfidence * 100) / 100,
        interpretation: this.interpretAlphaFoldConfidence(avgConfidence),
      };
    } catch (error) {
      console.warn('Could not extract confidence information:', error.message);
      return null;
    }
  }

  /**
   * Interpret AlphaFold confidence scores
   */
  interpretAlphaFoldConfidence(confidence) {
    if (confidence >= 90) return 'Very high (pLDDT > 90)';
    if (confidence >= 70) return 'Confident (pLDDT 70-90)';
    if (confidence >= 50) return 'Low (pLDDT 50-70)';
    return 'Very low (pLDDT < 50)';
  }

  /**
   * Extract model date from PDB header
   */
  extractModelDate(pdbData) {
    try {
      const headerMatch = pdbData.match(/HEADER\s+.*\s+(\d{2}-[A-Z]{3}-\d{2})/);
      return headerMatch ? headerMatch[1] : null;
    } catch (error) {
      console.warn('Could not extract model date:', error.message);
      return null;
    }
  }

  /**
   * Display AlphaFold search results in sidebar
   */
  displayAlphaFoldResultsInSidebar(results, geneName) {
    try {
      console.log('Displaying AlphaFold results in sidebar:', results);

      // Get or create sidebar container
      let sidebar = document.querySelector('.alphafold-results-sidebar');
      if (!sidebar) {
        sidebar = this.createAlphaFoldSidebar();
      }

      // Clear previous results
      const resultsContainer = sidebar.querySelector('.alphafold-results-list');
      resultsContainer.innerHTML = '';

      // Update header
      const header = sidebar.querySelector('.sidebar-header h3');
      header.textContent = `AlphaFold Results for ${geneName}`;

      // Add results
      results.forEach((result, index) => {
        const resultElement = this.createAlphaFoldResultElement(result, index);
        resultsContainer.appendChild(resultElement);
      });

      // Show sidebar
      sidebar.classList.add('visible');

      // Add close functionality
      const closeBtn = sidebar.querySelector('.sidebar-close');
      if (closeBtn) {
        closeBtn.onclick = () => {
          sidebar.classList.remove('visible');
        };
      }
    } catch (error) {
      console.error('Error displaying AlphaFold results in sidebar:', error);
    }
  }

  /**
   * Create AlphaFold sidebar container
   */
  createAlphaFoldSidebar() {
    // Remove existing sidebar if any
    const existing = document.querySelector('.alphafold-results-sidebar');
    if (existing) {
      existing.remove();
    }

    const sidebar = document.createElement('div');
    sidebar.className = 'alphafold-results-sidebar';
    sidebar.innerHTML = `
            <div class="sidebar-header">
                <h3>AlphaFold Results</h3>
                <button class="sidebar-close" title="Close sidebar">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="sidebar-content">
                <div class="alphafold-results-list"></div>
            </div>
        `;

    // Add styles
    this.addAlphaFoldSidebarStyles();

    // Append to body
    document.body.appendChild(sidebar);

    return sidebar;
  }

  /**
   * Create individual AlphaFold result element
   */
  createAlphaFoldResultElement(result, index) {
    const element = document.createElement('div');
    element.className = 'alphafold-result-item';
    element.innerHTML = `
            <div class="result-header">
                <div class="protein-name">${result.proteinName}</div>
                <div class="uniprot-id">${result.uniprotId}</div>
            </div>
            <div class="result-details">
                <div class="detail-row">
                    <span class="label">Genes:</span>
                    <span class="value">${result.geneNames.join(', ') || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Organism:</span>
                    <span class="value">${result.organism}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Length:</span>
                    <span class="value">${result.length} AA</span>
                </div>
                <div class="detail-row">
                    <span class="label">Reviewed:</span>
                    <span class="value ${result.reviewed ? 'reviewed' : 'unreviewed'}">
                        ${result.reviewed ? 'Yes' : 'No'}
                    </span>
                </div>
            </div>
            <div class="result-actions">
                <button class="btn btn-primary view-structure" data-uniprot-id="${result.uniprotId}" data-gene-name="${result.geneNames[0] || result.uniprotId}">
                    <i class="fas fa-cube"></i> View 3D Structure
                </button>
                <button class="btn btn-secondary view-alphafold-page" data-url="${result.alphaFoldUrl}">
                    <i class="fas fa-external-link-alt"></i> AlphaFold Page
                </button>
            </div>
        `;

    // Add click handlers
    const viewStructureBtn = element.querySelector('.view-structure');
    const viewPageBtn = element.querySelector('.view-alphafold-page');

    viewStructureBtn.onclick = async () => {
      const uniprotId = viewStructureBtn.dataset.uniprotId;
      const geneName = viewStructureBtn.dataset.geneName;

      try {
        viewStructureBtn.disabled = true;
        viewStructureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

        const result = await this.openProteinViewer({
          uniprotId: uniprotId,
          geneName: geneName,
        });

        if (result.success) {
          console.log('Successfully opened protein structure viewer');
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('Error opening AlphaFold viewer:', error);
        alert(`Error loading structure: ${error.message}`);
      } finally {
        viewStructureBtn.disabled = false;
        viewStructureBtn.innerHTML = '<i class="fas fa-cube"></i> View 3D Structure';
      }
    };

    viewPageBtn.onclick = () => {
      const url = viewPageBtn.dataset.url;
      window.open(url, '_blank');
    };

    return element;
  }

  /**
   * Add AlphaFold sidebar styles
   */
  addAlphaFoldSidebarStyles() {
    if (!this.services || !this.services.ui) {
      console.error('[ChatManager] ui not initialized');
      return;
    }
    return this.services.ui.addAlphaFoldSidebarStyles();
  }

  /**
   * Perform PDB search using RCSB PDB API
   */
  async performPDBSearch(geneName, organism, maxResults = 10) {
    try {
      console.log(`Performing PDB search for gene: ${geneName}, organism: ${organism}`);

      // Use RCSB PDB search API with improved query (POST request)
      const searchQuery = {
        query: {
          type: 'group',
          logical_operator: 'and',
          nodes: [
            {
              type: 'terminal',
              service: 'text',
              parameters: {
                attribute: 'rcsb_entity_source_organism.scientific_name',
                operator: 'contains_phrase',
                value: organism,
              },
            },
            {
              type: 'terminal',
              service: 'text',
              parameters: {
                attribute: 'struct.title',
                operator: 'contains_words',
                value: geneName,
              },
            },
          ],
        },
        request_options: {
          paginate: {
            start: 0,
            rows: maxResults,
          },
        },
        return_type: 'entry',
      };

      console.log('PDB search query:', JSON.stringify(searchQuery, null, 2));

      // Fixed: Use POST request instead of GET with URL parameter
      const response = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(searchQuery),
      });

      if (!response.ok) {
        console.warn(`PDB search failed with ${response.status}: ${response.statusText}`);
        // Try simpler search if complex query fails
        return await this.performSimplePDBSearch(geneName, organism, maxResults);
      }

      const searchData = await response.json();
      return await this.processPDBResults(searchData, geneName, organism, maxResults);
    } catch (error) {
      console.error('PDB search error:', error);
      // Fallback to simple search
      try {
        return await this.performSimplePDBSearch(geneName, organism, maxResults);
      } catch (fallbackError) {
        console.error('Fallback PDB search also failed:', fallbackError);
        // Return known PDB structures for common genes
        return this.getKnownPDBStructures(geneName, organism);
      }
    }
  }

  /**
   * Perform simple PDB search as fallback
   */
  async performSimplePDBSearch(geneName, organism, maxResults) {
    console.log('Performing simple PDB search as fallback');

    const simpleQuery = {
      query: {
        type: 'terminal',
        service: 'text',
        parameters: {
          attribute: 'struct.title',
          operator: 'contains_words',
          value: geneName,
        },
      },
      request_options: {
        paginate: {
          start: 0,
          rows: maxResults,
        },
      },
      return_type: 'entry',
    };

    // Fixed: Use POST request for fallback search as well
    const response = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(simpleQuery),
    });

    if (!response.ok) {
      throw new Error(`Simple PDB search failed: ${response.status} ${response.statusText}`);
    }

    const searchData = await response.json();
    return await this.processPDBResults(searchData, geneName, organism, maxResults);
  }

  /**
   * Process PDB search results
   */
  async processPDBResults(searchData, geneName, organism, maxResults) {
    const results = [];

    if (searchData.result_set && searchData.result_set.length > 0) {
      for (const result of searchData.result_set.slice(0, maxResults)) {
        const pdbId = result.identifier;

        try {
          const details = await this.getPDBDetails(pdbId);
          results.push({
            pdbId: pdbId,
            title: details.title || 'Unknown',
            resolution: details.resolution,
            method: details.method,
            organism: details.organism,
            geneName: geneName,
            releaseDate: details.releaseDate,
            authors: details.authors,
            classification: details.classification,
            pdbUrl: `https://www.rcsb.org/structure/${pdbId}`,
            downloadUrl: `https://files.rcsb.org/download/${pdbId}.pdb`,
          });
        } catch (error) {
          console.warn(`Failed to get details for PDB ${pdbId}:`, error.message);
          // Add basic result even if details fail
          results.push({
            pdbId: pdbId,
            title: 'Unknown',
            geneName: geneName,
            pdbUrl: `https://www.rcsb.org/structure/${pdbId}`,
            downloadUrl: `https://files.rcsb.org/download/${pdbId}.pdb`,
          });
        }
      }
    }

    console.log(`Found ${results.length} PDB structures for gene ${geneName}`);
    return results;
  }

  /**
   * Get known PDB structures for common genes
   */
  getKnownPDBStructures(geneName, organism) {
    const knownStructures = {
      lysc: {
        'Escherichia coli': [
          {
            pdbId: '2J0W',
            title: 'Crystal structure of aspartokinase III from E. coli',
            resolution: '2.5',
            method: 'X-RAY DIFFRACTION',
            organism: 'Escherichia coli',
            geneName: 'lysC',
            releaseDate: '2006-08-23',
            classification: 'TRANSFERASE',
            pdbUrl: 'https://www.rcsb.org/structure/2J0W',
            downloadUrl: 'https://files.rcsb.org/download/2J0W.pdb',
          },
        ],
      },
    };

    const geneKey = geneName.toLowerCase();
    if (knownStructures[geneKey] && knownStructures[geneKey][organism]) {
      return knownStructures[geneKey][organism];
    }

    return [];
  }

  /**

        const result = await this.openProteinViewer({
          pdbId: pdbId,
          geneName: geneName,
        });

        if (result.success) {
          console.log('Successfully opened PDB structure viewer');
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('Error opening PDB viewer:', error);
        alert(`Error loading structure: ${error.message}`);
      } finally {
        viewStructureBtn.disabled = false;
        viewStructureBtn.innerHTML = '<i class="fas fa-cube"></i> View 3D Structure';
      }
    };

    viewPageBtn.onclick = () => {
      const url = viewPageBtn.dataset.url;
      window.open(url, '_blank');
    };

    return element;
  }

  /**
   * Add PDB sidebar styles
   */
  addPDBSidebarStyles() {
    if (!this.services || !this.services.ui) {
      console.error('[ChatManager] ui not initialized');
      return;
    }
    return this.services.ui.addPDBSidebarStyles();
  }

  /**
   * Test MicrobeGenomicsFunctions integration
   */
  testMicrobeGenomicsIntegration() {
    console.log('=== Testing MicrobeGenomicsFunctions Integration ===');

    if (!this.MicrobeFns) {
      console.error('❌ MicrobeGenomicsFunctions not available');
      return {
        success: false,
        error: 'MicrobeGenomicsFunctions not loaded',
      };
    }

    const testResults = {
      functionsAvailable: {},
      categoriesAvailable: false,
      examplesAvailable: false,
      totalFunctions: 0,
    };

    try {
      // Test if categories method works
      const categories = this.MicrobeFns.getFunctionCategories();
      testResults.categoriesAvailable = !!categories;
      console.log('✅ Categories available:', Object.keys(categories));

      // Test if examples method works
      const examples = this.MicrobeFns.getUsageExamples();
      testResults.examplesAvailable = !!examples;
      console.log('✅ Examples available:', examples.length);

      // Test individual function availability
      const testFunctions = [
        'navigateTo',
        'jumpToGene',
        'getCurrentRegion',
        'scrollLeft',
        'scrollRight',
        'zoomIn',
        'zoomOut',
        'computeGC',
        'reverseComplement',
        'translateDNA',
        'findORFs',
        'calculateEntropy',
        'calculateMeltingTemp',
        'calculateMolecularWeight',
        'analyzeCodonUsage',
        'predictPromoter',
        'predictRBS',
        'predictTerminator',
        'searchGeneByName',
        'searchSequenceMotif',
        'searchByPosition',
        'searchIntergenicRegions',
        'editAnnotation',
        'deleteAnnotation',
        'mergeAnnotations',
        'addAnnotation',
        'getUpstreamRegion',
        'getDownstreamRegion',
        'addTrack',
        'addVariant',
      ];

      testFunctions.forEach(funcName => {
        const isAvailable = typeof this.MicrobeFns[funcName] === 'function';
        testResults.functionsAvailable[funcName] = isAvailable;
        if (isAvailable) {
          testResults.totalFunctions++;
          console.log(`✅ ${funcName} available`);
        } else {
          console.log(`❌ ${funcName} NOT available`);
        }
      });

      // Test a simple function call
      try {
        const testSequence = 'ATGCGCTATCG';
        const gcResult = this.MicrobeFns.computeGC(testSequence);
        console.log(`✅ Function call test: computeGC("${testSequence}") = ${gcResult}%`);
        testResults.functionCallTest = { success: true, result: gcResult };
      } catch (error) {
        console.log(`❌ Function call test failed: ${error.message}`);
        testResults.functionCallTest = { success: false, error: error.message };
      }

      console.log('=== Integration Test Summary ===');
      console.log(`Total functions available: ${testResults.totalFunctions}/${testFunctions.length}`);
      console.log(`Categories available: ${testResults.categoriesAvailable}`);
      console.log(`Examples available: ${testResults.examplesAvailable}`);
      console.log('===================================');

      return {
        success: true,
        ...testResults,
      };
    } catch (error) {
      console.error('❌ Integration test failed:', error);
      return {
        success: false,
        error: error.message,
        ...testResults,
      };
    }
  }

  /**
   * Test tool execution through ChatManager
   */
  async testToolExecution() {
    try {
      const testResult = await this.openProteinViewer({
        pdbId: '1TUP',
        title: 'Test Protein Structure',
      });

      console.log('Tool execution test result:', testResult);
      this.addMessageToChat('Tool execution test completed. Check console for details.', 'assistant');
    } catch (error) {
      console.error('Tool execution test failed:', error);
      this.addMessageToChat(`Tool execution test failed: ${error.message}`, 'assistant', true);
    }
  }

  // ====================================
  // BLAST SEARCH FUNCTIONALITY
  // ====================================

  async blastSearch(params) {
    return this.services.blast.blastSearch(params);
  }

  async blastSequenceFromRegion(params) {
    return this.services.blast.blastSequenceFromRegion(params);
  }

  getBlastDatabases(params) {
    return this.services.blast.getBlastDatabases(params);
  }

  // ====================================
  // ENHANCED BLAST FUNCTIONALITY WITH MCP INTEGRATION
  // ====================================

  async batchBlastSearch(params) {
    return this.services.blast.batchBlastSearch(params);
  }

  async localBlastDatabaseInfo(params) {
    return this.services.blast.localBlastDatabaseInfo(params);
  }

  async executeMCPBlastTool(toolName, params) {
    return this.services.blast.executeMCPBlastTool(toolName, params);
  }

  async advancedBlastSearch(params) {
    return this.services.blast.advancedBlastSearch(params);
  }

  applyBlastFilters(hits, filters) {
    return this.services.blast.applyBlastFilters(hits, filters);
  }

  async getGenomeInfo(params = {}) {
    const { include_statistics = true, include_annotations = true, include_chromosomes = true } = params;

    if (!this.app || !this.app.currentSequence) {
      return {
        success: false,
        error: 'No genome loaded',
        genome_name: null,
        chromosomes: [],
        statistics: null,
        annotations: null,
      };
    }

    const sequences = Object.keys(this.app.currentSequence);
    const totalLength = Object.values(this.app.currentSequence).reduce((sum, seq) => sum + seq.length, 0);

    const result = {
      success: true,
      genome_name: this.app.currentGenomeName || this.app.loadedFiles?.[0]?.name || 'Unknown',
      organism: this.app.organism || 'Unknown',
      total_length: totalLength,
      chromosome_count: sequences.length,
    };

    if (include_chromosomes) {
      result.chromosomes = sequences.map(chr => ({
        name: chr,
        length: this.app.currentSequence[chr]?.length || 0,
      }));
    }

    if (include_statistics) {
      const annotationCount = this.app.currentAnnotations
        ? Object.values(this.app.currentAnnotations).reduce(
            (sum, anns) => sum + (Array.isArray(anns) ? anns.length : 0),
            0
          )
        : 0;
      result.statistics = {
        total_length: totalLength,
        total_chromosomes: sequences.length,
        total_annotations: annotationCount,
        loaded_files: this.app.loadedFiles?.length || 0,
        gc_content: this.calculateGCContent(Object.values(this.app.currentSequence).join('')),
      };
    }

    if (include_annotations) {
      const annotationCount = this.app.currentAnnotations
        ? Object.values(this.app.currentAnnotations).reduce(
            (sum, anns) => sum + (Array.isArray(anns) ? anns.length : 0),
            0
          )
        : 0;
      result.annotations = {
        total_count: annotationCount,
        types: this.app.currentAnnotations
          ? [
              ...new Set(
                Object.values(this.app.currentAnnotations)
                  .flat()
                  .map(a => a.type || a.featureType || 'unknown')
              ),
            ]
          : [],
      };
    }

    return result;
  }

  calculateGCContent(sequence) {
    if (!sequence || sequence.length === 0) return 0;
    const gcCount = (sequence.match(/[GC]/gi) || []).length;
    return Math.round((gcCount / sequence.length) * 100 * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Show metabolic pathway visualization
   */
  async showMetabolicPathway(params) {
    if (!this.services || !this.services.ui) {
      console.error('[ChatManager] ui not initialized');
      return;
    }
    return await this.services.ui.showMetabolicPathway(params);
  }

  /**
   * Find genes associated with a metabolic pathway
   */
  async findPathwayGenes(params) {
    try {
      const { pathwayName, includeRegulation = false } = params;

      // Use the same pathway templates
      const result = await this.showMetabolicPathway({ pathwayName });

      if (!result.success) {
        return result;
      }

      const foundGenes = result.genes || [];

      // If includeRegulation is true, search for regulatory genes
      const regulatoryGenes = [];
      if (includeRegulation) {
        const regulatorySearchTerms = [
          `${pathwayName}R`,
          `${pathwayName}regulator`,
          `${pathwayName}activator`,
          'crp',
          'cra',
          'fnr',
          'arcA', // Common regulatory genes
        ];

        for (const term of regulatorySearchTerms) {
          try {
            const regResult = await this.searchFeatures({ query: term, caseSensitive: false });
            if (regResult.success && regResult.results.length > 0) {
              regulatoryGenes.push(...regResult.results.slice(0, 3)); // Limit to 3 per term
            }
          } catch (error) {
            console.warn(`Failed to search for regulatory gene ${term}:`, error);
          }
        }
      }

      return {
        success: true,
        pathwayName: result.pathway.pathwayName,
        description: result.pathway.description,
        metabolicGenes: foundGenes,
        regulatoryGenes: includeRegulation ? regulatoryGenes : [],
        totalGenes: foundGenes.length + (includeRegulation ? regulatoryGenes.length : 0),
        summary: `Found ${foundGenes.length} metabolic genes${includeRegulation ? ` and ${regulatoryGenes.length} regulatory genes` : ''} for ${pathwayName}`,
      };
    } catch (error) {
      console.error('Error finding pathway genes:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate and check all available tools
   * @returns {Object} a detailed tools validation report
   */
  validateAllTools() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {},
      details: {},
      issues: [],
      recommendations: [],
    };

    try {
      const context = this.getCurrentContext();
      const allTools = context.genomeBrowser.availableTools;

      // Count the number of tools of each type
      report.summary = {
        totalTools: allTools.length,
        localTools: context.genomeBrowser.toolSources.local,
        pluginTools: context.genomeBrowser.toolSources.plugins,
        mcpTools: context.genomeBrowser.toolSources.mcp,
      };

      // Check whether each tool is executable
      const toolCategories = {
        navigation: [],
        search: [],
        sequence: [],
        analysis: [],
        annotation: [],
        blast: [],
        protein: [],
        plugin: [],
        mcp: [],
      };

      allTools.forEach(tool => {
        let category = 'other';

        if (tool.includes('navigate') || tool.includes('zoom') || tool.includes('scroll') || tool.includes('jump')) {
          category = 'navigation';
        } else if (tool.includes('search') || tool.includes('find')) {
          category = 'search';
        } else if (
          tool.includes('sequence') ||
          tool.includes('translate') ||
          tool.includes('gc') ||
          tool.includes('reverse')
        ) {
          category = 'sequence';
        } else if (
          tool.includes('analyze') ||
          tool.includes('calculate') ||
          tool.includes('predict') ||
          tool.includes('statistics')
        ) {
          category = 'analysis';
        } else if (tool.includes('annotation') || tool.includes('gene') || tool.includes('operons')) {
          category = 'annotation';
        } else if (tool.includes('blast')) {
          category = 'blast';
        } else if (tool.includes('protein') || tool.includes('pdb')) {
          category = 'protein';
        } else if (tool.includes('.')) {
          category = 'plugin';
        }

        toolCategories[category].push(tool);
      });

      report.details.categories = toolCategories;

      // Check the MicrobeGenomicsFunctions integration
      const microbeTools = [];
      if (window.MicrobeGenomicsFunctions) {
        const microbeFunctions = window.MicrobeGenomicsFunctions.getFunctionCategories();
        Object.values(microbeFunctions).forEach(category => {
          microbeTools.push(...category.functions);
        });
      }

      report.details.microbeGenomics = {
        available: !!window.MicrobeGenomicsFunctions,
        functionCount: microbeTools.length,
        functions: microbeTools,
      };

      // Check the plugin system
      report.details.plugins = {
        integratorAvailable: !!this.pluginFunctionCallsIntegrator,
        managerAvailable: !!this.pluginManager,
        mappedFunctions: this.pluginFunctionCallsIntegrator
          ? this.pluginFunctionCallsIntegrator.pluginFunctionMap.size
          : 0,
      };

      // Check the MCP server
      report.details.mcp = {
        managerAvailable: !!this.mcpServerManager,
        connectedServers: this.mcpServerManager ? this.mcpServerManager.getConnectedServersCount() : 0,
        availableTools: this.mcpServerManager ? this.mcpServerManager.getAllAvailableTools().length : 0,
      };

      // Generate suggestions
      if (report.summary.totalTools < 50) {
        report.recommendations.push('工具数量较少，可能需要检查插件和MCP服务器连接');
      }

      if (!report.details.microbeGenomics.available) {
        report.issues.push('MicrobeGenomicsFunctions未正确加载');
      }

      if (!report.details.plugins.integratorAvailable) {
        report.issues.push('插件函数调用集成器未初始化');
      }

      if (report.details.mcp.connectedServers === 0) {
        report.recommendations.push('建议连接MCP服务器以获得更多工具');
      }

      console.log('🔍 Tools Validation Report:', report);
      return report;
    } catch (error) {
      report.issues.push(`验证过程出错: ${error.message}`);
      console.error('Tools validation failed:', error);
      return report;
    }
  }

  /**
   * Start conversation state management
   */
  startConversation() {
    this.conversationState.isProcessing = true;
    this.conversationState.aborted = false;
    this.conversationState.currentRequestId = Date.now().toString();
    this.conversationState.startTime = Date.now();
    this.conversationState.processSteps = [];
    this.conversationState.currentStep = 0;

    // Drop any round group left dangling by a previous run so the first step
    // of this request cannot be appended into the last request's panel.
    this.activityRoundState = null;
    this.activityTotals = { rounds: 0, tools: 0, failures: 0 };

    // Update the UI state
    this.updateUIState();
  }

  /**
   * End conversation state management
   */
  endConversation() {
    // Save the current thinking process before clearing the state
    const currentRequestId = this.conversationState.currentRequestId;

    // Convert the current thinking process into a history record
    this.finalizeCurrentThinkingProcess(currentRequestId);

    this.conversationState.isProcessing = false;
    this.conversationState.currentRequestId = null;
    this.conversationState.abortController = null;
    this.conversationState.startTime = null;
    this.conversationState.processSteps = [];
    this.conversationState.currentStep = 0;

    // Update the UI state
    this.updateUIState();

    // Note: we no longer remove the thinking process automatically; we convert it into a history record instead
  }

  /**
   * Convert the current thinking process into a history record
   */
  finalizeCurrentThinkingProcess(requestId) {
    if (!requestId) return;

    // Seal the last open round before summarizing the panel around it.
    this.closeActivityRound();

    const thinkingElement = document.getElementById(`thinkingProcess_${requestId}`);
    if (thinkingElement) {
      const totals = this.activityTotals || { rounds: 0, tools: 0, failures: 0 };
      const failed = totals.failures > 0;

      // Remove animations and interactive elements, converting to a static history record
      // Swap the header's spinner for the terminal state icon
      const statusIcon = thinkingElement.querySelector('.activity-status');
      if (statusIcon) {
        statusIcon.classList.remove('fa-spin');
        statusIcon.classList.remove('fa-cog');
        statusIcon.classList.add(failed ? 'fa-exclamation-circle' : 'fa-check-circle');
      }

      // The checkmark already says "done", so the header carries what the run
      // actually did instead: rounds, tools, failures, elapsed time.
      const summarySlot = thinkingElement.querySelector('.activity-summary');
      if (summarySlot) {
        const parts = [];
        if (totals.rounds) parts.push(`${totals.rounds} round${totals.rounds === 1 ? '' : 's'}`);
        if (totals.tools) parts.push(`${totals.tools} tool${totals.tools === 1 ? '' : 's'}`);
        if (failed) parts.push(`${totals.failures} failed`);
        const elapsed = this.conversationState?.startTime
          ? this.formatActivityDuration(Date.now() - this.conversationState.startTime)
          : '';
        if (elapsed) parts.push(elapsed);
        summarySlot.textContent = parts.length ? `· ${parts.join(' · ')}` : '';
      } else {
        // Panels built before this markup existed (e.g. restored history).
        const headerText = thinkingElement.querySelector('.thinking-header span');
        if (headerText) headerText.textContent = 'Agent Activity (Completed)';
      }

      // Change the style to indicate completion
      thinkingElement.classList.add('thinking-completed');
      thinkingElement.classList.toggle('activity-failed', failed);

      // Collapse to the summary line now the run is over. A run with a failing
      // tool stays open — that is exactly when the detail is worth reading.
      this.bindActivityHeaderToggle(thinkingElement);
      this.setActivityPanelCollapsed(thinkingElement, this.activityAutoCollapse && !failed);

      // Remove the ID to avoid conflicts with a new thinking process
      thinkingElement.removeAttribute('id');

      // Add a timestamp (if enabled)
      if (this.showTimestamps) {
        const timestamp = new Date().toLocaleTimeString();
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'thinking-timestamp';
        timestampDiv.textContent = `Completed at ${timestamp}`;
        thinkingElement.querySelector('.message-content').appendChild(timestampDiv);
      }

      // The setting was read but never acted on, so the panel stayed on screen
      // either way. Only this request's panel goes — earlier ones are history.
      if (this.hideThinkingAfterConversation) {
        this.removeActivityPanel(thinkingElement);
      }
    }

    // Tallies belong to the panel that just closed; the next one starts fresh,
    // and no further step should be filed into the sealed panel.
    this.activityTotals = null;
    this.activityPanelElement = null;
  }

  /** Fade a finished activity panel out and drop it from the transcript. */
  removeActivityPanel(panel) {
    if (!panel) return;
    if (this.activityPanelElement === panel) this.activityPanelElement = null;
    panel.style.transition = 'opacity 0.5s ease-out';
    panel.style.opacity = '0';
    setTimeout(() => panel.remove(), 500);
  }

  /**
   * Abort the current conversation
   */
  abortCurrentConversation() {
    if (this.conversationState.isProcessing && this.conversationState.abortController) {
      // Raise the sticky flag before tearing the state down. endConversation()
      // below nulls the controller so the UI unlocks immediately, and the loop
      // that is still awaiting a provider response reads this flag instead.
      this.conversationState.aborted = true;
      this.conversationState.abortController.abort();
      this.showNotification('Conversation aborted', 'warning');

      // Remove the typing indicator
      this.removeTypingIndicator();

      // End the conversation state
      this.endConversation();
    }
  }

  /**
   * Update the UI state
   */
  updateUIState() {
    const sendBtn = document.getElementById('sendChatBtn');
    const abortBtn = document.getElementById('abortChatBtn');
    const chatInput = document.getElementById('chatInput');
    const toggleChatBtn = document.getElementById('toggleChatBtn');

    if (this.conversationState.isProcessing) {
      // Conversation in progress - disable send button, show abort button
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.classList.add('processing');
      }
      if (abortBtn) {
        abortBtn.style.display = 'block';
      }
      if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Conversation in progress, please wait...';
      }
      if (toggleChatBtn) {
        toggleChatBtn.classList.add('ai-processing');
      }
    } else {
      // Conversation ended - restore normal state
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        sendBtn.classList.remove('processing');
      }
      if (abortBtn) {
        abortBtn.style.display = 'none';
      }
      if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = 'Ask me anything about your genome data...';
      }
      if (toggleChatBtn) {
        toggleChatBtn.classList.remove('ai-processing');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Live token streaming
  //
  // Tokens arrive faster than the display refreshes, so writes are coalesced
  // into one DOM update per animation frame. Text lands in a single Text node
  // via appendData(), which appends in place rather than re-parsing the whole
  // message the way `innerHTML +=` would.
  //
  // Two independent streams run per round: visible answer text into the preview
  // bubble, and reasoning into a live block inside the thinking panel.
  // ---------------------------------------------------------------------------

  /** rAF when available; a timer fallback keeps this working outside a browser. */
  scheduleStreamFrame(callback) {
    const schedule =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame : handler => setTimeout(handler, 16);
    return schedule(callback);
  }

  cancelStreamFrame(handle) {
    if (handle === null || handle === undefined) return;
    const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
    cancel(handle);
  }

  /** Keep the transcript pinned to the newest output when auto-scroll is on. */
  scrollMessagesToBottom() {
    if (!this.autoScrollToBottom) return;
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Create (or reuse) the live response bubble for the current request.
   * The bubble is a preview only — the final message is still rendered by the
   * normal path once the round completes.
   */
  beginStreamingResponse() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    // A new round streams its own reasoning. Any block left over from a previous
    // round has already been settled in the DOM, so the handle is simply dropped.
    this.reasoningStreamState = null;

    if (this.streamingState?.container?.isConnected) return;

    const streamingId = `streamingResponse_${this.conversationState.currentRequestId || Date.now()}`;
    document.getElementById(streamingId)?.remove();

    const streamingDiv = document.createElement('div');
    streamingDiv.className = 'message assistant-message streaming-message';
    streamingDiv.id = streamingId;

    const content = document.createElement('div');
    content.className = 'message-content';

    const text = document.createElement('div');
    text.className = 'message-text streaming-text';

    const textNode = document.createTextNode('');
    text.appendChild(textNode);

    const cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';
    text.appendChild(cursor);

    content.appendChild(text);
    streamingDiv.appendChild(content);
    messagesContainer.appendChild(streamingDiv);

    this.streamingState = {
      container: streamingDiv,
      textNode,
      pending: '',
      frameHandle: null,
      hasContent: false,
      // Inline-reasoning routing state (see routeStreamedToken)
      inReasoningTag: false,
      carry: '',
    };
  }

  // Inline reasoning tags. Matches the set IntentParserService extracts reasoning
  // from, so the live block and the finalized block agree on what counts as
  // reasoning. Non-global: `match` on these is stateless and safe to share.
  static REASONING_TAG_NAMES = ['think', 'thinking', 'analysis', 'reasoning'];
  static REASONING_OPEN_TAG = /<(?:think|thinking|analysis|reasoning)\b[^>]*>/i;
  static REASONING_CLOSE_TAG = /<\/(?:think|thinking|analysis|reasoning)\s*>/i;

  /**
   * Route one streamed token to the answer bubble or the reasoning block.
   *
   * Providers split into two camps: those that stream reasoning on a separate
   * channel (handled by onReasoningToken) and those that inline it as
   * <think>…</think> inside the content. Without this split the inline camp
   * streams raw tags into the answer bubble, then has them stripped when the
   * finished message renders — reasoning that never reaches the thinking panel
   * while it is being produced.
   *
   * Tags can straddle token boundaries, so a trailing partial tag is carried
   * over to the next token rather than emitted.
   */
  appendStreamingToken(token) {
    if (!token || !this.streamingState) return;

    const state = this.streamingState;
    let buffer = state.carry + token;
    state.carry = '';

    while (buffer) {
      if (state.inReasoningTag) {
        const close = buffer.match(ChatManager.REASONING_CLOSE_TAG);
        if (!close) {
          buffer = this.holdPartialTag(buffer, text => this.appendStreamingReasoningToken(text));
          return;
        }
        if (close.index > 0) this.appendStreamingReasoningToken(buffer.slice(0, close.index));
        buffer = buffer.slice(close.index + close[0].length);
        state.inReasoningTag = false;
      } else {
        const open = buffer.match(ChatManager.REASONING_OPEN_TAG);
        if (!open) {
          buffer = this.holdPartialTag(buffer, text => this.writeStreamingText(text));
          return;
        }
        if (open.index > 0) this.writeStreamingText(buffer.slice(0, open.index));
        buffer = buffer.slice(open.index + open[0].length);
        state.inReasoningTag = true;
      }
    }
  }

  /**
   * Emit everything in `buffer` except a trailing fragment that could still turn
   * out to be a reasoning tag, which is held for the next token.
   */
  holdPartialTag(buffer, emit) {
    const cut = this.findPartialTagStart(buffer);
    if (cut > 0) emit(buffer.slice(0, cut));
    this.streamingState.carry = buffer.slice(cut);
    return '';
  }

  /**
   * Index where a trailing fragment could still grow into a reasoning tag, or
   * `buffer.length` when nothing needs holding back.
   *
   * Held text is invisible until the next token arrives, so the test is kept
   * narrow: prose like `a < b` or `x <threshold` can never become one of these
   * tags and must not be stalled waiting for a `>` that never comes.
   */
  findPartialTagStart(buffer) {
    const start = buffer.lastIndexOf('<');
    if (start === -1) return buffer.length;

    const tail = buffer.slice(start).toLowerCase();
    if (tail.includes('>')) return buffer.length; // a complete tag, and not one of ours
    const name = tail.startsWith('</') ? tail.slice(2) : tail.slice(1);
    return ChatManager.REASONING_TAG_NAMES.some(tag => tag.startsWith(name)) ? start : buffer.length;
  }

  /** Buffer answer text and schedule a single coalesced DOM write for this frame. */
  writeStreamingText(text) {
    if (!text || !this.streamingState?.textNode) return;

    this.streamingState.pending += text;
    this.streamingState.hasContent = true;

    if (this.streamingState.frameHandle !== null) return;

    this.streamingState.frameHandle = this.scheduleStreamFrame(() => {
      this.flushStreamingTokens();
    });
  }

  /** Write all buffered tokens in one operation. */
  flushStreamingTokens() {
    const state = this.streamingState;
    if (!state) return;

    state.frameHandle = null;
    if (!state.pending || !state.textNode) return;

    // appendData mutates the existing text node in place — no markup re-parse.
    state.textNode.appendData(state.pending);
    state.pending = '';

    this.scrollMessagesToBottom();
  }

  /**
   * Discard streamed text without removing the bubble. Used when a provider
   * stream fails partway and the request is retried, so partial text is not
   * duplicated by the retry.
   */
  resetStreamingResponse() {
    // A retry regenerates the reasoning too, so the live block goes with it.
    this.resetStreamingReasoning();

    const state = this.streamingState;
    if (!state) return;

    this.cancelStreamFrame(state.frameHandle);
    state.frameHandle = null;

    state.pending = '';
    state.hasContent = false;
    // The retry restarts the response from scratch, so tag routing restarts too.
    state.inReasoningTag = false;
    state.carry = '';
    if (state.textNode) state.textNode.data = '';
  }

  /** Tear down the live bubble; the completed message renders through the normal path. */
  endStreamingResponse() {
    // Runs from a `finally`, so it is also the stop signal on error and abort:
    // stop the reasoning block animating even when no final render follows.
    this.settleStreamingReasoning();

    const state = this.streamingState;
    if (!state) return;

    this.cancelStreamFrame(state.frameHandle);

    state.container?.remove();
    this.streamingState = null;
  }

  // ---------------------------------------------------------------------------
  // Live reasoning streaming
  //
  // Reasoning models emit their chain of thought before (and alongside) the
  // answer. It renders into the thinking panel as it arrives, then displayLLMThinking()
  // finalizes the same block once the round resolves — so the reasoning is never
  // rendered twice.
  // ---------------------------------------------------------------------------

  /**
   * Create the live reasoning block on first token. Returns the render state, or
   * null when the thinking panel is hidden or unavailable.
   */
  beginStreamingReasoning() {
    if (!this.showThinkingProcess) return null;
    if (this.reasoningStreamState?.body?.isConnected) return this.reasoningStreamState;

    // The round's own progress lines create the panel before the request goes
    // out; create it here too so reasoning is never dropped for want of one.
    let thinkingContent = this.findThinkingContentElement();
    if (!thinkingContent) {
      this.addThinkingMessage('');
      thinkingContent = this.findThinkingContentElement();
      if (!thinkingContent) return null;
    }

    const details = document.createElement('details');
    details.className = 'reasoning-stream';
    details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = '💭 Model reasoning';
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'reasoning-stream-body';
    body.style.paddingTop = '8px';
    body.style.fontFamily = 'inherit';
    body.style.fontSize = 'inherit';
    body.style.whiteSpace = 'pre-wrap';

    const textNode = document.createTextNode('');
    body.appendChild(textNode);

    const cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';
    body.appendChild(cursor);

    details.appendChild(body);

    // Inserted directly rather than through updateThinkingMessage: Evolution
    // records the finalized reasoning text once the round resolves, which is
    // more useful than an entry holding a still-empty DOM node.
    const wrapper = this.appendThinkingStepElement(thinkingContent, details);

    this.reasoningStreamState = {
      wrapper,
      details,
      body,
      textNode,
      cursor,
      pending: '',
      text: '',
      frameHandle: null,
    };
    return this.reasoningStreamState;
  }

  /** Buffer a reasoning token and schedule a single coalesced DOM write. */
  appendStreamingReasoningToken(token) {
    if (!token) return;

    const state = this.beginStreamingReasoning();
    if (!state) return;

    state.pending += token;
    state.text += token;

    if (state.frameHandle !== null) return;

    state.frameHandle = this.scheduleStreamFrame(() => {
      this.flushStreamingReasoningTokens();
    });
  }

  /** Write all buffered reasoning tokens in one operation. */
  flushStreamingReasoningTokens() {
    const state = this.reasoningStreamState;
    if (!state) return;

    state.frameHandle = null;
    if (!state.pending || !state.textNode) return;

    state.textNode.appendData(state.pending);
    state.pending = '';

    // The body is height-capped while streaming, so keep its own view on the
    // newest text in addition to scrolling the transcript.
    if (state.body) state.body.scrollTop = state.body.scrollHeight;
    this.scrollMessagesToBottom();
  }

  /**
   * Discard streamed reasoning entirely. Used when a provider stream fails
   * partway: the retry regenerates the reasoning from scratch, so a partial
   * block must not survive to be appended to.
   */
  resetStreamingReasoning() {
    const state = this.reasoningStreamState;
    if (!state) return;

    this.cancelStreamFrame(state.frameHandle);
    // Remove the whole step, not just the block, so no empty wrapper is left.
    (state.wrapper || state.details).remove();
    this.reasoningStreamState = null;
  }

  /**
   * Stop the live block animating and commit any buffered text, while keeping
   * the handle so the round's final render can still format it. Safe to call
   * when nothing streamed.
   */
  settleStreamingReasoning() {
    const state = this.reasoningStreamState;
    if (!state) return;

    this.cancelStreamFrame(state.frameHandle);
    state.frameHandle = null;
    this.flushStreamingReasoningTokens();
    state.cursor?.remove();
    state.cursor = null;
  }

  /**
   * Replace the streamed raw text with the round's formatted reasoning and
   * collapse the block, matching how a non-streamed round renders.
   *
   * @param {string} finalText Normalized reasoning for the round; falls back to
   *   the streamed text when the normalizer produced nothing.
   * @returns {boolean} True when a live block was finalized, so the caller
   *   should not render a second one.
   */
  finalizeStreamingReasoning(finalText = '') {
    const state = this.reasoningStreamState;
    if (!state) return false;

    this.settleStreamingReasoning();
    this.reasoningStreamState = null;

    const streamedText = state.text.trim();
    if (!streamedText) {
      // Only whitespace arrived — drop the block so an empty one is not shown.
      (state.wrapper || state.details).remove();
      return false;
    }

    const resolvedText = String(finalText || '').trim() || streamedText;
    const formatted = this.formatThinkingContent(resolvedText);
    state.body.textContent = formatted;
    state.body.style.whiteSpace = 'pre-line';
    state.details.open = false;

    // Recorded here rather than at creation time so the entry holds the
    // reasoning text instead of a DOM node that was still empty.
    this.addToEvolutionData({
      type: 'thinking_process',
      timestamp: new Date().toISOString(),
      content: formatted,
      visible: true,
      metadata: {
        source: 'ai_thinking',
        requestId: this.conversationState.currentRequestId,
        step: 'model_reasoning',
      },
    });

    return true;
  }

  /**
   * Add a thinking-process message
   */
  addThinkingMessage(message) {
    // Check whether thinking-process display is enabled
    if (!this.showThinkingProcess) {
      // Even if not displayed, record the thinking process for Evolution
      this.addToEvolutionData({
        type: 'thinking_process',
        timestamp: new Date().toISOString(),
        content: message,
        visible: false,
        metadata: {
          source: 'ai_thinking',
          requestId: this.conversationState.currentRequestId,
          step: 'initial_thinking',
        },
      });
      return;
    }

    // Only remove the currently in-progress thinking process (if any).
    // Panels created outside a tracked request get a sequential id instead.
    // Date.now() used to fill that slot, so two panels opened within the same
    // millisecond shared an id and the second one deleted the first.
    this.activityPanelSeq = (this.activityPanelSeq || 0) + 1;
    const currentRequestId = this.conversationState.currentRequestId || `detached_${this.activityPanelSeq}`;
    const existingThinking = document.getElementById(`thinkingProcess_${currentRequestId}`);
    if (existingThinking) {
      existingThinking.remove();
    }

    const messagesContainer = document.getElementById('chatMessages');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'message assistant-message thinking-process';
    const thinkingId = `thinkingProcess_${currentRequestId}`;
    thinkingDiv.id = thinkingId;
    // The header doubles as the collapse control: chevron, run state, title, and
    // a summary slot that stays empty until the request finishes. The run state
    // sits inline here rather than in an avatar column so the log runs full width.
    thinkingDiv.innerHTML =
      `<div class="message-content">` +
      `<div class="message-text thinking-text">` +
      `<div class="thinking-header" role="button" tabindex="0" aria-expanded="true" title="Click to collapse or expand">` +
      `<i class="fas fa-chevron-down activity-chevron" aria-hidden="true"></i>` +
      `<i class="fas fa-cog fa-spin activity-status" aria-hidden="true"></i>` +
      `<span class="activity-title">Agent Activity</span>` +
      `<span class="activity-summary"></span>` +
      `</div>` +
      `<div class="thinking-content">${message}</div>` +
      `</div></div>`;

    messagesContainer.appendChild(thinkingDiv);

    // A fresh panel means a fresh set of round groups and tallies, and it is
    // now the panel later steps belong to.
    this.activityRoundState = null;
    this.activityTotals = { rounds: 0, tools: 0, failures: 0 };
    this.activityPanelElement = thinkingDiv;
    this.bindActivityHeaderToggle(thinkingDiv);

    // Add to Evolution data structure
    this.addToEvolutionData({
      type: 'thinking_process',
      timestamp: new Date().toISOString(),
      content: message,
      elementId: thinkingId,
      visible: true,
      metadata: {
        source: 'ai_thinking',
        requestId: this.conversationState.currentRequestId,
        step: 'initial_thinking',
      },
    });

    // Decide whether to auto-scroll based on the settings
    if (this.autoScrollToBottom) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Add a multi-agent-system activation message
   */
  addMultiAgentActivationMessage() {
    const messagesContainer = document.getElementById('chatMessages');
    const activationDiv = document.createElement('div');
    activationDiv.className = 'message system-message multi-agent-activation';
    // A quiet, centered status chip. This fires on every request while
    // multi-agent mode is on, so it stays out of the way; the agent roster and
    // coordination detail live in the Agent Activity panel instead.
    activationDiv.innerHTML =
      `<div class="multi-agent-chip">` +
      `<i class="fas fa-users-cog" aria-hidden="true"></i>` +
      `<span>Multi-Agent coordination active</span>` +
      `</div>`;

    messagesContainer.appendChild(activationDiv);

    // Add to Evolution data
    this.addToEvolutionData({
      type: 'multi_agent_activation',
      timestamp: new Date().toISOString(),
      content: 'Multi-Agent System Activated',
      visible: true,
      metadata: {
        source: 'multi_agent_system',
        requestId: this.conversationState.currentRequestId,
        step: 'system_activation',
      },
    });

    if (this.autoScrollToBottom) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Add an agent-decision message
   */
  addAgentDecisionMessage(agentName, toolName, reasoning, parameters = {}) {
    const messagesContainer = document.getElementById('chatMessages');
    const decisionDiv = document.createElement('div');
    decisionDiv.className = 'message assistant-message agent-decision';
    decisionDiv.innerHTML = `
            <div class="message-content">
                <div class="agent-decision-content">
                    <div class="agent-header">
                        <div class="agent-icon">${this.getAgentIcon(agentName)}</div>
                        <div class="agent-info">
                            <div class="agent-name">${agentName}</div>
                            <div class="agent-action">Selected for: <strong>${toolName}</strong></div>
                        </div>
                        <div class="agent-status">
                            <span class="status-dot processing"></span>
                            <span class="status-text">Processing</span>
                        </div>
                    </div>
                    <div class="agent-reasoning">
                        <div class="reasoning-label">Decision Reasoning:</div>
                        <div class="reasoning-text">${reasoning}</div>
                    </div>
                    ${
                      Object.keys(parameters).length > 0
                        ? `
                        <div class="agent-parameters">
                            <div class="parameters-label">Parameters:</div>
                            <div class="parameters-content">
                                <pre><code>${JSON.stringify(parameters, null, 2)}</code></pre>
                            </div>
                        </div>
                    `
                        : ''
                    }
                </div>
            </div>
        `;

    messagesContainer.appendChild(decisionDiv);

    // Add to Evolution data
    this.addToEvolutionData({
      type: 'agent_decision',
      timestamp: new Date().toISOString(),
      content: {
        agentName,
        toolName,
        reasoning,
        parameters,
      },
      visible: true,
      metadata: {
        source: 'multi_agent_system',
        requestId: this.conversationState.currentRequestId,
        step: 'agent_selection',
        agentName,
        toolName,
      },
    });

    // Update status after a short delay to show completion
    setTimeout(() => {
      const statusDot = decisionDiv.querySelector('.status-dot');
      const statusText = decisionDiv.querySelector('.status-text');
      if (statusDot && statusText) {
        statusDot.className = 'status-dot completed';
        statusText.textContent = 'Completed';
      }
    }, 2000);

    if (this.autoScrollToBottom) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Add an agent-execution-result message
   */
  addAgentExecutionResult(agentName, toolName, result, executionTime) {
    const messagesContainer = document.getElementById('chatMessages');
    const resultDiv = document.createElement('div');
    resultDiv.className = 'message assistant-message agent-result';
    resultDiv.innerHTML = `
            <div class="message-content">
                <div class="agent-result-content">
                    <div class="agent-result-header">
                        <div class="agent-icon">${this.getAgentIcon(agentName)}</div>
                        <div class="agent-info">
                            <div class="agent-name">${agentName}</div>
                            <div class="agent-action">Executed: <strong>${toolName}</strong></div>
                            <div class="execution-time">⏱️ ${executionTime}ms</div>
                        </div>
                        <div class="agent-status">
                            <span class="status-dot completed"></span>
                            <span class="status-text">Success</span>
                        </div>
                    </div>
                    <div class="agent-result-data">
                        <div class="result-label">Execution Result:</div>
                        <div class="result-content">${this.formatAgentResult(result)}</div>
                    </div>
                </div>
            </div>
        `;

    messagesContainer.appendChild(resultDiv);

    // Add to Evolution data
    this.addToEvolutionData({
      type: 'agent_execution_result',
      timestamp: new Date().toISOString(),
      content: {
        agentName,
        toolName,
        result,
        executionTime,
      },
      visible: true,
      metadata: {
        source: 'multi_agent_system',
        requestId: this.conversationState.currentRequestId,
        step: 'execution_complete',
        agentName,
        toolName,
        executionTime,
      },
    });

    if (this.autoScrollToBottom) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Get the agent icon
   */
  getAgentIcon(agentName) {
    const agentIcons = {
      'Navigation Agent': '🧭',
      'Analysis Agent': '📊',
      'Data Agent': '💾',
      'Sequence Agent': '🧬',
      'Protein Agent': '⚛️',
      'Network Agent': '🌐',
      'External Agent': '🔗',
      'Plugin Agent': '🔌',
    };
    return agentIcons[agentName] || '🤖';
  }

  /**
   * Format the agent execution result
   */
  formatAgentResult(result) {
    if (typeof result === 'string') {
      return result;
    } else if (typeof result === 'object') {
      return `<pre><code>${JSON.stringify(result, null, 2)}</code></pre>`;
    } else {
      return String(result);
    }
  }

  /**
   * Determine the responsible agent from the tool name
   */
  getAgentForTool(toolName) {
    const toolAgentMap = {
      // Navigation Agent - navigation and positioning
      navigate_to_position: 'Navigation Agent',
      open_new_tab: 'Navigation Agent',
      scroll_left: 'Navigation Agent',
      scroll_right: 'Navigation Agent',
      zoom_in: 'Navigation Agent',
      zoom_out: 'Navigation Agent',
      zoom_to_gene: 'Navigation Agent',
      bookmark_position: 'Navigation Agent',
      get_bookmarks: 'Navigation Agent',
      save_view_state: 'Navigation Agent',
      restore_view_state: 'Navigation Agent',
      get_current_state: 'Navigation Agent',
      get_current_region: 'Navigation Agent',
      jump_to_gene: 'Navigation Agent',
      select_gene: 'Navigation Agent',
      select_sequence_region: 'Navigation Agent',

      // Analysis Agent - data analysis and statistics
      compare_regions: 'Analysis Agent',
      codon_usage_analysis: 'Analysis Agent',
      analyze_codon_usage: 'Analysis Agent',
      calculate_entropy: 'Analysis Agent',
      calculate_melting_temp: 'Analysis Agent',
      calculate_molecular_weight: 'Analysis Agent',
      predict_promoter: 'Analysis Agent',
      predict_rbs: 'Analysis Agent',
      predict_terminator: 'Analysis Agent',
      find_similar_sequences: 'Analysis Agent',

      // Data Agent - data management and export
      export_data: 'Data Agent',
      capture_screenshot: 'Data Agent',
      open_image_file: 'Data Agent',
      export_region_features: 'Data Agent',
      get_file_info: 'Data Agent',
      get_genome_info: 'Data Agent',
      get_chromosome_list: 'Data Agent',
      get_track_status: 'Data Agent',
      add_track: 'Data Agent',
      add_variant: 'Data Agent',

      // Sequence Agent - sequence analysis
      get_sequence: 'Sequence Agent',
      translate_sequence: 'Sequence Agent',
      translate_dna: 'Sequence Agent',
      calculate_gc_content: 'Sequence Agent',
      compute_gc: 'Sequence Agent',
      calc_region_gc: 'Sequence Agent',
      reverse_complement: 'Sequence Agent',
      find_restriction_sites: 'Sequence Agent',
      virtual_digest: 'Sequence Agent',
      get_upstream_region: 'Sequence Agent',
      get_downstream_region: 'Sequence Agent',
      search_sequence_motif: 'Sequence Agent',

      // Protein Agent - protein-related
      open_protein_viewer: 'Protein Agent',
      fetch_protein_structure: 'Protein Agent',
      search_pdb_structures: 'Protein Agent',
      get_pdb_details: 'Protein Agent',
      amino_acid_composition: 'Protein Agent',

      // Network Agent - network and external data
      blast_search: 'Network Agent',
      blast_sequence_from_region: 'Network Agent',
      get_blast_databases: 'Network Agent',
      batch_blast_search: 'Network Agent',
      advanced_blast_search: 'Network Agent',
      show_metabolic_pathway: 'Network Agent',
      find_pathway_genes: 'Network Agent',

      // External Agent - external tools and APIs
      search_features: 'External Agent',
      find_gene_by_name: 'External Agent',
      find_gene: 'External Agent', // legacy alias
      search_by_position: 'External Agent',
      search_motif: 'External Agent',
      search_pattern: 'External Agent',
      search_intergenic_regions: 'External Agent',
      get_nearby_features: 'External Agent',
      find_intergenic_regions: 'External Agent',

      // Plugin Agent - plugin features
      get_gene_details: 'Plugin Agent',
      get_operons: 'Plugin Agent',
      create_annotation: 'Plugin Agent',
      add_annotation: 'Plugin Agent',
      edit_annotation: 'Plugin Agent',
      delete_annotation: 'Plugin Agent',
      batch_create_annotations: 'Plugin Agent',
      merge_annotations: 'Plugin Agent',
      toggle_track: 'Plugin Agent',
      toggle_annotation_track: 'Plugin Agent',
    };

    return toolAgentMap[toolName] || 'System Agent';
  }

  /**
   * Generate the agent's decision reasoning
   */
  getAgentReasoning(toolName, parameters) {
    const agentName = this.getAgentForTool(toolName);

    const reasoningTemplates = {
      'Navigation Agent': `This tool requires navigation and positioning capabilities. ${agentName} specializes in spatial operations and view management, making it the optimal choice for coordinate-based tasks.`,
      'Analysis Agent': `This tool involves data analysis and statistical computation. ${agentName} is designed for analytical operations and pattern recognition, ensuring accurate and efficient processing.`,
      'Data Agent': `This tool handles data management and export operations. ${agentName} is optimized for file operations and data transformation, providing reliable data handling capabilities.`,
      'Sequence Agent': `This tool performs sequence analysis and manipulation. ${agentName} is specialized in DNA/RNA sequence processing and bioinformatics algorithms.`,
      'Protein Agent': `This tool deals with protein structure and function analysis. ${agentName} is designed for structural biology and protein-related computations.`,
      'Network Agent': `This tool requires external database access and network operations. ${agentName} is optimized for API calls and external data retrieval.`,
      'External Agent': `This tool involves search and discovery operations. ${agentName} is specialized in information retrieval and pattern matching across datasets.`,
      'Plugin Agent': `This tool utilizes plugin functionality and annotation systems. ${agentName} is designed to manage plugin integrations and annotation workflows.`,
      'System Agent': `This tool requires general system operations. ${agentName} provides standard execution capabilities for system-level tasks.`,
    };

    return reasoningTemplates[agentName] || reasoningTemplates['System Agent'];
  }

  // ---------------------------------------------------------------------------
  // Activity panel
  //
  // One panel per request, holding a collapsible group per round. Steps land in
  // the round group that is currently open, so the panel reads as a short list
  // of rounds rather than one flat wall of progress lines. The panel collapses
  // to a single summary line when the request finishes.
  // ---------------------------------------------------------------------------

  /** Resolve the activity panel for this request, or the newest one on screen. */
  findActivityPanelElement() {
    const requestId = this.conversationState?.currentRequestId;
    if (requestId) {
      const scoped = document.getElementById(`thinkingProcess_${requestId}`);
      if (scoped) return scoped;
    }

    // No request id to scope by: the benchmark runner calls sendToLLM() without
    // going through startConversation(), so currentRequestId stays null for the
    // whole run. Fall back to the panel we last opened, then to the newest one
    // in the transcript — never the oldest. Resolving with querySelector() sent
    // every step to the first panel in the chat while addThinkingMessage() kept
    // appending new panels at the bottom, so the log read out of order.
    if (this.activityPanelElement?.isConnected) return this.activityPanelElement;

    const live = document.querySelectorAll('.thinking-process:not(.thinking-completed)');
    if (live.length) return live[live.length - 1];

    const all = document.querySelectorAll('.thinking-process');
    return all.length ? all[all.length - 1] : null;
  }

  /**
   * Resolve the container the next step should be appended to: the open round
   * group when there is one, otherwise the panel body (pre-round preamble).
   * Returns null when no panel exists yet.
   */
  findThinkingContentElement() {
    const roundBody = this.activityRoundState?.body;
    if (roundBody?.isConnected) return roundBody;
    return this.findActivityPanelElement()?.querySelector('.thinking-content') || null;
  }

  /** Wire the header so clicking (or Enter/Space on) it collapses the panel. */
  bindActivityHeaderToggle(panel) {
    const header = panel?.querySelector('.thinking-header');
    if (!header || header.dataset.activityToggleBound === 'true') return;
    header.dataset.activityToggleBound = 'true';

    const toggle = () => {
      const collapsed = !panel.classList.contains('activity-collapsed');
      this.setActivityPanelCollapsed(panel, collapsed);
      // A manual toggle on a finished panel is a standing preference: the next
      // request's panel opens the same way instead of snapping back.
      if (panel.classList.contains('thinking-completed')) {
        this.activityAutoCollapse = collapsed;
        this.chatBoxSettingsManager?.setSetting?.('activityAutoCollapse', collapsed);
      }
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle();
    });
  }

  /** Collapse or expand a panel, keeping the chevron and ARIA state in step. */
  setActivityPanelCollapsed(panel, collapsed) {
    if (!panel) return;
    panel.classList.toggle('activity-collapsed', collapsed);

    const header = panel.querySelector('.thinking-header');
    header?.setAttribute('aria-expanded', String(!collapsed));

    const chevron = panel.querySelector('.activity-chevron');
    chevron?.classList.toggle('fa-chevron-down', !collapsed);
    chevron?.classList.toggle('fa-chevron-right', collapsed);
  }

  /** Format a duration the way the panel summaries want it: 940ms, 12.4s, 2m 05s. */
  formatActivityDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    // Round to whole seconds first, then split. Splitting before rounding lets a
    // remainder above 59.5s round up to "60s" and print as "1m 60s".
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  /**
   * Open a collapsible group for a round. Closes the previous one first, so at
   * most one round is open at a time and finished rounds sit collapsed above.
   */
  beginActivityRound(round, maxRounds) {
    if (!this.showThinkingProcess) return null;
    this.closeActivityRound();

    // The preamble normally creates the panel before round 1; create it here
    // too so a round is never dropped for want of one.
    let panelBody = this.findActivityPanelElement()?.querySelector('.thinking-content');
    if (!panelBody) {
      this.addThinkingMessage('');
      panelBody = this.findActivityPanelElement()?.querySelector('.thinking-content');
      if (!panelBody) return null;
    }

    const details = document.createElement('details');
    details.className = 'activity-round';
    details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'activity-round-summary';
    summary.textContent = `Round ${round}/${maxRounds}`;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'activity-round-body';
    details.appendChild(body);

    panelBody.appendChild(details);

    if (this.activityTotals) this.activityTotals.rounds = round;

    this.activityRoundState = {
      details,
      summary,
      body,
      round,
      maxRounds,
      startedAt: Date.now(),
      tools: [],
      failures: 0,
    };
    return this.activityRoundState;
  }

  /** Record the tools a round is about to run, for its collapsed summary. */
  noteActivityRoundTools(toolNames) {
    const state = this.activityRoundState;
    if (!state || !Array.isArray(toolNames)) return;
    for (const name of toolNames) {
      if (name) state.tools.push(name);
    }
    if (this.activityTotals) this.activityTotals.tools += toolNames.filter(Boolean).length;
  }

  /** Record how a round's tool batch resolved. */
  noteActivityRoundOutcome(successCount, failureCount) {
    const state = this.activityRoundState;
    const failures = Number(failureCount) || 0;
    if (state) state.failures += failures;
    if (this.activityTotals) this.activityTotals.failures += failures;
  }

  /**
   * Collapse the open round into a one-line summary. Rounds that had a failing
   * tool stay open — that is the one case where hiding the detail is wrong.
   */
  closeActivityRound() {
    const state = this.activityRoundState;
    this.activityRoundState = null;
    if (!state?.details?.isConnected) return;

    const parts = [`Round ${state.round}`];
    if (state.tools.length) {
      const shown = state.tools.slice(0, 3).join(', ');
      parts.push(state.tools.length > 3 ? `${shown} +${state.tools.length - 3} more` : shown);
    } else {
      parts.push('no tools');
    }
    if (state.failures > 0) parts.push(`${state.failures} failed ❌`);
    else if (state.tools.length) parts.push('✅');

    const elapsed = this.formatActivityDuration(Date.now() - state.startedAt);
    if (elapsed) parts.push(elapsed);

    state.summary.textContent = parts.join(' · ');
    state.details.classList.toggle('activity-round-failed', state.failures > 0);
    state.details.open = state.failures > 0;
  }

  /**
   * Update the thinking-process message
   */
  updateThinkingMessage(message, options = {}) {
    // `verbose` steps are transport-level narration — sending, receiving,
    // history size, parameter-key echoes. They stay out of the panel at the
    // compact detail level, but are still recorded below, so Evolution export
    // and the settings toggle both see the complete trace either way.
    const isVerboseStep = options.verbose === true;

    // Add to Evolution data first (regardless of visibility)
    this.addToEvolutionData({
      type: 'thinking_process',
      timestamp: new Date().toISOString(),
      content: message,
      visible: this.showThinkingProcess && !(isVerboseStep && this.activityDetailLevel === 'compact'),
      metadata: {
        source: 'ai_thinking',
        requestId: this.conversationState.currentRequestId,
        step: 'update_thinking',
        verbose: isVerboseStep,
      },
    });

    // Check whether thinking-process display is enabled
    if (!this.showThinkingProcess) {
      return;
    }

    if (isVerboseStep && this.activityDetailLevel === 'compact') {
      return;
    }

    const thinkingContent = this.findThinkingContentElement();
    if (thinkingContent) {
      if (message instanceof HTMLElement) {
        this.appendThinkingStepElement(thinkingContent, message);
      } else {
        // Parse only the new fragment and append it, rather than
        // `innerHTML +=`, which re-serializes and re-parses the entire
        // accumulated thinking log on every step — quadratic over a round
        // that appends dozens of times.
        //
        // Parsing into a detached holder keeps the previous security
        // behaviour: script elements created by innerHTML never execute, and
        // moving those nodes does not re-enable them.
        const holder = document.createElement('div');
        holder.innerHTML = '\n' + message;
        while (holder.firstChild) {
          thinkingContent.appendChild(holder.firstChild);
        }
      }
    } else {
      this.addThinkingMessage(message);
    }

    // Decide whether to auto-scroll based on the settings
    const messagesContainer = document.getElementById('chatMessages');
    if (this.autoScrollToBottom) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /** Append a pre-built element to the thinking log as its own step. */
  appendThinkingStepElement(thinkingContent, element) {
    const wrapper = document.createElement('div');
    wrapper.className = 'thinking-step-dom';
    wrapper.style.marginTop = '8px';
    wrapper.style.marginBottom = '8px';
    wrapper.appendChild(element);
    thinkingContent.appendChild(wrapper);
    return wrapper;
  }

  /**
   * Show the LLM's thinking process
   */
  displayLLMThinking(response, normalizedReasoning = '', normalizedToolCalls = null) {
    const responseText = typeof response === 'string' ? response : String(response?.content || '');
    // Check whether the response contains thinking tags
    const thinkingMatch = responseText.match(/<think>([\s\S]*?)<\/think>/);
    const thinkingContent = String(normalizedReasoning || thinkingMatch?.[1] || '').trim();

    // Reasoning that streamed live is already on screen: finalize that block in
    // place rather than appending a duplicate. Runs unconditionally so a live
    // block is always closed out, even when the round yielded no final reasoning.
    const finalizedLiveReasoning = this.finalizeStreamingReasoning(thinkingContent);

    if (thinkingContent && !finalizedLiveReasoning) {
      // Format the thinking content to make it more readable
      const formattedThinking = this.formatThinkingContent(thinkingContent);

      // Render as a collapsible block using standard HTML details/summary
      const detailsHtml = `
<details>
  <summary>💭 Model reasoning</summary>
  <div style="padding-top: 8px; font-family: inherit; font-size: inherit; white-space: pre-line;">${formattedThinking}</div>
</details>
      `.trim();
      this.updateThinkingMessage(detailsHtml);
    }

    // Check for tool calls and show the parameter-extraction process
    const detectedTools = Array.isArray(normalizedToolCalls)
      ? normalizedToolCalls
      : this.parseMultipleToolCalls(response);
    if (detectedTools.length > 0) {
      this.updateThinkingMessage(`🔧 Analyzing tool call structure...`, { verbose: true });

      // Extract and display parameter information
      try {
        const toolCall = detectedTools[0];
        if (toolCall) {
          const paramCount = Object.keys(toolCall.parameters || {}).length;
          this.updateThinkingMessage(`&nbsp;&nbsp;✅ Tool identified: <strong>${toolCall.tool_name}</strong>`, {
            verbose: true,
          });
          this.updateThinkingMessage(`&nbsp;&nbsp;📊 Parameters extracted: ${paramCount} parameter(s)`, {
            verbose: true,
          });

          // Display parameter details
          if (paramCount > 0) {
            const paramKeys = Object.keys(toolCall.parameters);
            this.updateThinkingMessage(`&nbsp;&nbsp;🔑 Keys: ${paramKeys.join(', ')}`, { verbose: true });
          }
        }
      } catch (e) {
        console.warn('Error analyzing tool call:', e);
      }
    } else if (responseText.length > 0) {
      // No tool call - this is a conversational response
      this.updateThinkingMessage(`💬 Conversational response generated`, { verbose: true });
      if (responseText.length > 100) {
        this.updateThinkingMessage(`&nbsp;&nbsp;📝 Response preview: "${responseText.substring(0, 100)}..."`, {
          verbose: true,
        });
      }
    }
  }

  /**
   * Format the thinking content to make it more readable
   */
  formatThinkingContent(thinkingContent) {
    // Clean up and format the thinking content
    let formatted = thinkingContent
      .replace(/\n\s*\n/g, '\n') // remove extra blank lines
      .trim();

    // If the content is long, apply appropriate line wrapping
    if (formatted.length > 200) {
      // Add a line break after periods, question marks, and exclamation marks (if not already followed by one)
      formatted = formatted.replace(/([.!?])\s+(?=[A-Z])/g, '$1\n\n');
    }

    // Ensure the content ends with appropriate formatting
    if (!formatted.endsWith('.') && !formatted.endsWith('!') && !formatted.endsWith('?')) {
      formatted += '...';
    }

    return formatted;
  }

  /**
   * Add a tool-call message
   */
  async addToolCallMessage(toolsToExecute) {
    // Add to Evolution data first (always record tool calls)
    this.addToEvolutionData({
      type: 'tool_calls',
      timestamp: new Date().toISOString(),
      content: toolsToExecute,
      visible: this.showToolCalls,
      metadata: {
        source: 'tool_execution',
        requestId: this.conversationState.currentRequestId,
        toolCount: toolsToExecute.length,
        toolNames: toolsToExecute.map(t => t.tool_name),
      },
    });

    // Check whether tool-call display is enabled
    if (!this.showToolCalls) {
      return;
    }

    // Get the source info for each tool
    const toolsWithSource = await Promise.all(
      toolsToExecute.map(async tool => {
        const source = await this.getToolSource(tool.tool_name);
        return { ...tool, source };
      })
    );

    const toolList = toolsWithSource
      .map(tool => {
        let toolDisplay = `• <strong>${tool.tool_name}</strong>`;

        // Show the agent info (if enabled)
        if (this.agentSystemEnabled && this.agentSystemSettings.showAgentInfo && this.multiAgentSystem) {
          try {
            if (typeof this.multiAgentSystem.getAgentForTool === 'function') {
              const agentInfo = this.multiAgentSystem.getAgentForTool(tool.tool_name);
              if (agentInfo) {
                toolDisplay += ` <span class="agent-info" style="color: #4CAF50; font-size: 0.9em;"><i class="fas fa-robot"></i>[${agentInfo.name}]</span>`;
              }
            } else {
              console.warn('multiAgentSystem.getAgentForTool is not a function');
            }
          } catch (error) {
            console.error('Error getting agent info for tool:', tool.tool_name, error);
          }
        }

        // Show the source info (if enabled)
        if (this.showToolCallSource && tool.source) {
          const sourceColor = this.getSourceColor(tool.source.type);
          toolDisplay += ` <span style="color: ${sourceColor}; font-size: 0.9em;">[${tool.source.display}]</span>`;
        }

        // Show the parameters
        const paramsStr = JSON.stringify(tool.parameters, null, 2);
        toolDisplay += `<br>&nbsp;&nbsp;<em>Parameters:</em> <code style="font-size: 0.8em;">${paramsStr}</code>`;

        return toolDisplay;
      })
      .join('<br><br>');

    this.updateThinkingMessage(`⚡ Executing tool calls:<br><br>${toolList}`);
  }

  /**
   * Get the tool source info
   */
  async getToolSource(toolName) {
    try {
      // Check whether it's an MCP server tool
      const allMCPTools = this.mcpServerManager.getAllAvailableTools();
      const mcpTool = allMCPTools.find(t => t.name === toolName);

      if (mcpTool) {
        return {
          type: 'mcp',
          display: `MCP: ${mcpTool.serverName}`,
          serverId: mcpTool.serverId,
          serverName: mcpTool.serverName,
        };
      }

      // Check whether it's a plugin function
      if (this.pluginFunctionCallsIntegrator && this.pluginFunctionCallsIntegrator.isPluginFunction(toolName)) {
        return {
          type: 'plugin',
          display: 'Plugin Function',
          source: 'plugin-system',
        };
      }

      // Check whether it's a built-in local function - use FunctionCallsOrganizer for the full list
      if (this.smartExecutor && this.smartExecutor.organizer) {
        const category = this.smartExecutor.organizer.getFunctionCategory(toolName);
        if (category) {
          // Tool found in FunctionCallsOrganizer - it's a local/internal tool
          return {
            type: 'local',
            display: 'Internal Function',
            source: 'genome-ai-studio',
            category: category.name,
            priority: category.priority,
          };
        }
      }

      // Fallback: Check builtin_tools_integration for database and other built-in tools
      if (this.builtInTools && this.builtInTools.builtInToolsMap) {
        const builtInTool = this.builtInTools.builtInToolsMap.get(toolName);
        if (builtInTool) {
          return {
            type: 'local',
            display: 'Built-in Tool',
            source: 'genome-ai-studio',
            category: builtInTool.category,
            priority: builtInTool.priority,
          };
        }
      }

      // Unknown tool
      return {
        type: 'unknown',
        display: 'Unknown Source',
        source: 'unknown',
      };
    } catch (error) {
      console.warn(`Failed to get source for tool ${toolName}:`, error);
      return {
        type: 'error',
        display: 'Source Error',
        source: 'error',
      };
    }
  }

  /**
   * Get the colors for different source types
   */
  getSourceColor(sourceType) {
    const colors = {
      mcp: '#2196F3', // blue - MCP server
      plugin: '#FF9800', // orange - plugin
      local: '#4CAF50', // green - built-in function
      unknown: '#9E9E9E', // gray - unknown
      error: '#F44336', // red - error
    };

    return colors[sourceType] || colors['unknown'];
  }

  /**
   * Remove the thinking-process message (the original method is kept for special cases)
   */
  removeThinkingMessages() {
    // Remove all thinking-process messages
    const thinkingDivs = document.querySelectorAll('.thinking-process');
    thinkingDivs.forEach(thinkingDiv => {
      // Add a fade-out animation
      thinkingDiv.style.transition = 'opacity 0.5s ease-out';
      thinkingDiv.style.opacity = '0';

      setTimeout(() => {
        if (thinkingDiv.parentNode) {
          thinkingDiv.parentNode.removeChild(thinkingDiv);
        }
      }, 500);
    });
  }

  /**
   * Add the tool-execution-result display
   */
  addToolResultMessage(toolResults) {
    if (!this.services || !this.services.context) {
      console.error('[ChatManager] context not initialized');
      return;
    }
    return this.services.context.addToolResultMessage(toolResults);
  }

  /**
   * Extract Deep Gene Research report from various MCP response formats
   * Handles: content arrays, direct report fields, raw text, and other structures
   * @param {*} resultData - The raw result data from MCP tool execution
   * @returns {Object} Normalized structure with report, geneSymbol, steps, and statistics
   */
  extractDeepGeneResearchReport(resultData) {
    let report = '';
    let geneSymbol = 'Unknown';
    let stepsCount = 0;
    const statistics = { totalCitations: 0, processedPapers: 0 };
    const images = [];
    let sources = [];

    try {
      // First pass: extract the primary content/data object
      let parsedData = resultData;

      // Handle: string input
      if (typeof resultData === 'string') {
        try {
          parsedData = JSON.parse(resultData);
        } catch (e) {
          // It's a raw string, use it as report for now
          report = resultData;
        }
      }

      // Handle: standard MCP "content" array
      if (parsedData.content && Array.isArray(parsedData.content)) {
        // Combine text parts
        const textContent = parsedData.content
          .filter(item => item.type === 'text' && item.text)
          .map(item => item.text)
          .join('\n\n');

        // Extract images and resources
        parsedData.content.forEach(item => {
          if (item.type === 'image' && item.data) images.push(item);
          if (item.type === 'resource' && item.resource) sources.push(item.resource);
        });

        // Check if the extracted text is actually a JSON string (Nested JSON case)
        if (textContent.trim().startsWith('{')) {
          try {
            const innerJson = JSON.parse(textContent);
            parsedData = innerJson; // Switch to using the inner JSON object
          } catch (e) {
            report = textContent; // Use text as report if not valid JSON
          }
        } else {
          report = textContent;
        }
      }
      // Handle: "result" wrapper (e.g., JSON-RPC style)
      else if (parsedData.result) {
        if (parsedData.result.content && Array.isArray(parsedData.result.content)) {
          // Similar logic for result.content
          const textContent = parsedData.result.content
            .filter(item => item.type === 'text' && item.text)
            .map(item => item.text)
            .join('\n\n');

          if (textContent.trim().startsWith('{')) {
            try {
              parsedData = JSON.parse(textContent);
            } catch (e) {
              report = textContent;
            }
          } else {
            report = textContent;
          }
        } else {
          parsedData = parsedData.result;
        }
      }
      // Handle: "text" field wrapper
      else if (parsedData.text) {
        if (parsedData.text.trim().startsWith('{')) {
          try {
            parsedData = JSON.parse(parsedData.text);
          } catch (e) {
            report = parsedData.text;
          }
        } else {
          report = parsedData.text;
        }
      }

      // --- Phase 2: Extract Data from the Resolved Object (parsedData) ---

      // 1. Extract Gene Symbol
      if (
        parsedData.workflow &&
        parsedData.workflow.geneIdentification &&
        parsedData.workflow.geneIdentification.geneSymbol
      ) {
        geneSymbol = parsedData.workflow.geneIdentification.geneSymbol;
      } else if (parsedData.metadata && parsedData.metadata.geneSymbol) {
        geneSymbol = parsedData.metadata.geneSymbol;
      } else if (parsedData.geneSymbol) {
        geneSymbol = parsedData.geneSymbol;
      } else if (parsedData.searchResults && parsedData.searchResults[0] && parsedData.searchResults[0].symbol) {
        geneSymbol = parsedData.searchResults[0].symbol;
      }

      // Fallback: Regex extraction if still unknown and we have text content
      // Ensure report is a string before regex operations
      if (geneSymbol === 'Unknown' && report && typeof report === 'string') {
        const patterns = [
          /gene[:\s]+\*?\*?([A-Za-z][A-Za-z0-9_-]{1,20})\*?\*?/i,
          /\*\*([A-Za-z][A-Za-z0-9_-]{1,20})\*\*\s+gene/i,
          /analysis\s+of\s+(?:the\s+)?([A-Za-z][A-Za-z0-9_-]{1,20})\s+gene/i,
        ];
        for (const pattern of patterns) {
          const match = report.match(pattern);
          if (match && match[1]) {
            // Validate to ensure it's not a common word like "repression"
            // Simple heuristic: exact match or reasonable gene format
            if (match[1].length <= 10) {
              geneSymbol = match[1];
              break;
            }
          }
        }
      }

      // 2. Extract/Construct Report Content
      if (parsedData.report) {
        report = parsedData.report;
      } else if (!report) {
        // If we don't have a direct report string yet, construct one from available fields
        let builtReport = '';

        if (geneSymbol !== 'Unknown') {
          builtReport += `# Deep Gene Research: ${geneSymbol}\n\n`;
        }

        if (parsedData.researchPlan) {
          builtReport += `## Research Plan\n\n${parsedData.researchPlan}\n\n`;
        }

        if (parsedData.researchGoal) {
          builtReport += `## Research Goal\n\n${parsedData.researchGoal}\n\n`;
        }

        if (parsedData.workflow) {
          builtReport += `## Workflow Configuration\n\n`;
          if (parsedData.workflow.organism) builtReport += `- **Organism**: ${parsedData.workflow.organism}\n`;
          if (parsedData.workflow.specificAspects && parsedData.workflow.specificAspects.length) {
            builtReport += `- **Focus Aspects**: ${parsedData.workflow.specificAspects.join(', ')}\n`;
          }
          builtReport += '\n';
        }

        if (parsedData.searchTasks && Array.isArray(parsedData.searchTasks)) {
          builtReport += `## Search Tasks\n\n`;
          parsedData.searchTasks.forEach((task, idx) => {
            builtReport += `${idx + 1}. ${task.query || task}\n`;
          });
          builtReport += '\n';
        }

        // If we constructed something meaningful, use it
        if (builtReport.length > 50) {
          report = builtReport;
        } else if (typeof parsedData === 'object') {
          // Ultima ratio: dump the object as markdown code block
          report = '## Raw Data Output\n\n```json\n' + JSON.stringify(parsedData, null, 2) + '\n```';
        }
      }

      // 3. Extract Statistics
      if (parsedData.statistics) {
        statistics.totalCitations = parsedData.statistics.totalCitations || parsedData.statistics.citations || 0;
        statistics.processedPapers = parsedData.statistics.processedPapers || parsedData.statistics.papers || 0;
      } else if (report && typeof report === 'string') {
        const doiMatches = report.match(/DOI:\s*[0-9./a-zA-Z-]+/gi);
        const pmidMatches = report.match(/PMID:\s*[0-9]+/gi);
        statistics.totalCitations = (doiMatches ? doiMatches.length : 0) + (pmidMatches ? pmidMatches.length : 0);
      }

      // 4. Extract Steps Count
      if (parsedData.workflow && parsedData.workflow.steps) {
        stepsCount = parsedData.workflow.steps.length;
      } else if (parsedData.steps) {
        stepsCount = Array.isArray(parsedData.steps) ? parsedData.steps.length : parsedData.steps;
      } else if (parsedData.searchTasks) {
        stepsCount = parsedData.searchTasks.length;
      }

      // 5. Extract Sources
      if (parsedData.sources) sources = sources.concat(parsedData.sources);
      if (parsedData.references) sources = sources.concat(parsedData.references);
    } catch (error) {
      console.error('Error extracting Deep Gene Research report:', error);
      // Emergency fallback
      if (!report && typeof resultData === 'string') report = resultData;
      else if (!report) report = JSON.stringify(resultData, null, 2);
    }

    return { report, geneSymbol, stepsCount, statistics, images, sources };
  }

  /**
   * Format the tool-result data display
   */
  formatToolResultData(data) {
    if (!data) return 'No data available';

    try {
      // If it's a string, try to parse it as JSON
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          // If it's not JSON, show the string directly
          return `<pre>${this.escapeHtml(data)}</pre>`;
        }
      }

      // If it's an array
      if (Array.isArray(data)) {
        if (data.length === 0) {
          return '<em>Empty array</em>';
        }

        // If the array elements are objects, create a table
        if (typeof data[0] === 'object' && data[0] !== null) {
          return this.formatArrayAsTable(data);
        } else {
          return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        }
      }

      // If it's an object
      if (typeof data === 'object' && data !== null) {
        return this.formatObjectAsKeyValue(data);
      }

      // Show other types directly
      return `<pre>${String(data)}</pre>`;
    } catch (error) {
      console.warn('Error formatting tool result data:', error);
      return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }
  }

  /**
   * Format an array as a table
   */
  formatArrayAsTable(array) {
    if (array.length === 0) return '<em>Empty array</em>';

    const sample = array[0];
    const keys = Object.keys(sample);

    let table = '<table style="width: 100%; border-collapse: collapse; margin: 4px 0;">';

    // Table header
    table += '<thead><tr>';
    keys.forEach(key => {
      table += `<th style="border: 1px solid #ddd; padding: 4px 8px; background: #f0f0f0; text-align: left;">${this.escapeHtml(key)}</th>`;
    });
    table += '</tr></thead>';

    // Table body
    table += '<tbody>';
    array.slice(0, 100).forEach(item => {
      // Limit the display to the first 100 rows
      table += '<tr>';
      keys.forEach(key => {
        const value = item[key];
        const displayValue = value !== null && value !== undefined ? String(value) : '';
        table += `<td style="border: 1px solid #ddd; padding: 4px 8px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(displayValue)}">${this.escapeHtml(displayValue)}</td>`;
      });
      table += '</tr>';
    });
    table += '</tbody>';
    table += '</table>';

    if (array.length > 100) {
      table += `<div style="margin-top: 8px; color: #666; font-size: 0.8em;">... and ${array.length - 100} more items</div>`;
    }

    return table;
  }

  /**
   * Format an object as key-value pairs
   */
  formatObjectAsKeyValue(obj) {
    let html = '<div style="font-family: monospace;">';

    for (const [key, value] of Object.entries(obj)) {
      html += '<div style="margin: 4px 0; padding: 2px 0; border-bottom: 1px solid #eee;">';
      html += `<strong style="color: #2196F3;">${this.escapeHtml(key)}:</strong> `;

      if (value === null || value === undefined) {
        html += '<em style="color: #999;">null</em>';
      } else if (typeof value === 'object') {
        // Recursively handle nested objects, but limit the depth
        html += '<br><div style="margin-left: 16px; font-size: 0.9em;">';
        if (Array.isArray(value)) {
          html += `<em>Array(${value.length})</em>: `;
          if (value.length <= 5) {
            html += JSON.stringify(value);
          } else {
            html += `[${value
              .slice(0, 3)
              .map(v => JSON.stringify(v))
              .join(', ')}, ... ${value.length - 3} more]`;
          }
        } else {
          const keys = Object.keys(value);
          html += `<em>Object(${keys.length} keys)</em>: {${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}`;
        }
        html += '</div>';
      } else if (typeof value === 'string' && value.length > 100) {
        // Truncate long strings for display
        html += `<span title="${this.escapeHtml(value)}">${this.escapeHtml(value.substring(0, 100))}...</span>`;
      } else {
        html += this.escapeHtml(String(value));
      }

      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * HTML escaping
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Add data to Evolution system for analysis
   */
  addToEvolutionData(eventData) {
    if (!this.evolutionEnabled || !this.currentConversationData) {
      return;
    }

    // Add timestamp if not provided
    if (!eventData.timestamp) {
      eventData.timestamp = new Date().toISOString();
    }

    // Add event to current conversation
    this.currentConversationData.events.push(eventData);

    // Update statistics
    this.updateConversationStats(eventData);

    // Auto-save to Evolution storage periodically
    this.debouncedSaveToEvolution();

    console.log(`🧬 Added ${eventData.type} to Evolution data:`, eventData);
  }

  /**
   * Update conversation statistics
   */
  updateConversationStats(eventData) {
    if (!this.currentConversationData || !this.currentConversationData.stats) {
      return;
    }

    const stats = this.currentConversationData.stats;

    switch (eventData.type) {
      case 'message':
        stats.messageCount++;
        if (eventData.sender === 'user') {
          stats.userMessageCount++;
        } else if (eventData.sender === 'assistant') {
          stats.assistantMessageCount++;
        }
        if (eventData.isError) {
          stats.errorCount++;
        } else {
          stats.successCount++;
        }
        break;

      case 'thinking_process':
        stats.thinkingProcessCount++;
        break;

      case 'tool_calls':
        stats.toolCallCount += eventData.metadata?.toolCount || 1;
        break;

      case 'tool_results':
        if (eventData.metadata?.failCount > 0) {
          stats.failureCount += eventData.metadata.failCount;
        }
        if (eventData.metadata?.successCount > 0) {
          stats.successCount += eventData.metadata.successCount;
        }
        break;
    }
  }

  startNewChat() {
    console.log('Starting new chat...');

    // Original ChatBox functionality
    this.clearChat();
    this.conversationState.contextModeEnabled = false;

    // Add conversation separator for ChatBox history
    if (this.configManager) {
      this.configManager.addChatMessage('--- CONVERSATION_SEPARATOR ---', 'system');
    }

    this.showNotification('New conversation started', 'success');
  }

  /**
   * Message History Browsing Methods
   */

  /**
   * Update user message history array
   */
  updateUserMessageHistory() {
    try {
      const fullHistory = this.configManager?.getChatHistory() || [];
      this.messageHistory.userMessages = fullHistory.filter(msg => msg.sender === 'user').map(msg => msg.message);

      console.log(`Updated user message history: ${this.messageHistory.userMessages.length} messages`);
    } catch (error) {
      console.warn('Failed to update user message history:', error);
      this.messageHistory.userMessages = [];
    }
  }

  /**
   * Browse up in message history (ArrowUp key)
   */
  browseHistoryUp() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;

    // Update history array first
    this.updateUserMessageHistory();

    // If no history available, do nothing
    if (this.messageHistory.userMessages.length === 0) {
      return;
    }

    // If not currently browsing, save original content and start browsing
    if (!this.messageHistory.isBrowsing) {
      this.messageHistory.originalContent = chatInput.value;
      this.messageHistory.isBrowsing = true;
      this.messageHistory.currentIndex = this.messageHistory.userMessages.length - 1;
    } else {
      // Move up in history (older messages)
      if (this.messageHistory.currentIndex > 0) {
        this.messageHistory.currentIndex--;
      } else {
        // Wrap to newest message
        this.messageHistory.currentIndex = this.messageHistory.userMessages.length - 1;
      }
    }

    // Set input to current history message
    const currentMessage = this.messageHistory.userMessages[this.messageHistory.currentIndex];
    chatInput.value = currentMessage;

    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';

    // Position cursor at end
    chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);

    console.log(
      `History browse up: ${this.messageHistory.currentIndex + 1}/${this.messageHistory.userMessages.length}`
    );
  }

  /**
   * Browse down in message history (ArrowDown key)
   */
  browseHistoryDown() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput || !this.messageHistory.isBrowsing) return;

    // Move down in history (newer messages)
    if (this.messageHistory.currentIndex < this.messageHistory.userMessages.length - 1) {
      this.messageHistory.currentIndex++;

      // Set input to current history message
      const currentMessage = this.messageHistory.userMessages[this.messageHistory.currentIndex];
      chatInput.value = currentMessage;
    } else {
      // At newest message, restore original content and exit browse mode
      chatInput.value = this.messageHistory.originalContent;
      this.exitHistoryBrowsing();
    }

    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';

    // Position cursor at end
    chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);

    if (this.messageHistory.isBrowsing) {
      console.log(
        `History browse down: ${this.messageHistory.currentIndex + 1}/${this.messageHistory.userMessages.length}`
      );
    } else {
      console.log('History browse ended, original content restored');
    }
  }

  /**
   * Cancel history browsing and restore original content (Escape key)
   */
  cancelHistoryBrowsing() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput || !this.messageHistory.isBrowsing) return;

    chatInput.value = this.messageHistory.originalContent;
    this.exitHistoryBrowsing();

    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';

    console.log('History browsing cancelled, original content restored');
  }

  /**
   * Exit history browsing mode
   */
  exitHistoryBrowsing() {
    this.messageHistory.isBrowsing = false;
    this.messageHistory.currentIndex = -1;
    this.messageHistory.originalContent = '';
  }

  /**
   * Test Evolution integration
   */
  testEvolutionIntegration() {
    console.log('=== Testing Evolution Integration ===');

    const summary = this.getEvolutionDataSummary();
    console.log('Current Evolution Data:', summary);

    // Test adding some sample data
    this.addToEvolutionData({
      type: 'test_event',
      content: 'This is a test event for Evolution integration',
      metadata: { source: 'integration_test' },
    });

    const updatedSummary = this.getEvolutionDataSummary();
    console.log('Updated Evolution Data:', updatedSummary);

    return {
      status: 'Evolution integration test completed',
      summary: updatedSummary,
      testEventAdded: true,
    };
  }

  // ==================== Track Settings Tools ====================

  /**
   * Get settings for a specific track type
   */
  async getTrackSettings(parameters) {
    const { track_type } = parameters;

    if (!track_type) {
      throw new Error('track_type parameter is required');
    }

    const validTrackTypes = [
      'genes',
      'primers',
      'reads',
      'sequence',
      'gc',
      'variants',
      'actions',
      'blast',
      'wigTracks',
      'sequenceLine',
    ];
    if (!validTrackTypes.includes(track_type)) {
      throw new Error(`Invalid track_type: ${track_type}. Valid types: ${validTrackTypes.join(', ')}`);
    }

    if (!this.genomeBrowser?.trackRenderer) {
      throw new Error('TrackRenderer not available');
    }

    const settings = this.genomeBrowser.trackRenderer.getTrackSettings(track_type);

    return {
      success: true,
      track_type,
      settings,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Set settings for a specific track type
   */
  async setTrackSettings(parameters) {
    const { track_type, settings } = parameters;

    if (!track_type) {
      throw new Error('track_type parameter is required');
    }

    if (!settings || typeof settings !== 'object') {
      throw new Error('settings parameter must be an object');
    }

    const validTrackTypes = [
      'genes',
      'primers',
      'reads',
      'sequence',
      'gc',
      'variants',
      'actions',
      'blast',
      'wigTracks',
      'sequenceLine',
    ];
    if (!validTrackTypes.includes(track_type)) {
      throw new Error(`Invalid track_type: ${track_type}. Valid types: ${validTrackTypes.join(', ')}`);
    }

    if (!this.genomeBrowser?.trackRenderer) {
      throw new Error('TrackRenderer not available');
    }

    // Get current settings and merge with new settings
    const currentSettings = this.genomeBrowser.trackRenderer.getTrackSettings(track_type);
    const mergedSettings = { ...currentSettings, ...settings };

    // Save and apply settings
    this.genomeBrowser.trackRenderer.saveTrackSettings(track_type, mergedSettings);
    this.genomeBrowser.trackRenderer.applySettingsToTrack(track_type, mergedSettings);

    return {
      success: true,
      track_type,
      updated_settings: settings,
      applied_settings: mergedSettings,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get all track settings
   */
  async getAllTrackSettings(parameters = {}) {
    const trackTypes = [
      'genes',
      'primers',
      'reads',
      'sequence',
      'gc',
      'variants',
      'actions',
      'blast',
      'wigTracks',
      'sequenceLine',
    ];
    const allSettings = {};
    const trackRenderer = this.genomeBrowser?.trackRenderer;

    if (!trackRenderer) {
      // TrackRenderer not yet initialized — return a minimal summary so the LLM
      // still receives a useful (non-error) response during benchmark / early load.
      console.warn('[getAllTrackSettings] TrackRenderer not available — returning defaults');
      for (const trackType of trackTypes) {
        allSettings[trackType] = { _note: 'TrackRenderer not available; showing defaults only', height: undefined };
      }
      return {
        success: true,
        settings: allSettings,
        track_count: trackTypes.length,
        note: 'TrackRenderer not yet initialized. Values shown are placeholders; load a genome file first.',
        timestamp: new Date().toISOString(),
      };
    }

    for (const trackType of trackTypes) {
      try {
        allSettings[trackType] = trackRenderer.getTrackSettings(trackType);
      } catch (error) {
        console.warn(`Failed to get settings for ${trackType}:`, error.message);
        allSettings[trackType] = { error: error.message };
      }
    }

    return {
      success: true,
      settings: allSettings,
      track_count: trackTypes.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset track settings to defaults
   */
  async resetTrackSettings(parameters) {
    const { track_type } = parameters;

    if (!track_type) {
      throw new Error('track_type parameter is required');
    }

    if (!this.genomeBrowser?.trackRenderer) {
      throw new Error('TrackRenderer not available');
    }

    if (track_type === 'all') {
      // Reset all tracks
      const trackTypes = [
        'genes',
        'primers',
        'reads',
        'sequence',
        'gc',
        'variants',
        'actions',
        'blast',
        'wigTracks',
        'sequenceLine',
      ];
      const results = {};

      for (const type of trackTypes) {
        try {
          // Clear saved settings from storage
          if (this.genomeBrowser.configManager) {
            await this.genomeBrowser.configManager.set(`tracks.${type}.settings`, {});
          }
          localStorage.removeItem(`trackSettings_${type}`);
          this.genomeBrowser.trackRenderer.clearTrackSettingsCache?.(type);

          // Get fresh default settings
          const defaultSettings = this.genomeBrowser.trackRenderer.getTrackSettings(type);
          this.genomeBrowser.trackRenderer.applySettingsToTrack(type, defaultSettings);

          results[type] = { success: true };
        } catch (error) {
          results[type] = { success: false, error: error.message };
        }
      }

      // Save config changes
      if (this.genomeBrowser.configManager) {
        this.genomeBrowser.configManager.saveConfig();
      }

      return {
        success: true,
        track_type: 'all',
        results,
        timestamp: new Date().toISOString(),
      };
    } else {
      // Reset specific track
      const validTrackTypes = [
        'genes',
        'primers',
        'reads',
        'sequence',
        'gc',
        'variants',
        'actions',
        'blast',
        'wigTracks',
        'sequenceLine',
      ];
      if (!validTrackTypes.includes(track_type)) {
        throw new Error(`Invalid track_type: ${track_type}`);
      }

      // Clear saved settings from storage
      if (this.genomeBrowser.configManager) {
        await this.genomeBrowser.configManager.set(`tracks.${track_type}.settings`, {});
      }
      localStorage.removeItem(`trackSettings_${track_type}`);
      this.genomeBrowser.trackRenderer.clearTrackSettingsCache?.(track_type);

      // Get fresh default settings
      const defaultSettings = this.genomeBrowser.trackRenderer.getTrackSettings(track_type);
      this.genomeBrowser.trackRenderer.applySettingsToTrack(track_type, defaultSettings);

      // Save config changes
      if (this.genomeBrowser.configManager) {
        this.genomeBrowser.configManager.saveConfig();
      }

      return {
        success: true,
        track_type,
        default_settings: defaultSettings,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get track settings schema
   * Schema is inlined here to avoid require() calls that fail in the renderer (browser) context.
   */
  async getTrackSettingsSchema(parameters = {}) {
    const schema = {
      genes: {
        description: 'Genes and Features Track Settings',
        settings: {
          renderingMode: { type: 'string', enum: ['svg', 'canvas'], default: 'svg', description: 'Rendering mode' },
          maxRows: { type: 'number', min: 1, max: 20, default: 6, description: 'Maximum rows for displaying features' },
          showOperonsSameRow: { type: 'boolean', default: false, description: 'Group genes in the same operon' },
          height: { type: 'number', min: 60, max: 400, default: 120, description: 'Track height in pixels' },
          geneHeight: { type: 'number', min: 12, max: 60, default: 24, description: 'Gene element height in pixels' },
          fontSize: { type: 'number', min: 8, max: 48, default: 24, description: 'Gene name font size in pixels' },
          geneNameColor: { type: 'string', format: 'color', default: '#333333', description: 'Gene name color' },
          fontFamily: { type: 'string', default: 'Arial, sans-serif', description: 'Gene name font family' },
          layoutMode: {
            type: 'string',
            enum: ['packed', 'singleRow', 'groupByType'],
            default: 'packed',
            description:
              'Layout mode: "packed" (fill first row, overflow on overlap), "singleRow" (all features on one row), "groupByType" (one row per feature type)',
          },
          enableGlobalDragging: { type: 'boolean', default: true, description: 'Enable global track dragging' },
          highlightEffect: {
            type: 'string',
            enum: ['pulse', 'border', 'both'],
            default: 'pulse',
            description: 'Highlight effect for selected genes',
          },
          autoHighlightSequence: {
            type: 'boolean',
            default: true,
            description: 'Auto-highlight sequence region when gene is selected',
          },
          autoScrollBottomSequenceOnGeneSelect: {
            type: 'boolean',
            default: true,
            description: 'Auto-scroll Bottom Sequence Track to the selected gene when a gene is clicked',
          },
          showSequence: { type: 'boolean', default: false, description: 'Show reference sequence' },
          sequenceHeight: {
            type: 'number',
            min: 15,
            max: 50,
            default: 25,
            description: 'Reference sequence height in pixels',
          },
          circularMode: {
            type: 'boolean',
            default: false,
            description: 'Enable circular browsing mode for circular genomes',
          },
          wheelZoomSensitivity: {
            type: 'number',
            min: 0.01,
            max: 0.5,
            default: 0.1,
            description: 'Mouse wheel zoom sensitivity',
          },
          overrideGlobalZoom: { type: 'boolean', default: false, description: 'Override global zoom settings' },
          maxBorderWidth: {
            type: 'number',
            min: 0.5,
            max: 5,
            default: 1,
            description: 'Maximum border width for gene elements',
          },
        },
      },
      reads: {
        description: 'Aligned Reads Track Settings',
        settings: {
          renderingMode: {
            type: 'string',
            enum: ['canvas', 'svg'],
            default: 'canvas',
            description: 'Rendering method',
          },
          showCoverage: { type: 'boolean', default: true, description: 'Show coverage visualization' },
          coverageHeight: {
            type: 'number',
            min: 30,
            max: 100,
            default: 50,
            description: 'Coverage track height in pixels',
          },
          coverageColor: { type: 'string', format: 'color', default: '#4a90e2', description: 'Coverage area color' },
          coverageStrokeColor: {
            type: 'string',
            format: 'color',
            default: '#2c5aa0',
            description: 'Coverage stroke/border color',
          },
          showReference: { type: 'boolean', default: true, description: 'Show reference sequence' },
          referenceHeight: {
            type: 'number',
            min: 15,
            max: 50,
            default: 25,
            description: 'Reference sequence height in pixels',
          },
          referenceFontSize: {
            type: 'number',
            min: 8,
            max: 20,
            default: 12,
            description: 'Reference sequence font size',
          },
          referenceFontFamily: { type: 'string', default: 'monospace', description: 'Reference sequence font family' },
          readHeight: { type: 'number', min: 2, max: 30, default: 4, description: 'Height of each read in pixels' },
          readSpacing: { type: 'number', min: 1, max: 10, default: 2, description: 'Spacing between reads in pixels' },
          forwardColor: {
            type: 'string',
            format: 'color',
            default: '#00b894',
            description: 'Forward reads fill color',
          },
          reverseColor: {
            type: 'string',
            format: 'color',
            default: '#f39c12',
            description: 'Reverse reads fill color',
          },
          pairedColor: { type: 'string', format: 'color', default: '#6c5ce7', description: 'Paired reads fill color' },
          borderColor: { type: 'string', format: 'color', default: '#ffffff', description: 'Border color for reads' },
          borderWidth: { type: 'number', min: 0, max: 3, default: 0, description: 'Border width in pixels' },
          opacity: { type: 'number', min: 0.1, max: 1, default: 0.9, description: 'Read opacity (0-1)' },
          showQualityColors: { type: 'boolean', default: false, description: 'Color reads by mapping quality' },
          showMutations: { type: 'boolean', default: false, description: 'Show mutations' },
          minMappingQuality: {
            type: 'number',
            min: 0,
            max: 60,
            default: 0,
            description: 'Minimum mapping quality filter',
          },
          showUnmapped: { type: 'boolean', default: false, description: 'Show unmapped reads' },
          showSecondary: { type: 'boolean', default: true, description: 'Show secondary alignments' },
          showSupplementary: { type: 'boolean', default: true, description: 'Show supplementary alignments' },
          height: { type: 'number', min: 100, max: 500, default: 150, description: 'Total track height in pixels' },
          enableSampling: { type: 'boolean', default: true, description: 'Enable read sampling for large datasets' },
          samplingThreshold: {
            type: 'number',
            min: 1000,
            max: 100000,
            default: 10000,
            description: 'Sampling threshold',
          },
          samplingMode: {
            type: 'string',
            enum: ['percentage', 'fixed'],
            default: 'percentage',
            description: 'Sampling mode',
          },
          samplingPercentage: { type: 'number', min: 1, max: 100, default: 20, description: 'Sampling percentage' },
          samplingCount: { type: 'number', min: 1000, max: 50000, default: 5000, description: 'Fixed sampling count' },
          showSamplingInfo: { type: 'boolean', default: true, description: 'Show sampling information' },
          showSequences: { type: 'boolean', default: true, description: 'Show read sequences when zoomed in' },
          forceSequences: { type: 'boolean', default: false, description: 'Force show sequences regardless of zoom' },
          autoFontSize: { type: 'boolean', default: true, description: 'Auto-adjust font size for sequences' },
          sequenceThreshold: {
            type: 'number',
            min: 0.1,
            max: 10,
            default: 1.0,
            description: 'Sequence display threshold (bp/px)',
          },
          sequenceFontSize: {
            type: 'number',
            min: 8,
            max: 16,
            default: 10,
            description: 'Sequence font size in pixels',
          },
          sequenceHeight: {
            type: 'number',
            min: 10,
            max: 30,
            default: 14,
            description: 'Sequence text height in pixels',
          },
          highlightMismatches: { type: 'boolean', default: true, description: 'Highlight mismatches' },
          mismatchColor: {
            type: 'string',
            format: 'color',
            default: '#ff6b6b',
            description: 'Mismatch highlight color',
          },
        },
      },
      sequence: {
        description: 'Sequence Track Settings',
        settings: {
          showIndicators: { type: 'boolean', default: true, description: 'Show gene indicator bars' },
          indicatorHeight: {
            type: 'number',
            min: 6,
            max: 20,
            default: 8,
            description: 'Indicator bar height in pixels',
          },
          indicatorOpacity: { type: 'number', min: 0.3, max: 1, default: 0.7, description: 'Indicator opacity (0-1)' },
          showStartMarkers: { type: 'boolean', default: false, description: 'Show gene start markers' },
          showEndArrows: { type: 'boolean', default: true, description: 'Show gene end arrows' },
          startMarkerWidth: { type: 'number', min: 1, max: 6, default: 3, description: 'Start marker width in pixels' },
          startMarkerHeight: {
            type: 'number',
            min: 50,
            max: 100,
            default: 85,
            description: 'Start marker height (% of bar)',
          },
          arrowSize: { type: 'number', min: 3, max: 12, default: 12, description: 'End arrow size in pixels' },
          arrowHeight: { type: 'number', min: 50, max: 100, default: 85, description: 'End arrow height (% of bar)' },
          showCDS: { type: 'boolean', default: true, description: 'Show CDS genes' },
          showRNA: { type: 'boolean', default: true, description: 'Show RNA genes' },
          showPromoter: { type: 'boolean', default: true, description: 'Show promoters' },
          showTerminator: { type: 'boolean', default: true, description: 'Show terminators' },
          showRegulatory: { type: 'boolean', default: true, description: 'Show regulatory elements' },
          showTooltips: { type: 'boolean', default: true, description: 'Show tooltips on hover' },
          showHoverEffects: { type: 'boolean', default: true, description: 'Enable hover effects' },
          cursorColor: { type: 'string', format: 'color', default: '#000000', description: 'Cursor color' },
          horizontalOffset: {
            type: 'number',
            min: -50,
            max: 50,
            default: 0,
            description: 'Horizontal offset in pixels',
          },
          verticalOffset: { type: 'number', min: -20, max: 20, default: 0, description: 'Vertical offset in pixels' },
          heightCorrection: { type: 'number', min: 50, max: 200, default: 100, description: 'Height correction (%)' },
          widthCorrection: { type: 'number', min: 50, max: 200, default: 100, description: 'Width correction (%)' },
          colorMode: {
            type: 'string',
            enum: ['uniform', 'geneColors', 'baseColors'],
            default: 'uniform',
            description: 'Color mode for DNA bases',
          },
          uniformColor: {
            type: 'string',
            format: 'color',
            default: '#000000',
            description: 'Uniform color for all bases',
          },
          intergenicColor: {
            type: 'string',
            format: 'color',
            default: '#666666',
            description: 'Intergenic region color',
          },
          geneColorOpacity: { type: 'number', min: 0.3, max: 1, default: 0.8, description: 'Gene color opacity' },
          colorA: { type: 'string', format: 'color', default: '#FF0000', description: 'Adenine color' },
          colorT: { type: 'string', format: 'color', default: '#0000FF', description: 'Thymine color' },
          colorG: { type: 'string', format: 'color', default: '#00FF00', description: 'Guanine color' },
          colorC: { type: 'string', format: 'color', default: '#FFFF00', description: 'Cytosine color' },
          colorN: { type: 'string', format: 'color', default: '#888888', description: 'Unknown base color' },
        },
      },
      gc: {
        description: 'GC Content Track Settings',
        settings: {
          contentColor: { type: 'string', format: 'color', default: '#3b82f6', description: 'GC content color' },
          skewPositiveColor: {
            type: 'string',
            format: 'color',
            default: '#10b981',
            description: 'GC skew positive color',
          },
          skewNegativeColor: {
            type: 'string',
            format: 'color',
            default: '#ef4444',
            description: 'GC skew negative color',
          },
          lineWidth: { type: 'number', min: 1, max: 5, default: 2, description: 'Line width' },
          height: { type: 'number', min: 80, max: 300, default: 140, description: 'Track height in pixels' },
        },
      },
      variants: {
        description: 'Variants Track Settings',
        settings: {
          height: { type: 'number', min: 50, max: 300, default: 80, description: 'Track height in pixels' },
          elementHeight: {
            type: 'number',
            min: 8,
            max: 30,
            default: 12,
            description: 'Variant element height in pixels',
          },
          rowSpacing: { type: 'number', min: 2, max: 20, default: 8, description: 'Row spacing in pixels' },
          colorMode: {
            type: 'string',
            enum: ['type', 'impact', 'quality', 'custom'],
            default: 'type',
            description: 'Color mode',
          },
          customColor: { type: 'string', format: 'color', default: '#e74c3c', description: 'Custom variant color' },
          snpColor: { type: 'string', format: 'color', default: '#e74c3c', description: 'SNP color' },
          indelColor: { type: 'string', format: 'color', default: '#3498db', description: 'INDEL color' },
          svColor: { type: 'string', format: 'color', default: '#9b59b6', description: 'Structural variant color' },
          highImpactColor: { type: 'string', format: 'color', default: '#e74c3c', description: 'HIGH impact color' },
          moderateImpactColor: {
            type: 'string',
            format: 'color',
            default: '#f39c12',
            description: 'MODERATE impact color',
          },
          lowImpactColor: { type: 'string', format: 'color', default: '#2ecc71', description: 'LOW impact color' },
          modifierImpactColor: {
            type: 'string',
            format: 'color',
            default: '#95a5a6',
            description: 'MODIFIER impact color',
          },
          minQuality: { type: 'number', min: 0, max: 1000, default: 0, description: 'Minimum quality score filter' },
          maxDisplayCount: {
            type: 'number',
            min: 10,
            max: 1000,
            default: 200,
            description: 'Maximum number of variants to display',
          },
          showLabels: { type: 'boolean', default: true, description: 'Show variant labels' },
          labelFontSize: { type: 'number', min: 8, max: 16, default: 10, description: 'Label font size in pixels' },
          groupByFile: { type: 'boolean', default: false, description: 'Group variants by VCF file' },
          fileSpacing: { type: 'number', min: 0, max: 30, default: 10, description: 'Spacing between files in pixels' },
        },
      },
      actions: {
        description: 'Actions Track Settings',
        settings: {
          height: { type: 'number', min: 60, max: 300, default: 120, description: 'Track height in pixels' },
          actionHeight: {
            type: 'number',
            min: 5,
            max: 30,
            default: 10,
            description: 'Action element height in pixels',
          },
          rowSpacing: { type: 'number', min: 0, max: 10, default: 2, description: 'Row spacing in pixels' },
          topPadding: { type: 'number', min: 0, max: 20, default: 5, description: 'Top padding in pixels' },
          bottomPadding: { type: 'number', min: 0, max: 20, default: 5, description: 'Bottom padding in pixels' },
          fontSize: { type: 'number', min: 8, max: 16, default: 10, description: 'Font size in pixels' },
          fontFamily: { type: 'string', default: 'Arial, sans-serif', description: 'Font family' },
        },
      },
      blast: {
        description: 'BLAST Results Track Settings',
        settings: {
          height: { type: 'number', min: 60, max: 300, default: 120, description: 'Track height in pixels' },
          showRuler: { type: 'boolean', default: false, description: 'Show ruler' },
          resultHeight: { type: 'number', min: 8, max: 30, default: 12, description: 'Result height in pixels' },
          resultSpacing: { type: 'number', min: 5, max: 30, default: 14, description: 'Result spacing in pixels' },
        },
      },
      sequenceLine: {
        description: 'Single-line Sequence Track Settings',
        settings: {
          fontSize: { type: 'number', min: 10, max: 20, default: 14, description: 'Font size in pixels' },
          fontFamily: { type: 'string', default: 'Courier New, monospace', description: 'Font family' },
          maxHeight: { type: 'number', min: 30, max: 200, default: 50, description: 'Maximum height in pixels' },
          adaptiveHeight: { type: 'boolean', default: true, description: 'Adaptive height based on content' },
          showProteinTranslation: {
            type: 'boolean',
            default: false,
            description: 'Show protein translation sequences',
          },
          proteinTranslationMode: {
            type: 'string',
            enum: ['all_frames', 'cds_only'],
            default: 'all_frames',
            description: 'Translation mode',
          },
          proteinFramesToShow: {
            type: 'array',
            items: { type: 'number', enum: [1, 2, 3] },
            default: [1, 2, 3],
            description: 'Reading frames to display',
          },
          proteinFontSize: { type: 'number', min: 8, max: 16, default: 12, description: 'Protein font size in pixels' },
        },
      },
      wigTracks: {
        description: 'WIG Tracks Settings',
        settings: {
          trackSpacing: {
            type: 'number',
            min: 0,
            max: 20,
            default: 5,
            description: 'Spacing between tracks in pixels',
          },
          defaultTrackHeight: {
            type: 'number',
            min: 20,
            max: 100,
            default: 30,
            description: 'Default track height in pixels',
          },
          trackHeights: { type: 'object', description: 'Individual track heights (trackName -> height)' },
        },
      },
    };

    return {
      success: true,
      schema,
      description: 'Complete schema of available track settings with types, defaults, and validation rules',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Batch set track settings for multiple tracks
   */
  async batchSetTrackSettings(parameters) {
    const { settings_map } = parameters;

    if (!settings_map || typeof settings_map !== 'object') {
      throw new Error('settings_map parameter must be an object');
    }

    const results = {};
    const errors = [];

    for (const [trackType, settings] of Object.entries(settings_map)) {
      try {
        const result = await this.setTrackSettings({
          track_type: trackType,
          settings: settings,
        });
        results[trackType] = result;
      } catch (error) {
        results[trackType] = { success: false, error: error.message };
        errors.push(`${trackType}: ${error.message}`);
      }
    }

    return {
      success: errors.length === 0,
      track_count: Object.keys(settings_map).length,
      successful_updates: Object.keys(settings_map).length - errors.length,
      failed_updates: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================
  // Benchmark Tools
  // ============================================================

  /**
   * Helper to get benchmarkManager from app or window global.
   */
  _getBenchmarkManager() {
    return (this.app && this.app.benchmarkManager) || window.benchmarkManager || null;
  }

  /**
   * Open the benchmark interface.
   */
  async openBenchmark(_parameters = {}) {
    let bm = this._getBenchmarkManager();
    if (!bm) {
      // Benchmark modules not yet loaded — initialize on demand via the app
      if (this.app && typeof this.app.initializeBenchmarkSystemOnDemand === 'function') {
        try {
          bm = await this.app.initializeBenchmarkSystemOnDemand();
        } catch (e) {
          console.error('[openBenchmark] On-demand initialization failed:', e);
          return { success: false, error: 'Failed to initialize benchmark system: ' + e.message };
        }
      } else {
        return { success: false, error: 'Benchmark system not available. Please open it manually from the menu.' };
      }
    }
    await bm.showBenchmarkInterface();
    return { success: true, message: 'Benchmark interface opened' };
  }

  /**
   * Start a benchmark run with the given options.
   */
  async startBenchmark(parameters = {}) {
    let bm = this._getBenchmarkManager();
    if (!bm) {
      // Benchmark modules not yet loaded — initialize on demand via the app
      if (this.app && typeof this.app.initializeBenchmarkSystemOnDemand === 'function') {
        try {
          bm = await this.app.initializeBenchmarkSystemOnDemand();
        } catch (e) {
          console.error('[startBenchmark] On-demand initialization failed:', e);
          return { success: false, error: 'Failed to initialize benchmark system: ' + e.message };
        }
      } else {
        return { success: false, error: 'Benchmark system not available. Please open it manually from the menu.' };
      }
    }

    // Wait for initialization
    await bm.waitForInitialization();

    const suites = parameters.suites || ['automatic_simple', 'automatic_complex'];
    const timeout = parameters.timeout !== undefined ? parameters.timeout : 120000;
    const testDelay = parameters.test_delay !== undefined ? parameters.test_delay : 0;
    const generateReport = parameters.generate_report !== undefined ? parameters.generate_report : true;
    const includeCharts = parameters.include_charts !== undefined ? parameters.include_charts : true;
    const includeRawData = parameters.include_raw_data !== undefined ? parameters.include_raw_data : false;
    const includeLLMInteractions =
      parameters.include_llm_interactions !== undefined ? parameters.include_llm_interactions : true;
    const llmInteractionsFailedOnly =
      parameters.llm_interactions_failed_only !== undefined ? parameters.llm_interactions_failed_only : false;
    const stopOnError = parameters.stop_on_error !== undefined ? parameters.stop_on_error : false;

    // Open the interface first so the user can see progress
    try {
      await bm.showBenchmarkInterface();
    } catch (_e) {
      // Non-fatal — continue even if UI open fails
    }

    // Pre-configure the UI form to match programmatic options, then delegate to the
    // UI's own startMainWindowBenchmark() so it owns the running-state, timers,
    // progress bar, and results display — avoiding the postMessage DataCloneError.
    setTimeout(() => {
      try {
        // Suite checkboxes
        const allSuiteIds = ['automatic_simple', 'automatic_complex', 'manual_suite', 'manual_complex'];
        for (const id of allSuiteIds) {
          const cb = document.getElementById(`suite-${id}`);
          if (cb) cb.checked = suites.includes(id);
        }
        // Timeout (-1 signals individual-test timeouts)
        const timeoutEl = document.getElementById('testTimeout');
        if (timeoutEl) timeoutEl.value = timeout === null ? '-1' : String(timeout);
        // Delay between batches
        const testDelayEl = document.getElementById('testDelay');
        if (testDelayEl) testDelayEl.value = String(testDelay);
        // Report options
        const reportEl = document.getElementById('generateReport');
        if (reportEl) reportEl.checked = generateReport;
        const chartsEl = document.getElementById('includeCharts');
        if (chartsEl) chartsEl.checked = includeCharts;
        const rawDataEl = document.getElementById('includeRawData');
        if (rawDataEl) rawDataEl.checked = includeRawData;
        const includeLLMEl = document.getElementById('includeLLMInteractions');
        if (includeLLMEl) includeLLMEl.checked = includeLLMInteractions;
        const failedOnlyEl = document.getElementById('llmInteractionsFailedOnly');
        if (failedOnlyEl) failedOnlyEl.checked = llmInteractionsFailedOnly;
        const stopOnErrorEl = document.getElementById('stopOnError');
        if (stopOnErrorEl) stopOnErrorEl.checked = stopOnError;

        // Trigger via the UI so it handles running-state, elapsed timer, and results display
        if (bm.ui && typeof bm.ui.startMainWindowBenchmark === 'function') {
          bm.ui.startMainWindowBenchmark();
        } else {
          console.warn(
            '[startBenchmark] BenchmarkUI.startMainWindowBenchmark not available — falling back to direct run'
          );
          bm.framework
            .runAllBenchmarks({
              suites,
              timeout,
              testDelay,
              generateReport,
              includeCharts,
              includeRawData,
              includeLLMInteractions,
              llmInteractionsFailedOnly,
              stopOnError,
            })
            .catch(err => console.error('[startBenchmark] Fallback run error:', err));
        }
      } catch (e) {
        console.error('[startBenchmark] Failed to configure and start benchmark via UI:', e);
      }
    }, 250);

    return {
      success: true,
      message: `Benchmark starting with suites: ${suites.join(', ')}`,
      suites,
    };
  }

  /**
   * Stop the currently running benchmark.
   */
  async stopBenchmark(_parameters = {}) {
    const bm = this._getBenchmarkManager();
    if (!bm || !bm.framework) {
      return { success: false, error: 'Benchmark system not available' };
    }
    if (!bm.framework.isRunning) {
      return { success: false, error: 'No benchmark is currently running' };
    }
    bm.framework.stopBenchmark();
    return { success: true, message: 'Benchmark stopped' };
  }

  /**
   * Pause the currently running benchmark.
   */
  async pauseBenchmark(_parameters = {}) {
    const bm = this._getBenchmarkManager();
    if (!bm || !bm.framework) {
      return { success: false, error: 'Benchmark system not available' };
    }
    if (!bm.framework.isRunning) {
      return { success: false, error: 'No benchmark is currently running' };
    }
    bm.framework.pauseBenchmark();
    return { success: true, message: 'Benchmark paused' };
  }

  /**
   * Resume a paused benchmark.
   */
  async resumeBenchmark(_parameters = {}) {
    const bm = this._getBenchmarkManager();
    if (!bm || !bm.framework) {
      return { success: false, error: 'Benchmark system not available' };
    }
    if (!bm.framework.isPaused) {
      return { success: false, error: 'No benchmark is paused' };
    }
    bm.framework.resumeBenchmark();
    return { success: true, message: 'Benchmark resumed' };
  }

  /**
   * Get benchmark results/history.
   */
  async getBenchmarkResults(parameters = {}) {
    const bm = this._getBenchmarkManager();
    if (!bm || !bm.framework) {
      return { success: false, error: 'Benchmark system not available' };
    }

    const history = bm.framework.getBenchmarkHistory();
    if (!history || history.length === 0) {
      return { success: false, error: 'No benchmark history available. Run a benchmark first.' };
    }

    // If a specific index requested
    if (parameters.index !== undefined) {
      const idx = parameters.index === -1 ? history.length - 1 : parameters.index;
      const run = history[idx];
      if (!run) {
        return { success: false, error: `No benchmark run at index ${parameters.index}` };
      }
      return {
        success: true,
        totalRuns: history.length,
        run: {
          index: idx,
          date: new Date(run.startTime).toLocaleString(),
          duration: Math.round(run.duration / 1000),
          successRate: run.overallStats.overallSuccessRate.toFixed(1),
          totalTests: run.overallStats.totalTests,
          passedTests: run.overallStats.passedTests,
          failedTests: run.overallStats.failedTests,
          suites: run.options && run.options.suites ? run.options.suites : [],
        },
      };
    }

    // Return summary statistics
    const stats = bm.getBenchmarkStatistics();
    return {
      success: true,
      totalRuns: history.length,
      latestRun: stats ? stats.latestRun : null,
      averageSuccessRate: stats ? Number(stats.averageSuccessRate.toFixed(1)) : null,
      runs: history.map((run, idx) => ({
        index: idx,
        date: new Date(run.startTime).toLocaleString(),
        duration: Math.round(run.duration / 1000),
        successRate: run.overallStats.overallSuccessRate.toFixed(1),
        totalTests: run.overallStats.totalTests,
        passedTests: run.overallStats.passedTests,
      })),
    };
  }

  /**
   * Get the current status of the benchmark system.
   */
  async getBenchmarkStatus(_parameters = {}) {
    const bm = this._getBenchmarkManager();
    if (!bm) {
      return {
        success: true,
        initialized: false,
        frameworkReady: false,
        isRunning: false,
        isPaused: false,
        testSuitesLoaded: 0,
        totalRuns: 0,
        message: 'Benchmark system not yet initialized. Open the benchmark panel to initialize.',
      };
    }

    const systemStatus = bm.getSystemStatus();
    const history = bm.framework ? bm.framework.getBenchmarkHistory() : [];
    const isRunning = !!(bm.framework && bm.framework.isRunning);
    const isPaused = !!(bm.framework && bm.framework.isPaused);

    return {
      success: true,
      initialized: systemStatus.initialized,
      frameworkReady: systemStatus.frameworkReady,
      uiReady: systemStatus.uiReady,
      isRunning,
      isPaused,
      testSuitesLoaded: systemStatus.testSuitesLoaded,
      totalRuns: history.length,
    };
  }

  /**
   * Export benchmark results in the specified format.
   */
  async exportBenchmarkResults(parameters = {}) {
    const bm = this._getBenchmarkManager();
    if (!bm || !bm.framework) {
      return { success: false, error: 'Benchmark system not available' };
    }

    const history = bm.framework.getBenchmarkHistory();
    if (!history || history.length === 0) {
      return { success: false, error: 'No benchmark results available to export. Run a benchmark first.' };
    }

    const format = (parameters.format || 'json').toLowerCase();
    const llmInteractionsFailedOnly =
      parameters.llm_interactions_failed_only !== undefined ? parameters.llm_interactions_failed_only : false;
    const validFormats = ['json', 'csv', 'html'];
    if (!validFormats.includes(format)) {
      return { success: false, error: `Invalid format '${format}'. Supported formats: json, csv, html` };
    }

    try {
      await bm.framework.exportResults(format, { llmInteractionsFailedOnly });
      return { success: true, message: `Benchmark results exported as ${format}` };
    } catch (err) {
      return { success: false, error: `Export failed: ${err.message}` };
    }
  }

  // --- Task Service Delegations ---
  addTask(params) {
    return this.services.task.addTask(params);
  }

  updateTask(params) {
    return this.services.task.updateTask(params);
  }

  listTasks(params) {
    return this.services.task.listTasks(params);
  }

  clearTasks(params) {
    return this.services.task.clearTasks(params);
  }

  deleteTask(params) {
    return this.services.task.deleteTask(params);
  }
}

// Export for Node/test environments; in the renderer this class is loaded as a script-tag global.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatManager;
}
