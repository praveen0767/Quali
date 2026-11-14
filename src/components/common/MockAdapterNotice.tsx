import React, { useState, useEffect } from 'react';
import { isMockModeEnabled, setMockMode, API_BASE_URL } from '../../lib/api/client';

export function MockAdapterNotice() {
  const [isMock, setIsMock] = useState(isMockModeEnabled());

  useEffect(() => {
    const handleChanged = (e: CustomEvent) => {
      setIsMock(e.detail);
    };
    window.addEventListener('quali_mock_mode_changed' as unknown as string, handleChanged as EventListener);
    return () => {
      window.removeEventListener('quali_mock_mode_changed' as unknown as string, handleChanged as EventListener);
    };
  }, []);

  const handleToggle = () => {
    const next = !isMock;
    setMockMode(next);
    setIsMock(next);
    window.location.reload();
  };

  if (!isMock) {
    return (
      <div className="bg-[#E8F8F0] border-b border-[#A6E3B8] px-4 py-1.5 text-xs text-[#137333] flex items-center justify-between z-40 select-none">
        <div className="flex items-center gap-2 truncate">
          <span className="w-2 h-2 rounded-full bg-[#137333] shrink-0 animate-pulse" />
          <span className="font-semibold">LIVE BACKEND MODE:</span>
          <span className="font-mono truncate">Connected to {API_BASE_URL}/api/v1</span>
        </div>
        <button
          onClick={handleToggle}
          className="text-[11px] underline font-medium hover:text-[#0C1946] shrink-0 ml-4 cursor-pointer"
        >
          Switch to Development Mock Adapter
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#FEF7E0] border-b border-[#FEE180] px-4 py-1.5 text-xs text-[#B06000] flex items-center justify-between z-40 select-none">
      <div className="flex items-center gap-2 truncate">
        <span className="material-symbols-outlined text-[16px] shrink-0 text-[#B06000]">developer_mode</span>
        <span className="font-semibold uppercase tracking-wider text-[11px]">Development Mock Adapter Active:</span>
        <span className="truncate">Rendering verifiable Elena Rostova (Stanford) dataset. Not live backend results.</span>
      </div>
      <button
        onClick={handleToggle}
        className="text-[11px] font-medium text-[#245FD2] hover:underline shrink-0 ml-4 cursor-pointer"
      >
        Connect Live API ({API_BASE_URL})
      </button>
    </div>
  );
}
