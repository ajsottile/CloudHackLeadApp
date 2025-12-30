import cron from 'node-cron';
import orchestrator from '../agents/orchestrator.js';
import outreachAgent from '../agents/outreachAgent.js';
import followupAgent, { FollowupAgent } from '../agents/followupAgent.js';
import responseAgent from '../agents/responseAgent.js';
import stageAgent from '../agents/stageAgent.js';

/**
 * Job Scheduler - Manages background tasks and agent execution
 */
class Scheduler {
  constructor() {
    this.jobs = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the scheduler and register agents
   */
  initialize() {
    if (this.isInitialized) return;

    // Register all agents with the orchestrator
    orchestrator.registerAgent('outreach', outreachAgent);
    orchestrator.registerAgent('followup', followupAgent);
    orchestrator.registerAgent('response_classifier', responseAgent);
    orchestrator.registerAgent('stage_manager', stageAgent);

    console.log('📅 Scheduler initialized');
    this.isInitialized = true;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    this.initialize();

    // Process pending agent tasks every minute
    this.scheduleJob('* * * * *', 'Process Agent Tasks', async () => {
      try {
        const processed = await orchestrator.processPendingTasks();
        if (processed > 0) {
          console.log(`⚡ Processed ${processed} agent tasks`);
        }
      } catch (error) {
        console.error('Error processing agent tasks:', error);
      }
    });

    // Check for follow-ups every 5 minutes
    this.scheduleJob('*/5 * * * *', 'Follow-up Check', async () => {
      try {
        const dueFollowUps = FollowupAgent.getDueFollowUps();
        
        for (const followUp of dueFollowUps) {
          orchestrator.queueTask({
            agentType: 'followup',
            prospectId: followUp.prospect_id,
            payload: { sequenceId: followUp.id },
          });
        }

        if (dueFollowUps.length > 0) {
          console.log(`📬 Queued ${dueFollowUps.length} follow-up tasks`);
        }
      } catch (error) {
        console.error('Error checking follow-ups:', error);
      }
    });

    // Clean up old completed tasks daily at 3 AM
    this.scheduleJob('0 3 * * *', 'Cleanup Old Tasks', async () => {
      try {
        const { getDb } = await import('../db/init.js');
        const db = getDb();
        
        // Delete completed tasks older than 30 days
        const result = db.prepare(`
          DELETE FROM agent_tasks 
          WHERE status IN ('completed', 'failed') 
          AND completed_at < datetime('now', '-30 days')
        `).run();

        if (result.changes > 0) {
          console.log(`🧹 Cleaned up ${result.changes} old agent tasks`);
        }
      } catch (error) {
        console.error('Error cleaning up tasks:', error);
      }
    });

    // Health check every hour
    this.scheduleJob('0 * * * *', 'Health Check', async () => {
      const stats = orchestrator.getStats();
      console.log(`💚 Agent Health: ${JSON.stringify(stats.taskStats)}`);
    });

    console.log('🚀 Scheduler started with', this.jobs.length, 'jobs');
  }

  /**
   * Schedule a cron job
   */
  scheduleJob(cronExpression, name, handler) {
    const job = cron.schedule(cronExpression, async () => {
      try {
        await handler();
      } catch (error) {
        console.error(`Job "${name}" failed:`, error);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York', // Adjust to your timezone
    });

    this.jobs.push({ name, job, cronExpression });
    console.log(`  📌 Scheduled: ${name} (${cronExpression})`);
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    for (const { job, name } of this.jobs) {
      job.stop();
      console.log(`  ⏹️ Stopped: ${name}`);
    }
    console.log('⏹️ Scheduler stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return this.jobs.map(({ name, cronExpression }) => ({
      name,
      cronExpression,
      running: true,
    }));
  }

  /**
   * Manually trigger a specific agent for a prospect
   */
  async triggerAgent(agentType, prospectId, payload = {}) {
    return orchestrator.queueTask({
      agentType,
      prospectId,
      payload,
    });
  }

  /**
   * Process tasks immediately (for testing)
   */
  async processNow() {
    return orchestrator.processPendingTasks();
  }
}

// Singleton instance
const scheduler = new Scheduler();

export default scheduler;

