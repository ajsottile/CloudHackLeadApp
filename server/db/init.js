import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'cloudhack.db');

let db = null;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initializeDatabase() {
  const db = getDb();
  
  // Create prospects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      website_url TEXT,
      yelp_url TEXT,
      yelp_id TEXT UNIQUE,
      category TEXT,
      rating REAL,
      review_count INTEGER,
      stage TEXT DEFAULT 'new',
      notes TEXT,
      automation_enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add automation_enabled column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE prospects ADD COLUMN automation_enabled INTEGER DEFAULT 1`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add google_place_id column for Google Places data
  try {
    db.exec(`ALTER TABLE prospects ADD COLUMN google_place_id TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add google_maps_url column
  try {
    db.exec(`ALTER TABLE prospects ADD COLUMN google_maps_url TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add source column to track where prospect came from
  try {
    db.exec(`ALTER TABLE prospects ADD COLUMN source TEXT DEFAULT 'yelp'`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add website_analysis column for Firecrawl analysis data
  try {
    db.exec(`ALTER TABLE prospects ADD COLUMN website_analysis TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add website_analyzed_at column to track when analysis was performed
  try {
    db.exec(`ALTER TABLE prospects ADD COLUMN website_analyzed_at DATETIME`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Create activities table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    )
  `);

  // Create templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create campaigns table
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      template_id INTEGER,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'pending',
      sent_at DATETIME,
      opened_at DATETIME,
      clicked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
    )
  `);

  // Create agent_tasks table for job queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER,
      agent_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      scheduled_for DATETIME,
      payload TEXT,
      result TEXT,
      error TEXT,
      attempts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    )
  `);

  // Create email_events table for SendGrid webhooks
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      prospect_id INTEGER,
      event_type TEXT NOT NULL,
      email_address TEXT,
      email_content TEXT,
      sg_message_id TEXT,
      raw_payload TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    )
  `);

  // Create agent_config table for settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create follow_up_sequences table
  db.exec(`
    CREATE TABLE IF NOT EXISTS follow_up_sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL UNIQUE,
      sequence_step INTEGER DEFAULT 0,
      max_steps INTEGER DEFAULT 3,
      days_between INTEGER DEFAULT 3,
      is_paused INTEGER DEFAULT 0,
      last_sent_at DATETIME,
      next_send_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    )
  `);

  // Create notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      prospect_id INTEGER,
      is_read INTEGER DEFAULT 0,
      action_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
    CREATE INDEX IF NOT EXISTS idx_prospects_yelp_id ON prospects(yelp_id);
    CREATE INDEX IF NOT EXISTS idx_prospects_google_place_id ON prospects(google_place_id);
    CREATE INDEX IF NOT EXISTS idx_activities_prospect ON activities(prospect_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_prospect ON campaigns(prospect_id);
    CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_scheduled ON agent_tasks(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_follow_up_next ON follow_up_sequences(next_send_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read);
  `);

  // Seed default templates if none exist
  const templateCount = db.prepare('SELECT COUNT(*) as count FROM templates').get();
  if (templateCount.count === 0) {
    seedDefaultTemplates(db);
  }

  // Seed default agent config if not exists
  seedDefaultAgentConfig(db);

  console.log('✅ Database initialized successfully');
}

function seedDefaultAgentConfig(db) {
  const defaults = [
    { key: 'llm_provider', value: 'openai' },
    { key: 'follow_up_days', value: '3,7,14' },
    { key: 'max_follow_ups', value: '3' },
    { key: 'auto_outreach', value: 'true' },
    { key: 'auto_classify', value: 'true' },
    { key: 'auto_enrich', value: 'true' },
    { key: 'notification_email', value: '' },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO agent_config (key, value) VALUES (?, ?)
  `);

  for (const config of defaults) {
    insert.run(config.key, config.value);
  }
}

function seedDefaultTemplates(db) {
  const templates = [
    {
      name: 'Website Pitch - No Website',
      type: 'email',
      subject: 'Let\'s Get {{business_name}} Online',
      body: `Hi there,

I noticed {{business_name}} doesn't have a website yet, and I wanted to reach out because I think there's a huge opportunity here.

In today's digital world, most customers search online before visiting a business. Without a website, you're likely missing out on new customers who can't find you.

I'm Anthony from CloudHack, and I specialize in building modern, mobile-friendly websites for local businesses. I'd love to help {{business_name}} establish a strong online presence.

Here's what I can offer:
• Professional, custom-designed website
• Mobile-optimized for all devices
• SEO setup so customers can find you
• Fast turnaround (usually 2-3 weeks)

Would you be open to a quick 15-minute call to discuss how we could help? No pressure at all.

Best regards,
Anthony
CloudHack Consulting
cloudhack.dev`
    },
    {
      name: 'AI/Data Solutions Pitch',
      type: 'email',
      subject: 'Unlock Your Business Data with AI - {{business_name}}',
      body: `Hi,

I hope this email finds you well. I'm reaching out because I believe {{business_name}} could benefit significantly from modern data and AI solutions.

Many businesses in {{industry}} are sitting on valuable data that could:
• Automate repetitive tasks and save hours each week
• Provide insights into customer behavior and trends
• Help predict demand and optimize operations
• Create personalized customer experiences

At CloudHack, we specialize in practical AI implementations that deliver real ROI. We're not talking about buzzwords – we're talking about solutions that work.

Some examples of what we've done:
• Built custom dashboards that consolidate all business metrics
• Created AI chatbots that handle customer inquiries 24/7
• Developed inventory prediction systems that reduce waste

I'd love to learn more about {{business_name}} and explore if there's a fit. Would you have 20 minutes for a call this week?

Best,
Anthony
CloudHack Consulting`
    },
    {
      name: 'Cloud Migration Pitch',
      type: 'email',
      subject: 'Is {{business_name}} Ready for the Cloud?',
      body: `Hello,

Quick question: Is your business still running on local servers or outdated software?

If so, you might be missing out on the benefits of cloud technology:
• Access your business tools from anywhere
• Reduce IT costs and maintenance headaches
• Improve security with enterprise-grade protection
• Scale up or down as needed

I'm Anthony from CloudHack, and I help businesses like {{business_name}} make the transition to the cloud smoothly and cost-effectively.

We handle everything from planning to migration to ongoing support. Most importantly, we make sure your team actually knows how to use the new systems.

Interested in learning more? I'd be happy to do a quick assessment of your current setup and show you what's possible.

Let me know if you'd like to chat.

Best,
Anthony
CloudHack Consulting`
    },
    {
      name: 'Cold Call Script - No Website',
      type: 'phone',
      subject: null,
      body: `COLD CALL SCRIPT - No Website Business

[INTRODUCTION]
"Hi, is this the owner/manager of {{business_name}}? Great! My name is Anthony from CloudHack. I'm a web developer who works with local businesses in {{city}}."

[HOOK]
"I noticed {{business_name}} doesn't have a website yet, and I wanted to reach out because I've helped several businesses in your area get online and start attracting more customers."

[IF INTERESTED]
"That's great to hear! I'd love to learn more about your business. What do you typically offer? ... And how are most of your customers finding you right now?"

[VALUE PROPOSITION]
"Based on what you've told me, I think a simple, professional website could really help. Most of my clients see a noticeable increase in customer inquiries within the first month."

[CLOSE]
"Would you be open to meeting for coffee sometime this week? I can show you some examples of what I've done for similar businesses, completely no obligation."

[IF OBJECTION: "I don't need a website"]
"I totally understand. Many business owners I work with felt the same way at first. But think about it - when was the last time you Googled a business before visiting? Your customers are doing the same thing."

[IF OBJECTION: "I don't have time"]
"I completely get it - running a business is demanding. The good news is, I handle everything. You'd just need about 30 minutes total to give me the basic info about your business."

[IF OBJECTION: "It's too expensive"]
"Budget is definitely a concern for most small businesses. I offer flexible payment plans, and most of my websites pay for themselves within a few months through new customers. Can I at least give you a quote?"

[WRAP UP]
"Great talking with you! I'll send over some information and follow up in a few days. Thanks for your time!"`
    },
    {
      name: 'Follow-up Email',
      type: 'email',
      subject: 'Following up - {{business_name}}',
      body: `Hi,

I wanted to follow up on my previous email about helping {{business_name}} with [web development/AI solutions/cloud services].

I know you're busy running your business, so I'll keep this brief:

If you're interested in:
✓ Getting more customers through digital channels
✓ Automating time-consuming tasks
✓ Making your business more efficient

...I'd love to chat for just 15 minutes.

If now isn't the right time, no worries at all. Just let me know and I won't bother you again.

Best,
Anthony
CloudHack Consulting`
    },
    {
      name: 'LinkedIn Connection Message',
      type: 'linkedin',
      subject: null,
      body: `Hi {{owner_name}},

I noticed you run {{business_name}} in {{city}} - looks like a great business!

I'm a tech consultant who helps local businesses with web development, cloud solutions, and AI implementations. I'd love to connect and learn more about what you do.

No pitch, just looking to expand my network with fellow business owners in the area.

- Anthony`
    }
  ];

  const insert = db.prepare(`
    INSERT INTO templates (name, type, subject, body)
    VALUES (@name, @type, @subject, @body)
  `);

  for (const template of templates) {
    insert.run(template);
  }

  console.log('✅ Default templates seeded');
}

