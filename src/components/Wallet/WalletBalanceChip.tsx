import { useWallet } from '../../context/WalletContext';
import { Skeleton } from '../Skeleton';
import './wallet-balance-chip.css';


export function WalletBalanceChip() {
    const { address, balance, balanceStatus } = useWallet();

    if (!address || balanceStatus === 'idle') return null;

    if (balanceStatus === 'loading') {
        return (
            <div
                className="wallet-balance-chip"
                data-testid="wallet-balance-chip"
                role="status"
                aria-label="Loading balance"
            >
                <Skeleton className="wallet-balance-skeleton" />
            </div>
        );
    }

    if (balanceStatus === 'error') {
        return (
            <div
                className="wallet-balance-chip wallet-balance-chip--error"
                data-testid="wallet-balance-chip"
                role="status"
                aria-label="Balance unavailable"
            >
                <span className="wallet-balance-value">!</span>
                <span className="wallet-balance-currency">USDC</span>
            </div>
        );
    }

    if (balanceStatus === 'no_trustline') {
        return (
            <div
                className="wallet-balance-chip wallet-balance-chip--no-trustline"
                data-testid="wallet-balance-chip"
                title="No USDC trustline on this network"
            >
                <span className="wallet-balance-value">0.00</span>
                <span className="wallet-balance-currency">USDC</span>
            </div>
        );
    }

    // balanceStatus === 'success'
    return (
        <div className="wallet-balance-chip" data-testid="wallet-balance-chip">
            <span className="wallet-balance-value">{balance}</span>
            <span className="wallet-balance-currency">USDC</span>
        </div>
    );
}
