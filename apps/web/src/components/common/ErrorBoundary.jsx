// ErrorBoundary.jsx
import React from 'react';

const STORAGE_KEY = 'aegis-debug-logs';
const MAX_LOGS = 500;

function stringifyArgs(args) {
  try {
    return args
      .map((a) => {
        if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
        if (typeof a === 'object') return JSON.stringify(a, null, 2);
        return String(a);
      })
      .join(' ');
  } catch (e) {
    return args.map(String).join(' ');
  }
}

function loadPersisted() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function persistLogs(logs) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      logs: loadPersisted(), // { ts, level, text }
      showTerminal: false,
      autoScroll: true,
    };

    this.terminalRef = React.createRef();
    this.originalConsole = {};
    this.boundOnError = null;
    this.boundOnRejection = null;
    this.boundOnBeforeUnload = null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidMount() {
    this.patchConsole();
    this.attachGlobalHandlers();
  }

  componentWillUnmount() {
    this.unpatchConsole();
    this.detachGlobalHandlers();
  }

  componentDidCatch(error, errorInfo) {
    this.addLog('error', `🚨 React ErrorBoundary caught:\n${error?.stack || String(error)}`);
    if (errorInfo?.componentStack) {
      this.addLog('error', `Component stack:\n${errorInfo.componentStack}`);
    }
    this.setState({ errorInfo });
  }

  patchConsole() {
    ['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
      const original = console[level];
      // Guard against double-patching (Strict Mode mounts, then unmounts, then mounts again in dev)
      if (original && !original.__AegisPatched) {
        const patched = (...args) => {
          try {
            this.addLog(level, stringifyArgs(args));
          } catch (e) {
            // last-resort: avoid breaking console
          }
          try {
            original.apply(console, args);
          } catch {
            // keep going; never throw from console
          }
        };
        patched.__AegisPatched = true;
        patched.__original = original;
        console[level] = patched;
      }
      this.originalConsole[level] = original?.__original || original;
    });
  }

  unpatchConsole() {
    ['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
      const current = console[level];
      if (current && current.__original) {
        console[level] = current.__original;
      } else if (this.originalConsole[level]) {
        console[level] = this.originalConsole[level];
      }
    });
  }

  attachGlobalHandlers() {
    this.boundOnError = (event) => {
      const msg = event?.message || 'Unknown script error';
      const stack = event?.error?.stack || '';
      this.addLog('error', `[window.onerror] ${msg}\n${stack}`);
    };

    this.boundOnRejection = (event) => {
      let reason;
      try {
        reason =
          event?.reason instanceof Error
            ? `${event.reason.name}: ${event.reason.message}\n${event.reason.stack || ''}`
            : JSON.stringify(event?.reason, null, 2);
      } catch {
        reason = String(event?.reason);
      }
      this.addLog('error', `[unhandledrejection]\n${reason}`);
    };

    this.boundOnBeforeUnload = () => {
      // Don't setState here. Persist directly so the note survives reloads.
      try {
        persistLogs([
          ...this.state.logs,
          { ts: new Date().toISOString(), level: 'info', text: '🔄 Page is reloading - check persisted logs after reload.' },
        ]);
      } catch {
        // ignore; page is closing
      }
    };

    window.addEventListener('error', this.boundOnError);
    window.addEventListener('unhandledrejection', this.boundOnRejection);
    window.addEventListener('beforeunload', this.boundOnBeforeUnload);
  }

  detachGlobalHandlers() {
    if (this.boundOnError) window.removeEventListener('error', this.boundOnError);
    if (this.boundOnRejection) window.removeEventListener('unhandledrejection', this.boundOnRejection);
    if (this.boundOnBeforeUnload) window.removeEventListener('beforeunload', this.boundOnBeforeUnload);
  }

  addLog = (level, text) => {
    this.setState(
      (prev) => {
        const next = [...prev.logs, { ts: new Date().toISOString(), level, text }];
        const trimmed = next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
        try {
          persistLogs(trimmed);
        } catch {
          // non-fatal; keep in memory
        }
        return { logs: trimmed };
      },
      () => {
        if (this.state.autoScroll && this.terminalRef.current) {
          const el = this.terminalRef.current;
          el.scrollTop = el.scrollHeight;
        }
      }
    );
  };

  handleToggleDetails = (e) => {
    // IMPORTANT: use currentTarget (the <details>), not target (could be <summary>)
    this.setState({ showTerminal: e.currentTarget.open });
  };

  copyLogs = async () => {
    const text = this.state.logs.map((l) => `[${l.ts}] ${l.level.toUpperCase()}  ${l.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.addLog('info', '📋 Logs copied to clipboard.');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.addLog('info', '📋 Logs copied to clipboard.');
      } catch {
        this.addLog('warn', '⚠️ Could not copy to clipboard.');
      }
    }
  };

  clearLogs = () => {
    try {
      persistLogs([]);
    } catch {
      // ignore
    }
    this.setState({ logs: [] }, () => {
      try {
        console.clear();
      } catch {
        // ignore
      }
      this.addLog('info', '🧹 In-app terminal cleared.');
    });
  };

  renderTerminal() {
    if (!this.state.showTerminal) return null;

    return (
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 6,
            flexWrap: 'wrap',
          }}
        >
          <strong>🖥️ Debug Console</strong>
          <button
            onClick={() => this.setState((s) => ({ autoScroll: !s.autoScroll }))}
            style={btnStyle}
            title="Toggle auto-scroll"
          >
            {this.state.autoScroll ? '⏩ Auto-Scroll: On' : '⏸️ Auto-Scroll: Off'}
          </button>
          <button onClick={this.copyLogs} style={btnStyle}>
            📋 Copy
          </button>
          <button onClick={this.clearLogs} style={{ ...btnStyle, background: '#6c757d' }}>
            🧹 Clear
          </button>
        </div>

        <div
          ref={this.terminalRef}
          style={{
            background: '#111',
            color: '#e6e6e6',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 12.5,
            borderRadius: 6,
            padding: 10,
            height: 260,
            overflow: 'auto',
            border: '1px solid #333',
          }}
        >
          {this.state.logs.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No logs yet. Interact with the app to see logs here.</div>
          ) : (
            this.state.logs.map((l, i) => {
              const color =
                l.level === 'error'
                  ? '#ff6b6b'
                  : l.level === 'warn'
                  ? '#ffd166'
                  : l.level === 'info'
                  ? '#7fd1ff'
                  : l.level === 'debug'
                  ? '#a0a0a0'
                  : '#ddd';
              return (
                <div key={`${l.ts}-${i}`} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <span style={{ color: '#888' }}>[{l.ts}]</span>{' '}
                  <span style={{ color, fontWeight: 600 }}>{l.level.toUpperCase()}</span>{' '}
                  <span>{l.text}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error" style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
          <h2>❌ Something went wrong</h2>
          <p>The app encountered an unexpected error.</p>

          <details onToggle={this.handleToggleDetails} style={{ margin: '16px 0' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>🔍 Debug Info</summary>

            {/* Error specifics */}
            <div
              style={{
                backgroundColor: '#fff3cd',
                padding: 10,
                marginTop: 10,
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <h4 style={{ margin: '2px 0 6px' }}>Error Message:</h4>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error?.toString()}</pre>

              <h4 style={{ margin: '12px 0 6px' }}>Error Stack:</h4>
              <pre
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}
              >
                {this.state.error?.stack}
              </pre>

              {this.state.errorInfo?.componentStack && (
                <>
                  <h4 style={{ margin: '12px 0 6px' }}>Component Stack:</h4>
                  <pre
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}
                  >
                    {this.state.errorInfo.componentStack}
                  </pre>
                </>
              )}
            </div>

            {/* In-app terminal */}
            {this.renderTerminal()}
          </details>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => window.location.reload()} style={{ ...btnStyle, background: '#007bff' }}>
              🔄 Reload Page
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                this.addLog('info', '🔄 Try Again pressed.');
              }}
              style={{ ...btnStyle, background: '#28a745' }}
            >
              🔄 Try Again
            </button>
            <button
              onClick={() => {
                try {
                  console.clear();
                } catch {
                  /* ignore */
                }
                this.addLog('info', '🧹 Console cleared (browser devtools).');
              }}
              style={{ ...btnStyle, background: '#6c757d' }}
            >
              🧹 Clear Browser Console
            </button>
          </div>
        </div>
      );
    }

    // Render children normally when there is no error
    return this.props.children;
  }
}

const btnStyle = {
  padding: '6px 10px',
  backgroundColor: '#2d2d2d',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: 13,
};
