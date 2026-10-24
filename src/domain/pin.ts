// PBKDF2-HMAC-SHA256. Verification material is stored only in Android-backed SecureStore.
export const PIN_ROUNDS = 4096;
type Sha256 = (bytes: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>;

export function validPin(pin: string): boolean { return /^\d{4,6}$/.test(pin); }

function concat(left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(left.length + right.length);
  result.set(left); result.set(right, left.length);
  return result;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

function toHex(bytes: Uint8Array<ArrayBuffer>): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function derivePinVerifier(pin: string, salt: string, sha256: Sha256): Promise<string> {
  if (!validPin(pin) || !/^[a-f0-9]{32}$/.test(salt)) throw new Error('Choose a 4–6 digit PIN');
  const key = new Uint8Array(64);
  for (let index = 0; index < pin.length; index += 1) key[index] = pin.charCodeAt(index);
  const innerPad = key.map((byte) => byte ^ 0x36);
  const outerPad = key.map((byte) => byte ^ 0x5c);
  const hmac = async (message: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
    sha256(concat(outerPad, await sha256(concat(innerPad, message))));
  const block = concat(fromHex(salt), Uint8Array.from([0, 0, 0, 1]));
  let previous = await hmac(block);
  const output = Uint8Array.from(previous);
  for (let round = 1; round < PIN_ROUNDS; round += 1) {
    previous = await hmac(previous);
    for (let index = 0; index < output.length; index += 1) output[index] ^= previous[index];
  }
  return toHex(output);
}

export function equalVerifier(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function retryDelayMs(failures: number): number {
  return failures < 5 ? 0 : Math.min(300_000, 30_000 * 2 ** Math.min(4, failures - 5));
}
