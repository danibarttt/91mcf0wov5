// Sirene: volume e suoneria giusti (li controlla il cervello, vedi cervello/casa/volumi.py)
// e l'accesso alle simulazioni, che si aprono solo dalla rete di casa.

import { comando } from "../collegamento.js?v=3ea7d1f2";
import { stato } from "../stato.js?v=3ea7d1f2";
import { apribile, colpoDOcchio, conferma, esc, mostra, ora, pillola, sezione } from "../utili.js?v=3ea7d1f2";

export function html() {
  const s = stato.sirene;
  if (!s) return "";
  const male = s.elenco.filter((x) => x.ok === false);
  const ignote = s.elenco.filter((x) => x.ok == null);
  const sotto = colpoDOcchio([
    s.prova
      ? pillola("Al minimo per una simulazione", "muto", "attenzione")
      : male.length
        ? pillola(`${male.length} da controllare`, "attenzione", "attenzione")
        : ignote.length
          ? pillola(`${ignote.length} non lette`, "attenzione")
          : pillola("Volume e suoneria giusti", "ok", "ok"),
  ]);
  const righe = s.elenco.map((x) => {
    const chip = x.ok === true ? `<span class="etichetta">Giusto</span>` : x.ok === false ? `<span class="etichetta attenzione">Diverso</span>` : `<span class="etichetta neutra">?</span>`;
    return `<li><span class="nome">${esc(x.n)}${x.d ? `<span class="quando">${esc(x.d)}</span>` : ""}</span>${chip}</li>`;
  });
  const corpo = `<div class="scheda scheda-elenco"><ul class="elenco">${righe.join("")}</ul>
    <div class="azioni registro-azioni"><button data-azione="controlla_sirene" class="bottone secondario">Ricontrolla</button>
    <button data-azione="correggi_sirene" class="bottone primario">Rimetti quelli giusti</button></div></div>`;
  return apribile("sirene", "Sirene", corpo, s.letto ? `camere lette ${ora(s.letto)}` : "volume e suoneria", sotto);
}

export function simulazioni() {
  return sezione(
    "Simulazioni",
    `<div class="scheda"><p class="vuoto">Prove dal vero degli scenari, con le sirene al minimo. La pagina è in casa: si apre solo col telefono sul Wi-Fi di casa.</p>
    <div class="azioni registro-azioni"><button data-azione="apri_simulazioni" class="bottone secondario">Apri le simulazioni</button></div></div>`,
  );
}

export const azioni = {
  async controlla_sirene() {
    await comando("controlla_sirene");
    mostra("Sirene ricontrollate");
  },
  async correggi_sirene() {
    if (!(await conferma("Rimettere volume e suoneria giusti a tutte le sirene?", "Rimetti"))) return;
    await comando("correggi_sirene");
    mostra("Volumi rimessi");
  },
  // il cervello dà il link alla pagina in casa, con un biglietto valido un minuto e una volta
  // sola; la si apre in questa stessa scheda (si torna indietro col pulsante della pagina)
  async apri_simulazioni() {
    const { url } = await comando("simulazioni");
    location.assign(url);
  },
};
