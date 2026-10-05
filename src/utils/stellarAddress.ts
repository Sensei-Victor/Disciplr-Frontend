const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Validate a Stellar account or contract StrKey, including its checksum. */
export function isValidStellarAddress(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^[GC][A-Z2-7]{55}$/.test(trimmed)) return false;

  // 56 base32 symbols encode exactly 35 bytes: version, 32-byte key,
  // and a two-byte checksum. There are no unused bits or padding.
  const decoded = new Uint8Array(35);
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const character of trimmed) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      decoded[offset++] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }

  // Checking the entire version byte also rejects unsupported algorithms
  // whose addresses still start with G or C (SEP-23).
  if (decoded[0] !== (6 << 3) && decoded[0] !== (2 << 3)) return false;

  // CRC16-XModem: polynomial 0x1021, initial value zero, no reflection
  // or final XOR. StrKey stores the checksum in little-endian order.
  let checksum = 0;
  for (let i = 0; i < 33; i++) {
    checksum ^= decoded[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum & 0x8000) !== 0
        ? (checksum << 1) ^ 0x1021
        : checksum << 1;
      checksum &= 0xffff;
    }
  }
  return checksum === (decoded[33] | (decoded[34] << 8));
}
