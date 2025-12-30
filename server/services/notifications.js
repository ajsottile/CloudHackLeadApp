import { getDb } from '../db/init.js';

/**
 * Notification Service - Manages user notifications
 */
class NotificationService {
  /**
   * Create a new notification
   */
  create({ type, title, message, prospectId = null, actionUrl = null }) {
    const db = getDb();
    
    const result = db.prepare(`
      INSERT INTO notifications (type, title, message, prospect_id, action_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(type, title, message, prospectId, actionUrl);

    return result.lastInsertRowid;
  }

  /**
   * Get all notifications (optionally unread only)
   */
  getAll(unreadOnly = false, limit = 50) {
    const db = getDb();
    
    const query = unreadOnly
      ? `SELECT n.*, p.business_name 
         FROM notifications n 
         LEFT JOIN prospects p ON n.prospect_id = p.id 
         WHERE n.is_read = 0 
         ORDER BY n.created_at DESC 
         LIMIT ?`
      : `SELECT n.*, p.business_name 
         FROM notifications n 
         LEFT JOIN prospects p ON n.prospect_id = p.id 
         ORDER BY n.created_at DESC 
         LIMIT ?`;

    return db.prepare(query).all(limit);
  }

  /**
   * Get unread count
   */
  getUnreadCount() {
    const db = getDb();
    const result = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE is_read = 0`).get();
    return result.count;
  }

  /**
   * Mark notification as read
   */
  markAsRead(notificationId) {
    const db = getDb();
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(notificationId);
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead() {
    const db = getDb();
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`).run();
  }

  /**
   * Delete a notification
   */
  delete(notificationId) {
    const db = getDb();
    db.prepare(`DELETE FROM notifications WHERE id = ?`).run(notificationId);
  }

  /**
   * Delete old notifications (older than 30 days)
   */
  cleanup() {
    const db = getDb();
    const result = db.prepare(`
      DELETE FROM notifications 
      WHERE created_at < datetime('now', '-30 days')
    `).run();
    return result.changes;
  }

  /**
   * Create meeting request notification (high priority)
   */
  notifyMeetingRequest(prospect, details = '') {
    return this.create({
      type: 'meeting_request',
      title: `🎯 ${prospect.business_name} wants to meet!`,
      message: details || 'A prospect has requested a meeting. Time to reach out!',
      prospectId: prospect.id,
      actionUrl: `/prospect/${prospect.id}`,
    });
  }

  /**
   * Create interested prospect notification
   */
  notifyInterested(prospect, details = '') {
    return this.create({
      type: 'interested',
      title: `✨ ${prospect.business_name} is interested`,
      message: details || 'This prospect showed interest in your services.',
      prospectId: prospect.id,
      actionUrl: `/prospect/${prospect.id}`,
    });
  }

  /**
   * Create deal won notification
   */
  notifyDealWon(prospect) {
    return this.create({
      type: 'deal_won',
      title: `🎉 Deal won: ${prospect.business_name}`,
      message: 'Congratulations on closing this deal!',
      prospectId: prospect.id,
      actionUrl: `/prospect/${prospect.id}`,
    });
  }

  /**
   * Create review needed notification
   */
  notifyReviewNeeded(prospect, reason) {
    return this.create({
      type: 'review_needed',
      title: `⚠️ Review needed: ${prospect.business_name}`,
      message: reason,
      prospectId: prospect.id,
      actionUrl: `/prospect/${prospect.id}`,
    });
  }
}

// Singleton instance
const notificationService = new NotificationService();

export default notificationService;

