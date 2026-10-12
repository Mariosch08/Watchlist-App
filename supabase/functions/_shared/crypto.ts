// AES-GCM for per-user secrets (Spotify refresh tokens). The key is derived with HKDF from TOKEN_ENCRYPTION_KEY,
// or from the service-role key if that secret is not set (rotating it only means reconnecting Spotify).
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function deriveKey(secret: string, purpose = 'spotify-refresh-token'): Promise<CryptoKey> {
  if (!secret || secret.length < 16) throw new Error('Encryption secret missing or too short');
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('watchlist-app'), info: enc.encode(purpose) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plain: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(data)}`;
}

export async function decryptText(payload: string, key: CryptoKey): Promise<string> {
  const [version, iv, data] = payload.split('.');
  if (version !== 'v1' || !iv || !data) throw new Error('Unknown ciphertext format');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data));
  return new TextDecoder().decode(plain);
}

export const encryptionSecret = () => Deno.env.get('TOKEN_ENCRYPTION_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
