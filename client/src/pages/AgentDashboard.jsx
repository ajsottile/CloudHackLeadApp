import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Settings,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  Zap,
  Mail,
  MessageSquare,
  TrendingUp,
  ToggleLeft,
  ToggleRight,
  Send,
  Search,
  Globe,
  Database,
} from 'lucide-react';
import { agentsApi, enrichmentApi, prospectsApi } from '../services/api';

function AgentDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['agent-config'],
    queryFn: agentsApi.getConfig,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['agent-stats'],
    queryFn: agentsApi.getStats,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const { data: pendingTasks } = useQuery({
    queryKey: ['agent-tasks', 'pending'],
    queryFn: () => agentsApi.getTasks('pending'),
    refetchInterval: 5000,
  });

  const { data: recentTasks } = useQuery({
    queryKey: ['agent-tasks', 'completed'],
    queryFn: () => agentsApi.getTasks('completed'),
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ key, value }) => agentsApi.updateConfig(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-config'] });
    },
  });

  const processNowMutation = useMutation({
    mutationFn: agentsApi.processNow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-stats'] });
      queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
    },
  });

  const handleToggleConfig = (key, currentValue) => {
    const newValue = currentValue === 'true' ? 'false' : 'true';
    updateConfigMutation.mutate({ key, value: newValue });
  };

  const handleProviderChange = (provider) => {
    updateConfigMutation.mutate({ key: 'llm_provider', value: provider });
  };

  if (configLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
            <Bot className="w-8 h-8 text-cyan-500" />
            Agent Dashboard
          </h1>
          <p className="text-gray-400 mt-1">Monitor and configure your AI sales agents</p>
        </div>
        
        <button
          onClick={() => processNowMutation.mutate()}
          disabled={processNowMutation.isPending}
          className="btn-primary flex items-center gap-2"
        >
          {processNowMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          Process Tasks Now
        </button>
      </div>

      {/* Status Banners */}
      {!config?.llmConfigured && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">AI Not Configured</p>
            <p className="text-sm text-gray-400 mt-1">
              Add OPENAI_API_KEY or ANTHROPIC_API_KEY to your .env file to enable AI-powered agents.
            </p>
          </div>
        </div>
      )}

      {!config?.emailConfigured && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">Email Not Configured</p>
            <p className="text-sm text-gray-400 mt-1">
              Add RESEND_API_KEY to your .env file to enable email sending.
            </p>
          </div>
        </div>
      )}

      {/* Services Status */}
      {(config?.llmConfigured || config?.emailConfigured) && (
        <div className="flex gap-4">
          {config?.llmConfigured && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">AI: {config?.currentProvider}</span>
            </div>
          )}
          {config?.emailConfigured && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
              <Send className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Email: {config?.emailFrom}</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-dark-600 pb-2">
        {['overview', 'configuration', 'enrichment', 'tasks'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg capitalize transition-colors ${
              activeTab === tab
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-gray-400 hover:text-white hover:bg-dark-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Clock className="w-5 h-5" />}
              label="Pending Tasks"
              value={stats?.taskStats?.pending || 0}
              color="cyan"
            />
            <StatCard
              icon={<Activity className="w-5 h-5" />}
              label="Processing"
              value={stats?.taskStats?.processing || 0}
              color="amber"
            />
            <StatCard
              icon={<CheckCircle className="w-5 h-5" />}
              label="Completed"
              value={stats?.taskStats?.completed || 0}
              color="green"
            />
            <StatCard
              icon={<XCircle className="w-5 h-5" />}
              label="Failed"
              value={stats?.taskStats?.failed || 0}
              color="red"
            />
          </div>

          {/* Agent Performance */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
            <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-500" />
              Agent Performance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats?.tasksByAgent?.map((agent) => (
                <div key={agent.agent_type} className="bg-dark-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getAgentIcon(agent.agent_type)}
                    <span className="text-white font-medium capitalize">
                      {agent.agent_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">{agent.total}</div>
                  <div className="flex gap-3 text-sm mt-1">
                    <span className="text-green-400">{agent.completed} done</span>
                    <span className="text-red-400">{agent.failed} failed</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
            <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-500" />
              Recent Agent Activity
            </h2>
            <div className="space-y-2">
              {stats?.recentTasks?.slice(0, 10).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between py-2 border-b border-dark-600 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    {getAgentIcon(task.agent_type)}
                    <div>
                      <span className="text-white capitalize">
                        {task.agent_type.replace('_', ' ')}
                      </span>
                      {task.business_name && (
                        <span className="text-gray-400 ml-2">
                          → {task.business_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={task.status} />
                    <span className="text-xs text-gray-500">
                      {new Date(task.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
              {(!stats?.recentTasks || stats.recentTasks.length === 0) && (
                <p className="text-gray-400 text-center py-4">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Configuration Tab */}
      {activeTab === 'configuration' && (
        <div className="space-y-6">
          {/* LLM Provider */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
            <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-500" />
              AI Provider
            </h2>
            <div className="flex gap-4">
              {['openai', 'anthropic'].map((provider) => (
                <button
                  key={provider}
                  onClick={() => handleProviderChange(provider)}
                  disabled={!config?.availableProviders?.includes(provider)}
                  className={`px-6 py-3 rounded-lg border transition-all ${
                    config?.currentProvider === provider
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                      : config?.availableProviders?.includes(provider)
                      ? 'border-dark-500 text-gray-400 hover:border-cyan-500'
                      : 'border-dark-600 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <div className="font-medium capitalize">{provider}</div>
                  <div className="text-xs mt-1">
                    {config?.availableProviders?.includes(provider) 
                      ? 'Configured' 
                      : 'Not configured'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Email Service */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
            <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
              <Send className="w-5 h-5 text-cyan-500" />
              Email Service
            </h2>
            <div className="flex gap-4">
              <div className={`px-6 py-3 rounded-lg border ${
                config?.emailConfigured
                  ? 'bg-green-500/20 border-green-500 text-green-400'
                  : 'border-dark-500 text-gray-400'
              }`}>
                <div className="font-medium">Resend</div>
                <div className="text-xs mt-1">
                  {config?.emailConfigured ? `From: ${config?.emailFrom}` : 'Not configured'}
                </div>
              </div>
            </div>
            {!config?.emailConfigured && (
              <p className="text-sm text-gray-400 mt-4">
                Add RESEND_API_KEY and RESEND_FROM_EMAIL to your .env file to enable email sending.
              </p>
            )}
          </div>

          {/* Automation Settings */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
            <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-cyan-500" />
              Automation Settings
            </h2>
            <div className="space-y-4">
              <ConfigToggle
                label="Auto Outreach"
                description="Automatically send initial outreach when prospects are added"
                enabled={config?.auto_outreach === 'true'}
                onChange={() => handleToggleConfig('auto_outreach', config?.auto_outreach)}
              />
              <ConfigToggle
                label="Auto Classify Responses"
                description="Automatically analyze and classify prospect replies"
                enabled={config?.auto_classify === 'true'}
                onChange={() => handleToggleConfig('auto_classify', config?.auto_classify)}
              />
            </div>
          </div>

          {/* Follow-up Settings */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
            <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-cyan-500" />
              Follow-up Settings
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Follow-up Schedule (days)
                </label>
                <input
                  type="text"
                  value={config?.follow_up_days || '3,7,14'}
                  onChange={(e) => 
                    updateConfigMutation.mutate({ key: 'follow_up_days', value: e.target.value })
                  }
                  placeholder="3,7,14"
                  className="input-field w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Comma-separated days between follow-ups
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Follow-ups
                </label>
                <input
                  type="number"
                  value={config?.max_follow_ups || 3}
                  onChange={(e) => 
                    updateConfigMutation.mutate({ key: 'max_follow_ups', value: e.target.value })
                  }
                  min={1}
                  max={10}
                  className="input-field w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Stop after this many unanswered emails
                </p>
              </div>
            </div>
          </div>

          {/* Token Usage */}
          {stats?.tokenUsage && (
            <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
              <h2 className="text-lg font-display font-semibold text-white mb-4">
                Token Usage (This Session)
              </h2>
              <div className="flex gap-8">
                <div>
                  <div className="text-2xl font-bold text-white">
                    {stats.tokenUsage.openai?.toLocaleString() || 0}
                  </div>
                  <div className="text-sm text-gray-400">OpenAI Tokens</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">
                    {stats.tokenUsage.anthropic?.toLocaleString() || 0}
                  </div>
                  <div className="text-sm text-gray-400">Anthropic Tokens</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Enrichment Tab */}
      {activeTab === 'enrichment' && (
        <EnrichmentTab queryClient={queryClient} />
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-6">
          {/* Pending Tasks */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
            <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Pending Tasks ({pendingTasks?.length || 0})
            </h2>
            <div className="space-y-2">
              {pendingTasks?.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
              {(!pendingTasks || pendingTasks.length === 0) && (
                <p className="text-gray-400 text-center py-4">No pending tasks</p>
              )}
            </div>
          </div>

          {/* Completed Tasks */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
            <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Recent Completed Tasks
            </h2>
            <div className="space-y-2">
              {recentTasks?.slice(0, 20).map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
              {(!recentTasks || recentTasks.length === 0) && (
                <p className="text-gray-400 text-center py-4">No completed tasks</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function StatCard({ icon, label, value, color }) {
  const colorClasses = {
    cyan: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    green: 'bg-green-500/10 text-green-500 border-green-500/30',
    red: 'bg-red-500/10 text-red-500 border-red-500/30',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const statusConfig = {
    pending: { color: 'amber', icon: <Clock className="w-3 h-3" /> },
    processing: { color: 'blue', icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
    completed: { color: 'green', icon: <CheckCircle className="w-3 h-3" /> },
    failed: { color: 'red', icon: <XCircle className="w-3 h-3" /> },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
      ${config.color === 'amber' ? 'bg-amber-500/20 text-amber-400' : ''}
      ${config.color === 'blue' ? 'bg-blue-500/20 text-blue-400' : ''}
      ${config.color === 'green' ? 'bg-green-500/20 text-green-400' : ''}
      ${config.color === 'red' ? 'bg-red-500/20 text-red-400' : ''}
    `}>
      {config.icon}
      {status}
    </span>
  );
}

function ConfigToggle({ label, description, enabled, onChange }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-white font-medium">{label}</div>
        <div className="text-sm text-gray-400">{description}</div>
      </div>
      <button
        onClick={onChange}
        className={`p-1 rounded-lg transition-colors ${
          enabled ? 'text-cyan-500' : 'text-gray-500'
        }`}
      >
        {enabled ? (
          <ToggleRight className="w-8 h-8" />
        ) : (
          <ToggleLeft className="w-8 h-8" />
        )}
      </button>
    </div>
  );
}

function TaskCard({ task }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-dark-700 rounded-lg">
      <div className="flex items-center gap-3">
        {getAgentIcon(task.agent_type)}
        <div>
          <div className="text-white capitalize">
            {task.agent_type.replace('_', ' ')}
          </div>
          {task.business_name && (
            <div className="text-sm text-gray-400">{task.business_name}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={task.status} />
        <div className="text-xs text-gray-500">
          {task.scheduled_for 
            ? `Scheduled: ${new Date(task.scheduled_for).toLocaleString()}`
            : new Date(task.created_at).toLocaleString()
          }
        </div>
      </div>
    </div>
  );
}

function getAgentIcon(agentType) {
  switch (agentType) {
    case 'outreach':
      return <Mail className="w-4 h-4 text-cyan-500" />;
    case 'followup':
      return <RefreshCw className="w-4 h-4 text-amber-500" />;
    case 'response_classifier':
      return <MessageSquare className="w-4 h-4 text-purple-500" />;
    case 'stage_manager':
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    default:
      return <Bot className="w-4 h-4 text-gray-500" />;
  }
}

// Enrichment Tab Component
function EnrichmentTab({ queryClient }) {
  const [enrichingId, setEnrichingId] = useState(null);
  const [enrichResults, setEnrichResults] = useState({});

  const { data: enrichmentStatus } = useQuery({
    queryKey: ['enrichment-status'],
    queryFn: enrichmentApi.getStatus,
  });

  const { data: prospects = [] } = useQuery({
    queryKey: ['prospects'],
    queryFn: () => prospectsApi.getAll(),
  });

  const enrichAllMutation = useMutation({
    mutationFn: enrichmentApi.enrichAllMissingEmail,
    onSuccess: (data) => {
      alert(`Started enrichment for ${data.prospectIds?.length || 0} prospects`);
    },
  });

  const handleEnrichProspect = async (prospectId) => {
    setEnrichingId(prospectId);
    try {
      const result = await enrichmentApi.enrichProspect(prospectId);
      setEnrichResults(prev => ({ ...prev, [prospectId]: result }));
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    } catch (error) {
      setEnrichResults(prev => ({ ...prev, [prospectId]: { error: error.message } }));
    }
    setEnrichingId(null);
  };

  const prospectsNeedingEnrichment = prospects.filter(p => !p.email);

  return (
    <div className="space-y-6">
      {/* Enrichment Service Status */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-500" />
          Data Enrichment Services
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          Enrichment automatically finds missing contact information (websites, emails, phone numbers) for your prospects.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ServiceCard 
            name="Yelp Business Details"
            configured={enrichmentStatus?.yelpConfigured}
            description="Get business website & phone from Yelp"
            envVar="YELP_API_KEY"
          />
          <ServiceCard 
            name="Google Custom Search"
            configured={enrichmentStatus?.googleConfigured}
            description="Search Google for business websites"
            envVar="GOOGLE_API_KEY + GOOGLE_CSE_ID"
            free="100 queries/day free"
          />
          <ServiceCard 
            name="Hunter.io"
            configured={enrichmentStatus?.hunterConfigured}
            description="Find business emails from domains"
            envVar="HUNTER_API_KEY"
            free="25 lookups/month free"
          />
        </div>
      </div>

      {/* Bulk Enrichment */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-display font-semibold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-cyan-500" />
              Enrich All Missing Emails
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {prospectsNeedingEnrichment.length} prospects are missing email addresses
            </p>
          </div>
          <button
            onClick={() => enrichAllMutation.mutate()}
            disabled={enrichAllMutation.isPending || prospectsNeedingEnrichment.length === 0}
            className="btn-primary flex items-center gap-2"
          >
            {enrichAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Enrich All ({prospectsNeedingEnrichment.length})
          </button>
        </div>
      </div>

      {/* Individual Prospect Enrichment */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-cyan-500" />
          Prospects Needing Contact Info
        </h2>
        
        {prospectsNeedingEnrichment.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            All prospects have email addresses! 🎉
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {prospectsNeedingEnrichment.slice(0, 20).map((prospect) => (
              <div 
                key={prospect.id}
                className="flex items-center justify-between py-3 px-4 bg-dark-700 rounded-lg"
              >
                <div>
                  <p className="text-white font-medium">{prospect.business_name}</p>
                  <p className="text-sm text-gray-400">
                    {prospect.city}, {prospect.state} • 
                    {prospect.website_url ? (
                      <span className="text-green-400 ml-1">Has website</span>
                    ) : (
                      <span className="text-amber-400 ml-1">No website</span>
                    )}
                    {prospect.phone ? (
                      <span className="text-green-400 ml-2">Has phone</span>
                    ) : (
                      <span className="text-amber-400 ml-2">No phone</span>
                    )}
                  </p>
                  {enrichResults[prospect.id] && (
                    <p className={`text-xs mt-1 ${enrichResults[prospect.id].enriched ? 'text-green-400' : 'text-gray-500'}`}>
                      {enrichResults[prospect.id].enriched 
                        ? `✓ Found: ${enrichResults[prospect.id].results?.methods?.join(', ')}`
                        : enrichResults[prospect.id].error || 'No new data found'
                      }
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleEnrichProspect(prospect.id)}
                  disabled={enrichingId === prospect.id}
                  className="btn-secondary btn-sm flex items-center gap-2"
                >
                  {enrichingId === prospect.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Enrich
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceCard({ name, configured, description, envVar, free }) {
  return (
    <div className={`p-4 rounded-lg border ${
      configured 
        ? 'bg-green-500/10 border-green-500/30' 
        : 'bg-dark-700 border-dark-600'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        {configured ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-gray-500" />
        )}
        <span className={`font-medium ${configured ? 'text-green-400' : 'text-gray-400'}`}>
          {name}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-2">{description}</p>
      {!configured && (
        <p className="text-xs text-amber-400">
          Add {envVar} to .env
        </p>
      )}
      {free && (
        <p className="text-xs text-cyan-400 mt-1">{free}</p>
      )}
    </div>
  );
}

export default AgentDashboard;

