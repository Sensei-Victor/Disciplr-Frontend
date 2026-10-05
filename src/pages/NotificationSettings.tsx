import { useCallback, useMemo, useState } from 'react';
import { vaults } from "@/components/Notification/exampleNotification/example";
import { Text } from "@/components/Text";
import { Switch } from "../components/Switch";
import { useNotificationPreferences } from "../Zustand/Store";
import { isValidQuietHoursRange, isQuietHoursActive } from "../utils/quietHours";


// Allowed notification frequency values. Anything outside this set is rejected
// so a stale or tampered persisted value cannot silently change behavior.
const ALLOWED_FREQUENCIES = ["1", "2", "3", "4"] as const;
type Frequency = (typeof ALLOWED_FREQUENCIES)[number];

const isAllowedFrequency = (value: unknown): value is Frequency =>
  typeof value === "string" && (ALLOWED_FREQUENCIES as readonly string[]).includes(value);

export default function NotificationSettings() {
  const {
    email: emailNotification,
    push: pushNotification,
    frequency,
    quietHours,
    quietHoursRange,
    setEmail: setEmailNotification,
    setPush: setPushNotification,
    setFrequency,
    setQuietHours,
    reset,
  } = useNotificationPreferences();

  // Authorization/validation invariant: the persisted frequency must be one of
  // the known options. If it is not (stale state, tampering, partial write),
  // fall back to a safe default rather than rendering an invalid selection.
  const safeFrequency: Frequency = isAllowedFrequency(frequency) ? frequency : "1";
  const frequencyIsValid = isAllowedFrequency(frequency);

  // Local quiet-hours range inputs. Invalid or partial ranges stay local and
  // are only persisted once the start/end pair validates.
  const [quietStartValue, setQuietStartValue] = useState<string>(
    quietHoursRange?.start ?? quietHours
  );
  const [quietEndValue, setQuietEndValue] = useState<string>(
    quietHoursRange?.end ?? ""
  );
  const quietRangeIsValid = isValidQuietHoursRange(quietStartValue, quietEndValue);

  // Determine whether the current time falls within the quiet hour window.
  const quietHoursActive = useMemo(
    () => isQuietHoursActive(quietStartValue, quietEndValue),
    [quietStartValue, quietEndValue]
  );

  function updateQuietRange(start: string, end: string) {
    setQuietStartValue(start);
    setQuietEndValue(end);
    if (isValidQuietHoursRange(start, end)) {
      setQuietHours(start);
    }
  }

  // Per-vault notification toggles (keyed by vault name)
  const [vaultToggles, setVaultToggles] = useState<Record<string, boolean>>(
    () => Object.fromEntries(vaults.map((v) => [v.name, false]))
  );

  // Only allow toggles for vaults that are actually rendered. This prevents
  // arbitrary keys from being injected into state via crafted events.
  const knownVaultNames = useMemo(() => new Set(vaults.map((v) => v.name)), []);

  const handleVaultToggle = useCallback(
    (name: string, checked: boolean) => {
      if (!knownVaultNames.has(name)) return;
      setVaultToggles((prev) => ({ ...prev, [name]: checked }));
    },
    [knownVaultNames]
  );

  const handleFrequencyChange = useCallback(
    (value: string) => {
      if (!isAllowedFrequency(value)) return;
      setFrequency(value);
    },
    [setFrequency]
  );

  return (
    <>
      <div 
        className="w-full rounded-md px-3 py-3 notification-settings-panel"
        style={{ zIndex: 'var(--z-index-base)' }}
      >
        <Text role="title" as="h2">Notification Settings</Text>
        <div>
          <div className="grid grid-cols-2 justify-center items-center mt-5">
            <Text role="body" as="p">
              Email Notification
            </Text>
            <div className="flex flex-col items-end justify-end gap-4">
              <Switch
                label="Email Notification"
                checked={emailNotification ?? false}
                onChange={setEmailNotification}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 justify-center items-center mt-5">
            <Text role="body" as="p">
              Push Notification
            </Text>
            <div className="flex flex-col items-end justify-end gap-4">
              <Switch
                label="Push Notification"
                checked={pushNotification ?? false}
                onChange={setPushNotification}
              />
            </div>
          </div>
          <div className="flex justify-between items-center mt-5">
            <label htmlFor="notification-frequency">
              <Text role="body" as="span">
                Notification Frequency
              </Text>
            </label>
            <select
              className="w-[200px] notification-settings-field"
              value={safeFrequency}
              onChange={(e) => handleFrequencyChange(e.target.value)}
              name="notification-frequency"
              id="notification-frequency"
              aria-invalid={!frequencyIsValid}
            >
              <option value="" disabled hidden>Not set</option>
              <option value="1">Occurrence</option>
              <option value="2">Daily</option>
              <option value="3">Weekly</option>
              <option value="4">Never</option>
            </select>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between gap-4">
              <Text role="body" as="span">
                Quiet Hours
              </Text>
              <span
                className={`notification-settings-badge ${
                  quietHoursActive
                    ? "notification-settings-badge-active"
                    : "notification-settings-badge-inactive"
                }`}
                aria-live="polite"
              >
                {quietHoursActive
                  ? "Quiet hours active now"
                  : "Quiet hours inactive"}
              </span>
            </div>
            <div className="mt-3">
              <label className="flex flex-col gap-1" htmlFor="quiet-start">
                <input
                  className="notification-settings-field"
                  type="time"
                  id="quiet-start"
                  aria-label="Quiet Hours Start"
                  aria-invalid={!quietRangeIsValid}
                  value={quietStartValue}
                  onChange={(e) => updateQuietRange(e.target.value, quietEndValue)}
                />
              </label>
              <label className="flex flex-col gap-1 mt-2" htmlFor="quiet-end">
                <input
                  className="notification-settings-field"
                  type="time"
                  id="quiet-end"
                  aria-label="Quiet Hours End"
                  aria-invalid={!quietRangeIsValid}
                  value={quietEndValue}
                  onChange={(e) => updateQuietRange(quietStartValue, e.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="flex justify-end items-center mt-5">
            <button
              className="px-4 py-2 font-medium rounded transition notification-settings-reset"
              onClick={reset}
            >
              Reset Preferences
            </button>
          </div>
        </div>
      </div>

      <div 
        className="w-full rounded-md px-3 py-3 mt-5 notification-settings-panel"
        style={{ zIndex: 'var(--z-index-base)' }}
      >
        <Text role="title" as="h2">Vault Notifications</Text>
        {vaults.map((v) => (
          <div
            className="grid grid-cols-2 justify-center items-center mt-5"
            key={v.name}
          >
            <Text role="body" as="p">
              {v.name}
            </Text>
            <div className="flex flex-col items-end justify-end gap-4">
              <Switch
                label={`${v.name} notifications`}
                checked={vaultToggles[v.name] ?? false}
                onChange={(checked) => handleVaultToggle(v.name, checked)}
              />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .notification-settings-panel {
          background: var(--surface);
          color: var(--text);
          border: 1px solid var(--border);
        }

        .notification-settings-field {
          background: var(--surface-raised);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: var(--spacing-1) var(--spacing-2);
        }

        .notification-settings-field:focus {
          border-color: var(--accent);
          outline: 2px solid var(--accent-transparent);
          outline-offset: 2px;
        }

        .notification-settings-reset {
          background: var(--surface-raised);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          cursor: pointer;
        }

        .notification-settings-reset:hover {
          background: var(--border);
        }

      `}</style>
    </>
  );
}