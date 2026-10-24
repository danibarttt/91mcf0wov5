// Dashboard di casa. Tutto ciò che arriva e parte passa dal broker MQTT in cloud cifrato
// end-to-end (cifra.js): la pagina non contiene dati, li riceve dal brain. Protocollo in
// brain/casa_brain/dashboard.py.

import { Mqtt } from "./mqtt.js";
import { importaChiave, cifra, decifra } from "./cifra.js";

const ARCHIVIO = "casa";
const PORTA_WS = 8084;
const DIRETTA_RINNOVO_MS = 30000; // il brain la ferma dopo 60 s senza rinnovo
const DIRETTA_MAX_MS = 5 * 60000; // e il telefono comunque dopo 5 minuti

const enc = new TextEncoder();
const dec = new TextDecoder();
const $ = (id) => document.getElementById(id);

const stato = {
  collegamento: "collegamento",
  motivo: "",
  brain: null, // {online, dal}
  allarme: null, // {stato, perche, dal}
  camere: [], // [{c, n}]
  sensori: new Map(), // id -> {n, g, aperto, fumo, acqua, temp, batt, batt_bassa, q}
  foto: new Map(), // canale -> objectURL
  registro: null,
  abbinato: null, // codice appena abbinato dal QR (per copiarlo nell'app su iPhone)
};

let config = null;
let chiave = null;
let client = null;
const inAttesa = new Map(); // id comando -> {resolve, reject, timer}
let visore = null; // {c, diretta, rinnovo, fine}

