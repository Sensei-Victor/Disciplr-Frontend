import { describe, it, expect } from "vitest";
import { getNotifications, vaults } from "./example";
import { NOTIFICATION_TYPE_MAP } from "../notificationType";

describe("getNotifications", () => {
  it("should return notifications with valid types", () => {
    const notifications = getNotifications();
    const validKeys = Object.keys(NOTIFICATION_TYPE_MAP);

    notifications.forEach((notification) => {
      expect(validKeys).toContain(notification.type);
    });
  });

  it("should return notifications with unique ids", () => {
    const notifications = getNotifications();
    const ids = notifications.map((n) => n.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });

  it("returns a non-empty list of notifications", () => {
    const notifications = getNotifications();
    expect(notifications.length).greaterThan(0);
  });

  it("validates the shape of every notification", () => {
    const notifications = getNotifications();

    for (const n of notifications) {
      expect(typeof n.id).toBe("string");
      expect(n.id).toMatch(/^ntf_\d+$/);
      expect(typeof n.type).toBe("string");
      expect(n.type.length).greaterThan(0);
      expect(typeof n.title).toBe("string");
      expect(n.title.length).greaterThan(0);
      expect(typeof n.message).toBe("string");
      expect(n.message.length).greaterThan(0);
      expect(typeof n.category).toBe("string");
      expect(n.category.length).greaterThan(0);
      expect(typeof n.isUrgent).toBe("boolean");
      expect(typeof n.isRead).toBe("boolean");
      expect(typeof n.timestamp).toBe("string");
      expect(Number.isNaN(Date.parse(n.timestamp))).toBe(false);
    }
  });

  it("is deterministic and returns the same data on repeated calls", () => {
    const first = getNotifications();
    const second = getNotifications();

    expect(second).toEqual(first);
    expect(second.map((n) => n.id)).toEqual(first.map((n) => n.id));
  });

  it("returns a deeply frozen array that cannot be mutated", () => {
    const notifications = getNotifications();

    expect(Object.isFrozen(notifications)).toBe(true);
    expect(Object.isFrozen(notifications[0])).toBe(true);

    expect(() => {
      (notifications as unknown as Array<unknown>).push({});
    }).toThrow();

    expect(() => {
      (notifications[0] as { title: string }).title = "mutated";
    }).toThrow();
  });

  it("exposes the expected number of notifications and categories", () => {
    const notifications = getNotifications();
    const categories = new Set(notifications.map((n) => n.category));

    expect(notifications.length).toBe(20);
    expect(categories).toContain("vault");
    expect(categories).toContain("funds");
    expect(categories).toContain("verification");
    expect(categories).toContain("milestone");
    expect(categories).toContain("system");
  });

  it("returns notifications in descending timestamp order", () => {
    const notifications = getNotifications();
    const times = notifications.map((n) => Date.parse(n.timestamp));

    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]).greaterThanOrEqual(times[i]);
    }
  });

  it("marks urgent notifications consistently with their type", () => {
    const notifications = getNotifications();
    const urgent = notifications.filter((n) => n.isUrgent);

    expect(urgent.length).greaterThan(0);
    for (const n of urgent) {
      expect(["vault_deadline_approaching", "funds_redirected"]).toContain(n.type);
    }
  });

  it("does not expose sensitive data in message content", () => {
    const notifications = getNotifications();
    const forbidden = /private key|password|seed phrase|api[_ ]?key/i;

    for (const n of notifications) {
      expect(n.message).not.toMatch(forbidden);
      expect(n.title).not.toMatch(forbidden);
    }
  });
});

describe("vaults", () => {
  it("returns a non-empty list of vaults", () => {
    expect(vaults.length).greaterThan(0);
  });

  it("exposes vaults with non-empty names", () => {
    for (const v of vaults) {
      expect(typeof v.name).toBe("string");
      expect(v.name.length).greaterThan(0);
    }
  });

  it("is deeply frozen and cannot be mutated", () => {
    expect(Object.isFrozen(vaults)).toBe((true));
    expect(Object.isFrozen(vaults[0])).toBe(true);

    expect(() => {
      (vaults as unknown as Array<unknown>).push({ name: "Mutated" });
    }).toThrow();
  });
});
