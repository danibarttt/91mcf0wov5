// Le luci: un riquadro per luce (tocco = pannello, pulsante = accendi/spegni), "Spegni luci in
// casa", e il pannello con interruttore e cursori di luminosità, bianco e colore
// (<dialog id="luce"> in index.html).

import { comando } from "../collegamento.js?v=a51d589d";
import { icona } from "../icone.js?v=a51d589d";
import { stato } from "../stato.js?v=a51d589d";
import { $, esc, maiuscola, mostra, sezione } from "../utili.js?v=a51d589d";

const CURSORE_OGNI_MS = 250; // mentre si trascina un cursore, al massimo un comando ogni tanto

// "Luce sala" -> "Sala"
function nome(l) {
  return maiuscola(String(l.n).replace(/^luce\s+/i, ""));
}

function descrizione(l) {
  if (l.acceso == null) return "Non risponde";
  if (!l.acceso) return "Spenta";
  return `Accesa${l.lum != null ? ` · ${l.lum}%` : ""}`;
}

// il colore della lampadina in CSS: tonalità piena, o il bianco della sua temperatura
function colore(l) {
  if (l.modo === "colore" && l.h != null) return `hsl(${l.h} 95% 58%)`;
  if (l.k) return kelvinInRgb(l.k);
  return "#ffd27a";
}

function kelvinInRgb(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = (v) => Math.round(Math.max(0, Math.min(255, v)));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

// ---------- riquadri ----------

export function html() {
  if (!stato.luci.length) return "";
  const riquadri = stato.luci.map((l) => {
    const muta = l.acceso == null;
    const pulsante = muta
      ? ""
      : `<button class="accensione" data-azione="accendi_spegni" data-id="${esc(l.id)}" data-accesa="${l.acceso ? "0" : "1"}" aria-label="${l.acceso ? "Spegni" : "Accendi"}">${icona("accensione")}</button>`;
    return `
      <div class="luce ${muta ? "muta" : ""}" ${muta ? "" : `data-azione="apri_luce" role="button" tabindex="0"`} data-id="${esc(l.id)}" data-accesa="${l.acceso ? "1" : "0"}" data-colore="${esc(colore(l))}">
        <div class="riga"><span class="icona-luce">${icona("lampadina")}</span>${pulsante}</div>
        <div><div class="nome">${esc(nome(l))}</div><div class="stato">${descrizione(l)}</div></div>
      </div>`;
  });
  const nota = stato.luci.some((l) => l.acceso) ? `<button data-azione="spegni_luci" class="bottone-testo">Spegni luci in casa</button>` : "";
  return sezione("Luci", `<div class="luci">${riquadri.join("")}</div>`, nota);
}

export const azioni = {
  async apri_luce(el) {
    apriPannello(el.dataset.id);
  },
  async accendi_spegni(el) {
    await comando("luce", { luce: el.dataset.id, accesa: el.dataset.accesa === "1" });
  },
  async spegni_luci() {
    await comando("spegni_luci");
    mostra("Luci spente");
  },
};

// ---------- pannello di una luce ----------

let aperta = null; // id della luce nel pannello
let trascinando = false; // finché si trascina, i cursori non seguono lo stato che arriva

function apriPannello(id) {
  aperta = id;
  aggiornaPannello(true);
  $("luce").showModal();
}

// a ogni aggiornamento delle luci (vedi app.js)
export function aggiornaPannello(forza = false) {
  const l = aperta && stato.luci.find((x) => x.id === aperta);
  if (!l) return;
  const c = colore(l);
  $("luce-nome").textContent = nome(l);
  $("luce-stato").textContent = descrizione(l);
  const ic = $("luce-icona");
  ic.innerHTML = icona("lampadina");
  ic.dataset.accesa = l.acceso ? "1" : "0";
  ic.style.setProperty("--colore", c);
  $("luce").classList.toggle("spenta", !l.acceso);
  $("luce-lum").style.setProperty("--colore", c);
  if (trascinando && !forza) return; // non spostare il cursore sotto il dito
  $("luce-accesa").checked = Boolean(l.acceso);
  $("luce-lum").value = l.lum ?? 100;
  $("luce-k").min = l.kmin ?? 2500;
  $("luce-k").max = l.kmax ?? 6500;
  $("luce-k").value = l.k ?? 2700;
  $("luce-h").value = l.h ?? 30;
  // il cursore del modo attuale (bianco o colore) è pieno, l'altro sbiadito
  $("luce-k").closest(".cursore").classList.toggle("sbiadito", l.modo === "colore");
  $("luce-h").closest(".cursore").classList.toggle("sbiadito", l.modo !== "colore");
  etichetteCursori();
}

function etichetteCursori() {
  $("luce-lum-v").textContent = `${$("luce-lum").value}%`;
  $("luce-k-v").textContent = `${$("luce-k").value} K`;
  $("luce-h-v").textContent = `${$("luce-h").value}°`;
}

// mentre si trascina: al massimo un comando ogni CURSORE_OGNI_MS, con gli ultimi valori
let inSospeso = null;
let timer = null;
function invia(campi) {
  inSospeso = { ...inSospeso, ...campi };
  if (timer) return;
  timer = setTimeout(() => {
    const luce = aperta, dati = inSospeso;
    inSospeso = null;
    timer = null;
    if (luce && dati) comando("luce", { luce, ...dati }).catch((e) => mostra(e.message, true));
  }, CURSORE_OGNI_MS);
}

function cursore(input, campo) {
  const inizio = () => (trascinando = true);
  input.addEventListener("pointerdown", inizio);
  input.addEventListener("touchstart", inizio, { passive: true });
  input.addEventListener("input", () => {
    etichetteCursori();
    const v = Number(input.value);
    // scegliere un bianco o un colore porta la luce in quel modo
    if (campo === "k") invia({ k: v, h: undefined });
    else if (campo === "h") invia({ h: v, k: undefined });
    else invia({ lum: v });
  });
  input.addEventListener("change", () => setTimeout(() => (trascinando = false), CURSORE_OGNI_MS * 2));
}

cursore($("luce-lum"), "lum");
cursore($("luce-k"), "k");
cursore($("luce-h"), "h");
$("luce-accesa").addEventListener("change", (e) => {
  comando("luce", { luce: aperta, accesa: e.target.checked }).catch((err) => mostra(err.message, true));
});
$("luce-chiudi").addEventListener("click", () => $("luce").close());
$("luce").addEventListener("close", () => {
  aperta = null;
  trascinando = false;
});
