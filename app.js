// Dashboard di casa. Tutto ciò che arriva e parte passa dal broker MQTT in cloud cifrato
// end-to-end (cifra.js): la pagina non contiene dati, li riceve dal brain. Protocollo in
// brain/casa_brain/dashboard.py.

import { Mqtt } from "./mqtt.js?v=d0788d1c";
import { importaChiave, cifra, decifra } from "./cifra.js?v=d0788d1c";
import { icona } from "./icone.js?v=d0788d1c";

const ARCHIVIO = "casa";
const PORTA_WS = 8084;
const DIRETTA_RINNOVO_MS = 30000; // il brain la ferma dopo 60 s senza rinnovo
const DIRETTA_MAX_MS = 5 * 60000; // e il telefono comunque dopo 5 minuti
const CURSORE_OGNI_MS = 250; // comandi alle luci mentre si trascina un cursore

const enc = new TextEncoder();
const dec = new TextDecoder();
const $ = (id) => document.getElementById(id);

const stato = {
  collegamento: "collegamento",
  motivo: "",
  brain: null, // {online, dal}
  allarme: null, // {stato, perche, dal}
  camere: [], // [{c, n}]
  luci: [], // [{id, n, acceso, lum, modo, k, h, kmin, kmax}]
  sensori: new Map(), // id -> {n, g, aperto, fumo, acqua, temp, batt, batt_bassa, q}
  foto: new Map(), // canale -> objectURL
  registro: null,
  abbinato: null, // codice appena abbinato dal QR (per copiarlo nell'app su iPhone)
};

let config = null;
let chiave = null;
let client = null;
let P = "casa"; // prefisso dei topic (le prove ne usano un altro)
const inAttesa = new Map(); // id comando -> {resolve, reject, timer}
let visore = null; // {c, diretta, rinnovo, fine}
let foglioLuce = null; // id della luce aperta nel pannello
let trascinando = false;
// sezioni a scomparsa aperte (all'avvio tutte chiuse; la pagina si ridisegna a ogni messaggio)
const sezioniAperte = new Set();

