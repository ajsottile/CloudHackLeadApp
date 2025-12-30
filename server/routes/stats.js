import express from 'express';
import { getDb } from '../db/init.js';

const router = express.Router();

// Get dashboard stats
router.get('/dashboard', (req, res) => {
  try {
    const db = getDb();
    
    // Get counts by stage
    const stageCounts = db.prepare(`
      SELECT stage, COUNT(*) as count
      FROM prospects
      GROUP BY stage
    `).all();
    
    const stageMap = {
      new: 0,
      contacted: 0,
      responded: 0,
      meeting: 0,
      proposal: 0,
      won: 0,
      lost: 0,
    };
    
    stageCounts.forEach(row => {
      stageMap[row.stage] = row.count;
    });
    
    // Total prospects
    const totalProspects = Object.values(stageMap).reduce((a, b) => a + b, 0);
    
    // Campaigns stats
    const campaignStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as drafts,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM campaigns
    `).get();
    
    // Recent activities
    const recentActivities = db.prepare(`
      SELECT a.*, p.business_name
      FROM activities a
      JOIN prospects p ON a.prospect_id = p.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `).all();
    
    // Prospects added this week
    const thisWeekProspects = db.prepare(`
      SELECT COUNT(*) as count
      FROM prospects
      WHERE created_at >= date('now', '-7 days')
    `).get();
    
    // Emails sent this week
    const thisWeekEmails = db.prepare(`
      SELECT COUNT(*) as count
      FROM campaigns
      WHERE status = 'sent' AND sent_at >= date('now', '-7 days')
    `).get();
    
    res.json({
      pipeline: stageMap,
      totalProspects,
      campaigns: campaignStats,
      recentActivities,
      thisWeek: {
        newProspects: thisWeekProspects.count,
        emailsSent: thisWeekEmails.count,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

export default router;

