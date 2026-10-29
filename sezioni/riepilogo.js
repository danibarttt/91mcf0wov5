// Sotto l'allarme: le pillole del riepilogo (pre-allarme, sirene, aperti, luci, temperature,
// vacanza, pericolo) e la scheda degli avvisi (pre-allarme delle persiane, sirene che suonano,
// fumo, acqua, batterie scariche di sensori e camere, sensori muti) con "Zittisci sirene".

import { comando } from "../collegamento.js?v=3ea7d1f2";
import { icona } from "../icone.js?v=3ea7d1f2";
import { sensoriDi, stato } from "../stato.js?v=3ea7d1f2";
import { esc, etichetta, gradi, mostra, ora, pillola } from "../utili.js?v=3ea7d1f2";
import * as batterie from "./batterie.js?v=3ea7d1f2";

export function html() {
  return pillole() + avvisi();
}

function pillole() {
  const p = [];
  const sensori = [...stato.sensori.values()];
  if (stato.allarme.preallarme) p.push(pillola("Pre-allarme persiane", "sirena", "pericolo"));
  if (stato.suonano.length) p.push(pillola("Sirene in funzione", "sirena", "pericolo"));
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
  const scariche = batterie.dispositivi().filter(batterie.scarica);
  const suonano = stato.suonano;
  const muti = stato.muti;
  const pre = stato.allarme.preallarme;
  if (!pre && !suonano.length && !pericoli.length && !scariche.length && !muti.length) return "";
  const righe = [
    ...(pre ? [`<li class="preallarme">${icona("sirena")}<span>Pre-allarme persiane: ${esc(etichetta(pre.causa))}<span class="nota">suonano le camere, finisce da solo ${esc(ora(pre.fino))}</span></span></li>`] : []),
    ...suonano.map((x) => `<li>${icona("sirena")}<span>Suona: ${esc(etichetta(x.n))}<span class="nota">${esc(comeFinisce(x))}</span></span></li>`),
    ...pericoli.map((s) => `<li>${icona(s.fumo ? "fiamma" : "goccia")}${s.fumo ? "Fumo" : "Acqua"}: ${esc(etichetta(s.n))}</li>`),
    ...scariche.map((d) => `<li>${icona("batteria")}Batteria scarica: ${esc(d.n)}${d.batt != null ? ` (${d.batt}%)` : ""}</li>`),
    ...muti.map((m) => `<li>${icona("attenzione")}<span>Non si sente: ${esc(etichetta(m.n))}<span class="nota">${m.visto ? `ultima volta ${esc(ora(m.visto))}` : "mai sentito"}</span></span></li>`),
  ];
  const grave = pre || suonano.length || pericoli.length;
  const zittisci = grave
    ? `<div class="azioni"><button data-azione="zittisci_sirene" class="bottone pericolo">${icona("muto")}Zittisci sirene</button></div>`
    : "";
  return `<section class="scheda avvisi ${grave ? "grave" : ""}"><ul>${righe.join("")}</ul>${zittisci}</section>`;
}

// una sirena del Hub o Zigbee si ferma da sola a una certa ora; quelle delle camere no
function comeFinisce(x) {
  if (x.errore) return x.errore;
  return x.fino ? `si ferma da sola ${ora(x.fino)}` : "finché non si spegne";
}

export const azioni = {
  async zittisci_sirene() {
    await comando("zittisci_sirene");
    mostra("Sirene zittite");
  },
};
