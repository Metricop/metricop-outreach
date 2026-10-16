// Vokativ srpskih imena za pozdrav ("Zdravo, Nenade,"). Samo proverena imena: za ime koga nema u spisku
// polje {{vokativ}} ostaje prazno i pozdrav je samo "Zdravo,", da nikad ne pošaljemo pogrešan oblik.

const VOCATIVE: Record<string, string> = {
  Aleksandar: "Aleksandre", Anđelko: "Anđelko", Biljana: "Biljana", Blagoje: "Blagoje", Boban: "Bobane",
  Bogdan: "Bogdane", Bojan: "Bojane", Boris: "Borise", Borislav: "Borislave", Borivoje: "Borivoje",
  Božidar: "Božidare", Branislav: "Branislave", Branko: "Branko", Bratimir: "Bratimire", Bratislav: "Bratislave",
  Časlav: "Časlave", Čedomir: "Čedomire", Dalibor: "Dalibore", Daliborka: "Daliborka", Damjan: "Damjane",
  Dane: "Dane", Danijela: "Danijela", Danilo: "Danilo", Darko: "Darko", Dejan: "Dejane", Dimitrije: "Dimitrije",
  Dobrila: "Dobrila", Dora: "Dora", Đorđe: "Đorđe", Dragan: "Dragane", Dragiša: "Dragiša", Dragoje: "Dragoje",
  Dragoslav: "Dragoslave", Dragutin: "Dragutine", Dubravko: "Dubravko", Đurica: "Đurice", Dušan: "Dušane",
  Duško: "Duško", Elizabeta: "Elizabeta", Emina: "Emina", Filip: "Filipe", Gojko: "Gojko", Goran: "Gorane",
  Gordana: "Gordana", Gorica: "Gorice", Gradimir: "Gradimire", Grujica: "Grujice", Igor: "Igore", Ilija: "Ilija",
  Ivan: "Ivane", Ivana: "Ivana", Ivica: "Ivice", Jadranka: "Jadranka", Janka: "Janka", Janko: "Janko",
  Jelena: "Jelena", Jelica: "Jelice", Jovan: "Jovane", Jovana: "Jovana", Jovica: "Jovice", Kornelija: "Kornelija",
  Lazar: "Lazare", Lazo: "Lazo", Lidija: "Lidija", Ljiljana: "Ljiljana", Ljubinko: "Ljubinko", Ljubiša: "Ljubiša",
  Ljubo: "Ljubo", Ljubodrag: "Ljubodraže", Luka: "Luka", Maja: "Maja", Marijan: "Marijane", Marina: "Marina",
  Marjan: "Marjane", Marko: "Marko", Mikica: "Mikice", Milan: "Milane", Milena: "Milena", Milenko: "Milenko",
  Mileta: "Mileta", Milica: "Milice", Milinko: "Milinko", Milivoj: "Milivoje", Milorad: "Milorade", Miloš: "Miloše",
  Milovan: "Milovane", Milutin: "Milutine", Miodrag: "Miodraže", Miomir: "Miomire", Mirjana: "Mirjana",
  Mirko: "Mirko", Miroslav: "Miroslave", Miša: "Miša", Mladen: "Mladene", Momčilo: "Momčilo", Momir: "Momire",
  Monika: "Monika", Nadica: "Nadice", Nebojša: "Nebojša", Nemanja: "Nemanja", Nenad: "Nenade", Nevena: "Nevena",
  Nikola: "Nikola", Paun: "Paune", Pavle: "Pavle", Petar: "Petre", Predrag: "Predraže", Pribislav: "Pribislave",
  Radan: "Radane", Rađan: "Rađane", Rade: "Rade", Radiša: "Radiša", Radisav: "Radisave", Radivoj: "Radivoje",
  Radmila: "Radmila", Radmilo: "Radmilo", Radojica: "Radojice", Radojka: "Radojka", Radomir: "Radomire",
  Radosav: "Radosave", Radoslav: "Radoslave", Radovan: "Radovane", Rajko: "Rajko", Ranisav: "Ranisave",
  Ranko: "Ranko", Rastko: "Rastko", Rodoljub: "Rodoljube", Ružica: "Ružice", Sanja: "Sanja", Saša: "Saša",
  Siniša: "Siniša", Slađan: "Slađane", Slađana: "Slađana", Slavica: "Slavice", Slaviša: "Slaviša", Slavko: "Slavko",
  Slavoljub: "Slavoljube", Slobodan: "Slobodane", Snežana: "Snežana", Srbislav: "Srbislave", Srđan: "Srđane",
  Sreten: "Sretene", Stefan: "Stefane", Stevan: "Stevane", Stevo: "Stevo", Stojan: "Stojane", Strahinja: "Strahinja",
  Suzana: "Suzana", Tomislav: "Tomislave", Toplica: "Toplice", Uroš: "Uroše", Vanja: "Vanja", Veličko: "Veličko",
  Velimir: "Velimire", Velizar: "Velizare", Veljko: "Veljko", Verica: "Verice", Viktor: "Viktore", Vladan: "Vladane",
  Vladanko: "Vladanko", Vladimir: "Vladimire", Vlado: "Vlado", Vojislav: "Vojislave", Vojkan: "Vojkane",
  Vučko: "Vučko", Vujadin: "Vujadine", Vuk: "Vuče", Žarko: "Žarko", Želimir: "Želimire", Željko: "Željko",
  Živko: "Živko", Života: "Života", Zlatko: "Zlatko", Zoran: "Zorane", Zvezdan: "Zvezdane", Zvonko: "Zvonko",
};

/** Vokativ imena ("Nenad" → "Nenade"), ili prazno ako ime nije u proverenom spisku. */
export function vocative(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  const key = n.charAt(0).toLocaleUpperCase("sr") + n.slice(1).toLocaleLowerCase("sr");
  return VOCATIVE[key] ?? "";
}
