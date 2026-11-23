import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  BudgetCategory,
  BudgetLineItem,
  BudgetStatus,
  DepartmentBudget,
  VALIDATION_LIMITS,
} from '../types';
import {
  downloadDepartmentBudgetExcel,
  generateConsolidatedBudgetPdf,
  generateDepartmentBudgetPdf,
} from '../utils/budgetReports';
import { formatKes } from '../utils/igaReports';
import { STANDARD_TVET_DEPARTMENTS } from '../utils/sampleData';

const BUDGET_CATEGORIES: BudgetCategory[] = [
  'Consumables & Training Materials',
  'Tools & Workshop Equipment',
  'Machinery & Capital Assets',
  'IGA Working Capital',
  'Maintenance & Repairs',
  'Other',
];

const DEFAULT_FY_OPTIONS = ['2025/2026', '2026/2027', '2027/2028', '2028/2029'];

const UNIT_SUGGESTIONS = ['Pcs', 'Sets', 'Boxes', 'Reams', 'Kg', 'Ltrs', 'Metres', 'Packs', 'Units'];

function createEmptyLineItem(): BudgetLineItem {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: 'Consumables & Training Materials',
    itemName: '',
    unit: 'Pcs',
    quantity: 1,
    estimatedUnitCost: 0,
    totalCost: 0,
    justification: '',
  };
}

