// Chi si è collegato alla dashboard: dispositivo, luogo stimato dall'IP, IP e quando. Lo
// chiede al cervello quando si apre la sezione (cervello/casa/dashboard/accessi.py).

import { comando } from "../collegamento.js?v=3981fb4c";
import { icona } from "../icone.js?v=3981fb4c";
import { ridisegna, stato } from "../stato.js?v=3981fb4c";
import { apribile, esc, ora } from "../utili.js?v=3981fb4c";

function voce(a) {
  const sconosciuto = !a.d;
  const dove = [a.luogo || "luogo sconosciuto", a.ip ? `IP ${a.ip}` : ""].filter(Boolean).join(" · ");
  const quando = a.dal === a.al ? ora(a.al) : `${ora(a.dal)} – ${ora(a.al).replace(/^alle /, "")}`;
  return `<li class="${sconosciuto ? "sconosciuto" : ""}"><span class="punto">${icona(sconosciuto ? "attenzione" : "persona")}</span>`
    + `<div><div class="cosa">${esc(a.desc)}</div><div class="ora">${esc(dove)}</div><div class="ora">${esc(quando)}</div></div></li>`;
}

export function html() {
  let corpo;
  if (stato.accessi == null) corpo = `<p class="vuoto">Carico…</p>`;
  else corpo = stato.accessi.length ? `<ul class="registro">${stato.accessi.map(voce).join("")}</ul>` : `<p class="vuoto">Nessun accesso.</p>`;
  const piede = `<p class="fonte">Luoghi stimati dall'IP con <a href="https://db-ip.com" rel="noopener" target="_blank">DB-IP</a></p>`;
  const aggiorna = `<div class="azioni sinistra registro-azioni"><button data-azione="aggiorna_accessi" class="bottone secondario">${icona("avvio")}Aggiorna</button></div>`;
  return apribile("accessi", "Accessi", `<div class="scheda scheda-elenco">${corpo}${piede}</div>${aggiorna}`, "chi si collega");
}

// una richiesta alla volta (come il registro)
let inArrivo = null;
function carica() {
  inArrivo ??= comando("accessi")
    .then((voci) => {
      stato.accessi = voci;
      ridisegna();
    })
    .finally(() => (inArrivo = null));
  return inArrivo;
}

export async function aperta() {
  if (stato.accessi == null) await carica();
}

export const azioni = {
  aggiorna_accessi: carica,
};
