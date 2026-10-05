import { useState, useEffect, useRef } from 'react';
import { useWallet } from '../../context/WalletContext';
import { Copy, Plus, LogOut, Check, ExternalLink } from 'lucide-react';
import { getExplorerAccountUrl } from '../../utils/explorer';
import { truncateMiddle } from '../../utils/truncate';
import './wallet.css';
import { logger } from '../../utils/logger';
import FocusTrap from 'focus-trap-react';

interface WalletDropdownProps {
    onClose: () => void;
    onSwitch: () => void;
}

/**
 * Wallet dropdown invariants (enforced below and covered by
 * src/components/Wallet/__tests__/WalletDropdown.test.tsx):
 *
 * 1. The component renders nothing while no address is connected, but all
 *    hooks still run in a stable order so a later address never breaks the
 *    hook contract. A hidden menu never listens for global keys.
 * 2. Clipboard confirmation is single-flight: a repeat copy cancels the
 *    previous reset timer, so rapid duplicate copies can never clear the
 *    "copied" state early, and the pending timer is cleared on unmount so no
 *    state update runs after teardown. Clipboard failures are logged without
 *    the address and surfaced to the user as a retryable alert.
 * 3. Focus returns to the element that opened the menu only when the menu
 *    unmounts; a parent re-render (new `onClose` identity) never steals focus.
 * 4. `disconnect` is single-flight: duplicate clicks cannot invoke it twice,
 *    and the menu only closes after a successful disconnect. Failures leave
 *    the menu open with a visible, retryable error.
 * 5. Explorer navigation is skipped (and logged) when the address does not
 *    produce a valid explorer URL, so `window.open('')` never fires.
 * 6. Balance and error rendering are sanitized: only non-negative decimal
 *    balances and string errors are displayed; anything else falls back to a
 *    neutral placeholder instead of rendering hostile values.
 */

const COPY_CONFIRM_MS = 2000;
const MAX_BALANCE_ERROR_LENGTH = 200;

const DECIMAL_BALANCE_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Returns a balance string only when it is a non-negative decimal value.
 * Anything else (negative, NaN, objects, injection-looking strings) is
 * rejected so the UI can fall back to "-" instead of rendering it.
 */
