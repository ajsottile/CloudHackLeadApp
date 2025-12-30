# CloudHack Outreach Tool

A powerful AI-driven outreach management platform for CloudHack consulting services. Find prospects, manage your pipeline, and let AI agents automate your sales outreach.

![CloudHack Outreach](https://via.placeholder.com/800x400/12121a/06b6d4?text=CloudHack+Outreach)

## Features

- **Business Discovery**: Search Yelp for businesses by location and category, filter by size
- **Pipeline Management**: Kanban-style board to track prospects through your sales pipeline
- **🤖 AI Agents**: Autonomous agents that handle outreach, follow-ups, and response classification
- **Outreach Templates**: Pre-built and custom templates for email, phone scripts, and LinkedIn messages
- **Email Campaigns**: Send personalized emails via SendGrid with tracking
- **Activity Tracking**: Full history of all interactions with each prospect
- **Notifications**: Real-time alerts for meeting requests and hot leads
- **Dashboard**: Overview of pipeline stats, agent activity, and quick actions

## AI Agent System

The platform includes an intelligent agent system that automates your sales pipeline:

### Agents

| Agent | What It Does |
|-------|--------------|
| **Outreach Agent** | Generates personalized cold emails using AI when prospects are added |
| **Follow-up Agent** | Sends automated follow-up sequences to non-responsive prospects |
| **Response Classifier** | Analyzes email replies to determine intent (interested, not interested, meeting request, etc.) |
| **Stage Manager** | Automatically moves prospects through pipeline stages based on their responses |

### How It Works

1. **Add a prospect** → Outreach Agent generates and sends a personalized email
2. **No response?** → Follow-up Agent sends up to 3 follow-ups on a schedule (3, 7, 14 days)
3. **They reply** → Response Classifier analyzes intent and notifies you
4. **Meeting requested** → You get notified, automation pauses, you take over
5. **Not interested** → Prospect moves to Lost, automation stops

### Supported LLM Providers

- **OpenAI** (GPT-4o-mini) - Fast, cost-effective
- **Anthropic** (Claude 3.5 Sonnet) - Great for nuanced communication

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS, React Query, React Router
- **Backend**: Node.js, Express
- **Database**: SQLite (via better-sqlite3)
- **AI**: OpenAI API, Anthropic API
- **Email**: SendGrid API
- **Data**: Yelp Fusion API

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone and install dependencies**:
   ```bash
   cd cloudhack-outreach
   npm run install:all
   ```

2. **Configure environment variables**:
   
   Create a `.env` file in the `server` directory:
   ```env
   # Yelp Fusion API Key (get at https://www.yelp.com/developers/v3/manage_app)
   YELP_API_KEY=your_yelp_api_key_here

   # SendGrid API Key (get at https://sendgrid.com/)
   SENDGRID_API_KEY=your_sendgrid_api_key_here
   SENDGRID_FROM_EMAIL=your_verified_email@example.com

   # AI Providers (at least one required for AI features)
   OPENAI_API_KEY=sk-...
   ANTHROPIC_API_KEY=sk-ant-...

   # Server port (optional)
   PORT=3001
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open the app**:
   Navigate to [http://localhost:5173](http://localhost:5173)

## Project Structure

```
cloudhack-outreach/
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API client
│   │   └── App.jsx          # Main app with routing
│   └── package.json
├── server/                  # Express backend
│   ├── agents/              # AI agent implementations
│   │   ├── orchestrator.js  # Agent coordination
│   │   ├── outreachAgent.js # Initial email generation
│   │   ├── followupAgent.js # Follow-up sequences
│   │   ├── responseAgent.js # Response classification
│   │   └── stageAgent.js    # Pipeline stage management
│   ├── services/            # Core services
│   │   ├── llm.js           # LLM abstraction layer
│   │   ├── scheduler.js     # Background job scheduler
│   │   └── notifications.js # Notification management
│   ├── routes/              # API routes
│   ├── db/                  # Database initialization
│   └── index.js             # Server entry point
├── package.json             # Root package.json
└── README.md
```

## API Endpoints

### Prospects
- `GET /api/prospects` - List all prospects
- `GET /api/prospects/:id` - Get prospect details
- `POST /api/prospects` - Create prospect (triggers Outreach Agent)
- `PUT /api/prospects/:id` - Update prospect
- `DELETE /api/prospects/:id` - Delete prospect

### Agents
- `GET /api/agents/config` - Get agent configuration
- `PUT /api/agents/config` - Update agent settings
- `GET /api/agents/stats` - Get agent statistics
- `POST /api/agents/trigger/outreach/:id` - Manually trigger outreach
- `POST /api/agents/trigger/followup/:id` - Manually trigger follow-up
- `PUT /api/agents/prospect/:id/automation` - Toggle automation per prospect

### Notifications
- `GET /api/agents/notifications` - Get all notifications
- `PUT /api/agents/notifications/:id/read` - Mark as read
- `PUT /api/agents/notifications/read-all` - Mark all as read

### Webhooks (for SendGrid)
- `POST /api/webhooks/sendgrid` - Email event webhook (delivered, opened, clicked)
- `POST /api/webhooks/sendgrid/inbound` - Inbound email parsing (replies)

## Usage

### AI Agents Dashboard

1. Go to **AI Agents** in the sidebar
2. View agent performance and task queue
3. Configure settings:
   - Toggle auto-outreach on/off
   - Set follow-up schedule (days between follow-ups)
   - Switch between OpenAI and Anthropic
4. Click **Process Tasks Now** to immediately run pending tasks

### Finding Prospects

1. Go to **Discovery**
2. Enter a location (city, state, or ZIP)
3. Select a business category
4. Toggle filters and sorting options
5. Click **Add to Pipeline** - AI will automatically send outreach!

### Managing Your Pipeline

1. Go to **Pipeline**
2. Drag and drop prospect cards between stages
3. Click a prospect to view details, activity, and AI controls
4. Toggle "Auto-pilot" to enable/disable automation per prospect

### Agent Configuration

In **AI Agents → Configuration**:

| Setting | Default | Description |
|---------|---------|-------------|
| LLM Provider | OpenAI | Switch between OpenAI/Anthropic |
| Auto Outreach | On | Auto-send when prospects added |
| Auto Classify | On | Auto-analyze email replies |
| Follow-up Days | 3,7,14 | Days between follow-up emails |
| Max Follow-ups | 3 | Stop after N unanswered emails |

## SendGrid Webhook Setup

To enable automatic response detection:

1. Go to SendGrid → Settings → Mail Settings → Event Webhook
2. Set HTTP POST URL to: `https://your-domain.com/api/webhooks/sendgrid`
3. Enable events: Delivered, Opened, Clicked, Bounced, Spam Report

For inbound email parsing (reply detection):

1. Go to SendGrid → Settings → Inbound Parse
2. Add your domain and set POST URL to: `https://your-domain.com/api/webhooks/sendgrid/inbound`

## Notes

- The app works without API keys using mock data for development
- AI features require OpenAI or Anthropic API key
- SendGrid requires a verified sender email address
- Yelp's free tier allows 5,000 API calls per day
- Database is stored in `server/cloudhack.db`

## License

MIT License - Use freely for your business outreach needs.

---

Built with ❤️ and 🤖 by CloudHack
