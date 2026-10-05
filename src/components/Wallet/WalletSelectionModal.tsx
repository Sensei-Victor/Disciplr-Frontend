import { useEffect, useRef } from 'react';
import { X, ExternalLink, ShieldCheck } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { Modal } from '../Modal';
import { recordWalletTelemetry } from '../../utils/walletTelemetry';
import freighterLogo from './freighter-logo.svg';
import './wallet.css';

interface WalletSelectionModalProps {
    onClose: () => void;
}

export function WalletSelectionModal({ onClose }: WalletSelectionModalProps) {
    const { connect, isConnecting, error, address } = useWallet();
    const isConnected = address !== null;

    const isMounted = useRef(true);
    const connectPending = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const handleConnect = async () => {
        // Bounded interaction: ignore clicks while a connect attempt is
        // pending so double-clicks never stack Freighter prompts. The
        // WalletContext additionally single-flights connect() itself, so this
        // guard and the context guard together cap concurrent prompts at one.
        if (connectPending.current || isConnecting) {
            recordWalletTelemetry({
                event: 'wallet.connect.ignored',
                ts: Date.now(),
                wallet: 'freighter',
                reason: 'button_pending',
            });
            return;
        }
        connectPending.current = true;
        try {
            const connected = await connect();
            // Only close modal if connection succeeded (connect() returned true).
            // On failed connection attempts (Freighter not installed, user rejects access,
            // network error), leave the modal open so the error message remains visible.
            if (isMounted.current && Boolean(connected)) {
                onClose();
            }
        } catch {
            // Keep modal open so error remains visible if connect() unexpectedly rejects
            return;
        } finally {
            if (isMounted.current) {
                connectPending.current = false;
            }
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            overlayClassName="wallet-modal-overlay"
            contentClassName="wallet-modal-content"
            ariaLabelledBy="wallet-modal-title"
        >
            <div className="wallet-modal-header">
                <h2 id="wallet-modal-title" className="wallet-modal-title">Connect Wallet</h2>
                <button className="wallet-close-btn" onClick={onClose}>
                    <X size={20} />
                </button>
            </div>

            {error && (
                <div className="wallet-error">
                    {error}
                </div>
            )}

            <div className="wallet-list">
                <button
                    className="wallet-option"
                    onClick={handleConnect}
                    disabled={isConnecting}
                >
                    <div className="wallet-option-info">
                        <div className="wallet-icon">
                            <img src={freighterLogo} alt="Freighter logo" />
                        </div>
                        <span className="wallet-name">Freighter</span>
                    </div>
                    <span className="wallet-status">
                        {isConnecting ? <div className="loader" /> : isConnected ? 'Connected' : 'Available'}
                    </span>
                </button>

                {/* Albedo support is not yet implemented */}
                <button
                    className="wallet-option wallet-option-disabled"
                    disabled
                    aria-disabled="true"
                    title="Albedo support is coming soon"
                >
                    <div className="wallet-option-info">
                        <div className="wallet-icon">
                            <ShieldCheck size={20} color="var(--accent)" />
                        </div>
                        <span className="wallet-name">Albedo</span>
                    </div>
                    <span className="wallet-status wallet-coming-soon">Coming soon</span>
                </button>
            </div>

            <div className="wallet-help-section">
                <span className="wallet-help-text">New to Web3?</span>
                <a
                    href="https://stellar.org/learn/wallets-to-store-send-and-receive-lumens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="wallet-help-link"
                >
                    What is a wallet? <ExternalLink size={12} style={{ display: 'inline', marginLeft: '4px' }} />
                </a>
            </div>
        </Modal>
    );
}