function statusMeta(status: BudgetStatus): {
  label: string;
  dotClass: string;
  badgeClass: string;
} {
  switch (status) {
    case 'Approved':
      return {
        label: 'Approved',
        dotClass: 'bg-emerald-600',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'Reviewed':
      return {
        label: 'Reviewed',
        dotClass: 'bg-sky-600',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    case 'Submitted':
      return {
        label: 'Submitted',
        dotClass: 'bg-amber-500',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'Returned':
      return {
        label: 'Returned for Revision',
        dotClass: 'bg-red-600',
        badgeClass: 'bg-red-50 text-red-800 border-red-200',
      };
    case 'Draft':
    default:
      return {
        label: 'Draft',
        dotClass: 'bg-slate-400',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
}

export const BudgetsPage: React.FC = () => {
  const {
    departmentBudgets,
    activeRole,
    activeDepartment,
    saveDepartmentBudget,
    submitDepartmentBudget,
    reviewDepartmentBudget,
    deleteDepartmentBudget,
    showToast,
  } = useAppContext();

  const isHodMode = activeRole === 'hod' && Boolean(activeDepartment);
  const isAdmin = activeRole === 'admin';
  const canReview = activeRole === 'admin' || activeRole === 'officer';

  const [searchQuery, setSearchQuery] = useState('');
  const [fyFilter, setFyFilter] = useState<string>('All');
  const [deptFilter, setDeptFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportingConsolidated, setExportingConsolidated] = useState(false);

  // Budget Editor Modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | undefined>(undefined);
  const [formDept, setFormDept] = useState<string>(STANDARD_TVET_DEPARTMENTS[0]);
  const [formFy, setFormFy] = useState<string>('2026/2027');
  const [customFy, setCustomFy] = useState<string>('');
  const [useCustomFy, setUseCustomFy] = useState(false);
  const [formTitle, setFormTitle] = useState<string>('');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [formNotes, setFormNotes] = useState<string>('');
  const [formItems, setFormItems] = useState<BudgetLineItem[]>([createEmptyLineItem()]);
  const [savingBudget, setSavingBudget] = useState(false);

  // Review Modal state
  const [reviewTarget, setReviewTarget] = useState<DepartmentBudget | null>(null);
  const [reviewDecision, setReviewDecision] = useState<Exclude<BudgetStatus, 'Draft' | 'Submitted'>>('Reviewed');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Delete Confirmation Modal state
  const [deleteTarget, setDeleteTarget] = useState<DepartmentBudget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const financialYearOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_FY_OPTIONS);
    departmentBudgets.forEach((b) => {
      if (b.financialYear) set.add(b.financialYear.trim());
    });
    return Array.from(set).sort();
  }, [departmentBudgets]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>(STANDARD_TVET_DEPARTMENTS);
    departmentBudgets.forEach((b) => {
      if (b.department) set.add(b.department.trim());
    });
    return Array.from(set).sort();
  }, [departmentBudgets]);

  const filteredBudgets = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return [...departmentBudgets]
      .filter((b) => {
        if (fyFilter !== 'All' && b.financialYear.trim() !== fyFilter) return false;
        if (!isHodMode && deptFilter !== 'All' && b.department.trim() !== deptFilter) return false;
        if (statusFilter !== 'All' && b.status !== statusFilter) return false;
        if (!term) return true;
        return (
          b.title.toLowerCase().includes(term) ||
          b.department.toLowerCase().includes(term) ||
          b.financialYear.toLowerCase().includes(term) ||
          b.submittedByName.toLowerCase().includes(term) ||
          b.lineItems.some(
            (li) =>
              li.itemName.toLowerCase().includes(term) ||
              li.category.toLowerCase().includes(term),
          )
        );
      })
      .sort((a, b) => {
        const order: Record<BudgetStatus, number> = {
          Submitted: 0,
          Returned: 1,
          Reviewed: 2,
          Draft: 3,
          Approved: 4,
        };
        const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        if (diff !== 0) return diff;
        return b.financialYear.localeCompare(a.financialYear);
      });
  }, [departmentBudgets, fyFilter, deptFilter, statusFilter, searchQuery, isHodMode]);

  const stats = useMemo(() => {
    const pendingCount = isHodMode
      ? filteredBudgets.filter((b) => b.status === 'Draft' || b.status === 'Returned').length
      : filteredBudgets.filter((b) => b.status === 'Submitted').length;
    const approvedTotal = filteredBudgets
      .filter((b) => b.status === 'Approved')
      .reduce((s, b) => s + (b.totalAmount || 0), 0);
    const requestedTotal = filteredBudgets.reduce((s, b) => s + (b.totalAmount || 0), 0);
    return {
      totalCount: filteredBudgets.length,
      pendingCount,
      approvedTotal,
      requestedTotal,
    };
  }, [filteredBudgets, isHodMode]);

  const openNewBudgetModal = () => {
    const dept = isHodMode ? activeDepartment : STANDARD_TVET_DEPARTMENTS[0];
    const defaultFy = '2026/2027';
    setEditingBudgetId(undefined);
    setFormDept(dept);
    setFormFy(defaultFy);
    setCustomFy('');
    setUseCustomFy(false);
    setFormTitle(`${dept} FY ${defaultFy} Procurement Budget`);
    setTitleManuallyEdited(false);
    setFormNotes('');
    setFormItems([createEmptyLineItem()]);
    setEditorOpen(true);
  };

  const openEditBudgetModal = (budget: DepartmentBudget) => {
    const isPreset = DEFAULT_FY_OPTIONS.includes(budget.financialYear);
    setEditingBudgetId(budget.id);
    setFormDept(budget.department);
    setFormFy(isPreset ? budget.financialYear : DEFAULT_FY_OPTIONS[1]);
    setCustomFy(isPreset ? '' : budget.financialYear);
    setUseCustomFy(!isPreset);
    setFormTitle(budget.title);
    setTitleManuallyEdited(true);
    setFormNotes(budget.notes || '');
    setFormItems(
      budget.lineItems.length > 0
        ? budget.lineItems.map((li) => ({ ...li }))
        : [createEmptyLineItem()],
    );
    setEditorOpen(true);
  };

  const resolvedEditorFy = (useCustomFy ? customFy : formFy).trim();
  const resolvedEditorDept = isHodMode ? activeDepartment : formDept;

  const syncDefaultTitle = (nextDept: string, nextFy: string) => {
    if (!titleManuallyEdited) {
      setFormTitle(`${nextDept} FY ${nextFy || '2026/2027'} Procurement Budget`);
    }
  };

  const updateLineItem = (index: number, patch: Partial<BudgetLineItem>) => {
    setFormItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        const merged = { ...row, ...patch };
        const qty = Math.max(1, Math.floor(Number(merged.quantity) || 1));
        const unitCost = Math.max(0, Math.round(Number(merged.estimatedUnitCost) || 0));
        return {
          ...merged,
          quantity: qty,
          estimatedUnitCost: unitCost,
          totalCost: qty * unitCost,
        };
      }),
    );
  };

  const removeLineItem = (index: number) => {
    setFormItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const editorGrandTotal = useMemo(
    () => formItems.reduce((sum, item) => sum + (item.totalCost || 0), 0),
    [formItems],
  );

  const handleSaveBudget = async (submitNow: boolean) => {
    if (savingBudget) return;
    const validItems = formItems.filter((i) => i.itemName.trim().length > 0);
    if (validItems.length === 0) {
      showToast('Please enter at least one item name in the budget schedule.', 'error');
      return;
    }
    if (resolvedEditorFy.length < 4) {
      showToast('Enter a valid Financial Year (e.g. 2026/2027).', 'error');
      return;
    }
    setSavingBudget(true);
    try {
      const ok = await saveDepartmentBudget({
        id: editingBudgetId,
        department: resolvedEditorDept,
        financialYear: resolvedEditorFy,
        title: formTitle,
        lineItems: validItems,
        notes: formNotes,
        submitNow,
      });
      if (ok) {
        setEditorOpen(false);
      }
    } finally {
      setSavingBudget(false);
    }
  };

  const handleDownloadPdf = async (budget: DepartmentBudget) => {
    setExportingId(budget.id);
    try {
      await generateDepartmentBudgetPdf(budget);
      showToast(`Downloaded ${budget.department} FY ${budget.financialYear} PDF.`, 'success');
    } catch (err) {
      console.error('Budget PDF export failed:', err);
      showToast('Failed to generate budget PDF.', 'error');
    } finally {
      setExportingId(null);
    }
  };

  const handleDownloadExcel = (budget: DepartmentBudget) => {
    try {
      downloadDepartmentBudgetExcel(budget);
      showToast(`Downloaded ${budget.department} FY ${budget.financialYear} Excel.`, 'success');
    } catch (err) {
      console.error('Budget Excel export failed:', err);
      showToast('Failed to export budget Excel.', 'error');
    }
  };

  const handleDownloadConsolidatedPdf = async () => {
    if (filteredBudgets.length === 0) {
      showToast('No budgets match the current filter to export.', 'info');
      return;
    }
    setExportingConsolidated(true);
    try {
      await generateConsolidatedBudgetPdf(filteredBudgets, fyFilter);
      showToast('Downloaded Consolidated FY Budget Summary PDF.', 'success');
    } catch (err) {
      console.error('Consolidated budget PDF failed:', err);
      showToast('Failed to generate consolidated PDF.', 'error');
    } finally {
      setExportingConsolidated(false);
    }
  };

  const openReviewModal = (budget: DepartmentBudget) => {
    setReviewTarget(budget);
    setReviewDecision(isAdmin ? 'Approved' : 'Reviewed');
    setReviewNotes(budget.reviewNotes || '');
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget || submittingReview) return;
    setSubmittingReview(true);
    try {
      const ok = await reviewDepartmentBudget(reviewTarget.id, {
        status: reviewDecision,
        reviewNotes,
      });
      if (ok) {
        setReviewTarget(null);
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteDepartmentBudget(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const statusTabs = isHodMode
    ? ['All', 'Draft', 'Submitted', 'Reviewed', 'Approved', 'Returned']
    : ['All', 'Submitted', 'Reviewed', 'Approved', 'Returned'];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header Banner */}
      <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
            {isHodMode ? `${activeDepartment} · Annual Procurement Plan` : 'Institutional Budget Desk'}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
            {isHodMode ? `${activeDepartment} Financial Year Budgets` : 'Departmental Financial Year Budgets'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl">
            {isHodMode
              ? 'Prepare itemized procurement budgets per financial year (e.g., 2026/2027), save drafts, and submit directly to the Store Officer and Admin.'
              : 'Review submitted departmental financial year budgets, record remarks or approvals, and download official ERTVC PDF or Excel schedules.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!isHodMode && (
            <button
              type="button"
              disabled={exportingConsolidated || filteredBudgets.length === 0}
              onClick={() => void handleDownloadConsolidatedPdf()}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              <i
                className={`fas ${
                  exportingConsolidated ? 'fa-spinner fa-spin' : 'fa-file-pdf text-red-600'
                }`}
              ></i>
              <span>Consolidated PDF</span>
            </button>
          )}
          {(isHodMode || isAdmin) && (
            <button
              type="button"
              onClick={openNewBudgetModal}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0369a1] hover:from-[#0369a1] hover:to-[#0284c7] text-white text-xs sm:text-sm font-semibold shadow-sm flex items-center gap-2 active:scale-[0.98]"
            >
              <i className="fas fa-plus"></i>
              <span>New FY Budget</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Total Budgets</p>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {stats.totalCount}
          </p>
        </div>
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">
            {isHodMode ? 'Drafts / Returned' : 'Awaiting Review'}
          </p>
          <p className="font-display text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {stats.pendingCount}
          </p>
        </div>
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Approved Value</p>
          <p className="font-mono text-lg sm:text-xl font-bold text-emerald-700 tabular-nums mt-1 truncate">
            {formatKes(stats.approvedTotal)}
          </p>
        </div>
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Total Requested</p>
          <p className="font-mono text-lg sm:text-xl font-bold text-sky-700 tabular-nums mt-1 truncate">
            {formatKes(stats.requestedTotal)}
          </p>
        </div>
      </div>

      {/* Filters & Status Segmented Tabs */}
      <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className={`relative ${isHodMode ? 'md:col-span-8' : 'md:col-span-5'}`}>
            <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search budget title, line items, or preparer..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-sky-600 focus:outline-none"
            />
          </div>
          <div className="md:col-span-4">
            <select
              aria-label="Filter by Financial Year"
              value={fyFilter}
              onChange={(e) => setFyFilter(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-sky-600 focus:outline-none"
            >
              <option value="All">All Financial Years</option>
              {financialYearOptions.map((fy) => (
                <option key={fy} value={fy}>
                  FY {fy}
                </option>
              ))}
            </select>
          </div>
          {!isHodMode && (
            <div className="md:col-span-3">
              <select
                aria-label="Filter by Department"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-sky-600 focus:outline-none"
              >
                <option value="All">All Departments</option>
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
          {statusTabs.map((tab) => {
            const active = statusFilter === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* Budgets List */}
      {filteredBudgets.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-10 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center mx-auto text-xl">
            <i className="fas fa-file-invoice-dollar"></i>
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            {departmentBudgets.length === 0
              ? isHodMode
                ? `No FY Budgets Created Yet for ${activeDepartment}`
                : 'No Departmental Budgets Submitted Yet'
              : 'No Budgets Match Your Filters'}
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {isHodMode
              ? 'Start by drafting your 2026/2027 Financial Year procurement budget and submit it to the Store Officer and Admin.'
              : 'When department HODs submit their Financial Year budgets, they will appear here for review and PDF/Excel download.'}
          </p>
          {(isHodMode || isAdmin) && departmentBudgets.length === 0 && (
            <button
              type="button"
              onClick={openNewBudgetModal}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <i className="fas fa-plus"></i>
              Create FY 2026/2027 Budget
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBudgets.map((budget) => {
            const expanded = Boolean(expandedIds[budget.id]);
            const meta = statusMeta(budget.status);
            const isEditable =
              (isHodMode || isAdmin) && (budget.status === 'Draft' || budget.status === 'Returned');
            const isDeletable =
              isAdmin || (isHodMode && budget.status === 'Draft');
            const isReviewable =
              canReview && (budget.status === 'Submitted' || budget.status === 'Reviewed');

            const categoryTotals = new Map<string, number>();
            budget.lineItems.forEach((li) => {
              categoryTotals.set(
                li.category,
                (categoryTotals.get(li.category) || 0) + (li.totalCost || 0),
              );
            });

            return (
              <article
                key={budget.id}
                className="bg-surface rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
              >
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold ${meta.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`}></span>
                        {meta.label}
                      </span>
                      <span className="text-xs font-mono font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                        FY {budget.financialYear}
                      </span>
                    </div>

                    <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 leading-snug">
                      {budget.title}
                    </h2>

                    <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-800">{budget.department}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{budget.lineItems.length} line item(s)</span>
                      <span aria-hidden="true">·</span>
                      <span>Prepared by {budget.submittedByName}</span>
                      {budget.submittedAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            Submitted {new Date(budget.submittedAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                    <div className="sm:text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Total Estimate
                      </p>
                      <p className="font-mono text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                        {formatKes(budget.totalAmount)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={exportingId === budget.id}
                        onClick={() => void handleDownloadPdf(budget)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-700 hover:text-red-700 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        title="Download Official ERTVC Letterhead PDF"
                      >
                        <i
                          className={`fas ${
                            exportingId === budget.id ? 'fa-spinner fa-spin' : 'fa-file-pdf text-red-600'
                          }`}
                        ></i>
                        <span>PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadExcel(budget)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-200 text-slate-700 hover:text-emerald-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        title="Download Excel Workbook (.xlsx)"
                      >
                        <i className="fas fa-file-excel text-emerald-600"></i>
                        <span>Excel</span>
                      </button>

                      {isEditable && (
                        <button
                          type="button"
                          onClick={() => openEditBudgetModal(budget)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold flex items-center gap-1.5"
                        >
                          <i className="fas fa-pen"></i>
                          <span>Edit</span>
                        </button>
                      )}

                      {isEditable && (
                        <button
                          type="button"
                          onClick={() => void submitDepartmentBudget(budget.id)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <i className="fas fa-paper-plane"></i>
                          <span>Submit</span>
                        </button>
                      )}

                      {isReviewable && (
                        <button
                          type="button"
                          onClick={() => openReviewModal(budget)}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <i className="fas fa-clipboard-check"></i>
                          <span>Review</span>
                        </button>
                      )}

                      {isDeletable && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(budget)}
                          aria-label="Delete budget"
                          className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-500 hover:text-red-700 hover:bg-red-50 hover:border-red-200 text-xs"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedIds((prev) => ({ ...prev, [budget.id]: !prev[budget.id] }))
                        }
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`}></i>
                        <span>{expanded ? 'Hide' : 'Items'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Review feedback alert strip if returned or reviewed */}
                {(budget.reviewNotes || budget.reviewedByEmail) && (
                  <div
                    className={`px-4 sm:px-5 py-2.5 border-t text-xs flex flex-wrap items-center gap-2 ${
                      budget.status === 'Returned'
                        ? 'bg-red-50/70 border-red-100 text-red-900'
                        : 'bg-slate-50 border-slate-100 text-slate-700'
                    }`}
                  >
                    <i
                      className={`fas ${
                        budget.status === 'Returned'
                          ? 'fa-rotate-left text-red-600'
                          : 'fa-comment-dots text-sky-600'
                      }`}
                    ></i>
                    <span className="font-bold">
                      {budget.status}
                      {budget.reviewedByEmail ? ` (${budget.reviewedByEmail})` : ''}:
                    </span>
                    <span>{budget.reviewNotes || 'No remarks provided.'}</span>
                  </div>
                )}

                {expanded && (
                  <div className="border-t border-slate-200/80 bg-slate-50/50 p-4 sm:p-5 space-y-4">
                    {budget.notes && (
                      <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 text-xs text-slate-700">
                        <span className="font-bold text-slate-900 block mb-1">
                          Department Notes &amp; Justification:
                        </span>
                        {budget.notes}
                      </div>
                    )}

                    {/* Category Breakdown Strip */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {Array.from(categoryTotals.entries()).map(([cat, amount]) => (
                        <div
                          key={cat}
                          className="bg-white rounded-xl border border-slate-200/80 px-3.5 py-2.5 flex items-center justify-between gap-2"
                        >
                          <span className="text-xs font-medium text-slate-700 truncate">{cat}</span>
                          <span className="font-mono text-xs font-bold text-slate-900 tabular-nums shrink-0">
                            {formatKes(amount)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Itemized Schedule Table */}
                    <div className="bg-white rounded-xl border border-slate-200/90 overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[680px]">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">Category</th>
                            <th className="py-2.5 px-3">Item / Description</th>
                            <th className="py-2.5 px-3">Unit</th>
                            <th className="py-2.5 px-3 text-right">Qty</th>
                            <th className="py-2.5 px-3 text-right">Unit Cost</th>
                            <th className="py-2.5 px-3 text-right">Total (KES)</th>
                            <th className="py-2.5 px-3">Justification</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {budget.lineItems.map((line, idx) => (
                            <tr key={line.id || idx} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-3 font-mono text-slate-500 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">{line.category}</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                {line.itemName}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">{line.unit}</td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                                {line.quantity}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                {formatKes(line.estimatedUnitCost)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                                {formatKes(line.totalCost)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {line.justification || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                            <td colSpan={6} className="py-2.5 px-3 text-right uppercase">
                              Grand Total Estimate
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-800">
                              {formatKes(budget.totalAmount)}
                            </td>
                            <td className="py-2.5 px-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Budget Create / Edit Modal */}
      {editorOpen && (
        <div
          className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-50 flex justify-center items-end sm:items-center p-0 sm:p-4"
          onClick={() => !savingBudget && setEditorOpen(false)}
        >
          <div
            className="bg-surface rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 w-full max-w-4xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                  {editingBudgetId ? 'Edit Departmental FY Budget' : 'Prepare Financial Year Budget'}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Add procurement items, quantities, and unit estimates for submission to Store Officer &amp; Admin.
                </p>
              </div>
              <button
                type="button"
                disabled={savingBudget}
                onClick={() => setEditorOpen(false)}
                aria-label="Close budget editor"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department
                  </label>
                  {isHodMode || Boolean(editingBudgetId) ? (
                    <input
                      type="text"
                      readOnly
                      value={resolvedEditorDept}
                      className="w-full min-h-[40px] px-3 py-2 text-sm rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-semibold"
                    />
                  ) : (
                    <select
                      value={formDept}
                      onChange={(e) => {
                        setFormDept(e.target.value);
                        syncDefaultTitle(e.target.value, resolvedEditorFy);
                      }}
                      className="w-full min-h-[40px] px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                    >
                      {STANDARD_TVET_DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Financial Year
                    </label>
                    <button
                      type="button"
                      onClick={() => setUseCustomFy((prev) => !prev)}
                      className="text-[11px] font-semibold text-sky-700 hover:underline"
                    >
                      {useCustomFy ? 'Use preset' : 'Custom FY'}
                    </button>
                  </div>
                  {useCustomFy ? (
                    <input
                      type="text"
                      value={customFy}
                      maxLength={VALIDATION_LIMITS.MAX_FINANCIAL_YEAR_LENGTH}
                      onChange={(e) => {
                        setCustomFy(e.target.value);
                        syncDefaultTitle(resolvedEditorDept, e.target.value);
                      }}
                      placeholder="e.g., 2026/2027"
                      className="w-full min-h-[40px] px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  ) : (
                    <select
                      value={formFy}
                      onChange={(e) => {
                        setFormFy(e.target.value);
                        syncDefaultTitle(resolvedEditorDept, e.target.value);
                      }}
                      className="w-full min-h-[40px] px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                    >
                      {DEFAULT_FY_OPTIONS.map((fy) => (
                        <option key={fy} value={fy}>
                          {fy}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Budget Title
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    maxLength={VALIDATION_LIMITS.MAX_BUDGET_TITLE_LENGTH}
                    onChange={(e) => {
                      setTitleManuallyEdited(true);
                      setFormTitle(e.target.value);
                    }}
                    placeholder="Department FY 2026/2027 Budget"
                    className="w-full min-h-[40px] px-3 py-2 text-sm rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              {/* Line Items Builder */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Budget Line Items ({formItems.length}/{VALIDATION_LIMITS.MAX_BUDGET_LINE_ITEMS})
                  </h3>
                  <button
                    type="button"
                    disabled={formItems.length >= VALIDATION_LIMITS.MAX_BUDGET_LINE_ITEMS}
                    onClick={() => setFormItems((prev) => [...prev, createEmptyLineItem()])}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-800 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <i className="fas fa-plus"></i>
                    <span>Add Line Item</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {formItems.map((line, index) => (
                    <div
                      key={line.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono font-bold text-slate-500">
                          ITEM #{index + 1}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-sky-800 tabular-nums">
                            Line Total: {formatKes(line.totalCost)}
                          </span>
                          {formItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLineItem(index)}
                              className="text-xs text-red-600 hover:text-red-800 font-semibold"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Votehead / Category
                          </label>
                          <select
                            value={line.category}
                            onChange={(e) =>
                              updateLineItem(index, { category: e.target.value as BudgetCategory })
                            }
                            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                          >
                            {BUDGET_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Item / Specification *
                          </label>
                          <input
                            type="text"
                            value={line.itemName}
                            maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
                            onChange={(e) => updateLineItem(index, { itemName: e.target.value })}
                            placeholder="e.g., Welding Electrodes 3.2mm"
                            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Unit
                          </label>
                          <input
                            type="text"
                            list="budget-unit-list"
                            value={line.unit}
                            maxLength={VALIDATION_LIMITS.MAX_UNIT_LENGTH}
                            onChange={(e) => updateLineItem(index, { unit: e.target.value })}
                            placeholder="Pcs"
                            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Qty
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLineItem(index, { quantity: Number(e.target.value) || 1 })
                            }
                            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-mono"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Est. Unit Cost (KES)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={line.estimatedUnitCost}
                            onChange={(e) =>
                              updateLineItem(index, {
                                estimatedUnitCost: Number(e.target.value) || 0,
                              })
                            }
                            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-mono"
                          />
                        </div>

                        <div className="sm:col-span-8">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Justification / Training Cohort Need
                          </label>
                          <input
                            type="text"
                            value={line.justification}
                            maxLength={200}
                            onChange={(e) =>
                              updateLineItem(index, { justification: e.target.value })
                            }
                            placeholder="e.g., Term 1 & 2 KNEC practical assessments"
                            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <datalist id="budget-unit-list">
                    {UNIT_SUGGESTIONS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Executive Summary / Notes for Store Officer &amp; Admin
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  maxLength={VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional overview of departmental priorities for this Financial Year..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              {/* Footer Totals & Submit */}
              <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Total Budget Estimate
                  </p>
                  <p className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatKes(editorGrandTotal)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingBudget}
                    onClick={() => setEditorOpen(false)}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingBudget}
                    onClick={() => void handleSaveBudget(false)}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs sm:text-sm font-semibold disabled:opacity-50"
                  >
                    Save as Draft
                  </button>
                  <button
                    type="button"
                    disabled={savingBudget}
                    onClick={() => void handleSaveBudget(true)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0369a1] hover:from-[#0369a1] hover:to-[#0284c7] text-white text-xs sm:text-sm font-semibold shadow-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    <i className={`fas ${savingBudget ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                    <span>Submit to Store Officer &amp; Admin</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Store Officer / Admin Review Modal */}
      {reviewTarget && (
        <div
          className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-50 flex justify-center items-end sm:items-center p-0 sm:p-4"
          onClick={() => !submittingReview && setReviewTarget(null)}
        >
          <form
            onSubmit={handleConfirmReview}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 w-full max-w-lg space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Review Departmental Budget
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  {reviewTarget.department} · FY {reviewTarget.financialYear} ·{' '}
                  <span className="font-mono font-bold text-slate-900">
                    {formatKes(reviewTarget.totalAmount)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={submittingReview}
                onClick={() => setReviewTarget(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">Decision</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setReviewDecision('Approved')}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                      reviewDecision === 'Approved'
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-emerald-50'
                    }`}
                  >
                    Approve Budget
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setReviewDecision('Reviewed')}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                    reviewDecision === 'Reviewed'
                      ? 'bg-sky-700 border-sky-700 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-sky-50'
                  }`}
                >
                  Mark Reviewed
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDecision('Returned')}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                    reviewDecision === 'Returned'
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-red-50'
                  }`}
                >
                  Return to HOD
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Review Remarks / Conditions
              </label>
              <textarea
                rows={3}
                value={reviewNotes}
                maxLength={VALIDATION_LIMITS.MAX_APPROVAL_NOTES_LENGTH}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewDecision === 'Returned'
                    ? 'Explain what the HOD needs to adjust before resubmitting...'
                    : 'Add procurement or finance remarks...'
                }
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={submittingReview}
                onClick={() => setReviewTarget(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReview}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold disabled:opacity-50"
              >
                {submittingReview ? 'Saving...' : `Confirm ${reviewDecision}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-50 flex justify-center items-center p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-md space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-900">Delete Budget?</h2>
            <p className="text-sm text-slate-600">
              Delete <span className="font-semibold text-slate-900">{deleteTarget.title}</span> for{' '}
              <span className="font-semibold">{deleteTarget.department}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Budget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
