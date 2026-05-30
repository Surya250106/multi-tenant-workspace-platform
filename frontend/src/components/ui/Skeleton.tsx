import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect',
  count = 1
}) => {
  const getVariantClass = () => {
    switch (variant) {
      case 'circle':
        return 'rounded-full';
      case 'text':
        return 'rounded-md h-3.5 w-3/4';
      case 'rect':
      default:
        return 'rounded-md h-12 w-full';
    }
  };

  const skeletons = Array.from({ length: count });

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {skeletons.map((_, idx) => (
        <div
          key={idx}
          className={`bg-slate-100 animate-pulse ${getVariantClass()} ${className}`}
        />
      ))}
    </div>
  );
};
