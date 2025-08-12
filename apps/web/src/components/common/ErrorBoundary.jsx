import React from 'react';

const STORAGE_KEY = 'aegis-debug-logs';
const MAX_LOGS = 500;

function stringifyArgs(args) {
  try {
    return args.map(a => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
      if (typeof a === 'object') return JSON.stringify(a, null, 2);
      return String(a);
    }).join(' ');
  } catch {
    return args.map(String).join(' ');
  }
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    const persisted = (() => {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })();

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      logs: persisted,        // { ts, level, text }
      showTerminal: false,
      autoScroll: true,
    };

    this.terminalRef = React.createRef();
    this.detailsRef = React.createRef();
    this.originalConsole = {};
    this.boundOnError = null;
    this.boundOnRejection = null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidMount() {
    // Monkeypatch console
    ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
      this.originalConsole[level] = console[level];
      console[level] = (...args) => {
        try {
          this.addLog(level, stringifyArgs(args));
        } catch {}
        this.originalConsole[level](...args);
      };
    });

    // Global errors
    this.boundOnError = (event) => {
      const msg = event?.message || 'Unknown script error';
      const stack = event?.error?.stack || '';
      this.addLog('error', `[window.onerror] ${msg}\n${stack}`);
    };

    this.boundOnRejection = (event) => {
      const reason = event?.reason instanceof Error
        ? `${event.reason.name}: ${event.reason.message}\n${event.reason.stack || ''}`
        : JSON.stringify(event?.reason, null, 2);
      this.addLog('error', `[unhandledrejection]\n${reason}`);
    };

    window.addEventListener('error', this.boundOnError);
    window.addEventListener('unhandledrejection', this.boundOnRejection);

    // Keep note on reload
    window.addEventListener('beforeunload', () => {
      this.addLog('info', '🔄 Page is reloading - check persisted logs after reload.');
    });
  }

  componentWillUnmount() {
    // Restore console
    Object.entries(this.originalConsole).forEach(([level, fn]) => {
      if (fn) console[level] = fn;
    });

    if (this.boundOnError) window.removeEventListener('error', this.boundOnError);
    if (this.boundOnRejection) window.removeEventListener('unhandledrejection', this.boundOnRejection);
  }

  componentDidCatch(error, errorInfo) {
    // Log detailed error to terminal
    this.addLog('error', `🚨 React ErrorBoundary caught:\n${error?.stack || String(error)}`);
    if (errorInfo?.componentStack) {
      this.addLog('error', `Component stack:\n${errorInfo.componentStack}`);
    }
    this.setState({ errorInfo });
  }

  addLog(level, text) {
    this.setState(prev => {
      const next = [...prev.logs, { ts: new Date().toISOString(), level, text }];
      const trimmed = next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;

      // persist
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {}

      return { logs: trimmed };
    }, () => {
      // auto-scroll
      if (this.state.autoScroll && this.terminalRef.current) {
        const el = this.terminalRef.current;
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  handleToggleDetails = (e) => {
    // When "Debug Info" <details> is opened, show terminal
    this.setState({ showTerminal: e.target.open });
  };

  copyLogs = async () => {
    const text = this.state.logs
      .map(l => `[${l.ts}] ${l.level.toUpperCase()}  ${l.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.addLog('info', '📋 Logs copied to clipboard.');
    } catch {
      this.addLog('warn', '⚠️ Could not copy to clipboard.');
    }
  };

  clearLogs = () => {
    this.setState({ logs: [] }, () => {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      try { console.clear(); } catch {}
      this.addLog('info', '🧹 In-app terminal cleared.');
    });
  };

  renderTerminal() {
    if (!this.state.showTerminal) return null;

    return (
      <div style={{ marginTop: 12 }}>
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 6,
          flexWrap: 'wrap'
        }}>
          <strong>🖥️ Debug Console</strong>
          <button
            onClick={() => this.setState(s => ({ autoScroll: !s.autoScroll }))}
            style={btnStyle}
            title="Toggle auto-scroll"
          >
            {this.state.autoScroll ? '⏩ Auto-Scroll: On' : '⏸️ Auto-Scroll: Off'}
          </button>
          <button onClick={this.copyLogs} style={btnStyle}>📋 Copy</button>
          <button onClick={this.clearLogs} style={{ ...btnStyle, background: '#6c757d' }}>🧹 Clear</button>
        </div>

        <div
          ref={this.terminalRef}
          style={{
            background: '#111',
            color: '#e6e6e6',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
                l.level === 'error' ? '#ff6b6b' :
                l.level === 'warn'  ? '#ffd166' :
                l.level === 'info'  ? '#7fd1ff' :
                l.level === 'debug' ? '#a0a0a0' : '#ddd';
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

          <details
            ref={this.detailsRef}
            onToggle={this.handleToggleDetails}
            style={{ margin: '16px 0' }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>🔍 Debug Info</summary>

            {/* Error specifics */}
            <div style={{ backgroundColor: '#fff3cd', padding: 10, marginTop: 10, borderRadius: 6, fontSize: 12 }}>
              <h4 style={{ margin: '2px 0 6px' }}>Error Message:</h4>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {this.state.error?.toString()}
              </pre>

              <h4 style={{ margin: '12px 0 6px' }}>Error Stack:</h4>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
                {this.state.error?.stack}
              </pre>

              {this.state.errorInfo?.componentStack && (
                <>
                  <h4 style={{ margin: '12px 0 6px' }}>Component Stack:</h4>
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </>
              )}
            </div>

            {/* In-app terminal */}
            {this.renderTerminal()}
          </details>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ ...btnStyle, background: '#007bff' }}
            >
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
                try { console.clear(); } catch {}
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
