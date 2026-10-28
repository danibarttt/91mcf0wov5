// Le sezioni dei sensori Zigbee, tutte a scomparsa con lo stato a colpo d'occhio: Porte e
// finestre, Fumo e acqua, Temperature. Quali sensori stanno in quale sezione lo decidono le
// liste di config.toml.

import { icona } from "../icone.js?v=3af35656";
import { sensoriDi } from "../stato.js?v=3af35656";
import { apribile, colpoDOcchio, esc, etichetta, gradi, maiuscola, ora, pillola } from "../utili.js?v=3af35656";

const SOGLIA_CALDO = 50; // °C, come soglia_temperatura in config.toml

// ---------- porte e finestre ----------

export function iconaContatto(nome) {
  const n = nome.toLowerCase();
  if (n.includes("inclinazione")) return "garage";
  if (n.includes("persiana")) return "persiana";
  if (n.includes("finestra")) return "finestra";
  return "porta";
}

export function porte() {
  const sensori = sensoriDi("porte");
  if (!sensori.length) return "";
  // prima gli aperti, poi in ordine alfabetico
  sensori.sort((a, b) => Number(Boolean(b.aperto)) - Number(Boolean(a.aperto)) || etichetta(a.n).localeCompare(etichetta(b.n)));
  const righe = sensori.map((s) => {
    const chip =
      s.aperto == null
        ? `<span class="etichetta neutra">—</span>`
        : s.aperto
          ? `<span class="etichetta attenzione">Aperto</span>`
          : `<span class="etichetta">Chiuso</span>`;
    const quando = s.q && s.aperto != null ? `<span class="quando">${s.aperto ? "aperto" : "chiuso"} ${ora(s.q)}</span>` : "";
    return `<li class="${s.aperto ? "aperto" : ""}"><span class="disco-piccolo">${icona(iconaContatto(s.n))}</span><span class="nome">${esc(etichetta(s.n))}${quando}</span>${chip}</li>`;
  });
  const aperti = sensori.filter((s) => s.aperto);
  const sotto = colpoDOcchio(
    aperti.length ? aperti.map((s) => pillola(esc(etichetta(s.n)), iconaContatto(s.n), "attenzione")) : [pillola("Tutto chiuso", "ok", "ok")],
  );
  const corpo = `<div class="scheda scheda-elenco"><ul class="elenco">${righe.join("")}</ul></div>`;
  return apribile("porte", "Porte e finestre", corpo, `${sensori.length} sensori`, sotto);
}

// ---------- fumo e acqua ----------

export function fumoEAcqua() {
  const sensori = [...sensoriDi("fumo"), ...sensoriDi("acqua")];
  if (!sensori.length) return "";
  const tipo = (s) => (s.g.includes("fumo") ? { allarme: s.fumo, nome: "FUMO", icona: "fiamma" } : { allarme: s.acqua, nome: "ACQUA", icona: "goccia" });
  const tessere = sensori.map((s) => {
    const t = tipo(s);
    const valore =
      t.allarme == null
        ? `<div class="valore muto">—</div>`
        : t.allarme
          ? `<div class="valore">${t.nome}</div>`
          : `<div class="valore ok">Tutto ok</div>`;
    const nome = maiuscola(etichetta(s.n).replace(/^(fumo|acqua)\s+/i, ""));
    return `<div class="tessera ${t.allarme ? "pericolo" : ""}"><div class="testa">${icona(t.icona)}${esc(nome)}</div>${valore}</div>`;
  });
  const segnalano = sensori.filter((s) => tipo(s).allarme);
  const sotto = colpoDOcchio(
    segnalano.length ? segnalano.map((s) => pillola(esc(etichetta(s.n)), tipo(s).icona, "pericolo")) : [pillola("Tutto ok", "ok", "ok")],
  );
  return apribile("pericoli", "Fumo e acqua", `<div class="tessere">${tessere.join("")}</div>`, `${sensori.length} sensori`, sotto);
}

// ---------- temperature ----------

export function temperature() {
  const sensori = sensoriDi("temperatura").filter((s) => s.temp != null);
  if (!sensori.length) return "";
  const tessere = sensori.map((s) => {
    const nome = maiuscola(etichetta(s.n).replace(/^temperatura\s+/i, ""));
    return `<div class="tessera ${s.temp >= SOGLIA_CALDO ? "caldo" : ""}"><div class="testa">${icona("termometro")}${esc(nome)}</div><div class="valore">${gradi(s.temp)}<small> °C</small></div></div>`;
  });
  // a colpo d'occhio: l'intervallo, e in rosso i sensori oltre la soglia
  const t = sensori.map((s) => s.temp);
  const min = Math.min(...t), max = Math.max(...t);
  const sotto = colpoDOcchio([
    pillola(`${min === max ? gradi(min) : `${gradi(min)}–${gradi(max)}`} °C`, "termometro"),
    ...sensori.filter((s) => s.temp >= SOGLIA_CALDO).map((s) => pillola(`${esc(etichetta(s.n))}: ${gradi(s.temp)} °C`, "termometro", "pericolo")),
  ]);
  return apribile("temperature", "Temperature", `<div class="tessere">${tessere.join("")}</div>`, `${sensori.length} sensori`, sotto);
}
