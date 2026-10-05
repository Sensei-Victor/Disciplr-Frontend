import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandPalette from "../CommandPalette";
import type { Vault } from "../../types/vault";
import { fuzzyMatch } from "../../utils/commandPalette";

const vaults: Vault[] = [
  {
    id: "alpha-1",
    name: "Alpha Vault",
    status: "active",
    amount: 12500,
    currency: "USDC",
    createdAt: "2024-01-01T00:00:00Z",
    deadline: "2024-07-01T00:00:00Z",
    creatorAddress: "GCREATOR",
    successAddress: "GSUCCESS",
    failureAddress: "GFAILURE",
    contractAddress: "CCONTRACT",
    milestones: [],
    transactions: [],
  },
  {
    id: "beta-2",
    name: "Beta Reserve",
    status: "completed",
    amount: 4200,
    currency: "USDC",
    createdAt: "2024-01-01T00:00:00Z",
    deadline: "2024-07-01T00:00:00Z",
    creatorAddress: "GCREATOR",
    successAddress: "GSUCCESS",
    failureAddress: "GFAILURE",
    contractAddress: "CCONTRACT",
    milestones: [],
    transactions: [],
  },
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderPalette(options?: {
  loadVaults?: () => Promise<Vault[]>;
  initialPath?: string;
}) {
  const loadVaults = options?.loadVaults ?? vi.fn().mockResolvedValue(vaults);

  render(
    <MemoryRouter initialEntries={[options?.initialPath ?? "/"]}>
      <CommandPalette loadVaults={loadVaults} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );

  return { loadVaults };
}

async function openPalette() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: /open command palette/i }),
  );
  return user;
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fuzzyMatch", () => {
  it("matches subsequence queries without requiring contiguous letters", () => {
    expect(fuzzyMatch("av", "Alpha Vault")).toBe(true);
    expect(fuzzyMatch("b2", "beta-2")).toBe(true);
    expect(fuzzyMatch("zz", "Alpha Vault")).toBe(false);
  });
});

