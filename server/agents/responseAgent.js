import { getDb } from '../db/init.js';
import llmService from '../services/llm.js';
import orchestrator from './orchestrator.js';

/**
 * Response Classifier Agent - Analyzes prospect email replies to determine intent
 */
class ResponseAgent {
  constructor() {
    this.name = 'response_classifier';
  }

  /**
   * Execute response classification for a prospect
   */
  async execute(prospectId, payload = {}) {
    const db = getDb();
    
    // Get prospect
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    if (!prospect) {
      throw new Error(`Prospect ${prospectId} not found`);
    }

    const { responseText, subject, from } = payload;

    if (!responseText) {
      throw new Error('No response text provided for classification');
    }

    // Get conversation history (previous emails)
    const previousCampaigns = db.prepare(`
      SELECT subject, body, sent_at FROM campaigns 
      WHERE prospect_id = ? AND status IN ('sent', 'delivered')
      ORDER BY sent_at ASC
    `).all(prospectId);

    const conversationHistory = previousCampaigns.map(c => 
      `Sent on ${c.sent_at}: Subject: "${c.subject}"\n${c.body}`
    );

    // Check if auto_classify is enabled
    const autoClassify = orchestrator.getConfig('auto_classify', 'true');
    if (autoClassify !== 'true') {
      // Store for manual review
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'response_pending_review', ?)
      `).run(prospectId, `Reply pending manual review: "${subject}"`);

      return { 
        classification: 'PENDING_REVIEW',
        message: 'Auto-classify disabled, awaiting manual review'
      };
    }

    // Use LLM to classify the response
    const classification = await llmService.classifyResponse({
      responseText,
      prospect,
      conversationHistory,
    });

    // Log the classification
    db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, 'response_classified', ?)
    `).run(
      prospectId, 
      `Response classified as ${classification.classification} (${classification.confidence}% confidence): ${classification.summary}`
    );

    // Take action based on classification
    await this.handleClassification(prospect, classification, responseText);

    return classification;
  }

  /**
   * Handle the classification result and trigger appropriate actions
   */
  async handleClassification(prospect, classification, responseText) {
    const db = getDb();
    
    switch (classification.classification) {
      case 'INTERESTED':
        // Move to responded stage, notify user
        this.updateProspectStage(prospect, 'responded');
        this.createNotification(prospect, {
          type: 'interested',
          title: `${prospect.business_name} is interested!`,
          message: classification.summary,
        });
        
        // Queue stage manager to potentially move to meeting
        orchestrator.queueTask({
          agentType: 'stage_manager',
          prospectId: prospect.id,
          payload: { 
            classification,
            suggestedStage: 'responded',
          },
        });
        break;

      case 'MEETING_REQUEST':
        // This is a hot lead! Move to meeting_scheduled and alert user
        this.updateProspectStage(prospect, 'meeting_scheduled');
        this.createNotification(prospect, {
          type: 'meeting_request',
          title: `🎯 ${prospect.business_name} wants to meet!`,
          message: `They requested a meeting: "${classification.summary}"`,
          priority: 'high',
        });

        // Pause all automation - human takes over
        db.prepare(`
          UPDATE prospects SET automation_enabled = 0 WHERE id = ?
        `).run(prospect.id);

        db.prepare(`
          UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
        `).run(prospect.id);
        break;

      case 'NOT_INTERESTED':
        // Move to lost, stop automation
        this.updateProspectStage(prospect, 'lost');
        
        db.prepare(`
          UPDATE prospects SET automation_enabled = 0 WHERE id = ?
        `).run(prospect.id);

        db.prepare(`
          UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
        `).run(prospect.id);

        this.createNotification(prospect, {
          type: 'not_interested',
          title: `${prospect.business_name} declined`,
          message: classification.summary,
        });
        break;

      case 'QUESTION':
        // They have questions - flag for human review but keep in pipeline
        this.updateProspectStage(prospect, 'responded');
        this.createNotification(prospect, {
          type: 'question',
          title: `${prospect.business_name} has a question`,
          message: classification.summary,
        });

        // Pause automation until human responds
        db.prepare(`
          UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
        `).run(prospect.id);
        break;

      case 'OUT_OF_OFFICE':
        // Delay follow-up, don't change stage
        const nextFollowUp = new Date();
        nextFollowUp.setDate(nextFollowUp.getDate() + 5); // Try again in 5 days

        db.prepare(`
          UPDATE follow_up_sequences 
          SET next_send_at = ?, is_paused = 0
          WHERE prospect_id = ?
        `).run(nextFollowUp.toISOString(), prospect.id);

        db.prepare(`
          INSERT INTO activities (prospect_id, type, description)
          VALUES (?, 'auto_reply_detected', 'Out of office detected, follow-up rescheduled')
        `).run(prospect.id);
        break;

      case 'UNCLEAR':
      default:
        // Flag for manual review
        this.createNotification(prospect, {
          type: 'review_needed',
          title: `Review needed: ${prospect.business_name}`,
          message: `Response couldn't be classified: ${classification.summary}`,
        });

        // Pause automation until reviewed
        db.prepare(`
          UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
        `).run(prospect.id);
        break;
    }
  }

  /**
   * Update prospect stage with activity logging
   */
  updateProspectStage(prospect, newStage) {
    if (prospect.stage === newStage) return;

    const db = getDb();
    
    db.prepare(`
      UPDATE prospects SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(newStage, prospect.id);

    db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, 'stage_change', ?)
    `).run(prospect.id, `Stage changed from "${prospect.stage}" to "${newStage}" by Response Agent`);
  }

  /**
   * Create a notification for the user
   */
  createNotification(prospect, { type, title, message, priority = 'normal' }) {
    const db = getDb();
    
    db.prepare(`
      INSERT INTO notifications (type, title, message, prospect_id, action_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(type, title, message, prospect.id, `/prospect/${prospect.id}`);
  }
}

// Create and register the agent
const responseAgent = new ResponseAgent();

export default responseAgent;

