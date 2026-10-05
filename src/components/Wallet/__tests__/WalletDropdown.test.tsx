import { vi, describe, beforeEach, expect, afterEach } from 'vitest';
import type { BalanceStatus, WalletNetwork } from '@/context/WalletContext';

const walletState = vi.hoisted(() => ({
    address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW' as string | null,
    balance: '12.0000000' as string | null,
    balanceStatus: 'success' as BalanceStatus,
    balanceError: null as string | null,
    network: 'TESTNET' as WalletNetwork | null,
    disconnect: vi.fn(),
}));

vi.mock('@/context/WalletContext', () => ({
    useWallet: () => walletState,
}));

vi.mock('lucide-react', async (importOriginal) => {
    const original = await importOriginal<typeof import('lucide-react')>();
    return {
        ...original,
        Copy: () => <svg aria-label="copy-icon" />,
        Check: () => <svg aria-label="check-icon" />,
    };
});

// The suite owns the focus-trap behaviour: the global setup mock keeps moving
// focus to the first focusable node on every render, which would mask the
// focus-restore invariant these tests assert. A passthrough keeps the DOM
// (and focus) exactly as the component leaves it.
vi.mock('focus-trap-react', async () => {
    const React = await import('react');
    return {
        default: ({ children }: { children: ReactNode }) =>
            React.createElement(React.Fragment, null, children),
    };
});

import { act, useState } from 'react';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletDropdown } from '../WalletDropdown';

function renderDropdown() {
    const onClose = vi.fn();
    const onSwitch = vi.fn();

    return {
        onClose,
        onSwitch,
        ...render(<WalletDropdown onClose={onClose} onSwitch={onSwitch} />),
    };
}

function setClipboard(value: unknown) {
    Object.defineProperty(navigator, 'clipboard', {
        value,
        configurable: true,
        writable: true,
    });
}

function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
    setClipboard({ writeText });
}

