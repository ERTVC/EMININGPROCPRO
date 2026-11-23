import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  DepartmentalIGA,
  IGAActivityType,
  IGAApprovalStatus,
  IGADirection,
  IGADispatchStatus,
  IGALogisticsType,
  IGAUnitStatus,
  VALIDATION_LIMITS,
} from '../types';
import { formatKes, generateIGASummaryPdf } from '../utils/igaReports';
import { readProposalFileToDataUrl } from '../utils/logo';
import {
  defaultActivityTypeForDepartment,
  STANDARD_TVET_DEPARTMENTS,
} from '../utils/sampleData';

const ACTIVITY_TYPES: IGAActivityType[] = [
  'Manufacturing',
  'Services',
  'Agriculture',
  'Catering',
  'Retail',
  'Other',
];

const UNIT_STATUSES: IGAUnitStatus[] = ['Active', 'Planned', 'Paused'];

const LOGISTICS_TYPES: IGALogisticsType[] = [
  'Store Requisition',
  'Direct Purchase',
  'Production Output',
  'Sales Revenue',
  'Delivery Dispatch',
];

const DISPATCH_STATUSES: IGADispatchStatus[] = [
  'Logged',
  'In Transit',
  'Delivered',
  'Completed',
];

const defaultDirectionForType = (type: IGALogisticsType): IGADirection => {
  if (type === 'Sales Revenue') return 'Inflow';
  if (type === 'Direct Purchase' || type === 'Store Requisition') return 'Outflow';
  return 'Internal';
};

function safeHttpsUrl(raw?: string): string {
  const cleaned = (raw || '').trim();
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === 'https:' ? cleaned : '';
  } catch {
    return '';
  }
}

