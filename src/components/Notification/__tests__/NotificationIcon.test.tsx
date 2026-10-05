import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import NotificationIcon from "../NotificationIcon";
import { useNotification, type NotificationItem } from "@/Zustand/Store";

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "n1",
    type: "system_announcement",
    title: "Default title",
    message: "Default body",
    timestamp: "2026-04-24T08:00:00Z",
    isRead: false,
    isUrgent: false,
    category: "system",
    ...overrides,
  } as NotificationItem;
}

function setStore(items: unknown[]) {
  useNotification.setState({ notification: items as NotificationItem[] });
}

function renderIcon() {
  return render(
    <MemoryRouter>
      <NotificationIcon />
    </MemoryRouter>,
  );
}

function toggleButton() {
  return screen.getByRole("button", { name: /toggle notifications/i });
}

function openDropdown() {
  fireEvent.click(toggleButton());
}

function markAllButton() {
  return screen.getByRole("button", { name: "Mark All As Read" });
}

describe("NotificationIcon", () => {
  beforeEach(() => {
    setStore([]);
  });

  afterEach(() => {
    act(() => {
      setStore([]);
    });
  });

  describe("open/close transitions", () => {
    it("starts closed with an accurate accessible label", () => {
      renderIcon();

      expect(toggleButton()).toHaveAttribute("aria-expanded", "false");
      expect(toggleButton()).toHaveAccessibleName("Toggle notifications");
      expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    });

    it("toggles the panel deterministically, including a rapid double click", () => {
      renderIcon();

      openDropdown();
      expect(toggleButton()).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Notifications")).toBeInTheDocument();

      openDropdown();
      expect(toggleButton()).toHaveAttribute("aria-expanded", "false");
    });

    it("closes on Escape", () => {
      renderIcon();
      openDropdown();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(toggleButton()).toHaveAttribute("aria-expanded", "false");
    });

    it("ignores Escape while closed (no listener registered)", () => {
      renderIcon();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(toggleButton()).toHaveAttribute("aria-expanded", "false");
    });

    it("closes when a pointer-down lands outside the container", () => {
      renderIcon();
      openDropdown();

      fireEvent.mouseDown(document.body);

      expect(toggleButton()).toHaveAttribute("aria-expanded", "false");
    });

    it("keeps the panel open for pointer-down inside the container", () => {
      renderIcon();
      openDropdown();

      fireEvent.mouseDown(toggleButton());

      expect(toggleButton()).toHaveAttribute("aria-expanded", "true");
    });

    it("links to the full notification page", () => {
      renderIcon();
      openDropdown();

      expect(screen.getByRole("link", { name: /view all notification/i })).toHaveAttribute(
        "href",
        "/notification",
      );
    });
  });

  describe("unread badge boundaries", () => {
    it("shows the exact unread count in the badge and the label", () => {
      setStore([
        item({ id: "1", isRead: false }),
        item({ id: "2", isRead: false }),
        item({ id: "3", isRead: true }),
      ]);

      renderIcon();

      expect(screen.getByText("2")).toBeInTheDocument();
      expect(toggleButton()).toHaveAccessibleName(
        "Toggle notifications, 2 unread",
      );
    });

    it("clamps the badge at 99+ while the label keeps the exact count", () => {
      setStore(
        Array.from({ length: 120 }, (_, index) =>
          item({ id: `n${index}`, isRead: index < 5 }),
        ),
      );

      renderIcon();

      expect(screen.getByText("99+")).toBeInTheDocument();
      expect(toggleButton()).toHaveAccessibleName(
        "Toggle notifications, 115 unread",
      );
    });

    it("renders no badge when everything is read", () => {
      setStore([item({ id: "1", isRead: true })]);

      renderIcon();

      expect(screen.queryByText("0")).not.toBeInTheDocument();
      expect(toggleButton()).toHaveAccessibleName("Toggle notifications");
    });

    it("treats a missing isRead flag as unread", () => {
      setStore([{ id: "1", title: "Flagless" } as NotificationItem]);

      renderIcon();

      expect(toggleButton()).toHaveAccessibleName(
        "Toggle notifications, 1 unread",
      );
    });
  });

  describe("mark-read state transitions", () => {
    it("marks every notification read and clears the badge", () => {
      setStore([
        item({ id: "1", isRead: false }),
        item({ id: "2", isRead: false }),
        item({ id: "3", isRead: true }),
      ]);
      renderIcon();
      openDropdown();

      fireEvent.click(markAllButton());

      const state = useNotification.getState();
      expect(state.notification.every((n) => n.isRead === true)).toBe(true);
      expect(toggleButton()).toHaveAccessibleName("Toggle notifications");
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    });

    it("is idempotent: repeat clicks leave the store untouched", () => {
      setStore([item({ id: "1", isRead: true }), item({ id: "2", isRead: true })]);
      renderIcon();
      openDropdown();

      fireEvent.click(markAllButton());
      const afterFirst = useNotification.getState().notification;
      fireEvent.click(markAllButton());
      const afterSecond = useNotification.getState().notification;

      expect(afterSecond).toBe(afterFirst);
    });

    it("does not drop a notification that arrives in the same tick as mark-all", () => {
      setStore([
        item({ id: "a", title: "Existing A" }),
        item({ id: "b", title: "Existing B", isRead: true }),
      ]);
      renderIcon();
      openDropdown();

      // Concurrent writer lands before React flushes the re-render, so the
      // click still runs against the previously rendered snapshot. A handler
      // that writes that snapshot back would clobber the new row.
      act(() => {
        useNotification.setState((state) => ({
          notification: [
            ...state.notification,
            item({ id: "late", title: "Late arrival" }),
          ],
        }));
        markAllButton().click();
      });

      const items = useNotification.getState().notification;
      expect(items).toHaveLength(3);
      expect(items.find((entry) => entry.id === "late")?.isRead).toBe(true);
      expect(items.every((entry) => entry.isRead === true)).toBe(true);
    });

    it("marks only the clicked row without touching its neighbours", () => {
      setStore([
        item({ id: "1", title: "First notification" }),
        item({ id: "2", title: "Second notification" }),
      ]);
      renderIcon();
      openDropdown();

      const before = useNotification.getState().notification;
      fireEvent.click(screen.getByText("First notification"));

      const items = useNotification.getState().notification;
      expect(items[0].isRead).toBe(true);
      expect(items[1].isRead).toBe(false);
      expect(items[1]).toBe(before[1]);
    });

    it("does not drop a notification that arrives in the same tick as a row read", () => {
      setStore([
        item({ id: "1", title: "First notification" }),
        item({ id: "2", title: "Second notification" }),
      ]);
      renderIcon();
      openDropdown();

      act(() => {
        useNotification.setState((state) => ({
          notification: [
            ...state.notification,
            item({ id: "late", title: "Late arrival" }),
          ],
        }));
        screen.getByText("First notification").click();
      });

      const items = useNotification.getState().notification;
      expect(items).toHaveLength(3);
      expect(items[0].isRead).toBe(true);
      expect(items[2].isRead).toBe(false);
    });

    it("ignores a click for an id the store does not know", () => {
      setStore([item({ id: "1", isRead: false })]);
      renderIcon();
      openDropdown();

      const before = useNotification.getState().notification;
      act(() => {
        // Message only reports ids it was rendered with; simulate a stale id.
        useNotification.getState().markRead("vanished-id");
      });

      expect(useNotification.getState().notification).toBe(before);
    });
  });

  describe("duplicate and hostile store input", () => {
    it("collapses duplicate ids to one row, first occurrence wins", () => {
      setStore([
        item({ id: "dup", title: "Duplicate row", isRead: false }),
        item({ id: "dup", title: "Duplicate row", isRead: true }),
      ]);
      renderIcon();

      expect(screen.getByText("1")).toBeInTheDocument();

      openDropdown();
      expect(screen.getAllByText("Duplicate row")).toHaveLength(1);

      fireEvent.click(screen.getByText("Duplicate row"));

      const items = useNotification.getState().notification;
      expect(items[0].isRead).toBe(true);
      expect(toggleButton()).toHaveAccessibleName("Toggle notifications");
    });

    it("drops non-object and id-less entries instead of crashing", () => {
      setStore([
        null,
        42,
        "garbage",
        { title: "no id" },
        item({ id: "ok", title: "Valid row" }),
      ]);

      renderIcon();

      expect(screen.getByText("1")).toBeInTheDocument();

      openDropdown();
      expect(screen.getByText("Valid row")).toBeInTheDocument();
      expect(screen.queryByText("no id")).not.toBeInTheDocument();

      expect(() => fireEvent.click(markAllButton())).not.toThrow();
      const state = useNotification.getState();
      expect(state.notification).toHaveLength(5);
      expect(state.notification[0]).toBeNull();
      expect(
        state.notification.find((entry) => entry?.id === "ok")?.isRead,
      ).toBe(true);
    });

    it("survives a non-array notification payload", () => {
      useNotification.setState({
        notification: "garbage" as unknown as NotificationItem[],
      });

      renderIcon();

      expect(toggleButton()).toHaveAccessibleName("Toggle notifications");

      openDropdown();
      expect(screen.getByText("Notifications")).toBeInTheDocument();
      expect(() => fireEvent.click(markAllButton())).not.toThrow();
      expect(toggleButton()).toHaveAttribute("aria-expanded", "true");
    });

    it("renders rows with missing optional fields using safe fallbacks", () => {
      setStore([{ id: "x" } as unknown as NotificationItem]);

      renderIcon();
      openDropdown();

      expect(screen.getByText("Notification")).toBeInTheDocument();
      expect(screen.getByText("Invalid date")).toBeInTheDocument();
    });

    it("shows at most five preview rows", () => {
      setStore(
        Array.from({ length: 8 }, (_, index) =>
          item({ id: `n${index}`, title: `Item ${index}` }),
        ),
      );

      renderIcon();
      openDropdown();

      expect(screen.getByText("Item 4")).toBeInTheDocument();
      expect(screen.queryByText("Item 5")).not.toBeInTheDocument();
    });
  });
});
