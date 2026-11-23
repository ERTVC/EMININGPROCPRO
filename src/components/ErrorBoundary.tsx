import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let parsedSummary = this.state.message;
    try {
      const parsed = JSON.parse(this.state.message);
      if (parsed && parsed.error) {
        parsedSummary = `${parsed.error}${parsed.path ? ` (${parsed.operationType} on ${parsed.path})` : ''}`;
      }
    } catch {
      // plain string error
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="max-w-lg w-full bg-white rounded-xl shadow-lg p-8 space-y-4 border-t-4 border-red-500">
          <div className="flex items-center space-x-3 text-red-600">
            <i className="fas fa-triangle-exclamation text-2xl"></i>
            <h2 className="text-xl font-bold">Database or Session Error</h2>
          </div>
          <p className="text-sm text-gray-600 break-words bg-red-50 p-3 rounded border border-red-100">
            {parsedSummary}
          </p>
          <div className="flex space-x-3 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Reload App
            </button>
            <button
              onClick={async () => {
                await signOut(auth);
                window.location.reload();
              }}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }
}
