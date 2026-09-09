/**
 * Internal MCP Server for CodeXomics
 *
 * This runs inside the renderer process and has direct access to all Genome Studio modules.
 * It communicates with the main process MCP server via IPC.
 */

// Access ipcRenderer without redeclaring
const mcpServerIpc =
  (typeof window !== 'undefined' && window.ipcRenderer) || (typeof ipcRenderer !== 'undefined' ? ipcRenderer : null);

class InternalMCPServer {
  constructor() {
    this.genomeStudio = null;
    this.isRunning = false;
    this.setupIPCHandlers();
  }

  // Initialize with CodeXomics instance
  initialize(genomeStudioInstance) {
    this.genomeStudio = genomeStudioInstance;
    console.log('🔧 Internal MCP Server initialized with CodeXomics instance');
  }

  // Setup IPC handlers for communication with main process MCP server
  setupIPCHandlers() {
    mcpServerIpc.on('mcp-tool-call', async (event, request) => {
      const { requestId, method, parameters, executionContext } = request;

      try {
        const result = await this.executeMethod(method, parameters, executionContext, requestId);

        // Send success response back to main process
        mcpServerIpc.send('mcp-tool-response', {
          requestId,
          success: true,
          result,
        });
      } catch (error) {
        console.error(`🚨 MCP Tool Error for method ${method}:`, error);

        // Send error response back to main process
        mcpServerIpc.send('mcp-tool-response', {
          requestId,
          success: false,
          error: error.message,
        });
      }
    });
  }

