export type ItemType = 'Asset' | 'Consumable';
export type AssetCondition = 'Good' | 'Serviceable' | 'Obsolete';
export type AssetStatus = 'In Stock' | 'Issued' | 'Disposed';
export type RecipientType = 'Trainee' | 'Trainer' | 'Staff' | 'Department' | 'Other';
export type DisposalMethod = 'Public Auction' | 'Public Tender' | 'Donation' | 'Destruction' | 'Trade-in';
export type DisposalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Disposed';
export type UserRole = 'admin' | 'officer' | 'hod';
export type AccessStatus = 'active' | 'revoked';
export type IssueRequestStatus = 'Pending' | 'Issued' | 'Declined';
export type IssueRequestUrgency = 'Normal' | 'Urgent';
export type UsageScope = 'Workshop / Practical' | 'Outside School';
export type IssueSlipStatus = 'open' | 'partial' | 'closed';
export type StockMovementType = 'ISSUE' | 'RETURN' | 'DAMAGED';

export type IGAActivityType =
  | 'Manufacturing'
  | 'Services'
  | 'Agriculture'
  | 'Catering'
  | 'Retail'
  | 'Other';
export type IGAUnitStatus = 'Active' | 'Planned' | 'Paused';
export type IGAApprovalStatus = 'Pending' | 'Approved' | 'Rejected';
export type IGALogisticsType =
  | 'Store Requisition'
  | 'Direct Purchase'
  | 'Production Output'
  | 'Sales Revenue'
  | 'Delivery Dispatch';
export type IGADirection = 'Inflow' | 'Outflow' | 'Internal';
export type IGADispatchStatus = 'Logged' | 'In Transit' | 'Delivered' | 'Completed';
export type BudgetStatus = 'Draft' | 'Submitted' | 'Reviewed' | 'Approved' | 'Returned';
export type BudgetCategory =
  | 'Consumables & Training Materials'
  | 'Tools & Workshop Equipment'
  | 'Machinery & Capital Assets'
  | 'IGA Working Capital'
  | 'Maintenance & Repairs'
  | 'Other';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'procurementertvc@gmail.com';
export const MAIN_STORE_ID = 'main-store';

export const VALIDATION_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  MAX_ID_LENGTH: 128,
  MAX_NAME_LENGTH: 120,
  MAX_CATEGORY_LENGTH: 80,
  MAX_DEPARTMENT_LENGTH: 80,
  MAX_UNIT_LENGTH: 30,
  MAX_SERIAL_LENGTH: 100,
  MAX_REG_NUMBER_LENGTH: 60,
  MAX_DISPOSAL_ITEM_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 400,
  MAX_NOTES_LENGTH: 300,
  MAX_MESSAGE_LENGTH: 300,
  MAX_EMAIL_LENGTH: 254,
  MAX_LOGO_LENGTH: 300000,
  MAX_PROPOSAL_FILE_NAME_LENGTH: 150,
  MAX_PROPOSAL_DATA_URL_LENGTH: 350000,
  MAX_PROPOSAL_LINK_LENGTH: 500,
  MAX_PROPOSAL_SUMMARY_LENGTH: 600,
  MAX_APPROVAL_NOTES_LENGTH: 300,
  MAX_FINANCIAL_YEAR_LENGTH: 20,
  MAX_BUDGET_TITLE_LENGTH: 160,
  MAX_BUDGET_LINE_ITEMS: 60,
  MAX_CONDITION_NOTES_LENGTH: 200,
  MAX_RETURN_NOTE_LENGTH: 300,
  MAX_ISSUE_LINES: 200,
  MAX_MEMBER_EMAILS: 50,
  MAX_USERNAME_LENGTH: 40,
} as const;

export interface InventoryItem {
  id: string;
  storeId: string;
  ownerUid: string;
  memberEmails: string[];
  name: string;
  category: string;
  department: string;
  type: ItemType;
  unit: string;
  quantity: number;
  isIGA: boolean;
  isConsumable?: boolean;
  purchaseUnit?: string;
  unitsPerPurchase?: number;
  location?: string;
  damagedQty?: number;
  damagedQuantity?: number;
  condition: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function roundStockQuantity(value: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100) / 100;
}

export function getItemDamagedQty(
  item?: Pick<InventoryItem, 'damagedQty' | 'damagedQuantity'> | null,
): number {
  if (!item) return 0;
  return roundStockQuantity((item.damagedQty ?? item.damagedQuantity) || 0);
}

export function isItemConsumable(
  item?: Pick<InventoryItem, 'type' | 'isConsumable'> | null,
): boolean {
  if (!item) return true;
  if (item.type === 'Asset') return false;
  return item.isConsumable !== false;
}

