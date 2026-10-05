import { logger } from './logger';

/**
 * Web Vitals Reporter
 * 
 * Captures Core Web Vitals (LCP, CLS, INP) for performance observability.
 * Uses the native Performance API to avoid external dependencies.
 * 
 * @param onReport - Callback function to receive metric entries
 * 
 * Example usage:
 * ```ts
 * reportWebVitals((metric) => {
 *   console.log(metric);
 *   // Send to analytics service
 * });
 * ```
 */

export interface Metric {
  id: string;
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta?: number;
  navigationType?: string;
}

type MetricCallback = (metric: Metric) => void;

interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

interface EventTimingEntry extends PerformanceEntry {
  processingStart: number;
}

/**
 * Reports Core Web Vitals to the provided callback.
 * If no callback is provided, metrics are not reported (no-op).
 * If the callback throws, it will not crash the application.
 */
export function reportWebVitals(onReport?: MetricCallback): void {
  if (!onReport || typeof onReport !== 'function') {
    return;
  }

  // Only run in browser environment
  if (typeof window === 'undefined') {
    return;
  }

  // Report Largest Contentful Paint (LCP)
  try {
    if ('PerformanceObserver' in window) {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
        
        const metric: Metric = {
          id: `lcp-${Date.now()}`,
          name: 'LCP',
          value: lastEntry.renderTime || lastEntry.loadTime || lastEntry.startTime,
          rating: getLcpRating(lastEntry.renderTime || lastEntry.loadTime || lastEntry.startTime),
          navigationType: getNavigationType(),
        };

        safeReport(metric, onReport);
      });

      try {
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {
        // LCP observation failed, continue silently
      }
    }
  } catch {
    // LCP setup failed, continue silently
  }

  // Report Cumulative Layout Shift (CLS)
  try {
    if ('PerformanceObserver' in window) {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as LayoutShiftEntry;
          if (!layoutShift.hadRecentInput) {
            clsValue += layoutShift.value;
          }
        }

        const metric: Metric = {
          id: `cls-${Date.now()}`,
          name: 'CLS',
          value: clsValue,
          rating: getClsRating(clsValue),
          navigationType: getNavigationType(),
        };

        safeReport(metric, onReport);
      });

      try {
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      } catch {
        // CLS observation failed, continue silently
      }
    }
  } catch {
    // CLS setup failed, continue silently
  }

  // Report First Input Delay (FID) / Interaction to Next Paint (INP)
  try {
    if ('PerformanceObserver' in window) {
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const eventTiming = entry as EventTimingEntry;
          const metric: Metric = {
            id: `inp-${Date.now()}`,
            name: 'INP',
            value: eventTiming.processingStart - eventTiming.startTime,
            rating: getInpRating(eventTiming.processingStart - eventTiming.startTime),
            navigationType: getNavigationType(),
          };

          safeReport(metric, onReport);
        }
      });

      try {
        inpObserver.observe({ type: 'event', buffered: true });
      } catch {
        // INP observation failed, try FID as fallback
        try {
          const fidObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const eventTiming = entry as EventTimingEntry;
              const metric: Metric = {
                id: `fid-${Date.now()}`,
                name: 'FID',
                value: eventTiming.processingStart - eventTiming.startTime,
                rating: getFidRating(eventTiming.processingStart - eventTiming.startTime),
                navigationType: getNavigationType(),
              };

              safeReport(metric, onReport);
            }
          });

          fidObserver.observe({ type: 'first-input', buffered: true });
        } catch {
          // FID observation failed, continue silently
        }
      }
    }
  } catch {
    // INP/FID setup failed, continue silently
  }
}

/**
 * Safely reports a metric to the callback.
 * Catches any errors thrown by the callback to prevent app crashes.
 */
function safeReport(metric: Metric, onReport: MetricCallback): void {
  try {
    onReport(metric);
  } catch (e) {
    // Callback threw an error, log it but don't crash the app
    logger.error('Web Vitals reporter callback threw an error:', e);
  }
}

/**
 * Gets the navigation type (reload, navigate, back_forward).
 */
function getNavigationType(): string {
  if (typeof window === 'undefined' || !window.performance || !window.performance.getEntriesByType) {
    return 'unknown';
  }

  const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (navEntries.length > 0) {
    const type = navEntries[0].type;
    return type || 'unknown';
  }

  return 'unknown';
}

/**
 * Rates LCP based on Web Vitals thresholds.
 * Good: < 2.5s, Needs improvement: 2.5s - 4.0s, Poor: > 4.0s
 */
function getLcpRating(value: number): 'good' | 'needs-improvement' | 'poor' {
  if (value < 2500) return 'good';
  if (value < 4000) return 'needs-improvement';
  return 'poor';
}

/**
 * Rates CLS based on Web Vitals thresholds.
 * Good: < 0.1, Needs improvement: 0.1 - 0.25, Poor: > 0.25
 */
function getClsRating(value: number): 'good' | 'needs-improvement' | 'poor' {
  if (value < 0.1) return 'good';
  if (value < 0.25) return 'needs-improvement';
  return 'poor';
}

/**
 * Rates INP based on Web Vitals thresholds.
 * Good: < 200ms, Needs improvement: 200ms - 500ms, Poor: > 500ms
 */
function getInpRating(value: number): 'good' | 'needs-improvement' | 'poor' {
  if (value < 200) return 'good';
  if (value < 500) return 'needs-improvement';
  return 'poor';
}

/**
 * Rates FID based on Web Vitals thresholds.
 * Good: < 100ms, Needs improvement: 100ms - 300ms, Poor: > 300ms
 */
function getFidRating(value: number): 'good' | 'needs-improvement' | 'poor' {
  if (value < 100) return 'good';
  if (value < 300) return 'needs-improvement';
  return 'poor';
}
