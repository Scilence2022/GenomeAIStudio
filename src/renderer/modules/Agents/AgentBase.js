/**
 * AgentBase - Base class for all agents in the multi-agent system
 * Provides common interfaces, event handling, and resource management
 */
class AgentBase {
  constructor(multiAgentSystem, name, capabilities = []) {
    this.multiAgentSystem = multiAgentSystem;
    this.name = name;
    this.capabilities = capabilities;

    // Event system
    this.eventTarget = new EventTarget();
    this.eventHandlers = new Map();

    // State management
    this.isActive = false;
    this.currentTasks = new Map();
    this.taskQueue = [];

    // Resource management
    this.resourceUsage = {
      cpu: 0,
      memory: 0,
      network: 0,
      cache: 0,
    };

    // Performance tracking
    this.performanceMetrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0,
    };

    // Learning and optimization
    this.learningData = new Map();
    this.optimizationRules = new Map();

    // Tool mapping for function execution
    this.toolMapping = new Map();

    console.log(`🤖 Agent ${name} initialized with ${capabilities.length} capabilities`);
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    try {
      this.isActive = true;
      this.setupEventHandlers();
      this.loadOptimizationRules();

      // Initialize tool mapping if method exists
      if (typeof this.registerToolMapping === 'function') {
        this.registerToolMapping();
      }

      // Perform specific initialization if method exists
      if (typeof this.performInitialization === 'function') {
        await this.performInitialization();
      }

      console.log(`✅ Agent ${this.name} initialized successfully`);
      this.emit('agent-initialized', { agent: this.name });
    } catch (error) {
      console.error(`❌ Agent ${this.name} initialization failed:`, error);
      throw error;
    }
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Check if agent can execute a function
   */
  canExecute(functionName, parameters) {
    // Check if function is in tool mapping
    if (this.toolMapping.has(functionName)) {
      const resourceCheck = this.checkResourceAvailability(functionName, parameters);
      if (!resourceCheck.available) {
        return { canExecute: false, reason: `Insufficient resources: ${resourceCheck.reason}` };
      }

      return {
        canExecute: true,
        capability: { functionName, type: 'tool_mapping' },
        estimatedTime: 2000,
        priority: 'normal',
      };
    }

    // Check capabilities
    const capability = this.capabilities.find(
      cap => cap.functionName === functionName || (cap.pattern && cap.pattern.test(functionName))
    );

    if (!capability) {
      return { canExecute: false, reason: 'Function not supported' };
    }

    // Check parameter validation
    if (capability.validateParameters) {
      try {
        capability.validateParameters(parameters);
      } catch (error) {
        return { canExecute: false, reason: `Parameter validation failed: ${error.message}` };
      }
    }

    // Check resource availability
    const resourceCheck = this.checkResourceAvailability(functionName, parameters);
    if (!resourceCheck.available) {
      return { canExecute: false, reason: `Insufficient resources: ${resourceCheck.reason}` };
    }

    return {
      canExecute: true,
      capability,
      estimatedTime: capability.estimatedTime || 1000,
      priority: capability.priority || 'normal',
    };
  }

  /**
   * Execute a function
   */
  async executeFunction(functionName, parameters, context) {
    const startTime = performance.now();
    const taskId = this.generateTaskId();

    try {
      // Validate execution capability
      const capability = this.canExecute(functionName, parameters);
      if (!capability.canExecute) {
        throw new Error(capability.reason);
      }

      // Create task context
      const taskContext = {
        id: taskId,
        functionName,
        parameters,
        context: context || {},
        turnContext: context?.turnContext || context?.context || null,
        nodeId: context?.nodeId || null,
        source: context?.source || null,
        scope: context?.scope || null,
        startTime,
        capability,
      };

      // Add to current tasks
      this.currentTasks.set(taskId, taskContext);

      // Execute the function
      const result = await this.performExecution(functionName, parameters, taskContext);

      // Update performance metrics
      const executionTime = performance.now() - startTime;
      this.updatePerformanceMetrics(functionName, executionTime, true);

      // Remove from current tasks
      this.currentTasks.delete(taskId);

      // Emit completion event
      this.emit('task-completed', {
        taskId,
        functionName,
        parameters,
        result,
        executionTime,
        success: true,
      });

      return result;
    } catch (error) {
      // Handle execution failure
      const executionTime = performance.now() - startTime;
      this.updatePerformanceMetrics(functionName, executionTime, false);

      // Remove from current tasks
      this.currentTasks.delete(taskId);

      // Emit failure event
      this.emit('task-failed', {
        taskId,
        functionName,
        parameters,
        error: error.message,
        executionTime,
        success: false,
      });

      throw error;
    }
  }

