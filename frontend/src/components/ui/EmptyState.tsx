import React from 'react';
import * as Icons from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: keyof typeof Icons;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'Inbox',
  title,
  description,
  actionText,
  onAction,
  className = ''
}) => {
  // Dynamically resolve icon component
  const IconComponent = (Icons[icon] || Icons.Inbox) as React.ComponentType<React.SVGProps<SVGSVGElement>>;

  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-white border border-dashed border-slate-200 rounded-lg shadow-sm max-w-md mx-auto ${className}`}>
      <div className="p-3 bg-slate-50 rounded-full text-slate-400 mb-4 flex items-center justify-center">
        {IconComponent && <IconComponent className="w-6 h-6 stroke-[1.5]" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 max-w-xs mb-5 leading-relaxed">{description}</p>
      {actionText && onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
