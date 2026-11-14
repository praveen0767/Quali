import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getOpportunities } from '../../lib/api/opportunities';
import { getTasks } from '../../lib/api/planner';
import { getIngestedDocuments } from '../../lib/api/documents';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export function Sidebar({ onCloseMobile }: SidebarProps) {
  const location = useLocation();
  const [oppCount, setOppCount] = useState<number | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [docCount, setDocCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getOpportunities(), getTasks(), getIngestedDocuments()]).then(
      ([opps, tasks, docs]) => {
        if (active) {
          if (opps.status === 'fulfilled') setOppCount(opps.value.length);
          if (tasks.status === 'fulfilled') {
            const pending = tasks.value.filter((t) => t.status !== 'COMPLETED').length;
            setTaskCount(pending);
          }
          if (docs.status === 'fulfilled') setDocCount(docs.value.length);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [location.pathname]);

  const navItems = [
    { label: 'Dashboard / My Day', path: '/', icon: 'space_dashboard' },
    {
      label: 'Opportunities',
      path: '/opportunities',
      icon: 'explore',
      badge: oppCount !== null ? oppCount : null,
      badgeColor: 'bg-[#245FD2]/10 text-[#245FD2]',
    },
    {
      label: 'Document Ingestion',
      path: '/documents',
      icon: 'upload_file',
      badge: docCount !== null ? docCount : null,
      badgeColor: 'bg-[#159A98]/10 text-[#159A98]',
    },
    { label: 'Criteria Inspector', path: '/criteria', icon: 'rule' },
    { label: 'Eligibility Report', path: '/report', icon: 'verified' },
    { label: 'Recommendations', path: '/recommendations', icon: 'recommend' },
    {
      label: 'Application Planner',
      path: '/planner',
      icon: 'task_alt',
      badge: taskCount !== null && taskCount > 0 ? taskCount : null,
      badgeColor: 'bg-[#FEF7E0] text-[#B06000] border border-[#FEE180]',
    },
    { label: 'Voice Assistant', path: '/assistant', icon: 'graphic_eq' },
    { label: 'Profile & Privacy', path: '/profile', icon: 'manage_accounts' },
  ];

  return (
    <aside className="h-full w-64 bg-white border-r border-[#E4E9F2] flex flex-col justify-between select-none">
      <div className="flex flex-col h-full min-h-0">
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#E4E9F2] bg-[#F6F8FC]/50 shrink-0">
          <NavLink to="/" className="flex items-center gap-2.5 min-w-0" onClick={onCloseMobile}>
            <div className="w-8 h-8 rounded-lg bg-[#0C1946] flex items-center justify-center text-white shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[20px] text-[#87f4f1]">verified</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[17px] font-bold tracking-tight text-[#0C1946]">Quali</span>
                <span className="bg-[#245FD2]/10 text-[#245FD2] px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider">
                  Audit
                </span>
              </div>
              <span className="text-[10px] text-[#526079] truncate tracking-wide">
                Eligibility, with proof.
              </span>
            </div>
          </NavLink>

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-md text-[#526079] hover:text-[#0C1946] hover:bg-white"
              aria-label="Close navigation"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Institution Badge */}
        <div className="p-3 border-b border-[#E4E9F2] bg-[#F6F8FC]/30 shrink-0">
          <div className="p-2.5 rounded-lg bg-white border border-[#E4E9F2] flex items-center gap-2.5 shadow-2xs">
            <span className="material-symbols-outlined text-[18px] text-[#245FD2] shrink-0">
              account_balance
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-[#0C1946] truncate">Stanford University</p>
              <p className="text-[10px] text-[#526079] truncate">R1 Research Cohort • F-1 OPT</p>
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#245FD2] text-white shadow-xs'
                    : 'text-[#526079] hover:bg-[#F6F8FC] hover:text-[#0C1946]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isActive ? 'text-white' : 'text-[#526079]'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge !== null && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : item.badgeColor
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Privacy Enclave Widget */}
        <div className="p-3 border-t border-[#E4E9F2] bg-[#F6F8FC]/60 shrink-0">
          <div className="p-2.5 rounded-lg bg-white border border-[#E4E9F2] space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-[#526079] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#159A98] animate-pulse" />
                Zero-Leak Enclave
              </span>
              <span className="font-semibold text-[#159A98]">ACTIVE</span>
            </div>
            <p className="text-[10px] text-[#526079] leading-snug">
              Client memory encrypted. Zero AI model training on student transcripts.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
