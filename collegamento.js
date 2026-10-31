// Il collegamento con casa: abbinamento (codice salvato nel telefono), broker MQTT in cloud,
// messaggi cifrati in arrivo (finiscono in `stato`) e comandi in partenza.

import { Mqtt } from "./mqtt.js?v=0ce3ef5b";
import { importaChiave, cifra, decifra, imbottisci } from "./cifra.js?v=0ce3ef5b";
import { stato } from "./stato.js?v=0ce3ef5b";

const ARCHIVIO = "casa"; // chiave del localStorage con l'abbinamento
const DISPOSITIVO = "casa-dispositivo"; // chiave del localStorage con l'id di questo dispositivo (registro degli accessi)
const PORTA_WS = 8084;
const ATTESA_RISPOSTA_MS = 20000;
const ATTESA_COLLEGAMENTO_MS = 10000; // un comando aspetta al massimo così una connessione da riaprire

const enc = new TextEncoder();
const dec = new TextDecoder();

let abbinamento = null; // {h: broker, u: utente, p: password, k: chiave, t?: prefisso dei topic}
let chiave = null;
let client = null;
let P = "casa"; // prefisso dei topic (le prove ne usano un altro)
const inAttesa = new Map(); // id comando -> {resolve, reject, timer}
let alMessaggio = () => {};
let attesoCervello = false; // il primo messaggio `cervello` dopo il collegamento è quello salvato nel broker

// ---------- abbinamento ----------

export function abbinato() {
  return abbinamento != null;
}

// all'avvio: l'abbinamento salvato, se c'è
export function leggiAbbinamento() {
  try {
    const c = JSON.parse(localStorage.getItem(ARCHIVIO));
    abbinamento = c && c.h && c.u && c.p && c.k ? c : null;
  } catch {
    abbinamento = null;
  }
  if (abbinamento) chiediPersistenza();
  return abbinamento;
}

