import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 gap-3 text-center ${className}`}>
      <Loader2 className="w-6 h-6 text-blue-600 animate-spin-custom" />
      {message && <span className="text-xs text-slate-500 font-medium select-none">{message}</span>}
    </div>
  );
};
