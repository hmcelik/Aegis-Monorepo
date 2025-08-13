// src/services/api.js

import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { mockApiService } from './mockData';

// Use environment variable for API URL, fallback to ngrok for development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://minnow-good-mostly.ngrok-free.app/api/v1';

// Telegram bot configuration
const TELEGRAM_BOT_USERNAME = 'AegisModerationBot'; // Your bot username
const ENABLE_TELEGRAM_LOGIN = true; // Enabled for external website access

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Simple console logging (only in development)
const log = {
  info: (msg, data) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`ℹ️ ${msg}`, data || '');
    }
  },
  success: (msg, data) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ ${msg}`, data || '');
    }
  },
  warn: (msg, data) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`⚠️ ${msg}`, data || '');
    }
  },
  error: (msg, data) => console.error(`❌ ${msg}`, data || ''), // Always show errors
  debug: (msg, data) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`🔍 ${msg}`, data || '');
    }
  }
};

// Helper function to get current token
const getCurrentToken = () => {
  // Try multiple sources for the token
  let token = null;
  
  // Try localStorage first (most reliable)
  token = localStorage.getItem('telegram_auth_token');
  if (token) return token;
  
  token = localStorage.getItem('authToken');
  if (token) return token;
  
  // Try auth store as fallback
  try {
    const authState = useAuth.getState();
    if (authState?.token) return authState.token;
  } catch (authError) {
    console.debug('Auth store access failed:', authError);
  }
  
  return null;
};

// Check if we should use mock mode (currently unused but kept for future use)
// const shouldUseMockMode = () => {
//   return import.meta.env.VITE_ENVIRONMENT === 'development' && 
//          import.meta.env.VITE_USE_MOCK_API === 'true';
// };

api.interceptors.request.use((config) => {
  log.debug(`Making ${config.method?.toUpperCase()} request to: ${config.baseURL}${config.url}`);
  
  // Add ngrok headers to skip the warning page
  config.headers['ngrok-skip-browser-warning'] = 'true';
  config.headers['Content-Type'] = 'application/json';
  
  // Add X-Telegram-Init-Data header for Telegram WebApp endpoints
  if (config.url?.includes('/webapp/') || config.url?.includes('/auth/verify')) {
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      config.headers['X-Telegram-Init-Data'] = initData;
      log.debug(`✅ Added X-Telegram-Init-Data header for ${config.url} (length: ${initData.length})`);
    } else {
      log.warn(`⚠️ No Telegram initData available for WebApp endpoint: ${config.url}`);
    }
  }
  
  // Get the token using helper function
  let token = getCurrentToken();
  
  // Log final token status
  if (token) {
    log.debug(`✅ Using token for ${config.url} (length: ${token.length})`);
  } else {
    log.debug(`⚠️ No token found for request to ${config.url}`);
  }
  
  // Add Bearer token for authenticated endpoints (not auth endpoints)
  if (token && !config.url?.includes('/auth/')) {
    config.headers.Authorization = `Bearer ${token}`;
    log.debug("✅ Added Bearer token to request");
  } else if (!token && !config.url?.includes('/health')) {
    log.debug(`⚠️ No token available for protected endpoint: ${config.url}`);
  }
  
  return config;
}, (error) => {
  log.error("Request interceptor error", error);
  return Promise.reject(error);
});

// Response interceptor for logging and error handling
api.interceptors.response.use(
  (response) => {
    log.success(`${response.config.method?.toUpperCase()} ${response.config.url} (${response.status})`);
    return response;
  },
  (error) => {
    const method = error.config?.method?.toUpperCase() || 'UNKNOWN';
    const url = error.config?.url || 'Unknown URL';
    const status = error.response?.status || 'No Status';
    
    log.error(`API request failed: ${method} ${url} (${status})`, {
      status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      code: error.code
    });
    
    // Check for common error patterns
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      log.error("🚨 NETWORK ERROR detected", {
        possibleCauses: [
          "API server is not running",
          "API URL is not accessible",
          "CORS issues",
          "Firewall blocking requests"
        ],
        currentApiUrl: api.defaults.baseURL
      });
    }
    
    return Promise.reject(error);
  }
);

// Helper function to make API calls with automatic fallback to mock data
const makeApiCall = async (apiCall, mockCall, endpoint) => {
  // Always try real API first, fallback to mock on error
  try {
    log.debug(`🌐 Attempting real API call: ${endpoint}`);
    const result = await apiCall();
    log.success(`✅ Real API call successful: ${endpoint}`);
    return result;
  } catch (error) {
    log.warn(`⚠️ Real API call failed: ${endpoint}`, {
      status: error.response?.status,
      message: error.message
    });
    
    // In development, fallback to mock data
    if (import.meta.env.VITE_ENVIRONMENT === 'development') {
      log.info(`🔧 Using mock data for: ${endpoint}`);
      return mockCall();
    }
    
    // In production, re-throw the error
    throw error;
  }
};

// API service functions based on your API documentation
export const apiService = {
  // Authentication
  auth: {
    verify: async () => {
      return makeApiCall(
        async () => {
          // For auth/verify, we need to send initData in the header
          const initData = window.Telegram?.WebApp?.initData;
          if (!initData) {
            throw new Error("Telegram initData not available");
          }
          return api.post('/auth/verify', {}, {
            headers: {
              'X-Telegram-Init-Data': initData
            }
          });
        },
        () => mockApiService.auth.verify(),
        'auth/verify'
      );
    },

    loginWidget: async (authData) => {
      return makeApiCall(
        async () => {
          return api.post('/auth/login-widget', authData);
        },
        () => mockApiService.auth.login(authData),
        'auth/login-widget'
      );
    },

    getStatus: () => {
      // Use webapp/user/profile as backend doesn't have /auth/status
      return makeApiCall(
        async () => {
          const response = await api.get('/webapp/user/profile');
          return {
            success: true,
            data: {
              authenticated: true,
              user: response.data,
              tokenValid: true
            }
          };
        },
        () => ({
          success: true,
          data: {
            authenticated: true,
            user: { id: 505722420, first_name: 'Mock', username: 'mockuser' },
            tokenValid: true
          }
        }),
        'auth/status (using webapp/user/profile)'
      );
    }
  },

  // Groups - Unified Authentication (supports both JWT and WebApp on same endpoints)
  groups: {
    // Get user's admin groups - unified endpoint
    getAll: () => {
      return makeApiCall(
        async () => api.get('/groups'),
        () => mockApiService.groups.getAll(),
        'groups'
      );
    },

    // Legacy WebApp-specific endpoint (deprecated but maintained for compatibility)
    getAllWebApp: () => {
      return makeApiCall(
        async () => {
          const initData = window.Telegram?.WebApp?.initData;
          if (!initData) {
            throw new Error("Telegram initData not available for WebApp endpoint");
          }
          return api.get('/webapp/user/groups', {
            headers: {
              'X-Telegram-Init-Data': initData
            }
          });
        },
        () => mockApiService.groups.getAll(),
        'webapp/user/groups'
      );
    },

    // Group details - unified endpoint (auto-detects auth type)
    getById: (groupId) => {
      return makeApiCall(
        async () => api.get(`/groups/${groupId}`),
        () => mockApiService.groups.getById(groupId),
        `groups/${groupId}`
      );
    },

    // Legacy WebApp-specific endpoint (deprecated)
    getByIdWebApp: (groupId) => {
      return makeApiCall(
        async () => api.get(`/webapp/group/${groupId}`),
        () => mockApiService.groups.getById(groupId),
        `webapp/group/${groupId}`
      );
    },

    // Group settings - unified endpoint (supports both JWT and WebApp auth)
    getSettings: (groupId) => {
      log.debug(`⚙️ Making unified settings request for groupId: ${groupId}`);
      return makeApiCall(
        async () => api.get(`/groups/${groupId}/settings`),
        () => mockApiService.groups.getSettings(groupId),
        `groups/${groupId}/settings`
      );
    },

    updateSettings: (groupId, settings) => {
      return makeApiCall(
        async () => api.put(`/groups/${groupId}/settings`, { settings }),
        () => mockApiService.groups.updateSettings(groupId, settings),
        `groups/${groupId}/settings`
      );
    },

    // Legacy WebApp settings endpoints (deprecated but maintained)
    getSettingsWebApp: (groupId) => {
      log.debug(`⚙️ Making WebApp settings request for groupId: ${groupId}`);
      return makeApiCall(
        async () => api.get(`/groups/${groupId}/settings`), // Using unified endpoint
        () => mockApiService.groups.getSettings(groupId),
        `groups/${groupId}/settings (via legacy WebApp call)`
      );
    },

    updateSettingsWebApp: (groupId, settings) => {
      return makeApiCall(
        async () => api.put(`/groups/${groupId}/settings`, { settings }), // Using unified endpoint
        () => mockApiService.groups.updateSettings(groupId, settings),
        `groups/${groupId}/settings (via legacy WebApp call)`
      );
    },

    // Group statistics - Enhanced WebApp analytics endpoint
    getStatsWebApp: (groupId, period = 'week', startDate = null, endDate = null) => {
      log.debug(`📊 Making WebApp analytics request for groupId: ${groupId}, period: ${period}`);
      return makeApiCall(
        async () => {
          // Build query parameters
          const params = new URLSearchParams();
          params.append('period', period);
          if (startDate) params.append('startDate', startDate);
          if (endDate) params.append('endDate', endDate);
          
          const url = `/webapp/group/${groupId}/stats?${params.toString()}`;
          log.debug(`📊 WebApp analytics URL: ${url}`);
          const response = await api.get(url);
          log.debug(`📊 WebApp analytics raw response:`, response.data);
          return response;
        },
        () => mockApiService.groups.getStats(groupId),
        `webapp/group/${groupId}/stats`
      );
    },

    // Group statistics - unified endpoint (basic stats)
    getStats: (groupId, period = 'week', startDate = null, endDate = null) => {
      log.debug(`📊 Making unified stats request for groupId: ${groupId}`);
      log.info(`📊 Using unified groups endpoint - may have different format than WebApp analytics`);
      return makeApiCall(
        async () => {
          const url = `/groups/${groupId}/stats`;
          log.debug(`📊 Unified stats URL: ${url}`);
          const response = await api.get(url);
          log.debug(`📊 Unified stats raw response:`, response.data);
          return response;
        },
        () => mockApiService.groups.getStats(groupId),
        `groups/${groupId}/stats`
      );
    },

    // Group audit logs - unified endpoint  
    getAudit: (groupId, limit = 50, offset = 0) => {
      return makeApiCall(
        async () => {
          const params = new URLSearchParams();
          params.append('limit', limit);
          params.append('offset', offset);
          const url = `/groups/${groupId}/audit?${params.toString()}`;
          return api.get(url);
        },
        () => mockApiService.groups.getAudit(groupId),
        `groups/${groupId}/audit`
      );
    },

    // Export audit logs  
    exportAudit: (groupId, format = 'json') => {
      return makeApiCall(
        async () => {
          const params = new URLSearchParams();
          params.append('format', format);
          const url = `/groups/${groupId}/audit/export?${params.toString()}`;
          return api.get(url);
        },
        () => mockApiService.groups.getAudit(groupId),
        `groups/${groupId}/audit/export`
      );
    }
  },

  // Health endpoints
  health: {
    check: () => {
      return makeApiCall(
        async () => api.get('/health'),
        () => ({ status: 'healthy', timestamp: new Date().toISOString() }),
        'health'
      );
    }
  },

  // NLP (Natural Language Processing) endpoints
  nlp: {
    // Get NLP service status and capabilities
    getStatus: () => {
      return makeApiCall(
        async () => api.get('/nlp/status'),
        () => ({
          success: true,
          status: {
            service: "NLP Processing Service",
            version: "2.0",
            model: "gpt-4o-mini",
            features: {
              spamDetection: true,
              profanityFilter: true,
              combinedAnalysis: true,
              localFallbacks: true
            }
          }
        }),
        'nlp/status'
      );
    },

    // Test spam detection on a message
    testSpam: (text, whitelistedKeywords = []) => {
      return makeApiCall(
        async () => api.post('/nlp/test/spam', { text, whitelistedKeywords }),
        () => ({
          success: true,
          analysis: {
            isSpam: text.toLowerCase().includes('buy') || text.includes('!'),
            score: 0.75,
            confidence: 0.85,
            reasons: ["promotional language", "urgency tactics"]
          }
        }),
        'nlp/test/spam'
      );
    },

    // Test profanity detection on a message  
    testProfanity: (text) => {
      return makeApiCall(
        async () => api.post('/nlp/test/profanity', { text }),
        () => ({
          success: true,
          analysis: {
            hasProfanity: false,
            severity: 0,
            confidence: 0.98,
            detectedWords: []
          }
        }),
        'nlp/test/profanity'
      );
    },

    // Complete message analysis (spam + profanity)
    analyze: (text, options = {}) => {
      const { whitelistedKeywords = [], groupId = null } = options;
      
      // If no groupId provided, try to get from current context or use a default
      const finalGroupId = groupId || localStorage.getItem('current_group_id') || '-4982630468'; // Use actual group ID
      
      return makeApiCall(
        async () => api.post('/nlp/analyze', { 
          text, 
          whitelistedKeywords, 
          groupId: finalGroupId // Ensure groupId is always provided
        }),
        () => ({
          success: true,
          analysis: {
            spam: {
              isSpam: text.toLowerCase().includes('buy'),
              score: 0.65,
              confidence: 0.80,
              reasons: ["promotional language"]
            },
            profanity: {
              hasProfanity: false,
              severity: 0,
              confidence: 0.99,
              detectedWords: []
            }
          },
          interpretation: {
            wouldTriggerSpam: true,
            wouldTriggerProfanity: false,
            spamThreshold: 0.7,
            profanityEnabled: true,
            profanityThreshold: 0.5
          }
        }),
        'nlp/analyze'
      );
    }
  },

  // Strike Management API
  strikes: {
    // Add strikes to a user (1-100)
    add: (groupId, userId, strikesCount, reason = '') => {
      return makeApiCall(
        async () => api.post(`/groups/${groupId}/users/${userId}/strikes`, { // Use correct backend endpoint
          strikes: strikesCount, 
          reason 
        }),
        () => ({
          success: true,
          data: {
            userId,
            totalStrikes: Math.min(strikesCount + 2, 100), // Mock current + new
            strikeAdded: strikesCount,
            reason,
            timestamp: new Date().toISOString()
          }
        }),
        `groups/${groupId}/users/${userId}/strikes (ADD)`
      );
    },

    // Remove strikes from a user (1-100)
    remove: (groupId, userId, strikesCount, reason = '') => {
      return makeApiCall(
        async () => api.delete(`/groups/${groupId}/users/${userId}/strikes`, { // Use correct backend endpoint
          data: { strikes: strikesCount, reason }
        }),
        () => ({
          success: true,
          data: {
            userId,
            totalStrikes: Math.max(5 - strikesCount, 0), // Mock current - removed
            strikesRemoved: strikesCount,
            reason,
            timestamp: new Date().toISOString()
          }
        }),
        `groups/${groupId}/users/${userId}/strikes (REMOVE)`
      );
    },

    // Set specific strike count (0-1000)
    set: (groupId, userId, strikesCount, reason = '') => {
      return makeApiCall(
        async () => api.put(`/groups/${groupId}/users/${userId}/strikes`, { // Use correct backend endpoint
          strikes: strikesCount, 
          reason 
        }),
        () => ({
          success: true,
          data: {
            userId,
            totalStrikes: strikesCount,
            previousStrikes: 3, // Mock previous value
            reason,
            timestamp: new Date().toISOString()
          }
        }),
        `groups/${groupId}/users/${userId}/strikes (SET)`
      );
    },

    // Get detailed strike history with pagination
    getHistory: (groupId, userId, page = 1, limit = 50) => {
      return makeApiCall(
        async () => api.get(`/groups/${groupId}/users/${userId}/strikes?page=${page}&limit=${limit}`), // Use correct backend endpoint
        () => ({
          success: true,
          data: {
            userId,
            currentStrikes: 5,
            history: [
              {
                id: 1,
                action: 'add',
                strikes: 2,
                reason: 'Spam messaging',
                adminId: 123456,
                adminName: 'ModeratorBot',
                timestamp: new Date(Date.now() - 86400000).toISOString()
              },
              {
                id: 2,
                action: 'add',
                strikes: 3,
                reason: 'Inappropriate content',
                adminId: 123456,
                adminName: 'ModeratorBot',
                timestamp: new Date(Date.now() - 172800000).toISOString()
              }
            ],
            pagination: {
              page,
              limit,
              total: 2,
              totalPages: 1
            }
          }
        }),
        `groups/${groupId}/users/${userId}/strikes (HISTORY)`
      );
    }
  },

  // Audit Log System API
  audit: {
    // Get paginated audit log with advanced filtering
    getLogs: (groupId, options = {}) => {
      const { 
        page = 1, 
        limit = 50, 
        userId = null, 
        type = null, // Changed from actionType to type to match API spec
        startDate = null, 
        endDate = null 
      } = options;
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: Math.min(limit, 200).toString() // Max 200 per page
      });
      
      if (userId) params.append('userId', userId);
      if (type) params.append('type', type); // Using 'type' parameter as per API spec
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      return makeApiCall(
        async () => api.get(`/groups/${groupId}/audit?${params.toString()}`), // Use correct backend endpoint
        () => ({
          success: true,
          data: [
            {
              id: 1,
              timestamp: "2025-08-06T07:40:01.103Z",
              chatId: "-1002704321633",
              userId: "7333273485",
              type: "AUTO",
              action: "Auto-strike",
              details: {
                violationType: "profanity",
                reason: "Inappropriate content detected",
                classificationScore: 1,
                originalMessage: "[REDACTED]",
                strikes: 1
              }
            },
            {
              id: 2,
              timestamp: "2025-08-06T06:45:22.123Z",
              chatId: "-1002704321633",
              userId: "5551234567",
              type: "MANUAL-STRIKE-ADD",
              action: "Manual strike added",
              details: {
                violationType: null,
                reason: "Excessive spam",
                adminId: "123456789",
                adminName: "ModeratorBot",
                strikes: 2
              }
            },
            {
              id: 3,
              timestamp: "2025-08-06T06:30:15.456Z",
              chatId: "-1002704321633",
              userId: "7777888899",
              type: "AUTO",
              action: "Message-deleted",
              details: {
                violationType: "spam",
                reason: "Promotional content",
                classificationScore: 0.95,
                messageId: "12345"
              }
            }
          ],
          pagination: {
            page,
            limit,
            total: 3,
            totalPages: 1,
            hasNext: false,
            hasPrev: false
          },
          filters: {
            userId,
            type,
            startDate,
            endDate
          }
        }),
        `groups/${groupId}/audit`
      );
    },

    // Export audit logs (CSV or JSON)
    export: (groupId, format = 'csv', options = {}) => {
      const { 
        userId = null, 
        type = null, // Changed from actionType to type
        startDate = null, 
        endDate = null 
      } = options;
      
      const params = new URLSearchParams({
        format: format.toLowerCase()
      });
      
      if (userId) params.append('userId', userId);
      if (type) params.append('type', type); // Using 'type' parameter as per API spec
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      return makeApiCall(
        async () => {
          const response = await api.get(`/groups/${groupId}/audit/export?${params.toString()}`, { // Use correct backend endpoint
            responseType: format === 'csv' ? 'blob' : 'json'
          });
          return response;
        },
        () => {
          if (format === 'csv') {
            // Mock CSV response matching the new data structure
            const csvData = `id,timestamp,chatId,userId,type,action,details.reason,details.adminName
