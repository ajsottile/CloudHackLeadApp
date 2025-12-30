import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  MapPin,
  Filter,
  Star,
  Phone,
  Globe,
  ExternalLink,
  Plus,
  Check,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  Map
} from 'lucide-react';
import { yelpApi, prospectsApi } from '../services/api';

const SORT_OPTIONS = [
  { value: 'reviews_asc', label: 'Reviews (Low to High)', description: 'Smaller businesses first' },
  { value: 'reviews_desc', label: 'Reviews (High to Low)', description: 'Popular businesses first' },
  { value: 'rating_desc', label: 'Rating (High to Low)', description: 'Best rated first' },
  { value: 'rating_asc', label: 'Rating (Low to High)', description: 'Lowest rated first' },
  { value: 'has_website', label: 'Has Website First', description: 'Businesses with websites' },
  { value: 'distance', label: 'Distance', description: 'Closest first' },
  { value: 'best_match', label: 'Best Match', description: 'Yelp relevance' },
];

const SOURCE_OPTIONS = [
  { value: 'both', label: 'Yelp + Google', icon: '🔍' },
  { value: 'yelp', label: 'Yelp Only', icon: '🍴' },
  { value: 'google', label: 'Google Only', icon: '📍' },
];

function Discovery() {
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [noWebsiteOnly, setNoWebsiteOnly] = useState(true);
  const [sortBy, setSortBy] = useState('reviews_asc');
  const [sources, setSources] = useState('both'); // 'yelp', 'google', or 'both'
  const [searchParams, setSearchParams] = useState(null);
  const [addedBusinessIds, setAddedBusinessIds] = useState(new Set()); // Track all added businesses
  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ['yelp-categories'],
    queryFn: yelpApi.getCategories,
  });

  const { 
    data: searchResults, 
    isLoading: isSearching,
    error: searchError 
  } = useQuery({
    queryKey: ['business-search', searchParams],
    queryFn: () => yelpApi.search({ 
      location: searchParams?.location, 
      categories: searchParams?.category, 
      term: searchParams?.term,
      noWebsiteOnly: searchParams?.noWebsiteOnly?.toString(),
      sortBy: searchParams?.sortBy,
      sources: searchParams?.sources,
      limit: 50 
    }),
    enabled: !!searchParams,
  });

  const addProspectMutation = useMutation({
    mutationFn: (prospect) => prospectsApi.create(prospect),
    onSuccess: (data, variables) => {
      // Track this business as added (by yelp_id or google_place_id)
      const businessKey = variables.yelp_id || variables.google_place_id;
      setAddedBusinessIds(prev => new Set([...prev, businessKey]));
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
  });

  const handleSearch = useCallback(() => {
    if (!location) {
      alert('Please enter a location');
      return;
    }
    setSearchParams({
      location,
      category,
      term: searchTerm,
      noWebsiteOnly,
      sortBy,
      sources,
    });
  }, [location, category, searchTerm, noWebsiteOnly, sortBy, sources]);

  // Re-run search when sort changes (if we've already searched)
  useEffect(() => {
    if (searchParams && sortBy !== searchParams.sortBy) {
      setSearchParams(prev => prev ? { ...prev, sortBy } : null);
    }
  }, [sortBy, searchParams]);

  // Re-run search when filter changes (if we've already searched)
  useEffect(() => {
    if (searchParams && noWebsiteOnly !== searchParams.noWebsiteOnly) {
      setSearchParams(prev => prev ? { ...prev, noWebsiteOnly } : null);
    }
  }, [noWebsiteOnly, searchParams]);
  
  const hasSearched = !!searchParams;

  const handleAddProspect = (business) => {
    addProspectMutation.mutate({
      business_name: business.business_name,
      phone: business.phone,
      address: business.address,
      city: business.city,
      state: business.state,
      zip_code: business.zip_code,
      website_url: business.website_url,
      yelp_url: business.yelp_url,
      yelp_id: business.yelp_id,
      google_place_id: business.google_place_id,
      google_maps_url: business.google_maps_url,
      category: business.category,
      rating: business.rating,
      review_count: business.review_count,
      stage: 'new',
      source: business.source || 'yelp',
    });
  };

  // Get unique business key for tracking
  const getBusinessKey = (business) => {
    return business.yelp_id || business.google_place_id || `${business.business_name}-${business.city}`;
  };

  const businesses = searchResults?.businesses || [];
  // Filtering is now done server-side based on review count
  const filteredBusinesses = businesses;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-white">Business Discovery</h1>
        <p className="text-gray-400 mt-1">Find new prospects using Yelp and Google Places data</p>
      </div>

      {/* Search Form */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Location */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Location *</label>
            <div className="relative">
              <MapPin className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="City, State or ZIP"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Category</label>
            <div className="relative">
              <Filter className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.alias} value={cat.alias}>
                    {cat.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Term */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Keywords</label>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="e.g., plumber, salon"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Search Button */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSearch}
              disabled={isSearching}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Search Businesses
                </>
              )}
            </button>
          </div>
        </div>

        {/* Filter & Sort Options */}
        <div className="flex flex-wrap items-center gap-6 mt-4 pt-4 border-t border-dark-600">
          {/* Source Selector */}
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-400" />
            <label className="text-sm text-gray-400">Search:</label>
            <div className="flex rounded-lg border border-dark-500 overflow-hidden">
              {SOURCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSources(option.value)}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    sources === option.value
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                  }`}
                >
                  <span className="mr-1">{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Small Business Filter */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={noWebsiteOnly}
              onChange={(e) => setNoWebsiteOnly(e.target.checked)}
              className="w-4 h-4 rounded border-dark-500 bg-dark-700 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-sm text-gray-300">Small businesses only (&lt;100 reviews)</span>
          </label>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-gray-400" />
            <label className="text-sm text-gray-400">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Mock Data Warning */}
      {searchResults?.mockData && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">Using mock data</p>
            <p className="text-sm text-gray-400 mt-1">
              Yelp API key not configured. Add YELP_API_KEY to your .env file to search real businesses.
            </p>
          </div>
        </div>
      )}

      {/* API Configuration Status */}
      {searchResults?.warnings?.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">Some data sources unavailable</p>
            {searchResults.warnings.map((warning, i) => (
              <p key={i} className="text-sm text-gray-400 mt-1">{warning}</p>
            ))}
            {searchResults.warnings.some(w => w.includes('Places API')) && (
              <p className="text-sm text-gray-400 mt-2">
                <a 
                  href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  Enable Places API in Google Cloud Console →
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Search Error */}
      {searchError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium">Search failed</p>
            <p className="text-sm text-gray-400 mt-1">{searchError.message}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {hasSearched && !isSearching && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-display font-semibold text-white">
                {filteredBusinesses.length} Results
                {searchResults?.total > filteredBusinesses.length && (
                  <span className="text-gray-400 text-sm font-normal ml-2">
                    (of {searchResults.total} total)
                  </span>
                )}
              </h2>
              {/* Source breakdown */}
              <div className="flex items-center gap-4 mt-1 text-sm">
                {searchResults?.yelpTotal > 0 && (
                  <span className="text-gray-400">
                    <span className="text-red-400">🍴 Yelp:</span> {searchResults.yelpTotal}
                  </span>
                )}
                {searchResults?.googleTotal > 0 && (
                  <span className="text-gray-400">
                    <span className="text-blue-400">📍 Google:</span> {searchResults.googleTotal}
                  </span>
                )}
                {filteredBusinesses.filter(b => b.website_url).length > 0 && (
                  <span className="text-emerald-400">
                    {filteredBusinesses.filter(b => b.website_url).length} have websites
                  </span>
                )}
              </div>
            </div>
          </div>

          {filteredBusinesses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBusinesses.map((business) => (
                <BusinessCard
                  key={getBusinessKey(business)}
                  business={business}
                  onAdd={handleAddProspect}
                  isAdding={addProspectMutation.isPending && getBusinessKey(addProspectMutation.variables) === getBusinessKey(business)}
                  isAdded={addedBusinessIds.has(getBusinessKey(business))}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No businesses found matching your criteria</p>
              <p className="text-sm mt-1">Try adjusting your search filters</p>
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!hasSearched && (
        <div className="text-center py-16 text-gray-500">
          <Globe className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Search for businesses to get started</p>
          <p className="text-sm mt-2">Enter a location and click Search to find prospects</p>
        </div>
      )}
    </div>
  );
}

function BusinessCard({ business, onAdd, isAdding, isAdded }) {
  const isSmallBusiness = business.review_count < 100;

  const handleAdd = () => {
    if (!isAdded && !isAdding) {
      onAdd(business);
    }
  };

  // Source badge styling
  const getSourceBadge = () => {
    switch (business.source) {
      case 'google':
        return { text: 'Google', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
      case 'both':
        return { text: 'Yelp + Google', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' };
      case 'yelp':
      default:
        return { text: 'Yelp', color: 'bg-red-500/10 text-red-400 border-red-500/30' };
    }
  };

  const sourceBadge = getSourceBadge();

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 p-5 hover:border-dark-500 transition-all card-hover">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-3">
          <h3 className="font-medium text-white truncate">{business.business_name}</h3>
          {business.category && (
            <p className="text-xs text-gray-500 truncate mt-1">{business.category}</p>
          )}
        </div>
        
        <div className="flex flex-col gap-1 items-end flex-shrink-0">
          {/* Source badge */}
          <span className={`text-xs px-2 py-0.5 rounded border ${sourceBadge.color}`}>
            {sourceBadge.text}
          </span>
          
          {isSmallBusiness && (
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              Small Biz
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-400">
        {business.address && (
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="truncate">{business.address}</span>
          </div>
        )}
        
        {business.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 flex-shrink-0" />
            <a href={`tel:${business.phone}`} className="hover:text-cyan-400">{business.phone}</a>
          </div>
        )}

        {/* Website indicator */}
        {business.website_url && (
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <a 
              href={business.website_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-emerald-400 truncate"
            >
              {business.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          </div>
        )}

        <div className="flex items-center gap-4">
          {business.rating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>{business.rating}</span>
              {business.review_count > 0 && (
                <span className="text-gray-500">({business.review_count})</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-dark-600">
        {/* Yelp link */}
        {business.yelp_url && (
          <a
            href={business.yelp_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-2 text-sm text-red-400 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors"
            title="View on Yelp"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Yelp</span>
          </a>
        )}
        
        {/* Google Maps link */}
        {business.google_maps_url && (
          <a
            href={business.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-2 text-sm text-blue-400 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors"
            title="View on Google Maps"
          >
            <Map className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Maps</span>
          </a>
        )}
        
        <button
          onClick={handleAdd}
          disabled={isAdded || isAdding}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
            isAdded
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isAdding ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isAdded ? (
            <>
              <Check className="w-4 h-4" />
              Added
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add to Pipeline
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default Discovery;

