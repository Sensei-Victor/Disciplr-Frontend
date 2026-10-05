# CreateVault Validation Rules & Submission Contract

This document describes every validation rule enforced by the CreateVault flow,
the balance-aware submission gate, and the three-step form → review → confirm
lifecycle.

---

## 1. Types

Defined in [`src/utils/vaultValidation.ts`](../src/utils/vaultValidation.ts):

```ts
export interface CreateVaultFormValues {
  amount:         string;   // raw numeric string (may include decimals)
  deadline:       string;   // ISO datetime-local string
  successAddress: string;   // Stellar public key
  failureAddress: string;   // Stellar public key
}

// Each key is optional; a missing key means the field passed validation.
export type CreateVaultErrors = Partial<Record<keyof CreateVaultFormValues, string>>;
```

---

## 2. Field Validation Rules

All rules are applied by `validateCreateVault(values, now?)` which returns a
`CreateVaultErrors` object. An empty object means the form is valid.

### 2.1 `amount` — USDC Amount

| Attribute | Detail |
|---|---|
| **Helper** | `isValidUsdcAmount(amount: string): boolean` |
| **Regex** | `^(?:0\|[1-9]\d*)(?:\.\d{1,7})?$` |
| **Extra rule** | `Number(normalized) > 0` — zero is rejected |
| **Normalisation** | Leading/trailing whitespace is trimmed before testing |
| **Error key** | `errors.amount` |
| **Error message** | `'Enter a positive USDC amount with up to 7 decimal places.'` |

**Accepted examples:**

| Input | Accepted? |
|---|---|
| `'100'` | ✅ |
| `'0.0000001'` | ✅ (7 decimal places) |
| `'1000.5'` | ✅ |
| `'0'` | ❌ — zero is not positive |
| `'0.00000001'` | ❌ — 8 decimal places |
| `'-10'` | ❌ — negative |
| `'1,000'` | ❌ — comma not supported by validator (strip via `parseUsdcInput` first) |
| `''` | ❌ — empty |

> **Input formatting note:** The `amount` field in `CreateVault.tsx` stores a
> _raw_ string (no commas) via `parseUsdcInput`, and only formats it for display
> via `formatUsdcInput`. The raw value is what `validateCreateVault` receives.

### 2.2 `deadline` — Vault Expiry

| Attribute | Detail |
|---|---|
| **Helper** | `isFutureDeadline(deadline: string, now?: Date): boolean` |
| **Rule** | `new Date(deadline).getTime()` must be finite **and** strictly greater than `now.getTime()`. |
| **Default `now`** | `new Date()` at call time; injectable for testing. |
| **Error key** | `errors.deadline` |
| **Error message** | `'Choose a future deadline.'` |

**Accepted examples:**

| Input | Accepted? |
|---|---|
| `'2030-01-01T00:00'` (future) | ✅ |
| `'2020-01-01T00:00'` (past) | ❌ |
| `''` | ❌ — `Date('')` is `Invalid Date` → `NaN` |
| `'not-a-date'` | ❌ — not parseable |

**Deadline presets** in `src/utils/deadlinePresets.ts` offer quick shortcuts:

| Preset | Days added | Output format |
|---|---|---|
| `'7d'` | 7 | `YYYY-MM-DDTHH:mm` (local time) |
| `'30d'` | 30 | `YYYY-MM-DDTHH:mm` |
| `'90d'` | 90 | `YYYY-MM-DDTHH:mm` |

Clicking a preset calls `computeFutureDeadline(days)` which returns a
datetime-local string already in the correct format and always in the future.

### 2.3 `successAddress` — Success Destination

| Attribute | Detail |
|---|---|
| **Helper** | `isValidStellarAddress(address: string): boolean` |
| **Shape check** | `^[GC][A-Z2-7]{55}$` |
| **Encoding check** | Decode 35 Base32 bytes: a supported account/contract version byte, 32-byte payload, and a valid little-endian CRC16-XModem checksum |
| **Normalisation** | `.trim()` before testing |
| **Error key** | `errors.successAddress` |
| **Error message** | `'Enter a valid Stellar public key starting with G or C.'` |

A valid Stellar address is a 56-character Base32 StrKey starting with `G`
(Ed25519 account) or `C` (contract). Matching the length and character set is
insufficient: `isValidStellarAddress` verifies the full version byte and the
CRC16-XModem checksum over the version and payload, as defined by
[SEP-23](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md).

### 2.4 `failureAddress` — Failure Destination

Validated in two sequential passes:

| Pass | Rule | Error message |
|---|---|---|
| 1 | Must satisfy `isValidStellarAddress` | `'Enter a valid Stellar public key starting with G or C.'` |
| 2 (only if pass 1 succeeds) | Must differ from `successAddress` (after trimming both) | `'Failure destination must be different from success destination.'` |

| `errors.failureAddress` key | Trigger |
|---|---|
| Invalid address format | Pass 1 fails |
| Same as success address | Pass 2 fails |
| *(unset)* | Both passes succeed |

---

## 3. Validation Helpers Reference

| Export | Signature | Purpose |
|---|---|---|
| `isValidStellarAddress` | `(address: string) → boolean` | Verifies account/contract StrKey encoding, version and checksum |
| `isValidUsdcAmount` | `(amount: string) → boolean` | Tests the USDC amount regex and positivity |
| `isFutureDeadline` | `(deadline: string, now?: Date) → boolean` | Tests that the deadline is parseable and in the future |
| `validateCreateVault` | `(values, now?) → CreateVaultErrors` | Runs all field rules; returns an error object |
| `hasCreateVaultErrors` | `(errors: CreateVaultErrors) → boolean` | Returns `true` when any error key is present |
| `exceedsBalance` | `(amount, balance) → boolean` | Balance gate — see section 4 |

