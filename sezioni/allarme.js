// La scheda dell'allarme in cima: spento (grigio), acceso (rosso), scattato; Accendi/Spegni.
// Durante il pre-allarme delle persiane l'allarme resta acceso: il dettaglio lo dice.

import { comando } from "../collegamento.js?v=e1c5513a";
import { icona } from "../icone.js?v=e1c5513a";
import { stato } from "../stato.js?v=e1c5513a";
import { conferma, esc, etichetta, mostra, ora } from "../utili.js?v=e1c5513a";

const TITOLI = { spento: "Spento", acceso: "Acceso", scattato: "Scattato!" };
const SIMBOLI = { spento: "scudo", acceso: "scudoOk", scattato: "scudoAllarme" };

export function html() {
  const a = stato.allarme;
  const bottone =
    a.stato === "spento"
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

export const azioni = {
  async accendi_allarme() {
    if (!(await conferma("Accendere l'allarme?", "Accendi", true))) return;
    await comando("accendi_allarme");
    mostra("Allarme acceso");
  },
  async spegni_allarme() {
    if (!(await conferma("Spegnere l'allarme?", "Spegni"))) return;
    await comando("spegni_allarme");
    mostra("Allarme spento");
  },
};
