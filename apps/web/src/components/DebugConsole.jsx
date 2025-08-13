// DebugConsole.jsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const DebugConsole = ({ isVisible, onToggle }) => {
  const [logs, setLogs] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const logsEndRef = useRef(null);
  const originalConsole = useRef({});
  const [portalNode, setPortalNode] = useState(null);

  // Set up a portal container
  useEffect(() => {
    const node = document.createElement('div');
    node.setAttribute('id', 'debug-console-portal');
    document.body.appendChild(node);
    setPortalNode(node);
    return () => {
      document.body.removeChild(node);
    };
  }, []);

  useEffect(() => {
    // Prevent double-patching if multiple instances ever mount
    if (window.__DEBUG_CONSOLE_INSTALLED__) return;
    window.__DEBUG_CONSOLE_INSTALLED__ = true;

    originalConsole.current = {
      log: console.log, error: console.error, warn: console.warn,
      info: console.info, debug: console.debug,
    };

    const addLog = (type, ...args) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      setTimeout(() => {
        setLogs(prev => [...prev.slice(-49), {
          id: Date.now() + Math.random(), type, message, timestamp
        }]);
      }, 0);

      originalConsole.current[type](...args);
    };

    console.log = (...args) => addLog('log', ...args);
    console.error = (...args) => addLog('error', ...args);
    console.warn = (...args) => addLog('warn', ...args);
    console.info = (...args) => addLog('info', ...args);
    console.debug = (...args) => addLog('debug', ...args);

    return () => {
      Object.assign(console, originalConsole.current);
      window.__DEBUG_CONSOLE_INSTALLED__ = false;
    };
  }, []);

  useEffect(() => {
    if (logsEndRef.current && !isMinimized) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isMinimized]);

  const clearLogs = () => setLogs([]);

  const getLogIcon = (type) =>
    type === 'error' ? '❌' :
    type === 'warn'  ? '⚠️' :
    type === 'info'  ? 'ℹ️' :
    type === 'debug' ? '🔍' : '📝';

  const getLogColor = (type) =>
    type === 'error' ? '#ff4444' :
    type === 'warn'  ? '#ffaa00' :
    type === 'info'  ? '#0088ff' :
    type === 'debug' ? '#888888' : '#33ff66';

  if (!isVisible || !portalNode) return null;

  const consoleUI = (
    <div style={{
      position: 'fixed',
      // Keep it off the home indicator / bottom notch
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
      left:   'calc(env(safe-area-inset-left, 0px) + 10px)',
      right:  'calc(env(safe-area-inset-right, 0px) + 10px)',
      height: isMinimized ? '50px' : '300px',
      backgroundColor: '#000',
      color: '#00ff00',
      border: '1px solid #333',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: 2147483647, // topmost
      display: 'flex',
      flexDirection: 'column',
      transition: 'height 0.3s ease',
      boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
      pointerEvents: 'auto',
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
        borderTopRightRadius: '8px',
      }}>
        <span style={{ fontWeight: 'bold' }}>
          🔍 Debug Console ({logs.length} logs)
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setIsMinimized(!isMinimized)} style={btnStyle('#00ff00')}>
            {isMinimized ? '⬆️' : '⬇️'}
          </button>
          <button onClick={clearLogs} style={btnStyle('#00ff00')}>🗑️</button>
          <button onClick={onToggle} style={btnStyle('#ff4444')}>✖️</button>
        </div>
      </div>

      {/* Logs */}
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
              <div key={log.id} style={{
                marginBottom: '4px',
                padding: '4px 8px',
                backgroundColor:
                  log.type === 'error' ? '#331111' :
                  log.type === 'warn'  ? '#332211' :
                  log.type === 'info'  ? '#111133' : 'transparent',
                borderRadius: '4px',
                borderLeft: `3px solid ${getLogColor(log.type)}`,
                wordBreak: 'break-word'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ flexShrink: 0 }}>{getLogIcon(log.type)}</span>
                  <span style={{ color: '#888', fontSize: '10px', flexShrink: 0, minWidth: 60 }}>
                    {log.timestamp}
                  </span>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: getLogColor(log.type), flex: 1, fontSize: '11px' }}>
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

  return createPortal(consoleUI, portalNode);
};

const btnStyle = (color) => ({
  background: 'none',
  border: 'none',
  color,
  cursor: 'pointer',
  fontSize: '14px'
});

export default DebugConsole;