---

## 4. Balance-Aware Submission Gate (`exceedsBalance`)

```ts
export function exceedsBalance(amount: string, balance: string | null): boolean {
  if (balance === null) return false;
  const a = Number(amount);
  const b = Number(balance);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a > b;
}
```

### Behaviour

| Condition | Returns | UI effect |
|---|---|---|
| `balance === null` (wallet not connected / balance unknown) | `false` | Warning suppressed — unknown balance is non-blocking |
| Either value is not a finite number | `false` | Warning suppressed |
| `amount > balance` | `true` | Warning rendered inline below the amount field |
| `amount <= balance` | `false` | No warning |

### How it is used in `CreateVault.tsx`

```tsx
{balanceStatus === 'success' && exceedsBalance(amount, balance) && (
  <p role="status" style={{ color: 'var(--warning)' }}>
    Amount exceeds your available USDC balance ({balance}).
  </p>
)}
```

The warning is shown **only** when `balanceStatus === 'success'` — meaning
Horizon returned a confirmed balance. The warning is **advisory, not
blocking**: it does not prevent form submission or trigger a validation error.
The user can still proceed to the review step even when the amount exceeds the
balance. Actual contract-level enforcement happens on the Stellar network.

> **Design intent:** treating an unknown balance as non-blocking (`return false`
> when `balance === null`) prevents the warning from appearing during wallet
> connection, on testnet where the balance may be 0, or when the balance fetch
> is still in progress.

---

## 5. Form → Review → Confirm Flow

```
┌──────────────┐   submit (valid)   ┌──────────────┐   onConfirm   ┌──────────────┐
│  Form step   │ ─────────────────► │ Review step  │ ────────────► │  Confirmed   │
│  showReview  │                    │  showReview  │               │  (logger)    │
│  = false     │ ◄───────────────── │  = true      │               └──────────────┘
└──────────────┘   onBack           └──────────────┘
```

### Step 1 — Form (`showReview === false`)

- User fills in `amount`, `deadline`, `successAddress`, `failureAddress`, and
  optionally attaches evidence via `EvidenceUpload`.
- On submit, `handleSubmit` calls `validateCreateVault` with the current field
  values.
- If `hasCreateVaultErrors(nextErrors)` is `true`:
  - Errors are stored in state and rendered in the inline error summary
    (`role="alert"`).
  - Focus is moved to the **first invalid field** (in field order:
    `amount → deadline → successAddress → failureAddress`) via `ref.current?.focus()`.
  - Navigation to the review step is blocked.
- If no errors, `showReview` is set to `true`.

**Field order for error focus:**
```ts
const errorFieldOrder = ['amount', 'deadline', 'successAddress', 'failureAddress'];
```

**Inline error clearing:** Each field's `onChange` handler clears only its own
error key so errors disappear as the user corrects them without re-running full
validation:
```ts
setErrors(current => ({ ...current, amount: undefined }));
```

### Step 2 — Review (`showReview === true`)

`CreateVaultReview` renders a read-only summary of all four required fields plus
optional `verifierAddress` and `milestone` (unused by `CreateVault.tsx`
currently). No additional validation runs in this step. The user can either:

- **Back to edit** (`onBack`) — sets `showReview = false`, restoring the form
  with all values intact and errors cleared.
- **Confirm Vault** (`onConfirm`) — calls `handleConfirm` which currently logs
  the values via `logger.debug`. Chain submission is not yet implemented.

### Step 3 — Confirm

`handleConfirm` is the extension point for the actual Stellar transaction. The
logged payload is:

```ts
{ amount, deadline, successAddress, failureAddress, evidenceUrl }
```

---

## 6. Adding a New Validation Rule

1. Add the new field to `CreateVaultFormValues` (if not already present).
2. Implement a helper function (e.g. `isValidMilestone`) and export it from
   `vaultValidation.ts`.
3. Call the helper inside `validateCreateVault` and set the appropriate key on
   `errors`.
4. Add the new field key to `errorFieldOrder` and `fieldRefs` in
   `CreateVault.tsx` so focus management covers the new field.
5. Add an `onChange` handler that clears only the new field's error key.
6. Pass the new field value to `CreateVaultReview` if it should be shown in the
   review step.
7. Update this document with the new field's rule table.

---

## 7. Related Files

| File | Role |
|---|---|
| [`src/utils/vaultValidation.ts`](../src/utils/vaultValidation.ts) | All validation helpers and types (`CreateVaultFormValues`, `CreateVaultErrors`, `validateCreateVault`, `exceedsBalance`) |
| [`src/pages/CreateVault.tsx`](../src/pages/CreateVault.tsx) | Form, submission handler, balance warning, step state |
| [`src/components/CreateVaultReview.tsx`](../src/components/CreateVaultReview.tsx) | Read-only review step and confirm action |
| [`src/utils/deadlinePresets.ts`](../src/utils/deadlinePresets.ts) | `DEADLINE_PRESETS`, `computeFutureDeadline`, `getPresetLabel` |
| [`src/utils/usdcInput.ts`](../src/utils/usdcInput.ts) | `formatUsdcInput` / `parseUsdcInput` — display formatting separate from validation |
| [`src/context/WalletContext.tsx`](../src/context/WalletContext.tsx) | `balance` and `balanceStatus` consumed by the balance gate |
