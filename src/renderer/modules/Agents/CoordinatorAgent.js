/**
 * CoordinatorAgent - coordination agent
 * Coordinates the work of other agents, handling complex task decomposition and result integration
 */
class CoordinatorAgent extends AgentBase {
  constructor(multiAgentSystem) {
    super(multiAgentSystem, 'coordinator', [
      'task_coordination',
      'workflow_management',
      'result_integration',
      'error_recovery',
    ]);

    this.app = multiAgentSystem.app;
    this.configManager = multiAgentSystem.configManager;
    this.memorySystem = null;
    this.workflowEngine = null;
  }

  /**
   * Run the concrete initialization logic
   */
  async performInitialization() {
    // Ensure the app is initialized
    if (!this.app) {
      throw new Error('Application reference not available');
    }

    // Get the memory system
    this.memorySystem = this.app.memorySystem || null;
    if (!this.memorySystem) {
      console.warn('⚠️ CoordinatorAgent: MemorySystem not available, some optimization features will be disabled');
    }

    // Initialize the workflow engine
    this.workflowEngine = new WorkflowEngine(this);

    console.log(`🎯 CoordinatorAgent: Coordination tools initialized`);
  }

  /**
   * Perform function execution with ChatManager delegation
   */
  async performExecution(functionName, parameters, context) {
    const chatManager = this.multiAgentSystem.chatManager;

    // Route through the existing gateway so nested agent calls share one turn.
    const gateway = chatManager?.getExecutionGateway?.();
    if (gateway?.execute) {
      return await gateway.execute(functionName, parameters, {
        turnContext: context?.turnContext || context?.context || null,
        nodeId: context?.nodeId,
        source: context?.source || 'coordinator',
        scope: context?.scope,
        internalDispatch: true,
      });
    }

    if (chatManager && typeof chatManager.executeToolByName === 'function') {
      try {
        const result = await chatManager.executeToolByName(functionName, parameters, {
          bypassAgent: true,
          internalDispatch: true,
          turnContext: context?.turnContext || context?.context,
          nodeId: context?.nodeId,
          source: context?.source || 'coordinator',
          scope: context?.scope,
        });
        context?.turnContext?.diagnostics?.push?.({ type: 'coordinator_gateway_fallback', functionName });
        return result;
      } catch (error) {
        context?.turnContext?.diagnostics?.push?.({
          type: 'coordinator_gateway_fallback_error',
          functionName,
          message: error.message,
        });
        throw error;
      }
    }

    context?.turnContext?.diagnostics?.push?.({ type: 'coordinator_local_fallback', functionName });
    return await this._performLocalExecution(functionName, parameters, context);
  }

  /**
   * Local execution fallback
   */
  async _performLocalExecution(functionName, parameters, context) {
    // Check toolMapping for local implementations
    if (this.toolMapping.has(functionName)) {
      const toolFunction = this.toolMapping.get(functionName);
      return await toolFunction(parameters, context);
    }

    throw new Error(`CoordinatorAgent: Function ${functionName} not implemented locally and ChatManager unavailable`);
  }

  /**
   * Register the tool mappings
   */
  registerToolMapping() {
    // Task coordination tools
    this.toolMapping.set('coordinate_task', this.coordinateTask.bind(this));
    this.toolMapping.set('decompose_task', this.decomposeTask.bind(this));
    this.toolMapping.set('integrate_results', this.integrateResults.bind(this));

    // Workflow management tools
    this.toolMapping.set('create_workflow', this.createWorkflow.bind(this));
    this.toolMapping.set('execute_workflow', this.executeWorkflow.bind(this));
    this.toolMapping.set('get_workflow_status', this.getWorkflowStatus.bind(this));

    // Agent coordination tools
    this.toolMapping.set('assign_task_to_agent', this.assignTaskToAgent.bind(this));
    this.toolMapping.set('get_agent_status', this.getAgentStatus.bind(this));
    this.toolMapping.set('balance_load', this.balanceLoad.bind(this));

    // Error recovery tools
    this.toolMapping.set('handle_error', this.handleError.bind(this));
    this.toolMapping.set('retry_failed_task', this.retryFailedTask.bind(this));
    this.toolMapping.set('fallback_strategy', this.fallbackStrategy.bind(this));

    // Performance optimization tools
    this.toolMapping.set('optimize_execution', this.optimizeExecution.bind(this));
    this.toolMapping.set('cache_strategy', this.cacheStrategy.bind(this));
    this.toolMapping.set('parallel_execution', this.parallelExecution.bind(this));

    console.log(`🎯 CoordinatorAgent: Registered ${this.toolMapping.size} coordination tools`);
  }

