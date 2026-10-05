import { vi, describe, beforeEach, test, expect } from 'vitest';

const walletState = vi.hoisted(() => ({
    connect: vi.fn(),
    isConnecting: false,
    error: null as string | null,
}));

vi.mock('@/context/WalletContext', () => ({
    useWallet: () => walletState,
}));

const telemetryMocks = vi.hoisted(() => ({
    recordWalletTelemetry: vi.fn(),
}));

vi.mock('../../../utils/walletTelemetry', () => ({
    recordWalletTelemetry: telemetryMocks.recordWalletTelemetry,
}));

import { act, render, screen, fireEvent } from '@testing-library/react';
import { WalletSelectionModal } from '../WalletSelectionModal';

function renderModal(onClose = vi.fn()) {
    return { onClose, ...render(<WalletSelectionModal onClose={onClose} />) };
}

describe('WalletSelectionModal', () => {
    beforeEach(() => {
        walletState.connect = vi.fn().mockResolvedValue(true);
        walletState.isConnecting = false;
        walletState.error = null;
        telemetryMocks.recordWalletTelemetry.mockClear();
    });

    test('renders the title and Freighter option', () => {
        renderModal();
        expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
        expect(screen.getByText('Freighter')).toBeInTheDocument();
    });

    test('calls connect then onClose when Freighter button is clicked', async () => {
        const { onClose } = renderModal();

        await act(async () => {
            screen.getByText('Freighter').closest('button')!.click();
        });

        expect(walletState.connect).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('disables the button and shows loader while isConnecting', () => {
        walletState.isConnecting = true;
        renderModal();

        const btn = screen.getByText('Freighter').closest('button')!;
        expect(btn).toBeDisabled();
        expect(btn.querySelector('.loader')).toBeInTheDocument();
    });

    test('renders context error message', () => {
        walletState.error = 'Wallet access denied.';
        renderModal();
        expect(screen.getByText('Wallet access denied.')).toBeInTheDocument();
    });

    test('calls onClose when the X button is clicked', () => {
        const { onClose } = renderModal();
        const closeBtn = document.querySelector('.wallet-close-btn') as HTMLElement;
        closeBtn.click();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('calls onClose when the backdrop overlay is clicked', () => {
        const { onClose } = renderModal();
        const overlay = document.querySelector('.wallet-modal-overlay') as HTMLElement;
        fireEvent.click(overlay);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('does not call onClose when the modal content area is clicked', () => {
        const { onClose } = renderModal();
        const content = document.querySelector('.wallet-modal-content') as HTMLElement;
        fireEvent.click(content);
        expect(onClose).not.toHaveBeenCalled();
    });

    test('does not crash when wallet is already connected', () => {
        expect(() => renderModal()).not.toThrow();
    });

    test('does not call onClose and shows error after connect rejection', async () => {
        walletState.connect.mockImplementation(() => {
            walletState.error = 'Failed to connect wallet. Make sure Freighter is installed and unlocked.';
            return Promise.resolve(false);
        });
        const onClose = vi.fn();
        const { rerender } = render(<WalletSelectionModal onClose={onClose} />);

        await act(async () => {
            screen.getByText('Freighter').closest('button')!.click();
        });

        expect(onClose).not.toHaveBeenCalled();
        rerender(<WalletSelectionModal onClose={onClose} />);
        expect(screen.getByText('Failed to connect wallet. Make sure Freighter is installed and unlocked.')).toBeInTheDocument();
    });

    test('does not call onClose and shows error on access denied', async () => {
        walletState.connect.mockImplementation(() => {
            walletState.error = 'Wallet access denied.';
            return Promise.resolve(false);
        });
        const onClose = vi.fn();
        const { rerender } = render(<WalletSelectionModal onClose={onClose} />);

        await act(async () => {
            screen.getByText('Freighter').closest('button')!.click();
        });

        expect(onClose).not.toHaveBeenCalled();
        rerender(<WalletSelectionModal onClose={onClose} />);
        expect(screen.getByText('Wallet access denied.')).toBeInTheDocument();
    });

    test('does not call onClose and shows error when network error occurs', async () => {
        walletState.connect.mockImplementation(() => {
            walletState.error = 'Network error connecting to wallet.';
            return Promise.resolve(false);
        });
        const onClose = vi.fn();
        const { rerender } = render(<WalletSelectionModal onClose={onClose} />);

        await act(async () => {
            screen.getByText('Freighter').closest('button')!.click();
        });

        expect(onClose).not.toHaveBeenCalled();
        rerender(<WalletSelectionModal onClose={onClose} />);
        expect(screen.getByText('Network error connecting to wallet.')).toBeInTheDocument();
    });

    test('does not call onClose if connect throws an unexpected error', async () => {
        walletState.connect.mockRejectedValue(new Error('Unexpected wallet failure'));
        const onClose = vi.fn();
        render(<WalletSelectionModal onClose={onClose} />);

        await act(async () => {
            screen.getByText('Freighter').closest('button')!.click();
        });

        expect(onClose).not.toHaveBeenCalled();
    });

    test('prevents multiple connect calls on double click', async () => {
        let resolveConnect: (value: boolean) => void;
        walletState.connect.mockImplementation(() => new Promise((resolve) => {
            resolveConnect = resolve;
        }));
        const { onClose } = renderModal();

        const btn = screen.getByText('Freighter').closest('button')!;
        
        await act(async () => {
            btn.click();
            btn.click();
            btn.click();
        });

        expect(walletState.connect).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveConnect(true);
        });
        
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('records an ignored telemetry event when a second click arrives while pending', async () => {
        let resolveConnect: (value: boolean) => void;
        walletState.connect.mockImplementation(() => new Promise((resolve) => {
            resolveConnect = resolve;
        }));
        renderModal();

        const btn = screen.getByText('Freighter').closest('button')!;

        await act(async () => {
            btn.click();
            btn.click();
        });

        expect(walletState.connect).toHaveBeenCalledTimes(1);
        expect(telemetryMocks.recordWalletTelemetry).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'wallet.connect.ignored', reason: 'button_pending' }),
        );

        await act(async () => {
            resolveConnect(true);
        });
    });

    test('does not call onClose if unmounted before connect resolves', async () => {
        let resolveConnect: (value: boolean) => void;
        walletState.connect.mockImplementation(() => new Promise((resolve) => {
            resolveConnect = resolve;
        }));
        
        const onClose = vi.fn();
        const { unmount } = render(<WalletSelectionModal onClose={onClose} />);
        
        const btn = screen.getByText('Freighter').closest('button')!;
        
        await act(async () => {
            btn.click();
        });

        unmount();

        await act(async () => {
            resolveConnect(true);
        });

        expect(onClose).not.toHaveBeenCalled();
    });
});
