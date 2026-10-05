// Predlog personalizacije preko Claude-a: uputstvo, ulazni podaci i čitanje odgovora.
// Predlozi se nikad ne upisuju sami; korisnik ih prihvata u aplikaciji.

export const MAX_PERSONALIZE = 25;

export interface PersonalizeInput {
  id: string;
  company: string | null;
  city: string | null;
  source: string | null;
  notes: string | null;
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
    "Ne izmišljaj činjenice: projekte, klijente, nagrade, broj zaposlenih, opremu ili bilo šta što nije u podacima.",
    "Ako podaci ne daju ništa konkretno za tu firmu, vrati prazan string za nju. Prazno je bolje od izmišljenog ili generičkog.",
    "Bez pozdrava, bez imena primaoca, bez laskanja i fraza tipa 'impresioniran sam vašim radom'.",
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
        properties: { id: { type: "string" }, sentence: { type: "string" } },
        required: ["id", "sentence"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

/** Čita odgovor modela; zadržava samo tražene id-jeve, čisti razmake, prazno ostaje prazno. */
export function parseSuggestions(text: string, ids: string[]): Record<string, string> {
  const wanted = new Set(ids);
  const out: Record<string, string> = Object.fromEntries(ids.map((id) => [id, ""]));
  const data = JSON.parse(text) as { suggestions?: { id?: unknown; sentence?: unknown }[] };
  for (const s of data.suggestions ?? []) {
    if (typeof s.id !== "string" || !wanted.has(s.id) || typeof s.sentence !== "string") continue;
    out[s.id] = s.sentence.replace(/\s+/g, " ").trim();
  }
  return out;
}
