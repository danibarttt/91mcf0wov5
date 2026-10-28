// Dashboard di casa: avvio, ordine delle sezioni, smistamento dei tocchi.
//
// Ogni sezione sta in sezioni/<nome>.js con il suo HTML e le sue azioni. La pagina non
// contiene dati: arrivano dal cervello, cifrati, tramite collegamento.js, e finiscono in
// stato.js. A ogni messaggio la pagina si ridisegna da capo.
//
// Un pulsante con data-azione="x" chiama azioni.x(elemento) della sua sezione; un
// interruttore con data-cambia="x" chiama cambi.x(elemento) all'evento "change".

import * as collegamento from "./collegamento.js?v=1c1a257f";
import { icona } from "./icone.js?v=1c1a257f";
import { quandoRidisegnare, stato } from "./stato.js?v=1c1a257f";
import { $, maiuscola, mostra, sezioniAperte } from "./utili.js?v=1c1a257f";
import * as abbinamento from "./sezioni/abbinamento.js?v=1c1a257f";
import * as allarme from "./sezioni/allarme.js?v=1c1a257f";
import * as camere from "./sezioni/camere.js?v=1c1a257f";
import * as luci from "./sezioni/luci.js?v=1c1a257f";
import * as registro from "./sezioni/registro.js?v=1c1a257f";
import * as riepilogo from "./sezioni/riepilogo.js?v=1c1a257f";
import * as sensori from "./sezioni/sensori.js?v=1c1a257f";
import * as sirene from "./sezioni/sirene.js?v=1c1a257f";
import * as vacanza from "./sezioni/vacanza.js?v=1c1a257f";

// la dashboard, dall'alto in basso
function htmlDashboard() {
  return [
    allarme.html(),
    riepilogo.html(),
    luci.html(),
    camere.html(),
    sensori.porte(),
    sensori.fumoEAcqua(),
    sensori.temperature(),
    sirene.html(),
    registro.html(),
    vacanza.html(),
    sirene.simulazioni(),
    abbinamento.piede(),
  ].join("");
}

const azioni = { ...abbinamento.azioni, ...allarme.azioni, ...camere.azioni, ...luci.azioni, ...registro.azioni, ...riepilogo.azioni, ...sirene.azioni };
const cambi = { ...vacanza.cambi };

// ---------- disegno ----------

// al massimo una volta per fotogramma, anche se arrivano tanti messaggi insieme
let disegnoInAttesa = false;
function disegna() {
  if (disegnoInAttesa) return;
  disegnoInAttesa = true;
  requestAnimationFrame(() => {
    disegnoInAttesa = false;
    const app = $("app");
    // finché non arriva lo stato dell'allarme: schermata di caricamento, poi dissolvenza
    const inAttesaDiCasa = collegamento.abbinato() && !stato.allarme;
    app.innerHTML = !collegamento.abbinato() ? abbinamento.schermata() : inAttesaDiCasa ? htmlCaricamento() : htmlDashboard();
    if (!inAttesaDiCasa && app.dataset.pronta !== "1") {
      app.dataset.pronta = "1";
      app.classList.add("entra"); // solo alla prima comparsa, non a ogni ridisegno
      setTimeout(() => app.classList.remove("entra"), 800);
    }
    // la Content-Security-Policy vieta gli stili scritti nell'HTML: i colori dei dati
    // (es. quello di una lampadina) si impostano da qui
    for (const el of app.querySelectorAll("[data-colore]")) el.style.setProperty("--colore", el.dataset.colore);
  });
}

function htmlCaricamento() {
  if (stato.collegamento === "scollegato" && stato.motivo === "credenziali rifiutate") {
    return `<div class="caricamento"><div class="disco-errore">${icona("attenzione")}</div><p>Credenziali rifiutate: riabbina il telefono col QR.</p></div>`;
  }
  const testo = stato.collegamento === "collegato" ? "Aspetto i dati di casa…" : "Mi collego a casa…";
  return `<div class="caricamento"><div class="spinner" role="progressbar" aria-label="Caricamento"></div><p>${testo}</p></div>`;
}

// il pallino in alto a destra
function disegnaCollegamento() {
  let s = stato.collegamento;
  let testo = { collegamento: "Collegamento…", collegato: "Collegato", scollegato: "Non collegato" }[s];
  if (!collegamento.abbinato()) testo = "Non abbinato";
  else if (s === "collegato" && stato.cervello && !stato.cervello.online) {
    s = "scollegato";
    testo = "Casa non risponde";
  } else if (s === "scollegato" && stato.motivo === "credenziali rifiutate") testo = "Credenziali rifiutate";
  $("collegamento").dataset.stato = s;
  $("collegamento").querySelector("span").textContent = testo;
}

function disegnaData() {
  $("saluto").textContent = maiuscola(new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }));
}

// dopo ogni messaggio del cervello (argomento: "allarme", "luci", "foto/3"...)
function arrivato(argomento) {
  disegnaCollegamento();
  if (argomento === "collegamento") {
    if (!stato.allarme) disegna(); // il testo sotto lo spinner
    return;
  }
  if (argomento === "luci") luci.aggiornaPannello();
  if (argomento.startsWith("foto/")) camere.aggiornaVisore();
  disegna();
}

// ---------- tocchi ----------

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-azione]");
  if (!el) return;
  const azione = azioni[el.dataset.azione];
  if (!azione) return console.warn("azione sconosciuta:", el.dataset.azione);
  el.disabled = true;
  azione(el)
    .catch((err) => mostra(err.message || String(err), true))
    .finally(() => (el.disabled = false));
});

document.addEventListener("change", (e) => {
  const el = e.target;
  const cambio = cambi[el.dataset?.cambia];
  if (!cambio) return;
  el.disabled = true;
  cambio(el)
    .catch((err) => mostra(err.message || String(err), true))
    .finally(() => (el.disabled = false));
});

// i riquadri cliccabili che non sono <button> (le luci) si usano anche da tastiera
document.addEventListener("keydown", (e) => {
  const el = e.target.closest?.('[role="button"][data-azione]');
  if (el && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    el.click();
  }
});

// ricorda quali sezioni a scomparsa sono aperte ("toggle" non risale: si ascolta in cattura)
document.addEventListener(
  "toggle",
  (e) => {
    const id = e.target.dataset?.sezione;
    if (!id) return;
    e.target.open ? sezioniAperte.add(id) : sezioniAperte.delete(id);
    if (id === "registro" && e.target.open) registro.aperta().catch((err) => mostra(err.message, true));
  },
  true,
);

// in secondo piano il sistema chiude la connessione: al ritorno si riapre subito
document.addEventListener("visibilitychange", () => {
  if (document.hidden) camere.fermaDiretta();
  else collegamento.riapri();
});

// ---------- avvio ----------

if (location.hash.startsWith("#c=")) {
  // aperta dal QR di abbinamento
  try {
    collegamento.abbina(location.hash);
    mostra("Telefono abbinato");
  } catch {
    mostra("Codice di abbinamento non valido", true);
  }
  history.replaceState(null, "", location.pathname + location.search); // il codice esce dalla barra
}
if (!collegamento.abbinato()) collegamento.leggiAbbinamento();
quandoRidisegnare(disegna);
disegnaData();
setInterval(disegnaData, 60000);
disegnaCollegamento();
disegna();
if (collegamento.abbinato()) {
  collegamento.collega(arrivato).catch((e) => mostra(`Collegamento non riuscito: ${e.message}`, true));
} else {
  stato.collegamento = "scollegato";
  disegnaCollegamento();
}
