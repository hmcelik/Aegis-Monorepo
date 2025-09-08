import React, { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import apiService from '../services/api';
import { useAuth } from './useAuth';

export const useAuthLogic = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const authStore = useAuth();

  // Load existing token on initialization
  const loadStoredAuth = useCallback(() => {
    const storedToken = localStorage.getItem('telegram_auth_token');
    const storedUserData = localStorage.getItem('telegram_user_data');

    if (storedToken) {
      // Note: apiService handles token internally

      // Use setTimeout to avoid state updates during render
      setTimeout(() => {
        // Also update the auth store with the token
        const currentUser = authStore.user;
        if (currentUser) {
          authStore.login(currentUser, storedToken);
        } else {
          // Just store the token for now
          authStore.login(null, storedToken);
        }
      }, 0);

      if (process.env.NODE_ENV === 'development') {
        console.log('🔑 Loaded stored token from localStorage and updated auth store');
      }
      return storedToken;
    } else if (storedUserData) {
      // Handle stored user data from Telegram Login Widget
      try {
        const userData = JSON.parse(storedUserData);

        // Use setTimeout to avoid state updates during render
        setTimeout(() => {
          setUser(userData);
          setIsAuthenticated(true);
          authStore.login(userData, null);
        }, 0);

        if (process.env.NODE_ENV === 'development') {
          console.log('👤 Loaded stored Telegram user data from localStorage');
        }
      } catch (error) {
        console.error('❌ Failed to parse stored user data:', error);
        localStorage.removeItem('telegram_user_data');
      }
    }

    return null;
  }, []); // Remove authStore dependency to prevent infinite loops

  // Load token when hook initializes
  React.useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  const authenticateWithTelegram = async (tg, debugLog) => {
    try {
      debugLog('🔐 Starting Telegram authentication...');
      debugLog('📋 InitData length', tg.initData?.length || 0);
      debugLog('🌐 Making request to webapp auth endpoint');

      const response = await apiService.webApp.authenticate(tg.initData);

      debugLog('✅ Server response received');
      debugLog('✅ Response status', response.status);
      debugLog('✅ Response data', response.data);

      // Handle API documentation format: { success: true, data: { token: "...", user: { id, first_name, username } }, message: "Authentication successful" }
      const serverResponse = response.data;

      debugLog('📊 Raw server response analysis', {
        responseType: typeof serverResponse,
        hasSuccess: 'success' in (serverResponse || {}),
        hasData: 'data' in (serverResponse || {}),
        successValue: serverResponse?.success,
        message: serverResponse?.message,
        keys: Object.keys(serverResponse || {}),
        fullResponse: serverResponse,
      });

      // Check for success flag - be more flexible about success detection
      const isSuccessful =
        serverResponse.success === true ||
        serverResponse.success === 'true' ||
        serverResponse.status === 'success' ||
        (serverResponse.message && serverResponse.message.toLowerCase().includes('successful'));

      if (!isSuccessful) {
        debugLog('❌ Authentication failed - no success indicator', {
          success: serverResponse.success,
          status: serverResponse.status,
          message: serverResponse.message,
          fullResponse: serverResponse,
        });
        throw new Error(
          `Authentication failed: ${serverResponse.message || 'Authentication was not successful'}`
        );
      }

      debugLog('✅ Success indicator found', {
        success: serverResponse.success,
        status: serverResponse.status,
        message: serverResponse.message,
      });

      // Extract token and user data from the documented format with fallbacks
      let data = serverResponse.data;
      let token = data?.token;
      let userData = data?.user;

      // Fallback: Check if token/user are at the root level
      if (!token) {
        token = serverResponse.token;
      }
      if (!userData) {
        userData = serverResponse.user || serverResponse;
      }

      // Additional fallback: If data is null but we have user info at root
      if (!data && (serverResponse.user || serverResponse.id)) {
        data = serverResponse;
        userData = serverResponse.user || serverResponse;
        token = serverResponse.token; // Try to get token from root
      }

      debugLog('🔍 Token and user extraction', {
        foundToken: !!token,
        tokenLength: token?.length || 0,
        foundUserData: !!userData,
        userDataKeys: Object.keys(userData || {}),
        dataSource: data === serverResponse.data ? 'response.data' : 'response (root)',
      });

      if (!token) {
        debugLog('❌ No JWT token in response after all fallbacks', {
          data,
          serverResponse,
          checkedLocations: ['data.token', 'response.token'],
        });
        // Don't fail completely if no token - some APIs might not return tokens immediately
        console.warn('⚠️ No JWT token found, proceeding without token authentication');
      }

      if (!userData) {
        debugLog('❌ No user data in response after all fallbacks', {
          data,
          serverResponse,
          checkedLocations: ['data.user', 'response.user', 'response (direct)'],
        });
        throw new Error('Authentication failed: No user data received');
      }

      // Extract user information
      const userId = userData.id;
      const username = userData.username || userData.first_name || 'User';
      const firstName = userData.first_name || username || 'User';

      if (!userId) {
        debugLog('❌ Server response missing user ID', {
          userData,
          availableFields: Object.keys(userData || {}),
        });
        throw new Error('Authentication failed: Missing user ID');
      }

      debugLog('👤 User data extracted', {
        userId,
        username,
        firstName,
        userData,
      });

      // Store JWT token for future API calls (if provided)
      if (token) {
        localStorage.setItem('telegram_auth_token', token);
        // Note: apiService handles token internally
        debugLog('🔑 Stored JWT token for future requests');
      } else {
        debugLog('ℹ️ No JWT token provided - will use X-Telegram-Init-Data for API calls');
        // Store the initData for future API calls that might need it
        if (window.Telegram?.WebApp?.initData) {
          localStorage.setItem('telegram_init_data', window.Telegram.WebApp.initData);
          debugLog('📱 Stored Telegram initData for future requests');
        }
      }

      const userObj = {
        id: userId,
        first_name: firstName,
        username: username,
        is_mini_app: true,
      };

      debugLog('👤 Created user object', userObj);

      // Update both local state and auth store
      setUser(userObj);
      setIsAuthenticated(true);

      // Use setTimeout to avoid state updates during render
      setTimeout(() => {
        authStore.login(userObj, token); // Store in Zustand store
      }, 0);

      toast.success('Welcome ' + userObj.first_name + '!');
      debugLog('✅ Authentication complete - user stored in both local state and auth store!');

      return userObj;
    } catch (error) {
      debugLog('❌ Authentication error', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      throw error;
    }
  };

  const handleTelegramLogin = async telegramUser => {
    try {
      toast.loading('Authenticating with Telegram...', { id: 'telegram-auth' });

      // Create a proper login widget authentication
      console.log('🔐 Telegram login widget authentication:', telegramUser);

      // Simulate the user object creation from login widget data
      const userObj = {
        id: telegramUser.id,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
        username: telegramUser.username,
        photo_url: telegramUser.photo_url,
        is_mini_app: false, // This is from login widget, not mini app
      };

      setUser(userObj);
      setIsAuthenticated(true);

      // Store user data for external website access
      localStorage.setItem('telegram_user_data', JSON.stringify(userObj));

      // Use setTimeout to avoid state updates during render
      setTimeout(() => {
        // Update auth store with user data (no token for widget auth)
        authStore.login(userObj, null);
      }, 0);

      toast.dismiss('telegram-auth');
      toast.success('Welcome ' + userObj.first_name + '!');
      return userObj;
    } catch (error) {
      toast.dismiss('telegram-auth');

      const errorMsg = error.message || 'Authentication failed';
      toast.error('Authentication failed: ' + errorMsg);
      throw error;
    }
  };

  const fallbackToDemoMode = async () => {
    console.log('🎮 Setting up demo mode...');
    const demoUser = {
      id: 999999,
      first_name: 'Demo',
      last_name: 'User',
      username: 'demo',
      is_guest: true,
    };

    console.log('👤 Created demo user:', demoUser);
    setUser(demoUser);
    setIsAuthenticated(true);
    console.log('✅ Demo user authenticated!');

    toast.success('Demo mode - Some features may be limited');
    return demoUser;
  };

  const authenticateAsGuest = async () => {
    console.log('👤 Setting up guest mode for external website...');
    // For external websites (not Telegram Mini App), don't authenticate automatically
    // User will need to either use Telegram Login Widget or click Demo Mode
    setIsAuthenticated(false);
    setUser(null);
  };

  return {
    isAuthenticated,
    user,
    authenticateWithTelegram,
    handleTelegramLogin,
    fallbackToDemoMode,
    authenticateAsGuest,
    setUser,
    setIsAuthenticated,
  };
};
