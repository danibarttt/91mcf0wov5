// La scheda dell'allarme in cima: spento (grigio), acceso (rosso), scattato; Accendi/Spegni.
// Durante il pre-allarme delle persiane l'allarme resta acceso: il dettaglio lo dice.

import { comando } from "../collegamento.js?v=b35c0e2f";
import { icona } from "../icone.js?v=b35c0e2f";
import { ridisegna, stato } from "../stato.js?v=b35c0e2f";
import { conferma, esc, etichetta, fatto, ora } from "../utili.js?v=b35c0e2f";

const TITOLI = { spento: "Spento", acceso: "Acceso", scattato: "Scattato!" };
const SIMBOLI = { spento: "scudo", acceso: "scudoOk", scattato: "scudoAllarme" };
const ATTESA_STATO_MS = 5000;

let inCorso = null; // "accendi" | "spegni": comando partito, casa non ha ancora confermato

export function html() {
  const a = stato.allarme;
  const bottone = inCorso
    ? `<button class="bottone secondario" disabled><span class="spinner" role="progressbar" aria-label="In corso"></span>${inCorso === "spegni" ? "Spengo…" : "Accendo…"}</button>`
    : a.stato === "spento"
      ? `<button data-azione="accendi_allarme" class="bottone pericolo">${icona("scudoOk")}Accendi</button>`
      : `<button data-azione="spegni_allarme" class="bottone ${a.stato === "scattato" ? "pericolo" : "secondario"}">${icona("scudo")}Spegni</button>`;
  const dettaglio = a.stato === "scattato" ? esc(a.perche)
    : a.preallarme ? `Pre-allarme: ${esc(etichetta(a.preallarme.causa))}`
    : `${ora(a.dal)} · ${esc(a.perche)}`;
  return `
    <section class="scheda allarme" data-stato="${esc(a.stato)}">
      <div class="disco">${icona(SIMBOLI[a.stato] || "scudo")}</div>
      <div class="testi">
        <div class="etichetta-piccola">Allarme</div>
        <div class="stato">${esc(TITOLI[a.stato] || a.stato)}</div>
        <div class="dettaglio">${dettaglio}</div>
      </div>
      ${bottone}
    </section>`;
}

// Manda il comando e lo dice chiaro: "Spengo…" finché è in viaggio, la spunta verde appena
// arriva il nuovo stato, altrimenti un errore che dice che non è fatto (31/10/2026 uno
// spegnimento perso non lo diceva). Lo stato e non la risposta: il cervello cambia subito
// l'allarme, ma risponde dopo aver fermato le sirene e mandato le notifiche (anche 20 s).
async function cambia(azione, voluto, ok, nonOk) {
  inCorso = azione;
  ridisegna();
  try {
    let esito; // finché casa non risponde undefined, poi true o l'errore
    let rispostaAlle = 0;
    comando(`${azione}_allarme`).then(() => (esito = true), (e) => (esito = e));
    while (stato.allarme?.stato !== voluto) {
      if (esito instanceof Error) throw esito;
      // ha risposto che è fatto ma lo stato non arriva (o è già cambiato di nuovo): basta così
      if (esito === true && Date.now() - (rispostaAlle ||= Date.now()) > ATTESA_STATO_MS) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    fatto(ok);
  } catch (e) {
    console.warn(`${azione}_allarme:`, e.message); // il motivo (es. "Casa non ha risposto"): a chi la guarda serve solo sapere che non è fatto
    throw new Error(nonOk);
  } finally {
    inCorso = null;
    ridisegna();
  }
}

export const azioni = {
  async accendi_allarme() {
    if (!(await conferma("Accendere l'allarme?", "Accendi", true))) return;
    await cambia("accendi", "acceso", "Allarme acceso", "ATTENZIONE, l'allarme non è stato correttamente acceso, riprova");
  },
  async spegni_allarme() {
    if (!(await conferma("Spegnere l'allarme?", "Spegni"))) return;
    await cambia("spegni", "spento", "Allarme spento", "ATTENZIONE, l'allarme non è stato correttamente spento, riprova");
  },
};
