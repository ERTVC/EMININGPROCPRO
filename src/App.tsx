import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from './context/AppContext';
import {
  AssetCondition,
  AssetItem,
  DisposalLogEntry,
  DisposalMethod,
  InventoryItem,
  IssueLogEntry,
  IssueRequest,
  IssueRequestUrgency,
  IssueSlip,
  Recipient,
  RecipientType,
  UsageScope,
  UserRole,
  VALIDATION_LIMITS,
  getItemDamagedQty,
  isItemConsumable,
  roundStockQuantity,
} from './types';
import {
  DEFAULT_INSTITUTION_NAME,
  ERTVC_LOGO_PATH,
  addOfficialHeaderToPdf,
  resizeImageToPngDataUrl,
  sanitizeLogoDataUrl,
} from './utils/logo';
import { NeumorphicAccessScreen, NeumorphicLoginScreen } from './components/NeumorphicAuthShell';
import { DashboardHome } from './components/DashboardHome';
import { ErpNavItem, ErpSidebar } from './components/ErpSidebar';
import { MobileBottomDock } from './components/MobileBottomDock';
import { IGAHubPage } from './components/IGAHubPage';
import { BudgetsPage } from './components/BudgetsPage';
import { BulkIssueModal } from './components/BulkIssueModal';
import { IssueSlipReturnModal } from './components/IssueSlipReturnModal';
import { RecipientDispatchModal, getIssueBatchKey } from './components/RecipientDispatchModal';
import { StockTakingSection } from './components/StockTakingSection';
import { generateIGASummaryPdf } from './utils/igaReports';
import { generateBulkIssueVoucherPdf, generateIssueSlipPdf } from './utils/issueReports';
import { STANDARD_TVET_DEPARTMENTS } from './utils/sampleData';

function getIssueStatusDisplay(log: IssueLogEntry): {
  label: string;
  pdfLabel: string;
  badgeClass: string;
  textClass: string;
  icon: string;
  tileClass: string;
} {
  if (!log.returned) {
    return {
      label: 'Pending Return',
      pdfLabel: 'Pending Return',
      badgeClass: 'bg-amber-50 text-amber-700',
      textClass: 'text-amber-700',
      icon: 'fa-clock',
      tileClass: 'bg-amber-50 text-amber-600',
    };
  }
  if (!log.assetId && log.isConsumable !== false && !log.dateReturned) {
    return {
      label: 'Non-Returnable',
      pdfLabel: 'Consumable (Non-Returnable)',
      badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200/70',
      textClass: 'text-sky-700',
      icon: 'fa-box-open',
      tileClass: 'bg-sky-50 text-sky-600',
    };
  }
  return {
    label: 'Returned',
    pdfLabel: 'Returned',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    textClass: 'text-emerald-700',
    icon: 'fa-circle-check',
    tileClass: 'bg-emerald-50 text-emerald-600',
  };
}

