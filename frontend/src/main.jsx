import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { validateConfig } from './config/index.js';

// Validate configuration before rendering the app
try {
  validateConfig();
} catch (error) {
  console.error('Failed to start application due to configuration errors:', error);
  // Render error message in development
  if (import.meta.env.DEV) {
    document.body.innerHTML = `
      <div style="padding: 2rem; font-family: monospace; background: #1e293b; color: #f1f5f9; min-height: 100vh;">
        <h1 style="color: #ef4444; margin-bottom: 1rem;">⚠️ Configuration Error</h1>
        <p style="margin-bottom: 1rem;">The application cannot start due to missing or invalid configuration:</p>
        <pre style="background: #0f172a; padding: 1rem; border-radius: 0.5rem; overflow-x: auto;">${error.message}</pre>
        <p style="margin-top: 1rem; color: #94a3b8;">
          Check your .env.local file and ensure all required VITE_ environment variables are set.
          See frontend/.env.example for reference.
        </p>
      </div>
    `;
    throw error; // Prevent app from rendering
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
