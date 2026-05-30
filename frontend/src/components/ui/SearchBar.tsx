import React, { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

export interface SearchBarProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
  containerClassName?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  containerClassName = '',
  placeholder = 'Search tasks, projects... (⌘K)',
  className = '',
  ...props
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={`relative flex items-center w-full max-w-sm ${containerClassName}`}>
      <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
      
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        onChange={(e) => onSearch?.(e.target.value)}
        className={`w-full text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 border border-slate-200 focus:border-blue-500 rounded-md py-1.5 pl-9 pr-12 transition-all ${className}`}
        {...props}
      />
      
      <div className="absolute right-2 px-1.5 py-0.5 bg-white border border-slate-200 text-slate-400 text-[10px] font-medium rounded shadow-sm select-none pointer-events-none flex items-center gap-0.5">
        <span className="text-[9px]">⌘</span>K
      </div>
    </div>
  );
};
