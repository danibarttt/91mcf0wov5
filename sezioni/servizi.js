// Servizi: i programmi del Raspberry (cervello, Zigbee2MQTT, Jellyfin...), se funzionano, i link
// alle loro pagine e il pulsante per riavviarli. Come le simulazioni, in una pagina in casa che
// si apre solo col telefono sul Wi-Fi di casa (cervello/casa/servizi.py).

import { comando } from "../collegamento.js?v=8f0df873";
import { sezione } from "../utili.js?v=8f0df873";

export function html() {
  return sezione(
    "Servizi",
    `<div class="scheda"><p class="vuoto">I programmi del Raspberry: se funzionano, le loro pagine (Zigbee2MQTT, Jellyfin…) e il riavvio. Si apre solo col telefono sul Wi-Fi di casa.</p>
    <div class="azioni registro-azioni"><button data-azione="apri_servizi" class="bottone secondario">Apri Servizi</button></div></div>`,
  );
}

export const azioni = {
  // come Tailscale: il cervello dà il link alla pagina in casa, con un biglietto valido un minuto
  // e una volta sola; la si apre in questa stessa scheda
  async apri_servizi() {
    const { url } = await comando("servizi");
    location.assign(url);
  },
};
