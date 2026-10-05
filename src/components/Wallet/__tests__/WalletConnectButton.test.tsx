import { vi, describe, beforeEach, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WalletConnectButton } from '../WalletConnectButton';

// 1. Mock context
const walletState = vi.hoisted(() => ({
    address: null as string | null,
    network: null as string | null,
    isConnecting: false,
    error: null as string | null,
}));

vi.mock('../../../context/WalletContext', () => ({
    useWallet: () => walletState,
}));

// 2. Mock logger
const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
}));

vi.mock('../../../utils/logger', () => ({
    logger: mockLogger,
}));

// 3. Mock WalletSelectionModal and WalletDropdown to simplify DOM
vi.mock('../WalletSelectionModal', () => ({
    WalletSelectionModal: ({ onClose }: { onClose: () => void }) => (
        <div data-testid="wallet-selection-modal">
            <button data-testid="close-modal" onClick={onClose}>Close Modal</button>
        </div>
    ),
}));

vi.mock('../WalletDropdown', () => ({
    WalletDropdown: ({ onClose, onSwitch }: { onClose: () => void, onSwitch: () => void }) => (
        <div data-testid="wallet-dropdown">
            <button data-testid="close-dropdown" onClick={onClose}>Close Dropdown</button>
            <button data-testid="switch-wallet" onClick={onSwitch}>Switch</button>
        </div>
    ),
}));

describe('WalletConnectButton', () => {
    beforeEach(() => {
        walletState.address = null;
        walletState.network = null;
        walletState.isConnecting = false;
        walletState.error = null;
        mockLogger.error.mockClear();
    });

    test('renders initial disconnected state correctly', () => {
        render(<WalletConnectButton />);
        const btn = screen.getByText('Connect Wallet').closest('button');
        expect(btn).toBeInTheDocument();
        expect(btn).not.toHaveClass('connected');
        expect(btn).not.toHaveClass('error');
    });

    test('opens modal when clicking Connect Wallet', () => {
        render(<WalletConnectButton />);
        fireEvent.click(screen.getByText('Connect Wallet'));
        expect(screen.getByTestId('wallet-selection-modal')).toBeInTheDocument();
    });

    test('renders connecting state correctly', () => {
        walletState.isConnecting = true;
        render(<WalletConnectButton />);
        const btn = screen.getByText('Connecting...').closest('button');
        expect(btn).toBeInTheDocument();
        expect(btn).toBeDisabled();
        expect(btn).toHaveClass('connecting');
    });

    test('renders error state correctly and logs telemetry', () => {
        walletState.error = 'Failed to connect';
        render(<WalletConnectButton />);
        
        const btn = screen.getByText('Connection Failed').closest('button');
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveClass('error');
        expect(btn).toHaveAttribute('title', 'Failed to connect');

        // Logs error on mount
        expect(mockLogger.error).toHaveBeenCalledWith('Wallet connection error encountered in UI state', expect.objectContaining({
            hasAddress: false,
            error: 'Failed to connect'
        }));
    });

    test('opens modal when clicking error button', () => {
        walletState.error = 'Failed to connect';
        render(<WalletConnectButton />);
        fireEvent.click(screen.getByText('Connection Failed'));
        expect(screen.getByTestId('wallet-selection-modal')).toBeInTheDocument();
    });

    test('renders connected state correctly (truncates address)', () => {
        walletState.address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ12345';
        walletState.network = 'TESTNET';
        render(<WalletConnectButton />);
        
        const btn = screen.getByText('GABC...2345').closest('button');
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveClass('connected');
        expect(screen.getByText('Testnet')).toBeInTheDocument();
    });

    test('handles very short address safely (boundary case)', () => {
        walletState.address = 'ABC';
        render(<WalletConnectButton />);
        expect(screen.getByText('ABC')).toBeInTheDocument();
    });

    test('renders connected state even if there is an error (partial failure)', () => {
        // If address is present but an error occurs (e.g. background polling fails),
        // we should still display the connected state, not "Connection Failed".
        walletState.address = 'GABCD1234567890XYZ';
        walletState.error = 'Failed to fetch balance';
        render(<WalletConnectButton />);
        
        expect(screen.getByText('GABC...0XYZ')).toBeInTheDocument();
        expect(screen.queryByText('Connection Failed')).not.toBeInTheDocument();

        // But we should still log the error
        expect(mockLogger.error).toHaveBeenCalledWith('Wallet connection error encountered in UI state', expect.objectContaining({
            hasAddress: true,
            error: 'Failed to fetch balance'
        }));
    });

    test('opens and closes dropdown', () => {
        walletState.address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ12345';
        render(<WalletConnectButton />);
        
        const btn = screen.getByText('GABC...2345').closest('button')!;
        
        // Open
        fireEvent.click(btn);
        expect(screen.getByTestId('wallet-dropdown')).toBeInTheDocument();
        
        // Close via dropdown callback
        fireEvent.click(screen.getByTestId('close-dropdown'));
        expect(screen.queryByTestId('wallet-dropdown')).not.toBeInTheDocument();
    });

    test('closes dropdown when clicking outside', () => {
        walletState.address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ12345';
        render(<WalletConnectButton />);
        
        // Open
        fireEvent.click(screen.getByText('GABC...2345').closest('button')!);
        expect(screen.getByTestId('wallet-dropdown')).toBeInTheDocument();
        
        // Click outside
        fireEvent.mouseDown(document.body);
        expect(screen.queryByTestId('wallet-dropdown')).not.toBeInTheDocument();
    });

    test('switches wallet from dropdown', () => {
        walletState.address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ12345';
        render(<WalletConnectButton />);
        
        // Open
        fireEvent.click(screen.getByText('GABC...2345').closest('button')!);
        
        // Click switch
        fireEvent.click(screen.getByTestId('switch-wallet'));
        
        // Dropdown should close, modal should open
        expect(screen.queryByTestId('wallet-dropdown')).not.toBeInTheDocument();
        expect(screen.getByTestId('wallet-selection-modal')).toBeInTheDocument();
    });
});
