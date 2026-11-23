import React, { useState } from 'react';
import {
  DEFAULT_INSTITUTION_NAME,
  ERTVC_BUILDING_PATH,
  ERTVC_LOGO_PATH,
} from '../utils/logo';
import {
  isValidLoginUsername,
  isValidPinFormat,
  normalizeLoginUsername,
} from '../utils/authPin';

interface NeumorphicLoginProps {
  onGoogleSignIn: (credentials: { username: string; pin: string }) => Promise<void>;
}

export const NeumorphicLoginScreen: React.FC<NeumorphicLoginProps> = ({ onGoogleSignIn }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [formError, setFormError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUser = normalizeLoginUsername(username);
    const cleanPin = pin.trim();

    if (!isValidLoginUsername(cleanUser)) {
      setFormError('Enter your admin-assigned username (e.g. hod, officer, or admin).');
      return;
    }
    if (!isValidPinFormat(cleanPin)) {
      setFormError('Enter your 4–8 digit numeric access PIN.');
      return;
    }

    setFormError('');
    setSigningIn(true);
    try {
      await onGoogleSignIn({ username: cleanUser, pin: cleanPin });
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#e7eef6] flex items-center justify-center p-4 sm:p-6">
      <img
        src={ERTVC_BUILDING_PATH}
        alt="Eldama Ravine Technical and Vocational College Campus"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none select-none"
      />
      <div className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-gradient-to-br from-sky-300/50 to-white/70 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-24 w-96 h-96 rounded-full bg-gradient-to-tl from-sky-400/35 via-red-200/25 to-white/80 blur-2xl" />
      <div className="pointer-events-none absolute top-1/4 right-12 w-32 h-32 rounded-full bg-[#e7eef6] shadow-[14px_14px_28px_#c9d4e2,-14px_-14px_28px_#ffffff] hidden lg:block" />
      <div className="pointer-events-none absolute bottom-1/4 left-12 w-24 h-24 rounded-full bg-[#e7eef6] shadow-[12px_12px_24px_#c9d4e2,-12px_-12px_24px_#ffffff] hidden lg:block" />

      <div className="relative z-10 w-full max-w-[460px] [perspective:1400px]">
        <div
          className={`relative w-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [transform-style:preserve-3d] motion-reduce:transition-none ${
            isFlipped ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          {/* FRONT FACE: Username + PIN + Google Sign-In */}
          <div className="w-full rounded-3xl bg-[#ecf2f9] p-7 sm:p-9 shadow-[18px_18px_38px_#c7d2e0,-18px_-18px_38px_#ffffff] [backface-visibility:hidden] border border-white/60">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-[#ecf2f9] shadow-[8px_8px_18px_#c7d2e0,-8px_-8px_18px_#ffffff] flex items-center justify-center p-2 mb-4 border border-white/70">
                <img
                  src={ERTVC_LOGO_PATH}
                  alt="ERTVC Official Crest"
                  referrerPolicy="no-referrer"
                  className="w-full h-full rounded-full object-contain bg-white p-0.5"
                />
              </div>

              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700 mb-1">
                Eldama Ravine TVC SMS
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Authorized Store Sign In
              </h1>
              <p className="text-sm font-semibold text-sky-700 mt-1 text-balance">
                {DEFAULT_INSTITUTION_NAME}
              </p>
              <p className="text-xs font-medium text-red-600 mt-0.5">
                Technology for Sustainable Development
              </p>
            </div>

            <form onSubmit={handleSignIn} className="mt-6 space-y-3.5" noValidate>
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-semibold text-slate-600 mb-1.5"
                >
                  Username
                </label>
                <div className="relative">
                  <i className="fas fa-user absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    maxLength={40}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (formError) setFormError('');
                    }}
                    placeholder="e.g. hod, officer, or admin"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-[inset_2px_2px_5px_#e2e8f0] focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-pin"
                  className="block text-xs font-semibold text-slate-600 mb-1.5"
                >
                  Access PIN (4–8 digits)
                </label>
                <div className="relative">
                  <i className="fas fa-key absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
                  <input
                    id="login-pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="current-password"
                    maxLength={8}
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                      if (formError) setFormError('');
                    }}
                    placeholder="Enter your numeric PIN"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 py-2.5 text-sm font-mono tracking-widest text-slate-900 shadow-[inset_2px_2px_5px_#e2e8f0] focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((prev) => !prev)}
                    aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center"
                  >
                    <i className={`fas ${showPin ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                  </button>
                </div>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-medium text-red-700 flex items-start gap-2"
                >
                  <i className="fas fa-circle-exclamation mt-0.5 shrink-0"></i>
                  <span>{formError}</span>
                </div>
              )}

              <div className="rounded-2xl bg-[#e4ecf5] px-4 py-3 shadow-[inset_4px_4px_9px_#c7d2e0,inset_-4px_-4px_9px_#ffffff] text-xs text-slate-600 leading-relaxed">
                Your <strong>Username</strong>, <strong>PIN</strong>, and{' '}
                <strong>Google Gmail</strong> must all match the role record assigned by the Store
                Administrator.
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#0284c7] to-[#0369a1] hover:from-[#0369a1] hover:to-[#0284c7] text-white font-semibold text-sm shadow-[8px_8px_20px_rgba(2,132,199,0.32),-6px_-6px_16px_#ffffff] transition-all active:scale-[0.99] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
              >
                <i className="fab fa-google text-base"></i>
                <span>{signingIn ? 'Verifying with Google...' : 'Verify & Sign in with Google'}</span>
              </button>
            </form>

            <p className="mt-3 text-center text-[11px] font-medium text-slate-500 flex items-center justify-center gap-1.5">
              <i className="fas fa-shield-halved text-sky-600"></i>
              <span>3-Factor Verification · Admin-Assigned Access Only</span>
            </p>

            <div className="mt-5 pt-4 border-t border-slate-200/70 flex flex-col items-center gap-2.5">
              <span className="text-xs text-slate-500">How store access works</span>
              <button
                type="button"
                onClick={() => setIsFlipped(true)}
                aria-label="Open workspace access policy"
                className="w-11 h-11 rounded-full bg-[#ecf2f9] text-sky-600 hover:text-red-600 shadow-[6px_6px_14px_#c7d2e0,-6px_-6px_14px_#ffffff] active:shadow-[inset_3px_3px_8px_#c7d2e0,inset_-3px_-3px_8px_#ffffff] flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                <i className="fas fa-info text-sm"></i>
              </button>
            </div>
          </div>

          {/* BACK FACE: Access Policy */}
          <div className="absolute inset-0 w-full rounded-3xl bg-[#ecf2f9] p-7 sm:p-9 shadow-[18px_18px_38px_#c7d2e0,-18px_-18px_38px_#ffffff] [backface-visibility:hidden] [transform:rotateY(180deg)] border border-white/60 flex flex-col justify-between">
            <div>
              <div className="relative h-28 rounded-2xl overflow-hidden mb-5 shadow-[6px_6px_14px_#c7d2e0,-6px_-6px_14px_#ffffff]">
                <img
                  src={ERTVC_BUILDING_PATH}
                  alt="Eldama Ravine Technical and Vocational College Building"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/35 to-transparent flex items-end p-3.5">
                  <div>
                    <p className="text-[11px] font-medium text-sky-300">Procurement &amp; Stores</p>
                    <p className="text-sm font-display font-bold text-white leading-tight">
                      {DEFAULT_INSTITUTION_NAME}
                    </p>
                  </div>
                </div>
              </div>

              <h2 className="font-display text-xl font-bold text-slate-900 text-center">
                Authorized Access Policy
              </h2>
              <p className="text-xs text-slate-500 text-center mt-1">
                Only the Store Administrator can add login emails and assign roles.
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-[#e4ecf5] px-4 py-3 shadow-[inset_4px_4px_9px_#c7d2e0,inset_-4px_-4px_9px_#ffffff] text-xs text-slate-700">
                  <p className="font-semibold text-slate-900 mb-1">
                    01. Admin-Only Email &amp; Role Setup
                  </p>
                  <p>
                    The Administrator registers your Gmail, assigns your role (Officer, HOD +
                    Department, or Admin), and issues your Username &amp; PIN under{' '}
                    <strong>Settings → Team Access</strong>.
                  </p>
                </div>
                <div className="rounded-2xl bg-[#e4ecf5] px-4 py-3 shadow-[inset_4px_4px_9px_#c7d2e0,inset_-4px_-4px_9px_#ffffff] text-xs text-slate-700">
                  <p className="font-semibold text-slate-900 mb-1">
                    02. Strict 3-Part Credential Match
                  </p>
                  <p>
                    Access is denied automatically unless your verified Google Gmail, Username, and
                    salted PIN all match an active admin record.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center gap-2">
              <span className="text-xs text-slate-500">Return to login fields</span>
              <button
                type="button"
                onClick={() => setIsFlipped(false)}
                aria-label="Return to sign-in face"
                className="w-11 h-11 rounded-full bg-[#ecf2f9] text-sky-600 hover:text-red-600 shadow-[6px_6px_14px_#c7d2e0,-6px_-6px_14px_#ffffff] flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                <i className="fas fa-arrow-left text-sm"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PinUnlockProps {
  userEmail: string;
  errorMessage?: string;
  lockoutSeconds?: number;
  onVerifyCredentials: (credentials: { username: string; pin: string }) => Promise<void>;
  onLogout: () => Promise<void>;
}

export const NeumorphicPinUnlockScreen: React.FC<PinUnlockProps> = ({
  userEmail,
  errorMessage,
  lockoutSeconds = 0,
  onVerifyCredentials,
  onLogout,
}) => {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [localError, setLocalError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    const cleanUser = normalizeLoginUsername(username);
    const cleanPin = pin.trim();
    if (!isValidLoginUsername(cleanUser)) {
      setLocalError('Enter your assigned username (e.g. hod, officer, or admin).');
      return;
    }
    if (!isValidPinFormat(cleanPin)) {
      setLocalError('Enter your 4–8 digit numeric PIN.');
      return;
    }

    setLocalError('');
    setVerifying(true);
    try {
      await onVerifyCredentials({ username: cleanUser, pin: cleanPin });
    } finally {
      setVerifying(false);
    }
  };

  const displayError = localError || errorMessage;

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#e7eef6] flex items-center justify-center p-4 sm:p-6">
      <img
        src={ERTVC_BUILDING_PATH}
        alt="Eldama Ravine Technical and Vocational College"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none"
      />
      <div className="relative z-10 max-w-md w-full rounded-3xl bg-[#ecf2f9] p-7 sm:p-8 shadow-[18px_18px_38px_#c7d2e0,-18px_-18px_38px_#ffffff] border border-white/60 space-y-5">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-3 rounded-full bg-[#ecf2f9] shadow-[8px_8px_18px_#c7d2e0,-8px_-8px_18px_#ffffff] flex items-center justify-center p-2">
            <img
              src={ERTVC_LOGO_PATH}
              alt="ERTVC Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full rounded-full object-contain bg-white"
            />
            <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-white text-xs shadow-md">
              <i className="fas fa-key"></i>
            </span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Verify Username &amp; PIN
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Google account verified as{' '}
            <span className="font-semibold text-slate-900">{userEmail}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
          <div>
            <label htmlFor="unlock-username" className="block text-xs font-semibold text-slate-600 mb-1">
              Username
            </label>
            <input
              id="unlock-username"
              type="text"
              autoComplete="username"
              maxLength={40}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (localError) setLocalError('');
              }}
              placeholder="e.g. hod, officer, or admin"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-[inset_2px_2px_5px_#e2e8f0] focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 focus:outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="unlock-pin" className="block text-xs font-semibold text-slate-600 mb-1">
              Access PIN
            </label>
            <div className="relative">
              <input
                id="unlock-pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={8}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                  if (localError) setLocalError('');
                }}
                placeholder="4–8 digit PIN"
                className="w-full rounded-xl border border-slate-200 bg-white pl-3.5 pr-10 py-2.5 text-sm font-mono tracking-widest text-slate-900 shadow-[inset_2px_2px_5px_#e2e8f0] focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPin((prev) => !prev)}
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <i className={`fas ${showPin ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
              </button>
            </div>
          </div>

          {displayError && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-medium text-red-700 flex items-start gap-2"
            >
              <i className="fas fa-triangle-exclamation mt-0.5 shrink-0"></i>
              <span>{displayError}</span>
            </div>
          )}

          {lockoutSeconds > 0 && (
            <p className="text-xs font-semibold text-amber-700 text-center">
              Too many failed attempts. Wait {lockoutSeconds}s before retrying.
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="submit"
              disabled={verifying || lockoutSeconds > 0}
              className="flex-1 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white font-semibold py-3 px-4 rounded-2xl shadow-[6px_6px_14px_rgba(2,132,199,0.28),-4px_-4px_12px_#ffffff] hover:opacity-95 disabled:opacity-60 text-sm flex items-center justify-center gap-2"
            >
              <i className={`fas ${verifying ? 'fa-spinner fa-spin' : 'fa-unlock-keyhole'}`}></i>
              <span>{verifying ? 'Checking...' : 'Verify & Unlock'}</span>
            </button>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="flex-1 bg-[#ecf2f9] hover:bg-white text-slate-700 font-semibold py-3 px-4 rounded-2xl shadow-[6px_6px_14px_#c7d2e0,-6px_-6px_14px_#ffffff] text-sm transition-colors flex items-center justify-center gap-2"
            >
              <i className="fas fa-arrow-right-from-bracket"></i>
              <span>Switch Email</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AdminBootstrapPinProps {
  userEmail: string;
  onSaveAdminCredentials: (credentials: { username: string; pin: string }) => Promise<void>;
  onLogout: () => Promise<void>;
}

export const NeumorphicAdminBootstrapPinScreen: React.FC<AdminBootstrapPinProps> = ({
  userEmail,
  onSaveAdminCredentials,
  onLogout,
}) => {
  const [username, setUsername] = useState('admin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = normalizeLoginUsername(username);
    const cleanPin = pin.trim();
    if (!isValidLoginUsername(cleanUser)) {
      setError('Username must be 2–40 lowercase letters, numbers, dots, underscores, or hyphens.');
      return;
    }
    if (!isValidPinFormat(cleanPin)) {
      setError('Admin PIN must be 4–8 digits.');
      return;
    }
    if (cleanPin !== confirmPin.trim()) {
      setError('PIN and Confirm PIN do not match.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      await onSaveAdminCredentials({ username: cleanUser, pin: cleanPin });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#e7eef6] flex items-center justify-center p-4 sm:p-6">
      <img
        src={ERTVC_BUILDING_PATH}
        alt="Eldama Ravine Technical and Vocational College"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none"
      />
      <div className="relative z-10 max-w-md w-full rounded-3xl bg-[#ecf2f9] p-7 sm:p-8 shadow-[18px_18px_38px_#c7d2e0,-18px_-18px_38px_#ffffff] border border-white/60 space-y-5">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-sky-600 text-white flex items-center justify-center text-2xl shadow-lg">
            <i className="fas fa-user-shield"></i>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            First-Run Admin PIN Setup
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Signed in as Master Admin{' '}
            <span className="font-mono font-semibold text-slate-900">{userEmail}</span>
          </p>
        </div>

        <div className="rounded-2xl bg-[#e4ecf5] p-3.5 shadow-[inset_4px_4px_9px_#c7d2e0,inset_-4px_-4px_9px_#ffffff] text-xs text-slate-700 leading-relaxed">
          Set your Master Admin <strong>Username</strong> and <strong>PIN</strong> once. On all future
          logins, your Username, PIN, and Google account must match to unlock the store.
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="setup-admin-user" className="block text-xs font-semibold text-slate-600 mb-1">
              Admin Username
            </label>
            <input
              id="setup-admin-user"
              type="text"
              maxLength={40}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-[inset_2px_2px_5px_#e2e8f0] focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 focus:outline-none"
              required
            />
          </div>
          <div>
            <label htmlFor="setup-admin-pin" className="block text-xs font-semibold text-slate-600 mb-1">
              Create Admin PIN (4–8 digits)
            </label>
            <div className="relative">
              <input
                id="setup-admin-pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Enter 4–8 digit PIN"
                className="w-full rounded-xl border border-slate-200 bg-white pl-3.5 pr-10 py-2.5 text-sm font-mono tracking-widest text-slate-900 shadow-[inset_2px_2px_5px_#e2e8f0] focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPin((prev) => !prev)}
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <i className={`fas ${showPin ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="setup-admin-confirm" className="block text-xs font-semibold text-slate-600 mb-1">
              Confirm Admin PIN
            </label>
            <input
              id="setup-admin-confirm"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={8}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Re-enter PIN"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono tracking-widest text-slate-900 shadow-[inset_2px_2px_5px_#e2e8f0] focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 focus:outline-none"
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white font-semibold py-3 px-4 rounded-2xl shadow-[6px_6px_14px_rgba(2,132,199,0.28),-4px_-4px_12px_#ffffff] hover:opacity-95 disabled:opacity-60 text-sm"
            >
              {saving ? 'Saving Credentials...' : 'Save & Open Store'}
            </button>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="bg-[#ecf2f9] hover:bg-white text-slate-700 font-semibold py-3 px-4 rounded-2xl shadow-[6px_6px_14px_#c7d2e0,-6px_-6px_14px_#ffffff] text-sm"
            >
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface UninvitedProps {
  userEmail: string;
  reason: 'uninvited' | 'revoked' | 'unverified' | 'credentials_pending';
  onRecheckAccess: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export const NeumorphicAccessScreen: React.FC<UninvitedProps> = ({
  userEmail,
  reason,
  onRecheckAccess,
  onLogout,
}) => {
  const [checking, setChecking] = useState(false);

  const isRevoked = reason === 'revoked';
  const isUnverified = reason === 'unverified';
  const isPendingCreds = reason === 'credentials_pending';

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#e7eef6] flex items-center justify-center p-4 sm:p-6">
      <img
        src={ERTVC_BUILDING_PATH}
        alt="Eldama Ravine Technical and Vocational College"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none"
      />
      <div className="relative z-10 max-w-lg w-full rounded-3xl bg-[#ecf2f9] p-7 sm:p-8 shadow-[18px_18px_38px_#c7d2e0,-18px_-18px_38px_#ffffff] border border-white/60 space-y-5">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-3 rounded-full bg-[#ecf2f9] shadow-[8px_8px_18px_#c7d2e0,-8px_-8px_18px_#ffffff] flex items-center justify-center p-2">
            <img
              src={ERTVC_LOGO_PATH}
              alt="ERTVC Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full rounded-full object-contain bg-white"
            />
            <span
              className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs shadow-md ${
                isRevoked ? 'bg-red-600' : 'bg-amber-500'
              }`}
            >
              <i className={`fas ${isRevoked ? 'fa-ban' : 'fa-lock'}`}></i>
            </span>
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900">
            {isRevoked
              ? 'Store Access Revoked'
              : isUnverified
                ? 'Verified Google Email Required'
                : isPendingCreds
                  ? 'Username & PIN Setup Pending'
                  : 'Admin Authorization Required'}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Signed in as <span className="font-semibold text-slate-900">{userEmail || 'Unknown'}</span>
          </p>
        </div>

        <div className="rounded-2xl bg-[#e4ecf5] p-4 shadow-[inset_4px_4px_9px_#c7d2e0,inset_-4px_-4px_9px_#ffffff] text-sm text-slate-700 leading-relaxed space-y-2">
          {isRevoked ? (
            <p>
              Access for <strong>{userEmail}</strong> has been revoked by the{' '}
              <strong>{DEFAULT_INSTITUTION_NAME}</strong> Store Administrator. All store data and
              actions are locked until re-activated.
            </p>
          ) : isUnverified ? (
            <p>
              Your Google account email is not marked as verified. Sign in with a verified Google
              account authorized by the Store Administrator.
            </p>
          ) : isPendingCreds ? (
            <p>
              Your email is listed, but your login <strong>Username &amp; PIN</strong> or{' '}
              <strong>Department</strong> has not yet been completed by the Store Administrator under{' '}
              <strong>Settings → Team Access</strong>.
            </p>
          ) : (
            <>
              <p>
                Only the Store Administrator can add login emails, assign roles, and issue your
                Username &amp; PIN for the <strong>{DEFAULT_INSTITUTION_NAME}</strong> workspace.
              </p>
              <p className="text-xs text-slate-600">
                Ask the administrator (
                <strong className="font-mono">procurementertvc@gmail.com</strong>) to authorize{' '}
                <strong className="font-mono">{userEmail}</strong> and assign your role, username,
                and PIN under <strong>Settings → Team Access</strong>.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              try {
                await onRecheckAccess();
              } finally {
                setChecking(false);
              }
            }}
            className="flex-1 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white font-semibold py-3 px-4 rounded-2xl shadow-[6px_6px_14px_rgba(2,132,199,0.28),-4px_-4px_12px_#ffffff] hover:opacity-95 disabled:opacity-60 text-sm flex items-center justify-center gap-2"
          >
            <i className={`fas ${checking ? 'fa-spinner fa-spin' : 'fa-rotate'}`}></i>
            <span>{checking ? 'Checking...' : 'Check Access Again'}</span>
          </button>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="flex-1 bg-[#ecf2f9] hover:bg-white text-slate-700 font-semibold py-3 px-4 rounded-2xl shadow-[6px_6px_14px_#c7d2e0,-6px_-6px_14px_#ffffff] text-sm transition-colors flex items-center justify-center gap-2"
          >
            <i className="fas fa-arrow-right-from-bracket"></i>
            <span>Sign Out / Switch Email</span>
          </button>
        </div>
      </div>
    </div>
  );
};