  // Execute the requested method
  // Uses dynamic routing to support all 40+ tools via ChatManager delegation
  async executeMethod(method, parameters, executionContext = null, requestId = null) {
    if (!this.genomeStudio) {
      throw new Error('Genome Studio instance not available');
    }

    // Genome-identity guard: if the client asserted which genome it expects
    // (expected_genome), fail loudly when this window has a different genome
    // loaded rather than returning data computed against the wrong genome.
    if (parameters && parameters.expected_genome) {
      const expected = String(parameters.expected_genome).trim();
      const actual = this.genomeStudio.currentGenomeName || null;
      const matches = actual && String(actual).trim().toLowerCase() === expected.toLowerCase();
      if (!matches) {
        throw new Error(
          `Genome mismatch: this window has '${actual || 'no genome'}' loaded, but the call expected ` +
            `'${expected}'. Re-target with the correct windowId (call list_genome_windows).`
        );
      }
      // Strip so downstream tool handlers don't receive an unexpected parameter.
      parameters = { ...parameters };
      delete parameters.expected_genome;
    }

    console.log(`🔧 [InternalMCPServer] Executing method: ${method}`);

    // codexomics_chat is an MCP runtime wrapper, not a ChatManager tool.
    // Handle it before generic tool delegation so agent-mode chat reaches processAgentPrompt.
    if (method === 'codexomicsChat') {
      return await this.handleCodexomicsChat(parameters, executionContext, requestId);
    }

    // Convert camelCase method name back to snake_case tool name for ChatManager
    const toolName = method.replace(/([A-Z])/g, '_$1').toLowerCase();

    // First, try to delegate to ChatManager for comprehensive tool support
    // ChatManager.executeToolByName() handles 70+ tools with priority routing via ToolExecutionService
    const chatManager = this.genomeStudio.chatManager || window.chatManager;
    if (chatManager) {
      try {
        console.log(`📡 [InternalMCPServer] Delegating '${toolName}' to ChatManager`);
        const result = await chatManager.executeToolByName(toolName, parameters, {
          bypassAgent: true,
          executionContext,
          requestId,
          sessionId: executionContext?.sessionId || null,
          transportSessionId: executionContext?.transportSessionId || null,
          source: 'mcp-tool',
        });
        if (result !== undefined) {
          console.log(`✅ [InternalMCPServer] Tool '${toolName}' executed via ChatManager`);
          if (
            result &&
            typeof result === 'object' &&
            typeof result.status === 'string' &&
            typeof result.executionId === 'string' &&
            Object.prototype.hasOwnProperty.call(result, 'value')
          ) {
            if (result.status === 'succeeded' || result.status === 'queued') return result.value;
            const error = new Error(result.error?.message || result.status);
            error.status = result.status;
            error.code = result.error?.code || result.status.toUpperCase();
            throw error;
          }
          if (result && typeof result === 'object' && result.success === false) {
            return { ...result, executedVia: 'ChatManager' };
          }
          return {
            success: true,
            result,
            executedVia: 'ChatManager',
          };
        }
        // ChatManager returned undefined — tool not found
        console.warn(`⚠️ [InternalMCPServer] ChatManager returned undefined for '${toolName}'`);
      } catch (error) {
        console.warn(`⚠️ [InternalMCPServer] ChatManager execution failed for '${toolName}':`, error.message);
        // Rethrow the original error instead of falling through
        throw error;
      }
    } else {
      console.warn(
        `⚠️ [InternalMCPServer] ChatManager not available on genomeStudio (chatManager=${this.genomeStudio.chatManager}, window.chatManager=${window.chatManager})`
      );
    }

    // Fallback: Direct handlers for core methods that may not be in ChatManager
    // These are kept for backward compatibility and as fallback
    switch (method) {
      // Navigation methods
      case 'navigateToPosition':
        return await this.navigateToPosition(parameters);

      case 'searchFeatures':
        return await this.searchFeatures(parameters);

      case 'jumpToGene':
        return await this.jumpToGene(parameters);

      case 'searchGeneByName':
        return await this.searchGeneByName(parameters);

      // State management
      case 'getCurrentState':
        return await this.getCurrentState(parameters);

      case 'getGenomeInfo':
        return await this.getGenomeInfo(parameters);

      // Track management
      case 'toggleTrack':
        return await this.toggleTrack(parameters);

      // Sequence analysis
      case 'getCodingSequence':
        return await this.getCodingSequence(parameters);

      case 'getSequenceRegion':
        return await this.getSequenceRegion(parameters);

      // Protein structure analysis
      case 'searchAlphafoldStructures':
      case 'searchAlphafoldByGene':
        return await this.searchAlphaFoldByGene(parameters);

      // Utility methods
      case 'ping':
        return this.ping();

      // New navigation methods
      case 'openNewTab':
        return await this.openNewTab(parameters);

      case 'switchToTab':
        return await this.switchToTab(parameters);

      case 'closeTab':
        return await this.closeTab(parameters);

      case 'zoomIn':
        return await this.zoom(parameters, 'in');

      case 'zoomOut':
        return await this.zoom(parameters, 'out');

      // Codon usage analysis tools
      case 'codonUsageAnalysis':
        return await this.codonUsageAnalysis(parameters);

      case 'genomeCodonUsageAnalysis':
        return await this.genomeCodonUsageAnalysis(parameters);

      // Multi-window management (IPC-based)
      case 'listGenomeWindows':
        return await this.listGenomeWindowsViaIPC();

      case 'focusGenomeWindow':
      case 'switchActiveWindow':
        return await this.focusGenomeWindowViaIPC(parameters);

      // File loading tools — delegate to ChatManager method directly
      // These are needed as fallback when executeToolByName returns undefined
      case 'loadGenomeFile':
        return await this._delegateToChatManager('loadGenomeFile', parameters);
      case 'loadAnnotationFile':
        return await this._delegateToChatManager('loadAnnotationFile', parameters);
      case 'loadVariantFile':
        return await this._delegateToChatManager('loadVariantFile', parameters);
      case 'loadReadsFile':
        return await this._delegateToChatManager('loadReadsFile', parameters);
      case 'loadWigTracks':
        return await this._delegateToChatManager('loadWigTracks', parameters);
      case 'loadOperonFile':
        return await this._delegateToChatManager('loadOperonFile', parameters);

      default:
        // Last resort: try to call the method directly on ChatManager by camelCase name
        // This handles tools that exist in ChatManager but are not in the switch or
        // were missed by executeToolByName
        if (chatManager && typeof chatManager[method] === 'function') {
          console.log(`🔄 [InternalMCPServer] Last-resort: calling chatManager.${method}() directly`);
          try {
            const result = await chatManager[method](parameters);
            return {
              success: true,
              result,
              executedVia: 'ChatManager-direct',
            };
          } catch (directError) {
            throw new Error(
              `Method '${method}' (tool '${toolName}') exists on ChatManager but execution failed: ${directError.message}`
            );
          }
        }

        console.warn(`⚠️ [InternalMCPServer] Method '${method}' not found in fallback handlers or ChatManager`);
        throw new Error(
          `Unknown method: ${method}. Tool '${toolName}' was not found in ChatManager or fallback handlers. ` +
            `ChatManager available: ${!!chatManager}, genomeStudio.chatManager: ${!!this.genomeStudio.chatManager}`
        );
    }
  }

