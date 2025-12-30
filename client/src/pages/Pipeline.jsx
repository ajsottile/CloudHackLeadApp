import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  GripVertical, 
  Phone, 
  Mail, 
  Globe, 
  Star,
  MoreVertical,
  Trash2,
  ExternalLink,
  Search,
  Filter
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { prospectsApi } from '../services/api';

const stages = [
  { key: 'new', label: 'New Leads', color: 'gray' },
  { key: 'contacted', label: 'Contacted', color: 'blue' },
  { key: 'responded', label: 'Responded', color: 'cyan' },
  { key: 'meeting', label: 'Meeting Scheduled', color: 'violet' },
  { key: 'proposal', label: 'Proposal Sent', color: 'amber' },
  { key: 'won', label: 'Won', color: 'emerald' },
  { key: 'lost', label: 'Lost', color: 'red' },
];

const colorClasses = {
  gray: { bg: 'bg-gray-500', border: 'border-gray-500', text: 'text-gray-400' },
  blue: { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-400' },
  cyan: { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-400' },
  violet: { bg: 'bg-violet-500', border: 'border-violet-500', text: 'text-violet-400' },
  amber: { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-400' },
  emerald: { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-400' },
  red: { bg: 'bg-red-500', border: 'border-red-500', text: 'text-red-400' },
};

function Pipeline() {
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedProspect, setDraggedProspect] = useState(null);
  const queryClient = useQueryClient();

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ['prospects'],
    queryFn: () => prospectsApi.getAll(),
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ id, stage }) => prospectsApi.updateStage(id, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => prospectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
  });

  const filteredProspects = prospects.filter(p => 
    !searchTerm || 
    p.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProspectsForStage = (stageKey) => {
    return filteredProspects.filter(p => p.stage === stageKey);
  };

  const handleDragStart = (e, prospect) => {
    setDraggedProspect(prospect);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, newStage) => {
    e.preventDefault();
    if (draggedProspect && draggedProspect.stage !== newStage) {
      updateStageMutation.mutate({ id: draggedProspect.id, stage: newStage });
    }
    setDraggedProspect(null);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this prospect?')) {
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
    <div className="h-[calc(100vh-4rem)] flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Pipeline</h1>
          <p className="text-gray-400 mt-1">{prospects.length} prospects total</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search prospects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 w-64"
            />
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full min-w-max pb-4">
          {stages.map((stage) => {
            const stageProspects = getProspectsForStage(stage.key);
            const colors = colorClasses[stage.color];
            
            return (
              <div
                key={stage.key}
                className="w-72 flex-shrink-0 flex flex-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.key)}
              >
                {/* Column Header */}
                <div className={`flex items-center gap-2 mb-3 pb-3 border-b ${colors.border}/30`}>
                  <div className={`w-3 h-3 rounded-full ${colors.bg}`} />
                  <h3 className="font-medium text-white">{stage.label}</h3>
                  <span className="ml-auto text-sm text-gray-500 bg-dark-700 px-2 py-0.5 rounded">
                    {stageProspects.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {stageProspects.map((prospect) => (
                    <ProspectCard
                      key={prospect.id}
                      prospect={prospect}
                      onDragStart={handleDragStart}
                      onDelete={handleDelete}
                      stageColor={stage.color}
                    />
                  ))}
                  
                  {stageProspects.length === 0 && (
                    <div className="text-center py-8 text-gray-600 border-2 border-dashed border-dark-600 rounded-lg">
                      <p className="text-sm">No prospects</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProspectCard({ prospect, onDragStart, onDelete, stageColor }) {
  const [showMenu, setShowMenu] = useState(false);
  const isSmallBusiness = prospect.review_count && prospect.review_count < 100;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, prospect)}
      className="bg-dark-800 rounded-lg border border-dark-600 p-4 cursor-grab active:cursor-grabbing hover:border-dark-500 transition-all card-hover group"
    >
      <div className="flex items-start gap-3">
        <GripVertical className="w-4 h-4 text-gray-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <div className="flex-1 min-w-0">
          <Link 
            to={`/prospect/${prospect.id}`}
            className="font-medium text-white hover:text-cyan-400 transition-colors block truncate"
          >
            {prospect.business_name}
          </Link>
          
          {prospect.category && (
            <p className="text-xs text-gray-500 mt-1 truncate">{prospect.category}</p>
          )}
          
          <div className="flex items-center gap-3 mt-3 text-gray-400">
            {prospect.city && (
              <span className="text-xs truncate">{prospect.city}, {prospect.state}</span>
            )}
            {prospect.rating && (
              <span className="flex items-center gap-1 text-xs">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                {prospect.rating}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3">
            {prospect.phone && (
              <a 
                href={`tel:${prospect.phone}`}
                className="p-1.5 rounded bg-dark-700 hover:bg-dark-600 transition-colors"
                title="Call"
              >
                <Phone className="w-3.5 h-3.5 text-gray-400" />
              </a>
            )}
            {prospect.email && (
              <a 
                href={`mailto:${prospect.email}`}
                className="p-1.5 rounded bg-dark-700 hover:bg-dark-600 transition-colors"
                title="Email"
              >
                <Mail className="w-3.5 h-3.5 text-gray-400" />
              </a>
            )}
            {prospect.yelp_url && (
              <a 
                href={prospect.yelp_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded bg-dark-700 hover:bg-dark-600 transition-colors"
                title="View on Yelp"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              </a>
            )}
            
            {isSmallBusiness && (
              <span className="ml-auto text-xs px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Small Biz
              </span>
            )}
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-dark-700 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="w-4 h-4 text-gray-500" />
          </button>
          
          {showMenu && (
            <>
              <div 
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-dark-700 border border-dark-600 rounded-lg shadow-xl z-20 py-1 min-w-32">
                <Link
                  to={`/prospect/${prospect.id}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-dark-600"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Details
                </Link>
                <button
                  onClick={() => {
                    onDelete(prospect.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-dark-600 w-full"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Pipeline;

