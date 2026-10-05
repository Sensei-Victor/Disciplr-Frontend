import { create } from "zustand";
import { BoundaryError } from "./boundaryErrors";
import { getSession, subscribeSession } from "./sessionBoundary";
import { validate } from "./validateMiddleware";

export const TOAST_DEFAULT_DURATION_MS = 4000;
export const TOAST_REDUCED_MOTION_DURATION_MS = 1500;
export const TOAST_MAX_VISIBLE = 5;
export const TOAST_MAX_MESSAGE_LENGTH = 280;

export type ToastVariant = "info" | "success" | "error";

export type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
  sessionEpoch: number;
};

export type ToastInput = {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
  idempotencyKey?: string;
};

type ToastStore = {
  toasts: Toast[];
  seenKeys: string[];
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
  dropStaleSession: (epoch: number) => void;
};

const VARIANTS = new Set<ToastVariant>(["info", "success", "error"]);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

function defaultDuration(): number {
  return prefersReducedMotion()
    ? TOAST_REDUCED_MOTION_DURATION_MS
    : TOAST_DEFAULT_DURATION_MS;
}

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `toast-${Date.now().toString(36)}-${_idCounter}`;
}

export function sanitizeToastMessage(value: unknown): string {
  if (typeof value !== "string") {
    throw new BoundaryError("TAMPERED_INPUT", "Toast message must be a string.");
  }
  // eslint-disable-next-line no-control-regex
  const trimmed = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (trimmed.length === 0) {
    throw new BoundaryError("TAMPERED_INPUT", "Toast message must not be empty.");
  }
  if (trimmed.length > TOAST_MAX_MESSAGE_LENGTH) {
    throw new BoundaryError(
      "TAMPERED_INPUT",
      `Toast message exceeds ${TOAST_MAX_MESSAGE_LENGTH} characters.`,
    );
  }
  return trimmed;
}

export function sanitizeToastVariant(value: unknown): ToastVariant {
  if (value === undefined) return "info";
  if (typeof value !== "string" || !VARIANTS.has(value as ToastVariant)) {
    throw new BoundaryError("TAMPERED_INPUT", "Toast variant is not allowed.");
  }
  return value as ToastVariant;
}

export function sanitizeDurationMs(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BoundaryError("TAMPERED_INPUT", "Toast duration must be a finite number.");
  }
  return value;
}

export const useToastStore = create<ToastStore>()(
  validate(
    (set, get) => {
      const timers: Record<string, ReturnType<typeof setTimeout>> = {};

      function clearTimer(id: string) {
        const t = timers[id];
        if (t !== undefined) {
          clearTimeout(t);
          delete timers[id];
        }
      }

      function push(input: ToastInput): string {
        const message = sanitizeToastMessage(input?.message);
        const variant = sanitizeToastVariant(input?.variant);
        const durationMs = sanitizeDurationMs(input?.durationMs);
        const session = getSession();

        if (input.idempotencyKey) {
          const key = `${session.epoch}:${input.idempotencyKey}`;
          if (get().seenKeys.includes(key)) {
            throw new BoundaryError(
              "REPLAY",
              "Toast idempotency key was already used in this session.",
            );
          }
          set({ seenKeys: [...get().seenKeys, key] });
        }

        const id = nextId();
        const toast: Toast = {
          id,
          message,
          variant,
          createdAt: Date.now(),
          sessionEpoch: session.epoch,
        };

        set((state) => {
          const live = state.toasts.filter((t) => t.sessionEpoch === session.epoch);
          const merged = [...live, toast];
          const cap = TOAST_MAX_VISIBLE;
          if (merged.length > cap) {
            const evicted = merged.slice(0, merged.length - cap);
            for (const t of evicted) clearTimer(t.id);
            return { toasts: merged.slice(-cap) };
          }
          return { toasts: merged };
        });

        const duration = durationMs ?? defaultDuration();
        if (duration > 0) {
          const handle = setTimeout(() => {
            delete timers[id];
            get().dismiss(id);
          }, duration);
          timers[id] = handle;
        }

        return id;
      }

      function dismiss(id: string) {
        if (typeof id !== "string" || id.length === 0) {
          throw new BoundaryError("TAMPERED_INPUT", "Toast id is required.");
        }
        clearTimer(id);
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }

      function clear() {
        for (const id of Object.keys(timers)) clearTimer(id);
        set({ toasts: [] });
      }

      function dropStaleSession(epoch: number) {
        for (const toast of get().toasts) {
          if (toast.sessionEpoch !== epoch) clearTimer(toast.id);
        }
        set((state) => ({
          toasts: state.toasts.filter((t) => t.sessionEpoch === epoch),
          seenKeys: state.seenKeys.filter((k) => k.startsWith(`${epoch}:`)),
        }));
      }

      return {
        toasts: [],
        seenKeys: [],
        push,
        dismiss,
        clear,
        dropStaleSession,
      };
    },
    {
      name: "toast",
      validate: ({ next }) => next,
    },
  ),
);

subscribeSession((session) => {
  useToastStore.getState().dropStaleSession(session.epoch);
});

export function __resetToastStoreForTests() {
  useToastStore.getState().clear();
  useToastStore.setState({ seenKeys: [] });
}
