import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon = 'search_off',
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`p-10 rounded-2xl bg-white border border-[#E4E9F2] text-center flex flex-col items-center justify-center space-y-3 ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-[#F6F8FC] border border-[#E4E9F2] flex items-center justify-center text-[#526079]">
        <span className="material-symbols-outlined text-[26px]">{icon}</span>
      </div>
      <h3 className="text-base font-bold text-[#0C1946]">{title}</h3>
      <p className="text-xs text-[#526079] max-w-md leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <div className="pt-2">
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
