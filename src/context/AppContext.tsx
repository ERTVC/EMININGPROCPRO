import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, emailToAccessId, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  AppUser,
  AssetCondition,
  AssetItem,
  BOOTSTRAPPED_ADMIN_EMAIL,
  BudgetCategory,
  BudgetLineItem,
  BudgetStatus,
  BulkIssueLineInput,
  BulkIssueResult,
  DepartmentBudget,
  DepartmentalIGA,
  DisposalLogEntry,
  DisposalMethod,
  DisposalStatus,
  IGAActivityType,
  IGAApprovalStatus,
  IGADirection,
  IGADispatchStatus,
  IGALogisticsEntry,
  IGALogisticsType,
  IGAUnitStatus,
  InventoryItem,
  IssueLine,
  IssueLogEntry,
  IssueRequest,
  IssueRequestStatus,
  IssueRequestUrgency,
  IssueReturnLineInput,
  IssueReturnResult,
  IssueSlip,
  IssueSlipStatus,
  MAIN_STORE_ID,
  Recipient,
  RecipientType,
  StockMovement,
  StockMovementType,
  StoreAccessRecord,
  StoreSettings,
  UsageScope,
  UserRole,
  VALIDATION_LIMITS,
  isItemConsumable,
  roundStockQuantity,
} from '../types';
import {
  APP_LOGO_BASE64,
  DEFAULT_INSTITUTION_NAME,
  ERTVC_LOGO_PATH,
  sanitizeLogoDataUrl,
} from '../utils/logo';
import {
  defaultActivityTypeForDepartment,
  isDemoDocumentId,
  SAMPLE_ASSETS,
  SAMPLE_DEPARTMENT_BUDGETS,
  SAMPLE_DISPOSAL_REQUESTS,
  SAMPLE_IGA_LOGISTICS,
  SAMPLE_IGA_UNITS,
  SAMPLE_INVENTORY,
  SAMPLE_ISSUE_LOGS,
  SAMPLE_ISSUE_REQUESTS,
  SAMPLE_RECIPIENTS,
  STANDARD_TVET_DEPARTMENTS,
} from '../utils/sampleData';

const DESK_INTENT_STORAGE_KEY = 'procstore_login_desk_intent';

interface LoginDeskIntent {
  role: UserRole;
  department: string;
}

function readStoredDeskIntent(): LoginDeskIntent {
  try {
    const raw = sessionStorage.getItem(DESK_INTENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const role: UserRole =
        parsed.role === 'admin' || parsed.role === 'hod' ? parsed.role : 'officer';
      const department =
        typeof parsed.department === 'string' && parsed.department.trim()
          ? parsed.department.trim()
          : STANDARD_TVET_DEPARTMENTS[0];
      return { role, department };
    }
  } catch {
    // ignore storage errors
  }
  return { role: 'officer', department: STANDARD_TVET_DEPARTMENTS[0] };
}

function saveDeskIntent(intent: LoginDeskIntent): void {
  try {
    sessionStorage.setItem(DESK_INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // ignore storage errors
  }
}

function generateGatePassNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = Math.floor(1000 + Math.random() * 9000);
  return `GP-${datePart}-${randPart}`;
}