// il codice di abbinamento (link del QR con #c=... o codice incollato) letto; eccezione se non è valido
function leggiCodice(testo) {
  let t = testo.trim();
  const m = t.match(/#c=([A-Za-z0-9_-]+)/);
  if (m) t = m[1];
  t = t.replace(/-/g, "+").replace(/_/g, "/");
  t += "=".repeat((4 - (t.length % 4)) % 4);
  const c = JSON.parse(atob(t));
  if (!c.h || !c.u || !c.p || !c.k) throw new Error("codice incompleto");
  return c;
}

// true se il codice è quello con cui il telefono è già abbinato
export function stessoAbbinamento(testo) {
  const c = leggiCodice(testo);
  return ["h", "u", "p", "k", "t"].every((x) => (c[x] || "") === (abbinamento[x] || ""));
}

// abbina il telefono, solo se non lo è già: per cambiare abbinamento si passa da "Dimentica
// questo telefono". Eccezione se il codice non è valido.
export function abbina(testo) {
  if (abbinamento) throw new Error("telefono già abbinato");
  const c = leggiCodice(testo);
  localStorage.setItem(ARCHIVIO, JSON.stringify(c));
  abbinamento = c;
  chiediPersistenza();
}

// il codice dell'abbinamento salvato: serve a passarlo da Safari all'app sulla Home (iPhone)
export function codiceAbbinamento() {
  const c = abbinamento;
  const dati = { h: c.h, u: c.u, p: c.p, k: c.k, ...(c.t ? { t: c.t } : {}) };
  return btoa(String.fromCharCode(...enc.encode(JSON.stringify(dati)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function dimentica() {
  localStorage.removeItem(ARCHIVIO);
  if (client) client.chiudi();
}

// chiede al browser di non cancellare mai i dati del sito (abbinamento compreso)
function chiediPersistenza() {
  navigator.storage?.persist?.().catch(() => {});
}

// ---------- broker ----------

// `quandoArriva(argomento)` si chiama dopo ogni messaggio (o cambio di collegamento) già
// messo in `stato`: argomento "allarme", "luci", "foto/3", "collegamento"...
export async function collega(quandoArriva) {
  alMessaggio = quandoArriva;
  P = abbinamento.t || "casa";
  chiave = await importaChiave(abbinamento.k);
  client = new Mqtt({
    url: `wss://${abbinamento.h}:${PORTA_WS}/mqtt`,
    clientId: `casa-web-${casuale(5)}`,
    utente: abbinamento.u,
    password: abbinamento.p,
    // una sola iscrizione per tutto: EMQX Cloud dichiara al massimo 10 iscrizioni per client
    // (la pagina ne chiedeva 11), così non ci si avvicina più
    argomenti: [`${P}/#`],
    onMessaggio: (topic, payload) => ricevi(topic, payload).catch((e) => console.error(topic, e)),
    onStato: (s, motivo) => {
      stato.collegamento = s;
      stato.motivo = motivo || "";
      alMessaggio("collegamento");
      if (s === "collegato") {
        attesoCervello = true;
        presentati();
      }
    },
  });
  client.apri();
}

// a ogni collegamento la pagina dice al cervello chi è (cervello/casa/dashboard/accessi.py)
function presentati() {
  const app = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  comando("ciao", { d: idDispositivo(), cid: client.clientId, ua: navigator.userAgent, app }).catch(() => {});
}

function idDispositivo() {
  try {
    let id = localStorage.getItem(DISPOSITIVO);
    if (!id) localStorage.setItem(DISPOSITIVO, (id = casuale(8)));
    return id;
  } catch {
    return "senza-memoria";
  }
}

// in secondo piano il sistema chiude la connessione, a volte senza dirlo: al ritorno la si
// controlla, e se è morta se ne apre subito un'altra
export function riapri() {
  if (client) client.controlla();
}

async function ricevi(topic, payload) {
  if (topic === `${P}/comandi`) return; // i comandi dei telefoni (anche i nostri): sono per il cervello
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
    return alMessaggio(t);
  }
  const obj = JSON.parse(dec.decode(dati));
  if (t === "risposte") return risposta(obj);
  if (t === "cervello") {
    stato.cervello = obj;
    // il cervello si è (ri)collegato mentre la pagina era già collegata: dopo un riavvio non sa
    // chi c'è, e una pagina che non si ripresenta sembrerebbe un collegamento sconosciuto
    if (obj.online && !attesoCervello) presentati();
    attesoCervello = false;
  }
  else if (t === "allarme") stato.allarme = obj;
  else if (t === "camere") stato.camere = obj;
  else if (t === "luci") stato.luci = obj;
  else if (t === "sirene") stato.sirene = obj;
  else if (t === "suonano") stato.suonano = obj;
  else if (t === "batterie") stato.batterie = obj;
  else if (t === "muti") stato.muti = obj;
  else if (t.startsWith("sensori/")) stato.sensori.set(t.slice(8), obj);
  alMessaggio(t);
}

// ---------- comandi ----------

// manda un comando al cervello e aspetta la risposta (eccezione con il messaggio d'errore)
export async function comando(azione, argomenti = {}) {
  // prima ci si assicura che la connessione sia viva: un comando pubblicato su una connessione
  // morta si perde senza errori (31/10/2026: lo spegnimento dell'allarme)
  if (!client || !(await client.pronto(ATTESA_COLLEGAMENTO_MS))) throw new Error("Non collegato a casa");
  const id = casuale(8);
  const msg = { ...argomenti, id, ts: Date.now(), nonce: casuale(), a: azione };
  const blob = await cifra(chiave, `${P}/comandi`, imbottisci(enc.encode(JSON.stringify(msg))));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      inAttesa.delete(id);
      contaInAttesa();
      reject(new Error("Casa non ha risposto"));
    }, ATTESA_RISPOSTA_MS);
    inAttesa.set(id, { resolve, reject, timer });
    contaInAttesa();
    client.pubblica(`${P}/comandi`, blob);
  });
}

function risposta(r) {
  const p = inAttesa.get(r.id);
  if (!p) return; // risposta a un altro telefono
  inAttesa.delete(r.id);
  contaInAttesa();
  clearTimeout(p.timer);
  r.ok ? p.resolve(r.dati) : p.reject(new Error(r.errore || "Errore"));
}

// quanti comandi aspettano risposta, sull'elemento <html>: le prove (prove/) controllano che
// ognuno abbia avuto la sua
function contaInAttesa() {
  document.documentElement.dataset.comandiInAttesa = inAttesa.size;
}

function casuale(byte = 12) {
  return Array.from(crypto.getRandomValues(new Uint8Array(byte)), (b) => b.toString(16).padStart(2, "0")).join("");
}
