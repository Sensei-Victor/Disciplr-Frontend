import Message from "@/components/Notification/Messages";
import { groupNotificationsByDate } from "../utils/groupNotifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { transitionEnter } from "../utils/motion";
import { useNotification } from "@/Zustand/Store";
import { MdOutlineSettingsInputComposite } from "react-icons/md";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { usePrefersReducedMotion } from "../utils/usePrefersReducedMotion";
import { Pagination } from "@/components/Pagination";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { paginate } from "@/utils/paginate";
import type { NotificationItem } from "@/Zustand/Store";

export default function Notification() {
  const notifications = useNotification((state) => state.notification);
  const setNotifications = useNotification((state) => state.setNotification);
  const dismiss = useNotification((state) => state.dismiss);
  const clearAll = useNotification((state) => state.clearAll);
  const [currentFilterReadSeletion, setCurrentFilterReadSeletion] = useState("all");
  const [currentFilterTypeSeletion, setCurrentFilterTypeSeletion] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isPreferenceOpen, setIsPreferenceOpen] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const itemsPerPage = 5;
  const [actionError, setActionError] = useState<string | null>(null);

  const prefersReducedMotion = usePrefersReducedMotion(); // <-- Consume the preference status

  // Define a clean transition config that zero-durations motion elements when flag is on
  const activeTransition = prefersReducedMotion 
    ? { duration: 0 } 
    : transitionEnter;

  const filteredNotifications = useMemo(() => {
    let filtered = notifications;
    if (!filtered) return [];
    if (!Array.isArray(filtered)) return [];

    if (currentFilterReadSeletion !== "all") {
      filtered = filtered.filter(
        (noti) => noti.isRead === Boolean(Number(currentFilterReadSeletion)),
      );
    }

    if (currentFilterTypeSeletion !== "all") {
      filtered = filtered.filter(
        (noti) => noti.category === currentFilterTypeSeletion,
      );
    }

    return filtered;
  }, [notifications, currentFilterReadSeletion, currentFilterTypeSeletion]);

  const pagination = paginate(filteredNotifications, currentPage, itemsPerPage);
  const currentData = pagination.items;

  // Invariant: currentPage must always be within [1, pagination.totalPages].
  // If filters or data shrink the result set, clamp the page to avoid
  // rendering an empty page while valid items exist on earlier pages.
  useEffect(() => {
    const totalPages = Math.max(1, pagination.totalPages ?? 1);
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (currentPage < 1) {
      setCurrentPage(1);
    }
  }, [currentPage, pagination.totalPages]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsFilterOpen((open) => {
          if (open) {
            // Restore focus to filter button if focus is currently inside the filter panel
            if (filterPanelRef.current?.contains(document.activeElement)) {
              filterButtonRef.current?.focus();
            }
            return false;
          }
          return open;
        });
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFilterOpen((open) => {
          if (open) {
            // Restore focus to filter button if focus is currently inside the filter panel
            if (filterPanelRef.current?.contains(document.activeElement)) {
              filterButtonRef.current?.focus();
            }
            return false;
          }
          return open;
        });
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [currentFilterReadSeletion, currentFilterTypeSeletion, notifications]);

  // Invariant: setRead must be idempotent and must not mutate unrelated
  // notifications. It must also tolerate stale ids (already dismissed).
  const setRead = (id: string) => {
    if (typeof id !== "string" || id.length === 0) return;
    const current = useNotification.getState().notification;
    if (!Array.isArray(current)) return;
    const target = current.find((n) => n.id === id);
    if (!target || target.isRead) return;
    try {
      setNotifications(
        current.map((n) =>
          n.id === id ? { ...n, isRead: true } : n,
        ),
      );
      setActionError(null);
    } catch (err) {
      setActionError("Unable to mark notification as read. Please retry.");
    }
  };

  // Invariant: dismiss must be idempotent and tolerate unknown ids.
  const handleDismiss = (id: string) => {
    if (typeof id !== "string" || id.length === 0) return;
    const current = useNotification.getState().notification;
    if (!Array.isArray(current)) return;
    if (!current.some((n) => n.id === id)) return;
    try {
      dismiss(id);
      setActionError(null);
    } catch (err) {
      setActionError("Unable to dismiss notification. Please retry.");
    }
  };

  const handleClearAll = () => {
    try {
      clearAll();
      setActionError(null);
    } catch (err) {
      setActionError("Unable to clear notifications. Please retry.");
    } finally {
      setShowClearModal(false);
    }
  };

  const statusLabel =
    currentFilterReadSeletion === "all"
      ? "all"
      : currentFilterReadSeletion === "0"
        ? "unread"
        : "read";
  const categoryLabel =
    currentFilterTypeSeletion === "all" ? "all categories" : currentFilterTypeSeletion;
  const resultCount = filteredNotifications.length;
  const countText =
    resultCount === 0
      ? "No notifications found"
      : `Showing ${resultCount === 1 ? "1 notification" : `${resultCount} notifications`}`;
  const liveAnnouncement = `${countText}. Active filters: status ${statusLabel}, category ${categoryLabel}.`;

  return (
    <>
      {actionError && (
        <div role="alert" className="text-sm text-red-600 mb-2">
          {actionError}
        </div>
      )}
      <div ref={containerRef} className="flex justify-between items-center">
        <div className="text-xl font-bold">Notification Page </div>
        <div className="flex gap-5 items-center justify-center">
          <div className="relative">
            <Link
              to="/notifications/settings"
              aria-label="Notification Preferences"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius-full)",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "0.875rem",
              }}
            >
              <MdOutlineSettingsInputComposite size={"2rem"} />
            </Link>
          </div>

          <div className="relative">
            <button
              ref={filterButtonRef}
              aria-label="Filter notifications"
              aria-expanded={isFilterOpen}
              aria-controls="notification-filter-panel"
              onClick={() => {
                if (isPreferenceOpen) {
                  setIsPreferenceOpen(false);
                }
                setIsFilterOpen((prev) => !prev);
              }}
              className="bg-[var(--accent)] px-3 py-2 rounded-md"
            >
              Filter
            </button>
            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  ref={filterPanelRef}
                  initial={prefersReducedMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={prefersReducedMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -10, scale: 0.95 }}
                  transition={activeTransition} // <-- Assign the guarded duration here
                  className="absolute w-[300px] h-[200px] translate-x-[-100%] bg-white text-black px-3 py-2 rounded-md"
                  style={{ zIndex: 'var(--z-index-drawer)' }}
                >
                  <h2>Filter By : </h2>
                  <div className="flex justify-between">
                    <select
                      onChange={(e) => {
                        setCurrentFilterReadSeletion(e.target.value);
                      }}
                      value={currentFilterReadSeletion}
                      name="filter_by_read"
                      id="read"
                    >
                      <option value="all">All</option>
                      <option value="0">Unread</option>
                      <option value="1">Read</option>
                    </select>
                    <select
                      onChange={(e) => {
                        setCurrentFilterTypeSeletion(e.target.value);
                      }}
                      value={currentFilterTypeSeletion}
                      name="filter_by_type"
                      id="type"
                    >
                      <option value="all">All</option>
                      <option value="vault">Vault</option>
                      <option value="funds">Funds</option>
                      <option value="verification">Verification</option>
                      <option value="milestone">Milestone</option>
                      <option value="system">System</option>
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {notifications.length > 0 && (
            <button
              onClick={() => setShowClearModal(true)}
              className="bg-red-500 px-3 py-2 rounded-md text-white text-sm"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="flex w-full flex-col gap-5 mt-5">
        {currentData.length > 0 ? (() => {
          const groups = groupNotificationsByDate(currentData);
          return groups.map((group: { bucket: string; items: NotificationItem[] }) => (
            <div key={group.bucket}>
              <div
                className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2 mt-1"
                style={{ letterSpacing: '0.08em' }}
              >
                {group.bucket}
              </div>
              {group.items.map((items: NotificationItem) => (
                <div
                  key={items.id}
                  className="w-full px-2 border-[var(--accent)] border-1 rounded-md mb-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Message
                        id={items.id}
                        title={items.title}
                        message={items.message}
                        timestamp={items.timestamp}
                        type={items.type}
                        read={items.isRead}
                        isFullPage={true}
                        setRead={setRead}
                        onDismiss={handleDismiss}
                      />
                    </div>
                    <button
                      onClick={() => handleDismiss(items.id)}
                      className="mt-2 p-1 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-gray-100"
                      aria-label={`Dismiss notification ${items.id}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ));
        })() : (
          <p>No notifications found.</p>
        )}
      </div>

      <Pagination
        pagination={pagination}
        onPageChange={setCurrentPage}
        ariaLabel="Notifications pagination"
        className="mt-8"
        showJumpToPage
      />

      <ConfirmationModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleClearAll}
        simpleConfirm={{
          title: "Clear all notifications",
          message: `Are you sure you want to clear all ${notifications.length} notifications? This action cannot be undone.`,
          confirmLabel: "Clear all",
        }}
      />

      {/* Screen Reader Announcements for filter updates and notification counts */}
      <div className="sr-only" role="status" aria-live="polite">
        {liveAnnouncement}
      </div>
    </>
  );
}