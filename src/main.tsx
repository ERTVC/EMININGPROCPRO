import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider } from './context/AppContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
