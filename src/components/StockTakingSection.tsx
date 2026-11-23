import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { getItemDamagedQty, isItemConsumable, roundStockQuantity } from '../types';
import { STANDARD_TVET_DEPARTMENTS } from '../utils/sampleData';
import { StockTakeEntryRow, generateStockTakingPdf } from '../utils/stockTakingReports';

export const StockTakingSection: React.FC<{
  isHodMode: boolean;
  activeDepartment: string;
}> = ({ isHodMode, activeDepartment }) => {
  const { inventory, assets, user, activeRole, switchDeskView, showToast } = useAppContext();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [physicalInputs, setPhysicalInputs] = useState<Record<string, string>>({});
  const [remarkInputs, setRemarkInputs] = useState<Record<string, string>>({});
  const [printingMode, setPrintingMode] = useState<'blank' | 'filled' | null>(null);
  const [previewDept, setPreviewDept] = useState<string>(STANDARD_TVET_DEPARTMENTS[0]);

  useEffect(() => {
    setFilterCategory('All');
    setSearchTerm('');
  }, [activeDepartment]);

  const deptKey = activeDepartment.trim().toLowerCase();

  const deptInventory = useMemo(() => {
    if (!isHodMode || !deptKey) return [];
    return inventory.filter(
      (item) => (item.department || '').trim().toLowerCase() === deptKey,
    );
  }, [inventory, isHodMode, deptKey]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    deptInventory.forEach((item) => {
      if (item.category?.trim()) set.add(item.category.trim());
    });
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [deptInventory]);

  const inStockAssetsCountByItem = useMemo(() => {
    const map = new Map<string, number>();
    assets.forEach((a) => {
      if (a.status === 'In Stock') {
        map.set(a.inventoryId, (map.get(a.inventoryId) || 0) + 1);
      }
    });
    return map;
  }, [assets]);

  const rows = useMemo<StockTakeEntryRow[]>(() => {
    if (!isHodMode) return [];
    const q = searchTerm.trim().toLowerCase();
    return deptInventory
      .filter((item) => {
        if (filterCategory !== 'All' && (item.category || '').trim() !== filterCategory) {
          return false;
        }
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q) ||
          (item.location || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => {
        const systemQty =
          item.type === 'Asset'
            ? inStockAssetsCountByItem.get(item.id) || 0
            : roundStockQuantity(item.quantity);
        const damagedQty = getItemDamagedQty(item);
        const rawVal = (physicalInputs[item.id] ?? '').trim();
        const parsed = rawVal === '' ? null : Number(rawVal);
        const physicalQty =
          parsed !== null && Number.isFinite(parsed) && parsed >= 0
            ? roundStockQuantity(parsed)
            : null;
        const variance =
          physicalQty !== null ? roundStockQuantity(physicalQty - systemQty) : null;

        const itemTypeLabel =
          item.type === 'Asset'
            ? 'Asset (Serial)'
            : isItemConsumable(item)
              ? 'Consumable'
              : 'Returnable';

        return {
          inventoryId: item.id,
          name: item.name,
          category: item.category || 'Uncategorized',
          department: item.department || activeDepartment,
          location: item.location,
          itemTypeLabel,
          unit: item.unit,
          systemQty,
          damagedQty,
          physicalQty,
          variance,
          remarks: (remarkInputs[item.id] || '').trim(),
        };
      });
  }, [
    isHodMode,
    deptInventory,
    inStockAssetsCountByItem,
    searchTerm,
    filterCategory,
    physicalInputs,
    remarkInputs,
    activeDepartment,
  ]);

  const stats = useMemo(() => {
    const counted = rows.filter((r) => r.physicalQty !== null);
    return {
      total: rows.length,
      counted: counted.length,
      matched: counted.filter((r) => r.variance === 0).length,
      shortages: counted.filter((r) => (r.variance || 0) < 0).length,
      surpluses: counted.filter((r) => (r.variance || 0) > 0).length,
    };
  }, [rows]);

  const hasAnyInput =
    Object.values(physicalInputs).some((v) => v.trim() !== '') ||
    Object.values(remarkInputs).some((v) => v.trim() !== '');

  const handlePrint = async (blankMode: boolean) => {
    if (!isHodMode || !activeDepartment) {
      showToast('Stock taking can only be conducted from a Departmental HOD desk.', 'error');
      return;
    }
    if (rows.length === 0) {
      showToast(`No ${activeDepartment} inventory items match the selected filter.`, 'info');
      return;
    }
    setPrintingMode(blankMode ? 'blank' : 'filled');
    try {
      await generateStockTakingPdf({
        rows,
        departmentName: activeDepartment,
        categoryLabel: filterCategory,
        countDateLabel: new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        conductedByLabel: user?.displayName || user?.email || `${activeDepartment} HOD`,
        blankMode,
      });
      showToast(
        blankMode
          ? `${activeDepartment} Blank Stock Taking Sheet PDF downloaded.`
          : `${activeDepartment} Stock Taking & Variance Report PDF downloaded.`,
        'success',
      );
    } catch (err) {
      console.error('Stock taking PDF error:', err);
      showToast('Failed to generate Departmental Stock Taking PDF.', 'error');
    } finally {
      setPrintingMode(null);
    }
  };

  if (!isHodMode) {
    const roleLabel = activeRole === 'officer' ? 'Store Officer' : 'Procurement Admin';
    return (
      <section
        id="stock-taking-section"
        className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs"
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
              Departmental Stock Taking
            </h2>
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[11px] font-bold">
              HOD / Department Only
            </span>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Active Desk: {roleLabel}
          </span>
        </div>

        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5 max-w-2xl">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <i className="fas fa-building-user"></i>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                Stock taking is conducted departmentally, not by the Store Officer or Admin.
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Each Head of Department (HOD) logs into their departmental desk and opens{' '}
                <span className="font-semibold text-slate-800">Reports → Stock Taking</span> to
                print their department&apos;s blank physical count sheet, enter physical counts
                against system quantities, and generate their signed variance report.
              </p>
            </div>
          </div>

          {user?.isBootstrappedAdmin && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 shrink-0">
              <select
                aria-label="Select department HOD desk for stock taking"
                value={previewDept}
                onChange={(e) => setPreviewDept(e.target.value)}
                className="py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:border-primary focus:ring-primary"
              >
                {STANDARD_TVET_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => switchDeskView('hod', previewDept)}
                className="min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <i className="fas fa-arrow-right-arrow-left text-[11px]"></i>
                <span>Open Department HOD Desk</span>
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      id="stock-taking-section"
      className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs"
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-slate-50/70">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
              {activeDepartment} Stock Taking Sheet
            </h2>
            <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[11px] font-bold">
              Departmental · System vs Physical
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Print your {activeDepartment} blank physical count sheet, or enter actual counts below
            against system quantities before printing the variance report.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hasAnyInput && (
            <button
              type="button"
              onClick={() => {
                setPhysicalInputs({});
                setRemarkInputs({});
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
            >
              Clear Counts
            </button>
          )}
          <button
            type="button"
            disabled={printingMode !== null || rows.length === 0}
            onClick={() => void handlePrint(true)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <i className={`fas ${printingMode === 'blank' ? 'fa-spinner fa-spin' : 'fa-print'}`}></i>
            <span>Print Blank Sheet (PDF)</span>
          </button>
          <button
            type="button"
            disabled={printingMode !== null || rows.length === 0}
            onClick={() => void handlePrint(false)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            <i className={`fas ${printingMode === 'filled' ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i>
            <span>Print Stock Taking Report</span>
          </button>
        </div>
      </div>

      {/* Filters + Summary Stats */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="relative md:col-span-2">
            <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${activeDepartment} items, category, or shelf location...`}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-xs sm:text-sm"
            />
          </div>
          <select
            aria-label="Filter departmental stock take by category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="py-2 px-3 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-xs sm:text-sm"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'All' ? 'All Categories' : c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-semibold">
            Department: {activeDepartment}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold">
            Items: {stats.total}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 font-semibold">
            Counted: {stats.counted} / {stats.total}
          </span>
          {stats.counted > 0 && (
            <>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold">
                Matched: {stats.matched}
              </span>
              {stats.shortages > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-semibold">
                  Shortages: {stats.shortages}
                </span>
              )}
              {stats.surpluses > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-semibold">
                  Surpluses: {stats.surpluses}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile Cards (< md) */}
      <div className="md:hidden divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
        {rows.map((row) => (
          <div key={row.inventoryId} className="p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-slate-900 truncate">{row.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {row.category} · {row.itemTypeLabel}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  System Says
                </span>
                <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                  {row.systemQty} {row.unit}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Physical Count
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={physicalInputs[row.inventoryId] ?? ''}
                  onChange={(e) =>
                    setPhysicalInputs((prev) => ({
                      ...prev,
                      [row.inventoryId]: e.target.value,
                    }))
                  }
                  placeholder="Actual..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono tabular-nums focus:border-primary focus:ring-primary"
                />
              </div>
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Variance
                </span>
                <div className="h-[30px] flex items-center">
                  {row.variance === null ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : row.variance === 0 ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold font-mono tabular-nums">
                      0 (Match)
                    </span>
                  ) : row.variance > 0 ? (
                    <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 text-xs font-bold font-mono tabular-nums">
                      +{row.variance}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 text-xs font-bold font-mono tabular-nums">
                      {row.variance}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <input
              type="text"
              maxLength={200}
              value={remarkInputs[row.inventoryId] ?? ''}
              onChange={(e) =>
                setRemarkInputs((prev) => ({
                  ...prev,
                  [row.inventoryId]: e.target.value,
                }))
              }
              placeholder="Condition / variance note..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-primary focus:ring-primary"
            />
          </div>
        ))}
      </div>

      {/* Desktop Table (md+) */}
      <div className="hidden md:block overflow-x-auto max-h-[540px] overflow-y-auto">
        <table className="w-full text-sm text-left text-gray-600">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="px-5 py-3">Item</th>
              <th className="px-4 py-3">Category / Type</th>
              <th className="px-4 py-3 text-right">System Qty</th>
              <th className="px-4 py-3 w-40">Physical Count</th>
              <th className="px-4 py-3 text-right">Variance</th>
              <th className="px-5 py-3">Remarks / Condition</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.inventoryId} className="bg-white hover:bg-slate-50/70">
                <td className="px-5 py-3">
                  <p className="font-semibold text-slate-900">{row.name}</p>
                  {row.location && (
                    <p className="text-[11px] text-slate-500">Loc: {row.location}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <span className="font-medium text-slate-800 block">{row.category}</span>
                  <span>{row.itemTypeLabel}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                  {row.systemQty}{' '}
                  <span className="font-sans font-normal text-xs text-slate-500">{row.unit}</span>
                  {row.damagedQty > 0 && (
                    <span className="block font-sans text-[11px] font-semibold text-red-600">
                      {row.damagedQty} dmg
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    aria-label={`Physical count for ${row.name}`}
                    value={physicalInputs[row.inventoryId] ?? ''}
                    onChange={(e) =>
                      setPhysicalInputs((prev) => ({
                        ...prev,
                        [row.inventoryId]: e.target.value,
                      }))
                    }
                    placeholder={`Actual ${row.unit}`}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50/50 focus:bg-white text-xs sm:text-sm font-mono tabular-nums focus:border-primary focus:ring-primary"
                  />
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                  {row.variance === null ? (
                    <span className="text-slate-400">—</span>
                  ) : row.variance === 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold">
                      0 Match
                    </span>
                  ) : row.variance > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 text-xs font-bold">
                      +{row.variance}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-50 text-red-700 text-xs font-bold">
                      {row.variance}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <input
                    type="text"
                    maxLength={200}
                    aria-label={`Stock take remarks for ${row.name}`}
                    value={remarkInputs[row.inventoryId] ?? ''}
                    onChange={(e) =>
                      setRemarkInputs((prev) => ({
                        ...prev,
                        [row.inventoryId]: e.target.value,
                      }))
                    }
                    placeholder="Condition / variance reason..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-primary focus:ring-primary"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="text-center p-6 text-sm text-slate-500">
          No {activeDepartment} inventory items match your stock-taking filters.
        </p>
      )}
    </section>
  );
};
