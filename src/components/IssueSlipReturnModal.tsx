import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  AssetCondition,
  IssueReturnLineInput,
  IssueSlip,
  VALIDATION_LIMITS,
  roundStockQuantity,
} from '../types';
import { generateIssueSlipPdf } from '../utils/issueReports';

interface LineDraft {
  qtyReturning: string;
  qtyDamaged: string;
  returnCondition: AssetCondition;
  returnNote: string;
}

export const IssueSlipReturnModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  slip: IssueSlip | null;
  isHodView?: boolean;
}> = ({ isOpen, onClose, slip, isHodView = false }) => {
  const { issues, recipients, inventory, settings, user, returnIssueSlip, showToast } =
    useAppContext();

  const liveSlip = useMemo(
    () => (slip ? issues.find((s) => s.id === slip.id) || slip : null),
    [issues, slip],
  );

  const [drafts, setDrafts] = useState<Record<number, LineDraft>>({});
  const [submitting, setSubmitting] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen || !liveSlip) return;
    const initial: Record<number, LineDraft> = {};
    liveSlip.lines.forEach((line, index) => {
      if (!line.returnable) return;
      const remaining = roundStockQuantity(Math.max(0, line.qtyIssued - line.qtyReturned));
      initial[index] = {
        qtyReturning: remaining > 0 ? String(remaining) : '0',
        qtyDamaged: '0',
        returnCondition: 'Good',
        returnNote: '',
      };
    });
    setDrafts(initial);
    setFormError('');
    setSubmitting(false);
    // Reset drafts only when modal opens or slip changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, liveSlip?.id]);

  const recipientObj = useMemo(() => {
    if (!liveSlip) return null;
    if (liveSlip.recipientId) {
      const byId = recipients.find((r) => r.id === liveSlip.recipientId);
      if (byId) return byId;
    }
    const targetName = (liveSlip.recipientName || liveSlip.recipient || '').trim().toLowerCase();
    return targetName
      ? recipients.find((r) => r.name.trim().toLowerCase() === targetName) || null
      : null;
  }, [liveSlip, recipients]);

  if (!isOpen || !liveSlip) return null;

  const returnableLines = liveSlip.lines
    .map((line, index) => ({
      line,
      index,
      remaining: roundStockQuantity(Math.max(0, line.qtyIssued - line.qtyReturned)),
    }))
    .filter((entry) => entry.line.returnable);

  const consumableLines = liveSlip.lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => !entry.line.returnable);

  const pendingReturnable = returnableLines.filter((entry) => entry.remaining > 0);
  const isGatePass = Boolean(liveSlip.requiresGatePass || liveSlip.scope === 'Outside School');
  const displayRecipient = liveSlip.recipientName || liveSlip.recipient || 'Recipient';

  const updateDraft = (index: number, patch: Partial<LineDraft>) => {
    setDrafts((prev) => {
      const current = prev[index] || {
        qtyReturning: '0',
        qtyDamaged: '0',
        returnCondition: 'Good' as AssetCondition,
        returnNote: '',
      };
      return {
        ...prev,
        [index]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const handleReturnAllAsGood = async () => {
    if (submitting || isHodView || pendingReturnable.length === 0) return;
    setFormError('');
    setSubmitting(true);
    try {
      const res = await returnIssueSlip({
        issueId: liveSlip.id,
        mode: 'all_good',
      });
      if (res) {
        onClose();
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to return all pending items as Good.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || isHodView || pendingReturnable.length === 0) return;
    setFormError('');

    const payloadLines: IssueReturnLineInput[] = [];
    for (const { line, index, remaining } of pendingReturnable) {
      const draft = drafts[index];
      if (!draft) continue;
      const qtyReturning = roundStockQuantity(Number(draft.qtyReturning) || 0);
      if (qtyReturning <= 0) continue;

      if (qtyReturning > remaining + 0.0001) {
        setFormError(
          `Cannot return ${qtyReturning} for "${line.name}" — only ${remaining} ${line.unit || 'units'} remaining unreturned.`,
        );
        return;
      }

      const rawDamaged = Number(draft.qtyDamaged || 0);
      if (!Number.isFinite(rawDamaged) || rawDamaged < 0 || rawDamaged > qtyReturning + 0.0001) {
        setFormError(
          `Damaged quantity for "${line.name}" must be between 0 and ${qtyReturning}.`,
        );
        return;
      }

      const qtyDamaged =
        line.assetId && draft.returnCondition === 'Obsolete'
          ? qtyReturning
          : roundStockQuantity(rawDamaged);

      payloadLines.push({
        lineIndex: index,
        qtyReturning,
        qtyDamaged,
        returnCondition: draft.returnCondition,
        returnNote: draft.returnNote.trim(),
      });
    }

    if (payloadLines.length === 0) {
      setFormError('Enter a return quantity greater than 0 for at least one pending line.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await returnIssueSlip({
        issueId: liveSlip.id,
        mode: 'custom',
        lines: payloadLines,
      });
      if (res) {
        onClose();
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save return check on this slip.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintPdf = async () => {
    if (printingPdf) return;
    setPrintingPdf(true);
    try {
      await generateIssueSlipPdf({
        settings,
        recipient: recipientObj,
        slip: liveSlip,
        inventory,
        issuedByEmail: user?.email,
      });
    } catch (err) {
      console.error('Failed to generate issue slip PDF:', err);
      showToast('Failed to export Issue Slip PDF.', 'error');
    } finally {
      setPrintingPdf(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-surface rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-fade-in-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 shrink-0"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
                ISS-{liveSlip.id.slice(0, 6).toUpperCase()}
              </span>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                  liveSlip.status === 'closed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : liveSlip.status === 'partial'
                      ? 'bg-sky-100 text-sky-800'
                      : 'bg-amber-100 text-amber-800'
                }`}
              >
                {liveSlip.status}
              </span>
              {isGatePass && liveSlip.gatePassNumber && (
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono text-[11px] font-bold">
                  {liveSlip.gatePassNumber}
                </span>
              )}
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 mt-1 truncate">
              Issue Slip — {displayRecipient}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>
                Issued {new Date(liveSlip.dateIssued).toLocaleString()} by {liveSlip.issuedBy}
              </span>
              <span>
                · {liveSlip.scope}
                {liveSlip.usageLocation ? ` (${liveSlip.usageLocation})` : ''}
              </span>
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Close issue slip dialog"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmitCustom} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {formError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 font-medium">
                <i className="fas fa-circle-exclamation mr-1.5"></i>
                {formError}
              </div>
            )}

            {/* Quick Return All Bar */}
            {!isHodView && pendingReturnable.length > 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-xs sm:text-sm font-bold text-emerald-950">
                    Quick Slip Return ({pendingReturnable.length} pending returnable line
                    {pendingReturnable.length === 1 ? '' : 's'})
                  </p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Return every remaining returnable unit on this slip as Good, or edit damaged
                    quantities and inspection notes per line below.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleReturnAllAsGood()}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs shrink-0 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <i className="fas fa-check-double"></i>
                  )}
                  <span>Return all as Good</span>
                </button>
              </div>
            )}

            {/* Returnable Lines Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Returnable Items ({returnableLines.length})
                </h3>
                {returnableLines.length > 0 && pendingReturnable.length === 0 && (
                  <span className="text-xs font-semibold text-emerald-700">
                    <i className="fas fa-circle-check mr-1"></i>All returnables returned
                  </span>
                )}
              </div>

              {returnableLines.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  This slip contains consumables only — no items require return inspection.
                </div>
              ) : (
                <div className="space-y-3">
                  {returnableLines.map(({ line, index, remaining }) => {
                    const isAsset = Boolean(line.assetId);
                    const isDone = remaining <= 0;
                    const draft = drafts[index] || {
                      qtyReturning: String(remaining),
                      qtyDamaged: '0',
                      returnCondition: 'Good' as AssetCondition,
                      returnNote: '',
                    };
                    const numericReturning = roundStockQuantity(Number(draft.qtyReturning) || 0);
                    const numericDamaged =
                      isAsset && draft.returnCondition === 'Obsolete'
                        ? numericReturning
                        : Math.min(
                            numericReturning,
                            Math.max(0, roundStockQuantity(Number(draft.qtyDamaged) || 0)),
                          );
                    const usablePreview = roundStockQuantity(
                      Math.max(0, numericReturning - numericDamaged),
                    );

                    return (
                      <div
                        key={`${line.inventoryId}-${line.assetId || index}`}
                        className={`rounded-2xl border p-4 space-y-3 ${
                          isDone
                            ? 'border-emerald-200/80 bg-emerald-50/30'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-sm text-slate-900">{line.name}</p>
                              {line.serialNumber && (
                                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-mono text-[11px] font-semibold">
                                  {line.serialNumber}
                                </span>
                              )}
                              {isDone ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                  Returned
                                  {line.returnCondition ? ` · ${line.returnCondition}` : ''}
                                </span>
                              ) : line.qtyReturned > 0 ? (
                                <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[11px] font-bold tabular-nums">
                                  Partial ({remaining} remaining)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">
                                  Pending Return
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1 tabular-nums flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>
                                Issued: <strong>{line.qtyIssued}</strong> {line.unit || 'Pcs'}
                              </span>
                              <span>
                                Returned: <strong>{line.qtyReturned}</strong> {line.unit || 'Pcs'}
                              </span>
                              {line.qtyDamaged > 0 && (
                                <span className="text-red-700 font-semibold">
                                  Damaged: {line.qtyDamaged} {line.unit || 'Pcs'}
                                </span>
                              )}
                              {line.returnDate && (
                                <span>Due: {new Date(line.returnDate).toLocaleDateString()}</span>
                              )}
                            </p>
                            {isDone && line.returnNote && (
                              <p className="text-xs text-slate-600 italic mt-1">
                                “{line.returnNote}”
                              </p>
                            )}
                          </div>
                        </div>

                        {!isHodView && !isDone && (
                          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Qty Returning (max {remaining})
                              </label>
                              {isAsset ? (
                                <select
                                  value={draft.qtyReturning === '1' ? '1' : '0'}
                                  disabled={submitting}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateDraft(index, {
                                      qtyReturning: val,
                                      qtyDamaged:
                                        val === '0'
                                          ? '0'
                                          : draft.returnCondition === 'Obsolete'
                                            ? '1'
                                            : '0',
                                    });
                                  }}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                                >
                                  <option value="1">1 (Return Asset)</option>
                                  <option value="0">0 (Skip for now)</option>
                                </select>
                              ) : (
                                <input
                                  type="number"
                                  step="any"
                                  min={0}
                                  max={remaining}
                                  disabled={submitting}
                                  value={draft.qtyReturning}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateDraft(index, { qtyReturning: val });
                                  }}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
                                />
                              )}
                            </div>

                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Condition on Return
                              </label>
                              <select
                                value={draft.returnCondition}
                                disabled={submitting}
                                onChange={(e) => {
                                  const nextCond = e.target.value as AssetCondition;
                                  updateDraft(index, {
                                    returnCondition: nextCond,
                                    ...(isAsset
                                      ? {
                                          qtyDamaged:
                                            nextCond === 'Obsolete' && draft.qtyReturning === '1'
                                              ? '1'
                                              : '0',
                                        }
                                      : nextCond === 'Obsolete' &&
                                          (Number(draft.qtyDamaged) || 0) === 0
                                        ? { qtyDamaged: draft.qtyReturning }
                                        : nextCond !== 'Obsolete' &&
                                            Number(draft.qtyDamaged) === Number(draft.qtyReturning)
                                          ? { qtyDamaged: '0' }
                                          : {}),
                                  });
                                }}
                                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                              >
                                <option value="Good">Good — Intact</option>
                                <option value="Serviceable">Serviceable — Minor Wear</option>
                                <option value="Obsolete">Obsolete — Unusable</option>
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Damaged Qty
                              </label>
                              <input
                                type="number"
                                step="any"
                                min={0}
                                max={numericReturning}
                                disabled={submitting || isAsset || numericReturning <= 0}
                                value={
                                  isAsset
                                    ? draft.returnCondition === 'Obsolete' &&
                                      draft.qtyReturning === '1'
                                      ? '1'
                                      : '0'
                                    : draft.qtyDamaged
                                }
                                onChange={(e) => updateDraft(index, { qtyDamaged: e.target.value })}
                                className="w-full rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                              />
                            </div>

                            <div className="sm:col-span-4">
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Inspection Note
                              </label>
                              <input
                                type="text"
                                maxLength={VALIDATION_LIMITS.MAX_RETURN_NOTE_LENGTH}
                                disabled={submitting}
                                value={draft.returnNote}
                                onChange={(e) => updateDraft(index, { returnNote: e.target.value })}
                                placeholder="Optional return / damage note..."
                                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                              />
                            </div>

                            {numericReturning > 0 && (
                              <div className="sm:col-span-12 flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
                                <span className="text-emerald-700 font-semibold">
                                  Restoring to usable stock: {usablePreview} {line.unit || 'Pcs'}
                                </span>
                                {numericDamaged > 0 && (
                                  <span className="text-red-700 font-semibold">
                                    Recording damaged: {numericDamaged} {line.unit || 'Pcs'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Non-Returnable Consumables (Read-Only) */}
            {consumableLines.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Non-Returnable Consumables (Never Returned) — {consumableLines.length}
                </h3>
                <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/70">
                  {consumableLines.map(({ line, index }) => (
                    <div
                      key={`${line.inventoryId}-${index}`}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{line.name}</p>
                        <p className="text-[11px] text-slate-500">
                          Consumable — Deducted permanently on issue
                        </p>
                      </div>
                      <span className="font-mono font-bold text-slate-700 tabular-nums shrink-0">
                        × {line.qtyIssued} {line.unit || 'Pcs'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 shrink-0 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">
            <button
              type="button"
              disabled={printingPdf || submitting}
              onClick={() => void handlePrintPdf()}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5 ${
                isGatePass ? 'bg-amber-700 hover:bg-amber-800' : 'bg-sky-700 hover:bg-sky-800'
              } disabled:opacity-50`}
            >
              <i className="fas fa-file-pdf"></i>
              <span>
                {printingPdf
                  ? 'Preparing PDF...'
                  : isGatePass
                    ? 'Gate Pass PDF'
                    : 'Issue Slip PDF'}
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>
              {!isHodView && pendingReturnable.length > 0 && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white text-xs font-bold shadow-xs inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting && <i className="fas fa-spinner fa-spin"></i>}
                  <span>Confirm Line Return(s)</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