function formatBalance(balance: unknown): string | null {
    if (typeof balance === 'number') {
        return Number.isFinite(balance) && balance >= 0 ? String(balance) : null;
    }
    if (typeof balance !== 'string') return null;
    const trimmed = balance.trim();
    return DECIMAL_BALANCE_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Returns a displayable error string, or null when the value is not a
 * non-empty string. Long errors are truncated so a hostile payload cannot
 * blow up the layout.
 */
function sanitizeErrorMessage(error: unknown): string | null {
    if (typeof error !== 'string') return null;
    const trimmed = error.trim();
    if (!trimmed) return null;
    return trimmed.length > MAX_BALANCE_ERROR_LENGTH
        ? `${trimmed.slice(0, MAX_BALANCE_ERROR_LENGTH)}…`
        : trimmed;
}

export function WalletDropdown({ onClose, onSwitch }: WalletDropdownProps) {
    const { address, balance, balanceStatus, balanceError, network, disconnect } = useWallet();
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
    const [actionError, setActionError] = useState<string | null>(null);
    const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const disconnectInFlightRef = useRef(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLElement | null>(null);
    const mountedRef = useRef(true);
    // Latest address, so a clipboard write that resolves after an account
    // switch cannot flag the new address as copied.
    const addressRef = useRef(address);
    addressRef.current = address;

    // Capture the element that opened the menu once and restore focus to it
    // only on unmount. Deliberately separate from the keydown effect so a
    // parent re-render with a new `onClose` identity cannot steal focus.
    useEffect(() => {
        triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return () => {
            triggerRef.current?.focus();
        };
    }, []);

    // A menu without an address renders nothing, so it must not intercept
    // global keys either.
    useEffect(() => {
        if (!address) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose, address]);

    // Cancel a pending clipboard reset on unmount so no state update is
    // scheduled after teardown.
    useEffect(
        () => () => {
            if (copyResetTimerRef.current !== null) {
                clearTimeout(copyResetTimerRef.current);
                copyResetTimerRef.current = null;
            }
        },
        [],
    );

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (copyResetTimerRef.current !== null) {
                clearTimeout(copyResetTimerRef.current);
                copyResetTimerRef.current = null;
            }
        };
    }, []);

    // Reset the "copied" indicator whenever the address or network changes so
    // stale success state cannot be attributed to a different account/network.
    useEffect(() => {
        setCopyState('idle');
        if (copyResetTimerRef.current !== null) {
            clearTimeout(copyResetTimerRef.current);
            copyResetTimerRef.current = null;
        }
    }, [address, network]);

    if (!address) return null;

    const copyAddress = async () => {
        // Single-flight confirmation: a repeat copy owns the reset window, so
        // an older timer can never clear a newer "copied" state early.
        if (copyResetTimerRef.current !== null) {
            clearTimeout(copyResetTimerRef.current);
            copyResetTimerRef.current = null;
        }

        if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
            logger.error('Clipboard API unavailable; cannot copy wallet address');
            setCopyState('error');
            return;
        }

        try {
            const copiedAddress = address;
            await navigator.clipboard.writeText(copiedAddress);
            if (!mountedRef.current || addressRef.current !== copiedAddress) return;
            setCopyState('copied');
            copyResetTimerRef.current = setTimeout(() => {
                copyResetTimerRef.current = null;
                setCopyState('idle');
            }, COPY_CONFIRM_MS);
        } catch (err) {
            logger.error('Failed to copy', err);
            setCopyState('error');
        }
    };

    const openExplorer = () => {
        let url: string | null | undefined;
        try {
            url = getExplorerAccountUrl(address, network);
        } catch (err) {
            logger.error('Failed to build explorer URL', err);
            url = null;
        }
        if (!url) {
            // The address failed validation upstream; never open an empty URL.
            logger.error('Explorer link blocked: wallet address is not a valid Stellar address');
            setActionError('Stellar Explorer is unavailable for this wallet address.');
            return;
        }
        setActionError(null);
        const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
        if (newWindow) newWindow.opener = null;
    };

    const handleDisconnect = () => {
        // Duplicate clicks (double-click, Enter+click) must not disconnect twice.
        if (disconnectInFlightRef.current) return;
        disconnectInFlightRef.current = true;

        try {
            disconnect();
        } catch (err) {
            // The wallet is still connected: re-arm so the user can retry and
            // keep the menu open so the failure is visible.
            disconnectInFlightRef.current = false;
            setActionError('Could not disconnect the wallet. Please try again.');
            logger.error('Wallet disconnect failed', err);
            return;
        }

        setActionError(null);
        onClose();
    };

    const renderBalance = () => {
        if (balanceStatus === 'loading') {
            return (
                <div className="wallet-dropdown-balance-state" role="status">
                    <span className="loader" aria-hidden="true" />
                    Loading USDC balance
                </div>
            );
        }

        if (balanceStatus === 'error') {
            const message = sanitizeErrorMessage(balanceError);
            return (
                <div className="wallet-dropdown-balance-state error" role="status">
                    Balance unavailable
                    {message && <small>{message}</small>}
                </div>
            );
        }

        if (balanceStatus === 'no_trustline') {
            return (
                <div>
                    <div className="wallet-dropdown-balance">
                        0.00 <span>USDC</span>
                    </div>
                    <small className="wallet-dropdown-balance-note">No USDC trustline on this network</small>
                </div>
            );
        }

        return (
            <div className="wallet-dropdown-balance">
                {formatBalance(balance) ?? '-'} <span>USDC</span>
            </div>
        );
    };

    return (
        <FocusTrap
            focusTrapOptions={{
                allowOutsideClick: true,
                clickOutsideDeactivates: false,
                escapeDeactivates: false,
                fallbackFocus: () => dropdownRef.current ?? document.body,
                initialFocus: () =>
                    dropdownRef.current?.querySelector<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                    ) ?? dropdownRef.current ?? document.body,
                returnFocusOnDeactivate: false,
            }}
        >
            <div className="wallet-dropdown-menu" role="menu" aria-label="Wallet options" ref={dropdownRef}>
                <div className="wallet-dropdown-header">
                    <div className="wallet-dropdown-address-container">
                        <span className="wallet-dropdown-address">{truncateMiddle(address, 6, 4)}</span>
                        <button className="wallet-copy-btn" onClick={copyAddress} title="Copy Address" role="menuitem" aria-label={copyState === 'copied' ? 'Address copied' : 'Copy address'}>
                            {copyState === 'copied' ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                        </button>
                    </div>
                    {copyState === 'error' && (
                        <div className="wallet-dropdown-error" role="alert">
                            Could not copy the wallet address. Please try again.
                        </div>
                    )}
                    {renderBalance()}
                </div>

                <div className="wallet-dropdown-actions">
                    <button className="wallet-dropdown-item" onClick={openExplorer} role="menuitem">
                        <ExternalLink size={16} />
                        View on Stellar Explorer
                    </button>
                    <button className="wallet-dropdown-item" onClick={onSwitch} role="menuitem">
                        <Plus size={16} />
                        Switch Wallet
                    </button>
                    <button className="wallet-dropdown-item danger" onClick={handleDisconnect} role="menuitem">
                        <LogOut size={16} />
                        Disconnect
                    </button>
                    {actionError && (
                        <div className="wallet-dropdown-error" role="alert">
                            {actionError}
                        </div>
                    )}
                </div>
            </div>
        </FocusTrap>
    );
}
