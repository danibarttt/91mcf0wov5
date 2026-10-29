// Il registro delle ultime 24 ore, chiesto al cervello a ogni apertura della sezione e col
// pulsante "Aggiorna" in cima.

import { comando } from "../collegamento.js?v=47ec85e7";
import { icona } from "../icone.js?v=47ec85e7";
import { ridisegna, stato } from "../stato.js?v=47ec85e7";
import { apribile, esc, etichetta, maiuscola } from "../utili.js?v=47ec85e7";

const ICONE = {
  allarme: "scudo", vacanza: "valigia", contatto: "porta", persona: "persona", fumo: "fiamma", acqua: "goccia",
  temperatura: "termometro", bottone: "bottone", luci: "lampadina", avvio: "avvio", dashboard: "scudo",
  simulazione: "scudoOk", sirene: "muto", preallarme: "sirena",
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
  else if (tipo === "preallarme") cosa = `Pre-allarme persiane ${esc(testo)} ${di}`;
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
  const quando = registroDelle ? `Aggiornato alle ${registroDelle.toLocaleTimeString("it-IT")}` : "";
  const testa = `<div class="registro-testa"><span class="nota">${quando}</span><button data-azione="aggiorna_registro" class="bottone secondario">${icona("aggiorna")}Aggiorna</button></div>`;
  return apribile("registro", "Registro", `${testa}<div class="scheda scheda-elenco">${corpo}</div>`, "ultime 24 ore");
}

// una richiesta alla volta: ridisegnando, una sezione già aperta può rimandare "toggle"
let inArrivo = null;
let registroDelle = null; // quando è arrivato quello mostrato
function carica() {
  inArrivo ??= comando("registro")
    .then((voci) => {
      stato.registro = voci;
      registroDelle = new Date();
      ridisegna();
    })
    .finally(() => (inArrivo = null));
  return inArrivo;
}

// a ogni apertura della sezione (vedi app.js); intanto resta quello di prima
export async function aperta() {
  await carica();
}

export const azioni = {
  aggiorna_registro: carica,
};