// ---------- utilità ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function casuale(byte = 12) {
  return Array.from(crypto.getRandomValues(new Uint8Array(byte)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function maiuscola(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function etichetta(nome) {
  return maiuscola(String(nome).replace(/^sensore\s+/i, ""));
}

function nomeLuce(nome) {
  return maiuscola(String(nome).replace(/^luce\s+/i, ""));
}

function ora(iso) {
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

function mostra(testo, errore = false) {
  const el = $("avviso");
  el.textContent = testo;
  el.className = errore ? "avviso errore" : "avviso";
  el.hidden = false;
  clearTimeout(mostra.timer);
  mostra.timer = setTimeout(() => (el.hidden = true), errore ? 5000 : 2500);
}

// colore di una lampadina in CSS: tonalità piena, o il bianco della sua temperatura
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

function coloreLuce(l) {
  if (l.modo === "colore" && l.h != null) return `hsl(${l.h} 95% 58%)`;
  if (l.k) return kelvinInRgb(l.k);
  return "#ffd27a";
}

// la CSP vieta gli stili in linea: i colori dei dati si impostano da qui
function applicaColori(radice) {
  for (const el of radice.querySelectorAll("[data-colore]")) el.style.setProperty("--colore", el.dataset.colore);
}

// ---------- abbinamento ----------

function leggiConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(ARCHIVIO));
    return c && c.h && c.u && c.p && c.k ? c : null;
  } catch {
    return null;
  }
}

function decodificaCodice(testo) {
  let t = testo.trim();
  const m = t.match(/#c=([A-Za-z0-9_-]+)/);
  if (m) t = m[1];
  t = t.replace(/-/g, "+").replace(/_/g, "/");
  t += "=".repeat((4 - (t.length % 4)) % 4);
  const c = JSON.parse(atob(t));
  if (!c.h || !c.u || !c.p || !c.k) throw new Error("codice incompleto");
  return c;
}

function codiceDa(c) {
  const dati = { h: c.h, u: c.u, p: c.p, k: c.k, ...(c.t ? { t: c.t } : {}) };
  return btoa(String.fromCharCode(...enc.encode(JSON.stringify(dati)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function abbina(testo) {
  const c = decodificaCodice(testo);
  localStorage.setItem(ARCHIVIO, JSON.stringify(c));
  chiediPersistenza();
  return c;
}

// chiede al browser di non cancellare mai i dati del sito (abbinamento compreso)
function chiediPersistenza() {
  navigator.storage?.persist?.().catch(() => {});
}

// ---------- collegamento ----------

async function collega() {
  P = config.t || "casa";
  chiave = await importaChiave(config.k);
  client = new Mqtt({
    url: `wss://${config.h}:${PORTA_WS}/mqtt`,
    clientId: `casa-web-${casuale(5)}`,
    utente: config.u,
    password: config.p,
    argomenti: ["brain", "allarme", "camere", "luci", "risposte", "sensori/+", "foto/+"].map((t) => `${P}/${t}`),
    onMessaggio: (topic, payload) => messaggio(topic, payload).catch((e) => console.error(topic, e)),
    onStato: (s, motivo) => {
      stato.collegamento = s;
      stato.motivo = motivo || "";
      aggiornaCollegamento();
      if (!stato.allarme) disegna(); // aggiorna il testo sotto lo spinner
    },
  });
  client.apri();
}

async function messaggio(topic, payload) {
  let dati;
  try {
    dati = await decifra(chiave, topic, payload);
  } catch {
    return; // non cifrato con la nostra chiave: lo ignoriamo
  }
  const t = topic.slice(P.length + 1);
  if (t.startsWith("foto/")) {
    const c = Number(t.split("/")[1]);
    const prima = stato.foto.get(c);
    stato.foto.set(c, URL.createObjectURL(new Blob([dati], { type: "image/jpeg" })));
    if (prima) setTimeout(() => URL.revokeObjectURL(prima), 2000);
    aggiornaVisore();
    disegna();
    return;
  }
  const obj = JSON.parse(dec.decode(dati));
  if (t === "risposte") {
    const p = inAttesa.get(obj.id);
    if (!p) return; // risposta a un altro telefono
    inAttesa.delete(obj.id);
    clearTimeout(p.timer);
    obj.ok ? p.resolve(obj.dati) : p.reject(new Error(obj.errore || "Errore"));
    return;
  }
  if (t === "brain") stato.brain = obj;
  else if (t === "allarme") stato.allarme = obj;
  else if (t === "camere") stato.camere = obj;
  else if (t === "luci") {
    stato.luci = obj;
    aggiornaFoglioLuce();
  } else if (t.startsWith("sensori/")) stato.sensori.set(t.slice(8), obj);
  aggiornaCollegamento();
  disegna();
}

async function comando(a, extra = {}) {
  if (!client || !client.collegato) throw new Error("Non collegato a casa");
  const id = casuale(8);
  const msg = { id, ts: Date.now(), nonce: casuale(), a, ...extra };
  const blob = await cifra(chiave, `${P}/comandi`, enc.encode(JSON.stringify(msg)));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      inAttesa.delete(id);
      reject(new Error("Casa non ha risposto"));
    }, 20000);
    inAttesa.set(id, { resolve, reject, timer });
    client.pubblica(`${P}/comandi`, blob);
  });
}

// ---------- disegno ----------

function aggiornaCollegamento() {
  const el = $("collegamento");
  let s = stato.collegamento;
  let testo = { collegamento: "Collegamento…", collegato: "Collegato", scollegato: "Non collegato" }[s];
  if (s === "collegato" && stato.brain && !stato.brain.online) {
    s = "scollegato";
    testo = "Casa non risponde";
  } else if (s === "scollegato" && stato.motivo === "credenziali rifiutate") {
    testo = "Credenziali rifiutate";
  }
  el.dataset.stato = s;
  el.querySelector("span").textContent = testo;
}

function aggiornaSaluto() {
  const d = new Date();
  $("saluto").textContent = maiuscola(d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }));
}

let disegnoInAttesa = false;
function disegna() {
  if (disegnoInAttesa) return;
  disegnoInAttesa = true;
  requestAnimationFrame(() => {
    disegnoInAttesa = false;
    const app = $("app");
    // finché non arriva lo stato dell'allarme: schermata di caricamento, poi dissolvenza
    const inAttesaDiCasa = config && !stato.allarme;
    app.innerHTML = !config ? htmlAbbina() : inAttesaDiCasa ? htmlCaricamento() : htmlDashboard();
    if (!inAttesaDiCasa && app.dataset.pronta !== "1") {
      app.dataset.pronta = "1";
      app.classList.add("entra"); // solo alla prima comparsa, non a ogni ridisegno
      setTimeout(() => app.classList.remove("entra"), 800);
    }
    applicaColori(app);
  });
}

function sezione(titolo, corpo, nota = "") {
  return `<section class="sezione"><div class="sezione-testa"><h2>${titolo}</h2>${nota ? `<span class="nota">${nota}</span>` : ""}</div>${corpo}</section>`;
}

// sezione a scomparsa: "sotto" resta visibile anche da chiusa (lo stato a colpo d'occhio)
function apribile(id, titolo, corpo, nota = "", sotto = "") {
  const aperta = sezioniAperte.has(id) ? "open" : "";
  return `<details class="sezione apribile" data-sezione="${id}" ${aperta}>
    <summary><div class="sezione-testa"><h2>${titolo}</h2><span class="nota">${nota}${icona("giu", "freccia")}</span></div>${sotto}</summary>
    ${corpo}
  </details>`;
}

