import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import './index.css'
import { reportWebVitals } from './utils/reportWebVitals'

/**
 * Entry point invariants:
 * 1. The #root element must exist and be an HTMLElement before React attaches.
 * 2. Mounting must happen at most once per document, even under concurrent calls.
 * 3. Web vitals reporting must never throw into the bootstrap path.
 * 4. Failures must be surfaced through a user-visible error without leaking sensitive data.
 */

export interface BootstrapOptions {
  /** Document to query for the root element. Defaults to the global document. */
  document?: Document
  /** Id of the root element. Defaults to 'root'. */
  rootId?: string
  /** Optional callback for web vitals. */
  onWebVital?: (value: unknown) => void
  /** Optional logger for diagnostics. */
  logger?: { info: (... args: unknown[]) => void; error: (... args: unknown[]) => void }
}

export const REPORT_WEB_VITALS_FAILURE_LOG = '[Web Vitals] reporting failed'

function isHtmlElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
}

function resolveRootElement(doc: Document, rootId: string): HTMLElement {
  if (typeof rootId !== 'string' || rootId.trim().length === 0) {
    throw new Error('Root element id must be a non-empty string')
  }

  const el = doc.getElementById(rootId)
  if (!el) {
    throw new Error(`Root element #${rootId} not found`)
  }
  if (!isHtmlElement(el)) {
    throw new Error(`Root element #${rootId} is not an HTMLElement`)
  }
  return el
}

function safeReportWebVitals(
  onWebVital: (value: unknown) => void,
  logger: { info: (... args: unknown[]) => void; error: (... args: unknown[]) => void },
): void {
  try {
    reportWebVitals((value) => {
      try {
        onWebVital(value)
      } catch (error) {
        // A consumer callback failure must not break the bootstrap path.
        logger.error(REPORT_WEB_VITALS_FAILURE_LOG, error)
      }
    })
  } catch (error) {
    // reportWebVitals itself failing must not crash the app.
    logger.error(REPORT_WEB_VITALS_FAILURE_LOG, error)
  }
}

function renderErrorUI(el: HTMLElement, message: string): void {
  el.setAttribute('role', 'alert')
  el.setAttribute('data-app-error', 'true')
  el.textContent = message
}

export function bootstrap(options: BootstrapOptions = {}): Root {
  const doc = options.document ?? document
  const rootId = options.rootId ?? 'root'
  const logger = options.logger ?? console
  const onWebVital = options.onWebVital ?? ((value) => logger.info('[Web Vitals]', value))

  // Resolve and validate the root element before any side effects.
  const rootEl = resolveRootElement(doc, rootId)

  // Guard against concurrent double mounting on the same element.
  if (rootEl.getAttribute('data-app-mounted') === 'true') {
    throw new Error(`Root element #${rootId} is already mounted`)
  }
  rootEl.setAttribute('data-app-mounted', 'true')

  safeReportWebVitals(onWebVital, logger)

  try {
    const root = createRoot(rootEl)
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    return root
  } catch (error) {
    // Roll back mount marker so a retry can succeed, and surface a safe message.
    rootEl.removeAttribute('data-app-mounted')
    renderErrorUI(rootEl, 'Something went wrong while starting the app.')
    logger.error('[Bootstrap] failed to mount the application', error)
    throw error
  }
}

// Auto-bootstrap only in a browser environment with a document.
if (typeof document !== 'undefined') {
  bootstrap()
}
