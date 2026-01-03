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
   * @param {object} options
   * @param {object} options.prospect - The prospect data
   * @param {object} [options.template] - Optional email template
   * @param {object} [options.context] - Additional context
   * @param {object} [options.websiteAnalysis] - Website analysis from Firecrawl
   */
  async generateOutreachEmail({ prospect, template, context = {}, websiteAnalysis = null }) {
    // Build intelligent context from all available data
    const businessContext = this.buildBusinessContext(prospect, websiteAnalysis);
    
    const systemPrompt = `You are Anthony, founder of CloudHack — a boutique AI & data consulting firm that helps businesses unlock operational efficiency through intelligent automation and data infrastructure.

YOUR VOICE & TONE:
- Sound like a curious founder who genuinely noticed something interesting about their business
- Direct, confident, but never pushy or salesy
- Write like you're texting a smart colleague, not writing marketing copy
- Short sentences. No fluff. Every word earns its place.
- NEVER use phrases like: "I hope this finds you well", "reaching out", "touching base", "circle back", "synergies"

CLOUDHACK'S HIGH-VALUE OFFERINGS (pick the 1-2 most relevant to this business):
1. **AI-Powered Workflow Automation** — Eliminate repetitive tasks, reduce labor costs 40-60%, free teams for strategic work
2. **Predictive Analytics & Forecasting** — Dynamic demand forecasting, inventory optimization, data-driven budgeting that adapts in real-time
3. **Manufacturing & Operations Intelligence** — Process optimization, predictive maintenance, quality control automation, supply chain visibility
4. **Data Infrastructure & BI** — Build the analytics backbone: data warehouses, dashboards, self-serve reporting that actually gets used
5. **AI-Enhanced Decision Support** — From M&A due diligence to market analysis, augment executive decisions with AI-processed insights
6. **Customer Intelligence Systems** — Churn prediction, lifetime value optimization, personalized engagement at scale

STRATEGIC APPROACH:
- Lead with a specific observation about THEIR business (use the data provided)
- Connect that observation to a tangible outcome (cost savings, revenue, time)
- Make them curious about what's possible, don't pitch features
- End with ONE low-friction ask (15-min call, not a sales meeting)

EMAIL STRUCTURE:
- Opening: Reference something specific you noticed (1-2 sentences)
- Insight: Share a relevant pattern or opportunity (2-3 sentences)  
- Proof point: Brief example or outcome if natural (1 sentence, optional)
- Ask: Single, specific call to action (1 sentence)
- Keep total under 150 words — busy executives skim`;

    const prompt = `Write a highly personalized cold email for this prospect. Use the business intelligence below to craft something that feels researched, not templated.

===== BUSINESS INTELLIGENCE =====
${businessContext}

===== TASK =====
${template ? `Reference this template for tone/structure, but make it highly specific:\n${template.body}\n` : ''}
${context.followUpNumber ? `This is follow-up #${context.followUpNumber}. Be more direct, reference that you reached out before.` : ''}

Based on their industry, size indicators, and any analysis data:
1. Identify the SINGLE most compelling angle for this specific business
2. Write an email that makes them think "this person actually understands my business"
3. Focus on outcomes (cost savings, efficiency gains, competitive advantage) not features

Return ONLY the email body. Start with a personalized greeting using their name or business name.`;

    const result = await this.complete({ prompt, systemPrompt, temperature: 0.8 });
    return result;
  }

  /**
   * Build rich business context from all available data
   */
  buildBusinessContext(prospect, websiteAnalysis) {
    const parts = [];
    
    // Core business info
    parts.push(`BUSINESS: ${prospect.business_name}`);
    parts.push(`INDUSTRY: ${prospect.category || 'Unknown'}`);
    parts.push(`LOCATION: ${prospect.city ? `${prospect.city}, ${prospect.state}` : 'Unknown'}`);
    
    // Size & reputation indicators
    if (prospect.rating || prospect.review_count) {
      const sizeIndicator = prospect.review_count > 500 ? 'Large/established' : 
                           prospect.review_count > 100 ? 'Mid-size' : 
                           prospect.review_count > 20 ? 'Growing' : 'Small/local';
      parts.push(`SIZE INDICATOR: ${sizeIndicator} (${prospect.rating || 'N/A'}★, ${prospect.review_count || 0} reviews)`);
    }
    
    // Digital presence
    parts.push(`HAS WEBSITE: ${prospect.website_url ? 'Yes - ' + prospect.website_url : 'No'}`);
    
    // Website analysis if available
    if (websiteAnalysis?.analysis) {
      const analysis = websiteAnalysis.analysis;
      parts.push(`\n----- WEBSITE ANALYSIS -----`);
      if (analysis.overallScore) parts.push(`Digital Maturity Score: ${analysis.overallScore}/10`);
      if (analysis.summary) parts.push(`Summary: ${analysis.summary}`);
      
      if (analysis.techStack?.length > 0) {
        parts.push(`Tech Stack Detected: ${analysis.techStack.join(', ')}`);
      }
      
      if (analysis.opportunities?.length > 0) {
        parts.push(`\nOPPORTUNITIES IDENTIFIED:`);
        analysis.opportunities.slice(0, 3).forEach(o => {
          parts.push(`• ${o.title}: ${o.description} (${o.impact} impact)`);
        });
      }
      
      if (analysis.weaknesses?.length > 0) {
        parts.push(`\nWEAKNESSES/GAPS:`);
        analysis.weaknesses.slice(0, 3).forEach(w => {
          parts.push(`• ${w}`);
        });
      }
      
      if (analysis.competitors?.length > 0) {
        parts.push(`\nCOMPETITOR INTEL: ${analysis.competitors.join(', ')}`);
      }
      
      if (analysis.recommendedPitch) {
        parts.push(`\nRECOMMENDED ANGLE: ${analysis.recommendedPitch}`);
      }
    }
    
    // Industry-specific insights
    const industryInsights = this.getIndustryInsights(prospect.category);
    if (industryInsights) {
      parts.push(`\n----- INDUSTRY CONTEXT -----`);
      parts.push(industryInsights);
    }
    
    return parts.join('\n');
  }

  /**
   * Get industry-specific pain points and opportunities
   */
  getIndustryInsights(category) {
    if (!category) return null;
    
    const categoryLower = category.toLowerCase();
    
    const industryMap = {
      'restaurant|food|dining|cafe|bar': `
Common pain points: Labor costs (30-35% of revenue), food waste, inconsistent demand forecasting, thin margins (3-5%)
AI opportunities: Demand forecasting to optimize staffing/inventory, automated scheduling, waste reduction through predictive ordering
Typical ROI: 15-25% reduction in food waste, 10-20% labor cost optimization`,
      
      'retail|shop|store|boutique': `
Common pain points: Inventory management, demand forecasting, customer retention, omnichannel complexity
AI opportunities: Predictive inventory, personalized marketing automation, customer lifetime value optimization, dynamic pricing
Typical ROI: 20-30% inventory cost reduction, 15-25% increase in repeat purchases`,
      
      'manufacturing|industrial|factory|production': `
Common pain points: Downtime costs ($260K/hr avg), quality control, supply chain visibility, skilled labor shortage
AI opportunities: Predictive maintenance, automated QC, demand-driven production scheduling, digital twin simulations
Typical ROI: 25-40% reduction in unplanned downtime, 20-35% quality improvement`,
      
      'healthcare|medical|clinic|dental|health': `
Common pain points: Administrative burden (30% of costs), scheduling inefficiency, patient no-shows, compliance documentation
AI opportunities: Automated scheduling/reminders, clinical documentation, patient flow optimization, predictive staffing
Typical ROI: 20-30% reduction in no-shows, 25-40% admin time savings`,
      
      'professional services|consulting|legal|accounting|agency': `
Common pain points: Utilization rates, project profitability tracking, knowledge management, proposal generation
AI opportunities: Resource optimization, automated reporting, AI-assisted research/analysis, intelligent document processing
Typical ROI: 15-25% improvement in utilization, 30-50% faster proposal/report generation`,
      
      'real estate|property|realty': `
Common pain points: Lead qualification, market analysis time, property valuation accuracy, transaction coordination
AI opportunities: Predictive lead scoring, automated market comps, AI-powered valuations, transaction workflow automation
Typical ROI: 40-60% reduction in lead qualification time, 20-30% faster closings`,
      
      'fitness|gym|wellness|spa|salon': `
Common pain points: Member retention (avg 50% annual churn), scheduling gaps, personalization at scale
AI opportunities: Churn prediction, dynamic scheduling optimization, personalized engagement sequences, demand forecasting
Typical ROI: 15-25% improvement in retention, 20-30% better capacity utilization`,
      
      'automotive|car|auto|repair|dealership': `
Common pain points: Service scheduling, parts inventory, customer follow-up, technician utilization
AI opportunities: Predictive maintenance recommendations, inventory optimization, automated service reminders, dynamic pricing
Typical ROI: 20-30% parts inventory optimization, 25-35% improvement in service bay utilization`,
      
      'construction|contractor|builder|plumbing|electric': `
Common pain points: Project estimation accuracy, scheduling complexity, material waste, cash flow management
AI opportunities: AI-powered estimation, resource/schedule optimization, material forecasting, automated progress tracking
Typical ROI: 15-25% improvement in estimate accuracy, 20-30% reduction in material waste`,
    };
    
    for (const [pattern, insights] of Object.entries(industryMap)) {
      if (new RegExp(pattern, 'i').test(categoryLower)) {
        return insights;
      }
    }
    
    return `General opportunity: Most businesses in this category underutilize their data. Common wins include workflow automation (20-40% time savings), predictive analytics for demand/inventory, and customer intelligence systems.`;
  }

  /**
   * Generate an email subject line
   */
  async generateSubjectLine({ prospect, emailBody }) {
    const systemPrompt = `You generate subject lines that busy executives actually open. 
You avoid anything that sounds like marketing or sales spam.
Your subject lines sound like they're from a peer or colleague, not a vendor.`;
    
    const prompt = `Generate a subject line for this cold email to ${prospect.business_name} (${prospect.category || 'business'}):

Email preview:
${emailBody.substring(0, 400)}...

REQUIREMENTS:
- Under 45 characters (will get cut off on mobile otherwise)
- Sound like a human, not a marketer
- Reference their business/industry specifically if possible
- Create genuine curiosity OR offer concrete value
- AVOID: "Quick question", "Opportunity", "Partnership", emojis, ALL CAPS, excessive punctuation

GOOD EXAMPLES:
- "re: ${prospect.business_name} operations"
- "idea for reducing [specific pain point]"
- "[Industry] data insight"
- "noticed something about ${prospect.business_name}"

Return ONLY the subject line text, nothing else.`;

    const result = await this.complete({ prompt, systemPrompt, maxTokens: 50, temperature: 0.7 });
    return result.text.trim().replace(/^["']|["']$/g, '').replace(/^Subject:\s*/i, '');
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
    const systemPrompt = `You are Anthony from CloudHack. You write follow-ups that add NEW value — never just "bumping" or "checking in."

Each follow-up should:
- Bring a fresh insight, example, or angle they haven't seen
- Be even shorter than the original (busy people appreciate brevity)
- Feel like you're sharing something useful, not asking for something
- Never guilt-trip or use passive aggressive language`;

    const industryInsights = this.getIndustryInsights(prospect.category);

    const prompt = `Write follow-up #${followUpNumber} for ${prospect.business_name} (${prospect.category || 'business'}) who hasn't responded.

PREVIOUS OUTREACH:
${previousEmails.map((e, i) => `Email ${i + 1}: ${e.subject || 'No subject'}\n${e.body?.substring(0, 150)}...`).join('\n\n')}

INDUSTRY CONTEXT:
${industryInsights || 'General business'}

FOLLOW-UP STRATEGY:
${followUpNumber === 1 ? `
- Very short (under 50 words)
- Add ONE new data point or insight relevant to their industry
- Don't reference "my last email" — just deliver value
- Example angle: Share a quick stat about their industry + offer to discuss` : ''}
${followUpNumber === 2 ? `
- Medium length (under 75 words)  
- Different angle than before — maybe a case study snippet or specific use case
- Slight urgency: "working with a few [industry] businesses this quarter"
- Make the ask even more specific` : ''}
${followUpNumber >= 3 ? `
- Final email — be direct but gracious (under 60 words)
- "Closing the loop" energy — you're moving on, door stays open
- No desperation, just professional closure
- Leave them with one compelling thought` : ''}

Return ONLY the email body. Start with their name or a casual greeting.`;

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

