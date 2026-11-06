// Predlog personalizacije preko Claude-a: uputstvo, ulazni podaci i čitanje odgovora.
// Predlozi se nikad ne upisuju sami; korisnik ih prihvata u aplikaciji.
// Uz rečenicu Claude predlaže i delatnost firme (segment): bez nje nema prvog mejla u grupi sa delatnošću.

import { SEGMENTS, type Segment } from "./types";

export const MAX_PERSONALIZE = 25;

export interface PersonalizeInput {
  id: string;
  company: string | null;
  city: string | null;
  source: string | null;
  notes: string | null;
  /** Podaci firme, ako je kontakt povezan sa firmom. */
  website?: string | null;
  description?: string | null;
  licenses?: string | null;
}

export interface Suggestion {
  sentence: string;
  /** null = iz podataka se ne vidi čime se firma bavi. */
  segment: Segment | null;
}

const LANGUAGE_NAMES: Record<string, string> = {
  sr: "srpskom jeziku (latinica)",
  sv: "švedskom jeziku",
  en: "engleskom jeziku",
};

export function systemPrompt(language: string): string {
  const lang = LANGUAGE_NAMES[language] ?? LANGUAGE_NAMES.sr;
  return [
    "Pišeš uvodnu rečenicu za personalizovan poslovni mejl firme Metricop, koja sarađuje sa geodetskim firmama i biroima.",
    `Za svaku firmu napiši jednu kratku, prirodnu rečenicu (najviše 25 reči) na ${lang}.`,
    "Koristi isključivo podatke koji su dati za tu firmu: naziv, grad, izvor i beleške.",
    "Beleške često sadrže licence za rad RGZ. Iz njih smeš da zaključiš vrstu posla kojom se firma bavi (npr. održavanje katastra, geodetske podloge za inženjerske objekte, obeležavanje u urbanizmu, radovi sa glavnim projektom, komasacija), ali ne i ništa preko toga.",
    "Ne navodi brojeve licenci, godine ni pravni oblik doslovno; pomeni posao prirodnim rečima.",
    "Ne izmišljaj činjenice: projekte, klijente, nagrade, broj zaposlenih, opremu ili bilo šta što nije u podacima.",
    "Ako podaci ne daju ništa konkretno za tu firmu, vrati prazan string za nju. Prazno je bolje od izmišljenog ili generičkog.",
    "Bez pozdrava, bez imena primaoca, bez laskanja i fraza tipa 'impresioniran sam vašim radom'.",
    "Za svaku firmu odredi i delatnost (segment) u okviru geodezije i merenja, samo na osnovu datih podataka:",
    "- survey: geodetski biro ili mätkonsult koji radi merenja za druge (katastar, podloge, obeležavanje, inženjerska geodezija);",
    "- contractor: izvođač radova (građevina, infrastruktura) koji ima sopstvene geodete za merenje na gradilištu;",
    "- municipality: opština, grad ili javno preduzeće sa sopstvenom službom za merenje;",
    "- monitoring: firma čiji je glavni posao monitoring, praćenje sleganja, deformacija ili vibracija;",
    "- scanning: firma čiji je glavni posao lasersko skeniranje, dronovi, fotogrametrija ili 3D modeli.",
    "Ako se iz podataka ne vidi jasno čime se firma bavi, vrati prazan string za segment. Ne pogađaj.",
    "Vrati predlog za svaku firmu, sa istim id-jem koji je dat.",
  ].join("\n");
}

export function userContent(contacts: PersonalizeInput[]): string {
  return JSON.stringify(
    contacts.map((c) => ({
      id: c.id,
      naziv: c.company ?? "",
      grad: c.city ?? "",
      izvor: c.source ?? "",
      beleske: c.notes ?? "",
      sajt: c.website ?? "",
      opis_firme: c.description ?? "",
      licence: c.licenses ?? "",
    })),
  );
}

export const SUGGESTIONS_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          sentence: { type: "string" },
          segment: { type: "string", enum: ["", ...SEGMENTS] },
        },
        required: ["id", "sentence", "segment"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

const isSegment = (v: unknown): v is Segment => typeof v === "string" && (SEGMENTS as readonly string[]).includes(v);

/** Čita odgovor modela; zadržava samo tražene id-jeve, čisti razmake, prazno ostaje prazno, nepoznata delatnost = null. */
export function parseSuggestions(text: string, ids: string[]): Record<string, Suggestion> {
  const wanted = new Set(ids);
  const out: Record<string, Suggestion> = Object.fromEntries(ids.map((id) => [id, { sentence: "", segment: null }]));
  const data = JSON.parse(text) as { suggestions?: { id?: unknown; sentence?: unknown; segment?: unknown }[] };
  for (const s of data.suggestions ?? []) {
    if (typeof s.id !== "string" || !wanted.has(s.id) || typeof s.sentence !== "string") continue;
    out[s.id] = { sentence: s.sentence.replace(/\s+/g, " ").trim(), segment: isSegment(s.segment) ? s.segment : null };
  }
  return out;
}
