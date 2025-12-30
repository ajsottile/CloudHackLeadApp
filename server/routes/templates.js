import express from 'express';
import { getDb } from '../db/init.js';

const router = express.Router();

// Get all templates
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { type } = req.query;
    
    let query = 'SELECT * FROM templates';
    const params = [];
    
    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const templates = db.prepare(query).all(...params);
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ message: 'Failed to fetch templates' });
  }
});

// Get template by ID
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ message: 'Failed to fetch template' });
  }
});

// Create template
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, type, subject, body } = req.body;
    
    if (!name || !type || !body) {
      return res.status(400).json({ message: 'Name, type, and body are required' });
    }
    
    const result = db.prepare(`
      INSERT INTO templates (name, type, subject, body)
      VALUES (?, ?, ?, ?)
    `).run(name, type, subject, body);
    
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ message: 'Failed to create template' });
  }
});

// Update template
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, type, subject, body } = req.body;
    
    const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    db.prepare(`
      UPDATE templates 
      SET name = ?, type = ?, subject = ?, body = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name ?? existing.name,
      type ?? existing.type,
      subject ?? existing.subject,
      body ?? existing.body,
      id
    );
    
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ message: 'Failed to update template' });
  }
});

// Delete template
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ message: 'Failed to delete template' });
  }
});

// Preview template with variables replaced
router.post('/:id/preview', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const variables = req.body;
    
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    let previewSubject = template.subject || '';
    let previewBody = template.body;
    
    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      previewSubject = previewSubject.replace(regex, value || '');
      previewBody = previewBody.replace(regex, value || '');
    }
    
    res.json({
      subject: previewSubject,
      body: previewBody
    });
  } catch (error) {
    console.error('Error previewing template:', error);
    res.status(500).json({ message: 'Failed to preview template' });
  }
});

export default router;

