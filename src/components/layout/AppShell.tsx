import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { StatusBar } from './StatusBar';
import { MockAdapterNotice } from '../common/MockAdapterNotice';

export function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F6F8FC] text-[#0C1946]">
      {/* Explicit Mock Adapter Notice */}
      <MockAdapterNotice />

      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block h-full shrink-0">
          <Sidebar />
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 bg-[#0C1946]/50 lg:hidden flex"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div
              className="w-64 h-full bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar onCloseMobile={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        {/* Main Viewport Column */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <Topbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[#F6F8FC]">
            <Outlet />
          </main>

          <StatusBar />
        </div>
      </div>
    </div>
  );
}
