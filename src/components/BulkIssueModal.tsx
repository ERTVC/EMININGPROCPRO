import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  BulkIssueLineInput,
  InventoryItem,
  IssueSlip,
  UsageScope,
  VALIDATION_LIMITS,
  isItemConsumable,
  roundStockQuantity,
} from '../types';
import { generateIssueSlipPdf } from '../utils/issueReports';

interface ConsumableCartEntry {
  kind: 'Consumable';
  inventoryId: string;
  quantity: number;
}

interface AssetCartEntry {
  kind: 'Asset';
  inventoryId: string;
  assetId: string;
  serialNumber: string;
}

type CartEntry = ConsumableCartEntry | AssetCartEntry;

export const BulkIssueModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const {
    inventory,
    assets,
    recipients,
    settings,
    user,
    issueBulkItems,
    showToast,
  } = useAppContext();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [expandedAssetIds, setExpandedAssetIds] = useState<Record<string, boolean>>({});
  const [quickQtyInputs, setQuickQtyInputs] = useState<Record<string, string>>({});

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [defaultReturnDate, setDefaultReturnDate] = useState('');
  const [usageScope, setUsageScope] = useState<UsageScope>('Workshop / Practical');
  const [usageLocation, setUsageLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [completedSlip, setCompletedSlip] = useState<{
    recipientId: string;
    slip: IssueSlip;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setCompletedSlip(null);
  }, [isOpen]);

  const resetForm = () => {
    setSearchTerm('');
    setFilterDepartment('All');
    setFilterCategory('All');
    setInStockOnly(true);
    setExpandedAssetIds({});
    setQuickQtyInputs({});
    setCart([]);
    setRecipientSearch('');
    setRecipientId('');
    setDefaultReturnDate('');
    setUsageScope('Workshop / Practical');
    setUsageLocation('');
    setFormError('');
    setCompletedSlip(null);
  };

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const departments = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((item) => {
      if (item.department?.trim()) set.add(item.department.trim());
    });
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [inventory]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((item) => {
      if (item.category?.trim()) set.add(item.category.trim());
    });
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [inventory]);

  const inStockAssetsByItem = useMemo(() => {
    const map = new Map<string, typeof assets>();
    assets.forEach((asset) => {
      if (asset.status !== 'In Stock') return;
      const list = map.get(asset.inventoryId) || [];
      list.push(asset);
      map.set(asset.inventoryId, list);
    });
    return map;
  }, [assets]);

  const filteredCatalog = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return inventory
      .filter((item) => {
        if (filterDepartment !== 'All' && (item.department || '').trim() !== filterDepartment) {
          return false;
        }
        if (filterCategory !== 'All' && (item.category || '').trim() !== filterCategory) {
          return false;
        }
        const availCount =
          item.type === 'Asset'
            ? (inStockAssetsByItem.get(item.id) || []).length
            : item.quantity;
        if (inStockOnly && availCount <= 0) return false;
        if (!q) return true;
        const itemAssets = inStockAssetsByItem.get(item.id) || [];
        return (
          item.name.toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q) ||
          (item.department || '').toLowerCase().includes(q) ||
          itemAssets.some((a) => a.serialNumber.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory, inStockAssetsByItem, searchTerm, filterDepartment, filterCategory, inStockOnly]);

  const filteredRecipients = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    const sorted = [...recipients].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        (r.regNumber || '').toLowerCase().includes(q),
    );
  }, [recipients, recipientSearch]);

  const inventoryMap = useMemo(
    () => new Map<string, InventoryItem>(inventory.map((item) => [item.id, item])),
    [inventory],
  );

  const consumableInCartMap = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach((entry) => {
      if (entry.kind === 'Consumable') {
        map.set(entry.inventoryId, entry.quantity);
      }
    });
    return map;
  }, [cart]);

  const selectedAssetSet = useMemo(() => {
    const set = new Set<string>();
    cart.forEach((entry) => {
      if (entry.kind === 'Asset') {
        set.add(entry.assetId);
      }
    });
    return set;
  }, [cart]);

  const hasReturnableItemsInCart = useMemo(
    () =>
      cart.some((entry) => {
        if (entry.kind === 'Asset') return true;
        const item = inventoryMap.get(entry.inventoryId);
        return item ? !isItemConsumable(item) : false;
      }),
    [cart, inventoryMap],
  );

  const totalUnitsInCart = useMemo(
    () =>
      roundStockQuantity(
        cart.reduce(
          (sum, entry) => sum + (entry.kind === 'Consumable' ? entry.quantity : 1),
          0,
        ),
      ),
    [cart],
  );

  const setConsumableQuantity = (item: InventoryItem, rawQty: number) => {
    const maxStock = roundStockQuantity(Math.max(0, item.quantity));
    if (maxStock <= 0) return;
    const clamped = Math.min(maxStock, Math.max(0, roundStockQuantity(rawQty)));
    setCart((prev) => {
      const idx = prev.findIndex(
        (e) => e.kind === 'Consumable' && e.inventoryId === item.id,
      );
      if (clamped <= 0) {
        return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
      }
      if (idx === -1) {
        return [...prev, { kind: 'Consumable', inventoryId: item.id, quantity: clamped }];
      }
      return prev.map((e, i) =>
        i === idx && e.kind === 'Consumable' ? { ...e, quantity: clamped } : e,
      );
    });
  };

  const addConsumableDelta = (item: InventoryItem, delta: number) => {
    const current = consumableInCartMap.get(item.id) || 0;
    setConsumableQuantity(item, current + delta);
  };

  const toggleAssetSelection = (
    item: InventoryItem,
    assetId: string,
    serialNumber: string,
  ) => {
    setCart((prev) => {
      const exists = prev.some((e) => e.kind === 'Asset' && e.assetId === assetId);
      if (exists) {
        return prev.filter((e) => !(e.kind === 'Asset' && e.assetId === assetId));
      }
      return [
        ...prev,
        {
          kind: 'Asset',
          inventoryId: item.id,
          assetId,
          serialNumber,
        },
      ];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!recipientId) {
      setFormError('Please select a recipient to receive these items.');
      return;
    }
    if (usageScope === 'Outside School' && !usageLocation.trim()) {
      setFormError('Please enter the destination / job site for an Outside School Gate Pass.');
      return;
    }
    if (cart.length === 0) {
      setFormError('Add at least one item to the issue cart.');
      return;
    }
    if (cart.length > 150) {
      setFormError('Please keep a single issue slip to 150 item lines or fewer.');
      return;
    }
    if (hasReturnableItemsInCart && !defaultReturnDate) {
      setFormError(
        'Please pick an expected return date because your cart includes returnable items or serialized tools/assets.',
      );
      return;
    }

    const lines: BulkIssueLineInput[] = cart.map((entry) => {
      if (entry.kind === 'Consumable') {
        const item = inventoryMap.get(entry.inventoryId);
        return {
          inventoryId: entry.inventoryId,
          quantity: entry.quantity,
          returnDate: item && !isItemConsumable(item) ? defaultReturnDate : undefined,
        };
      }
      return {
        inventoryId: entry.inventoryId,
        assetId: entry.assetId,
        returnDate: defaultReturnDate,
      };
    });

    setFormError('');
    setSubmitting(true);
    try {
      const result = await issueBulkItems({
        recipientId,
        lines,
        defaultReturnDate,
        usageScope,
        usageLocation: usageLocation.trim(),
      });
      if (!result) return;

      if (result.slip) {
        setCompletedSlip({
          recipientId,
          slip: result.slip,
        });
        setCart([]);
      } else if (result.errorMessage) {
        setFormError(result.errorMessage);
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to issue items. Please verify permissions and stock.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadVoucher = async () => {
    if (!completedSlip) return;
    const recipient =
      recipients.find((r) => r.id === completedSlip.recipientId) || null;
    try {
      await generateIssueSlipPdf({
        settings,
        recipient,
        slip: completedSlip.slip,
        inventory,
        issuedByEmail: user?.email,
      });
    } catch (err) {
      console.error('Failed to generate issue slip PDF', err);
      showToast('Failed to export Issue Slip PDF.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleClose}
    >
      <div
        className="bg-surface rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-fade-in-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 shrink-0"
          aria-hidden="true"
        />
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
              Fast Multi-Item Dispatch
            </p>
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
              Bulk Issue Store Items
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Issues all items atomically onto one Issue Slip and logs stock movements automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close bulk issue dialog"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Body */}
        {completedSlip ? (
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
            {(() => {
              const slip = completedSlip.slip;
              const isGatePass = Boolean(
                slip.requiresGatePass || slip.scope === 'Outside School',
              );
              const gatePassNo = slip.gatePassNumber;
              const dispatchLocation = slip.usageLocation;
              const totalUnits = roundStockQuantity(
                slip.lines.reduce((s, l) => s + l.qtyIssued, 0),
              );
              return (
                <div
                  className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                    isGatePass
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl text-white flex items-center justify-center shrink-0 text-lg ${
                        isGatePass ? 'bg-amber-600' : 'bg-emerald-600'
                      }`}
                    >
                      <i className={`fas ${isGatePass ? 'fa-id-card' : 'fa-check'}`}></i>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base sm:text-lg font-bold text-slate-900">
                          {isGatePass
                            ? 'Off-Campus Dispatch & Gate Pass Issued'
                            : 'Issue Slip Created Successfully'}
                        </h3>
                        <span className="px-2 py-0.5 rounded-lg bg-slate-900/10 text-slate-800 font-mono text-xs font-bold">
                          ISS-{slip.id.slice(0, 6).toUpperCase()}
                        </span>
                        {isGatePass && gatePassNo && (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-200/80 text-amber-950 font-mono text-xs font-bold">
                            {gatePassNo}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 mt-0.5">
                        Issued{' '}
                        <strong className="tabular-nums">
                          {slip.lines.length} item line
                          {slip.lines.length === 1 ? '' : 's'}
                        </strong>{' '}
                        (
                        <strong className="tabular-nums">{totalUnits} total units</strong>) to{' '}
                        <strong>{slip.recipientName || slip.recipient}</strong>
                        {dispatchLocation ? (
                          <>
                            {' '}
                            for <strong>{dispatchLocation}</strong>
                          </>
                        ) : null}
                        .
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDownloadVoucher()}
                    className={`min-h-[42px] px-4 py-2 rounded-xl text-white text-xs sm:text-sm font-semibold shadow-xs inline-flex items-center justify-center gap-2 shrink-0 ${
                      isGatePass
                        ? 'bg-amber-700 hover:bg-amber-800'
                        : 'bg-emerald-700 hover:bg-emerald-800'
                    }`}
                  >
                    <i className="fas fa-file-pdf"></i>
                    <span>
                      {isGatePass
                        ? 'Download Official Gate Pass (PDF)'
                        : 'Download Issue Slip (PDF)'}
                    </span>
                  </button>
                </div>
              );
            })()}

            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wide">
                Issued Items Summary
              </div>
              <div className="divide-y divide-slate-100 max-h-[42vh] overflow-y-auto">
                {completedSlip.slip.lines.map((line, idx) => {
                  const inv = inventoryMap.get(line.inventoryId);
                  return (
                    <div
                      key={`${line.inventoryId}-${line.assetId || idx}`}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {line.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {inv?.department || 'Central Store'}
                          {line.serialNumber ? ` · Serial: ${line.serialNumber}` : ''}
                          {!line.returnable
                            ? ' · Consumable (Non-Returnable)'
                            : line.returnDate
                              ? ` · Return Due: ${new Date(line.returnDate).toLocaleDateString()}`
                              : ' · Returnable'}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-slate-800 tabular-nums shrink-0">
                        × {line.qtyIssued} {line.unit || inv?.unit || 'Pcs'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => resetForm()}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs sm:text-sm font-semibold"
              >
                <i className="fas fa-plus mr-1.5"></i>Issue Another Slip
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Recipient & Return Date Bar */}
            <div className="px-5 sm:px-6 py-3.5 bg-slate-50/80 border-b border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 shrink-0">
              <div className={hasReturnableItemsInCart ? 'md:col-span-4' : 'md:col-span-5'}>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1">
                  Find Recipient
                </label>
                <input
                  type="text"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Filter name, reg no, or dept..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:border-primary focus:ring-primary"
                />
              </div>
              <div className={hasReturnableItemsInCart ? 'md:col-span-5' : 'md:col-span-7'}>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1">
                  Issuing To (Shared Recipient) *
                </label>
                <select
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:border-primary focus:ring-primary"
                  required
                >
                  <option value="">Select recipient ({filteredRecipients.length})</option>
                  {filteredRecipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.type}{r.regNumber ? ` · ${r.regNumber}` : ''})
                    </option>
                  ))}
                </select>
              </div>
              {hasReturnableItemsInCart ? (
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1">
                    Expected Return Date *
                  </label>
                  <input
                    type="date"
                    value={defaultReturnDate}
                    onChange={(e) => setDefaultReturnDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:border-primary focus:ring-primary"
                    required
                  />
                </div>
              ) : (
                cart.length > 0 && (
                  <div className="md:col-span-12 rounded-xl bg-sky-50 border border-sky-200 px-3 py-1.5 text-[11px] text-sky-900 flex items-center gap-2">
                    <i className="fas fa-box-open text-sky-600 shrink-0"></i>
                    <span>
                      <strong>Consumables Only:</strong> Deducted permanently on issue as{' '}
                      <strong>Non-Returnable</strong> — no return date or clearance required.
                    </span>
                  </div>
                )
              )}

              <div className="md:col-span-12 pt-1 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-6">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1">
                    Where Will Items Be Used? *
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setUsageScope('Workshop / Practical')}
                      className={`px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors ${
                        usageScope === 'Workshop / Practical'
                          ? 'border-sky-600 bg-sky-50 text-sky-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <i className="fas fa-screwdriver-wrench mr-1.5 text-sky-600"></i>
                      Workshop / Practical
                    </button>
                    <button
                      type="button"
                      onClick={() => setUsageScope('Outside School')}
                      className={`px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors ${
                        usageScope === 'Outside School'
                          ? 'border-amber-600 bg-amber-50 text-amber-950'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <i className="fas fa-id-card mr-1.5 text-amber-600"></i>
                      Outside School (Gate Pass)
                    </button>
                  </div>
                </div>
                <div className="md:col-span-6">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1">
                    {usageScope === 'Outside School'
                      ? 'Outside Destination / Job Site *'
                      : 'Workshop / Lab Name (optional)'}
                  </label>
                  <input
                    type="text"
                    maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
                    value={usageLocation}
                    onChange={(e) => setUsageLocation(e.target.value)}
                    required={usageScope === 'Outside School'}
                    placeholder={
                      usageScope === 'Outside School'
                        ? 'e.g. Sub-County Hall Wiring, Community Borehole...'
                        : 'e.g. Electrical Workshop 1, Welding Lab...'
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:border-primary focus:ring-primary"
                  />
                </div>
              </div>
              {usageScope === 'Outside School' && (
                <div className="md:col-span-12 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-950 flex items-center gap-2">
                  <i className="fas fa-shield-halved text-amber-700 shrink-0"></i>
                  <span>
                    <strong>Gate Pass Required:</strong> Confirming this batch automatically issues an official Gate Pass number &amp; printable PDF with Security Gate Exit Clearance.
                  </span>
                </div>
              )}
            </div>

            {formError && (
              <div className="mx-5 sm:mx-6 mt-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium shrink-0">
                <i className="fas fa-circle-exclamation mr-1.5"></i>
                {formError}
              </div>
            )}

            {/* Main 2-column Picker & Cart */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
              {/* Left: Catalog Picker */}
              <div className="lg:col-span-7 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200">
                <div className="p-4 border-b border-slate-200 space-y-2.5 shrink-0">
                  <div className="relative">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search fittings or tools (e.g. socket, switch, cable, MCB)..."
                      className="w-full pl-8 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs sm:text-sm focus:border-primary focus:ring-primary"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                        aria-label="Clear item search"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Filter catalog by department"
                      value={filterDepartment}
                      onChange={(e) => setFilterDepartment(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
                    >
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d === 'All' ? 'All Departments' : d}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter catalog by category"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c === 'All' ? 'All Categories' : c}
                        </option>
                      ))}
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 ml-auto cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={inStockOnly}
                        onChange={(e) => setInStockOnly(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>In stock only</span>
                    </label>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[36vh] lg:max-h-none">
                  {filteredCatalog.length === 0 ? (
                    <div className="p-8 text-center text-xs sm:text-sm text-slate-500">
                      No inventory items match your search or filters.
                    </div>
                  ) : (
                    filteredCatalog.map((item) => {
                      const availableAssets = inStockAssetsByItem.get(item.id) || [];
                      const stockCount =
                        item.type === 'Asset'
                          ? availableAssets.length
                          : roundStockQuantity(item.quantity);
                      const consumableItem = isItemConsumable(item);
                      const hasPackConversion =
                        item.type === 'Consumable' &&
                        Boolean(item.purchaseUnit) &&
                        (item.unitsPerPurchase || 1) > 1;
                      const packEquivalent = hasPackConversion
                        ? roundStockQuantity(stockCount / (item.unitsPerPurchase || 1))
                        : 0;
                      const inCartQty = consumableInCartMap.get(item.id) || 0;
                      const draftQtyStr = quickQtyInputs[item.id] ?? '1';
                      const rawParsedDraft = Number(draftQtyStr);
                      const parsedDraftQty = roundStockQuantity(
                        Math.min(
                          stockCount,
                          Math.max(
                            0.01,
                            Number.isFinite(rawParsedDraft) && rawParsedDraft > 0
                              ? rawParsedDraft
                              : Math.min(1, stockCount),
                          ),
                        ),
                      );
                      const isExpanded = Boolean(expandedAssetIds[item.id]);
                      const selectedSerialCount = availableAssets.filter((a) =>
                        selectedAssetSet.has(a.id),
                      ).length;

                      return (
                        <div key={item.id} className="p-3 sm:px-4 hover:bg-slate-50/70 transition-colors">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                                  {item.name}
                                </p>
                                {item.type === 'Consumable' ? (
                                  consumableItem ? (
                                    <span className="px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-bold shrink-0">
                                      Consumable
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0">
                                      Returnable
                                    </span>
                                  )
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold shrink-0">
                                    Asset
                                  </span>
                                )}
                                {item.type === 'Consumable' && inCartQty > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold tabular-nums shrink-0">
                                    {inCartQty} {item.unit} in cart
                                  </span>
                                )}
                                {item.type === 'Asset' && selectedSerialCount > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold tabular-nums shrink-0">
                                    {selectedSerialCount} picked
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                {item.department || 'Central Store'} · {item.category || 'General'} ·{' '}
                                <span
                                  className={`font-semibold tabular-nums ${
                                    stockCount <= 0
                                      ? 'text-red-600'
                                      : stockCount < 10 && item.type === 'Consumable'
                                        ? 'text-amber-700'
                                        : 'text-emerald-700'
                                  }`}
                                >
                                  {stockCount} {item.type === 'Asset' ? 'serial(s)' : item.unit} available
                                </span>
                                {hasPackConversion && (
                                  <span className="text-slate-400">
                                    {' '}
                                    ({packEquivalent} {item.purchaseUnit} @ {item.unitsPerPurchase} {item.unit}/pack)
                                  </span>
                                )}
                              </p>
                            </div>

                            {item.type === 'Consumable' ? (
                              stockCount <= 0 ? (
                                <span className="text-[11px] font-semibold text-red-500 shrink-0">
                                  Out of stock
                                </span>
                              ) : inCartQty > 0 ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => addConsumableDelta(item, -1)}
                                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center"
                                    aria-label={`Decrease ${item.name}`}
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    step="any"
                                    min={0.01}
                                    max={stockCount}
                                    value={inCartQty}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (Number.isNaN(val) || val <= 0) return;
                                      setConsumableQuantity(item, val);
                                    }}
                                    className="w-16 h-7 text-center rounded-lg border border-sky-300 bg-sky-50/40 font-mono text-xs font-bold text-slate-900 tabular-nums"
                                    aria-label={`Quantity for ${item.name}`}
                                  />
                                  <button
                                    type="button"
                                    disabled={inCartQty >= stockCount}
                                    onClick={() => addConsumableDelta(item, 1)}
                                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs flex items-center justify-center"
                                    aria-label={`Increase ${item.name}`}
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="number"
                                    step="any"
                                    min={0.01}
                                    max={stockCount}
                                    value={draftQtyStr}
                                    onChange={(e) =>
                                      setQuickQtyInputs((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        setConsumableQuantity(item, parsedDraftQty);
                                      }
                                    }}
                                    className="w-16 h-8 text-center rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900 tabular-nums"
                                    aria-label={`Initial quantity in ${item.unit} for ${item.name}`}
                                  />
                                  <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
                                    {item.unit}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setConsumableQuantity(item, parsedDraftQty)}
                                    className="h-8 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap"
                                  >
                                    + Add
                                  </button>
                                </div>
                              )
                            ) : (
                              <button
                                type="button"
                                disabled={stockCount <= 0}
                                onClick={() =>
                                  setExpandedAssetIds((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                                className="h-8 px-2.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 disabled:opacity-40 text-sky-800 text-xs font-semibold whitespace-nowrap shrink-0"
                              >
                                {isExpanded ? 'Hide Serials' : 'Pick Serials'}
                              </button>
                            )}
                          </div>

                          {item.type === 'Asset' && isExpanded && availableAssets.length > 0 && (
                            <div className="mt-2.5 pl-2 border-l-2 border-sky-200 flex flex-wrap gap-1.5">
                              {availableAssets.map((asset) => {
                                const checked = selectedAssetSet.has(asset.id);
                                return (
                                  <button
                                    key={asset.id}
                                    type="button"
                                    onClick={() =>
                                      toggleAssetSelection(item, asset.id, asset.serialNumber)
                                    }
                                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold transition-colors inline-flex items-center gap-1.5 ${
                                      checked
                                        ? 'border-sky-600 bg-sky-600 text-white'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300'
                                    }`}
                                  >
                                    <i
                                      className={`fas ${checked ? 'fa-check-square' : 'fa-square'} text-[10px]`}
                                    ></i>
                                    <span>{asset.serialNumber}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right: Staged Issue Cart */}
              <div className="lg:col-span-5 flex flex-col min-h-0 bg-slate-50/50">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Issue Cart
                    </h3>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {cart.length} line{cart.length === 1 ? '' : 's'} · {totalUnitsInCart} total unit
                      {totalUnitsInCart === 1 ? '' : 's'}
                    </p>
                  </div>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Clear Cart
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70 max-h-[26vh] lg:max-h-none">
                  {cart.length === 0 ? (
                    <div className="p-6 text-center space-y-1.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <i className="fas fa-cart-plus"></i>
                      </div>
                      <p className="text-xs font-semibold text-slate-700">Your issue cart is empty</p>
                      <p className="text-[11px] text-slate-500">
                        Enter quantities and tap <strong>+ Add</strong> on sockets, switches, cables, or tools from the catalog list.
                      </p>
                    </div>
                  ) : (
                    cart.map((entry) => {
                      const item = inventoryMap.get(entry.inventoryId);
                      if (!item) return null;

                      if (entry.kind === 'Consumable') {
                        const consumableFlag = isItemConsumable(item);
                        return (
                          <div
                            key={`c-${entry.inventoryId}`}
                            className="px-4 py-2.5 flex items-center justify-between gap-2 bg-white/80"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-semibold text-slate-900 truncate">
                                  {item.name}
                                </p>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                    consumableFlag
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {consumableFlag ? 'Consumable' : 'Returnable'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 tabular-nums">
                                Max {item.quantity} {item.unit}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => addConsumableDelta(item, -1)}
                                className="w-6 h-6 rounded-md border border-slate-200 bg-white text-xs font-bold"
                              >
                                -
                              </button>
                              <span className="min-w-[3.25rem] px-1 text-center font-mono text-xs font-bold tabular-nums">
                                {entry.quantity} {item.unit}
                              </span>
                              <button
                                type="button"
                                disabled={entry.quantity >= item.quantity}
                                onClick={() => addConsumableDelta(item, 1)}
                                className="w-6 h-6 rounded-md border border-slate-200 bg-white disabled:opacity-40 text-xs font-bold"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => setConsumableQuantity(item, 0)}
                                className="ml-1 text-slate-400 hover:text-red-600 p-1"
                                aria-label={`Remove ${item.name} from cart`}
                              >
                                <i className="fas fa-times text-xs"></i>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={`a-${entry.assetId}`}
                          className="px-4 py-2.5 flex items-center justify-between gap-2 bg-white/80"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {item.name}
                            </p>
                            <p className="text-[11px] font-mono text-sky-700 truncate">
                              Serial: {entry.serialNumber}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              toggleAssetSelection(item, entry.assetId, entry.serialNumber)
                            }
                            className="text-slate-400 hover:text-red-600 p-1 shrink-0"
                            aria-label={`Remove ${entry.serialNumber} from cart`}
                          >
                            <i className="fas fa-times text-xs"></i>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 bg-white flex flex-col gap-2.5 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleClose}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || cart.length === 0 || !recipientId}
                      className="min-h-[40px] flex-1 sm:flex-none px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white text-xs sm:text-sm font-bold shadow-xs disabled:opacity-50"
                    >
                      <i className="fas fa-boxes-packing mr-1.5"></i>
                      {submitting
                        ? 'Issuing Batch...'
                        : `Confirm & Issue (${cart.length})`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
