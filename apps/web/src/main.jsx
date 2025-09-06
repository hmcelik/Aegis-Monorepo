// src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Minimal test component to isolate initialization issues
function MinimalApp() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🔧 Debug Mode - Minimal App</h1>
      <p>If you can see this, the basic React app is working.</p>
      <p>This is a minimal version to debug the initialization error.</p>
      <div style={{ 
        background: '#1a1a1a', 
        color: '#00ff00', 
        padding: '15px', 
        borderRadius: '5px',
        marginTop: '20px',
        fontFamily: 'monospace'
      }}>
        Status: ✅ React initialized successfully
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <MinimalApp />
);