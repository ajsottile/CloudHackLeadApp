import { Resend } from 'resend';

/**
 * Email Service - Handles sending emails via Resend
 */
class EmailService {
  constructor() {
    this.resend = null;
    this.fromEmail = null;
    this.isConfigured = false;
  }

  initialize() {
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
      this.fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      this.isConfigured = true;
      console.log('📧 Resend email service initialized');
      console.log(`📧 Email Service: { configured: ${this.isConfigured}, from: '${this.fromEmail}' }`);
    } else {
      console.log('📧 Email service not configured (add RESEND_API_KEY to .env)');
      console.log(`📧 Email Service: { configured: ${this.isConfigured}, from: null }`);
    }
  }

  /**
   * Check if email service is ready
   */
  isReady() {
    return this.isConfigured && this.resend !== null;
  }

  /**
   * Send an email
   * @param {Object} options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.text - Plain text body
   * @param {string} options.html - HTML body (optional)
   * @param {Object} options.tags - Custom tags for tracking
   * @returns {Promise<{success: boolean, id?: string, error?: string}>}
   */
  async send({ to, subject, text, html, tags = {} }) {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'Email service not configured. Add RESEND_API_KEY to .env',
      };
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject,
        text,
        html: html || text.replace(/\n/g, '<br>'),
        tags: Object.entries(tags).map(([name, value]) => ({ name, value: String(value) })),
      });

      if (error) {
        console.error('Resend error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id };
    } catch (err) {
      console.error('Email send error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send a batch of emails
   * @param {Array} emails - Array of email objects
   * @returns {Promise<Array>}
   */
  async sendBatch(emails) {
    if (!this.isReady()) {
      return emails.map(() => ({
        success: false,
        error: 'Email service not configured',
      }));
    }

    try {
      const { data, error } = await this.resend.batch.send(
        emails.map((email) => ({
          from: this.fromEmail,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html || email.text.replace(/\n/g, '<br>'),
        }))
      );

      if (error) {
        return emails.map(() => ({ success: false, error: error.message }));
      }

      return data.map((result) => ({ success: true, id: result.id }));
    } catch (err) {
      return emails.map(() => ({ success: false, error: err.message }));
    }
  }

  /**
   * Get the from email address
   */
  getFromEmail() {
    return this.fromEmail;
  }
}

// Singleton instance
const emailService = new EmailService();

export default emailService;

