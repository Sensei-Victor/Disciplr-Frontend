import { describe, it, expect } from 'vitest';
import { ACCOUNT_A, CONTRACT_ADDRESS } from '@/__tests__/fixtures/stellarAddresses';
import { isValidStellarAddress } from '../stellarAddress';

describe('isValidStellarAddress', () => {
  it.each([ACCOUNT_A, CONTRACT_ADDRESS])('accepts a checksum-valid address: %s', (address) => {
    expect(isValidStellarAddress(address)).toBe(true);
    expect(isValidStellarAddress(` \t${address}\n`)).toBe(true);
  });

  it.each([ACCOUNT_A, CONTRACT_ADDRESS])('rejects a corrupted checksum: %s', (address) => {
    expect(isValidStellarAddress(`${address.slice(0, -1)}A`)).toBe(false);
  });

  it.each([ACCOUNT_A, CONTRACT_ADDRESS])('rejects a corrupted middle character: %s', (address) => {
    const replacement = address[28] === 'A' ? 'B' : 'A';
    expect(isValidStellarAddress(`${address.slice(0, 28)}${replacement}${address.slice(29)}`)).toBe(false);
  });

  it.each([ACCOUNT_A, CONTRACT_ADDRESS])('rejects every single-symbol mutation: %s', (address) => {
    // Leave the G/C prefix intact so all mutations retain the expected shape.
    for (let i = 1; i < address.length; i++) {
      const replacement = address[i] === 'A' ? 'B' : 'A';
      const corrupted = `${address.slice(0, i)}${replacement}${address.slice(i + 1)}`;
      expect(isValidStellarAddress(corrupted)).toBe(false);
    }
  });

  it.each([
    'GEAACAQDAQCQMBYIBEFAWDANBYHRAEISCMKBKFQXDAMRUGY4DUPB6652',
    'CEAACAQDAQCQMBYIBEFAWDANBYHRAEISCMKBKFQXDAMRUGY4DUPB72YD',
  ])('rejects a checksum-valid but unsupported version byte: %s', (address) => {
    expect(isValidStellarAddress(address)).toBe(false);
  });

  it('rejects arbitrary strings with the right shape', () => {
    expect(isValidStellarAddress(`G${'A'.repeat(55)}`)).toBe(false);
    expect(isValidStellarAddress(`C${'A'.repeat(55)}`)).toBe(false);
  });

  it('rejects unsupported prefixes', () => {
    expect(isValidStellarAddress(`X${ACCOUNT_A.slice(1)}`)).toBe(false);
  });

  it('rejects wrong lengths and padding', () => {
    expect(isValidStellarAddress(ACCOUNT_A.slice(0, -1))).toBe(false);
    expect(isValidStellarAddress(`${ACCOUNT_A}A`)).toBe(false);
    expect(isValidStellarAddress(`${ACCOUNT_A}=`)).toBe(false);
  });

  it('rejects invalid base32 characters and lowercase', () => {
    expect(isValidStellarAddress(`${ACCOUNT_A.slice(0, -1)}0`)).toBe(false);
    expect(isValidStellarAddress(`${ACCOUNT_A.slice(0, -1)}1`)).toBe(false);
    expect(isValidStellarAddress(ACCOUNT_A.toLowerCase())).toBe(false);
  });

  it.each(['', '   ', null, undefined, 123, {}, { trim: 1 }])('rejects empty or non-string inputs: %s', (value) => {
    expect(isValidStellarAddress(value as string)).toBe(false);
  });
});
