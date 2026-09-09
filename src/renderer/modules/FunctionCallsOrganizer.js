/**
 * FunctionCallsOrganizer - organizes and optimizes the execution strategy for function calls
 * Executes by feature category to optimize ChatBox response speed and accuracy
 * Enhanced with dynamic plugin tools integration
 */
class FunctionCallsOrganizer {
  constructor(chatManager) {
    this.chatManager = chatManager;
    this.app = chatManager.app;

    // Track dynamically registered plugin tools
    this.dynamicPluginTools = new Map();
    this.dynamicRegistryTools = new Map();

    // Feature category definitions
    this.functionCategories = {
      // Category 1: Browser actions - high priority, executed immediately
      browserActions: {
        priority: 1,
        description: 'Browser behavior and visual interface actions',
        functions: [
          'navigate_to_position',
          'zoom_to_gene',
          'zoom_in',
          'zoom_out',
          'scroll_left',
          'scroll_right',
          'toggle_track',
          'get_current_state',
          'get_track_status',
          'bookmark_position',
          'get_bookmarks',
          'save_view_state',
          'restore_view_state',
          'navigate_to',
          'jump_to_gene',
          'get_current_region',
          'open_new_tab',
          'switch_to_tab',
          'close_tab',
          'set_working_directory',
          'toggle_settings_modal',
          'toggle_chatbox',
          'set_chatbox_layout',
          'set_chatbox_minimized',
          'toggle_sidebar',
          'toggle_sidebar_panel',
          'toggle_top_banner',
          'switch_ui_style',
          'get_track_settings',
          'set_track_settings',
          'get_all_track_settings',
          'reset_track_settings',
          'get_track_settings_schema',
          'batch_set_track_settings',
          'download_internet_file',
          'pan_left',
          'pan_right',
          'select_gene',
          'select_sequence_region',
          'highlight_region',
          'remove_highlight',
          'clear_highlights',
          'view_markdown_file',
          'list_available_tools',
          'list_skills',
          'get_skill',
          'add_task',
          'update_task',
          'list_tasks',
          'clear_tasks',
          'delete_task',
        ],
      },

      // Category 2: Data retrieval - medium priority, fast execution
      dataRetrieval: {
        priority: 2,
        description: 'Data retrieval and basic information queries',
        functions: [
          'get_sequence',
          'get_gene_details',
          'get_chromosome_list',
          'search_features',
          'find_gene_by_name',
          'find_gene', // legacy alias
          'search_by_position',
          'get_nearby_features',
          'get_operons',
          'list_highlights',
          'get_file_info',
          'get_genome_info', // CRITICAL FIX: Added missing tool
          'search_pattern',
          'search_motif',
          'search_sequence_motif',
          'get_coding_sequence',
          'get_annotation',
          'list_annotations',
          'search_annotations',
          'assess_annotation_quality',
          'list_annotation_quality_candidates',
          // File loading tools - CRITICAL FIX
          'load_genome',
          'load_genome_file',
          'load_fasta',
          'load_fasta_file',
          'load_genbank',
          'load_genbank_file',
          'load_gbk',
          'load_gbk_file',
          'load_annotation',
          'load_annotation_file',
          'load_bed',
          'load_bed_file',
          'load_gff',
          'load_gff_file',
          'load_gff3',
          'load_gff3_file',
          'load_gtf',
          'load_gtf_file',
          'load_variant',
          'load_variant_file',
          'load_vcf',
          'load_vcf_file',
          'load_reads',
          'load_reads_file',
          'load_bam',
          'load_bam_file',
          'load_sam',
          'load_sam_file',
          'load_wig',
          'load_wig_file',
          'load_wig_tracks',
          'load_bigwig',
          'load_bigwig_file',
          'load_bedgraph',
          'load_bedgraph_file',
          'load_track',
          'load_track_file',
          'load_tracks',
          'load_operon',
          'load_operons',
          'load_operon_file',
          'get_loaded_files_list',
        ],
      },

      // Category 3: Sequence analysis - medium priority, may require compute time
      sequenceAnalysis: {
        priority: 3,
        description: 'Sequence analysis and computational tools',
        functions: [
          'translate_sequence',
          'calculate_gc_content',
          'reverse_complement',
          'translate_dna',
          'calculate_entropy',
          'calc_region_gc',
          'compute_gc',
          'codon_usage_analysis',
          'analyze_codon_usage',
          'amino_acid_composition',
          'calculate_melting_temp',
          'calculate_molecular_weight',
        ],
      },

      // Category 4: Advanced analysis - low priority, compute-intensive
      advancedAnalysis: {
        priority: 4,
        description: 'Advanced analysis and prediction tools',
        functions: [
          'find_intergenic_regions',
          'search_intergenic_regions',
          'find_restriction_sites',
          'virtual_digest',
          'list_restriction_enzymes',
          'simulate_gel_electrophoresis',
          'list_dna_markers',
          'get_dna_marker_info',
          'predict_promoter',
          'predict_rbs',
          'predict_terminator',
          'compare_regions',
          'find_similar_sequences',
        ],
      },

      // Category 5: BLAST search - low priority, network-dependent
      blastSearch: {
        priority: 5,
        description: 'BLAST searches and similarity analysis',
        functions: [
          'blast_search',
          'blast_search_online',
          'blast_search_local',
          'blast_search_batch',
          'blast_create_database',
          'blast_list_databases',
          'blast_delete_database',
          'blast_create_db_from_genome',
          'blast_create_protein_db_from_genome',
          'blast_create_quick_db_for_current_genome',
          'blast_filter_results',
          'blast_export_results',
          'blast_detect_sequence_type',
          'blast_validate_database',
          'blast_get_installation_status',
          'blast_sequence_from_region',
          // Legacy aliases
          'get_blast_databases',
          'batch_blast_search',
          'advanced_blast_search',
        ],
      },

      // Category 6: Data operations - variable priority, depends on the operation type
      dataManipulation: {
        priority: 3,
        description: 'Data creation, editing, and export operations',
        functions: [
          'create_annotation',
          'edit_annotation',
          'update_annotation',
          'merge_gene_research_report',
          'resolve_annotation_target',
          'create_annotation_changeset',
          'get_annotation_changeset',
          'list_annotation_changesets',
          'request_annotation_approval',
          'reject_annotation_changeset',
          'apply_annotation_changeset',
          'rollback_annotation_changeset',
          'get_annotation_audit',
          'start_annotation_research',
          'archive_annotation_research',
          'get_annotation_research_workflow',
          'list_annotation_research_history',
          'cancel_annotation_research',
          'delete_annotation',
          'bulk_update_annotations',
          'get_annotation_history',
          'add_annotation',
          'batch_create_annotations',
          'merge_annotations',
          'export_data',
          'export_region_features',
          'add_track',
          'add_variant',
          'delete_sequence',
          'insert_sequence',
          'replace_sequence',
          'copy_sequence',
          'cut_sequence',
          'paste_sequence',
          'get_action_list',
          'show_action_list',
          'execute_actions',
          'clear_actions',
          'get_clipboard_content',
          'codon_usage_analysis',
          'genome_codon_usage_analysis',
        ],
      },

      // Category 7: Protein structure - low priority, externally dependent
      proteinStructure: {
        priority: 5,
        description: 'Protein structure visualization and analysis',
        functions: [
          'open_protein_viewer',
          'fetch_protein_structure',
          'search_pdb_structures', // New preferred name
          'search_alphafold_structures',

          'fetch_alphafold_structure',
          'get_pdb_details',
        ],
      },

      // Category 8: Plugin system V2 - function plugins (fast execution)
      pluginFunctions: {
        priority: 3,
        description: 'Plugin Manager V2 - Function plugins for analysis',
        functions: [
          // Genomic Analysis Plugin V2
          'genomic-analysis.analyzeGCContent',
          'genomic-analysis.findMotifs',
          'genomic-analysis.calculateDiversity',
          'genomic-analysis.compareRegions',

          // Phylogenetic Analysis Plugin V2
          'phylogenetic-analysis.buildPhylogeneticTree',
          'phylogenetic-analysis.calculateEvolutionaryDistance',

          // Machine Learning Analysis Plugin V2
          'ml-analysis.predictGeneFunction',
          'ml-analysis.classifySequence',
        ],
      },

      // Category 9: Plugin system V2 - utility plugins (high priority)
      pluginUtilities: {
        priority: 2,
        description: 'Plugin Manager V2 - Utility plugins for common tasks',
        functions: ['sequence-utils.reverseComplement', 'sequence-utils.translateSequence'],
      },

      // Category 10: Plugin system V2 - visualization plugins (low priority)
      pluginVisualizations: {
        priority: 5,
        description: 'Plugin Manager V2 - Visualization plugins',
        functions: [
          // Visualization plugins are dynamically registered
          // Base tools registered here, dynamic tools added via registerPluginTools()
          'protein-interaction-network.visualize',
          'protein-interaction-network.renderNetwork',
        ],
      },

      // Category 11: Biological network analysis (kept for backward compatibility)
      pluginNetworkAnalysis: {
        priority: 4,
        description: 'Legacy biological network analysis functions',
        functions: [
          'biological-networks.buildProteinInteractionNetwork',
          'biological-networks.buildGeneRegulatoryNetwork',
          'biological-networks.analyzeNetworkCentrality',
          'biological-networks.detectNetworkCommunities',
        ],
      },

      // Category 12: Database integration - medium priority, network-dependent
      databaseIntegration: {
        priority: 3,
        description: 'Database integration and external API access',
        functions: [
          'search_uniprot_database',
          'advanced_uniprot_search',
          'get_uniprot_entry',
          'analyze_interpro_domains',
          'search_interpro_entry',
          'get_interpro_entry_details',
        ],
      },

      // Category 13: Data export - medium priority, file-operation-based
      dataExport: {
        priority: 3,
        description: 'Data export and file generation operations',
        functions: [
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
      },

      // Category 14: Plugin management - medium priority, system-management-based
      pluginManagement: {
        priority: 3,
        description: 'Plugin management and execution operations',
        functions: [
          'get_plugin_info',
          'install_plugin',
          'uninstall_plugin',
          'enable_plugin',
          'disable_plugin',
          'execute_plugin',
          'call_plugin_function',
          'get_plugin_functions',
          'create_plugin',
          'validate_plugin',
          'search_plugins',
        ],
      },

      // Category 15: Coordination management - medium priority, task-coordination-based
      coordination: {
        priority: 3,
        description: 'Task coordination and workflow management',
        functions: [
          'decompose_task',
          'integrate_results',
          'create_workflow',
          'execute_workflow',
          'assign_task_to_agent',
          'get_agent_status',
          'balance_load',
          'handle_error',
          'retry_failed_task',
          'fallback_strategy',
          'optimize_execution',
          'cache_strategy',
          'parallel_execution',
          'get_workflow_status',
        ],
      },

      // Category 16: External API - low priority, network-dependent
      externalApis: {
        priority: 5,
        description: 'External API calls and third-party integrations',
        functions: ['blast_sequence', 'uniprot_search', 'alphafold_search', 'alphafold_get_structure'],
      },

      // Category 17: Benchmark management - medium priority, UI-management-based
      benchmarkManagement: {
        priority: 3,
        description: 'LLM benchmark execution, control, and results management',
        functions: [
          'open_benchmark',
          'start_benchmark',
          'stop_benchmark',
          'pause_benchmark',
          'resume_benchmark',
          'get_benchmark_results',
          'get_benchmark_status',
          'export_benchmark_results',
        ],
      },

      primerDesign: {
        priority: 2,
        description: 'Primer design, property calculation, binding site analysis, and annotation',
        functions: [
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
      },

      registryDynamic: {
        priority: 3,
        description: 'Dynamically registered tools from the canonical tool registry manifest',
        functions: [],
      },
    };

    // Feature map
    this.functionToCategory = this.buildFunctionMapping();
  }

  /**
   * Build the feature-to-category map
   */
  buildFunctionMapping() {
    const mapping = new Map();
    for (const [categoryName, category] of Object.entries(this.functionCategories)) {
      for (const functionName of category.functions) {
        mapping.set(functionName, categoryName);
      }
    }
    return mapping;
  }

  /**
   * Register tools from the canonical registry snapshot so execution planning
   * stays aligned with tools_registry YAML and the generated runtime manifest.
   */
  registerToolRegistrySnapshot(snapshot = {}) {
    try {
      for (const [toolName, metadata] of this.dynamicRegistryTools.entries()) {
        const category = this.functionCategories[metadata.category];
        if (category && Array.isArray(category.functions)) {
          category.functions = category.functions.filter(functionName => functionName !== toolName);
        }
      }
      this.dynamicRegistryTools.clear();
      this.functionToCategory = this.buildFunctionMapping();

      const tools = Array.isArray(snapshot.tools) ? snapshot.tools : Object.values(snapshot.toolsByName || {});
      const builtInTools = Array.isArray(snapshot.builtInTools) ? snapshot.builtInTools : [];

      for (const tool of [...tools, ...builtInTools]) {
        if (!tool || !tool.name || this.functionToCategory.has(tool.name)) {
          continue;
        }

        const categoryName = this.mapRegistryCategoryToFunctionCategory(tool);
        if (!this.functionCategories[categoryName]) {
          this.functionCategories[categoryName] = {
            priority: 3,
            description: 'Dynamically registered tools',
            functions: [],
          };
        }

        this.functionCategories[categoryName].functions.push(tool.name);
        this.dynamicRegistryTools.set(tool.name, {
          category: categoryName,
          registryCategory: tool.category,
          source: tool.source || 'tool-registry',
          isBuiltIn: !!tool.isBuiltIn,
        });
      }

      this.functionToCategory = this.buildFunctionMapping();
      console.log(
        `✅ [FunctionCallsOrganizer] Registered ${this.dynamicRegistryTools.size} registry-backed dynamic tools`
      );
    } catch (error) {
      console.warn('[FunctionCallsOrganizer] Failed to register tool registry snapshot:', error.message);
    }
  }

  getExecutionMetadata(toolName, parameters = {}, context = {}) {
    return this.chatManager?.getCapabilityRegistry?.()?.getExecutionMetadata?.(toolName, parameters, context) || null;
  }

  compileToolCallPlan(toolCalls, options = {}) {
    return this.chatManager?.getToolCallPlanCompiler?.()?.compile?.(toolCalls, options) || null;
  }

  mapRegistryCategoryToFunctionCategory(tool = {}) {
    const category = tool.category || '';
    const toolName = String(tool.name || '');

    if (category === 'file_loading') return 'dataRetrieval';
    if (['navigation', 'state', 'system', 'utility', 'track_settings'].includes(category)) return 'browserActions';
    if (['sequence', 'primer_design'].includes(category)) return 'sequenceAnalysis';
    if (['annotation', 'data_management', 'file_operations', 'export', 'actions'].includes(category)) {
      return 'dataManipulation';
    }
    if (['blast', 'pathway'].includes(category)) return 'blastSearch';
    if (category === 'external_apis' && toolName.includes('blast')) return 'blastSearch';
    if (['database', 'protein', 'external_apis'].includes(category)) return 'databaseIntegration';
    if (category === 'coordination') return 'coordination';
    if (category === 'benchmark') return 'benchmarkManagement';
    if (category === 'task_management') return 'browserActions';
    return 'registryDynamic';
  }

  /**
   * Analyze which combination of feature types a user request needs
   * @param {string} userMessage - the user message
   * @param {Array} requestedTools - the list of requested tools
   * @returns {Object} the analysis result
   */
  analyzeRequestStrategy(userMessage, requestedTools = []) {
    const strategy = {
      categories: new Set(),
      priorityGroups: new Map(),
      executionPlan: [],
      estimatedTime: 0,
    };

    // Analyze the keywords in the user message
    const messageKeywords = this.extractKeywords(userMessage.toLowerCase());

    console.log('📊 [FunctionCallsOrganizer] analyzeRequestStrategy:', {
      userMessage,
      requestedTools,
      messageKeywords,
    });

    // Analyze the requested tools
    for (const tool of requestedTools) {
      const category = this.functionToCategory.get(tool);
      console.log(`🔍 [FunctionCallsOrganizer] Tool: ${tool}, Category: ${category}`);

      if (category) {
        strategy.categories.add(category);

        const categoryInfo = this.functionCategories[category];
        if (!strategy.priorityGroups.has(categoryInfo.priority)) {
          strategy.priorityGroups.set(categoryInfo.priority, []);
        }
        strategy.priorityGroups.get(categoryInfo.priority).push({
          tool: tool,
          category: category,
        });
      } else {
        console.warn(`⚠️ [FunctionCallsOrganizer] Tool '${tool}' not found in category mapping`);
      }
    }

    // Infer the likely feature types from the keywords
    const inferredCategories = this.inferCategoriesFromKeywords(messageKeywords);
    for (const category of inferredCategories) {
      strategy.categories.add(category);
    }

    // Build the execution plan
    strategy.executionPlan = this.buildExecutionPlan(strategy.priorityGroups);
    strategy.estimatedTime = this.estimateExecutionTime(strategy.executionPlan);

    return strategy;
  }

  /**
   * Extract keywords from the message
   */
  extractKeywords(message) {
    const keywords = {
      navigation: [
        'navigate',
        'go to',
        'jump to',
        'zoom',
        'scroll',
        'move to',
        'position',
        'switch',
        'tab',
        'change tab',
        'open tab',
        'directory',
        'folder',
        'working',
        'set',
        'cd',
      ],
      search: ['search', 'find', 'look for', 'locate', 'get'],
      analysis: ['analyze', 'calculate', 'compute', 'predict', 'statistics'],
      blast: ['blast', 'similarity', 'homology', 'compare with database'],
      visualization: ['show', 'display', 'toggle', 'hide', 'visible', 'track'],
      sequence: ['sequence', 'dna', 'rna', 'protein', 'translate', 'gc content'],
      annotation: ['annotate', 'add', 'edit', 'delete', 'modify', 'create'],
    };

    const found = {};
    for (const [type, words] of Object.entries(keywords)) {
      found[type] = words.some(word => message.includes(word));
    }

    return found;
  }

  /**
   * Infer feature categories from keywords
   */
  inferCategoriesFromKeywords(keywords) {
    const categories = [];

    if (keywords.navigation || keywords.visualization) {
      categories.push('browserActions');
    }

    if (keywords.search) {
      categories.push('dataRetrieval');
    }

    if (keywords.sequence || keywords.analysis) {
      categories.push('sequenceAnalysis');
    }

    if (keywords.blast) {
      categories.push('blastSearch');
    }

    if (keywords.annotation) {
      categories.push('dataManipulation');
    }

    return categories;
  }

  /**
   * Build the execution plan
   */
  buildExecutionPlan(priorityGroups) {
    const plan = [];

    // Sort by priority
    const sortedPriorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);

    for (const priority of sortedPriorities) {
      const group = priorityGroups.get(priority);
      plan.push({
        priority: priority,
        phase: this.getPhaseName(priority),
        tools: group,
        parallelizable: this.isParallelizable(priority, group),
        estimatedTime: this.estimatePhaseTime(priority, group.length),
      });
    }

    return plan;
  }

  /**
   * Get the stage name
   */
  getPhaseName(priority) {
    const phases = {
      1: 'Immediate Browser Actions',
      2: 'Data Retrieval',
      3: 'Sequence Analysis',
      4: 'Advanced Analysis',
      5: 'External Services',
    };
    return phases[priority] || 'Unknown Phase';
  }

  /**
   * Determine whether parallel execution is possible
   */
  isParallelizable(priority, tools = []) {
    // Browser actions usually need to run sequentially
    if (priority === 1) return false;

    // File loading tools should be executed sequentially for proper dependency order
    const fileLoadingTools = [
      'load_genome',
      'load_genome_file',
      'load_fasta',
      'load_fasta_file',
      'load_genbank',
      'load_genbank_file',
      'load_gbk',
      'load_gbk_file',
      'load_annotation',
      'load_annotation_file',
      'load_bed',
      'load_bed_file',
      'load_gff',
      'load_gff_file',
      'load_gff3',
      'load_gff3_file',
      'load_gtf',
      'load_gtf_file',
      'load_variant',
      'load_variant_file',
      'load_vcf',
      'load_vcf_file',
      'load_reads',
      'load_reads_file',
      'load_bam',
      'load_bam_file',
      'load_sam',
      'load_sam_file',
      'load_wig',
      'load_wig_file',
      'load_wig_tracks',
      'load_bigwig',
      'load_bigwig_file',
      'load_bedgraph',
      'load_bedgraph_file',
      'load_track',
      'load_track_file',
      'load_tracks',
      'load_operon',
      'load_operons',
      'load_operon_file',
    ];

    // Extract tool names from the tools array (tools may be objects with .tool property)
    const toolNames = tools.map(t => (typeof t === 'string' ? t : t.tool || t.tool_name || t));

    // Check if any of the tools are file loading tools
    const hasFileLoadingTools = toolNames.some(toolName => fileLoadingTools.includes(toolName));
    if (hasFileLoadingTools) {
      console.log('🔄 File loading tools detected - forcing sequential execution');
      console.log('Tool names detected:', toolNames);
      return false;
    }

    // Other types can run in parallel
    return true;
  }

  /**
   * Estimate the stage execution time (milliseconds)
   */
  estimatePhaseTime(priority, toolCount) {
    const baseTime = {
      1: 100, // browser actions - very fast
      2: 200, // data retrieval - fast
      3: 500, // sequence analysis - medium
      4: 1000, // advanced analysis - slow
      5: 2000, // external services - very slow
    };

    return (baseTime[priority] || 500) * toolCount;
  }

  /**
   * Estimate the total execution time
   */
  estimateExecutionTime(executionPlan) {
    return executionPlan.reduce((total, phase) => {
      return total + (phase.parallelizable ? phase.estimatedTime / 2 : phase.estimatedTime);
    }, 0);
  }

  /**
   * Main entry point for optimizing the execution strategy
   * @param {string} userMessage - the user message
   * @param {Array} requestedTools - the requested tools
   * @returns {Object} the optimized execution strategy
   */
  async optimizeExecution(userMessage, requestedTools) {
    // Analyze the request strategy
    const strategy = this.analyzeRequestStrategy(userMessage, requestedTools);

    // Generate the execution report
    const report = this.generateExecutionReport(strategy);

    // Return optimization suggestions
    return {
      strategy: strategy,
      report: report,
      recommendations: this.generateRecommendations(strategy),
    };
  }

  /**
   * Generate the execution report
   */
  generateExecutionReport(strategy) {
    return {
      totalCategories: strategy.categories.size,
      totalPhases: strategy.executionPlan.length,
      estimatedTime: `${Math.round((strategy.estimatedTime / 1000) * 10) / 10}s`,
      phases: strategy.executionPlan.map(phase => ({
        name: phase.phase,
        priority: phase.priority,
        toolCount: phase.tools.length,
        parallel: phase.parallelizable,
        time: `${Math.round((phase.estimatedTime / 1000) * 10) / 10}s`,
      })),
    };
  }

  /**
   * Generate optimization suggestions
   */
  generateRecommendations(strategy) {
    const recommendations = [];

    // Check whether any browser actions need to run first
    if (strategy.categories.has('browserActions')) {
      recommendations.push({
        type: 'priority',
        message: 'Browser actions will be executed first for immediate visual feedback',
      });
    }

    // Check whether there are any time-consuming operations
    if (strategy.categories.has('blastSearch') || strategy.categories.has('advancedAnalysis')) {
      recommendations.push({
        type: 'performance',
        message: 'Time-consuming operations detected. Consider running in background',
      });
    }

    // Check whether parallel execution is possible
    const parallelPhases = strategy.executionPlan.filter(p => p.parallelizable);
    if (parallelPhases.length > 1) {
      recommendations.push({
        type: 'optimization',
        message: `${parallelPhases.length} phases can be executed in parallel to improve speed`,
      });
    }

    return recommendations;
  }

  /**
   * Get the feature list by category
   */
  getFunctionsByCategory(categoryName) {
    return this.functionCategories[categoryName]?.functions || [];
  }

  /**
   * Get the category info for a feature
   */
  getFunctionCategory(functionName) {
    // First check the traditional feature map
    const categoryName = this.functionToCategory.get(functionName);
    if (categoryName) {
      return {
        name: categoryName,
        ...this.functionCategories[categoryName],
      };
    }

    // Check whether it's a plugin feature (a function name containing a dot)
    if (functionName.includes('.')) {
      const [pluginId] = functionName.split('.');

      // Determine the category from the plugin ID
      switch (pluginId) {
        case 'genomic-analysis':
          return {
            name: 'pluginGenomicAnalysis',
            ...this.functionCategories.pluginGenomicAnalysis,
          };
        case 'phylogenetic-analysis':
          return {
            name: 'pluginPhylogenetic',
            ...this.functionCategories.pluginPhylogenetic,
          };
        case 'biological-networks':
          return {
            name: 'pluginNetworkAnalysis',
            ...this.functionCategories.pluginNetworkAnalysis,
          };
        case 'ml-analysis':
          return {
            name: 'pluginMachineLearning',
            ...this.functionCategories.pluginMachineLearning,
          };
        default:
          // Unknown plugin, return the default category
          return {
            name: 'pluginGeneral',
            priority: 3,
            description: 'General plugin functions',
            functions: [],
          };
      }
    }

    return null;
  }

  /**
   * Get statistics for all categories
   */
  getCategoryStatistics() {
    const stats = {};
    for (const [name, category] of Object.entries(this.functionCategories)) {
      stats[name] = {
        description: category.description,
        priority: category.priority,
        functionCount: category.functions.length,
        functions: category.functions,
      };
    }
    return stats;
  }

  /**
   * Register plugin tools dynamically from PluginManagerV2
   * Called when plugins are installed/activated
   * @param {PluginManagerV2} pluginManager - The plugin manager instance
   */
  registerPluginTools(pluginManager) {
    if (!pluginManager) {
      console.warn('⚠️ [FunctionCallsOrganizer] No plugin manager provided');
      return;
    }

    try {
      console.log('🔌 [FunctionCallsOrganizer] Registering plugin tools...');

      // Clear existing dynamic tools
      this.dynamicPluginTools.clear();

      // Get visualization plugins
      const visualizations = pluginManager.getAvailableVisualizations ? pluginManager.getAvailableVisualizations() : [];

      for (const viz of visualizations) {
        const toolName = `${viz.id}.visualize`;
        const renderName = `${viz.id}.renderNetwork`;

        this.dynamicPluginTools.set(toolName, {
          type: 'visualization',
          pluginId: viz.id,
          name: viz.name,
          category: 'pluginVisualizations',
        });

        this.dynamicPluginTools.set(renderName, {
          type: 'visualization',
          pluginId: viz.id,
          name: viz.name,
          category: 'pluginVisualizations',
        });

        // Add to function category if not already present
        if (!this.functionCategories.pluginVisualizations.functions.includes(toolName)) {
          this.functionCategories.pluginVisualizations.functions.push(toolName);
        }
        if (!this.functionCategories.pluginVisualizations.functions.includes(renderName)) {
          this.functionCategories.pluginVisualizations.functions.push(renderName);
        }
      }

      // Get function plugins
      const functionPlugins = pluginManager.getAllFunctions ? pluginManager.getAllFunctions() : [];

      for (const func of functionPlugins) {
        const toolName = `${func.pluginId}.${func.name}`;

        this.dynamicPluginTools.set(toolName, {
          type: 'function',
          pluginId: func.pluginId,
          name: func.name,
          category: 'pluginFunctions',
        });

        // Add to function category if not already present
        if (!this.functionCategories.pluginFunctions.functions.includes(toolName)) {
          this.functionCategories.pluginFunctions.functions.push(toolName);
        }
      }

      // Rebuild function mapping
      this.functionToCategory = this.buildFunctionMapping();

      console.log(`✅ [FunctionCallsOrganizer] Registered ${this.dynamicPluginTools.size} plugin tools`);
      console.log('   - Visualization tools:', this.functionCategories.pluginVisualizations.functions.length);
      console.log('   - Function tools:', this.functionCategories.pluginFunctions.functions.length);
    } catch (error) {
      console.error('❌ [FunctionCallsOrganizer] Error registering plugin tools:', error);
    }
  }

  /**
   * Check if a tool is a dynamically registered plugin tool
   * @param {string} toolName - Tool name to check
   * @returns {boolean}
   */
  isPluginTool(toolName) {
    return this.dynamicPluginTools.has(toolName) || toolName.includes('.');
  }

  /**
   * Get plugin tool information
   * @param {string} toolName - Tool name
   * @returns {Object|null}
   */
  getPluginToolInfo(toolName) {
    return this.dynamicPluginTools.get(toolName) || null;
  }

  /**
   * Get all registered plugin tools
   * @returns {Array}
   */
  getAllPluginTools() {
    return Array.from(this.dynamicPluginTools.entries()).map(([name, info]) => ({
      name,
      ...info,
    }));
  }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FunctionCallsOrganizer;
} else if (typeof window !== 'undefined') {
  window.FunctionCallsOrganizer = FunctionCallsOrganizer;
}
