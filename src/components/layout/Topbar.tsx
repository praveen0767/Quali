import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { resetToDemoProfile } from '../../lib/api/profile';

interface TopbarProps {
  onOpenMobileMenu?: () => void;
}

export function Topbar({ onOpenMobileMenu }: TopbarProps) {
  const navigate = useNavigate();
  const [loadSuccess, setLoadSuccess] = useState(false);

  const handlePreloadDemo = async () => {
    await resetToDemoProfile();
    setLoadSuccess(true);
    setTimeout(() => {
      setLoadSuccess(false);
      window.location.reload();
    }, 800);
  };

  return (
    <header className="h-16 bg-white border-b border-[#E4E9F2] px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
      {/* Left: Mobile Trigger & Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 text-[#526079] hover:text-[#0C1946] hover:bg-[#F6F8FC] rounded-lg cursor-pointer"
            aria-label="Open sidebar navigation"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>
        )}

        <div className="hidden sm:flex items-center gap-2 text-xs text-[#526079]">
          <span className="font-semibold text-[#0C1946]">Quali Intelligence</span>
          <span>/</span>
          <span>Deterministic Audit Workspace</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Load Demo Action (Matching Stitch specification) */}
        <button
          onClick={handlePreloadDemo}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer ${
            loadSuccess
              ? 'bg-[#E8F8F0] text-[#137333] border border-[#A6E3B8]'
              : 'bg-[#F6F8FC] hover:bg-[#e7eeff] text-[#245FD2] border border-[#E4E9F2]'
          }`}
          title="Reset or prefill standard Stanford Elena Rostova test dataset"
        >
          <span className="material-symbols-outlined text-[16px]">
            {loadSuccess ? 'check_circle' : 'contact_page'}
          </span>
          <span className="hidden md:inline">
            {loadSuccess ? 'Elena Rostova Loaded' : 'Load Demo Student (Elena Rostova)'}
          </span>
          <span className="md:hidden">Demo</span>
        </button>

        {/* Voice Assistant Shortcut */}
        <button
          onClick={() => navigate('/assistant')}
          className="p-2 text-[#526079] hover:text-[#245FD2] hover:bg-[#F6F8FC] rounded-lg transition-colors cursor-pointer"
          title="Open Voice Assistant"
          aria-label="Open Voice Assistant"
        >
          <span className="material-symbols-outlined text-[20px]">graphic_eq</span>
        </button>

        {/* Profile Pill */}
        <NavLink
          to="/profile"
          className="flex items-center gap-2.5 pl-2 py-1 pr-3 rounded-full hover:bg-[#F6F8FC] border border-[#E4E9F2] transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-[#E7EEFF] overflow-hidden shrink-0 border border-[#245FD2]/30">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuD1lKay3QaIbWFi1xdFiahm-4fuZ0N2_1lMZkZXk3y3vFkOQAueq2BW88GsC9j2vdHOIHQN1epUGiIjDpX4FuWygJTeiI39OHhm6g88CJfTcA8coSiqETCVsxNrATfmJc7SeQWHuOF8oXm1iUecYXFTNKAWN9ksC9oWCgpntsXvttoBoxwJf3dMdEu9G09oNMZseyFJnCluOM0nGfOxiHojGPWlR9SlKYw5DdTCo-I"
              alt="Elena Rostova Avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-[11px] font-bold text-[#0C1946] leading-none">Elena Rostova</span>
            <span className="text-[10px] text-[#526079] leading-none mt-0.5">Stanford M.S.</span>
          </div>
        </NavLink>
      </div>
    </header>
  );
}
