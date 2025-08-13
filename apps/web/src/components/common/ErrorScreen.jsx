// apps/web/src/components/common/ErrorScreen.jsx
import React, { useState } from 'react';
import { API_BASE_URL } from '../../services/api';
import DebugConsole from './DebugConsole';

const ErrorScreen = ({
  error,
  onRetry,
  onTestEndpoint,
  onTestAuth,
  onTestRealAuth,
}) => {
  const [showDebug, setShowDebug] = useState(true); // open by default on error
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  const stack = error instanceof Error ? error.stack : null;

  return (
    <div className="app-error">
      <h2>❌ Connection Error</h2>
      <p>{message}</p>
      {stack && (
        <details style={{ margin: '8px 0' }}>
          <summary style={{ cursor: 'pointer' }}>View stack</summary>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{stack}</pre>
        </details>
      )}

      <button onClick={onRetry} className="retry-btn">🔄 Retry</button>

      {/* Toggle + viewer (viewer stays mounted while just hidden) */}
      <div style={{ marginTop: 8 }}>
        <button onClick={() => setShowDebug(v => !v)} className="test-btn">
          {showDebug ? '🙈 Hide Debug' : '🐞 Show Debug'}
        </button>
      </div>
      <DebugConsole isVisible={showDebug} onToggle={() => setShowDebug(false)} />

      <div className="api-info">
        <p>API URL: {API_BASE_URL}</p>
        <p>🔧 For API testing, access the Super Admin Dashboard after login</p>
        {onTestEndpoint && (
          <>
            <button onClick={() => onTestEndpoint('/health')} className="test-btn">🧪 Test Health</button>
            <button onClick={() => onTestEndpoint('/webapp/health')} className="test-btn">🧪 Test WebApp Health</button>
          </>
        )}
        {onTestAuth && <button onClick={onTestAuth} className="test-btn">🧪 Test Auth Endpoint</button>}
        {onTestRealAuth && <button onClick={onTestRealAuth} className="test-btn">🔍 Test Real Telegram Auth</button>}
      </div>
    </div>
  );
};

export default ErrorScreen;
