// Modalità vacanza: l'allarme non si accende e non si spegne più da solo agli orari.
// Interruttore con conferma.

import { comando } from "../collegamento.js?v=e1c5513a";
import { icona } from "../icone.js?v=e1c5513a";
import { stato } from "../stato.js?v=e1c5513a";
import { conferma, esc, mostra, sezione } from "../utili.js?v=e1c5513a";

export function html() {
  const a = stato.allarme;
  const [acc, spe] = a.orari || [];
  const spiegazione = a.vacanza
    ? "L'allarme non si accende e non si spegne da solo: resta come lo lasci"
    : acc
      ? `L'allarme si accende da solo alle ${esc(acc)} e si spegne alle ${esc(spe)}`
      : "";
  return sezione(
    "Modalità vacanza",
    `<div class="scheda vacanza ${a.vacanza ? "attiva" : ""}">
      <span class="disco-piccolo">${icona("valigia")}</span>
      <div class="testi"><div class="titolo">${a.vacanza ? "Attiva" : "Non attiva"}</div><div class="dettaglio">${spiegazione}</div></div>
      <label class="interruttore" aria-label="Modalità vacanza"><input type="checkbox" data-cambia="vacanza" ${a.vacanza ? "checked" : ""}><span></span></label>
    </div>`,
  );
}

// all'evento "change" dell'interruttore (vedi app.js)
export const cambi = {
  async vacanza(el) {
    const attiva = el.checked;
    el.checked = !attiva; // cambia davvero solo dopo la conferma e la risposta di casa
    const [acc, spe] = stato.allarme?.orari || ["01:30", "06:45"];
    const ok = await conferma(
      attiva ? "Attivare la modalità vacanza?" : "Finire la modalità vacanza?",
      attiva ? "Attiva" : "Finisci",
      false,
      attiva
        ? `L'allarme non si accenderà più da solo alle ${acc} e non si spegnerà alle ${spe}: resta come lo lasci. Ricordati di accenderlo quando parti.`
        : `Tornano gli orari automatici: si accende alle ${acc} e si spegne alle ${spe}.`,
    );
    if (!ok) return;
    await comando("vacanza", { attiva });
    mostra(attiva ? "Modalità vacanza attiva" : "Modalità vacanza finita");
  },
};