function htmlCaricamento() {
  const errore = stato.collegamento === "scollegato" && stato.motivo === "credenziali rifiutate";
  if (errore) {
    return `<div class="caricamento"><div class="disco-errore">${icona("attenzione")}</div><p>Credenziali rifiutate: riabbina il telefono col QR.</p></div>`;
  }
  const testo = stato.collegamento === "collegato" ? "Aspetto i dati di casa…" : "Mi collego a casa…";
  return `<div class="caricamento"><div class="spinner" role="progressbar" aria-label="Caricamento"></div><p>${testo}</p></div>`;
}

function htmlAbbina() {
  return `
    <section class="scheda abbina">
      <h2>Abbina questo telefono</h2>
      <p>Inquadra con la fotocamera il QR di abbinamento: si apre questa pagina e il telefono si abbina da solo.</p>
      <p>Su iPhone, nell'app aggiunta alla schermata Home, incolla qui il codice copiato da Safari:</p>
      <textarea id="codice" placeholder="Codice di abbinamento" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
      <div class="azioni">
        <button data-azione="incolla" class="bottone secondario">Incolla</button>
        <button data-azione="abbina" class="bottone primario">Abbina</button>
      </div>
    </section>`;
}

function htmlDashboard() {
  const sensori = [...stato.sensori.values()];
  const di = (g) => sensori.filter((s) => s.g.includes(g));
  return [
    stato.abbinato ? htmlAppenaAbbinato() : "",
    htmlAllarme(),
    htmlRiepilogo(sensori, di("porte"), di("temperatura")),
    htmlAvvisi(sensori),
    htmlLuci(),
    htmlCamere(),
    htmlPorte(di("porte")),
    htmlPericoli([...di("fumo"), ...di("acqua")]),
    htmlTemperature(di("temperatura")),
    htmlRegistro(),
    htmlVacanza(),
    `<div class="piede"><button data-azione="copia">Copia codice di abbinamento</button><button data-azione="dimentica">Dimentica questo telefono</button></div>`,
  ].join("");
}

function htmlAppenaAbbinato() {
  return `
    <section class="scheda abbina">
      <h2>Telefono abbinato</h2>
      <ol>
        <li>Aggiungi questa pagina alla schermata Home: su iPhone Condividi → <b>Aggiungi alla schermata Home</b>, su Android menu ⋮ → <b>Installa app</b>.</li>
        <li>Solo iPhone: premi <b>Copia codice</b>, apri Casa dalla schermata Home e premi <b>Incolla</b> e poi <b>Abbina</b>.</li>
      </ol>
      <div class="azioni">
        <button data-azione="copia" class="bottone secondario">Copia codice</button>
        <button data-azione="fatto" class="bottone primario">Fatto</button>
      </div>
    </section>`;
}

function htmlAllarme() {
  const a = stato.allarme;
  if (!a) return ""; // non succede: senza stato dell'allarme si vede la schermata di caricamento
  const titolo = { disinserito: "Spento", inserito: "Acceso", scattato: "Scattato!" }[a.stato] || a.stato;
  const simbolo = { disinserito: "scudo", inserito: "scudoOk", scattato: "scudoAllarme" }[a.stato] || "scudo";
  const bottone =
    a.stato === "disinserito"
      ? `<button data-azione="inserisci" class="bottone pericolo">${icona("scudoOk")}Accendi</button>`
      : `<button data-azione="disinserisci" class="bottone ${a.stato === "scattato" ? "pericolo" : "secondario"}">${icona("scudo")}Spegni</button>`;
  const dettaglio = a.stato === "scattato" ? esc(a.perche) : `${ora(a.dal)} · ${esc(a.perche)}`;
  return `
    <section class="scheda allarme" data-stato="${esc(a.stato)}">
      <div class="disco">${icona(simbolo)}</div>
      <div class="testi">
        <div class="etichetta-piccola">Allarme</div>
        <div class="stato">${esc(titolo)}</div>
        <div class="dettaglio">${dettaglio}</div>
      </div>
      ${bottone}
    </section>`;
}

