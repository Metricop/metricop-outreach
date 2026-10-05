// Gmail API i Google OAuth pozivi (samo na serveru).

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.labels",
];

/** Token je istekao ili opozvan: mailbox treba ponovo povezati. */
export class GmailAuthError extends Error {}

function clientCredentials() {
  const id = Deno.env.get("GOOGLE_CLIENT_ID");
  const secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Nedostaju GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET u Supabase secrets.");
  return { id, secret };
}

export function authUrl(redirectUri: string, state: string, loginHint: string): string {
  const { id } = clientCredentials();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    login_hint: loginHint,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const { id, secret } = clientCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new GmailAuthError("Gmail veza je istekla ili je opozvana.");
    throw new Error(`Google OAuth: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data as { access_token: string; refresh_token?: string; scope?: string };
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const data = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return data.access_token;
}

export async function gmail<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new GmailAuthError("Gmail veza je istekla ili je opozvana.");
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${data?.error?.message ?? "greška"}`);
  return data as T;
}

export function getProfile(accessToken: string) {
  return gmail<{ emailAddress: string }>(accessToken, "profile");
}

export function sendRaw(accessToken: string, raw: string, threadId?: string | null) {
  return gmail<{ id: string; threadId: string }>(accessToken, "messages/send", {
    method: "POST",
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  });
}