export interface AssetItem {
  id: string;
  storeId: string;
  ownerUid: string;
  memberEmails: string[];
  inventoryId: string;
  serialNumber: string;
  condition: AssetCondition;
  status: AssetStatus;
  currentHolderId: string;
  activeIssueLogId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Recipient {
  id: string;
  storeId: string;
  ownerUid: string;
  memberEmails: string[];
  name: string;
  type: RecipientType;
  regNumber: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface IssueLine {
  inventoryId: string;
  name: string;
  qtyIssued: number;
  qtyReturned: number;
  qtyDamaged: number;
  returnable: boolean;
  returnCondition: '' | AssetCondition;
  returnNote: string;
  unit?: string;
  assetId?: string;
  serialNumber?: string;
  returnDate?: string;
  dateReturned?: string;
}

export interface IssueSlip {
  id: string;
  storeId: string;
  ownerUid?: string;
  memberEmails?: string[];
  recipient: string;
  recipientId?: string;
  recipientName?: string;
  dateIssued: string;
  scope: UsageScope;
  usageLocation?: string;
  requiresGatePass?: boolean;
  gatePassNumber?: string;
  status: IssueSlipStatus;
  issuedBy: string;
  lines: IssueLine[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StockMovement {
  id: string;
  storeId?: string;
  memberEmails?: string[];
  type: StockMovementType;
  inventoryId: string;
  qty: number;
  issueId: string;
  userId: string;
  createdAt?: unknown;
}

export interface IssueReturnLineInput {
  lineIndex: number;
  qtyReturning: number;
  qtyDamaged: number;
  returnCondition: AssetCondition;
  returnNote?: string;
}

export interface IssueReturnResult {
  slip: IssueSlip;
  restoredTotal: number;
  damagedTotal: number;
}

// Legacy read-only type for historical issueLog records
export interface IssueLogEntry {
  id: string;
  storeId: string;
  ownerUid: string;
  memberEmails: string[];
  inventoryId: string;
  assetId: string;
  recipientId: string;
  quantity: number;
  itemName: string;
  serialNumber: string;
  recipientName: string;
  dateIssued: string;
  returnDate: string;
  dateReturned: string;
  returned: boolean;
  isConsumable?: boolean;
  unit?: string;
  usageScope?: UsageScope;
  usageLocation?: string;
  requiresGatePass?: boolean;
  gatePassNumber?: string;
  returnCondition?: AssetCondition;
  returnConditionNotes?: string;
  damagedQuantity?: number;
  restoredQuantity?: number;
  sourceInventoryId?: string;
  sourceStoreId?: string;
  sourceLocation?: string;
  sourceCondition?: string;
  qtyIssued?: number;
  returnedAt?: unknown;
  returnedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BulkIssueLineInput {
  inventoryId: string;
  quantity?: number;
  assetId?: string;
  returnDate?: string;
}

export interface BulkIssueResult {
  slip: IssueSlip | null;
  failedItems: string[];
  errorMessage?: string;
}

export interface BulkReturnLineInput {
  logId: string;
  damagedQuantity?: number;
}

export interface BulkReturnResult {
  savedLogIds: string[];
  failedItems: string[];
  errorMessage?: string;
}

export interface DisposalLogEntry {
  id: string;
  storeId: string;
  ownerUid: string;
  memberEmails: string[];
  assetId: string;
  inventoryId: string;
  method: DisposalMethod;
  itemName: string;
  itemCategory: string;
  status: DisposalStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DepartmentalIGA {
  id: string;
  storeId: string;
  ownerUid: string;
  memberEmails: string[];
  department: string;
  igaName: string;
  activityType: IGAActivityType;
  leadTrainer: string;
  status: IGAUnitStatus;
  description: string;
  approvalStatus: IGAApprovalStatus;
  approvalNotes: string;
  reviewedByEmail: string;
  proposalFileName: string;
  proposalDataUrl: string;
  proposalLink?: string;
  proposalSummary: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface IGALogisticsEntry {
  id: string;
  storeId: string;
  ownerUid: string;
  memberEmails: string[];
  igaId: string;
  department: string;
  igaName: string;
  entryType: IGALogisticsType;
  inventoryId: string;
  description: string;
  quantity: number;
  unit: string;
  unitAmount: number;
  totalAmount: number;
  direction: IGADirection;
  dispatchStatus: IGADispatchStatus;
  destinationOrClient: string;
  dateRecorded: string;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface IssueRequest {
  id: string;
  storeId: string;
  ownerUid: string;
  memberEmails: string[];
  department: string;
  requestedByEmail: string;
  requestedByName: string;
  inventoryId: string;
  itemName: string;
  quantity: number;
  unit: string;
  recipientName: string;
  usageScope?: UsageScope;
  usageLocation?: string;
  requiresGatePass?: boolean;
  urgency: IssueRequestUrgency;
  message: string;
  status: IssueRequestStatus;
  handledByEmail: string;
  responseMessage: string;
  issueLogId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BudgetLineItem {
  id: string;
  category: BudgetCategory;
  itemName: string;
  unit: string;
  quantity: number;
  estimatedUnitCost: number;
  totalCost: number;
  justification: string;
}

export interface DepartmentBudget {
  id: string;
  storeId: string;
  ownerUid: string;
  memberEmails: string[];
  department: string;
  financialYear: string;
  title: string;
  lineItems: BudgetLineItem[];
  totalAmount: number;
  notes: string;
  status: BudgetStatus;
  submittedByEmail: string;
  submittedByName: string;
  submittedAt: string;
  reviewedByEmail: string;
  reviewNotes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StoreSettings {
  storeId: string;
  ownerUid: string;
  institutionName: string;
  logo: string;
  memberEmails: string[];
  seeded: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StoreAccessRecord {
  id: string;
  email: string;
  role: UserRole;
  department?: string;
  username?: string;
  pinSalt?: string;
  pinHash?: string;
  status: AccessStatus;
  storeId: string;
  addedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  department?: string;
  username?: string;
  isBootstrappedAdmin: boolean;
}