  // New helper methods for additional navigation tools
  async openNewTab(parameters) {
    return await this._delegateToChatManager('openNewTab', parameters);
  }

  async switchToTab(parameters) {
    return await this._delegateToChatManager('switchToTab', parameters);
  }

  async closeTab(parameters) {
    return await this._delegateToChatManager('closeTab', parameters);
  }

  async zoom(parameters, direction) {
    if (!this.genomeStudio.navigationManager) {
      throw new Error('NavigationManager not available');
    }

    const factor = parameters.factor || 2;

    if (direction === 'in') {
      await this.genomeStudio.navigationManager.zoomIn(factor);
    } else {
      await this.genomeStudio.navigationManager.zoomOut(factor);
    }

    return {
      success: true,
      direction,
      factor,
      message: `Zoomed ${direction} by factor ${factor}`,
    };
  }

  // Codon usage analysis - delegates to ChatManager
  async codonUsageAnalysis(parameters) {
    if (!this.genomeStudio.chatManager) {
      throw new Error('ChatManager not available');
    }

    console.log('🧬 [InternalMCPServer] Delegating codonUsageAnalysis to ChatManager');
    const result = await this.genomeStudio.chatManager.codonUsageAnalysis(parameters);
    return result;
  }

  // Genome-wide codon usage analysis - delegates to ChatManager
  async genomeCodonUsageAnalysis(parameters) {
    if (!this.genomeStudio.chatManager) {
      throw new Error('ChatManager not available');
    }

    console.log('🧬 [InternalMCPServer] Delegating genomeCodonUsageAnalysis to ChatManager');
    const result = await this.genomeStudio.chatManager.genomeCodonUsageAnalysis(parameters);
    return result;
  }

  // Agent mode implementation - codexomics_chat
  async handleCodexomicsChat(parameters, executionContext = null, requestId = null) {
    const chatManager = this.genomeStudio.chatManager || window.chatManager;
    if (!chatManager) {
      throw new Error('ChatManager not available for agent mode');
    }

    if (typeof chatManager.processAgentPrompt !== 'function') {
      throw new Error('processAgentPrompt method not available - please update CodeXomics');
    }

    // Create onProgress callback that sends notifications via IPC to main process
    // This allows the MCP server to forward progress to the MCP client
    const onProgress = progress => {
      try {
        mcpServerIpc.send('mcp-agent-progress', {
          type: progress.type,
          message: progress.message,
          data: progress.data || null,
          sessionId: executionContext?.sessionId || null,
          transportSessionId: executionContext?.transportSessionId || null,
          requestId,
          timestamp: Date.now(),
        });
      } catch (e) {
        console.debug('[InternalMCPServer] Failed to send progress notification:', e.message);
      }
    };

    const result = await chatManager.processAgentPrompt(parameters.prompt, {
      activateMultiAgent: parameters.activate_multi_agent || false,
      context: parameters.context || {},
      executionContext,
      requestId,
      parentTurnId: executionContext?.parentTurnId || null,
      source: 'mcp-agent',
      scope: executionContext || null,
      onProgress,
    });

    return result;
  }

  // Navigation implementations
  async navigateToPosition({ chromosome, start, end, position }) {
    if (!this.genomeStudio.navigationManager) {
      throw new Error('NavigationManager not available');
    }

    if (!chromosome) {
      const chromosomeSelect = document.getElementById('chromosomeSelect');
      if (chromosomeSelect && chromosomeSelect.value) {
        chromosome = chromosomeSelect.value;
      } else if (this.genomeStudio.currentSequence) {
        const availableChromosomes = Object.keys(this.genomeStudio.currentSequence);
        if (availableChromosomes.length > 0) {
          chromosome = availableChromosomes[0];
        }
      }
    }

    if (!chromosome) {
      throw new Error('No chromosome specified and unable to auto-detect');
    }

    if (position !== undefined && (start === undefined || end === undefined)) {
      const defaultRange = 2000;
      start = Math.max(1, position - Math.floor(defaultRange / 2));
      end = position + Math.floor(defaultRange / 2);
    }

    const result = this.genomeStudio.navigationManager.navigateToPosition(chromosome, start, end);

    // Surface the navigation error itself; reporting "Navigated to ..." on a
    // failed call leaves the caller with no idea what went wrong.
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

    return {
      success: true,
      chromosome: result.chromosome || chromosome,
      start,
      end,
      message: `Navigated to ${result.chromosome || chromosome}:${start}-${end}`,
    };
  }

