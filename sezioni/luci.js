// Le luci: un riquadro per luce (tocco = pannello, pulsante = accendi/spegni), "Spegni luci in
// casa", e il pannello con interruttore e cursori di luminosità, bianco e colore
// (<dialog id="luce"> in index.html).

import { comando } from "../collegamento.js?v=00fc998d";
import { icona } from "../icone.js?v=00fc998d";
import { stato } from "../stato.js?v=00fc998d";
import { $, esc, maiuscola, mostra, sezione } from "../utili.js?v=00fc998d";

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
//
// Lo stato di una luce arriva in ritardo (la transizione, il cervello, il broker in cloud):
// lasciato un cursore, arrivano ancora gli stati dei comandi partiti mentre lo si trascinava.
// Per questo il pannello mostra i valori scelti qui ("scelti") finché la luce non li conferma.

const TIENI_MS = 1500; // dopo l'ultima risposta del cervello, i valori scelti restano comunque
const MASSIMO_MS = 6000; // dall'ultimo tocco: poi vince lo stato della luce, confermato o no

let aperta = null; // id della luce nel pannello
let scelti = {}; // campo ("acceso", "lum", "k", "h", "modo") -> valore scelto nel pannello
let ultimaScelta = 0;
let inAttesa = 0; // comandi partiti senza risposta
let ultimaRisposta = 0;
let rilettura = null;

function apriPannello(id) {
  aperta = id;
  scelti = {};
  aggiornaPannello();
  $("luce").showModal();
}

// la luce riporta valori arrotondati (Matter usa 254 passi e i mireds)
function confermato(campo, vero, voluto) {
  if (vero == null) return false;
  if (campo === "lum") return Math.abs(vero - voluto) <= 1;
  if (campo === "k") return Math.abs(vero - voluto) <= 60;
  if (campo === "h") return Math.abs(((vero - voluto + 540) % 360) - 180) <= 2;
  return vero === voluto;
}

// la luce come va mostrata: lo stato arrivato, con sopra i valori scelti non ancora confermati
function mostrata(l) {
  const ora = Date.now();
  if (ora > ultimaScelta + MASSIMO_MS) scelti = {};
  else if (!inAttesa && ora > ultimaRisposta + TIENI_MS) {
    for (const c of Object.keys(scelti)) if (confermato(c, l[c], scelti[c])) delete scelti[c];
  }
  return { ...l, ...scelti };
}

// ridisegna quando i valori scelti smettono di contare, anche se non arriva niente
function rileggiPiuTardi() {
  clearTimeout(rilettura);
  if (!Object.keys(scelti).length) return;
  // alla fine di TIENI_MS si guarda se la luce ha confermato; poi conta solo MASSIMO_MS
  // (ogni stato nuovo ridisegna già da sé, vedi app.js)
  const ora = Date.now();
  const fineTieni = ultimaRisposta + TIENI_MS;
  const quando = !inAttesa && ora < fineTieni ? fineTieni : ultimaScelta + MASSIMO_MS;
  rilettura = setTimeout(aggiornaPannello, Math.max(0, quando - ora) + 50);
}

function imposta(input, valore) {
  if (input.value !== String(valore)) input.value = valore; // mai sotto il dito, se non cambia
}

// a ogni aggiornamento delle luci (vedi app.js)
export function aggiornaPannello() {
  const vera = aperta && stato.luci.find((x) => x.id === aperta);
  if (!vera) return;
  const l = mostrata(vera);
  const c = colore(l);
  $("luce-nome").textContent = nome(l);
  $("luce-stato").textContent = descrizione(l);
  const ic = $("luce-icona");
  ic.innerHTML = icona("lampadina");
  ic.dataset.accesa = l.acceso ? "1" : "0";
  ic.style.setProperty("--colore", c);
  $("luce").classList.toggle("spenta", !l.acceso);
  $("luce-lum").style.setProperty("--colore", c);
  $("luce-accesa").checked = Boolean(l.acceso);
  imposta($("luce-lum"), l.lum ?? 100);
  $("luce-k").min = l.kmin ?? 2500;
  $("luce-k").max = l.kmax ?? 6500;
  imposta($("luce-k"), l.k ?? 2700);
  imposta($("luce-h"), l.h ?? 30);
  // il cursore del modo attuale (bianco o colore) è pieno, l'altro sbiadito
  $("luce-k").closest(".cursore").classList.toggle("sbiadito", l.modo === "colore");
  $("luce-h").closest(".cursore").classList.toggle("sbiadito", l.modo !== "colore");
  etichetteCursori();
  rileggiPiuTardi();
}

function etichetteCursori() {
  $("luce-lum-v").textContent = `${$("luce-lum").value}%`;
  $("luce-k-v").textContent = `${$("luce-k").value} K`;
  $("luce-h-v").textContent = `${$("luce-h").value}°`;
}

// un valore scelto nel pannello: si mostra subito e si manda alla luce
function scegli(campi) {
  scelti = { ...scelti, ...campi };
  ultimaScelta = Date.now();
  aggiornaPannello();
}

function manda(luce, dati) {
  inAttesa++;
  comando("luce", { luce, ...dati })
    .catch((e) => {
      scelti = {}; // non è andato: si torna a mostrare la luce com'è
      mostra(e.message, true);
    })
    .finally(() => {
      inAttesa--;
      ultimaRisposta = Date.now();
      aggiornaPannello();
    });
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
    if (luce && dati) manda(luce, dati);
  }, CURSORE_OGNI_MS);
}

function cursore(input, campo) {
  input.addEventListener("input", () => {
    const v = Number(input.value);
    // un cursore accende la luce; scegliere un bianco o un colore la porta in quel modo
    if (campo === "k") {
      delete scelti.h;
      scegli({ acceso: true, k: v, modo: "bianco" });
      invia({ k: v, h: undefined });
    } else if (campo === "h") {
      delete scelti.k;
      scegli({ acceso: true, h: v, modo: "colore" });
      invia({ h: v, k: undefined });
    } else {
      scegli({ acceso: true, lum: v });
      invia({ lum: v });
    }
  });
}

cursore($("luce-lum"), "lum");
cursore($("luce-k"), "k");
cursore($("luce-h"), "h");
$("luce-accesa").addEventListener("change", (e) => {
  scegli({ acceso: e.target.checked });
  manda(aperta, { accesa: e.target.checked });
});
$("luce-chiudi").addEventListener("click", () => $("luce").close());
$("luce").addEventListener("close", () => {
  aperta = null;
  scelti = {};
  clearTimeout(rilettura);
});
