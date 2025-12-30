import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Places API Service
 * Searches for businesses using Google's Places API (New)
 * https://developers.google.com/maps/documentation/places/web-service/op-overview
 */
class GooglePlacesService {
  constructor() {
    this.apiKey = null;
    // Use the new Places API endpoint
    this.baseUrl = 'https://places.googleapis.com/v1';
    // Legacy API URL (fallback)
    this.legacyUrl = 'https://maps.googleapis.com/maps/api/place';
  }

  /**
   * Get API key (lazy load)
   */
  getApiKey() {
    if (!this.apiKey) {
      // Can use either GOOGLE_PLACES_API_KEY or GOOGLE_API_KEY
      this.apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
    }
    return this.apiKey;
  }

  /**
   * Check if service is configured
   */
  isConfigured() {
    return !!this.getApiKey();
  }

  /**
   * Search for businesses by text query using Places API (New)
   */
  async searchBusinesses({ query, location, type, radius = 50000 }) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.log('⚠️ Google Places API key not configured');
      return { businesses: [], error: 'API key not configured' };
    }

    try {
      // Build the search query - include location in the query text
      let searchQuery = query || '';
      if (type) {
        searchQuery = type + (searchQuery ? ' ' + searchQuery : '');
      }
      searchQuery = searchQuery + ' in ' + location;

      console.log(`🔍 Google Places (New) search: "${searchQuery}"`);

      // Use the new Places API Text Search endpoint
      // https://developers.google.com/maps/documentation/places/web-service/text-search
      const requestBody = {
        textQuery: searchQuery,
        maxResultCount: 20,
        languageCode: 'en',
      };

      // Try to geocode for better results
      const coords = await this.geocodeLocation(location);
      if (coords) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: coords.lat,
              longitude: coords.lng,
            },
            radius: radius,
          },
        };
      }

      const response = await fetch(`${this.baseUrl}/places:searchText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          // Request all the fields we need
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.types,places.primaryType,places.businessStatus,places.photos',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Places API error:', response.status, errorText);
        
        // Try to parse error for more details
        try {
          const errorJson = JSON.parse(errorText);
          return { businesses: [], error: errorJson.error?.message || `API error: ${response.status}` };
        } catch {
          return { businesses: [], error: `API error: ${response.status}` };
        }
      }

      const data = await response.json();

      // Transform new API response format
      const businesses = (data.places || []).map(place => this.transformNewApiPlace(place));

      console.log(`✅ Google Places found ${businesses.length} businesses`);

      return { businesses, total: businesses.length };
    } catch (error) {
      console.error('Google Places search error:', error);
      return { businesses: [], error: error.message };
    }
  }

  /**
   * Transform new API place format to our standard format
   */
  transformNewApiPlace(place) {
    const address = place.formattedAddress || '';
    const addressParts = this.parseAddress(address);

    return {
      google_place_id: place.id,
      business_name: place.displayName?.text || 'Unknown',
      address: address,
      city: addressParts.city,
      state: addressParts.state,
      zip_code: addressParts.zip_code,
      phone: place.nationalPhoneNumber || null,
      website_url: place.websiteUri || null,
      google_maps_url: place.googleMapsUri || null,
      category: this.formatTypes(place.types || []),
      rating: place.rating || 0,
      review_count: place.userRatingCount || 0,
      image_url: place.photos?.[0]?.name 
        ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=400&maxWidthPx=400&key=${this.getApiKey()}`
        : null,
      business_status: place.businessStatus,
      source: 'google',
    };
  }

  /**
   * Geocode a location string to coordinates
   */
  async geocodeLocation(location) {
    const apiKey = this.getApiKey();
    
    try {
      const params = new URLSearchParams({
        address: location,
        key: apiKey,
      });

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${params}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        return data.results[0].geometry.location;
      }

      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Get place details (website, phone, etc.)
   */
  async getPlaceDetails(placeId) {
    const apiKey = this.getApiKey();

    try {
      const params = new URLSearchParams({
        place_id: placeId,
        fields: 'name,formatted_address,formatted_phone_number,website,url,rating,user_ratings_total,types,business_status,opening_hours',
        key: apiKey,
      });

      const response = await fetch(`${this.baseUrl}/details/json?${params}`);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      if (data.status === 'OK') {
        return data.result;
      }

      return null;
    } catch (error) {
      console.error('Place details error:', error);
      return null;
    }
  }

  /**
   * Enrich search results with details (website, phone)
   */
  async enrichResults(results) {
    const enriched = [];

    // Limit to first 20 to avoid too many API calls
    const limitedResults = results.slice(0, 20);

    for (const place of limitedResults) {
      try {
        // Get detailed info for each place
        const details = await this.getPlaceDetails(place.place_id);

        const business = {
          // Use Google place_id as unique identifier
          google_place_id: place.place_id,
          business_name: place.name,
          address: place.formatted_address,
          // Parse city/state from formatted_address
          ...this.parseAddress(place.formatted_address),
          phone: details?.formatted_phone_number || null,
          website_url: details?.website || null,
          google_maps_url: details?.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
          category: this.formatTypes(place.types),
          rating: place.rating || 0,
          review_count: place.user_ratings_total || 0,
          image_url: place.photos?.[0] 
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${this.getApiKey()}`
            : null,
          business_status: place.business_status,
          source: 'google',
        };

        enriched.push(business);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error enriching place ${place.name}:`, error);
      }
    }

    return enriched;
  }

  /**
   * Parse address into components
   */
  parseAddress(formattedAddress) {
    if (!formattedAddress) return {};

    const parts = formattedAddress.split(', ');
    
    // Typical format: "123 Main St, Chicago, IL 60601, USA"
    if (parts.length >= 3) {
      const stateZip = parts[parts.length - 2]; // "IL 60601" or similar
      const stateZipMatch = stateZip.match(/^([A-Z]{2})\s*(\d{5})?/);
      
      return {
        city: parts[parts.length - 3] || parts[0],
        state: stateZipMatch?.[1] || '',
        zip_code: stateZipMatch?.[2] || '',
      };
    }

    return { city: parts[0] || '' };
  }

  /**
   * Format Google place types to readable categories
   */
  formatTypes(types) {
    if (!types || types.length === 0) return '';

    // Map Google place types to readable names
    const typeMap = {
      'restaurant': 'Restaurant',
      'food': 'Food',
      'bar': 'Bar',
      'cafe': 'Cafe',
      'bakery': 'Bakery',
      'store': 'Store',
      'clothing_store': 'Clothing Store',
      'electronics_store': 'Electronics Store',
      'furniture_store': 'Furniture Store',
      'home_goods_store': 'Home Goods',
      'jewelry_store': 'Jewelry Store',
      'shoe_store': 'Shoe Store',
      'shopping_mall': 'Shopping Mall',
      'supermarket': 'Supermarket',
      'convenience_store': 'Convenience Store',
      'drugstore': 'Drugstore',
      'pharmacy': 'Pharmacy',
      'health': 'Health',
      'hospital': 'Hospital',
      'doctor': 'Doctor',
      'dentist': 'Dentist',
      'gym': 'Gym',
      'spa': 'Spa',
      'beauty_salon': 'Beauty Salon',
      'hair_care': 'Hair Salon',
      'car_dealer': 'Car Dealer',
      'car_repair': 'Auto Repair',
      'car_wash': 'Car Wash',
      'gas_station': 'Gas Station',
      'parking': 'Parking',
      'lodging': 'Lodging',
      'hotel': 'Hotel',
      'real_estate_agency': 'Real Estate',
      'lawyer': 'Lawyer',
      'accounting': 'Accounting',
      'insurance_agency': 'Insurance',
      'bank': 'Bank',
      'atm': 'ATM',
      'plumber': 'Plumber',
      'electrician': 'Electrician',
      'roofing_contractor': 'Roofing',
      'general_contractor': 'Contractor',
      'painter': 'Painter',
      'moving_company': 'Moving Company',
      'locksmith': 'Locksmith',
      'pet_store': 'Pet Store',
      'veterinary_care': 'Veterinarian',
      'school': 'School',
      'university': 'University',
      'library': 'Library',
      'church': 'Church',
      'mosque': 'Mosque',
      'synagogue': 'Synagogue',
      'point_of_interest': '',
      'establishment': '',
    };

    const readableTypes = types
      .map(t => typeMap[t] || t.replace(/_/g, ' '))
      .filter(t => t && !['point of interest', 'establishment'].includes(t.toLowerCase()))
      .slice(0, 3);

    return readableTypes.join(', ');
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      service: 'Google Places API',
    };
  }
}

const googlePlacesService = new GooglePlacesService();
export default googlePlacesService;

