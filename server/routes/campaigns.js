import express from 'express';
import { getDb } from '../db/init.js';
import orchestrator from '../agents/orchestrator.js';
import emailService from '../services/email.js';

const router = express.Router();

// Get all campaigns
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const campaigns = db.prepare(`
      SELECT c.*, p.business_name, p.email as prospect_email, t.name as template_name
      FROM campaigns c
      LEFT JOIN prospects p ON c.prospect_id = p.id
      LEFT JOIN templates t ON c.template_id = t.id
      ORDER BY c.created_at DESC
    `).all();
    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ message: 'Failed to fetch campaigns' });
  }
});

// Get campaigns by prospect
router.get('/prospect/:prospectId', (req, res) => {
  try {
    const db = getDb();
    const campaigns = db.prepare(`
      SELECT c.*, t.name as template_name
      FROM campaigns c
      LEFT JOIN templates t ON c.template_id = t.id
      WHERE c.prospect_id = ?
      ORDER BY c.created_at DESC
    `).all(req.params.prospectId);
    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ message: 'Failed to fetch campaigns' });
  }
});

// Send email campaign
router.post('/send', async (req, res) => {
  try {
    const db = getDb();
    const { prospectId, templateId, customSubject, customBody } = req.body;
    
    // Get prospect
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    if (!prospect) {
      return res.status(404).json({ message: 'Prospect not found' });
    }
    
    if (!prospect.email) {
      return res.status(400).json({ message: 'Prospect does not have an email address' });
    }
    
    // Get template if provided
    let subject = customSubject;
    let body = customBody;
    
    if (templateId && (!subject || !body)) {
      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      subject = subject || template.subject;
      body = body || template.body;
    }
    
    if (!subject || !body) {
      return res.status(400).json({ message: 'Subject and body are required' });
    }
    
    // Replace variables in subject and body
    const variables = {
      business_name: prospect.business_name,
      city: prospect.city,
      state: prospect.state,
      category: prospect.category,
      industry: prospect.category,
      owner_name: 'there', // Placeholder since we don't have owner name
    };
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value || '');
      body = body.replace(regex, value || '');
    }
    
    // Create campaign record
    const campaignResult = db.prepare(`
      INSERT INTO campaigns (prospect_id, template_id, subject, body, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(prospectId, templateId, subject, body);
    
    const campaignId = campaignResult.lastInsertRowid;
    
    // Check if email service is configured
    if (!emailService.isReady()) {
      // Mark as draft since we can't send
      db.prepare(`
        UPDATE campaigns SET status = 'draft' WHERE id = ?
      `).run(campaignId);
      
      // Log activity
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'email_drafted', ?)
      `).run(prospectId, `Email drafted: "${subject}"`);
      
      const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
      return res.json({
        ...campaign,
        warning: 'Email service not configured. Email saved as draft. Set RESEND_API_KEY in .env to enable sending.'
      });
    }
    
    // Send email via Resend
    try {
      const result = await emailService.send({
        to: prospect.email,
        subject: subject,
        text: body,
        tags: {
          campaign_id: campaignId,
          prospect_id: prospectId,
        },
      });
      
      if (!result.success) {
        db.prepare(`
          UPDATE campaigns SET status = 'failed' WHERE id = ?
        `).run(campaignId);
        return res.status(500).json({ message: 'Failed to send email', error: result.error });
      }
      
      // Update campaign status
      db.prepare(`
        UPDATE campaigns SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(campaignId);
      
      // Log activity
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'email_sent', ?)
      `).run(prospectId, `Email sent: "${subject}"`);
      
      // Update prospect stage if still 'new'
      if (prospect.stage === 'new') {
        db.prepare(`
          UPDATE prospects SET stage = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(prospectId);
        
        db.prepare(`
          INSERT INTO activities (prospect_id, type, description)
          VALUES (?, 'stage_change', 'Stage changed from "new" to "contacted"')
        `).run(prospectId);
      }
      
      const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
      res.json(campaign);
    } catch (sendError) {
      console.error('Email send error:', sendError);
      
      // Update campaign status to failed
      db.prepare(`
        UPDATE campaigns SET status = 'failed' WHERE id = ?
      `).run(campaignId);
      
      res.status(500).json({ message: 'Failed to send email', error: sendError.message });
    }
  } catch (error) {
    console.error('Error sending campaign:', error);
    res.status(500).json({ message: 'Failed to send campaign' });
  }
});

// ============================================
// SENDGRID WEBHOOKS
// ============================================

/**
 * SendGrid Event Webhook
 * Receives events like: delivered, open, click, bounce, spam_report, unsubscribe
 * Setup: Configure webhook URL in SendGrid dashboard as POST /api/webhooks/sendgrid
 */
router.post('/webhooks/sendgrid', express.json(), (req, res) => {
  try {
    const events = req.body;
    
    if (!Array.isArray(events)) {
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    const db = getDb();

    for (const event of events) {
      // Store raw event
      db.prepare(`
        INSERT INTO email_events (campaign_id, prospect_id, event_type, email_address, sg_message_id, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        event.campaign_id || null,
        event.prospect_id || null,
        event.event,
        event.email,
        event.sg_message_id,
        JSON.stringify(event)
      );

      // Update campaign based on event type
      if (event.campaign_id) {
        const campaignId = parseInt(event.campaign_id);
        
        switch (event.event) {
          case 'delivered':
            db.prepare(`
              UPDATE campaigns SET status = 'delivered' WHERE id = ? AND status = 'sent'
            `).run(campaignId);
            break;
            
          case 'open':
            db.prepare(`
              UPDATE campaigns SET opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP) WHERE id = ?
            `).run(campaignId);
            
            // Log activity
            if (event.prospect_id) {
              db.prepare(`
                INSERT INTO activities (prospect_id, type, description)
                VALUES (?, 'email_opened', 'Prospect opened email')
              `).run(parseInt(event.prospect_id));
            }
            break;
            
          case 'click':
            db.prepare(`
              UPDATE campaigns SET clicked_at = COALESCE(clicked_at, CURRENT_TIMESTAMP) WHERE id = ?
            `).run(campaignId);
            
            if (event.prospect_id) {
              db.prepare(`
                INSERT INTO activities (prospect_id, type, description)
                VALUES (?, 'email_clicked', ?)
              `).run(parseInt(event.prospect_id), `Clicked link: ${event.url || 'unknown'}`);
            }
            break;
            
          case 'bounce':
          case 'dropped':
            db.prepare(`
              UPDATE campaigns SET status = 'bounced' WHERE id = ?
            `).run(campaignId);
            
            // Pause automation for bounced emails
            if (event.prospect_id) {
              db.prepare(`
                UPDATE prospects SET automation_enabled = 0 WHERE id = ?
              `).run(parseInt(event.prospect_id));
              
              db.prepare(`
                UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
              `).run(parseInt(event.prospect_id));
            }
            break;
            
          case 'spamreport':
          case 'unsubscribe':
            // Stop all automation for this prospect
            if (event.prospect_id) {
              db.prepare(`
                UPDATE prospects SET automation_enabled = 0 WHERE id = ?
              `).run(parseInt(event.prospect_id));
              
              db.prepare(`
                UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
              `).run(parseInt(event.prospect_id));
              
              db.prepare(`
                INSERT INTO activities (prospect_id, type, description)
                VALUES (?, 'automation_stopped', ?)
              `).run(parseInt(event.prospect_id), `Automation stopped: ${event.event}`);
            }
            break;
        }
      }
    }

    res.json({ received: events.length });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

/**
 * SendGrid Inbound Parse Webhook
 * Receives email replies from prospects
 * Setup: Configure inbound parse in SendGrid for your domain
 */
router.post('/webhooks/sendgrid/inbound', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { from, to, subject, text, html } = req.body;
    
    console.log('📧 Inbound email received:', { from, subject });
    
    const db = getDb();
    
    // Try to find the prospect by email
    const fromEmail = from?.match(/<(.+)>/)?.[1] || from;
    const prospect = db.prepare(`
      SELECT * FROM prospects WHERE email = ?
    `).get(fromEmail);
    
    if (!prospect) {
      console.log('No prospect found for email:', fromEmail);
      return res.json({ message: 'No matching prospect' });
    }
    
    // Store the email event
    db.prepare(`
      INSERT INTO email_events (prospect_id, event_type, email_address, email_content, raw_payload)
      VALUES (?, 'reply', ?, ?, ?)
    `).run(prospect.id, fromEmail, text || html, JSON.stringify(req.body));
    
    // Log activity
    db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, 'email_reply', ?)
    `).run(prospect.id, `Reply received: "${subject}"`);
    
    // Update prospect stage to 'responded' if not already past that
    if (['new', 'contacted'].includes(prospect.stage)) {
      db.prepare(`
        UPDATE prospects SET stage = 'responded', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(prospect.id);
      
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'stage_change', 'Stage changed to "responded" - email reply received')
      `).run(prospect.id);
    }
    
    // Pause follow-up sequence since they responded
    db.prepare(`
      UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
    `).run(prospect.id);
    
    // Queue response classification task
    orchestrator.queueTask({
      agentType: 'response_classifier',
      prospectId: prospect.id,
      payload: {
        responseText: text || html,
        subject,
        from: fromEmail,
      },
    });
    
    res.json({ message: 'Reply processed', prospectId: prospect.id });
  } catch (error) {
    console.error('Inbound webhook error:', error);
    res.status(500).json({ message: 'Failed to process inbound email' });
  }
});

/**
 * Retry a failed campaign
 * POST /api/campaigns/:id/retry
 */
router.post('/:id/retry', async (req, res) => {
  try {
    const db = getDb();
    const campaignId = req.params.id;
    
    // Get the campaign
    const campaign = db.prepare(`
      SELECT c.*, p.email as prospect_email, p.business_name, p.stage as prospect_stage
      FROM campaigns c
      LEFT JOIN prospects p ON c.prospect_id = p.id
      WHERE c.id = ?
    `).get(campaignId);
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    if (campaign.status !== 'failed' && campaign.status !== 'draft') {
      return res.status(400).json({ message: `Cannot retry campaign with status "${campaign.status}"` });
    }
    
    if (!campaign.prospect_email) {
      return res.status(400).json({ message: 'Prospect does not have an email address' });
    }
    
    // Check if email service is configured
    if (!emailService.isReady()) {
      return res.status(400).json({ 
        message: 'Email service not configured. Set RESEND_API_KEY in .env to enable sending.' 
      });
    }
    
    // Update status to pending
    db.prepare(`
      UPDATE campaigns SET status = 'pending' WHERE id = ?
    `).run(campaignId);
    
    // Attempt to send email
    try {
      const result = await emailService.send({
        to: campaign.prospect_email,
        subject: campaign.subject,
        text: campaign.body,
        tags: {
          campaign_id: campaignId,
          prospect_id: campaign.prospect_id,
        },
      });
      
      if (!result.success) {
        db.prepare(`
          UPDATE campaigns SET status = 'failed' WHERE id = ?
        `).run(campaignId);
        return res.status(500).json({ message: 'Failed to send email', error: result.error });
      }
      
      // Update campaign status
      db.prepare(`
        UPDATE campaigns SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(campaignId);
      
      // Log activity
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'email_sent', ?)
      `).run(campaign.prospect_id, `Email sent (retry): "${campaign.subject}"`);
      
      // Update prospect stage if still 'new'
      if (campaign.prospect_stage === 'new') {
        db.prepare(`
          UPDATE prospects SET stage = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(campaign.prospect_id);
        
        db.prepare(`
          INSERT INTO activities (prospect_id, type, description)
          VALUES (?, 'stage_change', 'Stage changed from "new" to "contacted"')
        `).run(campaign.prospect_id);
      }
      
      const updatedCampaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
      res.json({ message: 'Email sent successfully', campaign: updatedCampaign });
    } catch (sendError) {
      console.error('Email send error:', sendError);
      
      // Update campaign status to failed
      db.prepare(`
        UPDATE campaigns SET status = 'failed' WHERE id = ?
      `).run(campaignId);
      
      res.status(500).json({ message: 'Failed to send email', error: sendError.message });
    }
  } catch (error) {
    console.error('Error retrying campaign:', error);
    res.status(500).json({ message: 'Failed to retry campaign' });
  }
});

/**
 * Get email events for a campaign or prospect
 */
router.get('/events/:prospectId', (req, res) => {
  try {
    const db = getDb();
    const events = db.prepare(`
      SELECT * FROM email_events
      WHERE prospect_id = ?
      ORDER BY timestamp DESC
      LIMIT 50
    `).all(req.params.prospectId);
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ message: 'Failed to fetch events' });
  }
});

export default router;

