import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'teal';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const sizeMap = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-lg gap-2',
    lg: 'px-6 py-2.5 text-base rounded-xl gap-2.5',
  };

  const variantMap = {
    primary: 'bg-[#245FD2] text-white hover:bg-[#1D4FB4] shadow-sm focus:ring-2 focus:ring-[#245FD2]/40',
    secondary: 'bg-white text-[#0C1946] border border-[#E4E9F2] hover:bg-[#F6F8FC] shadow-xs focus:ring-2 focus:ring-[#E4E9F2]',
    ghost: 'bg-transparent text-[#526079] hover:bg-[#F6F8FC] hover:text-[#0C1946]',
    danger: 'bg-[#FCE8E6] text-[#C5221F] border border-[#F8B4B4] hover:bg-[#fbd0cb]',
    teal: 'bg-[#159A98] text-white hover:bg-[#11807e] shadow-sm',
  };

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-all select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizeMap[size]} ${variantMap[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[18px] leading-none">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
