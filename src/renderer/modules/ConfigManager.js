/* eslint-disable no-unused-vars, camelcase, no-prototype-builtins */
// @ts-check
/**
 * ConfigManager - Comprehensive configuration management for the CodeXomics
 * Handles LLM settings, UI preferences, chat history, and app configurations
 */
class ConfigManager {
  constructor() {
    // Detect Electron environment first
    this.isElectron = this.detectElectron();

    // Then get config path based on environment
    this.configPath = this.getConfigPath();
    this.config = this.getDefaultConfig();
    this.isInitialized = false;

    // Provide temporary debouncedSave function to prevent errors during initialization
    this.debouncedSave = this.debounce(() => {
      this.saveConfig();
    }, 1000);

    // Initialize asynchronously — store the promise so others can await it
    this._initPromise = this.initializeConfig()
      .then(() => {
        this.isInitialized = true;
        console.log('ConfigManager fully initialized');
      })
      .catch(error => {
        console.error('ConfigManager initialization failed:', error);
        this.isInitialized = true; // Mark as initialized even on error to prevent blocking
      });
  }

  /**
   * Wait until the ConfigManager has finished loading configuration.
   * Call this before reading settings to avoid race conditions.
   */
  async waitForInit() {
    await this._initPromise;
  }

  /**
   * Detect if running in Electron environment
   */
  detectElectron() {
    try {
      console.log('=== Electron Detection Debug ===');
      console.log('window:', typeof window);
      console.log('window.process:', typeof window?.process);
      console.log('window.process.type:', window?.process?.type);
      console.log('navigator.userAgent:', navigator?.userAgent);
      console.log('window.require:', typeof window?.require);
      console.log('window.electronAPI:', typeof window?.electronAPI);
      console.log('__dirname:', typeof __dirname);

      // Multiple ways to detect Electron
      const checks = {
        electronProcess: typeof window !== 'undefined' && window.process && window.process.type === 'renderer',
        userAgent:
          typeof navigator !== 'undefined' &&
          navigator.userAgent &&
          navigator.userAgent.toLowerCase().indexOf('electron') !== -1,
        requireFunction: typeof window !== 'undefined' && typeof window.require === 'function',
        dirname: typeof __dirname !== 'undefined',
      };

      console.log('Detection checks:', checks);

      const isElectron = checks.electronProcess || checks.userAgent || checks.requireFunction || checks.dirname;
      console.log('Final Electron detection result:', isElectron);
      console.log('===============================');

      return isElectron;
    } catch (error) {
      console.log('Electron detection error:', error);
      return false;
    }
  }

  /**
   * Config storage is owned by the main process in hardened Electron builds.
   * Concrete file paths are returned by config:load/config:save after IPC setup.
   */
  getConfigPath() {
    return null;
  }

