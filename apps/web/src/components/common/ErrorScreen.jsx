// ErrorScreen.jsx
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../../services/api';

/** ---------- Embedded, always-available Debug Console ---------- **/
function DebugConsole({ visible = true, onClose }) {
  const [portalNode, setPortalNode] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [logs, setLogs] = useState([]);
  const endRef = useRef(null);
  const original = useRef({});
  const installed = useRef(false);

  // Create a portal container at <body> level
  useEffect(() => {
    const node = document.createElement('div');
    node.id = 'debug-console-portal';
    document.body.appendChild(node);
    setPortalNode(node);
    return () => {
      document.body.removeChild(node);
    };
  }, []);

  // Patch console.* once
  useEffect(() => {
    if (installed.current) return;
    installed.current = true;

    original.current = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    };

    const add = (type, ...args) => {
      const ts = new Date().toLocaleTimeString();
      const msg = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
        .join(' ');
      setLogs((prev) => [...prev.slice(-199), { id: ts + Math.random(), type, ts, msg }]);
      // also forward to original
      original.current[type](...args);
    };

    console.log = (...a) => add('log', ...a);
    console.error = (...a) => add('error', ...a);
    console.warn = (...a) => add('warn', ...a);
    console.info = (...a) => add('info', ...a);
    console.debug = (...a) => add('debug', ...a);

    return () => {
      Object.assign(console, original.current);
      installed.current = false;
    };
  }, []);

  useEffect(() => {
    if (!minimized && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, minimized]);

  if (!visible || !portalNode) return null;

  const color = (t) =>
    t === 'error' ? '#ff6b6b' : t === 'warn' ? '#ffb020' : t === 'info' ? '#66b3ff' : t === 'debug' ? '#aaaaaa' : '#6aff9f';

  const ui = (
    <div
      style={{
        position: 'fixed',
        inset: 'auto 10px calc(env(safe-area-inset-bottom, 0px) + 10px) 10px',
        left: 'calc(env(safe-area-inset-left, 0px) + 10px)',
        right: 'calc(env(safe-area-inset-right, 0px) + 10px)',
        height: minimized ? 52 : 300,
        background: '#000',
        border: '1px solid #333',
        borderRadius: 10,
        color: '#d1ffd1',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 28px rgba(0,0,0,.45)',
        pointerEvents: 'auto',
        transition: 'height .25s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: '#151515',
          borderBottom: minimized ? 'none' : '1px solid #2a2a2a',
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
        }}
      >
        <strong>🔍 Debug Console</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMinimized((m) => !m)} style={btn('#9aff9a')}>
            {minimized ? '⬆️' : '⬇️'}
          </button>
          <button onClick={() => setLogs([])} style={btn('#9aff9a')}>🗑️</button>
          <button onClick={onClose} style={btn('#ff6b6b')}>✖️</button>
        </div>
      </div>

      {!minimized && (
        <div style={{ flex: 1, overflow: 'auto', padding: 8, background: '#0e0e0e' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#888', textAlign: 'center', marginTop: 16 }}>
              Console output will appear here.
            </div>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                style={{
                  marginBottom: 6,
                  padding: '6px 8px',
                  background: l.type === 'error' ? '#2a1515' : l.type === 'warn' ? '#2a2415' : l.type === 'info' ? '#152028' : '#101010',
                  borderLeft: `3px solid ${color(l.type)}`,
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: color(l.type), flexShrink: 0 }}>{icon(l.type)}</span>
                  <span style={{ color: '#808080', fontSize: 10, width: 64, flexShrink: 0 }}>{l.ts}</span>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: color(l.type), lineHeight: 1.35 }}>{l.msg}</pre>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );

  return createPortal(ui, portalNode);
}

const btn = (c) => ({
  background: 'none',
  border: '1px solid #333',
  color: c,
  borderRadius: 6,
  padding: '4px 8px',
  cursor: 'pointer',
});

const icon = (t) =>
  t === 'error' ? '❌' : t === 'warn' ? '⚠️' : t === 'info' ? 'ℹ️' : t === 'debug' ? '🐞' : '📝';

/** --------------------------- Page UI --------------------------- **/
export default function ErrorScreen({
  error = 'Mini App Authentication Failed: Network Error',
  onRetry,
  onTestEndpoint,
  onTestAuth,
  onTestRealAuth,
}) {
  const [consoleOpen, setConsoleOpen] = useState(true); // default OPEN

  // Telegram webview: show & expand the app, set light background
  useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    try {
      tg?.ready?.();
      tg?.expand?.(); // request max height inside Telegram
      tg?.setBackgroundColor?.('#ffffff');
    } catch {}
  }, []);

  return (
    <div
      style={{
        background: '#fff',
        color: '#111',
        minHeight: '100svh', // small-viewport unit (stable in mobile webviews)
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      }}
    >
      <h2 style={{ margin: 0 }}>❌ Connection Error</h2>
      <p style={{ marginTop: 4 }}>{error}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {onRetry && (
          <button onClick={onRetry} style={pill('#111', '#fff', '#ddd')}>
            🔄 Retry
          </button>
        )}
        {onTestEndpoint && (
          <>
            <button onClick={() => onTestEndpoint('/health')} style={pill()}>
              🧪 Test Health
            </button>
            <button onClick={() => onTestEndpoint('/webapp/health')} style={pill()}>
              🧪 Test WebApp Health
            </button>
          </>
        )}
        {onTestAuth && (
          <button onClick={onTestAuth} style={pill()}>
            🧪 Test Auth Endpoint
          </button>
        )}
        {onTestRealAuth && (
          <button onClick={onTestRealAuth} style={pill()}>
            🔍 Test Real Telegram Auth
          </button>
        )}
      </div>

      <div style={{ marginTop: 4, fontSize: 13, color: '#444' }}>
        <div>API URL: <code>{API_BASE_URL || '—'}</code></div>
        <div>🔧 For API testing, access the Super Admin Dashboard after login</div>
      </div>

      {/* Reopen chip when console is closed */}
      {!consoleOpen && (
        <button
          onClick={() => setConsoleOpen(true)}
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
            left: 'calc(env(safe-area-inset-left, 0px) + 14px)',
            zIndex: 2147483646,
            background: '#222',
            color: '#fff',
            borderRadius: 18,
            padding: '8px 12px',
            border: '1px solid #444',
            boxShadow: '0 6px 20px rgba(0,0,0,.35)',
          }}
        >
          🐞 Debug
        </button>
      )}

      {/* The console itself (mounted at <body> level via a portal) */}
      <DebugConsole visible={consoleOpen} onClose={() => setConsoleOpen(false)} />
    </div>
  );
}

function pill(bg = '#f6f6f6', fg = '#111', bd = '#e5e5e5') {
  return {
    background: bg,
    color: fg,
    border: `1px solid ${bd}`,
    borderRadius: 999,
    padding: '8px 12px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}
