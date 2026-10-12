// Remembers why the session ended so the login page can explain it.
let reason = null; // 'manual' | 'deleted' | null

export const markSignOut = (r) => {
  reason = r;
};

export function takeSignOutReason() {
  const r = reason;
  reason = null;
  return r;
}
