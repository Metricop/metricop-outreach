// Praćenje tendera za mernu opremu (Nikola, 23.10.2026): kommuner ne odgovaraju na cold mejl, pa jednom nedeljno
// pretražujemo evropsku bazu TED i javljamo nove objave mejlom. Elemtech AB (Švedska) konkuriše u celoj EU:
// za EU se prate otvoreni tenderi po CPV kodu, za Švedsku još i ključne reči, najave i dodele ugovora.

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
  // Lantmäteriet je 2026. tender "Geodetisk mätutrustning med tillhörande systemlösningar" objavio pod CPV 51000000/38300000.
  "geodetisk",
  "geodetiska",
  '"geodetisk mätutrustning"',
];
/** Otvoreni pozivi za ponude. */
const OPEN_TYPES = ["cn-standard", "cn-social"];
/** Za Švedsku i najave i dodele ugovora (dodela kaže ko je dobio i kada se ugovor obnavlja). */
const SE_TYPES = [...OPEN_TYPES, "pin-only", "pin-cfc-standard", "pin-tran", "can-standard"];
export const TED_FIELDS = [
  "publication-number",
  "buyer-country",
  "notice-title",
  "buyer-name",
  "publication-date",
  "classification-cpv",
  "notice-type",
  "deadline-receipt-tender-date-lot",
];

/** sinceYmd u obliku 20261019. */
export function tedQuery(sinceYmd: string): string {
  const cpv = `classification-cpv IN (${CPV.join(" ")})`;
  const eu = `(notice-type IN (${OPEN_TYPES.join(" ")}) AND ${cpv})`;
  const se = `(buyer-country=SWE AND notice-type IN (${SE_TYPES.join(" ")}) AND (${cpv} OR FT~(${KEYWORDS.join(" OR ")})))`;
  return `(${eu} OR ${se}) AND publication-date>=${sinceYmd}`;
}

export interface Tender {
  publication_number: string;
  country: string | null;
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

const titleFor = (v: unknown, country: string | null): string | null => {
  if (v && typeof v === "object" && !Array.isArray(v) && country !== "SWE") {
    const o = v as Record<string, unknown>;
    if (o.eng) return pick(o.eng);
  }
  return pick(v);
};

const day = (s: string | null) => (s ? s.slice(0, 10) : null);

// deno-lint-ignore no-explicit-any
export function parseNotices(body: any): Tender[] {
  return (body?.notices ?? []).map((n: Record<string, unknown>) => {
    const no = String(n["publication-number"]);
    return {
      publication_number: no,
      country: pick(n["buyer-country"]),
      published_on: day(pick(n["publication-date"]))!,
      buyer: pick(n["buyer-name"]),
      // TED prevodi naslov na sve jezike: švedski za Švedsku, engleski za ostale zemlje.
      title: titleFor(n["notice-title"], pick(n["buyer-country"])) ?? "(bez naslova)",
      notice_type: String(n["notice-type"] ?? ""),
      cpv: pick(n["classification-cpv"]),
      deadline: day(pick(n["deadline-receipt-tender-date-lot"])),
      url: `https://ted.europa.eu/sv/notice/-/detail/${no}`,
    };
  });
}

const isAward = (t: Tender) => t.notice_type.startsWith("can");
const isPrior = (t: Tender) => t.notice_type.startsWith("pin");

/** Nazivi zemalja za mejl (ISO 3166-1 alpha-3 iz TED-a). */
const COUNTRY: Record<string, string> = {
  SWE: "Švedska", AUT: "Austrija", BEL: "Belgija", BGR: "Bugarska", CYP: "Kipar", CZE: "Češka", DEU: "Nemačka",
  DNK: "Danska", ESP: "Španija", EST: "Estonija", FIN: "Finska", FRA: "Francuska", GRC: "Grčka", HRV: "Hrvatska",
  HUN: "Mađarska", IRL: "Irska", ITA: "Italija", LTU: "Litvanija", LUX: "Luksemburg", LVA: "Letonija", MLT: "Malta",
  NLD: "Holandija", POL: "Poljska", PRT: "Portugalija", ROU: "Rumunija", SVK: "Slovačka", SVN: "Slovenija",
  NOR: "Norveška", ISL: "Island", CHE: "Švajcarska",
};
const countryName = (c: string | null) => (c ? (COUNTRY[c] ?? c) : "?");

/** Nedeljni mejl, ili null ako nema novih objava. Otvoreni tenderi po zemljama, Švedska prva. */
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
  const byCountry = new Map<string, Tender[]>();
  for (const t of open) byCountry.set(countryName(t.country), [...(byCountry.get(countryName(t.country)) ?? []), t]);
  const countries = [...byCountry.keys()].sort((a, b) => (a === "Švedska" ? -1 : b === "Švedska" ? 1 : a.localeCompare(b, "sr")));

  const parts = [`Nove objave za mernu opremu i pribor u bazi TED (${date}).`];
  if (open.length) {
    parts.push("", `OTVORENI TENDERI (${open.length}):`);
    for (const c of countries) parts.push("", `${c} (${byCountry.get(c)!.length}):`, ...byCountry.get(c)!.map(line));
  }
  if (prior.length) parts.push("", `ŠVEDSKA, NAJAVE I UPITI ZA INFORMACIJE (${prior.length}):`, ...prior.map(line));
  if (awards.length) parts.push("", `ŠVEDSKA, DODELJENI UGOVORI, za praćenje konkurencije i obnove (${awards.length}):`, ...awards.map(line));
  parts.push(
    "",
    "Ako neki tender odgovara našoj ponudi, pošalji link u projekat i pripremam analizu i ponudu na jeziku tendera.",
    "TED ima samo veće nabavke; male nabavke švedskih kommuna stižu preko švedskih portala.",
  );
  const subject = open.length
    ? `[Tenderi EU] ${open.length} ${open.length === 1 ? "otvoren tender" : "otvorenih tendera"} za mernu opremu`
    : `[Tenderi EU] ${tenders.length} ${tenders.length === 1 ? "nova objava" : "novih objava"} za mernu opremu`;
  return { subject, text: parts.join("\n") };
}
