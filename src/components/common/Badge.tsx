import React from 'react';

export type BadgeVariant =
  | 'MEETS'
  | 'INSUFFICIENT'
  | 'FAILED'
  | 'VERIFIED'
  | 'PASS'
  | 'FAIL'
  | 'REVIEW'
  | 'FLAGGED'
  | 'MISMATCH'
  | 'MATCH'
  | 'COBALT'
  | 'NAVY'
  | 'VIOLET'
  | 'MUTED';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: string;
  className?: string;
}

export function Badge({
  children,
  variant = 'MUTED',
  size = 'md',
  icon,
  className = '',
}: BadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]';

  const variantMap: Record<BadgeVariant, string> = {
    MEETS: 'bg-[#E8F8F0] text-[#137333] border border-[#A6E3B8]',
    PASS: 'bg-[#E8F8F0] text-[#137333] border border-[#A6E3B8]',
    MATCH: 'bg-[#E8F8F0] text-[#137333] border border-[#A6E3B8]',
    VERIFIED: 'bg-[#E8F6F6] text-[#159A98] border border-[#159A98]',
    INSUFFICIENT: 'bg-[#FEF7E0] text-[#B06000] border border-[#FEE180]',
    REVIEW: 'bg-[#FEF7E0] text-[#B06000] border border-[#FEE180]',
    FLAGGED: 'bg-[#FEF7E0] text-[#B06000] border border-[#FEE180]',
    FAILED: 'bg-[#FCE8E6] text-[#C5221F] border border-[#F8B4B4]',
    FAIL: 'bg-[#FCE8E6] text-[#C5221F] border border-[#F8B4B4]',
    MISMATCH: 'bg-[#FCE8E6] text-[#C5221F] border border-[#F8B4B4]',
    COBALT: 'bg-[#245FD2]/10 text-[#245FD2] border border-[#245FD2]/30',
    NAVY: 'bg-[#0C1946] text-[#ffffff] border border-[#0C1946]',
    VIOLET: 'bg-[#F3EDFC] text-[#7545D6] border border-[#7545D6]/30',
    MUTED: 'bg-[#f1f5f9] text-[#526079] border border-[#E4E9F2]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${sizeClasses} ${variantMap[variant] || variantMap.MUTED} ${className}`}
    >
      {icon && <span className="material-symbols-outlined text-[14px] leading-none">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