type AccessState = 'loading' | 'signed_out' | 'authorized' | 'uninvited' | 'revoked';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppContextValue {
  inventory: InventoryItem[];
  assets: AssetItem[];
  recipients: Recipient[];
  issues: IssueSlip[];
  stockMovements: StockMovement[];
  issueLog: IssueLogEntry[];
  disposalLog: DisposalLogEntry[];
  igaUnits: DepartmentalIGA[];
  igaLogistics: IGALogisticsEntry[];
  issueRequests: IssueRequest[];
  departmentBudgets: DepartmentBudget[];
  settings: StoreSettings;
  storeMembers: StoreAccessRecord[];
  user: AppUser | null;
  activeRole: UserRole;
  activeDepartment: string;
  loginIntent: LoginDeskIntent;
  authReady: boolean;
  dataLoading: boolean;
  accessState: AccessState;
  activeStoreId: string | null;
  isOnline: boolean;
  hasLocalBackupData: boolean;
  signInWithGoogle: (intent?: LoginDeskIntent) => Promise<void>;
  switchDeskView: (role: UserRole, department?: string) => void;
  recheckAccess: () => Promise<void>;
  handleLogout: () => Promise<void>;
  addItem: (
    item: Omit<InventoryItem, 'id' | 'storeId' | 'ownerUid' | 'memberEmails' | 'createdAt' | 'updatedAt'>,
    serials?: string[],
  ) => Promise<void>;
  updateItem: (item: InventoryItem) => Promise<void>;
  updateAsset: (asset: AssetItem) => Promise<void>;
  issueItem: (details: {
    inventoryId: string;
    recipientId: string;
    quantity?: number;
    assetId?: string;
    returnDate?: string;
    requestId?: string;
    responseMessage?: string;
    usageScope?: UsageScope;
    usageLocation?: string;
  }) => Promise<boolean>;
  issueBulkItems: (details: {
    recipientId: string;
    lines: BulkIssueLineInput[];
    defaultReturnDate?: string;
    usageScope?: UsageScope;
    usageLocation?: string;
  }) => Promise<BulkIssueResult | null>;
  returnIssueSlip: (details: {
    issueId: string;
    mode: 'all_good' | 'custom';
    lines?: IssueReturnLineInput[];
    defaultCondition?: AssetCondition;
    defaultNote?: string;
  }) => Promise<IssueReturnResult | null>;
  createIssueRequest: (req: {
    inventoryId?: string;
    itemName: string;
    quantity: number;
    unit: string;
    recipientName: string;
    usageScope?: UsageScope;
    usageLocation?: string;
    urgency: IssueRequestUrgency;
    message: string;
  }) => Promise<boolean>;
  resolveIssueRequest: (
    requestId: string,
    updates: {
      status: Exclude<IssueRequestStatus, 'Pending'>;
      responseMessage: string;
      issueLogId?: string;
    },
  ) => Promise<boolean>;
  addRecipient: (recipient: { name: string; type: RecipientType; regNumber: string }) => Promise<void>;
  updateRecipient: (recipient: Recipient) => Promise<void>;
  deleteRecipient: (id: string) => Promise<void>;
  addDisposalRequest: (request: { assetId: string; method: DisposalMethod }) => Promise<void>;
  updateDisposalStatus: (id: string, status: DisposalStatus) => Promise<void>;
  addIGAUnit: (unit: {
    department: string;
    igaName: string;
    activityType: IGAActivityType;
    leadTrainer: string;
    status: IGAUnitStatus;
    description: string;
    proposalFileName?: string;
    proposalDataUrl?: string;
    proposalLink?: string;
    proposalSummary?: string;
  }) => Promise<boolean>;
  updateIGAUnit: (unit: DepartmentalIGA) => Promise<void>;
  reviewIGAUnit: (
    id: string,
    decision: Exclude<IGAApprovalStatus, 'Pending'>,
    approvalNotes: string,
  ) => Promise<boolean>;
  deleteIGAUnit: (id: string) => Promise<boolean>;
  addIGALogistics: (entry: {
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
  updateIGALogisticsStatus: (
    id: string,
    updates: {
      dispatchStatus: IGADispatchStatus;
      destinationOrClient?: string;
      notes?: string;
    },
  ) => Promise<void>;
  deleteIGALogistics: (id: string) => Promise<void>;
  seedSampleIGAs: () => Promise<void>;
  initializeMissingDeptIGAs: (departments: string[]) => Promise<void>;
  saveDepartmentBudget: (input: {
    id?: string;
    department?: string;
    financialYear: string;
    title: string;
    lineItems: BudgetLineItem[];
    notes: string;
    submitNow: boolean;
  }) => Promise<boolean>;
  submitDepartmentBudget: (budgetId: string) => Promise<boolean>;
  reviewDepartmentBudget: (
    budgetId: string,
    updates: {
      status: Exclude<BudgetStatus, 'Draft' | 'Submitted'>;
      reviewNotes: string;
    },
  ) => Promise<boolean>;
  deleteDepartmentBudget: (budgetId: string) => Promise<void>;
  updateSettings: (newSettings: { institutionName: string; logo: string }) => Promise<void>;
  addStoreMember: (email: string, role: UserRole, department?: string) => Promise<void>;
  updateStoreMember: (
    record: StoreAccessRecord,
    updates: { role?: UserRole; department?: string; status?: 'active' | 'revoked' },
  ) => Promise<void>;
  removeStoreMember: (record: StoreAccessRecord) => Promise<void>;
  resyncStorePermissions: () => Promise<void>;
  demoRecordCount: number;
  seedSampleData: (replaceExisting?: boolean) => Promise<void>;
  refreshDemonstrationData: () => Promise<void>;
  deleteDemonstrationData: () => Promise<void>;
  migrateLocalStorageData: () => Promise<void>;
  importData: (rawJson: string) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const DEFAULT_SETTINGS: StoreSettings = {
  storeId: MAIN_STORE_ID,
  ownerUid: '',
  institutionName: DEFAULT_INSTITUTION_NAME,
  logo: ERTVC_LOGO_PATH,
  memberEmails: [BOOTSTRAPPED_ADMIN_EMAIL],
  seeded: false,
};

const AppContext = createContext<AppContextValue | null>(null);

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
};

function clampString(val: unknown, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

function sanitizeProposalLink(raw: unknown): string {
  const cleaned = clampString(raw, VALIDATION_LIMITS.MAX_PROPOSAL_LINK_LENGTH);
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:' || !parsed.hostname) return '';
    return cleaned;
  } catch {
    return '';
  }
}

function makeValidDocId(prefix: string, raw?: unknown): string {
  const candidate = String(raw ?? '').replace(/[^a-zA-Z0-9_-]/g, '-');
  if (candidate && VALIDATION_LIMITS.ID_PATTERN.test(candidate) && candidate.length <= 128) {
    return `${prefix}-${candidate}`.slice(0, 128);
  }
  return doc(collection(db, 'inventory')).id;
}

function checkLocalStorageHasData(): boolean {
  try {
    const rawInv = localStorage.getItem('inventory');
    const rawRec = localStorage.getItem('recipients');
    const inv = rawInv ? JSON.parse(rawInv) : [];
    const rec = rawRec ? JSON.parse(rawRec) : [];
    return (Array.isArray(inv) && inv.length > 0) || (Array.isArray(rec) && rec.length > 0);
  } catch {
    return false;
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [issues, setIssues] = useState<IssueSlip[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [issueLog, setIssueLog] = useState<IssueLogEntry[]>([]);
  const [disposalLog, setDisposalLog] = useState<DisposalLogEntry[]>([]);
  const [igaUnits, setIgaUnits] = useState<DepartmentalIGA[]>([]);
  const [igaLogistics, setIgaLogistics] = useState<IGALogisticsEntry[]>([]);
  const [issueRequests, setIssueRequests] = useState<IssueRequest[]>([]);
  const [departmentBudgets, setDepartmentBudgets] = useState<DepartmentBudget[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [storeMembers, setStoreMembers] = useState<StoreAccessRecord[]>([]);

  const [user, setUser] = useState<AppUser | null>(null);
  const [loginIntent, setLoginIntent] = useState<LoginDeskIntent>(readStoredDeskIntent);
  const [adminViewRole, setAdminViewRole] = useState<UserRole>('admin');
  const [adminViewDepartment, setAdminViewDepartment] = useState<string>(STANDARD_TVET_DEPARTMENTS[0]);
  const [authReady, setAuthReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [accessState, setAccessState] = useState<AccessState>('loading');
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const [hasLocalBackupData, setHasLocalBackupData] = useState<boolean>(checkLocalStorageHasData);

  const activeRole: UserRole = user?.isBootstrappedAdmin
    ? adminViewRole
    : user?.role || 'officer';
  const activeDepartment: string =
    activeRole === 'hod'
      ? user?.isBootstrappedAdmin
        ? adminViewDepartment
        : user?.department || STANDARD_TVET_DEPARTMENTS[0]
      : user?.department || '';

  const activeRoleRef = useRef<UserRole>(activeRole);
  activeRoleRef.current = activeRole;
  const seenRequestIdsRef = useRef<Set<string> | null>(null);
  const seenPendingIgaIdsRef = useRef<Set<string> | null>(null);
  const seenSubmittedBudgetIdsRef = useRef<Set<string> | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const ensureStoreSettingsDoc = useCallback(
    async (storeId: string, uid: string, memberEmails: string[]) => {
      const settingsPath = `storeSettings/${storeId}`;
      try {
        const ref = doc(db, 'storeSettings', storeId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            storeId,
            ownerUid: uid,
            institutionName: DEFAULT_INSTITUTION_NAME,
            logo: ERTVC_LOGO_PATH,
            memberEmails,
            seeded: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const existingData = snap.data() as StoreSettings;
          const isLegacyName =
            existingData.institutionName === 'PROCSTORE' ||
            existingData.institutionName === 'Eldama Ravine TVC';
          const isDefaultLogo =
            existingData.logo === APP_LOGO_BASE64 || existingData.logo === ERTVC_LOGO_PATH;
          if (isLegacyName && isDefaultLogo) {
            await updateDoc(ref, {
              institutionName: DEFAULT_INSTITUTION_NAME,
              logo: ERTVC_LOGO_PATH,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'unavailable') {
          console.warn('Transient Firestore unavailability during store settings check:', err);
          return;
        }
        try {
          handleFirestoreError(err, OperationType.WRITE, settingsPath);
        } catch (wrapped) {
          setFatalError(wrapped as Error);
        }
      }
    },
    [],
  );

  const clearStoreState = useCallback(() => {
    setInventory([]);
    setAssets([]);
    setRecipients([]);
    setIssues([]);
    setStockMovements([]);
    setIssueLog([]);
    setDisposalLog([]);
    setIgaUnits([]);
    setIgaLogistics([]);
    setIssueRequests([]);
    setDepartmentBudgets([]);
    seenRequestIdsRef.current = null;
    seenPendingIgaIdsRef.current = null;
    seenSubmittedBudgetIdsRef.current = null;
    setStoreMembers([]);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const verifyStoreAccessForUser = useCallback(
    async (firebaseUser: {
      uid: string;
      email: string | null;
      emailVerified: boolean;
      displayName: string | null;
      photoURL: string | null;
    }) => {
      const email = (firebaseUser.email || '').trim().toLowerCase();
      if (!email || !firebaseUser.emailVerified) {
        clearStoreState();
        setUser({
          uid: firebaseUser.uid,
          email,
          displayName: firebaseUser.displayName || email || 'User',
          photoURL: firebaseUser.photoURL || '',
          role: 'officer',
          isBootstrappedAdmin: false,
        });
        setAccessState('uninvited');
        setActiveStoreId(null);
        return;
      }

      const isBootstrappedAdmin = email === BOOTSTRAPPED_ADMIN_EMAIL;
      if (isBootstrappedAdmin) {
        const intent = readStoredDeskIntent();
        setLoginIntent(intent);
        if (intent.role === 'hod') {
          setAdminViewRole('hod');
          setAdminViewDepartment(intent.department || STANDARD_TVET_DEPARTMENTS[0]);
        } else {
          setAdminViewRole('admin');
        }
        const appUser: AppUser = {
          uid: firebaseUser.uid,
          email,
          displayName: firebaseUser.displayName || 'Procurement Admin',
          photoURL: firebaseUser.photoURL || '',
          role: 'admin',
          department: '',
          isBootstrappedAdmin: true,
        };
        setUser(appUser);
        await ensureStoreSettingsDoc(MAIN_STORE_ID, firebaseUser.uid, [BOOTSTRAPPED_ADMIN_EMAIL]);
        setActiveStoreId(MAIN_STORE_ID);
        setAccessState('authorized');
        return;
      }

      const accessId = emailToAccessId(email);
      try {
        const accessSnap = await getDoc(doc(db, 'storeAccess', accessId));
        if (accessSnap.exists()) {
          const data = accessSnap.data();
          const assignedStoreId = String(data.storeId || MAIN_STORE_ID);
          if (data.status === 'active' && assignedStoreId === MAIN_STORE_ID) {
            const assignedRole: UserRole =
              data.role === 'admin' ? 'admin' : data.role === 'hod' ? 'hod' : 'officer';
            const assignedDepartment =
              assignedRole === 'hod'
                ? String(data.department || STANDARD_TVET_DEPARTMENTS[0])
                : assignedRole === 'officer'
                  ? String(data.department || '')
                  : '';
            setUser({
              uid: firebaseUser.uid,
              email,
              displayName: firebaseUser.displayName || email,
              photoURL: firebaseUser.photoURL || '',
              role: assignedRole,
              department: assignedDepartment,
              isBootstrappedAdmin: false,
            });
            setActiveStoreId(MAIN_STORE_ID);
            setAccessState('authorized');
          } else {
            clearStoreState();
            setUser({
              uid: firebaseUser.uid,
              email,
              displayName: firebaseUser.displayName || email,
              photoURL: firebaseUser.photoURL || '',
              role: 'officer',
              isBootstrappedAdmin: false,
            });
            setActiveStoreId(null);
            setAccessState('revoked');
          }
        } else {
          clearStoreState();
          setUser({
            uid: firebaseUser.uid,
            email,
            displayName: firebaseUser.displayName || email,
            photoURL: firebaseUser.photoURL || '',
            role: 'officer',
            isBootstrappedAdmin: false,
          });
          setActiveStoreId(null);
          setAccessState('uninvited');
        }
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'unavailable') {
          console.warn('Firestore temporarily unavailable while checking store access:', err);
          showToast('Connection to store database interrupted. Retrying...', 'info');
          return;
        }
        try {
          handleFirestoreError(err, OperationType.GET, `storeAccess/${accessId}`);
        } catch (wrapped) {
          setFatalError(wrapped as Error);
        }
      }
    },
    [clearStoreState, ensureStoreSettingsDoc, showToast],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setActiveStoreId(null);
        setAccessState('signed_out');
        clearStoreState();
        setAuthReady(true);
        return;
      }

      await verifyStoreAccessForUser(firebaseUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, [clearStoreState, verifyStoreAccessForUser]);

  // Attach real-time Firestore listeners only when auth is ready and user has an active store
  useEffect(() => {
    if (!authReady || !user || !activeStoreId || accessState !== 'authorized') {
      return;
    }

    setDataLoading(true);
    seenRequestIdsRef.current = null;
    seenPendingIgaIdsRef.current = null;
    seenSubmittedBudgetIdsRef.current = null;
    const loadedFlags = {
      settings: false,
      inventory: false,
      assets: false,
      recipients: false,
      issues: false,
      stockMovements: false,
      issueLog: false,
      disposalLog: false,
      igaUnits: false,
      igaLogistics: false,
      issueRequests: false,
      departmentBudgets: false,
    };
    const markLoaded = (key: keyof typeof loadedFlags) => {
      loadedFlags[key] = true;
      if (Object.values(loadedFlags).every(Boolean)) {
        setDataLoading(false);
      }
    };

    const unsubs: (() => void)[] = [];

    // 1. Store Settings
    unsubs.push(
      onSnapshot(
        doc(db, 'storeSettings', activeStoreId),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data() as StoreSettings;
            setSettings({
              ...d,
              logo: sanitizeLogoDataUrl(d.logo),
              memberEmails:
                Array.isArray(d.memberEmails) && d.memberEmails.length > 0
                  ? d.memberEmails
                  : [user.email],
            });
          } else {
            setSettings({
              ...DEFAULT_SETTINGS,
              storeId: activeStoreId,
              ownerUid: user.uid,
              memberEmails:
                activeStoreId === MAIN_STORE_ID ? [BOOTSTRAPPED_ADMIN_EMAIL] : [user.email],
            });
          }
          markLoaded('settings');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.GET, `storeSettings/${activeStoreId}`);
          } catch (wrapped) {
            setFatalError(wrapped as Error);
          }
        },
      ),
    );

    const isRealHod = !user.isBootstrappedAdmin && user.role === 'hod' && Boolean(user.department);
    const scopedQuery = (colName: string, deptScoped = false) =>
      deptScoped && isRealHod
        ? query(collection(db, colName), where('department', '==', user.department))
        : query(collection(db, colName), where('memberEmails', 'array-contains', user.email));

    // 2. Inventory (strict allowlist admin gate in firestore.rules)
    if (user.isBootstrappedAdmin) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'inventory'), where('storeId', '==', activeStoreId)),
          (snap) => {
            const rows = snap.docs.map((d) => d.data() as InventoryItem);
            setInventory(rows);
            markLoaded('inventory');
          },
          (err) => {
            try {
              handleFirestoreError(err, OperationType.LIST, 'inventory');
            } catch (wrapped) {
              setFatalError(wrapped as Error);
            }
          },
        ),
      );
    } else {
      setInventory([]);
      markLoaded('inventory');
    }

    // 3. Assets
    unsubs.push(
      onSnapshot(
        scopedQuery('assets'),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as AssetItem)
            .filter((a) => a.storeId === activeStoreId);
          setAssets(rows);
          markLoaded('assets');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'assets');
          } catch (wrapped) {
            setFatalError(wrapped as Error);
          }
        },
      ),
    );

    // 4. Recipients
    unsubs.push(
      onSnapshot(
        scopedQuery('recipients'),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as Recipient)
            .filter((r) => r.storeId === activeStoreId);
          setRecipients(rows);
          markLoaded('recipients');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'recipients');
          } catch (wrapped) {
            setFatalError(wrapped as Error);
          }
        },
      ),
    );

    // 5a. Issue Slips & Stock Movements (strict allowlist admin gate in firestore.rules)
    if (user.isBootstrappedAdmin) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'issues'), where('storeId', '==', activeStoreId)),
          (snap) => {
            const rows = snap.docs.map((d) => d.data() as IssueSlip);
            setIssues(rows);
            markLoaded('issues');
          },
          (err) => {
            try {
              handleFirestoreError(err, OperationType.LIST, 'issues');
            } catch (wrapped) {
              setFatalError(wrapped as Error);
            }
          },
        ),
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'stockMovements'), where('storeId', '==', activeStoreId)),
          (snap) => {
            const rows = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<StockMovement, 'id'>),
            }));
            setStockMovements(rows);
            markLoaded('stockMovements');
          },
          (err) => {
            try {
              handleFirestoreError(err, OperationType.LIST, 'stockMovements');
            } catch (wrapped) {
              setFatalError(wrapped as Error);
            }
          },
        ),
      );
    } else {
      setIssues([]);
      markLoaded('issues');
      setStockMovements([]);
      markLoaded('stockMovements');
    }

    // 5b. Legacy Issue Log (read-only historical records)
    unsubs.push(
      onSnapshot(
        scopedQuery('issueLog'),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as IssueLogEntry)
            .filter((l) => l.storeId === activeStoreId);
          setIssueLog(rows);
          markLoaded('issueLog');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'issueLog');
          } catch (wrapped) {
            setFatalError(wrapped as Error);
          }
        },
      ),
    );

    // 6. Disposal Log
    unsubs.push(
      onSnapshot(
        scopedQuery('disposalLog'),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as DisposalLogEntry)
            .filter((l) => l.storeId === activeStoreId);
          setDisposalLog(rows);
          markLoaded('disposalLog');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'disposalLog');
          } catch (wrapped) {
            setFatalError(wrapped as Error);
          }
        },
      ),
    );

    // 7. Departmental IGA Units
    unsubs.push(
      onSnapshot(
        scopedQuery('igaUnits', true),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as DepartmentalIGA)
            .filter((u) => u.storeId === activeStoreId);
          if (seenPendingIgaIdsRef.current === null) {
            seenPendingIgaIdsRef.current = new Set(rows.map((u) => u.id));
          } else {
            for (const unit of rows) {
              if (!seenPendingIgaIdsRef.current.has(unit.id)) {
                seenPendingIgaIdsRef.current.add(unit.id);
                if (
                  (unit.approvalStatus || 'Approved') === 'Pending' &&
                  activeRoleRef.current === 'admin'
                ) {
                  showToast(
                    `New IGA proposal from ${unit.department}: ${unit.igaName} (Pending Approval)`,
                    'info',
                  );
                }
              }
            }
          }
          setIgaUnits(rows);
          markLoaded('igaUnits');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'igaUnits');
          } catch (wrapped) {
            setFatalError(wrapped as Error);
          }
        },
      ),
    );

    // 8. IGA Logistics Ledger
    unsubs.push(
      onSnapshot(
        scopedQuery('igaLogistics', true),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as IGALogisticsEntry)
            .filter((l) => l.storeId === activeStoreId);
          setIgaLogistics(rows);
          markLoaded('igaLogistics');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'igaLogistics');
          } catch (wrapped) {
            setFatalError(wrapped as Error);
          }
        },
      ),
    );

    // 9. HOD Item Issue Requests & Messages
    unsubs.push(
      onSnapshot(
        scopedQuery('issueRequests', true),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as IssueRequest)
            .filter((r) => r.storeId === activeStoreId);
          if (seenRequestIdsRef.current === null) {
            seenRequestIdsRef.current = new Set(rows.map((r) => r.id));
          } else {
            for (const req of rows) {
              if (!seenRequestIdsRef.current.has(req.id)) {
                seenRequestIdsRef.current.add(req.id);
                if (
                  req.status === 'Pending' &&
                  (activeRoleRef.current === 'admin' || activeRoleRef.current === 'officer')
                ) {
                  showToast(
                    `New request from ${req.department} HOD: ${req.quantity} ${req.unit} ${req.itemName}`,
                    'info',
                  );
                }
              }
            }
          }
          setIssueRequests(rows);
          markLoaded('issueRequests');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'issueRequests');
          } catch (wrapped) {
            setFatalError(wrapped as Error);
          }
        },
      ),
    );

    // 9b. Departmental Financial Year Budgets
    unsubs.push(
      onSnapshot(
        scopedQuery('departmentBudgets', true),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as DepartmentBudget)
            .filter((b) => b.storeId === activeStoreId);
          if (seenSubmittedBudgetIdsRef.current === null) {
            seenSubmittedBudgetIdsRef.current = new Set(
              rows.filter((b) => b.status === 'Submitted').map((b) => b.id),
            );
          } else {
            for (const budget of rows) {
              if (
                budget.status === 'Submitted' &&
                !seenSubmittedBudgetIdsRef.current.has(budget.id)
              ) {
                seenSubmittedBudgetIdsRef.current.add(budget.id);
                if (activeRoleRef.current === 'admin' || activeRoleRef.current === 'officer') {
                  showToast(
                    `FY ${budget.financialYear} budget submitted by ${budget.department} HOD.`,
                    'info',
                  );
                }
              }
            }
          }
          setDepartmentBudgets(rows);
          markLoaded('departmentBudgets');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'departmentBudgets');
          } catch (wrapped) {
            setFatalError(wrapped as Error);
          }
        },
      ),
    );

    // 10. Store Access (Bootstrapped admin manages team; members watch own record for live revocation)
    if (user.isBootstrappedAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'storeAccess'),
          (snap) => {
            const rows = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<StoreAccessRecord, 'id'>),
            }));
            setStoreMembers(rows);
          },
          (err) => {
            try {
              handleFirestoreError(err, OperationType.LIST, 'storeAccess');
            } catch (wrapped) {
              setFatalError(wrapped as Error);
            }
          },
        ),
      );
    } else {
      const selfAccessId = emailToAccessId(user.email);
      unsubs.push(
        onSnapshot(
          doc(db, 'storeAccess', selfAccessId),
          (snap) => {
            if (!snap.exists()) {
              clearStoreState();
              setActiveStoreId(null);
              setAccessState('uninvited');
              showToast('Your store access was removed by the administrator.', 'error');
              return;
            }
            const data = snap.data();
            if (data.status !== 'active' || String(data.storeId || MAIN_STORE_ID) !== MAIN_STORE_ID) {
              clearStoreState();
              setActiveStoreId(null);
              setAccessState('revoked');
              showToast('Your store access has been revoked by the administrator.', 'error');
              return;
            }
            const nextRole: UserRole =
              data.role === 'admin' ? 'admin' : data.role === 'hod' ? 'hod' : 'officer';
            const nextDept =
              nextRole === 'hod'
                ? String(data.department || STANDARD_TVET_DEPARTMENTS[0])
                : nextRole === 'officer'
                  ? String(data.department || '')
                  : '';
            setUser((prev) =>
              prev && (prev.role !== nextRole || (prev.department || '') !== nextDept)
                ? { ...prev, role: nextRole, department: nextDept }
                : prev,
            );
          },
          (err) => {
            try {
              handleFirestoreError(err, OperationType.GET, `storeAccess/${selfAccessId}`);
            } catch (wrapped) {
              setFatalError(wrapped as Error);
            }
          },
        ),
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, activeStoreId, accessState, clearStoreState, showToast]);

  const getActiveMembers = useCallback((): string[] => {
    if (!user) return [BOOTSTRAPPED_ADMIN_EMAIL];
    if (user.isBootstrappedAdmin && storeMembers.length > 0) {
      const activeEmails = storeMembers
        .filter((m) => m.status === 'active')
        .map((m) => m.email.trim().toLowerCase())
        .filter(Boolean);
      return Array.from(new Set([BOOTSTRAPPED_ADMIN_EMAIL, ...activeEmails])).slice(
        0,
        VALIDATION_LIMITS.MAX_MEMBER_EMAILS,
      );
    }
    const base = Array.isArray(settings.memberEmails) ? settings.memberEmails : [];
    const set = new Set<string>([BOOTSTRAPPED_ADMIN_EMAIL, ...base, user.email]);
    return Array.from(set).slice(0, VALIDATION_LIMITS.MAX_MEMBER_EMAILS);
  }, [user, storeMembers, settings.memberEmails]);

  const signInWithGoogle = async (intent?: LoginDeskIntent): Promise<void> => {
    const resolvedIntent: LoginDeskIntent = intent || loginIntent;
    saveDeskIntent(resolvedIntent);
    setLoginIntent(resolvedIntent);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      const msg = err?.code === 'auth/popup-closed-by-user'
        ? 'Sign-in popup was closed.'
        : err?.message || 'Google sign-in failed.';
      showToast(msg, 'error');
    }
  };

  const switchDeskView = (role: UserRole, department?: string) => {
    if (!user?.isBootstrappedAdmin) return;
    setAdminViewRole(role);
    if (department) {
      setAdminViewDepartment(department);
    }
    saveDeskIntent({
      role,
      department: department || adminViewDepartment || STANDARD_TVET_DEPARTMENTS[0],
    });
  };

  const recheckAccess = async (): Promise<void> => {
    const current = auth.currentUser;
    if (!current) return;
    await verifyStoreAccessForUser(current);
  };

  const handleLogout = async (): Promise<void> => {
    await signOut(auth);
  };

  const addItem: AppContextValue['addItem'] = async (item, serials = []) => {
    if (!user || !activeStoreId) return;
    const invRef = doc(collection(db, 'inventory'));
    const memberEmails = getActiveMembers();
    const batch = writeBatch(db);

    const resolvedDepartment =
      activeRole === 'hod' && activeDepartment
        ? clampString(activeDepartment, VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH)
        : clampString(item.department, VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH);

    const resolvedType = item.type === 'Asset' ? 'Asset' : 'Consumable';
    const resolvedConsumable = resolvedType === 'Asset' ? false : item.isConsumable !== false;
    const cleanPurchaseUnit =
      resolvedType === 'Asset'
        ? ''
        : clampString(item.purchaseUnit || '', VALIDATION_LIMITS.MAX_UNIT_LENGTH);
    const cleanUnitsPerPurchase =
      resolvedType === 'Asset' || !cleanPurchaseUnit
        ? 1
        : Math.max(1, roundStockQuantity(Number(item.unitsPerPurchase) || 1));

    const newItem: InventoryItem = {
      id: invRef.id,
      storeId: activeStoreId,
      ownerUid: user.uid,
      memberEmails,
      name: clampString(item.name, VALIDATION_LIMITS.MAX_NAME_LENGTH) || 'Unnamed Item',
      category: clampString(item.category, VALIDATION_LIMITS.MAX_CATEGORY_LENGTH) || 'General',
      department: resolvedDepartment,
      type: resolvedType,
      unit: clampString(item.unit, VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
      quantity: resolvedType === 'Asset' ? 0 : roundStockQuantity(Number(item.quantity) || 0),
      damagedQty: 0,
      isIGA: Boolean(item.isIGA),
      isConsumable: resolvedConsumable,
      purchaseUnit: cleanPurchaseUnit,
      unitsPerPurchase: cleanUnitsPerPurchase,
      condition: clampString(item.condition || 'N/A', 40),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    batch.set(invRef, newItem);

    const validSerials =
      newItem.type === 'Asset'
        ? serials
            .map((rawSn) => clampString(rawSn, VALIDATION_LIMITS.MAX_SERIAL_LENGTH))
            .filter(Boolean)
        : [];

    const firstSerialChunk = validSerials.slice(0, 5);
    for (const sn of firstSerialChunk) {
      const assetRef = doc(collection(db, 'assets'));
      const newAsset: AssetItem = {
        id: assetRef.id,
        storeId: activeStoreId,
        ownerUid: user.uid,
        memberEmails,
        inventoryId: invRef.id,
        serialNumber: sn,
        condition: 'Good',
        status: 'In Stock',
        currentHolderId: '',
        activeIssueLogId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      batch.set(assetRef, newAsset);
    }

    let currentPath = 'inventory';
    try {
      await batch.commit();
      currentPath = 'assets';
      const ASSET_CHUNK = 5;
      for (let i = 5; i < validSerials.length; i += ASSET_CHUNK) {
        const chunk = validSerials.slice(i, i + ASSET_CHUNK);
        const assetBatch = writeBatch(db);
        for (const sn of chunk) {
          const assetRef = doc(collection(db, 'assets'));
          const newAsset: AssetItem = {
            id: assetRef.id,
            storeId: activeStoreId,
            ownerUid: user.uid,
            memberEmails,
            inventoryId: invRef.id,
            serialNumber: sn,
            condition: 'Good',
            status: 'In Stock',
            currentHolderId: '',
            activeIssueLogId: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          assetBatch.set(assetRef, newAsset);
        }
        await assetBatch.commit();
      }
      showToast('Item saved to cloud database!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, currentPath);
    }
  };

  const updateItem: AppContextValue['updateItem'] = async (updatedItem) => {
    const isHodLocked = activeRole === 'hod' && Boolean(activeDepartment);
    const existingItem = inventory.find((i) => i.id === updatedItem.id);
    if (
      isHodLocked &&
      (!existingItem ||
        (existingItem.department || '').trim().toLowerCase() !==
          activeDepartment.trim().toLowerCase())
    ) {
      showToast(`HOD accounts can only update ${activeDepartment} inventory items.`, 'error');
      return;
    }

    const resolvedConsumable =
      updatedItem.type === 'Asset' ? false : updatedItem.isConsumable !== false;
    const cleanPurchaseUnit =
      updatedItem.type === 'Asset'
        ? ''
        : clampString(updatedItem.purchaseUnit || '', VALIDATION_LIMITS.MAX_UNIT_LENGTH);
    const cleanUnitsPerPurchase =
      updatedItem.type === 'Asset' || !cleanPurchaseUnit
        ? 1
        : Math.max(1, roundStockQuantity(Number(updatedItem.unitsPerPurchase) || 1));

    try {
      await updateDoc(doc(db, 'inventory', updatedItem.id), {
        name: clampString(updatedItem.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        category: clampString(updatedItem.category, VALIDATION_LIMITS.MAX_CATEGORY_LENGTH),
        department: isHodLocked
          ? clampString(activeDepartment, VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH)
          : clampString(updatedItem.department, VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH),
        unit: clampString(updatedItem.unit, VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
        quantity:
          updatedItem.type === 'Asset'
            ? 0
            : roundStockQuantity(Number(updatedItem.quantity) || 0),
        isIGA: Boolean(updatedItem.isIGA),
        isConsumable: resolvedConsumable,
        purchaseUnit: cleanPurchaseUnit,
        unitsPerPurchase: cleanUnitsPerPurchase,
        condition: clampString(updatedItem.condition || 'N/A', 40),
        updatedAt: serverTimestamp(),
      });
      showToast('Item updated successfully!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `inventory/${updatedItem.id}`);
    }
  };

  const updateAsset: AppContextValue['updateAsset'] = async (updatedAsset) => {
    if (activeRole === 'hod' && activeDepartment) {
      const parentItem = inventory.find((i) => i.id === updatedAsset.inventoryId);
      if (
        !parentItem ||
        (parentItem.department || '').trim().toLowerCase() !==
          activeDepartment.trim().toLowerCase()
      ) {
        showToast(`HOD accounts can only update ${activeDepartment} equipment assets.`, 'error');
        return;
      }
    }
    try {
      await updateDoc(doc(db, 'assets', updatedAsset.id), {
        serialNumber: clampString(updatedAsset.serialNumber, VALIDATION_LIMITS.MAX_SERIAL_LENGTH),
        condition: updatedAsset.condition,
        updatedAt: serverTimestamp(),
      });
      showToast(`Asset ${updatedAsset.serialNumber} updated!`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `assets/${updatedAsset.id}`);
    }
  };

  const computeIssueSlipStatus = (lines: IssueLine[]): IssueSlipStatus => {
    const returnableLines = lines.filter((l) => l.returnable);
    if (returnableLines.length === 0) return 'closed';
    const allReturned = returnableLines.every(
      (l) => roundStockQuantity(l.qtyReturned) >= roundStockQuantity(l.qtyIssued),
    );
    if (allReturned) return 'closed';
    const anyReturned = returnableLines.some((l) => roundStockQuantity(l.qtyReturned) > 0);
    return anyReturned ? 'partial' : 'open';
  };

  const issueItem: AppContextValue['issueItem'] = async (issueDetails) => {
    if (!user || !activeStoreId) return false;
    if (activeRole === 'hod') {
      showToast('HOD accounts cannot issue Central Store items.', 'error');
      return false;
    }
    const { inventoryId, recipientId, assetId, returnDate, requestId, responseMessage } =
      issueDetails;
    const qty = roundStockQuantity(Number(issueDetails.quantity) || 1);

    const itemTemplate = inventory.find((i) => i.id === inventoryId);
    const recipientInfo = recipients.find((r) => r.id === recipientId);
    if (!itemTemplate || !recipientInfo) {
      showToast('Invalid item or recipient.', 'error');
      return false;
    }

    const resolvedScope: UsageScope =
      issueDetails.usageScope === 'Outside School' ? 'Outside School' : 'Workshop / Practical';
    const resolvedLocation = clampString(
      issueDetails.usageLocation || '',
      VALIDATION_LIMITS.MAX_NAME_LENGTH,
    );
    if (resolvedScope === 'Outside School' && !resolvedLocation) {
      showToast('Please enter the destination / job site for Outside School gate pass items.', 'error');
      return false;
    }
    const requiresGatePass = resolvedScope === 'Outside School';
    const gatePassNumber = requiresGatePass ? generateGatePassNumber() : '';
    const issuedByEmail = clampString(
      (auth.currentUser?.email || user.email || '').trim().toLowerCase(),
      VALIDATION_LIMITS.MAX_EMAIL_LENGTH,
    );
    const memberEmails = getActiveMembers();
    const nowIso = new Date().toISOString();
    const issueRef = doc(collection(db, 'issues'));
    const movRef = doc(collection(db, 'stockMovements'));
    const batch = writeBatch(db);

    if (itemTemplate.type === 'Consumable') {
      if (qty <= 0) {
        showToast('Please enter a valid quantity greater than zero.', 'error');
        return false;
      }
      if (itemTemplate.quantity < qty) {
        showToast('Not enough stock to issue.', 'error');
        return false;
      }
      const returnable = !isItemConsumable(itemTemplate);
      const cleanReturnDate = returnable ? clampString(returnDate || '', 40) : '';
      if (returnable && !cleanReturnDate) {
        showToast('Please select an expected return date for returnable items.', 'error');
        return false;
      }

      const line: IssueLine = {
        inventoryId: itemTemplate.id,
        name: clampString(itemTemplate.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        qtyIssued: qty,
        qtyReturned: 0,
        qtyDamaged: 0,
        returnable,
        returnCondition: '',
        returnNote: '',
        unit: clampString(itemTemplate.unit, VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
        assetId: '',
        serialNumber: '',
        returnDate: cleanReturnDate,
        dateReturned: '',
      };

      const slipDoc: IssueSlip = {
        id: issueRef.id,
        storeId: activeStoreId,
        ownerUid: user.uid,
        memberEmails,
        recipient: clampString(recipientInfo.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        recipientId: recipientInfo.id,
        recipientName: clampString(recipientInfo.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        dateIssued: nowIso,
        scope: resolvedScope,
        usageLocation: resolvedLocation,
        requiresGatePass,
        gatePassNumber,
        status: returnable ? 'open' : 'closed',
        issuedBy: issuedByEmail,
        lines: [line],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(issueRef, slipDoc);
      batch.set(movRef, {
        storeId: activeStoreId,
        type: 'ISSUE' as StockMovementType,
        inventoryId: itemTemplate.id,
        qty,
        issueId: issueRef.id,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'inventory', itemTemplate.id), {
        quantity: increment(-qty),
        updatedAt: serverTimestamp(),
      });

      if (requestId) {
        batch.update(doc(db, 'issueRequests', requestId), {
          status: 'Issued',
          handledByEmail: issuedByEmail,
          responseMessage: clampString(
            responseMessage ||
              (requiresGatePass
                ? `Issued ${qty} ${itemTemplate.unit} to ${recipientInfo.name} · Gate Pass ${gatePassNumber}.`
                : `Issued ${qty} ${itemTemplate.unit} to ${recipientInfo.name}.`),
            VALIDATION_LIMITS.MAX_MESSAGE_LENGTH,
          ),
          issueLogId: issueRef.id,
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
        showToast(
          requiresGatePass
            ? `Issued (${qty} ${itemTemplate.unit}) · Gate Pass ${gatePassNumber} ready!`
            : returnable
              ? `Returnable item issued (${qty} ${itemTemplate.unit})!`
              : `Consumable issued (${qty} ${itemTemplate.unit})!`,
          'success',
        );
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `issues/${issueRef.id}`);
      }
    } else {
      const assetToIssue = assets.find((a) => a.id === assetId);
      if (!assetToIssue || assetToIssue.status !== 'In Stock') {
        showToast('Asset not available for issue.', 'error');
        return false;
      }

      const line: IssueLine = {
        inventoryId: itemTemplate.id,
        name: clampString(itemTemplate.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        qtyIssued: 1,
        qtyReturned: 0,
        qtyDamaged: 0,
        returnable: true,
        returnCondition: '',
        returnNote: '',
        unit: clampString(itemTemplate.unit, VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
        assetId: assetToIssue.id,
        serialNumber: clampString(assetToIssue.serialNumber, VALIDATION_LIMITS.MAX_SERIAL_LENGTH),
        returnDate: clampString(returnDate || '', 40),
        dateReturned: '',
      };

      const slipDoc: IssueSlip = {
        id: issueRef.id,
        storeId: activeStoreId,
        ownerUid: user.uid,
        memberEmails,
        recipient: clampString(recipientInfo.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        recipientId: recipientInfo.id,
        recipientName: clampString(recipientInfo.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        dateIssued: nowIso,
        scope: resolvedScope,
        usageLocation: resolvedLocation,
        requiresGatePass,
        gatePassNumber,
        status: 'open',
        issuedBy: issuedByEmail,
        lines: [line],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(issueRef, slipDoc);
      batch.set(movRef, {
        storeId: activeStoreId,
        type: 'ISSUE' as StockMovementType,
        inventoryId: itemTemplate.id,
        qty: 1,
        issueId: issueRef.id,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'assets', assetToIssue.id), {
        status: 'Issued',
        currentHolderId: recipientInfo.id,
        activeIssueLogId: issueRef.id,
        updatedAt: serverTimestamp(),
      });

      if (requestId) {
        batch.update(doc(db, 'issueRequests', requestId), {
          status: 'Issued',
          handledByEmail: issuedByEmail,
          responseMessage: clampString(
            responseMessage ||
              (requiresGatePass
                ? `Issued ${assetToIssue.serialNumber} to ${recipientInfo.name} · Gate Pass ${gatePassNumber}.`
                : `Issued ${assetToIssue.serialNumber} to ${recipientInfo.name}.`),
            VALIDATION_LIMITS.MAX_MESSAGE_LENGTH,
          ),
          issueLogId: issueRef.id,
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
        showToast(
          requiresGatePass
            ? `Asset ${assetToIssue.serialNumber} issued · Gate Pass ${gatePassNumber}!`
            : `Asset ${assetToIssue.serialNumber} issued!`,
          'success',
        );
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `issues/${issueRef.id}`);
      }
    }
    return false;
  };

  const issueBulkItems: AppContextValue['issueBulkItems'] = async (details) => {
    if (!user || !activeStoreId) return null;
    if (activeRole === 'hod') {
      showToast('HOD accounts cannot issue Central Store items.', 'error');
      return null;
    }

    const resolvedScope: UsageScope =
      details.usageScope === 'Outside School' ? 'Outside School' : 'Workshop / Practical';
    const resolvedLocation = clampString(
      details.usageLocation || '',
      VALIDATION_LIMITS.MAX_NAME_LENGTH,
    );
    if (resolvedScope === 'Outside School' && !resolvedLocation) {
      showToast('Please enter the outside destination / job site for Gate Pass items.', 'error');
      return null;
    }
    const requiresGatePass = resolvedScope === 'Outside School';
    const gatePassNumber = requiresGatePass ? generateGatePassNumber() : '';

    const recipientInfo = recipients.find((r) => r.id === details.recipientId);
    if (!recipientInfo) {
      showToast('Please select a valid recipient.', 'error');
      return null;
    }

    if (!Array.isArray(details.lines) || details.lines.length === 0) {
      showToast('Add at least one item to issue.', 'error');
      return null;
    }

    const bulkQtyMap = new Map<string, number>();
    const assetSelections: { inventoryId: string; assetId: string; returnDate: string }[] = [];
    const seenAssetIds = new Set<string>();

    for (const line of details.lines) {
      const itemTemplate = inventory.find((i) => i.id === line.inventoryId);
      if (!itemTemplate) {
        showToast('One of the selected items could not be found in inventory.', 'error');
        return null;
      }

      if (itemTemplate.type === 'Consumable') {
        const qty = roundStockQuantity(Number(line.quantity) || 0);
        if (qty <= 0) {
          showToast(`Please enter a valid quantity for ${itemTemplate.name}.`, 'error');
          return null;
        }
        bulkQtyMap.set(
          itemTemplate.id,
          roundStockQuantity((bulkQtyMap.get(itemTemplate.id) || 0) + qty),
        );
      } else {
        const assetId = (line.assetId || '').trim();
        if (!assetId) {
          showToast(`Please choose a serial number for ${itemTemplate.name}.`, 'error');
          return null;
        }
        if (seenAssetIds.has(assetId)) continue;
        seenAssetIds.add(assetId);
        assetSelections.push({
          inventoryId: itemTemplate.id,
          assetId,
          returnDate: clampString(line.returnDate || details.defaultReturnDate || '', 40),
        });
      }
    }

    const totalLineCount = bulkQtyMap.size + assetSelections.length;
    if (totalLineCount === 0) {
      showToast('No valid item lines to issue.', 'error');
      return null;
    }
    if (totalLineCount > 150) {
      showToast('Please issue at most 150 distinct item lines per slip.', 'error');
      return null;
    }

    for (const [invId, totalQty] of bulkQtyMap.entries()) {
      const item = inventory.find((i) => i.id === invId);
      if (!item || item.quantity < totalQty) {
        showToast(
          `Insufficient stock for ${item?.name || 'item'} (requested ${totalQty}, in stock ${item?.quantity ?? 0}).`,
          'error',
        );
        return null;
      }
      if (!isItemConsumable(item) && !clampString(details.defaultReturnDate || '', 40)) {
        showToast(
          `Please select an expected return date for returnable item "${item.name}".`,
          'error',
        );
        return null;
      }
    }

    for (const sel of assetSelections) {
      const asset = assets.find((a) => a.id === sel.assetId);
      const item = inventory.find((i) => i.id === sel.inventoryId);
      if (!asset || asset.inventoryId !== sel.inventoryId || asset.status !== 'In Stock') {
        showToast(
          `Asset ${asset?.serialNumber || sel.assetId} (${item?.name || 'equipment'}) is no longer In Stock.`,
          'error',
        );
        return null;
      }
      if (!sel.returnDate) {
        showToast(
          `Please select an expected return date for serialized assets (${item?.name || 'equipment'}).`,
          'error',
        );
        return null;
      }
    }

    const issuedByEmail = clampString(
      (auth.currentUser?.email || user.email || '').trim().toLowerCase(),
      VALIDATION_LIMITS.MAX_EMAIL_LENGTH,
    );
    const memberEmails = getActiveMembers();
    const nowIso = new Date().toISOString();
    const issueRef = doc(collection(db, 'issues'));
    const slipLines: IssueLine[] = [];
    const batch = writeBatch(db);

    for (const [invId, totalQty] of bulkQtyMap.entries()) {
      const itemTemplate = inventory.find((i) => i.id === invId)!;
      const returnable = !isItemConsumable(itemTemplate);
      const returnDue = returnable ? clampString(details.defaultReturnDate || '', 40) : '';

      slipLines.push({
        inventoryId: itemTemplate.id,
        name: clampString(itemTemplate.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        qtyIssued: totalQty,
        qtyReturned: 0,
        qtyDamaged: 0,
        returnable,
        returnCondition: '',
        returnNote: '',
        unit: clampString(itemTemplate.unit, VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
        assetId: '',
        serialNumber: '',
        returnDate: returnDue,
        dateReturned: '',
      });

      batch.update(doc(db, 'inventory', itemTemplate.id), {
        quantity: increment(-totalQty),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(collection(db, 'stockMovements')), {
        storeId: activeStoreId,
        type: 'ISSUE' as StockMovementType,
        inventoryId: itemTemplate.id,
        qty: totalQty,
        issueId: issueRef.id,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
    }

    for (const sel of assetSelections) {
      const itemTemplate = inventory.find((i) => i.id === sel.inventoryId)!;
      const assetToIssue = assets.find((a) => a.id === sel.assetId)!;

      slipLines.push({
        inventoryId: itemTemplate.id,
        name: clampString(itemTemplate.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        qtyIssued: 1,
        qtyReturned: 0,
        qtyDamaged: 0,
        returnable: true,
        returnCondition: '',
        returnNote: '',
        unit: clampString(itemTemplate.unit, VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
        assetId: assetToIssue.id,
        serialNumber: clampString(assetToIssue.serialNumber, VALIDATION_LIMITS.MAX_SERIAL_LENGTH),
        returnDate: sel.returnDate,
        dateReturned: '',
      });

      batch.update(doc(db, 'assets', assetToIssue.id), {
        status: 'Issued',
        currentHolderId: recipientInfo.id,
        activeIssueLogId: issueRef.id,
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(collection(db, 'stockMovements')), {
        storeId: activeStoreId,
        type: 'ISSUE' as StockMovementType,
        inventoryId: itemTemplate.id,
        qty: 1,
        issueId: issueRef.id,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
    }

    const slipDoc: IssueSlip = {
      id: issueRef.id,
      storeId: activeStoreId,
      ownerUid: user.uid,
      memberEmails,
      recipient: clampString(recipientInfo.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
      recipientId: recipientInfo.id,
      recipientName: clampString(recipientInfo.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
      dateIssued: nowIso,
      scope: resolvedScope,
      usageLocation: resolvedLocation,
      requiresGatePass,
      gatePassNumber,
      status: computeIssueSlipStatus(slipLines),
      issuedBy: issuedByEmail,
      lines: slipLines,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(issueRef, slipDoc);

    try {
      await batch.commit();
      const totalUnits = roundStockQuantity(
        slipLines.reduce((sum, l) => sum + l.qtyIssued, 0),
      );
      showToast(
        requiresGatePass
          ? `Issued ${slipLines.length} item line${slipLines.length === 1 ? '' : 's'} (${totalUnits} units) · Gate Pass ${gatePassNumber} ready!`
          : `Issued ${slipLines.length} item line${slipLines.length === 1 ? '' : 's'} (${totalUnits} total unit${totalUnits === 1 ? '' : 's'}) to ${recipientInfo.name}!`,
        'success',
      );
      return {
        slip: slipDoc,
        failedItems: [],
      };
    } catch (err) {
      const rawErrorMessage = err instanceof Error ? err.message : String(err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `issues/${issueRef.id}`);
      } catch {
        // Logged via handleFirestoreError
      }
      showToast(`Bulk issue failed: ${rawErrorMessage}`, 'error');
      return {
        slip: null,
        failedItems: slipLines.map((l) =>
          l.serialNumber ? `${l.name} (${l.serialNumber})` : `${l.name} (${l.qtyIssued} ${l.unit || 'Pcs'})`,
        ),
        errorMessage: rawErrorMessage,
      };
    }
  };

  const returnIssueSlip: AppContextValue['returnIssueSlip'] = async ({
    issueId,
    mode,
    lines: inputLines,
    defaultCondition = 'Good',
    defaultNote = '',
  }) => {
    if (!user || !activeStoreId) {
      showToast('Please sign in to process item returns.', 'error');
      return null;
    }
    if (activeRole === 'hod') {
      showToast('HOD accounts cannot process item returns.', 'error');
      return null;
    }

    const slip = issues.find((s) => s.id === issueId);
    if (!slip) {
      showToast('Issue slip not found.', 'error');
      return null;
    }

    const updatedLines: IssueLine[] = slip.lines.map((l) => ({ ...l }));
    const invUpdates = new Map<string, { usable: number; damaged: number }>();
    const assetUpdates: Array<{ assetId: string; condition: AssetCondition }> = [];
    const movementsToAppend: Array<{ type: StockMovementType; inventoryId: string; qty: number }> = [];
    const nowIso = new Date().toISOString();

    let totalRestored = 0;
    let totalDamaged = 0;
    let processedLines = 0;

    if (mode === 'all_good') {
      for (let idx = 0; idx < updatedLines.length; idx++) {
        const line = updatedLines[idx];
        if (!line.returnable) continue;
        const remaining = roundStockQuantity(Math.max(0, line.qtyIssued - line.qtyReturned));
        if (remaining <= 0) continue;

        const cleanCond: AssetCondition =
          defaultCondition === 'Serviceable' || defaultCondition === 'Obsolete'
            ? defaultCondition
            : 'Good';
        const damagedQty = cleanCond === 'Obsolete' ? remaining : 0;
        const usableQty = cleanCond === 'Obsolete' ? 0 : remaining;

        updatedLines[idx] = {
          ...line,
          qtyReturned: roundStockQuantity(line.qtyReturned + remaining),
          qtyDamaged: roundStockQuantity(line.qtyDamaged + damagedQty),
          returnCondition: cleanCond,
          returnNote: clampString(
            defaultNote || line.returnNote || '',
            VALIDATION_LIMITS.MAX_RETURN_NOTE_LENGTH,
          ),
          dateReturned: nowIso,
        };

        if (line.assetId) {
          assetUpdates.push({ assetId: line.assetId, condition: cleanCond });
          if (damagedQty > 0) {
            const prev = invUpdates.get(line.inventoryId) || { usable: 0, damaged: 0 };
            invUpdates.set(line.inventoryId, {
              usable: prev.usable,
              damaged: roundStockQuantity(prev.damaged + damagedQty),
            });
          }
        } else {
          const prev = invUpdates.get(line.inventoryId) || { usable: 0, damaged: 0 };
          invUpdates.set(line.inventoryId, {
            usable: roundStockQuantity(prev.usable + usableQty),
            damaged: roundStockQuantity(prev.damaged + damagedQty),
          });
        }

        if (usableQty > 0) {
          movementsToAppend.push({ type: 'RETURN', inventoryId: line.inventoryId, qty: usableQty });
        }
        if (damagedQty > 0) {
          movementsToAppend.push({ type: 'DAMAGED', inventoryId: line.inventoryId, qty: damagedQty });
        }

        totalRestored = roundStockQuantity(totalRestored + usableQty);
        totalDamaged = roundStockQuantity(totalDamaged + damagedQty);
        processedLines += 1;
      }
    } else {
      for (const input of inputLines || []) {
        const line = updatedLines[input.lineIndex];
        if (!line || !line.returnable) continue;

        const remaining = roundStockQuantity(Math.max(0, line.qtyIssued - line.qtyReturned));
        if (remaining <= 0) continue;

        const qtyReturning = roundStockQuantity(Number(input.qtyReturning) || 0);
        if (qtyReturning <= 0) continue;
        if (qtyReturning > remaining + 0.0001) {
          showToast(
            `Cannot return ${qtyReturning} for "${line.name}" — only ${remaining} remaining unreturned.`,
            'error',
          );
          return null;
        }

        const rawDamaged = roundStockQuantity(Number(input.qtyDamaged) || 0);
        if (rawDamaged < 0 || rawDamaged > qtyReturning + 0.0001) {
          showToast(
            `Damaged quantity for "${line.name}" must be between 0 and ${qtyReturning}.`,
            'error',
          );
          return null;
        }

        const cleanCond: AssetCondition = input.returnCondition || 'Good';
        const damagedQty = line.assetId && cleanCond === 'Obsolete' ? qtyReturning : rawDamaged;
        const usableQty = roundStockQuantity(Math.max(0, qtyReturning - damagedQty));

        updatedLines[input.lineIndex] = {
          ...line,
          qtyReturned: roundStockQuantity(line.qtyReturned + qtyReturning),
          qtyDamaged: roundStockQuantity(line.qtyDamaged + damagedQty),
          returnCondition: cleanCond,
          returnNote: clampString(
            input.returnNote ?? line.returnNote ?? '',
            VALIDATION_LIMITS.MAX_RETURN_NOTE_LENGTH,
          ),
          dateReturned: nowIso,
        };

        if (line.assetId) {
          assetUpdates.push({ assetId: line.assetId, condition: cleanCond });
          if (damagedQty > 0) {
            const prev = invUpdates.get(line.inventoryId) || { usable: 0, damaged: 0 };
            invUpdates.set(line.inventoryId, {
              usable: prev.usable,
              damaged: roundStockQuantity(prev.damaged + damagedQty),
            });
          }
        } else {
          const prev = invUpdates.get(line.inventoryId) || { usable: 0, damaged: 0 };
          invUpdates.set(line.inventoryId, {
            usable: roundStockQuantity(prev.usable + usableQty),
            damaged: roundStockQuantity(prev.damaged + damagedQty),
          });
        }

        if (usableQty > 0) {
          movementsToAppend.push({ type: 'RETURN', inventoryId: line.inventoryId, qty: usableQty });
        }
        if (damagedQty > 0) {
          movementsToAppend.push({ type: 'DAMAGED', inventoryId: line.inventoryId, qty: damagedQty });
        }

        totalRestored = roundStockQuantity(totalRestored + usableQty);
        totalDamaged = roundStockQuantity(totalDamaged + damagedQty);
        processedLines += 1;
      }
    }

    if (processedLines === 0) {
      showToast('No pending returnable lines selected to return.', 'info');
      return null;
    }

    const nextStatus = computeIssueSlipStatus(updatedLines);
    const batch = writeBatch(db);

    batch.update(doc(db, 'issues', slip.id), {
      lines: updatedLines,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });

    for (const [invId, delta] of invUpdates.entries()) {
      const invExists = inventory.some((i) => i.id === invId);
      if (!invExists) continue;
      if (delta.usable <= 0 && delta.damaged <= 0) continue;
      batch.update(doc(db, 'inventory', invId), {
        ...(delta.usable > 0 ? { quantity: increment(delta.usable) } : {}),
        ...(delta.damaged > 0 ? { damagedQty: increment(delta.damaged) } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    for (const assetUpd of assetUpdates) {
      const linkedAsset = assets.find((a) => a.id === assetUpd.assetId);
      if (linkedAsset && linkedAsset.status === 'Issued') {
        batch.update(doc(db, 'assets', assetUpd.assetId), {
          status: 'In Stock',
          condition: assetUpd.condition,
          currentHolderId: '',
          activeIssueLogId: '',
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const mov of movementsToAppend) {
      batch.set(doc(collection(db, 'stockMovements')), {
        storeId: activeStoreId,
        type: mov.type,
        inventoryId: mov.inventoryId,
        qty: mov.qty,
        issueId: slip.id,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
      showToast(
        totalDamaged > 0
          ? `Return recorded (${processedLines} line${processedLines === 1 ? '' : 's'}): ${totalRestored} restored, ${totalDamaged} damaged.`
          : `Returned ${processedLines} line${processedLines === 1 ? '' : 's'} (${totalRestored} unit${totalRestored === 1 ? '' : 's'}) to inventory.`,
        totalDamaged > 0 ? 'info' : 'success',
      );
      return {
        slip: {
          ...slip,
          lines: updatedLines,
          status: nextStatus,
        },
        restoredTotal: totalRestored,
        damagedTotal: totalDamaged,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process slip return.';
      try {
        handleFirestoreError(err, OperationType.UPDATE, `issues/${slip.id}`);
      } catch {
        // Logged via handleFirestoreError
      }
      showToast(`Return failed: ${message}`, 'error');
      throw new Error(message);
    }
  };

  const createIssueRequest: AppContextValue['createIssueRequest'] = async (reqInput) => {
    if (!user || !activeStoreId) return false;
    const resolvedDepartment = clampString(
      activeRole === 'hod'
        ? activeDepartment
        : activeDepartment || STANDARD_TVET_DEPARTMENTS[0],
      VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH,
    );
    const cleanItemName = clampString(reqInput.itemName, VALIDATION_LIMITS.MAX_NAME_LENGTH);
    const cleanMessage = clampString(reqInput.message, VALIDATION_LIMITS.MAX_MESSAGE_LENGTH);
    const cleanRecipient = clampString(reqInput.recipientName, VALIDATION_LIMITS.MAX_NAME_LENGTH);
    if (!cleanItemName || !cleanMessage || !cleanRecipient) {
      showToast('Item name, intended recipient, and message are required.', 'error');
      return false;
    }

    const cleanInvId = clampString(reqInput.inventoryId || '', VALIDATION_LIMITS.MAX_ID_LENGTH);
    if (activeRole === 'hod' && activeDepartment && cleanInvId) {
      const linkedItem = inventory.find((i) => i.id === cleanInvId);
      if (
        !linkedItem ||
        (linkedItem.department || '').trim().toLowerCase() !==
          activeDepartment.trim().toLowerCase()
      ) {
        showToast(
          `HOD accounts can only link catalog items from ${activeDepartment}.`,
          'error',
        );
        return false;
      }
    }

    const resolvedScope: UsageScope =
      reqInput.usageScope === 'Outside School' ? 'Outside School' : 'Workshop / Practical';
    const resolvedLocation = clampString(
      reqInput.usageLocation || '',
      VALIDATION_LIMITS.MAX_NAME_LENGTH,
    );
    if (resolvedScope === 'Outside School' && !resolvedLocation) {
      showToast('Please enter the outside job site / destination for a Gate Pass request.', 'error');
      return false;
    }
    const qty = roundStockQuantity(Number(reqInput.quantity) || 0);
    if (qty <= 0) {
      showToast('Please enter a valid quantity greater than zero.', 'error');
      return false;
    }

    const reqRef = doc(collection(db, 'issueRequests'));
    const newReq: IssueRequest = {
      id: reqRef.id,
      storeId: activeStoreId,
      ownerUid: user.uid,
      memberEmails: getActiveMembers(),
      department: resolvedDepartment,
      requestedByEmail: user.email,
      requestedByName:
        clampString(user.displayName || user.email, VALIDATION_LIMITS.MAX_NAME_LENGTH) || user.email,
      inventoryId: cleanInvId,
      itemName: cleanItemName,
      quantity: qty,
      unit: clampString(reqInput.unit, VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
      recipientName: cleanRecipient,
      usageScope: resolvedScope,
      usageLocation: resolvedLocation,
      requiresGatePass: resolvedScope === 'Outside School',
      urgency: reqInput.urgency === 'Urgent' ? 'Urgent' : 'Normal',
      message: cleanMessage,
      status: 'Pending',
      handledByEmail: '',
      responseMessage: '',
      issueLogId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(reqRef, newReq);
      showToast('Request message sent to Procurement Officer & Admin!', 'success');
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `issueRequests/${reqRef.id}`);
      return false;
    }
  };

  const resolveIssueRequest: AppContextValue['resolveIssueRequest'] = async (
    requestId,
    updates,
  ) => {
    if (!user || activeRole === 'hod') {
      showToast('Only Store Officers and Admins can resolve item requests.', 'error');
      return false;
    }
    try {
      await updateDoc(doc(db, 'issueRequests', requestId), {
        status: updates.status,
        handledByEmail: user.email,
        responseMessage: clampString(
          updates.responseMessage,
          VALIDATION_LIMITS.MAX_MESSAGE_LENGTH,
        ),
        issueLogId: clampString(updates.issueLogId || '', VALIDATION_LIMITS.MAX_ID_LENGTH),
        updatedAt: serverTimestamp(),
      });
      showToast(`Request marked as ${updates.status}.`, 'success');
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `issueRequests/${requestId}`);
      return false;
    }
  };

  const addRecipient: AppContextValue['addRecipient'] = async (recipient) => {
    if (!user || !activeStoreId) return;
    const recRef = doc(collection(db, 'recipients'));
    const newRec: Recipient = {
      id: recRef.id,
      storeId: activeStoreId,
      ownerUid: user.uid,
      memberEmails: getActiveMembers(),
      name: clampString(recipient.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
      type: recipient.type,
      regNumber: clampString(recipient.regNumber, VALIDATION_LIMITS.MAX_REG_NUMBER_LENGTH),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(recRef, newRec);
      showToast('Recipient added!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `recipients/${recRef.id}`);
    }
  };

  const updateRecipient: AppContextValue['updateRecipient'] = async (updated) => {
    try {
      await updateDoc(doc(db, 'recipients', updated.id), {
        name: clampString(updated.name, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        type: updated.type,
        regNumber: clampString(updated.regNumber, VALIDATION_LIMITS.MAX_REG_NUMBER_LENGTH),
        updatedAt: serverTimestamp(),
      });
      showToast('Recipient updated!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `recipients/${updated.id}`);
    }
  };

  const deleteRecipient: AppContextValue['deleteRecipient'] = async (id) => {
    try {
      await deleteDoc(doc(db, 'recipients', id));
      showToast('Recipient deleted!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `recipients/${id}`);
    }
  };

  const addDisposalRequest: AppContextValue['addDisposalRequest'] = async (request) => {
    if (!user || !activeStoreId) return;
    if (activeRole === 'hod') {
      showToast('HOD accounts cannot submit asset disposal requests.', 'error');
      return;
    }
    const assetToDispose = assets.find((a) => a.id === request.assetId);
    const itemInfo = assetToDispose ? inventory.find((i) => i.id === assetToDispose.inventoryId) : null;
    if (!assetToDispose || !itemInfo) {
      showToast('Asset record not found.', 'error');
      return;
    }

    const dispRef = doc(collection(db, 'disposalLog'));
    const newReq: DisposalLogEntry = {
      id: dispRef.id,
      storeId: activeStoreId,
      ownerUid: user.uid,
      memberEmails: getActiveMembers(),
      assetId: assetToDispose.id,
      inventoryId: itemInfo.id,
      method: request.method,
      itemName: clampString(
        `${itemInfo.name} (${assetToDispose.serialNumber})`,
        VALIDATION_LIMITS.MAX_DISPOSAL_ITEM_NAME_LENGTH,
      ),
      itemCategory: clampString(itemInfo.category, VALIDATION_LIMITS.MAX_CATEGORY_LENGTH),
      status: 'Pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(dispRef, newReq);
      showToast('Disposal request created.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `disposalLog/${dispRef.id}`);
    }
  };

  const updateDisposalStatus: AppContextValue['updateDisposalStatus'] = async (id, status) => {
    if (activeRole !== 'admin') {
      showToast('Only Store Administrators can update disposal status.', 'error');
      return;
    }
    const record = disposalLog.find((l) => l.id === id);
    if (!record) return;

    const batch = writeBatch(db);
    batch.update(doc(db, 'disposalLog', id), {
      status,
      updatedAt: serverTimestamp(),
    });
    if (status === 'Disposed' && record.assetId) {
      batch.update(doc(db, 'assets', record.assetId), {
        status: 'Disposed',
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
      showToast(`Disposal status updated to ${status}.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `disposalLog/${id}`);
    }
  };

  const addIGAUnit: AppContextValue['addIGAUnit'] = async (unit) => {
    if (!user || !activeStoreId) return false;
    const isAdminSubmitter = activeRole === 'admin';
    const department = clampString(
      activeRole === 'hod' && activeDepartment ? activeDepartment : unit.department,
      VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH,
    );
    const igaName = clampString(unit.igaName, VALIDATION_LIMITS.MAX_NAME_LENGTH);
    if (!department || !igaName) {
      showToast('Department and IGA unit name are required.', 'error');
      return false;
    }

    const proposalLink = sanitizeProposalLink(unit.proposalLink);
    if (unit.proposalLink && unit.proposalLink.trim() && !proposalLink) {
      showToast('Please enter a valid https:// Google Drive or Google Docs share link.', 'error');
      return false;
    }

    const proposalFileName = clampString(
      unit.proposalFileName || (proposalLink ? 'Google Drive Proposal Document' : ''),
      VALIDATION_LIMITS.MAX_PROPOSAL_FILE_NAME_LENGTH,
    );
    const proposalDataUrl = proposalLink
      ? ''
      : typeof unit.proposalDataUrl === 'string' &&
          unit.proposalDataUrl.length <= VALIDATION_LIMITS.MAX_PROPOSAL_DATA_URL_LENGTH
        ? unit.proposalDataUrl
        : '';
    const proposalSummary = clampString(
      unit.proposalSummary || '',
      VALIDATION_LIMITS.MAX_PROPOSAL_SUMMARY_LENGTH,
    );

    const hasProposalAttachment =
      Boolean(proposalLink) || (Boolean(proposalFileName) && Boolean(proposalDataUrl));
    if (!isAdminSubmitter && !hasProposalAttachment) {
      showToast(
        'Please attach a Google Drive link or upload a small proposal document for Admin review.',
        'error',
      );
      return false;
    }

    const unitRef = doc(collection(db, 'igaUnits'));
    const newUnit: DepartmentalIGA = {
      id: unitRef.id,
      storeId: activeStoreId,
      ownerUid: user.uid,
      memberEmails: getActiveMembers(),
      department,
      igaName,
      activityType: unit.activityType,
      leadTrainer: clampString(unit.leadTrainer, VALIDATION_LIMITS.MAX_NAME_LENGTH),
      status: isAdminSubmitter ? unit.status : 'Planned',
      description: clampString(unit.description, VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH),
      approvalStatus: isAdminSubmitter ? 'Approved' : 'Pending',
      approvalNotes: isAdminSubmitter ? 'Approved upon Admin registration.' : '',
      reviewedByEmail: isAdminSubmitter ? user.email : '',
      proposalFileName,
      proposalDataUrl,
      proposalLink,
      proposalSummary,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(unitRef, newUnit);
      showToast(
        isAdminSubmitter
          ? `Registered & approved IGA for ${department}.`
          : `Submitted ${department} IGA proposal for Admin approval.`,
        'success',
      );
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `igaUnits/${unitRef.id}`);
      return false;
    }
  };

  const updateIGAUnit: AppContextValue['updateIGAUnit'] = async (updatedUnit) => {
    const existingUnit = igaUnits.find((u) => u.id === updatedUnit.id);
    if (
      activeRole === 'hod' &&
      activeDepartment &&
      (!existingUnit ||
        (existingUnit.department || '').trim().toLowerCase() !==
          activeDepartment.trim().toLowerCase())
    ) {
      showToast(`HOD accounts can only update ${activeDepartment} IGA units.`, 'error');
      return;
    }
    const isAdminEditor = activeRole === 'admin';
    const proposalLink = sanitizeProposalLink(updatedUnit.proposalLink);
    if (updatedUnit.proposalLink && updatedUnit.proposalLink.trim() && !proposalLink) {
      showToast('Please enter a valid https:// Google Drive or Google Docs share link.', 'error');
      return;
    }
    const proposalFileName = clampString(
      updatedUnit.proposalFileName || (proposalLink ? 'Google Drive Proposal Document' : ''),
      VALIDATION_LIMITS.MAX_PROPOSAL_FILE_NAME_LENGTH,
    );
    const proposalDataUrl = proposalLink
      ? ''
      : typeof updatedUnit.proposalDataUrl === 'string' &&
          updatedUnit.proposalDataUrl.length <= VALIDATION_LIMITS.MAX_PROPOSAL_DATA_URL_LENGTH
        ? updatedUnit.proposalDataUrl
        : '';
    const proposalSummary = clampString(
      updatedUnit.proposalSummary || '',
      VALIDATION_LIMITS.MAX_PROPOSAL_SUMMARY_LENGTH,
    );
    const hasProposalAttachment =
      Boolean(proposalLink) || (Boolean(proposalFileName) && Boolean(proposalDataUrl));

    try {
      if (isAdminEditor) {
        await updateDoc(doc(db, 'igaUnits', updatedUnit.id), {
          department:
            clampString(updatedUnit.department, VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH) ||
            'General',
          igaName:
            clampString(updatedUnit.igaName, VALIDATION_LIMITS.MAX_NAME_LENGTH) ||
            'Departmental IGA',
          activityType: updatedUnit.activityType,
          leadTrainer: clampString(updatedUnit.leadTrainer, VALIDATION_LIMITS.MAX_NAME_LENGTH),
          status: updatedUnit.status,
          description: clampString(updatedUnit.description, VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH),
          proposalFileName,
          proposalDataUrl,
          proposalLink,
          proposalSummary,
          approvalStatus: updatedUnit.approvalStatus || 'Approved',
          approvalNotes: clampString(
            updatedUnit.approvalNotes || '',
            VALIDATION_LIMITS.MAX_APPROVAL_NOTES_LENGTH,
          ),
          reviewedByEmail: clampString(
            updatedUnit.reviewedByEmail || user?.email || '',
            VALIDATION_LIMITS.MAX_EMAIL_LENGTH,
          ),
          updatedAt: serverTimestamp(),
        });
        showToast(`Updated ${updatedUnit.department} IGA.`, 'success');
        return;
      }

      const currentApproval = existingUnit?.approvalStatus || 'Approved';
      if (currentApproval !== 'Approved') {
        if (!hasProposalAttachment) {
          showToast(
            'A Google Drive link or proposal document is required before resubmitting for Admin approval.',
            'error',
          );
          return;
        }
        await updateDoc(doc(db, 'igaUnits', updatedUnit.id), {
          igaName:
            clampString(updatedUnit.igaName, VALIDATION_LIMITS.MAX_NAME_LENGTH) ||
            'Departmental IGA',
          activityType: updatedUnit.activityType,
          leadTrainer: clampString(updatedUnit.leadTrainer, VALIDATION_LIMITS.MAX_NAME_LENGTH),
          status: 'Planned',
          description: clampString(updatedUnit.description, VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH),
          proposalFileName,
          proposalDataUrl,
          proposalLink,
          proposalSummary,
          approvalStatus: 'Pending',
          approvalNotes: '',
          reviewedByEmail: '',
          updatedAt: serverTimestamp(),
        });
        showToast(`Resubmitted ${updatedUnit.department} IGA proposal for Admin approval.`, 'success');
        return;
      }

      await updateDoc(doc(db, 'igaUnits', updatedUnit.id), {
        igaName:
          clampString(updatedUnit.igaName, VALIDATION_LIMITS.MAX_NAME_LENGTH) ||
          'Departmental IGA',
        activityType: updatedUnit.activityType,
        leadTrainer: clampString(updatedUnit.leadTrainer, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        status: updatedUnit.status,
        description: clampString(updatedUnit.description, VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH),
        proposalFileName,
        proposalDataUrl,
        proposalLink,
        proposalSummary,
        updatedAt: serverTimestamp(),
      });
      showToast(`Updated ${updatedUnit.department} IGA.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `igaUnits/${updatedUnit.id}`);
    }
  };

  const reviewIGAUnit: AppContextValue['reviewIGAUnit'] = async (
    id,
    decision,
    approvalNotes,
  ) => {
    if (!user || activeRole !== 'admin') {
      showToast('Only Store Administrators can approve or reject IGA proposals.', 'error');
      return false;
    }
    try {
      await updateDoc(doc(db, 'igaUnits', id), {
        approvalStatus: decision,
        approvalNotes: clampString(approvalNotes, VALIDATION_LIMITS.MAX_APPROVAL_NOTES_LENGTH),
        reviewedByEmail: user.email,
        status: decision === 'Approved' ? 'Active' : 'Paused',
        updatedAt: serverTimestamp(),
      });
      showToast(
        decision === 'Approved'
          ? 'IGA proposal approved and unit activated!'
          : 'IGA proposal rejected with remarks.',
        decision === 'Approved' ? 'success' : 'info',
      );
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `igaUnits/${id}`);
      return false;
    }
  };

  const deleteIGAUnit: AppContextValue['deleteIGAUnit'] = async (id) => {
    if (!user || activeRole !== 'admin' || (!user.isBootstrappedAdmin && user.role !== 'admin')) {
      showToast('Only Store Administrators can delete departmental IGA units.', 'error');
      return false;
    }
    const targetUnit = igaUnits.find((u) => u.id === id);
    const linkedLogs = igaLogistics.filter((l) => l.igaId === id);

    try {
      const BATCH_LIMIT = 450;
      if (linkedLogs.length === 0) {
        await deleteDoc(doc(db, 'igaUnits', id));
      } else {
        for (let i = 0; i < linkedLogs.length; i += BATCH_LIMIT) {
          const chunk = linkedLogs.slice(i, i + BATCH_LIMIT);
          const batch = writeBatch(db);
          chunk.forEach((logEntry) => {
            batch.delete(doc(db, 'igaLogistics', logEntry.id));
          });
          if (i + BATCH_LIMIT >= linkedLogs.length) {
            batch.delete(doc(db, 'igaUnits', id));
          }
          await batch.commit();
        }
      }

      showToast(
        linkedLogs.length > 0
          ? `Deleted "${targetUnit?.igaName || 'IGA unit'}" and ${linkedLogs.length} linked logistics record(s).`
          : `Deleted "${targetUnit?.igaName || 'IGA unit'}".`,
        'success',
      );
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `igaUnits/${id}`);
      return false;
    }
  };

  const addIGALogistics: AppContextValue['addIGALogistics'] = async (entry) => {
    if (!user || !activeStoreId) return false;
    const parentUnit = igaUnits.find((u) => u.id === entry.igaId);
    if (!parentUnit) {
      showToast('Please select a registered Departmental IGA unit.', 'error');
      return false;
    }
    if (
      activeRole === 'hod' &&
      activeDepartment &&
      (parentUnit.department || '').trim().toLowerCase() !==
        activeDepartment.trim().toLowerCase()
    ) {
      showToast(`HOD accounts can only log logistics for ${activeDepartment}.`, 'error');
      return false;
    }
    if ((parentUnit.approvalStatus || 'Approved') !== 'Approved') {
      showToast(
        'This IGA unit must be approved by the Admin before logging logistics entries.',
        'error',
      );
      return false;
    }

    const qty = Math.max(1, Math.floor(Number(entry.quantity) || 1));
    const unitAmt = Math.max(0, Math.round(Number(entry.unitAmount) || 0));
    const totalAmt = Math.max(0, qty * unitAmt);

    const isRequisition = entry.entryType === 'Store Requisition';
    const linkedInvId = isRequisition ? clampString(entry.inventoryId || '', VALIDATION_LIMITS.MAX_ID_LENGTH) : '';
    const linkedInv = linkedInvId ? inventory.find((i) => i.id === linkedInvId) : null;

    if (linkedInvId && (!linkedInv || linkedInv.type !== 'Consumable')) {
      showToast('Linked store requisition item must be a Consumable in Central Store.', 'error');
      return false;
    }
    if (
      linkedInv &&
      activeRole === 'hod' &&
      activeDepartment &&
      (linkedInv.department || '').trim().toLowerCase() !==
        activeDepartment.trim().toLowerCase()
    ) {
      showToast(`HOD accounts can only requisition ${activeDepartment} inventory items.`, 'error');
      return false;
    }
    if (linkedInv && linkedInv.quantity < qty) {
      showToast(`Insufficient Central Store stock (${linkedInv.quantity} ${linkedInv.unit} available).`, 'error');
      return false;
    }

    const derivedDirection: IGADirection =
      entry.direction ||
      (entry.entryType === 'Sales Revenue'
        ? 'Inflow'
        : entry.entryType === 'Direct Purchase' || entry.entryType === 'Store Requisition'
          ? 'Outflow'
          : 'Internal');

    const logRef = doc(collection(db, 'igaLogistics'));
    const batch = writeBatch(db);

    if (linkedInv) {
      batch.update(doc(db, 'inventory', linkedInv.id), {
        quantity: linkedInv.quantity - qty,
        updatedAt: serverTimestamp(),
      });
    }

    const newLog: IGALogisticsEntry = {
      id: logRef.id,
      storeId: activeStoreId,
      ownerUid: user.uid,
      memberEmails: getActiveMembers(),
      igaId: parentUnit.id,
      department: clampString(parentUnit.department, VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH),
      igaName: clampString(parentUnit.igaName, VALIDATION_LIMITS.MAX_NAME_LENGTH),
      entryType: entry.entryType,
      inventoryId: linkedInv ? linkedInv.id : '',
      description:
        clampString(
          entry.description || (linkedInv ? linkedInv.name : ''),
          VALIDATION_LIMITS.MAX_DISPOSAL_ITEM_NAME_LENGTH,
        ) || entry.entryType,
      quantity: qty,
      unit:
        clampString(entry.unit || (linkedInv ? linkedInv.unit : 'Pcs'), VALIDATION_LIMITS.MAX_UNIT_LENGTH) ||
        'Pcs',
      unitAmount: unitAmt,
      totalAmount: totalAmt,
      direction: derivedDirection,
      dispatchStatus: entry.dispatchStatus || 'Logged',
      destinationOrClient: clampString(entry.destinationOrClient, VALIDATION_LIMITS.MAX_NAME_LENGTH),
      dateRecorded: clampString(entry.dateRecorded || new Date().toISOString().split('T')[0], 40),
      notes: clampString(entry.notes, VALIDATION_LIMITS.MAX_NOTES_LENGTH),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(logRef, newLog);

    try {
      await batch.commit();
      showToast(
        linkedInv
          ? `Logged requisition & deducted ${qty} ${newLog.unit} from Central Store.`
          : `Logged ${entry.entryType} for ${parentUnit.department}.`,
        'success',
      );
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `igaLogistics/${logRef.id}`);
      return false;
    }
  };

  const updateIGALogisticsStatus: AppContextValue['updateIGALogisticsStatus'] = async (
    id,
    updates,
  ) => {
    const existingLog = igaLogistics.find((l) => l.id === id);
    if (!existingLog) return;
    if (
      activeRole === 'hod' &&
      activeDepartment &&
      (existingLog.department || '').trim().toLowerCase() !==
        activeDepartment.trim().toLowerCase()
    ) {
      showToast(`HOD accounts can only update ${activeDepartment} logistics records.`, 'error');
      return;
    }
    if (existingLog.dispatchStatus === 'Completed' && activeRole !== 'admin') {
      showToast('Completed logistics records can only be unlocked by a Store Admin.', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'igaLogistics', id), {
        dispatchStatus: updates.dispatchStatus,
        destinationOrClient: clampString(
          updates.destinationOrClient ?? existingLog.destinationOrClient,
          VALIDATION_LIMITS.MAX_NAME_LENGTH,
        ),
        notes: clampString(updates.notes ?? existingLog.notes, VALIDATION_LIMITS.MAX_NOTES_LENGTH),
        updatedAt: serverTimestamp(),
      });
      showToast(`Dispatch status updated to ${updates.dispatchStatus}.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `igaLogistics/${id}`);
    }
  };

  const deleteIGALogistics: AppContextValue['deleteIGALogistics'] = async (id) => {
    if (user?.role !== 'admin') {
      showToast('Only store admins can delete IGA logistics entries.', 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'igaLogistics', id));
      showToast('IGA logistics record deleted.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `igaLogistics/${id}`);
    }
  };

  const seedSampleIGAs = async (): Promise<void> => {
    if (!user || !activeStoreId) return;
    if (activeRole !== 'admin') {
      showToast('Only Store Admin can load pre-approved starter TVET IGAs.', 'error');
      return;
    }
    const memberEmails = getActiveMembers();
    const existingIds = new Set(igaUnits.map((u) => u.id));
    const existingLogIds = new Set(igaLogistics.map((l) => l.id));
    const batch = writeBatch(db);
    let ops = 0;

    for (const unit of SAMPLE_IGA_UNITS) {
      const id = makeValidDocId(activeStoreId.slice(0, 12), unit.id);
      if (existingIds.has(id)) continue;
      batch.set(doc(db, 'igaUnits', id), {
        ...unit,
        id,
        storeId: activeStoreId,
        ownerUid: user.uid,
        memberEmails,
        reviewedByEmail: user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      ops++;
    }

    const today = new Date().toISOString().split('T')[0];
    for (const entry of SAMPLE_IGA_LOGISTICS) {
      const id = makeValidDocId(activeStoreId.slice(0, 12), entry.id);
      const mappedIgaId = makeValidDocId(activeStoreId.slice(0, 12), entry.igaId);
      if (existingLogIds.has(id)) continue;
      batch.set(doc(db, 'igaLogistics', id), {
        ...entry,
        id,
        storeId: activeStoreId,
        ownerUid: user.uid,
        memberEmails,
        igaId: mappedIgaId,
        dateRecorded: today,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      ops++;
    }

    if (ops === 0) {
      showToast('Starter departmental IGAs are already loaded.', 'info');
      return;
    }

    try {
      await batch.commit();
      showToast('Starter TVET departmental IGAs & logistics loaded!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'igaUnits');
    }
  };

  const initializeMissingDeptIGAs: AppContextValue['initializeMissingDeptIGAs'] = async (
    departments,
  ) => {
    if (!user || !activeStoreId) return;
    if (activeRole !== 'admin') {
      showToast('Only Store Admin can bulk-initialize missing departments.', 'error');
      return;
    }
    const existingKeys = new Set(igaUnits.map((u) => u.department.trim().toLowerCase()));
    const memberEmails = getActiveMembers();
    const batch = writeBatch(db);
    let ops = 0;

    for (const rawDept of departments) {
      const dept = clampString(rawDept, VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH);
      if (!dept || existingKeys.has(dept.toLowerCase())) continue;
      existingKeys.add(dept.toLowerCase());
      const unitRef = doc(collection(db, 'igaUnits'));
      const newUnit: DepartmentalIGA = {
        id: unitRef.id,
        storeId: activeStoreId,
        ownerUid: user.uid,
        memberEmails,
        department: dept,
        igaName: clampString(`${dept} Departmental IGA Unit`, VALIDATION_LIMITS.MAX_NAME_LENGTH),
        activityType: defaultActivityTypeForDepartment(dept),
        leadTrainer: '',
        status: 'Planned',
        description: clampString(
          `Departmental income-generating activity and logistics unit for ${dept}.`,
          VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH,
        ),
        approvalStatus: 'Approved',
        approvalNotes: 'Initialized by Store Admin.',
        reviewedByEmail: user.email,
        proposalFileName: '',
        proposalDataUrl: '',
        proposalSummary: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      batch.set(unitRef, newUnit);
      ops++;
    }

    if (ops === 0) {
      showToast('All listed departments already have an IGA unit.', 'info');
      return;
    }

    try {
      await batch.commit();
      showToast(`Initialized ${ops} departmental IGA unit(s) as Planned.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'igaUnits');
    }
  };

  const VALID_BUDGET_CATEGORIES: BudgetCategory[] = [
    'Consumables & Training Materials',
    'Tools & Workshop Equipment',
    'Machinery & Capital Assets',
    'IGA Working Capital',
    'Maintenance & Repairs',
    'Other',
  ];

  const sanitizeBudgetLineItems = (rawItems: BudgetLineItem[]): BudgetLineItem[] => {
    const cleaned: BudgetLineItem[] = [];
    for (let idx = 0; idx < Math.min(rawItems.length, VALIDATION_LIMITS.MAX_BUDGET_LINE_ITEMS); idx++) {
      const raw = rawItems[idx];
      const itemName = clampString(raw.itemName, VALIDATION_LIMITS.MAX_NAME_LENGTH);
      if (!itemName) continue;
      const qty = Math.max(1, Math.floor(Number(raw.quantity) || 1));
      const unitCost = Math.max(0, Math.round(Number(raw.estimatedUnitCost) || 0));
      const category: BudgetCategory = VALID_BUDGET_CATEGORIES.includes(raw.category)
        ? raw.category
        : 'Other';
      const id =
        clampString(raw.id, 64) || `line-${idx + 1}-${Math.random().toString(36).slice(2, 7)}`;
      cleaned.push({
        id,
        category,
        itemName,
        unit: clampString(raw.unit, VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
        quantity: qty,
        estimatedUnitCost: unitCost,
        totalCost: qty * unitCost,
        justification: clampString(raw.justification, 200),
      });
    }
    return cleaned;
  };

  const saveDepartmentBudget: AppContextValue['saveDepartmentBudget'] = async (input) => {
    if (!user || !activeStoreId) return false;
    const cleanedItems = sanitizeBudgetLineItems(input.lineItems);
    if (cleanedItems.length === 0) {
      showToast('Add at least one valid line item to save the budget.', 'error');
      return false;
    }

    const financialYear = clampString(
      input.financialYear,
      VALIDATION_LIMITS.MAX_FINANCIAL_YEAR_LENGTH,
    );
    if (financialYear.length < 4) {
      showToast('Enter a valid Financial Year (e.g., 2026/2027).', 'error');
      return false;
    }

    const isHodLocked = activeRole === 'hod' && Boolean(activeDepartment);
    const resolvedDepartment = isHodLocked
      ? clampString(activeDepartment, VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH)
      : clampString(
          input.department || activeDepartment || STANDARD_TVET_DEPARTMENTS[0],
          VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH,
        );

    if (!resolvedDepartment) {
      showToast('Please select a department for this budget.', 'error');
      return false;
    }

    const totalAmount = cleanedItems.reduce((sum, item) => sum + item.totalCost, 0);
    const title =
      clampString(input.title, VALIDATION_LIMITS.MAX_BUDGET_TITLE_LENGTH) ||
      clampString(
        `${resolvedDepartment} FY ${financialYear} Procurement Budget`,
        VALIDATION_LIMITS.MAX_BUDGET_TITLE_LENGTH,
      );
    const notes = clampString(input.notes, VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH);
    const nextStatus: BudgetStatus = input.submitNow ? 'Submitted' : 'Draft';
    const submittedAt = input.submitNow ? new Date().toISOString().slice(0, 40) : '';

    if (input.id) {
      const existing = departmentBudgets.find((b) => b.id === input.id);
      if (!existing) {
        showToast('Budget record could not be found.', 'error');
        return false;
      }
      if (
        isHodLocked &&
        (existing.department || '').trim().toLowerCase() !==
          activeDepartment.trim().toLowerCase()
      ) {
        showToast(`HOD accounts can only edit ${activeDepartment} budgets.`, 'error');
        return false;
      }
      if (existing.status !== 'Draft' && existing.status !== 'Returned') {
        showToast(
          'Only Draft or Returned budgets can be edited. Contact Store Officer or Admin if changes are needed.',
          'error',
        );
        return false;
      }

      try {
        await updateDoc(doc(db, 'departmentBudgets', existing.id), {
          financialYear,
          title,
          lineItems: cleanedItems,
          totalAmount,
          notes,
          status: nextStatus,
          submittedAt: input.submitNow ? submittedAt : existing.submittedAt || '',
          reviewedByEmail: '',
          reviewNotes: '',
          updatedAt: serverTimestamp(),
        });
        showToast(
          input.submitNow
            ? `Submitted ${existing.department} FY ${financialYear} budget to Store Officer & Admin!`
            : `Updated draft budget for ${existing.department}.`,
          'success',
        );
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `departmentBudgets/${existing.id}`);
        return false;
      }
    }

    const budgetRef = doc(collection(db, 'departmentBudgets'));
    const newBudget: DepartmentBudget = {
      id: budgetRef.id,
      storeId: activeStoreId,
      ownerUid: user.uid,
      memberEmails: getActiveMembers(),
      department: resolvedDepartment,
      financialYear,
      title,
      lineItems: cleanedItems,
      totalAmount,
      notes,
      status: nextStatus,
      submittedByEmail: clampString(user.email, VALIDATION_LIMITS.MAX_EMAIL_LENGTH),
      submittedByName:
        clampString(user.displayName || user.email, VALIDATION_LIMITS.MAX_NAME_LENGTH) ||
        user.email,
      submittedAt,
      reviewedByEmail: '',
      reviewNotes: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(budgetRef, newBudget);
      showToast(
        input.submitNow
          ? `FY ${financialYear} budget submitted to Store Officer & Admin!`
          : `Saved FY ${financialYear} budget as Draft.`,
        'success',
      );
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `departmentBudgets/${budgetRef.id}`);
      return false;
    }
  };

  const submitDepartmentBudget: AppContextValue['submitDepartmentBudget'] = async (budgetId) => {
    const existing = departmentBudgets.find((b) => b.id === budgetId);
    if (!existing) {
      showToast('Budget record not found.', 'error');
      return false;
    }
    if (
      activeRole === 'hod' &&
      activeDepartment &&
      (existing.department || '').trim().toLowerCase() !==
        activeDepartment.trim().toLowerCase()
    ) {
      showToast(`HOD accounts can only submit ${activeDepartment} budgets.`, 'error');
      return false;
    }
    if (existing.status !== 'Draft' && existing.status !== 'Returned') {
      showToast('This budget has already been submitted.', 'info');
      return false;
    }

    try {
      await updateDoc(doc(db, 'departmentBudgets', existing.id), {
        status: 'Submitted',
        submittedAt: new Date().toISOString().slice(0, 40),
        reviewedByEmail: '',
        reviewNotes: '',
        updatedAt: serverTimestamp(),
      });
      showToast(
        `${existing.department} FY ${existing.financialYear} budget submitted to Store Officer & Admin!`,
        'success',
      );
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `departmentBudgets/${existing.id}`);
      return false;
    }
  };

  const reviewDepartmentBudget: AppContextValue['reviewDepartmentBudget'] = async (
    budgetId,
    updates,
  ) => {
    if (!user) return false;
    if (activeRole === 'hod') {
      showToast('Only Store Officers or Administrators can review submitted budgets.', 'error');
      return false;
    }
    if (updates.status === 'Approved' && activeRole !== 'admin') {
      showToast(
        'Store Officers can mark budgets as Reviewed or Returned; only Admin can grant final Approval.',
        'error',
      );
      return false;
    }
    const existing = departmentBudgets.find((b) => b.id === budgetId);
    if (!existing) {
      showToast('Budget record not found.', 'error');
      return false;
    }
    if (existing.status !== 'Submitted' && existing.status !== 'Reviewed') {
      showToast('Only Submitted or Reviewed budgets can be updated here.', 'error');
      return false;
    }

    try {
      await updateDoc(doc(db, 'departmentBudgets', existing.id), {
        status: updates.status,
        reviewedByEmail: clampString(user.email, VALIDATION_LIMITS.MAX_EMAIL_LENGTH),
        reviewNotes: clampString(updates.reviewNotes, VALIDATION_LIMITS.MAX_APPROVAL_NOTES_LENGTH),
        updatedAt: serverTimestamp(),
      });
      showToast(
        `Budget marked as ${updates.status} (${existing.department} · FY ${existing.financialYear}).`,
        updates.status === 'Returned' ? 'info' : 'success',
      );
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `departmentBudgets/${existing.id}`);
      return false;
    }
  };

  const deleteDepartmentBudget: AppContextValue['deleteDepartmentBudget'] = async (budgetId) => {
    const existing = departmentBudgets.find((b) => b.id === budgetId);
    if (!existing) return;
    const isAdmin = activeRole === 'admin';
    const isOwnHodDraft =
      activeRole === 'hod' &&
      Boolean(activeDepartment) &&
      (existing.department || '').trim().toLowerCase() ===
        activeDepartment.trim().toLowerCase() &&
      existing.status === 'Draft';

    if (!isAdmin && !isOwnHodDraft) {
      showToast('Only Draft budgets in your department (or Admins) can be deleted.', 'error');
      return;
    }

    try {
      await deleteDoc(doc(db, 'departmentBudgets', budgetId));
      showToast('Budget deleted.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `departmentBudgets/${budgetId}`);
    }
  };

  const updateSettings: AppContextValue['updateSettings'] = async (newSettings) => {
    if (!activeStoreId) return;
    try {
      await updateDoc(doc(db, 'storeSettings', activeStoreId), {
        institutionName:
          clampString(newSettings.institutionName, VALIDATION_LIMITS.MAX_NAME_LENGTH) ||
          DEFAULT_INSTITUTION_NAME,
        logo: sanitizeLogoDataUrl(newSettings.logo),
        updatedAt: serverTimestamp(),
      });
      showToast('Settings saved to cloud!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `storeSettings/${activeStoreId}`);
    }
  };

  const syncMemberEmailsAcrossStore = async (nextEmails: string[]) => {
    if (!activeStoreId) return;
    const bounded = Array.from(new Set([BOOTSTRAPPED_ADMIN_EMAIL, ...nextEmails])).slice(
      0,
      VALIDATION_LIMITS.MAX_MEMBER_EMAILS,
    );

    const targets: Array<{ col: string; id: string }> = [
      ...inventory.map((i) => ({ col: 'inventory', id: i.id })),
      ...assets.map((a) => ({ col: 'assets', id: a.id })),
      ...recipients.map((r) => ({ col: 'recipients', id: r.id })),
      ...issues.map((s) => ({ col: 'issues', id: s.id })),
      ...disposalLog.map((d) => ({ col: 'disposalLog', id: d.id })),
      ...igaUnits.map((u) => ({ col: 'igaUnits', id: u.id })),
      ...igaLogistics.map((g) => ({ col: 'igaLogistics', id: g.id })),
      ...issueRequests.map((rq) => ({ col: 'issueRequests', id: rq.id })),
      ...departmentBudgets.map((b) => ({ col: 'departmentBudgets', id: b.id })),
    ];

    const settingsBatch = writeBatch(db);
    settingsBatch.update(doc(db, 'storeSettings', activeStoreId), {
      memberEmails: bounded,
      updatedAt: serverTimestamp(),
    });
    await settingsBatch.commit();

    // Update all store docs in chunks of 400
    for (let i = 0; i < targets.length; i += 400) {
      const chunk = targets.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.update(doc(db, item.col, item.id), {
          memberEmails: bounded,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  };

  const getCanonicalActiveEmails = useCallback(
    (records: StoreAccessRecord[]): string[] => {
      const activeEmails = records
        .filter((r) => r.status === 'active' && (r.storeId || MAIN_STORE_ID) === MAIN_STORE_ID)
        .map((r) => r.email.trim().toLowerCase())
        .filter(Boolean);
      return Array.from(new Set([BOOTSTRAPPED_ADMIN_EMAIL, ...activeEmails])).slice(
        0,
        VALIDATION_LIMITS.MAX_MEMBER_EMAILS,
      );
    },
    [],
  );

  const addStoreMember: AppContextValue['addStoreMember'] = async (
    rawEmail,
    role,
    department = '',
  ) => {
    if (!user || !user.isBootstrappedAdmin) return;
    const email = rawEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast('Please enter a valid Google email address.', 'error');
      return;
    }
    if (email === BOOTSTRAPPED_ADMIN_EMAIL) {
      showToast('The primary admin email already has full access.', 'info');
      return;
    }
    const cleanDepartment =
      role === 'hod'
        ? clampString(department || STANDARD_TVET_DEPARTMENTS[0], VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH)
        : role === 'officer'
          ? clampString(department, VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH)
          : '';
    if (role === 'hod' && !cleanDepartment) {
      showToast('Please assign a department for this HOD account.', 'error');
      return;
    }
    const currentCanonical = getCanonicalActiveEmails(storeMembers);
    if (
      currentCanonical.length >= VALIDATION_LIMITS.MAX_MEMBER_EMAILS &&
      !currentCanonical.includes(email)
    ) {
      showToast(
        `Maximum of ${VALIDATION_LIMITS.MAX_MEMBER_EMAILS} authorized store members reached.`,
        'error',
      );
      return;
    }

    const accessId = emailToAccessId(email);
    try {
      await setDoc(doc(db, 'storeAccess', accessId), {
        email,
        role,
        department: cleanDepartment,
        status: 'active',
        storeId: MAIN_STORE_ID,
        addedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await syncMemberEmailsAcrossStore([...currentCanonical, email]);
      showToast(
        cleanDepartment
          ? `Authorized ${email} as ${role.toUpperCase()} (${cleanDepartment}).`
          : `Authorized ${email} as ${role.toUpperCase()}.`,
        'success',
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `storeAccess/${accessId}`);
    }
  };

  const updateStoreMember: AppContextValue['updateStoreMember'] = async (record, updates) => {
    if (!user || !user.isBootstrappedAdmin) return;
    const nextRole = updates.role ?? record.role;
    const nextStatus = updates.status ?? record.status;
    const nextDepartment =
      nextRole === 'hod'
        ? clampString(
            updates.department ?? (record.department || STANDARD_TVET_DEPARTMENTS[0]),
            VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH,
          )
        : nextRole === 'officer'
          ? clampString(updates.department ?? (record.department || ''), VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH)
          : '';
    try {
      await updateDoc(doc(db, 'storeAccess', record.id), {
        role: nextRole,
        department: nextDepartment,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      const updatedList = storeMembers.map((m) =>
        m.id === record.id
          ? { ...m, role: nextRole, department: nextDepartment, status: nextStatus }
          : m,
      );
      await syncMemberEmailsAcrossStore(getCanonicalActiveEmails(updatedList));
      showToast(`Updated access for ${record.email}.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `storeAccess/${record.id}`);
    }
  };

  const removeStoreMember: AppContextValue['removeStoreMember'] = async (record) => {
    if (!user || !user.isBootstrappedAdmin) return;
    try {
      await deleteDoc(doc(db, 'storeAccess', record.id));
      const remaining = storeMembers.filter((m) => m.id !== record.id);
      await syncMemberEmailsAcrossStore(getCanonicalActiveEmails(remaining));
      showToast(`Removed ${record.email}.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `storeAccess/${record.id}`);
    }
  };

  const resyncStorePermissions = async (): Promise<void> => {
    if (!user || !user.isBootstrappedAdmin) return;
    try {
      await syncMemberEmailsAcrossStore(getCanonicalActiveEmails(storeMembers));
      showToast('Synced authorized email permissions across all store records.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'storeSettings');
    }
  };

  const demoRecordCount = useMemo(() => {
    const allIds = [
      ...inventory.map((d) => d.id),
      ...assets.map((d) => d.id),
      ...recipients.map((d) => d.id),
      ...issues.map((d) => d.id),
      ...issueLog.map((d) => d.id),
      ...disposalLog.map((d) => d.id),
      ...igaUnits.map((d) => d.id),
      ...igaLogistics.map((d) => d.id),
      ...issueRequests.map((d) => d.id),
      ...departmentBudgets.map((d) => d.id),
    ];
    return allIds.filter((id) => isDemoDocumentId(id)).length;
  }, [
    inventory,
    assets,
    recipients,
    issues,
    issueLog,
    disposalLog,
    igaUnits,
    igaLogistics,
    issueRequests,
    departmentBudgets,
  ]);

  const collectDemoTargets = () => [
    ...issues.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'issues', id: d.id })),
    ...issueLog.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'issueLog', id: d.id })),
    ...disposalLog.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'disposalLog', id: d.id })),
    ...issueRequests.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'issueRequests', id: d.id })),
    ...igaLogistics.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'igaLogistics', id: d.id })),
    ...assets.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'assets', id: d.id })),
    ...inventory.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'inventory', id: d.id })),
    ...recipients.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'recipients', id: d.id })),
    ...igaUnits.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'igaUnits', id: d.id })),
    ...departmentBudgets.filter((d) => isDemoDocumentId(d.id)).map((d) => ({ col: 'departmentBudgets', id: d.id })),
  ];

  const deleteTargetsInChunks = async (targets: Array<{ col: string; id: string }>) => {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
      const chunk = targets.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.delete(doc(db, item.col, item.id));
      }
      await batch.commit();
    }
  };

  const seedSampleData = async (replaceExisting = false): Promise<void> => {
    if (!user || !activeStoreId) return;
    if (activeRole !== 'admin' && !user.isBootstrappedAdmin) {
      showToast('Only a Store Administrator can load institutional demonstration data.', 'error');
      return;
    }
    if (demoRecordCount > 0 && !replaceExisting) {
      showToast(
        'Demonstration data is already loaded. Use Reload Demo Data or Delete Demo Data in Settings.',
        'info',
      );
      return;
    }

    const memberEmails = getActiveMembers();
    const storePrefix = activeStoreId.slice(0, 12);
    const todayDate = new Date();
    const today = todayDate.toISOString().split('T')[0];
    const submittedTimestamp = todayDate.toISOString();
    const addDaysIso = (days: number): string => {
      const target = new Date(todayDate.getTime() + days * 24 * 60 * 60 * 1000);
      return target.toISOString().split('T')[0];
    };

    let currentPath = 'inventory';
    try {
      if (replaceExisting) {
        currentPath = 'delete-old-demo';
        const oldTargets = collectDemoTargets();
        if (oldTargets.length > 0) {
          await deleteTargetsInChunks(oldTargets);
        }
      }

      // Batch 1a: Inventory items (0 cross-doc rule reads)
      currentPath = 'inventory';
      const baseQtyMap = new Map<string, number>();
      const invBatch = writeBatch(db);
      for (const item of SAMPLE_INVENTORY) {
        const id = makeValidDocId(storePrefix, item.id);
        baseQtyMap.set(id, item.quantity);
        const payload: Record<string, unknown> = {
          id,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          name: item.name,
          category: item.category,
          department: item.department,
          type: item.type,
          unit: item.unit,
          quantity: item.quantity,
          isIGA: item.isIGA,
          condition: item.condition,
          isConsumable: item.isConsumable,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if ('purchaseUnit' in item && item.purchaseUnit) {
          payload.purchaseUnit = item.purchaseUnit;
        }
        if ('unitsPerPurchase' in item && typeof item.unitsPerPurchase === 'number') {
          payload.unitsPerPurchase = item.unitsPerPurchase;
        }
        invBatch.set(doc(db, 'inventory', id), payload);
      }
      await invBatch.commit();

      // Batch 1b: Recipients, IGA Units, Department Budgets (0 cross-doc rule reads)
      currentPath = 'recipients/igaUnits/departmentBudgets';
      const metaBatch = writeBatch(db);
      for (const rec of SAMPLE_RECIPIENTS) {
        const id = makeValidDocId(storePrefix, rec.id);
        metaBatch.set(doc(db, 'recipients', id), {
          ...rec,
          id,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      for (const unit of SAMPLE_IGA_UNITS) {
        const id = makeValidDocId(storePrefix, unit.id);
        metaBatch.set(doc(db, 'igaUnits', id), {
          ...unit,
          id,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      for (const budget of SAMPLE_DEPARTMENT_BUDGETS) {
        const id = makeValidDocId(storePrefix, budget.id);
        metaBatch.set(doc(db, 'departmentBudgets', id), {
          id,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          department: budget.department,
          financialYear: budget.financialYear,
          title: budget.title,
          lineItems: budget.lineItems,
          totalAmount: budget.totalAmount,
          notes: budget.notes,
          status: budget.status,
          submittedByEmail: user.email,
          submittedByName: budget.submittedByName,
          submittedAt: budget.status === 'Draft' ? '' : submittedTimestamp,
          reviewedByEmail: budget.reviewedByEmail ? user.email : '',
          reviewNotes: budget.reviewNotes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await metaBatch.commit();

      // Batch 2: Serialized Assets in chunks of 5 (keeps security-rule exists/getAfter reads well under 20/batch)
      currentPath = 'assets';
      const ASSET_CHUNK = 5;
      for (let i = 0; i < SAMPLE_ASSETS.length; i += ASSET_CHUNK) {
        const chunk = SAMPLE_ASSETS.slice(i, i + ASSET_CHUNK);
        const assetBatch = writeBatch(db);
        for (const asset of chunk) {
          const id = makeValidDocId(storePrefix, asset.id);
          const invId = makeValidDocId(storePrefix, asset.inventoryId);
          assetBatch.set(doc(db, 'assets', id), {
            id,
            storeId: activeStoreId,
            ownerUid: user.uid,
            memberEmails,
            inventoryId: invId,
            serialNumber: asset.serialNumber,
            condition: asset.condition,
            status: 'In Stock',
            currentHolderId: '',
            activeIssueLogId: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await assetBatch.commit();
      }

      // Batch 3a: Disposal requests, Issue requests, IGA logistics (small focused batches)
      currentPath = 'disposalLog';
      if (SAMPLE_DISPOSAL_REQUESTS.length > 0) {
        const dispBatch = writeBatch(db);
        for (const disp of SAMPLE_DISPOSAL_REQUESTS) {
          const id = makeValidDocId(storePrefix, disp.id);
          dispBatch.set(doc(db, 'disposalLog', id), {
            id,
            storeId: activeStoreId,
            ownerUid: user.uid,
            memberEmails,
            assetId: makeValidDocId(storePrefix, disp.assetId),
            inventoryId: makeValidDocId(storePrefix, disp.inventoryId),
            method: disp.method,
            itemName: disp.itemName,
            itemCategory: disp.itemCategory,
            status: 'Pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await dispBatch.commit();
      }

      currentPath = 'issueRequests';
      if (SAMPLE_ISSUE_REQUESTS.length > 0) {
        const reqBatch = writeBatch(db);
        for (const req of SAMPLE_ISSUE_REQUESTS) {
          const id = makeValidDocId(storePrefix, req.id);
          reqBatch.set(doc(db, 'issueRequests', id), {
            id,
            storeId: activeStoreId,
            ownerUid: user.uid,
            memberEmails,
            department: req.department,
            requestedByEmail: user.email,
            requestedByName: req.requestedByName,
            inventoryId: makeValidDocId(storePrefix, req.inventoryId),
            itemName: req.itemName,
            quantity: req.quantity,
            unit: req.unit,
            recipientName: req.recipientName,
            usageScope: req.usageScope,
            usageLocation: req.usageLocation,
            requiresGatePass: req.requiresGatePass,
            urgency: req.urgency,
            message: req.message,
            status: 'Pending',
            handledByEmail: '',
            responseMessage: '',
            issueLogId: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await reqBatch.commit();
      }

      currentPath = 'igaLogistics';
      if (SAMPLE_IGA_LOGISTICS.length > 0) {
        const igaLogBatch = writeBatch(db);
        for (const entry of SAMPLE_IGA_LOGISTICS) {
          const id = makeValidDocId(storePrefix, entry.id);
          const mappedIgaId = makeValidDocId(storePrefix, entry.igaId);
          igaLogBatch.set(doc(db, 'igaLogistics', id), {
            ...entry,
            id,
            storeId: activeStoreId,
            ownerUid: user.uid,
            memberEmails,
            igaId: mappedIgaId,
            dateRecorded: today,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await igaLogBatch.commit();
      }

      // Batch 3b: Demo Issue Slips + Stock Movements + Inventory/Asset updates (single writeBatch)
      currentPath = 'issues';
      const issueBatch = writeBatch(db);
      const invNetDelta = new Map<string, { qtyDelta: number; damagedDelta: number }>();

      for (const log of SAMPLE_ISSUE_LOGS) {
        const slipId = makeValidDocId(storePrefix, log.id.replace('sample-issue-', 'sample-slip-'));
        const mappedInvId = makeValidDocId(storePrefix, log.inventoryId);
        const mappedRecId = makeValidDocId(storePrefix, log.recipientId);
        const mappedAssetId = log.assetId ? makeValidDocId(storePrefix, log.assetId) : '';
        const isConsumable = Boolean(log.isConsumable);
        const returnable = !isConsumable;
        const retQty = log.simulateReturn ? log.quantity : 0;
        const dmgQty = log.simulateReturn ? (log.damagedQuantity ?? 0) : 0;
        const restoredQty = log.simulateReturn ? (log.restoredQuantity ?? log.quantity) : 0;

        const slipLine: IssueLine = {
          inventoryId: mappedInvId,
          name: log.itemName,
          qtyIssued: log.quantity,
          qtyReturned: retQty,
          qtyDamaged: dmgQty,
          returnable,
          returnCondition: log.simulateReturn ? (log.returnCondition ?? 'Good') : '',
          returnNote: log.simulateReturn ? (log.returnConditionNotes ?? '') : '',
          unit: log.unit,
          ...(mappedAssetId ? { assetId: mappedAssetId, serialNumber: log.serialNumber } : {}),
          ...(!isConsumable ? { returnDate: addDaysIso(log.daysUntilReturn || 7) } : {}),
          ...(log.simulateReturn ? { dateReturned: today } : {}),
        };

        const slipStatus: IssueSlipStatus =
          !returnable || log.simulateReturn ? 'closed' : 'open';

        issueBatch.set(doc(db, 'issues', slipId), {
          id: slipId,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          recipient: log.recipientName,
          recipientId: mappedRecId,
          recipientName: log.recipientName,
          dateIssued: today,
          scope: log.usageScope,
          usageLocation: log.usageLocation,
          requiresGatePass: log.requiresGatePass,
          gatePassNumber: log.gatePassNumber,
          status: slipStatus,
          issuedBy: user.email.toLowerCase(),
          lines: [slipLine],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        issueBatch.set(doc(collection(db, 'stockMovements')), {
          storeId: activeStoreId,
          type: 'ISSUE' as StockMovementType,
          inventoryId: mappedInvId,
          qty: log.quantity,
          issueId: slipId,
          userId: user.uid,
          createdAt: serverTimestamp(),
        });

        if (mappedAssetId) {
          issueBatch.update(doc(db, 'assets', mappedAssetId), {
            status: 'Issued',
            currentHolderId: mappedRecId,
            activeIssueLogId: slipId,
            updatedAt: serverTimestamp(),
          });
        } else {
          const prev = invNetDelta.get(mappedInvId) || { qtyDelta: 0, damagedDelta: 0 };
          invNetDelta.set(mappedInvId, {
            qtyDelta: roundStockQuantity(prev.qtyDelta - log.quantity + restoredQty),
            damagedDelta: roundStockQuantity(prev.damagedDelta + dmgQty),
          });
        }

        if (log.simulateReturn) {
          if (restoredQty > 0) {
            issueBatch.set(doc(collection(db, 'stockMovements')), {
              storeId: activeStoreId,
              type: 'RETURN' as StockMovementType,
              inventoryId: mappedInvId,
              qty: restoredQty,
              issueId: slipId,
              userId: user.uid,
              createdAt: serverTimestamp(),
            });
          }
          if (dmgQty > 0) {
            issueBatch.set(doc(collection(db, 'stockMovements')), {
              storeId: activeStoreId,
              type: 'DAMAGED' as StockMovementType,
              inventoryId: mappedInvId,
              qty: dmgQty,
              issueId: slipId,
              userId: user.uid,
              createdAt: serverTimestamp(),
            });
          }
        }
      }

      for (const [mappedInvId, delta] of invNetDelta.entries()) {
        const baseQty = baseQtyMap.get(mappedInvId) ?? 0;
        const nextQty = Math.max(0, roundStockQuantity(baseQty + delta.qtyDelta));
        issueBatch.update(doc(db, 'inventory', mappedInvId), {
          quantity: nextQty,
          ...(delta.damagedDelta > 0 ? { damagedQty: delta.damagedDelta } : {}),
          updatedAt: serverTimestamp(),
        });
      }

      issueBatch.update(doc(db, 'storeSettings', activeStoreId), {
        seeded: true,
        updatedAt: serverTimestamp(),
      });

      await issueBatch.commit();
      showToast(
        `Demonstration dataset loaded across all ${STANDARD_TVET_DEPARTMENTS.length} departments and offices! Remove demo records anytime from Settings.`,
        'success',
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, currentPath);
    }
  };

  const refreshDemonstrationData = async (): Promise<void> => {
    await seedSampleData(true);
  };

  const deleteDemonstrationData = async (): Promise<void> => {
    if (!user || !activeStoreId) return;
    if (activeRole !== 'admin' && !user.isBootstrappedAdmin) {
      showToast('Only a Store Administrator can delete demonstration data.', 'error');
      return;
    }

    const targets = collectDemoTargets();

    try {
      await deleteTargetsInChunks(targets);

      await updateDoc(doc(db, 'storeSettings', activeStoreId), {
        seeded: false,
        updatedAt: serverTimestamp(),
      });

      if (targets.length > 0) {
        showToast(
          `Deleted ${targets.length} demonstration record(s). All real institutional records remain intact.`,
          'success',
        );
      } else {
        showToast('No demonstration records found. Demonstration mode cleared.', 'info');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'inventory');
    }
  };

  const importRecordsIntoFirestore = async (parsedData: any): Promise<void> => {
    if (!user || !activeStoreId) return;
    const memberEmails = getActiveMembers();
    const invIdMap = new Map<string, string>();
    const recIdMap = new Map<string, string>();

    const batch1 = writeBatch(db);
    let ops = 0;

    if (Array.isArray(parsedData.inventory)) {
      for (const raw of parsedData.inventory) {
        const newId = doc(collection(db, 'inventory')).id;
        invIdMap.set(String(raw.id), newId);
        batch1.set(doc(db, 'inventory', newId), {
          id: newId,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          name: clampString(raw.name, VALIDATION_LIMITS.MAX_NAME_LENGTH) || 'Imported Item',
          category: clampString(raw.category, VALIDATION_LIMITS.MAX_CATEGORY_LENGTH) || 'General',
          department: clampString(raw.department || '', VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH),
          type: raw.type === 'Asset' ? 'Asset' : 'Consumable',
          unit: clampString(raw.unit || 'Pcs', VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
          quantity:
            raw.type === 'Asset' ? 0 : Math.max(0, Math.floor(Number(raw.quantity) || 0)),
          isIGA: Boolean(raw.isIGA),
          condition: clampString(raw.condition || 'N/A', 40),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        ops++;
      }
    }

    if (Array.isArray(parsedData.recipients)) {
      for (const raw of parsedData.recipients) {
        const newId = doc(collection(db, 'recipients')).id;
        recIdMap.set(String(raw.id), newId);
        const validTypes: RecipientType[] = ['Trainee', 'Trainer', 'Staff', 'Department', 'Other'];
        const recType: RecipientType = validTypes.includes(raw.type) ? raw.type : 'Other';
        batch1.set(doc(db, 'recipients', newId), {
          id: newId,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          name: clampString(raw.name, VALIDATION_LIMITS.MAX_NAME_LENGTH) || 'Recipient',
          type: recType,
          regNumber: clampString(raw.regNumber || '', VALIDATION_LIMITS.MAX_REG_NUMBER_LENGTH),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        ops++;
      }
    }

    if (Array.isArray(parsedData.assets)) {
      for (const raw of parsedData.assets) {
        const mappedInvId = invIdMap.get(String(raw.inventoryId));
        if (!mappedInvId) continue;
        const newId = doc(collection(db, 'assets')).id;
        const cond: AssetCondition =
          raw.condition === 'Serviceable' || raw.condition === 'Obsolete' ? raw.condition : 'Good';
        batch1.set(doc(db, 'assets', newId), {
          id: newId,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          inventoryId: mappedInvId,
          serialNumber:
            clampString(raw.serialNumber, VALIDATION_LIMITS.MAX_SERIAL_LENGTH) || newId,
          condition: cond,
          status: 'In Stock',
          currentHolderId: '',
          activeIssueLogId: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        ops++;
      }
    }

    const igaIdMap = new Map<string, string>();
    if (Array.isArray(parsedData.igaUnits)) {
      const validActivities: IGAActivityType[] = [
        'Manufacturing',
        'Services',
        'Agriculture',
        'Catering',
        'Retail',
        'Other',
      ];
      const validStatuses: IGAUnitStatus[] = ['Active', 'Planned', 'Paused'];
      const validApprovalStatuses: IGAApprovalStatus[] = ['Pending', 'Approved', 'Rejected'];
      for (const raw of parsedData.igaUnits) {
        const newId = doc(collection(db, 'igaUnits')).id;
        igaIdMap.set(String(raw.id), newId);
        const approvalStatus: IGAApprovalStatus =
          activeRole === 'admin'
            ? validApprovalStatuses.includes(raw.approvalStatus)
              ? raw.approvalStatus
              : 'Approved'
            : 'Pending';
        batch1.set(doc(db, 'igaUnits', newId), {
          id: newId,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          department: clampString(raw.department || 'General', VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH) || 'General',
          igaName: clampString(raw.igaName || 'Departmental IGA', VALIDATION_LIMITS.MAX_NAME_LENGTH) || 'Departmental IGA',
          activityType: validActivities.includes(raw.activityType) ? raw.activityType : 'Other',
          leadTrainer: clampString(raw.leadTrainer || '', VALIDATION_LIMITS.MAX_NAME_LENGTH),
          status: validStatuses.includes(raw.status) ? raw.status : 'Active',
          description: clampString(raw.description || '', VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH),
          approvalStatus,
          approvalNotes: clampString(raw.approvalNotes || '', VALIDATION_LIMITS.MAX_APPROVAL_NOTES_LENGTH),
          reviewedByEmail: clampString(
            raw.reviewedByEmail || (approvalStatus === 'Approved' ? user.email : ''),
            VALIDATION_LIMITS.MAX_EMAIL_LENGTH,
          ),
          proposalFileName: clampString(raw.proposalFileName || '', VALIDATION_LIMITS.MAX_PROPOSAL_FILE_NAME_LENGTH),
          proposalDataUrl:
            typeof raw.proposalDataUrl === 'string' &&
            raw.proposalDataUrl.length <= VALIDATION_LIMITS.MAX_PROPOSAL_DATA_URL_LENGTH
              ? raw.proposalDataUrl
              : '',
          proposalLink: sanitizeProposalLink(raw.proposalLink),
          proposalSummary: clampString(raw.proposalSummary || '', VALIDATION_LIMITS.MAX_PROPOSAL_SUMMARY_LENGTH),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        ops++;
      }
    }

    if (Array.isArray(parsedData.igaLogistics)) {
      const validEntryTypes: IGALogisticsType[] = [
        'Store Requisition',
        'Direct Purchase',
        'Production Output',
        'Sales Revenue',
        'Delivery Dispatch',
      ];
      const validDirections: IGADirection[] = ['Inflow', 'Outflow', 'Internal'];
      const validDispatch: IGADispatchStatus[] = ['Logged', 'In Transit', 'Delivered', 'Completed'];
      for (const raw of parsedData.igaLogistics) {
        const mappedIgaId = igaIdMap.get(String(raw.igaId));
        if (!mappedIgaId) continue;
        const newId = doc(collection(db, 'igaLogistics')).id;
        const qty = Math.max(1, Math.floor(Number(raw.quantity) || 1));
        const unitAmt = Math.max(0, Math.round(Number(raw.unitAmount) || 0));
        const totalAmt = Math.max(0, Math.round(Number(raw.totalAmount) || qty * unitAmt));
        batch1.set(doc(db, 'igaLogistics', newId), {
          id: newId,
          storeId: activeStoreId,
          ownerUid: user.uid,
          memberEmails,
          igaId: mappedIgaId,
          department: clampString(raw.department || 'General', VALIDATION_LIMITS.MAX_DEPARTMENT_LENGTH) || 'General',
          igaName: clampString(raw.igaName || 'Departmental IGA', VALIDATION_LIMITS.MAX_NAME_LENGTH) || 'Departmental IGA',
          entryType: validEntryTypes.includes(raw.entryType) ? raw.entryType : 'Direct Purchase',
          inventoryId: '',
          description: clampString(raw.description || 'Imported entry', VALIDATION_LIMITS.MAX_DISPOSAL_ITEM_NAME_LENGTH) || 'Imported entry',
          quantity: qty,
          unit: clampString(raw.unit || 'Pcs', VALIDATION_LIMITS.MAX_UNIT_LENGTH) || 'Pcs',
          unitAmount: unitAmt,
          totalAmount: totalAmt,
          direction: validDirections.includes(raw.direction) ? raw.direction : 'Internal',
          dispatchStatus: validDispatch.includes(raw.dispatchStatus) ? raw.dispatchStatus : 'Logged',
          destinationOrClient: clampString(raw.destinationOrClient || '', VALIDATION_LIMITS.MAX_NAME_LENGTH),
          dateRecorded: clampString(raw.dateRecorded || new Date().toISOString().split('T')[0], 40),
          notes: clampString(raw.notes || '', VALIDATION_LIMITS.MAX_NOTES_LENGTH),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        ops++;
      }
    }

    if (parsedData.settings && parsedData.settings.institutionName) {
      batch1.update(doc(db, 'storeSettings', activeStoreId), {
        institutionName:
          clampString(
            parsedData.settings.institutionName,
            VALIDATION_LIMITS.MAX_NAME_LENGTH,
          ) || DEFAULT_INSTITUTION_NAME,
        logo: sanitizeLogoDataUrl(parsedData.settings.logo),
        updatedAt: serverTimestamp(),
      });
      ops++;
    }

    if (ops > 0) {
      await batch1.commit();
    }
  };

  const migrateLocalStorageData = async (): Promise<void> => {
    try {
      const payload = {
        inventory: JSON.parse(localStorage.getItem('inventory') || '[]'),
        assets: JSON.parse(localStorage.getItem('assets') || '[]'),
        recipients: JSON.parse(localStorage.getItem('recipients') || '[]'),
        settings: JSON.parse(localStorage.getItem('settings') || 'null'),
      };
      await importRecordsIntoFirestore(payload);
      localStorage.removeItem('inventory');
      localStorage.removeItem('assets');
      localStorage.removeItem('recipients');
      localStorage.removeItem('issueLog');
      localStorage.removeItem('disposalLog');
      localStorage.removeItem('settings');
      setHasLocalBackupData(false);
      showToast('Local browser data migrated to Firestore!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'inventory');
    }
  };

  const importData: AppContextValue['importData'] = async (rawJson) => {
    try {
      const parsed = JSON.parse(rawJson);
      await importRecordsIntoFirestore(parsed);
      showToast('Backup restored to Firestore!', 'success');
    } catch (err) {
      console.error('Failed to import data:', err);
      showToast('Failed to import backup. Check JSON format or permissions.', 'error');
    }
  };

  const scopedCollections = useMemo(() => {
    if (activeRole !== 'hod' || !activeDepartment) {
      return {
        inventory,
        assets,
        recipients,
        issues,
        stockMovements,
        issueLog,
        disposalLog,
        igaUnits,
        igaLogistics,
        issueRequests,
        departmentBudgets: departmentBudgets.filter((b) => b.status !== 'Draft'),
      };
    }
    const deptKey = activeDepartment.trim().toLowerCase();
    const deptInventory = inventory.filter(
      (i) => (i.department || '').trim().toLowerCase() === deptKey,
    );
    const deptInventoryIds = new Set(deptInventory.map((i) => i.id));
    const deptAssets = assets.filter((a) => deptInventoryIds.has(a.inventoryId));
    const deptIssues = issues.filter((s) =>
      s.lines.some((l) => deptInventoryIds.has(l.inventoryId)),
    );
    const deptIssueIds = new Set(deptIssues.map((s) => s.id));
    const deptStockMovements = stockMovements.filter(
      (m) => deptInventoryIds.has(m.inventoryId) || deptIssueIds.has(m.issueId),
    );
    const deptIssueLog = issueLog.filter((l) => deptInventoryIds.has(l.inventoryId));
    const deptDisposalLog = disposalLog.filter((d) => deptInventoryIds.has(d.inventoryId));
    const deptRecipientIds = new Set([
      ...deptIssues.map((s) => s.recipientId).filter((id): id is string => Boolean(id)),
      ...deptIssueLog.map((l) => l.recipientId),
    ]);
    const deptRecipients = recipients.filter((r) => deptRecipientIds.has(r.id));
    const deptIgaUnits = igaUnits.filter(
      (u) => (u.department || '').trim().toLowerCase() === deptKey,
    );
    const deptIgaLogistics = igaLogistics.filter(
      (l) => (l.department || '').trim().toLowerCase() === deptKey,
    );
    const deptIssueRequests = issueRequests.filter(
      (r) => (r.department || '').trim().toLowerCase() === deptKey,
    );
    const deptBudgets = departmentBudgets.filter(
      (b) => (b.department || '').trim().toLowerCase() === deptKey,
    );

    return {
      inventory: deptInventory,
      assets: deptAssets,
      recipients: deptRecipients,
      issues: deptIssues,
      stockMovements: deptStockMovements,
      issueLog: deptIssueLog,
      disposalLog: deptDisposalLog,
      igaUnits: deptIgaUnits,
      igaLogistics: deptIgaLogistics,
      issueRequests: deptIssueRequests,
      departmentBudgets: deptBudgets,
    };
  }, [
    activeRole,
    activeDepartment,
    inventory,
    assets,
    recipients,
    issues,
    stockMovements,
    issueLog,
    disposalLog,
    igaUnits,
    igaLogistics,
    issueRequests,
    departmentBudgets,
  ]);

  const value: AppContextValue = {
    inventory: scopedCollections.inventory,
    assets: scopedCollections.assets,
    recipients: scopedCollections.recipients,
    issues: scopedCollections.issues,
    stockMovements: scopedCollections.stockMovements,
    issueLog: scopedCollections.issueLog,
    disposalLog: scopedCollections.disposalLog,
    igaUnits: scopedCollections.igaUnits,
    igaLogistics: scopedCollections.igaLogistics,
    issueRequests: scopedCollections.issueRequests,
    departmentBudgets: scopedCollections.departmentBudgets,
    settings,
    storeMembers,
    user,
    activeRole,
    activeDepartment,
    loginIntent,
    authReady,
    dataLoading,
    accessState,
    activeStoreId,
    isOnline,
    hasLocalBackupData,
    signInWithGoogle,
    switchDeskView,
    recheckAccess,
    handleLogout,
    addItem,
    updateItem,
    updateAsset,
    issueItem,
    issueBulkItems,
    returnIssueSlip,
    createIssueRequest,
    resolveIssueRequest,
    addRecipient,
    updateRecipient,
    deleteRecipient,
    addDisposalRequest,
    updateDisposalStatus,
    addIGAUnit,
    updateIGAUnit,
    reviewIGAUnit,
    deleteIGAUnit,
    addIGALogistics,
    updateIGALogisticsStatus,
    deleteIGALogistics,
    seedSampleIGAs,
    initializeMissingDeptIGAs,
    saveDepartmentBudget,
    submitDepartmentBudget,
    reviewDepartmentBudget,
    deleteDepartmentBudget,
    updateSettings,
    addStoreMember,
    updateStoreMember,
    removeStoreMember,
    resyncStorePermissions,
    demoRecordCount,
    seedSampleData,
    refreshDemonstrationData,
    deleteDemonstrationData,
    migrateLocalStorageData,
    importData,
    showToast,
  };

  return (
    <AppContext.Provider value={value}>
      {toast && (
        <div
          className={`fixed top-5 right-5 ${
            toast.type === 'success'
              ? 'bg-green-500'
              : toast.type === 'error'
                ? 'bg-red-500'
                : 'bg-blue-500'
          } text-white py-2 px-4 rounded-lg shadow-lg z-50 animate-fade-in-down flex items-center space-x-3`}
        >
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-white/80 hover:text-white">
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}
      {children}
    </AppContext.Provider>
  );
};