  /**
   * Perform the actual function execution
   */
  async performExecution(functionName, parameters, context) {
    // Check if function is mapped to a tool
    if (this.toolMapping.has(functionName)) {
      const toolFunction = this.toolMapping.get(functionName);
      return await toolFunction(parameters, context);
    }

    // Fallback to subclass implementation
    if (typeof this.executeFunction === 'function') {
      return await this.executeFunction(functionName, parameters, context);
    }

    throw new Error(`Function ${functionName} not implemented for agent ${this.name}`);
  }

  /**
   * Check resource availability
   */
  checkResourceAvailability(functionName, parameters) {
    // Default resource requirements
    const requirements = {
      cpu: 10,
      memory: 50,
      network: 0,
      cache: 10,
    };

    // Adjust based on function type
    if (functionName.includes('blast')) {
      requirements.network = 30;
      requirements.cpu = 20;
    }

    if (functionName.includes('analyze') || functionName.includes('compute')) {
      requirements.cpu = 30;
      requirements.memory = 100;
    }

    // Check against current usage
    const available = this.multiAgentSystem.resourceManager;
    const currentUsage = this.resourceUsage;

    // Add null checks for resource manager properties
    if (!available || !available.cpu || !available.memory || !available.network || !available.cache) {
      console.warn('ResourceManager not properly initialized, allowing execution');
      return { available: true, reason: 'Resource checking disabled' };
    }

    if (currentUsage.cpu + requirements.cpu > available.cpu.available) {
      return { available: false, reason: 'Insufficient CPU' };
    }

    if (currentUsage.memory + requirements.memory > available.memory.available) {
      return { available: false, reason: 'Insufficient memory' };
    }

    if (currentUsage.network + requirements.network > available.network.available) {
      return { available: false, reason: 'Insufficient network bandwidth' };
    }

    return { available: true, requirements };
  }

  /**
   * Get current resource availability score
   */
  getResourceAvailability() {
    const available = this.multiAgentSystem.resourceManager;
    const currentUsage = this.resourceUsage;

    const cpuScore = Math.max(0, (available.cpu.available - currentUsage.cpu) / available.cpu.available);
    const memoryScore = Math.max(0, (available.memory.available - currentUsage.memory) / available.memory.available);
    const networkScore = Math.max(
      0,
      (available.network.available - currentUsage.network) / available.network.available
    );

    return (cpuScore + memoryScore + networkScore) / 3;
  }

  /**
   * Get current resource usage
   */
  getResourceUsage() {
    return { ...this.resourceUsage };
  }

  /**
   * Handle resource allocation
   */
  onResourceAllocated(resourceType, amount) {
    this.resourceUsage[resourceType] += amount;
    console.log(`📊 Agent ${this.name} allocated ${amount} ${resourceType}`);
  }

