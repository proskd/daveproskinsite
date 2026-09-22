// Minimal Buffer polyfill for gray-matter browser compatibility.
// gray-matter uses `Buffer.from(...)` without importing the buffer module,
// expecting a global Buffer (Node.js default). This shim covers what we need.

const { Buffer: _orig } = globalThis as Record<string, unknown>
if (!(_orig instanceof Function || typeof _orig === 'function')) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Buffer = class PolyfillBuffer {
    #buf: Uint8Array

    constructor(input?: string | Buffer | readonly number[] | ArrayBufferLike | SharedArrayBuffer, encOrOffset?: BufferEncoding | number, length?: number) {
      if (typeof input === 'string') {
        const encoding = (encOrOffset as BufferEncoding) ?? 'utf8'
        let bytes: number[]
        switch (encoding) {
          case 'utf8': bytes = [...new TextEncoder().encode(input)]
            break
          case 'ascii': bytes = [...input].map(c => c.charCodeAt(0) & 0xff)
            break
          case 'base64': bytes = this._fromBase64(input)
            break
          case 'hex': bytes = this._fromHex(input)
            break
          default: bytes = [...new TextEncoder().encode(input)]
        }
        this.#buf = new Uint8Array(bytes)
      } else if (input instanceof PolyfillBuffer) {
        this.#buf = new Uint8Array(input.#buf)
      } else if (input instanceof Uint8Array || Array.isArray(input)) {
        this.#buf = new Uint8Array(input as number[] | Uint8Array)
      } else if (input && typeof (input as ArrayBuffer).byteLength === 'number') {
        this.#buf = new Uint8Array(new Uint8Array(input as ArrayBufferLike))
      } else if (typeof encOrOffset === 'number') {
        this.#buf = new Uint8Array(encOrOffset)
      } else {
        this.#buf = new Uint8Array(0)
      }
    }

    static from(input: unknown, enc?: BufferEncoding | number): PolyfillBuffer {
      return new PolyfillBuffer(input as string, enc) as PolyfillBuffer
    }

    toString(enc?: BufferEncoding): string {
      if (!enc || enc === 'utf8') return new TextDecoder().decode(this.#buf)
      if (enc === 'ascii') return Array.from(this.#buf).map(b => String.fromCharCode(b)).join('')
      if (enc === 'base64') return btoa(String.fromCharCode(...this.#buf))
      if (enc === 'hex') return Array.from(this.#buf).map(b => b.toString(16).padStart(2, '0')).join('')
      return new TextDecoder().decode(this.#buf)
    }

    toDataURL(): string {
      const b64 = btoa(String.fromCharCode(...this.#buf))
      return `data:image/png;base64,${b64}`
    }

    length(): number { return this.#buf.length }

    slice(start?: number, end?: number): PolyfillBuffer {
      return new PolyfillBuffer(this.#buf.slice(start, end)) as PolyfillBuffer
    }

    #_fromBase64(b64: string): number[] {
      const binary = atob(b64)
      return [...binary].map(c => c.charCodeAt(0))
    }

    #_fromHex(hex: string): number[] {
      const out: number[] = []
      for (let i = 0; i < hex.length; i += 2) {
        out.push(parseInt(hex.substring(i, i + 2), 16))
      }
      return out
    }
  }
}