const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-50 flex justify-center items-end sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className={`bg-surface rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 w-full ${maxWidth} relative animate-fade-in-down max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3"
          aria-hidden="true"
        />
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="font-display text-lg sm:text-xl font-bold text-text-primary leading-snug">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const InventoryFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    data: {
      name: string;
      category: string;
      department: string;
      type: 'Asset' | 'Consumable';
      quantity: number;
      unit: string;
      isIGA: boolean;
      isConsumable: boolean;
      purchaseUnit: string;
      unitsPerPurchase: number;
      condition: string;
    },
    serials: string[],
  ) => Promise<void>;
  item: InventoryItem | null;
  lockedDepartment?: string;
  defaultDepartment?: string;
}> = ({ isOpen, onClose, onSave, item, lockedDepartment, defaultDepartment = '' }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [type, setType] = useState<'Asset' | 'Consumable'>('Consumable');
  const [isConsumable, setIsConsumable] = useState(true);
  const [quantity, setQuantity] = useState<number | string>(0);
  const [unit, setUnit] = useState('Pcs');
  const [boughtInBulk, setBoughtInBulk] = useState(false);
  const [purchaseUnit, setPurchaseUnit] = useState('Rolls');
  const [unitsPerPurchase, setUnitsPerPurchase] = useState<number | string>(90);
  const [bulkPacksInput, setBulkPacksInput] = useState<number | string>(1);
  const [isIGA, setIsIGA] = useState(false);
  const [itemCondition, setItemCondition] = useState<AssetCondition>('Good');
  const [serials, setSerials] = useState('');
  const [formError, setFormError] = useState('');

  const departmentChoices = useMemo(() => {
    const current = (lockedDepartment || item?.department || defaultDepartment || '').trim();
    if (
      current &&
      !STANDARD_TVET_DEPARTMENTS.some((d) => d.toLowerCase() === current.toLowerCase())
    ) {
      return [...STANDARD_TVET_DEPARTMENTS, current];
    }
    return STANDARD_TVET_DEPARTMENTS;
  }, [lockedDepartment, item, defaultDepartment]);

  useEffect(() => {
    setFormError('');
    if (item) {
      setName(item.name);
      setCategory(item.category);
      setDepartment(lockedDepartment || item.department);
      setType(item.type);
      setIsConsumable(isItemConsumable(item));
      setQuantity(item.quantity);
      setUnit(item.unit || 'Pcs');
      const hasBulk = Boolean(item.purchaseUnit) && (item.unitsPerPurchase || 1) > 1;
      setBoughtInBulk(hasBulk);
      setPurchaseUnit(item.purchaseUnit || 'Rolls');
      setUnitsPerPurchase(item.unitsPerPurchase && item.unitsPerPurchase > 1 ? item.unitsPerPurchase : 90);
      setBulkPacksInput(1);
      setIsIGA(item.isIGA);
      setItemCondition(
        item.condition === 'Serviceable' || item.condition === 'Obsolete'
          ? item.condition
          : 'Good',
      );
      setSerials('');
    } else {
      setName('');
      setCategory('');
      setDepartment(lockedDepartment || defaultDepartment || '');
      setType('Consumable');
      setIsConsumable(true);
      setQuantity(0);
      setUnit('Pcs');
      setBoughtInBulk(false);
      setPurchaseUnit('Rolls');
      setUnitsPerPurchase(90);
      setBulkPacksInput(1);
      setIsIGA(false);
      setItemCondition('Good');
      setSerials('');
    }
  }, [item, isOpen, lockedDepartment, defaultDepartment]);

  const parsedUnitsPerPack = Math.max(1, roundStockQuantity(Number(unitsPerPurchase) || 1));
  const parsedQty = roundStockQuantity(Number(quantity) || 0);
  const packEquivalent =
    boughtInBulk && parsedUnitsPerPack > 0
      ? roundStockQuantity(parsedQty / parsedUnitsPerPack)
      : 0;

  const handleToggleBulkPurchase = (checked: boolean) => {
    setBoughtInBulk(checked);
    if (checked && !item) {
      if (unit === 'Pcs' || unit === 'Rolls') {
        setUnit('Meters');
      }
      const packs = Math.max(0, roundStockQuantity(Number(bulkPacksInput) || 1));
      const perPack = Math.max(1, roundStockQuantity(Number(unitsPerPurchase) || 90));
      setUnitsPerPurchase(perPack);
      setQuantity(roundStockQuantity(packs * perPack));
    }
  };

  const handleApplyRestockPacks = () => {
    const packsToAdd = roundStockQuantity(Number(bulkPacksInput) || 0);
    if (packsToAdd <= 0) return;
    const addedBaseUnits = roundStockQuantity(packsToAdd * parsedUnitsPerPack);
    setQuantity(roundStockQuantity(parsedQty + addedBaseUnits));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const serialList = serials
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (type === 'Asset' && !item && serialList.length === 0) {
      setFormError('Please enter at least one serial number for assets.');
      return;
    }
    if (type === 'Consumable' && boughtInBulk && parsedUnitsPerPack <= 1) {
      setFormError('Units per Roll/Pack must be greater than 1.');
      return;
    }
    await onSave(
      {
        name,
        category,
        department: lockedDepartment || department,
        type,
        quantity: type === 'Asset' ? 0 : roundStockQuantity(Number(quantity) || 0),
        unit,
        isIGA,
        isConsumable: type === 'Asset' ? false : isConsumable,
        purchaseUnit: type === 'Asset' || !boughtInBulk ? '' : purchaseUnit,
        unitsPerPurchase: type === 'Asset' || !boughtInBulk ? 1 : parsedUnitsPerPack,
        condition: type === 'Consumable' && !isConsumable ? itemCondition : item?.condition || 'N/A',
      },
      serialList,
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item ? 'Edit Item' : 'Add New Item'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && <p className="bg-red-100 text-red-700 p-2 rounded text-sm">{formError}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700">Item Name</label>
          <input
            type="text"
            maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Live Cable Red, 13A Twin Socket, Digital Multimeter"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            required
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_CATEGORY_LENGTH}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Electrical, Plumbing, Tools"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Department</label>
            <select
              value={lockedDepartment || department}
              disabled={Boolean(lockedDepartment)}
              onChange={(e) => setDepartment(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary disabled:bg-slate-100 disabled:text-slate-600"
            >
              {!lockedDepartment && <option value="">Central Store / General</option>}
              {departmentChoices.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            {lockedDepartment && (
              <p className="text-[11px] text-slate-500 mt-1">
                Scoped to your assigned HOD department ({lockedDepartment}).
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Tracking Mode</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'Asset' | 'Consumable')}
            disabled={!!item}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary disabled:bg-gray-200"
          >
            <option value="Consumable">
              Quantity / Length Stock (Supports both Returnable Fittings &amp; Consumables)
            </option>
            <option value="Asset">Serialized Asset (Individual Serial No. per unit)</option>
          </select>
          {item && (
            <p className="text-xs text-slate-500 mt-1">
              Tracking mode cannot be changed after creation, but you can switch Returnable vs. Consumable below.
            </p>
          )}
        </div>

        {type === 'Consumable' ? (
          <div className="space-y-4">
            {/* Explicit Returnable vs Consumable Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Is This Item Consumable or Returnable? *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsConsumable(false)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    !isConsumable
                      ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      <i className="fas fa-rotate-left text-amber-600 mr-1.5"></i>
                      Returnable Item
                    </span>
                    {!isConsumable && (
                      <i className="fas fa-check-circle text-amber-600 text-xs"></i>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    e.g. Sockets, lamp holders, switches. No serial number needed; checked for condition when returned.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setIsConsumable(true)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isConsumable
                      ? 'border-sky-600 bg-sky-50 ring-1 ring-sky-600'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      <i className="fas fa-box-open text-sky-600 mr-1.5"></i>
                      Consumable (Non-Returnable)
                    </span>
                    {isConsumable && (
                      <i className="fas fa-check-circle text-sky-600 text-xs"></i>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    e.g. Cuttable cables, welding rods, paper. Deducted permanently on issue.
                  </p>
                </button>
              </div>
            </div>

            {!isConsumable && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Current Stock Condition (for Returnable Fittings)
                </label>
                <select
                  value={itemCondition}
                  onChange={(e) => setItemCondition(e.target.value as AssetCondition)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
                >
                  <option value="Good">Good (Working &amp; Intact)</option>
                  <option value="Serviceable">Serviceable (Functional with Minor Wear)</option>
                  <option value="Obsolete">Obsolete (Damaged / Needs Replacement)</option>
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Issue / Stock Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
                >
                  <option value="Pcs">Pcs (Pieces)</option>
                  <option value="Meters">Meters (Length)</option>
                  <option value="Feet">Feet (Length)</option>
                  <option value="Kgs">Kgs</option>
                  <option value="Litres">Litres</option>
                  <option value="Box">Box</option>
                  <option value="Ream">Ream</option>
                  <option value="Rolls">Rolls</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Stock Quantity ({unit})
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary font-mono"
                  required
                />
                {boughtInBulk && parsedUnitsPerPack > 1 && (
                  <p className="text-[11px] text-sky-700 font-medium mt-1 tabular-nums">
                    Equivalent: <strong>{packEquivalent}</strong> {purchaseUnit} ({parsedUnitsPerPack} {unit}/{purchaseUnit.replace(/s$/i, '') || 'pack'})
                  </p>
                )}
              </div>
            </div>

            {/* Bulk Roll / Pack Conversion Helper */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={boughtInBulk}
                  onChange={(e) => handleToggleBulkPurchase(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div>
                  <span className="block text-xs font-bold text-slate-900">
                    Bought in Rolls / Packs and issued in smaller units (e.g., 1 Roll = 90 Meters)
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    Stores total stock in <strong>{unit}</strong> so issuing 1 {unit} automatically deducts 1 from inventory.
                  </span>
                </div>
              </label>

              {boughtInBulk && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Purchase Unit
                      </label>
                      <select
                        value={purchaseUnit}
                        onChange={(e) => setPurchaseUnit(e.target.value)}
                        className="mt-1 block w-full rounded-lg border-slate-300 bg-white text-xs sm:text-sm"
                      >
                        <option value="Rolls">Rolls</option>
                        <option value="Boxes">Boxes</option>
                        <option value="Cartons">Cartons</option>
                        <option value="Packets">Packets</option>
                        <option value="Bundles">Bundles</option>
                        <option value="Drums">Drums</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        {unit} per {purchaseUnit.replace(/s$/i, '') || 'pack'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={1.01}
                        value={unitsPerPurchase}
                        onChange={(e) => {
                          const nextPer = e.target.value;
                          setUnitsPerPurchase(nextPer);
                          if (!item) {
                            const packs = Math.max(0, roundStockQuantity(Number(bulkPacksInput) || 0));
                            const per = Math.max(1, roundStockQuantity(Number(nextPer) || 1));
                            setQuantity(roundStockQuantity(packs * per));
                          }
                        }}
                        className="mt-1 block w-full rounded-lg border-slate-300 bg-white text-xs sm:text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2 bg-white border border-sky-200 rounded-lg p-2.5">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[11px] font-semibold text-sky-900">
                        {item ? `Restock (+ Add ${purchaseUnit})` : `Number of ${purchaseUnit} Bought`}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={bulkPacksInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBulkPacksInput(val);
                          if (!item) {
                            const packs = Math.max(0, roundStockQuantity(Number(val) || 0));
                            setQuantity(roundStockQuantity(packs * parsedUnitsPerPack));
                          }
                        }}
                        className="mt-1 block w-full rounded-lg border-slate-300 text-xs font-mono"
                      />
                    </div>
                    {item ? (
                      <button
                        type="button"
                        onClick={handleApplyRestockPacks}
                        className="h-9 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shrink-0"
                      >
                        + Add {roundStockQuantity((Number(bulkPacksInput) || 0) * parsedUnitsPerPack)} {unit}
                      </button>
                    ) : (
                      <div className="text-[11px] text-sky-800 font-medium pb-1.5 tabular-nums">
                        = <strong>{parsedQty} {unit}</strong> total in stock
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          !item && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Serial Numbers</label>
              <textarea
                value={serials}
                onChange={(e) => setSerials(e.target.value)}
                rows={5}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
                placeholder="Enter each serial number on a new line"
              ></textarea>
            </div>
          )
        )}

        <div className="flex items-center">
          <input
            type="checkbox"
            checked={isIGA}
            onChange={(e) => setIsIGA(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label className="ml-2 block text-sm text-gray-900">
            Income-Generating Activity (IGA) Item?
          </label>
        </div>
        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg mr-2 hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white font-bold py-2 px-4 rounded-lg"
          >
            Save Item
          </button>
        </div>
      </form>
    </Modal>
  );
};

const Inventory: React.FC<{
  initialSearchTerm?: string;
  initialStockFilter?: 'all' | 'low' | 'out';
  openAddModalNonce?: number;
  isHodView?: boolean;
  hodDepartment?: string;
}> = ({
  initialSearchTerm = '',
  initialStockFilter = 'all',
  openAddModalNonce = 0,
  isHodView = false,
  hodDepartment = '',
}) => {
  const {
    inventory,
    assets,
    user,
    activeRole,
    demoRecordCount,
    addItem,
    updateItem,
    updateAsset,
    refreshDemonstrationData,
    showToast,
  } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<InventoryItem | null>(null);
  const [defaultModalDepartment, setDefaultModalDepartment] = useState('');
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>(initialStockFilter);
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [groupBy, setGroupBy] = useState<'department' | 'category'>('department');
  const [deptOnly, setDeptOnly] = useState(Boolean(isHodView && hodDepartment));
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [isBulkIssueModalOpen, setIsBulkIssueModalOpen] = useState(false);
  const [seedingAllDepts, setSeedingAllDepts] = useState(false);

  const isHodLocked = Boolean(isHodView && hodDepartment);
  const isAdminUser = activeRole === 'admin' || Boolean(user?.isBootstrappedAdmin);
  const missingDeptDemoCoverage = useMemo(() => {
    if (!isAdminUser || isHodLocked) return false;
    if (inventory.length === 0) return true;
    if (demoRecordCount === 0) return false;
    return STANDARD_TVET_DEPARTMENTS.some(
      (dept) =>
        !inventory.some(
          (item) => (item.department || '').trim().toLowerCase() === dept.trim().toLowerCase(),
        ),
    );
  }, [isAdminUser, isHodLocked, inventory, demoRecordCount]);

  useEffect(() => {
    setSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);

  useEffect(() => {
    setStockFilter(initialStockFilter);
  }, [initialStockFilter]);

  useEffect(() => {
    if (openAddModalNonce > 0) {
      setCurrentItem(null);
      setDefaultModalDepartment(isHodLocked ? hodDepartment : '');
      setIsModalOpen(true);
    }
  }, [openAddModalNonce, isHodLocked, hodDepartment]);

  useEffect(() => {
    setDeptOnly(isHodLocked);
    if (isHodLocked) {
      setFilterDepartment('All');
    }
  }, [isHodLocked]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(inventory.map((item) => item.category))).sort()],
    [inventory],
  );

  const allDepartmentsList = useMemo(() => {
    if (isHodLocked) {
      return [hodDepartment];
    }
    const merged = [...STANDARD_TVET_DEPARTMENTS];
    const seen = new Set(merged.map((d) => d.trim().toLowerCase()));
    inventory.forEach((item) => {
      const dept = (item.department || '').trim();
      if (dept && !seen.has(dept.toLowerCase())) {
        seen.add(dept.toLowerCase());
        merged.push(dept);
      }
    });
    return merged;
  }, [inventory, isHodLocked, hodDepartment]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'All' || item.category === filterCategory;
      const itemDept = (item.department || '').trim().toLowerCase();
      const matchesHodDept =
        !isHodLocked || itemDept === hodDepartment.trim().toLowerCase();
      const matchesDepartmentFilter =
        isHodLocked ||
        filterDepartment === 'All' ||
        (filterDepartment === '__unassigned__'
          ? itemDept === ''
          : itemDept === filterDepartment.trim().toLowerCase());
      const inStockQty =
        item.type === 'Asset'
          ? assets.filter((a) => a.inventoryId === item.id && a.status === 'In Stock').length
          : roundStockQuantity(item.quantity);
      const matchesStockFilter =
        stockFilter === 'all' ||
        (stockFilter === 'low' && item.type === 'Consumable' && inStockQty > 0 && inStockQty < 10) ||
        (stockFilter === 'out' && inStockQty <= 0);
      return (
        matchesSearch &&
        matchesCategory &&
        matchesHodDept &&
        matchesDepartmentFilter &&
        matchesStockFilter
      );
    });
  }, [
    inventory,
    assets,
    searchTerm,
    stockFilter,
    filterCategory,
    filterDepartment,
    isHodLocked,
    hodDepartment,
  ]);

  const groupedByCategory = useMemo(() => {
    return filteredInventory.reduce<Record<string, InventoryItem[]>>((acc, item) => {
      const category = item.category || 'Uncategorized';
      (acc[category] = acc[category] || []).push(item);
      return acc;
    }, {});
  }, [filteredInventory]);

  const departmentSections = useMemo(() => {
    const buckets = new Map<string, InventoryItem[]>();

    if (isHodLocked) {
      buckets.set(hodDepartment, []);
    } else if (filterDepartment !== 'All') {
      const targetName =
        filterDepartment === '__unassigned__' ? 'Central Store / General' : filterDepartment;
      buckets.set(targetName, []);
    } else {
      allDepartmentsList.forEach((dept) => buckets.set(dept, []));
    }

    const unassigned: InventoryItem[] = [];
    const lookupByLower = new Map<string, string>();
    buckets.forEach((_val, key) => lookupByLower.set(key.toLowerCase(), key));

    filteredInventory.forEach((item) => {
      const rawDept = (item.department || '').trim();
      if (!rawDept) {
        if (!isHodLocked) {
          unassigned.push(item);
        }
        return;
      }
      const existingKey = lookupByLower.get(rawDept.toLowerCase());
      if (existingKey) {
        buckets.get(existingKey)!.push(item);
      } else if (!isHodLocked) {
        lookupByLower.set(rawDept.toLowerCase(), rawDept);
        buckets.set(rawDept, [item]);
      }
    });

    const sections: Array<{
      key: string;
      label: string;
      isGeneral?: boolean;
      items: InventoryItem[];
    }> = [];

    buckets.forEach((items, dept) => {
      if (
        !isHodLocked &&
        (searchTerm.trim() !== '' || filterCategory !== 'All' || stockFilter !== 'all') &&
        items.length === 0 &&
        filterDepartment === 'All'
      ) {
        return;
      }
      sections.push({ key: `dept:${dept}`, label: dept, items });
    });

    if (!isHodLocked && (unassigned.length > 0 || filterDepartment === '__unassigned__')) {
      sections.push({
        key: 'dept:__unassigned__',
        label: 'Central Store / General',
        isGeneral: true,
        items: unassigned,
      });
    }

    return sections;
  }, [
    allDepartmentsList,
    filteredInventory,
    isHodLocked,
    hodDepartment,
    filterDepartment,
    searchTerm,
    stockFilter,
    filterCategory,
  ]);

  const toggleGroup = (groupKey: string) =>
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  const toggleItem = (itemId: string) =>
    setExpandedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));

  const openModal = (item: InventoryItem | null = null, prefillDepartment = '') => {
    setCurrentItem(item);
    setDefaultModalDepartment(prefillDepartment);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentItem(null);
    setDefaultModalDepartment('');
  };

  const handleSave = async (
    itemData: {
      name: string;
      category: string;
      department: string;
      type: 'Asset' | 'Consumable';
      quantity: number;
      unit: string;
      isIGA: boolean;
      isConsumable: boolean;
      purchaseUnit: string;
      unitsPerPurchase: number;
      condition: string;
    },
    serials: string[],
  ) => {
    if (currentItem) {
      await updateItem({ ...currentItem, ...itemData });
    } else if (itemData.type === 'Asset') {
      await addItem(itemData, serials);
    } else {
      await addItem({ ...itemData, quantity: roundStockQuantity(itemData.quantity) });
    }
    closeModal();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const wb = window.XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];
      let importedCount = 0;
      for (const row of rows) {
        const name = String(row['Item Name'] || row['name'] || '').trim();
        if (!name) continue;
        const rawType = String(row['Type (Asset/Consumable)'] || row['type'] || 'Consumable');
        if (rawType.toLowerCase().includes('asset')) continue;
        const rawConsumable = String(
          row['Is Consumable (Yes/No)'] ?? row['isConsumable'] ?? 'Yes',
        )
          .trim()
          .toLowerCase();
        const itemIsConsumable = rawConsumable !== 'no' && rawConsumable !== 'false';
        const pUnit = String(row['Purchase Unit'] || row['purchaseUnit'] || '').trim();
        const rawPerPack = Number(row['Units Per Pack'] || row['unitsPerPurchase'] || 1);
        const perPack = pUnit && Number.isFinite(rawPerPack) && rawPerPack > 1 ? roundStockQuantity(rawPerPack) : 1;
        await addItem({
          name,
          category: String(row['Category'] || row['category'] || 'General'),
          quantity: roundStockQuantity(Number(row['Quantity'] ?? row['quantity'] ?? 0) || 0),
          unit: String(row['Unit'] || row['unit'] || 'Pcs'),
          department:
            isHodView && hodDepartment
              ? hodDepartment
              : String(row['Department'] || row['department'] || ''),
          type: 'Consumable',
          condition: 'N/A',
          isIGA: String(row['Is IGA (Yes/No)'] || '').toLowerCase() === 'yes',
          isConsumable: itemIsConsumable,
          purchaseUnit: pUnit,
          unitsPerPurchase: perPack,
        });
        importedCount++;
      }
      showToast(`Imported ${importedCount} stock item(s).`, 'success');
      setIsImportModalOpen(false);
    } catch {
      showToast('Failed to parse Excel file.', 'error');
    }
  };

  const downloadTemplate = () => {
    const ws = window.XLSX.utils.json_to_sheet([
      {
        'Item Name': 'Live Cable Red',
        Category: 'Electrical',
        Quantity: 90,
        Unit: 'Meters',
        Department: 'Electrical',
        'Type (Asset/Consumable)': 'Consumable',
        'Is Consumable (Yes/No)': 'Yes',
        'Purchase Unit': 'Rolls',
        'Units Per Pack': 90,
        'Condition (for Assets)': 'N/A',
        'Is IGA (Yes/No)': 'No',
      },
      {
        'Item Name': '13A Twin Socket',
        Category: 'Electrical',
        Quantity: 30,
        Unit: 'Pcs',
        Department: 'Electrical',
        'Type (Asset/Consumable)': 'Consumable',
        'Is Consumable (Yes/No)': 'No',
        'Purchase Unit': '',
        'Units Per Pack': 1,
        'Condition (for Assets)': 'N/A',
        'Is IGA (Yes/No)': 'No',
      },
    ]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Inventory Template');
    window.XLSX.writeFile(wb, 'InventoryImportTemplate.xlsx');
  };

  const AssetEditModal: React.FC<{
    asset: AssetItem;
    onSave: (data: { condition: AssetCondition; serialNumber: string }) => Promise<void>;
    onCancel: () => void;
  }> = ({ asset, onSave, onCancel }) => {
    const [condition, setCondition] = useState<AssetCondition>(asset.condition);
    const [serialNumber, setSerialNumber] = useState(asset.serialNumber);

    return (
      <Modal isOpen={true} onClose={onCancel} title={`Edit Asset: ${asset.serialNumber}`}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave({ condition, serialNumber });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">Serial Number</label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_SERIAL_LENGTH}
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Condition</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as AssetCondition)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            >
              <option value="Good">Good</option>
              <option value="Serviceable">Serviceable</option>
              <option value="Obsolete">Obsolete</option>
            </select>
          </div>
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg mr-2 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-gradient-to-r from-primary to-primary-end text-white font-bold py-2 px-4 rounded-lg"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    );
  };

  const renderItemTable = (items: InventoryItem[], showDepartmentColumn: boolean) => (
    <div className="border-t border-slate-200">
      {/* Mobile Native App Tap List (< md) */}
      <div className="md:hidden divide-y divide-slate-100">
        {items.map((item) => {
          const inStockCount =
            item.type === 'Asset'
              ? assets.filter((a) => a.inventoryId === item.id && a.status === 'In Stock').length
              : roundStockQuantity(item.quantity);
          const consumableFlag = isItemConsumable(item);
          const hasPackConv =
            item.type === 'Consumable' &&
            Boolean(item.purchaseUnit) &&
            (item.unitsPerPurchase || 1) > 1;
          const packEquiv = hasPackConv
            ? roundStockQuantity(inStockCount / (item.unitsPerPurchase || 1))
            : 0;
          const canEditItem =
            !isHodView ||
            (Boolean(hodDepartment) &&
              (item.department || '').trim().toLowerCase() ===
                hodDepartment.trim().toLowerCase());
          const itemAssets = assets.filter((a) => a.inventoryId === item.id);
          return (
            <div key={item.id} className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm ${
                      item.type === 'Asset'
                        ? 'bg-sky-50 text-sky-700 border border-sky-100'
                        : consumableFlag
                          ? 'bg-slate-100 text-slate-600 border border-slate-200/70'
                          : 'bg-amber-50 text-amber-700 border border-amber-200/70'
                    }`}
                  >
                    <i
                      className={`fas ${
                        item.type === 'Asset'
                          ? 'fa-microchip'
                          : consumableFlag
                            ? 'fa-cubes'
                            : 'fa-rotate-left'
                      }`}
                    ></i>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{item.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {showDepartmentColumn
                        ? item.department || 'Central Store'
                        : item.category || 'Uncategorized'}{' '}
                      ·{' '}
                      <span
                        className={`font-semibold ${
                          item.type === 'Asset'
                            ? 'text-indigo-700'
                            : consumableFlag
                              ? 'text-sky-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {item.type === 'Asset'
                          ? 'Asset'
                          : consumableFlag
                            ? 'Consumable'
                            : item.condition && item.condition !== 'N/A'
                              ? `Returnable · ${item.condition}`
                              : 'Returnable'}
                      </span>
                    </p>
                    {hasPackConv && (
                      <p className="text-[11px] text-slate-400 tabular-nums truncate">
                        {packEquiv} {item.purchaseUnit} ({item.unitsPerPurchase} {item.unit}/{item.purchaseUnit?.replace(/s$/i, '') || 'pack'})
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <span
                    className={`inline-flex items-baseline gap-1 px-2.5 py-1 rounded-xl font-mono text-xs font-bold tabular-nums ${
                      inStockCount <= 0
                        ? 'bg-red-50 text-red-700'
                        : inStockCount < 10 && item.type === 'Consumable'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-sky-50 text-sky-800'
                    }`}
                  >
                    {inStockCount}
                    <span className="font-sans font-medium text-[10px] opacity-80">{item.unit}</span>
                  </span>
                  {getItemDamagedQty(item) > 0 && (
                    <span className="block font-mono text-[10px] font-semibold text-red-700 tabular-nums">
                      Damaged: {getItemDamagedQty(item)} {item.unit}
                    </span>
                  )}
                </div>
              </div>

              {(canEditItem || item.type === 'Asset') && (
                <div className="flex flex-wrap items-center gap-2 pl-[52px]">
                  {canEditItem && (
                    <button
                      type="button"
                      onClick={() => openModal(item)}
                      className="min-h-[34px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                    >
                      Edit
                    </button>
                  )}
                  {item.type === 'Asset' && (
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className="min-h-[34px] px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold"
                    >
                      {expandedItems[item.id] ? 'Hide Serials' : `Serials (${itemAssets.length})`}
                    </button>
                  )}
                </div>
              )}

              {expandedItems[item.id] && item.type === 'Asset' && (
                <div className="mt-2 ml-[52px] rounded-xl border border-slate-200 bg-slate-50/70 divide-y divide-slate-200/70">
                  {itemAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-slate-900 truncate">
                          {asset.serialNumber}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {asset.condition} · {asset.status}
                        </p>
                      </div>
                      {canEditItem && (
                        <button
                          type="button"
                          onClick={() => setEditingAsset(asset)}
                          className="text-xs font-semibold text-sky-700 shrink-0"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Data Table (md+) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-600">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-6 py-3">Item Name</th>
              {showDepartmentColumn && <th className="px-6 py-3">Department</th>}
              {!showDepartmentColumn && <th className="px-6 py-3">Category</th>}
              <th className="px-6 py-3">In Stock</th>
              <th className="px-6 py-3">Unit</th>
              <th className="px-6 py-3">Policy / Type</th>
              <th className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const inStockCount =
                item.type === 'Asset'
                  ? assets.filter((a) => a.inventoryId === item.id && a.status === 'In Stock').length
                  : roundStockQuantity(item.quantity);
              const consumableFlag = isItemConsumable(item);
              const hasPackConv =
                item.type === 'Consumable' &&
                Boolean(item.purchaseUnit) &&
                (item.unitsPerPurchase || 1) > 1;
              const packEquiv = hasPackConv
                ? roundStockQuantity(inStockCount / (item.unitsPerPurchase || 1))
                : 0;
              const canEditItem =
                !isHodView ||
                (Boolean(hodDepartment) &&
                  (item.department || '').trim().toLowerCase() ===
                    hodDepartment.trim().toLowerCase());
              return (
                <React.Fragment key={item.id}>
                  <tr className="bg-white border-b hover:bg-gray-50">
                    <th className="px-6 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                      {item.name}
                    </th>
                    <td className="px-6 py-3.5 text-slate-600">
                      {showDepartmentColumn
                        ? item.department || 'Central Store / General'
                        : item.category || 'Uncategorized'}
                    </td>
                    <td className="px-6 py-3.5 font-mono tabular-nums">
                      <span>{inStockCount}</span>
                      {getItemDamagedQty(item) > 0 && (
                        <span className="block text-[11px] font-sans font-semibold text-red-700">
                          Damaged: {getItemDamagedQty(item)} {item.unit}
                        </span>
                      )}
                      {hasPackConv && (
                        <span className="block text-[11px] font-sans text-slate-400">
                          {packEquiv} {item.purchaseUnit} ({item.unitsPerPurchase} {item.unit}/pack)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">{item.unit}</td>
                    <td className="px-6 py-3.5">
                      {item.type === 'Asset' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700">
                          Asset (Serial)
                        </span>
                      ) : consumableFlag ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-sky-50 text-sky-700">
                          Consumable
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-800">
                            Returnable
                          </span>
                          {item.condition && item.condition !== 'N/A' && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                item.condition === 'Obsolete'
                                  ? 'bg-red-50 text-red-700'
                                  : item.condition === 'Serviceable'
                                    ? 'bg-sky-50 text-sky-700'
                                    : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {item.condition}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3.5 space-x-4 whitespace-nowrap">
                      {canEditItem && (
                        <button
                          onClick={() => openModal(item)}
                          className="font-medium text-primary hover:underline"
                        >
                          Edit
                        </button>
                      )}
                      {item.type === 'Asset' && (
                        <button
                          onClick={() => toggleItem(item.id)}
                          className="font-medium text-sky-600 hover:underline"
                        >
                          View Serials
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedItems[item.id] && item.type === 'Asset' && (
                    <tr>
                      <td colSpan={6} className="p-4 bg-gray-50">
                        <h4 className="font-bold mb-2">Individual Assets for: {item.name}</h4>
                        <table className="w-full text-sm">
                          <thead className="bg-gray-200">
                            <tr>
                              <th className="px-4 py-2 text-left">Serial Number</th>
                              <th className="px-4 py-2 text-left">Condition</th>
                              <th className="px-4 py-2 text-left">Status</th>
                              {canEditItem && <th className="px-4 py-2 text-left">Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {assets
                              .filter((a) => a.inventoryId === item.id)
                              .map((asset) => (
                                <tr key={asset.id} className="border-b">
                                  <td className="px-4 py-2 font-mono">{asset.serialNumber}</td>
                                  <td className="px-4 py-2">{asset.condition}</td>
                                  <td className="px-4 py-2">{asset.status}</td>
                                  {canEditItem && (
                                    <td className="px-4 py-2">
                                      <button
                                        onClick={() => setEditingAsset(asset)}
                                        className="font-medium text-primary hover:underline text-xs"
                                      >
                                        Edit
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {editingAsset && (
        <AssetEditModal
          asset={editingAsset}
          onSave={async (updatedData) => {
            await updateAsset({ ...editingAsset, ...updatedData });
            setEditingAsset(null);
          }}
          onCancel={() => setEditingAsset(null)}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
            {isHodLocked ? `${hodDepartment} Inventory` : 'Inventory'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 tabular-nums">
            {isHodLocked
              ? `Add and manage consumables and serialized equipment assigned strictly to ${hodDepartment}.`
              : `Organized across all ${allDepartmentsList.length} college departments.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isHodLocked && (
            <button
              type="button"
              onClick={() => setIsBulkIssueModalOpen(true)}
              className="min-h-[42px] bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-800 font-semibold py-2 px-3.5 rounded-xl shadow-xs transition-colors text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1.5"
            >
              <i className="fas fa-boxes-packing"></i>
              <span>Bulk Issue</span>
            </button>
          )}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-3.5 rounded-xl shadow-xs transition-colors text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-file-import"></i>
            <span>Bulk Import</span>
          </button>
          <button
            onClick={() => openModal(null, isHodLocked ? hodDepartment : '')}
            className="min-h-[42px] bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white font-semibold py-2 px-4 rounded-xl shadow-xs transition-all text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <i className="fas fa-plus"></i>
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {missingDeptDemoCoverage && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-sky-950">
              {inventory.length === 0
                ? 'No Inventory Items Loaded Yet'
                : 'Some Departments Have No Demonstration Items Yet'}
            </p>
            <p className="text-xs text-sky-800 mt-0.5">
              Populate demonstration stock across all {STANDARD_TVET_DEPARTMENTS.length} departments &amp; offices (Principal&apos;s Office, Electrical, AGME, Food &amp; Beverage, Fashion, Kitchen, Sanitation, etc. — deletable anytime in Settings).
            </p>
          </div>
          <button
            type="button"
            disabled={seedingAllDepts}
            onClick={async () => {
              setSeedingAllDepts(true);
              try {
                await refreshDemonstrationData();
              } finally {
                setSeedingAllDepts(false);
              }
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shadow-xs shrink-0 disabled:opacity-60"
          >
            <i className="fas fa-database mr-1.5"></i>
            {seedingAllDepts
              ? 'Populating All Departments...'
              : `Populate All ${STANDARD_TVET_DEPARTMENTS.length} Depts & Offices (Demo)`}
          </button>
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center shadow-xs">
        <div className="relative flex-1">
          <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
          <input
            type="text"
            placeholder="Search items..."
            className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className={isHodLocked ? 'flex gap-2.5' : 'grid grid-cols-2 sm:flex gap-2.5'}>
          {!isHodLocked && (
            <select
              aria-label="Filter by department"
              className="py-2.5 px-3 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-xs sm:text-sm"
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
            >
              <option value="All">All Depts ({allDepartmentsList.length})</option>
              {allDepartmentsList.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
              <option value="__unassigned__">Central Store</option>
            </select>
          )}
          <select
            aria-label="Filter by category"
            className="py-2.5 px-3 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-xs sm:text-sm"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'All' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by stock status"
            className="py-2.5 px-3 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-xs sm:text-sm"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as 'all' | 'low' | 'out')}
          >
            <option value="all">All Stock Levels</option>
            <option value="low">Low Stock (&lt; 10)</option>
            <option value="out">Out of Stock (0)</option>
          </select>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-100 shrink-0">
          <button
            type="button"
            onClick={() => setGroupBy('department')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              groupBy === 'department' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            By Department
          </button>
          <button
            type="button"
            onClick={() => setGroupBy('category')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              groupBy === 'category' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            By Category
          </button>
        </div>
      </div>

      {groupBy === 'department' ? (
        <div className="space-y-3">
          {departmentSections.map((section) => {
            const isExpanded =
              Boolean(expandedGroups[section.key]) ||
              filterDepartment !== 'All' ||
              stockFilter !== 'all' ||
              searchTerm.trim() !== '' ||
              (isHodView && deptOnly);
            const totalUnits = section.items.reduce((sum, item) => {
              if (item.type === 'Asset') {
                return (
                  sum +
                  assets.filter((a) => a.inventoryId === item.id && a.status === 'In Stock').length
                );
              }
              return sum + (item.quantity || 0);
            }, 0);
            const canAddForSection =
              !isHodView ||
              (Boolean(hodDepartment) &&
                section.label.trim().toLowerCase() === hodDepartment.trim().toLowerCase());

            return (
              <div
                key={section.key}
                className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs"
              >
                <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(section.key)}
                    className="flex-1 text-left flex items-center gap-3 min-w-0 min-h-[44px]"
                    aria-expanded={isExpanded}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                        section.items.length > 0
                          ? 'bg-sky-50 text-sky-700 border border-sky-100'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <i className="fas fa-layer-group"></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-display font-bold text-sm sm:text-base text-text-primary truncate block">
                        {section.label}
                      </span>
                      <span className="text-xs text-text-secondary tabular-nums">
                        {section.items.length} item{section.items.length === 1 ? '' : 's'} ·{' '}
                        {totalUnits} units in stock
                      </span>
                    </div>
                    <i
                      className={`fas fa-chevron-down text-slate-400 text-xs transition-transform duration-200 shrink-0 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    ></i>
                  </button>
                  {canAddForSection && (
                    <button
                      type="button"
                      onClick={() => openModal(null, section.isGeneral ? '' : section.label)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      <i className="fas fa-plus mr-1"></i>Add
                    </button>
                  )}
                </div>

                {isExpanded &&
                  (section.items.length > 0 ? (
                    renderItemTable(section.items, false)
                  ) : (
                    <div className="px-4 sm:px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
                      <span>No inventory items recorded under {section.label} yet.</span>
                      {canAddForSection && (
                        <button
                          type="button"
                          onClick={() => openModal(null, section.isGeneral ? '' : section.label)}
                          className="text-sky-700 font-semibold hover:underline self-start sm:self-auto"
                        >
                          + Add first item to {section.label}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.keys(groupedByCategory)
            .sort()
            .map((category) => (
              <div
                key={category}
                className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(`cat:${category}`)}
                  className="w-full text-left p-4 flex justify-between items-center min-h-[52px]"
                  aria-expanded={!!expandedGroups[`cat:${category}`]}
                >
                  <span className="font-display font-bold text-sm sm:text-base text-text-primary tabular-nums">
                    {category} ({groupedByCategory[category].length} items)
                  </span>
                  <i
                    className={`fas fa-chevron-down text-slate-400 text-xs transition-transform duration-200 ${
                      expandedGroups[`cat:${category}`] ? 'rotate-180' : ''
                    }`}
                  ></i>
                </button>
                {expandedGroups[`cat:${category}`] &&
                  renderItemTable(groupedByCategory[category], true)}
              </div>
            ))}
          {Object.keys(groupedByCategory).length === 0 && (
            <div className="bg-surface rounded-2xl border border-slate-200/90 p-8 text-center text-sm text-slate-500">
              No inventory items match your current search or filters.
            </div>
          )}
        </div>
      )}

      <InventoryFormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSave={handleSave}
        item={currentItem}
        lockedDepartment={isHodView && hodDepartment ? hodDepartment : undefined}
        defaultDepartment={defaultModalDepartment}
      />

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Bulk Import Items"
      >
        <div className="space-y-4">
          <p className="text-text-secondary">
            {isHodLocked
              ? `Import consumables from an Excel file (.xlsx) directly into ${hodDepartment}.`
              : 'Import consumables from an Excel file (.xlsx). Please use the provided template to ensure correct formatting.'}
          </p>
          <button
            onClick={downloadTemplate}
            className="w-full bg-gray-200 hover:bg-gray-300 text-text-primary font-bold py-2 px-4 rounded-lg"
          >
            <i className="fas fa-download mr-2"></i>Download Template
          </button>
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-900" htmlFor="file_input">
              Upload file
            </label>
            <input
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
              id="file_input"
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileImport}
            />
          </div>
        </div>
      </Modal>

      {!isHodLocked && (
        <BulkIssueModal
          isOpen={isBulkIssueModalOpen}
          onClose={() => setIsBulkIssueModalOpen(false)}
        />
      )}
    </div>
  );
};

const IssueFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  prefillRequest?: IssueRequest | null;
}> = ({ isOpen, onClose, prefillRequest }) => {
  const { inventory, assets, recipients, issueItem } = useAppContext();
  const [inventoryId, setInventoryId] = useState('');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [recipientId, setRecipientId] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [assetId, setAssetId] = useState('');
  const [usageScope, setUsageScope] = useState<UsageScope>('Workshop / Practical');
  const [usageLocation, setUsageLocation] = useState('');
  const [responseMessage, setResponseMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setAssetId('');
    setReturnDate('');
    if (prefillRequest) {
      const matchedItem = prefillRequest.inventoryId
        ? inventory.find((i) => i.id === prefillRequest.inventoryId)
        : inventory.find(
            (i) => i.name.trim().toLowerCase() === prefillRequest.itemName.trim().toLowerCase(),
          );
      setInventoryId(matchedItem?.id || '');
      setQuantity(prefillRequest.quantity || 1);
      const matchedRecipient = prefillRequest.recipientName
        ? recipients.find(
            (r) =>
              r.name.trim().toLowerCase() === prefillRequest.recipientName.trim().toLowerCase(),
          )
        : undefined;
      setRecipientId(matchedRecipient?.id || '');
      setUsageScope(
        prefillRequest.usageScope === 'Outside School' ? 'Outside School' : 'Workshop / Practical',
      );
      setUsageLocation(
        prefillRequest.usageLocation ||
          (prefillRequest.department ? `${prefillRequest.department} Workshop` : ''),
      );
      setResponseMessage(`Issued to ${prefillRequest.recipientName || prefillRequest.department}.`);
    } else {
      setInventoryId('');
      setQuantity(1);
      setRecipientId('');
      setUsageScope('Workshop / Practical');
      setUsageLocation('');
      setResponseMessage('');
    }
  }, [isOpen, prefillRequest, inventory, recipients]);

  const selectedItem = useMemo(
    () => inventory.find((i) => i.id === inventoryId),
    [inventoryId, inventory],
  );
  const availableSerials = useMemo(() => {
    if (selectedItem?.type !== 'Asset') return [];
    return assets.filter((a) => a.inventoryId === selectedItem.id && a.status === 'In Stock');
  }, [selectedItem, assets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selectedItem) {
      setError('Please select an item.');
      return;
    }
    if (!recipientId) {
      setError('Please select a recipient.');
      return;
    }
    if (usageScope === 'Outside School' && !usageLocation.trim()) {
      setError('Please enter the outside destination / job site for a Gate Pass.');
      return;
    }

    if (selectedItem.type === 'Asset') {
      if (!assetId) {
        setError('Please select a serial number.');
        return;
      }
      if (!returnDate) {
        setError('Please provide an expected return date for assets.');
        return;
      }
      const success = await issueItem({
        inventoryId: selectedItem.id,
        recipientId,
        assetId,
        returnDate,
        requestId: prefillRequest?.id,
        responseMessage: prefillRequest ? responseMessage : undefined,
        usageScope,
        usageLocation: usageLocation.trim(),
      });
      if (success) {
        setInventoryId('');
        setQuantity(1);
        setRecipientId('');
        setReturnDate('');
        setAssetId('');
        setUsageScope('Workshop / Practical');
        setUsageLocation('');
        setResponseMessage('');
        onClose();
      }
    } else {
      const qtyNum = roundStockQuantity(Number(quantity) || 0);
      if (qtyNum <= 0) {
        setError('Please enter a quantity greater than 0.');
        return;
      }
      if (selectedItem.quantity < qtyNum) {
        setError(`Not enough stock (${selectedItem.quantity} ${selectedItem.unit} available).`);
        return;
      }
      const consumableFlag = isItemConsumable(selectedItem);
      if (!consumableFlag && !returnDate) {
        setError('Please provide an expected return date for returnable items.');
        return;
      }
      const success = await issueItem({
        inventoryId: selectedItem.id,
        recipientId,
        quantity: qtyNum,
        returnDate: consumableFlag ? '' : returnDate,
        requestId: prefillRequest?.id,
        responseMessage: prefillRequest ? responseMessage : undefined,
        usageScope,
        usageLocation: usageLocation.trim(),
      });
      if (success) {
        setInventoryId('');
        setQuantity(1);
        setRecipientId('');
        setReturnDate('');
        setAssetId('');
        setUsageScope('Workshop / Practical');
        setUsageLocation('');
        setResponseMessage('');
        onClose();
      }
    }
  };

  const selectedConsumableFlag = selectedItem ? isItemConsumable(selectedItem) : true;
  const requiresReturnDate = Boolean(
    selectedItem && (selectedItem.type === 'Asset' || !selectedConsumableFlag),
  );
  const hasPackInfo = Boolean(
    selectedItem &&
      selectedItem.type === 'Consumable' &&
      selectedItem.purchaseUnit &&
      (selectedItem.unitsPerPurchase || 1) > 1,
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={prefillRequest ? `Fulfill ${prefillRequest.department} Request` : 'Issue Item'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="bg-red-100 text-red-700 p-2 rounded text-sm">{error}</p>}
        {prefillRequest && (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs space-y-1">
            <p className="font-bold text-sky-900">
              Requested by {prefillRequest.requestedByName} ({prefillRequest.department})
            </p>
            <p className="text-sky-800">
              Item: <strong>{prefillRequest.itemName}</strong> · Qty:{' '}
              <strong className="tabular-nums">
                {prefillRequest.quantity} {prefillRequest.unit}
              </strong>{' '}
              · For: <strong>{prefillRequest.recipientName}</strong>
            </p>
            {(prefillRequest.usageScope || prefillRequest.usageLocation) && (
              <p className="text-sky-900">
                Use:{' '}
                <strong>
                  {prefillRequest.usageScope === 'Outside School'
                    ? 'Outside School (Gate Pass Required)'
                    : 'Workshop / Practical'}
                </strong>
                {prefillRequest.usageLocation ? ` · ${prefillRequest.usageLocation}` : ''}
              </p>
            )}
            <p className="text-slate-700 italic">“{prefillRequest.message}”</p>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700">Item</label>
          <select
            value={inventoryId}
            onChange={(e) => {
              setInventoryId(e.target.value);
              setAssetId('');
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            required
          >
            <option value="">Select an item</option>
            {inventory.map((item) => {
              const stock =
                item.type === 'Asset'
                  ? assets.filter((a) => a.inventoryId === item.id && a.status === 'In Stock')
                      .length
                  : roundStockQuantity(item.quantity);
              const tag =
                item.type === 'Asset'
                  ? 'Asset'
                  : isItemConsumable(item)
                    ? 'Consumable'
                    : 'Returnable';
              return (
                <option key={item.id} value={item.id} disabled={stock <= 0}>
                  {item.name} ({stock} {item.type === 'Asset' ? 'serials' : item.unit} · {tag})
                </option>
              );
            })}
          </select>
        </div>

        {selectedItem?.type === 'Asset' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700">Serial Number</label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
              required
            >
              <option value="">Select a serial number</option>
              {availableSerials.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.serialNumber}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Quantity to Issue {selectedItem ? `(${selectedItem.unit})` : ''}
            </label>
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min={0.01}
              max={selectedItem?.quantity}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary font-mono"
              required
            />
            {hasPackInfo && selectedItem && (
              <p className="mt-1 text-xs text-sky-700 tabular-nums">
                Stock is tracked in <strong>{selectedItem.unit}</strong> ({selectedItem.unitsPerPurchase} {selectedItem.unit} per {selectedItem.purchaseUnit?.replace(/s$/i, '') || 'pack'}). Issuing{' '}
                <strong>{Number(quantity) || 0} {selectedItem.unit}</strong> will leave{' '}
                <strong>
                  {roundStockQuantity(Math.max(0, selectedItem.quantity - (Number(quantity) || 0)))}{' '}
                  {selectedItem.unit}
                </strong>
                .
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">Recipient</label>
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            required
          >
            <option value="">Select a recipient</option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.type})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Where Will Item Be Used?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUsageScope('Workshop / Practical')}
                className={`px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors ${
                  usageScope === 'Workshop / Practical'
                    ? 'border-sky-600 bg-sky-50 text-sky-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <i className="fas fa-screwdriver-wrench mr-1.5 text-sky-600"></i>
                Workshop / Practical
                <span className="block font-normal text-[11px] text-slate-500 mt-0.5">
                  On-campus training, returned afterward
                </span>
              </button>
              <button
                type="button"
                onClick={() => setUsageScope('Outside School')}
                className={`px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors ${
                  usageScope === 'Outside School'
                    ? 'border-amber-600 bg-amber-50 text-amber-950'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <i className="fas fa-id-card mr-1.5 text-amber-600"></i>
                Outside School (Gate Pass)
                <span className="block font-normal text-[11px] text-slate-500 mt-0.5">
                  Off-campus job, issues official Gate Pass
                </span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
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
                  ? 'e.g. Sub-County Office Wiring, Community Clinic...'
                  : 'e.g. Electrical Lab 2, Carpentry Workshop...'
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
            />
          </div>

          {usageScope === 'Outside School' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-950 flex items-start gap-2">
              <i className="fas fa-shield-halved text-amber-700 mt-0.5 shrink-0"></i>
              <span>
                <strong>Gate Pass Required:</strong> Issuing this item generates a printable Official Store Gate Pass with Security Exit Clearance.
              </span>
            </div>
          )}
        </div>
        {requiresReturnDate ? (
          <div className="space-y-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Expected Return Date *
              </label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
                required
              />
            </div>
            {selectedItem?.type === 'Consumable' && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                <i className="fas fa-rotate-left text-amber-600 mt-0.5 shrink-0"></i>
                <span>
                  <strong>Returnable Store Item:</strong> This item stays on the recipient&apos;s Clearance until returned, and returning it restores stock automatically.
                </span>
              </div>
            )}
          </div>
        ) : (
          selectedItem?.type === 'Consumable' && (
            <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-900 flex items-start gap-2">
              <i className="fas fa-circle-info text-sky-600 mt-0.5 shrink-0"></i>
              <span>
                <strong>Non-Returnable Consumable:</strong> Issuing deducts stock permanently. It is logged as{' '}
                <strong>Non-Returnable</strong> and will not block recipient clearance.
              </span>
            </div>
          )
        )}
        {prefillRequest && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Reply Note to HOD (optional)
            </label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_MESSAGE_LENGTH}
              value={responseMessage}
              onChange={(e) => setResponseMessage(e.target.value)}
              placeholder="e.g. Ready for pickup at Central Store window."
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
            />
          </div>
        )}
        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg mr-2 hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white font-bold py-2 px-4 rounded-lg"
          >
            {prefillRequest ? 'Confirm & Issue Item' : 'Issue Item'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const RequestIssueModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { inventory, assets, activeDepartment, createIssueRequest } = useAppContext();
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [unit, setUnit] = useState('Pcs');
  const [recipientName, setRecipientName] = useState('');
  const [usageScope, setUsageScope] = useState<UsageScope>('Workshop / Practical');
  const [usageLocation, setUsageLocation] = useState('');
  const [urgency, setUrgency] = useState<IssueRequestUrgency>('Normal');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedInventoryId('');
    setItemName('');
    setQuantity(1);
    setUnit('Pcs');
    setRecipientName(activeDepartment ? `${activeDepartment} Lab / Workshop` : '');
    setUsageScope('Workshop / Practical');
    setUsageLocation(activeDepartment ? `${activeDepartment} Workshop` : '');
    setUrgency('Normal');
    setMessage('');
  }, [isOpen, activeDepartment]);

  const handleSelectCatalog = (invId: string) => {
    setSelectedInventoryId(invId);
    const found = inventory.find((i) => i.id === invId);
    if (found) {
      setItemName(found.name);
      setUnit(found.unit || 'Pcs');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ok = await createIssueRequest({
        inventoryId: selectedInventoryId,
        itemName,
        quantity: roundStockQuantity(Number(quantity) || 0),
        unit,
        recipientName,
        usageScope,
        usageLocation: usageLocation.trim(),
        urgency,
        message,
      });
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request Store Issue & Message Officer">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-600 bg-sky-50 border border-sky-200 rounded-lg p-3">
          Send a requisition message directly to the Store Officer and Procurement Admin so they can
          issue the items for{' '}
          <strong>{activeDepartment || 'your department'}</strong>.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Select Store Item (optional)
          </label>
          <select
            value={selectedInventoryId}
            onChange={(e) => handleSelectCatalog(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
          >
            <option value="">-- Custom / Unlisted Item --</option>
            {inventory.map((item) => {
              const stock =
                item.type === 'Asset'
                  ? assets.filter((a) => a.inventoryId === item.id && a.status === 'In Stock').length
                  : item.quantity;
              return (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.department || 'Central'}) · In Stock: {stock} {item.unit}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Item Name</label>
          <input
            type="text"
            maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="e.g. Digital Multimeter, Live Cable Red..."
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Quantity</label>
            <input
              type="number"
              step="any"
              min={0.01}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Unit</label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_UNIT_LENGTH}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Intended Recipient
            </label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Trainer / Technician Name"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Urgency</label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as IssueRequestUrgency)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
            >
              <option value="Normal">Normal</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Where Will Items Be Used?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUsageScope('Workshop / Practical')}
                className={`px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors ${
                  usageScope === 'Workshop / Practical'
                    ? 'border-sky-600 bg-sky-50 text-sky-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
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
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <i className="fas fa-id-card mr-1.5 text-amber-600"></i>
                Outside School (Gate Pass)
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {usageScope === 'Outside School'
                ? 'Outside Job Site / Destination *'
                : 'Workshop / Lab Name'}
            </label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
              value={usageLocation}
              onChange={(e) => setUsageLocation(e.target.value)}
              required={usageScope === 'Outside School'}
              placeholder={
                usageScope === 'Outside School'
                  ? 'e.g. County Clinic Plumbing Job, Town Market Project...'
                  : 'e.g. Electrical Lab 2, Automotive Bay...'
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Message to Officer / Admin
          </label>
          <textarea
            rows={3}
            maxLength={VALIDATION_LIMITS.MAX_MESSAGE_LENGTH}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Explain what is needed, practical session schedule, or collection details..."
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
            required
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg mr-2 hover:bg-gray-300 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white font-bold py-2 px-4 rounded-lg text-sm disabled:opacity-60"
          >
            <i className="fas fa-paper-plane mr-1.5"></i>
            {submitting ? 'Sending...' : 'Send Request Message'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const ResolveRequestModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  request: IssueRequest | null;
  targetStatus: 'Issued' | 'Declined';
}> = ({ isOpen, onClose, request, targetStatus }) => {
  const { resolveIssueRequest } = useAppContext();
  const [responseMessage, setResponseMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && request) {
      setResponseMessage(
        targetStatus === 'Issued'
          ? `Prepared for ${request.department}.`
          : 'Currently unavailable in store.',
      );
    }
  }, [isOpen, request, targetStatus]);

  if (!request) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ok = await resolveIssueRequest(request.id, {
        status: targetStatus,
        responseMessage,
      });
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={targetStatus === 'Issued' ? 'Mark Request Issued & Reply' : 'Decline Request & Reply'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
          <p className="font-bold text-slate-900">
            {request.department} · {request.requestedByName}
          </p>
          <p className="text-slate-700">
            {request.itemName} ({request.quantity} {request.unit})
          </p>
          <p className="text-slate-600 italic">“{request.message}”</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Response Message to HOD
          </label>
          <textarea
            rows={3}
            maxLength={VALIDATION_LIMITS.MAX_MESSAGE_LENGTH}
            value={responseMessage}
            onChange={(e) => setResponseMessage(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm"
            required
          />
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg mr-2 hover:bg-gray-300 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`text-white font-bold py-2 px-4 rounded-lg text-sm disabled:opacity-60 ${
              targetStatus === 'Declined'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {submitting
              ? 'Saving...'
              : targetStatus === 'Declined'
                ? 'Decline & Send Reply'
                : 'Mark Issued & Send Reply'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const IssueLogPage: React.FC<{
  isHodView?: boolean;
  initialStatusFilter?: 'All' | 'Pending Return' | 'Gate Pass' | 'Consumables' | 'Returned';
  openBulkIssueNonce?: number;
}> = ({ isHodView = false, initialStatusFilter = 'All', openBulkIssueNonce = 0 }) => {
  const {
    issues,
    issueLog,
    recipients,
    issueRequests,
    inventory,
    assets,
    settings,
    user,
    activeDepartment,
    showToast,
  } = useAppContext();
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isBulkIssueModalOpen, setIsBulkIssueModalOpen] = useState(false);
  const [prefillRequest, setPrefillRequest] = useState<IssueRequest | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<{
    request: IssueRequest;
    status: 'Issued' | 'Declined';
  } | null>(null);
  const [requestStatusFilter, setRequestStatusFilter] = useState<'All' | 'Pending' | 'Issued' | 'Declined'>('All');
  const [slipToInspect, setSlipToInspect] = useState<IssueSlip | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRecipient, setFilterRecipient] = useState('All');
  const [filterStatus, setFilterStatus] = useState<
    'All' | 'Pending Return' | 'Gate Pass' | 'Consumables' | 'Returned'
  >(initialStatusFilter);
  const [dispatchModalTarget, setDispatchModalTarget] = useState<{
    recipientId: string;
    recipientName: string;
    initialSlipId?: string | null;
    batchKey: string | null;
  } | null>(null);

  useEffect(() => {
    setFilterStatus(initialStatusFilter);
  }, [initialStatusFilter]);

  useEffect(() => {
    if (openBulkIssueNonce > 0 && !isHodView) {
      setIsBulkIssueModalOpen(true);
    }
  }, [openBulkIssueNonce, isHodView]);

  const handlePrintSlipPdf = async (slip: IssueSlip) => {
    try {
      const rec =
        (slip.recipientId ? recipients.find((r) => r.id === slip.recipientId) : null) ||
        recipients.find(
          (r) =>
            r.name.trim().toLowerCase() ===
            (slip.recipientName || slip.recipient).trim().toLowerCase(),
        ) ||
        null;
      await generateIssueSlipPdf({
        settings,
        recipient: rec,
        slip,
        inventory,
        issuedByEmail: user?.email,
      });
    } catch (err) {
      console.error('Failed to export Issue Slip PDF', err);
      showToast('Failed to export Issue Slip / Gate Pass PDF.', 'error');
    }
  };

  const handlePrintVoucherOrGatePass = async (logOrLogs: IssueLogEntry | IssueLogEntry[]) => {
    try {
      const groupedLogs = Array.isArray(logOrLogs)
        ? logOrLogs
        : (() => {
            const batchKey = getIssueBatchKey(logOrLogs);
            const matched = issueLog.filter((l) => getIssueBatchKey(l) === batchKey);
            return matched.length > 0 ? matched : [logOrLogs];
          })();
      if (groupedLogs.length === 0) return;
      const lead = groupedLogs[0];
      const rec = recipients.find((r) => r.id === lead.recipientId) || null;
      await generateBulkIssueVoucherPdf({
        settings,
        recipient: rec,
        logs: groupedLogs,
        inventory,
        issuedByEmail: user?.email,
      });
    } catch (err) {
      console.error('Failed to print Gate Pass / Voucher PDF', err);
      showToast('Failed to export Gate Pass / Voucher PDF.', 'error');
    }
  };

  const visibleRequests = useMemo(() => {
    const scoped = isHodView && activeDepartment
      ? issueRequests.filter(
          (r) => r.department.trim().toLowerCase() === activeDepartment.trim().toLowerCase(),
        )
      : issueRequests;

    return scoped
      .filter((r) => requestStatusFilter === 'All' || r.status === requestStatusFilter)
      .sort((a, b) => {
        if (a.status === 'Pending' && b.status !== 'Pending') return -1;
        if (a.status !== 'Pending' && b.status === 'Pending') return 1;
        if (a.urgency === 'Urgent' && b.urgency !== 'Urgent') return -1;
        if (a.urgency !== 'Urgent' && b.urgency === 'Urgent') return 1;
        return 0;
      });
  }, [issueRequests, isHodView, activeDepartment, requestStatusFilter]);

  const pendingReqCount = useMemo(() => {
    const scoped = isHodView && activeDepartment
      ? issueRequests.filter(
          (r) => r.department.trim().toLowerCase() === activeDepartment.trim().toLowerCase(),
        )
      : issueRequests;
    return scoped.filter((r) => r.status === 'Pending').length;
  }, [issueRequests, isHodView, activeDepartment]);

  const filteredSlips = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const selectedRecipientObj =
      filterRecipient === 'All'
        ? null
        : recipients.find((r) => r.id === filterRecipient) || null;
    const selectedRecNameLower = selectedRecipientObj?.name.trim().toLowerCase() || '';

    return issues
      .filter((slip) => {
        const recipientLabel = (slip.recipientName || slip.recipient || '').toLowerCase();
        const matchesSearch =
          !q ||
          slip.id.toLowerCase().includes(q) ||
          `iss-${slip.id.slice(0, 6)}`.toLowerCase().includes(q) ||
          recipientLabel.includes(q) ||
          (slip.usageLocation || '').toLowerCase().includes(q) ||
          (slip.gatePassNumber || '').toLowerCase().includes(q) ||
          slip.lines.some(
            (l) =>
              l.name.toLowerCase().includes(q) ||
              (l.serialNumber || '').toLowerCase().includes(q),
          );

        const matchesRecipient =
          filterRecipient === 'All' ||
          slip.recipientId === filterRecipient ||
          (selectedRecNameLower !== '' && recipientLabel === selectedRecNameLower);

        const hasReturnableLines = slip.lines.some((l) => l.returnable);
        const hasPendingReturn = slip.lines.some(
          (l) => l.returnable && roundStockQuantity(l.qtyIssued - l.qtyReturned) > 0,
        );
        const hasConsumableLines = slip.lines.some((l) => !l.returnable);
        const isGatePass = Boolean(slip.requiresGatePass || slip.scope === 'Outside School');
        const allReturnablesReturned = hasReturnableLines && !hasPendingReturn;

        const matchesStatus =
          filterStatus === 'All' ||
          (filterStatus === 'Pending Return' && slip.status !== 'closed' && hasPendingReturn) ||
          (filterStatus === 'Gate Pass' && isGatePass) ||
          (filterStatus === 'Consumables' && hasConsumableLines) ||
          (filterStatus === 'Returned' && allReturnablesReturned);

        return matchesSearch && matchesRecipient && matchesStatus;
      })
      .sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime());
  }, [issues, recipients, searchTerm, filterRecipient, filterStatus]);

  const filteredLog = useMemo(() => {
    return issueLog
      .filter((log) => {
        const q = searchTerm.toLowerCase();
        const matchesSearch =
          log.itemName.toLowerCase().includes(q) ||
          log.recipientName.toLowerCase().includes(q) ||
          (log.serialNumber && log.serialNumber.toLowerCase().includes(q)) ||
          (log.usageLocation && log.usageLocation.toLowerCase().includes(q)) ||
          (log.gatePassNumber && log.gatePassNumber.toLowerCase().includes(q));
        const matchesRecipient =
          filterRecipient === 'All' || log.recipientId === filterRecipient;
        const isConsumedLog =
          log.returned && !log.assetId && log.isConsumable !== false && !log.dateReturned;
        const isGatePass = Boolean(log.requiresGatePass || log.usageScope === 'Outside School');
        const matchesStatus =
          filterStatus === 'All' ||
          (filterStatus === 'Pending Return' && !log.returned) ||
          (filterStatus === 'Gate Pass' && isGatePass) ||
          (filterStatus === 'Consumables' && isConsumedLog) ||
          (filterStatus === 'Returned' && log.returned && !isConsumedLog);
        return matchesSearch && matchesRecipient && matchesStatus;
      })
      .sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime());
  }, [issueLog, searchTerm, filterRecipient, filterStatus]);

  const groupedLogEntries = useMemo(() => {
    const map = new Map<string, IssueLogEntry[]>();
    for (const log of filteredLog) {
      const key = getIssueBatchKey(log);
      const list = map.get(key);
      if (list) {
        list.push(log);
      } else {
        map.set(key, [log]);
      }
    }
    return Array.from(map.entries()).map(([key, logs]) => {
      const lead = logs[0];
      const totalUnits = roundStockQuantity(
        logs.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
      );
      const pendingCount = logs.filter((l) => !l.returned).length;
      const consumedCount = logs.filter(
        (l) => l.returned && !l.assetId && l.isConsumable !== false && !l.dateReturned,
      ).length;
      const returnedCount = logs.length - pendingCount - consumedCount;
      const isGatePass = logs.some(
        (l) => Boolean(l.requiresGatePass || l.usageScope === 'Outside School'),
      );
      const gatePassNumber = logs.find((l) => Boolean(l.gatePassNumber))?.gatePassNumber || '';
      const usageLocation = logs.find((l) => Boolean(l.usageLocation))?.usageLocation || '';
      return {
        key,
        logs,
        lead,
        isBulk: logs.length > 1,
        recipientId: lead.recipientId,
        recipientName: lead.recipientName,
        dateIssued: lead.dateIssued,
        totalUnits,
        pendingCount,
        consumedCount,
        returnedCount,
        isGatePass,
        gatePassNumber,
        usageLocation,
      };
    });
  }, [filteredLog]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
            Issue Slips &amp; Requests
          </h1>
          {isHodView && (
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              HODs cannot issue inventory directly, but can message the Store Officer &amp; Admin.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            className={`min-h-[42px] flex-1 sm:flex-none ${
              isHodView
                ? 'bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white shadow-xs'
                : 'bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-800'
            } font-semibold py-2 px-4 rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5`}
          >
            <i className="fas fa-paper-plane"></i>
            <span>Request Item Issue</span>
          </button>
          {!isHodView && (
            <>
              <button
                type="button"
                onClick={() => setIsBulkIssueModalOpen(true)}
                className="min-h-[42px] flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-4 rounded-xl shadow-xs text-xs sm:text-sm flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <i className="fas fa-boxes-packing"></i>
                <span>Bulk Issue</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrefillRequest(null);
                  setIsIssueModalOpen(true);
                }}
                className="min-h-[42px] flex-1 sm:flex-none bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white font-semibold py-2 px-4 rounded-xl shadow-xs text-xs sm:text-sm flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <i className="fas fa-plus"></i>
                <span>Issue Item</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* HOD Requisition & Message Inbox */}
      <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
              <i className="fas fa-inbox"></i>
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                HOD Issue Requests
                {pendingReqCount > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold tabular-nums">
                    {pendingReqCount} Pending
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                {isHodView
                  ? `Requests sent from ${activeDepartment} to the Procurement Officer & Admin.`
                  : 'Incoming issue messages from department HODs. Fulfill directly or reply.'}
              </p>
            </div>
          </div>
          <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-0.5">
            {(['All', 'Pending', 'Issued', 'Declined'] as const).map((statusTab) => (
              <button
                key={statusTab}
                type="button"
                onClick={() => setRequestStatusFilter(statusTab)}
                className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  requestStatusFilter === statusTab
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {statusTab}
              </button>
            ))}
          </div>
        </div>

        {visibleRequests.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">
            No {requestStatusFilter !== 'All' ? requestStatusFilter.toLowerCase() : ''} issue
            requests yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleRequests.map((req) => {
              const matchedStockItem = req.inventoryId
                ? inventory.find((i) => i.id === req.inventoryId)
                : inventory.find(
                    (i) => i.name.trim().toLowerCase() === req.itemName.trim().toLowerCase(),
                  );
              const availableCount = matchedStockItem
                ? matchedStockItem.type === 'Asset'
                  ? assets.filter(
                      (a) => a.inventoryId === matchedStockItem.id && a.status === 'In Stock',
                    ).length
                  : matchedStockItem.quantity
                : 0;

              return (
                <div
                  key={req.id}
                  className={`rounded-2xl border p-4 space-y-2.5 ${
                    req.status === 'Pending'
                      ? 'border-amber-200 bg-amber-50/40'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-sky-800">{req.department}</span>
                        {req.urgency === 'Urgent' && (
                          <span className="text-[11px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-md">
                            URGENT
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm text-slate-900 mt-0.5">
                        {req.itemName}{' '}
                        <span className="font-mono text-xs text-slate-600 tabular-nums">
                          × {req.quantity} {req.unit}
                        </span>
                      </h3>
                    </div>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-lg shrink-0 ${
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

                  <p className="text-xs text-slate-700 bg-white border border-slate-200/80 rounded-xl p-2.5">
                    “{req.message}”
                  </p>

                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      From: <strong className="text-slate-700">{req.requestedByName}</strong> (
                      {req.requestedByEmail})
                    </span>
                    {req.recipientName && (
                      <span>
                        For: <strong className="text-slate-700">{req.recipientName}</strong>
                      </span>
                    )}
                    {(req.usageScope || req.usageLocation) && (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${
                          req.usageScope === 'Outside School' || req.requiresGatePass
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-sky-100 text-sky-900'
                        }`}
                      >
                        <i
                          className={`fas ${
                            req.usageScope === 'Outside School' || req.requiresGatePass
                              ? 'fa-id-card'
                              : 'fa-screwdriver-wrench'
                          }`}
                        ></i>
                        {req.usageScope === 'Outside School' || req.requiresGatePass
                          ? `Gate Pass · ${req.usageLocation || 'Outside School'}`
                          : req.usageLocation || 'Workshop / Practical'}
                      </span>
                    )}
                  </div>

                  {req.responseMessage && (
                    <div className="text-xs bg-white border border-slate-200 rounded-xl p-2.5 text-slate-700">
                      <span className="font-semibold text-slate-900">
                        Reply ({req.handledByEmail || 'Store Desk'}):{' '}
                      </span>
                      {req.responseMessage}
                    </div>
                  )}

                  {!isHodView && req.status === 'Pending' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {matchedStockItem && availableCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPrefillRequest(req);
                            setIsIssueModalOpen(true);
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors"
                        >
                          <i className="fas fa-box-open mr-1"></i> Issue Now
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setResolveTarget({ request: req, status: 'Issued' })}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                      >
                        Mark Issued / Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => setResolveTarget({ request: req, status: 'Declined' })}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 grid grid-cols-1 md:grid-cols-3 gap-2.5 items-center shadow-xs">
        <div className="relative">
          <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
          <input
            type="text"
            placeholder="Search item, recipient, serial, or slip ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <select
          value={filterRecipient}
          onChange={(e) => setFilterRecipient(e.target.value)}
          className="py-2.5 px-3 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        >
          <option value="All">All Recipients</option>
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-100 overflow-x-auto no-scrollbar">
          {(['All', 'Pending Return', 'Gate Pass', 'Consumables', 'Returned'] as const).map(
            (statusVal) => (
              <button
                key={statusVal}
                type="button"
                onClick={() => setFilterStatus(statusVal)}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  filterStatus === statusVal ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                {statusVal}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Active Issue Slips */}
      <div className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/60">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              Active Issue Slips
            </h2>
            <p className="text-[11px] text-slate-500">
              Open a slip to return returnable tools &amp; equipment or print its Gate Pass / Slip PDF.
            </p>
          </div>
          <span className="font-mono text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg tabular-nums">
            {filteredSlips.length} slip{filteredSlips.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Mobile Issue Slips (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredSlips.map((slip) => {
            const recipientLabel = slip.recipientName || slip.recipient;
            const totalIssued = roundStockQuantity(
              slip.lines.reduce((s, l) => s + (Number(l.qtyIssued) || 0), 0),
            );
            const pendingLines = slip.lines.filter(
              (l) => l.returnable && roundStockQuantity(l.qtyIssued - l.qtyReturned) > 0,
            );
            const totalDamaged = roundStockQuantity(
              slip.lines.reduce((s, l) => s + (Number(l.qtyDamaged) || 0), 0),
            );
            const hasReturnable = slip.lines.some((l) => l.returnable);
            const isGatePass = Boolean(slip.requiresGatePass || slip.scope === 'Outside School');
            const previewNames = slip.lines
              .slice(0, 2)
              .map((l) => l.name)
              .join(', ');
            const extraCount = Math.max(0, slip.lines.length - 2);
            return (
              <div key={slip.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm ${
                        isGatePass
                          ? 'bg-amber-50 text-amber-700'
                          : pendingLines.length > 0
                            ? 'bg-sky-50 text-sky-700'
                            : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      <i
                        className={`fas ${
                          isGatePass
                            ? 'fa-id-card'
                            : pendingLines.length > 0
                              ? 'fa-clipboard-list'
                              : 'fa-check-circle'
                        }`}
                      ></i>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setDispatchModalTarget({
                              recipientId: slip.recipientId || '',
                              recipientName: recipientLabel,
                              initialSlipId: slip.id,
                              batchKey: null,
                            })
                          }
                          className="font-semibold text-sm text-sky-800 hover:underline truncate text-left"
                        >
                          {recipientLabel}
                        </button>
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          ISS-{slip.id.slice(0, 6).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 truncate mt-0.5">
                        {previewNames}
                        {extraCount > 0 ? ` +${extraCount} more` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        {new Date(slip.dateIssued).toLocaleDateString()} · {slip.lines.length} line
                        {slip.lines.length === 1 ? '' : 's'} ({totalIssued} units)
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            slip.status === 'open'
                              ? 'bg-amber-100 text-amber-800'
                              : slip.status === 'partial'
                                ? 'bg-sky-100 text-sky-800'
                                : hasReturnable
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {slip.status === 'open'
                            ? `Open (${pendingLines.length} pending)`
                            : slip.status === 'partial'
                              ? `Partial (${pendingLines.length} left)`
                              : hasReturnable
                                ? 'Closed · All Returned'
                                : 'Closed · Consumables'}
                        </span>
                        {totalDamaged > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 tabular-nums">
                            {totalDamaged} damaged
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSlipToInspect(slip)}
                      className={`min-h-[30px] px-2.5 py-1 rounded-xl text-xs font-semibold ${
                        !isHodView && pendingLines.length > 0
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-900 text-white'
                      }`}
                    >
                      {!isHodView && pendingLines.length > 0 ? 'Return / Inspect' : 'View Slip'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePrintSlipPdf(slip)}
                      className={`min-h-[28px] px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                        isGatePass
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                          : 'bg-sky-50 hover:bg-sky-100 text-sky-800'
                      }`}
                    >
                      <i className="fas fa-file-pdf mr-1"></i>
                      {isGatePass ? 'Pass' : 'PDF'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Issue Slips Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-600">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
              <tr>
                <th className="px-6 py-3">Slip &amp; Items</th>
                <th className="px-6 py-3">Recipient &amp; Location</th>
                <th className="px-6 py-3">Lines / Qty</th>
                <th className="px-6 py-3">Date Issued</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSlips.map((slip) => {
                const recipientLabel = slip.recipientName || slip.recipient;
                const totalIssued = roundStockQuantity(
                  slip.lines.reduce((s, l) => s + (Number(l.qtyIssued) || 0), 0),
                );
                const pendingLines = slip.lines.filter(
                  (l) => l.returnable && roundStockQuantity(l.qtyIssued - l.qtyReturned) > 0,
                );
                const totalDamaged = roundStockQuantity(
                  slip.lines.reduce((s, l) => s + (Number(l.qtyDamaged) || 0), 0),
                );
                const hasReturnable = slip.lines.some((l) => l.returnable);
                const isGatePass = Boolean(
                  slip.requiresGatePass || slip.scope === 'Outside School',
                );
                const previewNames = slip.lines
                  .slice(0, 2)
                  .map((l) =>
                    l.serialNumber ? `${l.name} (${l.serialNumber})` : `${l.name} × ${l.qtyIssued}`,
                  )
                  .join(' · ');
                const extraCount = Math.max(0, slip.lines.length - 2);
                return (
                  <tr key={slip.id} className="bg-white border-b hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setSlipToInspect(slip)}
                        className="text-left group"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md group-hover:underline">
                            ISS-{slip.id.slice(0, 6).toUpperCase()}
                          </span>
                          {slip.lines.length > 1 && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">
                              {slip.lines.length} items
                            </span>
                          )}
                        </div>
                        <span className="block text-xs text-slate-700 mt-1 font-medium">
                          {previewNames}
                          {extraCount > 0 ? ` +${extraCount} more` : ''}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() =>
                          setDispatchModalTarget({
                            recipientId: slip.recipientId || '',
                            recipientName: recipientLabel,
                            initialSlipId: slip.id,
                            batchKey: null,
                          })
                        }
                        className="font-semibold text-slate-900 hover:text-primary hover:underline block text-left"
                      >
                        {recipientLabel}
                      </button>
                      {(isGatePass || slip.usageLocation) && (
                        <span
                          className={`inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            isGatePass
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-sky-50 text-sky-800'
                          }`}
                        >
                          <i
                            className={`fas ${
                              isGatePass ? 'fa-id-card' : 'fa-screwdriver-wrench'
                            }`}
                          ></i>
                          {isGatePass
                            ? `${slip.gatePassNumber || 'Gate Pass'} · ${slip.usageLocation || 'Outside School'}`
                            : slip.usageLocation || slip.scope}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono tabular-nums text-slate-800">
                      <span className="font-semibold">{slip.lines.length} line{slip.lines.length === 1 ? '' : 's'}</span>
                      <span className="block text-xs text-slate-500">{totalIssued} total units</span>
                    </td>
                    <td className="px-6 py-4 tabular-nums">
                      {new Date(slip.dateIssued).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                            slip.status === 'open'
                              ? 'bg-amber-100 text-amber-800'
                              : slip.status === 'partial'
                                ? 'bg-sky-100 text-sky-800'
                                : hasReturnable
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          <i
                            className={`fas ${
                              slip.status === 'open'
                                ? 'fa-clock'
                                : slip.status === 'partial'
                                  ? 'fa-circle-half-stroke'
                                  : hasReturnable
                                    ? 'fa-check-circle'
                                    : 'fa-box-open'
                            }`}
                          ></i>
                          {slip.status === 'open'
                            ? `Open (${pendingLines.length} pending)`
                            : slip.status === 'partial'
                              ? `Partial (${pendingLines.length} pending)`
                              : hasReturnable
                                ? 'Closed · Returned'
                                : 'Closed · Consumables'}
                        </span>
                        {totalDamaged > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 tabular-nums">
                            {totalDamaged} damaged
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSlipToInspect(slip)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            !isHodView && pendingLines.length > 0
                              ? 'bg-sky-600 hover:bg-sky-700 text-white'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          }`}
                        >
                          <i
                            className={`fas ${
                              !isHodView && pendingLines.length > 0
                                ? 'fa-rotate-left'
                                : 'fa-clipboard-check'
                            }`}
                          ></i>
                          <span>
                            {!isHodView && pendingLines.length > 0 ? 'Return / Inspect' : 'View Slip'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePrintSlipPdf(slip)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                            isGatePass
                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-950'
                              : 'bg-sky-100 hover:bg-sky-200 text-sky-900'
                          }`}
                        >
                          <i className="fas fa-file-pdf"></i>
                          <span>{isGatePass ? 'Gate Pass' : 'Slip PDF'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredSlips.length === 0 && (
          <p className="text-center p-6 text-sm text-slate-500">
            No issue slips found matching your criteria.
          </p>
        )}
      </div>

      {/* Legacy Issue Log (Historical Read-Only) */}
      {groupedLogEntries.length > 0 && (
        <div className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
          <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
            <div>
              <h2 className="font-display text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                <span>Legacy Issue Log</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 text-[10px] font-bold uppercase tracking-wide">
                  Read-Only Historical
                </span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Archived single-line issue logs recorded before the Issue Slip workflow.
              </p>
            </div>
            <span className="font-mono text-xs font-bold text-slate-500 tabular-nums">
              {filteredLog.length} entr{filteredLog.length === 1 ? 'y' : 'ies'}
            </span>
          </div>

          <div className="md:hidden divide-y divide-slate-100">
            {groupedLogEntries.map((group) => {
              if (group.isBulk) {
                const previewNames = group.logs
                  .slice(0, 2)
                  .map((l) => l.itemName)
                  .join(', ');
                const extraCount = Math.max(0, group.logs.length - 2);
                return (
                  <div key={group.key} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {group.recipientName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                          Legacy · {group.logs.length} items
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 truncate mt-0.5">
                        {previewNames}
                        {extraCount > 0 ? ` +${extraCount} more` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        {new Date(group.dateIssued).toLocaleDateString()} · {group.totalUnits} units
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDispatchModalTarget({
                          recipientId: group.recipientId,
                          recipientName: group.recipientName,
                          batchKey: group.key,
                        })
                      }
                      className="min-h-[30px] px-2.5 py-1 rounded-xl bg-slate-200 text-slate-800 text-xs font-semibold shrink-0"
                    >
                      View
                    </button>
                  </div>
                );
              }
              const log = group.lead;
              const statusInfo = getIssueStatusDisplay(log);
              return (
                <div key={log.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{log.itemName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {log.recipientName} · {new Date(log.dateIssued).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block font-mono text-xs font-bold text-slate-800 tabular-nums">
                      × {log.quantity}{log.unit ? ` ${log.unit}` : ''}
                    </span>
                    <span
                      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-lg mt-1 ${statusInfo.badgeClass}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-6 py-3">Item / Legacy Batch</th>
                  <th className="px-6 py-3">Recipient &amp; Location</th>
                  <th className="px-6 py-3">Qty</th>
                  <th className="px-6 py-3">Date Issued</th>
                  <th className="px-6 py-3">Recorded Status</th>
                  <th className="px-6 py-3">Records</th>
                </tr>
              </thead>
              <tbody>
                {groupedLogEntries.map((group) => {
                  if (group.isBulk) {
                    const previewNames = group.logs
                      .slice(0, 2)
                      .map((l) => l.itemName)
                      .join(', ');
                    const extraCount = Math.max(0, group.logs.length - 2);
                    return (
                      <tr key={group.key} className="bg-slate-50/40 border-b">
                        <td className="px-6 py-3.5">
                          <span className="font-semibold text-slate-800">
                            Legacy Batch · {group.logs.length} items
                          </span>
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {previewNames}
                            {extraCount > 0 ? ` +${extraCount} more` : ''}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-slate-700">{group.recipientName}</td>
                        <td className="px-6 py-3.5 font-mono tabular-nums">{group.totalUnits}</td>
                        <td className="px-6 py-3.5 tabular-nums">
                          {new Date(group.dateIssued).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3.5 text-xs text-slate-600">
                          {group.pendingCount > 0
                            ? `${group.pendingCount} unreturned`
                            : 'Historical closed'}
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setDispatchModalTarget({
                                  recipientId: group.recipientId,
                                  recipientName: group.recipientName,
                                  batchKey: group.key,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold"
                            >
                              View Items
                            </button>
                            <button
                              type="button"
                              onClick={() => void handlePrintVoucherOrGatePass(group.logs)}
                              className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-semibold"
                            >
                              Voucher
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  const log = group.lead;
                  const statusInfo = getIssueStatusDisplay(log);
                  return (
                    <tr key={log.id} className="bg-white border-b">
                      <td className="px-6 py-3.5 font-medium text-gray-900">
                        {log.itemName}
                        {log.serialNumber && (
                          <span className="block text-xs text-gray-500">{log.serialNumber}</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-slate-700">{log.recipientName}</td>
                      <td className="px-6 py-3.5 font-mono tabular-nums">
                        {log.quantity}{log.unit ? ` ${log.unit}` : ''}
                      </td>
                      <td className="px-6 py-3.5 tabular-nums">
                        {new Date(log.dateIssued).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusInfo.textClass}`}>
                          <i className={`fas ${statusInfo.icon}`}></i>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-400">Read-only</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <IssueFormModal
        isOpen={isIssueModalOpen}
        onClose={() => {
          setIsIssueModalOpen(false);
          setPrefillRequest(null);
        }}
        prefillRequest={prefillRequest}
      />
      {!isHodView && (
        <BulkIssueModal
          isOpen={isBulkIssueModalOpen}
          onClose={() => setIsBulkIssueModalOpen(false)}
        />
      )}
      <RequestIssueModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
      />
      <ResolveRequestModal
        isOpen={Boolean(resolveTarget)}
        onClose={() => setResolveTarget(null)}
        request={resolveTarget?.request || null}
        targetStatus={resolveTarget?.status || 'Issued'}
      />
      <RecipientDispatchModal
        isOpen={Boolean(dispatchModalTarget)}
        onClose={() => setDispatchModalTarget(null)}
        recipientId={dispatchModalTarget?.recipientId || null}
        recipientNameFallback={dispatchModalTarget?.recipientName || ''}
        initialSlipId={dispatchModalTarget?.initialSlipId || null}
        batchKey={dispatchModalTarget?.batchKey || null}
        isHodView={isHodView}
        onOpenIssueSlip={(slip) => {
          setDispatchModalTarget(null);
          setSlipToInspect(slip);
        }}
      />
      <IssueSlipReturnModal
        isOpen={Boolean(slipToInspect)}
        onClose={() => setSlipToInspect(null)}
        slip={slipToInspect}
        isHodView={isHodView}
      />
    </div>
  );
};

interface ClearanceRow {
  key: string;
  itemName: string;
  serialNumber?: string;
  qtyLabel: string;
  dateIssued: string;
  expectedReturn: string;
  pendingQty: number;
  statusLabel: string;
  pdfLabel: string;
  badgeClass: string;
  textClass: string;
  icon: string;
  conditionText?: string;
  dateReturnedLabel: string;
}

const ClearancePage: React.FC<{ initialSearchTerm?: string }> = ({
  initialSearchTerm = '',
}) => {
  const { recipients, issues, issueLog, showToast } = useAppContext();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);

  useEffect(() => {
    const term = initialSearchTerm.trim().toLowerCase();
    if (!term) return;
    setSearchTerm(initialSearchTerm);
    const found = recipients.find(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.regNumber && r.regNumber.toLowerCase().includes(term)),
    );
    setSelectedRecipient(found || null);
  }, [initialSearchTerm, recipients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      setSelectedRecipient(null);
      return;
    }
    const found = recipients.find(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.regNumber && r.regNumber.toLowerCase().includes(term)),
    );
    setSelectedRecipient(found || null);
  };

  const clearanceRows = useMemo<ClearanceRow[]>(() => {
    if (!selectedRecipient) return [];
    const recNameLower = selectedRecipient.name.trim().toLowerCase();
    const rows: ClearanceRow[] = [];

    issues.forEach((slip) => {
      const matchesRecipient =
        slip.recipientId === selectedRecipient.id ||
        (!slip.recipientId &&
          (slip.recipientName || slip.recipient || '').trim().toLowerCase() === recNameLower);
      if (!matchesRecipient) return;

      slip.lines.forEach((line, idx) => {
        const remaining = line.returnable
          ? Math.max(0, roundStockQuantity(line.qtyIssued - line.qtyReturned))
          : 0;
        const unitLabel = line.unit ? ` ${line.unit}` : '';
        const qtyLabel =
          line.returnable && line.qtyReturned > 0
            ? `${line.qtyReturned}/${line.qtyIssued}${unitLabel}`
            : `${line.qtyIssued}${unitLabel}`;

        let statusLabel = 'Returned';
        let pdfLabel = 'Returned';
        let badgeClass = 'bg-emerald-50 text-emerald-700';
        let textClass = 'text-emerald-700';
        let icon = 'fa-check-circle';

        if (!line.returnable) {
          statusLabel = 'Non-Returnable';
          pdfLabel = 'Consumable (Non-Returnable)';
          badgeClass = 'bg-sky-50 text-sky-700';
          textClass = 'text-sky-700';
          icon = 'fa-box-open';
        } else if (remaining > 0 && line.qtyReturned > 0) {
          statusLabel = `Partial (${remaining} left)`;
          pdfLabel = `Partial Return (${remaining} pending)`;
          badgeClass = 'bg-amber-50 text-amber-800';
          textClass = 'text-amber-700';
          icon = 'fa-circle-half-stroke';
        } else if (remaining > 0) {
          statusLabel = 'Pending Return';
          pdfLabel = 'Pending Return';
          badgeClass = 'bg-amber-50 text-amber-700';
          textClass = 'text-amber-700';
          icon = 'fa-clock';
        }

        const condParts: string[] = [];
        if (line.returnCondition) condParts.push(line.returnCondition);
        if (line.qtyDamaged > 0) condParts.push(`${line.qtyDamaged} damaged`);
        const returnedIso = line.dateReturned;

        rows.push({
          key: `slip-${slip.id}-${idx}`,
          itemName: line.name,
          serialNumber: line.serialNumber,
          qtyLabel,
          dateIssued: slip.dateIssued,
          expectedReturn: !line.returnable
            ? 'Non-Returnable'
            : line.returnDate
              ? new Date(line.returnDate).toLocaleDateString()
              : 'N/A',
          pendingQty: remaining,
          statusLabel,
          pdfLabel: condParts.length > 0 ? `${pdfLabel} (${condParts.join(' · ')})` : pdfLabel,
          badgeClass,
          textClass,
          icon,
          conditionText: condParts.length > 0 ? condParts.join(' · ') : undefined,
          dateReturnedLabel: !line.returnable
            ? 'N/A (Consumed)'
            : returnedIso
              ? new Date(returnedIso).toLocaleDateString()
              : '-',
        });
      });
    });

    issueLog
      .filter((l) => l.recipientId === selectedRecipient.id)
      .forEach((log) => {
        const statusInfo = getIssueStatusDisplay(log);
        const isNonReturnable =
          log.returned && !log.assetId && log.isConsumable !== false && !log.dateReturned;
        const condParts: string[] = [];
        if (log.returned && log.returnCondition) condParts.push(log.returnCondition);
        if (log.damagedQuantity) condParts.push(`${log.damagedQuantity} damaged`);

        rows.push({
          key: `legacy-${log.id}`,
          itemName: log.itemName,
          serialNumber: log.serialNumber,
          qtyLabel: log.unit ? `${log.quantity} ${log.unit}` : String(log.quantity),
          dateIssued: log.dateIssued,
          expectedReturn: isNonReturnable
            ? 'Non-Returnable'
            : log.returnDate
              ? new Date(log.returnDate).toLocaleDateString()
              : 'N/A',
          pendingQty: !log.returned ? log.quantity : 0,
          statusLabel: statusInfo.label,
          pdfLabel:
            condParts.length > 0
              ? `${statusInfo.pdfLabel} (${condParts.join(' · ')})`
              : statusInfo.pdfLabel,
          badgeClass: statusInfo.badgeClass,
          textClass: statusInfo.textClass,
          icon: statusInfo.icon,
          conditionText: condParts.length > 0 ? condParts.join(' · ') : undefined,
          dateReturnedLabel: isNonReturnable
            ? 'N/A (Consumed)'
            : log.dateReturned
              ? new Date(log.dateReturned).toLocaleDateString()
              : '-',
        });
      });

    return rows.sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime());
  }, [selectedRecipient, issues, issueLog]);

  const pendingItemsCount = useMemo(
    () => clearanceRows.filter((row) => row.pendingQty > 0).length,
    [clearanceRows],
  );

  const generateClearanceReport = async () => {
    if (!selectedRecipient) return;
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      const startY = await addOfficialHeaderToPdf(doc, {
        title: 'CLEARANCE REPORT',
        subtitle: `Recipient: ${selectedRecipient.name}`,
      });

      let metaY = startY + 2;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Name: ${selectedRecipient.name}`, 14, metaY);
      doc.text(`Type: ${selectedRecipient.type}`, 14, metaY + 6);
      if (selectedRecipient.regNumber) {
        doc.text(`Reg/ID No: ${selectedRecipient.regNumber}`, 14, metaY + 12);
        metaY += 6;
      }

      const head = [['Item Name / Serial', 'Qty', 'Date Issued', 'Expected Return', 'Status', 'Date Returned']];
      const body = clearanceRows.map((row) => [
        row.serialNumber ? `${row.itemName}\n(${row.serialNumber})` : row.itemName,
        row.qtyLabel,
        new Date(row.dateIssued).toLocaleDateString(),
        row.expectedReturn,
        row.pdfLabel,
        row.dateReturnedLabel,
      ]);

      doc.autoTable({ head, body, startY: metaY + 11, theme: 'grid', headStyles: { fillColor: [2, 132, 199] } });
      const finalY = doc.autoTable.previous.finalY;
      doc.setFontSize(11.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`Summary: ${pendingItemsCount} returnable item(s) pending return (non-returnable consumables excluded).`, 14, finalY + 10);

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth - 14,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'right' },
        );
      }

      doc.save(`Clearance_${selectedRecipient.name.replace(/ /g, '_')}.pdf`);
    } catch (err) {
      console.error('Clearance PDF error:', err);
      showToast('Failed to generate Clearance PDF report.', 'error');
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
          Clearance Check
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Verify pending tool returns and generate signed clearance sheets.
        </p>
      </div>

      <div className="bg-surface rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-xs space-y-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
            <input
              type="text"
              placeholder="Search Name or Reg/ID Number..."
              className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="min-h-[42px] bg-gradient-to-r from-primary to-primary-end text-white font-semibold py-2 px-4 rounded-xl text-xs sm:text-sm shrink-0 active:scale-[0.98]"
          >
            Search
          </button>
        </form>

        {recipients.length > 0 && (
          <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-0.5">
            {recipients.slice(0, 8).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSearchTerm(r.name);
                  setSelectedRecipient(r);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  selectedRecipient?.id === r.id
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedRecipient ? (
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-xs animate-fade-in-down space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 text-sky-700 font-display font-bold flex items-center justify-center shrink-0">
                {selectedRecipient.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-text-primary">
                  {selectedRecipient.name}
                </h2>
                <p className="text-xs sm:text-sm text-text-secondary">
                  {selectedRecipient.type}{' '}
                  {selectedRecipient.regNumber && `· ${selectedRecipient.regNumber}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => void generateClearanceReport()}
              className="min-h-[42px] bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-xl shadow-xs text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0"
            >
              <i className="fas fa-print"></i>
              <span>Print Clearance PDF</span>
            </button>
          </div>

          <div
            className={`p-3.5 sm:p-4 rounded-2xl border flex items-center gap-3 ${
              pendingItemsCount > 0
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <i
              className={`fas ${
                pendingItemsCount > 0 ? 'fa-circle-exclamation' : 'fa-circle-check'
              } text-lg shrink-0`}
            ></i>
            <p className="font-semibold text-sm tabular-nums">
              {pendingItemsCount > 0
                ? `${pendingItemsCount} returnable item(s) pending return.`
                : 'All returnable store items returned — Ready for clearance (consumables are non-returnable).'}
            </p>
          </div>

          <div>
            <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 mb-2.5">
              Issue History
            </h3>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              {/* Mobile History List (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {clearanceRows.map((row) => (
                  <div key={row.key} className="p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">
                        {row.itemName}{' '}
                        <span className="font-mono text-xs text-slate-500">
                          × {row.qtyLabel}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {new Date(row.dateIssued).toLocaleDateString()}
                        {row.serialNumber ? ` · ${row.serialNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${row.badgeClass}`}
                      >
                        {row.statusLabel}
                      </span>
                      {row.conditionText && (
                        <span className="text-[11px] font-semibold text-slate-600">
                          {row.conditionText}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                      <th className="px-6 py-3">Item / Serial</th>
                      <th className="px-6 py-3">Qty</th>
                      <th className="px-6 py-3">Date Issued</th>
                      <th className="px-6 py-3">Status &amp; Return Condition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clearanceRows.map((row) => (
                      <tr key={row.key} className="bg-white border-b hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {row.itemName}
                          {row.serialNumber && (
                            <span className="block text-xs text-gray-500">{row.serialNumber}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono tabular-nums">{row.qtyLabel}</td>
                        <td className="px-6 py-4 tabular-nums">
                          {new Date(row.dateIssued).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${row.textClass}`}
                          >
                            <i className={`fas ${row.icon}`}></i>
                            {row.statusLabel}
                          </span>
                          {row.conditionText && (
                            <span className="block text-[11px] font-semibold text-slate-600 mt-0.5">
                              Condition: {row.conditionText}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {clearanceRows.length === 0 && (
                <p className="text-center p-5 text-sm text-slate-500">
                  No issue history found for this recipient.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-8 text-center text-text-secondary shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-xl">
            <i className="fas fa-user-check"></i>
          </div>
          <p className="text-sm font-medium text-slate-700">
            Search or tap a recipient chip above to inspect clearance status.
          </p>
        </div>
      )}
    </div>
  );
};

const RecipientsPage: React.FC = () => {
  const { recipients, addRecipient, updateRecipient, deleteRecipient } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<Recipient | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<RecipientType>('Trainee');
  const [regNumber, setRegNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | RecipientType>('All');

  const filteredRecipients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recipients.filter((r) => {
      if (typeFilter !== 'All' && r.type !== typeFilter) return false;
      if (q) {
        return (
          r.name.toLowerCase().includes(q) ||
          (r.regNumber || '').toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [recipients, searchQuery, typeFilter]);

  const openModal = (item: Recipient | null = null) => {
    setCurrentItem(item);
    setName(item?.name || '');
    setType(item?.type || 'Trainee');
    setRegNumber(item?.regNumber || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentItem) {
      await updateRecipient({ ...currentItem, name, type, regNumber });
    } else {
      await addRecipient({ name, type, regNumber });
    }
    setIsModalOpen(false);
    setCurrentItem(null);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
            Recipients
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 tabular-nums">
            {recipients.length} registered trainee(s), trainers, and departments
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="min-h-[42px] bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white font-semibold py-2 px-4 rounded-xl shadow-xs text-xs sm:text-sm active:scale-[0.98]"
        >
          <i className="fas fa-plus mr-1.5"></i> Add Recipient
        </button>
      </div>

      <div className="bg-surface rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 space-y-3 shadow-xs">
        <div className="relative">
          <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recipients by name or ID..."
            className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 bg-slate-50/70 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-0.5">
          {(['All', 'Trainee', 'Trainer', 'Staff', 'Department', 'Other'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`min-h-[34px] px-3.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                typeFilter === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
        {/* Mobile Directory List (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredRecipients.map((r) => (
            <div key={r.id} className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-sky-50 border border-sky-100 text-sky-700 font-display font-bold text-xs flex items-center justify-center shrink-0">
                  {r.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900 truncate">{r.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {r.type}
                    {r.regNumber ? ` · ${r.regNumber}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openModal(r)}
                  className="min-h-[34px] px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deleteRecipient(r.id)}
                  className="min-h-[34px] px-3 rounded-xl bg-red-50 text-red-600 text-xs font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Reg/ID No.</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipients.map((r) => (
                <tr key={r.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{r.name}</td>
                  <td className="px-6 py-4">{r.type}</td>
                  <td className="px-6 py-4 font-mono">{r.regNumber || '-'}</td>
                  <td className="px-6 py-4 space-x-4">
                    <button
                      onClick={() => openModal(r)}
                      className="font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void deleteRecipient(r.id)}
                      className="font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRecipients.length === 0 && (
          <p className="text-center p-6 text-sm text-slate-500">No matching recipients found.</p>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentItem ? 'Edit Recipient' : 'Add Recipient'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RecipientType)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            >
              <option value="Trainee">Trainee</option>
              <option value="Trainer">Trainer</option>
              <option value="Staff">Staff</option>
              <option value="Department">Department</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Registration/ID Number (Optional)
            </label>
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.MAX_REG_NUMBER_LENGTH}
              value={regNumber}
              onChange={(e) => setRegNumber(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg mr-2 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white font-bold py-2 px-4 rounded-lg"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const Reports: React.FC = () => {
  const {
    inventory,
    assets,
    disposalLog,
    igaUnits,
    igaLogistics,
    settings,
    activeRole,
    activeDepartment,
    updateDisposalStatus,
    addDisposalRequest,
    showToast,
  } = useAppContext();
  const isHodMode = activeRole === 'hod' && Boolean(activeDepartment);
  const { jsPDF } = window.jspdf;
  const [isDisposalModalOpen, setIsDisposalModalOpen] = useState(false);
  const [itemToDispose, setItemToDispose] = useState<AssetItem | null>(null);
  const [disposalMethod, setDisposalMethod] = useState<DisposalMethod>('Public Auction');

  const obsoleteForDisposal = useMemo(
    () => assets.filter((a) => a.condition === 'Obsolete' && a.status === 'In Stock'),
    [assets],
  );

  const generatePdf = async (title: string, head: string[], body: (string | number)[][]) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const startY = await addOfficialHeaderToPdf(doc, {
        title,
        subtitle: isHodMode
          ? `${activeDepartment} Department Audit`
          : 'Procurement & Central Store Audit',
      });

      doc.autoTable({
        head: [head],
        body,
        startY: startY + 2,
        theme: 'grid',
        headStyles: { fillColor: [2, 132, 199] },
      });

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth - 14,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'right' },
        );
      }

      doc.save(`${title.replace(/ /g, '_')}.pdf`);
    } catch (err) {
      console.error('Report PDF error:', err);
      showToast('Failed to generate PDF report.', 'error');
    }
  };

  const generateFullStockReport = async () => {
    const head = ['Name', 'Category', 'Quantity', 'Unit', 'Type', 'Serial No.', 'Condition'];
    const body: (string | number)[][] = [];
    inventory.forEach((item) => {
      if (item.type === 'Consumable') {
        const typeLabel = isItemConsumable(item) ? 'Consumable' : 'Returnable Stock';
        body.push([item.name, item.category, item.quantity, item.unit, typeLabel, 'N/A', 'N/A']);
      } else {
        const itemAssets = assets.filter((a) => a.inventoryId === item.id);
        if (itemAssets.length > 0) {
          itemAssets.forEach((asset) => {
            body.push([
              item.name,
              item.category,
              1,
              item.unit,
              item.type,
              asset.serialNumber,
              asset.condition,
            ]);
          });
        } else {
          body.push([item.name, item.category, 0, item.unit, item.type, 'N/A', 'N/A']);
        }
      }
    });
    await generatePdf(
      isHodMode ? `${activeDepartment} Stock Report` : 'Full Stock Report (with Serials)',
      head,
      body,
    );
  };

  const generateAssetReport = async () => {
    const head = ['Name', 'Serial No.', 'Category', 'Department', 'Condition', 'Status'];
    const body: (string | number)[][] = [];
    assets.forEach((asset) => {
      const itemInfo = inventory.find((i) => i.id === asset.inventoryId);
      if (itemInfo) {
        body.push([
          itemInfo.name,
          asset.serialNumber,
          itemInfo.category,
          itemInfo.department,
          asset.condition,
          asset.status,
        ]);
      }
    });
    await generatePdf(
      isHodMode ? `${activeDepartment} Asset Report` : 'Serialized Asset Report',
      head,
      body,
    );
  };

  const generateDisposalForm = async (log: DisposalLogEntry) => {
    try {
      const doc = new jsPDF();
      const startY = await addOfficialHeaderToPdf(doc, {
        title: 'ASSET DISPOSAL FORM',
        subtitle: 'Asset Board & Procurement Office',
      });
      doc.autoTable({
        startY: startY + 2,
        theme: 'plain',
        body: [
          ['Item to be Disposed:', log.itemName],
          ['Category:', log.itemCategory],
          ['Date of Request:', new Date().toLocaleDateString()],
          ['Recommended Method:', log.method],
          ['Status:', log.status],
          ['Reason for Disposal:', 'Marked as Obsolete'],
        ],
      });
      const finalY = doc.autoTable.previous.finalY;
      doc.setFont('helvetica', 'bold');
      doc.text('Authorization:', 14, finalY + 15);
      doc.setFont('helvetica', 'normal');
      doc.text('Procurement Officer: ....................................', 14, finalY + 30);
      doc.text('Date: ......................', 140, finalY + 30);
      doc.text('Head of Institution: ....................................', 14, finalY + 45);
      doc.text('Date: ......................', 140, finalY + 45);
      doc.save(`Disposal_Form_${log.itemName.replace(/ /g, '_')}.pdf`);
    } catch (err) {
      console.error('Disposal PDF error:', err);
      showToast('Failed to generate Disposal Form PDF.', 'error');
    }
  };

  const statusColors: Record<string, string> = {
    Pending: 'text-amber-700',
    Approved: 'text-emerald-700',
    Rejected: 'text-red-700',
    Disposed: 'text-slate-600',
  };

  const itemForDisposalModal = itemToDispose
    ? inventory.find((i) => i.id === itemToDispose.inventoryId)
    : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
          {isHodMode ? `${activeDepartment} Reports` : 'Reports & Disposal'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          {isHodMode
            ? `Download ${activeDepartment} PDF stock audits, asset registers, and IGA ledgers.`
            : 'Download PDF stock audits, asset registers, IGA ledgers, and disposal forms.'}
        </p>
      </div>

      <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3.5">
        <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
          Generate PDF Reports
        </h2>
        <div
          className={`grid grid-cols-1 gap-3 sm:gap-4 ${
            isHodMode ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'
          }`}
        >
          <button
            onClick={generateFullStockReport}
            className="bg-slate-50/70 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-2xl p-4 sm:p-5 flex items-center sm:flex-col sm:justify-center gap-3.5 text-left sm:text-center transition-all active:scale-[0.98]"
          >
            <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center text-xl shrink-0">
              <i className="fas fa-boxes-stacked"></i>
            </div>
            <div className="min-w-0 flex-1 sm:flex-initial">
              <p className="font-display text-sm sm:text-base font-bold text-text-primary">
                Full Stock Report
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Consumables &amp; serial balances</p>
            </div>
            <i className="fas fa-chevron-right text-slate-400 text-xs sm:hidden"></i>
          </button>
          <button
            onClick={generateAssetReport}
            className="bg-slate-50/70 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-2xl p-4 sm:p-5 flex items-center sm:flex-col sm:justify-center gap-3.5 text-left sm:text-center transition-all active:scale-[0.98]"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl shrink-0">
              <i className="fas fa-computer"></i>
            </div>
            <div className="min-w-0 flex-1 sm:flex-initial">
              <p className="font-display text-sm sm:text-base font-bold text-text-primary">
                Asset Register PDF
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Serialized equipment &amp; status</p>
            </div>
            <i className="fas fa-chevron-right text-slate-400 text-xs sm:hidden"></i>
          </button>
          <button
            onClick={() =>
              void generateIGASummaryPdf({
                settings,
                igaUnits,
                igaLogistics,
                departmentFilter: isHodMode ? activeDepartment : undefined,
              })
            }
            className="bg-slate-50/70 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 sm:p-5 flex items-center sm:flex-col sm:justify-center gap-3.5 text-left sm:text-center transition-all active:scale-[0.98]"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl shrink-0">
              <i className="fas fa-store"></i>
            </div>
            <div className="min-w-0 flex-1 sm:flex-initial">
              <p className="font-display text-sm sm:text-base font-bold text-text-primary">
                {isHodMode ? `${activeDepartment} IGA PDF` : 'IGA & Logistics PDF'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Revenue, requisitions &amp; surplus</p>
            </div>
            <i className="fas fa-chevron-right text-slate-400 text-xs sm:hidden"></i>
          </button>
          {isHodMode && (
            <button
              onClick={() =>
                document
                  .getElementById('stock-taking-section')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="bg-slate-50/70 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-2xl p-4 sm:p-5 flex items-center sm:flex-col sm:justify-center gap-3.5 text-left sm:text-center transition-all active:scale-[0.98]"
            >
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl shrink-0">
                <i className="fas fa-clipboard-check"></i>
              </div>
              <div className="min-w-0 flex-1 sm:flex-initial">
                <p className="font-display text-sm sm:text-base font-bold text-text-primary">
                  Stock Taking Sheet
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeDepartment} physical vs system qty
                </p>
              </div>
              <i className="fas fa-chevron-right text-slate-400 text-xs sm:hidden"></i>
            </button>
          )}
        </div>
      </div>

      <StockTakingSection isHodMode={isHodMode} activeDepartment={activeDepartment} />

      {!isHodMode && (
        <div className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
          <h2 className="font-display text-base sm:text-lg font-bold p-4 border-b border-slate-200">
            Obsolete Assets for Disposal
          </h2>
          {/* Mobile List (< md) */}
          <div className="md:hidden divide-y divide-slate-100">
            {obsoleteForDisposal.map((asset) => {
              const itemInfo = inventory.find((i) => i.id === asset.inventoryId);
              return (
                <div key={asset.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">
                      {itemInfo?.name}
                    </p>
                    <p className="text-xs text-slate-500 font-mono truncate">
                      {asset.serialNumber} · {itemInfo?.category}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setItemToDispose(asset);
                      setDisposalMethod('Public Auction');
                      setIsDisposalModalOpen(true);
                    }}
                    className="min-h-[34px] bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-1.5 px-3 rounded-xl shrink-0"
                  >
                    Dispose
                  </button>
                </div>
              );
            })}
          </div>
          {/* Desktop Table (md+) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-6 py-3">Item Name</th>
                  <th className="px-6 py-3">Serial No.</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {obsoleteForDisposal.map((asset) => {
                  const itemInfo = inventory.find((i) => i.id === asset.inventoryId);
                  return (
                    <tr key={asset.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-6 py-4">{itemInfo?.name}</td>
                      <td className="px-6 py-4 font-mono">{asset.serialNumber}</td>
                      <td className="px-6 py-4">{itemInfo?.category}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setItemToDispose(asset);
                            setDisposalMethod('Public Auction');
                            setIsDisposalModalOpen(true);
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white text-xs py-1 px-2.5 rounded-lg font-semibold"
                        >
                          Request Disposal
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {obsoleteForDisposal.length === 0 && (
            <p className="text-center p-5 text-sm text-slate-500">
              No obsolete assets awaiting disposal.
            </p>
          )}
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
        <h2 className="font-display text-base sm:text-lg font-bold p-4 border-b border-slate-200">
          Disposal Requests Log
        </h2>
        {/* Mobile List (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {disposalLog.map((log) => (
            <div key={log.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900 truncate">{log.itemName}</p>
                  <p className="text-xs text-slate-500">{log.method}</p>
                </div>
                <span className={`text-xs font-bold shrink-0 ${statusColors[log.status] || ''}`}>
                  {log.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void generateDisposalForm(log)}
                  className="min-h-[32px] px-3 rounded-xl bg-sky-50 text-sky-700 text-xs font-semibold"
                >
                  <i className="fas fa-file-pdf mr-1"></i> Form
                </button>
                {activeRole === 'admin' && log.status === 'Pending' && (
                  <>
                    <button
                      onClick={() => void updateDisposalStatus(log.id, 'Approved')}
                      className="min-h-[32px] px-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void updateDisposalStatus(log.id, 'Rejected')}
                      className="min-h-[32px] px-3 rounded-xl bg-red-50 text-red-600 text-xs font-semibold"
                    >
                      Reject
                    </button>
                  </>
                )}
                {activeRole === 'admin' && log.status === 'Approved' && (
                  <button
                    onClick={() => void updateDisposalStatus(log.id, 'Disposed')}
                    className="min-h-[32px] px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    Mark Disposed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
              <tr>
                <th className="px-6 py-3">Item Name (Serial)</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {disposalLog.map((log) => (
                <tr key={log.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-6 py-4">{log.itemName}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold ${statusColors[log.status] || ''}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{log.method}</td>
                  <td className="px-6 py-4 space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => void generateDisposalForm(log)}
                      className="font-medium text-primary hover:underline"
                    >
                      <i className="fas fa-file-pdf mr-1"></i> Form
                    </button>
                    {activeRole === 'admin' && (
                      <>
                        {log.status === 'Pending' && (
                          <>
                            <button
                              onClick={() => void updateDisposalStatus(log.id, 'Approved')}
                              className="font-medium text-green-600 hover:underline"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => void updateDisposalStatus(log.id, 'Rejected')}
                              className="font-medium text-red-600 hover:underline"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {log.status === 'Approved' && (
                          <button
                            onClick={() => void updateDisposalStatus(log.id, 'Disposed')}
                            className="font-medium text-gray-600 hover:underline"
                          >
                            Mark Disposed
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {disposalLog.length === 0 && (
          <p className="text-center p-5 text-sm text-slate-500">No disposal requests found.</p>
        )}
      </div>

      {itemToDispose && itemForDisposalModal && (
        <Modal
          isOpen={isDisposalModalOpen}
          onClose={() => {
            setIsDisposalModalOpen(false);
            setItemToDispose(null);
          }}
          title={`Request Disposal for ${itemForDisposalModal.name}`}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await addDisposalRequest({ assetId: itemToDispose.id, method: disposalMethod });
              setIsDisposalModalOpen(false);
              setItemToDispose(null);
            }}
            className="space-y-4"
          >
            <p>
              <strong>Item:</strong> {itemForDisposalModal.name}
            </p>
            <p>
              <strong>Serial Number:</strong> {itemToDispose.serialNumber}
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Recommended Disposal Method
              </label>
              <select
                value={disposalMethod}
                onChange={(e) => setDisposalMethod(e.target.value as DisposalMethod)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
              >
                <option value="Public Auction">Public Auction</option>
                <option value="Public Tender">Public Tender</option>
                <option value="Donation">Donation</option>
                <option value="Destruction">Destruction</option>
                <option value="Trade-in">Trade-in</option>
              </select>
            </div>
            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsDisposalModalOpen(false);
                  setItemToDispose(null);
                }}
                className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg mr-2 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-gradient-to-r from-red-500 to-red-600 text-white font-bold py-2 px-4 rounded-lg"
              >
                Submit Request
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

const Settings: React.FC = () => {
  const {
    settings,
    inventory,
    assets,
    recipients,
    issues,
    stockMovements,
    issueLog,
    disposalLog,
    igaUnits,
    igaLogistics,
    storeMembers,
    user,
    activeRole,
    hasLocalBackupData,
    demoRecordCount,
    updateSettings,
    addStoreMember,
    updateStoreMember,
    removeStoreMember,
    resyncStorePermissions,
    seedSampleData,
    refreshDemonstrationData,
    deleteDemonstrationData,
    migrateLocalStorageData,
    showToast,
    importData,
  } = useAppContext();

  const [institutionName, setInstitutionName] = useState(settings.institutionName);
  const [logo, setLogo] = useState(sanitizeLogoDataUrl(settings.logo));
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>('officer');
  const [newMemberDepartment, setNewMemberDepartment] = useState<string>('');
  const [demoActionLoading, setDemoActionLoading] = useState(false);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState(false);
  const isAdminUser = activeRole === 'admin' || Boolean(user?.isBootstrappedAdmin);

  useEffect(() => {
    setInstitutionName(settings.institutionName);
    setLogo(sanitizeLogoDataUrl(settings.logo));
  }, [settings]);

  const handleSave = async () => {
    await updateSettings({ institutionName, logo });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const pngDataUrl = await resizeImageToPngDataUrl(file);
        setLogo(pngDataUrl);
      } catch {
        showToast('Failed to process uploaded logo.', 'error');
      }
    }
  };

  const exportData = () => {
    const data = {
      inventory,
      assets,
      recipients,
      issues,
      stockMovements,
      issueLog,
      disposalLog,
      igaUnits,
      igaLogistics,
      settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ertvc-sms-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Cloud data exported successfully!', 'success');
  };

  const handleDataImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        void importData(String(event.target?.result || ''));
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
          Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Manage institution branding, HOD &amp; officer team access, and cloud backups.
        </p>
      </div>

      <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-6 space-y-4 shadow-xs">
        <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
          Institution Branding
        </h2>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Institution Name
          </label>
          <input
            type="text"
            maxLength={VALIDATION_LIMITS.MAX_NAME_LENGTH}
            value={institutionName}
            onChange={(e) => setInstitutionName(e.target.value)}
            className="block w-full rounded-xl border-slate-200 bg-slate-50/70 py-2.5 px-3.5 text-sm focus:bg-white focus:border-primary focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Institution Logo
          </label>
          <div className="flex flex-wrap items-center gap-3.5">
            <img
              src={logo}
              alt="Logo Preview"
              className="h-14 w-14 object-contain bg-slate-50 border border-slate-200 rounded-xl p-1"
            />
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs sm:text-sm" />
            <button
              type="button"
              onClick={() => setLogo(ERTVC_LOGO_PATH)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Use Default ERTVC Logo
            </button>
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            className="min-h-[42px] bg-gradient-to-r from-primary to-primary-end hover:from-primary-end hover:to-primary text-white font-semibold py-2 px-5 rounded-xl text-sm active:scale-[0.98]"
          >
            Save Settings
          </button>
        </div>
      </div>

      {user?.isBootstrappedAdmin ? (
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                  Team Access Allowlist (Google Accounts)
                </h2>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 tabular-nums">
                  {storeMembers.filter((m) => m.status === 'active').length + 1} /{' '}
                  {VALIDATION_LIMITS.MAX_MEMBER_EMAILS} active
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                Only emails listed as <strong>Active</strong> below (plus the Master Admin) can sign
                in and access ERTVC store records. Revoked or unlisted accounts are blocked
                automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void resyncStorePermissions()}
              className="min-h-[34px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shrink-0 self-start flex items-center gap-1.5"
              title="Re-apply active email permissions across all Firestore documents"
            >
              <i className="fas fa-shield-halved text-sky-600"></i>
              <span>Sync Permissions</span>
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await addStoreMember(
                newMemberEmail,
                newMemberRole,
                newMemberRole === 'admin' ? '' : newMemberDepartment,
              );
              setNewMemberEmail('');
            }}
            className="flex flex-col sm:flex-row flex-wrap gap-2"
          >
            <input
              type="email"
              placeholder="member@gmail.com"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              className="flex-1 min-w-[200px] rounded-xl border-slate-200 bg-slate-50/70 py-2.5 px-3.5 text-sm focus:bg-white focus:border-primary focus:ring-primary"
              required
            />
            <select
              value={newMemberRole}
              onChange={(e) => {
                const nextRole = e.target.value as UserRole;
                setNewMemberRole(nextRole);
                if (nextRole === 'hod' && !newMemberDepartment) {
                  setNewMemberDepartment(STANDARD_TVET_DEPARTMENTS[0]);
                } else if (nextRole === 'admin') {
                  setNewMemberDepartment('');
                }
              }}
              className="rounded-xl border-slate-200 bg-slate-50/70 py-2.5 px-3 text-sm focus:bg-white focus:border-primary focus:ring-primary"
            >
              <option value="officer">Officer</option>
              <option value="hod">HOD (Head of Dept)</option>
              <option value="admin">Admin</option>
            </select>
            {(newMemberRole === 'hod' || newMemberRole === 'officer') && (
              <select
                aria-label="Member Department"
                value={
                  newMemberRole === 'hod'
                    ? newMemberDepartment || STANDARD_TVET_DEPARTMENTS[0]
                    : newMemberDepartment
                }
                onChange={(e) => setNewMemberDepartment(e.target.value)}
                className="rounded-xl border-slate-200 bg-slate-50/70 py-2.5 px-3 text-sm focus:bg-white focus:border-primary focus:ring-primary"
                required={newMemberRole === 'hod'}
              >
                {newMemberRole === 'officer' && (
                  <option value="">Central Store (All Departments)</option>
                )}
                {STANDARD_TVET_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              className="min-h-[42px] bg-primary hover:bg-primary-end text-white font-semibold py-2 px-4 rounded-xl text-sm"
            >
              Authorize
            </button>
          </form>

          {storeMembers.length > 0 && (
            <ul className="space-y-2.5 text-sm">
              {storeMembers.map((m) => (
                <li
                  key={m.id}
                  className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">{m.email}</p>
                    <p className="text-xs text-text-secondary">
                      Role:{' '}
                      <span className="font-semibold uppercase text-slate-700">
                        {m.role === 'hod'
                          ? `HOD · ${m.department || 'Unassigned'}`
                          : m.role === 'officer'
                            ? `OFFICER · ${m.department || 'Central Store'}`
                            : m.role}
                      </span>{' '}
                      · Status: <span className="capitalize">{m.status}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Role for ${m.email}`}
                      value={m.role}
                      onChange={(e) => {
                        const nextRole = e.target.value as UserRole;
                        void updateStoreMember(m, {
                          role: nextRole,
                          department:
                            nextRole === 'hod'
                              ? m.department || STANDARD_TVET_DEPARTMENTS[0]
                              : nextRole === 'officer'
                                ? m.department || ''
                                : '',
                        });
                      }}
                      className="rounded-xl border-slate-200 bg-white text-xs py-1.5 px-2.5"
                    >
                      <option value="officer">Officer</option>
                      <option value="hod">HOD</option>
                      <option value="admin">Admin</option>
                    </select>
                    {(m.role === 'hod' || m.role === 'officer') && (
                      <select
                        aria-label={`Department for ${m.email}`}
                        value={
                          m.role === 'hod'
                            ? m.department || STANDARD_TVET_DEPARTMENTS[0]
                            : m.department || ''
                        }
                        onChange={(e) =>
                          void updateStoreMember(m, {
                            role: m.role,
                            department: e.target.value,
                          })
                        }
                        className="rounded-xl border-slate-200 bg-white text-xs py-1.5 px-2.5"
                      >
                        {m.role === 'officer' && <option value="">Central Store</option>}
                        {STANDARD_TVET_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() =>
                        void updateStoreMember(m, {
                          status: m.status === 'active' ? 'revoked' : 'active',
                        })
                      }
                      className="text-xs font-semibold text-primary hover:underline px-1.5"
                    >
                      {m.status === 'active' ? 'Revoke' : 'Activate'}
                    </button>
                    <button
                      onClick={() => void removeStoreMember(m)}
                      className="text-xs font-semibold text-red-600 hover:underline px-1.5"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <i className="fas fa-user-shield"></i>
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">
              Team Access Governance
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Adding, revoking, or changing authorized Google accounts is restricted exclusively to
              the Master Administrator (<span className="font-mono">procurementertvc@gmail.com</span>).
            </p>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 sm:p-6 space-y-4 shadow-xs">
        <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
          Data Management
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={exportData}
            className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            <i className="fas fa-download"></i>
            <span>Export Backup (JSON)</span>
          </button>
          <label className="min-h-[44px] bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 px-4 rounded-xl cursor-pointer text-sm flex items-center justify-center gap-2">
            <i className="fas fa-upload"></i>
            <span>Restore Backup</span>
            <input type="file" accept=".json" onChange={handleDataImport} className="hidden" />
          </label>
        </div>
        {hasLocalBackupData && (
          <button
            onClick={() => void migrateLocalStorageData()}
            className="w-full min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 px-4 rounded-xl text-sm"
          >
            <i className="fas fa-cloud-arrow-up mr-2"></i> Migrate Previous Browser Data to Cloud
          </button>
        )}

        {isAdminUser && (
          <div className="pt-4 border-t border-slate-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-display text-sm sm:text-base font-bold text-slate-900">
                  Institutional Demonstration Data
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Load realistic sample records across all modules (returnable fittings, 90m cable rolls, Gate Pass issues, return condition inspection, Drive-linked IGA proposal, disposal &amp; FY 2026/2027 budgets) for training or evaluation. Only demo records are removed when cleared later.
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shrink-0 self-start ${
                  demoRecordCount > 0
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <i className={`fas ${demoRecordCount > 0 ? 'fa-flask' : 'fa-circle-check'}`}></i>
                {demoRecordCount > 0
                  ? `${demoRecordCount} demo record(s) active`
                  : 'No demo records'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={demoActionLoading}
                onClick={async () => {
                  setDemoActionLoading(true);
                  setConfirmDeleteDemo(false);
                  try {
                    if (demoRecordCount > 0) {
                      await refreshDemonstrationData();
                    } else {
                      await seedSampleData();
                    }
                  } finally {
                    setDemoActionLoading(false);
                  }
                }}
                className="min-h-[44px] bg-sky-700 hover:bg-sky-800 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <i className={`fas ${demoRecordCount > 0 ? 'fa-rotate' : 'fa-database'}`}></i>
                <span>
                  {demoActionLoading
                    ? 'Loading All-Dept Demo...'
                    : demoRecordCount > 0
                      ? 'Reload All-Dept Demo Data'
                      : 'Load All-Dept Demo Data'}
                </span>
              </button>

              <button
                type="button"
                disabled={demoActionLoading || (demoRecordCount === 0 && !settings.seeded)}
                onClick={() => setConfirmDeleteDemo(true)}
                className="min-h-[44px] bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <i className="fas fa-trash-can"></i>
                <span>Delete All Demonstration Data</span>
              </button>
            </div>

            {confirmDeleteDemo && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-xs text-rose-900 font-medium">
                  Remove all <strong>{demoRecordCount}</strong> demonstration record(s) from the database? Any real records created by your staff will remain completely untouched.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={demoActionLoading}
                    onClick={() => setConfirmDeleteDemo(false)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={demoActionLoading}
                    onClick={async () => {
                      setDemoActionLoading(true);
                      try {
                        await deleteDemonstrationData();
                        setConfirmDeleteDemo(false);
                      } finally {
                        setDemoActionLoading(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold disabled:opacity-60"
                  >
                    {demoActionLoading ? 'Deleting...' : 'Confirm Delete Demo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const {
    authReady,
    accessState,
    dataLoading,
    isOnline,
    user,
    activeRole,
    activeDepartment,
    loginIntent,
    settings,
    inventory,
    recipients,
    igaUnits,
    issueRequests,
    departmentBudgets,
    signInWithGoogle,
    switchDeskView,
    recheckAccess,
    handleLogout,
  } = useAppContext();
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [inventoryQuickQuery, setInventoryQuickQuery] = useState('');
  const [inventoryStockFilter, setInventoryStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [openAddModalNonce, setOpenAddModalNonce] = useState(0);
  const [issueLogInitialFilter, setIssueLogInitialFilter] = useState<
    'All' | 'Pending Return' | 'Gate Pass' | 'Consumables' | 'Returned'
  >('All');
  const [openBulkIssueNonce, setOpenBulkIssueNonce] = useState(0);
  const [sidebarHighlight, setSidebarHighlight] = useState<string>('');
  const [clearanceQuickQuery, setClearanceQuickQuery] = useState('');
  const [igaQuickDept, setIgaQuickDept] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const beforeInstallHandler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const appInstalledHandler = () => {
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', beforeInstallHandler);
    window.addEventListener('appinstalled', appInstalledHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
      window.removeEventListener('appinstalled', appInstalledHandler);
    };
  }, []);

  const handleInstallClick = () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then(() => setInstallPrompt(null));
  };

  const pendingIssueRequestsCount = useMemo(
    () => issueRequests.filter((r) => r.status === 'Pending').length,
    [issueRequests],
  );

  const pendingIgaApprovalsCount = useMemo(
    () => igaUnits.filter((u) => (u.approvalStatus || 'Approved') === 'Pending').length,
    [igaUnits],
  );

  const pendingBudgetsCount = useMemo(
    () =>
      activeRole === 'hod'
        ? departmentBudgets.filter((b) => b.status === 'Returned').length
        : departmentBudgets.filter((b) => b.status === 'Submitted').length,
    [departmentBudgets, activeRole],
  );

  const navTabs: ErpNavItem[] = useMemo(() => {
    if (activeRole === 'hod') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', section: 'Overview' },
        { id: 'iga', label: 'IGA Hub', icon: 'fa-store', section: 'Store & Operations' },
        { id: 'inventory', label: 'Inventory', icon: 'fa-box', section: 'Store & Operations' },
        {
          id: 'issueLog',
          label: 'Issue Requests',
          icon: 'fa-clipboard-list',
          section: 'Store & Operations',
        },
        {
          id: 'clearance',
          label: 'Clearance',
          icon: 'fa-user-check',
          section: 'Store & Operations',
        },
        {
          id: 'budgets',
          label: 'FY Budgets',
          icon: 'fa-file-invoice-dollar',
          section: 'Governance',
          badgeCount: pendingBudgetsCount,
        },
        { id: 'reports', label: 'Reports', icon: 'fa-file-pdf', section: 'Governance' },
      ];
    }
    const base: ErpNavItem[] = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', section: 'Overview' },
      { id: 'inventory', label: 'Inventory', icon: 'fa-box', section: 'Store & Operations' },
      {
        id: 'iga',
        label: 'IGA Hub',
        icon: 'fa-store',
        section: 'Store & Operations',
        badgeCount: activeRole === 'admin' ? pendingIgaApprovalsCount : 0,
      },
      {
        id: 'issueLog',
        label: 'Issue Log',
        icon: 'fa-clipboard-list',
        section: 'Store & Operations',
        badgeCount: pendingIssueRequestsCount,
      },
      { id: 'recipients', label: 'Recipients', icon: 'fa-users', section: 'Store & Operations' },
      {
        id: 'clearance',
        label: 'Clearance',
        icon: 'fa-user-check',
        section: 'Store & Operations',
      },
      {
        id: 'budgets',
        label: 'FY Budgets',
        icon: 'fa-file-invoice-dollar',
        section: 'Governance',
        badgeCount: pendingBudgetsCount,
      },
      { id: 'reports', label: 'Reports', icon: 'fa-file-pdf', section: 'Governance' },
    ];
    if (activeRole === 'admin') {
      base.push({ id: 'settings', label: 'Settings', icon: 'fa-cog', section: 'Governance' });
    }
    return base;
  }, [activeRole, pendingIssueRequestsCount, pendingIgaApprovalsCount, pendingBudgetsCount]);

  useEffect(() => {
    const allowedIds = new Set(navTabs.map((t) => t.id));
    if (!allowedIds.has(activePage)) {
      setActivePage(activeRole === 'hod' ? 'iga' : 'dashboard');
    }
  }, [navTabs, activePage, activeRole]);

  const quickSearchMatches = useMemo(() => {
    const term = globalSearch.trim().toLowerCase();
    if (!term) return { items: [], people: [], igas: [], budgets: [] };
    return {
      items: inventory
        .filter(
          (i) =>
            i.name.toLowerCase().includes(term) ||
            i.category.toLowerCase().includes(term) ||
            (i.department || '').toLowerCase().includes(term),
        )
        .slice(0, 4),
      people: recipients
        .filter(
          (r) =>
            r.name.toLowerCase().includes(term) ||
            (r.regNumber || '').toLowerCase().includes(term),
        )
        .slice(0, 4),
      igas: igaUnits
        .filter(
          (u) =>
            u.department.toLowerCase().includes(term) ||
            u.igaName.toLowerCase().includes(term) ||
            u.activityType.toLowerCase().includes(term),
        )
        .slice(0, 3),
      budgets: departmentBudgets
        .filter(
          (b) =>
            b.title.toLowerCase().includes(term) ||
            b.department.toLowerCase().includes(term) ||
            b.financialYear.toLowerCase().includes(term),
        )
        .slice(0, 3),
    };
  }, [globalSearch, inventory, recipients, igaUnits, departmentBudgets]);

  const navigateToPage = (page: string) => {
    setSidebarHighlight('');
    if (page === 'inventory') {
      setInventoryStockFilter('all');
      setInventoryQuickQuery('');
    }
    if (page === 'issueLog') {
      setIssueLogInitialFilter('All');
    }
    setActivePage(page);
    setSearchOpen(false);
    setMobileSearchOpen(false);
  };

  const handleOpenInventoryFilter = (filter: 'all' | 'low' | 'out', searchQuery = '') => {
    setSidebarHighlight('inventory');
    setInventoryStockFilter(filter);
    setInventoryQuickQuery(searchQuery);
    setActivePage('inventory');
    setSearchOpen(false);
    setMobileSearchOpen(false);
  };

  const handleTriggerStockIn = () => {
    setSidebarHighlight('');
    setInventoryStockFilter('all');
    setInventoryQuickQuery('');
    setActivePage('inventory');
    setOpenAddModalNonce((n) => n + 1);
    setSearchOpen(false);
    setMobileSearchOpen(false);
  };

  const handleTriggerStockOut = () => {
    setSidebarHighlight('');
    setIssueLogInitialFilter('All');
    setActivePage('issueLog');
    setOpenBulkIssueNonce((n) => n + 1);
    setSearchOpen(false);
    setMobileSearchOpen(false);
  };

  const handleOpenReturnsFilter = () => {
    setSidebarHighlight('returns');
    setIssueLogInitialFilter('Pending Return');
    setActivePage('issueLog');
    setSearchOpen(false);
    setMobileSearchOpen(false);
  };

  if (!authReady || accessState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <i className="fas fa-spinner fa-spin text-3xl text-primary"></i>
          <p className="text-sm text-text-secondary">
            Connecting to {DEFAULT_INSTITUTION_NAME} Cloud Store...
          </p>
        </div>
      </div>
    );
  }

  if (accessState === 'signed_out') {
    return <NeumorphicLoginScreen onGoogleSignIn={signInWithGoogle} />;
  }

  if (accessState === 'uninvited' || accessState === 'revoked') {
    return (
      <NeumorphicAccessScreen
        userEmail={user?.email || ''}
        isRevoked={accessState === 'revoked'}
        requestedRole={loginIntent.role}
        requestedDepartment={loginIntent.department}
        onRecheckAccess={recheckAccess}
        onLogout={handleLogout}
      />
    );
  }

  const isHodDesk = activeRole === 'hod' && Boolean(activeDepartment);

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <DashboardHome
            onNavigate={navigateToPage}
            onOpenInventoryFilter={handleOpenInventoryFilter}
            onTriggerStockIn={handleTriggerStockIn}
            onTriggerStockOut={handleTriggerStockOut}
            onOpenReturnsFilter={handleOpenReturnsFilter}
          />
        );
      case 'inventory':
        return (
          <Inventory
            initialSearchTerm={inventoryQuickQuery}
            initialStockFilter={inventoryStockFilter}
            openAddModalNonce={openAddModalNonce}
            isHodView={isHodDesk}
            hodDepartment={isHodDesk ? activeDepartment : ''}
          />
        );
      case 'iga':
        return (
          <IGAHubPage
            initialDepartmentFilter={igaQuickDept}
            hodDepartment={isHodDesk ? activeDepartment : ''}
          />
        );
      case 'issueLog':
        return (
          <IssueLogPage
            isHodView={isHodDesk}
            initialStatusFilter={issueLogInitialFilter}
            openBulkIssueNonce={openBulkIssueNonce}
          />
        );
      case 'recipients':
        return isHodDesk ? (
          <DashboardHome
            onNavigate={navigateToPage}
            onOpenInventoryFilter={handleOpenInventoryFilter}
            onTriggerStockIn={handleTriggerStockIn}
            onTriggerStockOut={handleTriggerStockOut}
            onOpenReturnsFilter={handleOpenReturnsFilter}
          />
        ) : (
          <RecipientsPage />
        );
      case 'clearance':
        return <ClearancePage initialSearchTerm={clearanceQuickQuery} />;
      case 'budgets':
        return <BudgetsPage />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return activeRole === 'admin' ? (
          <Settings />
        ) : (
          <DashboardHome
            onNavigate={navigateToPage}
            onOpenInventoryFilter={handleOpenInventoryFilter}
            onTriggerStockIn={handleTriggerStockIn}
            onTriggerStockOut={handleTriggerStockOut}
            onOpenReturnsFilter={handleOpenReturnsFilter}
          />
        );
      default:
        return (
          <DashboardHome
            onNavigate={navigateToPage}
            onOpenInventoryFilter={handleOpenInventoryFilter}
            onTriggerStockIn={handleTriggerStockIn}
            onTriggerStockOut={handleTriggerStockOut}
            onOpenReturnsFilter={handleOpenReturnsFilter}
          />
        );
    }
  };

  const activeNavLabel =
    sidebarHighlight === 'returns'
      ? 'Returns'
      : navTabs.find((t) => t.id === activePage)?.label || 'Dashboard';

  const headerDisplayName =
    user?.displayName ||
    (isHodDesk
      ? `${activeDepartment} HOD`
      : activeRole === 'officer'
        ? 'Store Officer'
        : 'Procurement Admin');
  const headerRoleLabel = isHodDesk
    ? 'HOD Desk'
    : activeRole === 'officer'
      ? 'Store Officer'
      : 'Store Manager';
  const headerInitials =
    headerDisplayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'PA';
  const governanceInboxCount =
    pendingBudgetsCount + (activeRole === 'admin' ? pendingIgaApprovalsCount : 0);

  return (
    <div className="min-h-screen flex bg-[#f4f7fb] text-text-primary">
      {/* Desktop: Deep Navy Central Store ERP Sidebar */}
      <ErpSidebar
        institutionName={settings.institutionName}
        logo={settings.logo}
        items={navTabs}
        activePage={activePage}
        activeNavHighlight={sidebarHighlight || activePage}
        onSelectPage={navigateToPage}
        onOpenReturnsFilter={!isHodDesk ? handleOpenReturnsFilter : undefined}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        userEmail={user?.email || ''}
        userName={user?.displayName || ''}
        activeRole={activeRole}
        activeDepartment={activeDepartment}
        isBootstrappedAdmin={Boolean(user?.isBootstrappedAdmin)}
        onSwitchDeskView={switchDeskView}
        onLogout={() => void handleLogout()}
      />

      {/* Main Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Utility Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 px-4 sm:px-6 lg:px-7">
          <div className="h-16 flex items-center justify-between gap-3 sm:gap-5">
            {/* Zone 1: Sidebar Toggle (lg+) / Brand Crest (mobile) + Page Title */}
            <div className="flex items-center gap-3 min-w-0 shrink-0">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="hidden lg:inline-flex w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 items-center justify-center transition-colors"
              >
                <i className="fas fa-bars text-sm"></i>
              </button>
              <img
                src={sanitizeLogoDataUrl(settings.logo)}
                alt={settings.institutionName}
                referrerPolicy="no-referrer"
                className="lg:hidden w-8 h-8 rounded-full object-contain bg-white border border-slate-200 p-0.5 shrink-0"
              />
              <h2 className="font-display font-bold text-slate-900 truncate text-base sm:text-lg">
                {activeNavLabel}
              </h2>
            </div>

            {/* Zone 2: Desktop Global Search */}
            <div className="relative flex-1 max-w-lg hidden md:block">
              <div className="relative flex items-center">
                <i className="fas fa-search absolute left-3.5 text-slate-400 text-xs pointer-events-none"></i>
                <input
                  type="text"
                  value={globalSearch}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => window.setTimeout(() => setSearchOpen(false), 180)}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    setSearchOpen(true);
                  }}
                  placeholder="Search items, categories, recipients, documents..."
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none transition-colors"
                />
                {globalSearch && (
                  <button
                    type="button"
                    onClick={() => setGlobalSearch('')}
                    aria-label="Clear quick search"
                    className="absolute right-3 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>

              {searchOpen && globalSearch.trim().length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl z-30 p-2 space-y-2">
                  {quickSearchMatches.items.length === 0 &&
                  quickSearchMatches.people.length === 0 &&
                  quickSearchMatches.igas.length === 0 &&
                  quickSearchMatches.budgets.length === 0 ? (
                    <p className="text-xs text-slate-500 px-3 py-2">No matching records found.</p>
                  ) : (
                    <>
                      {quickSearchMatches.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={() => {
                            setInventoryStockFilter('all');
                            setInventoryQuickQuery(item.name);
                            setGlobalSearch('');
                            setActivePage('inventory');
                            setSearchOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-sky-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900 truncate">{item.name}</span>
                          <span className="text-sky-700 font-medium shrink-0 ml-2">Inventory →</span>
                        </button>
                      ))}
                      {quickSearchMatches.budgets.map((budget) => (
                        <button
                          key={budget.id}
                          type="button"
                          onMouseDown={() => {
                            setGlobalSearch('');
                            navigateToPage('budgets');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-sky-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900 truncate">
                            {budget.title} ({budget.financialYear})
                          </span>
                          <span className="text-sky-700 font-medium shrink-0 ml-2">
                            FY Budgets →
                          </span>
                        </button>
                      ))}
                      {quickSearchMatches.igas.map((unit) => (
                        <button
                          key={unit.id}
                          type="button"
                          onMouseDown={() => {
                            setIgaQuickDept(unit.department);
                            setGlobalSearch('');
                            navigateToPage('iga');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-sky-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900 truncate">
                            {unit.department} — {unit.igaName}
                          </span>
                          <span className="text-emerald-700 font-medium shrink-0 ml-2">
                            IGA Hub →
                          </span>
                        </button>
                      ))}
                      {quickSearchMatches.people.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          onMouseDown={() => {
                            setClearanceQuickQuery(person.name);
                            setGlobalSearch('');
                            navigateToPage('clearance');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-sky-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900 truncate">
                            {person.name} {person.regNumber ? `(${person.regNumber})` : ''}
                          </span>
                          <span className="text-red-600 font-medium shrink-0 ml-2">Clearance →</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Zone 3: Mobile Search + Notification Bell + Budgets/Approvals + Profile Chip */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setMobileSearchOpen((prev) => !prev)}
                aria-label="Toggle quick search"
                className="md:hidden w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              >
                <i className={`fas ${mobileSearchOpen ? 'fa-times' : 'fa-search'} text-sm`}></i>
              </button>

              {installPrompt && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="hidden sm:inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors"
                  title="Install App"
                >
                  <i className="fas fa-download mr-1.5"></i>Install
                </button>
              )}

              <button
                type="button"
                onClick={() => navigateToPage('issueLog')}
                title="HOD Issue Requests"
                aria-label="HOD Issue Requests"
                className="relative w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <i className="far fa-bell text-base"></i>
                {pendingIssueRequestsCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {pendingIssueRequestsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  navigateToPage(
                    pendingBudgetsCount > 0 || activeRole !== 'admin' ? 'budgets' : 'iga',
                  )
                }
                title="Pending Budgets & Approvals"
                aria-label="Pending Budgets and Approvals"
                className="relative w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <i className="far fa-envelope text-base"></i>
                {governanceInboxCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {governanceInboxCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateToPage(activeRole === 'admin' ? 'settings' : 'dashboard')}
                className="hidden sm:flex items-center gap-2.5 pl-2 pr-1.5 py-1 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-800 font-display font-bold text-xs flex items-center justify-center shrink-0">
                  {headerInitials}
                </div>
                <div className="leading-tight min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate max-w-[140px]">
                    {headerDisplayName}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{headerRoleLabel}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Mobile Expandable Quick Search Drawer */}
          {mobileSearchOpen && (
            <div className="md:hidden pb-3 pt-1 space-y-2 border-t border-slate-100">
              <div className="relative flex items-center">
                <i className="fas fa-search absolute left-3.5 text-slate-400 text-xs pointer-events-none"></i>
                <input
                  type="text"
                  autoFocus
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search items, departments, or recipients..."
                  className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl bg-slate-100 border border-slate-200 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
                />
                {globalSearch && (
                  <button
                    type="button"
                    onClick={() => setGlobalSearch('')}
                    aria-label="Clear mobile search"
                    className="absolute right-3 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
              {globalSearch.trim().length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-2 space-y-1 max-h-60 overflow-y-auto">
                  {quickSearchMatches.items.length === 0 &&
                  quickSearchMatches.people.length === 0 &&
                  quickSearchMatches.igas.length === 0 &&
                  quickSearchMatches.budgets.length === 0 ? (
                    <p className="text-xs text-slate-500 px-3 py-2">No matching records found.</p>
                  ) : (
                    <>
                      {quickSearchMatches.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setInventoryStockFilter('all');
                            setInventoryQuickQuery(item.name);
                            setGlobalSearch('');
                            setActivePage('inventory');
                            setMobileSearchOpen(false);
                          }}
                          className="w-full min-h-[42px] text-left px-3 py-2 rounded-lg hover:bg-sky-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900 truncate">{item.name}</span>
                          <span className="text-sky-700 font-medium shrink-0 ml-2">Inventory →</span>
                        </button>
                      ))}
                      {quickSearchMatches.budgets.map((budget) => (
                        <button
                          key={budget.id}
                          type="button"
                          onClick={() => {
                            setGlobalSearch('');
                            navigateToPage('budgets');
                          }}
                          className="w-full min-h-[42px] text-left px-3 py-2 rounded-lg hover:bg-sky-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900 truncate">
                            {budget.title} ({budget.financialYear})
                          </span>
                          <span className="text-sky-700 font-medium shrink-0 ml-2">
                            FY Budgets →
                          </span>
                        </button>
                      ))}
                      {quickSearchMatches.igas.map((unit) => (
                        <button
                          key={unit.id}
                          type="button"
                          onClick={() => {
                            setIgaQuickDept(unit.department);
                            setGlobalSearch('');
                            navigateToPage('iga');
                          }}
                          className="w-full min-h-[42px] text-left px-3 py-2 rounded-lg hover:bg-sky-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900 truncate">
                            {unit.department} — {unit.igaName}
                          </span>
                          <span className="text-emerald-700 font-medium shrink-0 ml-2">
                            IGA Hub →
                          </span>
                        </button>
                      ))}
                      {quickSearchMatches.people.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => {
                            setClearanceQuickQuery(person.name);
                            setGlobalSearch('');
                            navigateToPage('clearance');
                          }}
                          className="w-full min-h-[42px] text-left px-3 py-2 rounded-lg hover:bg-sky-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900 truncate">
                            {person.name} {person.regNumber ? `(${person.regNumber})` : ''}
                          </span>
                          <span className="text-red-600 font-medium shrink-0 ml-2">Clearance →</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </header>

        {/* Main Scrollable Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-7 pb-24 lg:pb-8">
          <div className="max-w-[1440px] mx-auto">
            {dataLoading ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-text-secondary">
                <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
                <p className="text-sm">Syncing store records from Firestore...</p>
              </div>
            ) : (
              <div key={activePage} className="animate-page-reveal">
                {renderPage()}
              </div>
            )}
          </div>
        </main>

        <footer className="text-center px-4 py-4 pb-24 lg:pb-4 text-xs text-slate-500 border-t border-slate-200/80 bg-white">
          © {new Date().getFullYear()} Eldama Ravine TVC SMS ·{' '}
          {settings.institutionName || DEFAULT_INSTITUTION_NAME}.
        </footer>
      </div>

      {/* Dedicated Mobile Floating Thumb-Zone Curved Dock + Slide-up More Sheet (< lg) */}
      <MobileBottomDock
        items={navTabs}
        activePage={activePage}
        onSelectPage={navigateToPage}
        userEmail={user?.email || ''}
        userName={user?.displayName || ''}
        activeRole={activeRole}
        activeDepartment={activeDepartment}
        isBootstrappedAdmin={Boolean(user?.isBootstrappedAdmin)}
        isOnline={isOnline}
        hasInstallPrompt={Boolean(installPrompt)}
        onInstallApp={handleInstallClick}
        onSwitchDeskView={switchDeskView}
        onLogout={() => void handleLogout()}
      />
    </div>
  );
};

export default App;
