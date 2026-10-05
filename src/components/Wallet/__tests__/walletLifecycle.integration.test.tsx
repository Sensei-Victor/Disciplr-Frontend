import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WalletProvider, useWallet } from '../../../context/WalletContext';
import { WalletConnectButton } from '../WalletConnectButton';
import { USDC_ISSUERS } from '../../../utils/horizon';

const freighterMocks = vi.hoisted(() => ({
    isAllowed: vi.fn(),
    setAllowed: vi.fn(),
    requestAccess: vi.fn(),
    getAddress: vi.fn(),
    getNetworkDetails: vi.fn(),
}));

vi.mock('@stellar/freighter-api', () => freighterMocks);

function mockResponse(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn().mockResolvedValue(body),
    } as unknown as Response;
}

function ErrorProbe() {
    const { error } = useWallet();
    return error ? <div data-testid="wallet-error">{error}</div> : null;
}

function renderWalletTree() {
    return render(
        <WalletProvider>
            <ErrorProbe />
            <WalletConnectButton />
        </WalletProvider>,
    );
}

describe('Wallet lifecycle integration', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
        // A prior test's disconnect() persists WALLET_DISCONNECTED_KEY in
        // localStorage, which would otherwise make checkConnection() skip
        // auto-reconnect on the next test's mount.
        localStorage.clear();
        freighterMocks.isAllowed.mockResolvedValue({ isAllowed: false });
        freighterMocks.setAllowed.mockResolvedValue(undefined);
        freighterMocks.requestAccess.mockResolvedValue(true);
        freighterMocks.getAddress.mockResolvedValue({ address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890', error: null });
        freighterMocks.getNetworkDetails.mockResolvedValue({ network: 'TESTNET' });
        globalThis.fetch = vi.fn();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    test('shows connect button before wallet is connected', () => {
        renderWalletTree();

        expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
        expect(screen.queryByText('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890')).not.toBeInTheDocument();
    });

    test('connects wallet, loads balance, and shows dropdown with address and balance', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(
            mockResponse(200, {
                balances: [
                    {
                        asset_type: 'credit_alphanum4',
                        asset_code: 'USDC',
                        asset_issuer: USDC_ISSUERS.TESTNET,
                        balance: '12.5000000',
                    },
                ],
            }),
        );

        renderWalletTree();

        fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));

        expect(await screen.findByText('Freighter')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Freighter'));

        await waitFor(() => expect(screen.getByRole('button', { name: /gabc/i })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /gabc/i }));

        expect(await screen.findByText('12.5000000')).toBeInTheDocument();
        expect(screen.getByText('USDC')).toBeInTheDocument();

        const truncatedAddress = 'GABC...7890';
        expect(screen.getByText(truncatedAddress)).toBeInTheDocument();

        expect(screen.queryByRole('button', { name: /connect wallet/i })).not.toBeInTheDocument();
    });

    test('shows isConnecting state during connection', async () => {
        let resolveRequestAccess: (value: boolean) => void = () => undefined;
        freighterMocks.requestAccess.mockImplementation(
            () =>
                new Promise<boolean>((resolve) => {
                    resolveRequestAccess = resolve;
                }),
        );

        vi.mocked(globalThis.fetch).mockResolvedValue(
            mockResponse(200, {
                balances: [
                    {
                        asset_type: 'credit_alphanum4',
                        asset_code: 'USDC',
                        asset_issuer: USDC_ISSUERS.TESTNET,
                        balance: '5.0000000',
                    },
                ],
            }),
        );

        renderWalletTree();

        fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
        fireEvent.click(await screen.findByText('Freighter'));

        // After clicking Freighter, the component enters connecting state —
        // the modal is replaced by a disabled "Connecting…" button.
        const connectingBtn = await screen.findByRole('button', { name: /connecting/i });
        expect(connectingBtn).toBeDisabled();

        resolveRequestAccess(true);

        await waitFor(() => expect(screen.getByRole('button', { name: /gabc/i })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /gabc/i }));

        expect(await screen.findByText('5.0000000')).toBeInTheDocument();
    });

    test('shows no_trustline state when fetchUsdcBalance returns no trustline', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(
            mockResponse(200, {
                balances: [{ asset_type: 'native', balance: '10.0000000' }],
            }),
        );

        renderWalletTree();

        fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
        fireEvent.click(await screen.findByText('Freighter'));

        await waitFor(() => expect(screen.getByRole('button', { name: /gabc/i })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /gabc/i }));

        expect(await screen.findByText('0.00')).toBeInTheDocument();
        expect(screen.getByText('No USDC trustline on this network')).toBeInTheDocument();
    });

    test('shows error state when fetchUsdcBalance rejects', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse(500, {}));

        renderWalletTree();

        fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
        fireEvent.click(await screen.findByText('Freighter'));

        await waitFor(() => expect(screen.getByRole('button', { name: /gabc/i })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /gabc/i }));

        expect(await screen.findByText('Balance unavailable')).toBeInTheDocument();

        consoleError.mockRestore();
    });

    test('shows error state when freighter denies access', async () => {
        freighterMocks.requestAccess.mockResolvedValue(false);

        renderWalletTree();

        fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
        fireEvent.click(await screen.findByText('Freighter'));

        expect(await screen.findByTestId('wallet-error')).toHaveTextContent('Wallet access denied.');
        expect(await screen.findByRole('button', { name: /connection failed/i })).toBeInTheDocument();
    });

    test('disconnect resets address and balance to null', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(
            mockResponse(200, {
                balances: [
                    {
                        asset_type: 'credit_alphanum4',
                        asset_code: 'USDC',
                        asset_issuer: USDC_ISSUERS.TESTNET,
                        balance: '12.5000000',
                    },
                ],
            }),
        );

        renderWalletTree();

        fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
        fireEvent.click(await screen.findByText('Freighter'));

        await waitFor(() => expect(screen.getByRole('button', { name: /gabc/i })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /gabc/i }));

        expect(await screen.findByText('12.5000000')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('menuitem', { name: /disconnect/i }));

        expect(await screen.findByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
        expect(screen.queryByText('12.5000000')).not.toBeInTheDocument();
    });
});
