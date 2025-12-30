import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Mail,
  Clock,
  Check,
  AlertCircle,
  ExternalLink,
  FileText,
  X,
  Eye,
  Copy,
  CheckCircle,
  Building2,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { campaignsApi } from '../services/api';

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30' },
  draft: { label: 'Draft', icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  sent: { label: 'Sent', icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  delivered: { label: 'Delivered', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  opened: { label: 'Opened', icon: Eye, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  clicked: { label: 'Clicked', icon: ExternalLink, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  failed: { label: 'Failed', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  bounced: { label: 'Bounced', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

function Campaigns() {
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const queryClient = useQueryClient();
  
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignsApi.getAll,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Group campaigns by status
  const sent = campaigns.filter(c => c.status === 'sent');
  const drafts = campaigns.filter(c => c.status === 'draft');
  const pending = campaigns.filter(c => c.status === 'pending');
  const failed = campaigns.filter(c => c.status === 'failed');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-white">Campaigns</h1>
        <p className="text-gray-400 mt-1">Track your email outreach campaigns</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Sent" value={sent.length} icon={Check} color="emerald" />
        <StatCard label="Drafts" value={drafts.length} icon={FileText} color="amber" />
        <StatCard label="Pending" value={pending.length} icon={Clock} color="gray" />
        <StatCard label="Failed" value={failed.length} icon={AlertCircle} color="red" />
      </div>

      {/* Campaigns List */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="p-5 border-b border-dark-600">
          <h2 className="text-lg font-semibold text-white">All Campaigns</h2>
        </div>
        
        {campaigns.length > 0 ? (
          <div className="divide-y divide-dark-600">
            {campaigns.map((campaign) => (
              <CampaignRow 
                key={campaign.id} 
                campaign={campaign} 
                onClick={() => setSelectedCampaign(campaign)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Send className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No campaigns yet</p>
            <p className="text-sm mt-1">
              Go to a prospect and send them an email to create a campaign
            </p>
          </div>
        )}
      </div>

      {/* Email Detail Modal */}
      {selectedCampaign && (
        <EmailDetailModal 
          campaign={selectedCampaign} 
          onClose={() => setSelectedCampaign(null)}
          queryClient={queryClient}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  const colorClasses = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    gray: 'text-gray-400 bg-gray-500/10',
    red: 'text-red-400 bg-red-500/10',
  };

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-sm text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

function CampaignRow({ campaign, onClick }) {
  const status = statusConfig[campaign.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div 
      className="p-5 hover:bg-dark-700/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg ${status.bg} flex items-center justify-center flex-shrink-0`}>
          <StatusIcon className={`w-5 h-5 ${status.color}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="font-medium text-white hover:text-cyan-400 transition-colors">
                {campaign.business_name || 'Unknown Business'}
              </span>
              <p className="text-sm text-gray-400 mt-1">
                {campaign.prospect_email ? (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    {campaign.prospect_email}
                  </span>
                ) : (
                  <span className="text-gray-500 italic">No email address</span>
                )}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <div className={`px-2 py-1 rounded text-xs font-medium ${status.bg} ${status.color}`}>
                {status.label}
              </div>
              <Eye className="w-4 h-4 text-gray-500" />
            </div>
          </div>
          
          {campaign.subject && (
            <p className="text-sm text-gray-300 mt-2 line-clamp-1">
              <span className="text-gray-500">Subject:</span> {campaign.subject}
            </p>
          )}
          
          {campaign.template_name && (
            <p className="text-xs text-gray-500 mt-1">
              Template: {campaign.template_name}
            </p>
          )}
          
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span>Created: {formatDate(campaign.created_at)}</span>
            {campaign.sent_at && (
              <span>Sent: {formatDate(campaign.sent_at)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailDetailModal({ campaign, onClose, queryClient }) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const status = statusConfig[campaign.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  const handleCopyBody = () => {
    navigator.clipboard.writeText(campaign.body || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = async () => {
    setSending(true);
    setSendError(null);
    
    try {
      const response = await fetch(`http://localhost:3001/api/campaigns/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectId: campaign.prospect_id,
          customSubject: campaign.subject,
          customBody: campaign.body,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send email');
      }
      
      setSendSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      
      // Close modal after 2 seconds on success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      setSendError(error.message);
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    setSendError(null);
    
    try {
      const response = await fetch(`http://localhost:3001/api/campaigns/${campaign.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to retry email');
      }
      
      setSendSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      
      // Close modal after 2 seconds on success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      setSendError(error.message);
    } finally {
      setRetrying(false);
    }
  };

  const canSend = campaign.status === 'draft' && campaign.prospect_email;
  const canRetry = campaign.status === 'failed' && campaign.prospect_email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-dark-800 rounded-xl border border-dark-600 w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-600">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${status.bg} flex items-center justify-center`}>
              <StatusIcon className={`w-5 h-5 ${status.color}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Email Details</h2>
              <p className="text-sm text-gray-400">{campaign.business_name}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(85vh-140px)]">
          {/* Meta Info */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ${status.bg} ${status.color} text-sm font-medium`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {status.label}
              </div>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Recipient</p>
              <p className="text-sm text-white">
                {campaign.prospect_email || <span className="text-gray-500 italic">No email address</span>}
              </p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Created</p>
              <p className="text-sm text-white">{formatDate(campaign.created_at)}</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Sent</p>
              <p className="text-sm text-white">
                {campaign.sent_at ? formatDate(campaign.sent_at) : <span className="text-gray-500">Not sent</span>}
              </p>
            </div>
          </div>

          {/* Subject */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wide">Subject</label>
            <div className="bg-dark-700 rounded-lg p-4 border border-dark-600">
              <p className="text-white font-medium">{campaign.subject || <span className="text-gray-500 italic">No subject</span>}</p>
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 uppercase tracking-wide">Email Body</label>
              <button
                onClick={handleCopyBody}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-300 transition-colors"
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="bg-dark-700 rounded-lg p-4 border border-dark-600">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                {campaign.body || <span className="text-gray-500 italic">No content</span>}
              </pre>
            </div>
          </div>
        </div>

        {/* Send Error/Success */}
        {sendError && (
          <div className="mx-5 mb-0 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {sendError}
          </div>
        )}
        {sendSuccess && (
          <div className="mx-5 mb-0 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Email sent successfully!
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-dark-600 bg-dark-900/50">
          <Link
            to={`/prospect/${campaign.prospect_id}`}
            className="flex items-center gap-2 px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            onClick={onClose}
          >
            <Building2 className="w-4 h-4" />
            View Prospect
          </Link>
          <div className="flex items-center gap-3">
            {/* Send button for drafts */}
            {canSend && !sendSuccess && (
              <button
                onClick={handleSendEmail}
                disabled={sending}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-500/50 text-white rounded-lg transition-colors"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Email
                  </>
                )}
              </button>
            )}
            {/* Retry button for failed campaigns */}
            {canRetry && !sendSuccess && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-white rounded-lg transition-colors"
              >
                {retrying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Retry Send
                  </>
                )}
              </button>
            )}
            {/* No email warning for drafts/failed without email */}
            {(campaign.status === 'draft' || campaign.status === 'failed') && !campaign.prospect_email && (
              <span className="text-amber-400 text-sm flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                No email address
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString();
}

export default Campaigns;

