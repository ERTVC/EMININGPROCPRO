import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { IssueLogEntry, IssueSlip, roundStockQuantity } from '../types';
import { generateBulkIssueVoucherPdf, generateIssueSlipPdf } from '../utils/issueReports';

export function getIssueBatchKey(log: IssueLogEntry): string {
  if (log.gatePassNumber) {
    return `gp:${log.recipientId}:${log.gatePassNumber}`;
  }
  return `ts:${log.recipientId}:${log.dateIssued}:${log.usageScope || ''}:${log.usageLocation || ''}`;
}

export const RecipientDispatchModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  recipientId: string | null;
  recipientNameFallback?: string;
  initialSlipId?: string | null;
  batchKey?: string | null;
  isHodView?: boolean;
  onOpenIssueSlip?: (slip: IssueSlip) => void;
}> = ({
  isOpen,
  onClose,
  recipientId,
  recipientNameFallback = '',
  initialSlipId = null,
  batchKey = null,
  isHodView = false,
  onOpenIssueSlip,
}) => {
  const {
    issues,
    issueLog,
    issueRequests,
    recipients,
    inventory,
    settings,
    user,
    showToast,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<'slips' | 'legacy' | 'requests'>(
    batchKey ? 'legacy' : 'slips',
  );
  const [printingPdfId, setPrintingPdfId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(batchKey ? 'legacy' : 'slips');
  }, [isOpen, batchKey, initialSlipId, recipientId]);

  const recipient = useMemo(
    () => (recipientId ? recipients.find((r) => r.id === recipientId) || null : null),
    [recipients, recipientId],
  );

  const inventoryMap = useMemo(
    () => new Map(inventory.map((item) => [item.id, item])),
    [inventory],
  );

  const recipientSlips = useMemo(() => {
    const cleanFallback = recipientNameFallback.trim().toLowerCase();
    const recNameLower = (recipient?.name || cleanFallback).trim().toLowerCase();
    return issues
      .filter((slip) => {
        if (recipientId && slip.recipientId === recipientId) return true;
        if (recNameLower) {
          const slipName = (slip.recipientName || slip.recipient || '').trim().toLowerCase();
          return slipName === recNameLower;
        }
        return false;
      })
      .sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime());
  }, [issues, recipientId, recipient, recipientNameFallback]);

  const legacyRecipientLogs = useMemo(() => {
    if (batchKey) {
      return issueLog
        .filter((l) => getIssueBatchKey(l) === batchKey)
        .sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime());
    }
    if (!recipientId) return [];
    return issueLog
      .filter((l) => l.recipientId === recipientId)
      .sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime());
  }, [issueLog, recipientId, batchKey]);

  const displayName =
    recipient?.name ||
    recipientSlips[0]?.recipientName ||
    recipientSlips[0]?.recipient ||
    legacyRecipientLogs[0]?.recipientName ||
    recipientNameFallback ||
    'Recipient';

  const matchingRequests = useMemo(() => {
    const key = displayName.trim().toLowerCase();
    if (!key) return [];
    return issueRequests.filter(
      (r) => (r.recipientName || '').trim().toLowerCase() === key,
    );
  }, [issueRequests, displayName]);

  if (!isOpen || (!recipientId && !recipientNameFallback && !initialSlipId)) return null;

  const handlePrintSlipPdf = async (slip: IssueSlip) => {
    setPrintingPdfId(slip.id);
    try {
      await generateIssueSlipPdf({
        settings,
        recipient,
        slip,
        inventory,
        issuedByEmail: user?.email,
      });
    } catch (err) {
      console.error('Failed to generate slip PDF:', err);
      showToast('Failed to export Issue Slip PDF.', 'error');
    } finally {
      setPrintingPdfId(null);
    }
  };

  const handlePrintLegacyPdf = async () => {
    if (legacyRecipientLogs.length === 0) return;
    setPrintingPdfId('legacy');
    try {
      await generateBulkIssueVoucherPdf({
        settings,
        recipient,
        logs: legacyRecipientLogs,
        inventory,
        issuedByEmail: user?.email,
      });
    } catch (err) {
      console.error('Failed to generate legacy voucher PDF:', err);
      showToast('Failed to export Legacy Voucher PDF.', 'error');
    } finally {
      setPrintingPdfId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 shrink-0"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-sky-600 text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 truncate">
                  {displayName}
                </h2>
                {recipient && (
                  <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold">
                    {recipient.type}
                    {recipient.regNumber ? ` · ${recipient.regNumber}` : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {recipientSlips.length} active issue slip{recipientSlips.length === 1 ? '' : 's'}
                {legacyRecipientLogs.length > 0
                  ? ` · ${legacyRecipientLogs.length} legacy record${legacyRecipientLogs.length === 1 ? '' : 's'}`
                  : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recipient details"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 sm:px-6 pt-3 pb-2 border-b border-slate-200 flex overflow-x-auto no-scrollbar gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('slips')}
            className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'slips'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Issue Slips ({recipientSlips.length})
          </button>
          {legacyRecipientLogs.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('legacy')}
              className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'legacy'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Legacy Log ({legacyRecipientLogs.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'requests'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            HOD Requests ({matchingRequests.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {activeTab === 'slips' ? (
            recipientSlips.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No issue slips recorded for {displayName} yet.
              </div>
            ) : (
              recipientSlips.map((slip) => {
                const isHighlighted = initialSlipId === slip.id;
                const isGatePass = Boolean(slip.requiresGatePass || slip.scope === 'Outside School');
                const returnablePendingCount = slip.lines.filter(
                  (l) => l.returnable && roundStockQuantity(l.qtyIssued - l.qtyReturned) > 0,
                ).length;
                const totalUnits = roundStockQuantity(
                  slip.lines.reduce((s, l) => s + l.qtyIssued, 0),
                );

                return (
                  <div
                    key={slip.id}
                    className={`p-4 space-y-2.5 ${isHighlighted ? 'bg-sky-50/50' : ''}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-800">
                            ISS-{slip.id.slice(0, 6).toUpperCase()}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              slip.status === 'closed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : slip.status === 'partial'
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {slip.status}
                          </span>
                          {isGatePass && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono text-[10px] font-bold">
                              {slip.gatePassNumber || 'Gate Pass'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          {new Date(slip.dateIssued).toLocaleString()} · {slip.lines.length} line
                          {slip.lines.length === 1 ? '' : 's'} ({totalUnits} units)
                          {slip.usageLocation ? ` · ${slip.usageLocation}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {onOpenIssueSlip && (
                          <button
                            type="button"
                            onClick={() => onOpenIssueSlip(slip)}
                            className={`min-h-[32px] px-3 py-1 rounded-xl text-xs font-semibold ${
                              !isHodView && returnablePendingCount > 0
                                ? 'bg-sky-600 hover:bg-sky-700 text-white'
                                : 'bg-slate-900 hover:bg-slate-800 text-white'
                            }`}
                          >
                            {!isHodView && returnablePendingCount > 0
                              ? `Return (${returnablePendingCount})`
                              : 'View Slip'}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={printingPdfId === slip.id}
                          onClick={() => void handlePrintSlipPdf(slip)}
                          className="min-h-[32px] px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-50"
                        >
                          <i className="fas fa-file-pdf mr-1"></i>PDF
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 divide-y divide-slate-200/60">
                      {slip.lines.map((line, idx) => {
                        const remaining = roundStockQuantity(
                          Math.max(0, line.qtyIssued - line.qtyReturned),
                        );
                        return (
                          <div
                            key={`${line.inventoryId}-${line.assetId || idx}`}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-900">{line.name}</span>
                              {line.serialNumber && (
                                <span className="ml-1.5 font-mono text-[11px] text-indigo-700">
                                  ({line.serialNumber})
                                </span>
                              )}
                              <span className="block text-[11px] text-slate-500">
                                {!line.returnable
                                  ? 'Consumable (Non-Returnable)'
                                  : remaining <= 0
                                    ? `Returned${line.returnCondition ? ` · ${line.returnCondition}` : ''}${
                                        line.qtyDamaged > 0 ? ` · ${line.qtyDamaged} damaged` : ''
                                      }`
                                    : line.qtyReturned > 0
                                      ? `${line.qtyReturned} returned · ${remaining} pending`
                                      : 'Pending Return'}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-slate-800 tabular-nums shrink-0">
                              × {line.qtyIssued} {line.unit || 'Pcs'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )
          ) : activeTab === 'legacy' ? (
            legacyRecipientLogs.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No historical legacy records found.
              </div>
            ) : (
              legacyRecipientLogs.map((log) => {
                const inv = inventoryMap.get(log.inventoryId);
                const isNonReturnable =
                  log.returned && !log.assetId && log.isConsumable !== false && !log.dateReturned;
                return (
                  <div
                    key={log.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-sm text-slate-900 truncate">
                          {log.itemName}
                        </p>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                          Legacy · Read-Only
                        </span>
                        {isNonReturnable ? (
                          <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold">
                            Consumable
                          </span>
                        ) : !log.returned ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            Pending Return
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            Returned{log.returnCondition ? ` · ${log.returnCondition}` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {inv?.department || 'Central Store'} · Issued{' '}
                        {new Date(log.dateIssued).toLocaleDateString()}
                        {log.serialNumber ? ` · ${log.serialNumber}` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-900 tabular-nums shrink-0">
                      × {log.quantity} {log.unit || inv?.unit || 'Pcs'}
                    </span>
                  </div>
                );
              })
            )
          ) : matchingRequests.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No formal HOD issue request messages recorded under {displayName}.
            </div>
          ) : (
            matchingRequests.map((req) => (
              <div key={req.id} className="p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-slate-900">
                      {req.itemName}{' '}
                      <span className="font-mono text-xs text-slate-600 tabular-nums">
                        × {req.quantity} {req.unit}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {req.department} · Requested by {req.requestedByName}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                      req.status === 'Pending'
                        ? 'bg-amber-100 text-amber-800'
                        : req.status === 'Issued'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
                <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
                  “{req.message}”
                </p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 shrink-0 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">
          {activeTab === 'legacy' && legacyRecipientLogs.length > 0 && (
            <button
              type="button"
              disabled={printingPdfId === 'legacy'}
              onClick={() => void handlePrintLegacyPdf()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <i className="fas fa-file-pdf"></i>
              <span>Export Legacy PDF</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold ml-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

