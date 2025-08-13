// ErrorScreen.jsx
import React from 'react';
import { API_BASE_URL } from '../../services/api';
import DebugConsole from '../DebugConsole'; 

const ErrorScreen = ({
  error,
  onRetry,
  onTestEndpoint,
  onTestAuth,
  onTestRealAuth,
  debugInfo // kept for your other UI, not required by DebugConsole
}) => {
  // Default open
  const [showConsole, setShowConsole] = React.useState(true);

  // Make sure the Mini App shows & expands in Telegram’s webview
  React.useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    try {
      tg?.ready?.();        // show the app as soon as essential UI is ready
      tg?.expand?.();       // request max height inside the webview
      tg?.setBackgroundColor?.('#ffffff');
    } catch {}
  }, []);

  return (
    <div
      className="app-error"
      style={{
        position: 'relative',
        backgroundColor: '#fff',
        // Use small viewport height so toolbars/webview chrome don’t cut content
        minHeight: '100svh',
        padding: '16px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)'
      }}
    >
      <h2>❌ Connection Error</h2>
      <p>{error}</p>

      <button onClick={onRetry} className="retry-btn">🔄 Retry</button>

      <div className="api-info" style={{ marginTop: 12 }}>
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

      {/* Floating reopen chip when the console is closed */}
      {!showConsole && (
        <button
          onClick={() => setShowConsole(true)}
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
            left: 'calc(env(safe-area-inset-left, 0px) + 14px)',
            zIndex: 2147483646,
            background: '#222',
            color: '#fff',
            borderRadius: 20,
            padding: '8px 12px',
            border: '1px solid #444',
          }}
        >
          🐞 Debug
        </button>
      )}

      {/* The actual console (default-open) */}
      <DebugConsole
        isVisible={showConsole}
        onToggle={() => setShowConsole(false)}
      />
    </div>
  );
};

export default ErrorScreen;
