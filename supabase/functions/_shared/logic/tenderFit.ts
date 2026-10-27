// Procena koliko tender odgovara našoj ponudi (Nikola, 23.10.2026): pratimo svu geodetsku opremu, a akcenat je na
// skenerima i priboru. Procena je gruba, samo iz naslova i kratkog opisa u TED-u; odluku donosimo posle čitanja dokumentacije.

export interface Fit {
  /** 5–95: koliko je verovatno da tražena roba postoji u našoj ponudi ili kod dobavljača. */
  score: number;
  /** Kratko objašnjenje za mejl, na srpskom. */
  note: string;
}

interface Rule {
  label: string;
  re: RegExp;
  score: number;
}

// Kategorije iz "08 Product List 2025": skeneri (FJD Trion, South, SPL, Singular), pribor (prizme, stativi, podloge,
// štapovi, mete), GNSS, totalne stanice, niveliri, dronovi i USV (South).
const GOODS: Rule[] = [
  {
    label: "skeneri",
    re: /laser\s?-?scan|laserskann|scanners? laser|skaner|slam\b|lidar|3d-?\s?scan|punktmoln|point cloud|nuage de points|mobile[ -]mapping|cartographie mobile|mobilios lazerin/,
    score: 85,
  },
  {
    label: "pribor",
    re: /prism|stativ|tripod|trépied|statyw|treppied|tribrach|dreifu|embase|lotstab|jalon|nivellierlatte|accessor|zubehör|tillbehör|akcesori|vermessungsbedarf|reflektor|reflector|zielmarke|markeringsrör/,
    score: 85,
  },
  { label: "GNSS", re: /gnss|\bgps\b|\brtk\b|rover/, score: 70 },
  {
    label: "totalne stanice",
    re: /total\s?station|tachymet|tachéomèt|station totale|stazione totale|tachimetr|totaalstation|teodolit|theodolit/,
    score: 70,
  },
  { label: "niveliri", re: /nivell|avvägning|waterpas|niwelator|livell|\blevels?\b/, score: 70 },
  { label: "dronovi i USV", re: /drone|\buav\b|\buas\b|\busv\b|fly2map/, score: 45 },
  {
    label: "geodetska oprema",
    re: /vermessungs|geodet|geodez|lantmät|inmätning|topograph|topográf|topografi|landmeet|surveying|survey (instrument|equipment)|ģeotelp/,
    score: 60,
  },
];

interface Risk {
  note: string;
  re: RegExp;
  /** Najviše ovoliko procenata, bez obzira na robu. */
  cap?: number;
  minus?: number;
}

const RISKS: Risk[] = [
  {
    note: "traže usluge, ne robu",
    re: /dienstleistung|prestations? de|services? de|tjänst|uppdrag|befliegung|(?<!ver)messung\b|relevés?|levés?|inmätning av/,
    cap: 20,
  },
  { note: "hiperspektralni ili multispektralni senzor, nije naša ponuda", re: /hiperspektr|hyperspe[ck]tr|multispe[ck]tr/, cap: 20 },
  { note: "sistem za vozilo, nemamo ga u listi", re: /fahrzeug|vehicle|véhicule|car-mounted|kelių|veículo|rodov/, cap: 35 },
  {
    note: "hidrografija ili druga merenja van naše ponude",
    re: /hydroakust|hydrograph|oceanograph|echo ?sound|sismi|seismic|meteo|bo[yj]a|buoy|telemetr|ultraschall|gas-detect/,
    cap: 15,
  },
  { note: "traže i softver ili integraciju sistema", re: /systemlösning|integration|integrat|cloud|software|logiciel|programinė/, minus: 5 },
  { note: "traže servis, kalibraciju ili obuku na terenu", re: /wartung|maintenance|maintien|kalibr|calibra|étalonn|schulung|training|formation|utbildning/, minus: 10 },
];

/** CPV-ovi usluga (projektovanje, IT, istraživanje, gradnja, poslovne usluge): kupuju rad, ne opremu. */
const SERVICE_CPV = /^(45|71|72|73|79|80|90)/;
/** Reči za isporuku robe: tender pod CPV-om usluge koji ipak kupuje opremu. */
const SUPPLY = /lieferung|beschaffung|supply|purchase|fourniture|acquisition|leverans|upphandling av|inköp|dostaw|zakup|aquisição|suministro|levering|įsigij|iegād|achizi/;

/** Mobile mapping je najčešće sistem za vozilo; ručni i ranac sistemi (FJD Trion, SLAM) su naši. */
const MOBILE_MAPPING = /mobile[ -]?mapping|móvel de mapeamento|cartographie mobile|mobilios lazerin/;
const HANDHELD = /handheld|hand-held|handgeführt|tragbar|backpack|rucksack|à dos|sac à dos|portable|portátil|bärbar|ręczn|ručn/;

export function tenderFit(text: string, cpv?: string | null): Fit {
  const t = text.toLowerCase();
  const goods = GOODS.filter((g) => g.re.test(t));
  if (!goods.length) return { score: 5, note: "ne prepoznajem opremu iz naše ponude" };

  let score = Math.max(...goods.map((g) => g.score));
  const notes = [goods.filter((g) => g.label !== "geodetska oprema" || goods.length === 1).map((g) => g.label).join(", ")];
  for (const r of RISKS) {
    if (!r.re.test(t)) continue;
    if (r.cap !== undefined) score = Math.min(score, r.cap);
    if (r.minus) score -= r.minus;
    notes.push(r.note);
  }
  if (MOBILE_MAPPING.test(t) && !HANDHELD.test(t) && !notes.includes("sistem za vozilo, nemamo ga u listi")) {
    score = Math.min(score, 60);
    notes.push("proveriti da li je sistem za vozilo");
  }
  if (cpv && SERVICE_CPV.test(cpv) && !SUPPLY.test(t) && !notes.includes("traže usluge, ne robu")) {
    score = Math.min(score, 20);
    notes.push("objavljen kao usluga");
  }
  return { score: Math.max(5, Math.min(95, score)), note: notes.join("; ") };
}
