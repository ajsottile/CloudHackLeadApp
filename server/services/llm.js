import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/init.js';

// LLM Service - Unified interface for OpenAI and Anthropic
class LLMService {
  constructor() {
    this.openai = null;
    this.anthropic = null;
    this.defaultProvider = 'openai';
    this.tokenUsage = { openai: 0, anthropic: 0 };
  }

  initialize() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    
    // Load default provider from config
    try {
      const db = getDb();
      const config = db.prepare('SELECT value FROM agent_config WHERE key = ?').get('llm_provider');
      if (config) {
        this.defaultProvider = config.value;
      }
    } catch (e) {
      // Table might not exist yet, use default
    }
  }

  setProvider(provider) {
    if (provider !== 'openai' && provider !== 'anthropic') {
      throw new Error('Invalid provider. Use "openai" or "anthropic"');
    }
    this.defaultProvider = provider;
    
    // Save to config
    try {
      const db = getDb();
      db.prepare(`
        INSERT OR REPLACE INTO agent_config (key, value) VALUES (?, ?)
      `).run('llm_provider', provider);
    } catch (e) {
      console.error('Failed to save provider config:', e);
    }
  }

  getProvider() {
    return this.defaultProvider;
  }

  isConfigured() {
    return !!(this.openai || this.anthropic);
  }

  getAvailableProviders() {
    const providers = [];
    if (this.openai) providers.push('openai');
    if (this.anthropic) providers.push('anthropic');
    return providers;
  }

  /**
   * Generate text completion using configured LLM
   * @param {Object} options
   * @param {string} options.prompt - The prompt to send
   * @param {string} options.systemPrompt - System instructions
   * @param {string} [options.provider] - Override default provider
   * @param {number} [options.maxTokens] - Max tokens in response
   * @param {number} [options.temperature] - Temperature (0-1)
   * @returns {Promise<{text: string, usage: object, provider: string}>}
   */
  async complete({ prompt, systemPrompt, provider, maxTokens = 1000, temperature = 0.7 }) {
    const useProvider = provider || this.defaultProvider;
    
    if (useProvider === 'openai') {
      return this.completeOpenAI({ prompt, systemPrompt, maxTokens, temperature });
    } else if (useProvider === 'anthropic') {
      return this.completeAnthropic({ prompt, systemPrompt, maxTokens, temperature });
    }
    
    throw new Error(`Provider ${useProvider} not available`);
  }

  async completeOpenAI({ prompt, systemPrompt, maxTokens, temperature }) {
    if (!this.openai) {
      throw new Error('OpenAI not configured. Set OPENAI_API_KEY in .env');
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      temperature,
    });

    const usage = response.usage || {};
    this.tokenUsage.openai += usage.total_tokens || 0;

    return {
      text: response.choices[0]?.message?.content || '',
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
      provider: 'openai',
    };
  }

  async completeAnthropic({ prompt, systemPrompt, maxTokens, temperature }) {
    if (!this.anthropic) {
      throw new Error('Anthropic not configured. Set ANTHROPIC_API_KEY in .env');
    }

    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: maxTokens,
      system: systemPrompt || 'You are a helpful assistant.',
      messages: [{ role: 'user', content: prompt }],
      temperature,
    });

    const usage = response.usage || {};
    this.tokenUsage.anthropic += (usage.input_tokens || 0) + (usage.output_tokens || 0);

    return {
      text: response.content[0]?.text || '',
      usage: {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      },
      provider: 'anthropic',
    };
  }

  /**
   * Generate a personalized email for a prospect
   */
  async generateOutreachEmail({ prospect, template, context = {} }) {
    const systemPrompt = `You are an expert B2B sales copywriter for CloudHack, a tech consulting company. 
Your job is to write personalized, compelling cold emails that feel genuine and human.

Guidelines:
- Be conversational and friendly, not corporate or salesy
- Reference specific details about the business when available
- Keep emails concise (under 200 words)
- Include a clear, low-pressure call to action
- Avoid overused phrases like "I hope this email finds you well"
- Make the value proposition clear and relevant to their business

CloudHack services:
- Web development (modern, mobile-friendly websites)
- Cloud integration and migrations
- AI/ML implementations (chatbots, automation, data analysis)
- Business intelligence and dashboards`;

    const prompt = `Generate a personalized cold email for this prospect:

Business Name: ${prospect.business_name}
Category/Industry: ${prospect.category || 'Unknown'}
Location: ${prospect.city ? `${prospect.city}, ${prospect.state}` : 'Unknown'}
Rating: ${prospect.rating || 'N/A'} stars (${prospect.review_count || 0} reviews)
Has Website: ${prospect.website_url ? 'Yes' : 'No'}

${template ? `Base your email on this template style:\n${template.body}\n\nBut personalize it significantly for this specific business.` : ''}

${context.followUpNumber ? `This is follow-up #${context.followUpNumber}. Reference previous outreach and be more direct.` : ''}

Return ONLY the email content, no subject line or extra formatting. The email should start with a greeting.`;

    const result = await this.complete({ prompt, systemPrompt, temperature: 0.8 });
    return result;
  }

  /**
   * Generate an email subject line
   */
  async generateSubjectLine({ prospect, emailBody }) {
    const systemPrompt = `You are an email marketing expert. Generate compelling, spam-filter-safe subject lines.`;
    
    const prompt = `Generate a subject line for this cold email to ${prospect.business_name}:

${emailBody.substring(0, 500)}...

Requirements:
- Under 50 characters
- Personalized if possible
- Creates curiosity or offers clear value
- No clickbait or spam triggers

Return ONLY the subject line, nothing else.`;

    const result = await this.complete({ prompt, systemPrompt, maxTokens: 50, temperature: 0.7 });
    return result.text.trim().replace(/^["']|["']$/g, '');
  }

  /**
   * Classify an email response from a prospect
   */
  async classifyResponse({ responseText, prospect, conversationHistory = [] }) {
    const systemPrompt = `You are an expert at analyzing sales email responses. Classify the prospect's intent accurately.`;

    const prompt = `Analyze this email response from a prospect and classify their intent:

Business: ${prospect.business_name}
Response:
"${responseText}"

${conversationHistory.length > 0 ? `Previous conversation:\n${conversationHistory.join('\n---\n')}` : ''}

Classify the response into ONE of these categories:
1. INTERESTED - They want to learn more, schedule a call, or discuss further
2. NOT_INTERESTED - They declined, unsubscribed, or asked to stop contact
3. QUESTION - They have a question but haven't committed either way
4. MEETING_REQUEST - They explicitly want to schedule a meeting/call
5. OUT_OF_OFFICE - Auto-reply or temporary unavailability
6. UNCLEAR - Can't determine intent

Also provide:
- A confidence score (0-100)
- A brief summary of their response
- Suggested next action

Return your analysis as JSON:
{
  "classification": "CATEGORY",
  "confidence": 85,
  "summary": "Brief summary",
  "suggestedAction": "What to do next",
  "sentiment": "positive/neutral/negative"
}`;

    const result = await this.complete({ prompt, systemPrompt, temperature: 0.3 });
    
    try {
      // Extract JSON from response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse classification response:', e);
    }
    
    return {
      classification: 'UNCLEAR',
      confidence: 0,
      summary: 'Failed to classify response',
      suggestedAction: 'Manual review required',
      sentiment: 'neutral',
    };
  }

  /**
   * Generate a follow-up email based on context
   */
  async generateFollowUp({ prospect, previousEmails, followUpNumber }) {
    const systemPrompt = `You are a persistent but respectful sales professional. 
Write follow-up emails that add value and create urgency without being pushy.`;

    const prompt = `Write follow-up email #${followUpNumber} for this prospect who hasn't responded:

Business: ${prospect.business_name}
Industry: ${prospect.category || 'Unknown'}
Location: ${prospect.city}, ${prospect.state}

Previous emails sent:
${previousEmails.map((e, i) => `Email ${i + 1}:\n${e.body?.substring(0, 200)}...`).join('\n\n')}

Guidelines for follow-up #${followUpNumber}:
${followUpNumber === 1 ? '- Gentle reminder, reference the first email' : ''}
${followUpNumber === 2 ? '- Add new value or angle, create mild urgency' : ''}
${followUpNumber >= 3 ? '- Final attempt, be direct about this being the last email' : ''}

Keep it under 100 words. Return ONLY the email body.`;

    const result = await this.complete({ prompt, systemPrompt, temperature: 0.8 });
    return result;
  }

  getTokenUsage() {
    return this.tokenUsage;
  }
}

// Singleton instance
const llmService = new LLMService();

export default llmService;

