import { Resend } from 'resend';

/**
 * Email Service - Handles sending emails via Resend
 */
class EmailService {
  constructor() {
    this.resend = null;
    this.fromEmail = null;
    this.isConfigured = false;
    // Logo URL - update this to your production frontend URL
    this.logoUrl = process.env.LOGO_URL || 'https://upbeat-stillness-production.up.railway.app/cloudhack-logo.png';
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
   * Format plain text email body into professional HTML
   */
  formatEmailHtml(text) {
    // Parse the email to identify sections
    const lines = text.split('\n');
    let htmlBody = '';
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      if (!line) {
        if (inList) {
          htmlBody += '</ul>';
          inList = false;
        }
        htmlBody += '<br>';
        continue;
      }
      
      // Bold key phrases
      line = line.replace(/\b(AI chatbot|automated follow-up|data analytics dashboard|24\/7 support|game-changer|15-minute call)\b/gi, '<strong>$1</strong>');
      
      // Handle bullet points
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
        if (!inList) {
          htmlBody += '<ul style="margin: 16px 0; padding-left: 24px;">';
          inList = true;
        }
        htmlBody += `<li style="margin: 8px 0; color: #374151;">${line.substring(1).trim()}</li>`;
      } else {
        if (inList) {
          htmlBody += '</ul>';
          inList = false;
        }
        htmlBody += `<p style="margin: 0 0 16px 0; color: #374151; line-height: 1.6;">${line}</p>`;
      }
    }
    
    if (inList) {
      htmlBody += '</ul>';
    }
    
    return htmlBody;
  }

  /**
   * Generate professional HTML email template
   */
  generateHtmlTemplate(text) {
    const formattedBody = this.formatEmailHtml(text);
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudHack</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); overflow: hidden;">
          
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #e5e7eb;">
              <img src="${this.logoUrl}" alt="CloudHack" width="140" style="display: block; height: auto;">
            </td>
          </tr>
          
          <!-- Email Body -->
          <tr>
            <td style="padding: 32px 40px; font-size: 15px; line-height: 1.7; color: #374151;">
              ${formattedBody}
            </td>
          </tr>
          
          <!-- Signature -->
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-top: 24px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 4px 0; color: #374151; font-size: 15px;">Best,</p>
                    <p style="margin: 0 0 4px 0; color: #111827; font-size: 15px; font-weight: 600;">Anthony</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">CloudHack Consulting</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                © ${new Date().getFullYear()} CloudHack Consulting. Helping businesses grow with technology.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
   * @param {boolean} options.useTemplate - Whether to use the professional HTML template (default: true)
   * @param {Object} options.tags - Custom tags for tracking
   * @returns {Promise<{success: boolean, id?: string, error?: string}>}
   */
  async send({ to, subject, text, html, useTemplate = true, tags = {} }) {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'Email service not configured. Add RESEND_API_KEY to .env',
      };
    }

    try {
      // Strip existing signature from text (we'll add our own styled one)
      let cleanedText = this.stripExistingSignature(text);
      
      // Generate HTML - use provided html, or generate from template, or simple conversion
      let emailHtml;
      if (html) {
        emailHtml = html;
      } else if (useTemplate) {
        emailHtml = this.generateHtmlTemplate(cleanedText);
      } else {
        emailHtml = text.replace(/\n/g, '<br>');
      }

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject,
        text,
        html: emailHtml,
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
   * Strip existing plain text signature from email body
   */
  stripExistingSignature(text) {
    // Remove common signature patterns at the end of emails
    const signaturePatterns = [
      /\n+Best,?\n+[\s\S]*$/i,
      /\n+Thanks,?\n+[\s\S]*$/i,
      /\n+Regards,?\n+[\s\S]*$/i,
      /\n+Cheers,?\n+[\s\S]*$/i,
      /\n+Sincerely,?\n+[\s\S]*$/i,
    ];
    
    let result = text;
    for (const pattern of signaturePatterns) {
      result = result.replace(pattern, '');
    }
    
    return result.trim();
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
        emails.map((email) => {
          const cleanedText = this.stripExistingSignature(email.text);
          return {
            from: this.fromEmail,
            to: [email.to],
            subject: email.subject,
            text: email.text,
            html: email.html || this.generateHtmlTemplate(cleanedText),
          };
        })
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

