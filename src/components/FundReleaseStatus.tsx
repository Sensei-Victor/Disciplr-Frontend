import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import type { WalletNetwork } from '../context/WalletContext';
import { Text } from './Text';
import { SafeLink } from './SafeLink';
import { getExplorerTxUrl } from '../utils/explorer';
import { truncateMiddle as truncateMiddleCanonical } from '../utils/truncate';
import {
  isPlausibleStellarAddress,
  isValidTxHash,
} from '../utils/vaultState';
import './FundReleaseStatus.css';

export type FundReleaseOutcome = 'released' | 'redirected' | 'pending';

export interface SettlementTransaction {
  hash?: string;
  timestamp?: string;
}

export interface FundReleaseStatusProps {
  outcome: FundReleaseOutcome;
  destinationAddress?: string;
  amount: number;
  currency: string;
  transaction?: SettlementTransaction;
  isLoading?: boolean;
  /** The network the vault contract lives on. When provided alongside the
   *  wallet's network, a mismatch is surfaced instead of silently generating
   *  an explorer link for the wrong network. */
  network?: WalletNetwork;
}

/**
 * Explicit bounds for the fund-release state.
 *
 * - `MAX_AMOUNT` guards against absurd numeric values that would overflow
 *   locale formatting or mislead users.
 * - `MAX_CURRENCY_LENGTH` bounds the currency symbol/name.
 * - `MAX_ADDRESS_LENGTH` and `MAX_HASH_LENGTH` bound the strings we render
 *   and pass to SafeLink / explorer URL builders.
 */
export const MAX_AMOUNT = 1_000_000_000_000; // 1e12
export const MAX_CURRENCY_LENGTH = 16;
export const MAX_ADDRESS_LENGTH = 128;
export const MAX_HASH_LENGTH = 128;

/**
 * Display wrapper around the canonical `truncateMiddle` (utils/truncate) that
 * keeps this component's public contract: missing or non-string values render
 * as 'Unavailable' instead of an empty string.
 */
export function truncateMiddle(value: string, prefixLength = 6, suffixLength = 4): string {
  if (typeof value !== 'string' || value.length === 0) {
    return 'Unavailable';
  }
  return truncateMiddleCanonical(value, prefixLength, suffixLength);
}

function networkLabel(network: WalletNetwork | null | undefined): string {
  return network === 'PUBLIC' ? 'mainnet' : 'testnet';
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return 'Pending confirmation';
  }

  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) {
    return 'Unknown';
  }

  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Currency labels are rendered as plain text next to the amount. Anything that
 *  is not a short alphanumeric symbol is replaced rather than echoed back, so a
 *  hostile or malformed value cannot inject markup-like content. */
function isSafeCurrencyLabel(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{2,64}$/.test(value);
}

function checkInvariants(outcome: FundReleaseOutcome, transaction?: SettlementTransaction): Error | null {
  const hasTx = !!(transaction?.hash || transaction?.timestamp);

  if ((outcome === 'released' || outcome === 'redirected') && !hasTx) {
    return new Error(`Settlement transaction details are required for ${outcome} funds.`);
  }

  if (outcome === 'pending' && hasTx) {
    return new Error(`Pending settlement cannot have transaction details.`);
  }

  return null;
}

const OUTCOME_COPY = {
  released: {
    title: 'Funds released',
    description: 'USDC was released to the success destination.',
    icon: CheckCircle2,
  },
  redirected: {
    title: 'Funds redirected',
    description: 'USDC was redirected to the failure destination.',
    icon: AlertTriangle,
  },
  pending: {
    title: 'Settlement pending',
    description: 'USDC remains locked until validation or deadline settlement completes.',
    icon: Clock3,
  },
} satisfies Record<FundReleaseOutcome, { title: string; description: string; icon: typeof CheckCircle2 }>;

