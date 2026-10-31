// Le camere: un riquadro per camera con l'ultima foto, e il visore (<dialog id="visore"> in
// index.html) con "Nuova foto" e la diretta (una foto al secondo).

import { comando } from "../collegamento.js?v=3981fb4c";
import { icona } from "../icone.js?v=3981fb4c";
import { stato } from "../stato.js?v=3981fb4c";
import { $, apribile, esc, mostra } from "../utili.js?v=3981fb4c";

const DIRETTA_RINNOVO_MS = 30000; // il cervello la ferma dopo 60 s senza rinnovo
const DIRETTA_MAX_MS = 5 * 60000; // e il telefono comunque dopo 5 minuti

export function html() {
  if (!stato.camere.length) return "";
  const riquadri = stato.camere.map((cam) => {
    const url = stato.foto.get(cam.c);
    const dentro = url ? `<img src="${url}" alt="">` : `<span class="vuota">${icona("camera")}</span>`;
    return `<button class="camera" data-azione="apri_camera" data-c="${cam.c}">${dentro}<span class="nome">${esc(cam.n)}</span></button>`;
  });
  const n = stato.camere.length;
  return apribile("camere", "Camere", `<div class="camere">${riquadri.join("")}</div>`, `${n} ${n === 1 ? "camera" : "camere"}`);
}

export const azioni = {
  async apri_camera(el) {
    await apriVisore(Number(el.dataset.c));
  },
};

// ---------- visore ----------

let visore = null; // {c: canale, diretta: bool, rinnovo, fine}

function nomeCamera(c) {
  return stato.camere.find((cam) => cam.c === c)?.n || `Camera ${c}`;
}

// a ogni foto che arriva (vedi app.js)
export function aggiornaVisore() {
  if (!visore) return;
  const url = stato.foto.get(visore.c);
  const img = $("visore-img");
  if (url) img.src = url;
  else img.removeAttribute("src");
  $("visore-attesa").hidden = Boolean(url);
  $("visore-live").hidden = !visore.diretta;
  $("visore-diretta").textContent = visore.diretta ? "Ferma diretta" : "Diretta";
  $("visore-nota").textContent = visore.diretta ? "Una foto al secondo · si ferma da sola dopo 5 minuti" : "Foto su richiesta";
}

async function apriVisore(c) {
  visore = { c, diretta: false };
  $("visore-nome").textContent = nomeCamera(c);
  $("visore-attesa").textContent = "Chiedo la foto…";
  aggiornaVisore();
  $("visore").showModal();
  await nuovaFoto();
}

async function nuovaFoto() {
  if (!visore) return;
  try {
    await comando("foto", { c: visore.c });
  } catch (e) {
    $("visore-attesa").textContent = e.message;
    mostra(e.message, true);
  }
}

async function avviaDiretta() {
  const v = visore;
  try {
    await comando("diretta", { c: v.c });
  } catch (e) {
    return mostra(e.message, true);
  }
  v.diretta = true;
  v.rinnovo = setInterval(() => comando("diretta", { c: v.c }).catch(() => {}), DIRETTA_RINNOVO_MS);
  v.fine = setTimeout(() => fermaDiretta(v), DIRETTA_MAX_MS);
  aggiornaVisore();
}

// anche quando la pagina va in secondo piano (vedi app.js)
export function fermaDiretta(v = visore) {
  if (!v || !v.diretta) return;
  v.diretta = false;
  clearInterval(v.rinnovo);
  clearTimeout(v.fine);
  comando("fine_diretta", { c: v.c }).catch(() => {});
  aggiornaVisore();
}

$("visore-chiudi").innerHTML = icona("chiudi");
$("visore-chiudi").addEventListener("click", () => $("visore").close());
$("visore-foto").addEventListener("click", () => nuovaFoto());
$("visore-diretta").addEventListener("click", () => (visore?.diretta ? fermaDiretta() : avviaDiretta()));
$("visore").addEventListener("close", () => {
  fermaDiretta();
  visore = null;
});
