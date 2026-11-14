import React from 'react';
import { Button } from './Button';

interface ErrorMessageProps {
  message?: string;
  onRetry?: () => void;
  title?: string;
  className?: string;
}

export function ErrorMessage({
  message = 'An unexpected error occurred while communicating with the Quali engine.',
  onRetry,
  title = 'Engine Communication Failure',
  className = '',
}: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={`p-6 rounded-xl bg-[#FCE8E6] border border-[#F8B4B4] text-[#C5221F] space-y-3 ${className}`}
    >
      <div className="flex items-center gap-2 font-bold text-sm">
        <span className="material-symbols-outlined text-[20px]">error</span>
        <span>{title}</span>
      </div>
      <p className="text-xs text-[#C5221F]/90 leading-relaxed">{message}</p>
      {onRetry && (
        <div className="pt-1">
          <Button variant="secondary" size="sm" onClick={onRetry} icon="refresh">
            Retry Engine Query
          </Button>
        </div>
      )}
    </div>
  );
}
