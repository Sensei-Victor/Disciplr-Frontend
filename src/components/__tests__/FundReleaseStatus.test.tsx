import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FundReleaseStatus,
  MAX_AMOUNT,
  truncateMiddle,
} from '../FundReleaseStatus';

let mockNetwork: 'TESTNET' | 'PUBLIC' | null = 'TESTNET';

vi.mock('../../context/WalletContext', () => ({
  useWallet: () => ({
    address: null,
    network: mockNetwork,
    balance: null,
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    checkConnection: vi.fn(),
  }),
}));

describe('truncateMiddle', () => {
  it('truncates long values and leaves short values untouched', () => {
    expect(truncateMiddle('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890')).toBe('GABCDE...7890');
    expect(truncateMiddle('GSHORT')).toBe('GSHORT');
  });
});

describe('FundReleaseStatus', () => {
  beforeEach(() => {
    mockNetwork = 'TESTNET';
  });

  it('renders a released settlement with destination, amount, and testnet explorer link', () => {
    render(
      <FundReleaseStatus
        outcome="released"
        destinationAddress="GSUCCESSDESTINATION1234567890"
        amount={4200.5}
        currency="USDC"
        transaction={{
          hash: 'abcdef1234567890abcdef1234567890',
          timestamp: '2026-06-18T10:30:00Z',
        }}
      />
    );

    expect(screen.getByRole('region', { name: /Fund settlement status: Funds released/i })).toBeInTheDocument();
    expect(screen.getByText('USDC was released to the success destination.')).toBeInTheDocument();
    expect(screen.getByLabelText('Destination address GSUCCESSDESTINATION1234567890')).toHaveTextContent('GSUCCE...7890');
    expect(screen.getByText('4,200.5 USDC')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Stellar Testnet explorer/i })).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/testnet/tx/abcdef1234567890abcdef1234567890'
    );
  });

  it('renders redirected settlement with danger semantics and public explorer link', () => {
    mockNetwork = 'PUBLIC';

    render(
      <FundReleaseStatus
        outcome="redirected"
        destinationAddress="GFAILUREDESTINATION1234567890"
        amount={8800}
        currency="USDC"
        transaction={{
          hash: 'redirecthash1234567890',
          timestamp: '2026-06-18T11:00:00Z',
        }}
      />
    );

    const panel = screen.getByRole('region', { name: /Fund settlement status: Funds redirected/i });
    expect(panel).toHaveClass('fund-release-status--redirected');
    expect(screen.getByText('USDC was redirected to the failure destination.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Stellar Public explorer/i })).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/public/tx/redirecthash1234567890'
    );
  });

  it('renders pending settlement without relying on color alone', () => {
    render(<FundReleaseStatus outcome="pending" amount={12500} currency="USDC" />);

    const panel = screen.getByRole('region', { name: /Fund settlement status: Settlement pending/i });
    expect(panel).toHaveClass('fund-release-status--pending');
    expect(screen.getByText('Settlement pending')).toBeInTheDocument();
    expect(screen.getByText(/Settlement transaction details will appear/)).toBeInTheDocument();
  });

  it('throws invariant error for missing transaction details on released outcome', () => {
    render(
      <FundReleaseStatus
        outcome="released"
        destinationAddress="GSUCCESSDESTINATION1234567890"
        amount={100}
        currency="USDC"
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Cannot load settlement status')).toBeInTheDocument();
    expect(screen.getByText(/Settlement transaction details are required for released funds/)).toBeInTheDocument();
  });

  it('throws invariant error for pending outcome with transaction details', () => {
    render(
      <FundReleaseStatus
        outcome="pending"
        amount={100}
        currency="USDC"
        transaction={{ hash: 'hash', timestamp: 'time' }}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Pending settlement cannot have transaction details/)).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(
      <FundReleaseStatus
        outcome="pending"
        amount={100}
        currency="USDC"
        isLoading
      />
    );

    expect(screen.getByText('Loading settlement status...')).toBeInTheDocument();
  });

  it('handles a missing destination address for final outcomes when transaction exists', () => {
    render(
      <FundReleaseStatus
        outcome="redirected"
        amount={50}
        currency="USDC"
        transaction={{ hash: 'hash', timestamp: 'time' }}
      />
    );

    expect(screen.getByText('Not available')).toBeInTheDocument();
  });

  describe("outcome state accessible labels", () => {
    it("released outcome has accessible region label", () => {
      render(
        <FundReleaseStatus
          outcome="released"
          destinationAddress="GSUCCESSDESTINATION1234567890"
          amount={100}
          currency="XLM"
          transaction={{ hash: 'abc123def4', timestamp: '2026-01-01T00:00:00Z' }}
        />
      );
      expect(screen.getByRole('region', { name: /Fund settlement status/i })).toBeInTheDocument();
    });

    it("redirected outcome has accessible region label", () => {
      render(
        <FundReleaseStatus
          outcome="redirected"
          amount={50}
          currency="XLM"
          transaction={{ hash: 'def456ab12', timestamp: '2026-01-01T00:00:00Z' }}
        />
      );
      expect(screen.getByRole('region', { name: /Fund settlement status/i })).toBeInTheDocument();
    });

    it("pending outcome has accessible region label", () => {
      render(<FundReleaseStatus outcome="pending" amount={200} currency="XLM" />);
      expect(screen.getByRole('region', { name: /Fund settlement status/i })).toBeInTheDocument();
    });

    it("each outcome applies a distinct CSS modifier class", () => {
      const { rerender } = render(<FundReleaseStatus outcome="pending" amount={1} currency="XLM" />);
      expect(document.querySelector('.fund-release-status--pending')).not.toBeNull();

      rerender(
        <FundReleaseStatus
          outcome="released"
          amount={1}
          currency="XLM"
          transaction={{ hash: 'ghi789ab12', timestamp: '2026-01-01T00:00:00Z' }}
        />
      );
      expect(document.querySelector('.fund-release-status--released')).not.toBeNull();

      rerender(
        <FundReleaseStatus
          outcome="redirected"
          amount={1}
          currency="XLM"
          transaction={{ hash: 'jkl012ab12', timestamp: '2026-01-01T00:00:00Z' }}
        />
      );
      expect(document.querySelector('.fund-release-status--redirected')).not.toBeNull();
    });
  });

  describe('bounds and invariants', () => {
    it('caps the amount at MAX_AMOUNT', () => {
      render(
        <FundReleaseStatus
          outcome="pending"
          amount={MAX_AMOUNT + 5000}
          currency="USDC"
        />
      );

      expect(screen.getByText(`${MAX_AMOUNT.toLocaleString()} USDC`)).toBeInTheDocument();
    });

    it('renders zero for a negative or non-finite amount', () => {
      render(<FundReleaseStatus outcome="pending" amount={-100} currency="USDC" />);
      expect(screen.getByText('0 USDC')).toBeInTheDocument();
    });

    it('renders zero for a non-finite amount', () => {
      render(<FundReleaseStatus outcome="pending" amount={NaN} currency="USDC" />);
      expect(screen.getByText('0 USDC')).toBeInTheDocument();
    });

    it('truncates over-long currency strings', () => {
      render(
        <FundReleaseStatus
          outcome="pending"
          amount={100}
          currency={'X'.repeat(40)}
        />
      );

      expect(screen.getByText(`100 ${'X'.repeat(16)}`)).toBeInTheDocument();
    });

    it('logs a warning when a final outcome is missing a destination address', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <FundReleaseStatus
          outcome="released"
          amount={100}
          currency="USDC"
          transaction={{ hash: 'abc123def4', timestamp: '2026-01-01T00:00:00Z' }}
        />
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FundReleaseStatus] invariant violation'),
        expect.objectContaining({
          outcome: 'released',
          violations: expect.arrayContaining(['final-outcome-missing-destination']),
        }),
      );
      warnSpy.mockRestore();
    });

    it('logs a warning when a pending outcome carries settlement details', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <FundReleaseStatus
          outcome="pending"
          amount={100}
          currency="USDC"
          destinationAddress="GSUCCESSDESTINATION1234567890"
        />
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FundReleaseStatus] invariant violation'),
        expect.objectContaining({
          outcome: 'pending',
          violations: expect.arrayContaining(['pending-has-settlement-details']),
        }),
      );
      warnSpy.mockRestore();
    });

    it('logs a warning for an over-long destination address', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <FundReleaseStatus
          outcome="released"
          destinationAddress={'G'.repeat(200)}
          amount={100}
          currency="USDC"
          transaction={{ hash: 'hash123' }}
        />
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FundReleaseStatus] invariant violation'),
        expect.objectContaining({
          violations: expect.arrayContaining(['destination-overflow']),
        }),
      );
      warnSpy.mockRestore();
    });
  });
});

