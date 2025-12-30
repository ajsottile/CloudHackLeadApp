import express from 'express';
import { getDb } from '../db/init.js';
import enrichmentService from '../services/enrichment.js';

const router = express.Router();

// Get enrichment service status
router.get('/status', (req, res) => {
  const stats = enrichmentService.getStats();
  res.json(stats);
});

// Enrich a single prospect
router.post('/prospect/:id', async (req, res) => {
  try {
    const prospectId = parseInt(req.params.id);
    const result = await enrichmentService.enrichProspect(prospectId);
    res.json(result);
  } catch (error) {
    console.error('Enrichment error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Batch enrich multiple prospects
router.post('/batch', async (req, res) => {
  try {
    const { prospectIds } = req.body;
    
    if (!prospectIds || !Array.isArray(prospectIds)) {
      return res.status(400).json({ message: 'prospectIds array required' });
    }
    
    const results = await enrichmentService.enrichBatch(prospectIds);
    res.json({ results });
  } catch (error) {
    console.error('Batch enrichment error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Enrich all prospects missing email
router.post('/all-missing-email', async (req, res) => {
  try {
    const db = getDb();
    const prospects = db.prepare(`
      SELECT id FROM prospects 
      WHERE email IS NULL OR email = ''
      ORDER BY created_at DESC
      LIMIT 50
    `).all();
    
    const prospectIds = prospects.map(p => p.id);
    
    if (prospectIds.length === 0) {
      return res.json({ message: 'No prospects need enrichment', results: [] });
    }
    
    // Start enrichment in background
    res.json({ 
      message: `Starting enrichment for ${prospectIds.length} prospects`,
      prospectIds,
      status: 'processing'
    });
    
    // Process in background (don't await)
    enrichmentService.enrichBatch(prospectIds).then(results => {
      console.log(`✅ Batch enrichment complete: ${results.length} prospects processed`);
    }).catch(err => {
      console.error('Batch enrichment failed:', err);
    });
    
  } catch (error) {
    console.error('Enrichment error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Test scrape a URL (for debugging)
router.post('/test-scrape', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'url required' });
    }
    
    const result = await enrichmentService.scrapeWebsiteForContact(url);
    res.json(result);
  } catch (error) {
    console.error('Scrape test error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Clear enrichment data for a prospect (when wrong data was found)
router.delete('/prospect/:id', async (req, res) => {
  try {
    const db = getDb();
    const prospectId = parseInt(req.params.id);
    const { fields } = req.body || {};
    
    // By default, clear all enrichment fields
    const fieldsToClear = fields || ['email', 'website_url'];
    
    const updates = fieldsToClear.map(f => `${f} = NULL`).join(', ');
    
    db.prepare(`
      UPDATE prospects SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(prospectId);
    
    // Log activity
    db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, 'enrichment_cleared', ?)
    `).run(prospectId, `Cleared incorrect enrichment data: ${fieldsToClear.join(', ')}`);
    
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    res.json({ 
      message: 'Enrichment data cleared',
      prospect 
    });
  } catch (error) {
    console.error('Clear enrichment error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;

