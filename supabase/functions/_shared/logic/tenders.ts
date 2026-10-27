// Praćenje tendera za mernu opremu (Nikola, 23.10.2026): kommuner ne odgovaraju na cold mejl, pa jednom nedeljno
// pretražujemo evropsku bazu TED i javljamo nove objave mejlom. Elemtech AB (Švedska) konkuriše u celoj EU:
// za EU se prate otvoreni tenderi po CPV kodu i skeneri po ključnim rečima, za Švedsku još i ključne reči, najave i dodele ugovora.

import { tenderFit } from "./tenderFit.ts";

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
  // Same reči "geodetisk" i "geodetiska" donose uglavnom usluge merenja, pa ostaju samo izrazi za opremu.
  '"geodetisk mätutrustning"',
];
/** Skeneri i mobile mapping u celoj EU: često nose CPV za softver ili usluge, pa ih CPV ne hvata. */
const SCANNER_KEYWORDS = [
  "laserscanner",
  "laserscanners",
  "laserskanner",
  '"laser scanner"',
  '"laser scanners"',
  '"scanner laser"',
  '"scanners laser"',
  '"skaner laserowy"',
  '"3D scanner"',
  '"mobile mapping"',
  "Mobile-Mapping-System",
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
  "description-lot",
];

// TED za FT~(a OR b) vraća nula rezultata, pa svaka reč dobija svoj FT~.
const anyText = (words: string[]) => words.map((w) => `FT~${w}`).join(" OR ");

/** sinceYmd u obliku 20261019. */
export function tedQuery(sinceYmd: string): string {
  const cpv = `classification-cpv IN (${CPV.join(" ")})`;
  const eu = `(notice-type IN (${OPEN_TYPES.join(" ")}) AND (${cpv} OR ${anyText(SCANNER_KEYWORDS)}))`;
  const se = `(buyer-country=SWE AND notice-type IN (${SE_TYPES.join(" ")}) AND (${cpv} OR ${anyText(KEYWORDS)}))`;
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
  /** Procena uklapanja u našu ponudu, 5–95 (tenderFit); null za objave sačuvane pre procene. */
  fit: number | null;
  fit_note: string | null;
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

/** Svi tekstovi jednog polja (svi jezici, svi lotovi), za procenu uklapanja. */
const allText = (v: unknown): string[] => {
  if (v == null) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allText);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).flatMap(allText);
  return [String(v)];
};

/** TED naslov je "Zemlja – CPV naziv – naslov naručioca"; za procenu treba samo naslov naručioca. */
const ownTitle = (s: string) => s.split(" – ").slice(2).join(" – ") || s;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseNotices(body: any): Tender[] {
  return (body?.notices ?? []).map((n: Record<string, unknown>) => {
    const no = String(n["publication-number"]);
    const cpv = pick(n["classification-cpv"]);
    const title = titleFor(n["notice-title"], pick(n["buyer-country"])) ?? "(bez naslova)";
    const fit = tenderFit([ownTitle(title), ...allText(n["description-lot"])].join(" \n "), cpv);
    return {
      publication_number: no,
      country: pick(n["buyer-country"]),
      published_on: day(pick(n["publication-date"]))!,
      buyer: pick(n["buyer-name"]),
      // TED prevodi naslov na sve jezike: švedski za Švedsku, engleski za ostale zemlje.
      title,
      notice_type: String(n["notice-type"] ?? ""),
      cpv,
      deadline: day(pick(n["deadline-receipt-tender-date-lot"])),
      url: `https://ted.europa.eu/sv/notice/-/detail/${no}`,
      fit: fit.score,
      fit_note: fit.note,
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

/** Pragovi za grupe u mejlu. */
export const FIT_GOOD = 60;
export const FIT_MAYBE = 25;

/** Procena iz baze; starije objave bez procene dobijaju je iz naslova. */
const fitOf = (t: Tender) =>
  t.fit != null ? { score: t.fit, note: t.fit_note } : tenderFit(ownTitle(t.title), t.cpv);

/** Nedeljni mejl, ili null ako nema novih objava. Otvoreni tenderi po proceni uklapanja, najbolji prvi. */
export function buildTenderDigest(date: string, tenders: Tender[]): { subject: string; text: string } | null {
  if (!tenders.length) return null;
  const line = (t: Tender) => {
    const f = fitOf(t);
    return [
      `- [${f.score}%] ${countryName(t.country)}, ${t.buyer ?? "?"}: ${ownTitle(t.title)}`,
      `  ${f.note}`,
      `  Objavljeno ${t.published_on}${t.deadline ? `, rok ${t.deadline}` : ""}`,
      `  ${t.url}`,
    ].join("\n");
  };
  const short = (t: Tender) => `- [${fitOf(t).score}%] ${countryName(t.country)}, ${t.buyer ?? "?"}: ${ownTitle(t.title)}\n  ${t.url}`;
  const byFit = (a: Tender, b: Tender) =>
    fitOf(b).score - fitOf(a).score || (a.country === "SWE" ? -1 : b.country === "SWE" ? 1 : 0);
  const open = tenders.filter((t) => !isAward(t) && !isPrior(t)).sort(byFit);
  const prior = tenders.filter(isPrior).sort(byFit);
  const awards = tenders.filter(isAward);
  const good = open.filter((t) => fitOf(t).score >= FIT_GOOD);
  const maybe = open.filter((t) => fitOf(t).score >= FIT_MAYBE && fitOf(t).score < FIT_GOOD);
  const weak = open.filter((t) => fitOf(t).score < FIT_MAYBE);

  const parts = [
    `Nove objave za geodetsku opremu, skenere i pribor u bazi TED (${date}).`,
    "Procenat je gruba procena iz naslova i opisa: koliko tražena roba odgovara našoj ponudi. Konačnu ocenu dajem posle čitanja dokumentacije.",
  ];
  if (good.length) parts.push("", `DOBRE ŠANSE, ${FIT_GOOD}% i više (${good.length}):`, ...good.map(line));
  if (maybe.length) parts.push("", `MOGUĆE, PROVERITI (${maybe.length}):`, ...maybe.map(line));
  if (weak.length) parts.push("", `SLABO SE UKLAPA, samo da znamo da postoje (${weak.length}):`, ...weak.map(short));
  if (prior.length) parts.push("", `ŠVEDSKA, NAJAVE I UPITI ZA INFORMACIJE (${prior.length}):`, ...prior.map(line));
  if (awards.length) parts.push("", `ŠVEDSKA, DODELJENI UGOVORI, za praćenje konkurencije i obnove (${awards.length}):`, ...awards.map(short));
  parts.push(
    "",
    "Ako neki tender odgovara našoj ponudi, pošalji link u projekat i pripremam analizu i ponudu na jeziku tendera.",
    "TED ima samo veće nabavke; male nabavke švedskih kommuna stižu preko švedskih portala.",
  );
  const subject = good.length
    ? `[Tenderi EU] Dobre šanse: ${good.length}, ukupno novih objava: ${tenders.length}`
    : `[Tenderi EU] ${tenders.length} ${tenders.length === 1 ? "nova objava" : "novih objava"} za geodetsku opremu`;
  return { subject, text: parts.join("\n") };
}
