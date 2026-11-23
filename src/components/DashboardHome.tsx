import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppContext } from '../context/AppContext';
import { isItemConsumable, roundStockQuantity } from '../types';
import { STANDARD_TVET_DEPARTMENTS } from '../utils/sampleData';

interface DashboardHomeProps {
  onNavigate: (page: string) => void;
  onOpenInventoryFilter: (filter: 'all' | 'low' | 'out', searchQuery?: string) => void;
  onTriggerStockIn: () => void;
  onTriggerStockOut: () => void;
  onOpenReturnsFilter: () => void;
}

const DONUT_COLORS = [
  '#1669e5',
  '#0f766e',
  '#0891b2',
  '#ea580c',
  '#4338ca',
  '#e11d48',
  '#db2777',
  '#059669',
  '#94a3b8',
];

function getTimeGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDateLine(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTimeLine(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatTxTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  const datePart = parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timePart = parsed.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

function truncateLabel(text: string, maxLen = 14): string {
  const trimmed = (text || '').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  onNavigate,
  onOpenInventoryFilter,
  onTriggerStockIn,
  onTriggerStockOut,
  onOpenReturnsFilter,
}) => {
  const {
    inventory,
    assets,
    issues,
    stockMovements,
    issueLog,
    igaUnits,
    igaLogistics,
    issueRequests,
    departmentBudgets,
    settings,
    user,
    activeRole,
    activeDepartment,
    hasLocalBackupData,
    demoRecordCount,
    seedSampleData,
    refreshDemonstrationData,
    migrateLocalStorageData,
  } = useAppContext();

  const [seeding, setSeeding] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [barFilter, setBarFilter] = useState<
    'all' | 'consumable' | 'returnable' | 'asset' | 'low'
  >('all');
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'Consumable' | 'Asset' | 'iga'
  >('all');

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const isHodMode = activeRole === 'hod' && Boolean(activeDepartment);
  const isAdminUser = activeRole === 'admin' || Boolean(user?.isBootstrappedAdmin);

  const financialYears = useMemo(() => {
    const years = new Set<string>(['2026/2027', '2025/2026']);
    departmentBudgets.forEach((b) => {
      if (b.financialYear?.trim()) years.add(b.financialYear.trim());
    });
    return [...Array.from(years).sort((a, b) => b.localeCompare(a)), 'All Years'];
  }, [departmentBudgets]);

  const [selectedFy, setSelectedFy] = useState<string>('2026/2027');

  useEffect(() => {
    if (!financialYears.includes(selectedFy) && financialYears.length > 0) {
      setSelectedFy(financialYears[0]);
    }
  }, [financialYears, selectedFy]);

  const scopedInventory = useMemo(() => {
    if (!isHodMode) return inventory;
    const deptLower = activeDepartment.trim().toLowerCase();
    return inventory.filter((i) => (i.department || '').trim().toLowerCase() === deptLower);
  }, [inventory, isHodMode, activeDepartment]);

  const pendingIssueRequestsCount = useMemo(() => {
    if (isHodMode) {
      return issueRequests.filter(
        (r) =>
          r.status === 'Pending' &&
          r.department.trim().toLowerCase() === activeDepartment.trim().toLowerCase(),
      ).length;
    }
    return issueRequests.filter((r) => r.status === 'Pending').length;
  }, [issueRequests, isHodMode, activeDepartment]);

  const pendingIgaApprovalsCount = useMemo(
    () => igaUnits.filter((u) => (u.approvalStatus || 'Approved') === 'Pending').length,
    [igaUnits],
  );

  const submittedBudgetsCount = useMemo(
    () => departmentBudgets.filter((b) => b.status === 'Submitted').length,
    [departmentBudgets],
  );

  const totalItems = useMemo(() => {
    const allowedIds = new Set(scopedInventory.map((i) => i.id));
    const consumableCount = scopedInventory
      .filter((item) => item.type === 'Consumable')
      .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const assetCount = assets.filter(
      (asset) => asset.status === 'In Stock' && allowedIds.has(asset.inventoryId),
    ).length;
    return roundStockQuantity(consumableCount + assetCount);
  }, [scopedInventory, assets]);

  const totalPendingReturns = useMemo(() => {
    const activeSlipReturns = issues.filter(
      (slip) =>
        slip.status !== 'closed' &&
        slip.lines.some(
          (line) =>
            line.returnable && roundStockQuantity(line.qtyIssued - line.qtyReturned) > 0,
        ),
    ).length;
    const legacyReturns = issueLog.filter((log) => !log.returned).length;
    return activeSlipReturns + legacyReturns;
  }, [issues, issueLog]);

  const todaysIssuesCount = useMemo(() => {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const tomorrowStart = todayStart + 86400000;
    const activeToday = issues.filter((slip) => {
      const t = new Date(slip.dateIssued).getTime();
      return Number.isFinite(t) && t >= todayStart && t < tomorrowStart;
    }).length;
    const legacyToday = issueLog.filter((log) => {
      const t = new Date(log.dateIssued).getTime();
      return Number.isFinite(t) && t >= todayStart && t < tomorrowStart;
    }).length;
    return activeToday + legacyToday;
  }, [issues, issueLog, now]);

  const lowStockList = useMemo(
    () =>
      scopedInventory
        .filter((item) => item.type === 'Consumable' && item.quantity > 0 && item.quantity < 10)
        .sort((a, b) => a.quantity - b.quantity),
    [scopedInventory],
  );

  const outOfStockItemList = useMemo(() => {
    const consumableOut = scopedInventory.filter(
      (item) => item.type === 'Consumable' && item.quantity <= 0,
    );
    const assetTemplates = scopedInventory.filter((item) => item.type === 'Asset');
    const inStockAssetInventoryIds = new Set(
      assets.filter((a) => a.status === 'In Stock').map((a) => a.inventoryId),
    );
    const assetOut = assetTemplates.filter((item) => {
      const hasAnyAssets = assets.some((a) => a.inventoryId === item.id);
      return hasAnyAssets && !inStockAssetInventoryIds.has(item.id);
    });
    return [...consumableOut, ...assetOut].sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedInventory, assets]);

  const alertItems = useMemo(() => {
    const critical = scopedInventory
      .filter((item) => item.type === 'Consumable' && item.quantity < 10)
      .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
    return critical.slice(0, 6);
  }, [scopedInventory]);

  const fyBudgetMetrics = useMemo(() => {
    const scoped = departmentBudgets.filter((b) => {
      const matchesDept =
        !isHodMode || b.department.trim().toLowerCase() === activeDepartment.trim().toLowerCase();
      const matchesFy = selectedFy === 'All Years' || b.financialYear === selectedFy;
      return matchesDept && matchesFy;
    });
    const totalAmount = scoped.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
    return {
      totalAmount,
      count: scoped.length,
    };
  }, [departmentBudgets, isHodMode, activeDepartment, selectedFy]);

  const stockByItemTop10 = useMemo(() => {
    const rows = scopedInventory
      .map((item) => {
        const stock =
          item.type === 'Asset'
            ? assets.filter((a) => a.inventoryId === item.id && a.status === 'In Stock').length
            : roundStockQuantity(item.quantity);
        const consumableFlag = isItemConsumable(item);
        return {
          id: item.id,
          fullName: item.name,
          name: truncateLabel(item.name, 13),
          stock,
          type: item.type,
          consumableFlag,
          unit: item.unit,
        };
      })
      .filter((row) => {
        if (barFilter === 'consumable') return row.type === 'Consumable' && row.consumableFlag;
        if (barFilter === 'returnable') return row.type === 'Consumable' && !row.consumableFlag;
        if (barFilter === 'asset') return row.type === 'Asset';
        if (barFilter === 'low') return row.stock < 10;
        return row.stock > 0;
      })
      .sort((a, b) => (barFilter === 'low' ? a.stock - b.stock : b.stock - a.stock))
      .slice(0, 10);
    return rows;
  }, [scopedInventory, assets, barFilter]);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    scopedInventory.forEach((item) => {
      if (categoryFilter === 'Consumable' && item.type !== 'Consumable') return;
      if (categoryFilter === 'Asset' && item.type !== 'Asset') return;
      if (categoryFilter === 'iga' && !item.isIGA) return;

      const qty =
        item.type === 'Consumable'
          ? roundStockQuantity(item.quantity)
          : assets.filter((a) => a.inventoryId === item.id && a.status === 'In Stock').length;
      if (qty <= 0) return;
      const cat = (item.category || 'Uncategorized').trim() || 'Uncategorized';
      map[cat] = roundStockQuantity((map[cat] || 0) + qty);
    });

    const sorted = Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const total = roundStockQuantity(sorted.reduce((sum, entry) => sum + entry.value, 0));
    if (sorted.length <= 8) {
      return {
        total,
        slices: sorted.map((entry, idx) => ({
          ...entry,
          color: DONUT_COLORS[idx % DONUT_COLORS.length],
          pct: total > 0 ? Math.round((entry.value / total) * 100) : 0,
        })),
      };
    }
    const top7 = sorted.slice(0, 7);
    const othersVal = roundStockQuantity(sorted.slice(7).reduce((sum, e) => sum + e.value, 0));
    const combined = [...top7, { name: 'Others', value: othersVal }];
    return {
      total,
      slices: combined.map((entry, idx) => ({
        ...entry,
        color: entry.name === 'Others' ? '#94a3b8' : DONUT_COLORS[idx % (DONUT_COLORS.length - 1)],
        pct: total > 0 ? Math.round((entry.value / total) * 100) : 0,
      })),
    };
  }, [scopedInventory, assets, categoryFilter]);

  const recentTransactions = useMemo(() => {
    type TxRow = {
      id: string;
      kind: 'issued' | 'returned' | 'damaged' | 'iga';
      title: string;
      subtitle: string;
      refCode: string;
      timestamp: string;
      sortMs: number;
    };

    const list: TxRow[] = [];
    const invMap = new Map(inventory.map((i) => [i.id, i]));
    const issueMap = new Map(issues.map((s) => [s.id, s]));
    const coveredIssueIds = new Set<string>();

    const resolveCreatedIso = (raw: unknown, fallbackIso?: string): string | null => {
      if (typeof raw === 'string' && raw.trim()) return raw;
      if (raw && typeof raw === 'object') {
        const tsObj = raw as { toDate?: () => Date; seconds?: number };
        if (typeof tsObj.toDate === 'function') {
          const d = tsObj.toDate();
          if (Number.isFinite(d.getTime())) return d.toISOString();
        }
        if (typeof tsObj.seconds === 'number') {
          const d = new Date(tsObj.seconds * 1000);
          if (Number.isFinite(d.getTime())) return d.toISOString();
        }
      }
      return fallbackIso && fallbackIso.trim() ? fallbackIso : null;
    };

    stockMovements.forEach((mov) => {
      coveredIssueIds.add(mov.issueId);
      const slip = issueMap.get(mov.issueId);
      const inv = invMap.get(mov.inventoryId);
      const matchedLine = slip?.lines.find((l) => l.inventoryId === mov.inventoryId);
      const itemName = inv?.name || matchedLine?.name || 'Inventory Item';
      const unit = inv?.unit || matchedLine?.unit || '';
      const recipientLabel = slip?.recipientName || slip?.recipient || 'Recipient';
      const iso = resolveCreatedIso(mov.createdAt, slip?.dateIssued);
      if (!iso) return;
      const sortMs = new Date(iso).getTime();
      if (!Number.isFinite(sortMs)) return;

      const qtyLabel = `${roundStockQuantity(mov.qty)}${unit ? ` ${unit}` : ''}`;
      if (mov.type === 'RETURN') {
        list.push({
          id: `mov-${mov.id}`,
          kind: 'returned',
          title: 'Stock Returned',
          subtitle: `${itemName} · ${qtyLabel} from ${recipientLabel}`,
          refCode: `RET-${mov.issueId.slice(0, 6).toUpperCase()}`,
          timestamp: iso,
          sortMs,
        });
      } else if (mov.type === 'DAMAGED') {
        list.push({
          id: `mov-${mov.id}`,
          kind: 'damaged',
          title: 'Damaged on Return',
          subtitle: `${itemName} · ${qtyLabel} from ${recipientLabel}`,
          refCode: `DMG-${mov.issueId.slice(0, 6).toUpperCase()}`,
          timestamp: iso,
          sortMs,
        });
      } else {
        list.push({
          id: `mov-${mov.id}`,
          kind: 'issued',
          title: 'Stock Issued',
          subtitle: `${itemName} · ${qtyLabel} to ${recipientLabel}`,
          refCode: slip?.gatePassNumber || `ISS-${mov.issueId.slice(0, 6).toUpperCase()}`,
          timestamp: iso,
          sortMs,
        });
      }
    });

    issues.forEach((slip) => {
      if (coveredIssueIds.has(slip.id)) return;
      const issuedMs = new Date(slip.dateIssued).getTime();
      if (!Number.isFinite(issuedMs)) return;
      const totalUnits = roundStockQuantity(
        slip.lines.reduce((sum, l) => sum + (Number(l.qtyIssued) || 0), 0),
      );
      const preview =
        slip.lines.length === 1
          ? `${slip.lines[0].name} · ${totalUnits}${slip.lines[0].unit ? ` ${slip.lines[0].unit}` : ''}`
          : `${slip.lines.length} items · ${totalUnits} units`;
      list.push({
        id: `slip-${slip.id}`,
        kind: 'issued',
        title: 'Stock Issued',
        subtitle: `${preview} to ${slip.recipientName || slip.recipient}`,
        refCode: slip.gatePassNumber || `ISS-${slip.id.slice(0, 6).toUpperCase()}`,
        timestamp: slip.dateIssued,
        sortMs: issuedMs,
      });
    });

    issueLog.forEach((log) => {
      const issuedMs = new Date(log.dateIssued).getTime();
      if (Number.isFinite(issuedMs)) {
        list.push({
          id: `iss-${log.id}`,
          kind: 'issued',
          title: 'Stock Issued',
          subtitle: `${log.itemName} · ${log.quantity} to ${log.recipientName}`,
          refCode: log.gatePassNumber || `ISS-${log.id.slice(0, 6).toUpperCase()}`,
          timestamp: log.dateIssued,
          sortMs: issuedMs,
        });
      }
      if (log.returned && log.dateReturned) {
        const retMs = new Date(log.dateReturned).getTime();
        if (Number.isFinite(retMs)) {
          list.push({
            id: `ret-${log.id}`,
            kind: 'returned',
            title: 'Stock Returned',
            subtitle: `${log.itemName} · ${log.quantity} from ${log.recipientName}`,
            refCode: `RET-${log.id.slice(0, 6).toUpperCase()}`,
            timestamp: log.dateReturned,
            sortMs: retMs,
          });
        }
      }
    });

    const deptLower = activeDepartment.trim().toLowerCase();
    igaLogistics.forEach((entry) => {
      if (isHodMode && entry.department.trim().toLowerCase() !== deptLower) return;
      const ms = new Date(entry.dateRecorded).getTime();
      if (!Number.isFinite(ms)) return;
      const label =
        entry.entryType === 'Store Requisition'
          ? 'IGA Requisition'
          : entry.entryType === 'Sales Revenue'
            ? 'IGA Sale'
            : entry.entryType;
      list.push({
        id: `iga-${entry.id}`,
        kind: 'iga',
        title: label,
        subtitle: `${entry.description} · ${entry.department}`,
        refCode: `IGA-${entry.id.slice(0, 6).toUpperCase()}`,
        timestamp: entry.dateRecorded,
        sortMs: ms,
      });
    });

    return list.sort((a, b) => b.sortMs - a.sortMs).slice(0, 5);
  }, [stockMovements, issues, inventory, issueLog, igaLogistics, isHodMode, activeDepartment]);

  const deptIgaUnits = useMemo(() => {
    if (!isHodMode) return igaUnits;
    return igaUnits.filter(
      (u) => u.department.trim().toLowerCase() === activeDepartment.trim().toLowerCase(),
    );
  }, [igaUnits, isHodMode, activeDepartment]);

  const deptIgaLogistics = useMemo(() => {
    if (!isHodMode) return igaLogistics;
    return igaLogistics.filter(
      (l) => l.department.trim().toLowerCase() === activeDepartment.trim().toLowerCase(),
    );
  }, [igaLogistics, isHodMode, activeDepartment]);

  const displayName = isHodMode ? `${activeDepartment} HOD` : 'ERTVC Store';

  const quickActions = isHodMode
    ? [
        {
          id: 'inventory',
          label: 'Department Stock',
          sub: 'View & add items',
          icon: 'fa-box',
          tone: 'bg-blue-50 text-blue-600',
          onClick: () => onOpenInventoryFilter('all'),
        },
        {
          id: 'request',
          label: 'Request Issue',
          sub: 'Message store desk',
          icon: 'fa-paper-plane',
          tone: 'bg-amber-50 text-amber-600',
          onClick: () => onNavigate('issueLog'),
        },
        {
          id: 'iga',
          label: 'IGA Hub',
          sub: `${activeDepartment} unit`,
          icon: 'fa-store',
          tone: 'bg-emerald-50 text-emerald-600',
          onClick: () => onNavigate('iga'),
        },
        {
          id: 'budgets',
          label: 'FY Budgets',
          sub: 'Prepare & submit',
          icon: 'fa-file-invoice-dollar',
          tone: 'bg-indigo-50 text-indigo-600',
          onClick: () => onNavigate('budgets'),
        },
        {
          id: 'clearance',
          label: 'Clearance Check',
          sub: 'Verify returns',
          icon: 'fa-user-check',
          tone: 'bg-teal-50 text-teal-600',
          onClick: () => onNavigate('clearance'),
        },
        {
          id: 'add_item',
          label: 'New Item',
          sub: 'Add department stock',
          icon: 'fa-plus',
          tone: 'bg-sky-50 text-sky-600',
          onClick: onTriggerStockIn,
        },
      ]
    : [
        {
          id: 'stock_in',
          label: 'Stock In',
          sub: 'Receive new stock',
          icon: 'fa-plus',
          tone: 'bg-emerald-50 text-emerald-600',
          onClick: onTriggerStockIn,
        },
        {
          id: 'stock_out',
          label: 'Stock Out',
          sub: 'Issue stock items',
          icon: 'fa-arrow-up',
          tone: 'bg-rose-50 text-rose-600',
          onClick: onTriggerStockOut,
        },
        {
          id: 'iga',
          label: 'IGA Hub',
          sub: 'Units & requisitions',
          icon: 'fa-right-left',
          tone: 'bg-blue-50 text-blue-600',
          onClick: () => onNavigate('iga'),
        },
        {
          id: 'budgets',
          label: 'FY Budgets',
          sub: 'Review allocations',
          icon: 'fa-file-invoice-dollar',
          tone: 'bg-amber-50 text-amber-600',
          onClick: () => onNavigate('budgets'),
        },
        {
          id: 'stock_return',
          label: 'Stock Return',
          sub: 'Check returned items',
          icon: 'fa-rotate-left',
          tone: 'bg-purple-50 text-purple-600',
          onClick: onOpenReturnsFilter,
        },
        {
          id: 'clearance',
          label: 'Clearance',
          sub: 'Verify & print PDF',
          icon: 'fa-user-check',
          tone: 'bg-teal-50 text-teal-600',
          onClick: () => onNavigate('clearance'),
        },
      ];

  return (
    <div className="space-y-5">
      {/* Greeting Header & Live Date / Financial Year Strip */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 truncate">
            {getTimeGreeting(now)}, {displayName}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isHodMode
              ? `Here is ${activeDepartment}'s stock, requisition, and budget overview today.`
              : "Here's what's happening in our store today."}
          </p>
        </div>

        <div className="flex flex-wrap items-stretch gap-3 shrink-0">
          {/* Live Date & Time Card */}
          <div className="bg-white border border-slate-200/90 rounded-xl px-3.5 py-2 flex items-center gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 text-sm">
              <i className="far fa-calendar"></i>
            </div>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                {formatDateLine(now)}
              </p>
              <p className="font-mono text-[11px] text-slate-500 tabular-nums mt-0.5">
                {formatTimeLine(now)}
              </p>
            </div>
          </div>

          {/* Financial Year Selector Card */}
          <label className="bg-[#082447] text-white rounded-xl px-3.5 py-2 flex items-center gap-2.5 shadow-sm cursor-pointer">
            <div className="w-7 h-7 rounded-lg bg-white/10 text-sky-200 flex items-center justify-center shrink-0 text-xs">
              <i className="far fa-calendar-check"></i>
            </div>
            <div className="leading-tight">
              <span className="block text-[10px] font-medium text-sky-200/80 uppercase tracking-wider">
                Financial Year
              </span>
              <select
                aria-label="Select Financial Year"
                value={selectedFy}
                onChange={(e) => setSelectedFy(e.target.value)}
                className="bg-transparent border-0 p-0 pr-5 text-xs font-bold text-white focus:ring-0 cursor-pointer tabular-nums"
              >
                {financialYears.map((fy) => (
                  <option key={fy} value={fy} className="text-slate-900 bg-white">
                    {fy}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
      </div>

      {/* Contextual HOD / Admin Action Banners */}
      {isHodMode && (
        <div className="bg-white border border-sky-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
              <i className="fas fa-user-tie text-sm"></i>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
                Head of Department Desk
              </p>
              <p className="text-sm font-bold text-slate-900">{activeDepartment} Portal</p>
              <p className="text-xs text-slate-600 tabular-nums">
                {deptIgaUnits.length} IGA unit(s) · {deptIgaLogistics.length} logistics entry(s) ·{' '}
                {pendingIssueRequestsCount} pending request(s)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('budgets')}
              className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors"
            >
              FY Budget
            </button>
            <button
              type="button"
              onClick={() => onNavigate('issueLog')}
              className="px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold transition-colors"
            >
              Request Issue
            </button>
            <button
              type="button"
              onClick={() => onNavigate('iga')}
              className="px-3 py-1.5 rounded-lg bg-[#0c3a6e] hover:bg-[#092d57] text-white text-xs font-semibold transition-colors"
            >
              {activeDepartment} IGA
            </button>
          </div>
        </div>
      )}

      {!isHodMode && (pendingIssueRequestsCount > 0 || (activeRole === 'admin' && pendingIgaApprovalsCount > 0) || submittedBudgetsCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {pendingIssueRequestsCount > 0 && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-900 tabular-nums truncate">
                  {pendingIssueRequestsCount} Pending HOD Issue Request
                  {pendingIssueRequestsCount === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-amber-800 truncate">
                  Awaiting Officer or Admin issue action
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('issueLog')}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Review →
              </button>
            </div>
          )}

          {activeRole === 'admin' && pendingIgaApprovalsCount > 0 && (
            <div className="bg-sky-50/90 border border-sky-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-sky-900 tabular-nums truncate">
                  {pendingIgaApprovalsCount} IGA Proposal{pendingIgaApprovalsCount === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-sky-800 truncate">
                  Submitted for admin approval
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('iga')}
                className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Approve →
              </button>
            </div>
          )}

          {submittedBudgetsCount > 0 && (
            <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-900 tabular-nums truncate">
                  {submittedBudgetsCount} Submitted FY Budget{submittedBudgetsCount === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-emerald-800 truncate">
                  Ready for review &amp; PDF export
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('budgets')}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Review →
              </button>
            </div>
          )}
        </div>
      )}

      {!isHodMode && (hasLocalBackupData || (isAdminUser && inventory.length === 0 && demoRecordCount === 0 && !settings.seeded)) && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-bold text-sky-950">
              {hasLocalBackupData ? 'Local Browser Data Detected' : 'Your Cloud Store Is Ready'}
            </h2>
            <p className="text-xs text-sky-800 mt-0.5">
              {hasLocalBackupData
                ? 'Migrate locally saved inventory records to Firestore so they persist across devices.'
                : 'Start adding real items in Inventory, or load institutional demonstration records.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {hasLocalBackupData && (
              <button
                type="button"
                disabled={seeding}
                onClick={async () => {
                  setSeeding(true);
                  try {
                    await migrateLocalStorageData();
                  } finally {
                    setSeeding(false);
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                <i className="fas fa-cloud-arrow-up mr-1.5"></i>Migrate Local Data
              </button>
            )}
            {isAdminUser && inventory.length === 0 && demoRecordCount === 0 && !settings.seeded && (
              <button
                type="button"
                disabled={seeding}
                onClick={async () => {
                  setSeeding(true);
                  try {
                    await seedSampleData();
                  } finally {
                    setSeeding(false);
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold disabled:opacity-60"
              >
                <i className="fas fa-database mr-1.5"></i>
                {seeding ? 'Loading Demo Data...' : 'Load Institutional Demo Data'}
              </button>
            )}
          </div>
        </div>
      )}

      {isAdminUser && demoRecordCount > 0 && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-xs">
              <i className="fas fa-flask"></i>
            </span>
            <p className="text-xs text-amber-900 truncate tabular-nums">
              <strong>Demo Data Active</strong> ({demoRecordCount} records across{' '}
              {STANDARD_TVET_DEPARTMENTS.length} departments)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={seeding}
              onClick={async () => {
                setSeeding(true);
                try {
                  await refreshDemonstrationData();
                } finally {
                  setSeeding(false);
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold disabled:opacity-60"
            >
              {seeding ? 'Reloading...' : 'Reload Demo'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold"
            >
              Manage in Settings →
            </button>
          </div>
        </div>
      )}

      {/* Row 1: 5-Column KPI Strip */}
      <section aria-label="Key store indicators" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* KPI 1: Total Items In Stock */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <i className="fas fa-boxes-stacked text-base"></i>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">Total Items In Stock</p>
              <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight">
                {totalItems.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {scopedInventory.length} catalog item{scopedInventory.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onOpenInventoryFilter('all')}
              className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5"
            >
              <span>View all items</span>
              <i className="fas fa-arrow-right text-[10px]"></i>
            </button>
          </div>
        </div>

        {/* KPI 2: FY Budgets Value */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <i className="fas fa-coins text-base"></i>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-700 truncate">
                FY Budgets ({selectedFy === 'All Years' ? 'All' : selectedFy})
              </p>
              <p className="font-display text-xl sm:text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight truncate">
                KSh {fyBudgetMetrics.totalAmount.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate tabular-nums">
                {fyBudgetMetrics.count} budget schedule{fyBudgetMetrics.count === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('budgets')}
              className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5"
            >
              <span>View budgets</span>
              <i className="fas fa-arrow-right text-[10px]"></i>
            </button>
          </div>
        </div>

        {/* KPI 3: Low Stock Items */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <i className="fas fa-triangle-exclamation text-base"></i>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-700 truncate">Low Stock Items</p>
              <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight">
                {lowStockList.length.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">Below reorder level (&lt; 10)</p>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onOpenInventoryFilter('low')}
              className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5"
            >
              <span>View low stock</span>
              <i className="fas fa-arrow-right text-[10px]"></i>
            </button>
          </div>
        </div>

        {/* KPI 4: Out of Stock Items */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <i className="fas fa-times text-base"></i>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-red-700 truncate">Out of Stock Items</p>
              <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight">
                {outOfStockItemList.length.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">Require immediate action</p>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onOpenInventoryFilter('out')}
              className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5"
            >
              <span>View out of stock</span>
              <i className="fas fa-arrow-right text-[10px]"></i>
            </button>
          </div>
        </div>

        {/* KPI 5: Today's Issues */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <i className="fas fa-arrow-right-from-bracket text-base"></i>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-indigo-700 truncate">Today&apos;s Issues</p>
              <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-tight">
                {todaysIssuesCount.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate tabular-nums">
                {totalPendingReturns} awaiting return
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('issueLog')}
              className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5"
            >
              <span>View issues</span>
              <i className="fas fa-arrow-right text-[10px]"></i>
            </button>
          </div>
        </div>
      </section>

      {/* Row 2: Middle Analytics Split (Bar Chart + Category Donut) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Stock Levels by Item (Top 10) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              Stock Levels by Item (Top 10)
            </h2>
            <select
              aria-label="Filter stock levels chart"
              value={barFilter}
              onChange={(e) =>
                setBarFilter(
                  e.target.value as 'all' | 'consumable' | 'returnable' | 'asset' | 'low',
                )
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            >
              <option value="all">View All Items</option>
              <option value="consumable">Consumables Only</option>
              <option value="returnable">Returnable Fittings</option>
              <option value="asset">Serialized Assets</option>
              <option value="low">Low Stock (&lt; 10)</option>
            </select>
          </div>

          {stockByItemTop10.length > 0 ? (
            <>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stockByItemTop10}
                    margin={{ top: 20, right: 12, left: -12, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      tick={{ fontSize: 10, fill: '#475569' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                      angle={-18}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                      }}
                      formatter={(val, _name, item: any) => [
                        `${val ?? 0} ${item?.payload?.unit || ''}`.trim(),
                        item?.payload?.fullName || 'Current Stock',
                      ]}
                    />
                    <Bar
                      dataKey="stock"
                      name="Current Stock"
                      fill="#1669e5"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={38}
                    >
                      <LabelList
                        dataKey="stock"
                        position="top"
                        fill="#1669e5"
                        fontSize={11}
                        fontWeight={700}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex items-center justify-center gap-2 text-xs font-medium text-slate-600">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#1669e5] inline-block" />
                <span>Current Stock</span>
              </div>
            </>
          ) : (
            <div className="flex-1 min-h-[240px] flex flex-col items-center justify-center text-center text-slate-500 p-6">
              <i className="fas fa-chart-column text-2xl text-slate-300 mb-2"></i>
              <p className="text-sm font-semibold text-slate-700">No matching stock items</p>
              <p className="text-xs text-slate-500 mt-1">
                Try another filter or add stock in Inventory.
              </p>
            </div>
          )}
        </div>

        {/* Right: Stock by Category Donut */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              Stock by Category
            </h2>
            <select
              aria-label="Filter category chart"
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as 'all' | 'Consumable' | 'Asset' | 'iga')
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            >
              <option value="all">View All Categories</option>
              <option value="Consumable">Quantity / Consumables</option>
              <option value="Asset">Serialized Assets</option>
              <option value="iga">IGA Stock Only</option>
            </select>
          </div>

          {categoryBreakdown.slices.length > 0 ? (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
              <div className="sm:col-span-6 relative h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown.slices}
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={84}
                      paddingAngle={1.5}
                      dataKey="value"
                      nameKey="name"
                    >
                      {categoryBreakdown.slices.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} stroke="#ffffff" strokeWidth={1.5} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-display text-lg font-bold text-slate-900 tabular-nums leading-tight">
                    {categoryBreakdown.total.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">Total Items</span>
                </div>
              </div>

              <ul className="sm:col-span-6 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {categoryBreakdown.slices.map((slice) => (
                  <li
                    key={slice.name}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="text-slate-700 font-medium truncate">{slice.name}</span>
                    </span>
                    <span className="font-mono font-semibold text-slate-800 tabular-nums shrink-0">
                      {slice.pct}%{' '}
                      <span className="text-slate-400 font-normal">
                        ({slice.value.toLocaleString()})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex-1 min-h-[220px] flex flex-col items-center justify-center text-center text-slate-500 p-6">
              <i className="fas fa-chart-pie text-2xl text-slate-300 mb-2"></i>
              <p className="text-sm font-semibold text-slate-700">No category stock found</p>
              <p className="text-xs text-slate-500 mt-1">
                Add inventory items to visualize category distribution.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Row 3: Bottom 3-Column Operations Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Column 1: Recent Transactions */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              Recent Transactions
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('issueLog')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 whitespace-nowrap"
            >
              <span>View all</span>
              <i className="fas fa-arrow-right text-[10px]"></i>
            </button>
          </div>

          {recentTransactions.length > 0 ? (
            <ul className="divide-y divide-slate-100 flex-1">
              {recentTransactions.map((tx) => {
                const style =
                  tx.kind === 'returned'
                    ? {
                        tile: 'bg-emerald-50 text-emerald-600',
                        icon: 'fa-arrow-down',
                        refColor: 'text-emerald-600',
                      }
                    : tx.kind === 'damaged'
                      ? {
                          tile: 'bg-amber-50 text-amber-700',
                          icon: 'fa-triangle-exclamation',
                          refColor: 'text-amber-700',
                        }
                      : tx.kind === 'issued'
                        ? {
                            tile: 'bg-rose-50 text-rose-600',
                            icon: 'fa-arrow-up',
                            refColor: 'text-rose-600',
                          }
                        : {
                            tile: 'bg-sky-50 text-sky-600',
                            icon: 'fa-right-left',
                            refColor: 'text-sky-600',
                          };
                return (
                  <li key={tx.id} className="py-2.5 first:pt-1 last:pb-1">
                    <button
                      type="button"
                      onClick={() => onNavigate(tx.kind === 'iga' ? 'iga' : 'issueLog')}
                      className="w-full flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 rounded-lg px-1 py-0.5 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-xs ${style.tile}`}
                        >
                          <i className={`fas ${style.icon}`}></i>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{tx.title}</p>
                          <p className="text-[11px] text-slate-500 truncate">{tx.subtitle}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-mono text-[11px] font-bold tabular-nums ${style.refColor}`}>
                          {tx.refCode}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400 tabular-nums mt-0.5">
                          {formatTxTimestamp(tx.timestamp)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center text-slate-500 p-4">
              <i className="fas fa-receipt text-xl text-slate-300 mb-2"></i>
              <p className="text-xs font-semibold text-slate-700">No recent transactions yet</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Stock issues, returns, and IGA entries appear here automatically.
              </p>
            </div>
          )}
        </div>

        {/* Column 2: Low Stock Alerts */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              Low Stock Alerts
            </h2>
            <button
              type="button"
              onClick={() => onOpenInventoryFilter('low')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 whitespace-nowrap"
            >
              <span>View all</span>
              <i className="fas fa-arrow-right text-[10px]"></i>
            </button>
          </div>

          {alertItems.length > 0 ? (
            <ul className="divide-y divide-slate-100 flex-1">
              {alertItems.map((item) => {
                const isOut = item.quantity <= 0;
                return (
                  <li key={item.id} className="py-2.5 first:pt-1 last:pb-1">
                    <button
                      type="button"
                      onClick={() => onOpenInventoryFilter(isOut ? 'out' : 'low', item.name)}
                      className="w-full flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 rounded-lg px-1 py-0.5 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <i
                          className={`fas fa-triangle-exclamation text-sm shrink-0 ${
                            isOut ? 'text-red-500' : 'text-amber-500'
                          }`}
                        ></i>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums truncate">
                            Current: {roundStockQuantity(item.quantity)} {item.unit} | Reorder: 10{' '}
                            {item.unit}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${
                          isOut
                            ? 'bg-red-50 text-red-700 border border-red-200/70'
                            : 'bg-amber-50 text-amber-700 border border-amber-200/70'
                        }`}
                      >
                        {isOut ? 'Out' : 'Low'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center text-slate-500 p-4">
              <i className="fas fa-circle-check text-xl text-emerald-500 mb-2"></i>
              <p className="text-xs font-semibold text-slate-700">All stock levels healthy</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Every consumable item is stocked at 10 units or above.
              </p>
            </div>
          )}
        </div>

        {/* Column 3: Quick Actions */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              Quick Actions
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5 flex-1">
            {quickActions.map((act) => (
              <button
                key={act.id}
                type="button"
                onClick={act.onClick}
                className="rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 hover:bg-slate-50/70 p-3 flex items-center gap-2.5 text-left transition-all active:scale-[0.98]"
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm ${act.tone}`}
                >
                  <i className={`fas ${act.icon}`}></i>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{act.label}</p>
                  <p className="text-[11px] text-slate-500 truncate">{act.sub}</p>
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="col-span-2 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 hover:bg-slate-50/70 p-3 flex items-center gap-3 text-left transition-all active:scale-[0.98]"
            >
              <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-sm">
                <i className="fas fa-file-lines"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {isHodMode ? 'Reports & Stock Taking' : 'Generate Report'}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {isHodMode
                    ? `${activeDepartment} stock taking sheet & PDFs`
                    : 'Create inventory & disposal reports'}
                </p>
              </div>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
