import express from 'express';
import { getDb } from '../db/init.js';

const router = express.Router();

// Get activities by prospect
router.get('/prospect/:prospectId', (req, res) => {
  try {
    const db = getDb();
    const activities = db.prepare(`
      SELECT * FROM activities 
      WHERE prospect_id = ? 
      ORDER BY created_at DESC
    `).all(req.params.prospectId);
    res.json(activities);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ message: 'Failed to fetch activities' });
  }
});

// Get recent activities across all prospects
router.get('/recent', (req, res) => {
  try {
    const db = getDb();
    const { limit = 10 } = req.query;
    
    const activities = db.prepare(`
      SELECT a.*, p.business_name
      FROM activities a
      JOIN prospects p ON a.prospect_id = p.id
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(parseInt(limit));
    
    res.json(activities);
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({ message: 'Failed to fetch activities' });
  }
});

// Create activity (for manual logging)
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { prospect_id, type, description } = req.body;
    
    if (!prospect_id || !type || !description) {
      return res.status(400).json({ message: 'prospect_id, type, and description are required' });
    }
    
    // Verify prospect exists
    const prospect = db.prepare('SELECT id FROM prospects WHERE id = ?').get(prospect_id);
    if (!prospect) {
      return res.status(404).json({ message: 'Prospect not found' });
    }
    
    const result = db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, ?, ?)
    `).run(prospect_id, type, description);
    
    // Update prospect's updated_at
    db.prepare('UPDATE prospects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(prospect_id);
    
    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(activity);
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ message: 'Failed to create activity' });
  }
});

export default router;

