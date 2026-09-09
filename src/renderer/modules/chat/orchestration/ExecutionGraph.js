const contractApi = typeof require === 'function' ? require('./ExecutionContracts.js') : globalThis;
const { EXECUTION_STATUS } = contractApi;
class ExecutionGraph {
  constructor(nodes = []) {
    this.nodes = new Map();
    nodes.forEach(node => this.addNode(node));
    this.validate();
  }
  addNode(node) {
    if (!node?.id) throw new Error('Execution graph node requires an id');
    if (this.nodes.has(node.id)) throw new Error(`Duplicate execution node: ${node.id}`);
    this.nodes.set(node.id, {
      status: EXECUTION_STATUS.PENDING,
      references: [],
      ...node,
      dependsOn: [...(node.dependsOn || [])],
    });
    return this.nodes.get(node.id);
  }
  getNode(id) {
    return this.nodes.get(id);
  }
  setStatus(id, status) {
    const node = this.getNode(id);
    if (!node) throw new Error(`Unknown execution node: ${id}`);
    node.status = status;
    return node;
  }
  validate() {
    for (const node of this.nodes.values()) {
      for (const dep of node.dependsOn) {
        if (!this.nodes.has(dep)) throw new Error(`Unknown dependency '${dep}' for node '${node.id}'`);
      }
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = id => {
      if (visiting.has(id)) throw new Error('Execution graph contains a cycle');
      if (visited.has(id)) return;
      visiting.add(id);
      this.nodes.get(id).dependsOn.forEach(visit);
      visiting.delete(id);
      visited.add(id);
    };
    this.nodes.forEach((_node, id) => visit(id));
    return true;
  }
  readyNodes() {
    return [...this.nodes.values()].filter(
      node =>
        node.status === EXECUTION_STATUS.PENDING &&
        node.dependsOn.every(id => this.nodes.get(id).status === EXECUTION_STATUS.SUCCEEDED)
    );
  }
  dependents(id) {
    return [...this.nodes.values()].filter(node => node.dependsOn.includes(id));
  }
  toArray() {
    return [...this.nodes.values()];
  }
}
if (typeof globalThis !== 'undefined') globalThis.ExecutionGraph = ExecutionGraph;
if (typeof window !== 'undefined') window.ExecutionGraph = ExecutionGraph;
if (typeof module !== 'undefined' && module.exports) module.exports = ExecutionGraph;
