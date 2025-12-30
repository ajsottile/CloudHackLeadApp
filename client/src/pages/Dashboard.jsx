import { useQuery } from '@tanstack/react-query';
import { 
  Users, 
  Send, 
  TrendingUp, 
  Clock,
  ArrowRight,
  Mail,
  Phone,
  MessageSquare,
  UserPlus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { statsApi } from '../services/api';

const stages = [
  { key: 'new', label: 'New', color: 'bg-gray-500' },
  { key: 'contacted', label: 'Contacted', color: 'bg-blue-500' },
  { key: 'responded', label: 'Responded', color: 'bg-cyan-500' },
  { key: 'meeting', label: 'Meeting', color: 'bg-violet-500' },
  { key: 'proposal', label: 'Proposal', color: 'bg-amber-500' },
  { key: 'won', label: 'Won', color: 'bg-emerald-500' },
  { key: 'lost', label: 'Lost', color: 'bg-red-500' },
];

const activityIcons = {
  created: UserPlus,
  email_sent: Mail,
  email_drafted: Mail,
  stage_change: TrendingUp,
  call: Phone,
  note: MessageSquare,
};

function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: statsApi.getDashboard,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Welcome back to CloudHack Outreach</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Prospects"
          value={stats?.totalProspects || 0}
          icon={Users}
          color="cyan"
        />
        <StatCard
          title="Emails Sent"
          value={stats?.campaigns?.sent || 0}
          icon={Send}
          color="violet"
        />
        <StatCard
          title="New This Week"
          value={stats?.thisWeek?.newProspects || 0}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          title="Pending Drafts"
          value={stats?.campaigns?.drafts || 0}
          icon={Clock}
          color="amber"
        />
      </div>

      {/* Pipeline Overview */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-semibold text-white">Pipeline Overview</h2>
          <Link 
            to="/pipeline" 
            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            View Pipeline <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {stages.map((stage) => (
            <div 
              key={stage.key}
              className="bg-dark-700 rounded-lg p-4 text-center"
            >
              <div className={`w-3 h-3 rounded-full ${stage.color} mx-auto mb-2`} />
              <div className="text-2xl font-bold text-white">
                {stats?.pipeline?.[stage.key] || 0}
              </div>
              <div className="text-sm text-gray-400">{stage.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
          <h2 className="text-xl font-display font-semibold text-white mb-4">Recent Activity</h2>
          
          {stats?.recentActivities?.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivities.map((activity) => {
                const Icon = activityIcons[activity.type] || Clock;
                return (
                  <Link
                    key={activity.id}
                    to={`/prospect/${activity.prospect_id}`}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-dark-700 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{activity.description}</p>
                      <p className="text-xs text-gray-500">
                        {activity.business_name} · {formatTime(activity.created_at)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No recent activity</p>
              <p className="text-sm mt-1">Start by discovering new prospects</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
          <h2 className="text-xl font-display font-semibold text-white mb-4">Quick Actions</h2>
          
          <div className="space-y-3">
            <Link
              to="/discovery"
              className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/30 hover:border-cyan-500/50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="font-medium text-white">Find New Prospects</p>
                <p className="text-sm text-gray-400">Search Yelp for businesses</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 ml-auto" />
            </Link>
            
            <Link
              to="/templates"
              className="flex items-center gap-4 p-4 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Mail className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="font-medium text-white">Manage Templates</p>
                <p className="text-sm text-gray-400">Email, phone, and LinkedIn</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 ml-auto" />
            </Link>
            
            <Link
              to="/campaigns"
              className="flex items-center gap-4 p-4 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Send className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="font-medium text-white">View Campaigns</p>
                <p className="text-sm text-gray-400">Track sent emails</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 ml-auto" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
  const colorClasses = {
    cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 text-cyan-400',
    violet: 'from-violet-500/20 to-violet-500/5 border-violet-500/30 text-violet-400',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl border p-5`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl bg-dark-800/50 flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${colorClasses[color].split(' ').pop()}`} />
        </div>
      </div>
    </div>
  );
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default Dashboard;

