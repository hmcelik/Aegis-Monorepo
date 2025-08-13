// apps/web/src/components/common/DebugConsole.jsx
import React, { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'aegis-debug-logs';
const MAX_LOGS = 500;

// Safely stringify any value (handles Error and circular objects)
function safeSerialize(val) {
  if (val instanceof Error) {
    return `${val.name}: ${val.message}\n${val.stack || ''}`;
  }
  if (typeof val === 'object' && val !== null) {
    const seen = new WeakSet();
    try {
      return JSON.stringify(
        val,
        (k, v) => {
          if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
          }
          return v;
        },
        2
      );
    } catch {
      // last resort
      return Object.prototype.toString.call(val);
    }
  }
  return String(val);
}

function formatArgs(args) {
  try {
    return args.map(safeSerialize).join(' ');
  } catch {
    return args.map(String).join(' ');
  }
}

function loadPersisted() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistLogs(logs) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // ignore persistence errors
  }
}

const patchCountKey = '__AegisConsolePatchCount__';
const originalsKey = '__AegisConsoleOriginals__';

const DebugConsole = ({
  isVisible,
  onToggle,
  persist = true,              // turn on/off sessionStorage persistence
  captureGlobalErrors = true,  // window.onerror + unhandledrejection
}) => {
  const [logs, setLogs] = useState(() => (persist ? loadPersisted() : []));
  const [isMinimized, setIsMinimized] = useState(false);
  const logsEndRef = useRef(null);

  // Ensure globals exist
  if (typeof window !== 'undefined') {
    window[patchCountKey] ??= 0;
  }

  // Append a log and optionally persist
  const addLog = (type, message) => {
    setLogs((prev) => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, type, message, timestamp: new Date().toLocaleTimeString() }];
      const trimmed = next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
      if (persist) persistLogs(trimmed);
      return trimmed;
    });
  };

  // Patch console.* (with strict-mode / multi-mount protection)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const shouldPatch = window[patchCountKey] === 0;
    window[patchCountKey]++;

    if (shouldPatch) {
      // Save originals once (globally)
      window[originalsKey] = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug,
      };

      const wrap = (level) => (...args) => {
        try {
          addLog(level, formatArgs(args));
        } catch {
          // never throw from console
        }
        try {
          window[originalsKey][level].apply(console, args);
        } catch {
          // never throw from console
        }
      };

      console.log = wrap('log');
      console.error = wrap('error');
      console.warn = wrap('warn');
      console.info = wrap('info');
      console.debug = wrap('debug');
    }

    return () => {
      // Unpatch only when the last viewer unmounts
      window[patchCountKey]--;
      if (window[patchCountKey] === 0 && window[originalsKey]) {
        Object.assign(console, window[originalsKey]);
        delete window[originalsKey];
      }
    };
  }, [persist]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global error hooks
  useEffect(() => {
    if (!captureGlobalErrors) return;
    const onErr = (event) => {
      const msg = event?.message || 'Unknown script error';
      const stack = event?.error?.stack || '';
      addLog('error', `[window.onerror] ${msg}\n${stack}`);
    };
    const onRej = (event) => {
      const reason = event?.reason instanceof Error
        ? `${event.reason.name}: ${event.reason.message}\n${event.reason.stack || ''}`
        : safeSerialize(event?.reason);
      addLog('error', `[unhandledrejection]\n${reason}`);
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, [captureGlobalErrors]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new logs
  useEffect(() => {
    if (logsEndRef.current && !isMinimized && isVisible) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isMinimized, isVisible]);

  const clearLogs = () => {
    if (persist) persistLogs([]);
    setLogs([]);
  };

  const copyLogs = async () => {
    const text = logs.map((l) => `[${l.timestamp}] ${l.type.toUpperCase()}  ${l.message}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      // Optional: toast/alert here if you like
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // ignore
      }
    }
  };

  if (!isVisible) return null;

  const colorFor = (type) =>
    type === 'error' ? '#ff4444' :
    type === 'warn'  ? '#ffaa00' :
    type === 'info'  ? '#0088ff' :
    type === 'debug' ? '#888888' : '#dddddd';

  const iconFor = (type) =>
    type === 'error' ? '❌' :
    type === 'warn'  ? '⚠️' :
    type === 'info'  ? 'ℹ️' :
    type === 'debug' ? '🔍' : '📝';

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
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
          <button onClick={copyLogs} style={{ background: 'none', border: 'none', color: '#00ff00', cursor: 'pointer', fontSize: 12 }}>📋</button>
          <button onClick={() => setIsMinimized(!isMinimized)} style={{ background: 'none', border: 'none', color: '#00ff00', cursor: 'pointer', fontSize: 14 }}>
            {isMinimized ? '⬆️' : '⬇️'}
          </button>
          <button onClick={clearLogs} style={{ background: 'none', border: 'none', color: '#00ff00', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
          <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 14 }}>✖️</button>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px', backgroundColor: '#111' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', marginTop: 20 }}>
              No logs yet. Console output will appear here.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                style={{
                  marginBottom: 4,
                  padding: '4px 8px',
                  backgroundColor:
                    log.type === 'error' ? '#331111' :
                    log.type === 'warn'  ? '#332211' :
                    log.type === 'info'  ? '#111133' : 'transparent',
                  borderRadius: 4,
                  borderLeft: `3px solid ${colorFor(log.type)}`,
                  wordBreak: 'break-word'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ flexShrink: 0 }}>{iconFor(log.type)}</span>
                  <span style={{ color: '#666', fontSize: 10, flexShrink: 0, minWidth: 60 }}>
                    {log.timestamp}
                  </span>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: colorFor(log.type), flex: 1, fontSize: 11 }}>
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
