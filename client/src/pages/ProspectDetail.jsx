import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Mail, Globe, MapPin, Star, ExternalLink,
  Edit2, Trash2, Save, X, Send, MessageSquare, Clock, Check,
  Bot, Zap, ToggleLeft, ToggleRight, RefreshCw, Loader2
} from 'lucide-react';
import { prospectsApi, activitiesApi, campaignsApi, templatesApi, agentsApi } from '../services/api';

const stages = [
  { key: 'new', label: 'New', color: 'gray' },
  { key: 'contacted', label: 'Contacted', color: 'blue' },
  { key: 'responded', label: 'Responded', color: 'cyan' },
  { key: 'meeting', label: 'Meeting', color: 'violet' },
  { key: 'proposal', label: 'Proposal', color: 'amber' },
  { key: 'won', label: 'Won', color: 'emerald' },
  { key: 'lost', label: 'Lost', color: 'red' },
];

function ProspectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);

  const { data: prospect, isLoading } = useQuery({
    queryKey: ['prospect', id],
    queryFn: () => prospectsApi.getById(id),
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', id],
    queryFn: () => activitiesApi.getByProspect(id),
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['prospect-campaigns', id],
    queryFn: () => campaignsApi.getByProspect(id),
  });

  const { data: followUpSequence } = useQuery({
    queryKey: ['follow-up-sequence', id],
    queryFn: () => agentsApi.getSequence(id),
  });

  const updateMutation = useMutation({
    mutationFn: (updates) => prospectsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospect', id] });
      queryClient.invalidateQueries({ queryKey: ['activities', id] });
      setIsEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => prospectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      navigate('/pipeline');
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: (description) => activitiesApi.create({ prospect_id: parseInt(id), type: 'note', description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', id] });
      setShowNoteModal(false);
    },
  });

  const toggleAutomationMutation = useMutation({
    mutationFn: (enabled) => agentsApi.toggleAutomation(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospect', id] });
      queryClient.invalidateQueries({ queryKey: ['follow-up-sequence', id] });
    },
  });

  const triggerOutreachMutation = useMutation({
    mutationFn: () => agentsApi.triggerOutreach(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', id] });
      queryClient.invalidateQueries({ queryKey: ['prospect-campaigns', id] });
      queryClient.invalidateQueries({ queryKey: ['prospect', id] });
    },
  });

  const triggerFollowupMutation = useMutation({
    mutationFn: () => agentsApi.triggerFollowup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', id] });
      queryClient.invalidateQueries({ queryKey: ['prospect-campaigns', id] });
      queryClient.invalidateQueries({ queryKey: ['follow-up-sequence', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Prospect not found</p>
        <Link to="/pipeline" className="text-cyan-400 hover:text-cyan-300 mt-2 inline-block">
          Back to Pipeline
        </Link>
      </div>
    );
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this prospect?')) {
      deleteMutation.mutate();
    }
  };

  const handleStageChange = (newStage) => {
    updateMutation.mutate({ stage: newStage });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-dark-700 transition-colors text-gray-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold text-white">{prospect.business_name}</h1>
          {prospect.category && <p className="text-gray-400 text-sm mt-1">{prospect.category}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-3 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-gray-300 transition-colors">
            <Edit2 className="w-4 h-4" /> Edit
          </button>
          <button onClick={handleDelete} className="flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      {/* Stage Selector */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-4">
        <p className="text-sm text-gray-400 mb-3">Pipeline Stage</p>
        <div className="flex flex-wrap gap-2">
          {stages.map((stage) => (
            <button
              key={stage.key}
              onClick={() => handleStageChange(stage.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                prospect.stage === stage.key
                  ? `bg-${stage.color}-500/20 text-${stage.color}-400 border border-${stage.color}-500/50`
                  : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
              }`}
            >
              {stage.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Contact Information</h2>
            <div className="space-y-4">
              {prospect.phone && (
                <InfoRow icon={Phone} label="Phone">
                  <a href={`tel:${prospect.phone}`} className="text-cyan-400 hover:text-cyan-300">{prospect.phone}</a>
                </InfoRow>
              )}
              {prospect.email && (
                <InfoRow icon={Mail} label="Email">
                  <a href={`mailto:${prospect.email}`} className="text-cyan-400 hover:text-cyan-300">{prospect.email}</a>
                </InfoRow>
              )}
              {(prospect.address || prospect.city) && (
                <InfoRow icon={MapPin} label="Address">
                  {[prospect.address, prospect.city, prospect.state, prospect.zip_code].filter(Boolean).join(', ')}
                </InfoRow>
              )}
              {prospect.website_url && (
                <InfoRow icon={Globe} label="Website">
                  <a href={prospect.website_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                    {prospect.website_url} <ExternalLink className="w-3 h-3" />
                  </a>
                </InfoRow>
              )}
              {prospect.yelp_url && (
                <InfoRow icon={Star} label="Yelp">
                  <a href={prospect.yelp_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                    View on Yelp <ExternalLink className="w-3 h-3" />
                  </a>
                  {prospect.rating && <span className="ml-3 text-amber-400">{prospect.rating} ★ ({prospect.review_count} reviews)</span>}
                </InfoRow>
              )}
              {!prospect.website_url && (
                <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                  <p className="text-sm text-cyan-400">💡 This business doesn't have a website - great opportunity!</p>
                </div>
              )}
            </div>
          </div>

          {prospect.notes && (
            <div className="bg-dark-800 rounded-xl border border-dark-600 p-5">
              <h2 className="text-lg font-semibold text-white mb-3">Notes</h2>
              <p className="text-gray-300 whitespace-pre-wrap">{prospect.notes}</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <button onClick={() => setShowEmailModal(true)} className="w-full flex items-center gap-3 px-4 py-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 hover:bg-cyan-500/20 transition-colors">
                <Send className="w-5 h-5" /> Send Email
              </button>
              <button onClick={() => setShowNoteModal(true)} className="w-full flex items-center gap-3 px-4 py-3 bg-dark-700 rounded-lg text-gray-300 hover:bg-dark-600 transition-colors">
                <MessageSquare className="w-5 h-5" /> Add Note
              </button>
              {prospect.phone && (
                <a href={`tel:${prospect.phone}`} className="w-full flex items-center gap-3 px-4 py-3 bg-dark-700 rounded-lg text-gray-300 hover:bg-dark-600 transition-colors">
                  <Phone className="w-5 h-5" /> Call
                </a>
              )}
            </div>
          </div>

          {/* AI Agent Controls */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-5">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-500" /> AI Automation
            </h2>
            
            {/* Automation Toggle */}
            <div className="flex items-center justify-between py-2 border-b border-dark-600">
              <div>
                <div className="text-white text-sm font-medium">Auto-pilot</div>
                <div className="text-xs text-gray-400">Let AI manage outreach</div>
              </div>
              <button
                onClick={() => toggleAutomationMutation.mutate(!prospect.automation_enabled)}
                className={`p-1 rounded-lg transition-colors ${
                  prospect.automation_enabled ? 'text-cyan-500' : 'text-gray-500'
                }`}
              >
                {prospect.automation_enabled ? (
                  <ToggleRight className="w-8 h-8" />
                ) : (
                  <ToggleLeft className="w-8 h-8" />
                )}
              </button>
            </div>

            {/* Follow-up Sequence Status */}
            {followUpSequence && (
              <div className="py-3 border-b border-dark-600">
                <div className="text-xs text-gray-400 mb-1">Follow-up Progress</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-dark-600 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 transition-all"
                      style={{ width: `${(followUpSequence.sequence_step / followUpSequence.max_steps) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">
                    {followUpSequence.sequence_step}/{followUpSequence.max_steps}
                  </span>
                </div>
                {followUpSequence.next_send_at && !followUpSequence.is_paused && (
                  <div className="text-xs text-gray-500 mt-1">
                    Next follow-up: {new Date(followUpSequence.next_send_at).toLocaleDateString()}
                  </div>
                )}
                {followUpSequence.is_paused && (
                  <div className="text-xs text-amber-400 mt-1">Sequence paused</div>
                )}
              </div>
            )}

            {/* Manual Agent Triggers */}
            <div className="space-y-2 pt-3">
              <button
                onClick={() => triggerOutreachMutation.mutate()}
                disabled={triggerOutreachMutation.isPending || !prospect.email}
                className="w-full flex items-center gap-3 px-4 py-2 bg-violet-500/10 border border-violet-500/30 rounded-lg text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {triggerOutreachMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                <span className="text-sm">Generate AI Outreach</span>
              </button>
              
              <button
                onClick={() => triggerFollowupMutation.mutate()}
                disabled={triggerFollowupMutation.isPending || prospect.stage !== 'contacted' || !prospect.email}
                className="w-full flex items-center gap-3 px-4 py-2 bg-dark-700 rounded-lg text-gray-300 hover:bg-dark-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {triggerFollowupMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span className="text-sm">Send Follow-up Now</span>
              </button>
            </div>

            {!prospect.email && (
              <div className="mt-3 text-xs text-amber-400">
                ⚠️ Add an email address to enable AI outreach
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="bg-dark-800 rounded-xl border border-dark-600 p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Activity</h2>
            {activities.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 text-sm">
                    <Clock className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-300">{activity.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{new Date(activity.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No activity yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <EmailModal
          prospect={prospect}
          onClose={() => setShowEmailModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['activities', id] });
            queryClient.invalidateQueries({ queryKey: ['prospect-campaigns', id] });
            queryClient.invalidateQueries({ queryKey: ['prospect', id] });
          }}
        />
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <NoteModal
          onClose={() => setShowNoteModal(false)}
          onSave={(note) => addNoteMutation.mutate(note)}
          isSaving={addNoteMutation.isPending}
        />
      )}

      {/* Edit Modal */}
      {isEditing && (
        <EditModal
          prospect={prospect}
          onClose={() => setIsEditing(false)}
          onSave={(updates) => updateMutation.mutate(updates)}
          isSaving={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-5 h-5 text-gray-500 mt-0.5" />
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <div className="text-gray-300">{children}</div>
      </div>
    </div>
  );
}

function EmailModal({ prospect, onClose, onSuccess }) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', 'email'],
    queryFn: () => templatesApi.getAll('email'),
  });

  const sendMutation = useMutation({
    mutationFn: () => campaignsApi.send(prospect.id, selectedTemplate || null, subject, body),
    onSuccess: () => { onSuccess(); onClose(); },
  });

  const handleTemplateChange = (templateId) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === parseInt(templateId));
    if (template) {
      let newSubject = template.subject || '';
      let newBody = template.body || '';
      const vars = { business_name: prospect.business_name, city: prospect.city, state: prospect.state, industry: prospect.category, owner_name: 'there' };
      Object.entries(vars).forEach(([k, v]) => {
        const regex = new RegExp(`{{${k}}}`, 'g');
        newSubject = newSubject.replace(regex, v || '');
        newBody = newBody.replace(regex, v || '');
      });
      setSubject(newSubject);
      setBody(newBody);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-xl border border-dark-600 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-dark-600">
          <h2 className="text-xl font-display font-semibold text-white">Send Email to {prospect.business_name}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-700 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!prospect.email && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
              This prospect doesn't have an email address. Add one first to send emails.
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Template</label>
            <select value={selectedTemplate} onChange={(e) => handleTemplateChange(e.target.value)} className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white">
              <option value="">Select a template...</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">To</label>
            <input type="text" value={prospect.email || 'No email address'} disabled className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-gray-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Subject</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-600">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
          <button onClick={() => sendMutation.mutate()} disabled={!prospect.email || !subject || !body || sendMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg disabled:opacity-50">
            <Send className="w-4 h-4" /> {sendMutation.isPending ? 'Sending...' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteModal({ onClose, onSave, isSaving }) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-xl border border-dark-600 w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-dark-600">
          <h2 className="text-xl font-semibold text-white">Add Note</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-700 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Enter your note..." rows={4} className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none" />
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-600">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
          <button onClick={() => note && onSave(note)} disabled={!note || isSaving} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ prospect, onClose, onSave, isSaving }) {
  const [form, setForm] = useState({ business_name: prospect.business_name || '', email: prospect.email || '', phone: prospect.phone || '', address: prospect.address || '', city: prospect.city || '', state: prospect.state || '', notes: prospect.notes || '' });
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-xl border border-dark-600 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-dark-600">
          <h2 className="text-xl font-semibold text-white">Edit Prospect</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-700 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {[['business_name', 'Business Name'], ['email', 'Email'], ['phone', 'Phone'], ['address', 'Address'], ['city', 'City'], ['state', 'State']].map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm text-gray-400 mb-2">{label}</label>
              <input type="text" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-cyan-500" />
            </div>
          ))}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-600">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
          <button onClick={() => onSave(form)} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg disabled:opacity-50">
            <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProspectDetail;