  async searchFeatures({ query, featureType }) {
    if (!this.genomeStudio.navigationManager) {
      throw new Error('NavigationManager not available');
    }

    const results = await this.genomeStudio.navigationManager.searchFeatures(query, featureType);

    return {
      success: true,
      query,
      featureType,
      results: results || [],
      count: results ? results.length : 0,
    };
  }

  async jumpToGene({ geneName }) {
    if (!this.genomeStudio.navigationManager) {
      throw new Error('NavigationManager not available');
    }

    const result = await this.genomeStudio.navigationManager.jumpToGene(geneName);

    return {
      success: true,
      geneName,
      result,
    };
  }

  async searchGeneByName({ name }) {
    if (!this.genomeStudio.navigationManager) {
      throw new Error('NavigationManager not available');
    }

    const results = await this.genomeStudio.navigationManager.searchGeneByName(name);

    return {
      success: true,
      geneName: name,
      results: results || [],
      found: results && results.length > 0,
    };
  }

  // State management implementations
  async getCurrentState() {
    const state = {
      timestamp: Date.now(),
    };

    if (this.genomeStudio.navigationManager) {
      state.navigation = {
        currentChromosome: this.genomeStudio.currentChromosome,
        currentPosition: this.genomeStudio.currentPosition,
        zoomLevel: this.genomeStudio.navigationManager.zoomLevel,
      };
    }

    if (this.genomeStudio.fileManager) {
      state.files = {
        loadedFiles: this.genomeStudio.loadedFiles || [],
        currentGenome: this.genomeStudio.fileManager.currentGenome,
      };
    }

    if (this.genomeStudio.trackRenderer) {
      state.tracks = {
        visibleTracks: Object.keys(this.genomeStudio.trackVisibility || {}),
        trackVisibility: this.genomeStudio.trackVisibility,
      };
    }

    return state;
  }

  async getGenomeInfo(params = {}) {
    if (!this.genomeStudio.fileManager || !this.genomeStudio.currentSequence) {
      throw new Error('Genome data not available');
    }

    const { include_statistics = true, include_annotations = true, include_chromosomes = true } = params;

    const sequenceLength = Object.values(this.genomeStudio.currentSequence).reduce((acc, seq) => acc + seq.length, 0);

    const genomeInfo = {
      name: this.genomeStudio.fileManager.currentGenome?.name || 'Unknown',
      length: this.genomeStudio.sequenceLength || sequenceLength,
      loadedFiles: this.genomeStudio.loadedFiles || [],
    };

    if (include_chromosomes) {
      genomeInfo.chromosomes = Object.keys(this.genomeStudio.currentSequence);
    }

    // Comprehensive statistical counts by gene type (e.g., CDS, tRNA, rRNA)
    if (include_annotations && this.genomeStudio.currentAnnotations) {
      let totalFeatures = 0;
      const featureCounts = {};

      const chromosomes = Object.keys(this.genomeStudio.currentAnnotations);
      for (const chr of chromosomes) {
        const features = this.genomeStudio.currentAnnotations[chr] || [];
        totalFeatures += features.length;

        for (const feature of features) {
          const type = feature.type || 'unknown';
          featureCounts[type] = (featureCounts[type] || 0) + 1;
        }
      }

      genomeInfo.annotations = {
        hasData: true,
        totalFeatures,
        featureCounts,
      };
    } else {
      genomeInfo.annotations = {
        hasData: false,
        totalFeatures: 0,
        featureCounts: {},
      };
    }

    // Comprehensive sequence statistics per chromosome
    if (include_statistics) {
      const chromosomeStats = {};
      const chroms = Object.keys(this.genomeStudio.currentSequence);
      for (const chr of chroms) {
        const seq = this.genomeStudio.currentSequence[chr];
        const gcCount = (seq.match(/[GgCc]/g) || []).length;
        const gcPercent = Math.round((gcCount / seq.length) * 10000) / 100;

        chromosomeStats[chr] = {
          length: seq.length,
          gcPercent: gcPercent,
        };
      }
      genomeInfo.statistics = { chromosomeStats };
    }

    return {
      success: true,
      genomeInfo,
    };
  }

