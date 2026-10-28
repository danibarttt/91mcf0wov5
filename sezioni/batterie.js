// Batterie: sensori Zigbee (anche bottone e sirene) e camere, prima le più scariche. Le camere
// la dicono quando si svegliano, e il cervello la rilegge con i volumi (ogni 12 ore): per non
// consumarle non si chiede di più.

import { icona } from "../icone.js?v=1e91316d";
import { stato } from "../stato.js?v=1e91316d";
import { apribile, colpoDOcchio, esc, etichetta, pillola } from "../utili.js?v=1e91316d";
import { iconaContatto } from "./sensori.js?v=1e91316d";

export const SCARICA = 15; // %: da qui in giù è scarica (anche nel riepilogo)

export function scarica(d) {
  return Boolean(d.batt_bassa) || (d.batt != null && d.batt <= SCARICA);
}

function iconaSensore(s) {
  if (s.g.includes("porte")) return iconaContatto(s.n);
  if (s.g.includes("fumo")) return "fiamma";
  if (s.g.includes("acqua")) return "goccia";
  if (s.g.includes("temperatura")) return "termometro";
  if (/bottone/i.test(s.n)) return "bottone";
  if (/sirena/i.test(s.n)) return "sirena";
  return "batteria";
}

// tutti i dispositivi che dicono la loro batteria: [{n, batt, batt_bassa, carica, icona}]
export function dispositivi() {
  const sensori = [...stato.sensori.values()]
    .filter((s) => s.batt != null || s.batt_bassa)
    .map((s) => ({ n: etichetta(s.n), batt: s.batt, batt_bassa: s.batt_bassa, icona: iconaSensore(s) }));
  const camere = stato.batterie.map((c) => ({ n: c.n, batt: c.batt, carica: c.carica, icona: "camera" }));
  return [...sensori, ...camere];
}

export function html() {
  const elenco = dispositivi();
  if (!elenco.length) return "";
  elenco.sort((a, b) => (a.batt ?? 0) - (b.batt ?? 0) || a.n.localeCompare(b.n));
  const righe = elenco.map((d) => {
    const chip = `<span class="etichetta ${scarica(d) ? "attenzione" : ""}">${d.batt != null ? `${d.batt}%` : "Scarica"}</span>`;
    const nota = d.carica ? `<span class="quando">in carica</span>` : "";
    return `<li class="${scarica(d) ? "scarica" : ""}"><span class="disco-piccolo">${icona(d.icona)}</span><span class="nome">${esc(d.n)}${nota}</span>${chip}</li>`;
  });
  // a colpo d'occhio: le scariche, o la più bassa
  const scariche = elenco.filter(scarica);
  const piuBassa = elenco.find((d) => d.batt != null);
  const sotto = colpoDOcchio(
    scariche.length
      ? scariche.map((d) => pillola(`${esc(d.n)}${d.batt != null ? ` ${d.batt}%` : ""}`, "batteria", "attenzione"))
      : [pillola("Nessuna scarica", "ok", "ok"), ...(piuBassa ? [pillola(`La più bassa: ${piuBassa.batt}%`, "batteria")] : [])],
  );
  const corpo = `<div class="scheda scheda-elenco"><ul class="elenco">${righe.join("")}</ul></div>`;
  return apribile("batterie", "Batterie", corpo, `${elenco.length} dispositivi`, sotto);
}
