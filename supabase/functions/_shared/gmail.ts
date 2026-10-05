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

/** Message-ID zaglavlje poslate poruke (za In-Reply-To/References u sledećem koraku). */
export async function getMessageIdHeader(accessToken: string, messageId: string): Promise<string | null> {
  const msg = await gmail<{ payload?: { headers?: { name: string; value: string }[] } }>(
    accessToken,
    `messages/${messageId}?format=metadata&metadataHeaders=Message-ID`,
  );
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value ?? null;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: GmailHeader[];
}

export interface GmailMessage {
  id: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
}

export const header = (m: GmailMessage, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

/** Niti sa bar jednom porukom koja nije naša u poslednjih N dana (kandidati za odgovor ili bounce). */
export async function listThreadsWithIncoming(accessToken: string, days = 7, max = 1000): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ q: `newer_than:${days}d -from:me`, maxResults: "500" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await gmail<{ threads?: { id: string }[]; nextPageToken?: string }>(accessToken, `threads?${q}`);
    for (const t of res.threads ?? []) ids.add(t.id);
    pageToken = res.nextPageToken;
  } while (pageToken && ids.size < max);
  return ids;
}

export async function getThreadMetadata(accessToken: string, threadId: string): Promise<GmailMessage[]> {
  const q = new URLSearchParams({ format: "metadata" });
  for (const h of ["From", "Subject", "Auto-Submitted"]) q.append("metadataHeaders", h);
  const res = await gmail<{ messages?: GmailMessage[] }>(accessToken, `threads/${threadId}?${q}`);
  return res.messages ?? [];
}

export async function getThreadFull(accessToken: string, threadId: string): Promise<GmailMessage[]> {
  const res = await gmail<{ messages?: GmailMessage[] }>(accessToken, `threads/${threadId}?format=full`);
  return res.messages ?? [];
}

function decodeBase64Url(data: string): string {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Čisti tekst poruke (text/plain deo), ili izvod ako ga nema. */
export function messageText(m: GmailMessage): string {
  const find = (p?: GmailPart): string | null => {
    if (!p) return null;
    if (p.mimeType === "text/plain" && p.body?.data) return decodeBase64Url(p.body.data);
    for (const c of p.parts ?? []) {
      const t = find(c);
      if (t) return t;
    }
    return null;
  };
  return (find(m.payload) ?? m.snippet ?? "").trim();
}

/** Id labele, pravi je ako ne postoji. */
export async function ensureLabel(accessToken: string, name: string): Promise<string> {
  const res = await gmail<{ labels?: { id: string; name: string }[] }>(accessToken, "labels");
  const found = res.labels?.find((l) => l.name === name);
  if (found) return found.id;
  const created = await gmail<{ id: string }>(accessToken, "labels", {
    method: "POST",
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return created.id;
}

export function addThreadLabel(accessToken: string, threadId: string, labelId: string) {
  return gmail(accessToken, `threads/${threadId}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
}
