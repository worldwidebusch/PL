function defineMethod(target, name, value) {
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value
  });
}

export function installPdfJsCompat(scope = globalThis) {
  const PromiseConstructor = scope.Promise;
  const Uint8ArrayConstructor = scope.Uint8Array;

  if (PromiseConstructor && typeof PromiseConstructor.try !== "function") {
    defineMethod(PromiseConstructor, "try", function promiseTry(callback, ...args) {
      return PromiseConstructor.resolve().then(() => callback(...args));
    });
  }

  if (!Uint8ArrayConstructor) return;

  if (typeof Uint8ArrayConstructor.prototype.toHex !== "function") {
    defineMethod(Uint8ArrayConstructor.prototype, "toHex", function toHex() {
      const alphabet = "0123456789abcdef";
      let result = "";
      for (let index = 0; index < this.length; index += 1) {
        const byte = this[index];
        result += alphabet[byte >> 4] + alphabet[byte & 15];
      }
      return result;
    });
  }

  if (typeof Uint8ArrayConstructor.prototype.toBase64 !== "function") {
    defineMethod(Uint8ArrayConstructor.prototype, "toBase64", function toBase64() {
      let binary = "";
      const chunkSize = 32768;
      for (let offset = 0; offset < this.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, this.subarray(offset, offset + chunkSize));
      }
      return scope.btoa(binary);
    });
  }

  if (typeof Uint8ArrayConstructor.fromBase64 !== "function") {
    defineMethod(Uint8ArrayConstructor, "fromBase64", function fromBase64(value) {
      const binary = scope.atob(String(value).replace(/\s+/g, ""));
      const bytes = new Uint8ArrayConstructor(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    });
  }
}

installPdfJsCompat();