1,2025-08-06T07:40:01.103Z,-1002704321633,7333273485,AUTO,Auto-strike,Inappropriate content detected,
2,2025-08-06T06:45:22.123Z,-1002704321633,5551234567,MANUAL-STRIKE-ADD,Manual strike added,Excessive spam,ModeratorBot
3,2025-08-06T06:30:15.456Z,-1002704321633,7777888899,AUTO,Message-deleted,Promotional content,`;
            
            return {
              data: new Blob([csvData], { type: 'text/csv' }),
              headers: {
                'content-disposition': `attachment; filename="audit_log_${groupId}_${new Date().toISOString().split('T')[0]}.csv"`
              }
            };
          } else {
            // Mock JSON response with the new data structure
            return {
              success: true,
              data: [
                {
                  id: 1,
                  timestamp: "2025-08-06T07:40:01.103Z",
                  chatId: "-1002704321633",
                  userId: "7333273485",
                  type: "AUTO",
                  action: "Auto-strike",
                  details: {
                    violationType: "profanity",
                    reason: "Inappropriate content detected",
                    classificationScore: 1
                  }
                }
              ],
              pagination: {
                page: 1,
                limit: 50,
                total: 1,
                totalPages: 1,
                hasNext: false,
                hasPrev: false
              },
              filters: options
            };
          }
        },
        `groups/${groupId}/audit/export`
      );
    }
  },

  // WebApp specific endpoints
  webApp: {
    // Get user groups using WebApp authentication
    getUserGroups: () => {
      return apiService.groups.getAllWebApp();
    },
    
    // Authenticate using Telegram WebApp initData
    authenticate: (initData) => {
      return makeApiCall(
        async () => {
          // Send initData in the X-Telegram-Init-Data header as expected by the API
          return api.post('/webapp/auth', {}, {
            headers: {
              'X-Telegram-Init-Data': initData
            }
          });
        },
        () => ({
          success: true,
          data: {
            token: 'mock-jwt-token',
            user: { id: 505722420, first_name: 'Mock', username: 'mockuser' }
          }
        }),
        'webapp/auth'
      );
    },

    // Alias for backward compatibility
    auth: function(initData) {
      return this.authenticate(initData);
    },

    // Get health status for WebApp
    getHealth: () => {
      return makeApiCall(
        async () => api.get('/webapp/health'),
        () => ({ status: 'success', data: { status: 'healthy' } }),
        'webapp/health'
      );
    }
  }
};

// Add backward compatibility alias
apiService.webapp = apiService.webApp;

export default apiService;
export { API_BASE_URL, TELEGRAM_BOT_USERNAME, ENABLE_TELEGRAM_LOGIN };
