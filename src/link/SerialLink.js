// Talks to a real flight controller over USB using the browser's WebSerial API.
// WebSerial only exists in Chromium browsers (Chrome, Edge, Brave), and only on
// pages served over https:// or from localhost.

export function serialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export class SerialLink {
  constructor() {
    this.name = 'USB';
    this.port = null;
    this.reader = null;
    this.onData = () => {};
    this.onClose = () => {};
    this.closing = false;
  }

  async open({ baudRate = 115200 } = {}) {
    // Opens the browser's port picker. Must be called from a click.
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate });
    this.closing = false;
    this.readLoop();
  }

  async readLoop() {
    while (this.port && this.port.readable && !this.closing) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this.onData(value);
        }
      } catch (e) {
        // Cable pulled or FC rebooted. Fall through and report the close.
        if (!this.closing) console.warn('Serial read error', e);
        break;
      } finally {
        this.reader.releaseLock();
      }
    }
    if (!this.closing) this.onClose();
  }

  async write(bytes) {
    if (!this.port || !this.port.writable) return;
    const w = this.port.writable.getWriter();
    try { await w.write(bytes); } finally { w.releaseLock(); }
  }

  async close() {
    this.closing = true;
    try { await this.reader?.cancel(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = null;
  }
}
