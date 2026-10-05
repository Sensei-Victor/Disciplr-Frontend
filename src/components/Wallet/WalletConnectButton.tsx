import { useState, useRef, useEffect } from 'react';
import { useWallet } from '../../context/WalletContext';
import { Wallet, Loader2, AlertCircle } from 'lucide-react';
import './wallet.css';
import { WalletDropdown } from './WalletDropdown';
import { networkLabel } from '../../utils/explorer';
import { truncateMiddle } from '../../utils/truncate';
import { WalletSelectionModal } from './WalletSelectionModal';
import { logger } from '../../utils/logger';

export function WalletConnectButton() {
    const { address, network, isConnecting, error } = useWallet();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Telemetry: Expose structured diagnostics for failures
    useEffect(() => {
        if (error) {
            logger.error('Wallet connection error encountered in UI state', {
                timestamp: new Date().toISOString(),
                hasAddress: !!address,
                network,
                error
            });
        }
    }, [error, address, network]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (error && !address) {
        return (
            <div className="wallet-dropdown-container">
                <button
                    className="wallet-connect-btn error"
                    onClick={() => setIsModalOpen(true)}
                    title={error}
                >
                    <AlertCircle size={16} />
                    <span>Connection Failed</span>
                </button>
                {isModalOpen && (
                    <WalletSelectionModal onClose={() => setIsModalOpen(false)} />
                )}
            </div>
        );
    }

    if (isConnecting && !address) {
        return (
            <button className="wallet-connect-btn connecting" disabled>
                <Loader2 size={16} className="animate-spin" />
                <span>Connecting...</span>
            </button>
        );
    }

    return (
        <>
            {address ? (
                <div className="wallet-dropdown-container" ref={dropdownRef}>
                    <button
                        className="wallet-connect-btn connected"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                        <Wallet size={16} />
                        <span>{truncateMiddle(address, 4, 4)}</span>
                        {network && (
                            <span className="wallet-network-badge">
                                {networkLabel(network)}
                            </span>
                        )}
                    </button>

                    {isDropdownOpen && (
                        <WalletDropdown onClose={() => setIsDropdownOpen(false)} onSwitch={() => {
                            setIsDropdownOpen(false);
                            setIsModalOpen(true);
                        }} />
                    )}
                </div>
            ) : (
                <button
                    className="wallet-connect-btn"
                    onClick={() => setIsModalOpen(true)}
                >
                    <Wallet size={16} />
                    Connect Wallet
                </button>
            )}

            {isModalOpen && (
                <WalletSelectionModal onClose={() => setIsModalOpen(false)} />
            )}
        </>
    );
}
