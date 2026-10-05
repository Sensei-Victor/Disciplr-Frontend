import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Tooltip } from "../Tooltip";
import zIndexTokens from "../../../design-system/tokens/z-index.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTooltip(
  content = "Tooltip text",
  position: "top" | "bottom" = "top",
) {
  return render(
    <Tooltip content={content} position={position}>
      <button type="button">Trigger</button>
    </Tooltip>,
  );
}

/**
 * Creates a controllable matchMedia mock for a single query.
 * Returns:
 *   - `setMatches(value)` — update whether the query matches
 *   - `fireChange()` — dispatch the 'change' event to all registered listeners
 *
 * The mock is installed on `window.matchMedia` and automatically restored
 * after each test via the returned `restore` function.
 */
function createControllableMatchMedia(initialMatches = false) {
  let currentMatches = initialMatches;
  const listeners: Array<(e: { matches: boolean }) => void> = [];

  const mql = {
    get matches() {
      return currentMatches;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_: string, cb: (e: { matches: boolean }) => void) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn((_: string, cb: (e: { matches: boolean }) => void) => {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    dispatchEvent: vi.fn(),
  };

  const originalMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue(mql);

  return {
    setMatches(value: boolean) {
      currentMatches = value;
    },
    fireChange() {
      listeners.forEach((cb) => cb({ matches: currentMatches }));
    },
    restore() {
      window.matchMedia = originalMatchMedia;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it("renders children without showing the tooltip initially", () => {
    renderTooltip();
    expect(screen.getByRole("button", { name: "Trigger" })).toBeInTheDocument();
    // tooltip role exists in DOM (for aria linkage) but is not visible
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveStyle({ visibility: "hidden" });
  });

  it("renders the tooltip content string", () => {
    renderTooltip("Full hash value");
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "Full hash value",
    );
  });

  // ── Hover ─────────────────────────────────────────────────────────────────

  it("shows the tooltip on mouseenter", () => {
    renderTooltip();
    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toHaveStyle({ visibility: "visible" });
  });

  it("hides the tooltip after mouseleave (after hide delay)", () => {
    renderTooltip();
    const trigger = screen.getByRole("button");
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveStyle({ visibility: "visible" });

    fireEvent.mouseLeave(trigger);
    act(() => vi.runAllTimers());
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveStyle({
      visibility: "hidden",
    });
  });

  // ── Focus ─────────────────────────────────────────────────────────────────

  it("shows the tooltip on focus", () => {
    renderTooltip();
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toHaveStyle({ visibility: "visible" });
  });

  it("hides the tooltip on blur (after hide delay)", () => {
    renderTooltip();
    const trigger = screen.getByRole("button");
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveStyle({ visibility: "visible" });

    fireEvent.blur(trigger);
    act(() => vi.runAllTimers());
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveStyle({
      visibility: "hidden",
    });
  });

  // ── Escape key ────────────────────────────────────────────────────────────

  it("dismisses the tooltip when Escape is pressed", () => {
    renderTooltip();
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toHaveStyle({ visibility: "visible" });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveStyle({
      visibility: "hidden",
    });
  });

  it("does not throw when Escape is pressed while tooltip is already hidden", () => {
    renderTooltip();
    expect(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    }).not.toThrow();
  });

  it("other keys do not dismiss the tooltip", () => {
    renderTooltip();
    fireEvent.focus(screen.getByRole("button"));
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByRole("tooltip")).toHaveStyle({ visibility: "visible" });
  });

  // ── aria-describedby wiring ────────────────────────────────────────────────

  it("sets aria-describedby on the trigger pointing to the tooltip id when visible", () => {
    renderTooltip();
    const trigger = screen.getByRole("button");
    fireEvent.mouseEnter(trigger);

    const tooltipId = screen.getByRole("tooltip").getAttribute("id");
    expect(tooltipId).toBeTruthy();
    expect(trigger).toHaveAttribute("aria-describedby", tooltipId);
  });

  it("removes aria-describedby from trigger when tooltip is hidden", () => {
    renderTooltip();
    const trigger = screen.getByRole("button");

    fireEvent.mouseEnter(trigger);
    expect(trigger).toHaveAttribute("aria-describedby");

    fireEvent.mouseLeave(trigger);
    act(() => vi.runAllTimers());
    expect(trigger).not.toHaveAttribute("aria-describedby");
  });

  it("tooltip element has role='tooltip'", () => {
    renderTooltip();
    expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
  });

  it("tooltip is aria-hidden when not visible", () => {
    renderTooltip();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("tooltip is not aria-hidden when visible", () => {
    renderTooltip();
    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).not.toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  // ── Position prop ─────────────────────────────────────────────────────────

  it("applies bottom positioning style when position='bottom'", () => {
    renderTooltip("tip", "bottom");
    fireEvent.mouseEnter(screen.getByRole("button"));
    const tooltip = screen.getByRole("tooltip");
    // bottom-positioned tooltip has a `top` offset, not a `bottom` offset
    expect(tooltip).toHaveStyle({ top: "calc(100% + 6px)" });
  });

  it("applies top positioning style when position='top'", () => {
    renderTooltip("tip", "top");
    fireEvent.mouseEnter(screen.getByRole("button"));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveStyle({ bottom: "calc(100% + 6px)" });
  });

  // ── Re-show cancels pending hide timer ───────────────────────────────────

  it("re-showing before hide timer fires keeps tooltip visible", () => {
    renderTooltip();
    const trigger = screen.getByRole("button");

    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger); // starts hide timer
    fireEvent.mouseEnter(trigger); // cancels timer, re-shows

    act(() => vi.runAllTimers());
    expect(screen.getByRole("tooltip")).toHaveStyle({ visibility: "visible" });
  });

  // ── Styling & Stacking ───────────────────────────────────────────────────

  it("applies the correct design system z-index token", () => {
    renderTooltip();
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip).toHaveStyle({ zIndex: "var(--z-index-tooltip)" });
  });

  it("maintains the z-index token when visible", () => {
    renderTooltip();
    const trigger = screen.getByRole("button");
    fireEvent.mouseEnter(trigger);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveStyle({ zIndex: "var(--z-index-tooltip)" });
  });

  it("verifies the tooltip token preserves the documented stacking hierarchy", () => {
    const tooltipValue = zIndexTokens.zIndex.tooltip.$value;
    const headerValue = zIndexTokens.zIndex.header.$value;
    const baseValue = zIndexTokens.zIndex.base.$value;
    const drawerValue = zIndexTokens.zIndex.drawer.$value;
    const modalValue = zIndexTokens.zIndex.modal.$value;

    expect(tooltipValue).toBe(150);
    expect(tooltipValue).toBeGreaterThan(headerValue);
    expect(tooltipValue).toBeGreaterThan(baseValue);
    expect(tooltipValue).toBeLessThan(drawerValue);
    expect(tooltipValue).toBeLessThan(modalValue);
  });

  it("preserves z-index styling when custom className is provided", () => {
    render(
      <Tooltip content="Custom class test" className="custom-wrapper-class">
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip).toHaveStyle({ zIndex: "var(--z-index-tooltip)" });
  });
});

// ---------------------------------------------------------------------------
// Reduced-motion behaviour (usePrefersReducedMotion integration)
// ---------------------------------------------------------------------------

describe("Tooltip — prefers-reduced-motion", () => {
  // These tests install a controllable matchMedia mock so they can drive the
  // MediaQueryList 'change' event directly, verifying that Tooltip reacts to
  // an in-session OS preference toggle without needing an external re-render.

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("omits CSS transition styles when prefers-reduced-motion is active on mount", () => {
    const media = createControllableMatchMedia(true); // reduced motion ON from the start
    try {
      renderTooltip();
      fireEvent.mouseEnter(screen.getByRole("button"));
      const tooltip = screen.getByRole("tooltip");
      // When reduced motion is preferred the transition property must be absent.
      expect(tooltip).not.toHaveStyle({ transition: expect.stringContaining("opacity") });
    } finally {
      media.restore();
    }
  });

  it("applies CSS transition styles when prefers-reduced-motion is not active", () => {
    const media = createControllableMatchMedia(false); // reduced motion OFF
    try {
      renderTooltip();
      fireEvent.mouseEnter(screen.getByRole("button"));
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveStyle({ transition: "opacity 150ms ease, transform 150ms ease" });
    } finally {
      media.restore();
    }
  });

  it("hides instantly (0 ms delay) when prefers-reduced-motion is active", () => {
    const media = createControllableMatchMedia(true);
    try {
      renderTooltip();
      const trigger = screen.getByRole("button");

      fireEvent.mouseEnter(trigger);
      fireEvent.mouseLeave(trigger);

      // With reduced motion the hide timer is 0 ms — tooltip should be hidden
      // as soon as pending timers are flushed.
      act(() => vi.runAllTimers());
      expect(screen.getByRole("tooltip", { hidden: true })).toHaveStyle({ visibility: "hidden" });
    } finally {
      media.restore();
    }
  });

  it("reactively removes transition when OS preference changes to reduce-motion mid-session", () => {
    // Start with reduced motion OFF so Tooltip mounts with transitions enabled.
    const media = createControllableMatchMedia(false);
    try {
      renderTooltip();

      // Confirm transition is present while reduced motion is off.
      fireEvent.mouseEnter(screen.getByRole("button"));
      expect(screen.getByRole("tooltip")).toHaveStyle({
        transition: "opacity 150ms ease, transform 150ms ease",
      });

      // Simulate the user enabling "Reduce Motion" in their OS settings.
      act(() => {
        media.setMatches(true);
        media.fireChange();
      });

      // The hook must have re-rendered the component — transition should now be gone.
      expect(screen.getByRole("tooltip")).not.toHaveStyle({
        transition: expect.stringContaining("opacity"),
      });
    } finally {
      media.restore();
    }
  });

  it("reactively restores transition when OS preference changes back to allow motion mid-session", () => {
    // Start with reduced motion ON.
    const media = createControllableMatchMedia(true);
    try {
      renderTooltip();

      fireEvent.mouseEnter(screen.getByRole("button"));
      // Confirm no transition while reduced motion is active.
      expect(screen.getByRole("tooltip")).not.toHaveStyle({
        transition: expect.stringContaining("opacity"),
      });

      // User disables "Reduce Motion" in their OS settings.
      act(() => {
        media.setMatches(false);
        media.fireChange();
      });

      // Transition should be re-applied reactively.
      expect(screen.getByRole("tooltip")).toHaveStyle({
        transition: "opacity 150ms ease, transform 150ms ease",
      });
    } finally {
      media.restore();
    }
  });

  it("uses instant hide delay after OS enables reduce-motion while tooltip is mounted", () => {
    // Start with motion allowed, then toggle reduce-motion on.
    const media = createControllableMatchMedia(false);
    try {
      renderTooltip();
      const trigger = screen.getByRole("button");

      // Enable reduced motion while the component is alive.
      act(() => {
        media.setMatches(true);
        media.fireChange();
      });

      fireEvent.mouseEnter(trigger);
      fireEvent.mouseLeave(trigger);

      // The hide timer should now be 0 ms — tooltip hidden after flush.
      act(() => vi.runAllTimers());
      expect(screen.getByRole("tooltip", { hidden: true })).toHaveStyle({ visibility: "hidden" });
    } finally {
      media.restore();
    }
  });

  // ── Reduced Motion Reactivity ──────────────────────────────────────────────

  describe("prefers-reduced-motion reactivity", () => {
    let listeners: Set<(event: MediaQueryListEvent) => void>;
    let matches: boolean;

    beforeEach(() => {
      listeners = new Set();
      matches = false;

      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          get matches() {
            return matches;
          },
          media: query,
          addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener);
          },
          removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.delete(listener);
          },
          dispatchEvent: vi.fn(),
        })),
      });
    });

    it("applies CSS transition when prefers-reduced-motion is false", () => {
      matches = false;
      renderTooltip();
      const tooltip = screen.getByRole("tooltip", { hidden: true });
      expect(tooltip.style.transition).toContain("opacity 150ms ease");
      expect(tooltip.style.transition).toContain("transform 150ms ease");
    });

    it("applies transition none and immediate hide delay when prefers-reduced-motion is true", () => {
      matches = true;
      renderTooltip();
      const trigger = screen.getByRole("button");
      const tooltip = screen.getByRole("tooltip", { hidden: true });

      expect(tooltip.style.transition).toBe("none");

      fireEvent.mouseEnter(trigger);
      expect(tooltip).toHaveStyle({ visibility: "visible" });

      fireEvent.mouseLeave(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(tooltip).toHaveStyle({ visibility: "hidden" });
    });

    it("reactively updates transition and hide behavior when OS preference changes dynamically", () => {
      matches = false;
      renderTooltip();
      const trigger = screen.getByRole("button");
      const tooltip = screen.getByRole("tooltip", { hidden: true });

      expect(tooltip.style.transition).toContain("opacity 150ms ease");

      act(() => {
        matches = true;
        listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
      });

      expect(tooltip.style.transition).toBe("none");

      fireEvent.mouseEnter(trigger);
      expect(tooltip).toHaveStyle({ visibility: "visible" });

      fireEvent.mouseLeave(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(tooltip).toHaveStyle({ visibility: "hidden" });

      act(() => {
        matches = false;
        listeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent));
      });

      expect(tooltip.style.transition).toContain("opacity 150ms ease");

      fireEvent.mouseEnter(trigger);
      expect(tooltip).toHaveStyle({ visibility: "visible" });

      fireEvent.mouseLeave(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(tooltip).toHaveStyle({ visibility: "visible" });

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(tooltip).toHaveStyle({ visibility: "hidden" });
    });
  });
});