// ---------- utilità ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function casuale(byte = 12) {
  return Array.from(crypto.getRandomValues(new Uint8Array(byte)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function etichetta(nome) {
  const s = String(nome).replace(/^sensore\s+/i, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  mostra.timer = setTimeout(() => (el.hidden = true), errore ? 5000 : 3000);
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
  const json = JSON.stringify({ h: c.h, u: c.u, p: c.p, k: c.k });
  return btoa(String.fromCharCode(...enc.encode(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function abbina(testo) {
  const c = decodificaCodice(testo);
  localStorage.setItem(ARCHIVIO, JSON.stringify(c));
  return c;
}

// ---------- collegamento ----------

async function collega() {
  chiave = await importaChiave(config.k);
  client = new Mqtt({
    url: `wss://${config.h}:${PORTA_WS}/mqtt`,
    clientId: `casa-web-${casuale(5)}`,
    utente: config.u,
    password: config.p,
    argomenti: ["casa/brain", "casa/allarme", "casa/camere", "casa/risposte", "casa/sensori/+", "casa/foto/+"],
    onMessaggio: (topic, payload) => messaggio(topic, payload).catch((e) => console.error(topic, e)),
    onStato: (s, motivo) => {
      stato.collegamento = s;
      stato.motivo = motivo || "";
      aggiornaCollegamento();
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
  if (topic.startsWith("casa/foto/")) {
    const c = Number(topic.split("/")[2]);
    const prima = stato.foto.get(c);
    stato.foto.set(c, URL.createObjectURL(new Blob([dati], { type: "image/jpeg" })));
    if (prima) setTimeout(() => URL.revokeObjectURL(prima), 2000);
    aggiornaVisore();
    disegna();
    return;
  }
  const obj = JSON.parse(dec.decode(dati));
  if (topic === "casa/risposte") {
    const p = inAttesa.get(obj.id);
    if (!p) return; // risposta a un altro telefono
    inAttesa.delete(obj.id);
    clearTimeout(p.timer);
    obj.ok ? p.resolve(obj.dati) : p.reject(new Error(obj.errore || "Errore"));
    return;
  }
  if (topic === "casa/brain") stato.brain = obj;
  else if (topic === "casa/allarme") stato.allarme = obj;
  else if (topic === "casa/camere") stato.camere = obj;
  else if (topic.startsWith("casa/sensori/")) stato.sensori.set(topic.slice(13), obj);
  aggiornaCollegamento();
  disegna();
}

async function comando(a, extra = {}) {
  if (!client || !client.collegato) throw new Error("Non collegato a casa");
  const id = casuale(8);
  const msg = { id, ts: Date.now(), nonce: casuale(), a, ...extra };
  const blob = await cifra(chiave, "casa/comandi", enc.encode(JSON.stringify(msg)));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      inAttesa.delete(id);
      reject(new Error("Casa non ha risposto"));
    }, 20000);
    inAttesa.set(id, { resolve, reject, timer });
    client.pubblica("casa/comandi", blob);
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

let disegnoInAttesa = false;
function disegna() {
  if (disegnoInAttesa) return;
  disegnoInAttesa = true;
  requestAnimationFrame(() => {
    disegnoInAttesa = false;
    $("app").innerHTML = config ? htmlDashboard() : htmlAbbina();
  });
}

function htmlAbbina() {
  return `
    <section class="scheda abbina">
      <h2>Abbina questo telefono</h2>
      <p>Inquadra con la fotocamera il QR di abbinamento: si apre questa pagina e il telefono si abbina da solo.</p>
      <p>Su iPhone, nell'app aggiunta alla schermata Home, incolla qui il codice copiato da Safari:</p>
      <textarea id="codice" placeholder="Codice di abbinamento" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
      <div class="azioni">
        <button data-azione="incolla" class="secondario">Incolla</button>
        <button data-azione="abbina" class="primario">Abbina</button>
      </div>
    </section>`;
}

function htmlDashboard() {
  const sensori = [...stato.sensori.values()];
  const di = (g) => sensori.filter((s) => s.g.includes(g));
  return [
    stato.abbinato ? htmlAppenaAbbinato() : "",
    htmlAllarme(),
    htmlAvvisi(sensori),
    htmlCamere(),
    htmlPorte(di("porte")),
    htmlPericoli([...di("fumo"), ...di("acqua")]),
    htmlTemperature(di("temperatura")),
    htmlRegistro(),
    `<div class="piede"><button data-azione="copia">Copia codice di abbinamento</button> · <button data-azione="dimentica">Dimentica questo telefono</button></div>`,
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
        <button data-azione="copia" class="secondario">Copia codice</button>
        <button data-azione="fatto" class="primario">Fatto</button>
      </div>
    </section>`;
}

function htmlAllarme() {
  const a = stato.allarme;
  if (!a) return `<section class="scheda"><p class="vuoto">In attesa di casa…</p></section>`;
  const titolo = { disinserito: "Disinserito", inserito: "Inserito", scattato: "SCATTATO" }[a.stato] || a.stato;
  const bottone =
    a.stato === "disinserito"
      ? `<button data-azione="inserisci" class="primario">Inserisci</button>`
      : `<button data-azione="disinserisci" class="${a.stato === "scattato" ? "pericolo" : "primario"}">Disinserisci</button>`;
  const dettaglio = a.stato === "scattato" ? esc(a.perche) : `${ora(a.dal)} · ${esc(a.perche)}`;
  return `
    <section class="scheda allarme" data-stato="${esc(a.stato)}">
      <div>
        <h2>Allarme</h2>
        <div class="stato">${esc(titolo)}</div>
        <div class="dettaglio">${dettaglio}</div>
      </div>
      ${bottone}
    </section>`;
}

function htmlAvvisi(sensori) {
  const pericoli = sensori.filter((s) => s.fumo || s.acqua);
  const aperti = sensori.filter((s) => s.aperto);
  const batterie = sensori.filter((s) => s.batt_bassa || (s.batt != null && s.batt <= 15));
  if (!pericoli.length && !aperti.length && !batterie.length) return "";
  const righe = [
    ...pericoli.map((s) => `<li><b>${s.fumo ? "Fumo" : "Acqua"}: ${esc(etichetta(s.n))}</b></li>`),
    ...aperti.map((s) => `<li>Aperto: ${esc(etichetta(s.n))}</li>`),
    ...batterie.map((s) => `<li>Batteria scarica: ${esc(etichetta(s.n))}${s.batt != null ? ` (${s.batt}%)` : ""}</li>`),
  ];
  return `
    <section class="scheda avvisi ${pericoli.length ? "grave" : ""}">
      <h2>Da guardare</h2>
      <ul>${righe.join("")}</ul>
      ${pericoli.length ? `<div class="azioni"><button data-azione="silenzia" class="pericolo">Zittisci sirene</button></div>` : ""}
    </section>`;
}

function htmlCamere() {
  if (!stato.camere.length) return "";
  const riquadri = stato.camere.map((cam) => {
    const url = stato.foto.get(cam.c);
    return `<button class="camera" data-azione="camera" data-c="${cam.c}">${url ? `<img src="${url}" alt="">` : ""}<span>${esc(cam.n)}</span></button>`;
  });
  return `<section class="scheda"><h2>Camere</h2><div class="camere">${riquadri.join("")}</div></section>`;
}

function htmlPorte(porte) {
  if (!porte.length) return "";
  porte.sort((a, b) => Number(Boolean(b.aperto)) - Number(Boolean(a.aperto)) || etichetta(a.n).localeCompare(etichetta(b.n)));
  const righe = porte.map((s) => {
    const chip =
      s.aperto == null
        ? `<span class="etichetta neutra">—</span>`
        : s.aperto
          ? `<span class="etichetta attenzione">Aperto</span>`
          : `<span class="etichetta">Chiuso</span>`;
    const quando = s.q && s.aperto != null ? `<span class="quando">${s.aperto ? "aperto" : "chiuso"} ${ora(s.q)}</span>` : "";
    return `<li><span class="nome">${esc(etichetta(s.n))}${quando}</span>${chip}</li>`;
  });
  return `<section class="scheda"><h2>Porte e finestre</h2><ul class="elenco">${righe.join("")}</ul></section>`;
}

function htmlPericoli(sensori) {
  if (!sensori.length) return "";
  const righe = sensori.map((s) => {
    const allarme = s.g.includes("fumo") ? s.fumo : s.acqua;
    const chip =
      allarme == null
        ? `<span class="etichetta neutra">—</span>`
        : allarme
          ? `<span class="etichetta pericolo">${s.g.includes("fumo") ? "FUMO" : "ACQUA"}</span>`
          : `<span class="etichetta">OK</span>`;
    return `<li><span class="nome">${esc(etichetta(s.n))}</span>${chip}</li>`;
  });
  return `<section class="scheda"><h2>Fumo e acqua</h2><ul class="elenco">${righe.join("")}</ul></section>`;
}

function htmlTemperature(sensori) {
  const con = sensori.filter((s) => s.temp != null);
  if (!con.length) return "";
  const righe = con.map((s) => {
    const classe = s.temp >= 50 ? "pericolo" : "neutra";
    return `<li><span class="nome">${esc(etichetta(s.n))}</span><span class="etichetta ${classe}">${s.temp.toLocaleString("it-IT")} °C</span></li>`;
  });
  return `<section class="scheda"><h2>Temperature</h2><ul class="elenco">${righe.join("")}</ul></section>`;
}

const TIPI = { contatto: "Contatto", persona: "Persona", fumo: "Fumo", acqua: "Acqua", bottone: "Bottone", temperatura: "Temperatura", allarme: "Allarme", avvio: "Avvio", dashboard: "Dashboard" };

function voceRegistro([quando, tipo, fonte, testo]) {
  let cosa;
  if (tipo === "allarme") cosa = `Allarme ${testo} (${fonte})`;
  else if (tipo === "contatto") cosa = `${etichetta(fonte)}: ${testo === "True" ? "aperto" : "chiuso"}`;
  else if (["fumo", "acqua", "persona"].includes(tipo)) cosa = `${TIPI[tipo]} · ${etichetta(fonte)}: ${testo === "True" ? "rilevato" : "cessato"}`;
  else if (tipo === "bottone") cosa = `${etichetta(fonte)} premuto`;
  else cosa = `${TIPI[tipo] || tipo} · ${etichetta(fonte)}: ${testo}`;
  const hm = new Date(quando).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `<li><span class="quando">${hm}</span>${esc(cosa)}</li>`;
}

function htmlRegistro() {
  if (stato.registro == null) {
    return `<section class="scheda"><h2>Registro</h2><div class="azioni sinistra"><button data-azione="registro" class="secondario">Mostra le ultime 24 ore</button></div></section>`;
  }
  const voci = [...stato.registro].reverse().map(voceRegistro);
  return `<section class="scheda"><h2>Registro (24 ore)</h2>${voci.length ? `<ul class="elenco registro">${voci.join("")}</ul>` : `<p class="vuoto">Niente da segnalare.</p>`}</section>`;
}

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
  $("visore-diretta").textContent = visore.diretta ? "Ferma diretta" : "Diretta";
  $("visore-nota").textContent = visore.diretta
    ? "Una foto al secondo. Sulle camere a batteria consuma: si ferma da sola dopo 5 minuti."
    : "";
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

// ---------- azioni ----------

// conferma contro i tocchi per sbaglio (niente PIN: basta essere abbinati)
function conferma(titolo, bottone, pericolo = false) {
  const d = $("conferma");
  $("conferma-titolo").textContent = titolo;
  $("conferma-ok").textContent = bottone;
  $("conferma-ok").className = pericolo ? "pericolo" : "primario";
  d.returnValue = "";
  d.showModal();
  return new Promise((ok) => d.addEventListener("close", () => ok(d.returnValue === "ok"), { once: true }));
}

async function esegui(azione, el) {
  switch (azione) {
    case "inserisci":
      if (!(await conferma("Inserire l'allarme?", "Inserisci"))) return;
      await comando("inserisci");
      return mostra("Allarme inserito");
    case "disinserisci":
      if (!(await conferma("Disinserire l'allarme?", "Disinserisci", stato.allarme?.stato === "scattato"))) return;
      await comando("disinserisci");
      return mostra("Allarme disinserito");
    case "silenzia":
      await comando("silenzia");
      return mostra("Sirene zittite");
    case "camera":
      return apriVisore(Number(el.dataset.c));
    case "registro":
      stato.registro = await comando("registro");
      return disegna();
    case "dimentica":
      if (!confirm("Dimenticare questo telefono? Per riusare la dashboard servirà di nuovo il QR di abbinamento.")) return;
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

$("visore-chiudi").addEventListener("click", () => $("visore").close());
$("visore-foto").addEventListener("click", () => nuovaFoto());
$("visore-diretta").addEventListener("click", () => (visore?.diretta ? fermaDiretta() : avviaDiretta()));
$("visore").addEventListener("close", () => {
  fermaDiretta();
  visore = null;
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
disegna();
if (config) {
  collega().catch((e) => mostra(`Collegamento non riuscito: ${e.message}`, true));
} else {
  stato.collegamento = "scollegato";
  aggiornaCollegamento();
  $("collegamento").querySelector("span").textContent = "Non abbinato";
}
