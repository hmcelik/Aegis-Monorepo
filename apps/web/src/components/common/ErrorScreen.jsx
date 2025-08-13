import React from 'react';
import { API_BASE_URL } from '../../services/api';
import { DebugPanel, DebugToggle } from './DebugPanel';

const ErrorScreen = ({
  error,
  onRetry,
  onTestEndpoint,
  onTestAuth,
  onTestRealAuth,
  debugInfo = [],
  showDebug,            // optional controlled prop
  setShowDebug          // optional controlled prop
}) => {
  // FALLBACK STATE: default open
  const [internalShowDebug, setInternalShowDebug] = React.useState(true);
  const isControlled = typeof showDebug === 'boolean' && typeof setShowDebug === 'function';
  const open = isControlled ? showDebug : internalShowDebug;
  const setOpen = isControlled ? setShowDebug : setInternalShowDebug;

  // Make sure the Mini App is shown & expanded in Telegram’s webview
  React.useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    try {
      tg?.ready?.();       // remove Telegram loader
      tg?.expand?.();      // expand to full height
      tg?.setBackgroundColor?.('#ffffff'); // keep background readable
    } catch {}
  }, []);

  return (
    <div
      className="app-error"
      style={{
        position: 'relative',
        zIndex: 1,
        backgroundColor: '#fff',
        // Use small-viewport units so it’s correct inside mobile webviews
        minHeight: '100svh',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)'
      }}
    >
      <h2>❌ Connection Error</h2>
      <p>{error}</p>
      <button onClick={onRetry} className="retry-btn">🔄 Retry</button>

      <DebugToggle showDebug={open} setShowDebug={setOpen} />
      <DebugPanel debugInfo={debugInfo} showDebug={open} />

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
