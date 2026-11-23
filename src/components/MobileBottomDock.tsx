import React, { useEffect, useState } from 'react';
import { UserRole } from '../types';
import { STANDARD_TVET_DEPARTMENTS } from '../utils/sampleData';
import { ErpNavItem } from './ErpSidebar';

interface MobileBottomDockProps {
  items: ErpNavItem[];
  activePage: string;
  onSelectPage: (pageId: string) => void;
  userEmail: string;
  userName: string;
  activeRole: UserRole;
  activeDepartment: string;
  isBootstrappedAdmin: boolean;
  isOnline: boolean;
  hasInstallPrompt: boolean;
  onInstallApp: () => void;
  onSwitchDeskView: (role: UserRole, department?: string) => void;
  onLogout: () => void;
}

const PRIMARY_MOBILE_IDS = ['dashboard', 'inventory', 'iga', 'issueLog'];

const MOBILE_SHORT_LABELS: Record<string, string> = {
  dashboard: 'Home',
  inventory: 'Inventory',
  iga: 'IGA Hub',
  issueLog: 'Issues',
};

export const MobileBottomDock: React.FC<MobileBottomDockProps> = ({
  items,
  activePage,
  onSelectPage,
  userEmail,
  userName,
  activeRole,
  activeDepartment,
  isBootstrappedAdmin,
  isOnline,
  hasInstallPrompt,
  onInstallApp,
  onSwitchDeskView,
  onLogout,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moreOpen]);

  const primaryTabs = items.filter((item) => PRIMARY_MOBILE_IDS.includes(item.id)).slice(0, 4);
  const secondaryTabs = items.filter((item) => !PRIMARY_MOBILE_IDS.includes(item.id));
  const isSecondaryActive = secondaryTabs.some((t) => t.id === activePage);
  const isHodDesk = activeRole === 'hod' && Boolean(activeDepartment);

  const tabs = [
    ...primaryTabs.map((t) => ({
      ...t,
      shortLabel: MOBILE_SHORT_LABELS[t.id] || t.label,
      isMore: false,
    })),
    {
      id: '__more__',
      label: 'More',
      shortLabel: 'More',
      icon: 'fa-grip',
      badgeCount: 0,
      isMore: true,
    },
  ];

  const roleSummary =
    activeRole === 'hod'
      ? `HOD · ${activeDepartment || 'Department'}`
      : activeRole === 'officer'
        ? activeDepartment
          ? `Officer · ${activeDepartment}`
          : 'Officer · Central Store'
        : 'Procurement Admin';

  return (
    <>
      {/* Native App-Style Fixed Bottom Tab Bar (< lg) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 shadow-[0_-6px_24px_-6px_rgba(15,23,42,0.08)] pb-[env(safe-area-inset-bottom)]"
      >
        <ul
          className="grid h-16 max-w-xl mx-auto"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const isActive = tab.isMore ? moreOpen || isSecondaryActive : tab.id === activePage && !moreOpen;
            const badgeCount = tab.badgeCount || 0;

            return (
              <li key={tab.id} className="h-full">
                <button
                  type="button"
                  onClick={() => {
                    if (tab.isMore) {
                      setMoreOpen((prev) => !prev);
                    } else {
                      setMoreOpen(false);
                      onSelectPage(tab.id);
                    }
                  }}
                  aria-current={!tab.isMore && isActive ? 'page' : undefined}
                  aria-expanded={tab.isMore ? moreOpen : undefined}
                  className="relative w-full h-full min-h-[44px] flex flex-col items-center justify-center px-1 active:scale-95 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600"
                >
                  {/* Top Active Tab Bar Accent */}
                  <span
                    aria-hidden="true"
                    className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-b-full transition-all duration-200 ${
                      isActive ? 'w-8 bg-sky-600 opacity-100' : 'w-0 bg-transparent opacity-0'
                    }`}
                  />

                  {/* Icon Pill Container */}
                  <div
                    className={`relative w-12 h-7 rounded-full flex items-center justify-center transition-colors duration-200 ${
                      isActive
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <i className={`fas ${tab.icon} text-[15px] leading-none`}></i>

                    {badgeCount > 0 && (
                      <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center tabular-nums leading-none shadow-sm">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}

                    {tab.isMore && isSecondaryActive && !moreOpen && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-2 w-2 h-2 rounded-full bg-sky-600 ring-2 ring-white"
                      />
                    )}
                  </div>

                  {/* Single-Line Tab Label */}
                  <span
                    className={`text-[11px] leading-tight mt-0.5 truncate max-w-full px-1 transition-colors duration-200 ${
                      isActive ? 'font-bold text-sky-700' : 'font-medium text-slate-500'
                    }`}
                  >
                    {tab.isMore ? 'More' : activeRole === 'hod' && tab.id === 'issueLog' ? 'Requests' : tab.shortLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Slide-Up Mobile ERP Action Sheet ("More") */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 bg-surface rounded-t-3xl border-t border-slate-200 shadow-2xl px-5 pt-3 pb-[calc(1.75rem+env(safe-area-inset-bottom))] space-y-5 max-h-[82vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto" aria-hidden="true" />

            {/* Account Summary */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="min-w-0">
                <p className="font-display font-bold text-sm text-slate-900 truncate">
                  {userName || userEmail}
                </p>
                <p className="text-xs text-slate-500 truncate">{roleSummary}</p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${
                  isOnline ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                <i className={`fas ${isOnline ? 'fa-cloud' : 'fa-triangle-exclamation'}`}></i>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Secondary ERP Modules Grid */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">All Store Modules</p>
              <div className="grid grid-cols-2 gap-2.5">
                {secondaryTabs.map((tab) => {
                  const isActive = tab.id === activePage;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        onSelectPage(tab.id);
                        setMoreOpen(false);
                      }}
                      className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl border flex items-center gap-3 text-left text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-sky-600 border-sky-600 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-sky-50'
                      }`}
                    >
                      <i
                        className={`fas ${tab.icon} w-4 text-center ${
                          isActive ? 'text-white' : 'text-sky-600'
                        }`}
                      ></i>
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bootstrapped Admin HOD Desk Switcher */}
            {isBootstrappedAdmin && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    {isHodDesk ? 'HOD Preview Desk' : 'Desk View'}
                  </span>
                  {isHodDesk ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchDeskView('admin');
                        setMoreOpen(false);
                      }}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Exit HOD View
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchDeskView('hod', STANDARD_TVET_DEPARTMENTS[0]);
                        onSelectPage('iga');
                        setMoreOpen(false);
                      }}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Switch to HOD View
                    </button>
                  )}
                </div>
                {isHodDesk && (
                  <select
                    aria-label="Mobile preview HOD department"
                    value={activeDepartment}
                    onChange={(e) => onSwitchDeskView('hod', e.target.value)}
                    className="w-full rounded-xl border-slate-300 text-sm py-2 px-3"
                  >
                    {STANDARD_TVET_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Utility Actions */}
            <div className="flex flex-col gap-2.5 pt-1">
              {hasInstallPrompt && (
                <button
                  type="button"
                  onClick={() => {
                    onInstallApp();
                    setMoreOpen(false);
                  }}
                  className="w-full min-h-[46px] rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <i className="fas fa-download"></i>
                  Install Eldama Ravine TVC SMS
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onLogout();
                }}
                className="w-full min-h-[46px] rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold text-sm flex items-center justify-center gap-2"
              >
                <i className="fas fa-sign-out-alt"></i>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
