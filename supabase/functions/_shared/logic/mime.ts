// Sastavljanje MIME poruke za Gmail API (users.messages.send, polje raw).
// multipart/alternative: čisti tekst + jednostavan HTML, UTF-8, bez priloga.

export interface MimeInput {
  fromEmail: string;
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string | null;
  references?: string | null;
  boundary?: string;
}

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64Url(s: string): string {
  return utf8ToBase64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** RFC 2047 kodiranje zaglavlja; deli na delove do 45 bajtova bez sečenja slova. */
export function encodeHeader(value: string): string {
  if (isAscii(value)) return value;
  const enc = new TextEncoder();
  const words: string[] = [];
  let current = "";
  for (const ch of value) {
    if (enc.encode(current + ch).length > 45) {
      words.push(current);
      current = ch;
    } else current += ch;
  }
  if (current) words.push(current);
  return words.map((w) => `=?UTF-8?B?${utf8ToBase64(w)}?=`).join("\r\n ");
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function formatAddress(email: string, name?: string | null): string {
  if (!name) return email;
  const display = isAscii(name) ? `"${name.replace(/["\\]/g, "")}"` : encodeHeader(name);
  return `${display} <${email}>`;
}

export function buildMime(m: MimeInput): string {
  const boundary = m.boundary ?? `mb_${crypto.randomUUID().replace(/-/g, "")}`;
  const headers = [
    `From: ${formatAddress(m.fromEmail, m.fromName)}`,
    `To: ${m.to}`,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (m.inReplyTo) headers.push(`In-Reply-To: ${m.inReplyTo}`);
  if (m.references) headers.push(`References: ${m.references}`);
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const part = (type: string, content: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${type}; charset="UTF-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(utf8ToBase64(content)),
    ].join("\r\n");

  return [
    headers.join("\r\n"),
    "",
    part("text/plain", m.text),
    part("text/html", m.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
