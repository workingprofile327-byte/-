import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'অপ্রত্যাশিত ত্রুটি ঘটেছে।',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-6 text-center space-y-4 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">
              সিস্টেমে একটি ত্রুটি ধরা পড়েছে
            </h1>
            <p className="text-xs text-slate-600 break-words bg-stone-50 p-3 rounded-xl border border-stone-200 font-mono">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              পুনরায় লোড করুন
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
