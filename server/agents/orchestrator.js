import { getDb } from '../db/init.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Agent Orchestrator - Coordinates all AI agents and manages task queue
 */
class AgentOrchestrator {
  constructor() {
    this.agents = new Map();
    this.isRunning = false;
  }

  /**
   * Register an agent with the orchestrator
   */
  registerAgent(name, agent) {
    this.agents.set(name, agent);
    console.log(`🤖 Agent registered: ${name}`);
  }

  /**
   * Get a registered agent by name
   */
  getAgent(name) {
    return this.agents.get(name);
  }

  /**
   * Queue a task for an agent
   */
  queueTask({ agentType, prospectId, payload = {}, scheduledFor = null }) {
    const db = getDb();
    
    const result = db.prepare(`
      INSERT INTO agent_tasks (agent_type, prospect_id, payload, scheduled_for, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(agentType, prospectId, JSON.stringify(payload), scheduledFor);

    console.log(`📋 Task queued: ${agentType} for prospect ${prospectId}`);
    return result.lastInsertRowid;
  }

  /**
   * Get pending tasks
   */
  getPendingTasks(limit = 10) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM agent_tasks 
      WHERE status = 'pending' 
        AND (scheduled_for IS NULL OR scheduled_for <= datetime('now'))
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status, limit = 50) {
    const db = getDb();
    return db.prepare(`
      SELECT t.*, p.business_name
      FROM agent_tasks t
      LEFT JOIN prospects p ON t.prospect_id = p.id
      WHERE t.status = ?
      ORDER BY t.created_at DESC
      LIMIT ?
    `).all(status, limit);
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId, status, result = null, error = null) {
    const db = getDb();
    db.prepare(`
      UPDATE agent_tasks 
      SET status = ?, result = ?, error = ?, 
          completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE NULL END,
          attempts = attempts + 1
      WHERE id = ?
    `).run(status, result ? JSON.stringify(result) : null, error, status, taskId);
  }

  /**
   * Process a single task
   */
  async processTask(task) {
    const agent = this.agents.get(task.agent_type);
    if (!agent) {
      console.error(`❌ No agent registered for type: ${task.agent_type}`);
      this.updateTaskStatus(task.id, 'failed', null, `No agent for type: ${task.agent_type}`);
      return;
    }

    this.updateTaskStatus(task.id, 'processing');

    try {
      const payload = task.payload ? JSON.parse(task.payload) : {};
      const result = await agent.execute(task.prospect_id, payload);
      this.updateTaskStatus(task.id, 'completed', result);
      console.log(`✅ Task completed: ${task.agent_type} for prospect ${task.prospect_id}`);
    } catch (error) {
      console.error(`❌ Task failed: ${task.agent_type}`, error);
      
      // Retry logic - max 3 attempts
      if (task.attempts < 3) {
        this.updateTaskStatus(task.id, 'pending', null, error.message);
      } else {
        this.updateTaskStatus(task.id, 'failed', null, error.message);
      }
    }
  }

  /**
   * Process all pending tasks
   */
  async processPendingTasks() {
    const tasks = this.getPendingTasks();
    
    for (const task of tasks) {
      await this.processTask(task);
    }
    
    return tasks.length;
  }

  /**
   * Get agent configuration
   */
  getConfig(key, defaultValue = null) {
    const db = getDb();
    const config = db.prepare('SELECT value FROM agent_config WHERE key = ?').get(key);
    return config ? config.value : defaultValue;
  }

  /**
   * Set agent configuration
   */
  setConfig(key, value) {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO agent_config (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(key, value);
  }

  /**
   * Get all configuration
   */
  getAllConfig() {
    const db = getDb();
    const configs = db.prepare('SELECT key, value FROM agent_config').all();
    const result = {};
    for (const config of configs) {
      result[config.key] = config.value;
    }
    return result;
  }

  /**
   * Check if automation is enabled for a prospect
   */
  isAutomationEnabled(prospectId) {
    const db = getDb();
    const prospect = db.prepare('SELECT automation_enabled FROM prospects WHERE id = ?').get(prospectId);
    return prospect?.automation_enabled === 1;
  }

  /**
   * Get agent stats
   */
  getStats() {
    const db = getDb();
    
    const taskStats = db.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM agent_tasks
      GROUP BY status
    `).all();

    const recentTasks = db.prepare(`
      SELECT t.*, p.business_name
      FROM agent_tasks t
      LEFT JOIN prospects p ON t.prospect_id = p.id
      ORDER BY t.created_at DESC
      LIMIT 20
    `).all();

    const tasksByAgent = db.prepare(`
      SELECT 
        agent_type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM agent_tasks
      GROUP BY agent_type
    `).all();

    return {
      taskStats: taskStats.reduce((acc, s) => ({ ...acc, [s.status]: s.count }), {}),
      tasksByAgent,
      recentTasks,
    };
  }
}

// Singleton instance
const orchestrator = new AgentOrchestrator();

export default orchestrator;

