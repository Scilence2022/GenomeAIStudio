/**
 * Tools Integrator Module
 * Combines all tool modules into a unified interface
 */

const NavigationTools = require('./navigation/NavigationTools');
const SequenceTools = require('./sequence/SequenceTools');
const ProteinTools = require('./protein/ProteinTools');
const DatabaseTools = require('./database/DatabaseTools');
const DataTools = require('./data/DataTools');
const PathwayTools = require('./pathway/PathwayTools');
const ActionTools = require('./action/ActionTools');
const UtilityTools = require('./utility/UtilityTools');
const FileTools = require('./file/FileTools');
const TrackSettingsTools = require('./track/TrackSettingsTools');
const PrimerTools = require('./primer/PrimerTools');
const AnnotationTools = require('./annotation/AnnotationTools');
const AgentChatTools = require('./utility/AgentChatTools');

class ToolsIntegrator {
  constructor(server) {
    this.server = server;

    // Initialize all tool modules
    this.navigationTools = new NavigationTools(server);
    this.sequenceTools = new SequenceTools(server);
    this.proteinTools = new ProteinTools(server);
    this.databaseTools = new DatabaseTools(server);
    this.dataTools = new DataTools(server);
    this.pathwayTools = new PathwayTools(server);
    this.actionTools = new ActionTools(server);
    this.utilityTools = new UtilityTools(server);
    this.fileTools = new FileTools(server);
    this.trackSettingsTools = new TrackSettingsTools(server);
    this.primerTools = new PrimerTools(server);
    this.annotationTools = new AnnotationTools(server);
    this.agentChatTools = new AgentChatTools(server);

    // Combine all tools
    this.allTools = this.combineAllTools();

    // Store the full tool set separately for agent mode reference
    this._fullToolList = null;
  }

  combineAllTools() {
    return {
      ...this.navigationTools.getTools(),
      ...this.sequenceTools.getTools(),
      ...this.proteinTools.getTools(),
      ...this.databaseTools.getTools(),
      ...this.dataTools.getTools(),
      ...this.pathwayTools.getTools(),
      ...this.actionTools.getTools(),
      ...this.utilityTools.getTools(),
      ...this.fileTools.getTools(),
      ...this.trackSettingsTools.getTools(),
      ...this.primerTools.getTools(),
      ...this.annotationTools.getTools(),
      // Agent mode tools - send natural language prompts for autonomous AI execution
      ...this.agentChatTools.getTools(),
      // Multi-window management tools (server-side only)
      ...this.getWindowManagementTools(),
    };
  }