function htmlVacanza() {
  const a = stato.allarme;
  if (!a) return "";
  const [ins, dis] = a.orari || [];
  const spiegazione = a.vacanza
    ? "L'allarme non si accende e non si spegne da solo: resta come lo lasci"
    : ins
      ? `L'allarme si accende da solo alle ${esc(ins)} e si spegne alle ${esc(dis)}`
      : "";
  return sezione(
    "Modalità vacanza",
    `<div class="scheda vacanza ${a.vacanza ? "attiva" : ""}">
      <span class="disco-piccolo">${icona("valigia")}</span>
      <div class="testi"><div class="titolo">${a.vacanza ? "Attiva" : "Non attiva"}</div><div class="dettaglio">${spiegazione}</div></div>
      <label class="interruttore" aria-label="Modalità vacanza"><input type="checkbox" data-vacanza ${a.vacanza ? "checked" : ""}><span></span></label>
    </div>`,
  );
}

function htmlRiepilogo(sensori, porte, temperature) {
  const pillole = [];
  const aperti = porte.filter((s) => s.aperto).length;
  pillole.push(
    aperti
      ? `<span class="pillola attenzione">${icona("porta")}${aperti === 1 ? "1 aperto" : `${aperti} aperti`}</span>`
      : `<span class="pillola ok">${icona("ok")}Tutto chiuso</span>`,
  );
  if (stato.luci.length) {
    const accese = stato.luci.filter((l) => l.acceso).length;
    pillole.push(`<span class="pillola luminosa">${icona("lampadina")}${accese ? `${accese} ${accese === 1 ? "luce accesa" : "luci accese"}` : "Luci spente"}</span>`);
  }
  const gradi = temperature.map((s) => s.temp).filter((t) => t != null);
  if (gradi.length) {
    const fmt = (v) => v.toLocaleString("it-IT");
    const min = Math.min(...gradi), max = Math.max(...gradi);
    pillole.push(`<span class="pillola">${icona("termometro")}${min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`} °C</span>`);
  }
  if (stato.allarme?.vacanza) pillole.unshift(`<span class="pillola vacanza">${icona("valigia")}In vacanza</span>`);
  if (sensori.some((s) => s.fumo || s.acqua)) pillole.unshift(`<span class="pillola pericolo">${icona("attenzione")}Pericolo</span>`);
  return `<div class="riepilogo">${pillole.join("")}</div>`;
}

function htmlAvvisi(sensori) {
  const pericoli = sensori.filter((s) => s.fumo || s.acqua);
  const batterie = sensori.filter((s) => s.batt_bassa || (s.batt != null && s.batt <= 15));
  if (!pericoli.length && !batterie.length) return "";
  const righe = [
    ...pericoli.map((s) => `<li>${icona(s.fumo ? "fiamma" : "goccia")}${s.fumo ? "Fumo" : "Acqua"}: ${esc(etichetta(s.n))}</li>`),
    ...batterie.map((s) => `<li>${icona("batteria")}Batteria scarica: ${esc(etichetta(s.n))}${s.batt != null ? ` (${s.batt}%)` : ""}</li>`),
  ];
  return `
    <section class="scheda avvisi ${pericoli.length ? "grave" : ""}">
      <ul>${righe.join("")}</ul>
      ${pericoli.length ? `<div class="azioni"><button data-azione="silenzia" class="bottone pericolo">${icona("muto")}Zittisci sirene</button></div>` : ""}
    </section>`;
}

function statoLuce(l) {
  if (l.acceso == null) return "Non risponde";
  if (!l.acceso) return "Spenta";
  return `Accesa${l.lum != null ? ` · ${l.lum}%` : ""}`;
}

function htmlLuci() {
  if (!stato.luci.length) return "";
  const riquadri = stato.luci.map((l) => {
    const muta = l.acceso == null;
    const accesa = l.acceso ? "1" : "0";
    return `
      <div class="luce ${muta ? "muta" : ""}" ${muta ? "" : `data-azione="apri_luce" role="button" tabindex="0"`} data-id="${esc(l.id)}" data-accesa="${accesa}" data-colore="${esc(coloreLuce(l))}">
        <div class="riga">
          <span class="icona-luce">${icona("lampadina")}</span>
          ${muta ? "" : `<button class="accensione" data-azione="luce" data-id="${esc(l.id)}" data-accesa="${l.acceso ? "0" : "1"}" aria-label="${l.acceso ? "Spegni" : "Accendi"}">${icona("accensione")}</button>`}
        </div>
        <div><div class="nome">${esc(nomeLuce(l.n))}</div><div class="stato">${statoLuce(l)}</div></div>
      </div>`;
  });
  const accese = stato.luci.some((l) => l.acceso);
  const nota = accese ? `<button data-azione="spegni_luci" class="bottone-testo">Spegni luci in casa</button>` : "";
  return sezione("Luci", `<div class="luci">${riquadri.join("")}</div>`, nota);
}

function htmlCamere() {
  if (!stato.camere.length) return "";
  const riquadri = stato.camere.map((cam) => {
    const url = stato.foto.get(cam.c);
    const dentro = url ? `<img src="${url}" alt="">` : `<span class="vuota">${icona("camera")}</span>`;
    return `<button class="camera" data-azione="camera" data-c="${cam.c}">${dentro}<span class="nome">${esc(cam.n)}</span></button>`;
  });
  const n = stato.camere.length;
  return apribile("camere", "Camere", `<div class="camere">${riquadri.join("")}</div>`, `${n} ${n === 1 ? "camera" : "camere"}`);
}

function iconaSensore(nome) {
  const n = nome.toLowerCase();
  if (n.includes("inclinazione")) return "garage";
  if (n.includes("persiana")) return "persiana";
  if (n.includes("finestra")) return "finestra";
  return "porta";
}

function htmlPorte(porte) {
  if (!porte.length) return "";
  porte.sort((a, b) => Number(Boolean(b.aperto)) - Number(Boolean(a.aperto)) || etichetta(a.n).localeCompare(etichetta(b.n)));
  const aperti = porte.filter((s) => s.aperto).length;
  const righe = porte.map((s) => {
    const chip =
      s.aperto == null
        ? `<span class="etichetta neutra">—</span>`
        : s.aperto
          ? `<span class="etichetta attenzione">Aperto</span>`
          : `<span class="etichetta">Chiuso</span>`;
    const quando = s.q && s.aperto != null ? `<span class="quando">${s.aperto ? "aperto" : "chiuso"} ${ora(s.q)}</span>` : "";
    return `<li class="${s.aperto ? "aperto" : ""}"><span class="disco-piccolo">${icona(iconaSensore(s.n))}</span><span class="nome">${esc(etichetta(s.n))}${quando}</span>${chip}</li>`;
  });
  // a colpo d'occhio, anche con la sezione chiusa: tutto chiuso, o quali sono aperti
  const apertiNomi = porte.filter((s) => s.aperto);
  const sotto = apertiNomi.length
    ? `<div class="colpo-occhio">${apertiNomi.map((s) => `<span class="pillola attenzione">${icona(iconaSensore(s.n))}${esc(etichetta(s.n))}</span>`).join("")}</div>`
    : `<div class="colpo-occhio"><span class="pillola ok">${icona("ok")}Tutto chiuso</span></div>`;
  const nota = `${porte.length} sensori`;
  return apribile("porte", "Porte e finestre", `<div class="scheda scheda-elenco"><ul class="elenco">${righe.join("")}</ul></div>`, nota, sotto);
}

function htmlPericoli(sensori) {
  if (!sensori.length) return "";
  const tessere = sensori.map((s) => {
    const fumo = s.g.includes("fumo");
    const allarme = fumo ? s.fumo : s.acqua;
    const valore =
      allarme == null
        ? `<div class="valore muto">—</div>`
        : allarme
          ? `<div class="valore">${fumo ? "FUMO" : "ACQUA"}</div>`
          : `<div class="valore ok">Tutto ok</div>`;
    return `<div class="tessera ${allarme ? "pericolo" : ""}"><div class="testa">${icona(fumo ? "fiamma" : "goccia")}${esc(maiuscola(etichetta(s.n).replace(/^(fumo|acqua)\s+/i, "")))}</div>${valore}</div>`;
  });
  // a colpo d'occhio: tutto ok, o quali sensori segnalano
  const allarmi = sensori.filter((s) => (s.g.includes("fumo") ? s.fumo : s.acqua));
  const sotto = allarmi.length
    ? `<div class="colpo-occhio">${allarmi.map((s) => `<span class="pillola pericolo">${icona(s.g.includes("fumo") ? "fiamma" : "goccia")}${esc(etichetta(s.n))}</span>`).join("")}</div>`
    : `<div class="colpo-occhio"><span class="pillola ok">${icona("ok")}Tutto ok</span></div>`;
  return apribile("pericoli", "Fumo e acqua", `<div class="tessere">${tessere.join("")}</div>`, `${sensori.length} sensori`, sotto);
}

function htmlTemperature(sensori) {
  const con = sensori.filter((s) => s.temp != null);
  if (!con.length) return "";
  const tessere = con.map((s) => {
    const nome = etichetta(s.n).replace(/^temperatura\s+/i, "");
    return `<div class="tessera ${s.temp >= 50 ? "caldo" : ""}"><div class="testa">${icona("termometro")}${esc(maiuscola(nome))}</div><div class="valore">${s.temp.toLocaleString("it-IT")}<small> °C</small></div></div>`;
  });
  // a colpo d'occhio: l'intervallo, e in rosso i sensori oltre la soglia
  const fmt = (v) => v.toLocaleString("it-IT");
  const gradi = con.map((s) => s.temp);
  const min = Math.min(...gradi), max = Math.max(...gradi);
  const caldi = con.filter((s) => s.temp >= 50);
  const sotto = `<div class="colpo-occhio"><span class="pillola">${icona("termometro")}${min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`} °C</span>${caldi
    .map((s) => `<span class="pillola pericolo">${icona("termometro")}${esc(etichetta(s.n))}: ${fmt(s.temp)} °C</span>`)
    .join("")}</div>`;
  return apribile("temperature", "Temperature", `<div class="tessere">${tessere.join("")}</div>`, `${con.length} sensori`, sotto);
}

const ICONE_REGISTRO = { vacanza: "valigia", allarme: "scudo", contatto: "porta", persona: "persona", fumo: "fiamma", acqua: "goccia", bottone: "bottone", luci: "lampadina", avvio: "avvio", dashboard: "scudo", temperatura: "termometro" };

function voceRegistro([quando, tipo, fonte, testo]) {
  let cosa;
  if (tipo === "allarme") {
    const parola = { inserito: "acceso", disinserito: "spento", scattato: "scattato" }[testo] || testo;
    cosa = `Allarme ${esc(parola)} <span class="ora">(${esc(fonte)})</span>`;
  }
  else if (tipo === "contatto") cosa = `${esc(etichetta(fonte))}: ${testo === "True" ? "aperto" : "chiuso"}`;
  else if (tipo === "persona") cosa = `Persona vista: ${esc(fonte)}`;
  else if (tipo === "fumo" || tipo === "acqua") cosa = `${tipo === "fumo" ? "Fumo" : "Acqua"} ${testo === "True" ? "rilevato" : "cessato"}: ${esc(etichetta(fonte))}`;
  else if (tipo === "bottone") cosa = `${esc(etichetta(fonte))} premuto`;
  else if (tipo === "luci") cosa = `Luci ${esc(testo)} <span class="ora">(${esc(fonte)})</span>`;
  else if (tipo === "avvio") cosa = `Cervello avviato (${esc(testo)})`;
  else if (tipo === "vacanza") cosa = `Modalità vacanza ${esc(testo)} <span class="ora">(${esc(fonte)})</span>`;
  else cosa = `${esc(maiuscola(tipo))} · ${esc(etichetta(fonte))}: ${esc(testo)}`;
  const hm = new Date(quando).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `<li><span class="punto">${icona(ICONE_REGISTRO[tipo] || "orologio")}</span><div><div class="cosa">${cosa}</div><div class="ora">${hm}</div></div></li>`;
}

function htmlRegistro() {
  // si carica quando si apre la sezione (vedi l'ascolto di "toggle")
  let corpo;
  if (stato.registro == null) corpo = `<p class="vuoto">Carico…</p>`;
  else {
    const voci = [...stato.registro].reverse().map(voceRegistro);
    corpo = voci.length ? `<ul class="registro">${voci.join("")}</ul>` : `<p class="vuoto">Niente da segnalare.</p>`;
  }
  const aggiorna = `<div class="azioni sinistra registro-azioni"><button data-azione="registro" class="bottone secondario">${icona("avvio")}Aggiorna</button></div>`;
  return apribile("registro", "Registro", `<div class="scheda scheda-elenco">${corpo}</div>${aggiorna}`, "ultime 24 ore");
}

let registroInArrivo = null;
function caricaRegistro() {
  // una richiesta alla volta: ridisegnando, una sezione già aperta può rimandare "toggle"
  registroInArrivo ??= comando("registro")
    .then((voci) => {
      stato.registro = voci;
      disegna();
    })
    .finally(() => (registroInArrivo = null));
  return registroInArrivo;
}

// ---------- pannello di una luce ----------

function apriLuce(id) {
  foglioLuce = id;
  aggiornaFoglioLuce(true);
  $("luce").showModal();
}

function aggiornaFoglioLuce(forza = false) {
  if (!foglioLuce) return;
  const l = stato.luci.find((x) => x.id === foglioLuce);
  if (!l) return;
  const colore = coloreLuce(l);
  $("luce-nome").textContent = nomeLuce(l.n);
  $("luce-stato").textContent = statoLuce(l);
  const ic = $("luce-icona");
  ic.innerHTML = icona("lampadina");
  ic.dataset.accesa = l.acceso ? "1" : "0";
  ic.style.setProperty("--colore", colore);
  $("luce").classList.toggle("spenta", !l.acceso);
  $("luce-lum").style.setProperty("--colore", colore);
  if (trascinando && !forza) return; // non spostare il cursore sotto il dito
  $("luce-accesa").checked = Boolean(l.acceso);
  const lum = $("luce-lum"), k = $("luce-k"), h = $("luce-h");
  lum.value = l.lum ?? 100;
  k.min = l.kmin ?? 2500;
  k.max = l.kmax ?? 6500;
  k.value = l.k ?? 2700;
  h.value = l.h ?? 30;
  $("luce-k").closest(".cursore").classList.toggle("sbiadito", l.modo === "colore");
  $("luce-h").closest(".cursore").classList.toggle("sbiadito", l.modo !== "colore");
  etichetteCursori();
}

function etichetteCursori() {
  $("luce-lum-v").textContent = `${$("luce-lum").value}%`;
  $("luce-k-v").textContent = `${$("luce-k").value} K`;
  $("luce-h-v").textContent = `${$("luce-h").value}°`;
}

// invio "a raffica" mentre si trascina: al massimo un comando ogni CURSORE_OGNI_MS
let inSospeso = null;
let timerCursore = null;
function inviaLuce(campi) {
  inSospeso = { ...(inSospeso || {}), ...campi };
  if (timerCursore) return;
  timerCursore = setTimeout(() => {
    const id = foglioLuce, dati = inSospeso;
    inSospeso = null;
    timerCursore = null;
    if (id && dati) comando("luce", { id, ...dati }).catch((e) => mostra(e.message, true));
  }, CURSORE_OGNI_MS);
}

function collegaCursore(input, campo) {
  const inizio = () => (trascinando = true);
  input.addEventListener("pointerdown", inizio);
  input.addEventListener("touchstart", inizio, { passive: true });
  input.addEventListener("input", () => {
    etichetteCursori();
    const v = Number(input.value);
    // scegliere un bianco o un colore porta la luce in quel modo
    if (campo === "k") inviaLuce({ k: v, h: undefined });
    else if (campo === "h") inviaLuce({ h: v, k: undefined });
    else inviaLuce({ lum: v });
  });
  input.addEventListener("change", () => setTimeout(() => (trascinando = false), CURSORE_OGNI_MS * 2));
}

collegaCursore($("luce-lum"), "lum");
collegaCursore($("luce-k"), "k");
collegaCursore($("luce-h"), "h");
$("luce-accesa").addEventListener("change", (e) => {
  comando("luce", { id: foglioLuce, accesa: e.target.checked }).catch((err) => mostra(err.message, true));
});
$("luce-chiudi").addEventListener("click", () => $("luce").close());
$("luce").addEventListener("close", () => {
  foglioLuce = null;
  trascinando = false;
});

// ---------- visore camere ----------

function nomeCamera(c) {
  return stato.camere.find((cam) => cam.c === c)?.n || `Camera ${c}`;
}

function aggiornaVisore() {
  if (!visore) return;
  const url = stato.foto.get(visore.c);
  const img = $("visore-img");
  if (url) img.src = url;
  else img.removeAttribute("src");
  $("visore-attesa").hidden = Boolean(url);
  $("visore-live").hidden = !visore.diretta;
  $("visore-diretta").textContent = visore.diretta ? "Ferma diretta" : "Diretta";
  $("visore-nota").textContent = visore.diretta ? "Una foto al secondo · si ferma da sola dopo 5 minuti" : "Foto su richiesta";
}

async function apriVisore(c) {
  visore = { c, diretta: false };
  $("visore-nome").textContent = nomeCamera(c);
  $("visore-attesa").textContent = "Chiedo la foto…";
  aggiornaVisore();
  $("visore").showModal();
  await nuovaFoto();
}

async function nuovaFoto() {
  if (!visore) return;
  try {
    await comando("foto", { c: visore.c });
  } catch (e) {
    $("visore-attesa").textContent = e.message;
    mostra(e.message, true);
  }
}

async function avviaDiretta() {
  const v = visore;
  try {
    await comando("diretta", { c: v.c });
  } catch (e) {
    return mostra(e.message, true);
  }
  v.diretta = true;
  v.rinnovo = setInterval(() => comando("diretta", { c: v.c }).catch(() => {}), DIRETTA_RINNOVO_MS);
  v.fine = setTimeout(() => fermaDiretta(v), DIRETTA_MAX_MS);
  aggiornaVisore();
}

function fermaDiretta(v = visore) {
  if (!v || !v.diretta) return;
  v.diretta = false;
  clearInterval(v.rinnovo);
  clearTimeout(v.fine);
  comando("fine_diretta", { c: v.c }).catch(() => {});
  aggiornaVisore();
}

$("visore-chiudi").innerHTML = icona("chiudi");
$("visore-chiudi").addEventListener("click", () => $("visore").close());
$("visore-foto").addEventListener("click", () => nuovaFoto());
$("visore-diretta").addEventListener("click", () => (visore?.diretta ? fermaDiretta() : avviaDiretta()));
$("visore").addEventListener("close", () => {
  fermaDiretta();
  visore = null;
});

// ---------- azioni ----------

// conferma contro i tocchi per sbaglio (niente PIN: basta essere abbinati)
function conferma(titolo, bottone, pericolo = false, testo = "") {
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

async function esegui(azione, el) {
  switch (azione) {
    case "inserisci":
      if (!(await conferma("Accendere l'allarme?", "Accendi", true))) return;
      await comando("inserisci");
      return mostra("Allarme acceso");
    case "disinserisci":
      if (!(await conferma("Spegnere l'allarme?", "Spegni"))) return;
      await comando("disinserisci");
      return mostra("Allarme spento");
    case "silenzia":
      await comando("silenzia");
      return mostra("Sirene zittite");
    case "apri_luce":
      return apriLuce(el.dataset.id);
    case "luce":
      return comando("luce", { id: el.dataset.id, accesa: el.dataset.accesa === "1" });
    case "spegni_luci":
      await comando("spegni_luci");
      return mostra("Luci spente");
    case "camera":
      return apriVisore(Number(el.dataset.c));
    case "registro":
      return caricaRegistro();
    case "dimentica":
      if (!(await conferma("Dimenticare questo telefono? Servirà di nuovo il QR di abbinamento.", "Dimentica", true))) return;
      localStorage.removeItem(ARCHIVIO);
      if (client) client.chiudi();
      return location.reload();
    case "copia":
      // ricavato dall'abbinamento salvato: serve per passarlo da Safari all'app sulla Home
      await navigator.clipboard.writeText(stato.abbinato || codiceDa(config));
      return mostra("Codice copiato");
    case "fatto":
      stato.abbinato = null;
      return disegna();
    case "incolla":
      $("codice").value = await navigator.clipboard.readText();
      return;
    case "abbina":
      config = abbina($("codice").value);
      disegna();
      return collega();
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-azione]");
  if (!el) return;
  el.disabled = true;
  esegui(el.dataset.azione, el)
    .catch((err) => mostra(err.message || String(err), true))
    .finally(() => (el.disabled = false));
});

// interruttore della modalità vacanza (è nella scheda allarme, ridisegnata a ogni messaggio)
document.addEventListener("change", async (e) => {
  const el = e.target;
  if (!el.matches?.("[data-vacanza]")) return;
  const attiva = el.checked;
  el.checked = !attiva; // cambia davvero solo dopo la conferma e la risposta di casa
  const [ins, dis] = stato.allarme?.orari || ["01:30", "06:45"];
  const ok = await conferma(
    attiva ? "Attivare la modalità vacanza?" : "Finire la modalità vacanza?",
    attiva ? "Attiva" : "Finisci",
    false,
    attiva
      ? `L'allarme non si accenderà più da solo alle ${ins} e non si spegnerà alle ${dis}: resta come lo lasci. Ricordati di accenderlo quando parti.`
      : `Tornano gli orari automatici: si accende alle ${ins} e si spegne alle ${dis}.`,
  );
  if (!ok) return;
  el.disabled = true;
  try {
    await comando("vacanza", { attiva });
    mostra(attiva ? "Modalità vacanza attiva" : "Modalità vacanza finita");
  } catch (err) {
    mostra(err.message, true);
  } finally {
    el.disabled = false;
  }
});

// ricorda quali sezioni a scomparsa sono aperte ("toggle" non risale: si ascolta in cattura)
document.addEventListener(
  "toggle",
  (e) => {
    const id = e.target.dataset?.sezione;
    if (!id) return;
    e.target.open ? sezioniAperte.add(id) : sezioniAperte.delete(id);
    if (id === "registro" && e.target.open && stato.registro == null) {
      caricaRegistro().catch((err) => mostra(err.message, true));
    }
  },
  true,
);

document.addEventListener("keydown", (e) => {
  const el = e.target.closest?.('[role="button"][data-azione]');
  if (el && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    el.click();
  }
});

// in secondo piano il sistema chiude la connessione: al ritorno si riapre subito
document.addEventListener("visibilitychange", () => {
  if (document.hidden) fermaDiretta();
  else if (client) client.apri();
});

// ---------- avvio ----------

if (location.hash.startsWith("#c=")) {
  try {
    abbina(location.hash);
    stato.abbinato = location.hash.slice(3);
  } catch {
    mostra("Codice di abbinamento non valido", true);
  }
  history.replaceState(null, "", location.pathname + location.search); // il codice esce dalla barra
}
config = leggiConfig();
aggiornaSaluto();
setInterval(aggiornaSaluto, 60000);
disegna();
if (config) {
  chiediPersistenza();
  collega().catch((e) => mostra(`Collegamento non riuscito: ${e.message}`, true));
} else {
  stato.collegamento = "scollegato";
  aggiornaCollegamento();
  $("collegamento").querySelector("span").textContent = "Non abbinato";
}
