// Abbinamento del telefono: la schermata per incollare il codice (iPhone, app sulla Home) e,
// in fondo alla dashboard, "Copia codice di abbinamento" e "Dimentica questo telefono".

import { abbina, codiceAbbinamento, dimentica } from "../collegamento.js?v=88c049d4";
import { $, conferma, mostra } from "../utili.js?v=88c049d4";

export function schermata() {
  return `
    <section class="scheda abbina">
      <h2>Abbina questo telefono</h2>
      <p>Inquadra con la fotocamera il QR di abbinamento: si apre questa pagina e il telefono si abbina da solo.</p>
      <p>Su iPhone, nell'app aggiunta alla schermata Home, incolla qui il codice copiato da Safari:</p>
      <textarea id="codice" placeholder="Codice di abbinamento" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
      <div class="azioni">
        <button data-azione="incolla_codice" class="bottone secondario">Incolla</button>
        <button data-azione="abbina" class="bottone primario">Abbina</button>
      </div>
    </section>`;
}

export function piede() {
  return `<div class="piede"><button data-azione="copia_codice">Copia codice di abbinamento</button><button data-azione="dimentica">Dimentica questo telefono</button></div>`;
}

export const azioni = {
  async incolla_codice() {
    $("codice").value = await navigator.clipboard.readText();
  },
  async abbina() {
    abbina($("codice").value);
    location.reload();
  },
  async copia_codice() {
    await navigator.clipboard.writeText(codiceAbbinamento());
    mostra("Codice copiato");
  },
  async dimentica() {
    if (!(await conferma("Dimenticare questo telefono? Servirà di nuovo il QR di abbinamento.", "Dimentica", true))) return;
    dimentica();
    location.reload();
  },
};
