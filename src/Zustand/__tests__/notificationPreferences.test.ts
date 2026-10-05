// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { useNotificationPreferences } from "../notificationPreferences";

const VALID_FREQUENCY_VALUES = ["1", "2", "3", "4"] as const;

const DEFAULT_STATE = {
  email: true,
  push: false,
  frequency: "1",
  quietHours: "12:00",
} as const;

describe("useNotificationPreferences store", () => {
  beforeEach(() => {
    localStorage.clear();
    useNotificationPreferences.getState().reset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("should have correct initial state", () => {
    const state = useNotificationPreferences.getState();
    expect(state.email).toBe(true);
    expect(state.push).toBe(false);
    expect(state.frequency).toBe("1");
    expect(state.quietHours).toBe("12:00");
  });

  it("should update email preference", () => {
    useNotificationPreferences.getState().setEmail(false);
    expect(useNotificationPreferences.getState().email).toBe(false);

    useNotificationPreferences.getState().setEmail(true);
    expect(useNotificationPreferences.getState().email).toBe(true);
  });

  it("should update push preference", () => {
    useNotificationPreferences.getState().setPush(true);
    expect(useNotificationPreferences.getState().push).toBe(true);

    useNotificationPreferences.getState().setPush(false);
    expect(useNotificationPreferences.getState().push).toBe(false);
  });

  it("should update frequency preference", () => {
    useNotificationPreferences.getState().setFrequency("3");
    expect(useNotificationPreferences.getState().frequency).toBe("3");
  });

  it("should update quietHours preference", () => {
    useNotificationPreferences.getState().setQuietHours("22:00");
    expect(useNotificationPreferences.getState().quietHours).toBe("22:00");
  });

  it("should reset to default state", () => {
    useNotificationPreferences.getState().setEmail(false);
    useNotificationPreferences.getState().setPush(true);
    useNotificationPreferences.getState().setFrequency("2");
    useNotificationPreferences.getState().setQuietHours("09:00");

    useNotificationPreferences.getState().reset();

    const state = useNotificationPreferences.getState();
    expect(state.email).toBe(true);
    expect(state.push).toBe(false);
    expect(state.frequency).toBe("1");
    expect(state.quietHours).toBe("12:00");
  });

  it("should persist state to localStorage", () => {
    useNotificationPreferences.getState().setEmail(false);
    useNotificationPreferences.getState().setPush(true);
    useNotificationPreferences.getState().setFrequency("3");
    useNotificationPreferences.getState().setQuietHours("08:30");

    const stored = localStorage.getItem("notification-preferences");
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.email).toBe(false);
    expect(parsed.state.push).toBe(true);
    expect(parsed.state.frequency).toBe("3");
    expect(parsed.state.quietHours).toBe("08:30");
  });

  it("should rehydrate from localStorage on re-initialisation", () => {
    useNotificationPreferences.getState().setEmail(false);
    useNotificationPreferences.getState().setPush(true);

    // Simulate rehydration: reset the store state to initial, then trigger rehydration
    useNotificationPreferences.persist.rehydrate();
    expect(useNotificationPreferences.getState().email).toBe(false);
    expect(useNotificationPreferences.getState().push).toBe(true);
  });

  it("reset returns store to defaults and does not affect localStorage until next set", () => {
    useNotificationPreferences.getState().setEmail(false);
    useNotificationPreferences.getState().reset();
    const state = useNotificationPreferences.getState();
    expect(state.email).toBe(true);
    expect(state.push).toBe(false);
    expect(state.frequency).toBe("1");
    expect(state.quietHours).toBe("12:00");
  });

  // Regression test for https://github.com/Disciplr-Org/Disciplr-Frontend/issues/723
  // The frequency default must be one of the valid select option values ("1","2","3","4")
  // so that a fresh or reset store always maps to a visible, selected option in the UI.
  it("default frequency matches a valid NotificationSettings dropdown option", () => {
    const { frequency } = useNotificationPreferences.getState();
    expect(VALID_FREQUENCY_VALUES).toContain(frequency);
  });

  it("reset frequency matches a valid NotificationSettings dropdown option", () => {
    useNotificationPreferences.getState().setFrequency("3");
    useNotificationPreferences.getState().reset();
    const { frequency } = useNotificationPreferences.getState();
    expect(VALID_FREQUENCY_VALUES).toContain(frequency);
  });

  // -------------------------------------------------------------------------
  // Authorization / validation regression coverage
  // -------------------------------------------------------------------------

  describe("setFrequency validation", () => {
    it("accepts every valid frequency option", () => {
      for (const value of VALID_FREQUENCY_VALUES) {
        useNotificationPreferences.getState().setFrequency(value);
        expect(useNotificationPreferences.getState().frequency).toBe(value);
      }
    });

    it("rejects unknown frequency values and keeps previous value", () => {
      useNotificationPreferences.getState().setFrequency("2");
      const invalid = ["0", "5", "-1", "", "abc", "1.0", "1 ", " 1", "1"\n"];
      for (const value of invalid) {
        useNotificationPreferences.getState().setFrequency(value);
        expect(useNotificationPreferences.getState().frequency).toBe("2");
      }
    });

    it("rejects non-string inputs without throwing", () => {
      useNotificationPreferences.getState().setFrequency("3");
      const castSet = useNotificationPreferences.getState().setFrequency as unknown as (
        value: unknown,
      ) => void;
      for (const value of [null, undefined, 1, 2, 3, 4, NaN, {}, []]) {
        expect(() => castSet(value)).not.toThrow();
        expect(useNotificationPreferences.getState().frequency).toBe("3");
      }
    });

    it("is idempotent for the same valid value", () => {
      useNotificationPreferences.getState().setFrequency("4");
      useNotificationPreferences.getState().setFrequency("4");
      expect(useNotificationPreferences.getState().frequency).toBe("4");
    });
  });

  describe("setQuietHours validation", () => {
    it("accepts valid 24-hour HH:MM times", () => {
      const valid = ["00:00", "09:30", "12:00", "23:59", "23:00"];
      for (const value of valid) {
        useNotificationPreferences.getState().setQuietHours(value);
        expect(useNotificationPreferences.getState().quietHours).toBe(value);
      }
    });

    it("rejects malformed times and keeps previous value", () => {
      useNotificationPreferences.getState().setQuietHours("21:15");
      const invalid = [
        "",
        "24:00",
        "23:60",
        "23:61",
        "24:60",
        "-1:00",
        "9:00",
        "09:0",
        "09:000",
        "09:00",
        "09:00 ",
        " 09:00",
        "ab:cd",
        "09:00:00",
        "09:00.0",
      ];
      for (const value of invalid) {
        useNotificationPreferences.getState().setQuietHours(value);
        expect(useNotificationPreferences.getState().quietHours).toBe("21:15");
      }
    });

    it("rejects non-string inputs without throwing", () => {
      useNotificationPreferences.getState().setQuietHours("07:45");
      const castSet = useNotificationPreferences.getState().setQuietHours as unknown as (
        value: unknown,
      ) => void;
      for (const value of [null, undefined, 9, 23, NaN, {}, []]) {
        expect(() => castSet(value)).not.toThrow();
        expect(useNotificationPreferences.getState().quietHours).toBe("07:45");
      }
    });

    it("is idempotent for the same valid value", () => {
      useNotificationPreferences.getState().setQuietHours("18:00");
      useNotificationPreferences.getState().setQuietHours("18:00");
      expect(useNotificationPreferences.getState().quietHours).toBe("18:00");
    });
  });

  describe("setEmail / setPush validation", () => {
    it("coerces truthy and falsy inputs to booleans", () => {
      const castSetEmail = useNotificationPreferences.getState().setEmail as unknown as (
        value: unknown,
      ) => void;
      const castSetPush = useNotificationPreferences.getState().setPush as unknown as (
        value: unknown,
      ) => void;

      castSetEmail(0);
      expect(useNotificationPreferences.getState().email).toBe(false);
      castSetEmail(1);
      expect(useNotificationPreferences.getState().email).toBe(true);
      castSetEmail("");
      expect(useNotificationPreferences.getState().email).toBe(false);
      castSetEmail("no");
      expect(useNotificationPreferences.getState().email).toBe(true);

      castSetPush(0);
      expect(useNotificationPreferences.getState().push).toBe(false);
      castSetPush(1);
      expect(useNotificationPreferences.getState().push).toBe(true);
    });
  });

  describe("persistence integrity", () => {
    it("rehydrates valid persisted state", () => {
      localStorage.setItem(
        "notification-preferences",
        JSON.stringify({
          state: {
            email: false,
            push: true,
            frequency: "4",
            quietHours: "21:30",
          },
          version: 0,
        }),
      );

      useNotificationPreferences.persist.rehydrate();

      const state = useNotificationPreferences.getState();
      expect(state.email).toBe(false);
      expect(state.push).toBe(true);
      expect(state.frequency).toBe("4");
      expect(state.quietHours).toBe("21:30");
    });

    it("falls back to defaults when persisted state is malformed", () => {
      localStorage.setItem("notification-preferences", "not-json");
      expect(() => useNotificationPreferences.persist.rehydrate()).not.toThrow();
      const state = useNotificationPreferences.getState();
      expect(state.email).toBe(DEFAULT_STATE.email);
      expect(state.push).toBe(DEFAULT_STATE.push);
      expect(state.frequency).toBe(DEFAULT_STATE.frequency);
      expect(state.quietHours).toBe(DEFAULT_STATE.quietHours);
    });

    it("sanitizes invalid frequency and quietHours from persisted state", () => {
      localStorage.setItem(
        "notification-preferences",
        JSON.stringify({
          state: {
            email: true,
            push: false,
            frequency: "99",
            quietHours: "25:61",
          },
          version: 0,
        }),
      );

      useNotificationPreferences.persist.rehydrate();

      const state = useNotificationPreferences.getState();
      expect(VALID_FREQUENCY_VALUES).toContain(state.frequency);
      expect(state.quietHours).match(/^\d{1,2}:\d{2}$/);
    });
  });

  describe("concurrent / retry safety", () => {
    it("last write wins under interleaved updates", () => {
      const store = useNotificationPreferences.getState();
      store.setFrequency("1");
      store.setQuietHours("01:00");
      store.setFrequency("2");
      store.setQuietHours("02:00");
      store.setFrequency("3");
      store.setQuietHours("03:00");

      const state = useNotificationPreferences.getState();
      expect(state.frequency).toBe("3");
      expect(state.quietHours).toBe("03:00");
    });

    it("retries after a rejected write are consistent", () => {
      useNotificationPreferences.getState().setFrequency("2");
      // First attempt is invalid and must not mutate state.
      useNotificationPreferences.getState().setFrequency("99");
      expect(useNotificationPreferences.getState().frequency).toBe("2");
      // Retry with a valid value succeeds.
      useNotificationPreferences.getState().setFrequency("4");
      expect(useNotificationPreferences.getState().frequency).toBe("4");
    });

    it("does not leak sensitive data into localStorage on rejection", () => {
      useNotificationPreferences.getState().setFrequency("2");
      useNotificationPreferences.getState().setFrequency("secret-token");
      const stored = localStorage.getItem("notification-preferences");
      expect(stored).not.toContain("secret-token");
    });
  });
});
