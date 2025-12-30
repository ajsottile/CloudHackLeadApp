// In production, use the full backend URL; in development, use the proxy
const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function handleResponse(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// Prospects API
export const prospectsApi = {
  getAll: async (stage = null) => {
    const url = stage ? `${API_BASE}/prospects?stage=${stage}` : `${API_BASE}/prospects`;
    const response = await fetch(url);
    return handleResponse(response);
  },
  
  getById: async (id) => {
    const response = await fetch(`${API_BASE}/prospects/${id}`);
    return handleResponse(response);
  },
  
  create: async (prospect) => {
    const response = await fetch(`${API_BASE}/prospects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prospect),
    });
    return handleResponse(response);
  },
  
  update: async (id, updates) => {
    const response = await fetch(`${API_BASE}/prospects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },
  
  updateStage: async (id, stage) => {
    const response = await fetch(`${API_BASE}/prospects/${id}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    return handleResponse(response);
  },
  
  delete: async (id) => {
    const response = await fetch(`${API_BASE}/prospects/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },
};

// Templates API
export const templatesApi = {
  getAll: async (type = null) => {
    const url = type ? `${API_BASE}/templates?type=${type}` : `${API_BASE}/templates`;
    const response = await fetch(url);
    return handleResponse(response);
  },
  
  getById: async (id) => {
    const response = await fetch(`${API_BASE}/templates/${id}`);
    return handleResponse(response);
  },
  
  create: async (template) => {
    const response = await fetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    return handleResponse(response);
  },
  
  update: async (id, updates) => {
    const response = await fetch(`${API_BASE}/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },
  
  delete: async (id) => {
    const response = await fetch(`${API_BASE}/templates/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },
};

// Campaigns API
export const campaignsApi = {
  getAll: async () => {
    const response = await fetch(`${API_BASE}/campaigns`);
    return handleResponse(response);
  },
  
  getByProspect: async (prospectId) => {
    const response = await fetch(`${API_BASE}/campaigns/prospect/${prospectId}`);
    return handleResponse(response);
  },
  
  send: async ({ prospectId, campaignId, templateId, customSubject, customBody }) => {
    const response = await fetch(`${API_BASE}/campaigns/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospectId, campaignId, templateId, customSubject, customBody }),
    });
    return handleResponse(response);
  },
  
  retry: async (campaignId) => {
    const response = await fetch(`${API_BASE}/campaigns/${campaignId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse(response);
  },
};

// Yelp API
export const yelpApi = {
  search: async (params) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE}/yelp/search?${queryString}`);
    return handleResponse(response);
  },
  
  getCategories: async () => {
    const response = await fetch(`${API_BASE}/yelp/categories`);
    return handleResponse(response);
  },
};

// Activities API
export const activitiesApi = {
  getByProspect: async (prospectId) => {
    const response = await fetch(`${API_BASE}/activities/prospect/${prospectId}`);
    return handleResponse(response);
  },
  
  getRecent: async (limit = 10) => {
    const response = await fetch(`${API_BASE}/activities/recent?limit=${limit}`);
    return handleResponse(response);
  },
  
  create: async (activity) => {
    const response = await fetch(`${API_BASE}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activity),
    });
    return handleResponse(response);
  },
};

// Stats API
export const statsApi = {
  getDashboard: async () => {
    const response = await fetch(`${API_BASE}/stats/dashboard`);
    return handleResponse(response);
  },
};

// Agents API
export const agentsApi = {
  // Configuration
  getConfig: async () => {
    const response = await fetch(`${API_BASE}/agents/config`);
    return handleResponse(response);
  },
  
  updateConfig: async (key, value) => {
    const response = await fetch(`${API_BASE}/agents/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    return handleResponse(response);
  },
  
  updateConfigBulk: async (updates) => {
    const response = await fetch(`${API_BASE}/agents/config/bulk`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },
  
  // Stats
  getStats: async () => {
    const response = await fetch(`${API_BASE}/agents/stats`);
    return handleResponse(response);
  },
  
  getTasks: async (status) => {
    const response = await fetch(`${API_BASE}/agents/tasks/${status}`);
    return handleResponse(response);
  },
  
  // Manual triggers
  triggerOutreach: async (prospectId, payload = {}) => {
    const response = await fetch(`${API_BASE}/agents/trigger/outreach/${prospectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },
  
  triggerFollowup: async (prospectId, payload = {}) => {
    const response = await fetch(`${API_BASE}/agents/trigger/followup/${prospectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },
  
  triggerClassify: async (prospectId, responseText, subject) => {
    const response = await fetch(`${API_BASE}/agents/trigger/classify/${prospectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responseText, subject }),
    });
    return handleResponse(response);
  },
  
  processNow: async () => {
    const response = await fetch(`${API_BASE}/agents/process`, {
      method: 'POST',
    });
    return handleResponse(response);
  },
  
  // Prospect automation
  toggleAutomation: async (prospectId, enabled) => {
    const response = await fetch(`${API_BASE}/agents/prospect/${prospectId}/automation`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return handleResponse(response);
  },
  
  getSequence: async (prospectId) => {
    const response = await fetch(`${API_BASE}/agents/prospect/${prospectId}/sequence`);
    return handleResponse(response);
  },
  
  // Notifications
  getNotifications: async (unreadOnly = false) => {
    const url = unreadOnly 
      ? `${API_BASE}/agents/notifications?unread=true` 
      : `${API_BASE}/agents/notifications`;
    const response = await fetch(url);
    return handleResponse(response);
  },
  
  getNotificationCount: async () => {
    const response = await fetch(`${API_BASE}/agents/notifications/count`);
    return handleResponse(response);
  },
  
  markNotificationRead: async (id) => {
    const response = await fetch(`${API_BASE}/agents/notifications/${id}/read`, {
      method: 'PUT',
    });
    return handleResponse(response);
  },
  
  markAllNotificationsRead: async () => {
    const response = await fetch(`${API_BASE}/agents/notifications/read-all`, {
      method: 'PUT',
    });
    return handleResponse(response);
  },
  
  deleteNotification: async (id) => {
    const response = await fetch(`${API_BASE}/agents/notifications/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },
};

// Enrichment API
export const enrichmentApi = {
  // Get enrichment service status
  getStatus: async () => {
    const response = await fetch(`${API_BASE}/enrichment/status`);
    return handleResponse(response);
  },
  
  // Enrich a single prospect
  enrichProspect: async (prospectId) => {
    const response = await fetch(`${API_BASE}/enrichment/prospect/${prospectId}`, {
      method: 'POST',
    });
    return handleResponse(response);
  },
  
  // Batch enrich multiple prospects
  enrichBatch: async (prospectIds) => {
    const response = await fetch(`${API_BASE}/enrichment/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospectIds }),
    });
    return handleResponse(response);
  },
  
  // Enrich all prospects missing email
  enrichAllMissingEmail: async () => {
    const response = await fetch(`${API_BASE}/enrichment/all-missing-email`, {
      method: 'POST',
    });
    return handleResponse(response);
  },
};

