import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './db/init.js';
import prospectsRouter from './routes/prospects.js';
import templatesRouter from './routes/templates.js';
import campaignsRouter from './routes/campaigns.js';
import yelpRouter from './routes/yelp.js';
import activitiesRouter from './routes/activities.js';
import statsRouter from './routes/stats.js';
import agentsRouter from './routes/agents.js';
import enrichmentRouter from './routes/enrichment.js';
import llmService from './services/llm.js';
import emailService from './services/email.js';
import scheduler from './services/scheduler.js';
import enrichmentService from './services/enrichment.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

// Initialize database
initializeDatabase();

// Initialize LLM service
llmService.initialize();
console.log('🧠 LLM Service initialized:', {
  configured: llmService.isConfigured(),
  providers: llmService.getAvailableProviders(),
  defaultProvider: llmService.getProvider(),
});

// Initialize Email service
emailService.initialize();
console.log('📧 Email Service:', {
  configured: emailService.isReady(),
  from: emailService.getFromEmail(),
});

// Initialize and start the scheduler
scheduler.start();

// Log enrichment service status
console.log('🔍 Enrichment Service:', enrichmentService.getStats());

// Routes
app.use('/api/prospects', prospectsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/yelp', yelpRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/enrichment', enrichmentRouter);

// Webhook routes (need to be separate for SendGrid)
app.use('/api/webhooks', campaignsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    llm: {
      configured: llmService.isConfigured(),
      provider: llmService.getProvider(),
    },
    email: {
      configured: emailService.isReady(),
      from: emailService.getFromEmail(),
    },
    scheduler: {
      jobs: scheduler.getStatus().length,
    },
  });
});

app.listen(PORT, () => {
  console.log(`🚀 CloudHack Outreach Server running on http://localhost:${PORT}`);
});
