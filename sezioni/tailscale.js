// Tailscale: per entrare nella rete di casa da fuori, acceso solo in vacanza. Come le
// simulazioni, si accende e si spegne da una pagina in casa, che si apre solo col telefono sul
// Wi-Fi di casa (cervello/casa/tailscale.py): da fuori non si accende né si spegne.

import { comando } from "../collegamento.js?v=d6e94351";
import { sezione } from "../utili.js?v=d6e94351";

export function html() {
  return sezione(
    "Tailscale",
    `<div class="scheda"><p class="vuoto">Per entrare nella rete di casa da fuori, in vacanza. Si accende e si spegne da una pagina in casa: si apre solo col telefono sul Wi-Fi di casa.</p>
    <div class="azioni registro-azioni"><button data-azione="apri_tailscale" class="bottone secondario">Apri Tailscale</button></div></div>`,
  );
}

export const azioni = {
  // il cervello dà il link alla pagina in casa, con un biglietto valido un minuto e una volta
  // sola; la si apre in questa stessa scheda (si torna indietro col pulsante della pagina)
  async apri_tailscale() {
    const { url } = await comando("tailscale");
    location.assign(url);
  },
};
