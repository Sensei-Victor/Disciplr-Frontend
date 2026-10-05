import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../utils/usePrefersReducedMotion";

export type TooltipPosition = "top" | "bottom";

export interface TooltipProps {
  content: string;
  position?: TooltipPosition;
  children: React.ReactElement;
  className?: string;
}

const ANIMATION_DURATION_MS = 150;

/**
 * Lightweight, accessible Tooltip component.
 *
 * Stacking context is governed by the design system's z-index scale via
 * `var(--z-index-tooltip)`, ensuring tooltips float above surrounding page
 * content and headers while remaining below drawers and modals.
 *
 * Accessibility features:
 * - Dynamically links trigger element to tooltip via `aria-describedby`.
 * - Activates on pointer hover and keyboard focus.
 * - Dismisses on Escape keypress.
 * - Respects `prefers-reduced-motion` settings.
 *
 * @param props Component configuration options.
 * @returns Accessible tooltip element wrapping the provided trigger child.
 */
export function Tooltip({
  content,
  position = "top",
  children,
  className = "",
}: TooltipProps) {
  const tooltipId = useId();
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefersReducedMotion = usePrefersReducedMotion();

  const show = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    hideTimerRef.current = setTimeout(
      () => setVisible(false),
      prefersReducedMotion ? 0 : ANIMATION_DURATION_MS,
    );
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisible(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  const trigger = React.cloneElement(children, {
    "aria-describedby": visible ? tooltipId : undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      children.props.onBlur?.(e);
    },
  });

  const positionStyle: React.CSSProperties =
    position === "top"
      ? {
          bottom: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
        }
      : { top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" };

  const transitionStyle: React.CSSProperties = prefersReducedMotion
    ? { transition: "none" }
    : {
        transition: `opacity ${ANIMATION_DURATION_MS}ms ease, transform ${ANIMATION_DURATION_MS}ms ease`,
      };

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
      className={className}
    >
      {trigger}

      <span
        id={tooltipId}
        role="tooltip"
        style={{
          position: "absolute",
          ...positionStyle,
          zIndex: "var(--z-index-tooltip)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          padding: "4px 10px",
          borderRadius: "var(--radius-sm, 4px)",
          fontSize: "0.75rem",
          fontWeight: 500,
          lineHeight: 1.4,
          background: "var(--surface-inverse, #1a2233)",
          color: "var(--text-inverse, #f0f4f8)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          opacity: visible ? 1 : 0,
          transform: visible
            ? `translateX(-50%)`
            : `translateX(-50%) ${position === "top" ? "translateY(4px)" : "translateY(-4px)"}`,
          ...transitionStyle,
          visibility: visible ? "visible" : "hidden",
        }}
        aria-hidden={!visible}
      >
        {content}
      </span>
    </span>
  );
}

export default Tooltip;
