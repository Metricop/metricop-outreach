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

/** Jednostavan HTML: pasusi i prelomi redova, bez slika, stilova za praćenje ili prepravljenih linkova. */
export function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${paragraphs.join("")}</div>`;
}

export function composeEmail(input: ComposeInput): ComposedEmail {
  const first = renderTemplate(input.firstSubject ?? "", input.vars).trim();
  let subject =
    input.stepNo === 1 ? renderTemplate(input.subject ?? "", input.vars).trim() : first ? `Re: ${first}` : "";
  if (input.testMode) subject = `[TEST] ${subject}`;

  const body = renderTemplate(input.body, input.vars).trim();
  const signature = (input.signature ?? "").trim();
  const text = signature ? `${body}\n\n${signature}` : body;

  return { subject, text, html: textToHtml(text) };
}

/** Podaci za pregled i test slanje kad nije izabran pravi kontakt. */
export const SAMPLE_VARS: TemplateVars = {
  ime: "Marko",
  firma: "Geodetski biro Primer",
  grad: "Novi Sad",
  personalizacija: "Videli smo da radite snimanja za katastar u Bačkoj.",
};
