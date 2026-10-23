// Praćenje švedskih tendera za merni pribor (Nikola, 23.10.2026): kommuner ne odgovaraju na cold mejl,
// pa jednom nedeljno pretražujemo evropsku bazu TED i javljamo nove objave mejlom.

export const TED_SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search";

/** CPV: instrumenti za premer (38290000), oprema za premer (38296000), teodoliti (38294000), merni instrumenti za premer (38295000). */
const CPV = ["38290000", "38294000", "38295000", "38296000"];
const KEYWORDS = [
  "totalstation",
  "totalstationer",
  "GNSS",
  "lantmäteriutrustning",
  "lantmäteriinstrument",
  "mätprisma",
  "prismor",
  "avvägningsinstrument",
  '"laser tracker"',
  '"geodetisk utrustning"',
  '"geodetiska mätinstrument"',
];
/** Pozivi, prethodne najave i dodele ugovora (dodela kaže ko je dobio i kada se ugovor obnavlja). */
const NOTICE_TYPES = ["cn-standard", "cn-social", "pin-only", "pin-cfc-standard", "pin-tran", "can-standard"];
export const TED_FIELDS = [
  "publication-number",
  "notice-title",
  "buyer-name",
  "publication-date",
  "classification-cpv",
  "notice-type",
  "deadline-receipt-tender-date-lot",
];

/** sinceYmd u obliku 20261019. */
export function tedQuery(sinceYmd: string): string {
  return [
    "buyer-country=SWE",
    `notice-type IN (${NOTICE_TYPES.join(" ")})`,
    `(classification-cpv IN (${CPV.join(" ")}) OR FT~(${KEYWORDS.join(" OR ")}))`,
    `publication-date>=${sinceYmd}`,
  ].join(" AND ");
}

export interface Tender {
  publication_number: string;
  published_on: string;
  buyer: string | null;
  title: string;
  notice_type: string;
  cpv: string | null;
  deadline: string | null;
  url: string;
}

const pick = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return pick(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return pick(o.swe ?? o.eng ?? Object.values(o)[0]);
  }
  return String(v);
};

const day = (s: string | null) => (s ? s.slice(0, 10) : null);

// deno-lint-ignore no-explicit-any
export function parseNotices(body: any): Tender[] {
  return (body?.notices ?? []).map((n: Record<string, unknown>) => {
    const no = String(n["publication-number"]);
    return {
      publication_number: no,
      published_on: day(pick(n["publication-date"]))!,
      buyer: pick(n["buyer-name"]),
      title: pick(n["notice-title"]) ?? "(bez naslova)",
      notice_type: String(n["notice-type"] ?? ""),
      cpv: pick(n["classification-cpv"]),
      deadline: day(pick(n["deadline-receipt-tender-date-lot"])),
      url: `https://ted.europa.eu/sv/notice/-/detail/${no}`,
    };
  });
}

const isAward = (t: Tender) => t.notice_type.startsWith("can");
const isPrior = (t: Tender) => t.notice_type.startsWith("pin");

/** Nedeljni mejl, ili null ako nema novih objava. */
export function buildTenderDigest(date: string, tenders: Tender[]): { subject: string; text: string } | null {
  if (!tenders.length) return null;
  const line = (t: Tender) =>
    [
      `- ${t.buyer ?? "?"}: ${t.title}`,
      `  Objavljeno ${t.published_on}${t.deadline ? `, rok za ponudu ${t.deadline}` : ""}`,
      `  ${t.url}`,
    ].join("\n");
  const open = tenders.filter((t) => !isAward(t) && !isPrior(t));
  const prior = tenders.filter(isPrior);
  const awards = tenders.filter(isAward);
  const parts = [`Nove švedske objave za mernu opremu i pribor u bazi TED (${date}).`];
  if (open.length) parts.push("", `OTVORENI TENDERI (${open.length}):`, ...open.map(line));
  if (prior.length) parts.push("", `NAJAVE I UPITI ZA INFORMACIJE (${prior.length}):`, ...prior.map(line));
  if (awards.length) parts.push("", `DODELJENI UGOVORI, za praćenje konkurencije i obnove (${awards.length}):`, ...awards.map(line));
  parts.push(
    "",
    "Proveri da li tender traži pribor koji nudimo (prizme, stativi, nosači, mete, adapteri). Ako traži, javi u projektu i pripremam ponudu na švedskom.",
    "TED ima samo veće nabavke; male nabavke kommuna stižu preko švedskih portala za nabavke.",
  );
  const subject = open.length
    ? `[Tenderi SE] ${open.length} ${open.length === 1 ? "otvoren tender" : "otvorenih tendera"} za mernu opremu`
    : `[Tenderi SE] ${tenders.length} ${tenders.length === 1 ? "nova objava" : "novih objava"} za mernu opremu`;
  return { subject, text: parts.join("\n") };
}
