// Cifratura end-to-end, gemella di cervello/casa/dashboard/cifra.py: AES-256-GCM, messaggio =
// nonce (12 byte) + testo cifrato con tag, topic MQTT come dato associato.

const enc = new TextEncoder();

export async function importaChiave(base64) {
  const grezza = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", grezza, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function cifra(chiave, topic, dati) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const testo = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: enc.encode(topic) }, chiave, dati),
  );
  const out = new Uint8Array(12 + testo.length);
  out.set(nonce, 0);
  out.set(testo, 12);
  return out;
}

// Rifiuta (eccezione) se il messaggio non è stato cifrato con la nostra chiave per quel topic.
export async function decifra(chiave, topic, blob) {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blob.subarray(0, 12), additionalData: enc.encode(topic) },
      chiave,
      blob.subarray(12),
    ),
  );
}
