import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let readable = 'Hitilafu isiyotarajiwa imetokea wakati wa kupakia ukurasa.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.error) {
        if (String(parsed.error).toLowerCase().includes('permission')) {
          readable = 'Huna ruhusa ya kufanya kitendo hiki au taarifa imefungwa kwa usalama.';
        } else {
          readable = String(parsed.error);
        }
      }
    } catch {
      if (error.message) {
        readable = error.message;
      }
    }
    return { hasError: true, message: readable };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let isEn = false;
      try {
        isEn = typeof window !== 'undefined' && window.localStorage.getItem('malosha_forums_lang_v2') === 'en';
      } catch {
        isEn = false;
      }
      return (
        <div className="mx-auto my-16 max-w-lg rounded-xl border border-stone-200 bg-white p-8 text-center">
          <h2 className="font-display text-2xl font-semibold text-stone-900">
            {isEn ? 'Sorry, something went wrong' : 'Samahani, kuna tatizo limejitokeza'}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-emerald-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-950"
          >
            {isEn ? 'Reload Page' : 'Pakia Upya'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
