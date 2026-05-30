import React from 'react';

export interface AvatarProps {
  username?: string;
  imageUrl?: string;
  isOnline?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  username = '',
  imageUrl,
  isOnline = false,
  size = 'md',
  className = ''
}) => {
  // Get initials from username
  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Color generator based on name hash
  const getColorClass = (name: string) => {
    if (!name) return 'bg-slate-200 text-slate-600';
    const colors = [
      'bg-blue-100 text-blue-700',
      'bg-emerald-100 text-emerald-700',
      'bg-indigo-100 text-indigo-700',
      'bg-violet-100 text-violet-700',
      'bg-amber-100 text-amber-700',
      'bg-rose-100 text-rose-700',
      'bg-cyan-100 text-cyan-700'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm font-medium',
    lg: 'w-12 h-12 text-base font-semibold'
  };

  const dotSizes = {
    xs: 'w-1.5 h-1.5 border-[1px]',
    sm: 'w-2 h-2 border',
    md: 'w-2.5 h-2.5 border-[1.5px]',
    lg: 'w-3 h-3 border-[2px]'
  };

  const initials = getInitials(username);
  const colorClass = getColorClass(username);

  return (
    <div className={`relative flex-shrink-0 select-none ${className}`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={username}
          className={`rounded-full object-cover ${sizeClasses[size]}`}
          onError={(e) => {
            // Remove image URL on error to fallback to initials
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className={`rounded-full flex items-center justify-center font-semibold uppercase ${sizeClasses[size]} ${colorClass}`}>
          {initials}
        </div>
      )}
      
      {isOnline && (
        <span
          className={`absolute bottom-0 right-0 rounded-full bg-emerald-500 border-white ${dotSizes[size]}`}
          title="Online"
        />
      )}
    </div>
  );
};
