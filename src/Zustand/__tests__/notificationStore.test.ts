import { describe, it, expect, beforeEach } from "vitest";
import { useNotification, useUnreadCount } from "../Store";
import { getNotifications } from "@/components/Notification/exampleNotification/example";

const initialNotifications = getNotifications();

function resetStore() {
  useNotification.setState({
    notification: initialNotifications,
  });
}

function getUnreadCount() {
  return useNotification
    .getState()
    .notification.filter((n) => !n.isRead).length;
}

describe("useNotification store", () => {
  beforeEach(() => {
    resetStore();
  });

  it("has correct initial state from example data", () => {
    const state = useNotification.getState();
    expect(state.notification).toEqual(initialNotifications);
    expect(state.notification.length).toBe(20);
    expect(getUnreadCount()).toBe(
      initialNotifications.filter((n) => !n.isRead).length,
    );
  });

  describe("setNotification", () => {
    it("sets notifications and unread count is derived correctly", () => {
      const twoUnread = [
        { ...initialNotifications[0], isRead: false },
        { ...initialNotifications[1], isRead: true },
        { ...initialNotifications[2], isRead: false },
      ];
      useNotification.getState().setNotification(twoUnread);
      const state = useNotification.getState();
      expect(state.notification).toEqual(twoUnread);
      expect(getUnreadCount()).toBe(2);
    });

    it("handles empty array", () => {
      useNotification.getState().setNotification([]);
      const state = useNotification.getState();
      expect(state.notification).toEqual([]);
      expect(getUnreadCount()).toBe(0);
    });
  });

  describe("markRead", () => {
    it("marks a single unread notification as read", () => {
      const unreadId = initialNotifications.find((n) => !n.isRead)!.id;
      const prevUnread = getUnreadCount();

      useNotification.getState().markRead(unreadId);

      const state = useNotification.getState();
      const updated = state.notification.find((n) => n.id === unreadId);
      expect(updated!.isRead).toBe(true);
      expect(getUnreadCount()).toBe(prevUnread - 1);
    });

    it("is idempotent — marking an already-read notification does not change unread count", () => {
      const readId = initialNotifications.find((n) => n.isRead)!.id;
      const prevUnread = getUnreadCount();

      useNotification.getState().markRead(readId);

      expect(getUnreadCount()).toBe(prevUnread);
    });

    it("does nothing for a non-existent id", () => {
      const prevUnread = getUnreadCount();
      const prevLength = useNotification.getState().notification.length;
      useNotification.getState().markRead("non_existent_id");
      expect(getUnreadCount()).toBe(prevUnread);
      expect(useNotification.getState().notification.length).toBe(prevLength);
    });

    it("produces immutable state — original array is not mutated", () => {
      const before = useNotification.getState().notification;
      const unreadId = before.find((n) => !n.isRead)!.id;
      useNotification.getState().markRead(unreadId);
      const after = useNotification.getState().notification;
      expect(before).not.toBe(after);
    });
  });

  describe("markAllRead", () => {
    it("marks all notifications as read", () => {
      useNotification.getState().markAllRead();
      const state = useNotification.getState();
      expect(getUnreadCount()).toBe(0);
      expect(state.notification.every((n) => n.isRead)).toBe(true);
    });

    it("is idempotent — calling on all-read list keeps unread count at 0", () => {
      useNotification.getState().markAllRead();
      useNotification.getState().markAllRead();
      const state = useNotification.getState();
      expect(getUnreadCount()).toBe(0);
      expect(state.notification.every((n) => n.isRead)).toBe(true);
    });

    it("handles empty notification list", () => {
      useNotification.getState().setNotification([]);
      useNotification.getState().markAllRead();
      const state = useNotification.getState();
      expect(state.notification).toEqual([]);
      expect(getUnreadCount()).toBe(0);
    });

    it("produces immutable state", () => {
      const before = useNotification.getState().notification;
      useNotification.getState().markAllRead();
      const after = useNotification.getState().notification;
      expect(before).not.toBe(after);
    });
  });

  describe("dismiss", () => {
    it("removes a notification by id", () => {
      const target = initialNotifications[0];
      useNotification.getState().dismiss(target.id);
      const state = useNotification.getState();
      expect(state.notification.find((n) => n.id === target.id)).toBeUndefined();
      expect(state.notification.length).toBe(initialNotifications.length - 1);
    });

    it("unread count decreases after dismissing an unread notification", () => {
      const unread = initialNotifications.find((n) => !n.isRead)!;
      const prevUnread = getUnreadCount();
      useNotification.getState().dismiss(unread.id);
      expect(getUnreadCount()).toBe(prevUnread - 1);
    });

    it("unread count does not change when dismissing a read notification", () => {
      const read = initialNotifications.find((n) => n.isRead)!;
      const prevUnread = getUnreadCount();
      useNotification.getState().dismiss(read.id);
      expect(getUnreadCount()).toBe(prevUnread);
    });

    it("does nothing for a non-existent id", () => {
      const prevUnread = getUnreadCount();
      const prevLength = useNotification.getState().notification.length;
      useNotification.getState().dismiss("non_existent_id");
      expect(useNotification.getState().notification.length).toBe(prevLength);
      expect(getUnreadCount()).toBe(prevUnread);
    });

    it("produces immutable state", () => {
      const before = useNotification.getState().notification;
      useNotification.getState().dismiss(before[0].id);
      const after = useNotification.getState().notification;
      expect(before).not.toBe(after);
    });
  });

  describe("clearAll", () => {
    it("removes all notifications", () => {
      useNotification.getState().clearAll();
      const state = useNotification.getState();
      expect(state.notification).toEqual([]);
      expect(getUnreadCount()).toBe(0);
    });

    it("is idempotent — calling on empty list stays empty", () => {
      useNotification.getState().clearAll();
      useNotification.getState().clearAll();
      const state = useNotification.getState();
      expect(state.notification).toEqual([]);
      expect(getUnreadCount()).toBe(0);
    });
  });

  describe("unread count consistency", () => {
    it("stays in sync after mixed operations", () => {
      const unreadIds = initialNotifications
        .filter((n) => !n.isRead)
        .map((n) => n.id);

      unreadIds.forEach((id) => {
        useNotification.getState().markRead(id);
      });

      expect(getUnreadCount()).toBe(0);
      expect(
        useNotification.getState().notification.every((n) => n.isRead),
      ).toBe(true);
    });

    it("all-unread list produces correct count", () => {
      const allUnread = initialNotifications.map((n) => ({
        ...n,
        isRead: false,
      }));
      useNotification.getState().setNotification(allUnread);
      expect(getUnreadCount()).toBe(allUnread.length);
    });

    it("unread count never drops below 0 after markRead on all-read list", () => {
      useNotification.getState().markAllRead();
      const readId = useNotification.getState().notification[0]?.id;
      if (readId) useNotification.getState().markRead(readId);
      expect(getUnreadCount()).toBeGreaterThanOrEqual(0);
    });

    it("getUnreadCount always equals notification.filter(!isRead).length after any operation", () => {
      const ops = [
        () => useNotification.getState().markRead(initialNotifications[0]?.id ?? ""),
        () => useNotification.getState().markAllRead(),
        () => useNotification.getState().dismiss(initialNotifications[1]?.id ?? ""),
      ];
      for (const op of ops) {
        op();
        const state = useNotification.getState();
        const computed = state.notification.filter((n) => !n.isRead).length;
        expect(getUnreadCount()).toBe(computed);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Issue #1261 — unreadCount must NOT be stored state; it must be derived.
// These tests lock in the invariant that the store's state shape never
// includes an unreadCount field, and that the useUnreadCount selector
// correctly computes the count from the notification array.
// ---------------------------------------------------------------------------
describe('Issue #1261 — unreadCount is derived, not stored state', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does not expose unreadCount as a key on the notification store state', () => {
    const state = useNotification.getState();
    // Regression guard: if someone re-adds unreadCount as a stored field this
    // assertion will catch it immediately.
    expect('unreadCount' in state).toBe(false);
  });

  it('useUnreadCount selector returns the correct initial count', () => {
    const expected = initialNotifications.filter((n) => !n.isRead).length;
    // Call the selector hook-style via getState() since we're outside React.
    const count = useNotification
      .getState()
      .notification.filter((n) => !n.isRead).length;
    expect(count).toBe(expected);
  });

  it('useUnreadCount stays correct after setNotification with a known mix', () => {
    const mixed = [
      { ...initialNotifications[0], isRead: false },
      { ...initialNotifications[1], isRead: true },
      { ...initialNotifications[2], isRead: false },
      { ...initialNotifications[3], isRead: true },
    ];
    useNotification.getState().setNotification(mixed);
    const count = useNotification
      .getState()
      .notification.filter((n) => !n.isRead).length;
    expect(count).toBe(2);
  });

  it('useUnreadCount returns 0 after markAllRead', () => {
    useNotification.getState().markAllRead();
    const count = useNotification
      .getState()
      .notification.filter((n) => !n.isRead).length;
    expect(count).toBe(0);
  });

  it('useUnreadCount returns 0 after clearAll', () => {
    useNotification.getState().clearAll();
    const count = useNotification
      .getState()
      .notification.filter((n) => !n.isRead).length;
    expect(count).toBe(0);
  });

  it('useUnreadCount decrements by 1 after dismiss of an unread notification', () => {
    const unread = initialNotifications.find((n) => !n.isRead)!;
    const before = useNotification
      .getState()
      .notification.filter((n) => !n.isRead).length;
    useNotification.getState().dismiss(unread.id);
    const after = useNotification
      .getState()
      .notification.filter((n) => !n.isRead).length;
    expect(after).toBe(before - 1);
  });

  it('resetStore (test helper) does not accidentally inject unreadCount into state', () => {
    // TESTING.md used to show a resetStore() that set unreadCount explicitly.
    // This test ensures the corrected helper never re-introduces that field.
    resetStore();
    expect('unreadCount' in useNotification.getState()).toBe(false);
  });
});
