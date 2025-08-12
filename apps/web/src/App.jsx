// src/App.jsx - Refactored Modular Dashboard

import React, { useEffect, useState, useCallback, useRef } from 'react';

// Components
import ErrorBoundary from './components/common/ErrorBoundary';
import LoadingScreen from './components/common/LoadingScreen';
import ErrorScreen from './components/common/ErrorScreen';
import LoginScreen from './components/auth/LoginScreen';
import Dashboard from './components/Dashboard';
import GroupManagementDashboard from './components/GroupManagementDashboard';
import SubscriptionPage from './components/SubscriptionPage';
import SuperAdminTestPage from './components/SuperAdminTestPage';
import DebugConsole from './components/DebugConsole';

// Hooks
import { useAuthLogic } from './hooks/useAuthLogic';
import { useDashboard } from './hooks/useDashboard';

function App() {
  // Removed: console.log('🎯 App component rendering...');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDebugConsole, setShowDebugConsole] = useState(true); // Auto-show debug console
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' or 'groups'
  const initializationRef = useRef(false);

  // Custom hooks
  const { 
    isAuthenticated, 
    user, 
    authenticateWithTelegram, 
    handleTelegramLogin, 
    fallbackToDemoMode, 
    authenticateAsGuest 
  } = useAuthLogic();

  const {
    dashboardData,
    loadDashboardData,
    setDemoData
  } = useDashboard();

  // Removed: console.log('📊 Current state:', { isAuthenticated, user: user?.username, loading, error, hasData: !!dashboardData });

  const debugLog = (message, data) => {
    // Only log in development and limit frequency
    if (process.env.NODE_ENV === 'development') {
      console.log(`🐛 ${message}`, data);
    }
  };

  // Test functions moved to Super Admin Dashboard

  const initializeApp = useCallback(async () => {
    // Prevent multiple initializations
    if (initializationRef.current || isAuthenticated) {
      debugLog('✅ Already initialized or authenticated, skipping');
      return;
    }
    
    initializationRef.current = true;
    
    debugLog('🚀 Initializing app...');
    debugLog('🌍 Current URL', window.location.href);
    debugLog('🔍 Window.Telegram available', !!window.Telegram);
    debugLog('🔍 Window.Telegram.WebApp available', !!window.Telegram?.WebApp);
    
    try {
      setLoading(true);
      setError(null);

      const tg = window.Telegram?.WebApp;
      debugLog('📱 Telegram WebApp object exists', !!tg);
      debugLog('📱 Telegram WebApp initData exists', !!tg?.initData);
      debugLog('📱 Telegram WebApp initData length', tg?.initData?.length || 0);
      
      // Check if we're in a Telegram Mini App context
      const isMiniApp = !!(tg && tg.initData && tg.initData.length > 0);
      debugLog('📱 Is Mini App Context', isMiniApp);
      
      if (isMiniApp) {
        debugLog('📱 Telegram Mini App detected, starting auth...');
        debugLog('📱 InitData preview', tg.initData.substring(0, 100) + '...');
        const success = await authenticateWithTelegram(tg, debugLog);
        
        if (success) {
          // Load dashboard data after authentication
          debugLog('📊 Loading dashboard data...');
          try {
            await loadDashboardData();
          } catch (dashboardError) {
            debugLog('⚠️ Dashboard data loading failed', dashboardError.message);
            // Set empty dashboard data on error
            await loadDashboardData(); // This will set fallback data
          }
        } else {
          // For mini apps, if auth fails, show error instead of login
          throw new Error('Telegram Mini App authentication failed. Please restart the app.');
        }
      } else {
        debugLog('🌐 External website context or no Telegram WebApp initData found');
        debugLog('🌐 Reason', { hasWebApp: !!tg, hasInitData: !!tg?.initData });
        await authenticateAsGuest();
      }
    } catch (error) {
      debugLog('💥 App initialization error', error.message);
      
      const isMiniApp = !!(window.Telegram?.WebApp?.initData && window.Telegram?.WebApp?.initData.length > 0);
      
      if (isMiniApp) {
        // For mini apps, show error instead of falling back to login
        debugLog('❌ Mini App authentication failed, showing error');
        setError(`Mini App Authentication Failed: ${error.message}`);
      } else {
        // For external websites, fall back to guest mode (login screen)
        if (error.response?.status === 401 || error.response?.status === 400) {
          debugLog('🔄 Authentication failed, falling back to guest mode');
          try {
            await authenticateAsGuest();
          } catch (guestError) {
            debugLog('❌ Guest mode also failed', guestError.message);
            setError('Failed to initialize app');
          }
        } else {
          debugLog('❌ Critical error', error.message);
          setError(error.message || 'Unknown error occurred');
        }
      }
    } finally {
      debugLog('✅ App initialization complete');
      setLoading(false);
    }
  }, []); // Empty dependency array to prevent recreation

  const handleDemoMode = async () => {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('🎮 Demo mode button clicked - starting demo setup...');
      }
      await fallbackToDemoMode();
      if (process.env.NODE_ENV === 'development') {
        console.log('👤 Demo user set, now loading demo data...');
      }
      setDemoData();
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Demo data loaded successfully!');
      }
    } catch (error) {
      console.error('Demo mode error:', error);
    }
  };

  const handleTelegramAuth = async (telegramUser) => {
    try {
      await handleTelegramLogin(telegramUser);
      await loadDashboardData();
    } catch (error) {
      console.error('Telegram auth error:', error);
      await handleDemoMode();
    }
  };

  const handleRetry = () => {
    initializationRef.current = false;
    setError(null);
    initializeApp();
  };

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🚀 useEffect triggered, calling initializeApp...');
    }
    initializeApp();
  }, []); // Only run once on mount

  // Render different screens based on state
  // Removed excessive logging on every render

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <ErrorScreen
        error={error}
        onRetry={handleRetry}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        onTelegramLogin={handleTelegramAuth}
        onDemoMode={handleDemoMode}
      />
    );
  }

  // Removed: console.log('✅ Rendering Dashboard for authenticated user');

  const renderCurrentView = () => {
    try {
      switch (currentView) {
        case 'groups':
          return <GroupManagementDashboard user={user} />;
        case 'subscription':
          return <SubscriptionPage user={user} />;
        case 'admin-tests':
          return <SuperAdminTestPage user={user} />;
        case 'dashboard':
        default:
          return (
            <Dashboard
              user={user}
              dashboardData={dashboardData}
              onReloadData={loadDashboardData}
              showDebugConsole={showDebugConsole}
              onToggleDebugConsole={() => setShowDebugConsole(!showDebugConsole)}
            />
          );
      }
    } catch (error) {
      console.error('Error rendering view:', error);
      return (
        <div className="error-view">
          <h2>❌ Something went wrong</h2>
          <p>Error: {error.message}</p>
          <button onClick={() => setCurrentView('dashboard')}>
            Return to Dashboard
          </button>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Navigation Bar */}
      <nav className="bg-white/95 backdrop-blur-lg shadow-sm border-b border-slate-200/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Title */}
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">🤖</span>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                  Telegram Moderator
                </h1>
                <p className="text-sm text-slate-500">@AegisModerationBot</p>
              </div>
            </div>

            {/* Navigation Buttons - Desktop */}
            <div className="hidden md:flex items-center space-x-1">
              <button 
                onClick={() => setCurrentView('dashboard')}
                className={`group relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  currentView === 'dashboard' 
                    ? 'text-blue-700 bg-white shadow-md shadow-blue-200/50 border border-blue-200/30' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-lg">📊</span>
                  <span>Overview</span>
                </div>
                {currentView === 'dashboard' && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full shadow-lg shadow-blue-400/40"></div>
                )}
              </button>
              <button 
                onClick={() => setCurrentView('groups')}
                className={`group relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  currentView === 'groups' 
                    ? 'text-green-700 bg-white shadow-md shadow-green-200/50 border border-green-200/30' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-lg">🏘️</span>
                  <span>Groups</span>
                </div>
                {currentView === 'groups' && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-green-500 to-green-600 rounded-full shadow-lg shadow-green-400/40"></div>
                )}
              </button>
              <button 
                onClick={() => setCurrentView('subscription')}
                className={`group relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  currentView === 'subscription' 
                    ? 'text-purple-700 bg-white shadow-md shadow-purple-200/50 border border-purple-200/30' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-lg">👑</span>
                  <span>Premium</span>
                </div>
                {currentView === 'subscription' && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full shadow-lg shadow-purple-400/40"></div>
                )}
              </button>
              {/* Super Admin Test Page */}
              {(user?.id?.toString() === '5057224206' || user?.id === 5057224206) && (
                <button 
                  onClick={() => setCurrentView('admin-tests')}
                  className={`group relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    currentView === 'admin-tests' 
                      ? 'text-red-700 bg-white shadow-md shadow-red-200/50 border border-red-200/30' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">🛠️</span>
                    <span>Admin</span>
                  </div>
                  {currentView === 'admin-tests' && (
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-red-500 to-red-600 rounded-full shadow-lg shadow-red-400/40"></div>
                  )}
                </button>
              )}
              <button 
                onClick={() => setShowDebugConsole(!showDebugConsole)}
                className={`group relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  showDebugConsole 
                    ? 'text-amber-700 bg-white shadow-md shadow-amber-200/50 border border-amber-200/30' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-lg">🔍</span>
                  <span>Debug</span>
                </div>
                {showDebugConsole && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full shadow-lg shadow-amber-400/40"></div>
                )}
              </button>
            </div>

            {/* User Info */}
            <div className="flex items-center space-x-3 bg-slate-50/80 rounded-xl px-3 py-2 border border-slate-200/50">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                {user.first_name?.[0] || '👤'}
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-semibold text-slate-900">
                  {user.first_name}
                </div>
                <div className="text-xs text-slate-500">@{user.username || 'username'}</div>
              </div>
            </div>
          </div>

          {/* Mobile Navigation - Horizontal Pills */}
          <div className="md:hidden border-t border-slate-200/50 pt-3 pb-2">
            <div className="flex space-x-2 overflow-x-auto scrollbar-hide px-2">
              <button 
                onClick={() => setCurrentView('dashboard')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  currentView === 'dashboard' 
                    ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs">📊</span>
                  <span>Overview</span>
                </div>
              </button>
              <button 
                onClick={() => setCurrentView('groups')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  currentView === 'groups' 
                    ? 'bg-green-100 text-green-700 border border-green-200' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs">🏘️</span>
                  <span>Groups</span>
                </div>
              </button>
              <button 
                onClick={() => setCurrentView('subscription')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  currentView === 'subscription' 
                    ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs">👑</span>
                  <span>Premium</span>
                </div>
              </button>
              <button 
                onClick={() => setShowDebugConsole(!showDebugConsole)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  showDebugConsole 
                    ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs">�</span>
                  <span>Debug</span>
                </div>
              </button>
              {(user?.id?.toString() === '5057224206' || user?.id === 5057224206) && (
                <button 
                  onClick={() => setCurrentView('admin-tests')}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                    currentView === 'admin-tests' 
                      ? 'bg-red-100 text-red-700 border border-red-200' 
                      : 'text-red-600 hover:text-red-900 hover:bg-red-50 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs">🛠️</span>
                    <span>Admin</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white/60 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8 min-h-[calc(100vh-180px)]">
          {renderCurrentView()}
        </div>
      </main>
      
      {/* Debug Console */}
      <DebugConsole 
        isVisible={showDebugConsole}
        onToggle={() => setShowDebugConsole(!showDebugConsole)}
      />
    </div>
  );
}

// Wrap App with Error Boundary
const AppWithErrorBoundary = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithErrorBoundary;
