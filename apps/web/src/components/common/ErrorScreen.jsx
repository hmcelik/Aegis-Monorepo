import React from 'react';
import { API_BASE_URL } from '../../services/api';
import { DebugPanel, DebugToggle } from './DebugPanel';

const ErrorScreen = ({ 
  error, 
  onRetry, 
  onTestEndpoint, 
  onTestAuth, 
  onTestRealAuth,
  debugInfo,
  showDebug,
  setShowDebug 
}) => {
  console.log('❌ Rendering error screen:', error);
  
  return (
    <div className="app-error">
      <h2>❌ Connection Error</h2>
      <p>{error}</p>
      <button onClick={onRetry} className="retry-btn">🔄 Retry</button>
      
      <DebugToggle showDebug={showDebug} setShowDebug={setShowDebug} />
      <DebugPanel debugInfo={debugInfo} showDebug={showDebug} setShowDebug={setShowDebug} />
      
      <div className="api-info">
        <p>API URL: {API_BASE_URL}</p>
        <p>🔧 For API testing, access the Super Admin Dashboard after login</p>
        {onTestEndpoint && (
          <>
            <button onClick={() => onTestEndpoint('/health')} className="test-btn">
              🧪 Test Health
            </button>
            <button onClick={() => onTestEndpoint('/webapp/health')} className="test-btn">
              🧪 Test WebApp Health
            </button>
          </>
        )}
        {onTestAuth && (
          <button onClick={onTestAuth} className="test-btn">
            🧪 Test Auth Endpoint
          </button>
        )}
        {onTestRealAuth && (
          <button onClick={onTestRealAuth} className="test-btn">
            🔍 Test Real Telegram Auth
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorScreen;