describe("CommandPalette", () => {
  it("opens from the trigger and shows quick actions plus vaults for an empty query", async () => {
    const { loadVaults } = renderPalette();

    await openPalette();

    expect(
      await screen.findByRole("dialog", { name: /search vaults and actions/i }),
    ).toBeInTheDocument();
    expect(loadVaults).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("option", { name: /Create Vault/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Verifier Queue/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Analytics/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: /Alpha Vault/i }),
    ).toBeInTheDocument();
  });

  it("opens from Cmd+K and filters vaults by fuzzy name or id", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard("{Meta>}k{/Meta}");

    const input = await screen.findByRole("textbox", {
      name: /search vaults and actions/i,
    });
    await user.type(input, "alp");

    expect(
      screen.getByRole("option", { name: /Alpha Vault/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Beta Reserve/i }),
    ).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "beta-2");

    expect(
      screen.getByRole("option", { name: /Beta Reserve/i }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when no vaults or actions match", async () => {
    const user = await openPaletteAfterRender();

    await user.type(
      screen.getByRole("textbox", { name: /search vaults and actions/i }),
      "zzzz",
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "No matching vaults or actions.",
    );
  });

  it("wraps arrow-key selection and navigates with Enter", async () => {
    const user = await openPaletteAfterRender();
    const input = screen.getByRole("textbox", {
      name: /search vaults and actions/i,
    });

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /Beta Reserve/i }),
      ).toBeInTheDocument(),
    );

    await user.keyboard("{ArrowUp}{Enter}");

    expect(screen.getByTestId("current-path")).toHaveTextContent(
      "/vaults/beta-2",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(input).not.toBeInTheDocument();
  });

  it("updates aria-activedescendant on ArrowDown", async () => {
    const user = await openPaletteAfterRender();
    const input = screen.getByRole("textbox", {
      name: /search vaults and actions/i,
    });

    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "command-palette-option-0",
    );

    await user.keyboard("{ArrowDown}");

    await waitFor(() =>
      expect(input).toHaveAttribute(
        "aria-activedescendant",
        "command-palette-option-1",
      ),
    );
  });

  it("sets aria-activedescendant via hover", async () => {
    const user = await openPaletteAfterRender();

    await screen.findByRole("option", { name: /Verifier Queue/i });
    const input = screen.getByRole("textbox", {
      name: /search vaults and actions/i,
    });

    expect(input).toHaveAttribute("aria-activedescendant", "command-palette-option-0");

    // Assert against the hovered option's own id rather than a hardcoded
    // index, since the exact position of each item within the combined
    // quick-actions + vaults list shifts as quick actions are added/removed.
    const verifierQueueOption = screen.getByRole("option", { name: /Verifier Queue/i });
    await user.hover(verifierQueueOption);

    expect(input).toHaveAttribute("aria-activedescendant", verifierQueueOption.id);

    const alphaVaultOption = screen.getByRole("option", { name: /Alpha Vault/i });
    await user.hover(alphaVaultOption);

    expect(input).toHaveAttribute("aria-activedescendant", alphaVaultOption.id);
  });

  it("clears aria-activedescendant when no items match", async () => {
    const user = await openPaletteAfterRender();

    await user.type(
      screen.getByRole("textbox", { name: /search vaults and actions/i }),
      "zzzz",
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /search vaults and actions/i }),
    ).not.toHaveAttribute("aria-activedescendant");
  });

  it("updates aria-activedescendant on ArrowUp wrapping to the last option", async () => {
    const user = await openPaletteAfterRender();
    const input = screen.getByRole("textbox", {
      name: /search vaults and actions/i,
    });

    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "command-palette-option-0",
    );

    await user.keyboard("{ArrowUp}");

    const allOptions = screen.getAllByRole("option");
    const lastOptionIndex = allOptions.length - 1;
    await waitFor(() =>
      expect(input).toHaveAttribute(
        "aria-activedescendant",
        `command-palette-option-${lastOptionIndex}`,
      ),
    );
  });

  it("synchronizes aria-selected with aria-activedescendant across keyboard navigation", async () => {
    const user = await openPaletteAfterRender();
    const input = screen.getByRole("textbox", {
      name: /search vaults and actions/i,
    });

    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBe("command-palette-option-0");

    const initialOption = document.getElementById(activeId!);
    expect(initialOption).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");

    const nextActiveId = input.getAttribute("aria-activedescendant");
    expect(nextActiveId).toBe("command-palette-option-1");

    const nextOption = document.getElementById(nextActiveId!);
    expect(nextOption).toHaveAttribute("aria-selected", "true");
    expect(initialOption).toHaveAttribute("aria-selected", "false");
  });

  it("resets aria-activedescendant to the first matching option when query changes", async () => {
    const user = await openPaletteAfterRender();
    const input = screen.getByRole("textbox", {
      name: /search vaults and actions/i,
    });

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "command-palette-option-2",
    );

    await user.type(input, "alpha");

    await waitFor(() => {
      expect(input).toHaveAttribute(
        "aria-activedescendant",
        "command-palette-option-0",
      );
      const alphaOption = screen.getByRole("option", { name: /Alpha Vault/i });
      expect(alphaOption).toHaveAttribute("id", "command-palette-option-0");
      expect(alphaOption).toHaveAttribute("aria-selected", "true");
    });
  });

  it("wires combobox accessibility attributes on input and listbox options", async () => {
    await openPaletteAfterRender();
    const input = screen.getByRole("textbox", {
      name: /search vaults and actions/i,
    });
    const listbox = screen.getByRole("listbox", {
      name: /command palette results/i,
    });

    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "true");

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    options.forEach((opt, index) => {
      expect(opt).toHaveAttribute("id", `command-palette-option-${index}`);
    });
  });

  it("closes with Escape, backdrop click, and restores focus to the trigger", async () => {
    renderPalette();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", {
      name: /open command palette/i,
    });

    trigger.focus();
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: /search vaults and actions/i,
    });

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    const reopenedDialog = await screen.findByRole("dialog", {
      name: /search vaults and actions/i,
    });
    await user.click(reopenedDialog.parentElement!);

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(dialog).not.toBeInTheDocument();
  });

  it("disables dialog transition when reduced motion is preferred", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    renderPalette();
    await openPalette();

    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: /search vaults and actions/i }),
      ).toHaveStyle({
        transition: "none",
      }),
    );
  });
});

async function openPaletteAfterRender() {
  renderPalette();
  return openPalette();
}
