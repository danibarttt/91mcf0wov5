// Icone a tratto (24×24, colore del testo), disegnate per questa dashboard.

const tracciati = {
  scudo: "M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6l7-3z",
  scudoOk: "M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6l7-3zM9 12l2 2 4-4",
  scudoAllarme: "M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6l7-3zM12 8v4.5M12 16h.01",
  lampadina: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z",
  accensione: "M12 3v8M6.3 6.6a8 8 0 1 0 11.4 0",
  camera: "M3 7.5A1.5 1.5 0 0 1 4.5 6h9A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 16.5zM15 10.5l6-3.5v10l-6-3.5",
  porta: "M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3 21h18M14.5 12h.01",
  finestra: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM12 4v16M4 12h16",
  persiana: "M4 4h16M5 4v13M19 4v13M5 8h14M5 12.5h14M5 17h14",
  garage: "M3 21V9.5L12 4l9 5.5V21M7 21v-8h10v8M7 17h10",
  fiamma: "M12 3c.8 3 5 5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.8 2.3-4.8.1 2 1 3.1 2.2 3.3C11.3 8.6 10 6.8 12 3z",
  goccia: "M12 3.5l5.2 7.2a6.3 6.3 0 1 1-10.4 0L12 3.5z",
  termometro: "M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0zM12 17.5v-6",
  batteria: "M3.5 8h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM21 11v2M6 11v2",
  orologio: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  ok: "M5 12.5l4.5 4.5L19 7.5",
  attenzione: "M12 4l9 16H3l9-16zM12 10v4.5M12 17.5h.01",
  muto: "M11 5L6.5 9H3v6h3.5l4.5 4V5zM16 9.5l5 5M21 9.5l-5 5",
  chiudi: "M6 6l12 12M18 6L6 18",
  persona: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0",
  bottone: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  avvio: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
};

export function icona(nome, classe = "") {
  return `<svg class="ic ${classe}" viewBox="0 0 24 24" aria-hidden="true"><path d="${tracciati[nome] || ""}"/></svg>`;
}
