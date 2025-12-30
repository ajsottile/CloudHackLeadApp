import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Phone,
  Linkedin,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Copy,
  Check
} from 'lucide-react';
import { templatesApi } from '../services/api';

const templateTypes = [
  { key: 'email', label: 'Email', icon: Mail, color: 'cyan' },
  { key: 'phone', label: 'Phone Script', icon: Phone, color: 'violet' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'blue' },
];

const colorClasses = {
  cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  violet: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

function Templates() {
  const [activeType, setActiveType] = useState('email');
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (template) => templatesApi.create(template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setIsCreating(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...updates }) => templatesApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setEditingTemplate(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => templatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const filteredTemplates = templates.filter(t => t.type === activeType);

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this template?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Outreach Templates</h1>
          <p className="text-gray-400 mt-1">Manage your email, phone, and LinkedIn templates</p>
        </div>
        
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Template
        </button>
      </div>

      {/* Type Tabs */}
      <div className="flex gap-2 border-b border-dark-600 pb-4">
        {templateTypes.map((type) => {
          const count = templates.filter(t => t.type === type.key).length;
          return (
            <button
              key={type.key}
              onClick={() => setActiveType(type.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeType === type.key
                  ? `${colorClasses[type.color]} border`
                  : 'text-gray-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <type.icon className="w-4 h-4" />
              {type.label}
              <span className="text-xs opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Variable Reference */}
      <div className="bg-dark-800 rounded-lg border border-dark-600 p-4">
        <p className="text-sm text-gray-400">
          <span className="text-gray-300 font-medium">Available variables: </span>
          <code className="text-cyan-400">{'{{business_name}}'}</code>,{' '}
          <code className="text-cyan-400">{'{{city}}'}</code>,{' '}
          <code className="text-cyan-400">{'{{state}}'}</code>,{' '}
          <code className="text-cyan-400">{'{{industry}}'}</code>,{' '}
          <code className="text-cyan-400">{'{{owner_name}}'}</code>
        </p>
      </div>

      {/* Templates List */}
      <div className="space-y-4">
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onEdit={() => setEditingTemplate(template)}
            onDelete={() => handleDelete(template.id)}
          />
        ))}
        
        {filteredTemplates.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No {activeType} templates yet</p>
            <button
              onClick={() => setIsCreating(true)}
              className="text-cyan-400 hover:text-cyan-300 mt-2"
            >
              Create your first template
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isCreating || editingTemplate) && (
        <TemplateModal
          template={editingTemplate}
          defaultType={activeType}
          onClose={() => {
            setIsCreating(false);
            setEditingTemplate(null);
          }}
          onSave={(data) => {
            if (editingTemplate) {
              updateMutation.mutate({ id: editingTemplate.id, ...data });
            } else {
              createMutation.mutate(data);
            }
          }}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

function TemplateCard({ template, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false);
  const typeInfo = templateTypes.find(t => t.key === template.type);
  const Icon = typeInfo?.icon || Mail;

  const handleCopy = async () => {
    const text = template.type === 'email' 
      ? `Subject: ${template.subject}\n\n${template.body}`
      : template.body;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden hover:border-dark-500 transition-all">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${colorClasses[typeInfo?.color || 'cyan']} border flex items-center justify-center`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-white">{template.name}</h3>
              {template.subject && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Subject: {template.subject}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-dark-700 transition-colors text-gray-400 hover:text-white"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={onEdit}
              className="p-2 rounded-lg hover:bg-dark-700 transition-colors text-gray-400 hover:text-white"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded-lg hover:bg-dark-700 transition-colors text-gray-400 hover:text-red-400"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="bg-dark-700 rounded-lg p-4 max-h-48 overflow-y-auto">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">
            {template.body}
          </pre>
        </div>
      </div>
    </div>
  );
}

function TemplateModal({ template, defaultType, onClose, onSave, isSaving }) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    type: template?.type || defaultType,
    subject: template?.subject || '',
    body: template?.body || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.body) {
      alert('Name and body are required');
      return;
    }
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-xl border border-dark-600 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-600">
          <h2 className="text-xl font-display font-semibold text-white">
            {template ? 'Edit Template' : 'New Template'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700 transition-colors text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Template Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Initial Outreach"
                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                {templateTypes.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formData.type === 'email' && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">Subject Line</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="e.g., Let's Get {{business_name}} Online"
                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              {formData.type === 'phone' ? 'Script' : 'Body'} *
            </label>
            <textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              placeholder="Enter your template content..."
              rows={12}
              className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none font-mono text-sm"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-600">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Templates;

