/* global ActionManager, AdvancedSearchManager, AnnotationReviewManager, BaseCompositionAnalyzer, BenchmarkManager, BlastManager, BookmarkPanelUI, ChatManager, CheckpointManager, ConfigManager, EnhancedCitationDisplay, ExportManager, ExternalToolsManager, FileManager, GeneAttachmentsManager, GeneNotesManager, GeneralSettingsManager, GenomeNavigationBar, HighlightManager, HighlightRegionsUI, InternalMCPServer, LLMConfigManager, MCPBridge, ModalDragManager, MultiAgentSettingsManager, MultiFileManager, NavigationManager, NotificationService, PluginManagementUI, PrimerManager, PrimerBindingService, PrimerLibraryUI, ReadsManager, ResizableModalManager, ScreenshotManager, SequenceUtils, SidecarManager, TabManager, ThemeManager, TrackRenderer, UIManager, VERSION_INFO, WindowTabManager, ipcRenderer */
console.log('Executing src/renderer/renderer-modular.js');
// ipcRenderer is exposed globally by PluginManagementUI.js (window.ipcRenderer)
(typeof window !== 'undefined' && window.path) || {
  basename: filePath =>
    String(filePath || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .pop() || '',
};

// Toast notification helper — replaces alert() with non-blocking notifications
// Uses NotificationService if available, falls back to alert
const notify = (function () {
  let _ns = null;
  return function (message, type = 'warn') {
    if (!_ns && typeof NotificationService !== 'undefined') {
      _ns = new NotificationService();
      window._notificationService = _ns;
    }
    if (_ns) {
      _ns.toast(message, type);
    } else {
      // Fallback: use alert for critical messages only
      if (type === 'error') alert(message);
    }
  };
})();

// Force reload - timestamp: 2025-05-31 15:01

// Load Smart Execution System modules early
if (typeof window !== 'undefined') {
  // Load FunctionCallsOrganizer
  const loadFunctionCallsOrganizer = () => {
    return new Promise((resolve, reject) => {
      if (typeof FunctionCallsOrganizer !== 'undefined') {
        resolve();
        return;
      }
      // Check if script is already loading
      const existingScript = document.querySelector('script[src="modules/FunctionCallsOrganizer.js"]');
      if (existingScript) {
        existingScript.onload = resolve;
        return;
      }
      const script = document.createElement('script');
      script.src = 'modules/FunctionCallsOrganizer.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Load SmartExecutor
  const loadSmartExecutor = () => {
    return new Promise((resolve, reject) => {
      if (typeof SmartExecutor !== 'undefined') {
        resolve();
        return;
      }
      // Check if script is already loading
      const existingScript = document.querySelector('script[src="modules/SmartExecutor.js"]');
      if (existingScript) {
        existingScript.onload = resolve;
        return;
      }
      const script = document.createElement('script');
      script.src = 'modules/SmartExecutor.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Load ModalDragManager
  const loadModalDragManager = () => {
    return new Promise((resolve, reject) => {
      if (typeof ModalDragManager !== 'undefined') {
        resolve();
        return;
      }
      // Check if script is already loading
      const existingScript = document.querySelector('script[src="modules/ModalDragManager.js"]');
      if (existingScript) {
        existingScript.onload = resolve;
        return;
      }
      const script = document.createElement('script');
      script.src = 'modules/ModalDragManager.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Load ResizableModalManager
  const loadResizableModalManager = () => {
    return new Promise((resolve, reject) => {
      if (typeof ResizableModalManager !== 'undefined') {
        resolve();
        return;
      }
      // Check if script is already loading
      const existingScript = document.querySelector('script[src="modules/ResizableModalManager.js"]');
      if (existingScript) {
        existingScript.onload = resolve;
        return;
      }
      const script = document.createElement('script');
      script.src = 'modules/ResizableModalManager.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Load Plugin Function Calls Integrator
  const loadPluginFunctionCallsIntegrator = () => {
    return new Promise((resolve, reject) => {
      if (typeof PluginFunctionCallsIntegrator !== 'undefined') {
        resolve();
        return;
      }
      // Check if script is already loading
      const existingScript = document.querySelector('script[src="modules/PluginFunctionCallsIntegrator.js"]');
      if (existingScript) {
        existingScript.onload = resolve;
        return;
      }
      const script = document.createElement('script');
      script.src = 'modules/PluginFunctionCallsIntegrator.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Load GenomeStudioRPCHandler
  const loadGenomeStudioRPCHandler = () => {
    return new Promise((resolve, reject) => {
      if (typeof GenomeStudioRPCHandler !== 'undefined') {
        resolve();
        return;
      }
      // Check if script is already loading
      const existingScript = document.querySelector('script[src="modules/GenomeStudioRPCHandler.js"]');
      if (existingScript) {
        existingScript.onload = resolve;
        return;
      }
      const script = document.createElement('script');
      script.src = 'modules/GenomeStudioRPCHandler.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Load InternalMCPServer
  const loadInternalMCPServer = () => {
    return new Promise((resolve, reject) => {
      if (typeof InternalMCPServer !== 'undefined') {
        resolve();
        return;
      }
      // Check if script is already loading
      const existingScript = document.querySelector('script[src="modules/InternalMCPServer.js"]');
      if (existingScript) {
        existingScript.onload = resolve;
        return;
      }
      const script = document.createElement('script');
      script.src = 'modules/InternalMCPServer.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Load modules in sequence (without benchmark modules - they will be loaded on demand)
  loadFunctionCallsOrganizer()
    .then(() => loadPluginFunctionCallsIntegrator())
    .then(() => loadSmartExecutor())
    .then(() => loadModalDragManager())
    .then(() => loadResizableModalManager())
    .then(() => loadGenomeStudioRPCHandler())
    .then(() => loadInternalMCPServer())
    .then(() => {
      console.log('✅ Smart Execution System modules loaded successfully');
      // Initialize ModalDragManager and ResizableModalManager
      if (typeof ModalDragManager !== 'undefined') {
        window.modalDragManager = new ModalDragManager();
        // Auto-initialize management modals after DOM is ready
        setTimeout(() => {
          window.modalDragManager.initializeAllModals();
        }, 500);
      }

      if (typeof ResizableModalManager !== 'undefined') {
        window.resizableModalManager = new ResizableModalManager();
      }
    })
    .catch(error => {
      console.warn('⚠️ Failed to load Smart Execution System modules:', error);
    });
}
/**
 * Main GenomeBrowser class - now modular and organized
 */
class GenomeBrowser {
  constructor() {
    // Initialize ConfigManager first
    this.configManager = new ConfigManager();

    // Initialize SidecarManager for per-file metadata (notes, attachments)
    this.sidecarManager = typeof SidecarManager !== 'undefined' ? new SidecarManager() : null;
    if (this.sidecarManager) {
      console.log('✅ SidecarManager initialized');
    }

    this.fileManager = new FileManager(this);
    this.trackRenderer = new TrackRenderer(this);
    this.navigationManager = new NavigationManager(this);
    // Positional region highlights: a persistent, per-tab overlay layer that is
    // independent of the single-slot sequence selection (see HighlightManager).
    if (typeof HighlightManager !== 'undefined') {
      this.highlightManager = new HighlightManager(this);
      window.highlightManager = this.highlightManager;
    }
    if (typeof HighlightRegionsUI !== 'undefined') {
      this.highlightsUI = new HighlightRegionsUI(this);
      window.highlightsUI = this.highlightsUI;
    }
    if (typeof BookmarkPanelUI !== 'undefined') {
      this.bookmarkPanelUI = new BookmarkPanelUI(this);
      window.bookmarkPanelUI = this.bookmarkPanelUI;
    }
    this.genomeNavigationBar = new GenomeNavigationBar(this);
    this.uiManager = new UIManager(this);
    this.sequenceUtils = new SequenceUtils(this);
    this.exportManager = new ExportManager(this);
    this.screenshotManager = new ScreenshotManager(this);
    this.readsManager = new ReadsManager(this); // Initialize reads manager
    this.trackStateManager = new TrackStateManager(this); // Add track state manager
    this.blastManager = new BlastManager(this); // Initialize BLAST manager
    this.multiFileManager = new MultiFileManager(this); // Initialize multi-file manager
    if (typeof BaseCompositionAnalyzer !== 'undefined') {
      this.baseCompositionAnalyzer = new BaseCompositionAnalyzer(this); // Read base composition at a coordinate
    }

    // Initialize citation system
    this.citationCollector = new Map();
    this.citationCounter = 0;

    // Initialize enhanced citation display (will be set up after DOM is ready)
    this.enhancedCitationDisplay = null;

    // Initialize Tab Management System (for multi-genome analysis) - delayed to ensure DOM is ready
    this.initializeTabManager();
    this.initializeWindowTabManager();

    // Initialize Internal MCP Server for direct communication with main process MCP server
    this.initializeInternalMCPServer();

    // Initialize Action Management System
    this.initializeActionSystem();

    // State
    this.currentChromosome = null;
    this.currentSequence = {};
    this.currentAnnotations = {};
    this.currentVariants = {};
    this.currentReads = {}; // Keep for backward compatibility, but will be managed by ReadsManager
    this.currentPosition = { start: 0, end: 1000 };
    this.loadedFiles = [];
    this.sequenceLength = 0;
    this.operons = [];
    this.loadedOperons = []; // User-loaded operon data
    this.mappedOperons = null; // Cache for mapped operons to avoid re-mapping on every view update
    this.operonMappingChromosome = null; // Track which chromosome operons are mapped to
    this.selectedGene = null;
    this.selectedPrimer = null;
    this.userDefinedFeatures = {};
    this.nextFeatureId = 1;
    this.sequenceSelection = { start: null, end: null, active: false };
    this.highlights = []; // Positional region highlights (per-tab, session-only)

    // Track visibility state
    this.trackVisibility = {
      genes: true,
      gc: true,
      variants: false,
      reads: false,
      proteins: false,
      primers: false,
      sequence: true, // Bottom sequence panel
      sequenceLine: false, // Single-line sequence track
      actions: false, // Add actions track
      wig: true, // Add WIG tracks visibility
    };

    // Feature type visibility
    this.featureVisibility = {
      genes: false,
      CDS: true,
      mRNA: true,
      tRNA: true,
      rRNA: true,
      promoter: true,
      terminator: true,
      regulatory: true,
      source: false, // Default: don't show source features
      misc_feature: true,
      repeat_region: true,
      bed_feature: true,
      other: true, // For comment, note, and unknown types
    };

    this.currentFile = null;
    this.loadedGenomePath = null;
    this.searchResults = [];
    this.currentSearchIndex = 0;

    // Visual settings
    this.viewMode = 'overview'; // 'overview' or 'detail'
    this.basePairsPerPixel = 10;
    this.minBasePairsPerPixel = 0.1;
    this.maxBasePairsPerPixel = 1000;
    this.ZOOM_SENSITIVITY = 0.1;

    this._cachedCharWidth = null; // Cache for character width measurement

    // Operon color assignment
    this.operonColors = [
      '#e74c3c',
      '#3498db',
      '#2ecc71',
      '#f39c12',
      '#9b59b6',
      '#e67e22',
      '#1abc9c',
      '#34495e',
      '#f1c40f',
      '#e91e63',
    ];
    this.operonColorIndex = 0;
    this.operonColorMap = new Map(); // Map operon names to colors

    // User-defined features storage
    this.currentSequenceSelection = null; // Track current sequence selection
    this.wigTrackOrder = []; // Stable order for WIG tracks
    this.annotationTracks = []; // List of additional annotation track instances (GFF/BED)

    // Initialize track visibility
    this.visibleTracks = new Set(['genes', 'gc', 'sequence']); // Default visible tracks (sequence = bottom panel, sequenceLine = single-line track)

    // Initialize gene filters (corresponds to featureVisibility)
    this.geneFilters = {
      genes: false,
      CDS: true,
      mRNA: true,
      tRNA: true,
      rRNA: true,
      promoter: true,
      terminator: true,
      regulatory: true,
      misc_feature: true,
      repeat_region: true,
      bed_feature: true,
      other: true,
      source: false, // Default: don't show source features
    };

    // Gene Details sidebar settings
    this.geneDetailSettings = {
      deepGeneResearchPrompt:
        'Please perform a Deep Gene Research of {geneName} gene in {organism}. After research is complete, please provide the downloadable URLs for the final research report and detailed research data (workflow, sources, metadata), and include a CodeXomics annotationProposal with conservative updates, literature evidence, confidence, EC/GO/KO/pathway terms, and source references for merging into the selected gene. If the Deep Gene Research tool is not available, please remind me to connect the Deep Gene Research Server.',
    };

    this.init();
  }

  /**
   * Helper function to get the first value from a qualifier (supports both single values and arrays)
   */
  getQualifierValue(qualifiers, key) {
    if (!qualifiers || !qualifiers[key]) return null;

    const value = qualifiers[key];
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : null;
    }
    return value;
  }

  /**
   * Helper function to get all values from a qualifier as an array
   */
  getAllQualifierValues(qualifiers, key) {
    if (!qualifiers || !qualifiers[key]) return [];

    const value = qualifiers[key];
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  }

  /**
   * Extract the Deep Gene Research provenance date from a GenBank /note value.
   * Curation notes applied by the research workflow end with a verbatim
   * "Annotation by Deep Gene Research on <Month D, YYYY>." clause; original
   * GenBank annotations do not. Returns the date string, or null for values
   * that were not added by Deep Gene Research.
   */
  getAnnotationNoteResearchDate(value) {
    const match = String(value).match(/Annotation by Deep Gene Research on ([A-Z][a-z]+ \d{1,2}, \d{4})\.\s*$/);
    return match ? match[1] : null;
  }

  /**
   * Split a Deep Gene Research /note value into the parts the sidebar renders
   * differently. A curated note is "<narrative> Supporting sources: L1. L2. …
   * Annotation by Deep Gene Research on <date>." — rendering the bibliography
   * inline turns it into a wall of citation chips glued together by full stops,
   * and the provenance sentence just repeats the source badge. Both clauses are
   * peeled off here so each can be presented on its own terms; the stored
   * qualifier (and therefore the GenBank export) is untouched.
   * @param {string} value - Raw /note qualifier value
   * @returns {{body: string, sources: Array<{type: string, id: string, label: string}>, provenanceDate: string|null}}
   */
  splitAnnotationNoteSections(value) {
    const result = { body: '', sources: [], provenanceDate: null };
    let text = String(value == null ? '' : value).trim();

    const provenanceMatch = text.match(/\s*Annotation by Deep Gene Research on ([A-Z][a-z]+ \d{1,2}, \d{4})\.$/);
    if (provenanceMatch) {
      result.provenanceDate = provenanceMatch[1];
      text = text.slice(0, provenanceMatch.index).trim();
    }

    const clauseMatch = text.match(/(?:^|\s)Supporting sources:\s*([\s\S]*)$/);
    if (clauseMatch) {
      const clause = clauseMatch[1];
      const labelPattern = /(?:PMID):\s*(\d{1,10})\.(?=\s|$)|(?:DOI):\s*(10\.\d{4,9}\/\S+?)\.(?=\s|$)/gi;
      const sources = [];
      let consumed = 0;
      let match = labelPattern.exec(clause);
      // Only take the clause apart when it is exactly the list of labels the
      // note contract produces. Anything else stays in the body so no curated
      // prose is lost to a parsing guess.
      while (match !== null && !clause.slice(consumed, match.index).trim()) {
        const type = match[1] ? 'PMID' : 'DOI';
        const id = match[1] || match[2];
        sources.push({ type, id, label: `${type}:${id}` });
        consumed = labelPattern.lastIndex;
        match = labelPattern.exec(clause);
      }
      if (match === null && sources.length > 0 && !clause.slice(consumed).trim()) {
        result.sources = sources;
        text = text.slice(0, clauseMatch.index).trim();
      }
    }

    result.body = text;
    return result;
  }

  /**
   * Render the annotation note body plus its bibliography footer.
   * @param {string} value - Raw /note qualifier value
   * @returns {string} HTML
   */
  renderAnnotationNoteBody(value) {
    const sections = this.splitAnnotationNoteSections(value);
    const bodyHtml = sections.body
      ? this.processUnifiedCitations(this.enhanceGeneAttributeWithLinks(sections.body))
      : '';
    let html = `<div class="gene-annotation-note-text">${bodyHtml}</div>`;
    if (sections.sources.length > 0) {
      html += this.renderAnnotationNoteSources(sections.sources);
    }
    return html;
  }

  /**
   * Render the "Supporting sources" bibliography as one compact row of numbered
   * citation chips that resolve against the unified reference list below.
   * @param {Array<{type: string, id: string, label: string}>} sources
   * @returns {string} HTML
   */
  renderAnnotationNoteSources(sources) {
    const escapeAttribute = text =>
      String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Numbers come from the shared collector, so sources already cited in the
    // narrative keep their number. The chips are then shown in ascending order
    // to read as a reference run rather than a shuffled list.
    const chips = sources
      .map(source => ({
        number: this.addUnifiedCitation(source.type, source.id, source.label),
        url: this.getCitationUrl(source.type, source.id),
        label: escapeAttribute(source.label),
      }))
      .sort((a, b) => a.number - b.number)
      .map(chip => {
        if (!chip.url) {
          return `<span class="pmid-link" title="${chip.label}"><sup>${chip.number}</sup></span>`;
        }
        return `<a href="${escapeAttribute(encodeURI(chip.url))}" target="_blank" class="pmid-link" title="${chip.label}"><sup>${chip.number}</sup></a>`;
      })
      .join('');

    // No stray indentation: the note body preserves whitespace, so a leading
    // newline here would render as a blank line above the footer.
    return `<div class="gene-annotation-note-sources"><span class="gene-annotation-note-sources-label">Supporting sources (${sources.length})</span><span class="gene-annotation-note-sources-list">${chips}</span></div>`;
  }

  init() {
    // Force reload timestamp: 2025-05-31-15:05
    console.log('🚀 GenomeBrowser initialization starting...');

    // Step 0: Initialize version information
    console.log('📋 Initializing version information...');
    this.initializeVersionInfo();

    // Step 1: Setup basic event listeners
    console.log('📝 Setting up event listeners...');
    this.setupEventListeners();
    this.uiManager.applySavedSidebarVisibility?.().catch(error => {
      console.error('❌ Failed to apply saved sidebar visibility:', error);
    });

    // Step 2: Setup feature filters
    console.log('🔧 Setting up feature filter listeners...');
    this.setupFeatureFilterListeners();

    // Step 3: Initialize user features
    console.log('👤 Initializing user features...');
    this.initializeUserFeatures();

    // Step 4: Initialize LLM configuration
    console.log('🤖 About to initialize LLMConfigManager...');
    try {
      this.llmConfigManager = new LLMConfigManager(this, this.configManager);
      console.log('✅ LLMConfigManager initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing LLMConfigManager:', error);
    }

    // Step 5: Initialize ChatManager
    console.log('💬 About to initialize ChatManager...');
    try {
      this.chatManager = new ChatManager(this, this.configManager);
      console.log('✅ ChatManager initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing ChatManager:', error);
    }

    console.log('🛡️ About to initialize AnnotationReviewManager...');
    try {
      if (typeof AnnotationReviewManager !== 'undefined') {
        this.annotationReviewManager = new AnnotationReviewManager(this);
        window.annotationReviewManager = this.annotationReviewManager;
        console.log('✅ AnnotationReviewManager initialized successfully');
      } else {
        this.annotationReviewManager = null;
        console.warn('⚠️ AnnotationReviewManager class not found');
      }
    } catch (error) {
      this.annotationReviewManager = null;
      console.error('❌ Error initializing AnnotationReviewManager:', error);
    }

    // Step 5.1: Benchmark System (will be loaded on demand when menu is accessed)
    console.log('🧪 Benchmark System will be loaded on demand...');
    this.benchmarkManager = null; // Initialize as null, will be created when needed
    this.benchmarkInitializationPromise = null;

    // Step 5.2: Initialize MultiAgentSettingsManager
    console.log('🤖 About to initialize MultiAgentSettingsManager...');
    try {
      this.multiAgentSettingsManager = new MultiAgentSettingsManager(this.configManager);
      window.multiAgentSettingsManager = this.multiAgentSettingsManager;
      console.log('✅ MultiAgentSettingsManager initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing MultiAgentSettingsManager:', error);
    }

    // Step 5.3: Initialize the Skills tab of the Agent Settings modal
    try {
      this.skillsSettingsManager = new SkillsSettingsManager(this.chatManager);
      window.skillsSettingsManager = this.skillsSettingsManager;
      console.log('✅ SkillsSettingsManager initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing SkillsSettingsManager:', error);
    }

    // Step 5.4: Inline model picker in the ChatBox composer
    try {
      this.chatModelSelector = new ChatModelSelector(this.chatManager);
      window.chatModelSelector = this.chatModelSelector;
      console.log('✅ ChatModelSelector initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing ChatModelSelector:', error);
    }

    // Step 5.5: Plugin Management UI and its development tools load on first use.
    this.pluginManagementUI = null;
    this.pluginManagementInitializationPromise = null;

    // Step 5.6: Initialize General Settings Manager
    console.log('⚙️ About to initialize GeneralSettingsManager...');
    try {
      this.generalSettingsManager = new GeneralSettingsManager(this.configManager);

      // Initialize ThemeManager first so GeneralSettingsManager can use it
      try {
        this.themeManager = new ThemeManager(this.configManager);
        window.themeManager = this.themeManager;
      } catch (tmError) {
        console.error('❌ Error creating ThemeManager:', tmError);
      }

      // Initialize ThemeManager then GeneralSettingsManager sequentially.
      // Both await ConfigManager.waitForInit() internally, ensuring config is loaded.
      // GeneralSettingsManager.applySettings() calls applyUIStyle() which needs ThemeManager ready.
      const initSequence = async () => {
        // 1. ThemeManager must be ready before GeneralSettingsManager applies UI style
        if (this.themeManager) {
          await this.themeManager.init();
          console.log('✅ ThemeManager initialized with style:', this.themeManager.getCurrentStyle());
        }

        // 2. GeneralSettingsManager loads settings and applies them (including UI style)
        await this.generalSettingsManager.init();
        console.log('✅ GeneralSettingsManager initialized successfully');

        // Initialize global dragging setting after settings are loaded
        this.globalDraggingEnabled = this.generalSettingsManager.getSettings().enableGlobalDragging !== false;
        this.setGlobalDragging(this.globalDraggingEnabled);

        // Initialize drag update behavior (both default OFF)
        if (this.navigationManager) {
          const loaded = this.generalSettingsManager.getSettings();
          this.navigationManager.setDragUpdateGeneFeatures(loaded.dragUpdateGeneFeatures === true);
          this.navigationManager.setDragRealtimeSequenceUpdate(loaded.dragRealtimeSequenceUpdate === true);
        }
      };

      initSequence().catch(error => {
        console.error('❌ Error in settings initialization sequence:', error);
        this.globalDraggingEnabled = true; // Default to true when settings can't be loaded
      });

      window.generalSettingsManager = this.generalSettingsManager; // Make globally available
    } catch (error) {
      console.error('❌ Error initializing GeneralSettingsManager:', error);
      this.globalDraggingEnabled = true; // Default to true when initialization fails
    }

    // Step 5.6.1: Load Gene Details Settings
    console.log('⚙️ Loading Gene Details settings...');
    this.loadGeneDetailSettings();

    // Step 5.6.2: Initialize Gene Attachments Manager
    console.log('📎 About to initialize GeneAttachmentsManager...');
    try {
      if (typeof GeneAttachmentsManager !== 'undefined') {
        this.geneAttachmentsManager = new GeneAttachmentsManager(this, this.configManager, this.sidecarManager);
        window.geneAttachmentsManager = this.geneAttachmentsManager;
        console.log('✅ GeneAttachmentsManager initialized successfully');
      } else {
        console.warn('⚠️ GeneAttachmentsManager class not found, will be loaded on demand');
        this.geneAttachmentsManager = null;
      }
    } catch (error) {
      console.error('❌ Error initializing GeneAttachmentsManager:', error);
      this.geneAttachmentsManager = null;
    }

    // Step 5.6.3: Initialize Gene Notes Manager
    console.log('📝 About to initialize GeneNotesManager...');
    try {
      if (typeof GeneNotesManager !== 'undefined') {
        this.geneNotesManager = new GeneNotesManager(this, this.configManager, this.sidecarManager);
        window.geneNotesManager = this.geneNotesManager;
        console.log('✅ GeneNotesManager initialized successfully');
      } else {
        console.warn('⚠️ GeneNotesManager class not found, will be loaded on demand');
        this.geneNotesManager = null;
      }
    } catch (error) {
      console.error('❌ Error initializing GeneNotesManager:', error);
      this.geneNotesManager = null;
    }

    // Step 5.6.4: Initialize Primer Manager
    console.log('🧬 About to initialize PrimerManager...');
    try {
      if (typeof PrimerManager !== 'undefined') {
        this.primerManager = new PrimerManager(this, this.configManager, this.sidecarManager);
        window.primerManager = this.primerManager;

        // Wire the real-time binding-site prediction engine. Primer binding sites
        // are predicted on demand (viewport-scoped, cached, worker-backed) rather
        // than stored — see PrimerBindingService.
        if (typeof PrimerBindingService !== 'undefined') {
          const savedStringency = this.configManager?.get('primers.stringency', null);
          this.primerBindingService = new PrimerBindingService(
            this,
            savedStringency ? { stringency: savedStringency } : {}
          );
          this.primerManager.setBindingService(this.primerBindingService);
          window.primerBindingService = this.primerBindingService;
          console.log('✅ PrimerBindingService wired for real-time prediction');
        }

        if (typeof PrimerLibraryUI !== 'undefined') {
          this.primerLibraryUI = new PrimerLibraryUI(this);
          window.primerLibraryUI = this.primerLibraryUI;
        }

        console.log('✅ PrimerManager initialized successfully');
      } else {
        console.warn('⚠️ PrimerManager class not found');
        this.primerManager = null;
      }
    } catch (error) {
      console.error('❌ Error initializing PrimerManager:', error);
      this.primerManager = null;
    }

    // Step 5.7: Initialize External Tools Manager
    console.log('🔧 About to initialize ExternalToolsManager...');
    try {
      this.externalToolsManager = new ExternalToolsManager(this);
      this.externalToolsManager
        .init()
        .then(() => {
          console.log('✅ ExternalToolsManager initialized successfully');
        })
        .catch(error => {
          console.error('❌ Error initializing ExternalToolsManager:', error);
        });

      window.externalToolsManager = this.externalToolsManager; // Make globally available
    } catch (error) {
      console.error('❌ Error initializing ExternalToolsManager:', error);
    }

    // Step 5.8: Initialize Advanced Search Manager
    console.log('🔍 About to initialize AdvancedSearchManager...');
    try {
      if (typeof AdvancedSearchManager !== 'undefined') {
        this.advancedSearchManager = new AdvancedSearchManager(this);
        window.advancedSearchManager = this.advancedSearchManager;
        console.log('✅ AdvancedSearchManager initialized successfully');
      } else {
        console.warn('⚠️ AdvancedSearchManager class not found');
        this.advancedSearchManager = null;
      }
    } catch (error) {
      console.error('❌ Error initializing AdvancedSearchManager:', error);
      this.advancedSearchManager = null;
    }

    // Step 5.9: Removed Conversation Evolution System (cleanup completed)

    // Add global tool validation function for debugging
    window.validateAllTools = () => {
      if (this.chatManager && this.chatManager.validateAllTools) {
        return this.chatManager.validateAllTools();
      } else {
        console.warn('ChatManager or validateAllTools method not available');
        return null;
      }
    };

    // Step 6: Setup IPC communication
    console.log('📡 Setting up IPC communication...');
    this.setupIPC();
    this.updateStatus('Ready');

    // Step 7: Make globally available
    console.log('🌐 Making instance globally available...');
    window.genomeBrowser = this;
    window.genomeApp = this; // For compatibility with ChatManager
    window.app = this; // For benchmark system compatibility

    // Step 8: Initialize UI components
    console.log('🎨 Initializing UI components...');
    this.uiManager.initializeSplitter();
    this.uiManager.initializeHorizontalSplitter();

    // Step 9: Add resize listener
    console.log('📏 Adding window resize listener...');
    window.addEventListener('resize', () => {
      this.uiManager.handleWindowResize();
    });

    // Step 10: Final initialization steps
    console.log('🎉 CodeXomics initialized successfully!');

    // Initialize MCP server status check
    this.initializeMCPServerStatus();

    // Initialize Action Management System
    this.initializeActionSystem();
  }

  /**
   * Initialize version information display
   */
  initializeVersionInfo() {
    try {
      // Update version tag in header
      const versionTag = document.getElementById('version-tag');
      if (versionTag && typeof VERSION_INFO !== 'undefined') {
        versionTag.textContent = VERSION_INFO.displayVersion;
      }

      // Update version in about dialog
      const aboutVersion = document.getElementById('about-version');
      if (aboutVersion && typeof VERSION_INFO !== 'undefined') {
        aboutVersion.textContent = `Version ${VERSION_INFO.fullVersion}`;
      }

      // Update document title
      this.updateAppTitle();

      // Make version info globally available
      if (typeof VERSION_INFO !== 'undefined') {
        window.appVersion = VERSION_INFO;
        console.log(`✅ Version information initialized: ${VERSION_INFO.appTitle}`);
      } else {
        console.warn('⚠️ VERSION_INFO not available');
      }
    } catch (error) {
      console.error('❌ Error initializing version information:', error);
    }
  }

  /**
   * Update app title bar with the loaded genome file path
   */
  updateAppTitle() {
    if (typeof VERSION_INFO === 'undefined') return;

    let title = VERSION_INFO.appTitle;

    // Add windowId if available
    if (this.windowId) {
      title += ` [${this.windowId}]`;
    }

    // Add loaded genome path if available
    if (this.loadedGenomePath) {
      title += ` - ${this.loadedGenomePath}`;
    }

    document.title = title;
    console.log(`📋 Updated document title to: ${title}`);
  }

  /**
   * Initialize Action Management System
   */
  initializeInternalMCPServer() {
    // Initialize Internal MCP Server for direct communication with main process MCP server
    setTimeout(() => {
      try {
        if (typeof InternalMCPServer !== 'undefined') {
          this.internalMCPServer = new InternalMCPServer();

          // Initialize with this Genome Studio instance
          this.internalMCPServer.initialize(this);

          // Start the internal server
          this.internalMCPServer.start();

          window.internalMCPServer = this.internalMCPServer; // Keep for debugging
          console.log('✅ Internal MCP Server initialized and started');

          // Initialize MCPBridge for auto-connect to standalone MCP server
          this.initializeMCPBridge();
        } else {
          console.warn('⚠️ InternalMCPServer class not available');
        }
      } catch (error) {
        console.error('❌ Failed to initialize Internal MCP Server:', error);
      }
    }, 200); // Small delay to ensure modules are ready
  }

  /**
   * Initialize MCPBridge for auto-connection to standalone MCP server
   * This enables CodeXomics to receive tool execution requests from external AI agents
   */
  initializeMCPBridge() {
    try {
      // Restore persisted toggle state; default to true (on) if never set
      const mcpBridgeEnabled = this.configManager ? this.configManager.get('mcpBridgeEnabled', true) : true;

      if (typeof MCPBridge !== 'undefined') {
        this.mcpBridge = new MCPBridge({ windowId: this.windowId });
        this.mcpBridge.setInternalMCPServer(this.internalMCPServer);

        // Sync toggle state with persisted setting
        const toggle = document.getElementById('mcpServerToggle');
        if (toggle) {
          toggle.checked = mcpBridgeEnabled;
        }

        // Only start the bridge if it was previously enabled
        if (mcpBridgeEnabled) {
          window.mcpBridge = this.mcpBridge;
          this.startMCPBridgeWithAvailabilityCheck('initialized');
        } else {
          window.mcpBridge = this.mcpBridge;
          console.log('✅ MCPBridge initialized but not started (was disabled last session)');
        }

        this.updateMCPBridgeUI(mcpBridgeEnabled && this.mcpBridge.isConnected());
      } else {
        // MCPBridge module not loaded, load it dynamically
        const script = document.createElement('script');
        script.src = 'modules/MCPBridge.js';
        script.onload = () => {
          if (typeof MCPBridge !== 'undefined') {
            this.mcpBridge = new MCPBridge({ windowId: this.windowId });
            this.mcpBridge.setInternalMCPServer(this.internalMCPServer);
            window.mcpBridge = this.mcpBridge;

            // Sync toggle state with persisted setting
            const toggle = document.getElementById('mcpServerToggle');
            if (toggle) {
              toggle.checked = mcpBridgeEnabled;
            }

            if (mcpBridgeEnabled) {
              this.startMCPBridgeWithAvailabilityCheck('loaded');
            } else {
              console.log('✅ MCPBridge loaded but not started (was disabled last session)');
            }

            this.updateMCPBridgeUI(mcpBridgeEnabled && this.mcpBridge.isConnected());
          }
        };
        script.onerror = error => {
          console.warn('⚠️ MCPBridge module not available:', error);
        };
        document.head.appendChild(script);
      }
    } catch (error) {
      console.error('❌ Failed to initialize MCPBridge:', error);
    }
  }

  async startMCPBridgeWithAvailabilityCheck(loadState = 'initialized') {
    if (!this.mcpBridge) return;

    // If a genome was already loaded before the bridge starts/connects, seed it so
    // list_genome_windows reflects the loaded genome instead of "No genome loaded".
    if (this.currentGenomeName && !this.mcpBridge.currentGenomeName) {
      this.mcpBridge.currentGenomeName = this.currentGenomeName;
    }

    let wsPort = 3003;

    try {
      const serverStatus =
        typeof ipcRenderer !== 'undefined' ? await ipcRenderer.invoke('mcp-server-status') : { isRunning: false };
      if (serverStatus?.isRunning && serverStatus.serverType === 'unified-claude-mcp') {
        this.mcpBridge.stop();
        this.updateMCPBridgeUI(false);
        console.log(`✅ In-process MCP server is running; renderer WebSocket bridge is not required`);
        return;
      }

      const settings =
        typeof ipcRenderer !== 'undefined' ? await ipcRenderer.invoke('mcp-server-get-settings') : { wsPort: 3003 };
      wsPort = settings?.wsPort || 3003;
      this.mcpBridge.wsUrl = `ws://localhost:${wsPort}`;

      const portStatus =
        typeof ipcRenderer !== 'undefined'
          ? await ipcRenderer.invoke('mcp-server-check-port', wsPort)
          : { available: true };

      this.mcpBridge.start();
      this.updateMCPBridgeUI(this.mcpBridge.isConnected());

      if (portStatus.available) {
        console.log(`✅ MCPBridge ${loadState} and retrying until MCP WebSocket port ${wsPort} starts listening`);
        return;
      }

      console.log(`✅ MCPBridge ${loadState} and started (MCP WebSocket port ${wsPort} is listening)`);
    } catch (error) {
      this.mcpBridge.wsUrl = `ws://localhost:${wsPort}`;
      this.mcpBridge.start();
      this.updateMCPBridgeUI(this.mcpBridge.isConnected());
      console.warn('⚠️ MCPBridge availability check failed; bridge will keep retrying:', error.message);
    }
  }

  /**
   * Initialize Tab Management System with DOM ready check
   */
  initializeTabManager() {
    // Use a timeout to ensure DOM is fully ready
    setTimeout(() => {
      try {
        // Check if DOM elements exist before initializing
        const tabContainer = document.getElementById('tabContainer');
        const newTabButton = document.getElementById('newTabButton');
        const tabSettingsButton = document.getElementById('tabSettingsButton');

        if (!tabContainer || !newTabButton || !tabSettingsButton) {
          console.warn('⚠️ Tab UI elements not found, retrying TabManager initialization...');
          // Retry after another delay
          setTimeout(() => this.initializeTabManager(), 500);
          return;
        }

        // Initialize TabManager
        this.tabManager = new TabManager(this);
        console.log('✅ TabManager initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize TabManager:', error);
        // Retry once more
        setTimeout(() => this.initializeTabManager(), 1000);
      }
    }, 100); // Initial delay to ensure DOM is ready
  }

  initializeWindowTabManager() {
    if (this.windowTabManager) return;
    if (new URLSearchParams(window.location.search || '').get('workspaceView') === '1') return;

    try {
      if (typeof WindowTabManager !== 'undefined') {
        this.windowTabManager = new WindowTabManager(this);
        window.windowTabManager = this.windowTabManager;
        this.syncWindowTabIdentity();
        console.log('✅ WindowTabManager initialized successfully');
      }
    } catch (error) {
      console.error('❌ Failed to initialize WindowTabManager:', error);
    }
  }

  async syncWindowTabIdentity() {
    try {
      const windowId = window.electronAPI?.getWindowId ? await window.electronAPI.getWindowId() : null;
      if (!windowId) return;

      this.windowId = windowId;
      if (this.mcpBridge) {
        this.mcpBridge.setWindowId(windowId);
      }
      this.updateAppTitle();
      if (this.windowTabManager) {
        this.windowTabManager.setWindowId(windowId);
      }
    } catch (error) {
      console.warn('⚠️ Failed to resolve windowId for window tabs:', error.message);
    }
  }

  initializeActionSystem() {
    // Initialize Action Manager and Checkpoint Manager after DOM is ready
    setTimeout(() => {
      try {
        if (typeof ActionManager !== 'undefined') {
          this.actionManager = new ActionManager(this);
          window.actionManager = this.actionManager; // Keep for backward compatibility
          console.log('✅ ActionManager initialized');
        } else {
          console.warn('⚠️ ActionManager class not available');
        }

        if (typeof CheckpointManager !== 'undefined') {
          this.checkpointManager = new CheckpointManager(this);
          window.checkpointManager = this.checkpointManager; // Keep for backward compatibility
          console.log('✅ CheckpointManager initialized');
        } else {
          console.warn('⚠️ CheckpointManager class not available');
        }

        // Action system initialized - menu items handled by main menu
      } catch (error) {
        console.error('❌ Error initializing Action Management System:', error);
      }
    }, 500);
  }

  /**
   * Load and initialize Benchmark System on demand
   */
  async initializeBenchmarkSystemOnDemand() {
    if (this.benchmarkManager && this.benchmarkManager.isInitialized) {
      console.log('🧪 Benchmark System already initialized');
      return this.benchmarkManager;
    }
    if (this.benchmarkInitializationPromise) {
      return this.benchmarkInitializationPromise;
    }

    console.log('🧪 Loading Benchmark System on demand...');

    this.benchmarkInitializationPromise = (async () => {
      try {
        await this.loadBenchmarkModules();

        if (typeof BenchmarkManager === 'undefined') {
          throw new Error('BenchmarkManager class not available after loading modules');
        }

        this.benchmarkManager = new BenchmarkManager(this, this.chatManager, this.configManager);
        window.benchmarkManager = this.benchmarkManager;
        await this.benchmarkManager.initializationPromise;
        console.log('✅ Benchmark System loaded and initialized successfully');
        return this.benchmarkManager;
      } catch (error) {
        this.benchmarkManager = null;
        console.error('❌ Failed to load Benchmark System on demand:', error);
        throw error;
      } finally {
        this.benchmarkInitializationPromise = null;
      }
    })();

    return this.benchmarkInitializationPromise;
  }

  /**
   * Load Benchmark System modules on demand
   */
  async loadBenchmarkModules() {
    const modules = [
      'modules/BenchmarkStatistics.js',
      'modules/BenchmarkReportGenerator.js',
      'modules/benchmark-suites/BenchmarkEvaluatorBase.js',
      'modules/benchmark-suites/StrictAutomaticEvaluator.js',
      'modules/benchmark-suites/AutomaticComplexSuite.js',
      'modules/benchmark-suites/AutomaticSimpleSuite.js',
      'modules/benchmark-suites/ManualComplexSuite.js',
      'modules/benchmark-suites/ManualSuite.js',
      'modules/LLMBenchmarkFramework.js',
      'modules/BenchmarkUI.js',
      'modules/BenchmarkManager.js',
    ];

    console.log('📦 Loading benchmark modules...');

    for (const modulePath of modules) {
      if (document.querySelector(`script[src="${modulePath}"]`)) continue;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = modulePath;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${modulePath}`));
        document.head.appendChild(script);
      });
    }

    console.log('✅ Benchmark modules loaded');
  }

  setupEventListeners() {
    // Main banner dropdowns
    document.getElementById('optionsBtn').addEventListener('click', () => this.uiManager.toggleOptionsDropdown());
    document.getElementById('openFileBtn').addEventListener('click', () => this.uiManager.toggleFileDropdown());
    document
      .getElementById('openGenomeBtn')
      .addEventListener('click', () => this.fileManager.openSpecificFileType('genome'));
    // Annotation file action handler: single entry that asks merge vs. new track when a genome is loaded
    document.getElementById('openAnnotationBtn').addEventListener('click', () => {
      this.uiManager.openAnnotationFileWithChoice();
    });
    document
      .getElementById('openVariantBtn')
      .addEventListener('click', () => this.fileManager.openSpecificFileType('variant'));
    document
      .getElementById('openReadsBtn')
      .addEventListener('click', () => this.fileManager.openSpecificFileType('reads'));
    document
      .getElementById('openWIGBtn')
      .addEventListener('click', () => this.fileManager.openSpecificFileType('tracks'));
    document
      .getElementById('openOperonBtn')
      .addEventListener('click', () => this.fileManager.openSpecificFileType('operon'));
    document
      .getElementById('openBlastBtn')
      .addEventListener('click', () => this.fileManager.openSpecificFileType('blast'));
    document.getElementById('openAnyBtn').addEventListener('click', () => this.fileManager.openSpecificFileType('any'));

    // Export operations - dropdown menu
    document.getElementById('exportFileBtn').addEventListener('click', () => this.uiManager.toggleExportDropdown());
    document.getElementById('exportFastaBtn').addEventListener('click', () => this.exportManager.exportAsFasta());
    document.getElementById('exportGenbankBtn').addEventListener('click', () => this.exportManager.exportAsGenBank());
    document.getElementById('exportCDSFastaBtn').addEventListener('click', () => this.exportManager.exportCDSAsFasta());

    // MCP Bridge control (connection to standalone MCP server)
    const mcpServerToggle = document.getElementById('mcpServerToggle');
    if (mcpServerToggle) {
      mcpServerToggle.addEventListener('change', () => this.toggleMCPBridge());
    }

    // MCP Server start/stop button control
    const mcpServerBtn = document.getElementById('mcpServerBtn');
    if (mcpServerBtn) {
      mcpServerBtn.addEventListener('click', () => this.toggleLocalMCPServer());
    }

    // Listen for MCP Bridge status changes
    window.addEventListener('mcp-bridge-status', e => {
      this.updateMCPBridgeUI(e.detail.connected);
    });
    document
      .getElementById('exportProteinFastaBtn')
      .addEventListener('click', () => this.exportManager.exportProteinAsFasta());
    document.getElementById('exportGFFBtn').addEventListener('click', () => this.exportManager.exportAsGFF());
    document.getElementById('exportBEDBtn').addEventListener('click', () => this.exportManager.exportAsBED());
    document
      .getElementById('exportCurrentViewBtn')
      .addEventListener('click', () => this.exportManager.exportCurrentViewAsFasta());
    document.getElementById('captureFullScreenshotBtn').addEventListener('click', () => {
      this.uiManager.closeExportDropdown();
      this.screenshotManager.captureFullApplicationScreenshot();
    });
    document.getElementById('captureTracksScreenshotBtn').addEventListener('click', () => {
      this.uiManager.closeExportDropdown();
      this.screenshotManager.captureTracksScreenshot();
    });
    // Export configuration button with error handling - use setTimeout to ensure DOM is ready
    setTimeout(() => {
      const exportConfigBtn = document.getElementById('exportConfigBtn');
      if (exportConfigBtn) {
        exportConfigBtn.addEventListener('click', e => {
          console.log('🔧 Export Config button clicked');
          e.preventDefault();
          e.stopPropagation();
          try {
            // Close the export dropdown first
            this.uiManager.closeExportDropdown();

            this.exportManager.showExportConfigDialog();
          } catch (error) {
            console.error('Error opening export config dialog:', error);
            this.showNotification('Error opening export configuration', 'error');
          }
        });
        console.log('✓ Export Config button listener added');
      } else {
        console.warn('✗ Export Config button not found - will retry');
        // Retry after another delay
        setTimeout(() => {
          const retryBtn = document.getElementById('exportConfigBtn');
          if (retryBtn) {
            retryBtn.addEventListener('click', e => {
              console.log('🔧 Export Config button clicked (retry)');
              e.preventDefault();
              e.stopPropagation();
              this.uiManager.closeExportDropdown();
              this.exportManager.showExportConfigDialog();
            });
            console.log('✓ Export Config button listener added (retry)');
          } else {
            console.error('❌ Export Config button still not found after retry');
          }
        }, 1000);
      }
    }, 100);

    // Welcome screen buttons
    document
      .getElementById('welcomeOpenGenomeBtn')
      .addEventListener('click', () => this.fileManager.openSpecificFileType('genome'));
    document
      .getElementById('welcomeOpenAnnotationBtn')
      .addEventListener('click', () => this.uiManager.openAnnotationFileWithChoice());
    document
      .getElementById('welcomeOpenVariantBtn')
      .addEventListener('click', () => this.fileManager.openSpecificFileType('variant'));
    document
      .getElementById('welcomeOpenReadsBtn')
      .addEventListener('click', () => this.fileManager.openSpecificFileType('reads'));

    // Welcome screen drag & drop zone
    this.setupWelcomeDropZone();

    // Close dropdown when clicking outside
    document.addEventListener('click', e => {
      if (!e.target.closest('.file-menu-container')) {
        this.uiManager.closeFileDropdown();
        this.uiManager.closeExportDropdown();
      }

      // Auto-hide toggle panels when clicking outside
      if (!e.target.closest('#toggleTracks') && !e.target.closest('#trackCheckboxes')) {
        this.uiManager.hideTracksPanel();
      }

      if (!e.target.closest('#toggleFeatureFilters') && !e.target.closest('#featureFilterCheckboxes')) {
        this.uiManager.hideFeatureFiltersPanel();
      }
    });

    // Search functionality
    document.getElementById('searchBtn').addEventListener('click', () => this.navigationManager.quickSearch());
    document.getElementById('searchInput').addEventListener('keypress', e => {
      if (e.key === 'Enter') this.navigationManager.quickSearch();
    });

    // Advanced Search button
    const advancedSearchBtn = document.getElementById('advancedSearchBtn');
    if (advancedSearchBtn) {
      advancedSearchBtn.addEventListener('click', () => {
        if (this.advancedSearchManager) {
          this.advancedSearchManager.showModal();
        } else {
          console.warn('AdvancedSearchManager not initialized');
        }
      });
    }

    // Position navigation
    document.getElementById('goToBtn').addEventListener('click', () => this.navigationManager.goToPosition());
    document.getElementById('positionInput').addEventListener('keypress', e => {
      if (e.key === 'Enter') this.navigationManager.goToPosition();
    });

    // Navigation controls (sidebar)
    document.getElementById('prevBtn').addEventListener('click', () => this.navigationManager.navigatePrevious());
    document.getElementById('nextBtn').addEventListener('click', () => this.navigationManager.navigateNext());

    // Navigation controls (genome view)
    document.getElementById('prevBtnGenome').addEventListener('click', () => this.navigationManager.navigatePrevious());
    document.getElementById('nextBtnGenome').addEventListener('click', () => this.navigationManager.navigateNext());

    // Navigation controls (toolbar)
    document.getElementById('goToStartBtn').addEventListener('click', () => this.navigationManager.navigateToStart());
    document.getElementById('pagePrevBtn').addEventListener('click', () => this.navigationManager.navigatePrevious());
    document.getElementById('pageNextBtn').addEventListener('click', () => this.navigationManager.navigateNext());
    document.getElementById('goToEndBtn').addEventListener('click', () => this.navigationManager.navigateToEnd());

    // Zoom controls
    document.getElementById('zoomInBtn').addEventListener('click', () => this.navigationManager.zoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => this.navigationManager.zoomOut());
    document.getElementById('resetZoomBtn').addEventListener('click', () => this.navigationManager.resetZoom());

    // Sequence controls
    // ✅ Copy button is now fully handled by ActionManager (see ActionManager.js line 188-191)
    // No duplicate listener needed here to avoid event conflicts
    // ❌ REMOVED: Copy is now handled by ActionManager
    // document.getElementById('copySequenceHeaderBtn').addEventListener('click', (e) => {
    //     e.stopImmediatePropagation();
    //     this.sequenceUtils.copySequence();
    // });
    document.getElementById('sequenceSettingsBtn').addEventListener('click', () => {
      if (this.trackRenderer) {
        this.trackRenderer.openTrackSettings('sequence');
      }
    });
    document.getElementById('toggleProteinSequenceBtn')?.addEventListener('click', () => {
      this.sequenceUtils.toggleSequenceTrackSetting('showProteinSequence');
    });
    document.getElementById('togglePrimerSequenceBtn')?.addEventListener('click', () => {
      this.sequenceUtils.toggleSequenceTrackSetting('showPrimers');
    });
    document.getElementById('toggleComplementaryStrandBtn')?.addEventListener('click', () => {
      this.sequenceUtils.toggleSequenceTrackSetting('showComplementary');
    });
    document.getElementById('toggleSequenceCopyFormatBtn')?.addEventListener('click', () => {
      this.sequenceUtils.toggleSequenceCopyFormat();
    });
    document.getElementById('toggleSequenceCollapseBtn')?.addEventListener('click', () => {
      this.sequenceUtils.toggleSequenceTrackCollapse();
    });

    // Add click event for selected sequences (both gene and manual)
    document.addEventListener('click', e => {
      if (e.target.classList.contains('gene-sequence-selected')) {
        // Provide visual feedback that the sequence is ready to copy
        if (this.sequenceSelection && this.sequenceSelection.active && this.sequenceSelection.source === 'gene') {
          this.showSelectionFeedback();
        } else {
          // Manual selection feedback
          this.showNotification('Sequence is selected. Click "Copy" button to copy.', 'info');
        }
      }
    });

    // Update copy button state when text selection changes
    document.addEventListener('selectionchange', () => {
      // Debounce to avoid too frequent updates
      clearTimeout(this.selectionChangeTimeout);
      this.selectionChangeTimeout = setTimeout(() => {
        this.updateCopyButtonState();
      }, 100);
    });

    // Modal controls
    this.uiManager.setupModalControls();

    // Chromosome selection
    document.getElementById('chromosomeSelect').addEventListener('change', e => {
      this.sequenceUtils.selectChromosome(e.target.value);
    });

    // Track selection (toolbar checkbox container - using delegation)
    const trackCheckboxes = document.getElementById('trackCheckboxes');
    if (trackCheckboxes) {
      trackCheckboxes.addEventListener('change', e => {
        if (e.target.type === 'checkbox') {
          this.updateVisibleTracks();
        }
      });
    }

    // Sidebar track controls (using delegation for dynamic instances)
    const sidebarTrackControls = document.getElementById('sidebarTrackControls');
    if (sidebarTrackControls) {
      sidebarTrackControls.addEventListener('change', e => {
        if (e.target.type === 'checkbox') {
          this.updateVisibleTracksFromSidebar();
        }
      });
    }
    // Panel close buttons
    document.querySelectorAll('.close-panel-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const panelId = e.target.closest('.close-panel-btn').dataset.panel;
        this.uiManager.closePanel(panelId);
      });
    });

    // Feature filter toggle button
    document.getElementById('toggleFeatureFilters').addEventListener('click', () => {
      this.uiManager.toggleFeatureFilters();
    });

    // Setup feature filter event listeners
    this.setupFeatureFilterListeners();

    // Toggle buttons for toolbar sections
    document.getElementById('toggleTracks').addEventListener('click', () => {
      this.uiManager.toggleTracks();
    });

    // Sidebar toggle button (mac-style toggle)
    const toggleSidebarEl = document.getElementById('toggleSidebar');
    if (toggleSidebarEl) {
      toggleSidebarEl.addEventListener('change', () => {
        this.uiManager.toggleSidebar(true);
      });
    }

    // Splitter toggle button
    document.getElementById('splitterToggleBtn').addEventListener('click', () => {
      this.uiManager.toggleSidebarFromSplitter();
    });

    // MCP Settings modal
    document.getElementById('mcpSettingsBtn')?.addEventListener('click', () => this.showMCPSettingsModal());

    // General Settings modal
    document.getElementById('settingsBtn')?.addEventListener('click', () => this.showGeneralSettingsModal());

    // Debug Tools modal
    document.getElementById('debugToolsBtn')?.addEventListener('click', () => this.showDebugToolsModal());

    // Benchmark button
    document.getElementById('benchmarkBtn')?.addEventListener('click', () => this.openBenchmarkInterface());
  }

  showMCPSettingsModal() {
    const modal = document.getElementById('mcpSettingsModal');
    if (modal) {
      // Load current settings with proper fallback
      const defaultSettings = {
        allowAutoActivation: false, // NEW: Default to false (disabled)
        autoConnect: false,
        serverUrl: 'ws://localhost:3001',
        reconnectDelay: 5,
      };

      const mcpSettings = this.configManager ? this.configManager.get('mcpSettings', defaultSettings) : defaultSettings;

      // Populate modal fields
      document.getElementById('mcpAllowAutoActivation').checked = mcpSettings.allowAutoActivation;
      document.getElementById('mcpAutoConnect').checked = mcpSettings.autoConnect;
      document.getElementById('mcpServerUrl').value = mcpSettings.serverUrl;
      document.getElementById('mcpReconnectDelay').value = mcpSettings.reconnectDelay;

      // Populate new server management interface
      this.populateMCPServersList();
      this.populateMCPToolsList();

      // Update connection status
      this.updateMCPConnectionStatus();

      // Setup modal event listeners if not already done
      this.setupMCPModalListeners();

      // Reset drag position so modal re-centers on open
      if (window.modalDragManager) {
        window.modalDragManager.resetPosition('#mcpSettingsModal');
      }

      // Show modal
      modal.classList.add('show');
    }
  }

  showGeneralSettingsModal() {
    const modal = document.getElementById('generalSettingsModal');
    if (modal) {
      // Initialize GeneralSettingsManager if not already done
      if (this.generalSettingsManager) {
        console.log('🔄 [GeneralSettings] Loading settings and initializing tabs...');

        // Check if it's initialized, if not initialize it first
        if (!this.generalSettingsManager.isInitialized) {
          console.log('🔄 [GeneralSettings] Initializing GeneralSettingsManager...');
          this.generalSettingsManager
            .init()
            .then(() => {
              // Load current settings and update UI
              return this.generalSettingsManager.loadSettings();
            })
            .then(() => {
              // Initialize tabs properly after settings are loaded
              this.generalSettingsManager.initializeTabs();
            })
            .catch(error => {
              console.error('❌ [GeneralSettings] Error initializing or loading settings:', error);
              // Still try to initialize tabs even if settings loading fails
              this.generalSettingsManager.initializeTabs();
            });
        } else {
          // Load current settings and update UI
          this.generalSettingsManager
            .loadSettings()
            .then(() => {
              // Initialize tabs properly after settings are loaded
              this.generalSettingsManager.initializeTabs();
            })
            .catch(error => {
              console.error('❌ [GeneralSettings] Error loading settings:', error);
              // Still try to initialize tabs even if settings loading fails
              this.generalSettingsManager.initializeTabs();
            });
        }
      } else {
        console.warn('❌ [GeneralSettings] GeneralSettingsManager not available');
        // Try to create it on-demand
        try {
          this.generalSettingsManager = new GeneralSettingsManager(this.configManager);
          window.generalSettingsManager = this.generalSettingsManager;
          this.generalSettingsManager
            .init()
            .then(() => {
              console.log('✅ [GeneralSettings] GeneralSettingsManager initialized successfully');
              // Load current settings and update UI
              return this.generalSettingsManager.loadSettings();
            })
            .then(() => {
              // Initialize tabs properly after settings are loaded
              this.generalSettingsManager.initializeTabs();
            })
            .catch(error => {
              console.error('❌ [GeneralSettings] Error initializing or loading settings:', error);
              // Still try to initialize tabs even if settings loading fails
              this.generalSettingsManager.initializeTabs();
            });
        } catch (error) {
          console.error('❌ [GeneralSettings] Failed to create GeneralSettingsManager:', error);
        }
      }

      // Reset drag position so modal re-centers on open
      if (window.modalDragManager) {
        window.modalDragManager.resetPosition('#generalSettingsModal');
      }

      // Show modal
      modal.classList.add('show');
      console.log('✅ [GeneralSettings] Modal shown');
    } else {
      console.error('❌ [GeneralSettings] General Settings modal not found');
    }
  }

  showExternalToolsModal() {
    if (this.externalToolsManager) {
      console.log('🔄 [ExternalTools] Showing external tools configuration modal...');
      this.externalToolsManager.showConfigurationModal();
    } else {
      console.error('❌ [ExternalTools] ExternalToolsManager not available');
      try {
        this.externalToolsManager = new ExternalToolsManager(this);
        window.externalToolsManager = this.externalToolsManager;
        this.externalToolsManager
          .init()
          .then(() => {
            console.log('✅ [ExternalTools] ExternalToolsManager initialized successfully');
            this.externalToolsManager.showConfigurationModal();
          })
          .catch(error => {
            console.error('❌ [ExternalTools] Error initializing ExternalToolsManager:', error);
          });
      } catch (error) {
        console.error('❌ [ExternalTools] Failed to create ExternalToolsManager:', error);
      }
    }
  }

  showEnzymeBrowserModal() {
    this._showDatabaseBrowserModal('enzyme', 'Restriction Enzyme Browser', () => {
      const svc = this.chatManager?.services?.restriction;
      if (!svc || !svc.enzymeDb) return [];
      return svc.enzymeDb.getCommerciallyAvailable().map(e => ({
        id: e.name,
        name: e.name,
        subtitle: `${e.recognition} | ${e.overhangType} | ${e.overhangLength}bp overhang`,
        detail: e,
      }));
    });
  }

  showDNAMarkerBrowserModal() {
    this._showDatabaseBrowserModal('dnaMarker', 'DNA Marker / Ladder Browser', () => {
      const DbClass = window.DNAMarkerDatabase;
      if (!DbClass) return [];
      const db = new DbClass();
      return db.getAll().map(m => ({
        id: m.id,
        name: m.name,
        subtitle: `${m.brand} | ${m.sizes.length} bands | ${m.sizeRange[0].toLocaleString()}-${m.sizeRange[1].toLocaleString()} bp`,
        detail: m,
      }));
    });
  }

  _showDatabaseBrowserModal(type, title, dataLoader) {
    let modal = document.getElementById(`${type}BrowserModal`);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = `${type}BrowserModal`;
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; min-width: 500px;">
          <div class="modal-header">
            <h3><i class="fas fa-database"></i> ${title}</h3>
            <div class="modal-controls">
              <button class="modal-close" type="button">&times;</button>
            </div>
          </div>
          <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
            <div style="margin-bottom: 12px;">
              <input type="text" id="${type}BrowserSearch" class="input-full" placeholder="Search..." style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: var(--bg-secondary, #1e1e3a); color: var(--text-primary, #e0e0f0);">
            </div>
            <div id="${type}BrowserResults"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      if (window.modalDragManager) {
        window.modalDragManager.makeDraggable(`#${type}BrowserModal`);
      }

      modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.classList.remove('show');
      });

      const searchInput = modal.querySelector(`#${type}BrowserSearch`);
      searchInput.addEventListener('input', () => {
        this._populateDatabaseBrowserResults(type, dataLoader, searchInput.value);
      });
    }

    if (window.modalDragManager) {
      window.modalDragManager.resetPosition(`#${type}BrowserModal`);
    }

    this._populateDatabaseBrowserResults(type, dataLoader, '');
    modal.classList.add('show');

    const searchInput = modal.querySelector(`#${type}BrowserSearch`);
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  }

  _populateDatabaseBrowserResults(type, dataLoader, query) {
    const container = document.getElementById(`${type}BrowserResults`);
    if (!container) return;

    let items = dataLoader();
    if (query) {
      const q = query.toLowerCase();
      items = items.filter(
        item =>
          item.name.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q)
      );
    }

    if (items.length === 0) {
      container.innerHTML = `<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No items found${query ? ` for "${query}"` : ''}. Database may not be loaded.</p>`;
      return;
    }

    const rows = items
      .map(
        item => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <div>
          <div style="font-weight: 600; color: var(--text-primary, #e0e0f0); font-size: 13px;">${item.name}</div>
          <div style="color: var(--text-secondary, #8888aa); font-size: 11px;">${item.subtitle}</div>
        </div>
        <div style="color: var(--text-secondary, #666688); font-size: 10px; font-family: monospace;">${item.id}</div>
      </div>
    `
      )
      .join('');

    container.innerHTML = `<div style="margin-bottom: 8px; color: var(--text-secondary, #8888aa); font-size: 11px;">${items.length} item${items.length !== 1 ? 's' : ''} found</div>${rows}`;
  }

  showDebugToolsModal() {
    // Create debug tools modal if it doesn't exist
    let modal = document.getElementById('debugToolsModal');
    if (!modal) {
      modal = this.createDebugToolsModal();
      document.body.appendChild(modal);
    }

    // Show modal
    modal.classList.add('show');
  }

  createDebugToolsModal() {
    const modal = document.createElement('div');
    modal.id = 'debugToolsModal';
    modal.className = 'modal';
    modal.innerHTML = `
            <div class="modal-content debug-tools-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-bug"></i> Debug Tools</h2>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="debug-tools-grid">
                        <div class="debug-tool-card">
                            <div class="debug-tool-icon">
                                <i class="fas fa-chart-line"></i>
                            </div>
                            <h3>Performance Monitor</h3>
                            <p>Monitor system performance and memory usage</p>
                            <button class="btn btn-primary" onclick="window.genomeBrowser.openDebugTool('performance')">
                                Open Tool
                            </button>
                        </div>
                        
                        <div class="debug-tool-card">
                            <div class="debug-tool-icon">
                                <i class="fas fa-list"></i>
                            </div>
                            <h3>Console Logger</h3>
                            <p>Enhanced console logging and error tracking</p>
                            <button class="btn btn-primary" onclick="window.genomeBrowser.openDebugTool('console')">
                                Open Tool
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
            .debug-tools-modal {
                max-width: 800px;
                width: 90%;
            }
            
            .debug-tools-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 20px;
                margin-top: 20px;
                justify-content: center;
            }
            
            .debug-tool-card {
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                background: #f8f9fa;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            
            .debug-tool-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            
            .debug-tool-icon {
                font-size: 48px;
                color: #007bff;
                margin-bottom: 15px;
            }
            
            .debug-tool-card h3 {
                margin: 10px 0;
                color: #333;
            }
            
            .debug-tool-card p {
                color: #666;
                margin-bottom: 15px;
                font-size: 14px;
            }
            
            .debug-tool-card .btn {
                width: 100%;
            }
        `;
    document.head.appendChild(style);

    // Add event listeners
    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.classList.remove('show');
    });

    modal.addEventListener('click', e => {
      if (e.target.classList.contains('modal-close')) {
        modal.classList.remove('show');
      }
    });

    return modal;
  }

  async openBenchmarkInterface() {
    // Close any open options dropdown
    const optionsMenu = document.getElementById('optionsDropdownMenu');
    if (optionsMenu) {
      optionsMenu.classList.remove('show');
    }

    try {
      console.log('🧪 Opening Benchmark Interface...');

      // Initialize benchmark manager if not already done
      const benchmarkManager = await this.initializeBenchmarkSystemOnDemand();

      // Show the benchmark interface
      await benchmarkManager.showBenchmarkInterface();
    } catch (error) {
      console.error('❌ Failed to open benchmark interface:', error);
      notify('Failed to open benchmark interface. Please check the console for details.', 'error');
    }
  }

  async openDebugTool(toolType) {
    // Close the debug tools modal
    const modal = document.getElementById('debugToolsModal');
    if (modal) {
      modal.classList.remove('show');
    }

    // Handle built-in tools
    if (toolType === 'performance') {
      this.openPerformanceMonitor();
      return;
    }
    if (toolType === 'console') {
      this.openConsoleLogger();
      return;
    }

    // Unknown tool type
    console.error('Unknown debug tool:', toolType);
    notify('Unknown debug tool: ' + toolType, 'warn');
  }

  openPerformanceMonitor() {
    // Create a simple performance monitor
    console.log('🔧 Performance Monitor');
    console.log(
      'Memory Usage:',
      performance.memory
        ? {
            used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB',
            total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + ' MB',
            limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + ' MB',
          }
        : 'Not available'
    );

    // Show alert with basic performance info
    notify(
      `Performance Monitor\n\nMemory Usage: ${
        performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB' : 'Not available'
      }\n\nCheck console for detailed information.`,
      'info'
    );
  }

  openConsoleLogger() {
    // Enhanced console logging
    console.log('🔧 Enhanced Console Logger Activated');
    console.log('Current time:', new Date().toISOString());
    console.log('User agent:', navigator.userAgent);
    console.log('GenomeExplorer state:', {
      currentChromosome: this.currentChromosome,
      currentSequence: this.currentSequence ? 'Loaded' : 'Not loaded',
      trackRenderer: !!this.trackRenderer,
      readsManager: !!this.readsManager,
    });

    notify('Console Logger activated!\n\nCheck the browser console for detailed logging information.', 'info');
  }

  setupMCPModalListeners() {
    const modal = document.getElementById('mcpSettingsModal');
    if (!modal || modal.hasAttribute('data-listeners-setup')) return;

    modal.setAttribute('data-listeners-setup', 'true');

    // Save settings button
    document.getElementById('saveMCPSettingsBtn')?.addEventListener('click', () => {
      this.saveMCPSettings();
    });

    // Add Server button - NEW
    document.getElementById('addMcpServerBtn')?.addEventListener('click', () => {
      this.showAddServerModal();
    });

    // JSON Import/Export buttons
    document.getElementById('importJsonServersBtn')?.addEventListener('click', () => {
      this.showJsonImportModal();
    });

    document.getElementById('exportJsonServersBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleExportDropdown();
    });

    // Export dropdown options
    document.querySelectorAll('.export-option').forEach(option => {
      option.addEventListener('click', e => {
        e.stopPropagation();
        const format = e.currentTarget.dataset.format;
        this.exportJsonServers(format);
        this.hideExportDropdown();
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      this.hideExportDropdown();
    });

    // Legacy connect/disconnect buttons
    document.getElementById('mcpConnectBtn')?.addEventListener('click', () => {
      if (this.chatManager) {
        this.chatManager.setupMCPConnection();
      }
    });

    document.getElementById('mcpDisconnectBtn')?.addEventListener('click', () => {
      if (this.chatManager) {
        this.chatManager.disconnectMCP();
      }
    });

    // New server management buttons
    document.getElementById('mcpConnectAllBtn')?.addEventListener('click', () => {
      this.connectAllMCPServers();
    });

    document.getElementById('mcpDisconnectAllBtn')?.addEventListener('click', () => {
      this.disconnectAllMCPServers();
    });

    document.getElementById('mcpRefreshServersBtn')?.addEventListener('click', () => {
      this.populateMCPServersList();
      this.updateMCPConnectionStatus();
      this.populateMCPToolsList();
    });

    // JSON Import modal event listeners
    const jsonImportModal = document.getElementById('jsonImportModal');
    if (jsonImportModal) {
      // Tab switching
      document.getElementById('fileImportTab')?.addEventListener('click', () => {
        this.switchJsonImportTab('file');
      });

      document.getElementById('textImportTab')?.addEventListener('click', () => {
        this.switchJsonImportTab('text');
      });

      // File input change
      document.getElementById('jsonFileInput')?.addEventListener('change', e => {
        this.handleJsonFileSelect(e);
      });

      // Process import button
      document.getElementById('processImportBtn')?.addEventListener('click', () => {
        this.processJsonImport();
      });
    }

    // Add Server modal event listeners
    const addServerModal = document.getElementById('mcpServerEditModal');
    if (addServerModal) {
      // Save server button - add event listener
      document.getElementById('saveServerBtn')?.addEventListener('click', e => {
        e.preventDefault();
        const editingServerId = document.getElementById('editingServerId').value;
        this.saveServer(editingServerId || null);
      });

      // Test connection button
      document.getElementById('testServerConnectionBtn')?.addEventListener('click', () => {
        this.testMCPServerConnectionFromForm();
      });

      // Close modal handlers for add server modal
      addServerModal.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
          addServerModal.classList.remove('show');
        });
      });

      // Close modal only on close button click, not background
      addServerModal.addEventListener('click', e => {
        if (e.target.classList.contains('modal-close')) {
          addServerModal.classList.remove('show');
        }
      });
    }

    // Close modal handlers for main MCP settings modal
    modal.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.classList.remove('show');
      });
    });

    // Close modal when clicking outside
    modal.addEventListener('click', e => {
      if (e.target.classList.contains('modal-close')) {
        modal.classList.remove('show');
      }
    });

    // Listen for server status changes to update UI
    if (this.chatManager?.mcpServerManager) {
      this.chatManager.mcpServerManager.on('serverConnected', () => {
        this.populateMCPServersList();
        this.updateMCPConnectionStatus();
        this.populateMCPToolsList();
      });

      this.chatManager.mcpServerManager.on('serverDisconnected', () => {
        this.populateMCPServersList();
        this.updateMCPConnectionStatus();
        this.populateMCPToolsList();
      });

      this.chatManager.mcpServerManager.on('serverAdded', () => {
        this.populateMCPServersList();
        this.updateMCPConnectionStatus();
      });

      this.chatManager.mcpServerManager.on('serverRemoved', () => {
        this.populateMCPServersList();
        this.updateMCPConnectionStatus();
        this.populateMCPToolsList();
      });

      this.chatManager.mcpServerManager.on('toolsDiscovered', () => {
        this.populateMCPToolsList();
      });
    }
  }

  saveMCPSettings() {
    const mcpSettings = {
      allowAutoActivation: document.getElementById('mcpAllowAutoActivation').checked,
      autoConnect: document.getElementById('mcpAutoConnect').checked,
      serverUrl: document.getElementById('mcpServerUrl').value.trim(),
      reconnectDelay: parseInt(document.getElementById('mcpReconnectDelay').value) || 5,
    };

    // Validate settings
    if (!mcpSettings.serverUrl) {
      notify('Please enter a valid MCP server URL');
      return;
    }

    if (mcpSettings.reconnectDelay < 1 || mcpSettings.reconnectDelay > 60) {
      notify('Reconnection delay must be between 1 and 60 seconds');
      return;
    }

    // Save settings if configManager is available
    if (this.configManager) {
      this.configManager.set('mcpSettings', mcpSettings);
    } else {
      console.warn('ConfigManager not available, settings not saved');
    }

    // Close modal
    document.getElementById('mcpSettingsModal').classList.remove('show');

    // Show confirmation
    this.updateStatus('MCP settings saved successfully');

    // If auto-connect is now enabled and not currently connected, try to connect (only if auto-activation is allowed)
    if (
      mcpSettings.allowAutoActivation &&
      mcpSettings.autoConnect &&
      this.chatManager &&
      !this.chatManager.isConnected
    ) {
      this.chatManager.setupMCPConnection();
    }

    // If auto-connect is disabled and currently connected, disconnect
    if (!mcpSettings.autoConnect && this.chatManager && this.chatManager.isConnected) {
      this.chatManager.disconnectMCP();
    }
  }

  // JSON Import/Export Methods
  showJsonImportModal() {
    const modal = document.getElementById('jsonImportModal');
    if (!modal) return;

    // Reset form
    document.getElementById('jsonFileInput').value = '';
    document.getElementById('jsonTextInput').value = '';
    document.getElementById('overwriteExisting').checked = true;
    document.getElementById('validateBeforeImport').checked = true;

    // Hide status and results
    const statusDiv = document.getElementById('importStatus');
    const resultsDiv = document.getElementById('importResults');
    if (statusDiv) statusDiv.style.display = 'none';
    if (resultsDiv) resultsDiv.style.display = 'none';

    // Reset to file tab
    this.switchJsonImportTab('file');

    modal.classList.add('show');
  }

  switchJsonImportTab(tab) {
    const fileTab = document.getElementById('fileImportTab');
    const textTab = document.getElementById('textImportTab');
    const fileContent = document.getElementById('fileImportContent');
    const textContent = document.getElementById('textImportContent');

    if (tab === 'file') {
      fileTab?.classList.add('active');
      textTab?.classList.remove('active');
      fileContent?.classList.add('active');
      textContent?.classList.remove('active');
    } else {
      fileTab?.classList.remove('active');
      textTab?.classList.add('active');
      fileContent?.classList.remove('active');
      textContent?.classList.add('active');
    }
  }

  handleJsonFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const content = e.target.result;
        const jsonData = JSON.parse(content);

        // Show preview
        const previewDiv = document.getElementById('filePreview');
        const previewContent = document.getElementById('filePreviewContent');
        if (previewDiv && previewContent) {
          previewDiv.style.display = 'block';
          previewContent.textContent = JSON.stringify(jsonData, null, 2);
        }
      } catch (error) {
        console.error('Error reading JSON file:', error);
        this.showImportStatus('error', 'Invalid JSON file format');
      }
    };
    reader.readAsText(file);
  }

  async processJsonImport() {
    const fileInput = document.getElementById('jsonFileInput');
    const textInput = document.getElementById('jsonTextInput');
    const fileTab = document.getElementById('fileImportTab');
    const isFileMode = fileTab?.classList.contains('active');

    let jsonData;

    try {
      if (isFileMode) {
        const file = fileInput.files[0];
        if (!file) {
          this.showImportStatus('error', 'Please select a JSON file');
          return;
        }

        const content = await this.readFileAsText(file);
        jsonData = JSON.parse(content);
      } else {
        const text = textInput.value.trim();
        if (!text) {
          this.showImportStatus('error', 'Please enter JSON configuration');
          return;
        }

        jsonData = JSON.parse(text);
      }

      // Validate JSON structure
      const validationResult = this.validateJsonImport(jsonData);
      if (!validationResult.valid) {
        this.showImportStatus('error', `Validation failed: ${validationResult.error}`);
        return;
      }

      // Process import based on format
      const importResult = await this.importJsonServers(jsonData, validationResult.format);
      this.showImportResults(importResult);
    } catch (error) {
      console.error('Error processing JSON import:', error);
      this.showImportStatus('error', `Error processing JSON: ${error.message}`);
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = e => reject(e);
      reader.readAsText(file);
    });
  }

  validateJsonImport(jsonData) {
    // Check if it's an object
    if (typeof jsonData !== 'object' || jsonData === null) {
      return { valid: false, error: 'JSON must be an object' };
    }

    // Check for new format: mcpServers object
    if (jsonData.mcpServers && typeof jsonData.mcpServers === 'object') {
      const serverNames = Object.keys(jsonData.mcpServers);
      if (serverNames.length === 0) {
        return { valid: false, error: 'mcpServers object is empty' };
      }

      // Validate each server in the object
      for (let i = 0; i < serverNames.length; i++) {
        const serverName = serverNames[i];
        const server = jsonData.mcpServers[serverName];
        const serverValidation = this.validateServerConfigV2(server, serverName, i);
        if (!serverValidation.valid) {
          return { valid: false, error: `Server "${serverName}": ${serverValidation.error}` };
        }
      }

      return { valid: true, format: 'mcpServers' };
    }

    // Check for legacy format: servers array
    if (Array.isArray(jsonData.servers)) {
      if (jsonData.servers.length === 0) {
        return { valid: false, error: 'servers array is empty' };
      }

      // Validate each server
      for (let i = 0; i < jsonData.servers.length; i++) {
        const server = jsonData.servers[i];
        const serverValidation = this.validateServerConfig(server, i);
        if (!serverValidation.valid) {
          return { valid: false, error: `Server ${i + 1}: ${serverValidation.error}` };
        }
      }

      return { valid: true, format: 'servers' };
    }

    // Check for servers object format (similar to mcpServers but with "servers" key)
    if (jsonData.servers && typeof jsonData.servers === 'object' && !Array.isArray(jsonData.servers)) {
      const serverNames = Object.keys(jsonData.servers);
      if (serverNames.length === 0) {
        return { valid: false, error: 'servers object is empty' };
      }

      // Validate each server in the object
      for (let i = 0; i < serverNames.length; i++) {
        const serverName = serverNames[i];
        const server = jsonData.servers[serverName];
        const serverValidation = this.validateServerConfigV2(server, serverName, i);
        if (!serverValidation.valid) {
          return { valid: false, error: `Server "${serverName}": ${serverValidation.error}` };
        }
      }

      return { valid: true, format: 'serversObject' };
    }

    return { valid: false, error: 'JSON must contain "mcpServers" object, "servers" array, or "servers" object' };
  }

  validateServerConfig(server, index) {
    if (typeof server !== 'object' || server === null) {
      return { valid: false, error: 'Server must be an object' };
    }

    // Required fields
    const requiredFields = ['name', 'url'];
    for (const field of requiredFields) {
      if (!server[field] || typeof server[field] !== 'string') {
        return { valid: false, error: `Missing or invalid required field: ${field}` };
      }
    }

    // Validate URL format
    if (!this.isValidUrl(server.url)) {
      return { valid: false, error: 'Invalid URL format' };
    }

    // Validate optional fields
    if (server.enabled !== undefined && typeof server.enabled !== 'boolean') {
      return { valid: false, error: 'enabled must be a boolean' };
    }

    if (server.autoConnect !== undefined && typeof server.autoConnect !== 'boolean') {
      return { valid: false, error: 'autoConnect must be a boolean' };
    }

    if (
      server.reconnectDelay !== undefined &&
      (typeof server.reconnectDelay !== 'number' || server.reconnectDelay < 1 || server.reconnectDelay > 60)
    ) {
      return { valid: false, error: 'reconnectDelay must be a number between 1 and 60' };
    }

    if (server.capabilities !== undefined && !Array.isArray(server.capabilities)) {
      return { valid: false, error: 'capabilities must be an array' };
    }

    return { valid: true };
  }

  validateServerConfigV2(server, serverName, index) {
    if (typeof server !== 'object' || server === null) {
      return { valid: false, error: 'Server must be an object' };
    }

    // Required fields for new format
    const requiredFields = ['url'];
    for (const field of requiredFields) {
      if (!server[field] || typeof server[field] !== 'string') {
        return { valid: false, error: `Missing or invalid required field: ${field}` };
      }
    }

    // Validate URL format
    if (!this.isValidUrl(server.url)) {
      return { valid: false, error: 'Invalid URL format' };
    }

    // Validate transportType if present
    if (server.transportType !== undefined) {
      const validTransportTypes = ['websocket', 'streamable-http', 'http', 'https', 'sse', 'server-sent-events'];
      if (!validTransportTypes.includes(server.transportType)) {
        return { valid: false, error: `Invalid transportType. Must be one of: ${validTransportTypes.join(', ')}` };
      }
    }

    // Validate timeout if present
    if (
      server.timeout !== undefined &&
      (typeof server.timeout !== 'number' || server.timeout < 1 || server.timeout > 3600)
    ) {
      return { valid: false, error: 'timeout must be a number between 1 and 3600 seconds' };
    }

    // Validate headers if present
    if (
      server.headers !== undefined &&
      (typeof server.headers !== 'object' || server.headers === null || Array.isArray(server.headers))
    ) {
      return { valid: false, error: 'headers must be an object' };
    }

    // Validate other optional fields
    if (server.enabled !== undefined && typeof server.enabled !== 'boolean') {
      return { valid: false, error: 'enabled must be a boolean' };
    }

    if (server.autoConnect !== undefined && typeof server.autoConnect !== 'boolean') {
      return { valid: false, error: 'autoConnect must be a boolean' };
    }

    if (
      server.reconnectDelay !== undefined &&
      (typeof server.reconnectDelay !== 'number' || server.reconnectDelay < 1 || server.reconnectDelay > 60)
    ) {
      return { valid: false, error: 'reconnectDelay must be a number between 1 and 60' };
    }

    if (server.capabilities !== undefined && !Array.isArray(server.capabilities)) {
      return { valid: false, error: 'capabilities must be an array' };
    }

    return { valid: true };
  }

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  convertToWebSocketUrl(url) {
    if (!url) return url;

    try {
      const urlObj = new URL(url);

      // If it's already a WebSocket URL, return as is
      if (urlObj.protocol === 'ws:' || urlObj.protocol === 'wss:') {
        return url;
      }

      // Convert HTTP/HTTPS to WebSocket
      if (urlObj.protocol === 'http:') {
        return `ws://${urlObj.host}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      } else if (urlObj.protocol === 'https:') {
        return `wss://${urlObj.host}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      }

      // For other protocols, try to convert to WebSocket
      // Common MCP server patterns
      if (url.includes('/api/mcp')) {
        // Convert http://localhost:3000/api/mcp to ws://localhost:3000/api/mcp
        return url.replace(/^https?:\/\//, 'ws://');
      }

      // Default: assume it should be WebSocket
      return url.startsWith('ws') ? url : `ws://${url}`;
    } catch (error) {
      console.warn('Failed to convert URL to WebSocket:', url, error);
      // If conversion fails, try to make it a WebSocket URL
      if (url.startsWith('http://')) {
        return url.replace('http://', 'ws://');
      } else if (url.startsWith('https://')) {
        return url.replace('https://', 'wss://');
      } else if (!url.startsWith('ws')) {
        return `ws://${url}`;
      }
      return url;
    }
  }

  convertUrlBasedOnTransport(url, transportType) {
    if (!url) return url;

    // If transport type is WebSocket, convert to WebSocket URL
    if (transportType === 'websocket') {
      return this.convertToWebSocketUrl(url);
    }

    // For HTTP-based transports, ensure URL has correct protocol
    if (transportType === 'streamable-http' || transportType === 'http') {
      if (url.startsWith('ws://') || url.startsWith('wss://')) {
        // Convert WebSocket URL to HTTP
        if (url.startsWith('ws://')) {
          return url.replace('ws://', 'http://');
        } else if (url.startsWith('wss://')) {
          return url.replace('wss://', 'https://');
        }
      } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // Add http:// if no protocol specified
        return `http://${url}`;
      }
      return url;
    }

    if (transportType === 'https') {
      if (url.startsWith('ws://') || url.startsWith('http://')) {
        return url.replace(/^(ws|http):\/\//, 'https://');
      } else if (!url.startsWith('https://')) {
        return `https://${url}`;
      }
      return url;
    }

    // For unknown transport types, return as is
    return url;
  }

  async importJsonServers(jsonData, format = 'servers') {
    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) {
      return { success: false, error: 'MCP Server Manager not available' };
    }

    const results = {
      success: true,
      imported: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    const overwriteExisting = document.getElementById('overwriteExisting').checked;

    let serversToImport = [];

    if (format === 'mcpServers') {
      // Convert mcpServers object format to array
      serversToImport = Object.entries(jsonData.mcpServers).map(([serverName, serverConfig]) => {
        const transportType = serverConfig.transportType || 'websocket';
        return {
          name: serverName,
          url: this.convertUrlBasedOnTransport(serverConfig.url, transportType),
          description: serverConfig.description || '',
          category: serverConfig.category || 'general',
          enabled: serverConfig.enabled !== false,
          autoConnect: serverConfig.autoConnect !== false,
          reconnectDelay: serverConfig.reconnectDelay || 5,
          capabilities: serverConfig.capabilities || [],
          protocol: transportType,
          headers: serverConfig.headers || {},
          timeout: serverConfig.timeout || 30,
        };
      });
    } else if (format === 'serversObject') {
      // Convert servers object format to array
      serversToImport = Object.entries(jsonData.servers).map(([serverName, serverConfig]) => {
        const transportType = serverConfig.transportType || 'websocket';
        return {
          name: serverName,
          url: this.convertUrlBasedOnTransport(serverConfig.url, transportType),
          description: serverConfig.description || '',
          category: serverConfig.category || 'general',
          enabled: serverConfig.enabled !== false,
          autoConnect: serverConfig.autoConnect !== false,
          reconnectDelay: serverConfig.reconnectDelay || 5,
          capabilities: serverConfig.capabilities || [],
          protocol: transportType,
          headers: serverConfig.headers || {},
          timeout: serverConfig.timeout || 30,
        };
      });
    } else {
      // Use existing servers array format
      serversToImport = jsonData.servers.map(server => ({
        ...server,
        url: this.convertUrlBasedOnTransport(server.url, server.protocol || 'websocket'),
      }));
    }

    for (const serverConfig of serversToImport) {
      try {
        // Check if server with same name already exists
        const existingServers = Array.from(mcpManager.servers.values());
        const existingServer = existingServers.find(s => s.name === serverConfig.name);

        if (existingServer) {
          if (overwriteExisting) {
            // Remove existing server
            mcpManager.removeServer(existingServer.id);
            results.details.push({
              name: serverConfig.name,
              status: 'overwritten',
              message: 'Overwritten existing server',
            });
          } else {
            results.skipped++;
            results.details.push({
              name: serverConfig.name,
              status: 'skipped',
              message: 'Server with same name already exists',
            });
            continue;
          }
        }

        // Add server
        const serverId = mcpManager.addServer(serverConfig);
        results.imported++;

        // Check if URL was converted
        const originalUrl = jsonData.servers
          ? Array.isArray(jsonData.servers)
            ? jsonData.servers.find(s => s.name === serverConfig.name)?.url
            : Object.values(jsonData.servers).find(s => s.name === serverConfig.name)?.url
          : jsonData.mcpServers
            ? Object.values(jsonData.mcpServers).find(s => s.name === serverConfig.name)?.url
            : null;

        const urlConverted = originalUrl && originalUrl !== serverConfig.url;
        const message = urlConverted
          ? `Successfully imported (URL converted: ${originalUrl} → ${serverConfig.url})`
          : 'Successfully imported';

        results.details.push({
          name: serverConfig.name,
          status: 'imported',
          message: message,
          serverId: serverId,
        });
      } catch (error) {
        results.errors++;
        results.success = false;
        results.details.push({
          name: serverConfig.name || 'Unknown',
          status: 'error',
          message: error.message,
        });
      }
    }

    // Refresh the UI
    this.populateMCPServersList();

    return results;
  }

  showImportStatus(type, message) {
    const statusDiv = document.getElementById('importStatus');
    const messageDiv = document.getElementById('importStatusMessage');
    const resultsDiv = document.getElementById('importResults');

    if (statusDiv && messageDiv) {
      statusDiv.className = `import-status ${type}`;
      statusDiv.style.display = 'block';
      messageDiv.textContent = message;
    }

    if (resultsDiv) {
      resultsDiv.style.display = 'none';
    }
  }

  showImportResults(results) {
    const statusDiv = document.getElementById('importStatus');
    const messageDiv = document.getElementById('importStatusMessage');
    const resultsDiv = document.getElementById('importResults');
    const resultsContent = document.getElementById('importResultsContent');

    if (statusDiv && messageDiv) {
      const statusType = results.success ? 'success' : 'warning';
      const message = `Import completed: ${results.imported} imported, ${results.skipped} skipped, ${results.errors} errors`;

      statusDiv.className = `import-status ${statusType}`;
      statusDiv.style.display = 'block';
      messageDiv.textContent = message;
    }

    if (resultsDiv && resultsContent) {
      resultsDiv.style.display = 'block';
      resultsContent.innerHTML = results.details
        .map(detail => {
          const statusClass = `result-${detail.status}`;
          return `<div class="result-item ${statusClass}">
                    <strong>${detail.name}</strong>: ${detail.message}
                </div>`;
        })
        .join('');
    }
  }

  exportJsonServers(format = 'mcpServers') {
    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) {
      notify('MCP Server Manager not available');
      return;
    }

    const servers = Array.from(mcpManager.servers.values());
    let exportData;

    if (format === 'mcpServers') {
      // New mcpServers object format
      const mcpServers = {};
      servers.forEach(server => {
        mcpServers[server.name] = {
          url: server.url,
          transportType:
            server.protocol === 'websocket'
              ? 'websocket'
              : server.protocol === 'http'
                ? 'streamable-http'
                : server.protocol || 'websocket',
          timeout: server.timeout || 30,
          headers: server.headers || {},
          description: server.description || '',
          category: server.category || 'general',
          enabled: server.enabled,
          autoConnect: server.autoConnect,
          reconnectDelay: server.reconnectDelay,
          capabilities: server.capabilities || [],
        };
      });

      exportData = {
        mcpServers: mcpServers,
      };
    } else {
      // Legacy servers array format
      exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        servers: servers.map(server => ({
          name: server.name,
          description: server.description,
          url: server.url,
          category: server.category,
          enabled: server.enabled,
          autoConnect: server.autoConnect,
          reconnectDelay: server.reconnectDelay,
          capabilities: server.capabilities,
          protocol: server.protocol,
          headers: server.headers,
        })),
      };
    }

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const formatSuffix = format === 'mcpServers' ? 'mcpServers' : 'servers';
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-servers-export-${formatSuffix}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  toggleExportDropdown() {
    const dropdown = document.getElementById('exportDropdownMenu');
    if (dropdown) {
      const isVisible = dropdown.style.display !== 'none';
      dropdown.style.display = isVisible ? 'none' : 'block';
    }
  }

  hideExportDropdown() {
    const dropdown = document.getElementById('exportDropdownMenu');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  }

  // External MCP Servers Methods
  populateMCPServersList() {
    const serversList = document.getElementById('mcpServersList');
    if (!serversList) return;

    // Get servers from MCPServerManager
    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) {
      serversList.innerHTML = '<div class="empty-state">MCPServerManager not available</div>';
      return;
    }

    const servers = mcpManager.getServerStatus(); // Use getServerStatus instead of getServers

    if (servers.length === 0) {
      serversList.innerHTML = '<div class="empty-state">No MCP servers configured</div>';
      return;
    }

    serversList.innerHTML = '';

    servers.forEach(server => {
      const serverItem = document.createElement('div');
      serverItem.className = 'server-item';
      serverItem.innerHTML = `
                <div class="server-info">
                    <div class="server-header">
                        <span class="server-name">${this.escapeHtml(server.name)}</span>
                        <div class="server-status ${server.connected ? 'connected' : 'disconnected'}">
                            ${server.connected ? '●' : '○'}
                        </div>
                    </div>
                    <div class="server-details">
                        <span class="server-url">${this.escapeHtml(server.url)}</span>
                        <span class="server-category">${this.escapeHtml(server.category || 'general')}</span>
                        ${server.connected ? `<span class="tool-count">${server.toolCount} tools</span>` : ''}
                    </div>
                </div>
                <div class="server-actions">
                    <button class="btn-small ${server.enabled ? 'btn-secondary' : 'btn-primary'}" 
                            onclick="genomeBrowser.toggleMCPServer('${server.id}')">
                        ${server.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn-small btn-secondary" 
                            onclick="genomeBrowser.editMCPServer('${server.id}')">
                        Edit
                    </button>
                    ${
                      !server.isBuiltin
                        ? `<button class="btn-small btn-danger" 
                            onclick="genomeBrowser.removeMCPServer('${server.id}')">
                        Remove
                    </button>`
                        : ''
                    }
                </div>
            `;
      serversList.appendChild(serverItem);
    });

    // Add "Add Server" button
    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary add-server-btn';
    addButton.textContent = '+ Add Server';
    addButton.onclick = () => this.showAddServerModal();
    serversList.appendChild(addButton);
  }

  populateMCPToolsList() {
    const toolsList = document.getElementById('mcpToolsList');
    if (!toolsList) return;

    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) {
      toolsList.innerHTML = '<div class="empty-state">MCPServerManager not available</div>';
      return;
    }

    const allTools = mcpManager.getAllAvailableTools(); // Use getAllAvailableTools instead of getAllTools

    if (allTools.length === 0) {
      toolsList.innerHTML = '<div class="empty-state">No tools available from connected servers</div>';
      return;
    }

    // Group tools by category
    const toolsByCategory = {};
    allTools.forEach(tool => {
      const category = tool.category || 'general';
      if (!toolsByCategory[category]) {
        toolsByCategory[category] = [];
      }
      toolsByCategory[category].push(tool);
    });

    toolsList.innerHTML = '';

    Object.entries(toolsByCategory).forEach(([category, tools]) => {
      const categorySection = document.createElement('div');
      categorySection.className = 'tools-category';
      categorySection.innerHTML = `
                <h4 class="category-title">${this.escapeHtml(category)}</h4>
                <div class="tools-list">
                    ${tools
                      .map(
                        tool => `
                        <div class="tool-item">
                            <div class="tool-info">
                                <span class="tool-name">${this.escapeHtml(tool.name)}</span>
                                <span class="tool-server">(${this.escapeHtml(tool.serverName)})</span>
                            </div>
                            <div class="tool-description">${this.escapeHtml(tool.description || 'No description')}</div>
                        </div>
                    `
                      )
                      .join('')}
                </div>
            `;
      toolsList.appendChild(categorySection);
    });
  }

  updateMCPConnectionStatus() {
    const statusTextElement = document.getElementById('mcpStatusText');
    const statusIconElement = document.getElementById('mcpStatusIcon');

    if (!statusTextElement || !statusIconElement) return;

    let statusText;
    let statusClass;

    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) {
      statusText = 'MCPServerManager not available';
      statusClass = 'fas fa-circle status-none';
    } else {
      const servers = mcpManager.getServerStatus(); // Use getServerStatus instead of getServers
      const connectedCount = servers.filter(s => s.connected).length;
      const totalCount = servers.length;

      if (totalCount === 0) {
        statusText = 'No servers configured';
        statusClass = 'fas fa-circle status-none';
      } else if (connectedCount === 0) {
        statusText = `0/${totalCount} servers connected`;
        statusClass = 'fas fa-circle status-disconnected';
      } else if (connectedCount === totalCount) {
        statusText = `All ${totalCount} servers connected`;
        statusClass = 'fas fa-circle status-connected';
      } else {
        statusText = `${connectedCount}/${totalCount} servers connected`;
        statusClass = 'fas fa-circle status-partial';
      }
    }

    statusTextElement.textContent = statusText;
    statusIconElement.className = statusClass;
  }

  showAddServerModal() {
    const modal = document.getElementById('mcpServerEditModal');
    if (!modal) return;

    // Clear form
    document.getElementById('serverName').value = '';
    document.getElementById('serverDescription').value = '';
    document.getElementById('serverUrl').value = '';
    document.getElementById('serverCategory').value = 'general';
    document.getElementById('serverEnabled').checked = true;
    document.getElementById('serverAutoConnect').checked = false;
    document.getElementById('serverApiKey').value = '';
    document.getElementById('serverReconnectDelay').value = '5';
    document.getElementById('serverCapabilities').value = '';
    document.getElementById('editingServerId').value = '';

    // Set modal title
    document.getElementById('mcpServerEditTitle').textContent = 'Add MCP Server';

    modal.classList.add('show');
  }

  editMCPServer(serverId) {
    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) return;

    const server = mcpManager.getServer(serverId);
    if (!server) return;

    const modal = document.getElementById('mcpServerEditModal');
    if (!modal) return;

    // Populate form with server data
    document.getElementById('serverName').value = server.name;
    document.getElementById('serverDescription').value = server.description || '';
    document.getElementById('serverUrl').value = server.url;
    document.getElementById('serverCategory').value = server.category || 'general';
    document.getElementById('serverEnabled').checked = server.enabled;
    document.getElementById('serverAutoConnect').checked = server.autoConnect;
    document.getElementById('serverApiKey').value = server.apiKey || '';
    document.getElementById('serverReconnectDelay').value = server.reconnectDelay || 5;
    document.getElementById('serverTimeout').value = server.timeout || 300;
    document.getElementById('serverCapabilities').value = server.capabilities ? server.capabilities.join(', ') : '';
    document.getElementById('editingServerId').value = serverId;

    // Set modal title
    document.getElementById('mcpServerEditTitle').textContent = 'Edit MCP Server';

    modal.classList.add('show');
  }

  saveServer(serverId = null) {
    const serverData = {
      name: document.getElementById('serverName').value.trim(),
      description: document.getElementById('serverDescription').value.trim(),
      url: document.getElementById('serverUrl').value.trim(),
      category: document.getElementById('serverCategory').value,
      enabled: document.getElementById('serverEnabled').checked,
      autoConnect: document.getElementById('serverAutoConnect').checked,
      apiKey: document.getElementById('serverApiKey').value.trim() || null,
      reconnectDelay: parseInt(document.getElementById('serverReconnectDelay').value) || 5,
      timeout: parseInt(document.getElementById('serverTimeout').value) || 300,
      capabilities: document
        .getElementById('serverCapabilities')
        .value.trim()
        .split(',')
        .map(c => c.trim())
        .filter(c => c),
    };

    // Validate
    if (!serverData.name) {
      notify('Please enter a server name');
      return;
    }
    if (!serverData.url) {
      notify('Please enter a server URL');
      return;
    }

    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) {
      notify('MCPServerManager not available');
      return;
    }

    try {
      if (serverId) {
        // Update existing server
        mcpManager.updateServer(serverId, serverData);
      } else {
        // Add new server
        mcpManager.addServer(serverData);
      }

      // Close modal
      document.getElementById('mcpServerEditModal').classList.remove('show');

      // Refresh server list
      this.populateMCPServersList();
      this.updateMCPConnectionStatus();

      this.updateStatus(serverId ? 'Server updated successfully' : 'Server added successfully');
    } catch (error) {
      notify(`Error saving server: ${error.message}`);
    }
  }

  toggleMCPServer(serverId) {
    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) return;

    const server = mcpManager.getServer(serverId);
    if (!server) return;

    try {
      mcpManager.updateServer(serverId, { enabled: !server.enabled });
      this.populateMCPServersList();
      this.updateMCPConnectionStatus();
      this.updateStatus(`Server ${server.enabled ? 'disabled' : 'enabled'}`);
    } catch (error) {
      notify(`Error toggling server: ${error.message}`);
    }
  }

  removeMCPServer(serverId) {
    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) return;

    const server = mcpManager.getServer(serverId);
    if (!server) return;

    if (confirm(`Are you sure you want to remove server "${server.name}"?`)) {
      try {
        mcpManager.removeServer(serverId);
        this.populateMCPServersList();
        this.updateMCPConnectionStatus();
        this.updateStatus('Server removed successfully');
      } catch (error) {
        notify(`Error removing server: ${error.message}`);
      }
    }
  }

  connectAllMCPServers() {
    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) return;

    mcpManager.connectAll();
    this.updateStatus('Connecting to all servers...');

    // Update UI after a short delay
    setTimeout(() => {
      this.populateMCPServersList();
      this.updateMCPConnectionStatus();
    }, 1000);
  }

  disconnectAllMCPServers() {
    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) return;

    mcpManager.disconnectAll();
    this.updateStatus('Disconnecting from all servers...');

    // Update UI immediately
    this.populateMCPServersList();
    this.updateMCPConnectionStatus();
  }

  testMCPServerConnection(serverId) {
    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) return;

    this.updateStatus('Testing connection...');
    mcpManager
      .testConnection(serverId)
      .then(result => {
        this.updateStatus(result.success ? 'Connection test successful' : `Connection test failed: ${result.error}`);
      })
      .catch(error => {
        this.updateStatus(`Connection test error: ${error.message}`);
      });
  }

  testMCPServerConnectionFromForm() {
    const testStatus = document.getElementById('testConnectionStatus');

    // Get form data
    const serverConfig = {
      name: document.getElementById('serverName').value.trim(),
      url: document.getElementById('serverUrl').value.trim(),
      apiKey: document.getElementById('serverApiKey').value.trim(),
    };

    if (!serverConfig.url) {
      if (testStatus) testStatus.textContent = 'Please enter a server URL';
      return;
    }

    // Auto-detect transport type from URL scheme
    let transportType = 'websocket';
    if (serverConfig.url.startsWith('http://') || serverConfig.url.startsWith('https://')) {
      transportType = 'http';
    } else if (serverConfig.url.startsWith('ws://') || serverConfig.url.startsWith('wss://')) {
      transportType = 'websocket';
    }

    serverConfig.transportType = transportType;

    if (testStatus) {
      testStatus.textContent = `Testing ${transportType.toUpperCase()} connection...`;
      testStatus.className = 'test-status testing';
    }

    const mcpManager = this.chatManager?.mcpServerManager;
    if (!mcpManager) {
      if (testStatus) {
        testStatus.textContent = 'MCPServerManager not available';
        testStatus.className = 'test-status error';
      }
      return;
    }

    mcpManager
      .testServerConnection(serverConfig)
      .then(result => {
        if (testStatus) {
          testStatus.textContent = `${transportType.toUpperCase()} connection successful!`;
          testStatus.className = 'test-status success';
        }
        this.updateStatus(`${transportType.toUpperCase()} connection test successful`);
      })
      .catch(error => {
        if (testStatus) {
          testStatus.textContent = `${transportType.toUpperCase()} connection failed: ${error.message}`;
          testStatus.className = 'test-status error';
        }
        this.updateStatus(`${transportType.toUpperCase()} connection test failed: ${error.message}`);
      });
  }

  // Helper method to escape HTML
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Set global dragging behavior for all tracks
  setGlobalDragging(enabled) {
    this.globalDraggingEnabled = enabled;
    console.log(`🎯 Global track dragging ${enabled ? 'enabled' : 'disabled'}`);

    // Notify NavigationManager about the setting change
    if (this.navigationManager) {
      this.navigationManager.setGlobalDragging(enabled);
    }
  }

  setupFeatureFilterListeners() {
    // Toolbar feature filter controls
    const toolbarFilters = [
      'showGenes',
      'showCDS',
      'showMRNA',
      'showTRNA',
      'showRRNA',
      'showPromoter',
      'showTerminator',
      'showRegulatory',
      'showSource',
      'showMiscFeature',
      'showRepeatRegion',
      'showBedFeature',
      'showOther',
    ];

    const sidebarFilters = [
      'sidebarShowGenes',
      'sidebarShowCDS',
      'sidebarShowMRNA',
      'sidebarShowTRNA',
      'sidebarShowRRNA',
      'sidebarShowPromoter',
      'sidebarShowTerminator',
      'sidebarShowRegulatory',
      'sidebarShowSource',
      'sidebarShowMiscFeature',
      'sidebarShowRepeatRegion',
      'sidebarShowBedFeature',
      'sidebarShowOther',
    ];

    // Map filter IDs to gene filter keys
    const filterMap = {
      showGenes: 'genes',
      showCDS: 'CDS',
      showMRNA: 'mRNA',
      showTRNA: 'tRNA',
      showRRNA: 'rRNA',
      showPromoter: 'promoter',
      showTerminator: 'terminator',
      showRegulatory: 'regulatory',
      showSource: 'source',
      showMiscFeature: 'misc_feature',
      showRepeatRegion: 'repeat_region',
      showBedFeature: 'bed_feature',
      showOther: 'other',
    };

    // Setup toolbar listeners
    toolbarFilters.forEach(filterId => {
      document.getElementById(filterId).addEventListener('change', e => {
        const filterKey = filterMap[filterId.replace('sidebar', '')];
        this.geneFilters[filterKey] = e.target.checked;
        this.featureVisibility[filterKey] = e.target.checked; // Keep in sync
        this.syncSidebarFeatureFilter(filterId.replace('show', 'sidebarShow'), e.target.checked);
        this.updateGeneDisplay();
        // Notify TabManager of filter change
        if (this.tabManager) {
          this.tabManager.onTrackSettingsChanged();
        }
      });
    });

    // Setup sidebar listeners
    sidebarFilters.forEach(filterId => {
      document.getElementById(filterId).addEventListener('change', e => {
        const filterKey = filterMap[filterId.replace('sidebar', '').replace('Show', 'show')];
        this.geneFilters[filterKey] = e.target.checked;
        this.featureVisibility[filterKey] = e.target.checked; // Keep in sync
        this.syncToolbarFeatureFilter(filterId.replace('sidebar', ''), e.target.checked);
        this.updateGeneDisplay();
        // Notify TabManager of filter change
        if (this.tabManager) {
          this.tabManager.onTrackSettingsChanged();
        }
      });
    });
  }

  setupIPC() {
    // Multi-window support: receive windowId from main process
    ipcRenderer.on('set-window-id', (event, windowId) => {
      this.windowId = windowId;
      console.log(`📋 [Window] Assigned windowId: ${windowId}`);
      // Pass windowId to MCPBridge if already initialized
      if (this.mcpBridge) {
        this.mcpBridge.setWindowId(windowId);
      }
      // Update document title to show windowId and loaded genome path
      this.updateAppTitle();
      this.initializeWindowTabManager();
      if (this.windowTabManager) {
        this.windowTabManager.setWindowId(windowId);
      }
    });

    // Listen for MCP Server status updates
    ipcRenderer.on('mcp-server-status-changed', () => {
      console.log('🔄 Received mcp-server-status-changed from main process');
      this.updateMCPServerStatus();
    });

    // Handle file opened from main process
    ipcRenderer.on('file-opened', (event, filePath) => {
      this.fileManager.loadFile(filePath);
    });

    // Handle menu actions
    ipcRenderer.on('show-search', () => {
      this.navigationManager.showSearchModal();
    });

    ipcRenderer.on('show-goto', () => {
      this.navigationManager.showGotoModal();
    });

    // Handle panel management
    ipcRenderer.on('show-panel', (event, panelId) => {
      this.uiManager.showPanel(panelId);
    });

    ipcRenderer.on('show-all-panels', () => {
      this.uiManager.showAllPanels();
    });

    // Handle plugin menu actions
    ipcRenderer.on('show-plugin-management', async () => {
      console.log('🧩 Plugin Management requested from main menu');
      const pluginManagementUI = await this.initializePluginManagementUI();
      if (pluginManagementUI) {
        pluginManagementUI.showPluginModal();
      }
    });

    ipcRenderer.on('show-plugin-marketplace', async () => {
      console.log('🛒 Plugin Marketplace requested from main menu');
      const pluginManagementUI = await this.initializePluginManagementUI();
      if (pluginManagementUI) {
        pluginManagementUI.openPluginMarketplace();
      }
    });

    ipcRenderer.on('show-smart-execution-demo', () => {
      // Feature removed - no longer available
    });

    // Handle Resource Manager
    ipcRenderer.on('open-resource-manager', () => {
      this.openResourceManager();
    });

    // Handle options menu actions from main menu
    ipcRenderer.on('configure-llms', () => {
      const configureLLMBtn = document.getElementById('configureLLMBtn');
      if (configureLLMBtn) {
        configureLLMBtn.click();
      }
    });

    ipcRenderer.on('configure-external-tools', () => {
      this.showExternalToolsModal();
    });

    ipcRenderer.on('open-enzyme-browser', () => {
      this.showEnzymeBrowserModal();
    });

    ipcRenderer.on('open-dna-marker-browser', () => {
      this.showDNAMarkerBrowserModal();
    });

    ipcRenderer.on('configure-search', () => {
      this.navigationManager.showSearchSettingsModal();
    });

    ipcRenderer.on('mcp-settings', () => {
      const mcpSettingsBtn = document.getElementById('mcpSettingsBtn');
      if (mcpSettingsBtn) {
        mcpSettingsBtn.click();
      }
    });

    ipcRenderer.on('multi-agent-settings', () => {
      console.log('🤖 Multi-Agent Settings requested from main menu');

      // Try multiple approaches to open multi-agent settings
      const multiAgentSettingsBtn = document.getElementById('multiAgentSettingsBtn');

      if (multiAgentSettingsBtn) {
        console.log('✅ Multi-Agent Settings button found, clicking...');
        multiAgentSettingsBtn.click();
      } else {
        console.warn('⚠️ Multi-Agent Settings button not found, trying direct approach...');

        // Try to show the modal directly if MultiAgentSettingsManager is available
        if (window.multiAgentSettingsManager) {
          console.log('✅ MultiAgentSettingsManager found globally, showing modal directly...');
          window.multiAgentSettingsManager.showModal();
        } else if (this.multiAgentSettingsManager) {
          console.log('✅ MultiAgentSettingsManager found on instance, showing modal directly...');
          this.multiAgentSettingsManager.showModal();
        } else {
          console.warn('⚠️ MultiAgentSettingsManager not yet initialized, retrying in 500ms...');
          setTimeout(() => {
            const retryBtn = document.getElementById('multiAgentSettingsBtn');
            if (retryBtn) {
              console.log('🔄 Retry: Multi-Agent Settings button found, clicking...');
              retryBtn.click();
            } else if (window.multiAgentSettingsManager) {
              console.log('🔄 Retry: Showing modal directly...');
              window.multiAgentSettingsManager.showModal();
            } else {
              // Fallback: show a simple notification
              if (window.genomeBrowser && window.genomeBrowser.showNotification) {
                window.genomeBrowser.showNotification(
                  'Agent Settings is still initializing. Please try again in a moment.',
                  'warning'
                );
              }
            }
          }, 500);
        }
      }
    });

    ipcRenderer.on('general-settings', () => {
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) {
        settingsBtn.click();
      }
    });

    // Handle ChatBox settings
    ipcRenderer.on('chatbox-settings', () => {
      console.log('📱 ChatBox Settings requested from main menu');
      // Dispatch event to trigger settings modal
      window.dispatchEvent(new CustomEvent('chatbox-settings'));
    });

    // Evolution interface is now handled as a separate window
    // No IPC handler needed - menu action creates new window directly

    // Handle Edit menu actions
    ipcRenderer.on('menu-copy', () => {
      this.handleMenuCopy();
    });

    ipcRenderer.on('menu-paste', () => {
      this.handleMenuPaste();
    });

    ipcRenderer.on('menu-select-all', () => {
      this.handleMenuSelectAll();
    });

    // Handle Action menu items
    ipcRenderer.on('action-copy-sequence', () => {
      if (window.actionManager) {
        window.actionManager.handleCopySequence();
      } else {
        this.showNotification('Action system not initialized', 'error');
      }
    });

    ipcRenderer.on('action-copy-reverse-complement-sequence', () => {
      if (this.sequenceUtils && this.currentSequence && Object.keys(this.currentSequence).length > 0) {
        this.sequenceUtils.copySequence({ reverseComplement: true });
      } else {
        this.showNotification('No sequence to copy', 'error');
      }
    });

    ipcRenderer.on('action-cut-sequence', () => {
      if (window.actionManager) {
        window.actionManager.handleCutSequence();
      } else {
        this.showNotification('Action system not initialized', 'error');
      }
    });

    ipcRenderer.on('action-paste-sequence', () => {
      if (window.actionManager) {
        window.actionManager.handlePasteSequence();
      } else {
        this.showNotification('Action system not initialized', 'error');
      }
    });

    ipcRenderer.on('action-paste-sequence-reverse', () => {
      if (window.actionManager) {
        window.actionManager.handlePasteSequence(true);
      } else {
        this.showNotification('Action system not initialized', 'error');
      }
    });

    ipcRenderer.on('action-delete-sequence', () => {
      if (window.actionManager) {
        window.actionManager.handleDeleteSequence();
      } else {
        this.showNotification('Action system not initialized', 'error');
      }
    });

    ipcRenderer.on('action-insert-sequence', () => {
      if (window.actionManager) {
        window.actionManager.handleInsertSequence();
      } else {
        this.showNotification('Action system not initialized', 'error');
      }
    });

    ipcRenderer.on('action-insert-sequence-reverse', () => {
      if (window.actionManager) {
        window.actionManager.handleInsertSequence(true);
      } else {
        this.showNotification('Action system not initialized', 'error');
      }
    });

    ipcRenderer.on('show-action-list', () => {
      if (window.actionManager) {
        window.actionManager.showActionList();
      } else {
        this.showNotification('Action system not initialized', 'error');
      }
    });

    ipcRenderer.on('execute-all-actions', () => {
      if (window.actionManager) {
        window.actionManager.executeAllActions();
      } else {
        this.showNotification('Action system not initialized', 'error');
      }
    });

    ipcRenderer.on('create-checkpoint', () => {
      if (window.checkpointManager) {
        window.checkpointManager.createManualCheckpoint();
      } else {
        this.showNotification('Checkpoint system not initialized', 'error');
      }
    });

    ipcRenderer.on('rollback-checkpoint', () => {
      if (window.checkpointManager) {
        window.checkpointManager.showCheckpointList();
      } else {
        this.showNotification('Checkpoint system not initialized', 'error');
      }
    });

    // Handle file status check from Project Manager
    ipcRenderer.on('check-file-status', () => {
      const hasOpenFile = this.currentFile !== null || this.loadedFiles.length > 0;
      ipcRenderer.send('main-window-status-response', hasOpenFile);
    });

    // Handle file loading from Project Manager
    ipcRenderer.on('load-file', (event, filePath) => {
      console.log('🎯 Main window received load-file event with path:', filePath);
      if (this.fileManager) {
        console.log('📂 Calling fileManager.loadFile with path:', filePath);
        this.fileManager.loadFile(filePath);
      } else {
        console.error('❌ FileManager not available in main window');
      }
    });

    // Handle project management from main menu
    ipcRenderer.on('open-project-file', (event, filePath) => {
      console.log('📂 Opening project file from main menu:', filePath);
      this.showNotification(`Opening project: ${filePath}`, 'info');
      // TODO: implement project-file opening logic
      // Here you can call ProjectManager's methods to load the project
    });

    ipcRenderer.on('save-current-project', async () => {
      console.log('💾 Save current project requested');
      try {
        // Open the project manager and trigger saving the current project
        const projectManagerWindow = await this.openProjectManagerWindow();
        if (projectManagerWindow && projectManagerWindow.projectManagerWindow) {
          await projectManagerWindow.projectManagerWindow.saveCurrentProjectAsXML();
        } else {
          this.showNotification('Please open Project Manager to save current project', 'warning');
        }
      } catch (error) {
        console.error('Error saving current project:', error);
        this.showNotification('Failed to save current project', 'error');
      }
    });

    ipcRenderer.on('save-project-as', async () => {
      console.log('💾 Save project as requested');
      try {
        // Open the project manager and trigger the Save As operation
        const projectManagerWindow = await this.openProjectManagerWindow();
        if (projectManagerWindow && projectManagerWindow.projectManagerWindow) {
          await projectManagerWindow.projectManagerWindow.saveCurrentProjectAsXML();
        } else {
          this.showNotification('Please open Project Manager to save project', 'warning');
        }
      } catch (error) {
        console.error('Error saving project as:', error);
        this.showNotification('Failed to save project', 'error');
      }
    });

    ipcRenderer.on('export-project-xml', async () => {
      console.log('📤 Export project as XML requested');
      try {
        // Open the project manager and trigger the XML export operation
        const projectManagerWindow = await this.openProjectManagerWindow();
        if (projectManagerWindow && projectManagerWindow.projectManagerWindow) {
          await projectManagerWindow.projectManagerWindow.saveCurrentProjectAsXML();
        } else {
          this.showNotification('Please open Project Manager to export project as XML', 'warning');
        }
      } catch (error) {
        console.error('Error exporting project as XML:', error);
        this.showNotification('Failed to export project as XML', 'error');
      }
    });

    ipcRenderer.on('open-recent-project', async (event, project) => {
      console.log('📂 Opening recent project:', project);
      try {
        // Check if the project file exists
        if (project.filePath) {
          // Open the project manager window if not already open
          const projectManagerWindow = await this.openProjectManagerWindow();

          if (projectManagerWindow && projectManagerWindow.projectManagerWindow) {
            // Load the project from the file
            await projectManagerWindow.projectManagerWindow.loadProjectFromFile(project.filePath);
            this.showNotification(`Opened project: ${project.name}`, 'success');
          } else {
            this.showNotification('Failed to open Project Manager window', 'error');
          }
        } else {
          this.showNotification('Project file path not found', 'warning');
        }
      } catch (error) {
        console.error('Error opening recent project:', error);
        this.showNotification(`Failed to open project: ${error.message}`, 'error');
      }
    });

    ipcRenderer.on('clear-recent-projects', async () => {
      console.log('🗑️ Clear recent projects requested');
      try {
        const projectManagerWindow = await this.openProjectManagerWindow();

        if (projectManagerWindow && projectManagerWindow.projectManagerWindow) {
          // Clear recent projects in ProjectManager
          projectManagerWindow.projectManagerWindow.clearRecentProjects();
          this.showNotification('Recent projects cleared', 'success');
        } else {
          this.showNotification('Failed to open Project Manager window', 'warning');
        }
      } catch (error) {
        console.error('Error clearing recent projects:', error);
        this.showNotification('Failed to clear recent projects', 'error');
      }
    });

    // Handle main menu Load File actions
    ipcRenderer.on('menu-load-genome', () => {
      this.fileManager.openSpecificFileType('genome');
    });
    ipcRenderer.on('menu-load-annotation-merge', () => {
      this.fileManager.openSpecificFileType('annotation', { mergeWithExisting: true });
    });
    ipcRenderer.on('menu-load-annotation-new', () => {
      this.fileManager.openSpecificFileType('annotation', { mergeWithExisting: false });
    });
    ipcRenderer.on('menu-load-variant', () => {
      this.fileManager.openSpecificFileType('variant');
    });
    ipcRenderer.on('menu-load-reads', () => {
      this.fileManager.openSpecificFileType('reads');
    });
    ipcRenderer.on('menu-load-wig', () => {
      this.fileManager.openSpecificFileType('tracks');
    });
    ipcRenderer.on('menu-load-operon', () => {
      this.fileManager.openSpecificFileType('operon');
    });
    ipcRenderer.on('menu-load-blast', () => {
      this.fileManager.openSpecificFileType('blast');
    });
    ipcRenderer.on('menu-load-any', () => {
      this.fileManager.openSpecificFileType('any');
    });

    // Handle main menu Export As actions
    ipcRenderer.on('menu-export-fasta', () => {
      this.exportManager.exportAsFasta();
    });
    ipcRenderer.on('menu-export-genbank', () => {
      this.exportManager.exportAsGenBank();
    });
    ipcRenderer.on('menu-export-cds', () => {
      this.exportManager.exportCDSAsFasta();
    });
    ipcRenderer.on('menu-export-protein', () => {
      this.exportManager.exportProteinAsFasta();
    });
    ipcRenderer.on('menu-export-gff', () => {
      this.exportManager.exportAsGFF();
    });
    ipcRenderer.on('menu-export-bed', () => {
      this.exportManager.exportAsBED();
    });
    ipcRenderer.on('menu-export-current-view', () => {
      this.exportManager.exportCurrentViewAsFasta();
    });
    ipcRenderer.on('menu-capture-full-screenshot', () => {
      this.screenshotManager.captureFullApplicationScreenshot();
    });
    ipcRenderer.on('menu-capture-tracks-screenshot', () => {
      this.screenshotManager.captureTracksScreenshot();
    });
    ipcRenderer.on('menu-export-configure', () => {
      this.exportManager.showExportConfigDialog();
    });

    // Handle MCP tool calls for action functions and utility functions
    ipcRenderer.on('mcp-tool-call', async (event, data) => {
      // InternalMCPServer is the authoritative handler whenever it is
      // available. Both listeners receive the same IPC event, so the legacy
      // fallback must not execute or respond in parallel.
      if (this.internalMCPServer) return;
      console.log('🔧 MCP tool call received:', {
        method: data?.method,
        parameterKeys: Object.keys(data?.parameters || {}).filter(
          key => !['approvalToken', '__executionContext'].includes(key)
        ),
      });

      try {
        const { requestId, method, parameters } = data;

        // Check if this is an action function call
        if (method && method.startsWith('action_')) {
          const actionFunctionName = method.substring(7); // Remove 'action_' prefix

          if (this.actionManager) {
            const result = await this.actionManager.executeActionFunction(actionFunctionName, parameters);

            // Send success response
            ipcRenderer.send('mcp-tool-response', {
              requestId,
              success: true,
              result,
            });
          } else {
            // Send error response
            ipcRenderer.send('mcp-tool-response', {
              requestId,
              success: false,
              error: 'ActionManager not available',
            });
          }
        } else if (method === 'codexomics_chat') {
          // Check if this is a codexomics_chat agent call
          try {
            const chatManager = window.genomeBrowser?.chatManager || window.chatManager;
            if (!chatManager) {
              throw new Error('ChatManager not available for agent mode');
            }

            const result = await chatManager.processAgentPrompt(parameters.prompt, {
              activateMultiAgent: parameters.activate_multi_agent || false,
              context: parameters.context || {},
            });

            ipcRenderer.send('mcp-tool-response', {
              requestId,
              success: result.success,
              result,
            });
          } catch (error) {
            ipcRenderer.send('mcp-tool-response', {
              requestId,
              success: false,
              error: error.message,
            });
          }
        } else if (method && method.startsWith('utility_')) {
          // Check if this is a utility function call
          const utilityFunctionName = method.substring(8); // Remove 'utility_' prefix
          console.log(`📥 [Renderer] Executing utility tool: ${utilityFunctionName}`);

          let result;

          switch (utilityFunctionName) {
            case 'download_internet_file':
              // Call the IPC handler for downloading files
              if (window.electronAPI && window.electronAPI.downloadInternetFile) {
                result = await window.electronAPI.downloadInternetFile(parameters);
              } else {
                throw new Error('electronAPI.downloadInternetFile not available');
              }
              break;

            case 'view_markdown_file':
              // Call the IPC handler for opening markdown viewer
              if (window.electronAPI && window.electronAPI.openMarkdownViewer) {
                result = await window.electronAPI.openMarkdownViewer(parameters);
              } else {
                throw new Error('electronAPI.openMarkdownViewer not available');
              }
              break;

            default:
              throw new Error(`Unknown utility function: ${utilityFunctionName}`);
          }

          // Send success response
          ipcRenderer.send('mcp-tool-response', {
            requestId,
            success: true,
            result,
          });
        } else {
          // Not an action_ or utility_ function - let InternalMCPServer handle it
          // InternalMCPServer also listens to 'mcp-tool-call' and handles other methods
          // like openNewTab, navigateToPosition, etc.
          console.log(
            `📥 [Renderer] Method '${method}' not handled by renderer-modular, letting InternalMCPServer handle it`
          );
          return;
        }
      } catch (error) {
        console.error('Error handling MCP tool call:', error);

        // Send error response
        ipcRenderer.send('mcp-tool-response', {
          requestId: data.requestId,
          success: false,
          error: error.message,
        });
      }
    });

    // CRITICAL: Handle tool execution requests from MCP server
    // This is the missing bridge that forwards tools to ChatManager
    ipcRenderer.on('execute-tool-request', async (event, data) => {
      console.log('🔧 [Renderer] Received tool execution request:', {
        toolName: data?.toolName,
        parameterKeys: Object.keys(data?.parameters || {}).filter(
          key => !['approvalToken', '__executionContext'].includes(key)
        ),
      });
      const { requestId, toolName, parameters } = data;

      try {
        let result;

        // Handle codexomics_chat agent mode
        if (toolName === 'codexomics_chat') {
          const chatManager = window.genomeBrowser?.chatManager || window.chatManager;
          if (!chatManager) {
            throw new Error('ChatManager not available for agent mode');
          }
          result = await chatManager.processAgentPrompt(parameters.prompt, {
            activateMultiAgent: parameters.activate_multi_agent || false,
            context: parameters.context || {},
          });
        }
        // Use ChatManager's tool execution system
        if (window.genomeBrowser && window.genomeBrowser.chatManager) {
          console.log('📋 [Renderer] Executing tool via ChatManager:', toolName);
          result = await window.genomeBrowser.chatManager.executeToolByName(toolName, parameters);
        } else if (window.chatManager) {
          console.log('📋 [Renderer] Executing tool via global ChatManager:', toolName);
          result = await window.chatManager.executeToolByName(toolName, parameters);
        } else {
          throw new Error('ChatManager not available for tool execution');
        }

        console.log('✅ [Renderer] Tool executed successfully:', toolName, result);

        // Send success response back to main process
        ipcRenderer.send('tool-response', {
          requestId,
          success: true,
          result,
        });
      } catch (error) {
        console.error('❌ [Renderer] Tool execution failed:', error);

        // Send error response back to main process
        ipcRenderer.send('tool-response', {
          requestId,
          success: false,
          error: error.message,
        });
      }
    });

    // Handle notifications from main process
    ipcRenderer.on('show-notification', (event, notificationData) => {
      console.log('📢 Received notification from main process:', notificationData);

      if (notificationData && notificationData.title && notificationData.message) {
        const { type = 'info', title, message } = notificationData;

        // Use the existing notification system
        this.showNotification(`${title}: ${message}`, type);
      }
    });

    // Theme sync: respond to PM window requesting current theme
    ipcRenderer.on('request-theme-for-pm', () => {
      const themeManager = window.themeManager;
      if (themeManager) {
        const style = themeManager.getCurrentStyle();
        const preset = themeManager.stylePresets[style];
        const themeData = {
          style: style,
          variables: preset.variables,
          darkVariables: {},
          isDark: false,
        };
        try {
          localStorage.setItem('_globalThemeData', JSON.stringify(themeData));
        } catch (e) {
          console.warn('Failed to save global theme data to localStorage');
        }
        // Send to PM window via IPC (use ipcRenderer directly - main window has nodeIntegration:true)
        ipcRenderer.invoke('broadcast-theme-to-pm', themeData).catch(err => {
          console.warn('[ThemeSync] Failed to broadcast theme to PM:', err.message);
        });
      }
    });

    // Listen for style changes and broadcast to PM window
    window.addEventListener('uiStyleChanged', event => {
      const { style, preset } = event.detail;
      const themeData = {
        style: style,
        variables: preset.variables,
        darkVariables: {},
        isDark: false,
      };
      try {
        localStorage.setItem('_globalThemeData', JSON.stringify(themeData));
      } catch (e) {
        console.warn('Failed to save global theme data to localStorage');
      }
      // Use ipcRenderer directly - main window has nodeIntegration:true, no preload.js
      ipcRenderer.invoke('broadcast-theme-to-pm', themeData).catch(err => {
        console.warn('[ThemeSync] Failed to broadcast theme to PM:', err.message);
      });
    });
  }

  // Refresh the current view (used by TabManager for state restoration)
  refreshCurrentView() {
    if (this.currentChromosome && this.currentSequence && this.currentSequence[this.currentChromosome]) {
      console.log(`Refreshing view for chromosome: ${this.currentChromosome}`);
      this.displayGenomeView(this.currentChromosome, this.currentSequence[this.currentChromosome]);
    } else {
      console.log('No current chromosome/sequence to refresh');
    }
  }

  // Helper method to create tracks by type
  async createTrackByType(trackType, chromosome, sequence, tracksToShow) {
    console.log(`🔧 [DEBUG] [createTrackByType] Called for trackType: ${trackType}`);
    // Skip if track is not visible
    const visibleTrackName = trackType === 'wigTracks' ? 'wigTracks' : trackType;
    console.log(
      `🔧 [DEBUG] [createTrackByType] Checking if ${visibleTrackName} is in visibleTracks:`,
      Array.from(this.visibleTracks)
    );
    if (!this.visibleTracks.has(visibleTrackName)) {
      console.log(`🔧 [DEBUG] [createTrackByType] Skipping ${trackType} - not visible`);
      return;
    }
    console.log(`🔧 [DEBUG] [createTrackByType] Creating ${trackType} track`);

    // Skip 'sequence' as it's handled by the bottom sequence panel, not as a regular track
    if (trackType === 'sequence') {
      return;
    }

    let trackElement = null;

    switch (trackType) {
      case 'genes':
        // Gene track (only if annotations exist)
        if (this.currentAnnotations && this.currentAnnotations[chromosome]) {
          trackElement = this.trackRenderer.createGeneTrack(chromosome);
        }
        break;

      case 'gc':
        // GC Content track
        trackElement = this.trackRenderer.createGCTrack(chromosome, sequence);
        break;

      case 'variants':
        // Variants track (show even without data)
        trackElement = this.trackRenderer.createVariantTrack(chromosome);
        break;

      case 'reads':
        // Aligned reads track (async)
        trackElement = await this.trackRenderer.createReadsTrack(chromosome);
        break;

      case 'wigTracks':
        // WIG tracks (show even without data)
        trackElement = this.trackRenderer.createWIGTrack(chromosome);
        break;

      case 'proteins':
        // Protein track (only if we have CDS annotations)
        if (this.currentAnnotations && this.currentAnnotations[chromosome]) {
          trackElement = this.trackRenderer.createProteinTrack(chromosome);
        }
        break;

      case 'primers':
        // Primer visualization track
        trackElement = this.trackRenderer.createPrimerTrack(chromosome);
        break;

      case 'actions':
        // Actions track (show even without data)
        trackElement = this.trackRenderer.createActionsTrack(chromosome);
        break;

      case 'sequenceLine':
        // Single-line sequence track
        trackElement = this.trackRenderer.createSequenceLineTrack(chromosome, sequence);
        break;

      case 'blast':
        // Blast results track
        trackElement = this.trackRenderer.createBlastTrack(chromosome);
        break;

      default:
        if (trackType.startsWith('annotation_')) {
          const trackId = trackType.substring(11);
          const annotationTrack = this.annotationTracks?.find(t => t.id === trackId);
          if (annotationTrack && annotationTrack.visible) {
            trackElement = this.trackRenderer.createAnnotationTrack(chromosome, annotationTrack);
          }
        } else {
          console.warn(`Unknown track type: ${trackType}`);
          return;
        }
        break;
    }

    if (trackElement) {
      tracksToShow.push({ element: trackElement, type: trackType });
    }
  }

  // Core genome display method
  async displayGenomeView(chromosome, sequence) {
    // Prevent multiple simultaneous rendering operations that could cause track duplication
    if (this._isRenderingView) {
      console.log('[displayGenomeView] Already rendering, skipping duplicate call');
      return;
    }

    this._isRenderingView = true;

    try {
      // Create EcoCyc-like studio view
      const container = document.getElementById('genomeViewer');

      // Show and update the navigation bar
      this.genomeNavigationBar.show(chromosome, sequence.length);

      // PRESERVE TRACK HEIGHTS AND HEADER STATES before clearing container
      this.trackRenderer.saveHeaderStates();

      const preservedHeights = new Map();
      const trackTypeMapping = {
        gene: 'genes',
        gc: 'gc',
        variant: 'variants',
        reads: 'reads',
        read: 'reads',
        primer: 'primers',
        proteins: 'proteins',
        protein: 'proteins',
        wig: 'wigTracks', // Add WIG tracks to preservation mapping
        wigTracks: 'wigTracks',
        actions: 'actions', // Add actions track to preservation mapping
        action: 'actions',
        blast: 'blast', // Add blast track to preservation mapping
        // Remove 'sequence' since it's now handled as bottom panel, not a regular track
      };

      const existingTracks = container.querySelectorAll('[class*="-track"]');
      console.log('[displayGenomeView] Existing tracks found for height preservation:', existingTracks.length);
      existingTracks.forEach(track => {
        const trackContent = track.querySelector('.track-content');
        // A track that sizes itself to its content (the primer track) recomputes
        // its height for every view, so carrying the old one over would clip or
        // pad the redraw. Dragging the resize handle clears the marker and hands
        // control back to this preservation path.
        if (trackContent?.dataset.autoHeight === 'true') return;
        if (trackContent && trackContent.style.height && trackContent.style.height !== '') {
          let baseType = null;
          for (const cls of track.classList) {
            if (cls.endsWith('-track') && !cls.startsWith('track-splitter')) {
              // Ensure it's a main track div
              baseType = cls.replace('-track', '');
              break;
            }
          }
          if (baseType) {
            const mappedType = trackTypeMapping[baseType];
            if (mappedType) {
              preservedHeights.set(mappedType, trackContent.style.height);
              console.log(
                `[displayGenomeView] Preserving height for ${mappedType} (from class ${baseType}-track): ${trackContent.style.height}`
              );
            } else {
              console.warn(
                `[displayGenomeView] No mapping found for base track type: ${baseType} from classList:`,
                track.classList
              );
            }
          } else {
            // console.log('[displayGenomeView] Could not determine baseType for track:', track.className);
          }
        } else if (trackContent) {
          // console.log('[displayGenomeView] No style.height to preserve for track (or height is empty string):', track.className, 'Height:', trackContent.style.height);
        }
      });
      console.log('[displayGenomeView] Preserved heights map:', preservedHeights);

      container.innerHTML = '';

      // Show navigation controls
      document.getElementById('genomeNavigation').style.display = 'block';

      // Create CodeXomics container
      const browserContainer = document.createElement('div');
      browserContainer.className = 'genome-browser-container';

      // Collect all tracks to be displayed in tab-specific order
      const tracksToShow = [];

      // Get current tab's track order from TabManager
      const currentTabState = this.tabManager && this.tabManager.getCurrentTabState();
      let currentTabOrder;

      if (
        currentTabState &&
        currentTabState.trackOrder &&
        Array.isArray(currentTabState.trackOrder) &&
        currentTabState.trackOrder.length > 0
      ) {
        currentTabOrder = currentTabState.trackOrder;
        console.log('[displayGenomeView] Using saved tab track order:', currentTabOrder);
      } else {
        // If no saved order, try to get current DOM order first
        const domOrder = this.tabManager ? this.tabManager.getTrackOrder() : [];
        if (domOrder && domOrder.length > 0) {
          currentTabOrder = domOrder;
          console.log('[displayGenomeView] Using current DOM track order:', currentTabOrder);
        } else {
          currentTabOrder = [
            'genes',
            'primers',
            'gc',
            'variants',
            'reads',
            'wigTracks',
            'proteins',
            'sequenceLine',
            'actions',
          ];
          console.log('[displayGenomeView] Using default track order:', currentTabOrder);
        }
      }

      console.log('[displayGenomeView] Current tab state available:', !!currentTabState);

      // Create tracks according to the tab's specific order
      for (const trackType of currentTabOrder) {
        await this.createTrackByType(trackType, chromosome, sequence, tracksToShow);
      }

      // Also create any visible tracks that aren't in the saved order (for backward compatibility)
      const defaultOrder = [
        'genes',
        'gc',
        'variants',
        'reads',
        'wigTracks',
        'proteins',
        'primers',
        'sequenceLine',
        'actions',
        'blast',
      ];
      for (const trackType of defaultOrder) {
        if (!currentTabOrder.includes(trackType)) {
          await this.createTrackByType(trackType, chromosome, sequence, tracksToShow);
        }
      }

      // Create separate tracks for each annotation track
      if (this.annotationTracks && this.annotationTracks.length > 0) {
        for (const annotationTrack of this.annotationTracks) {
          if (annotationTrack.visible && !currentTabOrder.includes(`annotation_${annotationTrack.id}`)) {
            const trackElement = this.trackRenderer.createAnnotationTrack(chromosome, annotationTrack);
            if (trackElement) {
              tracksToShow.push({ element: trackElement, type: `annotation_${annotationTrack.id}` });
            }
          }
        }
      }

      // Always-present "secondary ruler" decoupled from any data track. Rendered
      // as the first child so the viewport coordinate axis stays visible and
      // aligned even when no Genes & Features track exists (e.g. FASTA files).
      const coordinateRulerBar = this.trackRenderer.createCoordinateRulerBar(chromosome);
      browserContainer.appendChild(coordinateRulerBar);

      // Add tracks without splitters, but make them draggable and resizable
      tracksToShow.forEach((track, index) => {
        // Add the track
        browserContainer.appendChild(track.element);

        // RESTORE PRESERVED HEIGHT if it exists
        const trackContent = track.element.querySelector('.track-content');
        const typeToRestore = track.type;
        if (trackContent) {
          if (preservedHeights.has(typeToRestore)) {
            const heightToRestore = preservedHeights.get(typeToRestore);
            trackContent.style.height = heightToRestore;
            console.log(`[displayGenomeView] Restored session height for ${typeToRestore}: ${heightToRestore}`);
          } else {
            // Restore SAVED HEIGHT from TrackStateManager (tab-specific persistence)
            const savedHeight = this.trackStateManager.getTrackSize(typeToRestore);
            if (savedHeight) {
              trackContent.style.height = savedHeight;
              console.log(`[displayGenomeView] Restored persistent height for ${typeToRestore}: ${savedHeight}`);
            }
          }
        }

        // Make tracks draggable for reordering and add resize handle
        this.makeTrackDraggable(track.element, track.type);
        this.addTrackResizeHandle(track.element, track.type);
      });

      container.appendChild(browserContainer);

      // Apply saved track state (sizes) from previous sessions
      // Note: Track order is already applied during track creation
      this.trackStateManager.applyTrackSizes(browserContainer);

      // Handle bottom sequence panel separately (always docked to bottom)
      this.handleBottomSequencePanel(chromosome, sequence);

      // Notify reads manager of navigation change for cache management
      if (this.readsManager) {
        this.readsManager.onNavigationChange(chromosome, this.currentPosition.start, this.currentPosition.end);
      }

      // Dynamically populate/update the sidebar tracks based on actual loaded tracks
      this.populateSidebarTracks();
      this.updateTrackVisibilityUI();

      // Repaint persistent positional highlights over the freshly-built track
      // stack. displayGenomeView is the single redraw funnel, so this keeps
      // highlights aligned across every pan / zoom / navigate.
      this.highlightManager?.renderHighlights();
    } finally {
      // Always clear the rendering flag
      this._isRenderingView = false;
    }
  }

  // Setup the existing toggle button to work with new bottom sequence panel
  setupToggleButtonListener() {
    // Toggle button has been removed - no longer needed
    return;
  }

  // Create a resizable splitter between tracks
  createTrackSplitter(topTrackType, bottomTrackType) {
    const splitter = document.createElement('div');
    splitter.className = 'track-splitter';
    splitter.setAttribute('data-top-track', topTrackType);
    splitter.setAttribute('data-bottom-track', bottomTrackType);

    // Add visual indicator
    const handle = document.createElement('div');
    handle.className = 'track-splitter-handle';
    handle.innerHTML = '⋯';
    splitter.appendChild(handle);

    // Add resize functionality
    this.makeTrackSplitterResizable(splitter);

    return splitter;
  }

  // Make track splitter resizable
  makeTrackSplitterResizable(splitter) {
    let isResizing = false;
    let startY = 0;
    let startTopHeight = 0;
    let startBottomHeight = 0;
    let topTrack = null;
    let bottomTrack = null;

    const startResize = e => {
      isResizing = true;
      startY = e.clientY || e.touches[0].clientY;
      document.body.setAttribute('data-splitter-resizing', 'true');
      topTrack = splitter.previousElementSibling;
      bottomTrack = splitter.nextElementSibling;
      if (topTrack && bottomTrack) {
        const topContent = topTrack.querySelector('.track-content');
        const bottomContent = bottomTrack.querySelector('.track-content');
        if (topContent && bottomContent) {
          startTopHeight = topContent.offsetHeight;
          startBottomHeight = bottomContent.offsetHeight;
        }
      }
      splitter.classList.add('resizing');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const doResize = e => {
      if (!isResizing || !topTrack || !bottomTrack) return;
      const currentY = e.clientY || e.touches[0].clientY;
      const deltaY = currentY - startY;
      const topContent = topTrack.querySelector('.track-content');
      const bottomContent = bottomTrack.querySelector('.track-content');
      if (topContent && bottomContent) {
        const newTopHeight = startTopHeight + deltaY;
        const newBottomHeight = startBottomHeight - deltaY;
        const minHeight = 40;
        if (newTopHeight >= minHeight && newBottomHeight >= minHeight) {
          topContent.style.height = `${newTopHeight}px`;
          bottomContent.style.height = `${newBottomHeight}px`;
          // --- Dynamic adjustment for sequence track window ---
          if (bottomTrack.classList.contains('sequence-track') || bottomTrack.id === 'sequenceDisplaySection') {
            const parent = bottomTrack.parentElement;
            const parentHeight = parent ? parent.offsetHeight : window.innerHeight;
            // If the remaining space is less than 10px, restore flex auto-sizing
            if (
              parentHeight - (topTrack.offsetHeight + splitter.offsetHeight + newBottomHeight) < 10 ||
              newBottomHeight > parentHeight * 0.75
            ) {
              bottomTrack.style.flex = '1 0 auto';
              bottomTrack.style.height = '';
            } else {
              bottomTrack.style.flex = 'none';
              bottomTrack.style.height = `${newBottomHeight}px`;
            }
          }
        }
      }
      e.preventDefault();
    };

    const stopResize = () => {
      if (!isResizing) return;

      isResizing = false;
      splitter.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Remove the global flag to allow track content dragging again
      document.body.removeAttribute('data-splitter-resizing');

      // Trigger sequence track window re-render if it was affected
      if (
        bottomTrack &&
        (bottomTrack.classList.contains('sequence-track') || bottomTrack.id === 'sequenceDisplaySection')
      ) {
        const currentChr = document.getElementById('chromosomeSelect')?.value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
          console.log('🔄 Triggering sequence track window re-render after splitter adjustment');
          // Use a small delay to ensure DOM updates are complete
          setTimeout(() => {
            this.displayEnhancedSequence(currentChr, this.currentSequence[currentChr]);
          }, 50);
        }
      }

      topTrack = null;
      bottomTrack = null;
    };

    // Auto-adjust height calculation - triggered on double-click
    const autoAdjustHeight = () => {
      const topTrack = splitter.previousElementSibling;
      const bottomTrack = splitter.nextElementSibling;

      if (topTrack && bottomTrack) {
        const topContent = topTrack.querySelector('.track-content');
        const bottomContent = bottomTrack.querySelector('.track-content');

        if (topContent && bottomContent) {
          // Add visual feedback
          splitter.classList.add('auto-adjusting');

          // Calculate optimal height for top track based on its content
          let optimalHeight = 80;

          // Get track type from data attributes
          const topTrackType = splitter.getAttribute('data-top-track');

          switch (topTrackType) {
            case 'genes':
              // Use TrackRenderer's layout data for accurate height calculation
              // Genes are rendered via canvas, not DOM elements
              if (this.trackRenderer) {
                const settings = this.trackRenderer.getGeneTrackSettings?.() || {};
                // Glyph size is fixed (full-size) across all layout modes
                const geneHeight = settings.geneHeight || 12;
                const rowSpacing = 6;
                const rulerHeight = 35;
                const maxRows = settings.maxRows || 6;

                // Get actual canvas element to determine if there's content
                const canvas = topContent.querySelector('canvas');
                if (canvas && canvas.height > 0) {
                  // Use canvas height as a reference, but apply minimum
                  optimalHeight = Math.max(120, canvas.height);
                } else {
                  // Calculate based on maxRows setting
                  optimalHeight = rulerHeight + 10 + maxRows * (geneHeight + rowSpacing);
                }

                // Ensure reasonable bounds
                optimalHeight = Math.max(100, Math.min(optimalHeight, 400));
              } else {
                // Fallback: reasonable default for genes track
                optimalHeight = 160;
              }
              break;
            case 'reads':
              // Reads are also canvas-rendered
              if (this.trackRenderer) {
                const canvas = topContent.querySelector('canvas');
                if (canvas && canvas.height > 0) {
                  optimalHeight = Math.max(100, Math.min(canvas.height, 300));
                } else {
                  optimalHeight = 150;
                }
              } else {
                optimalHeight = 150;
              }
              break;
            case 'gc':
              optimalHeight = 120; // Fixed height for GC Content & Skew track
              break;
            case 'variants': {
              // Check for canvas-based variants or SVG elements
              const canvas = topContent.querySelector('canvas');
              const variantSvg = topContent.querySelector('svg');
              if (canvas && canvas.height > 0) {
                optimalHeight = Math.max(60, Math.min(canvas.height, 150));
              } else if (variantSvg) {
                optimalHeight = 80;
              } else {
                optimalHeight = 60;
              }
              break;
            }
            case 'proteins':
              optimalHeight = 90;
              break;
            case 'wigTracks':
              // WIG tracks typically use fixed height
              optimalHeight = 120;
              break;
            case 'blast':
              optimalHeight = 100;
              break;
            case 'actions':
              optimalHeight = 60;
              break;
            case 'sequenceLine':
              optimalHeight = 40;
              break;
            default:
              optimalHeight = 80;
          }

          // Apply the optimal height with smooth transition
          topContent.style.transition = 'height 0.3s ease';
          topContent.style.height = `${optimalHeight}px`;

          // Remove transition and animation classes after animation completes
          setTimeout(() => {
            topContent.style.transition = '';
            splitter.classList.remove('auto-adjusting');
          }, 300);
        }
      }
    };

    // Mouse events
    splitter.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);

    // Touch events for mobile
    splitter.addEventListener('touchstart', startResize, { passive: false });
    document.addEventListener('touchmove', doResize, { passive: false });
    document.addEventListener('touchend', stopResize);

    // Double-click for auto-adjust
    splitter.addEventListener('dblclick', autoAdjustHeight);

    // Make splitter focusable for keyboard navigation
    splitter.setAttribute('tabindex', '0');
    splitter.addEventListener('keydown', e => {
      const step = 10; // pixels to move per keypress
      let deltaY = 0;

      switch (e.key) {
        case 'ArrowUp':
          deltaY = -step;
          break;
        case 'ArrowDown':
          deltaY = step;
          break;
        case 'Home':
          autoAdjustHeight();
          e.preventDefault();
          return;
        default:
          return;
      }

      e.preventDefault();

      // Apply keyboard movement
      const topTrack = splitter.previousElementSibling;
      const bottomTrack = splitter.nextElementSibling;

      if (topTrack && bottomTrack) {
        const topContent = topTrack.querySelector('.track-content');
        const bottomContent = bottomTrack.querySelector('.track-content');

        if (topContent && bottomContent) {
          const currentTopHeight = topContent.offsetHeight;
          const currentBottomHeight = bottomContent.offsetHeight;

          const newTopHeight = currentTopHeight + deltaY;
          const newBottomHeight = currentBottomHeight - deltaY;

          const minHeight = 40;

          if (newTopHeight >= minHeight && newBottomHeight >= minHeight) {
            topContent.style.height = `${newTopHeight}px`;
            bottomContent.style.height = `${newBottomHeight}px`;
          }
        }
      }
    });
  }

  // Make individual tracks draggable for reordering
  makeTrackDraggable(trackElement, trackType) {
    // Add drag handle to track header
    const trackHeader = trackElement.querySelector('.track-header');
    if (trackHeader) {
      trackHeader.style.cursor = 'move';
      trackHeader.setAttribute('draggable', true);
      trackHeader.setAttribute('data-track-type', trackType);

      // Add drag handle icon
      const dragHandle = document.createElement('div');
      dragHandle.className = 'track-drag-handle';
      dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
      dragHandle.style.cssText = `
                position: absolute;
                left: 8px;
                top: 50%;
                transform: translateY(-50%);
                color: #6c757d;
                cursor: grab;
                font-size: 12px;
                z-index: 10;
            `;
      trackHeader.style.position = 'relative';
      trackHeader.style.paddingLeft = '30px';
      trackHeader.insertBefore(dragHandle, trackHeader.firstChild);

      // Drag event handlers
      trackHeader.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', trackType);
        e.dataTransfer.effectAllowed = 'move';
        trackElement.classList.add('dragging');
        dragHandle.style.cursor = 'grabbing';
      });

      trackHeader.addEventListener('dragend', e => {
        trackElement.classList.remove('dragging');
        dragHandle.style.cursor = 'grab';

        // Remove all drop indicators
        document.querySelectorAll('.track-drop-indicator').forEach(indicator => {
          indicator.remove();
        });
      });
    }

    // Make track a drop target
    trackElement.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const draggingElement = document.querySelector('.dragging');
      if (draggingElement && draggingElement !== trackElement) {
        this.showDropIndicator(trackElement, e.clientY);
      }
    });

    trackElement.addEventListener('dragleave', e => {
      if (!trackElement.contains(e.relatedTarget)) {
        this.hideDropIndicator(trackElement);
      }
    });

    trackElement.addEventListener('drop', e => {
      e.preventDefault();
      const draggedElement = document.querySelector('.dragging');

      if (draggedElement && draggedElement !== trackElement) {
        this.reorderTracks(draggedElement, trackElement, e.clientY);
      }

      this.hideDropIndicator(trackElement);
    });
  }

  // Add resize handle to track
  addTrackResizeHandle(trackElement, trackType) {
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'track-resize-handle';
    resizeHandle.innerHTML = '<i class="fas fa-grip-horizontal"></i>';
    resizeHandle.style.cssText = `
            position: absolute;
            bottom: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 8px;
            background: linear-gradient(to bottom, #e9ecef, #dee2e6, #e9ecef);
            border: 1px solid #ced4da;
            border-radius: 4px;
            cursor: row-resize;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6c757d;
            font-size: 8px;
            opacity: 0.7;
            transition: all 0.2s ease;
            z-index: 10;
        `;

    trackElement.style.position = 'relative';
    trackElement.appendChild(resizeHandle);

    // Hover effects
    resizeHandle.addEventListener('mouseenter', () => {
      resizeHandle.style.opacity = '1';
      resizeHandle.style.height = '10px';
      resizeHandle.style.bottom = '-5px';
    });

    resizeHandle.addEventListener('mouseleave', () => {
      resizeHandle.style.opacity = '0.7';
      resizeHandle.style.height = '8px';
      resizeHandle.style.bottom = '-4px';
    });

    // Resize functionality
    this.makeResizeHandleResizable(resizeHandle, trackElement, trackType);
  }

  // Make resize handle functional
  makeResizeHandleResizable(resizeHandle, trackElement, trackType) {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    const startResize = e => {
      isResizing = true;
      startY = e.clientY || e.touches[0].clientY;

      const trackContent = trackElement.querySelector('.track-content');
      if (trackContent) {
        startHeight = trackContent.offsetHeight;
      }

      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      resizeHandle.style.background = 'linear-gradient(to bottom, #ced4da, #adb5bd, #ced4da)';

      e.preventDefault();
      e.stopPropagation();
    };

    const doResize = e => {
      if (!isResizing) return;

      const currentY = e.clientY || e.touches[0].clientY;
      const deltaY = currentY - startY;

      const trackContent = trackElement.querySelector('.track-content');
      if (trackContent) {
        const newHeight = Math.max(50, startHeight + deltaY);
        trackContent.style.height = `${newHeight}px`;
        // The user's drag beats any content-derived height from here on.
        delete trackContent.dataset.autoHeight;

        // Save the new size to track state manager
        this.trackStateManager.saveTrackSize(trackType, `${newHeight}px`);
      }

      e.preventDefault();
    };

    const stopResize = () => {
      if (!isResizing) return;

      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizeHandle.style.background = 'linear-gradient(to bottom, #e9ecef, #dee2e6, #e9ecef)';
    };

    // Mouse events
    resizeHandle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);

    // Touch events
    resizeHandle.addEventListener('touchstart', startResize, { passive: false });
    document.addEventListener('touchmove', doResize, { passive: false });
    document.addEventListener('touchend', stopResize);

    // Double-click to auto-adjust height
    resizeHandle.addEventListener('dblclick', () => {
      const trackContent = trackElement.querySelector('.track-content');
      if (trackContent) {
        let optimalHeight = 80;

        switch (trackType) {
          case 'genes': {
            const geneElements = trackContent.querySelectorAll('.gene-element');
            if (geneElements.length > 0) {
              let maxRow = 0;
              geneElements.forEach(gene => {
                const top = parseInt(gene.style.top) || 0;
                const height = parseInt(gene.style.height) || 23;
                maxRow = Math.max(maxRow, top + height);
              });
              optimalHeight = Math.max(100, maxRow + 60);
            }
            break;
          }
          case 'reads': {
            const readElements = trackContent.querySelectorAll('.read-element');
            if (readElements.length > 0) {
              let maxRow = 0;
              readElements.forEach(read => {
                const top = parseInt(read.style.top) || 0;
                const height = parseInt(read.style.height) || 12;
                maxRow = Math.max(maxRow, top + height);
              });
              optimalHeight = Math.max(80, maxRow + 40);
            }
            break;
          }
          case 'gc':
            optimalHeight = 120; // Updated for enhanced GC Content & Skew track
            break;
          case 'variants':
            optimalHeight = 80;
            break;
          case 'proteins':
            optimalHeight = 90;
            break;
          case 'wigTracks':
            // For WIG tracks, use a default optimal height
            optimalHeight = 120;
            break;
          default:
            optimalHeight = 80;
        }

        trackContent.style.height = `${optimalHeight}px`;

        // Save the new size to track state manager
        this.trackStateManager.saveTrackSize(trackType, `${optimalHeight}px`);

        // Visual feedback
        resizeHandle.style.background = 'linear-gradient(to bottom, #28a745, #20c997, #28a745)';
        setTimeout(() => {
          resizeHandle.style.background = 'linear-gradient(to bottom, #e9ecef, #dee2e6, #e9ecef)';
        }, 300);
      }
    });
  }

  // Show drop indicator when dragging tracks
  showDropIndicator(targetElement, mouseY) {
    this.hideDropIndicator(targetElement);

    const rect = targetElement.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const isAbove = mouseY < midPoint;

    const indicator = document.createElement('div');
    indicator.className = 'track-drop-indicator';
    indicator.style.cssText = `
            position: absolute;
            left: 0;
            right: 0;
            height: 3px;
            background: #007bff;
            z-index: 1000;
            box-shadow: 0 0 4px rgba(0, 123, 255, 0.5);
            ${isAbove ? 'top: -2px;' : 'bottom: -2px;'}
        `;

    targetElement.style.position = 'relative';
    targetElement.appendChild(indicator);
  }

  // Hide drop indicator
  hideDropIndicator(targetElement) {
    const indicator = targetElement.querySelector('.track-drop-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  // Reorder tracks based on drop position
  reorderTracks(draggedElement, targetElement, mouseY) {
    const container = targetElement.parentElement;
    const rect = targetElement.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const insertBefore = mouseY < midPoint;

    if (insertBefore) {
      container.insertBefore(draggedElement, targetElement);
    } else {
      container.insertBefore(draggedElement, targetElement.nextSibling);
    }

    // Update track visibility state based on new order
    this.updateTrackOrder();
  }

  // Update internal track order state
  updateTrackOrder() {
    const container = document.querySelector('.genome-browser-container');
    if (!container) return;

    const trackElements = Array.from(container.querySelectorAll('[class*="-track"]'));
    const newOrder = [];

    trackElements.forEach(element => {
      // Prioritize explicit track type from data attribute
      let trackType = element.dataset.trackType;

      if (!trackType) {
        // Fallback to class-based detection for legacy tracks
        const classList = Array.from(element.classList);
        const trackClass = classList.find(cls => cls.endsWith('-track'));
        if (trackClass) {
          const rawType = trackClass.replace('-track', '');
          const typeMapping = {
            gene: 'genes',
            gc: 'gc',
            variant: 'variants',
            reads: 'reads',
            protein: 'proteins',
            proteins: 'proteins',
            wig: 'wigTracks',
            'sequence-line': 'sequenceLine',
            sequence: 'sequence',
            actions: 'actions',
            blast: 'blast',
          };
          trackType = typeMapping[rawType] || rawType;
        }
      }

      if (trackType && !newOrder.includes(trackType)) {
        newOrder.push(trackType);
      }
    });

    console.log('New track order:', newOrder);

    // Save the new order to TabManager for tab-specific persistence
    if (this.tabManager) {
      this.tabManager.onTrackOrderChanged(newOrder);
    }

    // Also save to track state manager (internal memory)
    this.trackStateManager.saveTrackOrder(newOrder);

    // Store the order preference if needed
    if (this.configManager) {
      this.configManager.set('trackOrder', newOrder);
    }

    // Notify TabManager of track order change IMMEDIATELY
    // to ensure track state is synchronized before any re-rendering
    if (this.tabManager) {
      this.tabManager.onTrackOrderChanged(newOrder);
      console.log('Track order change notified to TabManager:', newOrder);
    }
  }

  /**
   * Dynamically populate the sidebar tracks section based on current instances
   */
  populateSidebarTracks() {
    const container = document.getElementById('sidebarTrackControls');
    if (!container) return;

    // Save scroll position or other UI state if needed
    container.innerHTML = '';

    // Define track instances to show
    const instances = [];

    // 1. Add base tracks
    const baseTracks = [
      { id: 'genes', name: 'Primary Genes & Features', category: 'genes' },
      { id: 'gc', name: 'GC Content & Skew', category: 'gc' },
      { id: 'variants', name: 'Primary VCF Variants', category: 'variants' },
      { id: 'reads', name: 'Primary Aligned Reads', category: 'reads' },
      { id: 'wigTracks', name: 'Primary WIG Tracks', category: 'wigTracks' },
      { id: 'proteins', name: 'Proteins', category: 'proteins' },
      { id: 'primers', name: 'Primers', category: 'primers' },
      { id: 'sequence', name: 'Bottom Sequence Panel', category: 'sequence' },
      { id: 'sequenceLine', name: 'Single-line Sequence', category: 'sequenceLine' },
      { id: 'actions', name: 'Actions Track', category: 'actions' },
      { id: 'blast', name: 'Blast Results', category: 'blast' },
    ];

    baseTracks.forEach(track => {
      instances.push(track);
    });

    // 2. Add extra annotation tracks (GFF/BED files)
    if (this.annotationTracks && this.annotationTracks.length > 0) {
      this.annotationTracks.forEach(track => {
        instances.push({
          id: `annotation_${track.id}`,
          name: `Annotation: ${track.name || track.id}`,
          category: 'genes',
          isAnnotation: true,
        });
      });
    }

    // Populate container
    instances.forEach(instance => {
      const label = document.createElement('label');
      label.className = 'track-control-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `sidebar_instance_${instance.id}`;
      checkbox.value = instance.id;
      checkbox.dataset.category = instance.category;
      checkbox.checked = this.visibleTracks.has(instance.id);

      const span = document.createElement('span');
      span.textContent = instance.name;

      label.appendChild(checkbox);
      label.appendChild(span);
      container.appendChild(label);
    });

    if (instances.length === 0) {
      container.innerHTML = '<div style="padding: 10px; color: #888; font-style: italic;">No tracks available</div>';
    }
  }

  // Track management methods
  updateVisibleTracks() {
    // Clear any existing timeout to debounce rapid calls
    if (this._updateTracksTimeout) {
      clearTimeout(this._updateTracksTimeout);
    }

    this._updateTracksTimeout = setTimeout(() => {
      this._doUpdateVisibleTracks();
    }, 50); // 50ms debounce
  }

  _doUpdateVisibleTracks() {
    // Dropdown now handles fixed categories
    const categoryMapping = {
      trackGenes: 'genes',
      trackGC: 'gc',
      trackVariants: 'variants',
      trackReads: 'reads',
      trackWIG: 'wigTracks',
      trackProteins: 'proteins',
      trackPrimers: 'primers',
      trackSequence: 'sequence',
      trackSequenceLine: 'sequenceLine',
      trackActions: 'actions',
      trackBlast: 'blast',
    };

    const tracks = new Set(this.visibleTracks);

    Object.entries(categoryMapping).forEach(([cbId, category]) => {
      const checkbox = document.getElementById(cbId);
      if (!checkbox) return;

      const isVisible = checkbox.checked;

      // When a category is toggled, update all related instances
      if (isVisible) {
        tracks.add(category);
        if (category === 'genes' && this.annotationTracks) {
          this.annotationTracks.forEach(at => tracks.add(`annotation_${at.id}`));
        }
      } else {
        tracks.delete(category);
        if (category === 'genes' && this.annotationTracks) {
          this.annotationTracks.forEach(at => tracks.delete(`annotation_${at.id}`));
        }
      }
    });

    this.visibleTracks = tracks;

    // Use unified sync to ensure consistency
    this.updateTrackVisibilityUI();

    // Notify TabManager
    if (this.tabManager) {
      this.tabManager.onTrackVisibilityChanged();
    }

    // Refresh view
    const currentChr = document.getElementById('chromosomeSelect').value;
    if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
      this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
    }
  }

  updateVisibleTracksFromSidebar() {
    // Clear any existing timeout to debounce rapid calls
    if (this._updateTracksFromSidebarTimeout) {
      clearTimeout(this._updateTracksFromSidebarTimeout);
    }

    this._updateTracksFromSidebarTimeout = setTimeout(() => {
      this._doUpdateVisibleTracksFromSidebar();
    }, 50); // 50ms debounce
  }

  _doUpdateVisibleTracksFromSidebar() {
    // Sidebar now handles dynamic instances
    const tracks = new Set();
    const container = document.getElementById('sidebarTrackControls');
    if (container) {
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        if (cb.checked) {
          tracks.add(cb.value);
        }
      });
    }

    this.visibleTracks = tracks;

    // Use unified sync to ensure consistency across toolbar and sidebar
    this.updateTrackVisibilityUI();

    // Notify TabManager of track visibility change
    if (this.tabManager) {
      this.tabManager.onTrackVisibilityChanged();
    }

    // Refresh the genome view if a file is loaded
    const currentChr = document.getElementById('chromosomeSelect').value;
    if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
      this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
    }
  }

  /**
   * Universal method to synchronize all track checkboxes/UI with internal visibility state
   */
  updateTrackVisibilityUI() {
    const tracks = this.visibleTracks;

    // 1. Sync the dropdown category checkboxes
    const dropdownMapping = {
      genes: 'trackGenes',
      gc: 'trackGC',
      variants: 'trackVariants',
      reads: 'trackReads',
      wigTracks: 'trackWIG',
      proteins: 'trackProteins',
      primers: 'trackPrimers',
      sequence: 'trackSequence',
      sequenceLine: 'trackSequenceLine',
      actions: 'trackActions',
      blast: 'trackBlast',
    };

    Object.entries(dropdownMapping).forEach(([trackType, cbId]) => {
      const checkbox = document.getElementById(cbId);
      if (checkbox) {
        // Category should be checked if its primary track OR any of its instances are visible
        let isVisible = tracks.has(trackType);
        if (trackType === 'genes' && !isVisible) {
          isVisible = this.annotationTracks && this.annotationTracks.some(at => tracks.has(`annotation_${at.id}`));
        }
        checkbox.checked = isVisible;
      }
    });

    // 2. Sync the dynamic sidebar instance checkboxes
    const sidebarContainer = document.getElementById('sidebarTrackControls');
    if (sidebarContainer) {
      const sidebarCheckboxes = sidebarContainer.querySelectorAll('input[type="checkbox"]');
      sidebarCheckboxes.forEach(cb => {
        cb.checked = tracks.has(cb.value);
      });
    }

    // 3. Ensure trackVisibility object is synchronized for TabManager/persistence
    this.trackVisibility.genes = tracks.has('genes');
    this.trackVisibility.gc = tracks.has('gc');
    this.trackVisibility.variants = tracks.has('variants');
    this.trackVisibility.reads = tracks.has('reads');
    this.trackVisibility.wig = tracks.has('wigTracks');
    this.trackVisibility.proteins = tracks.has('proteins');
    this.trackVisibility.primers = tracks.has('primers');
    this.trackVisibility.sequence = tracks.has('sequence');
    this.trackVisibility.sequenceLine = tracks.has('sequenceLine');
    this.trackVisibility.actions = tracks.has('actions');
    this.trackVisibility.blast = tracks.has('blast');

    if (typeof this.updatePrimerTrackButtonState === 'function') {
      this.updatePrimerTrackButtonState(tracks.has('primers'));
    }
  }

  // Helper method to programmatically enable Actions track
  enableActionsTrack() {
    // Add to visible tracks
    this.visibleTracks.add('actions');

    // Update checkboxes to reflect the change
    const trackActions = document.getElementById('trackActions');
    const sidebarTrackActions = document.getElementById('sidebarTrackActions');

    if (trackActions) trackActions.checked = true;
    if (sidebarTrackActions) sidebarTrackActions.checked = true;

    // Refresh the display to show the track
    const currentChr = document.getElementById('chromosomeSelect').value;
    if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
      this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
    }

    console.log('✅ Actions track enabled and displayed');
  }

  // Gene filter methods
  shouldShowGeneType(type) {
    const typeMap = {
      gene: 'genes',
      CDS: 'CDS',
      mRNA: 'mRNA',
      tRNA: 'tRNA',
      rRNA: 'rRNA',
      promoter: 'promoter',
      terminator: 'terminator',
      regulatory: 'regulatory',
      source: 'source', // Handle source features specially
      comment: 'other',
      note: 'other',
      other: 'other',
      misc_feature: 'misc_feature',
      repeat_region: 'repeat_region',
      BED_feature: 'bed_feature', // BED features have their own category
    };

    const filterKey = typeMap[type] || 'other';
    return this.geneFilters[filterKey];
  }

  // Operon detection and color assignment methods
  detectOperons(annotations, chromosome) {
    // If user-loaded operons exist, use cached mapped version if available
    if (this.loadedOperons && this.loadedOperons.length > 0) {
      // Check if we have cached mapped operons for this chromosome
      if (this.mappedOperons && this.operonMappingChromosome === chromosome) {
        console.log(`🚀 Using cached ${this.mappedOperons.length} mapped operons (no re-mapping needed)`);
        return this.mappedOperons;
      }

      // Need to map operons for the first time or for a new chromosome
      console.log(
        `📋 Mapping ${this.loadedOperons.length} loaded operons to annotations for chromosome ${chromosome}...`
      );
      const startTime = performance.now();

      this.mappedOperons = this.loadedOperons.map(operon => ({
        ...operon,
        genes: this.mapOperonGenesToAnnotations(operon, annotations),
      }));

      this.operonMappingChromosome = chromosome;

      const endTime = performance.now();
      console.log(`✅ Operon mapping completed in ${(endTime - startTime).toFixed(2)}ms, cached for future use`);

      return this.mappedOperons;
    }

    // Fall back to simple operon detection based on gene proximity and strand
    const operons = [];
    const genes = annotations
      .filter(feature => ['CDS', 'mRNA', 'tRNA', 'rRNA'].includes(feature.type))
      .sort((a, b) => a.start - b.start);

    if (genes.length === 0) return operons;

    let currentOperon = [genes[0]];
    const maxGap = 500; // Maximum gap between genes in an operon (bp)

    for (let i = 1; i < genes.length; i++) {
      const prevGene = genes[i - 1];
      const currentGene = genes[i];

      // Check if genes are close enough and on the same strand to be in the same operon
      const gap = currentGene.start - prevGene.end;
      const sameStrand = prevGene.strand === currentGene.strand;

      if (gap <= maxGap && sameStrand && gap >= 0) {
        currentOperon.push(currentGene);
      } else {
        // Finalize current operon if it has multiple genes
        if (currentOperon.length > 1) {
          operons.push({
            genes: [...currentOperon],
            start: currentOperon[0].start,
            end: currentOperon[currentOperon.length - 1].end,
            strand: currentOperon[0].strand,
            name: this.generateOperonName(currentOperon),
          });
        }
        currentOperon = [currentGene];
      }
    }

    // Don't forget the last operon
    if (currentOperon.length > 1) {
      operons.push({
        genes: [...currentOperon],
        start: currentOperon[0].start,
        end: currentOperon[currentOperon.length - 1].end,
        strand: currentOperon[0].strand,
        name: this.generateOperonName(currentOperon),
      });
    }

    return operons;
  }

  mapOperonGenesToAnnotations(operon, annotations) {
    // Map operon gene names to actual annotation features
    const mappedGenes = [];

    for (const geneName of operon.genes) {
      // Try to find matching annotation by gene name or locus tag
      const matchingFeature = annotations.find(feature => {
        const featureGeneName = feature.qualifiers?.gene || '';
        const featureLocus = feature.qualifiers?.locus_tag || '';

        // Try exact match first
        if (featureGeneName === geneName || featureLocus === geneName) {
          return true;
        }

        // Try case-insensitive match
        if (
          featureGeneName.toLowerCase() === geneName.toLowerCase() ||
          featureLocus.toLowerCase() === geneName.toLowerCase()
        ) {
          return true;
        }

        // Try partial match
        if (featureGeneName && geneName && (featureGeneName.includes(geneName) || geneName.includes(featureGeneName))) {
          return true;
        }

        if (featureLocus && geneName && (featureLocus.includes(geneName) || geneName.includes(featureLocus))) {
          return true;
        }

        return false;
      });

      if (matchingFeature) {
        mappedGenes.push(matchingFeature);
      }
      // Skip unmapped genes silently - allows operons to work even if some genes can't be mapped
    }

    return mappedGenes;
  }

  generateOperonName(genes) {
    // Generate operon name based on first gene or common prefix
    const firstGene = genes[0];
    const geneName =
      this.getQualifierValue(firstGene.qualifiers, 'gene') ||
      this.getQualifierValue(firstGene.qualifiers, 'locus_tag') ||
      'unknown';

    // Try to find common prefix among gene names
    const geneNames = genes
      .map(g => this.getQualifierValue(g.qualifiers, 'gene') || this.getQualifierValue(g.qualifiers, 'locus_tag') || '')
      .filter(n => n);
    if (geneNames.length > 1) {
      const commonPrefix = this.findCommonPrefix(geneNames);
      if (commonPrefix.length > 2) {
        return `${commonPrefix}_operon`;
      }
    }

    return `${geneName}_operon`;
  }

  findCommonPrefix(strings) {
    if (strings.length === 0) return '';

    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
      while (strings[i].indexOf(prefix) !== 0) {
        prefix = prefix.substring(0, prefix.length - 1);
        if (prefix === '') return '';
      }
    }
    return prefix;
  }

  assignOperonColor(operonName) {
    if (!this.operonColorMap.has(operonName)) {
      const color = this.operonColors[this.operonColorIndex];
      this.operonColorMap.set(operonName, color);
      this.operonColorIndex = (this.operonColorIndex + 1) % this.operonColors.length;
    }
    return this.operonColorMap.get(operonName);
  }

  // Override getGeneOperonInfo to handle user-defined features
  getGeneOperonInfo(gene, operons) {
    // If it's a user-defined feature, return a special color
    if (gene.userDefined) {
      return {
        isInOperon: false,
        operonName: null,
        color: '#10b981', // Success green for user-defined features
        name: null,
      };
    }

    // Find which operon this gene belongs to
    // Check by: 1) exact feature match, 2) position overlap, 3) name match
    for (const operon of operons) {
      // Method 1: Check if this exact gene object is in the operon's genes array
      if (operon.genes.some(g => g === gene)) {
        return {
          operonName: operon.name,
          color: this.assignOperonColor(operon.name),
          isInOperon: true,
        };
      }

      // Method 2: Check by position match (start and end)
      if (operon.genes.some(g => g.start === gene.start && g.end === gene.end)) {
        return {
          operonName: operon.name,
          color: this.assignOperonColor(operon.name),
          isInOperon: true,
        };
      }

      // Method 3: Check if gene is within operon boundaries and has matching strand
      if (gene.start >= operon.start && gene.end <= operon.end && gene.strand === operon.strand) {
        // Also check if gene name matches any gene in the operon
        const geneName =
          this.getQualifierValue(gene.qualifiers, 'gene') || this.getQualifierValue(gene.qualifiers, 'locus_tag') || '';
        if (
          geneName &&
          operon.genes.some(g => {
            const operonGeneName =
              this.getQualifierValue(g.qualifiers, 'gene') || this.getQualifierValue(g.qualifiers, 'locus_tag') || '';
            return operonGeneName === geneName;
          })
        ) {
          return {
            operonName: operon.name,
            color: this.assignOperonColor(operon.name),
            isInOperon: true,
          };
        }
      }
    }

    // Gene is not in an operon, assign individual color
    const geneName =
      this.getQualifierValue(gene.qualifiers, 'gene') ||
      this.getQualifierValue(gene.qualifiers, 'locus_tag') ||
      `${gene.type}_${gene.start}`;
    return {
      operonName: geneName,
      color: this.assignOperonColor(geneName),
      isInOperon: false,
    };
  }

  updateGeneDisplay() {
    // Refresh the genome view if a file is loaded
    const currentChr = document.getElementById('chromosomeSelect').value;
    if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
      this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
    }
  }

  syncSidebarFeatureFilter(sidebarId, checked) {
    const sidebarElement = document.getElementById(sidebarId);
    if (sidebarElement) {
      sidebarElement.checked = checked;
    }
  }

  syncToolbarFeatureFilter(toolbarId, checked) {
    const toolbarElement = document.getElementById(toolbarId);
    if (toolbarElement) {
      toolbarElement.checked = checked;
    }
  }

  // Delegate methods to modules
  updateFileInfo() {
    this.fileManager.updateFileInfo();
  }

  hideWelcomeScreen() {
    this.uiManager.hideWelcomeScreen();
  }

  /**
   * Wire the welcome screen drop zone. Dropped files are routed by extension
   * through the same FileManager entry points the open-file buttons use.
   */
  setupWelcomeDropZone() {
    const dropZone = document.getElementById('welcomeDropZone');
    if (!dropZone) return;

    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length > 0) {
        this.loadDroppedFiles(files);
      }
    });
  }

  /**
   * Resolve the filesystem path of a dropped File. Electron >= 32 removed
   * File.path in favor of webUtils.getPathForFile(); keep both so the drop
   * zone also works in environments where webUtils is unavailable.
   */
  getDroppedFilePath(file) {
    try {
      if (typeof require === 'function') {
        const { webUtils } = require('electron');
        if (webUtils && typeof webUtils.getPathForFile === 'function') {
          const filePath = webUtils.getPathForFile(file);
          if (filePath) return filePath;
        }
      }
    } catch (error) {
      console.warn('webUtils.getPathForFile failed, falling back to File.path:', error);
    }
    return file.path || '';
  }

  async loadDroppedFiles(files) {
    const filePaths = files.map(file => this.getDroppedFilePath(file)).filter(Boolean);
    if (filePaths.length === 0) {
      this.updateStatus('Could not resolve dropped file path(s)');
      return;
    }

    // The permission broker only auto-grants dialog-picked paths; a drop is an
    // equally explicit user gesture, so request the read grant up front.
    const authorization = await ipcRenderer.invoke('authorize-file-drop', filePaths);
    if (!authorization?.success) {
      this.updateStatus(`Dropped file not authorized: ${authorization?.error || 'unknown error'}`, 'error');
      return;
    }

    const wigExtensions = ['.wig', '.bw', '.bigwig'];
    const isWigFile = filePath => wigExtensions.some(ext => filePath.toLowerCase().endsWith(ext));

    try {
      if (filePaths.length > 1 && filePaths.every(isWigFile)) {
        // Mirror the WIG/BigWig button: multiple track files load together
        await this.fileManager.loadMultipleWIGFiles(filePaths);
      } else {
        // FileManager.loadFile() routes genome/annotation/variant/reads/track files by extension
        for (const filePath of filePaths) {
          await this.fileManager.loadFile(filePath);
        }
      }
    } catch (error) {
      console.error('Error loading dropped files:', error);
      this.updateStatus(`Failed to load dropped file: ${error.message}`, 'error');
    }
  }

  updateStatus(message, options = {}) {
    this.uiManager.updateStatus(message, options);
  }

  showLoading(show) {
    this.uiManager.showLoading(show);
  }

  populateChromosomeSelect() {
    this.sequenceUtils.populateChromosomeSelect();
  }

  selectChromosome(chromosome) {
    this.sequenceUtils.selectChromosome(chromosome);
  }

  updateStatistics(chromosome, sequence) {
    this.sequenceUtils.updateStatistics(chromosome, sequence);
  }

  displayEnhancedSequence(chromosome, sequence) {
    this.sequenceUtils.displayEnhancedSequence(chromosome, sequence);
  }

  translateDNA(dnaSequence, strand) {
    // Use unified translation implementation
    if (window.UnifiedDNATranslation) {
      const result = window.UnifiedDNATranslation.strandBasedTranslateDNA(dnaSequence, strand);
      return result;
    }

    // Fallback to sequenceUtils implementation
    return this.sequenceUtils.translateDNA(dnaSequence, strand);
  }

  makeDraggable(element, chromosome) {
    this.navigationManager.makeDraggable(element, chromosome);
  }

  // Gene Selection Methods
  selectGene(gene, operonInfo = null) {
    const type = (gene.type || '').toLowerCase();
    if (type === 'primer' || type === 'primer_bind') {
      this.selectPrimer(gene);
      return;
    }

    const genesSettings = this.trackRenderer?.getTrackSettings('genes') || {};

    // Transition directly between selections. A full clear used to redraw the
    // genes canvas, scan the sequence DOM, and update sidebar state before the
    // new selection repeated the same work. Suppress those redundant steps;
    // highlightSelectedGene() performs the single required redraw/highlight.
    this.clearGeneSelection({
      renderCanvas: false,
      // When automatic sequence highlighting is disabled there is no incoming
      // range to replace the old one, so clear it here exactly once.
      clearSequence: genesSettings.autoHighlightSequence === false,
      updateSidebar: false,
    });

    // Set new selected gene
    this.selectedGene = { gene, operonInfo };

    // Add selection styling to gene elements using multiple identification methods
    this.highlightSelectedGene(gene, genesSettings);

    console.log('Selected gene:', gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type);

    // Show visual feedback that a gene was selected
    this.showGeneSelectionFeedback(gene);
  }

  /**
   * Show visual feedback when a gene is selected
   */
  showGeneSelectionFeedback(gene) {
    const geneName = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type;
    const message = `Selected gene: ${geneName}`;

    // Show notification if available
    if (typeof this.showNotification === 'function') {
      this.showNotification(message, 'info');
    }

    // Update status bar using unified updateStatus method
    this.updateStatus(message, {
      highlight: true,
      color: '#3b82f6',
      duration: 3000,
      restore: true,
    });
  }

  /**
   * Highlight the selected gene in the track
   * Uses multiple methods to identify and highlight the correct gene element
   */
  highlightSelectedGene(gene, resolvedGenesSettings = null) {
    // Get highlight effect setting from genes track settings
    const genesSettings = resolvedGenesSettings || this.trackRenderer?.getTrackSettings('genes') || {};
    const highlightEffect = genesSettings.highlightEffect || 'pulse';

    // Canvas mode: trigger Canvas renderer re-render for selection highlight
    // Canvas renderers draw selection state (shadow/glow) directly via their render() method,
    // so we don't need to search for DOM elements — just tell the renderer to redraw.
    const renderingMode = genesSettings.renderingMode || 'svg';
    if (renderingMode === 'canvas') {
      const canvasRenderer = this.trackRenderer?.canvasRenderers?.get('genes');
      if (canvasRenderer && typeof canvasRenderer.render === 'function') {
        canvasRenderer.render();
        console.log(
          'Highlighted gene via Canvas renderer for:',
          gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type
        );

        // Auto-highlight sequence region if enabled
        if (genesSettings.autoHighlightSequence !== false) {
          this.highlightGeneSequence(gene);
        }
        return; // Canvas mode handled — skip SVG/DOM logic below
      }
      // Canvas renderer not available yet (shouldn't happen), fall through to SVG logic
    }

    // SVG/HTML mode: data attributes are present on both renderer variants, so
    // one targeted lookup replaces several document-wide scans of the same
    // elements. Keep the title fallback for legacy/custom elements.
    let matchingElements = Array.from(
      document.querySelectorAll(
        `.gene-element[data-gene-start="${gene.start}"][data-gene-end="${gene.end}"], ` +
          `.svg-gene-element[data-gene-start="${gene.start}"][data-gene-end="${gene.end}"]`
      )
    );
    if (matchingElements.length === 0) {
      const genePosition = `${gene.start}-${gene.end}`;
      matchingElements = Array.from(document.querySelectorAll('.gene-element, .svg-gene-element')).filter(el =>
        (el.title || '').includes(genePosition)
      );
    }
    matchingElements.forEach(el => {
      el.classList.add('selected');
      this.applyHighlightEffect(el, highlightEffect);
    });

    if (matchingElements.length === 0) {
      // In Canvas mode, it's expected that no SVG/DOM elements exist — don't trigger a full refresh.
      // Only refresh in SVG mode where missing elements indicate a rendering issue.
      if (renderingMode !== 'canvas') {
        console.warn('No gene elements found to highlight for gene:', gene);
        // Force refresh of the gene track to ensure elements are present
        this.refreshGeneTrackIfNeeded();
      }
    } else {
      console.log(
        `Highlighted ${matchingElements.length} gene element(s) for gene:`,
        gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type
      );
    }

    // Auto-highlight sequence region if enabled
    if (genesSettings.autoHighlightSequence !== false) {
      this.highlightGeneSequence(gene);
    }
  }

  scrollBottomSequenceToGene(gene) {
    if (!gene || !this.navigationManager?.scrollToMatchPosition) return;

    const currentStart = this.currentPosition?.start ?? 0;
    const currentEnd = this.currentPosition?.end ?? 0;
    const geneStartZeroBased = Math.max(0, (parseInt(gene.start, 10) || 1) - 1);

    if (geneStartZeroBased < currentStart || geneStartZeroBased >= currentEnd) {
      console.log('Gene is outside current view, skipping bottom sequence scroll');
      return;
    }

    this.navigationManager.scrollToMatchPosition({
      position: geneStartZeroBased,
      end: Math.max(geneStartZeroBased, (parseInt(gene.end, 10) || gene.start) - 1),
      type: 'gene',
    });
  }

  /**
   * Apply the appropriate highlight effect to a gene element
   * @param {HTMLElement} element - The gene element to apply effect to
   * @param {string} effect - The highlight effect ('pulse', 'border', 'both')
   */
  applyHighlightEffect(element, effect) {
    // Remove existing highlight effect classes
    element.classList.remove('border-highlight');

    // Apply the selected effect
    switch (effect) {
      case 'border':
        element.classList.add('border-highlight');
        break;
      case 'both':
        element.classList.add('border-highlight');
        // Keep the default pulse animation (already applied by .selected class)
        break;
      case 'pulse':
      default:
        // Default pulse effect is already applied by .selected class
        break;
    }
  }

  /**
   * Refresh gene track if no elements were found for highlighting
   */
  refreshGeneTrackIfNeeded() {
    const currentChr = document.getElementById('chromosomeSelect')?.value;
    if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
      console.log('Refreshing gene track to ensure elements are present...');
      // Small delay to ensure the refresh happens after current execution
      setTimeout(() => {
        this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
      }, 100);
    }
  }

  showGeneDetailsPanel(options = {}) {
    const { syncTabState = true } = options;
    const geneDetailsSection = document.getElementById('geneDetailsSection');
    if (geneDetailsSection) {
      geneDetailsSection.style.display = 'block';
      this.uiManager.showSidebarIfHidden();

      // Update tab manager about sidebar panel state change
      if (syncTabState && this.tabManager) {
        this.tabManager.updateCurrentTabSidebarPanel('geneDetailsSection', true, geneDetailsSection.innerHTML);
      }

      // Scroll sidebar to bring gene details section into view
      this.scrollSidebarToSection(geneDetailsSection);
    }
  }

  /**
   * Coalesce rapid gene clicks and render the expensive details panel after the
   * browser has painted the track selection. This keeps hit feedback immediate
   * and prevents superseded clicks from building sidebar HTML unnecessarily.
   */
  scheduleGeneDetailsPanelUpdate(gene, operonInfo = null) {
    this._pendingGeneDetailsPanelUpdate = { gene, operonInfo };

    if (this._geneDetailsPanelFrame !== undefined && this._geneDetailsPanelFrame !== null) {
      cancelAnimationFrame(this._geneDetailsPanelFrame);
    }
    if (this._geneDetailsPanelTimer !== undefined && this._geneDetailsPanelTimer !== null) {
      clearTimeout(this._geneDetailsPanelTimer);
      this._geneDetailsPanelTimer = null;
    }

    this._geneDetailsPanelFrame = requestAnimationFrame(() => {
      this._geneDetailsPanelFrame = null;
      this._geneDetailsPanelTimer = setTimeout(() => {
        this._geneDetailsPanelTimer = null;
        const pending = this._pendingGeneDetailsPanelUpdate;
        this._pendingGeneDetailsPanelUpdate = null;
        if (!pending || this.selectedGene?.gene !== pending.gene) return;

        const panelWasVisible = document.getElementById('geneDetailsSection')?.style.display !== 'none';
        this.populateGeneDetails(pending.gene, pending.operonInfo);
        // populateGeneDetails already synchronized content when the panel was
        // visible; a hidden panel needs one synchronization when it is shown.
        this.showGeneDetailsPanel({ syncTabState: !panelWasVisible });
      }, 0);
    });
  }

  showPrimerDetailsPanel() {
    // Hide gene details panel — primers and genes are mutually exclusive
    const geneDetailsSection = document.getElementById('geneDetailsSection');
    if (geneDetailsSection) geneDetailsSection.style.display = 'none';

    const primerDetailsSection = document.getElementById('primerDetailsSection');
    if (primerDetailsSection) {
      primerDetailsSection.style.display = 'block';
      this.uiManager.showSidebarIfHidden();

      if (this.tabManager) {
        this.tabManager.updateCurrentTabSidebarPanel('geneDetailsSection', false, null);
        this.tabManager.updateCurrentTabSidebarPanel('primerDetailsSection', true, primerDetailsSection.innerHTML);
      }

      this.scrollSidebarToSection(primerDetailsSection);
    }
  }

  showReadDetailsPanel() {
    const readDetailsSection = document.getElementById('readDetailsSection');
    if (readDetailsSection) {
      readDetailsSection.style.display = 'block';
      this.uiManager.showSidebarIfHidden();

      // Update tab manager about sidebar panel state change
      if (this.tabManager) {
        this.tabManager.updateCurrentTabSidebarPanel('readDetailsSection', true, readDetailsSection.innerHTML);
      }

      // Scroll sidebar to bring read details section into view
      this.scrollSidebarToSection(readDetailsSection);
    }
  }

  showVariantDetailsPanel() {
    const variantDetailsSection = document.getElementById('variantDetailsSection');
    if (variantDetailsSection) {
      variantDetailsSection.style.display = 'block';
      this.uiManager.showSidebarIfHidden();

      // Update tab manager about sidebar panel state change
      if (this.tabManager) {
        this.tabManager.updateCurrentTabSidebarPanel('variantDetailsSection', true, variantDetailsSection.innerHTML);
      }

      // Scroll sidebar to bring variant details section into view
      this.scrollSidebarToSection(variantDetailsSection);
    }
  }

  /**
   * Unified Citation System for Gene Details
   * Collects and numbers all citations across all sections
   */

  /**
   * Add a citation to the unified citation collector
   * @param {string} citationType - Type of citation (PMID, DOI, etc.)
   * @param {string} citationId - The citation identifier
   * @param {string} citationText - Display text for the citation
   * @returns {number} The unified citation number
   */
  addUnifiedCitation(citationType, citationId, citationText = null) {
    const citationKey = `${citationType}:${citationId}`;

    if (!this.citationCollector.has(citationKey)) {
      this.citationCounter++;
      this.citationCollector.set(citationKey, {
        number: this.citationCounter,
        type: citationType,
        id: citationId,
        text: citationText || `${citationType}:${citationId}`,
        url: this.getCitationUrl(citationType, citationId),
      });
    }

    return this.citationCollector.get(citationKey).number;
  }

  /**
   * Get URL for a citation based on its type
   */
  getCitationUrl(citationType, citationId) {
    switch (citationType.toLowerCase()) {
      case 'pmid':
        return `https://pubmed.ncbi.nlm.nih.gov/${citationId}/`;
      case 'doi':
        return `https://doi.org/${citationId}`;
      case 'arxiv':
        return `https://arxiv.org/abs/${citationId}`;
      case 'biorxiv':
        return `https://www.biorxiv.org/content/10.1101/${citationId}`;
      case 'isbn':
        return `https://www.worldcat.org/isbn/${citationId}`;
      default:
        return null;
    }
  }

  /**
   * Process text and replace citations with unified numbered references
   * @param {string} text - The text to process
   * @returns {string} Text with unified citation numbers
   */
  processUnifiedCitations(text) {
    if (!text || typeof text !== 'string') return text;

    let processedText = text;

    // Pattern for CITS format: |CITS: [PMID1 PMID2]| or |CITS: 1 2 3|.
    // This runs before the patterns below so the bracketed PMID form is consumed as a
    // whole marker; otherwise genericPmidPattern eats the [PMID] and leaves the
    // surrounding "|CITS:" and "|" as literal text in the note.
    const citsPattern = /\|CITS:\s*(\[[\d\s,]*\]|[\d\s,]*)\|/gi;
    processedText = processedText.replace(citsPattern, (match, content) => {
      const ids = content
        .replace(/[[\]]/g, '')
        .split(/[\s,]+/)
        .filter(id => id.trim());
      if (ids.length === 0) return '';
      return ids
        .map(id => {
          // 6-10 digit values are PubMed IDs. Shorter values are reference numbers the
          // note already resolved elsewhere, so they must not become PubMed links.
          if (/^\d{6,10}$/.test(id)) {
            const citationNumber = this.addUnifiedCitation('PMID', id);
            return `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" class="pmid-link" title="View PubMed article ${id}"><sup>${citationNumber}</sup></a>`;
          }
          return `<sup class="cits-ref">${id}</sup>`;
        })
        .join('');
    });

    // Pattern for PMID references: PMID:1234567 or PMID 1234567.
    // Older PubMed records have short identifiers (PMID:28751), so the explicit
    // PMID prefix — not a digit-count guess — is what makes the match safe.
    const pmidPattern = /\b(PMID:?\s*(\d{1,10}))\b/gi;
    processedText = processedText.replace(pmidPattern, (match, fullMatch, pmidId) => {
      const citationNumber = this.addUnifiedCitation('PMID', pmidId);
      return `<a href="https://pubmed.ncbi.nlm.nih.gov/${pmidId}/" target="_blank" class="pmid-link" title="View PubMed article ${pmidId}"><sup>${citationNumber}</sup></a>`;
    });

    // Pattern for DOI references: doi:10.xxxx/xxxx or DOI:10.xxxx/xxxx
    const doiPattern = /\b(DOI|doi):\s*(10\.\d{4,}\/\S+)/gi;
    processedText = processedText.replace(doiPattern, (match, prefix, rawDoi) => {
      // A DOI that ends a sentence swallows the full stop; keep the sentence
      // punctuation as text so the link points at the DOI itself.
      const doiId = rawDoi.replace(/[.,;:]+$/, '');
      const trailing = rawDoi.slice(doiId.length);
      if (!doiId.includes('/')) return match;
      const citationNumber = this.addUnifiedCitation('DOI', doiId);
      return `<a href="https://doi.org/${doiId}" target="_blank" class="pmid-link" title="DOI:${doiId}"><sup>${citationNumber}</sup></a>${trailing}`;
    });

    // Pattern for ArXiv references: arXiv:1234.5678
    const arxivPattern = /\barXiv:(\d{4}\.\d{4,5}(v\d+)?)\b/gi;
    processedText = processedText.replace(arxivPattern, (match, arxivId) => {
      const citationNumber = this.addUnifiedCitation('arXiv', arxivId);
      return `<a href="https://arxiv.org/abs/${arxivId}" target="_blank" class="pmid-link" title="View on ArXiv"><sup>${citationNumber}</sup></a>`;
    });

    // Pattern for bioRxiv references: bioRxiv:1234.5678
    const biorxivPattern = /\bbioRxiv[:\s]+(\d{4}\.\d{2}\.\d{2}\.\d+)\b/gi;
    processedText = processedText.replace(biorxivPattern, (match, biorxivId) => {
      const citationNumber = this.addUnifiedCitation('bioRxiv', biorxivId);
      return `<a href="https://www.biorxiv.org/content/10.1101/${biorxivId}" target="_blank" class="pmid-link" title="View bioRxiv preprint"><sup>${citationNumber}</sup></a>`;
    });

    // Pattern for ISBN references: ISBN-13 or ISBN-10
    const isbnPattern = /\bISBN[:\s-]*(97[89][\d\s-]{10,17}|\d[\d\s-]{8,13}[0-9X])\b/gi;
    processedText = processedText.replace(isbnPattern, match => {
      const cleanIsbn = match.replace(/[^\d]/g, '');
      const citationNumber = this.addUnifiedCitation('ISBN', cleanIsbn);
      return `<a href="https://www.worldcat.org/isbn/${cleanIsbn}" target="_blank" class="pmid-link" title="Search book in WorldCat"><sup>${citationNumber}</sup></a>`;
    });

    // Pattern for generic numeric references in brackets: [1234567]
    const genericPmidPattern = /\[(\d{6,10})\]/g;
    processedText = processedText.replace(genericPmidPattern, (match, pmidId) => {
      // Skip if it's already part of a link
      if (processedText.includes(`href="https://pubmed.ncbi.nlm.nih.gov/${pmidId}"`)) {
        return match;
      }
      const citationNumber = this.addUnifiedCitation('PMID', pmidId);
      return `<a href="https://pubmed.ncbi.nlm.nih.gov/${pmidId}" target="_blank" class="pmid-link" title="View PubMed article ${pmidId}"><sup>${citationNumber}</sup></a>`;
    });

    return processedText;
  }

  /**
   * Generate unified citation list HTML
   * @returns {string} HTML for the citation list
   */
  generateUnifiedCitationList() {
    if (!this.citationCollector || this.citationCollector.size === 0) {
      return '';
    }

    console.log('Generating citation list...');
    console.log('Enhanced citation display available:', !!this.enhancedCitationDisplay);
    console.log('Citation count:', this.citationCollector.size);

    // Use enhanced citation display if available
    if (this.enhancedCitationDisplay) {
      console.log('Using enhanced citation display');
      const citations = Array.from(this.citationCollector.values());
      const result = this.enhancedCitationDisplay.generateEnhancedCitationList(citations);
      console.log('Enhanced citation display result length:', result.length);
      return result;
    }

    console.log('Using fallback citation display');
    // Fallback to original simple citation list
    const sortedCitations = Array.from(this.citationCollector.values()).sort((a, b) => a.number - b.number);

    let html = `
            <div class="gene-citations">
                <h4>References</h4>
                <div class="citation-list">
        `;

    sortedCitations.forEach(citation => {
      const linkText = citation.url
        ? `<a href="${citation.url}" target="_blank" class="citation-link">${citation.text}</a>`
        : citation.text;

      html += `
                <div class="citation-item">
                    <span class="citation-number">${citation.number}</span>
                    <span class="citation-content">${linkText}</span>
                </div>
            `;
    });

    html += `
                </div>
            </div>
        `;

    return html;
  }

  selectPrimer(primer) {
    this.clearGeneSelection();
    // Primers have their own selection state (they are oligos, not gene features).
    // selectedGene is also set so the shared highlight machinery keeps working.
    this.selectedPrimer = primer;
    this.selectedGene = { gene: primer, operonInfo: null };
    this.highlightSelectedGene(primer);
    this.trackRenderer?.highlightSelectedPrimerElement?.(primer);
    this.showPrimerSelectionFeedback(primer);
    this.populatePrimerDetails(primer);
    this.showPrimerDetailsPanel();
  }

  showPrimerSelectionFeedback(primer) {
    const primerName = primer.name || primer.qualifiers?.label || primer.qualifiers?.gene || 'Unnamed Primer';
    const message = `Selected primer: ${primerName}`;

    if (typeof this.showNotification === 'function') {
      this.showNotification(message, 'info');
    }

    this.updateStatus(message, {
      highlight: true,
      color: '#10b981',
      duration: 3000,
      restore: true,
    });
  }

  /**
   * Populate the dedicated Primer Details sidebar panel.
   * Uses the stored primer oligo sequence when present. The genomic binding
   * window is shown separately because primers can intentionally differ from
   * the reference sequence they bind.
   */
  populatePrimerDetails(primer) {
    const content = document.getElementById('primerDetailsContent');
    if (!content) return;

    const name = primer.name || primer.qualifiers?.label || primer.qualifiers?.gene || 'Unnamed Primer';
    const length = Math.abs(primer.end - primer.start) + 1;
    const isReversePrimer = primer.strand === -1 || primer.strand === '-';
    const strand = isReversePrimer ? 'Reverse (-)' : 'Forward (+)';
    const strandIcon = isReversePrimer ? 'fa-long-arrow-alt-left' : 'fa-long-arrow-alt-right';
    const desc = primer.description || primer.qualifiers?.note || '';
    const product = primer.qualifiers?.product || '';
    const currentChr = primer.chromosome || document.getElementById('chromosomeSelect')?.value;
    const genomeBindingSequence = this.getPrimerGenomeBindingSequence(primer, currentChr);
    const primerSequence = this.getPrimerOligoSequence(primer) || genomeBindingSequence;
    const mismatchSummary = this.getPrimerGenomeMismatchSummary(primerSequence, genomeBindingSequence);

    // Calculate properties via PrimerDesigner if available
    let props = null;
    if (primerSequence && window.PrimerDesigner) {
      try {
        props = window.PrimerDesigner.calculateProperties(primerSequence);
      } catch (e) {
        console.warn('PrimerDesigner.calculateProperties error:', e.message);
      }
    }

    // Fallback: parse from description metadata
    if (!props) {
      const tmMatch = desc.match(/Tm:\s*([\d.]+)/i);
      const gcMatch = desc.match(/GC:\s*([\d.]+)/i);
      props = {
        tm: tmMatch ? parseFloat(tmMatch[1]) : null,
        gcContent: gcMatch ? parseFloat(gcMatch[1]) : null,
        hasHairpinPotential: null,
        length: primerSequence.length || length,
      };
    }

    // Quality assessment
    const tmQuality = props.tm != null ? this._assessTmQuality(props.tm) : null;
    const gcQuality = props.gcContent != null ? this._assessGcQuality(props.gcContent) : null;
    const lengthQuality = this._assessLengthQuality(props.length || length);

    // Build HTML
    const safeName = this.escapeHtml(name);
    // Primer identity card
    let html = `
      <div class="primer-identity-card">
        <div class="primer-name">${safeName}</div>
        <div class="primer-badges">
          <span class="primer-type-badge"><i class="fas fa-vial"></i> primer</span>
          <span class="primer-strand-badge ${isReversePrimer ? 'reverse' : 'forward'}">
            <i class="fas ${strandIcon}"></i> ${strand}
          </span>
        </div>
        <div class="primer-position">
          <i class="fas fa-map-marker-alt"></i>
          ${this.escapeHtml(currentChr || 'chr')}:${primer.start.toLocaleString()}-${primer.end.toLocaleString()}
          <span class="primer-length-badge">${length} bp</span>
        </div>
      </div>
    `;

    // Action buttons — wired via event listeners after innerHTML is set (below)
    // to avoid inline onclick handlers that break when template-literal braces
    // get misinterpreted as HTML attribute boundaries.
    html += `
      <div class="primer-actions">
        <button class="primer-action-btn primer-zoom-btn" title="Zoom to primer region">
          <i class="fas fa-search-plus"></i> Zoom to
        </button>
        <button class="primer-action-btn primer-copy-btn" title="Copy sequence to clipboard" ${!primerSequence ? 'disabled' : ''}>
          <i class="fas fa-copy"></i> Copy Seq
        </button>
      </div>
    `;

    // Thermodynamic properties section
    if (props.tm != null || props.gcContent != null) {
      html += `<div class="primer-properties-section">
        <div class="primer-section-title"><i class="fas fa-thermometer-half"></i> Thermodynamic Properties</div>
        <div class="primer-props-grid">`;

      if (props.tm != null) {
        html += `
          <div class="primer-prop-card ${tmQuality?.class || ''}">
            <div class="primer-prop-label">Melting Temp (Tm)</div>
            <div class="primer-prop-value">${props.tm.toFixed(1)} °C</div>
            ${tmQuality ? `<div class="primer-prop-quality">${tmQuality.icon} ${tmQuality.text}</div>` : ''}
          </div>`;
      }

      if (props.gcContent != null) {
        html += `
          <div class="primer-prop-card ${gcQuality?.class || ''}">
            <div class="primer-prop-label">GC Content</div>
            <div class="primer-prop-value">${props.gcContent.toFixed(1)}%</div>
            ${gcQuality ? `<div class="primer-prop-quality">${gcQuality.icon} ${gcQuality.text}</div>` : ''}
          </div>`;
      }

      html += `
          <div class="primer-prop-card ${lengthQuality?.class || ''}">
            <div class="primer-prop-label">Length</div>
            <div class="primer-prop-value">${props.length || length} bp</div>
            ${lengthQuality ? `<div class="primer-prop-quality">${lengthQuality.icon} ${lengthQuality.text}</div>` : ''}
          </div>`;

      if (props.hasHairpinPotential != null) {
        html += `
          <div class="primer-prop-card ${props.hasHairpinPotential ? 'quality-warning' : 'quality-good'}">
            <div class="primer-prop-label">Hairpin Risk</div>
            <div class="primer-prop-value">${props.hasHairpinPotential ? 'Possible' : 'Low'}</div>
            <div class="primer-prop-quality">${props.hasHairpinPotential ? '⚠️ Self-complementary' : '✅ No hairpin'}</div>
          </div>`;
      }

      html += `</div></div>`;
    }

    // Sequence display
    if (primerSequence) {
      const coloredSeq = this.renderPrimerSequenceHtml(primerSequence, mismatchSummary.positions);
      const coloredGenomeSeq = genomeBindingSequence
        ? this.renderPrimerSequenceHtml(genomeBindingSequence, mismatchSummary.positions)
        : '';

      html += `
      <div class="primer-sequence-section">
        <div class="primer-section-title"><i class="fas fa-dna"></i> Primer Oligo Sequence (5' to 3')</div>
        <div class="primer-sequence-display">${coloredSeq}</div>
        ${
          genomeBindingSequence
            ? `<div class="primer-section-title primer-genome-binding-title"><i class="fas fa-map-pin"></i> Genomic Binding Window (${isReversePrimer ? 'reverse-complemented' : 'forward'})</div>
        <div class="primer-sequence-display primer-genome-sequence">${coloredGenomeSeq}</div>
        <div class="primer-mismatch-summary">${
          mismatchSummary.comparable
            ? mismatchSummary.count === 0
              ? 'Primer sequence matches the loaded genome at this binding window.'
              : `${mismatchSummary.count} base difference${mismatchSummary.count === 1 ? '' : 's'} versus the loaded genome at positions ${mismatchSummary.positions.map(pos => pos + 1).join(', ')}.`
            : 'Primer and genome window lengths differ, so base-by-base comparison was skipped.'
        }</div>`
            : ''
        }
      </div>`;
    }

    // Additional information (description, product, qualifiers)
    const infoItems = [];
    if (product) infoItems.push({ label: 'Product', value: product });
    if (desc && desc !== product) infoItems.push({ label: 'Note', value: desc });

    // Add other qualifiers (excluding ones we already show)
    const skipQualifiers = new Set(['gene', 'label', 'product', 'note', 'sequence', 'user_defined']);
    if (primer.qualifiers) {
      Object.entries(primer.qualifiers).forEach(([key, value]) => {
        if (skipQualifiers.has(key)) return;
        const strVal = String(value);
        if (strVal && strVal !== 'Unknown' && strVal.trim()) {
          infoItems.push({ label: key.replace(/_/g, ' '), value: strVal });
        }
      });
    }

    if (infoItems.length > 0) {
      html += `<div class="primer-info-section">
        <div class="primer-section-title"><i class="fas fa-info-circle"></i> Additional Information</div>`;
      infoItems.forEach(item => {
        html += `
          <div class="primer-info-row">
            <span class="primer-info-label">${this.escapeHtml(item.label)}</span>
            <span class="primer-info-value">${this.escapeHtml(item.value)}</span>
          </div>`;
      });
      html += `</div>`;
    }

    // AI action
    html += `
      <div class="primer-ai-section">
        <button class="primer-ai-btn primer-analyze-btn">
          <i class="fas fa-robot"></i> Analyze with AI
        </button>
        <button class="primer-ai-btn primer-binding-btn">
          <i class="fas fa-crosshairs"></i> Find Binding Sites
        </button>
      </div>
    `;

    content.innerHTML = html;

    content.querySelector('.primer-zoom-btn')?.addEventListener('click', () => {
      if (!window.genomeBrowser) return;
      const padding = Math.max(200, length * 3);
      const newStart = Math.max(0, primer.start - padding);
      const newEnd = primer.end + padding;
      window.genomeBrowser.currentPosition = { start: newStart, end: newEnd };
      const chr = document.getElementById('chromosomeSelect')?.value;
      if (chr && window.genomeBrowser.currentSequence?.[chr]) {
        window.genomeBrowser.displayGenomeView(chr, window.genomeBrowser.currentSequence[chr]);
        window.genomeBrowser.genomeNavigationBar?.update();
        window.genomeBrowser.tabManager?.updateCurrentTabPosition(chr, newStart + 1, newEnd, { source: 'navigation' });
      }
    });

    if (primerSequence) {
      content.querySelector('.primer-copy-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(primerSequence).then(() => {
          window.genomeBrowser?.showNotification('Primer sequence copied', 'success');
        });
      });
    }

    content.querySelector('.primer-analyze-btn')?.addEventListener('click', () => {
      if (!window.chatBox) return;
      window.chatBox.setInputText(`Please calculate the properties of this primer sequence: ${primerSequence || name}`);
      window.chatBox.focusInput();
    });

    content.querySelector('.primer-binding-btn')?.addEventListener('click', () => {
      if (!window.chatBox) return;
      window.chatBox.setInputText(`Find binding sites for primer ${name} in the current genome`);
      window.chatBox.focusInput();
    });
  }

  getPrimerOligoSequence(primer) {
    const sequence =
      primer.primerSequence ||
      primer.sequence ||
      primer.qualifiers?.sequence ||
      primer.qualifiers?.primer_sequence ||
      primer.qualifiers?.oligo_sequence;

    if (!sequence) return '';
    return String(sequence)
      .toUpperCase()
      .replace(/[^ATCGN]/g, '');
  }

  getPrimerGenomeBindingSequence(primer, chromosome = null) {
    if (primer.bindingSequence) {
      return String(primer.bindingSequence)
        .toUpperCase()
        .replace(/[^ATCGN]/g, '');
    }

    const chr = chromosome || primer.chromosome || document.getElementById('chromosomeSelect')?.value;
    const fullSequence = this.currentSequence ? this.currentSequence[chr] : null;
    if (!fullSequence || primer.start == null || primer.end == null) return '';

    const seqStart = Math.max(0, Math.min(primer.start, primer.end) - 1);
    const seqEnd = Math.min(fullSequence.length, Math.max(primer.start, primer.end));
    let sequence = fullSequence.substring(seqStart, seqEnd).toUpperCase();
    if (primer.strand === -1 || primer.strand === '-') {
      sequence = this.reverseComplementDNA(sequence);
    }
    return sequence.replace(/[^ATCGN]/g, '');
  }

  getPrimerGenomeMismatchSummary(primerSequence, genomeBindingSequence) {
    if (!primerSequence || !genomeBindingSequence || primerSequence.length !== genomeBindingSequence.length) {
      return { comparable: false, count: 0, positions: [] };
    }

    const positions = [];
    for (let i = 0; i < primerSequence.length; i++) {
      if (primerSequence[i] !== genomeBindingSequence[i]) positions.push(i);
    }

    return { comparable: true, count: positions.length, positions };
  }

  renderPrimerSequenceHtml(sequence, mismatchPositions = []) {
    const mismatchSet = new Set(mismatchPositions);
    return String(sequence)
      .split('')
      .map((base, index) => {
        const colors = { A: '#22c55e', T: '#ef4444', G: '#f59e0b', C: '#3b82f6', N: '#64748b' };
        const className = mismatchSet.has(index) ? ' primer-base-mismatch' : '';
        return `<span class="primer-base${className}" style="color: ${colors[base] || '#888'}">${this.escapeHtml(base)}</span>`;
      })
      .join('');
  }

  reverseComplementDNA(sequence) {
    const complement = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
    return String(sequence)
      .split('')
      .reverse()
      .map(base => complement[base] || base)
      .join('');
  }

  /** @private Assess melting temperature quality */
  _assessTmQuality(tm) {
    if (tm >= 55 && tm <= 65) return { class: 'quality-good', icon: '✅', text: 'Optimal (55-65°C)' };
    if (tm >= 50 && tm <= 70) return { class: 'quality-acceptable', icon: '🟡', text: 'Acceptable' };
    return { class: 'quality-warning', icon: '⚠️', text: tm < 50 ? 'Low — may not anneal' : 'High — may misprimed' };
  }

  /** @private Assess GC content quality */
  _assessGcQuality(gc) {
    if (gc >= 40 && gc <= 60) return { class: 'quality-good', icon: '✅', text: 'Optimal (40-60%)' };
    if (gc >= 30 && gc <= 70) return { class: 'quality-acceptable', icon: '🟡', text: 'Acceptable' };
    return { class: 'quality-warning', icon: '⚠️', text: gc < 30 ? 'AT-rich' : 'GC-rich' };
  }

  /** @private Assess primer length quality */
  _assessLengthQuality(len) {
    if (len >= 18 && len <= 25) return { class: 'quality-good', icon: '✅', text: 'Optimal (18-25 bp)' };
    if (len >= 15 && len <= 30) return { class: 'quality-acceptable', icon: '🟡', text: 'Acceptable' };
    return { class: 'quality-warning', icon: '⚠️', text: len < 15 ? 'Too short' : 'Too long' };
  }

  populateGeneDetails(gene, operonInfo = null) {
    const geneDetailsContent = document.getElementById('geneDetailsContent');
    if (!geneDetailsContent) return;

    // Get basic gene information
    const geneName = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.qualifiers?.product || 'Unknown Gene';
    const geneType = gene.type;
    const position = `${gene.start.toLocaleString()}-${gene.end.toLocaleString()}`;
    const length = (gene.end - gene.start + 1).toLocaleString();
    const strand = gene.strand === -1 ? 'Reverse (-)' : 'Forward (+)';

    // Get current chromosome and sequence for sequence extraction
    const currentChr = document.getElementById('chromosomeSelect').value;
    const fullSequence = this.currentSequence ? this.currentSequence[currentChr] : null;

    // Initialize unified citation system
    this.citationCollector = new Map(); // Will store all citations with their unified numbers
    this.citationCounter = 0;

    // Ensure enhanced citation display is available
    if (!this.enhancedCitationDisplay && window.EnhancedCitationDisplay && window.LiteratureAPIService) {
      console.log('Initializing enhanced citation display on demand...');
      try {
        this.enhancedCitationDisplay = new EnhancedCitationDisplay(this);
        this.enhancedCitationDisplay.init();
        window.enhancedCitationDisplay = this.enhancedCitationDisplay;
        console.log('Enhanced citation display initialized on demand');
      } catch (error) {
        console.error('Error initializing enhanced citation display on demand:', error);
      }
    }

    // Parse qualifiers to separate General, GO, EC, Pathways and Resources attributes
    let generalAttributesHtml = '';
    let functionAttributesHtml = '';
    let ecAttributesHtml = '';
    let pathwayAttributesHtml = '';
    let resourceAttributesHtml = '';

    if (gene.qualifiers && Object.keys(gene.qualifiers).length > 0) {
      Object.entries(gene.qualifiers).forEach(([key, value]) => {
        let valuesToDisplay = [];
        if (Array.isArray(value)) {
          valuesToDisplay = value.filter(v => {
            const stringValue = v != null ? String(v) : '';
            return stringValue && stringValue !== 'Unknown' && stringValue.trim() !== '';
          });
        } else {
          const stringValue = value != null ? String(value) : '';
          if (stringValue && stringValue !== 'Unknown' && stringValue.trim() !== '') {
            valuesToDisplay = [stringValue];
          }
        }

        valuesToDisplay.forEach((val, index) => {
          const lowerKey = key.toLowerCase();
          const normalizedKey = lowerKey.replace(/[\s-]+/g, '_');

          // The GenBank /note qualifier gets a dedicated, clearly labelled
          // presentation in General. Do not also render it as a generic
          // attribute, which makes it look like the app-only user notes.
          if (normalizedKey === 'note') return;

          const displayLabel = index === 0 ? key.replace(/_/g, ' ') : '';
          const attrHtml = `
                        <div class="gene-attribute">
                            <div class="gene-attribute-label">${displayLabel}</div>
                            <div class="gene-attribute-value">${this.processUnifiedCitations(this.enhanceGeneAttributeWithLinks(String(val)))}</div>
                        </div>
                    `;
          const looksLikeEcValue = /\b(?:EC[:\s]*)?\d{1,2}\.\d{1,3}\.\d{1,3}\.(?:\d{1,3}|-)\b/i.test(String(val));
          const isEcQualifier =
            normalizedKey === 'ec' ||
            normalizedKey === 'ec_number' ||
            normalizedKey === 'ec_numbers' ||
            normalizedKey.includes('enzyme_commission') ||
            (normalizedKey.includes('ec') && looksLikeEcValue);
          if (
            lowerKey.startsWith('go_') ||
            lowerKey.startsWith('go ') ||
            lowerKey === 'ontology_term' ||
            lowerKey.includes('go process') ||
            key === 'GO Process'
          ) {
            functionAttributesHtml += attrHtml;
          } else if (isEcQualifier) {
            ecAttributesHtml += attrHtml;
          } else if (lowerKey === 'ko' || lowerKey === 'kegg' || lowerKey === 'pathway') {
            pathwayAttributesHtml += attrHtml;
          } else if (lowerKey === 'db_xref') {
            resourceAttributesHtml += attrHtml;
          } else {
            generalAttributesHtml += attrHtml;
          }
        });
      });
    }

    if (generalAttributesHtml) {
      generalAttributesHtml = `<div class="gene-attributes"><h4>Attributes</h4>${generalAttributesHtml}</div>`;
    }
    if (functionAttributesHtml) {
      functionAttributesHtml = `<div class="gene-attributes"><h4>GO Annotations</h4>${functionAttributesHtml}</div>`;
    }
    if (ecAttributesHtml) {
      ecAttributesHtml = `<div class="gene-attributes"><h4>Enzyme Commission</h4>${ecAttributesHtml}</div>`;
    }
    if (pathwayAttributesHtml) {
      pathwayAttributesHtml = `<div class="gene-attributes"><h4>Pathway Annotations</h4>${pathwayAttributesHtml}</div>`;
    }
    if (resourceAttributesHtml) {
      resourceAttributesHtml = `<div class="gene-attributes"><h4>Database Cross-References</h4>${resourceAttributesHtml}</div>`;
    }

    // Create the gene details HTML container
    let html = `
            <div class="gene-details-info">
                <div class="gene-basic-info">
                    <div class="gene-name">${geneName}</div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span class="gene-type-badge" style="margin-bottom: 0;">${geneType}</span>
                        ${
                          operonInfo
                            ? `
                            <div class="gene-operon-tag" style="display: flex; align-items: center; gap: 6px; padding: 1px 8px; background: var(--bg-hover); border-radius: 4px; border: 1px solid var(--border-color); font-size: 11px; font-weight: 600; color: var(--text-color);">
                                <div style="width: 8px; height: 8px; background: ${operonInfo.color}; border-radius: 2px; border: 1px solid rgba(0,0,0,0.2);"></div>
                                <span>Operon: ${operonInfo.operonName || operonInfo.name}</span>
                            </div>
                        `
                            : ''
                        }
                    </div>
                    <div class="gene-position">Position: ${position}</div>
                    <div class="gene-strand">Strand: ${strand} | Length: ${length} bp</div>
                </div>
    `;

    html += `</div>`; // Close gene-details-info

    // Add Edit Annotation button above tabs
    html += `
            <div class="gene-actions" style="margin-bottom: 12px; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 8px;">
                <button class="btn gene-edit-btn gene-action-btn" onclick="window.genomeBrowser.editGeneAnnotation()">
                    <i class="fas fa-edit"></i> Edit Annotation
                </button>
                <button class="btn gene-zoom-btn gene-action-btn" onclick="window.genomeBrowser.zoomToGene()">
                    <i class="fas fa-search-plus"></i> Zoom to
                </button>
                <div id="deep-research-report-container" style="display: contents;"></div>
                <button class="btn gene-deep-research-btn gene-action-btn" onclick="window.genomeBrowser.openDeepGeneResearch('${geneName}')" title="Open Deep Research for this gene">
                    <i class="fas fa-search-plus"></i> Deep Research
                </button>
    `;

    if (geneType === 'CDS' || geneType === 'gene') {
      html += `
                <button class="btn gene-search-pdb-btn gene-action-btn" onclick="window.genomeBrowser.searchPDBStructures('${geneName}')" title="Search experimental structures in PDB">
                    <i class="fas fa-microscope"></i> Search PDB
                </button>
                <button class="btn gene-search-alphafold-btn gene-action-btn" onclick="window.genomeBrowser.searchAlphaFoldStructures('${geneName}')" title="Search AI-predicted structures in AlphaFold">
                    <i class="fas fa-brain"></i> Search AlphaFold
                </button>
            `;
    }

    html += `</div>`; // Close gene-actions

    // Calculate geneId for notes and attachments
    const geneId = this.geneAttachmentsManager
      ? this.geneAttachmentsManager.getGeneIdentifier(gene)
      : gene.qualifiers?.locus_tag || gene.qualifiers?.gene || `${gene.type}_${gene.start}_${gene.end}`;

    const renderTabEmptyState = message => `<div class="gene-tab-empty">${message}</div>`;

    const annotationNoteValues = this.getAllQualifierValues(gene.qualifiers, 'note').filter(
      value => value != null && String(value).trim()
    );
    // Deep Gene Research appends its curated note as an additional /note value.
    // Tag those values so the AI-curated addition is visually distinct from the
    // original GenBank annotation instead of blending into a single text block.
    const hasResearchNote = annotationNoteValues.some(value => this.getAnnotationNoteResearchDate(value));
    const annotationNoteHtml = `
      <div class="gene-annotation-note-section">
        <div class="gene-annotation-note-header">
          <h4><i class="fas fa-file-signature"></i> Annotation Note</h4>
          <span class="gene-annotation-note-badge">GenBank /note</span>
        </div>
        <p class="gene-annotation-note-help">Part of the genome annotation and included in GenBank exports. Use <strong>Edit Annotation</strong> to change it.</p>
        <div class="gene-annotation-note-content">
          ${
            annotationNoteValues.length > 0
              ? annotationNoteValues
                  .map(value => {
                    const researchDate = this.getAnnotationNoteResearchDate(value);
                    const sourceBadge = researchDate
                      ? `<span class="gene-annotation-note-source-badge research" title="Added by Deep Gene Research"><i class="fas fa-robot"></i> Deep Gene Research &middot; ${researchDate}</span>`
                      : hasResearchNote
                        ? '<span class="gene-annotation-note-source-badge original">Original annotation</span>'
                        : '';
                    const valueClass = researchDate
                      ? 'gene-annotation-note-value research-note'
                      : 'gene-annotation-note-value';
                    return `<div class="${valueClass}">${sourceBadge}${this.renderAnnotationNoteBody(String(value))}</div>`;
                  })
                  .join('')
              : '<div class="gene-tab-empty">No annotation note has been applied.</div>'
          }
        </div>
      </div>`;

    // ---------------- General Tab ----------------
    const citationList = this.generateUnifiedCitationList();
    let generalTabHtml = generalAttributesHtml + annotationNoteHtml;
    if (citationList) {
      generalTabHtml += citationList;
    }
    if (!generalTabHtml) {
      generalTabHtml = renderTabEmptyState('No general annotation qualifiers available.');
    }

    // ---------------- GO Tab ----------------
    const goTabHtml = functionAttributesHtml || renderTabEmptyState('No GO annotations available for this gene.');

    // ---------------- EC Tab ----------------
    const ecTabHtml =
      ecAttributesHtml || renderTabEmptyState('No Enzyme Commission annotations available for this gene.');

    // ---------------- Pathways Tab ----------------
    const pathwaysTabHtml =
      pathwayAttributesHtml || renderTabEmptyState('No pathway, KEGG, or KO annotations available for this gene.');

    // ---------------- Sequence Tab ----------------
    let sequenceTabHtml = '';
    if (fullSequence) {
      sequenceTabHtml += this.createSequencesSection(gene, fullSequence, geneName, currentChr);
    } else {
      sequenceTabHtml += renderTabEmptyState('Sequence data is not available for this chromosome.');
    }
    sequenceTabHtml += `<div class="gene-actions">
                <button class="btn gene-copy-btn gene-action-btn" onclick="window.genomeBrowser.copyCDSSequence()">
                    <i class="fas fa-copy"></i> Copy CDS Sequence
                </button>`;
    if (geneType === 'CDS' || (gene.qualifiers && this.getQualifierValue(gene.qualifiers, 'translation'))) {
      sequenceTabHtml += `
                <button class="btn gene-copy-translation-btn gene-action-btn" onclick="window.genomeBrowser.copyGeneTranslation()">
                    <i class="fas fa-copy"></i> Copy Translation
                </button>
            `;
    }
    sequenceTabHtml += `</div>`;

    // ---------------- User Notes Tab ----------------
    let userNotesTabHtml = '';
    if (this.geneNotesManager) {
      userNotesTabHtml = this.geneNotesManager.renderNotesSection(geneId);
    } else {
      userNotesTabHtml = `
                <div class="gene-notes-section gene-user-notes-section">
                    <div class="gene-notes-header">
                        <h4><i class="fas fa-sticky-note"></i> User Notes</h4>
                    </div>
                    <div class="gene-notes-content">
                        <p style="color: var(--text-muted);">User notes are initializing...</p>
                    </div>
                </div>
            `;
    }

    // ---------------- Resources Tab ----------------
    let resourcesTabHtml = '';
    if (this.geneAttachmentsManager) {
      resourcesTabHtml += this.geneAttachmentsManager.renderAttachmentsSection(geneId);
    } else {
      resourcesTabHtml += `
                <div class="gene-attachments">
                    <div class="gene-attachments-header">
                        <h4><i class="fas fa-paperclip"></i> Attachments</h4>
                        <button class="btn btn-sm gene-add-attachment-btn" disabled title="Attachments system not available">
                            <i class="fas fa-plus"></i> Add
                        </button>
                    </div>
                    <div class="gene-attachments-empty">
                        <p>Attachments system initializing...</p>
                    </div>
                </div>
            `;
    }
    resourcesTabHtml += resourceAttributesHtml;

    // ---------------- Review Tab ----------------
    const reviewTabHtml = `
      <div id="geneAnnotationReviewContent">
        <div class="annotation-review-loading"><i class="fas fa-spinner fa-spin"></i> Loading review status…</div>
      </div>`;

    const geneTabs = [
      { id: 'general', label: 'General', content: generalTabHtml },
      { id: 'go', label: 'GO', content: goTabHtml },
      { id: 'ec', label: 'EC', content: ecTabHtml },
      { id: 'pathways', label: 'Pathways', content: pathwaysTabHtml },
      { id: 'sequence', label: 'Sequence', content: sequenceTabHtml },
      { id: 'user-notes', label: 'User Notes', content: userNotesTabHtml },
      { id: 'resources', label: 'Resources', content: resourcesTabHtml },
      { id: 'review', label: 'Review', content: reviewTabHtml },
    ];

    // Begin Tabs implementation
    html += `
        <div class="gene-tabs-container">
            <div class="gene-tabs-header">
                ${geneTabs
                  .map(
                    (tab, index) =>
                      `<button class="gene-tab-btn${index === 0 ? ' active' : ''}" data-tab="${tab.id}">${tab.label}</button>`
                  )
                  .join('')}
            </div>
            ${geneTabs
              .map(
                (tab, index) =>
                  `<div class="gene-tab-content${index === 0 ? ' active' : ''}" id="tab-${tab.id}">${tab.content}</div>`
              )
              .join('')}
        `;

    html += `</div>`; // Close gene-tabs-container

    geneDetailsContent.innerHTML = html;

    // Check for Deep Research Report presence and add button if exists.
    this.addGeneResearchReportButton(geneName);

    // Add event listeners for expandable sections
    this.setupExpandableSequences();
    this.setupGeneDetailsTabs();
    if (this.annotationReviewManager) {
      void this.annotationReviewManager.renderGeneReview(geneId);
    }

    // Load literature data if enhanced citation display is available
    if (this.enhancedCitationDisplay && this.citationCollector.size > 0) {
      console.log('Loading literature data for citations...');
      this.enhancedCitationDisplay.loadLiteratureDataIfNeeded();
    } else {
      console.log('Enhanced citation display not available or no citations');
      console.log('Enhanced citation display available:', !!this.enhancedCitationDisplay);
      console.log('Citation count:', this.citationCollector.size);
    }

    // Update tab manager about gene details content change
    if (this.tabManager) {
      const geneDetailsSection = document.getElementById('geneDetailsSection');
      if (geneDetailsSection && geneDetailsSection.style.display !== 'none') {
        this.tabManager.updateCurrentTabSidebarPanel('geneDetailsSection', true, geneDetailsSection.innerHTML);
      }
    }
  }

  showAnnotationReviewCenter(changeSetId = null) {
    if (!this.annotationReviewManager) {
      this.showNotification('Annotation Review is not available.', 'error');
      return;
    }
    this.annotationReviewManager.showReviewCenter({ changeSetId });
  }

  async addGeneResearchReportButton(geneName) {
    try {
      const api = window.electronAPI;
      if (
        !api ||
        typeof api.checkGeneResearchReport !== 'function' ||
        typeof api.openGeneResearchReport !== 'function' ||
        typeof api.readGeneResearchReport !== 'function'
      ) {
        return;
      }

      const report = await api.checkGeneResearchReport(geneName || 'Unknown', {
        genomePath: this.loadedGenomePath || undefined,
      });
      if (!report || !report.success || !report.exists) {
        return;
      }

      const container = document.getElementById('deep-research-report-container');
      if (!container || container.querySelector('.gene-research-report-btn')) {
        return;
      }

      const btn = document.createElement('button');
      btn.className = 'btn gene-action-btn gene-research-report-btn';
      btn.style.backgroundColor = '#e3f2fd'; // Light blue background
      btn.style.color = '#1565C0'; // Darker blue text
      btn.style.borderColor = '#90CAF9';
      btn.style.marginBottom = '8px';
      btn.style.width = '100%';
      btn.style.fontWeight = '600';
      btn.innerHTML = '<i class="fas fa-file-alt"></i> View Research Report';
      btn.title = `Open report: ${report.fileName || 'Gene research report'}`;

      btn.onclick = async () => {
        try {
          const result = await api.openGeneResearchReport(geneName || 'Unknown', {
            genomePath: this.loadedGenomePath || undefined,
          });
          if (!result || !result.success) {
            notify(result?.error || 'Failed to open report file.', 'error');
          }
        } catch (error) {
          console.error('Failed to open report:', error);
          notify('Failed to open report file.', 'error');
        }
      };

      container.appendChild(btn);

      const mergeBtn = document.createElement('button');
      mergeBtn.className = 'btn gene-action-btn gene-research-report-merge-btn';
      mergeBtn.style.backgroundColor = '#e8f5e9';
      mergeBtn.style.color = '#1b5e20';
      mergeBtn.style.borderColor = '#a5d6a7';
      mergeBtn.style.marginBottom = '8px';
      mergeBtn.style.width = '100%';
      mergeBtn.style.fontWeight = '600';
      mergeBtn.innerHTML = '<i class="fas fa-code-merge"></i> Merge Research Report';
      mergeBtn.title = `Merge report evidence into ${geneName || 'selected gene'} annotation`;

      mergeBtn.onclick = async () => {
        await this.mergeDeepGeneResearchReport(geneName || 'Unknown');
      };

      container.appendChild(mergeBtn);
    } catch (error) {
      console.warn('Unable to check gene research report:', error.message || error);
    }
  }

  async mergeDeepGeneResearchReport(geneName) {
    try {
      const api = window.electronAPI;
      if (!api || typeof api.readGeneResearchReport !== 'function') {
        notify('Gene research report reader is not available.', 'error');
        return;
      }
      if (!this.chatManager || typeof this.chatManager.executeToolByName !== 'function') {
        notify('ChatManager tool execution is not available.', 'error');
        return;
      }

      const readResult = await api.readGeneResearchReport(geneName || 'Unknown', {
        genomePath: this.loadedGenomePath || undefined,
      });
      if (!readResult || !readResult.success) {
        notify(readResult?.error || 'Failed to read gene research report.', 'error');
        return;
      }

      const normalizeIdentifier = value => (Array.isArray(value) ? value[0] : value);
      const selectedQualifiers = this.selectedGene?.gene?.qualifiers || {};
      const identifier =
        normalizeIdentifier(selectedQualifiers.locus_tag) || normalizeIdentifier(selectedQualifiers.gene) || geneName;
      let parsedReport = null;
      if (typeof readResult.report === 'string') {
        const trimmedReport = readResult.report.trim();
        if (trimmedReport.startsWith('{') || trimmedReport.startsWith('[')) {
          try {
            parsedReport = JSON.parse(trimmedReport);
          } catch {
            parsedReport = null;
          }
        }
      }

      const reportPayload = parsedReport?.result || parsedReport;
      const result = await this.chatManager.executeToolByName(
        'merge_gene_research_report',
        {
          identifier,
          geneName,
          chromosome: this.currentChromosome,
          annotationProposal: reportPayload?.annotationProposal,
          report: reportPayload || readResult.report,
          sources: reportPayload?.sources,
          reportUrl: readResult.fileName ? `reports/${readResult.fileName}` : undefined,
          agent: 'deep-gene-research',
        },
        { bypassAgent: true }
      );

      if (!result || result.success === false) {
        notify(result?.error || 'Failed to merge gene research report.', 'error');
        return;
      }

      const updatedCount = result.updatedFields?.length || Object.keys(result.proposedUpdates || {}).length;
      notify(`Merged Deep Gene Research report into ${identifier} (${updatedCount} field updates).`, 'success');
    } catch (error) {
      console.error('Failed to merge Deep Gene Research report:', error);
      notify(`Failed to merge gene research report: ${error.message}`, 'error');
    }
  }

  /**
   * Set up tab switching logic for the Gene Details sidebar
   */
  setupGeneDetailsTabs() {
    const tabBtns = document.querySelectorAll('#geneDetailsContent .gene-tab-btn');
    const tabContents = document.querySelectorAll('#geneDetailsContent .gene-tab-content');
    const notesBtn = document.getElementById('geneNotesBtn');
    const syncNotesShortcut = activeTab => {
      if (notesBtn) {
        notesBtn.classList.toggle('active', activeTab?.dataset.tab === 'user-notes');
      }
    };

    syncNotesShortcut(document.querySelector('#geneDetailsContent .gene-tab-btn.active'));

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active class from all buttons and contents
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked button
        btn.classList.add('active');

        // Show corresponding content
        const tabId = `tab-${btn.dataset.tab}`;
        const targetContent = document.getElementById(tabId);
        if (targetContent) {
          targetContent.classList.add('active');
        }

        syncNotesShortcut(btn);
      });
    });
  }

  /**
   * Add an attachment to the currently selected gene
   */
  async addGeneAttachment() {
    if (!this.selectedGene || !this.selectedGene.gene) {
      this.showNotification('No gene selected', 'error');
      return;
    }

    if (!this.geneAttachmentsManager) {
      this.showNotification('Attachments system not available', 'error');
      return;
    }

    const gene = this.selectedGene.gene;
    const geneId = this.geneAttachmentsManager.getGeneIdentifier(gene);

    const result = await this.geneAttachmentsManager.addAttachment(geneId);

    if (result) {
      // Refresh the gene details to show new attachments
      this.refreshGeneAttachments(geneId);
    }
  }

  /**
   * Remove an attachment from a gene
   */
  async removeGeneAttachment(attachmentId, geneId) {
    if (!this.geneAttachmentsManager) {
      this.showNotification('Attachments system not available', 'error');
      return;
    }

    // Confirm deletion
    const confirmed = confirm('Are you sure you want to remove this attachment?');
    if (!confirmed) return;

    const success = await this.geneAttachmentsManager.removeAttachment(geneId, attachmentId);

    if (success) {
      // Refresh the attachments list
      this.refreshGeneAttachments(geneId);
    }
  }

  /**
   * Open an attachment file
   */
  async openGeneAttachment(attachmentId, geneId) {
    if (!this.geneAttachmentsManager) {
      this.showNotification('Attachments system not available', 'error');
      return;
    }

    await this.geneAttachmentsManager.openAttachment(attachmentId, geneId);
  }

  /**
   * Refresh the attachments section in the gene details panel
   */
  refreshGeneAttachments(geneId) {
    if (!this.geneAttachmentsManager) return;

    const attachmentsList = document.getElementById('geneAttachmentsList');
    if (!attachmentsList) return;
    attachmentsList.innerHTML = this.geneAttachmentsManager.renderAttachmentsList(geneId);
  }

  /**
   * Open User Notes from the shortcut button in the Gene Details header.
   */
  toggleGeneNotes() {
    const userNotesTab = document.querySelector('#geneDetailsContent .gene-tab-btn[data-tab="user-notes"]');
    const notesSection = document.querySelector('#tab-user-notes .gene-notes-section');
    if (!userNotesTab || !notesSection) {
      this.showNotification('User Notes are not available. Please select a gene first.', 'warning');
      return;
    }

    userNotesTab.click();
    const textarea = notesSection.querySelector('.gene-notes-textarea');
    if (textarea) {
      textarea.focus();
    }
  }

  /**
   * Save the current gene note
   */
  async saveGeneNote(geneId) {
    if (!this.geneNotesManager || !geneId) return;

    const textarea = document.getElementById('geneNoteTextarea');
    if (!textarea) return;

    const content = textarea.value;
    await this.geneNotesManager.saveNote(geneId, content);

    // Update the "updated" timestamp display
    const updatedSpan = document.querySelector('.gene-notes-updated');
    if (updatedSpan) {
      updatedSpan.textContent = 'Updated just now';
    }
  }

  populateReadDetails(read, fileInfo = null) {
    const readDetailsContent = document.getElementById('readDetailsContent');
    if (!readDetailsContent) return;

    // Ensure selectedRead is set for copy button functionality
    this.selectedRead = { read: read, fileInfo: fileInfo };
    console.log(
      'populateReadDetails called with read:',
      read.id || read.qname,
      'selectedRead set:',
      !!this.selectedRead
    );

    // Get basic read information
    const readName = read.id || read.qname || 'Unknown Read';
    const position = `${read.start.toLocaleString()}-${read.end.toLocaleString()}`;
    const length = (read.end - read.start + 1).toLocaleString();
    const strand = read.strand === '+' || read.strand === 1 ? 'Forward (+)' : 'Reverse (-)';

    // Get current chromosome for context
    const currentChr = document.getElementById('chromosomeSelect').value;

    // Create the read details HTML
    let html = `
            <div class="read-details-info">
                <div class="read-basic-info">
                    <div class="read-name">${readName}</div>
                    <div class="read-type-badge">Aligned Read</div>
                    <div class="read-position">Position: ${position}</div>
                    <div class="read-strand">Strand: ${strand} | Length: ${length} bp</div>
        `;

    // Add file information if available
    if (fileInfo) {
      html += `
                    <div class="read-file-info" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color);">
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            <strong>File:</strong> ${fileInfo.name || 'Unknown File'}
                        </div>
                    </div>
            `;
    }

    html += `</div>`;

    // Add sequences section if we have sequence data
    if (read.sequence || read.quality) {
      html += this.createReadSequencesSection(read, readName, currentChr);
    }

    // Add read attributes if available
    const attributes = this.getReadAttributes(read);
    if (Object.keys(attributes).length > 0) {
      html += `
                <div class="read-attributes">
                    <h4>Read Properties</h4>
            `;

      Object.entries(attributes).forEach(([key, value]) => {
        if (value != null && String(value).trim() !== '') {
          html += `
                        <div class="read-attribute">
                            <div class="read-attribute-label">${key.replace(/_/g, ' ')}</div>
                            <div class="read-attribute-value">${this.formatReadAttributeValue(key, value)}</div>
                        </div>
                    `;
        }
      });

      html += `</div>`;
    }

    // Add action buttons
    html += `
            <div class="read-actions">
                <button class="btn read-zoom-btn read-action-btn" onclick="window.genomeBrowser.zoomToRead()">
                    <i class="fas fa-search-plus"></i> Zoom to Read
                </button>
                <button class="btn read-copy-btn read-action-btn" onclick="window.genomeBrowser.copyReadSequence()">
                    <i class="fas fa-copy"></i> Copy Sequence
                </button>
        `;

    // Add copy quality button if quality data is available
    if (read.quality && read.quality.length > 0) {
      html += `
                <button class="btn read-copy-quality-btn read-action-btn" onclick="window.genomeBrowser.copyReadQuality()">
                    <i class="fas fa-copy"></i> Copy Quality
                </button>
            `;
    }

    html += `</div></div>`;

    readDetailsContent.innerHTML = html;

    // Add event listeners for expandable sequences
    this.setupExpandableReadSequences();
  }

  createReadSequencesSection(read, readName, chromosome) {
    let html = `
            <div class="read-sequences">
                <h4>Sequences</h4>
        `;

    // Add DNA sequence if available
    if (read.sequence && read.sequence.length > 0) {
      const sequencePreview = this.formatSequencePreview(read.sequence, 100);
      const sequenceFormatted = this.formatSequenceFull(read.sequence);

      html += `
                <div class="read-sequence-section">
                    <div class="read-sequence-header">
                        <span>DNA Sequence</span>
                        <div class="read-sequence-actions">
                            <button class="toggle-read-sequence-btn" onclick="window.genomeBrowser.toggleReadSequence('dna-${readName}')">
                                <i class="fas fa-expand-alt"></i> Show Full
                            </button>
                            <button class="copy-read-sequence-btn" onclick="window.genomeBrowser.copySpecificReadSequence('dna', '${readName}')">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                    <div class="read-sequence-content">
                        <div class="read-sequence-preview" id="dna-${readName}-preview">
                            ${sequencePreview}
                        </div>
                        <div class="read-sequence-full" id="dna-${readName}-full">
                            <div class="read-sequence-formatted">
                                ${sequenceFormatted}
                            </div>
                        </div>
                    </div>
                </div>
            `;
    }

    // Add quality scores if available
    if (read.quality && read.quality.length > 0) {
      const qualityPreview = this.formatQualityPreview(read.quality, 100);
      const qualityFormatted = this.formatQualityFull(read.quality);

      html += `
                <div class="read-sequence-section">
                    <div class="read-sequence-header">
                        <span>Quality Scores</span>
                        <div class="read-sequence-actions">
                            <button class="toggle-read-sequence-btn" onclick="window.genomeBrowser.toggleReadSequence('quality-${readName}')">
                                <i class="fas fa-expand-alt"></i> Show Full
                            </button>
                            <button class="copy-read-sequence-btn" onclick="window.genomeBrowser.copySpecificReadSequence('quality', '${readName}')">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                    <div class="read-sequence-content">
                        <div class="read-sequence-preview" id="quality-${readName}-preview">
                            ${qualityPreview}
                        </div>
                        <div class="read-sequence-full" id="quality-${readName}-full">
                            <div class="read-sequence-formatted">
                                ${qualityFormatted}
                            </div>
                        </div>
                    </div>
                </div>
            `;
    }

    // Add CIGAR string if available
    if (read.cigar && read.cigar.length > 0) {
      html += `
                <div class="read-sequence-section">
                    <div class="read-sequence-header">
                        <span>CIGAR String</span>
                        <div class="read-sequence-actions">
                            <button class="copy-read-sequence-btn" onclick="window.genomeBrowser.copySpecificReadSequence('cigar', '${readName}')">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                    <div class="read-sequence-content">
                        <div class="read-sequence-preview">
                            <code style="font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all;">${read.cigar}</code>
                        </div>
                    </div>
                </div>
            `;
    }

    html += `</div>`;
    return html;
  }

  getReadAttributes(read) {
    const attributes = {};

    // Basic read properties
    if (read.mappingQuality != null) {
      attributes['Mapping Quality'] = read.mappingQuality;
    }

    if (read.flags != null) {
      attributes['SAM Flags'] = `${read.flags} (${this.interpretSamFlags(read.flags)})`;
    }

    if (read.templateLength != null && read.templateLength !== 0) {
      attributes['Template Length'] = read.templateLength;
    }

    if (read.chromosome) {
      attributes['Reference'] = read.chromosome;
    }

    // Add mutations if available
    if (read.mutations && read.mutations.length > 0) {
      attributes['Mutations'] = `${read.mutations.length} variants detected`;
    }

    // Add tags if available
    if (read.tags && Object.keys(read.tags).length > 0) {
      Object.entries(read.tags).forEach(([tag, value]) => {
        attributes[`Tag ${tag}`] = value;
      });
    }

    return attributes;
  }

  formatReadAttributeValue(key, value) {
    // Special formatting for certain attributes
    if (key.toLowerCase().includes('quality')) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        let qualityClass = 'quality-low';
        if (numValue >= 30) qualityClass = 'quality-high';
        else if (numValue >= 20) qualityClass = 'quality-medium';

        return `<span class="${qualityClass}" style="font-weight: 600;">${value}</span>`;
      }
    }

    if (key.toLowerCase().includes('flags')) {
      return `<code style="font-family: 'Courier New', monospace; font-size: 11px;">${value}</code>`;
    }

    return value;
  }

  /**
   * Populate sidebar with details for a specific read mutation
   */
  populateReadMutationDetails(read, mutation) {
    const variantContent = document.getElementById('variantDetailsContent');
    if (!variantContent) return;

    const readName = read.id || read.qname || 'Unknown Read';
    const position = mutation.position.toLocaleString();
    const type = mutation.type.charAt(0).toUpperCase() + mutation.type.slice(1);

    const detailsHTML = `
            <div class="read-mutation-details">
                <div class="mutation-header" style="background: rgba(255, 152, 0, 0.1); border-left: 4px solid #FF9800; padding: 12px; margin-bottom: 15px; border-radius: 0 4px 4px 0;">
                    <div style="font-size: 14px; font-weight: 600; color: #E65100;">READ-LEVEL MUTATION</div>
                    <div style="font-size: 18px; font-weight: 700; margin: 5px 0;">${type} at ${position}</div>
                    <div style="font-size: 12px; color: #555;">Detected in aligned sequence of read ${readName}</div>
                </div>

                <div class="mutation-info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                    <div class="info-item" style="background: #f8f9fa; padding: 10px; border-radius: 4px; border: 1px solid #eee;">
                        <div style="font-size: 11px; color: #777; text-transform: uppercase;">Mutation Type</div>
                        <div style="font-weight: 600;">${type}</div>
                    </div>
                    <div class="info-item" style="background: #f8f9fa; padding: 10px; border-radius: 4px; border: 1px solid #eee;">
                        <div style="font-size: 11px; color: #777; text-transform: uppercase;">Genomic Position</div>
                        <div style="font-weight: 600;">${position}</div>
                    </div>
                    <div class="info-item" style="background: #f8f9fa; padding: 10px; border-radius: 4px; border: 1px solid #eee;">
                        <div style="font-size: 11px; color: #777; text-transform: uppercase;">Reference</div>
                        <div style="font-weight: 700; color: #d32f2f;">${mutation.refSequence || (mutation.type === 'insertion' ? '-' : 'N')}</div>
                    </div>
                    <div class="info-item" style="background: #f8f9fa; padding: 10px; border-radius: 4px; border: 1px solid #eee;">
                        <div style="font-size: 11px; color: #777; text-transform: uppercase;">Alternate</div>
                        <div style="font-weight: 700; color: #2e7d32;">${mutation.sequence || (mutation.type === 'deletion' ? '-' : 'N')}</div>
                    </div>
                </div>

                <div class="read-context" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px;">Source Read Context</h4>
                    <div style="font-size: 12px; margin-bottom: 5px;"><strong>Read ID:</strong> ${readName}</div>
                    <div style="font-size: 12px; margin-bottom: 5px;"><strong>Mapping Quality:</strong> ${read.mappingQuality || 0}</div>
                    <div style="font-size: 12px; margin-bottom: 10px;"><strong>Strand:</strong> ${read.strand === '+' || read.strand === 1 ? 'Forward (+)' : 'Reverse (-)'}</div>
                    
                    <button class="btn btn-sm" onclick="window.genomeBrowser.selectReadById('${read.id}')" style="width: 100%; margin-top: 10px; background: #fff; border: 1px solid #ccc;">
                        <i class="fas fa-align-left"></i> View Full Read Details
                    </button>
                </div>
            </div>
        `;

    variantContent.innerHTML = detailsHTML;
  }

  interpretSamFlags(flags) {
    const flagMeanings = [];
    if (flags & 0x1) flagMeanings.push('paired');
    if (flags & 0x2) flagMeanings.push('proper_pair');
    if (flags & 0x4) flagMeanings.push('unmapped');
    if (flags & 0x8) flagMeanings.push('mate_unmapped');
    if (flags & 0x10) flagMeanings.push('reverse');
    if (flags & 0x20) flagMeanings.push('mate_reverse');
    if (flags & 0x40) flagMeanings.push('read1');
    if (flags & 0x80) flagMeanings.push('read2');
    if (flags & 0x100) flagMeanings.push('secondary');
    if (flags & 0x200) flagMeanings.push('qcfail');
    if (flags & 0x400) flagMeanings.push('duplicate');
    if (flags & 0x800) flagMeanings.push('supplementary');

    return flagMeanings.length > 0 ? flagMeanings.join(', ') : 'none';
  }

  formatQualityPreview(quality, maxLength = 60) {
    if (!quality || quality.length === 0) return 'No quality data';

    const qualityStr =
      typeof quality === 'string' ? quality : Array.isArray(quality) ? quality.join(' ') : String(quality);

    if (qualityStr.length <= maxLength) {
      return qualityStr;
    }

    return qualityStr.substring(0, maxLength) + '...';
  }

  formatQualityWithLineNumbers(quality, startPosition = 1) {
    if (!quality || quality.length === 0) return 'No quality data';

    const qualityStr =
      typeof quality === 'string' ? quality : Array.isArray(quality) ? quality.join(' ') : String(quality);

    const lines = [];
    const charsPerLine = 60;

    for (let i = 0; i < qualityStr.length; i += charsPerLine) {
      const lineNumber = Math.floor(i / charsPerLine) * charsPerLine + startPosition;
      const line = qualityStr.substring(i, i + charsPerLine);
      lines.push(`<span class="sequence-position">${lineNumber.toString().padStart(8, ' ')}</span>${line}`);
    }

    return lines.join('<br>');
  }

  /**
   * Format quality scores for full display without line numbers (for read details)
   */
  formatQualityFull(quality) {
    if (!quality || quality.length === 0) return 'No quality data';

    const qualityStr =
      typeof quality === 'string' ? quality : Array.isArray(quality) ? quality.join(' ') : String(quality);

    // Display entire quality string as one continuous line without breaking
    return `<div class="quality-full-line">${qualityStr}</div>`;
  }

  setupExpandableReadSequences() {
    // This will be called after the HTML is inserted to set up event listeners
    // for expandable sequence sections in read details
  }

  /**
   * Enhance gene attribute values with clickable links for GO terms, PMIDs, and other database references
   */
  enhanceGeneAttributeWithLinks(attributeValue) {
    if (!attributeValue || typeof attributeValue !== 'string') {
      return attributeValue;
    }

    // Qualifiers may originate in external research records. Escape the raw
    // value before selectively adding the trusted links below so a citation-
    // rich DGR note cannot inject markup into the gene sidebar.
    let enhancedValue = attributeValue
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Notes routinely italicise species and gene names (<i>E. coli</i>). Restore that
    // small set of attribute-free inline tags after escaping so they render instead of
    // showing as literal markup, while every other tag stays escaped.
    enhancedValue = enhancedValue
      .replace(/&lt;(\/?)(i|em|b|strong|sub|sup|u)&gt;/gi, '<$1$2>')
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>');

    // Pattern for GO terms: GO:XXXXXXX or goid XXXXXXX
    const goTermPattern = /\b(GO:\d{7}|goid\s+(\d{7}))\b/gi;
    enhancedValue = enhancedValue.replace(goTermPattern, (match, fullMatch, goidNumber) => {
      const goId = goidNumber ? `GO:${goidNumber}` : fullMatch;
      return `<a href="https://amigo.geneontology.org/amigo/term/${goId}" target="_blank" class="go-term-link" title="View in Gene Ontology database">${goId}</a>`;
    });

    // PMID references are now handled by the unified citation system in processUnifiedCitations()

    // Pattern for evidence codes in brackets: [evidence XXX]
    const evidencePattern = /\[evidence\s+([A-Z]{2,4})\]/gi;
    enhancedValue = enhancedValue.replace(evidencePattern, (match, evidenceCode) => {
      return `<span class="evidence-tag" title="Evidence code: ${evidenceCode}">${evidenceCode}</span>`;
    });

    // Pattern for database cross-references - expanded to include many more databases.
    // DOI is deliberately absent: its identifiers contain "/", which this id
    // character class cannot hold, so a DOI matched here would be truncated at
    // the registrant prefix. DOIs are citations and are numbered by
    // processUnifiedCitations() instead.
    const dbXrefPattern =
      /\b(UniProt|SwissProt|TrEMBL|InterPro|Pfam|KEGG|COG|KO|PROSITE|SMART|SUPERFAMILY|PRINTS|PANTHER|TIGRFAM|HAMAP|PIR|PDB|RefSeq|GenBank|EMBL|DDBJ|CDD|OrthoDB|EggNOG|STRING|Reactome|BioCyc|MetaCyc|EcoCyc|ENZYME|BRENDA|ExPASy|NCBI|ENSEMBL|FlyBase|WormBase|SGD|MGI|RGD|ZFIN|TAIR|MaizeGDB|Gramene|PlantGDB|Phytozome|JGI|PubChem|ChEBI|ChEMBL|DrugBank)[:=]\s*([A-Za-z0-9_\-.:]+)\b/gi;
    enhancedValue = enhancedValue.replace(dbXrefPattern, (match, database, id) => {
      let url = '';
      let title = '';

      switch (database.toLowerCase()) {
        case 'uniprot':
        case 'swissprot':
        case 'trembl':
          url = `https://www.uniprot.org/uniprot/${id}`;
          title = 'View in UniProt';
          break;
        case 'interpro':
          url = `https://www.ebi.ac.uk/interpro/entry/${id}`;
          title = 'View in InterPro';
          break;
        case 'pfam':
          url = `https://pfam.xfam.org/family/${id}`;
          title = 'View in Pfam';
          break;
        case 'kegg':
          // Handle KEGG IDs like 'eco:b4024'
          if (id.includes(':')) {
            const [org, keggId] = id.split(':');
            url = `https://www.genome.jp/dbget-bin/www_bget?${org}:${keggId}`;
          } else {
            url = `https://www.genome.jp/dbget-bin/www_bget?${id}`;
          }
          title = 'View in KEGG';
          break;
        case 'ecocyc':
          url = `https://ecocyc.org/gene?orgid=ECOLI&id=${id}`;
          title = 'View in EcoCyc';
          break;
        case 'cog':
          url = `https://www.ncbi.nlm.nih.gov/Structure/cdd/cddsrv.cgi?uid=${id}`;
          title = 'View in COG database';
          break;
        case 'ko':
          url = `https://www.genome.jp/kegg-bin/show_pathway?ko${id}`;
          title = 'View in KEGG Orthology';
          break;
        case 'prosite':
          url = `https://prosite.expasy.org/PS${id}`;
          title = 'View in PROSITE';
          break;
        case 'smart':
          url = `http://smart.embl-heidelberg.de/smart/do_annotation.pl?DOMAIN=${id}`;
          title = 'View in SMART';
          break;
        case 'superfamily':
          url = `https://supfam.org/SUPERFAMILY/cgi-bin/scop.cgi?ipid=${id}`;
          title = 'View in SUPERFAMILY';
          break;
        case 'prints':
          url = `http://www.bioinf.manchester.ac.uk/cgi-bin/dbbrowser/sprint/searchprintss.cgi?prints_accn=${id}`;
          title = 'View in PRINTS';
          break;
        case 'panther':
          url = `http://www.pantherdb.org/panther/family.do?clsAccession=${id}`;
          title = 'View in PANTHER';
          break;
        case 'tigrfam':
          url = `https://www.jcvi.org/cgi-bin/tigrfams/HmmReportPage.cgi?acc=${id}`;
          title = 'View in TIGRFAMs';
          break;
        case 'hamap':
          url = `https://hamap.expasy.org/signature/${id}`;
          title = 'View in HAMAP';
          break;
        case 'pir':
          url = `https://pir.georgetown.edu/cgi-bin/ipcEntry?id=${id}`;
          title = 'View in PIR';
          break;
        case 'pdb':
          url = `https://www.rcsb.org/structure/${id}`;
          title = 'View in Protein Data Bank';
          break;
        case 'refseq':
          url = `https://www.ncbi.nlm.nih.gov/protein/${id}`;
          title = 'View in RefSeq';
          break;
        case 'genbank':
        case 'embl':
        case 'ddbj':
          url = `https://www.ncbi.nlm.nih.gov/nuccore/${id}`;
          title = 'View in GenBank/EMBL/DDBJ';
          break;
        case 'cdd':
          url = `https://www.ncbi.nlm.nih.gov/Structure/cdd/cddsrv.cgi?uid=${id}`;
          title = 'View in Conserved Domain Database';
          break;
        case 'orthodb':
          url = `https://www.orthodb.org/?query=${id}`;
          title = 'View in OrthoDB';
          break;
        case 'eggnog':
          url = `http://eggnog5.embl.de/#/app/results?target_nogs=${id}`;
          title = 'View in eggNOG';
          break;
        case 'string':
          url = `https://string-db.org/network/${id}`;
          title = 'View in STRING';
          break;
        case 'reactome':
          url = `https://reactome.org/content/detail/${id}`;
          title = 'View in Reactome';
          break;
        case 'biocyc':
        case 'metacyc':
          url = `https://biocyc.org/gene?orgid=META&id=${id}`;
          title = 'View in BioCyc/MetaCyc';
          break;
        case 'enzyme':
          url = `https://enzyme.expasy.org/EC/${id}`;
          title = 'View in ENZYME';
          break;
        case 'brenda':
          url = `https://www.brenda-enzymes.org/enzyme.php?ecno=${id}`;
          title = 'View in BRENDA';
          break;
        case 'expasy':
          url = `https://enzyme.expasy.org/EC/${id}`;
          title = 'View in ExPASy';
          break;
        case 'ncbi':
          url = `https://www.ncbi.nlm.nih.gov/gene/${id}`;
          title = 'View in NCBI Gene';
          break;
        case 'ensembl':
          url = `https://www.ensembl.org/id/${id}`;
          title = 'View in Ensembl';
          break;
        case 'flybase':
          url = `https://flybase.org/reports/${id}`;
          title = 'View in FlyBase';
          break;
        case 'wormbase':
          url = `https://wormbase.org/species/c_elegans/gene/${id}`;
          title = 'View in WormBase';
          break;
        case 'sgd':
          url = `https://www.yeastgenome.org/locus/${id}`;
          title = 'View in SGD (Yeast)';
          break;
        case 'mgi':
          url = `http://www.informatics.jax.org/marker/${id}`;
          title = 'View in MGI (Mouse)';
          break;
        case 'rgd':
          url = `https://rgd.mcw.edu/rgdweb/report/gene/main.html?id=${id}`;
          title = 'View in RGD (Rat)';
          break;
        case 'zfin':
          url = `https://zfin.org/${id}`;
          title = 'View in ZFIN (Zebrafish)';
          break;
        case 'tair':
          url = `https://www.arabidopsis.org/servlets/TairObject?type=locus&name=${id}`;
          title = 'View in TAIR (Arabidopsis)';
          break;
        case 'maizegdb':
          url = `https://www.maizegdb.org/gene_center/gene/${id}`;
          title = 'View in MaizeGDB';
          break;
        case 'gramene':
          url = `http://www.gramene.org/genes/${id}`;
          title = 'View in Gramene';
          break;
        case 'plantgdb':
          url = `http://www.plantgdb.org/cgi-bin/searchdb.cgi?input=${id}`;
          title = 'View in PlantGDB';
          break;
        case 'phytozome':
          url = `https://phytozome.jgi.doe.gov/pz/portal.html#!gene?search=0&detail=0&method=5450&searchText=${id}`;
          title = 'View in Phytozome';
          break;
        case 'jgi':
          url = `https://genome.jgi.doe.gov/portal/pages/dynamicOrganismDownload.jsf?organism=${id}`;
          title = 'View in JGI';
          break;
        case 'pubchem':
          url = `https://pubchem.ncbi.nlm.nih.gov/compound/${id}`;
          title = 'View in PubChem';
          break;
        case 'chebi':
          url = `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${id}`;
          title = 'View in ChEBI';
          break;
        case 'chembl':
          url = `https://www.ebi.ac.uk/chembl/compound_report_card/${id}`;
          title = 'View in ChEMBL';
          break;
        case 'drugbank':
          url = `https://go.drugbank.com/drugs/${id}`;
          title = 'View in DrugBank';
          break;
      }

      if (url) {
        return `<a href="${url}" target="_blank" class="db-xref-link" title="${title}">${database}:${id}</a>`;
      }
      return match;
    });

    // Pattern for EC numbers: EC:X.X.X.X or EC X.X.X.X
    const ecPattern = /\b(EC:?\s*([\d.-]+))\b/gi;
    enhancedValue = enhancedValue.replace(ecPattern, (match, fullMatch, ecNumber) => {
      return `<a href="https://enzyme.expasy.org/EC/${ecNumber}" target="_blank" class="db-xref-link" title="View in ENZYME database">EC:${ecNumber}</a>`;
    });

    // Pattern for standalone EC numbers: X.X.X.X (without EC: prefix)
    const standaloneEcPattern = /\b(\d{1,2}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/gi;
    enhancedValue = enhancedValue.replace(standaloneEcPattern, match => {
      // Don't replace if it's already part of an EC: link or other context
      if (enhancedValue.includes(`EC:${match}`) || enhancedValue.includes(`>${match}<`)) {
        return match;
      }
      return `<a href="https://enzyme.expasy.org/EC/${match}" target="_blank" class="db-xref-link" title="View in ENZYME database">${match}</a>`;
    });

    // CITS format is now handled by the unified citation system in processUnifiedCitations()

    // Pattern for GenBank/RefSeq accessions: Various formats
    const accessionPattern =
      /\b([A-Z]{1,2}_?[0-9]{6,9}(\.[0-9]+)?|[A-Z]{2}[0-9]{6}(\.[0-9]+)?|[A-Z]{4}[0-9]{8}(\.[0-9]+)?|NC_[0-9]{6}(\.[0-9]+)?|NP_[0-9]{6}(\.[0-9]+)?|XP_[0-9]{6}(\.[0-9]+)?|YP_[0-9]{6}(\.[0-9]+)?|WP_[0-9]{6}(\.[0-9]+)?)\b/gi;
    enhancedValue = enhancedValue.replace(accessionPattern, match => {
      let url = '';
      let title = '';

      if (match.match(/^(NC_|NP_|XP_|YP_|WP_|[A-Z]{1,2}_)/)) {
        // RefSeq accessions
        if (match.startsWith('NP_') || match.startsWith('XP_') || match.startsWith('YP_') || match.startsWith('WP_')) {
          url = `https://www.ncbi.nlm.nih.gov/protein/${match}`;
          title = 'View protein in NCBI';
        } else {
          url = `https://www.ncbi.nlm.nih.gov/nuccore/${match}`;
          title = 'View nucleotide in NCBI';
        }
      } else {
        // GenBank accessions
        url = `https://www.ncbi.nlm.nih.gov/nuccore/${match}`;
        title = 'View in GenBank';
      }

      return `<a href="${url}" target="_blank" class="db-xref-link" title="${title}">${match}</a>`;
    });

    // Pattern for Taxonomy IDs: taxon:12345 or NCBI:txid12345
    const taxonPattern = /\b(taxon:(\d+)|NCBI:txid(\d+))\b/gi;
    enhancedValue = enhancedValue.replace(taxonPattern, (match, fullMatch, taxonId1, taxonId2) => {
      const taxId = taxonId1 || taxonId2;
      return `<a href="https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${taxId}" target="_blank" class="db-xref-link" title="View in NCBI Taxonomy">${match}</a>`;
    });

    // Pattern for Gene IDs: GeneID:12345
    const geneIdPattern = /\bGeneID:(\d+)\b/gi;
    enhancedValue = enhancedValue.replace(geneIdPattern, (match, geneId) => {
      return `<a href="https://www.ncbi.nlm.nih.gov/gene/${geneId}" target="_blank" class="db-xref-link" title="View in NCBI Gene">GeneID:${geneId}</a>`;
    });

    // Pattern for OMIM IDs: OMIM:123456
    const omimPattern = /\bOMIM:(\d+)\b/gi;
    enhancedValue = enhancedValue.replace(omimPattern, (match, omimId) => {
      return `<a href="https://omim.org/entry/${omimId}" target="_blank" class="db-xref-link" title="View in OMIM">${match}</a>`;
    });

    // Pattern for dbSNP IDs: rs123456789
    const dbsnpPattern = /\brs(\d+)\b/gi;
    enhancedValue = enhancedValue.replace(dbsnpPattern, (match, snpId) => {
      return `<a href="https://www.ncbi.nlm.nih.gov/snp/rs${snpId}" target="_blank" class="db-xref-link" title="View in dbSNP">${match}</a>`;
    });

    // Pattern for Protein IDs: protein_id="XXX"
    const proteinIdPattern = /protein_id="([A-Z]{2,3}[0-9]{5,9}(\.[0-9]+)?)"/gi;
    enhancedValue = enhancedValue.replace(proteinIdPattern, (match, proteinId) => {
      return `protein_id="<a href="https://www.ncbi.nlm.nih.gov/protein/${proteinId}" target="_blank" class="db-xref-link" title="View protein in NCBI">${proteinId}</a>"`;
    });

    // Pattern for locus_tag: locus_tag="XXX"
    const locusTagPattern = /locus_tag="([^"]+)"/gi;
    enhancedValue = enhancedValue.replace(locusTagPattern, (match, locusTag) => {
      return `locus_tag="<a href="https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(locusTag)}" target="_blank" class="db-xref-link" title="Search locus tag in NCBI">${locusTag}</a>"`;
    });

    // Pattern for Gene Symbols: gene="XXX"
    const geneSymbolPattern = /gene="([^"]+)"/gi;
    enhancedValue = enhancedValue.replace(geneSymbolPattern, (match, geneSymbol) => {
      return `gene="<a href="https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(geneSymbol)}" target="_blank" class="db-xref-link" title="Search gene symbol in NCBI">${geneSymbol}</a>"`;
    });

    // Pattern for ORCID IDs: 0000-0000-0000-0000
    const orcidPattern = /\b(\d{4}-\d{4}-\d{4}-\d{3}[0-9X])\b/gi;
    enhancedValue = enhancedValue.replace(orcidPattern, match => {
      return `<a href="https://orcid.org/${match}" target="_blank" class="db-xref-link" title="View ORCID profile">${match}</a>`;
    });

    // Pattern for ArXiv IDs: arXiv:1234.5678
    const arxivPattern = /\barXiv:(\d{4}\.\d{4,5}(v\d+)?)\b/gi;
    enhancedValue = enhancedValue.replace(arxivPattern, (match, arxivId) => {
      return `<a href="https://arxiv.org/abs/${arxivId}" target="_blank" class="pmid-link" title="View on ArXiv">${match}</a>`;
    });

    // Pattern for bioRxiv DOIs: bioRxiv preprint
    const biorxivPattern = /\bbioRxiv[:\s]+(\d{4}\.\d{2}\.\d{2}\.\d+)\b/gi;
    enhancedValue = enhancedValue.replace(biorxivPattern, (match, biorxivId) => {
      return `<a href="https://www.biorxiv.org/content/10.1101/${biorxivId}" target="_blank" class="pmid-link" title="View bioRxiv preprint">bioRxiv:${biorxivId}</a>`;
    });

    // Pattern for ISBN: ISBN-13 or ISBN-10
    const isbnPattern = /\bISBN[:\s-]*(97[89][\d\s-]{10,17}|\d[\d\s-]{8,13}[0-9X])\b/gi;
    enhancedValue = enhancedValue.replace(isbnPattern, match => {
      const cleanIsbn = match.replace(/[^\d]/g, '');
      return `<a href="https://www.worldcat.org/isbn/${cleanIsbn}" target="_blank" class="pmid-link" title="Search book in WorldCat">${match}</a>`;
    });

    // Generic PMID references are now handled by the unified citation system in processUnifiedCitations()

    // DOI references are now handled by the unified citation system in processUnifiedCitations()

    // Pattern for enzyme class numbers: EC N.N.N.-
    const ecClassPattern = /\bEC\s+(\d{1,2}\.\d{1,3}\.\d{1,3}\.-)(?!\d)/gi;
    enhancedValue = enhancedValue.replace(ecClassPattern, (match, ecClass) => {
      return `<a href="https://enzyme.expasy.org/EC/${ecClass}" target="_blank" class="db-xref-link" title="View EC class in ENZYME database">EC ${ecClass}</a>`;
    });

    // Pattern for literature references with "et al." format: Author et al. (YYYY)
    const authorYearPattern = /\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s+et\s+al\.\s*\((\d{4})\)/gi;
    enhancedValue = enhancedValue.replace(authorYearPattern, (match, author, year) => {
      const searchQuery = encodeURIComponent(`${author} ${year}`);
      return `<a href="https://pubmed.ncbi.nlm.nih.gov/?term=${searchQuery}" target="_blank" class="pmid-link" title="Search in PubMed">${match}</a>`;
    });

    return enhancedValue;
  }

  /**
   * Create sequences section with CDS and translation
   */
  createSequencesSection(gene, fullSequence, geneName, chromosome) {
    let html = `<div class="gene-sequences">`;

    // Get DNA sequence
    const dnaSequence = fullSequence.substring(gene.start - 1, gene.end);

    // CDS and Translation sections if applicable
    if (gene.type === 'CDS' || (gene.qualifiers && this.getQualifierValue(gene.qualifiers, 'translation'))) {
      // For CDS features, the DNA sequence is the CDS
      const cdsSequence = dnaSequence;
      const translationStr =
        this.getQualifierValue(gene.qualifiers, 'translation') || this.translateDNA(cdsSequence, gene.strand);
      const translation = Array.isArray(translationStr) ? translationStr[0] : translationStr;

      // CDS Sequence section
      html += `
            <div class="sequence-section" style="margin-bottom: 24px;">
                <h4><i class="fas fa-code"></i> CDS Sequence (${cdsSequence.length} bp)</h4>
                <div class="sequence-content">
                    <div class="sequence-display" data-sequence-type="cds">
                        <div class="sequence-preview">${this.formatSequencePreview(cdsSequence, 60)}</div>
                        <div class="sequence-full" style="display: none;">
                            <div class="sequence-formatted">${this.formatSequenceWithLineNumbers(cdsSequence, gene.start)}</div>
                        </div>
                    </div>
                    <div class="sequence-actions" style="margin-top: 8px;">
                        <button class="btn btn-sm toggle-sequence-btn" data-target="cds">
                            <i class="fas fa-expand"></i> Show Full Sequence
                        </button>
                        <button class="btn btn-sm copy-sequence-btn" data-sequence-type="cds" data-gene-name="${geneName}" data-chr="${chromosome}" data-start="${gene.start}" data-end="${gene.end}" data-strand="${gene.strand}">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
            </div>
        `;

      // Translation section
      if (translation) {
        const translationLength = translation.replace(/\*/g, '').length; // Remove stop codons for length count
        html += `
                <div class="sequence-section">
                    <h4><i class="fas fa-cog"></i> Protein Translation (${translationLength} aa)</h4>
                    <div class="sequence-content">
                        <div class="sequence-display" data-sequence-type="translation">
                            <div class="sequence-preview">${this.formatProteinPreview(translation, 40)}</div>
                            <div class="sequence-full" style="display: none;">
                                <div class="sequence-formatted">${this.formatProteinWithLineNumbers(translation)}</div>
                            </div>
                        </div>
                        <div class="sequence-actions" style="margin-top: 8px;">
                            <button class="btn btn-sm toggle-sequence-btn" data-target="translation">
                                <i class="fas fa-expand"></i> Show Full Sequence
                            </button>
                            <button class="btn btn-sm copy-sequence-btn" data-sequence-type="translation" data-gene-name="${geneName}" data-chr="${chromosome}" data-start="${gene.start}" data-end="${gene.end}" data-strand="${gene.strand}">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                </div>
            `;
      }
    } else {
      // DNA Sequence section
      html += `
            <div class="sequence-section">
                <h4><i class="fas fa-dna"></i> DNA Sequence (${dnaSequence.length} bp)</h4>
                <div class="sequence-content">
                    <div class="sequence-display" data-sequence-type="dna">
                        <div class="sequence-preview">${this.formatSequencePreview(dnaSequence, 60)}</div>
                        <div class="sequence-full" style="display: none;">
                            <div class="sequence-formatted">${this.formatSequenceWithLineNumbers(dnaSequence, gene.start)}</div>
                        </div>
                    </div>
                    <div class="sequence-actions" style="margin-top: 8px;">
                        <button class="btn btn-sm toggle-sequence-btn" data-target="dna">
                            <i class="fas fa-expand"></i> Show Full Sequence
                        </button>
                        <button class="btn btn-sm copy-sequence-btn" data-sequence-type="dna" data-gene-name="${geneName}" data-chr="${chromosome}" data-start="${gene.start}" data-end="${gene.end}" data-strand="${gene.strand}">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    html += `</div>`;

    return html;
  }

  /**
   * Format sequence preview (first N characters with ellipsis)
   */
  formatSequencePreview(sequence, maxLength = 60) {
    const previewSequence = sequence.length <= maxLength ? sequence : sequence.substring(0, maxLength);
    const colorizedSequence = this.colorizeSequenceBases(previewSequence);

    if (sequence.length <= maxLength) {
      return colorizedSequence;
    }
    return colorizedSequence + '<span class="sequence-ellipsis">...</span>';
  }

  /**
   * Format protein preview with colored amino acids
   */
  formatProteinPreview(sequence, maxLength = 40) {
    const preview = sequence.length <= maxLength ? sequence : sequence.substring(0, maxLength);
    let formatted = '';
    for (let i = 0; i < preview.length; i++) {
      const aa = preview[i];
      formatted += `<span class="amino-acid">${aa}</span>`;
    }
    if (sequence.length > maxLength) {
      formatted += '<span class="sequence-ellipsis">...</span>';
    }
    return `<span class="sequence-text">${formatted}</span>`;
  }

  /**
   * Format sequence with line numbers for full display
   */
  formatSequenceWithLineNumbers(sequence, startPosition = 1) {
    const lineLength = 60;
    let formatted = '';

    for (let i = 0; i < sequence.length; i += lineLength) {
      const lineNumber = startPosition + i;
      const lineSequence = sequence.substring(i, i + lineLength);
      const colorizedSequence = this.colorizeSequenceBases(lineSequence);
      formatted += `
                <div class="sequence-line">
                    <span class="sequence-position">${lineNumber.toLocaleString()}</span>
                    <span class="sequence-bases">${colorizedSequence}</span>
                </div>
            `;
    }

    return formatted;
  }

  /**
   * Format sequence for full display without line numbers (for read details)
   */
  formatSequenceFull(sequence) {
    // Display entire sequence as one continuous line without breaking
    const colorizedSequence = this.colorizeSequenceBases(sequence);
    return `<div class="sequence-full-line">${colorizedSequence}</div>`;
  }

  /**
   * Format protein with line numbers
   */
  formatProteinWithLineNumbers(sequence) {
    const lineLength = 50;
    let formatted = '';

    for (let i = 0; i < sequence.length; i += lineLength) {
      const lineNumber = i + 1;
      const lineSequence = sequence.substring(i, i + lineLength);
      let colorizedSeq = '';
      for (let j = 0; j < lineSequence.length; j++) {
        const aa = lineSequence[j];
        colorizedSeq += `<span class="amino-acid">${aa}</span>`;
      }

      formatted += `
                <div class="sequence-line">
                    <span class="sequence-position">${lineNumber}</span>
                    <span class="sequence-bases">${colorizedSeq}</span>
                </div>
            `;
    }

    return formatted;
  }

  /**
   * Colorize DNA sequence bases
   */
  colorizeSequenceBases(sequence) {
    let colorized = '';
    for (let i = 0; i < sequence.length; i++) {
      const base = sequence[i].toLowerCase();
      colorized += `<span class="base-${base}">${sequence[i]}</span>`;
    }
    return colorized;
  }

  /**
   * Setup expandable sequences functionality
   */
  setupExpandableSequences() {
    // Toggle sequence display
    document.querySelectorAll('.toggle-sequence-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const target = e.target.closest('.toggle-sequence-btn').dataset.target;
        const sequenceDisplay = document.querySelector(`[data-sequence-type="${target}"]`);
        const preview = sequenceDisplay.querySelector('.sequence-preview');
        const full = sequenceDisplay.querySelector('.sequence-full');
        const icon = e.target.closest('.toggle-sequence-btn').querySelector('i');
        const text = e.target.closest('.toggle-sequence-btn');

        if (full.style.display === 'none') {
          preview.style.display = 'none';
          full.style.display = 'block';
          icon.className = 'fas fa-compress';
          text.innerHTML = '<i class="fas fa-compress"></i> Show Preview';
        } else {
          preview.style.display = 'block';
          full.style.display = 'none';
          icon.className = 'fas fa-expand';
          text.innerHTML = '<i class="fas fa-expand"></i> Show Full Sequence';
        }
      });
    });

    // Copy individual sequences
    document.querySelectorAll('.copy-sequence-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const button = e.target.closest('.copy-sequence-btn');
        const type = button.dataset.sequenceType;
        const geneName = button.dataset.geneName;
        const chr = button.dataset.chr;
        const start = button.dataset.start;
        const end = button.dataset.end;
        const strand = button.dataset.strand;

        this.copySpecificSequence(type, geneName, chr, start, end, strand);
      });
    });
  }

  /**
   * Copy specific sequence type
   */
  copySpecificSequence(type, geneName, chromosome, start, end, strand) {
    if (!this.currentSequence || !this.currentSequence[chromosome]) {
      const errorMessage = 'No sequence available to copy';
      if (this.uiManager) {
        this.uiManager.updateStatus(errorMessage);
      } else {
        const statusElement = document.getElementById('statusText');
        if (statusElement) {
          statusElement.textContent = errorMessage;
        }
      }
      return;
    }

    const fullSequence = this.currentSequence[chromosome];
    let sequence;
    let header;
    let description;

    switch (type) {
      case 'dna':
      case 'cds':
        sequence = fullSequence.substring(start - 1, end);
        if (strand === '-1') {
          sequence = this.sequenceUtils.getReverseComplement(sequence);
        }
        header = `>${geneName}_${type.toUpperCase()} ${chromosome}:${start}-${end} (${strand === '-1' ? '-' : '+'} strand)`;
        description = `${type.toUpperCase()} sequence`;
        break;

      case 'translation': {
        const dnaSeq = fullSequence.substring(start - 1, end);
        const rawTranslation = this.translateDNA(dnaSeq, parseInt(strand));
        sequence = rawTranslation.replace(/\*/g, ''); // Remove stop codons
        header = `>${geneName}_TRANSLATION ${chromosome}:${start}-${end} (${strand === '-1' ? '-' : '+'} strand)`;
        description = 'protein translation';
        break;
      }

      default:
        notify('Unknown sequence type');
        return;
    }

    const fastaContent = `${header}\n${sequence}`;

    navigator.clipboard
      .writeText(fastaContent)
      .then(() => {
        // Choose appropriate icon and color based on sequence type
        let icon;
        let color;
        switch (type) {
          case 'translation':
            icon = '🧬';
            color = '#2196F3';
            break;
          case 'dna':
          case 'cds':
            icon = '✅';
            color = '#4CAF50';
            break;
          default:
            icon = '📋';
            color = '#4CAF50';
        }

        const successMessage = `${icon} Copied ${geneName} ${description} (${sequence.length} ${type === 'translation' ? 'aa' : 'bp'}) to clipboard`;
        if (this.uiManager) {
          this.uiManager.updateStatus(successMessage, {
            highlight: true,
            color: color,
            duration: 4000,
          });
        } else {
          const statusElement = document.getElementById('statusText');
          if (statusElement) {
            statusElement.textContent = successMessage;
            statusElement.style.color = color;
            statusElement.style.fontWeight = 'bold';
            setTimeout(() => {
              statusElement.style.color = '';
              statusElement.style.fontWeight = '';
            }, 4000);
          }
        }
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        const errorMessage = '❌ Failed to copy to clipboard';
        if (this.uiManager) {
          this.uiManager.updateStatus(errorMessage, {
            highlight: true,
            color: '#f44336',
            duration: 4000,
          });
        } else {
          const statusElement = document.getElementById('statusText');
          if (statusElement) {
            statusElement.textContent = errorMessage;
          }
        }
      });
  }

  /**
   * Copy gene translation (main button functionality)
   */
  copyGeneTranslation() {
    if (!this.selectedGene) return;

    const currentChr = document.getElementById('chromosomeSelect').value;
    if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) {
      const errorMessage = 'No sequence available to copy';
      if (this.uiManager) {
        this.uiManager.updateStatus(errorMessage);
      } else {
        const statusElement = document.getElementById('statusText');
        if (statusElement) {
          statusElement.textContent = errorMessage;
        }
      }
      return;
    }

    const gene = this.selectedGene.gene;

    // Always translate from DNA to ensure we get the complete sequence
    // The translation qualifier might be truncated during GenBank parsing for memory efficiency
    const sequence = this.currentSequence[currentChr];
    const geneSequence = sequence.substring(gene.start - 1, gene.end);
    const translation = this.translateDNA(geneSequence, gene.strand);

    // Remove stop codons (*) from the translation
    const cleanTranslation = translation.replace(/\*/g, '');

    const geneName = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type;
    const fastaHeader = `>${geneName}_TRANSLATION ${currentChr}:${gene.start}-${gene.end} (${gene.strand === -1 ? '-' : '+'} strand)`;
    const fastaContent = `${fastaHeader}\n${cleanTranslation}`;

    navigator.clipboard
      .writeText(fastaContent)
      .then(() => {
        const successMessage = `🧬 Copied ${geneName} translation (${cleanTranslation.length} aa) to clipboard`;
        if (this.uiManager) {
          this.uiManager.updateStatus(successMessage, {
            highlight: true,
            color: '#2196F3',
            duration: 4000,
          });
        } else {
          const statusElement = document.getElementById('statusText');
          if (statusElement) {
            statusElement.textContent = successMessage;
            statusElement.style.color = '#2196F3';
            statusElement.style.fontWeight = 'bold';
            setTimeout(() => {
              statusElement.style.color = '';
              statusElement.style.fontWeight = '';
            }, 4000);
          }
        }
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        const errorMessage = '❌ Failed to copy translation to clipboard';
        if (this.uiManager) {
          this.uiManager.updateStatus(errorMessage, {
            highlight: true,
            color: '#f44336',
            duration: 4000,
          });
        } else {
          const statusElement = document.getElementById('statusText');
          if (statusElement) {
            statusElement.textContent = errorMessage;
          }
        }
      });
  }

  highlightGeneSequence(gene) {
    // Only highlight if the gene is within the current view
    const currentStart = this.currentPosition.start;
    const currentEnd = this.currentPosition.end;

    if (gene.end < currentStart || gene.start > currentEnd) {
      this.clearSequenceSelection();
      console.log('Gene is outside current view, skipping sequence highlight');
      return;
    }

    // Set the sequence selection to the gene region
    const currentChr = document.getElementById('chromosomeSelect').value;
    this.sequenceSelection = {
      start: gene.start,
      end: gene.end,
      active: true,
      chromosome: currentChr,
      source: 'gene', // Mark that this selection came from a gene click
      geneName: gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type,
    };
    this.currentSequenceSelection = null;
    document.querySelectorAll('.reads-reference-selection').forEach(element => element.remove());
    const selectionInfo = document.getElementById('sequenceSelectionInfo');
    if (selectionInfo) selectionInfo.style.display = 'none';

    // Find sequence bases within the gene range and mark them as selected
    if (this.sequenceUtils && typeof this.sequenceUtils.restoreActiveGeneSequenceHighlight === 'function') {
      this.sequenceUtils.restoreActiveGeneSequenceHighlight();
    } else {
      const sequenceBases = document.querySelectorAll('.sequence-bases span');
      sequenceBases.forEach(baseElement => {
        const datasetPosition = baseElement.dataset?.position;
        let absolutePos = null;

        if (datasetPosition !== undefined) {
          const sourcePosition = parseInt(datasetPosition, 10);
          absolutePos = Number.isNaN(sourcePosition) ? null : sourcePosition + 1;
        } else {
          const parentLine = baseElement.closest('.sequence-line');
          if (!parentLine) return;

          const positionElement = parentLine.querySelector('.sequence-position');
          if (!positionElement) return;

          const lineStartPos = parseInt(positionElement.textContent.replace(/,/g, ''), 10) - 1;
          const basesDiv = baseElement.closest('.sequence-bases');
          if (!basesDiv) return;

          const baseIndex = Array.from(basesDiv.querySelectorAll('span')).indexOf(baseElement);
          absolutePos = lineStartPos + baseIndex + 1;
        }

        // Update the old and new visual ranges in the same pass.
        const isSelected = absolutePos !== null && absolutePos >= gene.start && absolutePos <= gene.end;
        baseElement.classList.toggle('sequence-selected', isSelected);
        baseElement.classList.toggle('gene-sequence-selected', isSelected);
      });
    }

    // Update copy button text to indicate gene sequence is selected
    this.updateCopyButtonState();

    // Update status bar with gene selection information
    const selectionLength = gene.end - gene.start + 1;
    const geneName = this.sequenceSelection.geneName;
    const statusMessage = `🔵 Gene Selection: ${geneName} (${gene.start.toLocaleString()}-${gene.end.toLocaleString()}, ${selectionLength.toLocaleString()} bp)`;

    if (this.uiManager) {
      this.uiManager.updateStatus(statusMessage);
    } else {
      const statusElement = document.getElementById('statusText');
      if (statusElement) {
        statusElement.textContent = statusMessage;
        statusElement.style.color = '#3b82f6';
        statusElement.style.fontWeight = 'bold';

        // Reset to normal after 5 seconds
        setTimeout(() => {
          statusElement.style.color = '';
          statusElement.style.fontWeight = '';
          statusElement.textContent = 'Ready';
        }, 5000);
      }
    }

    console.log(`Selected gene sequence for ${this.sequenceSelection.geneName} (${gene.start}-${gene.end})`);
  }

  updateCopyButtonState() {
    const copyBtn = document.getElementById('copySequenceBtn');
    if (!copyBtn) return;

    // Check if there's any active selection (gene or manual)
    const hasGeneSelection =
      this.sequenceSelection && this.sequenceSelection.active && this.sequenceSelection.source === 'gene';
    const hasManualSelection = this.currentSequenceSelection !== null;
    const hasTextSelection = window.getSelection() && window.getSelection().toString().length > 0;
    const hasVisualSelection =
      !hasGeneSelection && !hasManualSelection && document.querySelector('.gene-sequence-selected') !== null;

    if (hasGeneSelection) {
      copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
      copyBtn.title = `Copy ${this.sequenceSelection.geneName} sequence`;
      copyBtn.classList.add('gene-copy-active');
    } else if (hasManualSelection || hasTextSelection || hasVisualSelection) {
      copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
      copyBtn.title = 'Copy selected sequence';
      copyBtn.classList.add('gene-copy-active');
    } else {
      copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
      copyBtn.title = 'Copy sequence';
      copyBtn.classList.remove('gene-copy-active');
    }
  }

  showSelectionFeedback() {
    if (this.sequenceSelection && this.sequenceSelection.active && this.sequenceSelection.source === 'gene') {
      // Show a brief tooltip or notification
      const message = `${this.sequenceSelection.geneName} sequence is selected. Click "Copy" button to copy.`;
      this.showNotification(message, 'info');
    }
  }

  clearSequenceHighlights() {
    const highlightedBases = document.querySelectorAll('.sequence-selected, .gene-sequence-selected');
    highlightedBases.forEach(el => {
      el.classList.remove('sequence-selected');
      el.classList.remove('gene-sequence-selected');
    });
  }

  // Action methods for gene details buttons
  zoomToGene() {
    if (!this.selectedGene) return;

    const gene = this.selectedGene.gene;
    const geneLength = gene.end - gene.start;
    const padding = Math.max(500, Math.floor(geneLength * 0.2)); // 20% padding or 500bp minimum

    const newStart = Math.max(0, gene.start - padding);
    const newEnd = gene.end + padding;

    this.currentPosition = { start: newStart, end: newEnd };

    const currentChr = document.getElementById('chromosomeSelect').value;
    if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
      this.updateStatistics(currentChr, this.currentSequence[currentChr]);
      this.displayGenomeView(currentChr, this.currentSequence[currentChr]);

      // Update current tab title with new position (from gene navigation)
      if (this.tabManager) {
        this.tabManager.updateCurrentTabPosition(currentChr, newStart + 1, newEnd, { source: 'navigation' });
      }
    }
  }

  // Zoom methods for LLM function calling
  zoomIn(factor = 2) {
    if (this.navigationManager) {
      return this.navigationManager.zoomIn(factor);
    }
    return { success: false, error: 'NavigationManager not available' };
  }

  zoomOut(factor = 2) {
    if (this.navigationManager) {
      return this.navigationManager.zoomOut(factor);
    }
    return { success: false, error: 'NavigationManager not available' };
  }

  copyGeneSequence() {
    if (!this.selectedGene) return;

    const currentChr = document.getElementById('chromosomeSelect').value;
    if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) {
      const errorMessage = 'No sequence available to copy';
      if (this.uiManager) {
        this.uiManager.updateStatus(errorMessage);
      } else {
        const statusElement = document.getElementById('statusText');
        if (statusElement) {
          statusElement.textContent = errorMessage;
        }
      }
      return;
    }

    const gene = this.selectedGene.gene;
    const sequence = this.currentSequence[currentChr];
    const geneSequence = sequence.substring(gene.start - 1, gene.end); // Convert to 0-based indexing

    const geneName = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type;
    const fastaHeader = `>${geneName} ${currentChr}:${gene.start}-${gene.end} (${gene.strand === -1 ? '-' : '+'} strand)`;
    const fastaContent = `${fastaHeader}\n${geneSequence}`;

    navigator.clipboard
      .writeText(fastaContent)
      .then(() => {
        const successMessage = `✅ Copied ${geneName} sequence (${geneSequence.length} bp) to clipboard`;
        if (this.uiManager) {
          this.uiManager.updateStatus(successMessage, {
            highlight: true,
            color: '#4CAF50',
            duration: 4000,
          });
        } else {
          const statusElement = document.getElementById('statusText');
          if (statusElement) {
            statusElement.textContent = successMessage;
            statusElement.style.color = '#4CAF50';
            statusElement.style.fontWeight = 'bold';
            setTimeout(() => {
              statusElement.style.color = '';
              statusElement.style.fontWeight = '';
            }, 4000);
          }
        }
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        const errorMessage = '❌ Failed to copy to clipboard';
        if (this.uiManager) {
          this.uiManager.updateStatus(errorMessage, {
            highlight: true,
            color: '#f44336',
            duration: 4000,
          });
        } else {
          const statusElement = document.getElementById('statusText');
          if (statusElement) {
            statusElement.textContent = errorMessage;
          }
        }
      });
  }

  copyCDSSequence() {
    if (!this.selectedGene) return;

    const currentChr = document.getElementById('chromosomeSelect').value;
    if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) {
      const errorMessage = 'No sequence available to copy';
      if (this.uiManager) {
        this.uiManager.updateStatus(errorMessage);
      } else {
        const statusElement = document.getElementById('statusText');
        if (statusElement) {
          statusElement.textContent = errorMessage;
        }
      }
      return;
    }

    const gene = this.selectedGene.gene;
    const sequence = this.currentSequence[currentChr];
    let geneSequence = sequence.substring(gene.start - 1, gene.end); // Convert to 0-based indexing

    // Apply reverse complement for reverse strand genes
    if (gene.strand === -1) {
      geneSequence = this.getReverseComplement(geneSequence);
    }

    const geneName = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type;
    const strandInfo = gene.strand === -1 ? 'reverse strand (reverse complemented)' : 'forward strand';
    const fastaHeader = `>${geneName} CDS ${currentChr}:${gene.start}-${gene.end} (${strandInfo})`;
    const fastaContent = `${fastaHeader}\n${geneSequence}`;

    navigator.clipboard
      .writeText(fastaContent)
      .then(() => {
        const successMessage = `✅ Copied ${geneName} CDS sequence (${geneSequence.length} bp) to clipboard`;
        if (this.uiManager) {
          this.uiManager.updateStatus(successMessage, {
            highlight: true,
            color: '#4CAF50',
            duration: 4000,
          });
        } else {
          const statusElement = document.getElementById('statusText');
          if (statusElement) {
            statusElement.textContent = successMessage;
            statusElement.style.color = '#4CAF50';
            statusElement.style.fontWeight = 'bold';
            setTimeout(() => {
              statusElement.style.color = '';
              statusElement.style.fontWeight = '';
            }, 4000);
          }
        }
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        const errorMessage = '❌ Failed to copy to clipboard';
        if (this.uiManager) {
          this.uiManager.updateStatus(errorMessage, {
            highlight: true,
            color: '#f44336',
            duration: 4000,
          });
        } else {
          const statusElement = document.getElementById('statusText');
          if (statusElement) {
            statusElement.textContent = errorMessage;
            statusElement.style.color = '#f44336';
            statusElement.style.fontWeight = 'bold';
            setTimeout(() => {
              statusElement.style.color = '';
              statusElement.style.fontWeight = '';
            }, 4000);
          }
        }
      });
  }

  /**
   * Get reverse complement of DNA sequence
   * Uses available reverse complement functions from the codebase
   */
  getReverseComplement(sequence) {
    // Try to use UnifiedSequenceProcessing if available
    if (window.UnifiedSequenceProcessing && window.UnifiedSequenceProcessing.reverseComplement) {
      const result = window.UnifiedSequenceProcessing.reverseComplement(sequence);
      return result.success ? result.sequence : this.fallbackReverseComplement(sequence);
    }

    // Try to use UnifiedDNATranslation if available
    if (window.UnifiedDNATranslation && window.UnifiedDNATranslation.reverseComplement) {
      return window.UnifiedDNATranslation.reverseComplement(sequence);
    }

    // Try to use MicrobeGenomicsFunctions if available
    if (window.MicrobeGenomicsFunctions && window.MicrobeGenomicsFunctions.reverseComplement) {
      return window.MicrobeGenomicsFunctions.reverseComplement(sequence);
    }

    // Fallback to simple implementation
    return this.fallbackReverseComplement(sequence);
  }

  /**
   * Fallback reverse complement implementation
   */
  fallbackReverseComplement(sequence) {
    const complement = {
      A: 'T',
      T: 'A',
      G: 'C',
      C: 'G',
      a: 't',
      t: 'a',
      g: 'c',
      c: 'g',
      N: 'N',
      n: 'n',
    };

    return sequence
      .split('')
      .reverse()
      .map(base => complement[base] || base)
      .join('');
  }

  // Search PDB experimental structures for the selected gene
  searchPDBStructures(geneName) {
    if (!this.chatManager) {
      console.error('ChatManager not available for PDB structure search');
      return;
    }

    if (!geneName) {
      console.warn('No gene name provided for PDB structure search');
      return;
    }

    // Get current organism/species information
    const organism = this.getCurrentOrganismInfo();

    // Create a specific PDB search message
    const searchMessage = `Search PDB experimental structures for gene ${geneName} from ${organism}. Please find experimentally determined protein structures in the Protein Data Bank (PDB) for this protein, including X-ray crystallography, NMR, and cryo-EM structures.`;

    // Send the search message to the chat manager
    this.chatManager.sendMessageProgrammatically(searchMessage);

    // Optionally show the chat box if it's hidden
    this.showChatIfHidden();

    // Update status
    if (this.uiManager) {
      this.uiManager.updateStatus(`Searching PDB structures for ${geneName} in ${organism}...`);
    }
  }

  // Search AlphaFold predicted structures for the selected gene
  searchAlphaFoldStructures(geneName) {
    if (!this.chatManager) {
      console.error('ChatManager not available for AlphaFold structure search');
      return;
    }

    if (!geneName) {
      console.warn('No gene name provided for AlphaFold structure search');
      return;
    }

    // Get current organism/species information
    const organism = this.getCurrentOrganismInfo();

    // Create a specific AlphaFold search message
    const searchMessage = `Search AlphaFold predicted structures for gene ${geneName} from ${organism}. Please find AI-predicted protein structures from the AlphaFold database for this protein, including confidence scores and structural predictions.`;

    // Send the search message to the chat manager
    this.chatManager.sendMessageProgrammatically(searchMessage);

    // Optionally show the chat box if it's hidden
    this.showChatIfHidden();

    // Update status
    if (this.uiManager) {
      this.uiManager.updateStatus(`Searching AlphaFold structures for ${geneName} in ${organism}...`);
    }
  }

  // Send Deep Gene Research prompt to ChatBox for the selected gene
  openDeepGeneResearch(geneName) {
    if (!geneName) {
      console.warn('No gene name provided for Deep Gene Research');
      return;
    }

    // Get current organism/species information
    const organism = this.getCurrentOrganismInfo();

    // Get the configurable prompt template and replace placeholders
    const promptTemplate =
      this.geneDetailSettings.deepGeneResearchPrompt ||
      'Please perform a Deep Gene Research of {geneName} gene in {organism}. After research is complete, please provide the downloadable URLs for the final research report and detailed research data (workflow, sources, metadata), and include a CodeXomics annotationProposal with conservative updates, literature evidence, confidence, EC/GO/KO/pathway terms, and source references for merging into the selected gene. If the Deep Gene Research tool is not available, please remind me to connect the Deep Gene Research Server.';

    const prompt = promptTemplate.replace(/\{geneName\}/g, geneName).replace(/\{organism\}/g, organism);

    // Check if ChatManager is available and use it to send the prompt
    if (this.chatManager) {
      try {
        this.chatManager.sendMessageProgrammatically(prompt);

        // Update status
        if (this.uiManager) {
          this.uiManager.updateStatus(`Sent Deep Gene Research request for ${geneName} to ChatBox`);
        }

        console.log(`Sent Deep Gene Research prompt for ${geneName} to ChatBox`);
      } catch (error) {
        console.error('Error sending Deep Gene Research prompt to ChatBox:', error);
        if (this.uiManager) {
          this.uiManager.updateStatus(`Error sending Deep Gene Research request`);
        }
      }
    } else {
      console.warn('ChatManager not available for Deep Gene Research');
      if (this.uiManager) {
        this.uiManager.updateStatus(`ChatBox not available`);
      }
    }
  }

  // Show Gene Details Settings modal
  showGeneDetailSettings() {
    const modal = document.getElementById('geneDetailSettingsModal');
    if (!modal) {
      console.error('Gene Details Settings modal not found');
      return;
    }

    // Populate the prompt textarea with current value
    const promptTextarea = document.getElementById('deepGeneResearchPrompt');
    if (promptTextarea) {
      promptTextarea.value = this.geneDetailSettings.deepGeneResearchPrompt || '';
    }

    // Show the modal
    modal.classList.add('show');
  }

  // Save Gene Details Settings
  saveGeneDetailSettings() {
    const promptTextarea = document.getElementById('deepGeneResearchPrompt');
    if (promptTextarea) {
      this.geneDetailSettings.deepGeneResearchPrompt = promptTextarea.value.trim();
    }

    // Save to configManager for persistence
    if (this.configManager) {
      this.configManager.set('geneDetailSettings', this.geneDetailSettings);
    }

    // Close the modal
    const modal = document.getElementById('geneDetailSettingsModal');
    if (modal) {
      modal.classList.remove('show');
    }

    // Show confirmation
    this.showNotification('Gene Details settings saved', 'success');
    console.log('Gene Details settings saved:', this.geneDetailSettings);
  }

  // Reset Deep Gene Research prompt to default
  resetDeepGenePromptToDefault() {
    const defaultPrompt =
      'Please perform a Deep Gene Research of {geneName} gene in {organism}. After research is complete, please provide the downloadable URLs for the final research report and detailed research data (workflow, sources, metadata). If the Deep Gene Research tool is not available, please remind me to connect the Deep Gene Research Server.';

    const promptTextarea = document.getElementById('deepGeneResearchPrompt');
    if (promptTextarea) {
      promptTextarea.value = defaultPrompt;
    }

    this.showNotification('Prompt reset to default', 'info');
  }

  // Load Gene Details Settings from configManager
  loadGeneDetailSettings() {
    if (this.configManager) {
      const savedSettings = this.configManager.get('geneDetailSettings');
      if (savedSettings) {
        this.geneDetailSettings = { ...this.geneDetailSettings, ...savedSettings };
        console.log('Loaded Gene Details settings:', this.geneDetailSettings);
      }
    }
  }

  // Open Gene Annotation Refine tool
  openGeneAnnotationRefine() {
    try {
      // Get the currently selected gene information
      const selectedGene = this.getSelectedGeneInfo();

      if (!selectedGene) {
        console.warn('No gene selected for annotation refinement');
        this.showNotification('Please select a gene first to refine its annotation', 'warning');
        return;
      }

      // Open the Gene Annotation Refine tool window
      // Send message to main process to open the tool window
      ipcRenderer.send('open-gene-annotation-refine', {
        gene: selectedGene.name || selectedGene.locusTag,
        geneInfo: selectedGene,
      });

      // Update status
      if (this.uiManager) {
        this.uiManager.updateStatus(
          `Opening Gene Annotation Refine tool for ${selectedGene.name || selectedGene.locusTag}...`
        );
      }
    } catch (error) {
      console.error('Error opening Gene Annotation Refine tool:', error);
      this.showNotification('Error opening Gene Annotation Refine tool: ' + error.message, 'error');
    }
  }

  // Get currently selected gene information
  getSelectedGeneInfo() {
    // This method should return the currently selected gene's information
    // For now, we'll try to get it from the current gene details
    const geneDetailsContent = document.getElementById('geneDetailsContent');
    if (!geneDetailsContent || geneDetailsContent.querySelector('.no-gene-selected')) {
      return null;
    }

    // Try to extract gene information from the current display
    // This is a simplified approach - in a real implementation, you'd want to store this more reliably
    const geneNameElement = geneDetailsContent.querySelector('.gene-name');
    const locusTagElement = geneDetailsContent.querySelector('.locus-tag');

    if (geneNameElement || locusTagElement) {
      return {
        name: geneNameElement ? geneNameElement.textContent : null,
        locusTag: locusTagElement ? locusTagElement.textContent : null,
        // Add other gene properties as needed
      };
    }

    return null;
  }

  // Update gene annotation with refined information
  async updateGeneAnnotation(geneName, refinedAnnotation) {
    try {
      console.log('Updating gene annotation for:', geneName, refinedAnnotation);

      // Find the gene in current annotations
      const gene = this.findGeneInAnnotations(geneName);
      if (!gene) {
        throw new Error(`Gene ${geneName} not found in current annotations`);
      }

      // Update the gene's qualifiers with refined information
      if (!gene.qualifiers) {
        gene.qualifiers = {};
      }

      // Update product/function (keep as single value)
      if (refinedAnnotation.product) {
        gene.qualifiers.product = refinedAnnotation.product;
      }

      // Update note (keep as single value)
      if (refinedAnnotation.note) {
        gene.qualifiers.note = refinedAnnotation.note;
      }

      // Update EC number (may have multiple values)
      if (refinedAnnotation.ec) {
        if (!gene.qualifiers.ec_number) {
          gene.qualifiers.ec_number = refinedAnnotation.ec;
        } else if (Array.isArray(gene.qualifiers.ec_number)) {
          gene.qualifiers.ec_number.push(refinedAnnotation.ec);
        } else {
          gene.qualifiers.ec_number = [gene.qualifiers.ec_number, refinedAnnotation.ec];
        }
      }

      // Update GO terms (may have multiple values)
      if (refinedAnnotation.go) {
        if (!gene.qualifiers.go_terms) {
          gene.qualifiers.go_terms = refinedAnnotation.go;
        } else if (Array.isArray(gene.qualifiers.go_terms)) {
          gene.qualifiers.go_terms.push(refinedAnnotation.go);
        } else {
          gene.qualifiers.go_terms = [gene.qualifiers.go_terms, refinedAnnotation.go];
        }
      }

      // Add new qualifiers
      if (refinedAnnotation.cofactors) {
        gene.qualifiers.cofactors = refinedAnnotation.cofactors;
      }

      if (refinedAnnotation.substrates) {
        gene.qualifiers.substrates = refinedAnnotation.substrates;
      }

      if (refinedAnnotation.products) {
        gene.qualifiers.products = refinedAnnotation.products;
      }

      if (refinedAnnotation.references) {
        gene.qualifiers.references = refinedAnnotation.references;
      }

      // Add enhancement metadata
      gene.qualifiers.enhanced = 'true';
      gene.qualifiers.enhancement_date = refinedAnnotation.enhancementDate || new Date().toISOString();
      gene.qualifiers.enhancement_source = refinedAnnotation.enhancementSource || 'Gene Annotation Refine Tool';

      // Refresh the display
      this.refreshTrackDisplay();

      // Update gene details if this gene is currently selected
      const geneDetailsContent = document.getElementById('geneDetailsContent');
      if (geneDetailsContent && !geneDetailsContent.querySelector('.no-gene-selected')) {
        this.populateGeneDetails(gene);
      }

      // Show success notification
      this.showNotification(`Gene annotation updated for ${geneName}`, 'success');

      return { success: true, message: 'Annotation updated successfully' };
    } catch (error) {
      console.error('Error updating gene annotation:', error);
      throw error;
    }
  }

  // Find gene in current annotations
  findGeneInAnnotations(geneName) {
    if (!this.currentAnnotations) {
      return null;
    }

    for (const annotations of Object.values(this.currentAnnotations)) {
      if (annotations && annotations.length) {
        const gene = annotations.find(
          g =>
            g.name === geneName ||
            g.gene === geneName ||
            g.locus_tag === geneName ||
            (g.qualifiers &&
              (this.getQualifierValue(g.qualifiers, 'gene') === geneName ||
                this.getQualifierValue(g.qualifiers, 'locus_tag') === geneName ||
                this.getQualifierValue(g.qualifiers, 'name') === geneName))
        );

        if (gene) {
          return gene;
        }
      }
    }

    return null;
  }

  // Legacy method for backward compatibility - now searches both
  searchProteinStructures(geneName) {
    if (!this.chatManager) {
      console.error('ChatManager not available for protein structure search');
      return;
    }

    if (!geneName) {
      console.warn('No gene name provided for structure search');
      return;
    }

    // Get current organism/species information
    const organism = this.getCurrentOrganismInfo();

    // Create a comprehensive search message that will trigger both PDB and AlphaFold searches
    const searchMessage = `Search protein structures for gene ${geneName} in ${organism}. Please search both PDB experimental structures and AlphaFold predictions for this protein.`;

    // Send the search message to the chat manager
    this.chatManager.sendMessageProgrammatically(searchMessage);

    // Optionally show the chat box if it's hidden
    this.showChatIfHidden();

    // Update status
    if (this.uiManager) {
      this.uiManager.updateStatus(`Searching protein structures for ${geneName}...`);
    }
  }

  // Helper method to show chat if hidden
  showChatIfHidden() {
    if (this.chatManager && typeof this.chatManager.showChatBox === 'function') {
      this.chatManager.showChatBox();
      return;
    }

    const chatPanel = document.getElementById('llmChatPanel');
    if (chatPanel) {
      chatPanel.style.display = 'flex';
      return;
    }

    const toggleChatBtn = document.getElementById('toggleChatBtn');
    if (toggleChatBtn) {
      toggleChatBtn.click();
    }
  }

  // Standardize organism name by removing strain, serovar, and other subspecific information
  standardizeOrganismName(organismName) {
    if (!organismName || typeof organismName !== 'string') {
      return 'Unknown organism';
    }

    // Common patterns to remove (strain, serovar, subspecies, etc.)
    const cleaningPatterns = [
      // Strain patterns
      /\s+str\.\s+\S+/gi, // str. K-12
      /\s+strain\s+\S+/gi, // strain K-12
      /\s+K-12\s*\S*/gi, // K-12 MG1655
      /\s+MG1655/gi, // MG1655
      /\s+W3110/gi, // W3110
      /\s+DH5α/gi, // DH5α
      /\s+BL21/gi, // BL21

      // Serovar patterns
      /\s+serovar\s+\S+/gi, // serovar Typhimurium
      /\s+sv\.\s+\S+/gi, // sv. Typhimurium

      // Subspecies patterns
      /\s+subsp\.\s+\S+/gi, // subsp. enterica
      /\s+subspecies\s+\S+/gi, // subspecies enterica

      // Other common patterns
      /\s+ATCC\s+\d+/gi, // ATCC numbers
      /\s+DSM\s+\d+/gi, // DSM numbers
      /\s+NCTC\s+\d+/gi, // NCTC numbers
      /\s+\([^)]*\)/g, // Content in parentheses
      /\s+var\.\s+\S+/gi, // var. variant
      /\s+f\.\s+sp\.\s+\S+/gi, // f. sp. formae speciales

      // Plasmid and specific identifiers
      /\s+plasmid\s+\S+/gi, // plasmid names
      /\s+chromosome\s+\S+/gi, // chromosome identifiers

      // Generic patterns for numbered strains
      /\s+[A-Z]+\d+[A-Z]*\d*/gi, // ABC123, K12, etc.
      /\s+\d+[A-Z]+\d*/gi, // 123ABC, etc.
    ];

    let cleanName = organismName;

    // Apply all cleaning patterns
    for (const pattern of cleaningPatterns) {
      cleanName = cleanName.replace(pattern, '');
    }

    // Remove extra whitespace and clean up
    cleanName = cleanName.replace(/\s+/g, ' ').trim();

    // Handle specific known mappings
    const specificMappings = {
      'Escherichia coli': 'Escherichia coli',
      'E. coli': 'Escherichia coli',
      'Salmonella enterica': 'Salmonella enterica',
      'S. enterica': 'Salmonella enterica',
      'Bacillus subtilis': 'Bacillus subtilis',
      'B. subtilis': 'Bacillus subtilis',
      'Staphylococcus aureus': 'Staphylococcus aureus',
      'S. aureus': 'Staphylococcus aureus',
      'Pseudomonas aeruginosa': 'Pseudomonas aeruginosa',
      'P. aeruginosa': 'Pseudomonas aeruginosa',
      'Saccharomyces cerevisiae': 'Saccharomyces cerevisiae',
      'S. cerevisiae': 'Saccharomyces cerevisiae',
      'Homo sapiens': 'Homo sapiens',
      'H. sapiens': 'Homo sapiens',
      'Mus musculus': 'Mus musculus',
      'M. musculus': 'Mus musculus',
      'Arabidopsis thaliana': 'Arabidopsis thaliana',
      'A. thaliana': 'Arabidopsis thaliana',
    };

    // Check for specific mappings first
    for (const [key, value] of Object.entries(specificMappings)) {
      if (cleanName.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }

    // If we have a valid genus species format, return it
    const genusSpeciesMatch = cleanName.match(/^([A-Z][a-z]+)\s+([a-z]+)/);
    if (genusSpeciesMatch) {
      return `${genusSpeciesMatch[1]} ${genusSpeciesMatch[2]}`;
    }

    // Return cleaned name or fallback
    return cleanName || 'Unknown organism';
  }

  // Get current organism information for structure searches
  getCurrentOrganismInfo() {
    // First priority: Check sourceFeatures (parsed from GenBank source features)
    if (this.sourceFeatures && Object.keys(this.sourceFeatures).length > 0) {
      const currentChr = document.getElementById('chromosomeSelect')?.value;
      if (currentChr && this.sourceFeatures[currentChr]) {
        const organism = this.sourceFeatures[currentChr].organism;
        if (organism && organism !== 'Unknown') {
          console.log(`Found organism from sourceFeatures: ${organism}`);
          return this.standardizeOrganismName(organism);
        }
      }

      // If current chromosome not found, try any available chromosome
      for (const [chr, sourceInfo] of Object.entries(this.sourceFeatures)) {
        if (sourceInfo.organism && sourceInfo.organism !== 'Unknown') {
          console.log(`Found organism from sourceFeatures (${chr}): ${sourceInfo.organism}`);
          return this.standardizeOrganismName(sourceInfo.organism);
        }
      }
    }

    // Second priority: Try to get organism from loaded file metadata
    if (this.fileManager && this.fileManager.currentFileInfo) {
      const fileInfo = this.fileManager.currentFileInfo;

      // Check GenBank ORGANISM field
      if (fileInfo.organism) {
        console.log(`Found organism from fileInfo.organism: ${fileInfo.organism}`);
        return this.standardizeOrganismName(fileInfo.organism);
      }

      // Check other common organism indicators
      if (fileInfo.source) {
        console.log(`Found organism from fileInfo.source: ${fileInfo.source}`);
        return this.standardizeOrganismName(fileInfo.source);
      }

      // Check for species in features
      if (fileInfo.features) {
        for (const feature of fileInfo.features) {
          if (feature.qualifiers) {
            const organism = this.getQualifierValue(feature.qualifiers, 'organism');
            if (organism) {
              console.log(`Found organism from fileInfo.features: ${organism}`);
              return this.standardizeOrganismName(organism);
            }
            const species = this.getQualifierValue(feature.qualifiers, 'species');
            if (species) {
              console.log(`Found organism from fileInfo.features.species: ${species}`);
              return this.standardizeOrganismName(species);
            }
          }
        }
      }
    }

    // Third priority: Try to infer from current chromosome name
    const currentChr = document.getElementById('chromosomeSelect')?.value;
    if (currentChr) {
      // Common organism mappings based on chromosome names
      const organismMap = {
        'COLI-K12': 'Escherichia coli K-12',
        NC_000913: 'Escherichia coli K-12 MG1655',
        chr: 'Homo sapiens', // Generic human chromosome
        chrI: 'Saccharomyces cerevisiae',
        chrII: 'Saccharomyces cerevisiae',
        chrIII: 'Saccharomyces cerevisiae',
      };

      // Check for exact matches
      if (organismMap[currentChr]) {
        return this.standardizeOrganismName(organismMap[currentChr]);
      }

      // Check for partial matches
      if (currentChr.startsWith('chr') && currentChr.length <= 5) {
        return this.standardizeOrganismName('Homo sapiens');
      }
      if (currentChr.includes('COLI') || currentChr.includes('coli')) {
        return this.standardizeOrganismName('Escherichia coli');
      }
    }

    // Default fallback
    return 'Unknown organism';
  }

  clearGeneSelection(options = {}) {
    const { renderCanvas = true, clearSequence = true, updateSidebar = true } = options;
    // Clear selected gene
    this.selectedGene = null;
    this.selectedPrimer = null;

    // Remove selection styling from all gene elements (both regular and SVG)
    const selectedElements = document.querySelectorAll(
      '.gene-element.selected, .svg-gene-element.selected, .primer-binding-element.selected'
    );
    selectedElements.forEach(el => {
      el.classList.remove('selected', 'border-highlight');
    });

    // Canvas mode: re-render Canvas genes renderer to clear selection visual
    const canvasRenderer = this.trackRenderer?.canvasRenderers?.get('genes');
    if (renderCanvas && canvasRenderer && typeof canvasRenderer.render === 'function') {
      canvasRenderer.render();
    }

    // Clear sequence highlights and selection
    if (clearSequence) {
      this.clearSequenceSelection();
    }

    // Update tab manager about gene selection clear
    if (updateSidebar && this.tabManager) {
      this.tabManager.updateCurrentTabSidebarPanel('geneDetailsSection', false, null);
      this.tabManager.updateCurrentTabSidebarPanel('primerDetailsSection', false, null);
    }

    // Hide primer details panel if it was open
    const primerPanel = document.getElementById('primerDetailsSection');
    if (primerPanel) primerPanel.style.display = 'none';

    console.log('Cleared gene selection');
  }

  // Edit gene annotation functionality
  editGeneAnnotation() {
    if (!this.selectedGene || !this.selectedGene.gene) {
      console.warn('No gene selected for editing');
      return;
    }

    const gene = this.selectedGene.gene;
    const modal = document.getElementById('editGeneModal');

    if (!modal) {
      console.error('Edit gene modal not found');
      return;
    }

    // Populate modal fields with current gene data
    this.populateEditModal(gene);

    // Show the modal
    modal.classList.add('show');

    // Enable movement and resizing after the modal becomes visible so the
    // resize manager can preserve its current dimensions.
    this.initializeEditModalBehavior();

    // Set up event listeners for the modal
    this.setupEditModalEventListeners();
  }

  initializeEditModalBehavior() {
    if (window.modalDragManager) {
      window.modalDragManager.makeDraggable('#editGeneModal');
    }
    if (window.resizableModalManager) {
      window.resizableModalManager.makeResizable('#editGeneModal');
    }
  }

  populateEditModal(gene) {
    // Get form elements
    const geneName = document.getElementById('editGeneName');
    const geneType = document.getElementById('editGeneType');
    const geneStart = document.getElementById('editGeneStart');
    const geneEnd = document.getElementById('editGeneEnd');
    const geneStrand = document.getElementById('editGeneStrand');
    const geneProduct = document.getElementById('editGeneProduct');
    const geneLocusTag = document.getElementById('editGeneLocusTag');
    const geneNote = document.getElementById('editGeneNote');

    // Populate basic fields
    if (geneName) geneName.value = gene.qualifiers?.gene || '';
    if (geneType) geneType.value = gene.type || 'gene';
    if (geneStart) geneStart.value = gene.start || '';
    if (geneEnd) geneEnd.value = gene.end || '';
    if (geneStrand) geneStrand.value = gene.strand || 1;
    if (geneProduct) geneProduct.value = gene.qualifiers?.product || '';
    if (geneLocusTag) geneLocusTag.value = gene.qualifiers?.locus_tag || '';
    if (geneNote) geneNote.value = gene.qualifiers?.note || '';

    // Populate additional qualifiers
    this.populateAdditionalQualifiers(gene.qualifiers || {});
  }

  populateAdditionalQualifiers(qualifiers) {
    const qualifiersList = document.getElementById('editGeneQualifiers');
    if (!qualifiersList) return;

    // Clear existing qualifiers
    qualifiersList.innerHTML = '';

    // Define standard qualifiers that are handled by dedicated fields
    const standardQualifiers = ['gene', 'product', 'locus_tag', 'note'];

    // Add remaining qualifiers
    Object.entries(qualifiers).forEach(([key, value]) => {
      if (!standardQualifiers.includes(key) && value && value.toString().trim()) {
        this.addQualifierRow(key, value.toString());
      }
    });
  }

  addQualifierRow(key = '', value = '') {
    const qualifiersList = document.getElementById('editGeneQualifiers');
    if (!qualifiersList) return;

    const qualifierDiv = document.createElement('div');
    qualifierDiv.className = 'qualifier-row';
    qualifierDiv.innerHTML = `
            <div class="qualifier-inputs">
                <input type="text" class="qualifier-key input-full" placeholder="Qualifier name" value="${key}">
                <input type="text" class="qualifier-value input-full" placeholder="Qualifier value" value="${value}">
                <button type="button" class="btn btn-sm btn-danger remove-qualifier-btn" title="Remove qualifier">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

    // Add event listener for remove button
    const removeBtn = qualifierDiv.querySelector('.remove-qualifier-btn');
    removeBtn.addEventListener('click', () => {
      qualifierDiv.remove();
    });

    qualifiersList.appendChild(qualifierDiv);
  }

  setupEditModalEventListeners() {
    if (!this.editModalEventHandlers) {
      this.editModalEventHandlers = {
        addQualifier: this.handleAddQualifier.bind(this),
        save: this.handleSaveGeneEdit.bind(this),
        close: this.handleCloseEditModal.bind(this),
      };
    }

    // Add qualifier button
    const addQualifierBtn = document.getElementById('addQualifierBtn');
    if (addQualifierBtn) {
      addQualifierBtn.removeEventListener('click', this.editModalEventHandlers.addQualifier);
      addQualifierBtn.addEventListener('click', this.editModalEventHandlers.addQualifier);
    }

    // Save button
    const saveBtn = document.getElementById('saveGeneEditBtn');
    if (saveBtn) {
      saveBtn.removeEventListener('click', this.editModalEventHandlers.save);
      saveBtn.addEventListener('click', this.editModalEventHandlers.save);
    }

    // Modal close buttons
    const modal = document.getElementById('editGeneModal');
    const closeButtons = modal.querySelectorAll('.modal-close');
    closeButtons.forEach(btn => {
      btn.removeEventListener('click', this.editModalEventHandlers.close);
      btn.addEventListener('click', this.editModalEventHandlers.close);
    });
  }

  handleAddQualifier() {
    this.addQualifierRow();
  }

  handleCloseEditModal() {
    const modal = document.getElementById('editGeneModal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  handleSaveGeneEdit() {
    if (!this.selectedGene || !this.selectedGene.gene) {
      console.warn('No gene selected for saving');
      return;
    }

    // Get form data
    const formData = this.collectEditFormData();
    if (!formData) {
      return; // Error occurred during data collection
    }

    // Update the gene object
    this.updateGeneData(this.selectedGene.gene, formData);

    // Refresh the gene details display
    this.populateGeneDetails(this.selectedGene.gene, this.selectedGene.operonInfo);

    // Refresh the tracks to show updated annotation
    this.refreshTrackDisplay();

    // Close the modal
    this.handleCloseEditModal();

    // Show success message
    if (this.uiManager) {
      this.uiManager.updateStatus(`Gene annotation updated: ${formData.geneName || 'Unknown'}`);
    }

    console.log('Gene annotation updated successfully');
  }

  collectEditFormData() {
    try {
      const geneName = document.getElementById('editGeneName')?.value || '';
      const geneType = document.getElementById('editGeneType')?.value || 'gene';
      const geneStart = parseInt(document.getElementById('editGeneStart')?.value) || 0;
      const geneEnd = parseInt(document.getElementById('editGeneEnd')?.value) || 0;
      const geneStrand = parseInt(document.getElementById('editGeneStrand')?.value) || 1;
      const geneProduct = document.getElementById('editGeneProduct')?.value || '';
      const geneLocusTag = document.getElementById('editGeneLocusTag')?.value || '';
      const geneNote = document.getElementById('editGeneNote')?.value || '';

      // Validate required fields
      if (geneStart <= 0 || geneEnd <= 0 || geneStart >= geneEnd) {
        notify('Please enter valid start and end positions (start must be less than end and both must be positive)');
        return null;
      }

      // Collect additional qualifiers
      const additionalQualifiers = {};
      const qualifierRows = document.querySelectorAll('.qualifier-row');
      qualifierRows.forEach(row => {
        const keyInput = row.querySelector('.qualifier-key');
        const valueInput = row.querySelector('.qualifier-value');
        if (keyInput && valueInput && keyInput.value.trim() && valueInput.value.trim()) {
          additionalQualifiers[keyInput.value.trim()] = valueInput.value.trim();
        }
      });

      return {
        geneName,
        geneType,
        geneStart,
        geneEnd,
        geneStrand,
        geneProduct,
        geneLocusTag,
        geneNote,
        additionalQualifiers,
      };
    } catch (error) {
      console.error('Error collecting form data:', error);
      notify('Error collecting form data. Please check your inputs.');
      return null;
    }
  }

  updateGeneData(gene, formData) {
    // Update basic gene properties
    gene.type = formData.geneType;
    gene.start = formData.geneStart;
    gene.end = formData.geneEnd;
    gene.strand = formData.geneStrand;

    // Update qualifiers
    if (!gene.qualifiers) {
      gene.qualifiers = {};
    }

    // Update standard qualifiers
    if (formData.geneName) gene.qualifiers.gene = formData.geneName;
    if (formData.geneProduct) gene.qualifiers.product = formData.geneProduct;
    if (formData.geneLocusTag) gene.qualifiers.locus_tag = formData.geneLocusTag;
    if (formData.geneNote) gene.qualifiers.note = formData.geneNote;

    // Add additional qualifiers
    Object.entries(formData.additionalQualifiers).forEach(([key, value]) => {
      gene.qualifiers[key] = value;
    });

    // Remove empty qualifiers
    Object.keys(gene.qualifiers).forEach(key => {
      const value = gene.qualifiers[key];
      if (Array.isArray(value)) {
        // For arrays, remove empty values
        const filteredArray = value.filter(v => v && v.toString().trim() !== '');
        if (filteredArray.length === 0) {
          delete gene.qualifiers[key];
        } else {
          gene.qualifiers[key] = filteredArray;
        }
      } else {
        // For single values
        if (!value || value.toString().trim() === '') {
          delete gene.qualifiers[key];
        }
      }
    });
  }

  refreshTrackDisplay() {
    // Get current chromosome
    const currentChr = document.getElementById('chromosomeSelect')?.value;
    if (!currentChr) return;

    // Refresh gene track if visible
    if (this.visibleTracks.has('genes')) {
      const annotations = this.currentAnnotations[currentChr] || [];
      const operons = this.operons || [];

      // Re-render the gene track
      const geneTrack = document.querySelector('.gene-track');
      if (geneTrack) {
        const trackContent = geneTrack.querySelector('.track-content');
        if (trackContent && this.trackRenderer) {
          // Get current viewport
          const viewport = {
            start: this.currentPosition.start,
            end: this.currentPosition.end,
            range: this.currentPosition.end - this.currentPosition.start,
          };

          // Filter visible genes
          const visibleGenes = annotations.filter(gene => {
            return this.shouldShowGeneType(gene.type) && gene.end >= viewport.start && gene.start <= viewport.end;
          });

          // Clear and re-render
          trackContent.innerHTML = '';
          this.trackRenderer.renderGeneElements(trackContent, visibleGenes, viewport, operons);
        }
      }
    }
  }

  selectRead(read, fileInfo = null) {
    // Store the selected read
    this.selectedRead = { read: read, fileInfo: fileInfo };

    // Clear any existing read selection
    this.clearReadSelection(false);

    // Show read selection feedback
    this.showReadSelectionFeedback(read);

    // Highlight the selected read in the track
    this.highlightSelectedRead(read);

    // Populate and show read details panel
    this.populateReadDetails(read, fileInfo);
    this.showReadDetailsPanel();

    console.log('Read selected:', read.id || read.qname, 'at position', read.start + '-' + read.end);
  }

  /**
   * Handle selection of a mutation within a read
   */
  selectMutation(read, mutation) {
    this.selectedMutation = { read, mutation };

    // Update the header of the variant section to distinguish from VCF variants
    const variantDetailsSection = document.getElementById('variantDetailsSection');
    if (variantDetailsSection) {
      const header = variantDetailsSection.querySelector('h3');
      if (header) {
        header.textContent = 'Read Mutation Details';
        header.classList.add('read-mutation-title');
      }
    }

    // Populate and show mutation details
    this.populateReadMutationDetails(read, mutation);
    this.showVariantDetailsPanel();

    console.log('Mutation selected:', mutation.type, 'at', mutation.position);
  }

  /**
   * Select a read by its ID (useful for navigating from mutation details)
   */
  selectReadById(readId) {
    if (!this.readsManager) return;

    let read = null;

    // Check raw data (in-memory mode)
    if (this.readsManager.rawReadsData && Array.isArray(this.readsManager.rawReadsData)) {
      read = this.readsManager.rawReadsData.find(r => r.id === readId || r.qname === readId);
    }

    // If not found, check cache (all modes: streaming, BAM, etc.)
    if (!read && this.readsManager.cache) {
      for (const region of this.readsManager.cache.values()) {
        if (region.reads && Array.isArray(region.reads)) {
          read = region.reads.find(r => r.id === readId || r.qname === readId);
          if (read) break;
        }
      }
    }

    if (read) {
      this.selectRead(read);
    } else {
      console.warn(`Read with ID ${readId} not found in current view or cache`);
      this.showNotification(`Read ${readId} is no longer in the current view.`, 'warning');
    }
  }

  showReadSelectionFeedback(read) {
    const readName = read.id || read.qname || 'Unknown Read';
    const position = `${read.start.toLocaleString()}-${read.end.toLocaleString()}`;

    this.showNotification(`Selected read: ${readName} at ${position}`, 'info');
  }

  highlightSelectedRead(read) {
    // Remove previous selection highlights
    document.querySelectorAll('.svg-read-element.selected').forEach(element => {
      element.classList.remove('selected');
      element.style.filter = '';
      element.style.stroke = '';
      element.style.strokeWidth = '';
    });

    // Find and highlight the selected read element
    document.querySelectorAll('.svg-read-element').forEach(element => {
      const readGroup = element.closest('g[class*="svg-read-element"]') || element;
      const title = readGroup.querySelector('title');

      if (title && title.textContent.includes(read.id || read.qname || '')) {
        readGroup.classList.add('selected');
        console.log('Highlighted selected read element');
      }
    });
  }

  clearReadSelection(hidePanel = true) {
    this.selectedRead = null;

    // Remove selected class from all read elements
    document.querySelectorAll('.svg-read-element.selected').forEach(element => {
      element.classList.remove('selected');
      element.style.filter = '';
      element.style.stroke = '';
      element.style.strokeWidth = '';
    });

    // Hide read details panel if requested
    if (hidePanel) {
      const readDetailsSection = document.getElementById('readDetailsSection');
      if (readDetailsSection) {
        readDetailsSection.style.display = 'none';
      }

      // Update tab manager about read selection clear
      if (this.tabManager) {
        this.tabManager.updateCurrentTabSidebarPanel('readDetailsSection', false, null);
      }

      this.uiManager.checkAndHideSidebarIfAllPanelsClosed();
    }
  }

  /**
   * Scroll sidebar to bring the specified section into view
   * @param {HTMLElement} sectionElement - The sidebar section element to scroll to
   */
  scrollSidebarToSection(sectionElement) {
    if (!sectionElement) return;

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Add a small delay to ensure the section is fully displayed and rendered
    setTimeout(() => {
      // Check if section is already visible in the sidebar viewport
      const sidebarRect = sidebar.getBoundingClientRect();
      const sectionRect = sectionElement.getBoundingClientRect();

      // Calculate if section is already visible
      const isVisible = sectionRect.top >= sidebarRect.top && sectionRect.bottom <= sidebarRect.bottom;

      // Only scroll if section is not fully visible
      if (!isVisible) {
        // Use scrollIntoView for smooth scrolling
        sectionElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest',
        });

        console.log('🔄 [Sidebar] Scrolled to section:', sectionElement.id);
      } else {
        console.log('🔄 [Sidebar] Section already visible:', sectionElement.id);
      }
    }, 100); // Small delay to ensure UI updates are complete
  }

  // Action methods for read details buttons
  zoomToRead() {
    if (!this.selectedRead) return;

    const read = this.selectedRead.read;
    const readLength = read.end - read.start;
    const padding = Math.max(500, Math.floor(readLength * 2)); // 2x padding or 500bp minimum

    const newStart = Math.max(0, read.start - padding);
    const newEnd = read.end + padding;

    this.currentPosition = { start: newStart, end: newEnd };

    const currentChr = document.getElementById('chromosomeSelect').value;
    if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
      this.updateStatistics(currentChr, this.currentSequence[currentChr]);
      this.displayGenomeView(currentChr, this.currentSequence[currentChr]);

      // Update current tab title with new position (from read navigation)
      if (this.tabManager) {
        this.tabManager.updateCurrentTabPosition(currentChr, newStart + 1, newEnd, { source: 'navigation' });
      }
    }
  }

  copyReadSequence() {
    if (!this.selectedRead || !this.selectedRead.read.sequence) {
      this.showNotification('No sequence data available for selected read', 'warning');
      return;
    }

    const read = this.selectedRead.read;
    const readName = read.id || read.qname || 'Unknown Read';
    const sequence = read.sequence;

    const sequenceText = `>${readName} ${read.start}-${read.end} (${read.strand})\n${sequence}`;

    navigator.clipboard
      .writeText(sequenceText)
      .then(() => {
        this.showNotification(`Read sequence copied to clipboard (${sequence.length} bp)`, 'success');
      })
      .catch(err => {
        console.error('Failed to copy read sequence:', err);
        this.showNotification('Failed to copy read sequence', 'error');
      });
  }

  copyReadQuality() {
    if (!this.selectedRead || !this.selectedRead.read.quality) {
      this.showNotification('No quality data available for selected read', 'warning');
      return;
    }

    const read = this.selectedRead.read;
    const readName = read.id || read.qname || 'Unknown Read';
    const quality = read.quality;

    const qualityText = `>${readName} Quality Scores\n${quality}`;

    navigator.clipboard
      .writeText(qualityText)
      .then(() => {
        this.showNotification(`Read quality scores copied to clipboard`, 'success');
      })
      .catch(err => {
        console.error('Failed to copy read quality:', err);
        this.showNotification('Failed to copy read quality', 'error');
      });
  }

  copySpecificReadSequence(type, readName) {
    // Use window.genomeBrowser to ensure we have the correct instance
    const genomeBrowser = window.genomeBrowser || this;

    console.log('Copy button clicked:', {
      type,
      readName,
      selectedRead: genomeBrowser.selectedRead,
      genomeBrowserInstance: genomeBrowser,
      windowGenomeBrowser: window.genomeBrowser,
      isSameInstance: genomeBrowser === window.genomeBrowser,
    });

    if (!genomeBrowser.selectedRead) {
      console.error('No selected read available. Current selectedRead:', genomeBrowser.selectedRead);
      console.error(
        'Available reads in current view:',
        genomeBrowser.reads ? genomeBrowser.reads.length : 'no reads loaded'
      );
      genomeBrowser.showNotification('No read selected', 'warning');
      return;
    }

    const read = genomeBrowser.selectedRead.read;
    let content = '';
    let description = '';

    switch (type) {
      case 'dna':
        if (read.sequence) {
          content = read.sequence;
          description = 'DNA sequence';
          console.log('DNA sequence content:', content.substring(0, 50) + '...');
        } else {
          console.log('No DNA sequence available');
        }
        break;
      case 'quality':
        if (read.quality) {
          // Handle quality data format (array, string, or other)
          content =
            typeof read.quality === 'string'
              ? read.quality
              : Array.isArray(read.quality)
                ? read.quality.join(' ')
                : String(read.quality);
          description = 'quality scores';
          console.log('Quality content:', content.substring(0, 50) + '...', 'Type:', typeof read.quality);
        } else {
          console.log('No quality data available');
        }
        break;
      case 'cigar':
        if (read.cigar) {
          content = read.cigar;
          description = 'CIGAR string';
          console.log('CIGAR content:', content);
        } else {
          console.log('No CIGAR data available');
        }
        break;
    }

    if (content) {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(content)
          .then(() => {
            genomeBrowser.showNotification(`Read ${description} copied to clipboard`, 'success');
          })
          .catch(err => {
            console.error(`Failed to copy read ${description}:`, err);
            // Fallback to legacy method
            genomeBrowser.fallbackCopyToClipboard(content, description);
          });
      } else {
        // Fallback for older browsers
        genomeBrowser.fallbackCopyToClipboard(content, description);
      }
    } else {
      genomeBrowser.showNotification(`No ${description} available for this read`, 'warning');
    }
  }

  /**
   * Fallback copy method for older browsers or when clipboard API fails
   */
  fallbackCopyToClipboard(text, description) {
    try {
      // Create a temporary textarea element
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      // Execute copy command
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        this.showNotification(`Read ${description} copied to clipboard`, 'success');
      } else {
        this.showNotification(`Failed to copy read ${description}`, 'error');
      }
    } catch (err) {
      console.error(`Fallback copy failed for ${description}:`, err);
      this.showNotification(`Failed to copy read ${description}`, 'error');
    }
  }

  toggleReadSequence(elementId) {
    const previewElement = document.getElementById(`${elementId}-preview`);
    const fullElement = document.getElementById(`${elementId}-full`);
    const toggleButton = document.querySelector(`button[onclick*="${elementId}"]`);

    if (previewElement && fullElement && toggleButton) {
      const isShowingFull = fullElement.style.display !== 'none';

      if (isShowingFull) {
        previewElement.style.display = 'block';
        fullElement.style.display = 'none';
        toggleButton.innerHTML = '<i class="fas fa-expand-alt"></i> Show Full';
      } else {
        previewElement.style.display = 'none';
        fullElement.style.display = 'block';
        toggleButton.innerHTML = '<i class="fas fa-compress-alt"></i> Show Preview';
      }
    }
  }

  // User-defined features functionality
  initializeUserFeatures() {
    // Add features dropdown toggle
    document.getElementById('addFeaturesBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleAddFeaturesDropdown();
    });

    document.getElementById('primerTrackBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      this.togglePrimersDropdown();
    });

    document.getElementById('highlightsBtn')?.addEventListener('click', () => {
      this.highlightsUI?.open();
    });

    document.getElementById('bookmarksBtn')?.addEventListener('click', () => {
      this.bookmarkPanelUI?.open();
    });

    document.getElementById('openPrimerLibraryBtn')?.addEventListener('click', () => {
      this.hidePrimersDropdown();
      this.primerLibraryUI?.open();
    });

    document.getElementById('manualAddPrimerBtn')?.addEventListener('click', () => {
      this.hidePrimersDropdown();
      // Primers are oligos, not gene features: open the dedicated primer dialog
      // (prefilled from any active sequence selection) rather than the annotation
      // feature modal.
      if (this.primerLibraryUI) {
        this.primerLibraryUI.openEdit(null);
      } else {
        this.showAddFeatureModal('primer');
      }
    });

    document.getElementById('manualDeletePrimerBtn')?.addEventListener('click', () => {
      this.hidePrimersDropdown();
      this.promptDeletePrimers();
    });

    document.getElementById('togglePrimerTrackMenuBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      this.togglePrimerTrack();
      this.hidePrimersDropdown();
    });

    // Actions dropdown menu
    document.getElementById('actionsMenuBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleActionsDropdown();
    });

    // Dropdown feature buttons (ONLY in Add Features dropdown, NOT Actions dropdown)
    document.querySelectorAll('#addFeaturesDropdown .dropdown-feature-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const featureType = btn.getAttribute('data-type');
        this.showAddFeatureModal(featureType);
        this.hideAddFeaturesDropdown();
      });
    });

    // Add feature modal
    document.getElementById('addFeatureBtn')?.addEventListener('click', () => this.addUserFeature());
    document.getElementById('featureType')?.addEventListener('change', e => {
      this.updatePrimerSequenceFieldVisibility(e.target.value);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      this.hideAddFeaturesDropdown();
      this.hideActionsDropdown();
      this.hidePrimersDropdown();
    });

    // Enable sequence selection in bottom panel
    this.initializeSequenceSelection();

    // Initialize copy button state
    this.updateCopyButtonState();
  }

  toggleAddFeaturesDropdown() {
    const dropdown = document.getElementById('addFeaturesDropdown');
    const button = document.getElementById('addFeaturesBtn');

    if (dropdown && button) {
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
      button.classList.toggle('active', !isVisible);
    }
  }

  hideAddFeaturesDropdown() {
    const dropdown = document.getElementById('addFeaturesDropdown');
    const button = document.getElementById('addFeaturesBtn');

    if (dropdown && button) {
      dropdown.style.display = 'none';
      button.classList.remove('active');
    }
  }

  togglePrimerTrack() {
    const checkbox = document.getElementById('trackPrimers');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      this.updatePrimerTrackButtonState(checkbox.checked);
      return;
    }

    if (this.visibleTracks.has('primers')) {
      this.visibleTracks.delete('primers');
      this.updatePrimerTrackButtonState(false);
    } else {
      this.visibleTracks.add('primers');
      this.updatePrimerTrackButtonState(true);
    }
    this.updateTrackVisibilityUI();
    const currentChr = document.getElementById('chromosomeSelect')?.value;
    if (currentChr && this.currentSequence?.[currentChr]) {
      this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
    }
  }

  updatePrimerTrackButtonState(isVisible = this.visibleTracks?.has('primers')) {
    // Note: primerTrackBtn is now a dropdown toggle, so we don't update its active state based on track visibility
    const trackMenuBtn = document.getElementById('togglePrimerTrackMenuBtn');
    if (trackMenuBtn) {
      trackMenuBtn.innerHTML = isVisible
        ? '<i class="fas fa-eye-slash"></i> Hide Primer Track'
        : '<i class="fas fa-eye"></i> Show Primer Track';
    }
  }

  togglePrimersDropdown() {
    const dropdown = document.getElementById('primersDropdown');
    const button = document.getElementById('primerTrackBtn');

    if (dropdown && button) {
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
      button.classList.toggle('active', !isVisible);
    }
  }

  hidePrimersDropdown() {
    const dropdown = document.getElementById('primersDropdown');
    const button = document.getElementById('primerTrackBtn');

    if (dropdown && button) {
      dropdown.style.display = 'none';
      button.classList.remove('active');
    }
  }

  toggleActionsDropdown() {
    const dropdown = document.getElementById('actionsDropdown');
    const button = document.getElementById('actionsMenuBtn');

    if (dropdown && button) {
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
      button.classList.toggle('active', !isVisible);
    }
  }

  hideActionsDropdown() {
    const dropdown = document.getElementById('actionsDropdown');
    const button = document.getElementById('actionsMenuBtn');

    if (dropdown && button) {
      dropdown.style.display = 'none';
      button.classList.remove('active');
    }
  }

  showAddFeatureModal(featureType = 'gene') {
    const modal = document.getElementById('addFeatureModal');
    const titleElement = document.getElementById('addFeatureModalTitle');
    const typeSelect = document.getElementById('featureType');
    const chromosomeSelect = document.getElementById('featureChromosome');
    const selectionInfo = document.getElementById('sequenceSelectionInfo');

    if (!modal) return;

    // Set modal title and feature type
    const displayFeatureType = featureType || 'gene';
    titleElement.textContent = `Add ${displayFeatureType.charAt(0).toUpperCase() + displayFeatureType.slice(1)}`;
    typeSelect.value = displayFeatureType;
    this.updatePrimerSequenceFieldVisibility(displayFeatureType);

    // Populate chromosome dropdown
    this.populateChromosomeSelectForFeature(chromosomeSelect);

    // Handle sequence selection
    if (this.currentSequenceSelection && !this.currentSequenceSelection.wrapsOrigin) {
      const { chromosome } = this.currentSequenceSelection;
      const offset = this.currentSequenceSelection.coordinateSystem === 'zero-based-inclusive' ? 1 : 0;
      const start = Math.min(this.currentSequenceSelection.start, this.currentSequenceSelection.end) + offset;
      const end = Math.max(this.currentSequenceSelection.start, this.currentSequenceSelection.end) + offset;
      document.getElementById('featureChromosome').value = chromosome;
      document.getElementById('featureStart').value = start;
      document.getElementById('featureEnd').value = end;
      document.getElementById('selectionText').textContent =
        `Using selected region: ${chromosome}:${start}-${end} (${end - start + 1} bp)`;
      selectionInfo.style.display = 'block';
    } else if (this.currentSequenceSelection?.wrapsOrigin) {
      document.getElementById('featureChromosome').value = this.currentSequenceSelection.chromosome;
      document.getElementById('featureStart').value = '';
      document.getElementById('featureEnd').value = '';
      document.getElementById('selectionText').textContent =
        'Cross-origin selections cannot be used to prefill a single feature interval.';
      selectionInfo.style.display = 'block';
    } else {
      // Use current view if no selection
      const currentChr = document.getElementById('chromosomeSelect')?.value;
      if (currentChr) {
        const sequenceLength = this.currentSequence?.[currentChr]?.length || 0;
        const wrapsOrigin =
          sequenceLength > 0 &&
          (Number(this.currentPosition.start) >= sequenceLength || Number(this.currentPosition.end) > sequenceLength);
        document.getElementById('featureChromosome').value = currentChr;
        document.getElementById('featureStart').value = wrapsOrigin ? '' : this.currentPosition.start + 1;
        document.getElementById('featureEnd').value = wrapsOrigin ? '' : this.currentPosition.end;
        if (wrapsOrigin) {
          document.getElementById('selectionText').textContent =
            'A cross-origin circular view cannot prefill one feature interval.';
          selectionInfo.style.display = 'block';
        } else {
          selectionInfo.style.display = 'none';
        }
      } else {
        selectionInfo.style.display = 'none';
      }
    }

    // Clear previous values
    document.getElementById('featureName').value = '';
    document.getElementById('featureDescription').value = '';
    const primerSequenceInput = document.getElementById('primerOligoSequence');
    if (primerSequenceInput) {
      primerSequenceInput.value = '';
    }

    // Show modal
    modal.classList.add('show');
  }

  updatePrimerSequenceFieldVisibility(featureType) {
    const primerSequenceGroup = document.getElementById('primerSequenceGroup');
    if (!primerSequenceGroup) return;
    primerSequenceGroup.style.display = String(featureType || '').toLowerCase() === 'primer' ? 'block' : 'none';
  }

  populateChromosomeSelectForFeature(selectElement) {
    if (!selectElement) return;

    selectElement.innerHTML = '';

    // Add chromosomes from current sequence data
    if (this.currentSequence) {
      Object.keys(this.currentSequence).forEach(chr => {
        const option = document.createElement('option');
        option.value = chr;
        option.textContent = chr;
        selectElement.appendChild(option);
      });
    }
  }

  async addUserFeature() {
    const featureType = document.getElementById('featureType').value;
    const featureName = document.getElementById('featureName').value.trim();
    const chromosome = document.getElementById('featureChromosome').value;
    const start = parseInt(document.getElementById('featureStart').value);
    const end = parseInt(document.getElementById('featureEnd').value);
    const strand = parseInt(document.getElementById('featureStrand').value);
    const description = document.getElementById('featureDescription').value.trim();
    const primerOligoSequence = document.getElementById('primerOligoSequence')?.value.trim();

    // Validation
    if (!featureName) {
      notify('Please enter a feature name');
      return;
    }

    if (!chromosome) {
      notify('Please select a chromosome');
      return;
    }

    if (isNaN(start) || isNaN(end) || start < 1 || end < 1) {
      notify('Please enter valid start and end positions');
      return;
    }

    if (start > end) {
      notify('Start position must be less than or equal to end position');
      return;
    }

    // Check if position is within sequence bounds
    if (this.currentSequence[chromosome]) {
      const seqLength = this.currentSequence[chromosome].length;
      if (end > seqLength) {
        notify(`End position (${end}) exceeds sequence length (${seqLength})`);
        return;
      }
    }

    const qualifiers = {
      gene: featureName,
      product: description || featureName,
      note: description,
      user_defined: true,
    };
    let normalizedPrimerSequence = '';

    if (featureType.toLowerCase() === 'primer') {
      normalizedPrimerSequence = primerOligoSequence ? primerOligoSequence.toUpperCase().replace(/[^ATCGN]/g, '') : '';
      if (primerOligoSequence && !normalizedPrimerSequence) {
        notify('Please enter a valid primer sequence using A, T, C, G, or N');
        return;
      }
      if (normalizedPrimerSequence && normalizedPrimerSequence.length !== end - start + 1) {
        const proceed = confirm(
          `The primer sequence is ${normalizedPrimerSequence.length} bp, but the binding interval is ${end - start + 1} bp. Add it anyway?`
        );
        if (!proceed) return;
      }
      if (normalizedPrimerSequence) {
        qualifiers.sequence = normalizedPrimerSequence;
      }
      qualifiers.direction = strand === -1 ? 'reverse' : 'forward';
    }

    if (featureType.toLowerCase() === 'primer') {
      if (!this.primerManager) {
        notify('Primer manager is not available');
        return;
      }

      await this.primerManager.addPrimer({
        name: featureName,
        sequence: normalizedPrimerSequence,
        description,
        source: 'manual',
        bindingSites: [
          {
            chromosome,
            start,
            end,
            strand,
            source: 'manual',
          },
        ],
      });

      this.visibleTracks.add('primers');
      const checkbox = document.getElementById('trackPrimers');
      if (checkbox) checkbox.checked = true;
      this.updatePrimerTrackButtonState(true);

      document.getElementById('addFeatureModal').classList.remove('show');
      this.clearSequenceSelection();

      if (chromosome === document.getElementById('chromosomeSelect')?.value) {
        this.displayGenomeView(chromosome, this.currentSequence[chromosome]);
        this.sequenceUtils.displayEnhancedSequence(chromosome, this.currentSequence[chromosome]);
      }

      notify(`Added primer "${featureName}" to ${chromosome}:${start}-${end}`);
      return;
    }

    // Create the feature object
    const feature = {
      type: featureType,
      start: start,
      end: end,
      strand: strand,
      qualifiers,
      userDefined: true,
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    // Store the feature
    if (!this.userDefinedFeatures[chromosome]) {
      this.userDefinedFeatures[chromosome] = [];
    }
    this.userDefinedFeatures[chromosome].push(feature);

    // Add to current annotations for immediate display
    if (!this.currentAnnotations[chromosome]) {
      this.currentAnnotations[chromosome] = [];
    }
    this.currentAnnotations[chromosome].push(feature);

    // Close modal
    document.getElementById('addFeatureModal').classList.remove('show');

    // Clear selection
    this.clearSequenceSelection();

    // Refresh the view
    if (chromosome === document.getElementById('chromosomeSelect')?.value) {
      this.displayGenomeView(chromosome, this.currentSequence[chromosome]);
      this.sequenceUtils.displayEnhancedSequence(chromosome, this.currentSequence[chromosome]);
    }

    notify(`Added ${featureType} "${featureName}" to ${chromosome}:${start}-${end}`);
  }

  async promptDeletePrimers() {
    const currentChr = document.getElementById('chromosomeSelect')?.value || this.currentChromosome;
    const primers = this.getPrimerAnnotations(currentChr);

    if (primers.length === 0) {
      notify('No primers found on the current chromosome');
      return;
    }

    const primerList = primers
      .map((primer, index) => {
        const name =
          primer.name || primer.qualifiers?.label || primer.qualifiers?.gene || primer.id || 'Unnamed Primer';
        return `${index + 1}. ${name} (${primer.start}-${primer.end})`;
      })
      .join('\n');

    const answer = prompt(
      `Delete primer by number, name, or id. Type ALL to delete all primers on ${currentChr}.\n\n${primerList}`
    );
    if (!answer) return;

    const trimmed = answer.trim();
    let removed = 0;

    if (trimmed.toUpperCase() === 'ALL') {
      const confirmed = confirm(`Delete all ${primers.length} primer annotations on ${currentChr}?`);
      if (!confirmed) return;
      removed = await this.deletePrimerAnnotations(currentChr, () => true);
    } else {
      const numericIndex = Number(trimmed);
      const target =
        Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= primers.length
          ? primers[numericIndex - 1]
          : primers.find(primer => {
              const names = [
                primer.id,
                primer.name,
                primer.qualifiers?.label,
                primer.qualifiers?.gene,
                primer.qualifiers?.locus_tag,
              ]
                .filter(Boolean)
                .map(value => String(value).toLowerCase());
              return names.includes(trimmed.toLowerCase());
            });

      if (!target) {
        notify(`Primer "${trimmed}" was not found`);
        return;
      }

      const targetName = target.name || target.qualifiers?.label || target.qualifiers?.gene || target.id;
      const confirmed = confirm(`Delete primer "${targetName}"?`);
      if (!confirmed) return;
      removed = await this.deletePrimerAnnotations(currentChr, primer => primer === target || primer.id === target.id);
    }

    if (removed > 0) {
      this.visibleTracks.add('primers');
      const checkbox = document.getElementById('trackPrimers');
      if (checkbox) checkbox.checked = true;
      this.updatePrimerTrackButtonState(true);
      if (currentChr && this.currentSequence?.[currentChr]) {
        this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
      }
      notify(`Deleted ${removed} primer${removed === 1 ? '' : 's'}`);
    }
  }

  getPrimerAnnotations(chromosome) {
    if (this.primerManager) {
      return this.primerManager.getRenderableBindingSites(chromosome || null);
    }

    const annotations = this.currentAnnotations?.[chromosome] || [];
    return annotations.filter(feature => {
      const featureType = String(feature?.type || '').toLowerCase();
      return featureType === 'primer' || featureType === 'primer_bind';
    });
  }

  async deletePrimerAnnotations(chromosome, predicate) {
    if (this.primerManager) {
      const primers = this.primerManager.getRenderableBindingSites(chromosome || null);
      const primerIds = new Set(primers.filter(predicate).map(primer => primer.primerId || primer.id));
      let removed = 0;
      for (const primerId of primerIds) {
        if (await this.primerManager.removePrimer(primerId)) {
          removed++;
        }
      }
      return removed;
    }

    let removed = 0;
    const removeFromCollection = collection => {
      if (!collection?.[chromosome]) return;
      const before = collection[chromosome].length;
      collection[chromosome] = collection[chromosome].filter(feature => {
        const featureType = String(feature?.type || '').toLowerCase();
        const isPrimer = featureType === 'primer' || featureType === 'primer_bind';
        return !isPrimer || !predicate(feature);
      });
      removed = Math.max(removed, before - collection[chromosome].length);
    };

    removeFromCollection(this.currentAnnotations);
    removeFromCollection(this.userDefinedFeatures);

    return removed;
  }

  initializeSequenceSelection() {
    // Add selection capability to sequence content in bottom panel
    const sequenceContent = document.getElementById('sequenceContent');
    if (!sequenceContent) return;

    // Remove any existing listeners to prevent duplicates
    if (this._sequenceSelectionListeners) {
      sequenceContent.removeEventListener('mousedown', this._sequenceSelectionListeners.mousedown);
      sequenceContent.removeEventListener('mousemove', this._sequenceSelectionListeners.mousemove);
      sequenceContent.removeEventListener('mouseup', this._sequenceSelectionListeners.mouseup);
      document.removeEventListener('mouseup', this._sequenceSelectionListeners.docMouseup);
      sequenceContent.removeEventListener('mouseover', this._sequenceSelectionListeners.mouseover);
      sequenceContent.removeEventListener('mouseleave', this._sequenceSelectionListeners.mouseleave);
    }

    let isSelecting = false;
    let selectionStart = null;
    let selectionEnd = null;
    let mouseDownPosition = null; // Track initial mouse position
    let hasMoved = false; // Track if mouse has actually moved

    const mousedownHandler = e => {
      if (e.target.matches('.sequence-bases span')) {
        console.log('🖱️ [Selection] mousedown on base span');
        isSelecting = true;
        selectionStart = this.getSequencePosition(e.target);
        mouseDownPosition = selectionStart; // Store initial position
        hasMoved = false; // Reset movement flag
        // Clear all existing selections when starting a new manual selection
        this.clearSequenceSelection();
        e.preventDefault();
      }
    };

    const mousemoveHandler = e => {
      if (isSelecting && e.target.matches('.sequence-bases span')) {
        const currentPosition = this.getSequencePosition(e.target);

        // Check if mouse has actually moved to a different base
        if (currentPosition && mouseDownPosition && currentPosition.position !== mouseDownPosition.position) {
          console.log(`👁️ [Selection] Mouse moved from ${mouseDownPosition.position} to ${currentPosition.position}`);
          hasMoved = true;
          selectionEnd = currentPosition;
          this.updateSequenceSelection(selectionStart, selectionEnd);
        }
      }
    };

    const mouseupHandler = e => {
      console.log(`⬆️ [Selection] mouseup - isSelecting: ${isSelecting}, hasMoved: ${hasMoved}`);

      // Only finalize selection if there was actual movement (drag)
      if (isSelecting && hasMoved && selectionStart && selectionEnd) {
        console.log(`✅ [Selection] Finalizing selection from ${selectionStart.position} to ${selectionEnd.position}`);
        this.finalizeSequenceSelection(selectionStart, selectionEnd);
      } else if (isSelecting && !hasMoved && e.target.matches('.sequence-bases span')) {
        // Single click detected - place cursor instead of creating selection
        console.log('📌 [Selection] Single click detected - placing cursor');

        // Call SequenceUtils to place cursor at clicked position
        if (this.sequenceUtils && this.sequenceUtils.handleSequenceClick) {
          this.sequenceUtils.handleSequenceClick(e, e.target);
        }
      }

      // Reset all selection state
      isSelecting = false;
      hasMoved = false;
      mouseDownPosition = null;
    };

    const docMouseupHandler = () => {
      // Also reset movement tracking when mouse up occurs outside
      isSelecting = false;
      hasMoved = false;
      mouseDownPosition = null;
    };

    // Codon <-> residue hover association: hovering a base highlights the residue
    // it codes for (and the whole codon); hovering a residue highlights its codon.
    this.ensureCodonHoverStyles();
    const mouseoverHandler = e => {
      if (isSelecting) return; // Don't distract during a drag-selection

      const marker = e.target.closest('.sequence-protein-row .sequence-aligned-marker[data-codon-positions]');
      if (marker) {
        this.applyCodonHover(sequenceContent, [marker.dataset.codonPositions.split(' ')], [marker]);
        return;
      }

      const base = e.target.closest('.sequence-bases span[data-display-position]');
      if (base) {
        const displayPos = base.dataset.displayPosition;
        // Find every residue whose codon includes this base (may span reading frames / overlapping CDS)
        const markers = sequenceContent.querySelectorAll(
          `.sequence-aligned-marker[data-codon-positions~="${displayPos}"]`
        );
        if (markers.length) {
          // One group per residue so each codon can be drawn as a single box
          const codons = Array.from(markers, m => m.dataset.codonPositions.split(' '));
          this.applyCodonHover(sequenceContent, codons, markers);
        } else {
          this.clearCodonHover(sequenceContent);
        }
        return;
      }

      this.clearCodonHover(sequenceContent);
    };

    const mouseleaveHandler = () => this.clearCodonHover(sequenceContent);

    // Store listeners for cleanup
    this._sequenceSelectionListeners = {
      mousedown: mousedownHandler,
      mousemove: mousemoveHandler,
      mouseup: mouseupHandler,
      docMouseup: docMouseupHandler,
      mouseover: mouseoverHandler,
      mouseleave: mouseleaveHandler,
    };

    // Add event listeners
    sequenceContent.addEventListener('mousedown', mousedownHandler);
    sequenceContent.addEventListener('mousemove', mousemoveHandler);
    sequenceContent.addEventListener('mouseup', mouseupHandler);
    document.addEventListener('mouseup', docMouseupHandler);
    sequenceContent.addEventListener('mouseover', mouseoverHandler);
    sequenceContent.addEventListener('mouseleave', mouseleaveHandler);
  }

  /**
   * Inject (or refresh) the codon/residue hover-highlight styles.
   *
   * The codon is drawn as a single overlay <div> sized to span its three base
   * cells — rather than styling each cell — because sequence-tracks.css gives
   * every base cell (.base-a/.base-t/...) its own padding, background and
   * border-radius, which would otherwise fragment the highlight into three
   * boxes. The style is refreshed (not skipped) so a stale element can't persist.
   */
  ensureCodonHoverStyles() {
    let style = document.getElementById('codon-hover-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'codon-hover-styles';
      document.head.appendChild(style);
    }
    style.textContent = `
      .codon-hover-overlay {
        position: absolute;
        pointer-events: none;
        z-index: 3;
        box-sizing: border-box;
        border: 1.5px solid rgba(41, 128, 185, 0.95);
        border-radius: 4px;
        background: rgba(41, 128, 185, 0.18);
      }
      .sequence-aligned-marker.codon-hover-residue {
        outline: 2px solid rgba(41, 128, 185, 0.95);
        outline-offset: -1px;
        box-shadow: 0 0 0 2px rgba(41, 128, 185, 0.35);
        border-radius: 4px;
        font-weight: 700;
      }
    `;
  }

  /**
   * Highlight one or more codons and their residue markers. `codons` is an array
   * of groups, each a list of base display-positions. For every group we draw one
   * overlay box per strand row that holds those bases — so the main and
   * complementary strands each get a single box, and a codon split across a line
   * wrap gets one box per line.
   */
  applyCodonHover(container, codons, markers) {
    this.clearCodonHover(container);
    const overlays = [];

    codons.forEach(codon => {
      // Group the codon's base cells by the strand row (.sequence-bases) they live in
      const spansByRow = new Map();
      codon.forEach(displayPos => {
        container.querySelectorAll(`.sequence-bases span[data-display-position="${displayPos}"]`).forEach(span => {
          const row = span.parentElement;
          if (!row) return;
          if (!spansByRow.has(row)) spansByRow.set(row, []);
          spansByRow.get(row).push(span);
        });
      });

      spansByRow.forEach((spans, row) => {
        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        spans.forEach(span => {
          left = Math.min(left, span.offsetLeft);
          right = Math.max(right, span.offsetLeft + span.offsetWidth);
          top = Math.min(top, span.offsetTop);
          bottom = Math.max(bottom, span.offsetTop + span.offsetHeight);
        });
        if (!Number.isFinite(left)) return;

        // The overlay is absolutely positioned within the row, so the row needs
        // to be a positioning context.
        if (window.getComputedStyle(row).position === 'static') {
          row.style.position = 'relative';
        }

        const overlay = document.createElement('div');
        overlay.className = 'codon-hover-overlay';
        overlay.style.left = `${left}px`;
        overlay.style.top = `${top - 1}px`;
        overlay.style.width = `${right - left}px`;
        overlay.style.height = `${bottom - top + 2}px`;
        row.appendChild(overlay);
        overlays.push(overlay);
      });
    });

    markers.forEach(marker => marker.classList.add('codon-hover-residue'));
    this._codonHoverOverlays = overlays;
    this._codonHoverActive = true;
  }

  /**
   * Remove any active codon/residue hover highlight.
   */
  clearCodonHover(container) {
    const root = container || document.getElementById('sequenceContent');
    if (this._codonHoverOverlays) {
      this._codonHoverOverlays.forEach(overlay => overlay.remove());
    }
    this._codonHoverOverlays = [];
    if (root) {
      // Defensive: drop any overlays/marks left behind by an earlier render
      root.querySelectorAll('.codon-hover-overlay').forEach(overlay => overlay.remove());
      root.querySelectorAll('.codon-hover-residue').forEach(el => el.classList.remove('codon-hover-residue'));
    }
    this._codonHoverActive = false;
  }

  getSequencePosition(baseElement) {
    const datasetPosition = baseElement?.dataset?.position;
    if (datasetPosition !== undefined) {
      const sourcePosition = parseInt(datasetPosition, 10);
      if (!Number.isNaN(sourcePosition)) {
        const displayPosition = parseInt(baseElement.dataset.displayPosition, 10);
        return {
          chromosome: document.getElementById('chromosomeSelect')?.value,
          position: sourcePosition + 1,
          displayPosition: Number.isNaN(displayPosition) ? sourcePosition : displayPosition,
          element: baseElement,
        };
      }
    }

    const parentLine = baseElement.closest('.sequence-line');
    if (!parentLine) return null;

    const positionElement = parentLine.querySelector('.sequence-position');
    if (!positionElement) return null;

    const lineStartPos = parseInt(positionElement.textContent.replace(/,/g, ''));
    const basesDiv = baseElement.closest('.sequence-bases');
    if (!basesDiv) return null;
    const baseIndex = Array.from(basesDiv.querySelectorAll('span')).indexOf(baseElement);

    return {
      chromosome: document.getElementById('chromosomeSelect')?.value,
      position: lineStartPos + baseIndex,
      displayPosition: lineStartPos + baseIndex - 1,
      element: baseElement,
    };
  }

  updateSequenceSelection(start, end) {
    if (!start || !end) return;

    this.clearSequenceSelection();

    const displayStart = Math.min(start.displayPosition, end.displayPosition);
    const displayEnd = Math.max(start.displayPosition, end.displayPosition);

    // Use the same styling as gene selection for consistency
    const sequenceBases = document.querySelectorAll('.sequence-bases span');
    sequenceBases.forEach(baseElement => {
      const pos = this.getSequencePosition(baseElement);
      if (pos && pos.displayPosition >= displayStart && pos.displayPosition <= displayEnd) {
        baseElement.classList.add('sequence-selected');
        baseElement.classList.add('gene-sequence-selected'); // Use same styling as gene selection
      }
    });

    // Update copy button state during selection
    this.updateCopyButtonState();
  }

  finalizeSequenceSelection(start, end) {
    if (!start || !end) return;

    const selection =
      this.trackRenderer?.createManualSelectionFromDisplayRange &&
      Number.isFinite(start.displayPosition) &&
      Number.isFinite(end.displayPosition)
        ? this.trackRenderer.createManualSelectionFromDisplayRange(
            start.displayPosition,
            end.displayPosition,
            'sequence-track',
            start.chromosome
          )
        : {
            chromosome: start.chromosome,
            start: Math.min(start.position, end.position),
            end: Math.max(start.position, end.position),
            active: true,
            coordinateSystem: 'one-based-inclusive',
            source: 'sequence-track',
            length: Math.abs(end.position - start.position) + 1,
            wrapsOrigin: false,
            segments: [
              {
                start: Math.min(start.position, end.position),
                end: Math.max(start.position, end.position),
              },
            ],
          };

    this.currentSequenceSelection = selection;

    // Update copy button state when manual selection is made
    this.updateCopyButtonState();

    // Update status bar with selection information
    const rangeLabel = selection.segments
      .map(segment => `${segment.start.toLocaleString()}-${segment.end.toLocaleString()}`)
      .join(' / ');
    const statusMessage = `🔵 Sequence Track Selection: ${selection.chromosome}:${rangeLabel} (${selection.length.toLocaleString()} bp)`;

    if (this.uiManager) {
      this.uiManager.updateStatus(statusMessage);
    } else {
      const statusElement = document.getElementById('statusText');
      if (statusElement) {
        statusElement.textContent = statusMessage;
        statusElement.style.color = '#3b82f6';
        statusElement.style.fontWeight = 'bold';

        // Reset to normal after 5 seconds
        setTimeout(() => {
          statusElement.style.color = '';
          statusElement.style.fontWeight = '';
          statusElement.textContent = 'Ready';
        }, 5000);
      }
    }

    console.log(`Selected sequence: ${selection.chromosome}:${rangeLabel} (${selection.length} bp)`);
  }

  clearSequenceSelection() {
    this.currentSequenceSelection = null;
    this.sequenceSelection = { start: null, end: null, active: false };

    // Remove visual selection (using consistent classes)
    const selectedElements = document.querySelectorAll('.sequence-selected, .gene-sequence-selected');
    selectedElements.forEach(element => {
      element.classList.remove('sequence-selected');
      element.classList.remove('gene-sequence-selected');
    });
    document.querySelectorAll('.reads-reference-selection').forEach(element => element.remove());

    // Hide selection info in modal
    const selectionInfo = document.getElementById('sequenceSelectionInfo');
    if (selectionInfo) {
      selectionInfo.style.display = 'none';
    }

    // Update copy button state
    this.updateCopyButtonState();
  }

  // Helper methods for ChatManager
  async search(query, caseSensitive = false) {
    return this.navigationManager.search(query, caseSensitive);
  }

  async getSequenceForRegion(chromosome, start, end) {
    const sequence = this.currentSequence[chromosome];
    if (!sequence) {
      throw new Error(`Chromosome ${chromosome} not loaded`);
    }

    return sequence.substring(start - 1, end);
  }

  async addUserDefinedFeature(feature) {
    const featureId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    if (!this.userDefinedFeatures[feature.chromosome]) {
      this.userDefinedFeatures[feature.chromosome] = [];
    }

    const featureWithId = { ...feature, id: featureId, userDefined: true };
    this.userDefinedFeatures[feature.chromosome].push(featureWithId);

    if (!this.currentAnnotations) {
      this.currentAnnotations = {};
    }
    if (!this.currentAnnotations[feature.chromosome]) {
      this.currentAnnotations[feature.chromosome] = [];
    }
    this.currentAnnotations[feature.chromosome].push(featureWithId);

    // Refresh the display
    this.updateGeneDisplay();

    return featureId;
  }

  // MCP Integration helpers
  sendStateUpdate() {
    if (this.chatManager && this.chatManager.isConnected) {
      this.chatManager.sendStateUpdate({
        currentChromosome: this.currentChromosome,
        currentPosition: this.currentPosition,
        visibleTracks: Array.from(this.visibleTracks),
        sequenceLength: this.currentSequence[this.currentChromosome]?.length || 0,
      });
    }
  }

  sendNavigationUpdate() {
    if (this.chatManager && this.chatManager.isConnected) {
      this.chatManager.sendNavigationUpdate(this.currentChromosome, this.currentPosition);
    }
  }

  sendSearchResultsUpdate(results) {
    if (this.chatManager) {
      this.chatManager.sendSearchResults(results);
    }
  }

  // Handle bottom sequence panel (always docked to bottom when enabled)
  handleBottomSequencePanel(chromosome, sequence) {
    const sequenceDisplaySection = document.getElementById('sequenceDisplaySection');
    const splitter = document.getElementById('splitter');
    const genomeViewerSection = document.getElementById('genomeViewerSection');

    if (this.visibleTracks.has('sequence')) {
      // Show bottom sequence panel
      if (sequenceDisplaySection) {
        sequenceDisplaySection.style.display = 'flex';

        const sequenceDisplay = document.getElementById('sequenceDisplay');
        const isCollapsed =
          sequenceDisplaySection.classList.contains('collapsed') || sequenceDisplay?.classList.contains('collapsed');
        const panelHeight = this.getBottomSequencePanelHeight();

        // Set proper layout properties to ensure it reaches the bottom
        sequenceDisplaySection.style.height = isCollapsed ? 'auto' : `${panelHeight}px`;
        sequenceDisplaySection.style.minHeight = isCollapsed ? '0' : '50px';
        sequenceDisplaySection.style.maxHeight = isCollapsed ? 'none' : '60vh';
        sequenceDisplaySection.style.flex = '0 0 auto'; // Don't grow automatically
        sequenceDisplaySection.style.position = 'relative';
        sequenceDisplaySection.style.bottom = '0';
        sequenceDisplaySection.style.order = '999'; // Ensure it's at the bottom
        sequenceDisplaySection.style.flexDirection = 'column';
      }

      if (splitter) {
        const sequenceDisplay = document.getElementById('sequenceDisplay');
        const isCollapsed =
          sequenceDisplaySection?.classList.contains('collapsed') || sequenceDisplay?.classList.contains('collapsed');
        splitter.style.display = isCollapsed ? 'none' : 'flex';
      }

      // Adjust genome viewer to make room for bottom panel and ensure proper ordering
      if (genomeViewerSection) {
        genomeViewerSection.style.flex = '1'; // Fill remaining space
        genomeViewerSection.style.flexBasis = 'auto';
        genomeViewerSection.style.minHeight = '200px'; // Ensure minimum space for tracks
        genomeViewerSection.style.order = '1'; // Ensure it's above sequence section
        genomeViewerSection.style.display = 'flex';
        genomeViewerSection.style.flexDirection = 'column';
      }

      // Display the sequence content
      this.sequenceUtils.displayEnhancedSequence(chromosome, sequence);

      // Set up collapse/expand functionality for sequence header
      this.setupSequenceHeaderToggle();
    } else {
      // Hide bottom sequence panel
      if (sequenceDisplaySection) {
        sequenceDisplaySection.style.display = 'none';
      }

      if (splitter) {
        splitter.style.display = 'none';
      }

      // Let genome viewer take full space
      if (genomeViewerSection) {
        genomeViewerSection.style.flex = '1';
        genomeViewerSection.style.flexBasis = '100%';
        genomeViewerSection.style.minHeight = 'auto';
        genomeViewerSection.style.order = '1';
      }
    }
  }

  getBottomSequencePanelHeight() {
    const defaultHeight = 250;
    const minHeight = 50;
    const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight * 0.6));
    const settings = this.trackRenderer?.getTrackSettings?.('sequence') || {};
    const savedHeight = Number(settings.panelHeight);

    if (Number.isFinite(savedHeight) && savedHeight > 0) {
      return Math.min(maxHeight, Math.max(minHeight, savedHeight));
    }

    return Math.min(defaultHeight, maxHeight);
  }

  saveBottomSequencePanelHeight(height) {
    const numericHeight = Number(height);
    if (!Number.isFinite(numericHeight) || numericHeight <= 0 || !this.trackRenderer?.saveTrackSettings) {
      return;
    }

    const minHeight = 50;
    const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight * 0.6));
    const panelHeight = Math.round(Math.min(maxHeight, Math.max(minHeight, numericHeight)));
    const currentSettings = this.trackRenderer.getTrackSettings('sequence') || {};

    this.trackRenderer.saveTrackSettings('sequence', {
      ...currentSettings,
      panelHeight,
    });
  }

  // Set up collapse/expand functionality for sequence header
  setupSequenceHeaderToggle() {
    const sequenceHeader = document.querySelector('.sequence-header');

    if (sequenceHeader && !sequenceHeader.hasAttribute('data-toggle-setup')) {
      sequenceHeader.setAttribute('data-toggle-setup', 'true');
      sequenceHeader.style.cursor = 'pointer';

      // Add visual indicator that it's clickable
      sequenceHeader.style.userSelect = 'none';
      sequenceHeader.addEventListener('mouseenter', () => {
        sequenceHeader.style.backgroundColor = '#e9ecef';
      });
      sequenceHeader.addEventListener('mouseleave', () => {
        sequenceHeader.style.backgroundColor = '';
      });

      // Removed click listener to prevent collapse/uncollapse on header click
      // sequenceHeader.addEventListener('click', () => {
      //     this.toggleBottomSequencePanel();
      // });
    }
  }

  // Toggle collapse/expand of bottom sequence panel
  toggleBottomSequencePanel() {
    const sequenceContent = document.getElementById('sequenceContent');
    const sequenceDisplaySection = document.getElementById('sequenceDisplaySection');
    const splitter = document.getElementById('splitter');
    const genomeViewerSection = document.getElementById('genomeViewerSection');

    if (sequenceContent && sequenceDisplaySection) {
      const isCollapsed =
        sequenceContent.style.display === 'none' || sequenceDisplaySection.classList.contains('collapsed');

      if (isCollapsed) {
        // Expand - show sequence content and restore proper layout
        sequenceContent.style.display = 'flex';
        sequenceDisplaySection.classList.remove('collapsed');

        // Restore proper height and flex properties
        sequenceDisplaySection.style.minHeight = '50px';
        sequenceDisplaySection.style.maxHeight = '60vh';
        sequenceDisplaySection.style.height = `${this.getBottomSequencePanelHeight()}px`;
        sequenceDisplaySection.style.flex = '0 0 auto';
        sequenceDisplaySection.style.position = 'relative';
        sequenceDisplaySection.style.bottom = '0';
        sequenceDisplaySection.style.order = '999'; // Ensure it's at the bottom

        if (splitter) {
          splitter.style.display = 'flex';
        }
      } else {
        // Collapse - hide only sequence content, keep header visible
        sequenceContent.style.display = 'none';
        sequenceDisplaySection.classList.add('collapsed');

        // Set collapsed height to just show the header
        sequenceDisplaySection.style.minHeight = '50px';
        sequenceDisplaySection.style.maxHeight = '50px';
        sequenceDisplaySection.style.height = '50px';
        sequenceDisplaySection.style.flex = '0 0 auto';

        if (splitter) {
          splitter.style.display = 'none';
        }

        // Let genome viewer expand to fill space
        if (genomeViewerSection) {
          genomeViewerSection.style.flexGrow = '1';
        }
      }

      // Trigger resize event for layout adjustment
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 150);
    }
  }

  createGCTrack(chromosome, sequence) {
    const track = document.createElement('div');
    track.className = 'gc-track';

    const trackHeader = document.createElement('div');
    trackHeader.className = 'track-header';
    trackHeader.textContent = 'GC Content & Skew';
    track.appendChild(trackHeader);

    const trackContent = document.createElement('div');
    trackContent.className = 'track-content gc-content-skew-display';

    // Add draggable functionality
    this.makeDraggable(trackContent, chromosome);

    const start = this.currentPosition.start;
    const end = this.currentPosition.end;
    const subsequence = sequence.substring(start, end);

    // Get GC track settings
    const gcSettings = this.trackRenderer.getTrackSettings('gc'); // Retrieve settings

    // Create GC content visualization (now passing settings)
    const gcCanvas = this.genomeBrowser.createGCContentVisualization(subsequence, gcSettings); // Pass settings

    trackContent.appendChild(gcCanvas);
    track.appendChild(trackContent);

    // Add track settings button
    const settingsButton = this.trackRenderer.createTrackSettingsButton('gc'); // Use trackRenderer method
    trackHeader.appendChild(settingsButton);

    return track;
  }

  createGCContentVisualization(sequence, settings) {
    const canvas = document.createElement('canvas');
    canvas.className = 'gc-visualization-canvas';
    const context = canvas.getContext('2d');

    // Default settings if none provided (should be handled by TrackRenderer, but for safety)
    const gcSettings = settings || {
      contentColor: '#3b82f6', // blue
      skewPositiveColor: '#10b981', // green
      skewNegativeColor: '#ef4444', // red
      lineWidth: 2,
      height: 140,
    };

    const width = (canvas.width = 800); // Arbitrary width, will be scaled by CSS
    const height = (canvas.height = 120); // Fixed height for the visualization
    const barWidth = 1; // Width of each data point

    const step = Math.max(1, Math.floor(sequence.length / width)); // Calculate step size to fit data to canvas width

    const gcContentData = [];
    const gcSkewData = [];

    // Calculate GC content and skew for sliding windows
    const windowSize = 500; // Window size for calculation
    for (let i = 0; i < sequence.length - windowSize; i += step) {
      const windowSeq = sequence.substring(i, i + windowSize);
      let g = 0;
      let c = 0;
      let total = 0;

      for (let j = 0; j < windowSeq.length; j++) {
        const base = windowSeq[j].toLowerCase();
        if (base === 'g') g++;
        else if (base === 'c') c++;
        if (base === 'g' || base === 'c' || base === 'a' || base === 't') total++;
      }

      const gcRatio = total > 0 ? (g + c) / total : 0;
      const gcSkew = g + c > 0 ? (g - c) / (g + c) : 0;

      gcContentData.push(gcRatio * height); // Scale to canvas height
      gcSkewData.push(gcSkew * (height / 2) + height / 2); // Scale and offset for skew
    }

    // Draw GC content and skew
    context.clearRect(0, 0, width, height);

    // Draw GC Content (blue bars)
    context.fillStyle = gcSettings.contentColor; // Use setting
    for (let i = 0; i < gcContentData.length; i++) {
      const barHeight = gcContentData[i];
      context.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
    }

    // Draw GC Skew (line graph, positive green, negative red)
    context.lineWidth = gcSettings.lineWidth; // Use setting
    context.beginPath();
    context.moveTo(0, gcSkewData[0]);

    for (let i = 1; i < gcSkewData.length; i++) {
      context.lineTo(i * barWidth, gcSkewData[i]);
    }

    // Apply color gradient based on skew value
    const gradient = context.createLinearGradient(0, 0, width, 0);
    // Create color stops based on skew values across the width
    for (let i = 0; i < gcSkewData.length; i++) {
      const skewValue = (gcSkewData[i] - height / 2) / (height / 2);
      let color;
      if (skewValue > 0) {
        // Interpolate between white (0 skew) and positive color
        const ratio = skewValue; // Skew is already scaled from 0 to 1 relative to height/2
        color = this.interpolateColor('#ffffff', gcSettings.skewPositiveColor, ratio); // Use setting
      } else {
        // Interpolate between white (0 skew) and negative color
        const ratio = -skewValue; // Use absolute value for interpolation
        color = this.interpolateColor('#ffffff', gcSettings.skewNegativeColor, ratio); // Use setting
      }
      gradient.addColorStop(i / gcSkewData.length, color);
    }

    context.strokeStyle = gradient;
    context.stroke();

    return canvas;
  }

  // Helper function for color interpolation
  interpolateColor(color1, color2, factor) {
    const result = color1.slice(); // Copy color1
    for (let i = 1; i < 7; i += 2) {
      const c1 = parseInt(color1.substr(i, 2), 16);
      const c2 = parseInt(color2.substr(i, 2), 16);
      const c = Math.round(c1 + factor * (c2 - c1)).toString(16);
      result[i] = ('0' + c).slice(-2);
      result[i + 1] = ('0' + c).slice(-2);
    }
    return result.join('');
  }

  // MCP Server Control Methods for Built-in Server
  async initializeMCPServerStatus() {
    try {
      await this.updateMCPServerStatus();

      const refreshStatus = () => {
        if (document.visibilityState === 'visible') {
          this.updateMCPServerStatus();
        }
      };

      this.mcpStatusInterval = setInterval(refreshStatus, 15000);
      document.addEventListener('visibilitychange', refreshStatus);
    } catch (error) {
      console.error('Error initializing MCP server status:', error);
    }
  }

  async updateMCPServerStatus() {
    try {
      // Check both the main process server and the chat manager connections
      const mainProcessResult = await ipcRenderer.invoke('mcp-server-status');

      // Check if ChatManager has connections to the built-in server
      let hasActiveConnections = false;
      if (this.chatManager?.mcpServerManager) {
        const connectedCount = this.chatManager.mcpServerManager.getConnectedServersCount();
        hasActiveConnections = connectedCount > 0;

        // Check specifically for genome-studio server connection
        const genomeStudioServer = this.chatManager.mcpServerManager.getServer('genome-studio');
        const isGenomeStudioConnected =
          genomeStudioServer && this.chatManager.mcpServerManager.activeServers.has('genome-studio');

        if (isGenomeStudioConnected) {
          hasActiveConnections = true;
        }
      }

      // If main process says running OR we have active connections, show as running
      if (mainProcessResult.isRunning || hasActiveConnections) {
        this.setMCPServerUIStatus('running', {
          httpPort: 3000,
          wsPort: 3001,
          connectedClients: hasActiveConnections ? 1 : 0,
        });
      } else {
        this.setMCPServerUIStatus(mainProcessResult.status, mainProcessResult);
      }
    } catch (error) {
      console.error('Error checking MCP server status:', error);
      this.setMCPServerUIStatus('stopped');
    }
  }

  setMCPServerUIStatus(status, info = {}) {
    const btn = document.getElementById('mcpServerBtn');
    const statusText = document.getElementById('mcpServerStatus');
    const statusIndicator = document.getElementById('mcpStatusIndicator');
    const statusDot = statusIndicator?.querySelector('.status-dot');
    const statusTextElement = statusIndicator?.querySelector('.status-text');

    if (btn) {
      btn.classList.remove('starting', 'running', 'stopping');
    }
    if (statusDot) {
      statusDot.classList.remove('status-stopped', 'status-starting', 'status-running', 'status-stopping');
    }

    switch (status) {
      case 'stopped':
        if (statusText) statusText.textContent = 'Start';
        if (statusTextElement) statusTextElement.textContent = 'Stopped';
        if (statusDot) statusDot.classList.add('status-stopped');
        if (btn) {
          btn.disabled = false;
          btn.title = 'Start Unified Claude MCP Server';
        }
        break;
      case 'starting':
        if (statusText) statusText.textContent = 'Starting...';
        if (statusTextElement) statusTextElement.textContent = 'Starting';
        if (statusDot) statusDot.classList.add('status-starting');
        if (btn) {
          btn.classList.add('starting');
          btn.disabled = true;
          btn.title = 'Unified Claude MCP Server is starting...';
        }
        break;
      case 'running': {
        if (statusText) statusText.textContent = 'Stop';
        const connectedText = info.connectedClients
          ? ` (${info.connectedClients} client${info.connectedClients !== 1 ? 's' : ''})`
          : '';
        if (statusTextElement) statusTextElement.textContent = `Running${connectedText}`;
        if (statusDot) statusDot.classList.add('status-running');
        const serverTypeText = info.serverType === 'unified-claude-mcp' ? 'Unified Claude MCP Server' : 'MCP Server';
        if (btn) {
          btn.classList.add('running');
          btn.disabled = false;
          btn.title = `Stop ${serverTypeText} (Connect MCP Client to: http://localhost:${info.httpPort || 3000}/mcp)${connectedText}`;
        }
        break;
      }
      case 'stopping':
        if (statusText) statusText.textContent = 'Stopping...';
        if (statusTextElement) statusTextElement.textContent = 'Stopping';
        if (statusDot) statusDot.classList.add('status-stopping');
        if (btn) {
          btn.classList.add('stopping');
          btn.disabled = true;
          btn.title = 'Unified Claude MCP Server is stopping...';
        }
        break;
    }
  }

  async toggleMCPBridge() {
    const toggle = document.getElementById('mcpServerToggle');
    if (!toggle) return;

    if (!this.mcpBridge) {
      console.warn('⚠️ MCPBridge not initialized');
      this.initializeMCPBridge();
      return;
    }

    if (toggle.checked) {
      console.log('🔌 Connecting MCP Bridge...');
      this.mcpBridge.start();
      this.showNotification('MCP Bridge connection enabled', 'info');
    } else {
      console.log('🔌 Disconnecting MCP Bridge...');
      this.mcpBridge.stop();
      this.updateMCPBridgeUI(false);
      this.showNotification('MCP Bridge connection disabled', 'info');
    }

    // Persist the toggle state
    if (this.configManager) {
      this.configManager.set('mcpBridgeEnabled', toggle.checked);
    }
  }

  updateMCPBridgeUI(connected) {
    const dot = document.getElementById('mcpBridgeStatusDot');
    const toggle = document.getElementById('mcpServerToggle');
    const container = document.querySelector('.mcp-server-toggle-container');

    if (dot) {
      if (connected) {
        dot.classList.add('connected');
      } else {
        dot.classList.remove('connected');
      }
    }

    if (toggle) {
      // Don't change checked state if it was user-initiated via toggleMCPBridge
      // But ensure it matches if we got an external status change
      if (connected && !toggle.checked) {
        toggle.checked = true;
        // Persist the state change from external source
        if (this.configManager) {
          this.configManager.set('mcpBridgeEnabled', true);
        }
      }
    }

    if (container) {
      container.title = connected
        ? 'CodeXomics MCP Bridge: CONNECTED (Tools available to third-party callers)'
        : 'CodeXomics MCP Bridge: DISCONNECTED (Connect to enable external tools)';
    }
  }

  async toggleLocalMCPServer() {
    try {
      const statusResult = await ipcRenderer.invoke('mcp-server-status');

      // Check if we have active connections through ChatManager
      let hasActiveConnections = false;
      if (this.chatManager?.mcpServerManager) {
        const connectedCount = this.chatManager.mcpServerManager.getConnectedServersCount();
        hasActiveConnections = connectedCount > 0;

        // Check specifically for genome-studio server connection
        const genomeStudioServer = this.chatManager.mcpServerManager.getServer('genome-studio');
        const isGenomeStudioConnected =
          genomeStudioServer && this.chatManager.mcpServerManager.activeServers.has('genome-studio');

        if (isGenomeStudioConnected) {
          hasActiveConnections = true;
        }
      }

      const isCurrentlyRunning = statusResult.isRunning || hasActiveConnections;

      if (isCurrentlyRunning) {
        // Stop the server and disconnect clients
        this.setMCPServerUIStatus('stopping');

        // Disconnect from ChatManager first if connected
        if (hasActiveConnections && this.chatManager?.mcpServerManager) {
          this.chatManager.mcpServerManager.disconnectAll();
        }

        const result = await ipcRenderer.invoke('mcp-server-stop');

        if (result.success) {
          this.showNotification('MCP Server stopped successfully', 'success');
        } else {
          this.showNotification(`Failed to stop MCP Server: ${result.message}`, 'error');
        }
      } else {
        // Start the server
        this.setMCPServerUIStatus('starting');
        const result = await ipcRenderer.invoke('mcp-server-start');

        if (result.success) {
          const serverTypeText =
            result.serverType === 'unified-claude-mcp' ? 'Unified Claude MCP Server' : 'MCP Server';
          this.showNotification(
            `${serverTypeText} started successfully! MCP Client can connect via custom connector: http://localhost:${result.httpPort}/mcp`,
            'success'
          );

          // Auto-connect the ChatManager to the built-in server after starting (only if auto-activation is allowed)
          const currentSettings = this.configManager
            ? this.configManager.get('mcpSettings', { allowAutoActivation: false })
            : { allowAutoActivation: false };

          if (currentSettings.allowAutoActivation) {
            // For unified RPC server, no WebSocket connection needed
            // The RPC interface is automatically available when the server starts
            console.log('✅ Unified Claude MCP Server RPC interface is ready');
          }
        } else {
          this.showNotification(`Failed to start MCP Server: ${result.message}`, 'error');
        }
      }

      // Update status after action
      setTimeout(() => {
        this.updateMCPServerStatus();
      }, 1500);
    } catch (error) {
      console.error('Error toggling MCP server:', error);
      this.showNotification(`Error controlling MCP Server: ${error.message}`, 'error');
      this.setMCPServerUIStatus('stopped');
    }
  }

  // Global notification method
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

    // Add to page
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 100);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentElement) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Open Resource Manager window
   */
  openResourceManager() {
    try {
      // Use IPC to request opening the Resource Manager from main process
      ipcRenderer.send('open-resource-manager');

      this.showNotification('Resource Manager window is opening...', 'info');
    } catch (error) {
      console.error('Failed to open Resource Manager:', error);
      this.showNotification('Unable to open Resource Manager window', 'error');
    }
  }

  /**
   * Open Project Manager window
   */
  async openProjectManagerWindow() {
    try {
      // Use IPC to request opening the Project Manager from main process
      ipcRenderer.send('open-project-manager');

      this.showNotification('Project Manager window is opening...', 'info');

      // Return a promise that waits for the project manager window to be available
      return new Promise(resolve => {
        // A listener could be added here to wait for the window to be ready
        setTimeout(() => {
          // Simulate returning an object containing the window instance
          // In real use, the window instance may need to be obtained via IPC or another mechanism
          resolve({
            projectManagerWindow: {
              saveCurrentProjectAsXML: async () => {
                console.log('Triggered save current project as XML');
                this.showNotification('Project saved as XML via Project Manager', 'success');
              },
            },
          });
        }, 500);
      });
    } catch (error) {
      console.error('Failed to open Project Manager:', error);
      this.showNotification('Unable to open Project Manager window', 'error');
      throw error;
    }
  }

  /**
   * Initialize Plugin Management UI with retry mechanism
   */
  async initializePluginManagementUI() {
    if (this.pluginManagementUI) return this.pluginManagementUI;
    if (this.pluginManagementInitializationPromise) return this.pluginManagementInitializationPromise;

    this.pluginManagementInitializationPromise = (async () => {
      try {
        if (this.chatManager?.waitForPluginManager) {
          await this.chatManager.waitForPluginManager();
        }
        if (!this.chatManager?.pluginManager) {
          throw new Error('Plugin manager is not available');
        }

        await this.loadPluginDevelopmentModules();
        this.pluginManagementUI = new PluginManagementUI(this.chatManager.pluginManager, this.configManager);
        window.pluginManagementUI = this.pluginManagementUI;
        return this.pluginManagementUI;
      } catch (error) {
        console.error('❌ Error initializing PluginManagementUI:', error);
        this.showNotification('Plugin Management could not be initialized.', 'error');
        return null;
      } finally {
        this.pluginManagementInitializationPromise = null;
      }
    })();

    return this.pluginManagementInitializationPromise;
  }

  async loadPluginDevelopmentModules() {
    const modules = [
      'modules/PluginTestHelpers.js',
      'modules/CircosPluginTestSuite.js',
      'modules/PluginTestFramework.js',
      'modules/PluginTestManager.js',
      'modules/PluginDemoGenerator.js',
      'modules/PluginRealTestDemonstrator.js',
      'modules/PluginTestWindowMenuManager.js',
    ];

    for (const modulePath of modules) {
      if (document.querySelector(`script[src="${modulePath}"]`)) continue;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = modulePath;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${modulePath}`));
        document.head.appendChild(script);
      });
    }
  }

  /**
   * Handle Copy action from Edit menu
   */
  handleMenuCopy() {
    try {
      // Allow Edit menu to work regardless of focus state
      // This ensures menu copy/paste work when accessed via menu bar

      // Get the currently focused element
      const activeElement = document.activeElement;

      // If there's a text selection anywhere on the page
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        navigator.clipboard
          .writeText(selection.toString())
          .then(() => {
            this.showNotification('Text copied to clipboard', 'success');
          })
          .catch(err => {
            console.error('Failed to copy selection:', err);
            this.showNotification('❌ Failed to copy text', 'error');
          });
        return;
      }

      // If focused on an input field with selected text
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        if (start !== end) {
          const selectedText = activeElement.value.substring(start, end);
          navigator.clipboard
            .writeText(selectedText)
            .then(() => {
              this.showNotification('Text copied to clipboard', 'success');
            })
            .catch(err => {
              console.error('Failed to copy input text:', err);
              this.showNotification('❌ Failed to copy text', 'error');
            });
          return;
        }
      }

      // Check if there's a sequence to copy (gene or sequence selection)
      if (this.sequenceUtils && this.currentSequence && Object.keys(this.currentSequence).length > 0) {
        // Use existing sequence copy functionality
        this.sequenceUtils.copySequence();
        return;
      }

      // If ChatManager is available and there's selected text in chat
      if (window.chatManager && typeof window.chatManager.copySelectedText === 'function') {
        const chatSelection = window.getSelection();
        if (chatSelection && chatSelection.toString().trim()) {
          window.chatManager.copySelectedText();
          return;
        }
      }

      // No content to copy
      this.showNotification('⚠️ No content selected to copy', 'warning');
    } catch (error) {
      console.error('Error in handleMenuCopy:', error);
      this.showNotification('❌ Error copying content', 'error');
    }
  }

  /**
   * Handle Paste action from Edit menu
   */
  handleMenuPaste() {
    try {
      // Allow Edit menu to work regardless of focus state
      // This ensures menu copy/paste work when accessed via menu bar

      const activeElement = document.activeElement;

      // If focused on an input field or textarea
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        navigator.clipboard
          .readText()
          .then(text => {
            if (!text.trim()) {
              this.showNotification('⚠️ Clipboard is empty', 'warning');
              return;
            }

            // Insert text at cursor position
            const start = activeElement.selectionStart;
            const end = activeElement.selectionEnd;
            const currentValue = activeElement.value;
            const supportsTextSelection = typeof start === 'number' && typeof end === 'number';

            if (supportsTextSelection) {
              const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
              activeElement.value = newValue;

              // Set cursor position after pasted text
              const newCursorPosition = start + text.length;
              activeElement.setSelectionRange(newCursorPosition, newCursorPosition);
            } else {
              activeElement.value = text.trim();
            }

            // Trigger input event for any listeners
            activeElement.dispatchEvent(new Event('input', { bubbles: true }));

            this.showNotification(`✅ Pasted ${text.length} characters`, 'success');
          })
          .catch(err => {
            console.error('Failed to paste text:', err);
            this.showNotification('❌ Failed to paste from clipboard', 'error');
          });
        return;
      }

      // If ChatManager is available and chat input is present
      if (window.chatManager && typeof window.chatManager.pasteFromClipboard === 'function') {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
          window.chatManager.pasteFromClipboard();
          return;
        }
      }

      // No suitable target for pasting
      this.showNotification('⚠️ No input field selected for pasting', 'warning');
    } catch (error) {
      console.error('Error in handleMenuPaste:', error);
      this.showNotification('❌ Error pasting content', 'error');
    }
  }

  /**
   * Handle Select All action from Edit menu
   */
  handleMenuSelectAll() {
    try {
      const activeElement = document.activeElement;

      // If focused on an input field or textarea
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        activeElement.select();
        this.showNotification('All text selected', 'success');
        return;
      }

      // If there's content in the main genome viewer area
      const genomeViewer = document.getElementById('genomeViewer');
      if (genomeViewer && genomeViewer.textContent.trim()) {
        // Select all text in the genome viewer
        const range = document.createRange();
        range.selectNodeContents(genomeViewer);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        this.showNotification('Genome content selected', 'success');
        return;
      }

      // If there's chat content
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages && chatMessages.textContent.trim()) {
        const range = document.createRange();
        range.selectNodeContents(chatMessages);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        this.showNotification('Chat content selected', 'success');
        return;
      }

      // Select all content on the page as fallback
      document.execCommand('selectAll');
      this.showNotification('All page content selected', 'success');
    } catch (error) {
      console.error('Error in handleMenuSelectAll:', error);
      this.showNotification('❌ Error selecting content', 'error');
    }
  }
}

// Initialize the CodeXomics when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // Wait for all scripts to be loaded before initializing
  const waitForScriptsToLoad = () => {
    return new Promise(resolve => {
      const checkScriptsLoaded = () => {
        // Only check if GenomeBrowser is available (defined in same file)
        // Other modules will be loaded asynchronously
        if (typeof GenomeBrowser !== 'undefined') {
          resolve();
        } else {
          setTimeout(checkScriptsLoaded, 50);
        }
      };
      checkScriptsLoaded();
    });
  };

  // Initialize after all scripts are loaded
  waitForScriptsToLoad()
    .then(() => {
      console.log('✅ All required scripts loaded, initializing CodeXomics...');
      window.genomeBrowser = new GenomeBrowser();
      window.app = window.genomeBrowser; // Ensure app is available for benchmark system

      // Initialize enhanced citation display after a delay to ensure modules are loaded
      const initializeEnhancedCitationDisplay = () => {
        console.log('Initializing Enhanced Citation Display...');
        console.log('EnhancedCitationDisplay available:', typeof window.EnhancedCitationDisplay);
        console.log('LiteratureAPIService available:', typeof window.LiteratureAPIService);

        if (window.EnhancedCitationDisplay && window.LiteratureAPIService) {
          try {
            window.genomeBrowser.enhancedCitationDisplay = new EnhancedCitationDisplay(window.genomeBrowser);
            window.genomeBrowser.enhancedCitationDisplay.init();
            window.enhancedCitationDisplay = window.genomeBrowser.enhancedCitationDisplay;
            console.log('✅ Enhanced Citation Display initialized successfully');
            return true;
          } catch (error) {
            console.error('❌ Error initializing Enhanced Citation Display:', error);
            return false;
          }
        } else {
          console.warn('⚠️ Enhanced Citation Display modules not available');
          return false;
        }
      };

      // Try to initialize Enhanced Citation Display immediately
      // If it fails, try again after a short delay to ensure scripts are loaded
      if (!initializeEnhancedCitationDisplay()) {
        console.log('⏳ Retrying Enhanced Citation Display initialization after delay...');
        setTimeout(() => {
          if (!initializeEnhancedCitationDisplay()) {
            console.warn('⚠️ Enhanced Citation Display initialization failed after retry, but continuing...');
          }
        }, 500);
      }
    })
    .catch(error => {
      console.error('❌ Failed to wait for scripts to load:', error);
      if (!window.genomeBrowser) {
        // Fallback: initialize anyway if construction never reached the global assignment.
        window.genomeBrowser = new GenomeBrowser();
      }
    });
});

/**
 * TrackStateManager - Manages track sizes and order persistence
 */
class TrackStateManager {
  constructor(genomeBrowser) {
    this.genomeBrowser = genomeBrowser;
    this.trackSizes = new Map();
    this.trackOrder = [];

    // Mapping between DOM class suffixes and internal track type keys (consistent with TabManager)
    this.trackTypeMapping = {
      gene: 'genes',
      gc: 'gc',
      variant: 'variants',
      reads: 'reads',
      protein: 'proteins',
      proteins: 'proteins',
      wig: 'wigTracks',
      'sequence-line': 'sequenceLine',
      sequence: 'sequence',
      actions: 'actions',
      blast: 'blast',
    };

    this.loadState();
  }

  // Save track size
  saveTrackSize(trackType, height) {
    const mappedType = this.trackTypeMapping[trackType] || trackType;
    console.log(`[TrackStateManager] Saving track size: ${mappedType} (from ${trackType}) = ${height}`);
    this.trackSizes.set(mappedType, height);

    // Notify TabManager for tab-specific persistence
    if (this.genomeBrowser.tabManager) {
      this.genomeBrowser.tabManager.onTrackSizeChanged(mappedType, height);
    }

    this.saveState();
    console.log(`Saved track size: ${mappedType} = ${height}`);
  }

  // Get saved track size
  getTrackSize(trackType) {
    const mappedType = this.trackTypeMapping[trackType] || trackType;

    // Prioritize TabManager for tab-specific results
    if (this.genomeBrowser.tabManager) {
      const tabState = this.genomeBrowser.tabManager.getCurrentTabState();
      if (tabState && tabState.trackSizes && tabState.trackSizes[mappedType]) {
        return tabState.trackSizes[mappedType];
      }
    }

    return this.trackSizes.get(mappedType) || null;
  }

  // Save track order
  saveTrackOrder(order) {
    this.trackOrder = [...order];
    this.saveState();
    console.log('Saved track order:', this.trackOrder);
  }

  // Get saved track order
  getTrackOrder() {
    // Prioritize TabManager for tab-specific results
    if (this.genomeBrowser.tabManager) {
      const tabState = this.genomeBrowser.tabManager.getCurrentTabState();
      if (tabState && tabState.trackOrder && tabState.trackOrder.length > 0) {
        return [...tabState.trackOrder];
      }
    }

    return [...this.trackOrder];
  }

  // Apply saved track sizes to newly created tracks
  applyTrackSizes(container) {
    const trackElements = container.querySelectorAll('[class*="-track"]');

    trackElements.forEach(element => {
      const classList = Array.from(element.classList);
      const trackClass = classList.find(cls => cls.endsWith('-track'));
      if (trackClass) {
        const trackType = trackClass.replace('-track', '');
        const mappedType = this.trackTypeMapping[trackType] || trackType;
        const savedSize = this.getTrackSize(mappedType);

        console.log(
          `[TrackStateManager] Processing track: class="${trackClass}", type="${trackType}", mapped="${mappedType}", savedSize="${savedSize}"`
        );

        if (savedSize) {
          const trackContent = element.querySelector('.track-content');
          if (trackContent) {
            trackContent.style.height = savedSize;
            console.log(`Applied saved size to ${mappedType}: ${savedSize}`);
          }
        }
      }
    });
  }

  // Apply saved track order
  applyTrackOrder(container) {
    if (this.trackOrder.length === 0) return;

    const trackElements = Array.from(container.querySelectorAll('[class*="-track"]'));

    // Create a map of current tracks by type
    const tracksByType = new Map();
    trackElements.forEach(element => {
      const classList = Array.from(element.classList);
      const trackClass = classList.find(cls => cls.endsWith('-track'));
      if (trackClass) {
        const trackType = trackClass.replace('-track', '');
        const mappedType = this.trackTypeMapping[trackType] || trackType;
        tracksByType.set(mappedType, element);
      }
    });

    // Reorder tracks according to saved order
    this.trackOrder.forEach((trackType, index) => {
      const trackElement = tracksByType.get(trackType);
      if (trackElement) {
        container.appendChild(trackElement); // This moves it to the end
        console.log(`Reordered track ${trackType} to position ${index}`);
      }
    });
  }

  // Save state to localStorage
  saveState() {
    try {
      const state = {
        trackSizes: Object.fromEntries(this.trackSizes),
        trackOrder: this.trackOrder,
      };
      localStorage.setItem('genomeViewer_trackState', JSON.stringify(state));
    } catch (error) {
      console.error('Error saving track state:', error);
    }
  }

  // Load state from localStorage
  loadState() {
    // If we have a TabManager, it should be the primary source of truth
    if (this.genomeBrowser.tabManager) {
      const tabState = this.genomeBrowser.tabManager.getCurrentTabState();
      if (tabState) {
        if (tabState.trackSizes) {
          this.trackSizes = new Map(Object.entries(tabState.trackSizes));
        }
        if (tabState.trackOrder) {
          this.trackOrder = [...tabState.trackOrder];
        }
        console.log('[TrackStateManager] Loaded state from TabManager');
        return;
      }
    }

    try {
      const saved = localStorage.getItem('genomeViewer_trackState');
      if (saved) {
        const state = JSON.parse(saved);
        this.trackSizes = new Map(Object.entries(state.trackSizes || {}));
        this.trackOrder = state.trackOrder || [];
        console.log('Loaded track state:', { sizes: state.trackSizes, order: state.trackOrder });
      }
    } catch (error) {
      console.error('Error loading track state:', error);
      this.trackSizes = new Map();
      this.trackOrder = [];
    }
  }

  // Clear all saved state
  clearState() {
    this.trackSizes.clear();
    this.trackOrder = [];
    localStorage.removeItem('genomeViewer_trackState');
    console.log('Cleared track state');
  }
}

// Load MicrobeGenomicsFunctions for chat integration
document.addEventListener('DOMContentLoaded', function () {
  // Dynamically load MicrobeGenomicsFunctions if not already loaded
  if (!window.MicrobeFns) {
    const script = document.createElement('script');
    script.src = './modules/MicrobeGenomicsFunctions.js';
    script.onload = function () {
      console.log('MicrobeGenomicsFunctions loaded successfully');
      // Trigger re-initialization of ChatManager if it exists
      if (window.chatManager && window.chatManager.initializeMicrobeGenomicsFunctions) {
        window.chatManager.initializeMicrobeGenomicsFunctions();
      }
    };
    script.onerror = function () {
      console.error('Failed to load MicrobeGenomicsFunctions');
    };
    document.head.appendChild(script);
  } else {
    console.log('MicrobeGenomicsFunctions already available');
  }
});
