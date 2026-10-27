// Popunjavanje polja u šablonu: {{ime}}, {{vokativ}}, {{firma}}, {{grad}}, {{personalizacija}}.

import { vocative } from "./vocative.ts";

export interface TemplateVars {
  ime?: string | null;
  firma?: string | null;
  grad?: string | null;
  personalizacija?: string | null;
}

const FIELD = (name: string) => `\\{\\{\\s*${name}\\s*\\}\\}`;

export function renderTemplate(text: string, vars: TemplateVars): string {
  let out = text.replace(/\r\n/g, "\n");
  const val = (v: string | null | undefined) => (v ?? "").trim();

  // Prazna personalizacija uklanja ceo red.
  if (!val(vars.personalizacija)) {
    out = out
      .replace(new RegExp(`^.*${FIELD("personalizacija")}.*(\\n|$)`, "gim"), "")
      .replace(/\n{3,}/g, "\n\n");
  }
  // Prazno ime (ili ime bez proverenog vokativa) uklanja i zarez ispred.
  const values = { ...vars, vokativ: vocative(vars.ime) };
  for (const key of ["ime", "vokativ"] as const) {
    if (!val(values[key])) out = out.replace(new RegExp(`[ \\t]*,?[ \\t]*${FIELD(key)}`, "gi"), "");
  }

  for (const key of ["ime", "vokativ", "firma", "grad", "personalizacija"] as const) {
    out = out.replace(new RegExp(FIELD(key), "gi"), val(values[key]));
  }
  return out;
}
