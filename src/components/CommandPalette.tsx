import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import FocusTrap from "focus-trap-react";
import { listVaults } from "../services/vaultService";
import type { Vault } from "../types/vault";
import { fuzzyMatch } from "../utils/commandPalette";
import { duration } from "../utils/motion";
import { usePrefersReducedMotion } from "../utils/usePrefersReducedMotion";

interface CommandPaletteProps {
  loadVaults?: () => Promise<Vault[]>;
}

type CommandItem = {
  id: string;
  label: string;
  description: string;
  to: string;
  kind: "action" | "vault";
};

const QUICK_ACTIONS: CommandItem[] = [
  {
    id: "action-dashboard",
    label: "Dashboard",
    description: "View vault summary and stats",
    to: "/dashboard",
    kind: "action",
  },
  {
    id: "action-vaults",
    label: "Vaults",
    description: "Browse all vaults",
    to: "/vaults",
    kind: "action",
  },
  {
    id: "action-create-vault",
    label: "Create Vault",
    description: "Start a new vault",
    to: "/vaults/create",
    kind: "action",
  },
  {
    id: "action-verifier-queue",
    label: "Verifier Queue",
    description: "Review pending validations",
    to: "/verifier/queue",
    kind: "action",
  },
  {
    id: "action-analytics",
    label: "Analytics",
    description: "Open vault analytics",
    to: "/analytics",
    kind: "action",
  },
];

function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const open = useCallback(() => {
    triggerRef.current?.focus();
    setIsOpen(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }

      event.preventDefault();
      open();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return { close, isOpen, open, triggerRef };
}

function vaultToCommand(vault: Vault): CommandItem {
  return {
    id: `vault-${vault.id}`,
    label: vault.name,
    description: `Vault ${vault.id} · ${vault.amount.toLocaleString()} ${vault.currency}`,
    to: `/vaults/${vault.id}`,
    kind: "vault",
  };
}

export default function CommandPalette({
  loadVaults = listVaults,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const { close, isOpen, open, triggerRef } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    loadVaults()
      .then((nextVaults) => {
        if (!cancelled) setVaults(nextVaults);
      })
      .catch(() => {
        if (!cancelled) setVaults([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, loadVaults]);

  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  const items = useMemo(() => {
    const vaultCommands = vaults.map(vaultToCommand);
    const allItems = [...QUICK_ACTIONS, ...vaultCommands];
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return allItems;

    return allItems.filter((item) => {
      const haystack =
        item.kind === "vault" ? `${item.label} ${item.id}` : item.label;
      return fuzzyMatch(trimmedQuery, haystack);
    });
  }, [query, vaults]);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length, query]);

  const runItem = useCallback(
    (item: CommandItem) => {
      navigate(item.to);
      close();
    },
    [close, navigate],
  );

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (items.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % items.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + items.length) % items.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runItem(items[activeIndex]);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open command palette"
        className="header-link"
        onClick={open}
        style={{ border: "none", background: "transparent", cursor: "pointer" }}
      >
        <Search size={18} aria-hidden="true" />
      </button>

      {isOpen && (
        <FocusTrap
          focusTrapOptions={{
            allowOutsideClick: true,
            clickOutsideDeactivates: false,
            escapeDeactivates: false,
            fallbackFocus: () => dialogRef.current ?? document.body,
            initialFocus: "#command-palette-input",
            returnFocusOnDeactivate: false,
          }}
        >
          <div
            role="presentation"
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: "var(--z-index-modal, 1000)",
              background: "var(--overlay-backdrop)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "12vh 1rem 1rem",
              transition: prefersReducedMotion
                ? "none"
                : `opacity ${duration.normal}s ease`,
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="command-palette-title"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleKeyDown}
              style={{
                width: "min(640px, 100%)",
                maxHeight: "min(70vh, 640px)",
                overflow: "hidden",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                boxShadow: "var(--shadow-level-5)",
                transform: "translateY(0)",
                transition: prefersReducedMotion
                  ? "none"
                  : `transform ${duration.normal}s ease`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.875rem 1rem",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <Search size={18} aria-hidden="true" />
                <label
                  id="command-palette-title"
                  htmlFor="command-palette-input"
                >
                  Search vaults and actions
                </label>
                <button
                  type="button"
                  aria-label="Close command palette"
                  onClick={close}
                  style={{
                    marginLeft: "auto",
                    border: "none",
                    background: "transparent",
                    color: "var(--muted)",
                    cursor: "pointer",
                    minHeight: "var(--touch-target)",
                    minWidth: "var(--touch-target)",
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <input
                id="command-palette-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type a vault name, id, or action"
                aria-controls="command-palette-results"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-activedescendant={
                  items[activeIndex]
                    ? `command-palette-option-${activeIndex}`
                    : undefined
                }
                style={{
                  width: "100%",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  padding: "0.875rem 1rem",
                  font: "inherit",
                  outline: "none",
                }}
              />

              <div
                id="command-palette-results"
                role="listbox"
                aria-label="Command palette results"
                style={{
                  maxHeight: "420px",
                  overflowY: "auto",
                  padding: "0.5rem",
                }}
              >
                {items.length === 0 ? (
                  <p
                    role="status"
                    style={{
                      margin: 0,
                      padding: "1rem",
                      color: "var(--muted)",
                    }}
                  >
                    No matching vaults or actions.
                  </p>
                ) : (
                  items.map((item, index) => (
                    <button
                      key={item.id}
                      id={`command-palette-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runItem(item)}
                      style={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: "0.25rem",
                        border: "none",
                        borderRadius: "var(--radius)",
                        background:
                          index === activeIndex
                            ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                            : "transparent",
                        color: "var(--text)",
                        cursor: "pointer",
                        padding: "0.75rem",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{item.label}</span>
                      <span style={{ color: "var(--muted)", fontSize: 13 }}>
                        {item.description}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </FocusTrap>
      )}
    </>
  );
}
