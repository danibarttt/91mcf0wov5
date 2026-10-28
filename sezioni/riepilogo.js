// Sotto l'allarme: le pillole del riepilogo (aperti, luci, temperature, vacanza, pericolo) e
// la scheda degli avvisi (fumo, acqua, batterie scariche) con "Zittisci sirene".

import { comando } from "../collegamento.js?v=1e7bbf3b";
import { icona } from "../icone.js?v=1e7bbf3b";
import { sensoriDi, stato } from "../stato.js?v=1e7bbf3b";
import { esc, etichetta, gradi, mostra, pillola } from "../utili.js?v=1e7bbf3b";

const BATTERIA_SCARICA = 15; // %

export function html() {
  return pillole() + avvisi();
}

function pillole() {
  const p = [];
  const sensori = [...stato.sensori.values()];
  if (sensori.some((s) => s.fumo || s.acqua)) p.push(pillola("Pericolo", "attenzione", "pericolo"));
  if (stato.allarme.vacanza) p.push(pillola("In vacanza", "valigia", "vacanza"));
  if (stato.sirene?.prova) p.push(pillola("Sirene al minimo (simulazione)", "muto", "attenzione"));
  else if (stato.sirene?.elenco.some((x) => x.ok === false)) p.push(pillola("Sirene da controllare", "attenzione", "attenzione"));
  const aperti = sensoriDi("porte").filter((s) => s.aperto).length;
  p.push(aperti ? pillola(aperti === 1 ? "1 aperto" : `${aperti} aperti`, "porta", "attenzione") : pillola("Tutto chiuso", "ok", "ok"));
  if (stato.luci.length) {
    const accese = stato.luci.filter((l) => l.acceso).length;
    p.push(pillola(accese ? `${accese} ${accese === 1 ? "luce accesa" : "luci accese"}` : "Luci spente", "lampadina", "luminosa"));
  }
  const t = sensoriDi("temperatura").map((s) => s.temp).filter((v) => v != null);
  if (t.length) {
    const min = Math.min(...t), max = Math.max(...t);
    p.push(pillola(`${min === max ? gradi(min) : `${gradi(min)}–${gradi(max)}`} °C`, "termometro"));
  }
  return `<div class="riepilogo">${p.join("")}</div>`;
}

function avvisi() {
  const sensori = [...stato.sensori.values()];
  const pericoli = sensori.filter((s) => s.fumo || s.acqua);
  const batterie = sensori.filter((s) => s.batt_bassa || (s.batt != null && s.batt <= BATTERIA_SCARICA));
  if (!pericoli.length && !batterie.length) return "";
  const righe = [
    ...pericoli.map((s) => `<li>${icona(s.fumo ? "fiamma" : "goccia")}${s.fumo ? "Fumo" : "Acqua"}: ${esc(etichetta(s.n))}</li>`),
    ...batterie.map((s) => `<li>${icona("batteria")}Batteria scarica: ${esc(etichetta(s.n))}${s.batt != null ? ` (${s.batt}%)` : ""}</li>`),
  ];
  const zittisci = pericoli.length
    ? `<div class="azioni"><button data-azione="zittisci_sirene" class="bottone pericolo">${icona("muto")}Zittisci sirene</button></div>`
    : "";
  return `<section class="scheda avvisi ${pericoli.length ? "grave" : ""}"><ul>${righe.join("")}</ul>${zittisci}</section>`;
}

export const azioni = {
  async zittisci_sirene() {
    await comando("zittisci_sirene");
    mostra("Sirene zittite");
  },
};