export const IGAHubPage: React.FC<{
  initialDepartmentFilter?: string;
  hodDepartment?: string;
}> = ({ initialDepartmentFilter = '', hodDepartment = '' }) => {
  const {
    igaUnits,
    igaLogistics,
    inventory,
    assets,
    recipients,
    settings,
    activeRole,
    addIGAUnit,
    updateIGAUnit,
    reviewIGAUnit,
    deleteIGAUnit,
    addIGALogistics,
    updateIGALogisticsStatus,
    deleteIGALogistics,
    seedSampleIGAs,
    initializeMissingDeptIGAs,
    showToast,
  } = useAppContext();

  const isAdmin = activeRole === 'admin';
  const isHodMode = Boolean(hodDepartment.trim());
  const normalizedHodDept = hodDepartment.trim();

  const [seeding, setSeeding] = useState(false);
  const [initializingMissing, setInitializingMissing] = useState(false);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<DepartmentalIGA | null>(null);
  const [prefillDepartment, setPrefillDepartment] = useState('');

  const [reviewingUnit, setReviewingUnit] = useState<DepartmentalIGA | null>(null);
  const [deleteConfirmUnit, setDeleteConfirmUnit] = useState<DepartmentalIGA | null>(null);
  const [deletingUnit, setDeletingUnit] = useState(false);
  const [previewProposalUnit, setPreviewProposalUnit] = useState<{
    title: string;
    fileName: string;
    dataUrl: string;
  } | null>(null);

  const [logisticsModalOpen, setLogisticsModalOpen] = useState(false);
  const [preselectedUnitId, setPreselectedUnitId] = useState('');

  const [toolsDrawerDept, setToolsDrawerDept] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<'All' | IGALogisticsType>('All');
  const [deptFilter, setDeptFilter] = useState<string>(
    normalizedHodDept || initialDepartmentFilter || 'All',
  );
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (normalizedHodDept) {
      setDeptFilter(normalizedHodDept);
    } else if (initialDepartmentFilter) {
      setDeptFilter(initialDepartmentFilter);
    }
  }, [normalizedHodDept, initialDepartmentFilter]);

  // All known college departments (standard TVET + existing inventory + existing IGA units)
  const allKnownDepartments = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of STANDARD_TVET_DEPARTMENTS) {
      map.set(d.toLowerCase(), d);
    }
    for (const item of inventory) {
      const clean = (item.department || '').trim();
      if (clean && !map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), clean);
      }
    }
    for (const unit of igaUnits) {
      const clean = unit.department.trim();
      if (clean && !map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), clean);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [inventory, igaUnits]);

  const registeredDeptKeys = useMemo(
    () => new Set(igaUnits.map((u) => u.department.trim().toLowerCase())),
    [igaUnits],
  );

  const uncoveredDepartments = useMemo(
    () => allKnownDepartments.filter((d) => !registeredDeptKeys.has(d.toLowerCase())),
    [allKnownDepartments, registeredDeptKeys],
  );

  const effectiveDeptFilter = isHodMode ? normalizedHodDept : deptFilter;

  const scopedUnits = useMemo(() => {
    if (!isHodMode) return igaUnits;
    return igaUnits.filter(
      (u) => u.department.trim().toLowerCase() === normalizedHodDept.toLowerCase(),
    );
  }, [igaUnits, isHodMode, normalizedHodDept]);

  const scopedLogistics = useMemo(() => {
    if (!isHodMode) return igaLogistics;
    return igaLogistics.filter(
      (l) => l.department.trim().toLowerCase() === normalizedHodDept.toLowerCase(),
    );
  }, [igaLogistics, isHodMode, normalizedHodDept]);

  const approvedScopedUnits = useMemo(
    () => scopedUnits.filter((u) => (u.approvalStatus || 'Approved') === 'Approved'),
    [scopedUnits],
  );

  const pendingApprovalUnits = useMemo(
    () => scopedUnits.filter((u) => (u.approvalStatus || 'Approved') === 'Pending'),
    [scopedUnits],
  );

  // KPI computations
  const kpis = useMemo(() => {
    const activeCount = scopedUnits.filter(
      (u) => u.status === 'Active' && (u.approvalStatus || 'Approved') === 'Approved',
    ).length;
    const pendingDispatches = scopedLogistics.filter(
      (l) => l.dispatchStatus === 'Logged' || l.dispatchStatus === 'In Transit',
    ).length;
    const totalRevenue = scopedLogistics
      .filter((l) => l.direction === 'Inflow')
      .reduce((sum, l) => sum + (l.totalAmount || 0), 0);
    const totalCosts = scopedLogistics
      .filter((l) => l.direction === 'Outflow')
      .reduce((sum, l) => sum + (l.totalAmount || 0), 0);
    return {
      activeCount,
      totalUnits: scopedUnits.length,
      pendingApprovals: pendingApprovalUnits.length,
      totalLogs: scopedLogistics.length,
      pendingDispatches,
      totalRevenue,
      totalCosts,
      netSurplus: totalRevenue - totalCosts,
    };
  }, [scopedUnits, scopedLogistics, pendingApprovalUnits.length]);

  // Helper to get department inventory items & assets
  const getDeptStoreSnapshot = (department: string) => {
    const key = department.trim().toLowerCase();
    const deptItems = inventory.filter(
      (i) => (i.department || '').trim().toLowerCase() === key || (i.isIGA && (i.department || '').trim().toLowerCase() === key),
    );
    const itemIds = new Set(deptItems.map((i) => i.id));
    const deptAssets = assets.filter((a) => itemIds.has(a.inventoryId));
    const consumablesQty = deptItems
      .filter((i) => i.type === 'Consumable')
      .reduce((s, i) => s + (i.quantity || 0), 0);
    return {
      items: deptItems,
      assets: deptAssets,
      consumablesQty,
      inStockAssets: deptAssets.filter((a) => a.status === 'In Stock').length,
      issuedAssets: deptAssets.filter((a) => a.status === 'Issued').length,
    };
  };

  // Filtered logistics ledger
  const filteredLogistics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...scopedLogistics]
      .sort((a, b) => (b.dateRecorded || '').localeCompare(a.dateRecorded || ''))
      .filter((entry) => {
        if (typeFilter !== 'All' && entry.entryType !== typeFilter) return false;
        if (
          effectiveDeptFilter !== 'All' &&
          entry.department.toLowerCase() !== effectiveDeptFilter.toLowerCase()
        ) {
          return false;
        }
        if (q) {
          const hay = `${entry.department} ${entry.igaName} ${entry.description} ${entry.destinationOrClient} ${entry.notes}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [scopedLogistics, typeFilter, effectiveDeptFilter, searchQuery]);

  const openRegisterModal = (deptPrefill = '') => {
    setEditingUnit(null);
    setPrefillDepartment(isHodMode ? normalizedHodDept : deptPrefill);
    setUnitModalOpen(true);
  };

  const openEditModal = (unit: DepartmentalIGA) => {
    setEditingUnit(unit);
    setPrefillDepartment('');
    setUnitModalOpen(true);
  };

  const openLogModal = (unitId = '') => {
    if (scopedUnits.length === 0) {
      showToast(
        isHodMode
          ? `Register your ${normalizedHodDept} Departmental IGA with a proposal first.`
          : 'Register at least one Departmental IGA first.',
        'info',
      );
      openRegisterModal();
      return;
    }
    if (approvedScopedUnits.length === 0) {
      showToast(
        'Your departmental IGA proposal must be approved by the Admin before logging logistics.',
        'info',
      );
      return;
    }
    const targetUnit =
      approvedScopedUnits.find((u) => u.id === unitId) || approvedScopedUnits[0];
    setPreselectedUnitId(targetUnit.id);
    setLogisticsModalOpen(true);
  };

  const handleSeedSamples = async () => {
    setSeeding(true);
    try {
      await seedSampleIGAs();
    } finally {
      setSeeding(false);
    }
  };

  const handleInitializeMissing = async () => {
    setInitializingMissing(true);
    try {
      await initializeMissingDeptIGAs(uncoveredDepartments);
    } finally {
      setInitializingMissing(false);
    }
  };

  const handleExportPdf = async (departmentFilter?: string) => {
    try {
      await generateIGASummaryPdf({
        settings,
        igaUnits,
        igaLogistics,
        departmentFilter,
      });
    } catch (err) {
      console.error('IGA PDF error:', err);
      showToast('Failed to generate IGA PDF report.', 'error');
    }
  };

  const statusTone = (status: IGAUnitStatus) => {
    if (status === 'Active') return 'text-emerald-700';
    if (status === 'Planned') return 'text-sky-700';
    return 'text-amber-700';
  };

  const approvalTone = (approval: IGAApprovalStatus) => {
    if (approval === 'Approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (approval === 'Rejected') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-amber-50 text-amber-800 border-amber-200';
  };

  const dispatchTone = (status: IGADispatchStatus) => {
    if (status === 'Completed') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (status === 'Delivered') return 'text-sky-700 bg-sky-50 border-sky-200';
    if (status === 'In Transit') return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-slate-700 bg-slate-100 border-slate-200';
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
            {isHodMode
              ? `HOD Portal · ${normalizedHodDept}`
              : 'Departmental Enterprise Hub'}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-0.5">
            {isHodMode ? `${normalizedHodDept} IGA & Logistics` : 'IGA & Logistics Hub'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isHodMode
              ? `Manage ${normalizedHodDept}'s IGA unit, request store materials, and track KES revenue.`
              : "Track every department's Income-Generating Activity, store requisitions, dispatch, and KES revenue."}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              void handleExportPdf(effectiveDeptFilter !== 'All' ? effectiveDeptFilter : undefined)
            }
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-file-pdf text-red-600"></i>
            <span>Export PDF</span>
          </button>
          <button
            type="button"
            onClick={() => openRegisterModal()}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-plus"></i>
            <span className="truncate">{isHodMode ? 'Submit IGA Proposal' : 'New Dept IGA'}</span>
          </button>
          <button
            type="button"
            onClick={() => openLogModal()}
            className="col-span-2 sm:col-span-1 min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0369a1] hover:from-[#0369a1] hover:to-[#0284c7] text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <i className="fas fa-truck-fast"></i>
            <span>Log Logistics Entry</span>
          </button>
        </div>
      </div>

      {/* KPI Strip (2x2 native grid on mobile, 4-col on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">
              Active IGAs
            </span>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center text-xs sm:text-sm shrink-0">
              <i className="fas fa-store"></i>
            </span>
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {kpis.activeCount}{' '}
            <span className="text-xs sm:text-sm font-normal text-slate-500">/ {kpis.totalUnits}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate tabular-nums">
            {isHodMode
              ? scopedUnits.length === 0
                ? 'No IGA registered yet'
                : `${approvedScopedUnits.length} approved · ${pendingApprovalUnits.length} pending`
              : uncoveredDepartments.length === 0
                ? 'All departments covered'
                : `${uncoveredDepartments.length} pending IGA`}
          </p>
        </div>

        <div className="bg-surface rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">
              Logistics Logs
            </span>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-xs sm:text-sm shrink-0">
              <i className="fas fa-boxes-packing"></i>
            </span>
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {kpis.totalLogs}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate tabular-nums">
            {kpis.pendingDispatches} active / in-transit
          </p>
        </div>

        <div className="bg-surface rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">
              Total Revenue
            </span>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs sm:text-sm shrink-0">
              <i className="fas fa-coins"></i>
            </span>
          </div>
          <p className="font-display text-base sm:text-2xl font-bold text-emerald-700 mt-1.5 font-mono tabular-nums truncate">
            {formatKes(kpis.totalRevenue)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 font-mono truncate tabular-nums">
            Cost: {formatKes(kpis.totalCosts)}
          </p>
        </div>

        <div className="bg-surface rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">
              Net Surplus
            </span>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xs sm:text-sm shrink-0">
              <i className="fas fa-chart-line"></i>
            </span>
          </div>
          <p
            className={`font-display text-base sm:text-2xl font-bold mt-1.5 font-mono tabular-nums truncate ${
              kpis.netSurplus >= 0 ? 'text-slate-900' : 'text-red-600'
            }`}
          >
            {formatKes(kpis.netSurplus)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">Revenue minus costs</p>
        </div>
      </div>

      {/* Admin Pending Proposals Queue Banner */}
      {isAdmin && pendingApprovalUnits.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <i className="fas fa-file-signature"></i>
              </div>
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-amber-950">
                  {pendingApprovalUnits.length} Departmental IGA Proposal
                  {pendingApprovalUnits.length === 1 ? '' : 's'} Pending Admin Approval
                </h2>
                <p className="text-xs text-amber-800">
                  Review each HOD&apos;s uploaded IGA proposal document and approve or reject activation.
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {pendingApprovalUnits.map((unit) => (
              <div
                key={unit.id}
                className="bg-white rounded-xl border border-amber-200/80 p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">
                    {unit.department}
                  </p>
                  <p className="text-xs font-bold text-slate-900 truncate">{unit.igaName}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {unit.proposalLink
                      ? `Drive Link: ${unit.proposalFileName || unit.proposalLink}`
                      : unit.proposalFileName
                        ? `Proposal: ${unit.proposalFileName}`
                        : 'No proposal attached'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewingUnit(unit)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0"
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Starter Loader when empty (Admin only) */}
      {!isHodMode && isAdmin && igaUnits.length === 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-sky-900">
              Launch Departmental IGA Registry
            </h2>
            <p className="text-sm text-sky-800 mt-1">
              Load starter TVET departmental IGA units (Welding, Tailoring, Kitchen Catering, ICT
              Services) with sample logistics, or register each department manually.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              type="button"
              disabled={seeding}
              onClick={() => void handleSeedSamples()}
              className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold disabled:opacity-60"
            >
              <i className="fas fa-database mr-1.5"></i>
              {seeding ? 'Loading...' : 'Load Starter TVET Department IGAs'}
            </button>
          </div>
        </div>
      )}

      {/* HOD Department Prompt when department has no IGA unit yet */}
      {isHodMode && scopedUnits.length === 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-sky-900">
              Propose {normalizedHodDept} Departmental IGA
            </h2>
            <p className="text-sm text-sky-800 mt-1">
              No Income-Generating Activity is registered yet for <strong>{normalizedHodDept}</strong>.
              Submit your department&apos;s IGA unit with a Google Drive proposal link (or PDF) for Admin approval.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openRegisterModal(normalizedHodDept)}
            className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shrink-0"
          >
            <i className="fas fa-plus mr-1.5"></i>
            Submit {normalizedHodDept} IGA Proposal
          </button>
        </div>
      )}

      {/* Department IGA Coverage Strip (Admin / Officer cross-college view) */}
      {!isHodMode && (
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Department IGA Coverage Checklist
              </h2>
              <p className="text-xs text-slate-500">
                Every college department should maintain at least one registered IGA. Click any pending
                department below to register its IGA immediately.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs font-semibold tabular-nums text-slate-600">
                {allKnownDepartments.length - uncoveredDepartments.length} / {allKnownDepartments.length}{' '}
                covered
              </span>
              {isAdmin && uncoveredDepartments.length > 0 && (
                <button
                  type="button"
                  disabled={initializingMissing}
                  onClick={() => void handleInitializeMissing()}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                >
                  <i className="fas fa-layer-group mr-1.5"></i>
                  {initializingMissing
                    ? 'Initializing...'
                    : `Initialize Missing (${uncoveredDepartments.length})`}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {allKnownDepartments.map((dept) => {
              const matchingUnit = igaUnits.find(
                (u) => u.department.trim().toLowerCase() === dept.toLowerCase(),
              );
              if (matchingUnit) {
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setDeptFilter(deptFilter === dept ? 'All' : dept)}
                    className={`text-left px-3.5 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                      deptFilter.toLowerCase() === dept.toLowerCase()
                        ? 'border-sky-600 bg-sky-50'
                        : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{dept}</p>
                      <p className="text-[11px] text-slate-600 truncate">{matchingUnit.igaName}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                      <i className="fas fa-check-circle mr-1"></i>Registered
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => openRegisterModal(dept)}
                  className="text-left px-3.5 py-2.5 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 hover:bg-amber-50 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{dept}</p>
                    <p className="text-[11px] text-amber-700">No IGA registered yet</p>
                  </div>
                  <span className="text-[11px] font-semibold text-sky-700 shrink-0">
                    + Register
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Departmental IGA Units Directory */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {isHodMode
              ? `${normalizedHodDept} Registered IGA Unit(s)`
              : 'Registered Departmental IGA Units'}
          </h2>
          {!isHodMode && deptFilter !== 'All' && (
            <button
              type="button"
              onClick={() => setDeptFilter('All')}
              className="text-xs font-semibold text-sky-700 hover:underline"
            >
              Show all departments
            </button>
          )}
        </div>

        {scopedUnits.length === 0 ? (
          <div className="bg-surface rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            {isHodMode
              ? `No IGA unit registered under ${normalizedHodDept} yet.`
              : 'No departmental IGAs registered yet. Click Register Dept IGA or choose a department above to create the first unit.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scopedUnits
              .filter(
                (u) =>
                  effectiveDeptFilter === 'All' ||
                  u.department.toLowerCase() === effectiveDeptFilter.toLowerCase(),
              )
              .map((unit) => {
                const unitLogs = igaLogistics.filter((l) => l.igaId === unit.id);
                const rev = unitLogs
                  .filter((l) => l.direction === 'Inflow')
                  .reduce((s, l) => s + (l.totalAmount || 0), 0);
                const cost = unitLogs
                  .filter((l) => l.direction === 'Outflow')
                  .reduce((s, l) => s + (l.totalAmount || 0), 0);
                const net = rev - cost;
                const snapshot = getDeptStoreSnapshot(unit.department);
                const approvalStatus: IGAApprovalStatus = unit.approvalStatus || 'Approved';
                const isApproved = approvalStatus === 'Approved';

                return (
                  <div
                    key={unit.id}
                    className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                            {unit.department} · {unit.activityType}
                          </p>
                          <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5 truncate">
                            {unit.igaName}
                          </h3>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${approvalTone(
                              approvalStatus,
                            )}`}
                          >
                            {approvalStatus === 'Pending'
                              ? 'Pending Approval'
                              : approvalStatus}
                          </span>
                          <span className={`text-[11px] font-semibold ${statusTone(unit.status)}`}>
                            {unit.status}
                          </span>
                        </div>
                      </div>

                      {unit.description && (
                        <p className="text-xs text-slate-600 mt-2 line-clamp-2">{unit.description}</p>
                      )}

                      {/* Proposal Attachment, Drive Link & Summary */}
                      {(unit.proposalLink || unit.proposalFileName || unit.proposalSummary) && (() => {
                        const driveUrl = safeHttpsUrl(unit.proposalLink);
                        return (
                          <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 min-w-0">
                                <i
                                  className={`fas ${
                                    driveUrl ? 'fa-link text-emerald-600' : 'fa-file-lines text-sky-600'
                                  } shrink-0`}
                                ></i>
                                <span className="truncate">
                                  {unit.proposalFileName ||
                                    (driveUrl ? 'Google Drive Proposal Document' : 'IGA Proposal Summary')}
                                </span>
                              </span>
                              {driveUrl ? (
                                <div className="flex items-center gap-2.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void navigator.clipboard?.writeText(driveUrl);
                                      showToast('Google Drive proposal link copied!', 'success');
                                    }}
                                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                                  >
                                    Copy Link
                                  </button>
                                  <a
                                    href={driveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                                  >
                                    <span>Open Drive</span>
                                    <i className="fas fa-arrow-up-right-from-square text-[9px]"></i>
                                  </a>
                                </div>
                              ) : unit.proposalDataUrl ? (
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewProposalUnit({
                                        title: unit.igaName,
                                        fileName: unit.proposalFileName || 'iga-proposal',
                                        dataUrl: unit.proposalDataUrl,
                                      })
                                    }
                                    className="text-[11px] font-bold text-sky-700 hover:underline"
                                  >
                                    View
                                  </button>
                                  <a
                                    href={unit.proposalDataUrl}
                                    download={unit.proposalFileName || `${unit.department}_IGA_Proposal`}
                                    className="text-[11px] font-bold text-emerald-700 hover:underline"
                                  >
                                    Download
                                  </a>
                                </div>
                              ) : null}
                            </div>
                            {unit.proposalSummary && (
                              <p className="text-[11px] text-slate-600 line-clamp-2">
                                {unit.proposalSummary}
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      {unit.approvalNotes && (
                        <p className="text-[11px] text-slate-600 mt-2 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200/70">
                          <strong className="text-slate-800">Admin Note:</strong> {unit.approvalNotes}
                          {unit.reviewedByEmail ? ` (${unit.reviewedByEmail})` : ''}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>
                          <i className="fas fa-user-tie mr-1 text-slate-400"></i>
                          Lead: <strong className="text-slate-700">{unit.leadTrainer || 'Unassigned'}</strong>
                        </span>
                        <span className="tabular-nums">
                          <i className="fas fa-toolbox mr-1 text-slate-400"></i>
                          Store Links: <strong className="text-slate-700">{snapshot.items.length}</strong> catalog
                          item(s), <strong className="text-slate-700">{snapshot.assets.length}</strong> asset(s)
                        </span>
                      </div>
                    </div>

                    {/* Financial & Logistics Mini Grid */}
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-500 block">Revenue</span>
                        <span className="font-mono font-bold text-emerald-700 tabular-nums">
                          {formatKes(rev)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Costs</span>
                        <span className="font-mono font-bold text-slate-700 tabular-nums">
                          {formatKes(cost)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Net Surplus</span>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            net >= 0 ? 'text-sky-700' : 'text-red-600'
                          }`}
                        >
                          {formatKes(net)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!isApproved}
                          onClick={() => openLogModal(unit.id)}
                          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-semibold transition-colors"
                          title={
                            isApproved
                              ? 'Log logistics or sales entry'
                              : 'Requires Admin approval before logging logistics'
                          }
                        >
                          {isApproved ? '+ Log Logistics' : 'Awaiting Approval'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setToolsDrawerDept(unit.department)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                        >
                          Workshop Tools ({snapshot.assets.length + snapshot.items.filter((i) => i.type === 'Consumable').length})
                        </button>
                        {isAdmin && approvalStatus !== 'Approved' && (
                          <button
                            type="button"
                            onClick={() => setReviewingUnit(unit)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                          >
                            Review &amp; Approve
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => void handleExportPdf(unit.department)}
                          className="font-semibold text-slate-600 hover:text-red-600"
                          title="Export department IGA PDF"
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(unit)}
                          className="font-semibold text-sky-700 hover:underline"
                        >
                          {!isAdmin && approvalStatus !== 'Approved' ? 'Edit & Resubmit' : 'Edit'}
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmUnit(unit)}
                            className="min-h-[30px] px-2.5 py-1 rounded-lg border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-700 font-semibold transition-colors inline-flex items-center gap-1"
                            title="Delete IGA unit and linked logistics"
                          >
                            <i className="fas fa-trash-alt text-[11px]"></i>
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* IGA Logistics, Requisitions & Dispatch Ledger */}
      <div className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                IGA Logistics &amp; Dispatch Ledger
              </h2>
              <p className="text-xs text-slate-500">
                Store requisitions automatically deduct Central Store consumable balances atomically.
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums self-start sm:self-auto">
              {filteredLogistics.length} record(s)
            </span>
          </div>

          <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-0.5">
            {(['All', ...LOGISTICS_TYPES] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
                  typeFilter === t
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search description, client, or notes..."
              className="flex-1 rounded-xl border-slate-200 bg-slate-50/70 text-sm py-2.5 px-3.5 focus:bg-white focus:border-sky-600 focus:ring-sky-600"
            />
            {!isHodMode && (
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-xl border-slate-200 bg-slate-50/70 text-sm py-2.5 px-3.5 focus:bg-white focus:border-sky-600 focus:ring-sky-600"
              >
                <option value="All">All Departments</option>
                {allKnownDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Mobile App Transaction Feed (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredLogistics.map((entry) => {
            const isLockedForNonAdmin =
              entry.dispatchStatus === 'Completed' && activeRole !== 'admin';
            return (
              <div key={entry.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-bold text-sky-700">{entry.department}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {entry.dateRecorded}
                      </span>
                    </div>
                    <p className="font-semibold text-sm text-slate-900 mt-0.5 leading-snug">
                      {entry.description}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {entry.entryType} ·{' '}
                      <span className="font-mono tabular-nums">
                        {entry.quantity} {entry.unit}
                      </span>
                      {entry.destinationOrClient ? ` · ${entry.destinationOrClient}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono text-sm font-bold tabular-nums ${
                        entry.direction === 'Inflow'
                          ? 'text-emerald-700'
                          : entry.direction === 'Outflow'
                            ? 'text-red-600'
                            : 'text-slate-700'
                      }`}
                    >
                      {entry.direction === 'Inflow'
                        ? `+${formatKes(entry.totalAmount)}`
                        : entry.direction === 'Outflow'
                          ? `-${formatKes(entry.totalAmount)}`
                          : formatKes(entry.totalAmount)}
                    </p>
                    {entry.inventoryId && (
                      <span className="text-[10px] font-semibold text-sky-700 block">
                        Store Deducted
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <select
                    aria-label={`Mobile dispatch status for ${entry.description}`}
                    disabled={isLockedForNonAdmin}
                    value={entry.dispatchStatus}
                    onChange={(e) =>
                      void updateIGALogisticsStatus(entry.id, {
                        dispatchStatus: e.target.value as IGADispatchStatus,
                      })
                    }
                    className={`min-h-[36px] text-xs font-semibold rounded-xl border py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-70 ${dispatchTone(
                      entry.dispatchStatus,
                    )}`}
                  >
                    {DISPATCH_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {activeRole === 'admin' && (
                    <button
                      type="button"
                      onClick={() => void deleteIGALogistics(entry.id)}
                      className="min-h-[36px] px-3 rounded-xl bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Ledger Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Department / IGA</th>
                <th className="px-4 py-3">Entry Type</th>
                <th className="px-4 py-3">Item / Description</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">KES Value</th>
                <th className="px-4 py-3">Client / Destination</th>
                <th className="px-4 py-3">Dispatch Status</th>
                {activeRole === 'admin' && <th className="px-4 py-3">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogistics.map((entry) => {
                const isLockedForNonAdmin =
                  entry.dispatchStatus === 'Completed' && activeRole !== 'admin';
                return (
                  <tr key={entry.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap tabular-nums">
                      {entry.dateRecorded}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 text-xs">{entry.department}</p>
                      <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                        {entry.igaName}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-slate-800">
                      {entry.entryType}
                      {entry.inventoryId && (
                        <span className="block text-[10px] text-sky-700 font-semibold">
                          Store Stock Deducted
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-900 font-medium text-xs">{entry.description}</p>
                      {entry.notes && (
                        <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                          {entry.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap tabular-nums">
                      {entry.quantity} {entry.unit}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono text-xs font-semibold whitespace-nowrap tabular-nums ${
                        entry.direction === 'Inflow'
                          ? 'text-emerald-700'
                          : entry.direction === 'Outflow'
                            ? 'text-red-600'
                            : 'text-slate-700'
                      }`}
                    >
                      {entry.direction === 'Inflow'
                        ? `+${formatKes(entry.totalAmount)}`
                        : entry.direction === 'Outflow'
                          ? `-${formatKes(entry.totalAmount)}`
                          : formatKes(entry.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {entry.destinationOrClient || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <select
                        aria-label={`Dispatch status for ${entry.description}`}
                        disabled={isLockedForNonAdmin}
                        value={entry.dispatchStatus}
                        onChange={(e) =>
                          void updateIGALogisticsStatus(entry.id, {
                            dispatchStatus: e.target.value as IGADispatchStatus,
                          })
                        }
                        className={`text-xs font-semibold rounded-lg border py-1 px-2 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-70 ${dispatchTone(
                          entry.dispatchStatus,
                        )}`}
                      >
                        {DISPATCH_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    {activeRole === 'admin' && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => void deleteIGALogistics(entry.id)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredLogistics.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            No IGA logistics entries match your current filter. Click{' '}
            <strong>Log Logistics Entry</strong> to record a store requisition, direct purchase,
            production batch, revenue sale, or dispatch.
          </div>
        )}
      </div>

      {/* Modal: Register / Edit Departmental IGA */}
      {unitModalOpen && (
        <IGAUnitModal
          editingUnit={editingUnit}
          prefillDepartment={prefillDepartment}
          lockedDepartment={isHodMode ? normalizedHodDept : undefined}
          departmentSuggestions={allKnownDepartments}
          isAdmin={isAdmin}
          onClose={() => {
            setUnitModalOpen(false);
            setEditingUnit(null);
            setPrefillDepartment('');
          }}
          onSave={async (payload) => {
            if (editingUnit) {
              await updateIGAUnit({ ...editingUnit, ...payload });
              setUnitModalOpen(false);
              setEditingUnit(null);
              return true;
            }
            const ok = await addIGAUnit(payload);
            if (ok) {
              setUnitModalOpen(false);
              setPrefillDepartment('');
            }
            return ok;
          }}
        />
      )}

      {/* Modal: Admin Review & Approve/Reject HOD IGA Proposal */}
      {reviewingUnit && (
        <IGAReviewModal
          unit={reviewingUnit}
          onClose={() => setReviewingUnit(null)}
          onPreviewProposal={(fileName, dataUrl) =>
            setPreviewProposalUnit({
              title: reviewingUnit.igaName,
              fileName,
              dataUrl,
            })
          }
          onDecision={async (decision, notes) => {
            const ok = await reviewIGAUnit(reviewingUnit.id, decision, notes);
            if (ok) setReviewingUnit(null);
            return ok;
          }}
        />
      )}

      {/* Modal: Confirm Delete IGA Unit */}
      {isAdmin && deleteConfirmUnit && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => {
            if (!deletingUnit) setDeleteConfirmUnit(null);
          }}
        >
          <div
            className="bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto -mt-1" aria-hidden="true" />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
                <i className="fas fa-triangle-exclamation"></i>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">
                  Admin Deletion Confirmation
                </p>
                <h3 className="font-display text-lg font-bold text-slate-900 leading-snug">
                  Delete Departmental IGA?
                </h3>
              </div>
              <button
                type="button"
                disabled={deletingUnit}
                onClick={() => setDeleteConfirmUnit(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            {(() => {
              const linkedCount = igaLogistics.filter(
                (l) => l.igaId === deleteConfirmUnit.id,
              ).length;
              return (
                <div className="space-y-3 text-xs sm:text-sm text-slate-600">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1">
                    <p className="font-bold text-slate-900">{deleteConfirmUnit.igaName}</p>
                    <p className="text-xs text-slate-600">
                      Department: <strong className="text-slate-800">{deleteConfirmUnit.department}</strong> ·
                      Status:{' '}
                      <strong className="text-slate-800">
                        {deleteConfirmUnit.approvalStatus || 'Approved'}
                      </strong>
                    </p>
                  </div>
                  <p>
                    This permanently removes the IGA unit record
                    {linkedCount > 0 ? (
                      <>
                        {' '}
                        along with{' '}
                        <strong className="text-red-700">
                          {linkedCount} linked logistics record{linkedCount === 1 ? '' : 's'}
                        </strong>
                        . Central Store stock balances from previous requisitions will remain unchanged.
                      </>
                    ) : (
                      '.'
                    )}
                  </p>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingUnit}
                onClick={() => setDeleteConfirmUnit(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingUnit}
                onClick={async () => {
                  setDeletingUnit(true);
                  try {
                    const ok = await deleteIGAUnit(deleteConfirmUnit.id);
                    if (ok) setDeleteConfirmUnit(null);
                  } finally {
                    setDeletingUnit(false);
                  }
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <i className="fas fa-trash-alt text-xs"></i>
                <span>{deletingUnit ? 'Deleting...' : 'Delete IGA Unit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Preview Uploaded Proposal Attachment */}
      {previewProposalUnit && (
        <div
          className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px] z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPreviewProposalUnit(null)}
        >
          <div
            className="bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-5 sm:p-6 max-h-[92vh] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
                  IGA Proposal Attachment
                </p>
                <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
                  {previewProposalUnit.title} — {previewProposalUnit.fileName}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewProposalUnit.dataUrl}
                  download={previewProposalUnit.fileName}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
                >
                  <i className="fas fa-download mr-1.5"></i>Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewProposalUnit(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                >
                  <i className="fas fa-times text-sm"></i>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-[320px] max-h-[68vh] overflow-auto rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center p-2">
              {previewProposalUnit.dataUrl.startsWith('data:image/') ? (
                <img
                  src={previewProposalUnit.dataUrl}
                  alt={previewProposalUnit.fileName}
                  className="max-w-full max-h-[64vh] object-contain rounded-lg"
                />
              ) : (
                <iframe
                  title={previewProposalUnit.fileName}
                  src={previewProposalUnit.dataUrl}
                  className="w-full h-[64vh] rounded-lg bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Log IGA Logistics / Requisition / Dispatch */}
      {logisticsModalOpen && (
        <IGALogisticsModal
          igaUnits={approvedScopedUnits}
          consumables={inventory.filter(
            (i) =>
              i.type === 'Consumable' &&
              i.quantity > 0 &&
              (!isHodMode ||
                (i.department || '').trim().toLowerCase() === normalizedHodDept.toLowerCase()),
          )}
          preselectedUnitId={preselectedUnitId}
          onClose={() => setLogisticsModalOpen(false)}
          onSubmit={async (payload) => {
            const ok = await addIGALogistics(payload);
            if (ok) setLogisticsModalOpen(false);
            return ok;
          }}
        />
      )}

      {/* Modal: Department Assigned Workshop Tools & IGA Stock */}
      {toolsDrawerDept && (
        <div
          className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setToolsDrawerDept(null)}
        >
          <div
            className="bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 max-h-[88vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto -mt-1" aria-hidden="true" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Central Store Alignment
                </p>
                <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                  {toolsDrawerDept} — Assigned Tools &amp; Materials
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setToolsDrawerDept(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            {(() => {
              const snap = getDeptStoreSnapshot(toolsDrawerDept);
              if (snap.items.length === 0) {
                return (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No Central Store items currently list <strong>{toolsDrawerDept}</strong> as their
                    department. You can still assign a department to any item from the Inventory tab.
                  </p>
                );
              }
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-xs text-slate-500 block">Consumable Qty</span>
                      <span className="font-display text-lg font-bold text-slate-900 tabular-nums">
                        {snap.consumablesQty}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-xs text-slate-500 block">Assets In Store</span>
                      <span className="font-display text-lg font-bold text-emerald-700 tabular-nums">
                        {snap.inStockAssets}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-xs text-slate-500 block">Assets Issued Out</span>
                      <span className="font-display text-lg font-bold text-sky-700 tabular-nums">
                        {snap.issuedAssets}
                      </span>
                    </div>
                  </div>

                  <table className="w-full text-xs text-left text-slate-600 border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 text-slate-700 uppercase">
                      <tr>
                        <th className="px-3 py-2">Catalog Item</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">IGA Tagged</th>
                        <th className="px-3 py-2 text-right">Stock / Serials</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {snap.items.map((it) => {
                        const itAssets = snap.assets.filter((a) => a.inventoryId === it.id);
                        return (
                          <tr key={it.id}>
                            <td className="px-3 py-2 font-semibold text-slate-900">{it.name}</td>
                            <td className="px-3 py-2">{it.type}</td>
                            <td className="px-3 py-2">{it.isIGA ? 'Yes' : 'No'}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {it.type === 'Consumable'
                                ? `${it.quantity} ${it.unit}`
                                : `${itAssets.length} unit(s)`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {snap.assets.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-2">
                        Individual Serialized Equipment
                      </h4>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                        {snap.assets.map((asset) => {
                          const holder = recipients.find((r) => r.id === asset.currentHolderId);
                          return (
                            <div
                              key={asset.id}
                              className="px-3 py-2 flex items-center justify-between text-xs"
                            >
                              <span className="font-mono font-semibold text-slate-900">
                                {asset.serialNumber}
                              </span>
                              <span className="text-slate-600">
                                {asset.condition} ·{' '}
                                <strong
                                  className={
                                    asset.status === 'Issued'
                                      ? 'text-sky-700'
                                      : asset.status === 'Disposed'
                                        ? 'text-red-600'
                                        : 'text-emerald-700'
                                  }
                                >
                                  {asset.status}
                                </strong>
                                {holder ? ` (${holder.name})` : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

const IGAUnitModal: React.FC<{
  editingUnit: DepartmentalIGA | null;
  prefillDepartment: string;
  lockedDepartment?: string;
  departmentSuggestions: string[];
  isAdmin: boolean;
  onClose: () => void;
  onSave: (payload: {
    department: string;
    igaName: string;
    activityType: IGAActivityType;
    leadTrainer: string;
    status: IGAUnitStatus;
    description: string;
    proposalFileName: string;
    proposalDataUrl: string;
    proposalLink: string;
    proposalSummary: string;
  }) => Promise<boolean>;
}> = ({
  editingUnit,
  prefillDepartment,
  lockedDepartment,
  departmentSuggestions,
  isAdmin,
  onClose,
  onSave,
}) => {
  const initialDept = lockedDepartment || editingUnit?.department || prefillDepartment || '';
  const isResubmittingNonApproved =
    !isAdmin &&
    Boolean(editingUnit) &&
    (editingUnit?.approvalStatus || 'Approved') !== 'Approved';
  const [department, setDepartment] = useState(initialDept);
  const [igaName, setIgaName] = useState(
    editingUnit?.igaName || (initialDept ? `${initialDept} Departmental IGA Unit` : ''),
  );
  const [activityType, setActivityType] = useState<IGAActivityType>(
    editingUnit?.activityType ||
      (initialDept ? defaultActivityTypeForDepartment(initialDept) : 'Manufacturing'),
  );
  const [leadTrainer, setLeadTrainer] = useState(editingUnit?.leadTrainer || '');
  const [status, setStatus] = useState<IGAUnitStatus>(
    editingUnit?.status || (isAdmin ? 'Active' : 'Planned'),
  );
  const [description, setDescription] = useState(editingUnit?.description || '');
  const [proposalMode, setProposalMode] = useState<'drive' | 'upload'>(
    editingUnit?.proposalDataUrl && !editingUnit?.proposalLink ? 'upload' : 'drive',
  );
  const [proposalFileName, setProposalFileName] = useState(editingUnit?.proposalFileName || '');
  const [proposalDataUrl, setProposalDataUrl] = useState(editingUnit?.proposalDataUrl || '');
  const [proposalLink, setProposalLink] = useState(editingUnit?.proposalLink || '');
  const [proposalSummary, setProposalSummary] = useState(editingUnit?.proposalSummary || '');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const proposalRequired = !isAdmin && (!editingUnit || isResubmittingNonApproved);

  const handleProposalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError('');
    setUploadingFile(true);
    try {
      const result = await readProposalFileToDataUrl(file);
      setProposalFileName(result.fileName);
      setProposalDataUrl(result.dataUrl);
      setProposalLink('');
    } catch (err: any) {
      setFormError(err?.message || 'Could not attach proposal document.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    let cleanLink = '';
    let finalFileName = proposalFileName.trim();
    let finalDataUrl = proposalDataUrl;

    if (proposalMode === 'drive') {
      const trimmedLink = proposalLink.trim();
      if (trimmedLink) {
        cleanLink = safeHttpsUrl(trimmedLink);
        if (!cleanLink) {
          setFormError(
            'Please paste a valid https:// Google Drive or Google Docs share link (starting with https://).',
          );
          return;
        }
        finalDataUrl = '';
        if (!finalFileName) {
          finalFileName = 'Google Drive Proposal Document';
        }
      } else if (proposalRequired) {
        setFormError(
          'Please paste your Google Drive proposal link (or switch to file upload) before submitting for Admin approval.',
        );
        return;
      } else {
        finalDataUrl = '';
      }
    } else {
      cleanLink = '';
      if (proposalRequired && (!finalFileName || !finalDataUrl)) {
        setFormError(
          'Please attach a Google Drive link or upload a proposal document (PDF or image) before submitting for Admin approval.',
        );
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        department: lockedDepartment || department,
        igaName,
        activityType,
        leadTrainer,
        status: !isAdmin && (!editingUnit || isResubmittingNonApproved) ? 'Planned' : status,
        description,
        proposalFileName: finalFileName,
        proposalDataUrl: finalDataUrl,
        proposalLink: cleanLink,
        proposalSummary,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" aria-hidden="true" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
            {editingUnit
              ? isResubmittingNonApproved
                ? 'Revise & Resubmit IGA Proposal'
                : 'Edit Departmental IGA'
              : isAdmin
                ? 'Register Departmental IGA'
                : 'Submit Departmental IGA Proposal'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isAdmin && (!editingUnit || isResubmittingNonApproved) && (
            <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-xs text-sky-900 flex items-start gap-2.5">
              <i className="fas fa-circle-info text-sky-600 mt-0.5 shrink-0"></i>
              <span>
                Your IGA submission requires an uploaded proposal document and enters{' '}
                <strong>Pending Admin Approval</strong> until reviewed by the Store Administrator.
              </span>
            </div>
          )}

          {formError && (
            <p className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg text-xs">
              {formError}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
            <input
              type="text"
              list="tvet-dept-list"
              maxLength={VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH}
              value={lockedDepartment || department}
              disabled={Boolean(lockedDepartment) || (!isAdmin && Boolean(editingUnit))}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Welding, Tailoring, Building & Construction"
              className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600 disabled:bg-slate-100 disabled:text-slate-600"
              required
            />
            {lockedDepartment && (
              <p className="text-[11px] text-slate-500 mt-1">
                Scoped to your assigned HOD department ({lockedDepartment}).
              </p>
            )}
            <datalist id="tvet-dept-list">
              {departmentSuggestions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              IGA Unit / Enterprise Name
            </label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
              value={igaName}
              onChange={(e) => setIgaName(e.target.value)}
              placeholder="e.g. Metal Fabrication & Steel Furniture Unit"
              className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Activity Category
              </label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as IGAActivityType)}
                className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Operational Status
              </label>
              <select
                value={!isAdmin && (!editingUnit || isResubmittingNonApproved) ? 'Planned' : status}
                disabled={!isAdmin && (!editingUnit || isResubmittingNonApproved)}
                onChange={(e) => setStatus(e.target.value as IGAUnitStatus)}
                className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600 disabled:bg-slate-100 disabled:text-slate-600"
              >
                {UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lead Trainer / Coordinator
            </label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
              value={leadTrainer}
              onChange={(e) => setLeadTrainer(e.target.value)}
              placeholder="e.g. Mr. John Doe / Workshop HOD"
              className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Products &amp; Services Summary
            </label>
            <textarea
              rows={2}
              maxLength={VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe goods produced or services offered..."
              className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
            />
          </div>

          {/* Proposal Attachment: Google Drive Link (Recommended) or File Upload */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-bold text-slate-800">
                IGA Proposal Document {proposalRequired ? '(Required for Approval)' : '(Optional)'}
              </label>
              <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setProposalMode('drive')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    proposalMode === 'drive'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <i className="fas fa-link mr-1"></i>Google Drive Link
                </button>
                <button
                  type="button"
                  onClick={() => setProposalMode('upload')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    proposalMode === 'upload'
                      ? 'bg-white text-sky-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <i className="fas fa-file-arrow-up mr-1"></i>Upload PDF (&le;250KB)
                </button>
              </div>
            </div>

            {proposalMode === 'drive' ? (
              <div className="space-y-2.5">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-900 flex items-start gap-2">
                  <i className="fas fa-cloud text-emerald-600 mt-0.5 shrink-0"></i>
                  <span>
                    <strong>Recommended (Saves Database Space):</strong> Upload your proposal PDF or
                    Google Doc to Google Drive, set sharing to{' '}
                    <em>&ldquo;Anyone with the link can view&rdquo;</em>, and paste the link here.
                  </span>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Google Drive / Google Docs Share URL
                  </label>
                  <input
                    type="url"
                    maxLength={VALIDATION_LIMITS.MAX_PROPOSAL_LINK_LENGTH}
                    value={proposalLink}
                    onChange={(e) => setProposalLink(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                    className="w-full rounded-lg border-slate-300 bg-white text-xs sm:text-sm focus:border-sky-600 focus:ring-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Document Title / Label (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={VALIDATION_LIMITS.MAX_PROPOSAL_FILE_NAME_LENGTH}
                    value={proposalFileName}
                    onChange={(e) => setProposalFileName(e.target.value)}
                    placeholder="e.g., Welding Workshop IGA Proposal 2026"
                    className="w-full rounded-lg border-slate-300 bg-white text-xs sm:text-sm focus:border-sky-600 focus:ring-sky-600"
                  />
                </div>
              </div>
            ) : proposalFileName && proposalDataUrl ? (
              <div className="flex items-center justify-between gap-2 bg-white border border-sky-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <i className="fas fa-file-check text-emerald-600 shrink-0"></i>
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {proposalFileName}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 text-xs">
                  <a
                    href={proposalDataUrl}
                    download={proposalFileName}
                    className="font-semibold text-sky-700 hover:underline"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setProposalFileName('');
                      setProposalDataUrl('');
                    }}
                    className="font-semibold text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1.5 border border-dashed border-slate-300 rounded-xl bg-white hover:bg-sky-50/40 px-4 py-4 cursor-pointer transition-colors text-center">
                <i
                  className={`fas ${
                    uploadingFile ? 'fa-spinner fa-spin text-sky-600' : 'fa-cloud-arrow-up text-sky-600'
                  } text-lg`}
                ></i>
                <span className="text-xs font-semibold text-slate-700">
                  {uploadingFile ? 'Processing attachment...' : 'Click to upload small PDF or Scan'}
                </span>
                <span className="text-[11px] text-slate-500">
                  For larger files, use the Google Drive Link option above to preserve 1 GB storage
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => void handleProposalFileChange(e)}
                  className="sr-only"
                />
              </label>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Proposal Justification &amp; Target Revenue Notes
              </label>
              <textarea
                rows={2}
                maxLength={VALIDATION_LIMITS.MAX_PROPOSAL_SUMMARY_LENGTH}
                value={proposalSummary}
                onChange={(e) => setProposalSummary(e.target.value)}
                placeholder="Summarize startup capital, workshop resources required, and projected KES returns..."
                className="w-full rounded-lg border-slate-300 bg-white text-sm focus:border-sky-600 focus:ring-sky-600"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingFile}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white text-xs font-semibold disabled:opacity-60"
            >
              {saving
                ? 'Saving...'
                : editingUnit
                  ? isResubmittingNonApproved
                    ? 'Resubmit for Approval'
                    : 'Update IGA Unit'
                  : isAdmin
                    ? 'Register & Approve IGA'
                    : 'Submit Proposal for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const IGAReviewModal: React.FC<{
  unit: DepartmentalIGA;
  onClose: () => void;
  onPreviewProposal: (fileName: string, dataUrl: string) => void;
  onDecision: (decision: Exclude<IGAApprovalStatus, 'Pending'>, notes: string) => Promise<boolean>;
}> = ({ unit, onClose, onPreviewProposal, onDecision }) => {
  const [notes, setNotes] = useState(unit.approvalNotes || '');
  const [submitting, setSubmitting] = useState(false);

  const handleAction = async (decision: Exclude<IGAApprovalStatus, 'Pending'>) => {
    setSubmitting(true);
    try {
      await onDecision(decision, notes);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 max-h-[90vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto -mt-1" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
              Admin IGA Approval Desk · {unit.department}
            </p>
            <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">{unit.igaName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2 text-xs">
          <p className="text-slate-600">
            <strong className="text-slate-800">Category:</strong> {unit.activityType} ·{' '}
            <strong className="text-slate-800">Lead:</strong> {unit.leadTrainer || 'Unassigned'}
          </p>
          {unit.description && (
            <p className="text-slate-600">
              <strong className="text-slate-800">Scope:</strong> {unit.description}
            </p>
          )}
          {unit.proposalSummary && (
            <p className="text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200/80">
              <strong className="block text-slate-900 mb-0.5">Proposal Summary:</strong>
              {unit.proposalSummary}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-sky-950">
              {safeHttpsUrl(unit.proposalLink)
                ? 'Google Drive Proposal Link'
                : 'Uploaded Proposal Document'}
            </p>
            <p className="text-[11px] text-sky-800 truncate">
              {unit.proposalFileName ||
                safeHttpsUrl(unit.proposalLink) ||
                'No proposal document attached'}
            </p>
          </div>
          {safeHttpsUrl(unit.proposalLink) ? (
            <a
              href={safeHttpsUrl(unit.proposalLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
            >
              <span>Open in Drive</span>
              <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
            </a>
          ) : unit.proposalDataUrl ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onPreviewProposal(unit.proposalFileName || 'iga-proposal', unit.proposalDataUrl)
                }
                className="px-3 py-1.5 rounded-lg bg-white border border-sky-300 text-sky-800 text-xs font-semibold hover:bg-sky-100"
              >
                View
              </button>
              <a
                href={unit.proposalDataUrl}
                download={unit.proposalFileName || `${unit.department}_Proposal`}
                className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold"
              >
                Download
              </a>
            </div>
          ) : (
            <span className="text-[11px] font-semibold text-amber-700">Missing Attachment</span>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Admin Review Remarks (Optional)
          </label>
          <textarea
            rows={2}
            maxLength={VALIDATION_LIMITS.MAX_APPROVAL_NOTES_LENGTH}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add approval guidance or reason for rejection..."
            className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleAction('Rejected')}
            className="px-4 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold disabled:opacity-60"
          >
            Reject Proposal
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleAction('Approved')}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Approve & Activate IGA'}
          </button>
        </div>
      </div>
    </div>
  );
};

const IGALogisticsModal: React.FC<{
  igaUnits: DepartmentalIGA[];
  consumables: Array<{ id: string; name: string; unit: string; quantity: number; department: string }>;
  preselectedUnitId: string;
  onClose: () => void;
  onSubmit: (entry: {
    igaId: string;
    entryType: IGALogisticsType;
    inventoryId?: string;
    description: string;
    quantity: number;
    unit: string;
    unitAmount: number;
    direction?: IGADirection;
    dispatchStatus: IGADispatchStatus;
    destinationOrClient: string;
    dateRecorded: string;
    notes: string;
  }) => Promise<boolean>;
}> = ({ igaUnits, consumables, preselectedUnitId, onClose, onSubmit }) => {
  const [igaId, setIgaId] = useState(preselectedUnitId || igaUnits[0]?.id || '');
  const [entryType, setEntryType] = useState<IGALogisticsType>('Store Requisition');
  const [inventoryId, setInventoryId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [unit, setUnit] = useState('Pcs');
  const [unitAmount, setUnitAmount] = useState<number | string>(0);
  const [direction, setDirection] = useState<IGADirection>('Outflow');
  const [dispatchStatus, setDispatchStatus] = useState<IGADispatchStatus>('Logged');
  const [destinationOrClient, setDestinationOrClient] = useState('');
  const [dateRecorded, setDateRecorded] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedConsumable = useMemo(
    () => consumables.find((c) => c.id === inventoryId) || null,
    [consumables, inventoryId],
  );

  const handleEntryTypeChange = (nextType: IGALogisticsType) => {
    setEntryType(nextType);
    setDirection(defaultDirectionForType(nextType));
    if (nextType !== 'Store Requisition') {
      setInventoryId('');
    }
  };

  const handleConsumableSelect = (id: string) => {
    setInventoryId(id);
    const found = consumables.find((c) => c.id === id);
    if (found) {
      setDescription(found.name);
      setUnit(found.unit || 'Pcs');
    }
  };

  const qtyNum = Math.max(1, Math.floor(Number(quantity) || 1));
  const unitAmtNum = Math.max(0, Math.round(Number(unitAmount) || 0));
  const computedTotal = qtyNum * unitAmtNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!igaId) {
      setError('Please select a Departmental IGA.');
      return;
    }
    if (entryType === 'Store Requisition' && selectedConsumable && selectedConsumable.quantity < qtyNum) {
      setError(
        `Requested ${qtyNum} ${selectedConsumable.unit} exceeds available Central Store stock (${selectedConsumable.quantity}).`,
      );
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        igaId,
        entryType,
        inventoryId: entryType === 'Store Requisition' ? inventoryId : '',
        description,
        quantity: qtyNum,
        unit,
        unitAmount: unitAmtNum,
        direction,
        dispatchStatus,
        destinationOrClient,
        dateRecorded,
        notes,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" aria-hidden="true" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
            Log IGA Logistics Entry
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg text-xs">{error}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Departmental IGA Unit
              </label>
              <select
                value={igaId}
                onChange={(e) => setIgaId(e.target.value)}
                className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
                required
              >
                {igaUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.department} — {u.igaName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Logistics Entry Type
              </label>
              <select
                value={entryType}
                onChange={(e) => handleEntryTypeChange(e.target.value as IGALogisticsType)}
                className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
              >
                {LOGISTICS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {entryType === 'Store Requisition' && (
            <div className="p-3.5 rounded-lg bg-sky-50 border border-sky-200 space-y-2">
              <label className="block text-xs font-semibold text-sky-900">
                Link Central Store Consumable (Auto-deducts stock)
              </label>
              <select
                value={inventoryId}
                onChange={(e) => handleConsumableSelect(e.target.value)}
                className="w-full rounded-lg border-sky-300 bg-white text-sm focus:border-sky-600 focus:ring-sky-600"
              >
                <option value="">-- Optional: Manual material entry (no store deduction) --</option>
                {consumables.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.quantity} {c.unit} in stock{c.department ? ` · ${c.department}` : ''})
                  </option>
                ))}
              </select>
              {selectedConsumable && (
                <p className="text-[11px] text-sky-800">
                  Available balance: <strong className="font-mono">{selectedConsumable.quantity} {selectedConsumable.unit}</strong>. Saving deducts{' '}
                  <strong className="font-mono">{qtyNum}</strong> atomically.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Material / Output / Revenue Description
            </label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_DISPOSAL_ITEM_NAME_LENGTH}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 25 Blue Twill Lab Coats or Welding Rods (4mm)"
              className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
              required
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                max={selectedConsumable ? selectedConsumable.quantity : undefined}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border-slate-300 text-sm font-mono tabular-nums focus:border-sky-600 focus:ring-sky-600"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unit</label>
              <input
                type="text"
                maxLength={VALIDATION_LIMITS.MAX_UNIT_LENGTH}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit KES
              </label>
              <input
                type="number"
                min={0}
                value={unitAmount}
                onChange={(e) => setUnitAmount(e.target.value)}
                className="w-full rounded-lg border-slate-300 text-sm font-mono tabular-nums focus:border-sky-600 focus:ring-sky-600"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Total KES</label>
              <div className="h-[38px] px-3 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-end font-mono text-sm font-bold text-slate-900 tabular-nums">
                {computedTotal.toLocaleString('en-KE')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cash Impact</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as IGADirection)}
                className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
              >
                <option value="Inflow">Inflow (+Revenue)</option>
                <option value="Outflow">Outflow (-Cost)</option>
                <option value="Internal">Internal (Non-cash)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dispatch Status
              </label>
              <select
                value={dispatchStatus}
                onChange={(e) => setDispatchStatus(e.target.value as IGADispatchStatus)}
                className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
              >
                {DISPATCH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={dateRecorded}
                onChange={(e) => setDateRecorded(e.target.value)}
                className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Client / Supplier / Delivery Destination
            </label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
              value={destinationOrClient}
              onChange={(e) => setDestinationOrClient(e.target.value)}
              placeholder="e.g. Baringo Secondary School, Workshop Store, Ravine Hardware"
              className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <textarea
              rows={2}
              maxLength={VALIDATION_LIMITS.MAX_NOTES_LENGTH}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Receipt number, delivery vehicle, or workshop batch notes..."
              className="w-full rounded-lg border-slate-300 text-sm focus:border-sky-600 focus:ring-sky-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white text-xs font-semibold disabled:opacity-60"
            >
              {saving ? 'Recording...' : 'Save Logistics Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
