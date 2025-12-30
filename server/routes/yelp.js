import express from 'express';
import googlePlacesService from '../services/googlePlaces.js';

const router = express.Router();

const YELP_API_URL = 'https://api.yelp.com/v3';

// Common business categories for targeting
const CATEGORIES = [
  { alias: 'restaurants', title: 'Restaurants' },
  { alias: 'contractors', title: 'Contractors' },
  { alias: 'plumbing', title: 'Plumbing' },
  { alias: 'electricians', title: 'Electricians' },
  { alias: 'hvac', title: 'HVAC' },
  { alias: 'landscaping', title: 'Landscaping' },
  { alias: 'autorepair', title: 'Auto Repair' },
  { alias: 'salons', title: 'Hair Salons' },
  { alias: 'dentists', title: 'Dentists' },
  { alias: 'lawyers', title: 'Lawyers' },
  { alias: 'accountants', title: 'Accountants' },
  { alias: 'realestate', title: 'Real Estate' },
  { alias: 'fitness', title: 'Fitness & Gyms' },
  { alias: 'petservices', title: 'Pet Services' },
  { alias: 'homeservices', title: 'Home Services' },
  { alias: 'eventplanning', title: 'Event Planning' },
  { alias: 'medicalspa', title: 'Medical Spas' },
  { alias: 'physicaltherapy', title: 'Physical Therapy' },
  { alias: 'roofing', title: 'Roofing' },
  { alias: 'cleaning', title: 'Cleaning Services' },
];

// Get available categories
router.get('/categories', (req, res) => {
  res.json(CATEGORIES);
});

