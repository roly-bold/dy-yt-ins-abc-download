export interface CookieEntry {
  cookies: string;
  expires: number;
}

const cookieStore = new Map<string, CookieEntry>();
const COOKIE_TOKEN_TTL = 600_000; // 10 minutes

export function gcCookieStore() {
  const now = Date.now();
  for (const [token, entry] of cookieStore) {
    if (entry.expires < now) cookieStore.delete(token);
  }
}

export function storeCookies(cookies: string): string {
  gcCookieStore();
  const token = crypto.randomUUID();
  cookieStore.set(token, { cookies, expires: Date.now() + COOKIE_TOKEN_TTL });
  return token;
}

export function getCookies(token: string): CookieEntry | undefined {
  const entry = cookieStore.get(token);
  if (entry && entry.expires > Date.now()) return entry;
  if (entry) cookieStore.delete(token);
  return undefined;
}