describe('FundReleaseStatus hostile input boundary', () => {
  beforeEach(() => {
    mockNetwork = 'TESTNET';
  });

  it('renders a network mismatch notice when the contract and wallet networks differ', () => {
    render(
      <FundReleaseStatus
        outcome="released"
        destinationAddress="GSUCCESSDESTINATION1234567890"
        amount={100}
        currency="USDC"
        network="PUBLIC"
        transaction={{ hash: 'abcdef1234567890abcdef1234567890' }}
      />
    );

    const notice = screen.getByRole('status', { name: 'Network mismatch notice' });
    expect(notice.textContent).toMatch(/mainnet/);
    expect(notice.textContent).toMatch(/testnet/);
  });

  it('does not surface a network mismatch when contract and wallet networks agree', () => {
    render(
      <FundReleaseStatus
        outcome="released"
        amount={100}
        currency="USDC"
        network="TESTNET"
        transaction={{ hash: 'abcdef1234567890abcdef1234567890' }}
      />
    );

    expect(screen.queryByRole('status', { name: 'Network mismatch notice' })).not.toBeInTheDocument();
  });

  it('uses the contract network (not the wallet network) for the explorer link when provided', () => {
    render(
      <FundReleaseStatus
        outcome="released"
        amount={100}
        currency="USDC"
        network="PUBLIC"
        transaction={{ hash: 'abcdef1234567890abcdef1234567890' }}
      />
    );

    expect(screen.getByRole('link', { name: /Stellar Public explorer/i })).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/public/tx/abcdef1234567890abcdef1234567890'
    );
  });

  it('falls back to the wallet network when no contract network is provided', () => {
    mockNetwork = 'TESTNET';

    render(
      <FundReleaseStatus
        outcome="released"
        amount={100}
        currency="USDC"
        transaction={{ hash: 'abcdef1234567890abcdef1234567890' }}
      />
    );

    expect(screen.getByRole('link', { name: /Stellar Testnet explorer/i })).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/testnet/tx/abcdef1234567890abcdef1234567890'
    );
  });

  it('refuses to build an explorer link for a hostile transaction hash', () => {
    render(
      <FundReleaseStatus
        outcome="released"
        amount={100}
        currency="USDC"
        transaction={{ hash: 'javascript:alert(1)' }}
      />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Invalid transaction hash')).toBeInTheDocument();
  });

  it('surfaces an unverified marker for an implausible destination address', () => {
    render(
      <FundReleaseStatus
        outcome="redirected"
        destinationAddress="https://evil.example/steal"
        amount={100}
        currency="USDC"
        transaction={{ hash: 'abc123', timestamp: '2026-01-01T00:00:00Z' }}
      />
    );

    expect(screen.getByText(/unverified/)).toBeInTheDocument();
    expect(screen.queryByText('Not available')).not.toBeInTheDocument();
  });

  it('renders an unavailable amount for hostile numeric input', () => {
    render(
      <FundReleaseStatus
        outcome="released"
        amount={Number.NaN}
        currency="USDC"
        transaction={{ hash: 'abcdef1234567890abcdef1234567890' }}
      />
    );

    expect(screen.getByText(/0 USDC/)).toBeInTheDocument();
  });

  it('renders an unknown currency symbol for hostile currency input', () => {
    render(
      <FundReleaseStatus
        outcome="released"
        amount={100}
        currency="US$; DROP TABLE vaults"
        transaction={{ hash: 'abcdef1234567890abcdef1234567890' }}
      />
    );

    expect(screen.getByText((content) => content.includes('100') && content.includes('UNKNOWN'))).toBeInTheDocument();
  });

  it("renders 'Unknown' for an unparseable settlement timestamp", () => {
    render(
      <FundReleaseStatus
        outcome="released"
        amount={100}
        currency="USDC"
        transaction={{ hash: 'abcdef1234567890abcdef1234567890', timestamp: 'gibberish' }}
      />
    );

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText('Pending confirmation')).not.toBeInTheDocument();
  });

  it('truncates a hostile non-string destination safely', () => {
    render(
      <FundReleaseStatus outcome="released" amount={100} currency="USDC" />
    );

    expect(truncateMiddle(undefined as never)).toBe('Unavailable');
  });
});
