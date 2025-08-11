import React from 'react';
import { API_BASE_URL } from '../../services/api';

const LoadingScreen = () => {
  console.log('🔄 Rendering loading screen...');
  
  return (
    <div className="app-loading">
      <div className="loading-spinner"></div>
      <h2>🤖 Aegis Bot Dashboard</h2>
      <p>Initializing...</p>
      <small>{API_BASE_URL}</small>
    </div>
  );
};

export default LoadingScreen;