describe('WalletDropdown balance states', () => {
    beforeEach(() => {
        resetWalletState();
    });

    test('renders the loaded USDC balance', () => {
        renderDropdown();

        expect(screen.getByText('12.0000000')).toBeInTheDocument();
        expect(screen.getByText('USDC')).toBeInTheDocument();
    });

    test('renders a loading state instead of a stale balance', () => {
        walletState.balance = null;
        walletState.balanceStatus = 'loading';

        renderDropdown();

        expect(screen.getByRole('status')).toHaveTextContent('Loading USDC balance');
        expect(screen.queryByText('12.0000000')).not.toBeInTheDocument();
    });

    test('renders the no-trustline state explicitly', () => {
        walletState.balance = '0.00';
        walletState.balanceStatus = 'no_trustline';

        renderDropdown();

        expect(screen.getByText('0.00')).toBeInTheDocument();
        expect(screen.getByText('No USDC trustline on this network')).toBeInTheDocument();
    });

    test('renders the Horizon error state', () => {
        walletState.balance = null;
        walletState.balanceStatus = 'error';
        walletState.balanceError = 'Horizon balance request failed with status 500.';

        renderDropdown();

        expect(screen.getByRole('status')).toHaveTextContent('Balance unavailable');
        expect(screen.getByText('Horizon balance request failed with status 500.')).toBeInTheDocument();
    });

    test('renders nothing when no wallet is connected', () => {
        walletState.address = null as unknown as string;

        const { container } = renderDropdown();

        expect(container).toBeEmptyDOMElement();
    });

    test('renders an empty balance fallback for idle state', () => {
        walletState.balance = null;
        walletState.balanceStatus = 'idle';

        renderDropdown();

        expect(screen.getByText('-')).toBeInTheDocument();
    });

    test('calls switch and disconnect actions', () => {
        const { onClose, onSwitch } = renderDropdown();

        screen.getByRole('menuitem', { name: /switch wallet/i }).click();
        expect(onSwitch).toHaveBeenCalledTimes(1);

        screen.getByRole('menuitem', { name: /disconnect/i }).click();
        expect(walletState.disconnect).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('WalletDropdown address display', () => {
    beforeEach(() => {
        resetWalletState();
    });

    test('renders the truncated address format', () => {
        renderDropdown();

        expect(screen.getByText('GABCDE...TUVW')).toBeInTheDocument();
    });
});

describe('WalletDropdown clipboard copy', () => {
    beforeEach(() => {
        resetWalletState();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('shows copied state after a successful copy and reverts after 2 seconds', async () => {
        vi.useFakeTimers();
        const writeText = vi.fn().mockResolvedValue(undefined);
        mockClipboard(writeText);

        renderDropdown();

        await act(async () => {
            screen.getByTitle('Copy Address').click();
            await Promise.resolve();
        });

        expect(writeText).toHaveBeenCalledWith(walletState.address);
        expect(screen.getByLabelText('check-icon')).toBeInTheDocument();
        expect(screen.queryByLabelText('copy-icon')).not.toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(screen.getByLabelText('copy-icon')).toBeInTheDocument();
        expect(screen.queryByLabelText('check-icon')).not.toBeInTheDocument();
    });

    test('handles clipboard rejection without showing copied state', async () => {
        mockClipboard(vi.fn().mockRejectedValue(new Error('denied')));
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        renderDropdown();

        await act(async () => {
            screen.getByTitle('Copy Address').click();
            await Promise.resolve();
        });

        expect(error).toHaveBeenCalledWith('Failed to copy', expect.any(Error));
        expect(screen.getByLabelText('copy-icon')).toBeInTheDocument();
        expect(screen.queryByLabelText('check-icon')).not.toBeInTheDocument();
        expect(screen.getByText('12.0000000')).toBeInTheDocument();

        error.mockRestore();
    });

    test('retries a failed copy and succeeds on the second attempt', async () => {
        const writeText = vi.fn()
            .mockRejectedValueOnce(new Error('denied'))
            .mockResolvedValue(undefined);
        mockClipboard(writeText);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        renderDropdown();

        await act(async () => {
            screen.getByTitle('Copy Address').click();
            await Promise.resolve();
        });

        expect(screen.getByLabelText('copy-icon')).toBeInTheDocument();

        await act(async () => {
            screen.getByTitle('Copy Address').click();
            await Promise.resolve();
        });

        expect(writeText).toHaveBeenCalledWith(walletState.address);
        expect(screen.getByLabelText('check-icon')).toBeInTheDocument();

        error.mockRestore();
    });

    test('ignores a stale copy resolution after the address changes', async () => {
        vi.useFakeTimers();
        let resolveFirst: () => void = () => undefined;
        const first = new Promise<void>((resolve) => {
            resolveFirst = resolve;
        });
        const writeText = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(undefined);
        mockClipboard(writeText);

        const { rerender, onClose, onSwitch } = renderDropdown();

        act(() => {
            screen.getByTitle('Copy Address').click();
        });

        walletState.address = 'GXYZ77777777777777777777777777777777777777777777777777777777777777';
        rerender(<WalletDropdown onClose={onClose} onSwitch={onSwitch} />);

        await act(async () => {
            resolveFirst();
            await Promise.resolve();
        });

        expect(screen.queryByLabelText('check-icon')).not.toBeInTheDocument();
        expect(screen.getByLabelText('copy-icon')).toBeInTheDocument();
    });
});

describe('WalletDropdown explorer link', () => {
    beforeEach(() => {
        resetWalletState();
    });

    test('opens the testnet explorer for testnet wallets with noopener/noreferrer', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);

        renderDropdown();

        screen.getByRole('menuitem', { name: /view on stellar explorer/i }).click();
        expect(open).toHaveBeenCalledWith(
            `https://stellar.expert/explorer/testnet/account/${walletState.address}`,
            '_blank',
            'noopener,noreferrer',
        );

        open.mockRestore();
    });

    test('opens the public explorer for public wallets with noopener/noreferrer', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        walletState.network = 'PUBLIC';

        renderDropdown();

        screen.getByRole('menuitem', { name: /view on stellar explorer/i }).click();
        expect(open).toHaveBeenCalledWith(
            `https://stellar.expert/explorer/public/account/${walletState.address}`,
            '_blank',
            'noopener,noreferrer',
        );

        open.mockRestore();
    });

    test('falls back to testnet explorer when network is missing', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        walletState.network = null as unknown as WalletNetwork;

        renderDropdown();

        screen.getByRole('menuitem', { name: /view on stellar explorer/i }).click();
        expect(open).toHaveBeenCalledWith(
            `https://stellar.expert/explorer/testnet/account/${walletState.address}`,
            '_blank',
            'noopener,noreferrer',
        );

        open.mockRestore();
    });

    test('nulls the opener property on the returned window', () => {
        const mockWindow = { opener: {} as unknown } as Window;
        const open = vi.spyOn(window, 'open').mockReturnValue(mockWindow);

        renderDropdown();
        screen.getByRole('menuitem', { name: /view on stellar explorer/i }).click();

        expect(mockWindow.opener).toBeNull();
        open.mockRestore();
    });

    test('does not open an explorer when the address is missing', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        walletState.address = null as unknown as string;

        const { container } = renderDropdown();

        expect(container).toBeEmptyDOMElement();
        expect(open).not.toHaveBeenCalled();

        open.mockRestore();
    });
});

function resetWalletState() {
    walletState.address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
    walletState.balance = '12.0000000';
    walletState.balanceStatus = 'success';
    walletState.balanceError = null;
    walletState.network = 'TESTNET';
    walletState.disconnect.mockReset();
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    vi.useRealTimers();
}

describe('WalletDropdown clipboard timing boundaries', () => {
    beforeEach(resetWalletState);

    test('a repeat copy owns the confirmation window (no early reset)', async () => {
        vi.useFakeTimers();
        const writeText = vi.fn().mockResolvedValue(undefined);
        mockClipboard(writeText);

        renderDropdown();

        await act(async () => {
            screen.getByTitle('Copy Address').click();
            await Promise.resolve();
        });

        // Second copy 1.5s later must restart the 2s window.
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        await act(async () => {
            screen.getByTitle('Copy Address').click();
            await Promise.resolve();
        });

        // 2.1s after the first copy, 0.6s after the second: still copied.
        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(screen.getByLabelText('check-icon')).toBeInTheDocument();

        // 2s after the second copy the confirmation resets exactly once.
        act(() => {
            vi.advanceTimersByTime(1400);
        });
        expect(screen.queryByLabelText('check-icon')).not.toBeInTheDocument();
        expect(screen.getByLabelText('copy-icon')).toBeInTheDocument();
        expect(writeText).toHaveBeenCalledTimes(2);
    });

    test('clears the pending confirmation timer on unmount', async () => {
        vi.useFakeTimers();
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
        const writeText = vi.fn().mockResolvedValue(undefined);
        mockClipboard(writeText);

        const { unmount } = renderDropdown();

        await act(async () => {
            screen.getByTitle('Copy Address').click();
            await Promise.resolve();
        });
        expect(screen.getByLabelText('check-icon')).toBeInTheDocument();

        const pending = writeText.mock.calls.length;
        unmount();

        expect(clearTimeoutSpy).toHaveBeenCalled();
        // Advancing past the confirmation window after teardown is a no-op.
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(writeText).toHaveBeenCalledTimes(pending);
        clearTimeoutSpy.mockRestore();
    });

    test('reports a diagnosable, retryable error when the clipboard API is unavailable', async () => {
        setClipboard(undefined);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        renderDropdown();

        await act(async () => {
            screen.getByTitle('Copy Address').click();
            await Promise.resolve();
        });

        expect(error).toHaveBeenCalledWith(
            'Clipboard API unavailable; cannot copy wallet address',
        );
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Could not copy the wallet address. Please try again.',
        );
        expect(screen.queryByLabelText('check-icon')).not.toBeInTheDocument();

        // Recovery: clipboard becomes available again and the retry succeeds.
        const writeText = vi.fn().mockResolvedValue(undefined);
        mockClipboard(writeText);
        await act(async () => {
            screen.getByTitle('Copy Address').click();
            await Promise.resolve();
        });

        expect(writeText).toHaveBeenCalledWith(walletState.address);
        expect(screen.getByLabelText('check-icon')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        error.mockRestore();
    });
});

describe('WalletDropdown disconnect transitions', () => {
    beforeEach(resetWalletState);

    test('ignores duplicate disconnect clicks', () => {
        const { onClose } = renderDropdown();
        const disconnectItem = screen.getByRole('menuitem', { name: /disconnect/i });

        fireEvent.click(disconnectItem);
        fireEvent.click(disconnectItem);

        expect(walletState.disconnect).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('keeps the menu open with a visible error when disconnect fails, then retries', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        walletState.disconnect.mockImplementationOnce(() => {
            throw new Error('storage blocked');
        });

        const { onClose } = renderDropdown();
        const disconnectItem = screen.getByRole('menuitem', { name: /disconnect/i });

        fireEvent.click(disconnectItem);

        expect(walletState.disconnect).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Could not disconnect the wallet. Please try again.',
        );
        expect(error).toHaveBeenCalledWith(
            'Wallet disconnect failed',
            expect.any(Error),
        );
        // The failure log must not leak the wallet address.
        const loggedError = error.mock.calls[0][1] as Error;
        expect(loggedError.message).not.toContain(walletState.address);

        fireEvent.click(disconnectItem);

        expect(walletState.disconnect).toHaveBeenCalledTimes(2);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        error.mockRestore();
    });
});

describe('WalletDropdown keyboard and focus lifecycle', () => {
    beforeEach(resetWalletState);

    test('closes on Escape while connected and stops listening after unmount', () => {
        const { onClose, unmount } = renderDropdown();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        unmount();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('does not intercept Escape while hidden behind a missing address', () => {
        walletState.address = '' as unknown as string;

        const { onClose } = renderDropdown();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    test('restores focus on close only, never when the parent re-renders', async () => {
        const user = userEvent.setup();
        const firstClose = vi.fn();
        const secondClose = vi.fn();

        function Harness({ onClose }: { onClose: () => void }) {
            const [open, setOpen] = useState(false);
            // Inline identity: every parent render produces a new `onClose`.
            const close = () => {
                setOpen(false);
                onClose();
            };
            return (
                <div>
                    <button type="button" onClick={() => setOpen(true)}>
                        open menu
                    </button>
                    <button type="button" onClick={close}>
                        close menu
                    </button>
                    {open && <WalletDropdown onClose={close} onSwitch={() => undefined} />}
                </div>
            );
        }

        const { rerender, getByText } = render(<Harness onClose={firstClose} />);

        await user.click(getByText('open menu'));
        const copyButton = screen.getByTitle('Copy Address');
        copyButton.focus();
        expect(document.activeElement).toBe(copyButton);

        // New `onClose` identity must not steal focus from the open menu.
        rerender(<Harness onClose={secondClose} />);
        expect(document.activeElement).toBe(copyButton);

        // Escape still resolves to the latest `onClose`.
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(secondClose).toHaveBeenCalledTimes(1);
        expect(firstClose).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(getByText('open menu'));
    });
});

describe('WalletDropdown hostile and boundary input', () => {
    beforeEach(resetWalletState);

    test('renders short addresses verbatim instead of manufacturing an ellipsis', () => {
        walletState.address = 'GXYZABC123';

        renderDropdown();

        expect(screen.getByText('GXYZABC123')).toBeInTheDocument();
        expect(screen.queryByText('...')).not.toBeInTheDocument();
    });

    test('renders nothing for an empty-string address', () => {
        walletState.address = '' as unknown as string;

        const { container } = renderDropdown();

        expect(container).toBeEmptyDOMElement();
    });

    test('falls back to "-" for a non-numeric balance', () => {
        walletState.balance = 'NaN; DROP TABLE wallet';

        renderDropdown();

        expect(screen.getByText('-')).toBeInTheDocument();
        expect(screen.queryByText(/DROP TABLE/)).not.toBeInTheDocument();
    });

    test('does not render non-string or blank balance errors', () => {
        walletState.balanceStatus = 'error';
        walletState.balanceError = { secret: 'token' } as unknown as string;

        const { rerender } = renderDropdown();

        expect(screen.getByRole('status')).toHaveTextContent('Balance unavailable');
        expect(screen.getByRole('status').querySelector('small')).toBeNull();
        expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();

        walletState.balanceError = '   ';
        rerender(<WalletDropdown onClose={vi.fn()} onSwitch={vi.fn()} />);
        expect(screen.getByRole('status').querySelector('small')).toBeNull();
    });

    test('blocks explorer navigation and explains it when the address is invalid', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        walletState.address = 'not-a-stellar-address';

        renderDropdown();
        fireEvent.click(screen.getByRole('menuitem', { name: /view on stellar explorer/i }));

        expect(open).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(
            'Explorer link blocked: wallet address is not a valid Stellar address',
        );
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Stellar Explorer is unavailable for this wallet address.',
        );

        open.mockRestore();
        error.mockRestore();
    });
});
