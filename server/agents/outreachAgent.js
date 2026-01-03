import { getDb } from '../db/init.js';
import llmService from '../services/llm.js';
import orchestrator from './orchestrator.js';
import emailService from '../services/email.js';
import firecrawlService from '../services/firecrawl.js';

/**
 * Outreach Agent - Generates and sends initial outreach emails to prospects
 */
class OutreachAgent {
  constructor() {
    this.name = 'outreach';
  }

  /**
   * Execute outreach for a prospect
   */
  async execute(prospectId, payload = {}) {
    const db = getDb();
    
    // Get prospect
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    if (!prospect) {
      throw new Error(`Prospect ${prospectId} not found`);
    }

    // Check if automation is enabled for this prospect
    if (!prospect.automation_enabled) {
      return { skipped: true, reason: 'Automation disabled for this prospect' };
    }

    // Check if auto_outreach is enabled globally
    const autoOutreach = orchestrator.getConfig('auto_outreach', 'true');
    if (autoOutreach !== 'true') {
      return { skipped: true, reason: 'Auto outreach disabled globally' };
    }

    // Check if prospect already has email campaigns
    const existingCampaigns = db.prepare(`
      SELECT COUNT(*) as count FROM campaigns WHERE prospect_id = ?
    `).get(prospectId);

    if (existingCampaigns.count > 0) {
      return { skipped: true, reason: 'Prospect already has email campaigns' };
    }

    // Generate email if no template provided
    let emailBody, emailSubject;
    
    if (payload.templateId) {
      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(payload.templateId);
      if (template) {
        emailBody = this.replaceVariables(template.body, prospect);
        emailSubject = this.replaceVariables(template.subject || '', prospect);
      }
    }

    // Use AI to generate personalized email if no template or for enhancement
    if (!emailBody || payload.useAI !== false) {
      const template = payload.templateId 
        ? db.prepare('SELECT * FROM templates WHERE id = ?').get(payload.templateId)
        : this.selectBestTemplate(prospect);

      // Get website analysis if available
      let websiteAnalysis = null;
      if (prospect.website_url) {
        const storedAnalysis = firecrawlService.getStoredAnalysis(prospectId);
        if (storedAnalysis) {
          websiteAnalysis = storedAnalysis.analysis;
          console.log(`📊 Using website analysis for outreach to ${prospect.business_name}`);
        }
      }

      const result = await llmService.generateOutreachEmail({
        prospect,
        template,
        context: { followUpNumber: 0 },
        websiteAnalysis,
      });

      emailBody = result.text;
      
      // Generate subject line
      emailSubject = await llmService.generateSubjectLine({
        prospect,
        emailBody,
      });
    }

    // Create campaign record
    const campaignResult = db.prepare(`
      INSERT INTO campaigns (prospect_id, template_id, subject, body, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(prospectId, payload.templateId || null, emailSubject, emailBody);

    const campaignId = campaignResult.lastInsertRowid;

    // Log activity
    db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, 'agent_action', ?)
    `).run(prospectId, `Outreach Agent generated email: "${emailSubject}"`);

    // Try to send the email
    const sendResult = await this.sendEmail(prospect, emailSubject, emailBody, campaignId);

    // Set up follow-up sequence
    if (sendResult.sent) {
      this.initializeFollowUpSequence(prospectId);
    }

    return {
      campaignId,
      subject: emailSubject,
      sent: sendResult.sent,
      error: sendResult.error,
    };
  }

  /**
   * Select the best template based on prospect characteristics
   */
  selectBestTemplate(prospect) {
    const db = getDb();
    
    // If no website, use website pitch template
    if (!prospect.website_url) {
      const template = db.prepare(`
        SELECT * FROM templates 
        WHERE type = 'email' AND name LIKE '%No Website%'
        LIMIT 1
      `).get();
      if (template) return template;
    }

    // Default to AI/Data solutions for businesses with websites
    const template = db.prepare(`
      SELECT * FROM templates 
      WHERE type = 'email'
      ORDER BY id ASC
      LIMIT 1
    `).get();

    return template;
  }

  /**
   * Replace template variables with prospect data
   */
  replaceVariables(text, prospect) {
    if (!text) return text;
    
    const variables = {
      business_name: prospect.business_name,
      city: prospect.city,
      state: prospect.state,
      category: prospect.category,
      industry: prospect.category,
      owner_name: 'there',
      rating: prospect.rating,
      review_count: prospect.review_count,
    };

    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value || '');
    }

    return result;
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
      
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'email_drafted', 'Email drafted - no email address on file')
      `).run(prospect.id);

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
      // Send email via Resend
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
      `).run(prospect.id, `Outreach Agent sent email: "${subject}"`);

      // Update prospect stage
      if (prospect.stage === 'new') {
        db.prepare(`
          UPDATE prospects SET stage = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(prospect.id);

        db.prepare(`
          INSERT INTO activities (prospect_id, type, description)
          VALUES (?, 'stage_change', 'Stage changed from "new" to "contacted" by Outreach Agent')
        `).run(prospect.id);
      }

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
   * Initialize follow-up sequence for a prospect
   */
  initializeFollowUpSequence(prospectId) {
    const db = getDb();
    
    const followUpDays = orchestrator.getConfig('follow_up_days', '3,7,14');
    const maxSteps = followUpDays.split(',').length;
    const daysBetween = parseInt(followUpDays.split(',')[0]) || 3;

    // Calculate next send date
    const nextSendAt = new Date();
    nextSendAt.setDate(nextSendAt.getDate() + daysBetween);

    try {
      db.prepare(`
        INSERT OR REPLACE INTO follow_up_sequences 
        (prospect_id, sequence_step, max_steps, days_between, last_sent_at, next_send_at)
        VALUES (?, 0, ?, ?, CURRENT_TIMESTAMP, ?)
      `).run(prospectId, maxSteps, daysBetween, nextSendAt.toISOString());

      console.log(`📅 Follow-up sequence initialized for prospect ${prospectId}`);
    } catch (error) {
      console.error('Failed to initialize follow-up sequence:', error);
    }
  }
}

// Create and register the agent
const outreachAgent = new OutreachAgent();

export default outreachAgent;