// Search businesses from both Yelp and Google Places
router.get('/search', async (req, res) => {
  try {
    const { 
      location, 
      term, 
      categories, 
      limit = 20, 
      offset = 0, 
      noWebsiteOnly = 'false', 
      sortBy = 'best_match',
      sources = 'both' // 'yelp', 'google', or 'both'
    } = req.query;
    
    if (!location) {
      return res.status(400).json({ message: 'Location is required' });
    }
    
    const requestedLimit = parseInt(limit);
    const fetchLimit = noWebsiteOnly === 'true' ? 50 : Math.min(requestedLimit, 50);
    
    // Collect results from both sources in parallel
    const searchPromises = [];
    
    // === YELP SEARCH ===
    if (sources === 'yelp' || sources === 'both') {
      searchPromises.push(searchYelp({ location, term, categories, fetchLimit, offset, noWebsiteOnly, sortBy }));
    }
    
    // === GOOGLE PLACES SEARCH ===
    if ((sources === 'google' || sources === 'both') && googlePlacesService.isConfigured()) {
      const googleQuery = term || categories || '';
      searchPromises.push(
        googlePlacesService.searchBusinesses({ 
          query: googleQuery, 
          location,
          type: categories 
        }).then(result => ({
          businesses: result.businesses || [],
          source: 'google',
          error: result.error
        }))
      );
    }
    
    // Wait for all searches to complete
    const results = await Promise.all(searchPromises);
    
    // Merge results from all sources
    let allBusinesses = [];
    let yelpTotal = 0;
    let googleTotal = 0;
    let warnings = [];
    
    for (const result of results) {
      if (result.error) {
        warnings.push(result.error);
      }
      if (result.businesses) {
        allBusinesses = allBusinesses.concat(result.businesses);
      }
      if (result.source === 'yelp') {
        yelpTotal = result.total || 0;
      } else if (result.source === 'google') {
        googleTotal = result.businesses?.length || 0;
      }
    }
    
    // Deduplicate by business name + city (normalized)
    const seen = new Map();
    const dedupedBusinesses = [];
    
    for (const biz of allBusinesses) {
      const key = normalizeBusinessKey(biz.business_name, biz.city);
      
      if (seen.has(key)) {
        // Merge data - prefer Google's website, keep both IDs
        const existing = seen.get(key);
        if (biz.website_url && !existing.website_url) {
          existing.website_url = biz.website_url;
        }
        if (biz.google_place_id && !existing.google_place_id) {
          existing.google_place_id = biz.google_place_id;
          existing.google_maps_url = biz.google_maps_url;
        }
        if (biz.yelp_id && !existing.yelp_id) {
          existing.yelp_id = biz.yelp_id;
          existing.yelp_url = biz.yelp_url;
        }
        // Mark as found on both
        if (biz.source !== existing.source) {
          existing.source = 'both';
        }
      } else {
        seen.set(key, biz);
        dedupedBusinesses.push(biz);
      }
    }
    
    let businesses = dedupedBusinesses;
    
    // Filter to only small businesses if requested
    if (noWebsiteOnly === 'true') {
      businesses = businesses.filter(b => b.review_count < 100);
    }
    
    // Apply sorting
    switch (sortBy) {
      case 'reviews_asc':
        businesses.sort((a, b) => (a.review_count || 0) - (b.review_count || 0));
        break;
      case 'reviews_desc':
        businesses.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
        break;
      case 'rating_desc':
        businesses.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'rating_asc':
        businesses.sort((a, b) => (a.rating || 0) - (b.rating || 0));
        break;
      case 'has_website':
        // Sort businesses with websites first
        businesses.sort((a, b) => {
          if (a.website_url && !b.website_url) return -1;
          if (!a.website_url && b.website_url) return 1;
          return 0;
        });
        break;
    }
    
    // Limit results
    businesses = businesses.slice(0, requestedLimit);
    
    res.json({
      businesses,
      total: yelpTotal + googleTotal,
      yelpTotal,
      googleTotal,
      offset: parseInt(offset),
      limit: requestedLimit,
      sources: {
        yelp: process.env.YELP_API_KEY ? 'configured' : 'not_configured',
        google: googlePlacesService.isConfigured() ? 'configured' : 'not_configured',
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error('Error searching businesses:', error);
    res.status(500).json({ message: 'Failed to search businesses' });
  }
});

// Helper: Search Yelp API
async function searchYelp({ location, term, categories, fetchLimit, offset, noWebsiteOnly, sortBy }) {
  if (!process.env.YELP_API_KEY) {
    return { 
      businesses: generateMockBusinesses(location, categories, fetchLimit),
      total: 50,
      source: 'yelp',
      mockData: true,
      error: 'Yelp API key not configured'
    };
  }
  
  try {
    const params = new URLSearchParams({
      location,
      limit: fetchLimit,
      offset: parseInt(offset) || 0,
    });
    
    if (term) params.append('term', term);
    if (categories) params.append('categories', categories);
    
    const yelpSortMap = {
      'best_match': 'best_match',
      'distance': 'distance',
      'rating_desc': 'rating',
      'reviews_desc': 'review_count',
    };
    
    if (noWebsiteOnly === 'true') {
      params.append('sort_by', 'distance');
    } else if (yelpSortMap[sortBy]) {
      params.append('sort_by', yelpSortMap[sortBy]);
    }
    
    const response = await fetch(`${YELP_API_URL}/businesses/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${process.env.YELP_API_KEY}`,
      },
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('Yelp API error:', response.status);
      return {
        businesses: generateMockBusinesses(location, categories, fetchLimit),
        total: 50,
        source: 'yelp',
        mockData: true,
        error: `Yelp API error: ${response.status}`
      };
    }
    
    const data = JSON.parse(responseText);
    
    const businesses = data.businesses.map(biz => ({
      yelp_id: biz.id,
      business_name: biz.name,
      phone: biz.display_phone || biz.phone,
      address: biz.location?.display_address?.join(', '),
      city: biz.location?.city,
      state: biz.location?.state,
      zip_code: biz.location?.zip_code,
      website_url: null,
      yelp_url: biz.url,
      category: biz.categories?.map(c => c.title).join(', '),
      rating: biz.rating,
      review_count: biz.review_count,
      image_url: biz.image_url,
      coordinates: biz.coordinates,
      source: 'yelp',
    }));
    
    return {
      businesses,
      total: data.total,
      source: 'yelp',
    };
  } catch (error) {
    console.error('Yelp search error:', error);
    return {
      businesses: [],
      total: 0,
      source: 'yelp',
      error: error.message
    };
  }
}

// Helper: Normalize business name for deduplication
function normalizeBusinessKey(name, city) {
  const normalizedName = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 30);
  const normalizedCity = (city || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `${normalizedName}-${normalizedCity}`;
}

// Get business details (to check for website)
router.get('/business/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!process.env.YELP_API_KEY) {
      return res.status(500).json({ message: 'Yelp API key not configured' });
    }
    
    const response = await fetch(`${YELP_API_URL}/businesses/${id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.YELP_API_KEY}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ message: error.error?.description || 'Yelp API error' });
    }
    
    const biz = await response.json();
    
    res.json({
      yelp_id: biz.id,
      business_name: biz.name,
      phone: biz.display_phone || biz.phone,
      address: biz.location?.display_address?.join(', '),
      city: biz.location?.city,
      state: biz.location?.state,
      zip_code: biz.location?.zip_code,
      website_url: biz.url, // This would be the actual website if available
      yelp_url: biz.url,
      category: biz.categories?.map(c => c.title).join(', '),
      rating: biz.rating,
      review_count: biz.review_count,
      hours: biz.hours,
      photos: biz.photos,
    });
  } catch (error) {
    console.error('Error fetching business details:', error);
    res.status(500).json({ message: 'Failed to fetch business details' });
  }
});

// Generate mock businesses for testing without API key
function generateMockBusinesses(location, category, limit) {
  const categoryNames = category ? [category] : ['Restaurant', 'Plumber', 'Electrician', 'Hair Salon', 'Auto Repair'];
  const businesses = [];
  
  for (let i = 0; i < limit; i++) {
    const cat = categoryNames[i % categoryNames.length];
    const hasWebsite = Math.random() > 0.6; // 40% don't have websites
    
    businesses.push({
      yelp_id: `mock-${i + 1}`,
      business_name: `${['Joe\'s', 'Mike\'s', 'Sarah\'s', 'Premier', 'Elite', 'Quality'][i % 6]} ${cat}`,
      phone: `(555) ${String(100 + i).padStart(3, '0')}-${String(1000 + i).padStart(4, '0')}`,
      address: `${100 + i} Main Street`,
      city: location.split(',')[0] || 'Sample City',
      state: 'CA',
      zip_code: '90210',
      website_url: hasWebsite ? `https://example${i}.com` : null,
      yelp_url: `https://yelp.com/biz/mock-${i + 1}`,
      category: cat,
      rating: (3 + Math.random() * 2).toFixed(1),
      review_count: Math.floor(10 + Math.random() * 200),
      has_website: hasWebsite,
    });
  }
  
  return businesses;
}

export default router;

