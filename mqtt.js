// Client MQTT 3.1.1 minimo su WebSocket: quello che serve alla dashboard e niente altro
// (CONNECT, SUBSCRIBE e PUBLISH a QoS 0, PING, riconnessione). Scritto qui invece di usare
// una libreria per tenere poco e leggibile il codice che gira accanto alla chiave.

const enc = new TextEncoder();
const dec = new TextDecoder();

function varint(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 128;
    out.push(b);
  } while (n > 0);
  return out;
}

function stringa(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function pacchetto(tipo, ...parti) {
  const corpo = parti.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const lunghezza = corpo.reduce((n, p) => n + p.length, 0);
  const testa = [tipo, ...varint(lunghezza)];
  const out = new Uint8Array(testa.length + lunghezza);
  out.set(testa, 0);
  let i = testa.length;
  for (const p of corpo) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

export class Mqtt {
  // onMessaggio(topic, payload: Uint8Array, retain), onStato("collegamento"|"collegato"|"scollegato", dettaglio)
  constructor({ url, clientId, utente, password, argomenti, onMessaggio, onStato }) {
    Object.assign(this, { url, clientId, utente, password, argomenti, onMessaggio, onStato });
    this.ws = null;
    this.buffer = new Uint8Array(0);
    this.attesa = 1000;
    this.chiuso = false;
    this.collegato = false;
  }

  apri() {
    if (this.ws && this.ws.readyState <= 1) return;
    this.chiuso = false;
    clearTimeout(this.timerRiprova);
    this.onStato("collegamento");
    const ws = new WebSocket(this.url, ["mqtt"]);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.buffer = new Uint8Array(0);
    ws.onopen = () => {
      const flag = 0x80 | 0x40 | 0x02; // utente, password, sessione pulita
      ws.send(
        pacchetto(0x10, stringa("MQTT"), [4, flag, 0, 30], stringa(this.clientId), stringa(this.utente), stringa(this.password)),
      );
    };
    ws.onmessage = (e) => this.ricevi(new Uint8Array(e.data));
    ws.onclose = () => this.caduto("connessione chiusa");
    ws.onerror = () => {}; // segue sempre onclose
  }

  chiudi() {
    this.chiuso = true;
    clearTimeout(this.timerRiprova);
    clearInterval(this.timerPing);
    if (this.ws) {
      try {
        this.ws.send(pacchetto(0xe0));
      } catch {}
      this.ws.close();
    }
  }

  caduto(motivo) {
    clearInterval(this.timerPing);
    this.collegato = false;
    this.ws = null;
    this.onStato("scollegato", this.motivo || motivo);
    this.motivo = null;
    if (this.chiuso) return;
    this.timerRiprova = setTimeout(() => this.apri(), this.attesa);
    this.attesa = Math.min(this.attesa * 2, 30000);
  }

  pubblica(topic, payload) {
    if (!this.collegato) throw new Error("Non collegato");
    this.ws.send(pacchetto(0x30, stringa(topic), payload));
  }

  ricevi(dati) {
    this.ultimoDato = Date.now();
    const b = new Uint8Array(this.buffer.length + dati.length);
    b.set(this.buffer, 0);
    b.set(dati, this.buffer.length);
    this.buffer = b;
    for (;;) {
      const b = this.buffer;
      if (b.length < 2) return;
      let lunghezza = 0;
      let molt = 1;
      let i = 1;
      for (;;) {
        if (i >= b.length) return; // lunghezza non ancora arrivata tutta
        const c = b[i++];
        lunghezza += (c & 127) * molt;
        molt *= 128;
        if (!(c & 128)) break;
      }
      if (b.length < i + lunghezza) return;
      this.gestisci(b[0], b.subarray(i, i + lunghezza));
      this.buffer = b.slice(i + lunghezza);
    }
  }

  gestisci(testa, corpo) {
    switch (testa >> 4) {
      case 2: {
        // CONNACK
        if (corpo[1] !== 0) {
          const credenziali = corpo[1] === 4 || corpo[1] === 5;
          this.chiuso = credenziali; // credenziali sbagliate: inutile riprovare
          this.motivo = credenziali ? "credenziali rifiutate" : `rifiutato dal broker (${corpo[1]})`;
          this.ws.close();
          return;
        }
        this.collegato = true;
        this.attesa = 1000;
        const sub = this.argomenti.flatMap((t) => [...stringa(t), 0]);
        this.ws.send(pacchetto(0x82, [0, 1], sub));
        this.ultimoDato = Date.now();
        this.timerPing = setInterval(() => {
          if (Date.now() - this.ultimoDato > 45000) return this.ws && this.ws.close();
          try {
            this.ws.send(pacchetto(0xc0));
          } catch {}
        }, 20000);
        this.onStato("collegato");
        return;
      }
      case 3: {
        // PUBLISH (chiediamo QoS 0, ma per sicurezza si gestisce l'id del QoS 1)
        const qos = (testa >> 1) & 3;
        const lt = (corpo[0] << 8) | corpo[1];
        const topic = dec.decode(corpo.subarray(2, 2 + lt));
        let i = 2 + lt;
        if (qos > 0) {
          this.ws.send(pacchetto(0x40, corpo.subarray(i, i + 2))); // PUBACK
          i += 2;
        }
        this.onMessaggio(topic, corpo.slice(i), Boolean(testa & 1));
        return;
      }
      default:
        return; // SUBACK, PINGRESP
    }
  }
}