  /**
   * Coordinate tasks
   */
  async coordinateTask(parameters, strategy) {
    try {
      const { task, timeout = 30000 } = parameters;

      if (!task) {
        throw new Error('Task is required');
      }

      // 1. Analyze the task
      const taskAnalysis = await this.analyzeTask(task);

      // 2. Decompose the task
      const subtasks = await this.decomposeTask(taskAnalysis);

      // 3. Assign tasks to agents
      const assignments = await this.assignSubtasksToAgents(subtasks);

      // 4. Execute the tasks
      const results = await this.executeSubtasks(assignments, timeout);

      // 5. Integrate the results
      const integratedResult = await this.integrateResults(results);

      // 6. Record to the memory system
      if (this.memorySystem && typeof this.memorySystem.recordToolCall === 'function') {
        try {
          await this.memorySystem.recordToolCall('coordinate_task', parameters, integratedResult, Date.now());
        } catch (err) {
          console.warn('CoordinatorAgent: Failed to record to memory system', err);
        }
      }

      return {
        success: true,
        result: integratedResult,
        taskAnalysis,
        subtasks: subtasks.length,
        executionTime: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Decompose a task
   */
  async decomposeTask(parameters, strategy) {
    try {
      const { task } = parameters;

      if (!task) {
        throw new Error('Task is required');
      }

      const subtasks = [];

      // Decompose based on the task type
      if (task.type === 'sequence_analysis') {
        subtasks.push(
          { type: 'data_retrieval', agent: 'data', priority: 'high' },
          { type: 'sequence_processing', agent: 'analysis', priority: 'high' },
          { type: 'result_formatting', agent: 'data', priority: 'low' }
        );
      } else if (task.type === 'external_search') {
        subtasks.push(
          { type: 'api_call', agent: 'external', priority: 'high' },
          { type: 'result_processing', agent: 'analysis', priority: 'medium' },
          { type: 'data_storage', agent: 'data', priority: 'low' }
        );
      } else if (task.type === 'plugin_execution') {
        subtasks.push(
          { type: 'plugin_validation', agent: 'plugin', priority: 'high' },
          { type: 'plugin_execution', agent: 'plugin', priority: 'high' },
          { type: 'result_integration', agent: 'coordinator', priority: 'medium' }
        );
      } else {
        // Generic task decomposition
        subtasks.push(
          { type: 'task_analysis', agent: 'coordinator', priority: 'high' },
          { type: 'execution', agent: 'auto', priority: 'high' },
          { type: 'result_validation', agent: 'coordinator', priority: 'medium' }
        );
      }

      return {
        success: true,
        subtasks: subtasks.map((subtask, index) => ({
          id: `subtask_${index}`,
          ...subtask,
          dependencies: this.getDependencies(subtask, subtasks, index),
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Integrate the results
   */
  async integrateResults(parameters, strategy) {
    try {
      const { results } = parameters;

      if (!results || !Array.isArray(results)) {
        throw new Error('Results array is required');
      }

      // Sort the results by priority
      results.sort((a, b) => b.priority - a.priority);

      // Integrate the results
      const integratedResult = {
        success: true,
        data: {},
        metadata: {
          totalResults: results.length,
          successfulResults: results.filter(r => r.success).length,
          failedResults: results.filter(r => !r.success).length,
          integrationTime: Date.now(),
        },
      };

      // Merge the data
      results.forEach(result => {
        if (result.success && result.data) {
          Object.assign(integratedResult.data, result.data);
        }
      });

      // Handle errors
      const errors = results.filter(r => !r.success).map(r => r.error);
      if (errors.length > 0) {
        integratedResult.warnings = errors;
      }

      return {
        success: true,
        integratedResult,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a workflow
   */
  async createWorkflow(parameters, strategy) {
    try {
      const { name, steps, dependencies = [] } = parameters;

      if (!name || !steps) {
        throw new Error('Workflow name and steps are required');
      }

      const workflow = await this.workflowEngine.createWorkflow(name, steps, dependencies);

      return {
        success: true,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          steps: workflow.steps,
          status: workflow.status,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(parameters, strategy) {
    try {
      const { workflowId, parameters: workflowParams = {} } = parameters;

      if (!workflowId) {
        throw new Error('Workflow ID is required');
      }

      const result = await this.workflowEngine.executeWorkflow(workflowId, workflowParams);

      return {
        success: true,
        result: result,
        workflowId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get the workflow status
   */
  async getWorkflowStatus(parameters, strategy) {
    try {
      const { workflowId } = parameters;

      if (!workflowId) {
        throw new Error('Workflow ID is required');
      }

      const status = await this.workflowEngine.getWorkflowStatus(workflowId);

      return {
        success: true,
        status: status,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Assign tasks to agents
   */
  async assignTaskToAgent(parameters, strategy) {
    try {
      const { task, agentName, priority = 'normal' } = parameters;

      if (!task || !agentName) {
        throw new Error('Task and agent name are required');
      }

      // Fix: Use agents Map directly instead of non-existent getAgent()
      const agent = this.multiAgentSystem.agents.get(agentName) || this.multiAgentSystem.getAgent?.(agentName);
      if (!agent) {
        throw new Error(`Agent not found: ${agentName}`);
      }

      const result = await agent.executeFunction(task.type, task.parameters, {
        priority,
        timeout: task.timeout || 15000,
      });

      return {
        success: true,
        result: result,
        agent: agentName,
        task: task.type,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get the agent status
   */
  async getAgentStatus(parameters, strategy) {
    try {
      const { agentName } = parameters;

      if (!agentName) {
        throw new Error('Agent name is required');
      }

      // Fix: Use agents Map directly instead of non-existent getAgent()
      const agent = this.multiAgentSystem.agents.get(agentName) || this.multiAgentSystem.getAgent?.(agentName);
      if (!agent) {
        throw new Error(`Agent not found: ${agentName}`);
      }

      // Fix: Use getStatus() instead of non-existent healthCheck()
      const status = agent.getStatus();

      return {
        success: true,
        status: status,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Load balancing
   */
  async balanceLoad(parameters, strategy) {
    try {
      const { taskType } = parameters;

      // Fix: Use agents Map directly instead of non-existent getAllAgents()
      const agentStatuses = [];
      for (const [name, agent] of this.multiAgentSystem.agents) {
        // Fix: Use getStatus() instead of non-existent healthCheck()
        const status = agent.getStatus();
        agentStatuses.push({ name, status });
      }

      // Choose the agent with the lowest load
      const availableAgents = agentStatuses.filter(agent => agent.status.isActive);

      if (availableAgents.length === 0) {
        throw new Error('No available agents');
      }

      // Choose based on task type and agent capabilities
      const bestAgent = this.selectBestAgent(taskType, availableAgents);

      return {
        success: true,
        selectedAgent: bestAgent.name,
        reason: bestAgent.reason,
        alternatives: availableAgents.map(a => a.name),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle errors
   */
  async handleError(parameters, strategy) {
    try {
      const { error, context, retryCount = 0 } = parameters;

      if (!error) {
        throw new Error('Error details are required');
      }

      // Analyze the error type
      const errorAnalysis = this.analyzeError(error, context);

      // Choose a recovery strategy
      const recoveryStrategy = this.selectRecoveryStrategy(errorAnalysis, retryCount);

      // Perform the recovery
      const recoveryResult = await this.executeRecoveryStrategy(recoveryStrategy, context);

      return {
        success: true,
        errorAnalysis,
        recoveryStrategy: recoveryStrategy.type,
        recoveryResult,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Retry a failed task
   */
  async retryFailedTask(parameters, strategy) {
    try {
      const { task, maxRetries = 3, backoffDelay = 1000 } = parameters;

      if (!task) {
        throw new Error('Task is required');
      }

      let lastError = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await this.executeTask(task);
          return {
            success: true,
            result: result,
            attempts: attempt,
          };
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            await this.delay(backoffDelay * attempt);
          }
        }
      }

      throw lastError;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Fallback strategy
   */
  async fallbackStrategy(parameters, strategy) {
    try {
      const { primaryTask, fallbackTasks } = parameters;

      if (!primaryTask || !fallbackTasks) {
        throw new Error('Primary task and fallback tasks are required');
      }

      // Try the primary task
      try {
        const result = await this.executeTask(primaryTask);
        return {
          success: true,
          result: result,
          strategy: 'primary',
        };
      } catch (error) {
        // Try the fallback task
        for (const fallbackTask of fallbackTasks) {
          try {
            const result = await this.executeTask(fallbackTask);
            return {
              success: true,
              result: result,
              strategy: 'fallback',
              fallbackTask: fallbackTask.type,
            };
          } catch (fallbackError) {
            console.warn(`Fallback task failed: ${fallbackError.message}`);
          }
        }

        throw new Error('All tasks failed');
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Optimize execution
   */
  async optimizeExecution(parameters, strategy) {
    try {
      const { task, optimizationLevel = 'medium' } = parameters;

      if (!task) {
        throw new Error('Task is required');
      }

      // Fix: Wrap memorySystem calls in null checks
      let memoryContext = {};
      if (this.memorySystem) {
        try {
          memoryContext = (await this.memorySystem.retrieveMemoryContext(task.type, task.parameters, {})) || {};
        } catch (err) {
          console.warn('CoordinatorAgent: memorySystem.retrieveMemoryContext failed', err);
          memoryContext = {};
        }
      }

      let optimizedParameters = task.parameters;
      if (this.memorySystem && typeof this.memorySystem.optimizeParameters === 'function') {
        try {
          optimizedParameters = this.memorySystem.optimizeParameters(task.type, task.parameters, memoryContext);
        } catch (err) {
          console.warn('CoordinatorAgent: memorySystem.optimizeParameters failed', err);
          optimizedParameters = task.parameters;
        }
      }

      let executionPath = 'default';
      if (this.memorySystem && typeof this.memorySystem.selectExecutionPath === 'function') {
        try {
          executionPath = this.memorySystem.selectExecutionPath(task.type, optimizedParameters, memoryContext);
        } catch (err) {
          console.warn('CoordinatorAgent: memorySystem.selectExecutionPath failed', err);
          executionPath = 'default';
        }
      }

      return {
        success: true,
        optimization: {
          originalParameters: task.parameters,
          optimizedParameters,
          executionPath,
          optimizationLevel,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Caching strategy
   */
  async cacheStrategy(parameters, strategy) {
    try {
      const { task, cacheKey, ttl = 300000 } = parameters;

      if (!task || !cacheKey) {
        throw new Error('Task and cache key are required');
      }

      // Check the cache
      const cachedResult = this.getCachedResult(cacheKey);
      if (cachedResult) {
        return {
          success: true,
          result: cachedResult,
          source: 'cache',
        };
      }

      // Execute the task
      const result = await this.executeTask(task);

      // Cache the result
      this.cacheResult(cacheKey, result, ttl);

      return {
        success: true,
        result: result,
        source: 'execution',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Parallel execution
   */
  async parallelExecution(parameters, strategy) {
    try {
      const { tasks, maxConcurrency = 5 } = parameters;

      if (!tasks || !Array.isArray(tasks)) {
        throw new Error('Tasks array is required');
      }

      // Group the tasks
      const taskGroups = this.groupTasksForParallelExecution(tasks, maxConcurrency);

      // Execute in parallel
      const results = [];
      for (const group of taskGroups) {
        const groupResults = await Promise.allSettled(group.map(task => this.executeTask(task)));
        results.push(...groupResults);
      }

      // Process the results
      const successfulResults = results.filter(r => r.status === 'fulfilled').map(r => r.value);

      const failedResults = results.filter(r => r.status === 'rejected').map(r => r.reason);

      return {
        success: true,
        results: {
          successful: successfulResults,
          failed: failedResults,
          total: results.length,
          successRate: successfulResults.length / results.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Helper methods

  /**
   * Analyze a task
   */
  async analyzeTask(task) {
    return {
      type: task.type,
      complexity: this.assessComplexity(task),
      requirements: this.extractRequirements(task),
      estimatedTime: this.estimateExecutionTime(task),
    };
  }

  /**
   * Assess complexity
   */
  assessComplexity(task) {
    // Assess complexity based on task type and parameters
    const complexityFactors = {
      dataSize: task.parameters?.dataSize || 1,
      operationCount: task.parameters?.operationCount || 1,
      externalCalls: task.type.includes('external') ? 2 : 1,
    };

    return Object.values(complexityFactors).reduce((sum, factor) => sum + factor, 0);
  }

  /**
   * Extract requirements
   */
  extractRequirements(task) {
    return {
      agents: this.getRequiredAgents(task),
      resources: this.getRequiredResources(task),
      permissions: this.getRequiredPermissions(task),
    };
  }

  /**
   * Estimate the execution time
   */
  estimateExecutionTime(task) {
    const baseTime = 1000; // base time 1 second
    const complexity = this.assessComplexity(task);
    return baseTime * complexity;
  }

  /**
   * Get the dependencies
   */
  getDependencies(subtask, allSubtasks, currentIndex) {
    const dependencies = [];

    // Determine dependencies based on the task type
    if (subtask.type === 'result_processing') {
      dependencies.push('data_retrieval');
    } else if (subtask.type === 'result_integration') {
      dependencies.push('execution');
    }

    return dependencies;
  }

  /**
   * Assign subtasks to agents
   */
  async assignSubtasksToAgents(subtasks) {
    const assignments = [];

    for (const subtask of subtasks) {
      const agentName = subtask.agent === 'auto' ? await this.selectBestAgent(subtask.type) : subtask.agent;

      assignments.push({
        subtask,
        agent: agentName,
        priority: subtask.priority,
      });
    }

    return assignments;
  }

  /**
   * Execute a subtask
   */
  async executeSubtasks(assignments, timeout) {
    const results = [];

    for (const assignment of assignments) {
      try {
        const result = await Promise.race([
          this.assignTaskToAgent({
            task: assignment.subtask,
            agentName: assignment.agent,
            priority: assignment.priority,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
        ]);

        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          subtask: assignment.subtask.type,
          agent: assignment.agent,
        });
      }
    }

    return results;
  }

  /**
   * Select the best agent
   */
  selectBestAgent(taskType, availableAgents) {
    // Select the best agent based on task type and agent capabilities
    const agentCapabilities = {
      data_retrieval: ['DataAgent'],
      sequence_processing: ['AnalysisAgent'],
      api_call: ['ExternalAgent'],
      plugin_execution: ['PluginAgent'],
      navigation: ['NavigationAgent'],
    };

    const preferredAgents = agentCapabilities[taskType] || ['CoordinatorAgent'];

    for (const preferredAgent of preferredAgents) {
      const agent = availableAgents.find(a => a.name === preferredAgent);
      if (agent) {
        return { name: agent.name, reason: `Preferred agent for ${taskType}` };
      }
    }

    // If there's no preferred agent, choose the one with the lowest load
    const leastLoadedAgent = availableAgents.reduce((min, agent) =>
      (agent.status.performanceStats?.totalExecutions || 0) < (min.status.performanceStats?.totalExecutions || 0)
        ? agent
        : min
    );

    return { name: leastLoadedAgent.name, reason: 'Least loaded agent' };
  }

  /**
   * Analyze an error
   */
  analyzeError(error, context) {
    return {
      type: this.classifyError(error),
      severity: this.assessErrorSeverity(error),
      recoverable: this.isErrorRecoverable(error),
      context: context,
    };
  }

  /**
   * Choose a recovery strategy
   */
  selectRecoveryStrategy(errorAnalysis, retryCount) {
    if (retryCount >= 3) {
      return { type: 'fallback', action: 'use_alternative_method' };
    }

    if (errorAnalysis.recoverable) {
      return { type: 'retry', action: 'retry_with_backoff' };
    }

    return { type: 'fallback', action: 'use_alternative_method' };
  }

  /**
   * Execute a recovery strategy
   */
  async executeRecoveryStrategy(strategy, context) {
    switch (strategy.type) {
      case 'retry':
        return await this.retryFailedTask({ task: context.task, maxRetries: 1 });
      case 'fallback':
        return await this.fallbackStrategy({
          primaryTask: context.task,
          fallbackTasks: context.fallbackTasks,
        });
      default:
        throw new Error(`Unknown recovery strategy: ${strategy.type}`);
    }
  }

  /**
   * Execute a task
   */
  async executeTask(task) {
    // Fix: Use agents Map directly with fallback to getAgent()
    const agent = this.multiAgentSystem.agents.get(task.agent) || this.multiAgentSystem.getAgent?.(task.agent);
    if (!agent) {
      throw new Error(`Agent not found: ${task.agent}`);
    }

    return await agent.executeFunction(task.type, task.parameters, {});
  }

  /**
   * Group tasks for parallel execution
   */
  groupTasksForParallelExecution(tasks, maxConcurrency) {
    const groups = [];
    for (let i = 0; i < tasks.length; i += maxConcurrency) {
      groups.push(tasks.slice(i, i + maxConcurrency));
    }
    return groups;
  }

  /**
   * Delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Classify an error
   */
  classifyError(error) {
    if (error.message.includes('timeout')) return 'timeout';
    if (error.message.includes('network')) return 'network';
    if (error.message.includes('permission')) return 'permission';
    if (error.message.includes('not found')) return 'not_found';
    return 'unknown';
  }

  /**
   * Assess error severity
   */
  assessErrorSeverity(error) {
    if (error.message.includes('critical')) return 'critical';
    if (error.message.includes('fatal')) return 'critical';
    if (error.message.includes('timeout')) return 'medium';
    return 'low';
  }

  /**
   * Check whether an error is recoverable
   */
  isErrorRecoverable(error) {
    const nonRecoverableErrors = ['permission', 'not_found', 'invalid_parameter'];
    const errorType = this.classifyError(error);
    return !nonRecoverableErrors.includes(errorType);
  }

  /**
   * Get a cached result
   */
  getCachedResult(cacheKey) {
    // Simple cache implementation using the agent's learning data
    const cached = this.learningData.get(`cache_${cacheKey}`);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.result;
    }
    return null;
  }

  /**
   * Cache a result
   */
  cacheResult(cacheKey, result, ttl) {
    this.learningData.set(`cache_${cacheKey}`, {
      result,
      timestamp: Date.now(),
      ttl,
    });
  }
}

/**
 * Workflow engine
 */
class WorkflowEngine {
  constructor(coordinatorAgent) {
    this.coordinatorAgent = coordinatorAgent;
    this.workflows = new Map();
    this.executions = new Map();
  }

  /**
   * Create a workflow
   */
  async createWorkflow(name, steps, dependencies) {
    const workflowId = `workflow_${Date.now()}`;
    const workflow = {
      id: workflowId,
      name,
      steps,
      dependencies,
      status: 'created',
      createdAt: Date.now(),
    };

    this.workflows.set(workflowId, workflow);
    return workflow;
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId, parameters) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = `exec_${Date.now()}`;
    const execution = {
      id: executionId,
      workflowId,
      status: 'running',
      startTime: Date.now(),
      results: [],
    };

    this.executions.set(executionId, execution);

    try {
      // Sort the steps by dependency
      const sortedSteps = this.topologicalSort(workflow.steps, workflow.dependencies);

      // Execute the steps
      for (const step of sortedSteps) {
        const result = await this.executeStep(step, parameters);
        execution.results.push(result);
      }

      execution.status = 'completed';
      execution.endTime = Date.now();

      return {
        success: true,
        results: execution.results,
        executionTime: execution.endTime - execution.startTime,
      };
    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      throw error;
    }
  }

  /**
   * Get the workflow status
   */
  async getWorkflowStatus(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    return {
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      steps: workflow.steps.length,
      createdAt: workflow.createdAt,
    };
  }

  /**
   * Execute a step - Fix: Route through ChatManager instead of recursive coordinatorAgent.executeFunction
   */
  async executeStep(step, parameters) {
    const stepParameters = { ...parameters, ...step.parameters };

    // Fix: Route through ChatManager to avoid recursive executeFunction -> performExecution loop
    const chatManager = this.coordinatorAgent.multiAgentSystem.chatManager;
    if (chatManager && typeof chatManager.executeToolByName === 'function') {
      try {
        return await chatManager.executeToolByName(step.type, stepParameters, { bypassAgent: true });
      } catch (error) {
        console.warn(`WorkflowEngine: ChatManager execution failed for step ${step.type}, trying agent system`);
      }
    }

    // Fallback: Find the appropriate agent in the multi-agent system
    for (const [, agent] of this.coordinatorAgent.multiAgentSystem.agents) {
      if (agent.canExecute(step.type, stepParameters).canExecute) {
        return await agent.executeFunction(step.type, stepParameters, {});
      }
    }

    throw new Error(`No agent can execute workflow step: ${step.type}`);
  }

  /**
   * Topological sort
   */
  topologicalSort(steps, dependencies) {
    // Simple topological-sort implementation
    const sorted = [];
    const visited = new Set();

    const visit = step => {
      if (visited.has(step.id)) return;
      visited.add(step.id);

      const stepDeps = dependencies.filter(d => d.to === step.id);
      for (const dep of stepDeps) {
        const depStep = steps.find(s => s.id === dep.from);
        if (depStep) visit(depStep);
      }

      sorted.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return sorted;
  }
}

// Export the agent
window.CoordinatorAgent = CoordinatorAgent;
window.WorkflowEngine = WorkflowEngine;
