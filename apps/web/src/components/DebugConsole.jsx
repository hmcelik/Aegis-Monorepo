import React, { useState, useEffect, useRef } from 'react';

const DebugConsole = ({ isVisible, onToggle }) => {
  const [logs, setLogs] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const logsEndRef = useRef(null);
  const originalConsole = useRef({});

  useEffect(() => {
    // Store original console methods
    originalConsole.current = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };

    // Override console methods to capture logs
    const addLog = (type, ...args) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      // Use setTimeout to avoid setState during render
      setTimeout(() => {
        setLogs(prev => [...prev.slice(-49), { // Keep last 50 logs
          id: Date.now() + Math.random(),
          type,
          message,
          timestamp
        }]);
      }, 0);
      
      // Call original console method
      originalConsole.current[type](...args);
    };

    console.log = (...args) => addLog('log', ...args);
    console.error = (...args) => addLog('error', ...args);
    console.warn = (...args) => addLog('warn', ...args);
    console.info = (...args) => addLog('info', ...args);
    console.debug = (...args) => addLog('debug', ...args);

    // Clean up on unmount
    return () => {
      Object.assign(console, originalConsole.current);
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs are added
    if (logsEndRef.current && !isMinimized) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isMinimized]);

  const clearLogs = () => {
    setLogs([]);
  };

  const getLogIcon = (type) => {
    switch (type) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      case 'debug': return '🔍';
      default: return '📝';
    }
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'error': return '#ff4444';
      case 'warn': return '#ffaa00';
      case 'info': return '#0088ff';
      case 'debug': return '#888888';
      default: return '#333333';
    }
  };

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: isMinimized ? '10px' : '10px',
      left: '10px',
      right: '10px',
      height: isMinimized ? '50px' : '300px',
      backgroundColor: '#000000',
      color: '#00ff00',
      border: '1px solid #333',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      transition: 'height 0.3s ease'
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        backgroundColor: '#222',
        borderBottom: isMinimized ? 'none' : '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px'
      }}>
        <span style={{ fontWeight: 'bold' }}>
          🔍 Debug Console ({logs.length} logs)
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            style={{
              background: 'none',
              border: 'none',
              color: '#00ff00',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {isMinimized ? '⬆️' : '⬇️'}
          </button>
          <button
            onClick={clearLogs}
            style={{
              background: 'none',
              border: 'none',
              color: '#00ff00',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            🗑️
          </button>
          <button
            onClick={onToggle}
            style={{
              background: 'none',
              border: 'none',
              color: '#ff4444',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ✖️
          </button>
        </div>
      </div>

      {/* Logs content */}
      {!isMinimized && (
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px',
          backgroundColor: '#111'
        }}>
          {logs.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', marginTop: '20px' }}>
              No logs yet. Console output will appear here.
            </div>
          ) : (
            logs.map(log => (
              <div
                key={log.id}
                style={{
                  marginBottom: '4px',
                  padding: '4px 8px',
                  backgroundColor: log.type === 'error' ? '#331111' : 
                                 log.type === 'warn' ? '#332211' :
                                 log.type === 'info' ? '#111133' : 'transparent',
                  borderRadius: '4px',
                  borderLeft: `3px solid ${getLogColor(log.type)}`,
                  wordBreak: 'break-word'
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <span style={{ flexShrink: 0 }}>
                    {getLogIcon(log.type)}
                  </span>
                  <span style={{ 
                    color: '#666', 
                    fontSize: '10px',
                    flexShrink: 0,
                    minWidth: '60px'
                  }}>
                    {log.timestamp}
                  </span>
                  <pre style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    color: getLogColor(log.type),
                    flex: 1,
                    fontSize: '11px'
                  }}>
                    {log.message}
                  </pre>
                </div>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
};

export default DebugConsole;