  /**
   * Get window management tools for multi-window genome support.
   * These tools are executed server-side (main process), not delegated to renderer.
   */
  getWindowManagementTools() {
    return {
      list_genome_windows: {
        name: 'list_genome_windows',
        description:
          'List all open CodeXomics genome browser windows and their loaded genomes. Use this to see which genomes are open and which window is focused.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      switch_active_window: {
        name: 'switch_active_window',
        description:
          'Focus/activate a specific CodeXomics window by its windowId. Subsequent tool calls without an explicit windowId will target this window.',
        inputSchema: {
          type: 'object',
          properties: {
            windowId: {
              type: 'string',
              description:
                'The window ID to focus (e.g., "win_1", "win_2"). Use list_genome_windows to see available IDs.',
            },
          },
          required: ['windowId'],
        },
      },
      run_on_windows: {
        name: 'run_on_windows',
        description:
          'Run one read-only genome tool across multiple open CodeXomics windows at once and return the results ' +
          'labeled by windowId and genomeName. Use this for simultaneous multi-genome analysis/comparison ' +
          '(e.g. run search_features or get_current_state on every open genome in a single call). Only read-only ' +
          'tools are allowed; mutating, navigation, and export tools are rejected so you cannot change several ' +
          'genomes at once. Each window runs independently — one failure does not abort the others.',
        inputSchema: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              description:
                'The inner read-only tool to run in each window (e.g. "search_features", "get_current_state", "get_gene_details").',
            },
            parameters: {
              type: 'object',
              description: 'Parameters passed to the inner tool in every window. Do not include windowId here.',
            },
            windowIds: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional. Restrict the fan-out to these windowIds (from list_genome_windows). Defaults to all open windows.',
            },
          },
          required: ['tool'],
        },
      },
    };
  }

  /**
   * Add optional windowId / expected_genome targeting parameters to a genome
   * tool's input schema so external MCP clients can deterministically address a
   * window and assert which genome they expect. Window-management and agent-chat
   * tools are excluded (they have their own window handling).
   */
  _addWindowTargetingParams(tool) {
    const EXCLUDE = new Set(['list_genome_windows', 'switch_active_window', 'run_on_windows', 'codexomics_chat']);
    if (!tool || EXCLUDE.has(tool.name)) return tool;
    const schema = tool.inputSchema;
    if (!schema || schema.type !== 'object') return tool;

    const props = { ...(schema.properties || {}) };
    if (!props.windowId) {
      props.windowId = {
        type: 'string',
        description:
          'Optional. Target a specific CodeXomics genome window by its windowId (from list_genome_windows). ' +
          'If omitted, the focused window is used; when multiple windows are open and none is focused, the call ' +
          'fails with the list of available windows so you can disambiguate.',
      };
    }
    if (!props.expected_genome) {
      props.expected_genome = {
        type: 'string',
        description:
          'Optional. The genome name you expect to be loaded in the target window (from list_genome_windows). ' +
          'If it does not match, the call fails instead of returning data computed against the wrong genome.',
      };
    }
    return { ...tool, inputSchema: { ...schema, properties: props } };
  }

  getAvailableTools() {
    const isAgentMode = this.server && this.server.mode === 'agent';

    // In agent mode, expose only the codexomics_chat tool + window management tools.
    // The AI agent inside CodeXomics handles all other tools autonomously.
    if (isAgentMode) {
      const windowTools = this.getWindowManagementTools();
      const agentTools = [
        ...Object.values(this.agentChatTools.getTools()),
        windowTools.list_genome_windows,
        windowTools.switch_active_window,
      ];
      const result = agentTools.map(tool => {
        const normalized = tool.parameters && !tool.inputSchema ? { ...tool, inputSchema: tool.parameters } : tool;
        return this._addWindowTargetingParams(normalized);
      });
      console.log(`📋 [Agent Mode] Returning ${result.length} tools (codexomics_chat + window management)`);
      return result;
    }

    // Tools mode: return all tools (default behavior)
    const tools = Object.values(this.allTools);

    // Convert 'parameters' to 'inputSchema' for MCP SDK compatibility
    console.log(`📋 [Tools Mode] Returning ${tools.length} tools (all)`);
    return tools.map(tool => {
      const normalized = tool.parameters && !tool.inputSchema ? { ...tool, inputSchema: tool.parameters } : tool;
      return this._addWindowTargetingParams(normalized);
    });
  }

  /**
   * Get the full list of all tools regardless of mode.
   * Used for agent mode context - the AI agent needs to know about all available tools.
   */
  getFullToolList() {
    if (!this._fullToolList) {
      this._fullToolList = Object.values(this.allTools).map(tool => {
        if (tool.parameters && !tool.inputSchema) {
          return { ...tool, inputSchema: tool.parameters };
        }
        return tool;
      });
    }
    return this._fullToolList;
  }

  getToolByName(toolName) {
    return this.allTools[toolName];
  }

  async executeTool(toolName, parameters, clientId, executionContext = null) {
    console.log(`[ToolsIntegrator] executeTool called for: ${toolName} (mode: ${this.server?.mode || 'unknown'})`);
    const tool = this.allTools[toolName];
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    // Validate parameters before execution
    this.validateToolParameters(toolName, parameters || {});

    // In agent mode, route all non-chat, non-window-management tools through
    // the agent (codexomics_chat). The agent will autonomously decide how to
    // handle the request.
    const isAgentMode = this.server && this.server.mode === 'agent';
    const isAgentTool = toolName === 'codexomics_chat';
    const isWindowTool =
      toolName === 'list_genome_windows' || toolName === 'switch_active_window' || toolName === 'run_on_windows';

    if (isAgentMode && !isAgentTool && !isWindowTool) {
      console.log(`🤖 [Agent Mode] Routing '${toolName}' through codexomics_chat`);
      return await this._executeViaAgent(toolName, parameters, clientId, executionContext);
    }

    // Route to appropriate tool module based on tool name
    try {
      // Navigation tools
      if (this.navigationTools.getTools()[toolName]) {
        return await this.navigationTools.executeClientTool(toolName, parameters, clientId);
      }

      // Sequence tools
      if (this.sequenceTools.getTools()[toolName]) {
        // Pure server-side computations
        if (toolName === 'compute_gc') {
          return { gcContent: this.sequenceTools.calculateGCContent(parameters.sequence) };
        } else if (toolName === 'translate_dna') {
          const frame =
            parameters.frame !== undefined
              ? Number(parameters.frame)
              : parameters.reading_frame !== undefined
                ? Math.max(0, Number(parameters.reading_frame) - 1)
                : 0;
          return {
            protein: this.sequenceTools.translateDNA(parameters.dna, frame),
            frame,
            reading_frame: frame + 1,
          };
        } else if (toolName === 'reverse_complement') {
          return { reverseComplement: this.sequenceTools.reverseComplement(parameters.dna) };
        } else if (toolName === 'calculate_molecular_weight') {
          const seq =
            parameters.sequence ||
            parameters.dna ||
            parameters.protein ||
            parameters.dna_sequence ||
            parameters.protein_sequence;
          const type = parameters.type || 'auto';
          const weight = this.sequenceTools.calculateMolecularWeight(seq, type);
          return {
            success: true,
            molecularWeight: weight,
            dna: seq,
            sequence: seq,
            length: seq ? seq.length : 0,
          };
        } else {
          // All other sequence tools (get_sequence, search_sequence_motif, get_coding_sequence)
          // require client-side access to genome data
          return await this.sequenceTools.executeClientTool(toolName, parameters, clientId);
        }
      }

      // Protein tools - delegate all to client (ChatManager has working implementations)
      if (this.proteinTools.getTools()[toolName]) {
        // All protein structure tools require client-side execution
        // as ChatManager handles PDB/AlphaFold API calls
        return await this.proteinTools.executeClientTool(toolName, parameters, clientId);
      }

      // Database tools - server-side implementations for standalone mode
      if (toolName === 'search_uniprot_database') {
        return await this.databaseTools.searchUniProtDatabase(parameters);
      }
      if (toolName === 'advanced_uniprot_search') {
        return await this.databaseTools.advancedUniProtSearch(parameters);
      }
      if (toolName === 'get_uniprot_entry') {
        return await this.databaseTools.getUniProtEntry(parameters);
      }
      if (toolName === 'analyze_interpro_domains') {
        return await this.databaseTools.analyzeInterProDomains(parameters);
      }
      if (toolName === 'search_interpro_entry') {
        return await this.databaseTools.searchInterProEntry(parameters);
      }
      if (toolName === 'get_interpro_entry_details') {
        return await this.databaseTools.getInterProEntryDetails(parameters);
      }
      if (toolName === 'view_markdown_file') {
        return await this.databaseTools.viewMarkdownFile(parameters);
      }

      // Data tools
      if (this.dataTools.getTools()[toolName]) {
        if (toolName === 'codon_usage_analysis') {
          return await this.dataTools.analyzeCodonUsage(parameters);
        } else {
          return await this.dataTools.executeClientTool(toolName, parameters, clientId);
        }
      }

      // File tools - delegate all to client (ChatManager has file loading implementations)
      if (this.fileTools.getTools()[toolName]) {
        return await this.fileTools.executeClientTool(toolName, parameters, clientId);
      }

      // Pathway tools
      if (this.pathwayTools.getTools()[toolName]) {
        switch (toolName) {
          case 'show_metabolic_pathway':
            return this.pathwayTools.generatePathwayVisualization(
              parameters.pathwayName,
              parameters.highlightGenes || []
            );
          case 'find_pathway_genes':
            return this.pathwayTools.findGenesInPathway(parameters.pathwayName, parameters.includeRegulation || false);
          case 'blast_search':
            return await this.pathwayTools.performBLASTSearch(
              parameters.sequence,
              parameters.blastType,
              parameters.database,
              parameters.evalue,
              parameters.maxTargets
            );
          default:
            return await this.pathwayTools.executeClientTool(toolName, parameters, clientId);
        }
      }

      // Action tools
      if (this.actionTools.getTools()[toolName]) {
        switch (toolName) {
          case 'copy_sequence':
            return await this.actionTools.copy_sequence(parameters, clientId);
          case 'cut_sequence':
            return await this.actionTools.cut_sequence(parameters, clientId);
          case 'paste_sequence':
            return await this.actionTools.paste_sequence(parameters, clientId);
          case 'delete_sequence':
            return await this.actionTools.delete_sequence(parameters, clientId);
          case 'insert_sequence':
            return await this.actionTools.insert_sequence(parameters, clientId);
          case 'replace_sequence':
            return await this.actionTools.replace_sequence(parameters, clientId);
          case 'get_action_list':
            return await this.actionTools.get_action_list(parameters, clientId);
          case 'execute_actions':
            return await this.actionTools.execute_actions(parameters, clientId);
          case 'clear_actions':
            return await this.actionTools.clear_actions(parameters, clientId);
          case 'get_clipboard_content':
            return await this.actionTools.get_clipboard_content(parameters, clientId);
          default:
            return await this.actionTools.executeClientTool(toolName, parameters, clientId);
        }
      }

      // Utility tools
      if (this.utilityTools.getTools()[toolName]) {
        switch (toolName) {
          case 'download_internet_file':
            return await this.utilityTools.download_internet_file(parameters, clientId);
          case 'view_markdown_file':
            return await this.utilityTools.view_markdown_file(parameters, clientId);
          case 'toggle_settings_modal':
            return await this.utilityTools.toggle_settings_modal(parameters, clientId);
          case 'toggle_chatbox':
            return await this.utilityTools.toggle_chatbox(parameters, clientId);
          case 'set_chatbox_layout':
            return await this.utilityTools.set_chatbox_layout(parameters, clientId);
          case 'set_chatbox_minimized':
            return await this.utilityTools.set_chatbox_minimized(parameters, clientId);
          case 'toggle_sidebar':
            return await this.utilityTools.toggle_sidebar(parameters, clientId);
          case 'toggle_sidebar_panel':
            return await this.utilityTools.toggle_sidebar_panel(parameters, clientId);
          case 'toggle_top_banner':
            return await this.utilityTools.toggle_top_banner(parameters, clientId);
          default:
            return await this.utilityTools.executeClientTool(toolName, parameters, clientId);
        }
      }

      // Track settings tools
      if (this.trackSettingsTools.getTools()[toolName]) {
        switch (toolName) {
          case 'get_track_settings':
            return await this.trackSettingsTools.executeClientTool('getTrackSettings', parameters, clientId);
          case 'set_track_settings':
            return await this.trackSettingsTools.executeClientTool('setTrackSettings', parameters, clientId);
          case 'get_all_track_settings':
            return await this.trackSettingsTools.executeClientTool('getAllTrackSettings', parameters, clientId);
          case 'reset_track_settings':
            return await this.trackSettingsTools.executeClientTool('resetTrackSettings', parameters, clientId);
          case 'get_track_settings_schema':
            return {
              schema: this.trackSettingsTools.getDefaultSettingsSchema(),
              description: 'Complete schema of available track settings',
            };
          case 'batch_set_track_settings':
            return await this.trackSettingsTools.executeClientTool('batchSetTrackSettings', parameters, clientId);
          default:
            return await this.trackSettingsTools.executeClientTool(toolName, parameters, clientId);
        }
      }

      // Primer tools
      if (this.primerTools.getTools()[toolName]) {
        switch (toolName) {
          case 'calculate_primer_properties':
            return this.primerTools.calculateProperties(parameters.sequence);
          case 'design_primers': {
            if (!parameters.targetSequence && (parameters.geneName || parameters.chromosome)) {
              return await this.primerTools.executeClientTool(toolName, parameters, clientId);
            }
            const toNumber = value => {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : undefined;
            };
            const exactPrimerLength = toNumber(
              parameters.primerLength ?? parameters.primerLengthBp ?? parameters.primerSize
            );
            return this.primerTools.designPrimers(parameters.targetSequence, {
              targetTm: toNumber(parameters.targetTm),
              tmTolerance: toNumber(parameters.tmTolerance),
              minLen:
                toNumber(parameters.minPrimerLength ?? parameters.minLen ?? parameters.minLength) ?? exactPrimerLength,
              maxLen:
                toNumber(parameters.maxPrimerLength ?? parameters.maxLen ?? parameters.maxLength) ?? exactPrimerLength,
              minProductSize: toNumber(parameters.minProductSize),
              maxProductSize: toNumber(parameters.maxProductSize),
              minGcContent: toNumber(parameters.minGcContent ?? parameters.minGc),
              maxGcContent: toNumber(parameters.maxGcContent ?? parameters.maxGc),
              requireGcClamp: typeof parameters.requireGcClamp === 'boolean' ? parameters.requireGcClamp : undefined,
              avoidHairpin: typeof parameters.avoidHairpin === 'boolean' ? parameters.avoidHairpin : undefined,
              requiredAmpliconStart: parameters.requiredAmpliconStart,
              requiredAmpliconEnd: parameters.requiredAmpliconEnd,
            });
          }
          case 'find_primer_binding_sites':
            return this.primerTools.findBindingSites(
              parameters.primerSequence,
              parameters.templateSequence,
              parameters.maxMismatches,
              {
                max3PrimeMismatches: parameters.max3PrimeMismatches,
                minBindingTm: parameters.minBindingTm,
                scoringMode: parameters.scoringMode,
                naConcentration: parameters.naConcentration,
                primerConcentration: parameters.primerConcentration,
              }
            );
          default:
            // save_primer/list_primers/delete_primers and any future UI tools go to client
            return await this.primerTools.executeClientTool(toolName, parameters, clientId);
        }
      }

      // Annotation tools - delegate all to client
      if (this.annotationTools.getTools()[toolName]) {
        return await this.annotationTools.executeClientTool(toolName, parameters, clientId, executionContext);
      }

      // Agent chat tools - delegate to client (CodeXomics App handles the LLM loop)
      if (this.agentChatTools.getTools()[toolName]) {
        return await this.agentChatTools.executeClientTool(toolName, parameters, clientId, executionContext);
      }

      // Multi-window management tools (server-side, no client delegation needed)
      if (toolName === 'list_genome_windows') {
        return this.executeListGenomeWindows();
      }
      if (toolName === 'switch_active_window') {
        return this.executeSwitchActiveWindow(parameters, clientId);
      }
      if (toolName === 'run_on_windows') {
        return await this.executeRunOnWindows(parameters, clientId);
      }

      // Data manipulation tools
      if (toolName === 'copy_sequence') {
        return await this.dataTools.copySequence(parameters);
      }
      if (toolName === 'paste_sequence') {
        return await this.dataTools.pasteSequence(parameters);
      }
      if (toolName === 'delete_sequence') {
        return await this.dataTools.deleteSequence(parameters);
      }

      // Track settings tools - server-side
      if (toolName === 'get_all_track_settings') {
        return this.trackSettingsTools.getAllTrackSettings();
      }

      throw new Error(`Tool execution handler not found for '${toolName}'`);
    } catch (error) {
      console.error(`Error executing tool '${toolName}':`, error);
      throw error;
    }
  }

  /**
   * Execute a tool via the AI agent in agent mode.
   * Instead of directly calling the tool, wraps the request as a natural language
   * prompt and routes it through codexomics_chat, which invokes ChatManager's
   * processAgentPrompt for autonomous execution.
   *
   * @param {string} toolName - The original tool name being requested
   * @param {Object} parameters - The tool parameters
   * @param {string} clientId - Client identifier
   * @returns {Object} Agent execution result
   */
  async _executeViaAgent(toolName, parameters, clientId, executionContext = null) {
    console.log(`[ToolsIntegrator] _executeViaAgent: routing '${toolName}' through agent`);

    // Build a natural language prompt from the tool call
    const prompt = this._buildAgentPromptFromToolCall(toolName, parameters);

    // Execute via codexomics_chat (which calls ChatManager.processAgentPrompt)
    const agentParameters = {
      prompt,
      activate_multi_agent: false,
      context: {
        original_tool: toolName,
        original_parameters: parameters,
        routed_by_agent_mode: true,
        parentTurnId: executionContext?.turnId || executionContext?.parentTurnId || null,
        turnId: executionContext?.turnId || null,
        sessionId: executionContext?.sessionId || null,
        requestId: executionContext?.requestId || null,
        windowId: executionContext?.windowId || parameters?.windowId || null,
        expected_genome: executionContext?.expected_genome || parameters?.expected_genome || null,
        scope: executionContext?.scope || null,
      },
    };

    return await this.agentChatTools.executeClientTool('codexomics_chat', agentParameters, clientId, executionContext);
  }

  /**
   * Build a natural language prompt from a tool call for agent mode routing.
   * Translates structured tool parameters into a natural language instruction
   * that the AI agent can understand and execute.
   */
  _buildAgentPromptFromToolCall(toolName, parameters) {
    // Map of tool names to natural language prompt templates
    const promptTemplates = {
      navigate_to_position: p =>
        `Navigate to position on chromosome ${p.chromosome || 'current'} at ${p.start ? `${p.start}-${p.end}` : `position ${p.position}`}`,
      search_features: p =>
        `Search for features matching "${p.query}"${p.featureType ? ` of type ${p.featureType}` : ''}`,
      get_sequence: p => `Get the DNA sequence from ${p.chromosome || 'current chromosome'}:${p.start}-${p.end}`,
      calc_region_gc: p =>
        `Calculate GC content for ${p.chromosome || 'the current chromosome'}${p.start && p.end ? `:${p.start}-${p.end}` : ' in the current browser region'}`,
      compute_gc: p =>
        `Calculate GC content of the sequence: ${p.sequence?.substring(0, 50)}${p.sequence?.length > 50 ? '...' : ''}`,
      search_uniprot_database: p =>
        `Search UniProt database for "${p.query}"${p.searchType ? ` by ${p.searchType}` : ''}`,
      load_genbank_file: p => `Load the GenBank file: ${p.file_path || p.filePath}`,
      export_genbank: p => `Export the current genome as GenBank format`,
      get_coding_sequence: p => `Get the coding sequence for gene ${p.identifier || p.geneName || p.gene_name}`,
      blast_search: p => `Perform a ${p.blastType || 'BLAST'} search with the given sequence`,
      zoom_in: p => `Zoom in by factor ${p.factor || 2}`,
      zoom_out: p => `Zoom out by factor ${p.factor || 2}`,
      jump_to_gene: p => `Jump to gene ${p.geneName}`,
      find_gene_by_name: p => `Search for gene named "${p.name}"`,
      find_gene: p => `Search for gene named "${p.name}"`,
      restore_view_state: p =>
        `Restore saved genome browser view state ${p.id ? `with ID ${p.id}` : `named "${p.name}"`}`,
    };

    const template = promptTemplates[toolName];
    if (template) {
      return template(parameters);
    }

    // Generic fallback: describe the tool call as a natural language instruction
    const paramStr = Object.entries(parameters || {})
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ');

    return `Execute the ${toolName.replace(/_/g, ' ')} operation${paramStr ? ` with parameters: ${paramStr}` : ''}`;
  }

  // Tool categorization for better organization
  getToolsByCategory() {
    return {
      navigation: {
        name: 'Navigation & State Management',
        description: 'Tools for genome navigation and browser state management',
        tools: Object.keys(this.navigationTools.getTools()),
      },
      sequence: {
        name: 'Sequence Analysis',
        description: 'Tools for DNA/RNA sequence analysis and manipulation',
        tools: Object.keys(this.sequenceTools.getTools()),
      },
      protein: {
        name: 'Protein Structure',
        description: 'Tools for protein structure analysis and visualization',
        tools: Object.keys(this.proteinTools.getTools()),
      },
      database: {
        name: 'Database Integration',
        description: 'Tools for accessing biological databases',
        tools: Object.keys(this.databaseTools.getTools()),
      },
      data: {
        name: 'Data Management',
        description: 'Tools for data annotation, export, and analysis',
        tools: Object.keys(this.dataTools.getTools()),
      },
      pathway: {
        name: 'Pathway & Search',
        description: 'Tools for metabolic pathway analysis and sequence search',
        tools: Object.keys(this.pathwayTools.getTools()),
      },
      utility: {
        name: 'Utility Tools',
        description: 'Utility tools for file download and viewing operations',
        tools: Object.keys(this.utilityTools.getTools()),
      },
      annotation: {
        name: 'Annotation Management',
        description: 'Tools for reading, updating, searching, and tracking changes to genome annotations',
        tools: Object.keys(this.annotationTools.getTools()),
      },
      agent: {
        name: 'Agent Mode',
        description: 'Send natural language prompts for autonomous AI agent execution',
        tools: Object.keys(this.agentChatTools.getTools()),
      },
    };
  }

  // Statistics about available tools
  getToolStatistics() {
    const categories = this.getToolsByCategory();
    const totalTools = Object.keys(this.allTools).length;

    return {
      totalTools: totalTools,
      categories: Object.keys(categories).length,
      toolsByCategory: Object.fromEntries(
        Object.entries(categories).map(([key, category]) => [
          key,
          { name: category.name, count: category.tools.length },
        ])
      ),
      serverSideTools: [
        'fetch_protein_structure',
        'search_pdb_structures', // Protein tools
        'fetch_alphafold_structure',
        'search_alphafold_by_sequence',
        'search_uniprot_database',
        'advanced_uniprot_search',
        'get_uniprot_entry',
        'analyze_interpro_domains',
        'search_interpro_entry',
        'get_interpro_entry_details',
      ].length,
      clientSideTools:
        totalTools -
        [
          'fetch_protein_structure',
          'search_pdb_structures',
          'fetch_alphafold_structure',
          'search_alphafold_by_sequence',
          'search_uniprot_database',
          'advanced_uniprot_search',
          'get_uniprot_entry',
          'analyze_interpro_domains',
          'search_interpro_entry',
          'get_interpro_entry_details',
        ].length,
    };
  }

  // Validate tool parameters
  validateToolParameters(toolName, parameters) {
    const tool = this.allTools[toolName];
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const schema = tool.inputSchema || tool.parameters || {};
    const required = schema.required || [];
    const properties = schema.properties || {};

    // Check required parameters
    for (const param of required) {
      if (!(param in parameters)) {
        throw new Error(`Required parameter '${param}' missing for tool '${toolName}'`);
      }
    }

    // Basic type validation
    for (const [param, value] of Object.entries(parameters)) {
      if (properties[param]) {
        const expectedType = properties[param].type;
        const actualType = typeof value;

        if (expectedType === 'number' && actualType !== 'number') {
          throw new Error(`Parameter '${param}' should be a number, got ${actualType}`);
        }
        if (expectedType === 'string' && actualType !== 'string') {
          throw new Error(`Parameter '${param}' should be a string, got ${actualType}`);
        }
        if (expectedType === 'boolean' && actualType !== 'boolean') {
          throw new Error(`Parameter '${param}' should be a boolean, got ${actualType}`);
        }
        if (expectedType === 'array' && !Array.isArray(value)) {
          throw new Error(`Parameter '${param}' should be an array, got ${actualType}`);
        }
      }
    }

    return true;
  }

  // Get tool documentation
  getToolDocumentation(toolName) {
    const tool = this.allTools[toolName];
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const categories = this.getToolsByCategory();
    let category = 'unknown';

    for (const [, catData] of Object.entries(categories)) {
      if (catData.tools.includes(toolName)) {
        category = catData.name;
        break;
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      category: category,
      parameters: tool.parameters,
      examples: this.getToolExamples(toolName),
    };
  }

  // Get example usage for tools
  getToolExamples(toolName) {
    const examples = {
      navigate_to_position: {
        description: 'Navigate to a specific genomic region',
        example: {
          chromosome: 'chr1',
          start: 1000,
          end: 2000,
        },
      },
      restore_view_state: {
        description: 'Restore a saved genome browser view state',
        example: {
          name: 'benchmark smoke view',
        },
      },
      compute_gc: {
        description: 'Calculate GC content of a DNA sequence',
        example: {
          sequence: 'ATCGATCGATCG',
        },
      },
      translate_dna: {
        description: 'Translate DNA to protein sequence',
        example: {
          dna: 'ATGAAATAA',
          frame: 0,
        },
      },
      search_uniprot_database: {
        description: 'Search UniProt database for proteins',
        example: {
          query: 'insulin',
          searchType: 'protein_name',
          limit: 10,
        },
      },
      zoom_in: {
        description: 'Zoom in the current view',
        example: {
          factor: 2,
        },
      },
      zoom_out: {
        description: 'Zoom out the current view',
        example: {
          factor: 2,
        },
      },
    };

    return examples[toolName] || { description: 'No examples available', example: {} };
  }

  // Execute client-side tools by delegating to the browser
  async executeClientSideTool(toolName, parameters, clientId) {
    // This method delegates tool execution to the browser client
    // It's used for tools that need to run in the browser context (like UI updates)

    if (!this.server) {
      throw new Error('Server instance not available for client-side tool execution');
    }

    // Use the server's client tool execution method
    return await this.server.executeToolOnClient(toolName, parameters, clientId);
  }

  /**
   * List all open genome browser windows (server-side, no client delegation)
   */
  executeListGenomeWindows() {
    console.log(`[ToolsIntegrator] executeListGenomeWindows called`);
    console.log(`[ToolsIntegrator] this.server: ${this.server ? 'exists' : 'null'}`);
    console.log(`[ToolsIntegrator] this.server.listWindows: ${this.server?.listWindows ? 'exists' : 'null'}`);

    if (!this.server || !this.server.listWindows) {
      console.log(`[ToolsIntegrator] Window registry not available`);
      return {
        success: false,
        error: 'Window registry not available. MCP server may not support multi-window mode.',
      };
    }

    console.log(`[ToolsIntegrator] Calling this.server.listWindows()`);
    const windows = this.server.listWindows();
    console.log(`[ToolsIntegrator] listWindows returned: ${windows.length} windows`);
    return {
      success: true,
      windowCount: windows.length,
      windows: windows,
    };
  }

  /**
   * Switch focus to a specific genome window (server-side, no client delegation)
   */
  executeSwitchActiveWindow(parameters, clientId) {
    const { windowId } = parameters;
    if (!windowId) {
      return { success: false, error: 'windowId parameter is required' };
    }

    const registry = this.server?.mainWindowRegistry || this.server?.windowRegistry;
    if (!registry) {
      return { success: false, error: 'Window registry not available' };
    }

    const entry = registry.get(windowId);
    if (!entry) {
      // Check if it's connected as internalClient standalone
      if (this.server?.internalClients?.has(windowId)) {
        // Pin this window for the calling session, and record it as the global
        // last-activated window (a focus-independent fallback used when the
        // client doesn't send a stable clientId, e.g. background automation).
        this.server.setSessionWindowPin?.(clientId, windowId);
        if (this.server) this.server.activeWindowId = windowId;
        if (!clientId) {
          this.server.internalClient = this.server.internalClients.get(windowId);
        }
        return {
          success: true,
          message: `Activated window '${windowId}' (Standalone mode)`,
          windowId,
          genomeName: 'Connected via CodeXomics',
          pinned: !!clientId,
        };
      }

      const available = Array.from(registry.keys());
      if (this.server?.internalClients) {
        for (const key of this.server.internalClients.keys()) {
          if (!available.includes(key)) available.push(key);
        }
      }
      return {
        success: false,
        error: `Window '${windowId}' not found. Available: [${available.join(', ')}]`,
      };
    }

    const win = entry.window || entry;
    if (!win || win.isDestroyed()) {
      return { success: false, error: `Window '${windowId}' is destroyed` };
    }

    // Pin this window as the default target for the calling session's subsequent
    // un-addressed calls, so routing no longer depends on OS focus staying put.
    // Also record it as the global last-activated fallback (focus-independent).
    this.server.setSessionWindowPin?.(clientId, windowId);
    if (this.server) this.server.activeWindowId = windowId;

    if (typeof this.server?.switchWindowTab === 'function') {
      const result = this.server.switchWindowTab(windowId);
      if (result?.success) {
        return {
          success: true,
          message: `Activated window '${windowId}'`,
          windowId,
          genomeName: entry.genomeName || null,
          pinned: !!clientId,
        };
      }
    }

    win.show();
    win.focus();
    return {
      success: true,
      message: `Focused window '${windowId}'`,
      windowId,
      genomeName: entry.genomeName || null,
      pinned: !!clientId,
    };
  }

  /**
   * Whether a tool is safe to fan out across multiple genome windows. Only
   * read-only tools qualify; mutating/navigation/export tools are rejected so a
   * single fan-out call can never change several genomes at once.
   */
  isFanoutSafeTool(name) {
    if (!name) return false;
    const EXCLUDE = new Set(['list_genome_windows', 'switch_active_window', 'run_on_windows', 'codexomics_chat']);
    if (EXCLUDE.has(name)) return false;
    const MUTATING =
      /^(add_|create_|delete_|remove_|edit_|update_|set_|save_|write_|modify_|insert_|paste_|copy_|cut_|navigate_|jump_|goto_|go_to_|move_|zoom_|switch_|open_|close_|load_|import_|annotate_|apply_|export_|download_|generate_|design_|run_)/;
    if (MUTATING.test(name)) return false;
    const READONLY_PREFIXES = [
      'get_',
      'list_',
      'search_',
      'find_',
      'compute_',
      'calculate_',
      'translate_',
      'reverse_',
      'analyze_',
      'count_',
      'fetch_',
      'view_',
      'describe_',
    ];
    return READONLY_PREFIXES.some(p => name.startsWith(p));
  }

  /**
   * Run an async function over items with a bounded number of concurrent
   * workers, preserving input order in the results.
   */
  async _mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));
    const workers = new Array(workerCount).fill(0).map(async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        results[idx] = await fn(items[idx], idx);
      }
    });
    await Promise.all(workers);
    return results;
  }

  /**
   * Fan a single read-only tool out across multiple open genome windows and
   * return results labeled by windowId + genomeName. Each window is executed
   * independently (one failure does not abort the others), with bounded
   * concurrency. This is the primitive for simultaneous multi-genome analysis.
   */
  async executeRunOnWindows(parameters, clientId) {
    const innerTool = parameters?.tool;
    if (!innerTool) {
      return { success: false, error: 'Parameter "tool" is required (the read-only tool to run in each window).' };
    }
    if (!this.isFanoutSafeTool(innerTool)) {
      return {
        success: false,
        error:
          `Tool '${innerTool}' cannot be fanned out across windows. Only read-only tools ` +
          `(get_/list_/search_/compute_/analyze_/...) are allowed; mutating, navigation, and export tools ` +
          `are rejected to avoid changing multiple genomes at once.`,
      };
    }
    if (!this.allTools[innerTool]) {
      return { success: false, error: `Inner tool '${innerTool}' not found.` };
    }
    if (!this.server || typeof this.server.executeToolOnClient !== 'function') {
      return { success: false, error: 'Server not available for fan-out execution.' };
    }

    // Resolve target windows from the authoritative window list.
    const all = typeof this.server.listWindows === 'function' ? this.server.listWindows() : [];
    let targets = all.filter(w => w && !w.isDestroyed);

    const requested = Array.isArray(parameters.windowIds) ? parameters.windowIds : null;
    if (requested && requested.length) {
      const wanted = new Set(requested);
      targets = targets.filter(w => wanted.has(w.windowId));
      const found = new Set(targets.map(w => w.windowId));
      const missing = requested.filter(id => !found.has(id));
      if (missing.length) {
        return { success: false, error: `Unknown windowId(s): [${missing.join(', ')}]. Call list_genome_windows.` };
      }
    }
    if (!targets.length) {
      return { success: false, error: 'No open genome windows to run on.' };
    }

    const innerParams = { ...(parameters.parameters || {}) };
    delete innerParams.windowId; // set per window below

    const results = await this._mapWithConcurrency(targets, 4, async target => {
      try {
        const result = await this.server.executeToolOnClient(
          innerTool,
          { ...innerParams, windowId: target.windowId },
          clientId
        );
        return { windowId: target.windowId, genomeName: target.genomeName || null, success: true, result };
      } catch (error) {
        return {
          windowId: target.windowId,
          genomeName: target.genomeName || null,
          success: false,
          error: error.message,
        };
      }
    });

    return {
      success: true,
      tool: innerTool,
      windowCount: results.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }
}

module.exports = ToolsIntegrator;
