import express from 'express';
import { getDb } from '../db/init.js';
import orchestrator from '../agents/orchestrator.js';
import enrichmentService from '../services/enrichment.js';

const router = express.Router();

// Get all prospects
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { stage, search } = req.query;
    
    let query = 'SELECT * FROM prospects';
    const params = [];
    const conditions = [];
    
    if (stage) {
      conditions.push('stage = ?');
      params.push(stage);
    }
    
    if (search) {
      conditions.push('(business_name LIKE ? OR city LIKE ? OR category LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY updated_at DESC';
    
    const prospects = db.prepare(query).all(...params);
    res.json(prospects);
  } catch (error) {
    console.error('Error fetching prospects:', error);
    res.status(500).json({ message: 'Failed to fetch prospects' });
  }
});

// Get prospect by ID
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
    
    if (!prospect) {
      return res.status(404).json({ message: 'Prospect not found' });
    }
    
    res.json(prospect);
  } catch (error) {
    console.error('Error fetching prospect:', error);
    res.status(500).json({ message: 'Failed to fetch prospect' });
  }
});

// Create prospect
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const {
      business_name,
      phone,
      email,
      address,
      city,
      state,
      zip_code,
      website_url,
      yelp_url,
      yelp_id,
      google_place_id,
      google_maps_url,
      category,
      rating,
      review_count,
      stage = 'new',
      notes,
      source = 'yelp'
    } = req.body;
    
    if (!business_name) {
      return res.status(400).json({ message: 'Business name is required' });
    }
    
    // Check for duplicate yelp_id or google_place_id
    if (yelp_id) {
      const existing = db.prepare('SELECT id FROM prospects WHERE yelp_id = ?').get(yelp_id);
      if (existing) {
        return res.status(409).json({ message: 'This business is already in your pipeline', existingId: existing.id });
      }
    }
    
    if (google_place_id) {
      const existing = db.prepare('SELECT id FROM prospects WHERE google_place_id = ?').get(google_place_id);
      if (existing) {
        return res.status(409).json({ message: 'This business is already in your pipeline', existingId: existing.id });
      }
    }
    
    const result = db.prepare(`
      INSERT INTO prospects (
        business_name, phone, email, address, city, state, zip_code,
        website_url, yelp_url, yelp_id, google_place_id, google_maps_url,
        category, rating, review_count, stage, notes, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      business_name, phone, email, address, city, state, zip_code,
      website_url, yelp_url, yelp_id, google_place_id, google_maps_url,
      category, rating, review_count, stage, notes, source
    );
    
    const prospectId = result.lastInsertRowid;
    
    // Log activity
    db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, 'created', 'Prospect added to pipeline')
    `).run(prospectId);
    
    // Auto-enrich prospect to find missing contact info (async - don't wait)
    const autoEnrich = orchestrator.getConfig('auto_enrich', 'true');
    if (autoEnrich === 'true' && !email) {
      console.log(`🔍 Auto-enriching prospect ${prospectId}...`);
      enrichmentService.enrichProspect(prospectId).then(result => {
        if (result.enriched) {
          console.log(`✅ Auto-enriched ${business_name}: found ${result.results.methods.join(', ')}`);
          
          // If we found an email, now queue the outreach
          if (result.results.email) {
            const autoOutreach = orchestrator.getConfig('auto_outreach', 'true');
            if (autoOutreach === 'true') {
              orchestrator.queueTask({
                agentType: 'outreach',
                prospectId: prospectId,
                payload: {},
              });
              console.log(`🤖 Outreach task queued for enriched prospect ${prospectId}`);
            }
          }
        }
      }).catch(err => {
        console.error('Auto-enrichment failed:', err);
      });
    }
    
    // Queue outreach agent task immediately if we already have email (async - don't wait)
    try {
      const autoOutreach = orchestrator.getConfig('auto_outreach', 'true');
      if (autoOutreach === 'true' && email) {
        orchestrator.queueTask({
          agentType: 'outreach',
          prospectId: prospectId,
          payload: {},
        });
        console.log(`🤖 Outreach task queued for prospect ${prospectId}`);
      }
    } catch (err) {
      console.error('Failed to queue outreach task:', err);
      // Don't fail the request if agent queueing fails
    }
    
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    res.status(201).json(prospect);
  } catch (error) {
    console.error('Error creating prospect:', error);
    res.status(500).json({ message: 'Failed to create prospect' });
  }
});

// Update prospect
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const updates = req.body;
    
    const existing = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Prospect not found' });
    }
    
    const allowedFields = [
      'business_name', 'phone', 'email', 'address', 'city', 'state',
      'zip_code', 'website_url', 'yelp_url', 'google_place_id', 'google_maps_url',
      'category', 'rating', 'review_count', 'stage', 'notes', 'automation_enabled', 'source'
    ];
    
    const setClauses = [];
    const values = [];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }
    
    if (setClauses.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    db.prepare(`
      UPDATE prospects SET ${setClauses.join(', ')} WHERE id = ?
    `).run(...values);
    
    // Log stage change if applicable
    if (updates.stage && updates.stage !== existing.stage) {
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'stage_change', ?)
      `).run(id, `Stage changed from "${existing.stage}" to "${updates.stage}"`);
    }
    
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
    res.json(prospect);
  } catch (error) {
    console.error('Error updating prospect:', error);
    res.status(500).json({ message: 'Failed to update prospect' });
  }
});

// Update prospect stage (convenience endpoint)
router.patch('/:id/stage', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { stage } = req.body;
    
    const existing = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Prospect not found' });
    }
    
    if (!stage) {
      return res.status(400).json({ message: 'Stage is required' });
    }
    
    db.prepare(`
      UPDATE prospects SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(stage, id);
    
    // Log activity
    if (stage !== existing.stage) {
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'stage_change', ?)
      `).run(id, `Stage changed from "${existing.stage}" to "${stage}"`);
    }
    
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
    res.json(prospect);
  } catch (error) {
    console.error('Error updating prospect stage:', error);
    res.status(500).json({ message: 'Failed to update stage' });
  }
});

// Delete prospect
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const existing = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Prospect not found' });
    }
    
    db.prepare('DELETE FROM prospects WHERE id = ?').run(id);
    res.json({ message: 'Prospect deleted successfully' });
  } catch (error) {
    console.error('Error deleting prospect:', error);
    res.status(500).json({ message: 'Failed to delete prospect' });
  }
});

export default router;