  // Track management implementation
  async toggleTrack({ trackName, visible }) {
    if (!this.genomeStudio.trackRenderer) {
      throw new Error('TrackRenderer not available');
    }

    if (!trackName) {
      throw new Error('trackName parameter is required');
    }

    // Normalize track name (handle snake_case and variations)
    const trackMapping = {
      genes: 'genes',
      gc: 'gc',
      gc_content: 'gc',
      variants: 'variants',
      reads: 'reads',
      proteins: 'proteins',
      primers: 'primers',
      primer: 'primers',
      wigtracks: 'wigTracks',
      wigTracks: 'wigTracks',
      wig: 'wigTracks',
      sequence: 'sequence',
      sequenceline: 'sequenceLine',
      sequenceLine: 'sequenceLine',
      actions: 'actions',
      action: 'actions',
      blast: 'blast',
      blast_results: 'blast',
    };

    const normalizedTrackName = trackMapping[trackName.toLowerCase()] || trackMapping[trackName] || trackName;

    // Update track visibility
    this.genomeStudio.trackVisibility = this.genomeStudio.trackVisibility || {};
    this.genomeStudio.trackVisibility[normalizedTrackName] = visible;

    // Also update the UI checkboxes to reflect the state change
    // This ensures UI stays in sync with internal state
    const checkboxMapping = {
      genes: 'trackGenes',
      gc: 'trackGC',
      variants: 'trackVariants',
      reads: 'trackReads',
      proteins: 'trackProteins',
      primers: 'trackPrimers',
      wigTracks: 'trackWIG',
      sequence: 'trackSequence',
      sequenceLine: 'trackSequenceLine',
      actions: 'trackActions',
      blast: 'trackBlast',
    };

    const checkboxId = checkboxMapping[normalizedTrackName];
    if (checkboxId) {
      const checkbox = document.getElementById(checkboxId);
      if (checkbox) {
        checkbox.checked = visible;
        // Trigger change event to ensure any listeners are notified
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Also sync sidebar checkbox if it exists
      const sidebarCheckboxId = 'sidebar' + checkboxId.charAt(0).toUpperCase() + checkboxId.slice(1);
      const sidebarCheckbox = document.getElementById(sidebarCheckboxId);
      if (sidebarCheckbox) {
        sidebarCheckbox.checked = visible;
      }
    }

    // Trigger track re-rendering
    if (this.genomeStudio.trackRenderer.render) {
      await this.genomeStudio.trackRenderer.render();
    }

    return {
      success: true,
      trackName: normalizedTrackName,
      originalTrackName: trackName,
      visible,
      message: `Track ${normalizedTrackName} ${visible ? 'shown' : 'hidden'}`,
    };
  }

  // Sequence analysis implementations
  async getCodingSequence({ identifier, geneName, gene_name, includeUtrs = false }) {
    // Support multiple parameter names for compatibility
    const geneId = identifier || geneName || gene_name;

    if (!geneId) {
      throw new Error('Gene identifier is required (identifier, geneName, or gene_name)');
    }

    // Use MicrobeGenomicsFunctions if available (preferred - has full implementation)
    if (window.MicrobeGenomicsFunctions) {
      const result = window.MicrobeGenomicsFunctions.getCodingSequence(geneId);
      if (result && result.success) {
        return {
          success: true,
          identifier: geneId,
          geneName: result.geneName,
          locusTag: result.locusTag,
          chromosome: result.chromosome,
          position: `${result.start}-${result.end}`,
          strand: result.strand,
          length: result.length,
          gcContent: result.gcContent,
          codingSequence: result.codingSequence,
          proteinSequence: result.proteinSequence,
          proteinLength: result.proteinLength,
        };
      } else {
        return {
          success: false,
          identifier: geneId,
          error: result?.error || `Gene '${geneId}' not found`,
          suggestions: result?.suggestions || [],
        };
      }
    }

    // Fallback to sequenceUtils if available
    if (this.genomeStudio.sequenceUtils?.getCodingSequence) {
      const sequence = await this.genomeStudio.sequenceUtils.getCodingSequence(geneId, includeUtrs);
      return {
        success: true,
        identifier: geneId,
        includeUtrs,
        sequence: sequence || '',
        length: sequence ? sequence.length : 0,
      };
    }

    throw new Error('No sequence extraction method available');
  }

  async getSequenceRegion({ chromosome, start, end }) {
    if (!this.genomeStudio.currentSequence || !this.genomeStudio.currentSequence[chromosome]) {
      throw new Error(`Sequence for chromosome ${chromosome} not available`);
    }

    const fullSequence = this.genomeStudio.currentSequence[chromosome];
    const sequence = fullSequence.substring(start - 1, end); // Convert to 0-based indexing

    return {
      success: true,
      chromosome,
      start,
      end,
      sequence: sequence || '',
      length: sequence ? sequence.length : 0,
    };
  }

  // Protein structure analysis implementations
  async searchAlphaFoldByGene(parameters) {
    // Delegate to ChatManager's AlphaFold search implementation
    if (!this.genomeStudio.chatManager) {
      throw new Error('ChatManager not available');
    }

    try {
      const result = await this.genomeStudio.chatManager.searchAlphaFoldByGene(parameters);
      return result;
    } catch (error) {
      console.error('InternalMCPServer AlphaFold search error:', error);
      return {
        success: false,
        error: error.message,
        tool: 'search_alphafold_structures',
        parameters: parameters,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Multi-window management via IPC
  async listGenomeWindowsViaIPC() {
    try {
      const windows = await mcpServerIpc.invoke('list-genome-windows');
      return {
        success: true,
        windowCount: windows.length,
        windows: windows,
      };
    } catch (error) {
      console.error('[InternalMCPServer] listGenomeWindowsViaIPC error:', error);
      return { success: false, error: error.message, windowCount: 0, windows: [] };
    }
  }

  async focusGenomeWindowViaIPC(parameters) {
    const { windowId } = parameters;
    if (!windowId) {
      return { success: false, error: 'windowId parameter is required' };
    }
    try {
      const result = await mcpServerIpc.invoke('focus-genome-window', windowId);
      return result;
    } catch (error) {
      console.error('[InternalMCPServer] focusGenomeWindowViaIPC error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delegate a method call to ChatManager directly.
   * Used as fallback when executeToolByName returns undefined.
   */
  async _delegateToChatManager(methodName, parameters) {
    const chatManager = this.genomeStudio.chatManager || window.chatManager;
    if (!chatManager) {
      throw new Error(`ChatManager not available for method '${methodName}'`);
    }
    if (typeof chatManager[methodName] !== 'function') {
      throw new Error(`ChatManager does not have method '${methodName}'`);
    }
    try {
      const result = await chatManager[methodName](parameters);
      return {
        success: true,
        result,
        executedVia: 'ChatManager-direct',
      };
    } catch (error) {
      console.error(`❌ [InternalMCPServer] chatManager.${methodName}() failed:`, error);
      throw error;
    }
  }

  // Utility implementations
  ping() {
    return {
      success: true,
      timestamp: Date.now(),
      message: 'Internal MCP Server is ready',
      genomeStudioReady: !!this.genomeStudio,
      modules: {
        navigationManager: !!this.genomeStudio?.navigationManager,
        fileManager: !!this.genomeStudio?.fileManager,
        trackRenderer: !!this.genomeStudio?.trackRenderer,
        sequenceUtils: !!this.genomeStudio?.sequenceUtils,
      },
    };
  }

  // Start the internal server
  start() {
    this.isRunning = true;
    console.log('✅ Internal MCP Server started');

    // Notify main process that internal server is ready
    mcpServerIpc.send('internal-mcp-server-ready');
  }

  // Stop the internal server
  stop() {
    this.isRunning = false;
    console.log('🛑 Internal MCP Server stopped');

    // Notify main process that internal server is stopped
    mcpServerIpc.send('internal-mcp-server-stopped');
  }

  // Get server status
  getStatus() {
    return {
      running: this.isRunning,
      genomeStudioReady: !!this.genomeStudio,
      modules: this.genomeStudio
        ? {
            navigationManager: !!this.genomeStudio.navigationManager,
            fileManager: !!this.genomeStudio.fileManager,
            trackRenderer: !!this.genomeStudio.trackRenderer,
            sequenceUtils: !!this.genomeStudio.sequenceUtils,
          }
        : {},
    };
  }
}

if (typeof window !== 'undefined') {
  window.InternalMCPServer = InternalMCPServer;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InternalMCPServer;
}
