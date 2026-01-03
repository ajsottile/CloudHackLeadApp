import Firecrawl from '@mendable/firecrawl-js';
import { getDb } from '../db/init.js';
import llmService from './llm.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Firecrawl Service
 * Handles advanced web scraping and AI-powered website analysis
 */
class FirecrawlService {
  constructor() {
    this.client = null;
    this.isConfigured = false;
  }

  /**
   * Initialize the Firecrawl client
   */
  initialize() {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (apiKey) {
      this.client = new Firecrawl({ apiKey });
      this.isConfigured = true;
      console.log('🔥 Firecrawl service initialized');
    } else {
      console.log('⚠️ Firecrawl API key not configured (FIRECRAWL_API_KEY)');
    }
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.isConfigured && this.client !== null;
  }

  /**
   * Scrape a website and return content in markdown format
   * @param {string} url - The URL to scrape
   * @returns {Promise<{success: boolean, content?: string, error?: string}>}
   */
  async scrapeWebsite(url) {
    if (!this.isReady()) {
      return { success: false, error: 'Firecrawl not configured' };
    }

    try {
      // Normalize URL
      let normalizedUrl = url;
      if (!normalizedUrl.startsWith('http')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      console.log(`🔥 Scraping website: ${normalizedUrl}`);
      
      // Use the scrape method from Firecrawl SDK
      const result = await this.client.scrape(normalizedUrl, {
        formats: ['markdown'],
      });

      console.log('🔥 Firecrawl result:', JSON.stringify(result).substring(0, 300));

      // Handle different response formats from Firecrawl
      if (result && (result.success !== false)) {
        return {
          success: true,
          content: result.markdown || result.data?.markdown || result.content || result.data?.content || '',
          metadata: result.metadata || result.data?.metadata || {},
        };
      } else {
        return {
          success: false,
          error: result?.error || 'Failed to scrape website',
        };
      }
    } catch (error) {
      console.error('Firecrawl scrape error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract contact information from scraped content
   * @param {string} content - The markdown content from the website
   * @returns {{emails: string[], phones: string[], email: string|null, phone: string|null}}
   */
  extractContactInfo(content) {
    const result = {
      emails: [],
      phones: [],
      email: null,
      phone: null,
    };

    if (!content) return result;

    // Email regex
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const foundEmails = content.match(emailRegex) || [];
    
    // Filter out common non-business emails and image files
    const filteredEmails = [...new Set(foundEmails)]
      .filter(email => {
        const lower = email.toLowerCase();
        return !lower.includes('example.com') &&
               !lower.includes('domain.com') &&
               !lower.includes('email.com') &&
               !lower.includes('wixpress.com') &&
               !lower.includes('sentry.io') &&
               !lower.includes('wordpress.com') &&
               !lower.includes('squarespace.com') &&
               !lower.includes('.png') &&
               !lower.includes('.jpg') &&
               !lower.includes('.jpeg') &&
               !lower.includes('.gif') &&
               !lower.includes('.webp') &&
               !lower.includes('.svg');
      });

    // Prioritize info@, contact@, hello@, etc.
    const priorityPrefixes = ['info', 'contact', 'hello', 'sales', 'support', 'admin', 'office', 'owner'];
    result.emails = filteredEmails.sort((a, b) => {
      const aPrefix = a.split('@')[0].toLowerCase();
      const bPrefix = b.split('@')[0].toLowerCase();
      const aHasPriority = priorityPrefixes.some(p => aPrefix.includes(p));
      const bHasPriority = priorityPrefixes.some(p => bPrefix.includes(p));
      if (aHasPriority && !bHasPriority) return -1;
      if (!aHasPriority && bHasPriority) return 1;
      return 0;
    });

    result.email = result.emails[0] || null;

    // Phone regex - matches various phone formats
    const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
    const foundPhones = content.match(phoneRegex) || [];
    
    // Clean and dedupe phone numbers
    result.phones = [...new Set(foundPhones.map(p => p.replace(/\D/g, '')))]
      .filter(p => p.length >= 10 && p.length <= 11);
    
    if (result.phones.length > 0) {
      result.phone = this.formatPhoneNumber(result.phones[0]);
    }

    return result;
  }

  /**
   * Format a phone number for display
   */
  formatPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  }

  /**
   * Analyze website content for AI/automation opportunities
   * @param {string} content - The markdown content from the website
   * @param {object} businessInfo - Information about the business
   * @returns {Promise<object>} Analysis results
   */
  async analyzeForAIOpportunities(content, businessInfo) {
    if (!llmService.isConfigured()) {
      return {
        success: false,
        error: 'LLM service not configured',
      };
    }

    const systemPrompt = `You are an expert digital consultant analyzing a business website to identify opportunities for AI, automation, and digital transformation.

Your goal is to identify SPECIFIC, ACTIONABLE opportunities that CloudHack (a digital services company) could offer to help this business.

CloudHack services:
- Website development and redesign
- AI chatbots and virtual assistants
- Business automation (booking systems, CRM, inventory)
- Cloud solutions and migrations
- Custom SaaS product development
- Data analytics and dashboards
- AI/ML implementations

Be specific and practical. Focus on opportunities that would provide clear ROI for a small/medium business.`;

    const prompt = `Analyze this business website content and identify AI and automation opportunities:

BUSINESS INFO:
- Name: ${businessInfo.business_name || 'Unknown'}
- Category/Industry: ${businessInfo.category || 'Unknown'}
- Location: ${businessInfo.city ? `${businessInfo.city}, ${businessInfo.state}` : 'Unknown'}

WEBSITE CONTENT (scraped in markdown):
${content.substring(0, 8000)}

Please provide a JSON analysis with the following structure:
{
  "overallScore": <1-10 rating of their digital presence>,
  "summary": "<2-3 sentence executive summary>",
  "opportunities": [
    {
      "type": "<category: chatbot|automation|analytics|website|cloud|ai>",
      "title": "<brief opportunity title>",
      "description": "<1-2 sentence description>",
      "impact": "<high|medium|low>",
      "complexity": "<high|medium|low>"
    }
  ],
  "strengths": ["<what they're doing well>"],
  "weaknesses": ["<areas needing improvement>"],
  "recommendedPitch": "<1-2 sentence tailored pitch for outreach email>"
}

Return ONLY valid JSON, no additional text.`;

    try {
      const result = await llmService.complete({
        prompt,
        systemPrompt,
        maxTokens: 1500,
        temperature: 0.5,
      });

      // Parse the JSON response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          analysis,
          provider: result.provider,
        };
      } else {
        return {
          success: false,
          error: 'Failed to parse analysis response',
          rawResponse: result.text,
        };
      }
    } catch (error) {
      console.error('AI analysis error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate a complete website analysis report for a prospect
   * @param {number} prospectId - The prospect ID
   * @returns {Promise<object>} Full analysis results
   */
  async generateWebsiteReport(prospectId) {
    const db = getDb();
    
    // Get prospect
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    if (!prospect) {
      return { success: false, error: `Prospect ${prospectId} not found` };
    }

    if (!prospect.website_url) {
      return { success: false, error: 'Prospect has no website URL' };
    }

    console.log(`🔍 Generating website report for: ${prospect.business_name}`);

    // Step 1: Scrape the website
    const scrapeResult = await this.scrapeWebsite(prospect.website_url);
    if (!scrapeResult.success) {
      return {
        success: false,
        error: `Failed to scrape website: ${scrapeResult.error}`,
      };
    }

    // Step 2: Extract contact info
    const contactInfo = this.extractContactInfo(scrapeResult.content);

    // Step 3: Analyze for AI opportunities
    const analysisResult = await this.analyzeForAIOpportunities(scrapeResult.content, {
      business_name: prospect.business_name,
      category: prospect.category,
      city: prospect.city,
      state: prospect.state,
    });

    // Step 4: Compile the report
    const report = {
      generatedAt: new Date().toISOString(),
      websiteUrl: prospect.website_url,
      contactInfo: {
        emailsFound: contactInfo.emails,
        phonesFound: contactInfo.phones,
      },
      analysis: analysisResult.success ? analysisResult.analysis : null,
      analysisError: analysisResult.success ? null : analysisResult.error,
    };

    // Step 5: Update prospect with new contact info if found
    const updates = [];
    const params = [];

    if (contactInfo.email && !prospect.email) {
      updates.push('email = ?');
      params.push(contactInfo.email);
    }
    if (contactInfo.phone && !prospect.phone) {
      updates.push('phone = ?');
      params.push(contactInfo.phone);
    }

    // Store the analysis
    updates.push('website_analysis = ?');
    params.push(JSON.stringify(report));
    updates.push('website_analyzed_at = CURRENT_TIMESTAMP');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(prospectId);

    db.prepare(`
      UPDATE prospects SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    // Log activity
    const enrichedFields = [];
    if (contactInfo.email && !prospect.email) enrichedFields.push('email');
    if (contactInfo.phone && !prospect.phone) enrichedFields.push('phone');
    
    let activityDescription = 'Website analyzed with Firecrawl';
    if (enrichedFields.length > 0) {
      activityDescription += ` (found: ${enrichedFields.join(', ')})`;
    }
    if (analysisResult.success && analysisResult.analysis?.opportunities?.length > 0) {
      activityDescription += ` - ${analysisResult.analysis.opportunities.length} AI opportunities identified`;
    }

    db.prepare(`
      INSERT INTO activities (prospect_id, type, description)
      VALUES (?, 'firecrawl_analysis', ?)
    `).run(prospectId, activityDescription);

    console.log(`✅ Website report generated for ${prospect.business_name}`);

    return {
      success: true,
      report,
      enrichedFields,
    };
  }

  /**
   * Get the stored analysis for a prospect
   * @param {number} prospectId - The prospect ID
   * @returns {object|null} The stored analysis or null
   */
  getStoredAnalysis(prospectId) {
    const db = getDb();
    const prospect = db.prepare('SELECT website_analysis, website_analyzed_at FROM prospects WHERE id = ?').get(prospectId);
    
    if (!prospect || !prospect.website_analysis) {
      return null;
    }

    try {
      return {
        analysis: JSON.parse(prospect.website_analysis),
        analyzedAt: prospect.website_analyzed_at,
      };
    } catch {
      return null;
    }
  }
}

// Singleton instance
const firecrawlService = new FirecrawlService();

export default firecrawlService;

