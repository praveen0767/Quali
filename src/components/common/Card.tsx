import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({ children, className = '', onClick, hoverable = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-[#E4E9F2] shadow-[0_1px_3px_rgba(12,25,70,0.04),0_1px_2px_rgba(12,25,70,0.02)] ${
        hoverable ? 'hover:border-[#245FD2]/40 hover:shadow-md cursor-pointer transition-all' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
