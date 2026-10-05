// Popunjavanje polja u šablonu: {{ime}}, {{firma}}, {{grad}}, {{personalizacija}}.

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
  // Prazno ime uklanja i zarez ispred.
  if (!val(vars.ime)) {
    out = out.replace(new RegExp(`[ \\t]*,?[ \\t]*${FIELD("ime")}`, "gi"), "");
  }

  for (const key of ["ime", "firma", "grad", "personalizacija"] as const) {
    out = out.replace(new RegExp(FIELD(key), "gi"), val(vars[key]));
  }
  return out;
}
