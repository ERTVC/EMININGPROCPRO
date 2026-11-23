import React from 'react';
import { UserRole } from '../types';
import { sanitizeLogoDataUrl } from '../utils/logo';
import { STANDARD_TVET_DEPARTMENTS } from '../utils/sampleData';

export interface ErpNavItem {
  id: string;
  label: string;
  icon: string;
  section: 'Overview' | 'Store & Operations' | 'Governance';
  badgeCount?: number;
}

interface ErpSidebarProps {
  institutionName: string;
  logo: string;
  items: ErpNavItem[];
  activePage: string;
  activeNavHighlight?: string;
  onSelectPage: (pageId: string) => void;
  onOpenReturnsFilter?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  userEmail: string;
  userName: string;
  activeRole: UserRole;
  activeDepartment: string;
  isBootstrappedAdmin: boolean;
  onSwitchDeskView: (role: UserRole, department?: string) => void;
  onLogout: () => void;
}

export const ErpSidebar: React.FC<ErpSidebarProps> = ({
  institutionName,
  logo,
  items,
  activePage,
  activeNavHighlight,
  onSelectPage,
  onOpenReturnsFilter,
  collapsed,
  onToggleCollapse,
  userEmail,
  userName,
  activeRole,
  activeDepartment,
  isBootstrappedAdmin,
  onSwitchDeskView,
  onLogout,
}) => {
  const isHodDesk = activeRole === 'hod' && Boolean(activeDepartment);
  const currentHighlight = activeNavHighlight || activePage;

  const roleSummary =
    activeRole === 'hod'
      ? `HOD · ${activeDepartment || 'Department'}`
      : activeRole === 'officer'
        ? activeDepartment
          ? `Officer · ${activeDepartment}`
          : 'Store Officer'
        : 'Procurement Admin';

  const displayUser = userName || userEmail || 'Procurement Admin';
  const initials = displayUser
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'PA';

  // Insert Returns shortcut after Inventory for store staff
  const expandedRows = React.useMemo(() => {
    const out: Array<{
      key: string;
      label: string;
      icon: string;
      badgeCount?: number;
      onClick: () => void;
    }> = [];

    items.forEach((item) => {
      out.push({
        key: item.id,
        label: item.label,
        icon: item.icon,
        badgeCount: item.badgeCount,
        onClick: () => onSelectPage(item.id),
      });

      if (item.id === 'inventory' && !isHodDesk && onOpenReturnsFilter) {
        out.push({
          key: 'returns',
          label: 'Returns',
          icon: 'fa-rotate-left',
          onClick: onOpenReturnsFilter,
        });
      }
    });

    return out;
  }, [items, isHodDesk, onSelectPage, onOpenReturnsFilter]);

  return (
    <aside
      aria-label="Primary store navigation"
      className={`hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen shrink-0 bg-gradient-to-b from-[#082246] via-[#061b37] to-[#041226] text-slate-100 border-r border-slate-800/80 transition-all duration-200 select-none ${
        collapsed ? 'w-[80px]' : 'w-[252px]'
      }`}
    >
      {/* Top Brand Lockup */}
      <div
        className={`h-16 px-4 border-b border-white/10 flex items-center ${
          collapsed ? 'justify-center' : 'justify-between gap-2'
        } shrink-0`}
      >
        {!collapsed && (
          <button
            type="button"
            onClick={() => onSelectPage('dashboard')}
            title={institutionName}
            className="flex items-center gap-3 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-xl"
          >
            <img
              src={sanitizeLogoDataUrl(logo)}
              alt={institutionName}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-contain bg-white p-0.5 shrink-0 ring-2 ring-white/20"
            />
            <div className="min-w-0">
              <p className="font-display font-extrabold text-[13px] tracking-tight text-white leading-tight">
                Eldama Ravine TVC SMS
              </p>
              <p className="text-[11px] text-slate-300/80 truncate">Store Management System</p>
            </div>
          </button>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={() => onSelectPage('dashboard')}
            title="Eldama Ravine TVC SMS"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-full"
          >
            <img
              src={sanitizeLogoDataUrl(logo)}
              alt={institutionName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-contain bg-white p-0.5 ring-2 ring-white/20"
            />
          </button>
        )}

        {!collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 transition-colors"
          >
            <i className="fas fa-chevron-left text-[11px]"></i>
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1 no-scrollbar">
        {expandedRows.map((row) => {
          const isActive = row.key === currentHighlight;
          const badgeCount = row.badgeCount || 0;
          return (
            <button
              key={row.key}
              type="button"
              onClick={row.onClick}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? row.label : undefined}
              className={`w-full h-10 px-3 rounded-lg flex items-center ${
                collapsed ? 'justify-center' : 'justify-between gap-2'
              } text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                isActive
                  ? 'bg-[#0f4c81] text-white font-semibold shadow-xs'
                  : 'text-slate-300 font-medium hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <i
                  className={`fas ${row.icon} w-4 text-center text-sm shrink-0 ${
                    isActive ? 'text-sky-200' : 'text-slate-400'
                  }`}
                ></i>
                {!collapsed && <span className="truncate">{row.label}</span>}
              </span>

              {!collapsed && badgeCount > 0 && (
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 tabular-nums shrink-0 leading-none">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom User Card & Desk / Sign Out Controls */}
      <div className="p-3 border-t border-white/10 space-y-2.5 shrink-0">
        {!collapsed ? (
          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3 space-y-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-900 font-display font-bold text-xs flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{displayUser}</p>
                <p className="text-[11px] text-slate-300/80 truncate">{roleSummary}</p>
              </div>
            </div>

            {isBootstrappedAdmin && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-300/80 font-medium">
                    {isHodDesk ? 'HOD Preview' : 'Desk Switch'}
                  </span>
                  {isHodDesk ? (
                    <button
                      type="button"
                      onClick={() => onSwitchDeskView('admin')}
                      className="text-[11px] font-semibold text-sky-300 hover:text-sky-200 flex items-center gap-1"
                    >
                      <span>Exit HOD</span>
                      <i className="fas fa-arrow-right-arrow-left text-[10px]"></i>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchDeskView('hod', STANDARD_TVET_DEPARTMENTS[0]);
                        onSelectPage('iga');
                      }}
                      className="text-[11px] font-semibold text-sky-300 hover:text-sky-200 flex items-center gap-1"
                    >
                      <span>Switch to HOD</span>
                      <i className="fas fa-arrow-right-arrow-left text-[10px]"></i>
                    </button>
                  )}
                </div>

                {isHodDesk && (
                  <select
                    aria-label="Preview HOD department"
                    value={activeDepartment}
                    onChange={(e) => onSwitchDeskView('hod', e.target.value)}
                    className="w-full rounded-lg bg-[#05152b] border border-white/15 text-xs font-medium text-slate-100 py-1.5 px-2 focus:border-sky-400 focus:ring-sky-400"
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
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="w-full min-h-[38px] rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center"
          >
            <i className="fas fa-chevron-right text-xs"></i>
          </button>
        )}

        <button
          type="button"
          onClick={onLogout}
          title={collapsed ? `Log Out (${displayUser})` : undefined}
          aria-label="Log Out"
          className={`w-full min-h-[40px] rounded-xl border border-white/10 bg-white/[0.04] hover:bg-red-500/15 hover:border-red-400/30 text-slate-200 hover:text-red-200 text-xs font-semibold flex items-center ${
            collapsed ? 'justify-center' : 'px-3 gap-2.5'
          } transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`}
        >
          <i className="fas fa-right-from-bracket text-sm"></i>
          {!collapsed && <span>Log Out</span>}
        </button>
      </div>
    </aside>
  );
};
