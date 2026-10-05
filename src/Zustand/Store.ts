import { getNotifications } from "@/components/Notification/exampleNotification/example";
import { create } from "zustand";
import { initialPending, initialHistory } from "../fixtures/validations";

// --- Existing Notification Store ---
const n = getNotifications();

export type NotificationItem = (typeof n)[number];

type notificationsType = {
  notification: NotificationItem[];
  setNotification: (value: NotificationItem[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
};

/**
 * Runtime guard for store entries. Types claim every entry is a
 * `NotificationItem`, but callers can write arbitrary payloads through
 * `setNotification`/`setState`, so every read path validates before touching
 * entry fields. Non-objects are preserved (never crashed on, never silently
 * dropped by a transition) and simply never match an id.
 */
const isRecord = (value: unknown): value is NotificationItem =>
  typeof value === "object" && value !== null;

const isList = (value: unknown): value is NotificationItem[] =>
  Array.isArray(value);

export const useNotification = create<notificationsType>((set) => ({
  notification: n,
  setNotification: (value: NotificationItem[]) =>
    set((state) => {
      // Validation boundary: only arrays are accepted, and non-object entries
      // are discarded so a hostile payload cannot poison later transitions
      // (markRead/markAllRead/dismiss) or unread counting.
      if (!Array.isArray(value)) return state;
      return { notification: value.filter(isRecord) };
    }),
  markRead: (id: string) =>
    set((state) => {
      if (!isList(state.notification)) return state;
      const idx = state.notification.findIndex(
        (item) => isRecord(item) && item.id === id,
      );
      if (idx === -1) return state;
      const item = state.notification[idx];
      if (item.isRead) return state;
      const notification = [...state.notification];
      notification[idx] = { ...item, isRead: true };
      return { notification };
    }),
  markAllRead: () =>
    set((state) => {
      if (!isList(state.notification)) return state;
      return {
        notification: state.notification.map((item) =>
          isRecord(item) && !item.isRead ? { ...item, isRead: true } : item,
        ),
      };
    }),
  dismiss: (id: string) =>
    set((state) => {
      if (!isList(state.notification)) return state;
      return {
        notification: state.notification.filter(
          (item) => !(isRecord(item) && item.id === id),
        ),
      };
    }),
  clearAll: () =>
    set(() => ({
      notification: [],
    })),
}));

export const useUnreadCount = () =>
  useNotification((state) =>
    isList(state.notification)
      ? state.notification.filter(
          (item) => isRecord(item) && !item.isRead,
        ).length
      : 0,
  );


// --- New Verifier Store ---
export type ValidationTask = {
  id: string;
  vaultName: string;
  owner: string;
  amount: string;
  deadline: string;
  status: 'pending' | 'approved' | 'rejected';
  milestone: string;
  evidenceUrl?: string;
  notes?: string;
  criteria?: string[];
  decidedAt?: string;
};

type VerifierStoreType = {
  pendingValidations: ValidationTask[];
  validationHistory: ValidationTask[];
  approveValidation: (id: string, notes?: string) => void;
  rejectValidation: (id: string, notes?: string) => void;
  batchApprove: (ids: string[], notes?: string) => void;
  batchReject: (ids: string[], notes?: string) => void;
};

// Mock initial data lives in src/fixtures/validations.ts (imported at top).

export const useVerifierStore = create<VerifierStoreType>((set, get) => ({
  pendingValidations: initialPending,
  validationHistory: initialHistory,
  
  approveValidation: (id, notes) => set((state) => {
    const taskIndex = state.pendingValidations.findIndex(t => t.id === id);
    if (taskIndex === -1) return state;
    
    const task = { ...state.pendingValidations[taskIndex], status: 'approved' as const, notes, decidedAt: new Date().toISOString() };
    const newPending = [...state.pendingValidations];
    newPending.splice(taskIndex, 1);
    
    return {
      pendingValidations: newPending,
      validationHistory: [task, ...state.validationHistory]
    };
  }),
  
  rejectValidation: (id, notes) => set((state) => {
    const taskIndex = state.pendingValidations.findIndex(t => t.id === id);
    if (taskIndex === -1) return state;
    
    const task = { ...state.pendingValidations[taskIndex], status: 'rejected' as const, notes, decidedAt: new Date().toISOString() };
    const newPending = [...state.pendingValidations];
    newPending.splice(taskIndex, 1);
    
    return {
      pendingValidations: newPending,
      validationHistory: [task, ...state.validationHistory]
    };
  }),

  // Batch mutators are implemented in terms of the single-task mutators so the
  // pending -> history transition stays identical for one or many tasks.
  batchApprove: (ids, notes) => {
    ids.forEach(id => get().approveValidation(id, notes));
  },

  batchReject: (ids, notes) => {
    ids.forEach(id => get().rejectValidation(id, notes));
  }
}));

export * from "./notificationPreferences";
