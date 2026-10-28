// Il registro delle ultime 24 ore, chiesto al cervello quando si apre la sezione.

import { comando } from "../collegamento.js?v=e7c25cc5";
import { icona } from "../icone.js?v=e7c25cc5";
import { ridisegna, stato } from "../stato.js?v=e7c25cc5";
import { apribile, esc, etichetta, maiuscola } from "../utili.js?v=e7c25cc5";

const ICONE = {
  allarme: "scudo", vacanza: "valigia", contatto: "porta", persona: "persona", fumo: "fiamma", acqua: "goccia",
  temperatura: "termometro", bottone: "bottone", luci: "lampadina", avvio: "avvio", dashboard: "scudo",
  simulazione: "scudoOk", sirene: "muto",
};
// "inserito"/"disinserito": nomi usati fino al 27/10/2026, ancora nelle voci vecchie
const PAROLE_ALLARME = { acceso: "acceso", spento: "spento", scattato: "scattato", inserito: "acceso", disinserito: "spento" };

// una riga del registro: [quando, tipo, fonte, testo], come la scrive cervello/casa/registro.py
function voce([quando, tipo, fonte, testo]) {
  const di = `<span class="ora">(${esc(fonte)})</span>`;
  let cosa;
  if (tipo === "allarme") cosa = `Allarme ${esc(PAROLE_ALLARME[testo] || testo)} ${di}`;
  else if (tipo === "contatto") cosa = `${esc(etichetta(fonte))}: ${testo === "True" ? "aperto" : "chiuso"}`;
  else if (tipo === "persona") cosa = `Persona vista: ${esc(fonte)}`;
  else if (tipo === "fumo" || tipo === "acqua") cosa = `${tipo === "fumo" ? "Fumo" : "Acqua"} ${testo === "True" ? "rilevato" : "cessato"}: ${esc(etichetta(fonte))}`;
  else if (tipo === "bottone") cosa = `${esc(etichetta(fonte))} premuto`;
  else if (tipo === "luci") cosa = `Luci ${esc(testo)} ${di}`;
  else if (tipo === "avvio") cosa = `Cervello avviato (${esc(testo)})`;
  else if (tipo === "vacanza") cosa = `Modalità vacanza ${esc(testo)} ${di}`;
  else if (tipo === "simulazione") cosa = `Simulazione ${esc(testo)}: ${esc(fonte)}`;
  else if (tipo === "sirene") cosa = `Sirene: ${esc(testo)} ${di}`;
  else cosa = `${esc(maiuscola(tipo))} · ${esc(etichetta(fonte))}: ${esc(testo)}`;
  const hm = new Date(quando).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `<li><span class="punto">${icona(ICONE[tipo] || "orologio")}</span><div><div class="cosa">${cosa}</div><div class="ora">${hm}</div></div></li>`;
}

export function html() {
  let corpo;
  if (stato.registro == null) corpo = `<p class="vuoto">Carico…</p>`;
  else {
    const voci = [...stato.registro].reverse().map(voce);
    corpo = voci.length ? `<ul class="registro">${voci.join("")}</ul>` : `<p class="vuoto">Niente da segnalare.</p>`;
  }
  const aggiorna = `<div class="azioni sinistra registro-azioni"><button data-azione="aggiorna_registro" class="bottone secondario">${icona("avvio")}Aggiorna</button></div>`;
  return apribile("registro", "Registro", `<div class="scheda scheda-elenco">${corpo}</div>${aggiorna}`, "ultime 24 ore");
}

// una richiesta alla volta: ridisegnando, una sezione già aperta può rimandare "toggle"
let inArrivo = null;
function carica() {
  inArrivo ??= comando("registro")
    .then((voci) => {
      stato.registro = voci;
      ridisegna();
    })
    .finally(() => (inArrivo = null));
  return inArrivo;
}

// all'apertura della sezione (vedi app.js): la prima volta si carica
export async function aperta() {
  if (stato.registro == null) await carica();
}

export const azioni = {
  aggiorna_registro: carica,
};
