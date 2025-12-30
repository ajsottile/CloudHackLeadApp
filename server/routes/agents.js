import express from 'express';
import { getDb } from '../db/init.js';
import orchestrator from '../agents/orchestrator.js';
import scheduler from '../services/scheduler.js';
import llmService from '../services/llm.js';
import emailService from '../services/email.js';
import notificationService from '../services/notifications.js';

const router = express.Router();

// ============================================
// AGENT CONFIGURATION
// ============================================

// Get all agent configuration
router.get('/config', (req, res) => {
  try {
    const config = orchestrator.getAllConfig();
    const availableProviders = llmService.getAvailableProviders();
    const currentProvider = llmService.getProvider();
    
    res.json({
      ...config,
      availableProviders,
      currentProvider,
      llmConfigured: llmService.isConfigured(),
      emailConfigured: emailService.isReady(),
      emailFrom: emailService.getFromEmail(),
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ message: 'Failed to fetch config' });
  }
});

// Update agent configuration
router.put('/config', (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key) {
      return res.status(400).json({ message: 'Key is required' });
    }
    
    orchestrator.setConfig(key, value);
    
    // Special handling for LLM provider
    if (key === 'llm_provider') {
      llmService.setProvider(value);
    }
    
    res.json({ success: true, key, value });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ message: 'Failed to update config' });
  }
});

// Bulk update configuration
router.put('/config/bulk', (req, res) => {
  try {
    const updates = req.body;
    
    for (const [key, value] of Object.entries(updates)) {
      orchestrator.setConfig(key, value);
      
      if (key === 'llm_provider') {
        llmService.setProvider(value);
      }
    }
    
    res.json({ success: true, updated: Object.keys(updates) });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ message: 'Failed to update config' });
  }
});

// ============================================
// AGENT STATS & MONITORING
// ============================================

// Get agent statistics
router.get('/stats', (req, res) => {
  try {
    const stats = orchestrator.getStats();
    const schedulerStatus = scheduler.getStatus();
    const tokenUsage = llmService.getTokenUsage();
    
    // Include LLM and email config status for dashboard
    const llmConfig = {
      configured: llmService.isConfigured(),
      currentProvider: llmService.getProvider(),
      availableProviders: llmService.getAvailableProviders(),
    };
    
    const emailConfig = {
      configured: emailService.isReady(),
      from: emailService.getFromEmail ? emailService.getFromEmail() : null,
    };
    
    res.json({
      ...stats,
      scheduler: schedulerStatus,
      tokenUsage,
      llmConfig,
      emailConfig,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

// Get agent tasks by status
router.get('/tasks/:status', (req, res) => {
  try {
    const tasks = orchestrator.getTasksByStatus(req.params.status);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
});

// ============================================
// MANUAL AGENT TRIGGERS
// ============================================

// Trigger outreach for a prospect
router.post('/trigger/outreach/:prospectId', async (req, res) => {
  try {
    const taskId = await scheduler.triggerAgent('outreach', parseInt(req.params.prospectId), req.body);
    
    // Process immediately
    await scheduler.processNow();
    
    res.json({ success: true, taskId });
  } catch (error) {
    console.error('Error triggering outreach:', error);
    res.status(500).json({ message: 'Failed to trigger outreach' });
  }
});

// Trigger follow-up for a prospect
router.post('/trigger/followup/:prospectId', async (req, res) => {
  try {
    const taskId = await scheduler.triggerAgent('followup', parseInt(req.params.prospectId), req.body);
    
    // Process immediately
    await scheduler.processNow();
    
    res.json({ success: true, taskId });
  } catch (error) {
    console.error('Error triggering follow-up:', error);
    res.status(500).json({ message: 'Failed to trigger follow-up' });
  }
});

// Manually classify a response
router.post('/trigger/classify/:prospectId', async (req, res) => {
  try {
    const { responseText, subject } = req.body;
    
    if (!responseText) {
      return res.status(400).json({ message: 'responseText is required' });
    }
    
    const taskId = await scheduler.triggerAgent('response_classifier', parseInt(req.params.prospectId), {
      responseText,
      subject,
    });
    
    // Process immediately
    await scheduler.processNow();
    
    res.json({ success: true, taskId });
  } catch (error) {
    console.error('Error triggering classification:', error);
    res.status(500).json({ message: 'Failed to trigger classification' });
  }
});

// Process all pending tasks now
router.post('/process', async (req, res) => {
  try {
    const processed = await scheduler.processNow();
    res.json({ success: true, processed });
  } catch (error) {
    console.error('Error processing tasks:', error);
    res.status(500).json({ message: 'Failed to process tasks' });
  }
});

// ============================================
// NOTIFICATIONS
// ============================================

// Get all notifications
router.get('/notifications', (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const notifications = notificationService.getAll(unreadOnly);
    const unreadCount = notificationService.getUnreadCount();
    
    res.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// Get unread notification count
router.get('/notifications/count', (req, res) => {
  try {
    const count = notificationService.getUnreadCount();
    res.json({ count });
  } catch (error) {
    console.error('Error fetching count:', error);
    res.status(500).json({ message: 'Failed to fetch count' });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', (req, res) => {
  try {
    notificationService.markAsRead(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification:', error);
    res.status(500).json({ message: 'Failed to mark notification' });
  }
});

// Mark all notifications as read
router.put('/notifications/read-all', (req, res) => {
  try {
    notificationService.markAllAsRead();
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications:', error);
    res.status(500).json({ message: 'Failed to mark notifications' });
  }
});

// Delete notification
router.delete('/notifications/:id', (req, res) => {
  try {
    notificationService.delete(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

// ============================================
// PROSPECT AUTOMATION CONTROL
// ============================================

// Toggle automation for a prospect
router.put('/prospect/:prospectId/automation', (req, res) => {
  try {
    const db = getDb();
    const { enabled } = req.body;
    
    db.prepare(`
      UPDATE prospects SET automation_enabled = ? WHERE id = ?
    `).run(enabled ? 1 : 0, req.params.prospectId);
    
    // Also update follow-up sequence
    if (!enabled) {
      db.prepare(`
        UPDATE follow_up_sequences SET is_paused = 1 WHERE prospect_id = ?
      `).run(req.params.prospectId);
    }
    
    res.json({ success: true, automation_enabled: enabled });
  } catch (error) {
    console.error('Error toggling automation:', error);
    res.status(500).json({ message: 'Failed to toggle automation' });
  }
});

// Get follow-up sequence for a prospect
router.get('/prospect/:prospectId/sequence', (req, res) => {
  try {
    const db = getDb();
    const sequence = db.prepare(`
      SELECT * FROM follow_up_sequences WHERE prospect_id = ?
    `).get(req.params.prospectId);
    
    res.json(sequence || null);
  } catch (error) {
    console.error('Error fetching sequence:', error);
    res.status(500).json({ message: 'Failed to fetch sequence' });
  }
});

export default router;

