// Sastavljanje mejla iz koraka sekvence: naslov, tekst, potpis, HTML verzija.
// Isti kod koriste pregled u aplikaciji i slanje u Edge funkciji.

import { renderTemplate, type TemplateVars } from "./template.ts";

export interface ComposeInput {
  stepNo: number;
  subject: string | null; // naslov ovog koraka (koristi se samo za korak 1)
  body: string;
  firstSubject: string | null; // naslov koraka 1, za "Re:" u follow-upovima
  vars: TemplateVars;
  signature?: string | null;
  testMode?: boolean;
}

export interface ComposedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Adresa, pun link ili goli domen (metricop.com, www.metricop.com/putanja). Link vodi tačno na ono što piše,
// sa https, da Gmail ne bi sam pravio http://www… linkove.
const LINK_RE =
  /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s<]+[^\s<.,;:!?)])|(?<![\w@./-])((?:www\.)?[a-z0-9-]+\.(?:com|rs|se|net|org|io)(?:\/[^\s<]*[^\s<.,;:!?)])?)(?![\w@-])/gi;

// Link sa imenom, kao u Markdown-u: [pogledajte modele](https://metricop.com/...). Čitalac vidi samo ime.
const NAMED_LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** Tekstualna verzija: [ime](adresa) postaje "ime (adresa)". */
export function namedLinksToPlain(text: string): string {
  return text.replace(NAMED_LINK_RE, (_m, label, url) => `${label} (${url})`);
}

function linkifyWithNamed(raw: string): string {
  let out = "";
  let last = 0;
  for (const m of raw.matchAll(NAMED_LINK_RE)) {
    out += linkify(escapeHtml(raw.slice(last, m.index)));
    out += `<a href="${escapeHtml(m[2])}">${escapeHtml(m[1])}</a>`;
    last = m.index! + m[0].length;
  }
  return out + linkify(escapeHtml(raw.slice(last)));
}

function linkify(escaped: string): string {
  return escaped.replace(LINK_RE, (m, email, url, domain) => {
    if (email) return `<a href="mailto:${email}">${email}</a>`;
    if (url) return `<a href="${url}">${url}</a>`;
    return `<a href="https://${domain}">${domain}</a>`;
  });
}

/**
 * Jednostavan HTML: pasusi, prelomi redova i linkovi, bez slika ili stilova za praćenje.
 * Boja je zadata na svakom pasusu da Gmail ne bi prikazao potpis sivim slovima.
 */
export function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="color:#222222">${linkifyWithNamed(p).replace(/\n/g, "<br>")}</p>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222">${paragraphs.join("")}</div>`;
}

export function composeEmail(input: ComposeInput): ComposedEmail {
  const first = renderTemplate(input.firstSubject ?? "", input.vars).trim();
  let subject =
    input.stepNo === 1 ? renderTemplate(input.subject ?? "", input.vars).trim() : first ? `Re: ${first}` : "";
  if (input.testMode) subject = `[TEST] ${subject}`;

  const body = renderTemplate(input.body, input.vars).trim();
  const signature = (input.signature ?? "").trim();
  const full = signature ? `${body}\n\n${signature}` : body;

  return { subject, text: namedLinksToPlain(full), html: textToHtml(full) };
}

/** Podaci za pregled i test slanje kad nije izabran pravi kontakt. */
export const SAMPLE_VARS: TemplateVars = {
  ime: "Marko",
  firma: "Geodetski biro Primer",
  grad: "Novi Sad",
  personalizacija: "Videli smo da radite snimanja za katastar u Bačkoj.",
};
