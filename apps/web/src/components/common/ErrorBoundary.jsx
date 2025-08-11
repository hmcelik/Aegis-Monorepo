import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log detailed error information to console (this will stay visible)
    console.error('🚨 React Error Boundary caught an error:');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Error Stack:', error.stack);
    
    // Store error info for display
    this.setState({ errorInfo });
    
    // Keep console open by preventing any cleanup
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        console.log('🔄 Page reloading - Error details preserved above');
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
          <h2>❌ Something went wrong</h2>
          <p>The app encountered an unexpected error.</p>
          
          <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <strong>📝 Debug Info:</strong>
            <p style={{ fontSize: '12px', color: '#666' }}>
              Check the browser console (F12) for detailed error logs that remain visible.
            </p>
          </div>

          <details style={{ marginBottom: '20px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>🔍 Error Details</summary>
            <div style={{ backgroundColor: '#fff3cd', padding: '10px', marginTop: '10px', borderRadius: '4px', fontSize: '12px' }}>
              <h4>Error Message:</h4>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error?.toString()}</pre>
              
              <h4>Error Stack:</h4>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflow: 'auto' }}>
                {this.state.error?.stack}
              </pre>
              
              {this.state.errorInfo && (
                <>
                  <h4>Component Stack:</h4>
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflow: 'auto' }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </>
              )}
            </div>
          </details>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button 
              onClick={() => window.location.reload()} 
              className="retry-btn"
              style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              🔄 Reload Page
            </button>
            <button 
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
              }}
              style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              🔄 Try Again
            </button>
            <button 
              onClick={() => {
                console.clear();
                console.log('🧹 Console cleared - Error logs were:', this.state.error);
              }}
              style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              🧹 Clear Console
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