  /**
   * Get default configuration structure
   */
  getDefaultConfig() {
    return {
      version: '1.0.0',
      llm: {
        providers: {
          openai: {
            name: 'OpenAI',
            apiKey: '',
            model: 'gpt-5.5',
            baseUrl: 'https://api.openai.com/v1',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
          anthropic: {
            name: 'Anthropic',
            apiKey: '',
            model: 'claude-sonnet-4.6',
            baseUrl: 'https://api.anthropic.com',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
          google: {
            name: 'Google',
            apiKey: '',
            model: 'gemini-3.5-flash',
            baseUrl: 'https://generativelanguage.googleapis.com',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
          deepseek: {
            name: 'DeepSeek',
            apiKey: '',
            model: 'deepseek-v4-flash',
            baseUrl: 'https://api.deepseek.com/v1',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
          siliconflow: {
            name: 'SiliconFlow',
            apiKey: '',
            model: 'Qwen/Qwen3.5-39B-A17B',
            baseUrl: 'https://api.siliconflow.cn/v1',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
          openrouter: {
            name: 'OpenRouter',
            apiKey: '',
            model: 'openai/gpt-5.5',
            baseUrl: 'https://openrouter.ai/api/v1',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
          minimax: {
            name: 'MiniMax (Global)',
            apiKey: '',
            model: 'MiniMax-M2.7',
            baseUrl: 'https://api.minimax.io/v1',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
          minimax_cn: {
            name: 'MiniMax CN',
            apiKey: '',
            model: 'MiniMax-M2.7',
            baseUrl: 'https://api.minimaxi.com/v1',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
          zhongkeyu: {
            name: 'Zhongkeyu',
            apiKey: '',
            model: 'gpt-5.6-sol',
            baseUrl: 'https://zhongkeyu.com/v1',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
          local: {
            name: 'Custom Endpoint',
            apiKey: '',
            model: 'qwen3:8b',
            baseUrl: 'http://localhost:11434/v1',
            streamingSupport: true,
            enabled: false,
            // Local reasoning models spend a large share of the generation
            // budget on <think> blocks before the visible answer or tool call;
            // 4096 is frequently truncated mid-reasoning.
            maxTokens: 8192,
            temperature: 0.7,
          },
          custom: {
            name: 'Custom Provider',
            providerName: 'My Custom Provider',
            apiKey: '',
            model: '',
            baseUrl: '',
            apiFormat: 'openai',
            customHeaders: {},
            maxTokens: 4096,
            temperature: 0.7,
            streamingSupport: false,
            enabled: false,
          },
        },
        currentProvider: null,
        systemPrompt: '',
        conversationMemory: 10, // Number of messages to remember
        autoSave: true,
        functionCallRounds: 6, // Maximum number of function call rounds
        enableEarlyCompletion: true, // Enable early task completion detection
        completionThreshold: 0.7, // Confidence threshold for task completion (0.0-1.0)
        maxSameToolDifferentParams: 3, // Default limit for different parameters
        maxSameToolIdenticalParams: 2, // Default limit for identical parameters
      },
      ui: {
        theme: 'default',
        fontSize: 14,
        fontFamily: 'Inter, sans-serif',
        sidebarVisible: false,
        sidebarVisibilityConfigured: false,
        sidebarWidth: 300,
        chatPanelVisible: false,
        chatPanelWidth: 350,
        trackHeights: {
          genes: 200,
          gcContent: 100,
          customTracks: 150,
        },
        colorScheme: {
          primary: '#3b82f6',
          secondary: '#64748b',
          accent: '#10b981',
          background: '#ffffff',
          surface: '#f8fafc',
        },
        animations: true,
        autoSaveInterval: 30000, // 30 seconds
        confirmDeleteActions: true,
        // Tab-specific configurations
        tabSettings: {
          persistTabStates: true,
          maxStoredTabs: 50,
          autoSaveTabStates: true,
          saveInterval: 5000, // 5 seconds
        },
      },
      // Tab states storage - each tab has independent configuration
      tabs: {
        states: {},
        activeTabId: null,
        lastSessionTabs: [],
        restoreTabsOnStartup: true,
      },
      chat: {
        history: [],
        maxHistoryLength: 1000,
        autoExport: false,
        exportFormat: 'json',
        showTimestamps: true,
        copyButtonsEnabled: true,
        typingIndicator: true,
      },
      app: {
        recentFiles: [],
        maxRecentFiles: 10,
        defaultDirectory: '',
        autoBackup: true,
        backupInterval: 3600000, // 1 hour
        debugMode: false,
        telemetry: false,
        updateChannel: 'stable',
        language: 'en',
        shortcuts: {
          search: 'Ctrl+F',
          goto: 'Ctrl+G',
          export: 'Ctrl+E',
          chat: 'Ctrl+H',
          help: 'F1',
        },
      },
      blast: {
        customDatabases: {},
        settings: {
          version: '1.0',
          autoValidate: true,
          validateOnStartup: true,
          maxDatabaseAge: 86400000, // 24 hours in milliseconds
          backupEnabled: true,
          compressionEnabled: false,
        },
        metadata: {
          lastUpdated: null,
          totalDatabases: 0,
          lastValidation: null,
          migrationVersion: '1.0',
        },
      },
      marketplace: {
        sources: [
          { id: 'localhost', url: 'http://localhost:3001/api/v1', priority: 0, enabled: true },
          { id: 'official', url: 'https://plugins.genomeexplorer.org/api/v1', priority: 1, enabled: false },
          { id: 'community', url: 'https://community-plugins.genomeexplorer.org/api/v1', priority: 2, enabled: false },
        ],
        installed: {},
        settings: {
          autoUpdate: true,
          updateCheckInterval: 86400000, // 24 hours
          enableSecurityValidation: false,
          enableDependencyResolution: true,
        },
        metadata: {
          lastSync: null,
          totalInstalls: 0,
          lastUpdated: null,
        },
      },
      generalSettings: {
        themeMode: 'light',
        uiStyle: 'default',
        accentColor: '#667eea',
        fontSize: 'medium',
        fontFamily: 'system',
        sequenceFont: 'monaco',
        compactMode: false,
        showWelcomeScreen: true,
        minLineSpacing: 12,
        maxSequenceLength: 5000000,
        renderingMode: 'adaptive',
        maxGenesDisplay: 1000,
        trackHeight: 'normal',
        enableAnimations: true,
        enableFileCache: true,
        cacheSize: 500,
        enableGlobalDragging: true,
        dragUpdateGeneFeatures: false,
        dragRealtimeSequenceUpdate: false,
        enableWheelZoom: true,
        wheelZoomSensitivity: 0.1,
        wheelZoomToCursor: true,
        wheelZoomMinRange: 100,
        wheelZoomMaxRange: 1000000,
        enableGCContent: true,
        enableProteinTranslation: true,
        enableOperonPrediction: true,
        enableSyntaxHighlighting: true,
        enableAutoSave: true,
        autoSaveInterval: 300,
        enableNotifications: true,
        enableKeyboardShortcuts: true,
        defaultExportFormat: 'fasta',
        includeMetadata: true,
        compressionLevel: 'medium',
        autoBackup: true,
        backupInterval: 24,
        maxBackups: 10,
        deepGeneResearchUrl: 'http://43.196.74.134:3000/',
        chopchopUrl: 'https://chopchop.cbu.uib.no/',
        progenFixerUrl: 'https://progenfixer.biodesign.ac.cn',
        securityProfile: 'balanced',
        disableAiSecurityRestrictions: false,
        warnBeforeAiFileWrites: true,
        warnBeforeInternetDownloads: true,
        showSecurityNotifications: true,
        enablePluginSecurityValidation: false,
        enablePluginSandboxMode: true,
        blockUntrustedPluginSources: true,
      },
      chatboxSettings: {
        enableExecutionGraphScheduler: false,
      },
    };
  }

  /**
   * Get default evolution configuration structure
   */
  getDefaultEvolutionConfig() {
    return {
      version: '1.0.0',
      lastModified: new Date().toISOString(),

      // Storage configuration
      storageConfig: {
        maxConversations: 1000,
        maxHistoryLength: 10000,
        autoSave: true,
        autoSaveInterval: 5000, // 5 seconds
        enableBackup: true,
        backupInterval: 86400000, // 24 hours
        compressionEnabled: true,
        maxFileSize: 50 * 1024 * 1024, // 50MB
      },

      // History data structure
      historyData: {
        conversations: [],
        analysisRecords: [],
        pluginGenerationHistory: [],
        evolutionTimeline: [],
        storageStats: {
          totalConversations: 0,
          totalMessages: 0,
          totalAnalysisCount: 0,
          totalPluginsGenerated: 0,
          firstRecordDate: null,
          lastUpdateDate: null,
          storageSize: 0,
        },
      },

      // Analysis engine configuration
      analysisConfig: {
        enableRealTimeAnalysis: true,
        failureDetectionKeywords: [
          'error',
          'failed',
          'cannot',
          'unable',
          'not available',
          'not found',
          'not supported',
          'not implemented',
          'sorry',
          'unfortunately',
          'not possible',
        ],
        successDetectionKeywords: [
          'success',
          'completed',
          'done',
          'finished',
          'resolved',
          'working',
          'created',
          'generated',
          'saved',
        ],
        minConversationLength: 3, // Minimum messages before analysis
        analysisThreshold: 0.7, // Confidence threshold for analysis
        pluginGenerationThreshold: 0.8, // Threshold to trigger plugin generation
      },

      // Plugin generation configuration
      pluginGenerationConfig: {
        enabled: true,
        autoGenerate: false, // Manual approval required
        testingEnabled: true,
        maxGenerationAttempts: 3,
        templateEngine: 'default',
        codeValidation: true,
        securityScan: true,
        outputDirectory: 'src/renderer/modules/Plugins/Generated',
      },

      // User interface configuration
      uiConfig: {
        showEvolutionPanel: true,
        showAnalysisResults: true,
        showPluginGeneration: true,
        notificationsEnabled: true,
        autoRefreshInterval: 10000, // 10 seconds
        maxDisplayItems: 100,
      },

      // Export configuration
      exportConfig: {
        defaultFormat: 'json',
        includeSensitiveData: false,
        compressionLevel: 6,
        timestampFormat: 'ISO',
        supportedFormats: ['json', 'csv', 'txt'],
      },
    };
  }

  /**
   * Initialize configuration system
   */
  async initializeConfig() {
    try {
      await this.loadConfig();
      this.setupAutoSave();

      // Clean up any oversized data from previous sessions
      this.cleanupOversizedData();

      console.log('Configuration system initialized');
    } catch (error) {
      console.error('Failed to initialize configuration:', error);
      // Use default config on failure
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Load configuration from file or localStorage
   */
  async loadConfig() {
    console.log('=== loadConfig Debug Start ===');
    console.log('this.configPath:', this.configPath);

    if (typeof window !== 'undefined' && window.electronAPI?.loadConfigData) {
      console.log('Loading configuration from main-process config IPC');
      try {
        await this.loadFromMainConfig();
      } catch (error) {
        console.warn('File-based configuration unavailable, falling back to localStorage:', error.message);
        this.loadFromLocalStorage();
      }
    } else {
      console.log('Loading configuration from LOCALSTORAGE (fallback)');
      // localStorage fallback
      this.loadFromLocalStorage();
    }
    console.log('=== loadConfig Debug End ===');
  }

  /**
   * Load configuration from main process (Electron)
   */
  async loadFromMainConfig() {
    const result = await window.electronAPI.loadConfigData();
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to load configuration from main process');
    }

    if (result.configPath) {
      this.configPath = result.configPath;
    }

    const loadedConfig = result.config || {};
    if (loadedConfig.main) {
      this.config = this.mergeConfig(this.config, loadedConfig.main);
    }

    for (const section of [
      'llm',
      'ui',
      'chat',
      'app',
      'generalSettings',
      'chatboxSettings',
      'evolution',
      'blast',
      'marketplace',
    ]) {
      if (loadedConfig[section]) {
        this.config[section] = this.mergeConfig(this.config[section], loadedConfig[section]);
      }
    }

    this.migrateMarketplaceSettingsFromLocalStorage();
    this.migrateBlastDatabasesFromLocalStorage();
    console.log('Configuration loaded from main-process config IPC');
  }

  async loadFromFiles() {
    return this.loadFromMainConfig();
  }

  /**
   * Load configuration from localStorage (fallback)
   */
  loadFromLocalStorage() {
    try {
      console.log('Loading configuration from localStorage...');

      // Load LLM config (backward compatibility)
      const llmConfig = localStorage.getItem('llmConfiguration');
      if (llmConfig) {
        const parsed = JSON.parse(llmConfig);
        this.config.llm.providers = { ...this.config.llm.providers, ...parsed.providers };
        this.config.llm.currentProvider = parsed.currentProvider;
        console.log('LLM configuration loaded from localStorage:', {
          currentProvider: this.config.llm.currentProvider,
          providersCount: Object.keys(this.config.llm.providers).length,
        });
      } else {
        console.log('No LLM configuration found in localStorage');
      }

      // Load UI preferences
      const uiConfig = localStorage.getItem('uiPreferences');
      if (uiConfig) {
        this.config.ui = { ...this.config.ui, ...JSON.parse(uiConfig) };
        console.log('UI preferences loaded from localStorage');
      }

      // Load chat history (namespaced per window so multiple open genome windows
      // don't overwrite each other's saved history — see getChatHistoryKey()).
      const chatHistoryKey = this.getChatHistoryKey();
      let chatHistory = localStorage.getItem(chatHistoryKey);
      if (!chatHistory && chatHistoryKey !== 'chatHistory') {
        // One-time migration: the first window after upgrade adopts the legacy
        // shared history, then consumes the legacy key so other windows start
        // fresh instead of all loading (and re-saving) the same log.
        const legacy = localStorage.getItem('chatHistory');
        if (legacy) {
          chatHistory = legacy;
          try {
            localStorage.setItem(chatHistoryKey, legacy);
            localStorage.removeItem('chatHistory');
          } catch (e) {
            /* non-fatal */
          }
        }
      }
      if (chatHistory) {
        this.config.chat.history = JSON.parse(chatHistory);
        console.log(`Chat history loaded from localStorage: ${this.config.chat.history.length} messages`);
      }

      // Load app settings
      const appSettings = localStorage.getItem('appSettings');
      if (appSettings) {
        this.config.app = { ...this.config.app, ...JSON.parse(appSettings) };
        console.log('App settings loaded from localStorage');
      }

      // Load general settings (UI Style, theme, accent color, etc.)
      const generalSettings = localStorage.getItem('generalSettings');
      if (generalSettings) {
        this.config.generalSettings = { ...JSON.parse(generalSettings) };
        console.log('General settings loaded from localStorage:', {
          uiStyle: this.config.generalSettings.uiStyle,
          themeMode: this.config.generalSettings.themeMode,
        });
      }

      // Load chatbox settings
      const chatboxSettings = localStorage.getItem('chatboxSettings');
      if (chatboxSettings) {
        this.config.chatboxSettings = { ...JSON.parse(chatboxSettings) };
        console.log('ChatBox settings loaded from localStorage');
      }

      // Load marketplace settings and installed plugins
      const marketplaceSettings = localStorage.getItem('marketplaceSettings');
      if (marketplaceSettings) {
        this.config.marketplace = { ...this.config.marketplace, ...JSON.parse(marketplaceSettings) };
        console.log('Marketplace settings loaded from localStorage:', {
          installed: Object.keys(this.config.marketplace.installed || {}).length,
          sources: this.config.marketplace.sources?.length,
        });
      } else {
        console.log('No marketplace settings found in localStorage');
      }

      // Load BLAST databases (migration from localStorage)
      const blastDatabases = localStorage.getItem('blast_custom_databases');
      if (blastDatabases) {
        try {
          const savedData = JSON.parse(blastDatabases);
          let databases;

          if (Array.isArray(savedData)) {
            // Old format - direct array
            databases = savedData;
            console.log('Loading BLAST databases from old localStorage format');
          } else if (savedData.databases) {
            // New format - with metadata
            databases = savedData.databases;
            console.log('Loading BLAST databases from new localStorage format');
          }

          if (databases) {
            // Convert array format to object format for ConfigManager
            const databasesObject = {};
            databases.forEach(([id, data]) => {
              databasesObject[id] = data;
            });

            this.config.blast.customDatabases = databasesObject;
            this.config.blast.metadata.lastUpdated = new Date().toISOString();
            this.config.blast.metadata.totalDatabases = databases.length;
            console.log(`Migrated ${databases.length} BLAST databases from localStorage`);
          }
        } catch (error) {
          console.error('Error migrating BLAST databases from localStorage:', error);
        }
      }

      console.log('Configuration loaded from localStorage successfully');
    } catch (error) {
      console.error('Error loading configuration from localStorage:', error);
    }
  }

  migrateMarketplaceSettingsFromLocalStorage() {
    try {
      const marketplaceSettings = localStorage.getItem('marketplaceSettings');
      if (!marketplaceSettings) return;

      const parsed = JSON.parse(marketplaceSettings);
      this.config.marketplace = { ...this.config.marketplace, ...parsed };
      console.log('Marketplace settings migrated from localStorage:', {
        installed: Object.keys(this.config.marketplace.installed || {}).length,
        sources: this.config.marketplace.sources?.length,
      });
    } catch (error) {
      console.error('Error migrating marketplace settings from localStorage:', error);
    }
  }

  /**
   * Save configuration
   */
  async saveConfig() {
    console.log('=== saveConfig Debug Start ===');
    console.log('this.configPath:', this.configPath);

    try {
      await this.waitForInitialization();

      if (typeof window !== 'undefined' && window.electronAPI?.saveConfigData) {
        console.log('Saving configuration through main-process config IPC');
        const savedToMain = await this.saveToMainConfig();
        if (savedToMain === false) {
          console.warn('File-based configuration save unavailable, falling back to localStorage');
          this.saveToLocalStorage();
          console.log('Configuration saved to localStorage fallback');
        } else {
          console.log('Configuration saved through main process');
        }
      } else {
        console.log('Saving configuration to LOCALSTORAGE (fallback)');
        this.saveToLocalStorage();
        console.log('Configuration saved to localStorage');
      }
      console.log('Configuration saved successfully');
      console.log('=== saveConfig Debug End ===');
    } catch (error) {
      console.error('Error saving configuration:', error);
      console.error('=== saveConfig Debug End (ERROR) ===');

      // Try fallback to localStorage if file saving fails
      try {
        console.warn('Attempting fallback save to localStorage...');
        this.saveToLocalStorage();
        console.log('Fallback save to localStorage successful');
      } catch (fallbackError) {
        console.error('Fallback save also failed:', fallbackError);
        // Don't throw error to prevent app crashes
        console.warn('Configuration save failed completely, but continuing execution');
      }
    }
  }

  /**
   * Backward-compatible alias used by older managers.
   */
  async save() {
    return this.saveConfig();
  }

  /**
   * Whether the hardened renderer has direct filesystem access.
   *
   * In the context-isolated app this is intentionally false, and configuration
   * should use localStorage or IPC-backed APIs instead of probing renderer
   * filesystem modules on every startup.
   */
  canUseRendererFileSystem() {
    return false;
  }

  /**
   * Validate and clean data before saving to prevent JSON.stringify errors
   */
  validateAndCleanData(data, maxSize = 50 * 1024 * 1024) {
    // 50MB default limit (increased from 10MB)
    try {
      // Create a deep copy to avoid modifying original data
      const cleanData = JSON.parse(JSON.stringify(data));

      // Check if data has historyData that might be too large
      if (cleanData.historyData) {
        console.log('Validating historyData size...');

        // Truncate large arrays in historyData
        const maxArrayLength = 1000; // Limit arrays to 1000 items

        if (cleanData.historyData.conversations && Array.isArray(cleanData.historyData.conversations)) {
          if (cleanData.historyData.conversations.length > maxArrayLength) {
            console.warn(
              `Truncating conversations array from ${cleanData.historyData.conversations.length} to ${maxArrayLength} items`
            );
            cleanData.historyData.conversations = cleanData.historyData.conversations.slice(-maxArrayLength);
          }
        }

        if (cleanData.historyData.analysisRecords && Array.isArray(cleanData.historyData.analysisRecords)) {
          if (cleanData.historyData.analysisRecords.length > maxArrayLength) {
            console.warn(
              `Truncating analysisRecords array from ${cleanData.historyData.analysisRecords.length} to ${maxArrayLength} items`
            );
            cleanData.historyData.analysisRecords = cleanData.historyData.analysisRecords.slice(-maxArrayLength);
          }
        }

        if (
          cleanData.historyData.pluginGenerationHistory &&
          Array.isArray(cleanData.historyData.pluginGenerationHistory)
        ) {
          if (cleanData.historyData.pluginGenerationHistory.length > maxArrayLength) {
            console.warn(
              `Truncating pluginGenerationHistory array from ${cleanData.historyData.pluginGenerationHistory.length} to ${maxArrayLength} items`
            );
            cleanData.historyData.pluginGenerationHistory =
              cleanData.historyData.pluginGenerationHistory.slice(-maxArrayLength);
          }
        }

        if (cleanData.historyData.evolutionTimeline && Array.isArray(cleanData.historyData.evolutionTimeline)) {
          if (cleanData.historyData.evolutionTimeline.length > maxArrayLength) {
            console.warn(
              `Truncating evolutionTimeline array from ${cleanData.historyData.evolutionTimeline.length} to ${maxArrayLength} items`
            );
            cleanData.historyData.evolutionTimeline = cleanData.historyData.evolutionTimeline.slice(-maxArrayLength);
          }
        }
      }

      // Check if chat history is too large
      if (cleanData.history && Array.isArray(cleanData.history)) {
        const maxChatHistory = cleanData.maxHistoryLength || 1000;
        if (cleanData.history.length > maxChatHistory) {
          console.warn(`Truncating chat history from ${cleanData.history.length} to ${maxChatHistory} items`);
          cleanData.history = cleanData.history.slice(-maxChatHistory);
        }
      }

      // Test if the cleaned data can be stringified
      const testString = JSON.stringify(cleanData);
      const dataSizeBytes = new Blob([testString]).size;

      console.log(`Data size after cleaning: ${(dataSizeBytes / 1024 / 1024).toFixed(2)} MB`);

      if (dataSizeBytes > maxSize) {
        console.warn(
          `Data size ${(dataSizeBytes / 1024 / 1024).toFixed(2)} MB exceeds limit ${(maxSize / 1024 / 1024).toFixed(2)} MB`
        );
        throw new Error(
          `Data too large: ${(dataSizeBytes / 1024 / 1024).toFixed(2)} MB exceeds ${(maxSize / 1024 / 1024).toFixed(2)} MB limit`
        );
      }

      return cleanData;
    } catch (error) {
      console.error('Error validating/cleaning data:', error);

      // If cleaning fails, return a minimal safe version
      if (data.historyData) {
        console.warn('Returning minimal evolution config due to data size issues');
        return this.getDefaultEvolutionConfig();
      } else if (data.history) {
        console.warn('Returning minimal chat config due to data size issues');
        return {
          ...data,
          history: data.history ? data.history.slice(-100) : [], // Keep only last 100 messages
        };
      }

      return data; // Return original if we can't clean it
    }
  }

  /**
   * Safe JSON stringify with size validation
   */
  safeStringify(data, indent = 2) {
    try {
      const result = JSON.stringify(data, null, indent);
      const sizeBytes = new Blob([result]).size;
      const sizeMB = sizeBytes / 1024 / 1024;

      console.log(`JSON string size: ${sizeMB.toFixed(2)} MB`);

      // JavaScript string length limit is approximately 1GB, but we'll be more conservative
      if (sizeBytes > 100 * 1024 * 1024) {
        // 100MB limit
        throw new Error(`JSON string too large: ${sizeMB.toFixed(2)} MB`);
      }

      return result;
    } catch (error) {
      console.error('Error in safeStringify:', error);
      throw error;
    }
  }

  /**
   * Build the renderer payload for the main-process config store.
   *
   * Keep this intentionally aligned with CONFIG_FILES in src/main/ipc-handlers.js.
   * Runtime-only state such as tabs, genome sequences, annotations, and transient
   * manager caches must not be spread into this object.
   */
  buildPersistableConfig() {
    const persistableConfig = {
      version: this.config.version,
    };

    const sections = [
      'llm',
      'ui',
      'chat',
      'app',
      'generalSettings',
      'chatboxSettings',
      'evolution',
      'blast',
      'marketplace',
    ];

    sections.forEach(section => {
      if (section === 'evolution') {
        persistableConfig.evolution = this.validateAndCleanData(
          this.config.evolution || this.getDefaultEvolutionConfig()
        );
      } else if (section === 'chat') {
        persistableConfig.chat = this.validateAndCleanData(this.config.chat);
      } else if (this.config[section] !== undefined) {
        persistableConfig[section] = this.validateAndCleanData(this.config[section]);
      }
    });

    return persistableConfig;
  }

  /**
   * Save configuration through main process (Electron)
   */
  async saveToMainConfig() {
    try {
      if (typeof window === 'undefined' || !window.electronAPI?.saveConfigData) {
        throw new Error('Main-process config save API is unavailable');
      }

      const configForPersistence = this.buildPersistableConfig();
      const cleanConfig = this.validateAndCleanData(configForPersistence);
      const result = await window.electronAPI.saveConfigData(cleanConfig);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to save configuration through main process');
      }
      if (result.configPath) {
        this.configPath = result.configPath;
      }
      return true;
    } catch (error) {
      console.error('Error saving configuration through main process:', error);
      return false;
    }
  }

  async saveToFiles() {
    return this.saveToMainConfig();
  }

  /**
   * Resolve this window's stable id (for the lifetime of the window) so chat
   * history can be namespaced. Reads, in order: the live GenomeBrowser app, the
   * ?windowId= query param (available synchronously at load), and a global set
   * by the renderer. Returns null when no window identity is available.
   */
  resolveWindowId() {
    try {
      if (typeof window !== 'undefined') {
        if (window.genomeBrowser && window.genomeBrowser.windowId) {
          return window.genomeBrowser.windowId;
        }
        const fromQuery = new URLSearchParams(window.location.search).get('windowId');
        if (fromQuery) return fromQuery;
        if (window.__codexomicsWindowId) return window.__codexomicsWindowId;
      }
    } catch (e) {
      /* non-fatal */
    }
    return null;
  }

  /**
   * localStorage key for this window's chat history. Falls back to the legacy
   * shared 'chatHistory' key when no window identity is available.
   */
  getChatHistoryKey() {
    const windowId = this.resolveWindowId();
    return windowId ? `chatHistory::${windowId}` : 'chatHistory';
  }

  /**
   * Window ids embed a creation timestamp (win_<counter>_<timestamp>) and change
   * every launch, so namespaced chat histories from closed windows would
   * accumulate. Keep this window's key plus the most recent few; drop the rest.
   */
  pruneOrphanChatHistories(keep = 10) {
    try {
      if (typeof localStorage === 'undefined') return;
      const currentKey = this.getChatHistoryKey();
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('chatHistory::')) keys.push(k);
      }
      if (keys.length <= keep) return;
      const tsOf = k => {
        const m = /_(\d+)$/.exec(k);
        return m ? parseInt(m[1], 10) : 0;
      };
      keys
        .filter(k => k !== currentKey)
        .sort((a, b) => tsOf(b) - tsOf(a))
        .slice(keep - 1)
        .forEach(k => {
          try {
            localStorage.removeItem(k);
          } catch (e) {
            /* ignore */
          }
        });
    } catch (e) {
      /* non-fatal */
    }
  }

  /**
   * Save configuration to localStorage (fallback)
   */
  saveToLocalStorage() {
    try {
      // Save LLM config with validation
      const llmConfig = {
        providers: this.config.llm.providers,
        currentProvider: this.config.llm.currentProvider,
      };
      localStorage.setItem('llmConfiguration', this.safeStringify(llmConfig));

      // Save UI preferences with validation
      localStorage.setItem('uiPreferences', this.safeStringify(this.config.ui));

      // Save chat history with size validation (namespaced per window).
      const cleanChatHistory = this.validateAndCleanData(this.config.chat).history;
      localStorage.setItem(this.getChatHistoryKey(), this.safeStringify(cleanChatHistory));
      this.pruneOrphanChatHistories();

      // Save app settings with validation
      localStorage.setItem('appSettings', this.safeStringify(this.config.app));

      // Save general settings (UI Style, theme, accent color, etc.)
      if (this.config.generalSettings) {
        localStorage.setItem('generalSettings', this.safeStringify(this.config.generalSettings));
      }

      // Save chatbox settings
      if (this.config.chatboxSettings && Object.keys(this.config.chatboxSettings).length > 0) {
        localStorage.setItem('chatboxSettings', this.safeStringify(this.config.chatboxSettings));
      }

      // Save marketplace settings and installed plugins
      localStorage.setItem('marketplaceSettings', this.safeStringify(this.config.marketplace));

      console.log('Configuration saved to localStorage with size validation');
      console.log('Marketplace data saved:', {
        installed: Object.keys(this.config.marketplace?.installed || {}).length,
        sources: this.config.marketplace?.sources?.length,
      });
    } catch (error) {
      console.error('Error saving configuration to localStorage:', error);

      // Try to save minimal data if full save fails
      try {
        console.warn('Attempting to save minimal configuration to localStorage...');
        localStorage.setItem(
          'llmConfiguration',
          JSON.stringify({
            providers: this.config.llm.providers || {},
            currentProvider: this.config.llm.currentProvider || 'openai',
          })
        );
        localStorage.setItem('uiPreferences', JSON.stringify(this.config.ui || {}));
        localStorage.setItem(this.getChatHistoryKey(), JSON.stringify([])); // Clear chat history
        localStorage.setItem('appSettings', JSON.stringify(this.config.app || {}));
        if (this.config.generalSettings) {
          localStorage.setItem('generalSettings', JSON.stringify(this.config.generalSettings));
        }
        if (this.config.chatboxSettings && Object.keys(this.config.chatboxSettings).length > 0) {
          localStorage.setItem('chatboxSettings', JSON.stringify(this.config.chatboxSettings));
        }
        console.log('Minimal configuration saved to localStorage');
      } catch (minimalError) {
        console.error('Even minimal localStorage save failed:', minimalError);
        throw error; // Re-throw original error
      }
    }
  }

  /**
   * Clean up oversized data proactively to prevent save errors
   */
  cleanupOversizedData() {
    console.log('🧹 Starting data cleanup to prevent save errors...');

    try {
      let cleaned = false;

      // Clean up chat history if too large
      if (this.config.chat && this.config.chat.history && Array.isArray(this.config.chat.history)) {
        const maxChatHistory = this.config.chat.maxHistoryLength || 1000;
        if (this.config.chat.history.length > maxChatHistory) {
          const oldLength = this.config.chat.history.length;
          this.config.chat.history = this.config.chat.history.slice(-maxChatHistory);
          console.log(`🧹 Cleaned chat history: ${oldLength} → ${this.config.chat.history.length} messages`);
          cleaned = true;
        }
      }

      // Clean up evolution data if it exists and is too large
      if (this.config.evolution && this.config.evolution.historyData) {
        const maxArrayLength = 1000;
        const historyData = this.config.evolution.historyData;

        ['conversations', 'analysisRecords', 'pluginGenerationHistory', 'evolutionTimeline'].forEach(arrayName => {
          if (historyData[arrayName] && Array.isArray(historyData[arrayName])) {
            if (historyData[arrayName].length > maxArrayLength) {
              const oldLength = historyData[arrayName].length;
              historyData[arrayName] = historyData[arrayName].slice(-maxArrayLength);
              console.log(`🧹 Cleaned ${arrayName}: ${oldLength} → ${historyData[arrayName].length} items`);
              cleaned = true;
            }
          }
        });
      }

      if (cleaned) {
        console.log('🧹 Data cleanup completed, attempting to save cleaned configuration...');
        // Don't await this to avoid recursive calls
        this.debouncedSave();
      } else {
        console.log('🧹 No cleanup needed - data sizes are within limits');
      }

      return cleaned;
    } catch (error) {
      console.error('🧹 Error during data cleanup:', error);
      return false;
    }
  }

  /**
   * Wait for configuration to be initialized
   */
  async waitForInitialization() {
    if (this.isInitialized) {
      return;
    }

    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (this.isInitialized) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 10); // Check every 10ms
    });
  }

  /**
   * Get configuration value
   */
  get(path, defaultValue = null) {
    try {
      const keys = path.split('.');
      let value = this.config;

      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return defaultValue;
        }
      }

      return value;
    } catch (error) {
      console.error('Error getting config value:', error);
      return defaultValue;
    }
  }

  /**
   * Set configuration value
   */
  async set(path, value) {
    try {
      // Ensure initialization is complete
      await this.waitForInitialization();

      const keys = path.split('.');
      let obj = this.config;

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in obj) || typeof obj[key] !== 'object') {
          obj[key] = {};
        }
        obj = obj[key];
      }

      obj[keys[keys.length - 1]] = value;

      if (this.config.ui.autoSaveInterval > 0 && this.debouncedSave) {
        this.debouncedSave();
      }
    } catch (error) {
      console.error('Error setting config value:', error);
    }
  }

  /**
   * Set configuration value and save immediately (bypasses debounce)
   * Use this for critical data that must persist immediately
   * @param {string} path - Configuration path (e.g., 'marketplace.installed')
   * @param {any} value - Value to set
   */
  async setAndSaveImmediate(path, value) {
    try {
      // Ensure initialization is complete
      await this.waitForInitialization();

      const keys = path.split('.');
      let obj = this.config;

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in obj) || typeof obj[key] !== 'object') {
          obj[key] = {};
        }
        obj = obj[key];
      }

      obj[keys[keys.length - 1]] = value;

      // Save immediately without debounce
      console.log(`💾 Immediate save triggered for: ${path}`);
      await this.saveConfig();

      return true;
    } catch (error) {
      console.error('Error in setAndSaveImmediate:', error);
      return false;
    }
  }

  /**
   * Add chat message to history
   */
  addChatMessage(message, sender, timestamp = null) {
    const chatMessage = {
      message,
      sender,
      timestamp: timestamp || new Date().toISOString(),
      id: Date.now() + Math.random().toString(36).substr(2, 9),
    };

    this.config.chat.history.push(chatMessage);

    // Limit history length
    if (this.config.chat.history.length > this.config.chat.maxHistoryLength) {
      this.config.chat.history = this.config.chat.history.slice(-this.config.chat.maxHistoryLength);
    }

    if (this.config.llm.autoSave && this.debouncedSave) {
      this.debouncedSave();
    }

    return chatMessage.id;
  }

  /**
   * Get chat history
   */
  getChatHistory(limit = null) {
    const history = this.config.chat.history;
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Clear chat history
   */
  clearChatHistory() {
    this.config.chat.history = [];
    console.log('Chat history cleared');
  }

  /**
   * Set chat history (replace existing history)
   */
  setChatHistory(history) {
    this.config.chat.history = history;
    console.log(`Chat history set: ${history.length} messages`);
  }

  /**
   * Add recent file
   */
  addRecentFile(filePath) {
    const recentFiles = this.config.app.recentFiles;

    // Remove if already exists
    const index = recentFiles.indexOf(filePath);
    if (index > -1) {
      recentFiles.splice(index, 1);
    }

    // Add to beginning
    recentFiles.unshift(filePath);

    // Limit length
    if (recentFiles.length > this.config.app.maxRecentFiles) {
      recentFiles.splice(this.config.app.maxRecentFiles);
    }

    if (this.debouncedSave) {
      this.debouncedSave();
    }
  }

  /**
   * Export configuration
   */
  async exportConfig(filePath = null) {
    try {
      const exportData = {
        version: this.config.version,
        exported: new Date().toISOString(),
        config: this.config,
      };

      if (filePath) {
        if (typeof window !== 'undefined' && window.electronAPI?.writeFile) {
          const result = await window.electronAPI.writeFile(filePath, JSON.stringify(exportData, null, 2));
          if (!result?.success) {
            throw new Error(result?.error || `Failed to write configuration export: ${filePath}`);
          }
        } else {
          throw new Error('File export requires main-process file write API');
        }
      } else {
        // Download as file in browser
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `genome-browser-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting configuration:', error);
      throw error;
    }
  }

  /**
   * Import configuration
   */
  async importConfig(data) {
    try {
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      if (data.config) {
        this.config = this.mergeConfig(this.getDefaultConfig(), data.config);
        await this.saveConfig();
        console.log('Configuration imported successfully');
        return true;
      } else {
        throw new Error('Invalid configuration format');
      }
    } catch (error) {
      console.error('Error importing configuration:', error);
      throw error;
    }
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(sections = null) {
    try {
      const defaultConfig = this.getDefaultConfig();

      if (sections) {
        // Reset specific sections
        for (const section of sections) {
          if (section in defaultConfig) {
            this.config[section] = defaultConfig[section];
          }
        }
      } else {
        // Reset everything
        this.config = defaultConfig;
      }

      await this.saveConfig();
      console.log('Configuration reset to defaults');
    } catch (error) {
      console.error('Error resetting configuration:', error);
      throw error;
    }
  }

  /**
   * Setup auto-save functionality
   */
  setupAutoSave() {
    if (this.config.ui.autoSaveInterval > 0) {
      this.debouncedSave = this.debounce(() => {
        this.saveConfig();
      }, this.config.ui.autoSaveInterval);
    } else {
      // Always provide a fallback debouncedSave function
      this.debouncedSave = this.debounce(() => {
        this.saveConfig();
      }, 1000); // 1 second fallback
    }
  }

  /**
   * Utility functions
   */
  async fileExists(path) {
    if (typeof window !== 'undefined' && window.electronAPI?.checkFileExists) {
      const result = await window.electronAPI.checkFileExists(path);
      return !!result?.exists;
    }
    return false;
  }

  mergeConfig(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.mergeConfig(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary() {
    return {
      version: this.config.version,
      llmProvider: this.config.llm.currentProvider,
      llmProvidersEnabled: Object.keys(this.config.llm.providers).filter(p => this.config.llm.providers[p].enabled),
      theme: this.config.ui.theme,
      chatHistoryLength: this.config.chat.history.length,
      recentFilesCount: this.config.app.recentFiles.length,
      debugMode: this.config.app.debugMode,
    };
  }

  /**
   * Debug method to check storage mechanism
   */
  getStorageInfo() {
    return {
      isElectron: this.isElectron,
      configPath: this.configPath,
      usingFiles: this.configPath !== null,
      usingLocalStorage: this.configPath === null,
      isInitialized: this.isInitialized,
    };
  }

  // BLAST Database specific methods
  async getBlastDatabases() {
    await this.waitForInitialization();
    return this.config.blast.customDatabases || {};
  }

  async setBlastDatabase(id, databaseData) {
    await this.waitForInitialization();

    if (!this.config.blast.customDatabases) {
      this.config.blast.customDatabases = {};
    }

    // Add metadata
    databaseData.lastModified = new Date().toISOString();

    this.config.blast.customDatabases[id] = databaseData;
    this.config.blast.metadata.lastUpdated = new Date().toISOString();
    this.config.blast.metadata.totalDatabases = Object.keys(this.config.blast.customDatabases).length;

    await this.saveConfig();
    console.log(`BLAST database ${id} saved to config`);
  }

  async removeBlastDatabase(id) {
    await this.waitForInitialization();

    if (this.config.blast.customDatabases && this.config.blast.customDatabases[id]) {
      delete this.config.blast.customDatabases[id];
      this.config.blast.metadata.lastUpdated = new Date().toISOString();
      this.config.blast.metadata.totalDatabases = Object.keys(this.config.blast.customDatabases).length;

      await this.saveConfig();
      console.log(`BLAST database ${id} removed from config`);
      return true;
    }
    return false;
  }

  async updateBlastDatabase(id, updates) {
    await this.waitForInitialization();

    if (this.config.blast.customDatabases && this.config.blast.customDatabases[id]) {
      this.config.blast.customDatabases[id] = {
        ...this.config.blast.customDatabases[id],
        ...updates,
        lastModified: new Date().toISOString(),
      };
      this.config.blast.metadata.lastUpdated = new Date().toISOString();

      await this.saveConfig();
      console.log(`BLAST database ${id} updated in config`);
      return true;
    }
    return false;
  }

  async clearBlastDatabases() {
    await this.waitForInitialization();

    this.config.blast.customDatabases = {};
    this.config.blast.metadata.lastUpdated = new Date().toISOString();
    this.config.blast.metadata.totalDatabases = 0;

    await this.saveConfig();
    console.log('All BLAST databases cleared from config');
  }

  async getBlastSettings() {
    await this.waitForInitialization();
    return this.config.blast.settings || {};
  }

  async setBlastSettings(settings) {
    await this.waitForInitialization();

    this.config.blast.settings = {
      ...this.config.blast.settings,
      ...settings,
    };

    await this.saveConfig();
    console.log('BLAST settings updated');
  }

  async migrateBlastDatabasesFromLocalStorage() {
    console.log('=== Starting BLAST database migration from localStorage ===');

    try {
      const localStorageData = localStorage.getItem('blast_custom_databases');
      if (!localStorageData) {
        console.log('No BLAST databases found in localStorage to migrate');
        return { success: true, migrated: 0 };
      }

      const savedData = JSON.parse(localStorageData);
      let databases;

      if (Array.isArray(savedData)) {
        databases = savedData;
        console.log('Found old format BLAST databases in localStorage');
      } else if (savedData.databases) {
        databases = savedData.databases;
        console.log('Found new format BLAST databases in localStorage');
      } else {
        throw new Error('Invalid BLAST database format in localStorage');
      }

      let migratedCount = 0;
      for (const [id, data] of databases) {
        await this.setBlastDatabase(id, {
          ...data,
          migratedFrom: 'localStorage',
          migrationDate: new Date().toISOString(),
        });
        migratedCount++;
      }

      // Update migration metadata
      this.config.blast.metadata.migrationVersion = '1.0';
      this.config.blast.metadata.lastMigration = new Date().toISOString();
      await this.saveConfig();

      console.log(`Successfully migrated ${migratedCount} BLAST databases from localStorage`);

      // Optionally clean up localStorage after successful migration
      if (migratedCount > 0) {
        localStorage.removeItem('blast_custom_databases');
        localStorage.removeItem('blast_custom_databases_backup');
        console.log('Cleaned up localStorage after successful migration');
      }

      return { success: true, migrated: migratedCount };
    } catch (error) {
      console.error('Error migrating BLAST databases from localStorage:', error);
      return { success: false, error: error.message };
    }
  }

  // Tab state management methods
  async getTabStates() {
    await this.waitForInitialization();
    return this.config.tabs?.states || {};
  }

  async setTabState(tabId, tabState) {
    await this.waitForInitialization();

    if (!this.config.tabs) {
      this.config.tabs = { states: {}, activeTabId: null, lastSessionTabs: [], restoreTabsOnStartup: true };
    }
    if (!this.config.tabs.states) {
      this.config.tabs.states = {};
    }

    // Add metadata
    tabState.lastSaved = new Date().toISOString();
    tabState.tabId = tabId;

    this.config.tabs.states[tabId] = tabState;

    // Update last session tabs list
    if (!this.config.tabs.lastSessionTabs.includes(tabId)) {
      this.config.tabs.lastSessionTabs.push(tabId);
    }

    // Limit stored tabs
    const maxTabs = this.config.ui?.tabSettings?.maxStoredTabs || 50;
    const allTabIds = Object.keys(this.config.tabs.states);
    if (allTabIds.length > maxTabs) {
      // Remove oldest tabs
      const sortedTabs = allTabIds.sort((a, b) => {
        const timeA = new Date(this.config.tabs.states[a].lastSaved || 0);
        const timeB = new Date(this.config.tabs.states[b].lastSaved || 0);
        return timeA - timeB;
      });

      const tabsToRemove = sortedTabs.slice(0, allTabIds.length - maxTabs);
      tabsToRemove.forEach(id => {
        delete this.config.tabs.states[id];
        const index = this.config.tabs.lastSessionTabs.indexOf(id);
        if (index > -1) {
          this.config.tabs.lastSessionTabs.splice(index, 1);
        }
      });
    }

    if (this.config.ui?.tabSettings?.autoSaveTabStates && this.debouncedSave) {
      this.debouncedSave();
    }

    console.log(`Tab state saved for: ${tabId}`);
  }

  async getTabState(tabId) {
    await this.waitForInitialization();
    return this.config.tabs?.states?.[tabId] || null;
  }

  async removeTabState(tabId) {
    await this.waitForInitialization();

    if (this.config.tabs?.states?.[tabId]) {
      delete this.config.tabs.states[tabId];

      // Remove from last session tabs
      const index = this.config.tabs.lastSessionTabs.indexOf(tabId);
      if (index > -1) {
        this.config.tabs.lastSessionTabs.splice(index, 1);
      }

      await this.saveConfig();
      console.log(`Tab state removed for: ${tabId}`);
      return true;
    }
    return false;
  }

  async setActiveTab(tabId) {
    await this.waitForInitialization();

    if (!this.config.tabs) {
      this.config.tabs = { states: {}, activeTabId: null, lastSessionTabs: [], restoreTabsOnStartup: true };
    }

    this.config.tabs.activeTabId = tabId;

    if (this.config.ui?.tabSettings?.autoSaveTabStates && this.debouncedSave) {
      this.debouncedSave();
    }
  }

  async getActiveTab() {
    await this.waitForInitialization();
    return this.config.tabs?.activeTabId || null;
  }

  async getLastSessionTabs() {
    await this.waitForInitialization();
    return this.config.tabs?.lastSessionTabs || [];
  }

  async clearTabStates() {
    await this.waitForInitialization();

    if (!this.config.tabs) {
      this.config.tabs = { states: {}, activeTabId: null, lastSessionTabs: [], restoreTabsOnStartup: true };
    }

    this.config.tabs.states = {};
    this.config.tabs.lastSessionTabs = [];
    this.config.tabs.activeTabId = null;

    await this.saveConfig();
    console.log('All tab states cleared');
  }

  async getTabSettings() {
    await this.waitForInitialization();
    return this.config.ui?.tabSettings || {};
  }

  async setTabSettings(settings) {
    await this.waitForInitialization();

    if (!this.config.ui.tabSettings) {
      this.config.ui.tabSettings = {};
    }

    this.config.ui.tabSettings = {
      ...this.config.ui.tabSettings,
      ...settings,
    };

    await this.saveConfig();
    console.log('Tab settings updated');
  }

  /**
   * Get search settings
   */
  getSearchSettings() {
    const defaultSettings = {
      caseSensitive: false,
      reverseComplement: false,
      partialMatches: true,
      searchGeneNames: true,
      searchSequence: true,
      searchFeatures: true,
      searchProtein: false,
      minLength: 3,
      maxResults: 100,
      timeout: 30,
      highlightMatches: true,
      showContext: true,
      contextLength: 50,
      saveHistory: true,
      historyLimit: 50,
    };

    return this.config?.search?.settings || defaultSettings;
  }

  /**
   * Set search settings
   */
  setSearchSettings(settings) {
    if (!this.config.search) {
      this.config.search = { settings: {}, history: [] };
    }

    this.config.search.settings = {
      ...this.config.search.settings,
      ...settings,
    };

    if (this.debouncedSave) {
      this.debouncedSave();
    }
    console.log('Search settings updated');
  }

  /**
   * Get search history
   */
  getSearchHistory() {
    return this.config?.search?.history || [];
  }

  /**
   * Add search to history
   */
  addSearchToHistory(searchTerm, settings = {}) {
    if (!this.config.search) {
      this.config.search = { settings: {}, history: [] };
    }

    const historyItem = {
      term: searchTerm,
      timestamp: new Date().toISOString(),
      settings: settings,
    };

    // Add to beginning of history
    this.config.search.history.unshift(historyItem);

    // Limit history size
    const maxHistory = this.config.search.settings?.historyLimit || 50;
    if (this.config.search.history.length > maxHistory) {
      this.config.search.history = this.config.search.history.slice(0, maxHistory);
    }

    if (this.debouncedSave) {
      this.debouncedSave();
    }
  }

  /**
   * Clear search history
   */
  clearSearchHistory() {
    if (this.config.search) {
      this.config.search.history = [];
      this.debouncedSave();
      console.log('Search history cleared');
    }
  }

  /**
   * Get modal settings
   */
  getModalSettings() {
    return this.config?.modalSettings || {};
  }

  /**
   * Set modal settings
   */
  setModalSettings(settings) {
    if (!this.config.modalSettings) {
      this.config.modalSettings = {};
    }

    this.config.modalSettings = {
      ...this.config.modalSettings,
      ...settings,
    };

    if (this.debouncedSave) {
      this.debouncedSave();
    }
    console.log('Modal settings updated');
  }
}
