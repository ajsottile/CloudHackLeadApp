import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { getDb } from '../db/init.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Data Enrichment Service
 * Finds missing contact information for prospects
 */
class EnrichmentService {
  constructor() {
    // These will be read when methods are called, allowing dotenv to load first
    this.hunterApiKey = null;
    this.yelpApiKey = null;
  }

  /**
   * Get API keys (lazy load to ensure dotenv has loaded)
   */
  getApiKeys() {
    if (!this.hunterApiKey) {
      this.hunterApiKey = process.env.HUNTER_API_KEY;
    }
    if (!this.yelpApiKey) {
      this.yelpApiKey = process.env.YELP_API_KEY;
    }
    if (!this.googleApiKey) {
      this.googleApiKey = process.env.GOOGLE_API_KEY;
      this.googleCseId = process.env.GOOGLE_CSE_ID;
    }
    return {
      hunter: this.hunterApiKey,
      yelp: this.yelpApiKey,
      google: this.googleApiKey,
      googleCseId: this.googleCseId,
    };
  }

  /**
   * Enrich a prospect with missing contact information
   */
  async enrichProspect(prospectId) {
    const db = getDb();
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    
    if (!prospect) {
      throw new Error(`Prospect ${prospectId} not found`);
    }

    console.log(`🔍 Enriching prospect: ${prospect.business_name}`);
    
    const enrichmentResults = {
      website: null,
      email: null,
      phone: null,
      methods: [],
    };

    // Step 1: Get website from Yelp if we don't have one
    if (!prospect.website_url && prospect.yelp_id) {
      const yelpDetails = await this.getYelpBusinessDetails(prospect.yelp_id);
      if (yelpDetails?.website_url) {
        enrichmentResults.website = yelpDetails.website_url;
        enrichmentResults.methods.push('yelp_details');
      }
      // Also grab phone if missing
      if (!prospect.phone && yelpDetails?.phone) {
        enrichmentResults.phone = yelpDetails.phone;
      }
    }

    // Step 1b: If Yelp didn't give us a website, try Google Search
    if (!enrichmentResults.website && !prospect.website_url) {
      console.log(`🔎 Searching Google for: ${prospect.business_name} ${prospect.city || ''}`);
      const googleResult = await this.searchGoogleForWebsite(prospect);
      if (googleResult?.website) {
        enrichmentResults.website = googleResult.website;
        enrichmentResults.methods.push('google_search');
      }
    }

    const websiteUrl = enrichmentResults.website || prospect.website_url;

    // Step 2: If we have a website, try to scrape it for email
    if (websiteUrl && !prospect.email) {
      console.log(`🌐 Scraping website: ${websiteUrl}`);
      const scrapedData = await this.scrapeWebsiteForContact(websiteUrl);
      
      if (scrapedData.email) {
        enrichmentResults.email = scrapedData.email;
        enrichmentResults.methods.push('website_scrape');
      }
      if (scrapedData.phone && !enrichmentResults.phone && !prospect.phone) {
        enrichmentResults.phone = scrapedData.phone;
        enrichmentResults.methods.push('website_scrape');
      }
    }

    // Step 3: If still no email and we have a website, try Hunter.io
    if (!enrichmentResults.email && !prospect.email && websiteUrl && this.hunterApiKey) {
      console.log(`🔎 Trying Hunter.io for: ${websiteUrl}`);
      const hunterEmail = await this.findEmailWithHunter(websiteUrl);
      if (hunterEmail) {
        enrichmentResults.email = hunterEmail;
        enrichmentResults.methods.push('hunter_io');
      }
    }

    // Step 4: Update the prospect with enriched data
    const updates = [];
    const params = [];

    if (enrichmentResults.website && !prospect.website_url) {
      updates.push('website_url = ?');
      params.push(enrichmentResults.website);
    }
    if (enrichmentResults.email && !prospect.email) {
      updates.push('email = ?');
      params.push(enrichmentResults.email);
    }
    if (enrichmentResults.phone && !prospect.phone) {
      updates.push('phone = ?');
      params.push(enrichmentResults.phone);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(prospectId);
      
      db.prepare(`
        UPDATE prospects SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);

      // Log activity
      const enrichedFields = [];
      if (enrichmentResults.email) enrichedFields.push('email');
      if (enrichmentResults.website) enrichedFields.push('website');
      if (enrichmentResults.phone) enrichedFields.push('phone');
      
      db.prepare(`
        INSERT INTO activities (prospect_id, type, description)
        VALUES (?, 'enrichment', ?)
      `).run(prospectId, `Auto-enriched: ${enrichedFields.join(', ')} (via ${enrichmentResults.methods.join(', ')})`);

      console.log(`✅ Enriched ${prospect.business_name}: ${enrichedFields.join(', ')}`);
    } else {
      console.log(`ℹ️ No new data found for ${prospect.business_name}`);
    }

    return {
      prospectId,
      businessName: prospect.business_name,
      enriched: updates.length > 0,
      results: enrichmentResults,
    };
  }

  /**
   * Get business details from Yelp (includes website if available)
   */
  async getYelpBusinessDetails(yelpId) {
    const { yelp: yelpApiKey } = this.getApiKeys();
    if (!yelpApiKey) {
      console.log('⚠️ Yelp API key not configured');
      return null;
    }

    try {
      const response = await fetch(`https://api.yelp.com/v3/businesses/${yelpId}`, {
        headers: {
          'Authorization': `Bearer ${yelpApiKey}`,
        },
      });

      if (!response.ok) {
        console.error('Yelp details API error:', response.status);
        return null;
      }

      const data = await response.json();
      
      // Yelp business details can include the actual business URL
      // Note: This is different from the Yelp page URL
      return {
        website_url: data.url?.includes('yelp.com') ? null : data.url,
        phone: data.display_phone || data.phone,
        // Sometimes Yelp has the business website in the 'url' field
        // but usually it's just the Yelp page. Check for actual business websites.
      };
    } catch (error) {
      console.error('Error fetching Yelp details:', error);
      return null;
    }
  }

  /**
   * Search Google for a business website
   * Uses Google Custom Search API if configured, otherwise tries a simple search scrape
   */
  async searchGoogleForWebsite(prospect) {
    const { google: googleApiKey, googleCseId } = this.getApiKeys();
    
    const searchQuery = `${prospect.business_name} ${prospect.city || ''} ${prospect.state || ''} official website`;
    
    // Method 1: Use Google Custom Search API if configured (100 free queries/day)
    if (googleApiKey && googleCseId) {
      try {
        // Extract CSE ID if full URL was provided
        let cseId = googleCseId;
        if (googleCseId.includes('cx=')) {
          const match = googleCseId.match(/cx=([^&]+)/);
          if (match) cseId = match[1];
        }
        if (googleCseId.includes('cse.google.com')) {
          const match = googleCseId.match(/[:\/]([a-f0-9]+:[a-zA-Z0-9_-]+)/);
          if (match) cseId = match[1];
        }
        
        console.log(`🔎 Google CSE search: "${searchQuery}" (CSE ID: ${cseId.substring(0, 10)}...)`);
        
        const params = new URLSearchParams({
          key: googleApiKey,
          cx: cseId,
          q: searchQuery,
          num: 5,
        });
        
        const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Google CSE API error (${response.status}):`, errorText.substring(0, 200));
        }
        
        if (response.ok) {
          const data = await response.json();
          console.log(`🔎 Google found ${data.items?.length || 0} results`);
          
          // Look for the business website in search results
          if (data.items && data.items.length > 0) {
            // Filter out social media, Yelp, Yellow Pages, etc.
            const excludeDomains = [
              'yelp.com', 'facebook.com', 'instagram.com', 'twitter.com', 
              'yellowpages.com', 'linkedin.com', 'tripadvisor.com', 
              'google.com', 'mapquest.com', 'bbb.org', 'manta.com',
              'chamberofcommerce.com', 'thumbtack.com', 'angi.com'
            ];
            
            // Normalize business name for comparison
            const normalizedBusinessName = prospect.business_name
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '');
            
            for (const item of data.items) {
              const url = item.link;
              const domain = new URL(url).hostname.toLowerCase();
              const title = (item.title || '').toLowerCase();
              const snippet = (item.snippet || '').toLowerCase();
              
              // Skip excluded domains
              if (excludeDomains.some(d => domain.includes(d))) {
                continue;
              }
              
              // VERIFICATION: Check if the result actually matches our business
              // Look for business name keywords in title, snippet, or domain
              const businessWords = prospect.business_name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
              const matchScore = businessWords.filter(word => 
                title.includes(word) || snippet.includes(word) || domain.includes(word)
              ).length;
              
              // Require at least 50% of business name words to match
              const matchThreshold = Math.ceil(businessWords.length * 0.5);
              
              if (matchScore >= matchThreshold) {
                console.log(`✅ Google result verified: ${url} (score: ${matchScore}/${businessWords.length})`);
                return { website: url, method: 'google_api', verified: true };
              } else {
                console.log(`⚠️ Google result skipped (low match): ${url} (score: ${matchScore}/${businessWords.length})`);
              }
            }
            
            console.log(`ℹ️ No verified Google results for "${prospect.business_name}"`);
          }
        }
      } catch (error) {
        console.error('Google Custom Search error:', error.message);
      }
    }
    
    // Method 2: Try common website patterns based on business name
    const websiteGuesses = this.generateWebsiteGuesses(prospect);
    
    for (const guess of websiteGuesses) {
      try {
        const response = await fetch(guess, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 5000,
          redirect: 'follow',
        });
        
        if (response.ok) {
          console.log(`✅ Found website via guess: ${guess}`);
          return { website: guess, method: 'domain_guess' };
        }
      } catch {
        // Website doesn't exist or is unreachable, try next
      }
    }
    
    return null;
  }

  /**
   * Generate possible website URLs based on business name
   */
  generateWebsiteGuesses(prospect) {
    const guesses = [];
    const businessName = prospect.business_name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')  // Remove special chars
      .replace(/\s+/g, '');  // Remove spaces
    
    const businessNameDashed = prospect.business_name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-');
    
    // Common patterns
    const tlds = ['.com', '.net', '.co'];
    
    for (const tld of tlds) {
      guesses.push(`https://${businessName}${tld}`);
      guesses.push(`https://www.${businessName}${tld}`);
      if (businessNameDashed !== businessName) {
        guesses.push(`https://${businessNameDashed}${tld}`);
        guesses.push(`https://www.${businessNameDashed}${tld}`);
      }
    }
    
    // Add city suffix for local businesses
    if (prospect.city) {
      const city = prospect.city.toLowerCase().replace(/\s+/g, '');
      guesses.push(`https://${businessName}${city}.com`);
      guesses.push(`https://www.${businessName}${city}.com`);
    }
    
    return guesses.slice(0, 10); // Limit to 10 guesses
  }

  /**
   * Scrape a website for contact information
   */
  async scrapeWebsiteForContact(websiteUrl) {
    const result = {
      email: null,
      phone: null,
      emails: [],
      phones: [],
    };

    try {
      // Normalize URL
      let url = websiteUrl;
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }

      // Fetch the main page
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 10000,
      });

      if (!response.ok) {
        console.log(`⚠️ Could not fetch ${url}: ${response.status}`);
        return result;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract emails using regex
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const textContent = $('body').text();
      const hrefContent = $('a[href^="mailto:"]').map((_, el) => $(el).attr('href')).get().join(' ');
      
      const allText = textContent + ' ' + hrefContent;
      const foundEmails = allText.match(emailRegex) || [];
      
      // Filter out common non-business emails
      const filteredEmails = [...new Set(foundEmails)]
        .filter(email => {
          const lower = email.toLowerCase();
          return !lower.includes('example.com') &&
                 !lower.includes('domain.com') &&
                 !lower.includes('email.com') &&
                 !lower.includes('wixpress.com') &&
                 !lower.includes('sentry.io') &&
                 !lower.includes('.png') &&
                 !lower.includes('.jpg') &&
                 !lower.endsWith('.webp');
        });

      // Prioritize info@, contact@, hello@, etc.
      const priorityPrefixes = ['info', 'contact', 'hello', 'sales', 'support', 'admin', 'office'];
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

      // Extract phone numbers using regex
      const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
      const foundPhones = textContent.match(phoneRegex) || [];
      
      // Clean and dedupe phone numbers
      result.phones = [...new Set(foundPhones.map(p => p.replace(/\D/g, '')))].filter(p => p.length >= 10);
      result.phone = result.phones[0] ? this.formatPhoneNumber(result.phones[0]) : null;

      // Also try to find contact page and scrape it
      const contactLinks = $('a[href*="contact"]').map((_, el) => $(el).attr('href')).get();
      if (contactLinks.length > 0 && !result.email) {
        const contactUrl = this.resolveUrl(url, contactLinks[0]);
        if (contactUrl) {
          const contactData = await this.scrapeContactPage(contactUrl);
          if (contactData.email) result.email = contactData.email;
          if (contactData.phone && !result.phone) result.phone = contactData.phone;
        }
      }

    } catch (error) {
      console.error('Error scraping website:', error.message);
    }

    return result;
  }

  /**
   * Scrape a specific contact page
   */
  async scrapeContactPage(contactUrl) {
    const result = { email: null, phone: null };

    try {
      const response = await fetch(contactUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 10000,
      });

      if (!response.ok) return result;

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract emails
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const textContent = $('body').text();
      const foundEmails = textContent.match(emailRegex) || [];
      
      const filteredEmails = foundEmails.filter(email => {
        const lower = email.toLowerCase();
        return !lower.includes('example.com') && !lower.includes('wix');
      });

      result.email = filteredEmails[0] || null;

      // Extract phone
      const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
      const foundPhones = textContent.match(phoneRegex) || [];
      if (foundPhones.length > 0) {
        result.phone = this.formatPhoneNumber(foundPhones[0].replace(/\D/g, ''));
      }

    } catch (error) {
      console.error('Error scraping contact page:', error.message);
    }

    return result;
  }

  /**
   * Find email using Hunter.io API
   */
  async findEmailWithHunter(websiteUrl) {
    const { hunter: hunterApiKey } = this.getApiKeys();
    if (!hunterApiKey) {
      console.log('⚠️ Hunter.io API key not configured');
      return null;
    }

    try {
      // Extract domain from URL
      let domain = websiteUrl;
      try {
        const urlObj = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
        domain = urlObj.hostname.replace('www.', '');
      } catch {
        domain = websiteUrl.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      }

      // Use Hunter.io domain search
      const response = await fetch(
        `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${hunterApiKey}`
      );

      if (!response.ok) {
        console.error('Hunter.io API error:', response.status);
        return null;
      }

      const data = await response.json();
      
      if (data.data?.emails?.length > 0) {
        // Return the first email (usually most confident)
        // Prefer generic emails like info@, contact@
        const emails = data.data.emails;
        const genericEmail = emails.find(e => 
          ['info', 'contact', 'hello', 'sales', 'support'].some(prefix => 
            e.value.toLowerCase().startsWith(prefix)
          )
        );
        return genericEmail?.value || emails[0]?.value;
      }

      return null;
    } catch (error) {
      console.error('Error with Hunter.io:', error.message);
      return null;
    }
  }

  /**
   * Helper: Resolve relative URLs
   */
  resolveUrl(baseUrl, relativeUrl) {
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch {
      return null;
    }
  }

  /**
   * Helper: Format phone number
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
   * Batch enrich multiple prospects
   */
  async enrichBatch(prospectIds) {
    const results = [];
    for (const id of prospectIds) {
      try {
        const result = await this.enrichProspect(id);
        results.push(result);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.push({ prospectId: id, error: error.message });
      }
    }
    return results;
  }

  /**
   * Get enrichment stats
   */
  getStats() {
    const { hunter, yelp, google, googleCseId } = this.getApiKeys();
    return {
      hunterConfigured: !!hunter,
      yelpConfigured: !!yelp,
      googleConfigured: !!(google && googleCseId),
    };
  }
}

const enrichmentService = new EnrichmentService();
export default enrichmentService;

