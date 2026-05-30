import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled rendering error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/dashboard';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0b0f19] px-4 font-sans text-center relative overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 blur-[120px] rounded-full"></div>
          
          <div className="glass-panel p-10 rounded-2xl max-w-md w-full shadow-2xl relative z-10 animate-fade-in text-left space-y-6">
            <div className="flex items-center space-x-3 text-red-500">
              <span className="text-3xl">⚠️</span>
              <h2 className="text-xl font-bold text-white">Application Exception</h2>
            </div>
            
            <p className="text-slate-400 text-xs leading-relaxed">
              A runtime rendering error has been caught by the dashboard ingress gates. No state locks or database updates are corrupted.
            </p>
            
            <div className="p-4 bg-black/40 border border-slate-800 rounded-xl overflow-x-auto">
              <code className="text-[10px] text-red-400 font-mono block whitespace-pre-wrap">
                {this.state.error?.message || 'Unknown runtime error'}
              </code>
            </div>

            <button
              onClick={this.handleReset}
              className="w-full bg-red-500/20 hover:bg-red-500/35 border border-red-500/35 text-red-300 py-3 rounded-lg text-xs font-semibold transition"
            >
              Reset & Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
