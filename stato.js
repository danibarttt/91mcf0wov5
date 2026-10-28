// Ciò che la pagina sa della casa: lo riempie collegamento.js con i messaggi del cervello,
// le sezioni lo leggono per disegnarsi. Formato dei messaggi in
// cervello/casa/dashboard/__init__.py.

export const stato = {
  collegamento: "collegamento", // "collegamento" | "collegato" | "scollegato"
  motivo: "", // perché è scollegato (es. "credenziali rifiutate")
  cervello: null, // {online, dal}
  allarme: null, // {stato: "spento"|"acceso"|"scattato", perche, dal, vacanza, orari}
  camere: [], // [{c, n}]
  luci: [], // [{id, n, acceso, lum, modo, k, h, kmin, kmax}]
  sirene: null, // {letto, prova, elenco: [{n, ok, d}]}
  suonano: [], // le sirene che suonano adesso: [{n, fino?, errore?}]
  batterie: [], // le camere a batteria: [{c, n, batt, carica}] (quelle Zigbee stanno in sensori)
  muti: [], // i sensori che non si fanno sentire da troppo (forse morti): [{n, visto}]
  sensori: new Map(), // id -> {n, g: [gruppi], aperto, fumo, acqua, temp, batt, batt_bassa, q}
  foto: new Map(), // canale -> URL dell'ultima foto
  registro: null, // [[quando, tipo, fonte, testo]], caricato all'apertura della sezione
};

// sensori di una sezione: "porte", "fumo", "acqua", "temperatura" ("altri": bottone e sirene)
export function sensoriDi(gruppo) {
  return [...stato.sensori.values()].filter((s) => s.g.includes(gruppo));
}

// chi cambia `stato` fuori dai messaggi del cervello (es. il registro appena caricato) chiama
// ridisegna(); app.js dice come
let disegna = () => {};
export function quandoRidisegnare(fn) {
  disegna = fn;
}
export function ridisegna() {
  disegna();
}
