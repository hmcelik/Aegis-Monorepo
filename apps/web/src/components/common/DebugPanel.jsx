import React from 'react';

const DebugPanel = ({ debugInfo = [], showDebug, compact = false }) => {
  if (!showDebug) return null;

  const maxLogs = compact ? 5 : 10;
  const height = compact ? '200px' : '300px';

  return (
    <div
      style={{
        margin: '1rem 0',
        padding: '1rem',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        maxHeight: height,
        overflowY: 'auto',
        fontSize: '0.8rem',
        fontFamily: 'monospace',
      }}
    >
      <h3>🔍 Debug Information {compact && '(Last 5)'}</h3>
      {debugInfo.length === 0 ? (
        <p>No debug information available yet.</p>
      ) : (
        debugInfo.slice(-maxLogs).map(log => (
          <div
            key={log.id}
            style={{
              marginBottom: '0.5rem',
              padding: '0.5rem',
              backgroundColor: 'white',
              borderRadius: '4px',
            }}
          >
            <div
              style={{ fontWeight: 'bold', color: '#666', fontSize: compact ? '0.7rem' : '0.8rem' }}
            >
              {log.timestamp}
            </div>
            <div style={{ color: '#333' }}>{log.message}</div>
            {log.data && (
              <pre
                style={{
                  margin: '0.5rem 0 0 0',
                  fontSize: compact ? '0.6rem' : '0.7rem',
                  color: '#666',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {log.data}
              </pre>
            )}
          </div>
        ))
      )}
    </div>
  );
};

const DebugToggle = ({ showDebug, setShowDebug, compact = false }) => {
  const style = compact
    ? {
        backgroundColor: showDebug ? '#ff9800' : '#2196f3',
        fontSize: '0.8rem',
        padding: '0.25rem 0.5rem',
      }
    : { backgroundColor: showDebug ? '#ff9800' : '#2196f3' };

  return (
    <div style={{ margin: compact ? '0.5rem 0' : '1rem 0' }}>
      <button onClick={() => setShowDebug(!showDebug)} className="test-btn" style={style}>
        {showDebug ? '🔍 Hide Debug' : '🔍 Debug'}
        {!compact && ' Info'}
      </button>
    </div>
  );
};

export { DebugPanel, DebugToggle };