export function FundReleaseStatus({
  outcome,
  destinationAddress,
  amount,
  currency,
  transaction,
  network,
  isLoading,
}: FundReleaseStatusProps) {
  const { network: walletNetwork } = useWallet();

  if (isLoading) {
    return (
      <section
        className="fund-release-status fund-release-status--loading"
        aria-label="Fund settlement status: Loading"
        aria-busy="true"
      >
        <Loader2 size={22} className="animate-spin" aria-hidden="true" />
        <Text role="body" as="span">Loading settlement status...</Text>
      </section>
    );
  }

  // Hard invariant: missing tx for final outcome or tx on pending
  const invariantError = checkInvariants(outcome, transaction);
  if (invariantError) {
    return (
      <div role="alert" className="fund-release-status fund-release-status--error">
        <Text role="title" as="h2">Cannot load settlement status</Text>
        <Text role="body" as="p">{invariantError.message}</Text>
      </div>
    );
  }

  // Soft violations: warn but still render
  const violations: string[] = [];
  if ((outcome === 'released' || outcome === 'redirected') && !destinationAddress) {
    violations.push('final-outcome-missing-destination');
  }
  if (outcome === 'pending' && (destinationAddress || transaction)) {
    violations.push('pending-has-settlement-details');
  }
  if (typeof destinationAddress === 'string' && destinationAddress.length > MAX_ADDRESS_LENGTH) {
    violations.push('destination-overflow');
  }
  if (violations.length > 0) {
    console.warn('[FundReleaseStatus] invariant violation', { outcome, violations });
  }

  const copy = OUTCOME_COPY[outcome] ?? OUTCOME_COPY.pending;
  const Icon = copy.icon;
  const hash = transaction?.hash;
  const validHash = isValidTxHash(hash);
  const explorerNetwork = network ?? walletNetwork;
  const walletNetworkMismatch =
    network !== undefined &&
    walletNetwork !== null &&
    network !== walletNetwork;

  const rawAmount = typeof amount === 'number' && Number.isFinite(amount)
    ? Math.max(0, Math.min(amount, MAX_AMOUNT))
    : 0;
  const displayAmount = rawAmount.toLocaleString();
  const displayCurrency = isSafeCurrencyLabel(currency)
    ? currency.slice(0, MAX_CURRENCY_LENGTH)
    : 'UNKNOWN';
  const safeDestination =
    typeof destinationAddress === 'string' && destinationAddress.length > 0
      ? destinationAddress.slice(0, MAX_ADDRESS_LENGTH)
      : undefined;
  const destinationVerified = isPlausibleStellarAddress(safeDestination);

  return (
    <section
      className={`fund-release-status fund-release-status--${outcome}`}
      aria-label={`Fund settlement status: ${copy.title}`}
    >
      <div className="fund-release-status__header">
        <span
          className={`fund-release-status__icon fund-release-status__icon--${outcome}`}
          aria-hidden="true"
        >
          <Icon size={22} />
        </span>
        <div>
          <Text role="title" as="h2" className="fund-release-status__title">
            {copy.title}
          </Text>
          <Text role="body" as="p" className="fund-release-status__description">
            {copy.description}
          </Text>
        </div>
      </div>

      {outcome === 'pending' ? (
        <>
          <Text role="body" as="p" className="fund-release-status__pending-copy">
            Settlement transaction details will appear after funds are released or redirected.
          </Text>
          <Text role="mono" as="span" className="fund-release-status__value">
            {displayAmount} {displayCurrency}
          </Text>
        </>
      ) : (
        <>
          {walletNetworkMismatch && (
            <p
              className="fund-release-status__network-warning"
              role="status"
              aria-label="Network mismatch notice"
            >
              This settlement belongs to the {networkLabel(network)} contract, but your wallet is
              connected to {networkLabel(walletNetwork)}. Transaction explorer links may not match
              the network your wallet expects.
            </p>
          )}
          <div className="fund-release-status__grid">
            <div className="fund-release-status__field">
              <Text role="caption" as="span" className="fund-release-status__label">
                Destination
              </Text>
              {safeDestination ? (
                <Text
                  role="mono"
                  as="span"
                  className="fund-release-status__value"
                  title={safeDestination}
                  aria-label={`Destination address ${safeDestination}`}
                >
                  {truncateMiddle(safeDestination)}
                  {!destinationVerified && (
                    <span className="fund-release-status__unverified"> (unverified)</span>
                  )}
                </Text>
              ) : (
                <Text role="caption" as="span" className="fund-release-status__label">
                  Not available
                </Text>
              )}
            </div>
            <div className="fund-release-status__field">
              <Text role="caption" as="span" className="fund-release-status__label">
                Amount
              </Text>
              <Text role="mono" as="span" className="fund-release-status__value">
                {displayAmount} {displayCurrency}
              </Text>
            </div>
            <div className="fund-release-status__field">
              <Text role="caption" as="span" className="fund-release-status__label">
                Settled
              </Text>
              <Text role="caption" as="span" className="fund-release-status__value">
                {formatTimestamp(transaction?.timestamp)}
              </Text>
            </div>
            <div className="fund-release-status__field">
              <Text role="caption" as="span" className="fund-release-status__label">
                Transaction
              </Text>
              {validHash && hash ? (
                <SafeLink
                  className="fund-release-status__link"
                  href={explorerUrl(hash, explorerNetwork)}
                  title={hash}
                  aria-label={`View transaction ${hash} on Stellar ${explorerNetwork === 'PUBLIC' ? 'Public' : 'Testnet'} explorer`}
                >
                  {truncateMiddle(hash, 8, 6)}
                </SafeLink>
              ) : hash ? (
                <Text role="caption" as="span" className="fund-release-status__label">
                  Invalid transaction hash
                </Text>
              ) : (
                <Text role="caption" as="span" className="fund-release-status__label">
                  Pending transaction
                </Text>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function explorerUrl(hash: string, network: WalletNetwork | null | undefined): string {
  return getExplorerTxUrl(hash, network ?? null);
}