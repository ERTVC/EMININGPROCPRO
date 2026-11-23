const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{2,40}$/;
export const PIN_PATTERN = /^\d{4,8}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeLoginUsername(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

export function isValidLoginUsername(raw: string): boolean {
  return USERNAME_PATTERN.test(normalizeLoginUsername(raw));
}

export function isValidPinFormat(raw: string): boolean {
  return PIN_PATTERN.test(String(raw || '').trim());
}

export function isValidEmailFormat(raw: string): boolean {
  const clean = String(raw || '').trim().toLowerCase();
  return clean.length >= 3 && clean.length <= 254 && EMAIL_PATTERN.test(clean);
}

export function generateRandomPin(length = 6): string {
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => String(v % 10)).join('');
}

export async function hashPinWithSalt(
  rawPin: string,
  existingSaltHex?: string,
): Promise<{ pinSalt: string; pinHash: string }> {
  const cleanPin = String(rawPin || '').trim();
  const saltBytes = existingSaltHex
    ? hexToBytes(existingSaltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const pinSalt = existingSaltHex ? existingSaltHex.trim().toLowerCase() : bytesToHex(saltBytes);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(cleanPin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  return {
    pinSalt,
    pinHash: bytesToHex(new Uint8Array(derivedBits)),
  };
}

export async function verifyPinHash(
  rawPin: string,
  pinSalt: string,
  expectedPinHash: string,
): Promise<boolean> {
  if (!pinSalt || !expectedPinHash) return false;
  if (!/^[a-f0-9]{16,64}$/i.test(pinSalt) || !/^[a-f0-9]{32,128}$/i.test(expectedPinHash)) {
    return false;
  }
  const { pinHash } = await hashPinWithSalt(rawPin, pinSalt);
  const actual = pinHash.toLowerCase();
  const expected = expectedPinHash.trim().toLowerCase();
  if (actual.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