  /**
   * Handle resource denial
   */
  onResourceDenied(resourceType, amount) {
    console.log(`❌ Agent ${this.name} denied ${amount} ${resourceType}`);
    // Could implement retry logic or fallback here
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(functionName, executionTime, success) {
    this.performanceMetrics.totalExecutions++;
    this.performanceMetrics.totalExecutionTime += executionTime;
    this.performanceMetrics.averageExecutionTime =
      this.performanceMetrics.totalExecutionTime / this.performanceMetrics.totalExecutions;

    if (success) {
      this.performanceMetrics.successfulExecutions++;
    } else {
      this.performanceMetrics.failedExecutions++;
    }

    // Update learning data
    this.updateLearningData(functionName, executionTime, success);
  }

  /**
   * Update learning data for optimization
   */
  updateLearningData(functionName, executionTime, success) {
    const key = functionName;
    const learning = this.learningData.get(key) || {
      executions: 0,
      totalTime: 0,
      averageTime: 0,
      successCount: 0,
      successRate: 0,
      patterns: [],
    };

    learning.executions++;
    learning.totalTime += executionTime;
    learning.averageTime = learning.totalTime / learning.executions;

    if (success) {
      learning.successCount++;
    }
    learning.successRate = learning.successCount / learning.executions;

    // Keep recent patterns
    learning.patterns.push({
      timestamp: Date.now(),
      executionTime,
      success,
    });

    if (learning.patterns.length > 50) {
      learning.patterns = learning.patterns.slice(-50);
    }

    this.learningData.set(key, learning);
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Handle task completion
    this.on('task-completed', data => {
      this.handleTaskCompleted(data);
    });

    // Handle task failure
    this.on('task-failed', data => {
      this.handleTaskFailed(data);
    });

    // Handle resource updates
    this.on('resource-update', data => {
      this.handleResourceUpdate(data);
    });
  }

  /**
   * Handle task completion
   */
  handleTaskCompleted(data) {
    // Release resources
    this.releaseResources(data.functionName);

    // Apply optimization rules
    this.applyOptimizationRules(data);

    console.log(`✅ Agent ${this.name} completed task: ${data.functionName}`);
  }

  /**
   * Handle task failure
   */
  handleTaskFailed(data) {
    // Release resources
    this.releaseResources(data.functionName);

    // Update failure patterns
    this.updateFailurePatterns(data);

    console.error(`❌ Agent ${this.name} failed task: ${data.functionName}`, data.error);
  }

  /**
   * Handle resource updates
   */
  handleResourceUpdate(data) {
    // Adjust resource usage based on system state
    const systemUsage = data.allocated;
    const totalAvailable = {
      cpu: data.cpu.available,
      memory: data.memory.available,
      network: data.network.available,
      cache: data.cache.available,
    };

    // Scale down if system is under pressure
    if (systemUsage.cpu / totalAvailable.cpu > 0.8) {
      this.scaleDownResourceUsage('cpu');
    }

    if (systemUsage.memory / totalAvailable.memory > 0.8) {
      this.scaleDownResourceUsage('memory');
    }
  }

  /**
   * Release resources after task completion
   */
  releaseResources(functionName) {
    // Default resource release
    const release = {
      cpu: 10,
      memory: 50,
      network: 0,
      cache: 10,
    };

    // Adjust based on function type
    if (functionName.includes('blast')) {
      release.network = 30;
      release.cpu = 20;
    }

    if (functionName.includes('analyze') || functionName.includes('compute')) {
      release.cpu = 30;
      release.memory = 100;
    }

    // Release resources
    for (const [resourceType, amount] of Object.entries(release)) {
      this.resourceUsage[resourceType] = Math.max(0, this.resourceUsage[resourceType] - amount);
    }

    // Notify system of resource availability
    this.multiAgentSystem.eventBus.dispatchEvent(
      new CustomEvent('resource-available', {
        detail: { resourceType: 'mixed', amount: release },
      })
    );
  }

  /**
   * Scale down resource usage under pressure
   */
  scaleDownResourceUsage(resourceType) {
    const scaleFactor = 0.8;
    this.resourceUsage[resourceType] *= scaleFactor;

    console.log(`📉 Agent ${this.name} scaled down ${resourceType} usage`);
  }

  /**
   * Load optimization rules
   */
  loadOptimizationRules() {
    // Performance optimization rules
    this.optimizationRules.set('performance', [
      {
        condition: data => data.executionTime > 5000,
        action: data => {
          console.log(`🚀 Agent ${this.name} optimizing slow function: ${data.functionName}`);
          // Could implement caching, parallelization, etc.
        },
      },
      {
        condition: data => data.success === false,
        action: data => {
          console.log(`🔄 Agent ${this.name} handling failed function: ${data.functionName}`);
          // Could implement retry logic, fallback strategies, etc.
        },
      },
    ]);
  }

  /**
   * Apply optimization rules
   */
  applyOptimizationRules(data) {
    for (const [, rules] of this.optimizationRules) {
      for (const rule of rules) {
        if (rule.condition(data)) {
          rule.action(data);
        }
      }
    }
  }

  /**
   * Update failure patterns for learning
   */
  updateFailurePatterns(data) {
    const key = `${data.functionName}_failures`;
    const failures = this.learningData.get(key) || {
      count: 0,
      patterns: [],
      lastFailure: null,
    };

    failures.count++;
    failures.lastFailure = Date.now();
    failures.patterns.push({
      timestamp: Date.now(),
      error: data.error,
      parameters: data.parameters,
    });

    // Keep only recent failures
    if (failures.patterns.length > 20) {
      failures.patterns = failures.patterns.slice(-20);
    }

    this.learningData.set(key, failures);
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      name: this.name,
      isActive: this.isActive,
      currentTasks: this.currentTasks.size,
      taskQueue: this.taskQueue.length,
      resourceUsage: this.resourceUsage,
      performanceMetrics: this.performanceMetrics,
      capabilities: this.capabilities.length,
    };
  }

  /**
   * Get agent statistics
   */
  getStatistics() {
    return {
      ...this.performanceMetrics,
      resourceUsage: this.resourceUsage,
      learningDataSize: this.learningData.size,
      optimizationRulesCount: this.optimizationRules.size,
    };
  }

  /**
   * Event handling methods
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  off(eventType, handler) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

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

    // Emit to multi-agent system
    this.multiAgentSystem.eventBus.dispatchEvent(
      new CustomEvent(eventType, {
        detail: { agent: this.name, ...data },
      })
    );
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown the agent
   */
  async shutdown() {
    console.log(`🔄 Shutting down agent ${this.name}...`);

    this.isActive = false;

    // Complete current tasks
    for (const [taskId] of this.currentTasks) {
      console.log(`⏳ Completing task ${taskId} before shutdown`);
      // Could implement graceful shutdown logic here
    }

    // Clear data
    this.currentTasks.clear();
    this.taskQueue = [];
    this.eventHandlers.clear();

    console.log(`✅ Agent ${this.name} shutdown complete`);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AgentBase;
}

// Also make it globally available for browser usage
if (typeof window !== 'undefined') {
  window.AgentBase = AgentBase;
}
