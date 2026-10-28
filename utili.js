// Pezzi usati da più sezioni: testo, orari, avvisi, conferme e sezioni a scomparsa.

import { icona } from "./icone.js?v=00fc998d";

export const $ = (id) => document.getElementById(id);

// testo dentro l'HTML: sempre passando di qui
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function maiuscola(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Sensore porta ingresso" -> "Porta ingresso"
export function etichetta(nome) {
  return maiuscola(String(nome).replace(/^sensore\s+/i, ""));
}

// "alle 14:05", "ieri alle 9:30", "il 3/10 alle 8:00"
export function ora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hm = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const oggi = new Date();
  if (d.toDateString() === oggi.toDateString()) return `alle ${hm}`;
  const ieri = new Date(oggi);
  ieri.setDate(oggi.getDate() - 1);
  if (d.toDateString() === ieri.toDateString()) return `ieri alle ${hm}`;
  return `il ${d.toLocaleDateString("it-IT", { day: "numeric", month: "numeric" })} alle ${hm}`;
}

export function gradi(v) {
  return v.toLocaleString("it-IT");
}

// avviso in basso per qualche secondo
export function mostra(testo, errore = false) {
  const el = $("avviso");
  el.textContent = testo;
  el.className = errore ? "avviso errore" : "avviso";
  el.hidden = false;
  clearTimeout(mostra.timer);
  mostra.timer = setTimeout(() => (el.hidden = true), errore ? 5000 : 2500);
}

// conferma contro i tocchi per sbaglio (niente PIN: basta essere abbinati); true = confermato
export function conferma(titolo, bottone, pericolo = false, testo = "") {
  const d = $("conferma");
  $("conferma-titolo").textContent = titolo;
  $("conferma-testo").textContent = testo;
  $("conferma-testo").hidden = !testo;
  $("conferma-ok").textContent = bottone;
  $("conferma-ok").className = `bottone ${pericolo ? "pericolo" : "primario"}`;
  d.returnValue = "";
  d.showModal();
  return new Promise((ok) => d.addEventListener("close", () => ok(d.returnValue === "ok"), { once: true }));
}

// ---------- sezioni ----------

export function sezione(titolo, corpo, nota = "") {
  return `<section class="sezione"><div class="sezione-testa"><h2>${titolo}</h2>${nota ? `<span class="nota">${nota}</span>` : ""}</div>${corpo}</section>`;
}

// sezioni a scomparsa aperte (all'avvio tutte chiuse; la pagina si ridisegna a ogni messaggio
// e deve ricordarsele). Le aggiorna app.js all'evento "toggle".
export const sezioniAperte = new Set();

// sezione a scomparsa: "sotto" resta visibile anche da chiusa (lo stato a colpo d'occhio)
export function apribile(id, titolo, corpo, nota = "", sotto = "") {
  const aperta = sezioniAperte.has(id) ? "open" : "";
  return `<details class="sezione apribile" data-sezione="${id}" ${aperta}>
    <summary><div class="sezione-testa"><h2>${titolo}</h2><span class="nota">${nota}${icona("giu", "freccia")}</span></div>${sotto}</summary>
    ${corpo}
  </details>`;
}

// riga di pillole sotto il titolo di una sezione chiusa
export function colpoDOcchio(pillole) {
  return `<div class="colpo-occhio">${pillole.join("")}</div>`;
}

export function pillola(testo, simbolo, tipo = "") {
  return `<span class="pillola ${tipo}">${icona(simbolo)}${testo}</span>`;
}
