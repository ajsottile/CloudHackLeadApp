import { getDb } from '../db/init.js';
import orchestrator from './orchestrator.js';

/**
 * Stage Manager Agent - Handles automatic pipeline stage transitions
 */
class StageAgent {
  constructor() {
    this.name = 'stage_manager';
    
    // Define valid stage transitions
    this.stageOrder = ['new', 'contacted', 'responded', 'meeting_scheduled', 'proposal_sent', 'won', 'lost'];
    
    this.validTransitions = {
      'new': ['contacted', 'lost'],
      'contacted': ['responded', 'lost'],
      'responded': ['meeting_scheduled', 'lost'],
      'meeting_scheduled': ['proposal_sent', 'won', 'lost'],
      'proposal_sent': ['won', 'lost'],
      'won': [],
      'lost': ['new'], // Can revive
    };
  }

  /**
   * Execute stage management for a prospect
   */
  async execute(prospectId, payload = {}) {
    const db = getDb();
    
    // Get prospect
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    if (!prospect) {
      throw new Error(`Prospect ${prospectId} not found`);
    }

    const { classification, suggestedStage, reason } = payload;

    // If a specific stage is suggested, validate and apply
    if (suggestedStage) {
      return this.transitionTo(prospect, suggestedStage, reason);
    }

    // If classification is provided, determine appropriate stage
    if (classification) {
      return this.handleClassification(prospect, classification);
    }

    // Otherwise, evaluate current state and determine if action needed
    return this.evaluateProspect(prospect);
  }

  /**
   * Transition prospect to a new stage
   */
  transitionTo(prospect, newStage, reason = null) {
    const db = getDb();
    
    // Validate transition
    if (!this.isValidTransition(prospect.stage, newStage)) {
      return {
        success: false,
        message: `Invalid transition from "${prospect.stage}" to "${newStage}"`,
      };
    }

    // Update stage
    db.prepare(`
      UPDATE prospects SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(newStage, prospect.id);

    const description = reason 
      ? `Stage changed from "${prospect.stage}" to "${newStage}" by Stage Agent: ${reason}`
      : `Stage changed from "${prospect.stage}" to "${newStage}" by Stage Agent`;

    db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, 'stage_change', ?)
    `).run(prospect.id, description);

    // Handle stage-specific side effects
    this.handleStageEffects(prospect, newStage);

    return {
      success: true,
      previousStage: prospect.stage,
      newStage,
      message: description,
    };
  }

  /**
   * Check if a stage transition is valid
   */
  isValidTransition(fromStage, toStage) {
    const validTargets = this.validTransitions[fromStage] || [];
    return validTargets.includes(toStage);
  }

  /**
   * Handle classification-based stage updates
   */
  handleClassification(prospect, classification) {
    const stageMap = {
      'INTERESTED': 'responded',
      'MEETING_REQUEST': 'meeting_scheduled',
      'NOT_INTERESTED': 'lost',
      'QUESTION': 'responded',
    };

    const suggestedStage = stageMap[classification.classification];
    
    if (!suggestedStage) {
      return {
        success: false,
        message: `No stage mapping for classification: ${classification.classification}`,
      };
    }

    // Only transition if it makes sense
    const currentIndex = this.stageOrder.indexOf(prospect.stage);
    const targetIndex = this.stageOrder.indexOf(suggestedStage);

    // Allow forward transitions or to lost
    if (suggestedStage === 'lost' || targetIndex > currentIndex) {
      return this.transitionTo(
        prospect, 
        suggestedStage, 
        `Response classified as ${classification.classification}`
      );
    }

    return {
      success: false,
      message: `Stage "${prospect.stage}" is already at or past "${suggestedStage}"`,
    };
  }

  /**
   * Evaluate a prospect and determine if stage change needed
   */
  evaluateProspect(prospect) {
    const db = getDb();
    
    // Get recent activity
    const recentActivities = db.prepare(`
      SELECT * FROM activities 
      WHERE prospect_id = ? 
      ORDER BY created_at DESC 
      LIMIT 10
    `).all(prospect.id);

    // Get campaign stats
    const campaigns = db.prepare(`
      SELECT * FROM campaigns 
      WHERE prospect_id = ? 
      ORDER BY sent_at DESC
    `).all(prospect.id);

    // Get email events
    const events = db.prepare(`
      SELECT * FROM email_events 
      WHERE prospect_id = ? 
      ORDER BY timestamp DESC
    `).all(prospect.id);

    // Decision logic based on current stage
    switch (prospect.stage) {
      case 'new':
        // If we've sent an email, should be contacted
        if (campaigns.some(c => c.status === 'sent' || c.status === 'delivered')) {
          return this.transitionTo(prospect, 'contacted', 'Email has been sent');
        }
        break;

      case 'contacted':
        // If we received a reply, should be responded
        if (events.some(e => e.event_type === 'reply')) {
          return this.transitionTo(prospect, 'responded', 'Reply received');
        }
        break;

      case 'responded':
        // Check if meeting was scheduled (would be manual or via classification)
        break;
    }

    return {
      success: true,
      message: 'No stage change needed',
      currentStage: prospect.stage,
    };
  }

  /**
   * Handle side effects when entering a stage
   */
  handleStageEffects(prospect, newStage) {
    const db = getDb();

    switch (newStage) {
      case 'contacted':
        // Ensure follow-up sequence exists
        const existingSequence = db.prepare(`
          SELECT id FROM follow_up_sequences WHERE prospect_id = ?
        `).get(prospect.id);

        if (!existingSequence) {
          const followUpDays = orchestrator.getConfig('follow_up_days', '3,7,14');
          const maxSteps = followUpDays.split(',').length;
          const daysBetween = parseInt(followUpDays.split(',')[0]) || 3;
          
          const nextSendAt = new Date();
          nextSendAt.setDate(nextSendAt.getDate() + daysBetween);

          db.prepare(`
            INSERT INTO follow_up_sequences 
            (prospect_id, sequence_step, max_steps, days_between, next_send_at)
            VALUES (?, 0, ?, ?, ?)
          `).run(prospect.id, maxSteps, daysBetween, nextSendAt.toISOString());
        }
        break;

      case 'responded':
        // Pause follow-ups when they respond
        db.prepare(`
          UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
        `).run(prospect.id);
        break;

      case 'meeting_scheduled':
        // Create high-priority notification
        db.prepare(`
          INSERT INTO notifications (type, title, message, prospect_id, action_url)
          VALUES ('meeting_scheduled', ?, ?, ?, ?)
        `).run(
          `Meeting scheduled with ${prospect.business_name}`,
          'Time to reach out and confirm the meeting details.',
          prospect.id,
          `/prospect/${prospect.id}`
        );

        // Stop all automation
        db.prepare(`
          UPDATE prospects SET automation_enabled = 0 WHERE id = ?
        `).run(prospect.id);
        break;

      case 'won':
        // Celebrate! Create notification
        db.prepare(`
          INSERT INTO notifications (type, title, message, prospect_id, action_url)
          VALUES ('deal_won', ?, ?, ?, ?)
        `).run(
          `🎉 Deal won: ${prospect.business_name}`,
          'Congratulations on closing the deal!',
          prospect.id,
          `/prospect/${prospect.id}`
        );
        break;

      case 'lost':
        // Stop automation, archive
        db.prepare(`
          UPDATE prospects SET automation_enabled = 0 WHERE id = ?
        `).run(prospect.id);
        
        db.prepare(`
          UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
        `).run(prospect.id);
        break;
    }
  }
}

// Create and register the agent
const stageAgent = new StageAgent();

export default stageAgent;

