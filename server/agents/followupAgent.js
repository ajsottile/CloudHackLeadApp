import { getDb } from '../db/init.js';
import llmService from '../services/llm.js';
import orchestrator from './orchestrator.js';
import emailService from '../services/email.js';

/**
 * Follow-up Agent - Sends automated follow-up emails to non-responsive prospects
 */
class FollowupAgent {
  constructor() {
    this.name = 'followup';
  }

  /**
   * Execute follow-up for a prospect
   */
  async execute(prospectId, payload = {}) {
    const db = getDb();
    
    // Get prospect
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    if (!prospect) {
      throw new Error(`Prospect ${prospectId} not found`);
    }

    // Check if automation is enabled
    if (!prospect.automation_enabled) {
      return { skipped: true, reason: 'Automation disabled for this prospect' };
    }

    // Check prospect stage - only follow up if in 'contacted' stage
    if (prospect.stage !== 'contacted') {
      return { skipped: true, reason: `Prospect stage is "${prospect.stage}", not "contacted"` };
    }

    // Get follow-up sequence
    const sequence = db.prepare(`
      SELECT * FROM follow_up_sequences WHERE prospect_id = ?
    `).get(prospectId);

    if (!sequence) {
      return { skipped: true, reason: 'No follow-up sequence found' };
    }

    if (sequence.is_paused) {
      return { skipped: true, reason: 'Follow-up sequence is paused' };
    }

    // Check if max follow-ups reached
    if (sequence.sequence_step >= sequence.max_steps) {
      // Move to lost if max follow-ups exceeded with no response
      db.prepare(`
        UPDATE prospects SET stage = 'lost', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(prospectId);

      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'stage_change', 'Moved to lost - max follow-ups reached with no response')
      `).run(prospectId);

      return { completed: true, reason: 'Max follow-ups reached, moved to lost' };
    }

    // Get previous emails
    const previousEmails = db.prepare(`
      SELECT subject, body, sent_at FROM campaigns 
      WHERE prospect_id = ? AND status IN ('sent', 'delivered')
      ORDER BY sent_at ASC
    `).all(prospectId);

    const followUpNumber = sequence.sequence_step + 1;

    // Generate follow-up email using AI
    const result = await llmService.generateFollowUp({
      prospect,
      previousEmails,
      followUpNumber,
    });

    const emailBody = result.text;

    // Generate subject line
    const emailSubject = await llmService.generateSubjectLine({
      prospect,
      emailBody,
    });

    // Create campaign record
    const campaignResult = db.prepare(`
      INSERT INTO campaigns (prospect_id, subject, body, status)
      VALUES (?, ?, ?, 'pending')
    `).run(prospectId, emailSubject, emailBody);

    const campaignId = campaignResult.lastInsertRowid;

    // Log activity
    db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, 'agent_action', ?)
    `).run(prospectId, `Follow-up Agent generated follow-up #${followUpNumber}: "${emailSubject}"`);

    // Send the email
    const sendResult = await this.sendEmail(prospect, emailSubject, emailBody, campaignId);

    // Update sequence
    if (sendResult.sent) {
      const followUpDays = orchestrator.getConfig('follow_up_days', '3,7,14');
      const daysArray = followUpDays.split(',').map(d => parseInt(d.trim()));
      const nextDays = daysArray[followUpNumber] || daysArray[daysArray.length - 1] || 7;

      const nextSendAt = new Date();
      nextSendAt.setDate(nextSendAt.getDate() + nextDays);

      db.prepare(`
        UPDATE follow_up_sequences 
        SET sequence_step = ?, last_sent_at = CURRENT_TIMESTAMP, next_send_at = ?
        WHERE prospect_id = ?
      `).run(followUpNumber, nextSendAt.toISOString(), prospectId);
    }

    return {
      campaignId,
      followUpNumber,
      subject: emailSubject,
      sent: sendResult.sent,
      error: sendResult.error,
    };
  }

  /**
   * Send the email via Resend
   */
  async sendEmail(prospect, subject, body, campaignId) {
    const db = getDb();

    // Check if we have an email address
    if (!prospect.email) {
      db.prepare(`
        UPDATE campaigns SET status = 'draft' WHERE id = ?
      `).run(campaignId);

      return { sent: false, error: 'No email address' };
    }

    // Check if email service is configured
    if (!emailService.isReady()) {
      db.prepare(`
        UPDATE campaigns SET status = 'draft' WHERE id = ?
      `).run(campaignId);

      return { sent: false, error: 'Email service not configured' };
    }

    try {
      const result = await emailService.send({
        to: prospect.email,
        subject: subject,
        text: body,
        tags: {
          campaign_id: campaignId,
          prospect_id: prospect.id,
        },
      });

      if (!result.success) {
        db.prepare(`
          UPDATE campaigns SET status = 'failed' WHERE id = ?
        `).run(campaignId);
        return { sent: false, error: result.error };
      }

      // Update campaign status
      db.prepare(`
        UPDATE campaigns SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(campaignId);

      // Log activity
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'email_sent', ?)
      `).run(prospect.id, `Follow-up Agent sent email: "${subject}"`);

      return { sent: true, messageId: result.id };
    } catch (error) {
      console.error('Email send error:', error);

      db.prepare(`
        UPDATE campaigns SET status = 'failed' WHERE id = ?
      `).run(campaignId);

      return { sent: false, error: error.message };
    }
  }

  /**
   * Get all prospects due for follow-up
   */
  static getDueFollowUps() {
    const db = getDb();
    
    return db.prepare(`
      SELECT f.*, p.business_name, p.email, p.stage, p.automation_enabled
      FROM follow_up_sequences f
      JOIN prospects p ON f.prospect_id = p.id
      WHERE f.is_paused = 0 
        AND f.next_send_at <= datetime('now')
        AND f.sequence_step < f.max_steps
        AND p.automation_enabled = 1
        AND p.stage = 'contacted'
    `).all();
  }
}

// Create and register the agent
const followupAgent = new FollowupAgent();

export default followupAgent;
export { FollowupAgent };

