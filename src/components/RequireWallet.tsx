import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { WalletConnectButton } from './Wallet/WalletConnectButton';

interface RequireWalletProps {
  children: ReactNode;
}

/**
 * Invariants:
 * - Authorization is granted iff a non-empty wallet address is present.
 * - When authorized, the original destination (pathname + search) is restored exactly once.
 * - When unauthorized, children are never mounted and no destination redirect occurs.
 * - Repeated address changes must not cause repeated or stale redirects.
 * - Concurrent/rapid renders must not produce divergent navigation behavior.
 */
export default function RequireWallet({ children }: RequireWalletProps) {
  const { address, isConnecting } = useWallet();
  const location = useLocation();
  const navigate = useNavigate();

  // Normalize the address so whitespace-only or empty strings are treated as unauthorized.
  const normalizedAddress = useMemo(() => {
    if (typeof address !== 'string') return null;
    const trimmed = address.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [address]);

  // Capture the destination once per mount. This ensures that later location
  // changes (e.g. redirects from connect flows) do not overwrite the intended
  // destination.
  const destinationRef = useRef(location.pathname + location.search);

  // Guard against duplicate navigation caused by strict-mode double invocation
  // or rapid re-renders while the address remains connected.
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (!normalizedAddress) {
      // Reset the guard when authorization is lost so a future connect can
      // restore the destination again.
      hasNavigatedRef.current = false;
      return;
    }
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    navigate(destinationRef.current, { replace: true });
  }, [normalizedAddress, navigate]);

  if (normalizedAddress) return <>{children}</>;

  return (
    <div
      role="main"
      aria-labelledby="connect-wallet-heading"
      style={{ textAlign: 'center', padding: '4rem 1rem' }}
    >
      <h1 id="connect-wallet-heading">Connect your wallet</h1>
      <p>You need a connected wallet to access this page.</p>
      {isConnecting && <p aria-live="polite">Connecting…</p>}
      <WalletConnectButton />
    </div>
  );
}
