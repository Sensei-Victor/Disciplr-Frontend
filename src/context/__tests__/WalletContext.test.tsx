import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CONNECT_TIMEOUT_MS, WalletProvider, useWallet } from '../WalletContext';
import { USDC_ISSUERS } from '../../utils/horizon';

const freighterMocks = vi.hoisted(() => ({
    isAllowed: vi.fn(),
    setAllowed: vi.fn(),
    requestAccess: vi.fn(),
    getAddress: vi.fn(),
    getNetworkDetails: vi.fn(),
}));

vi.mock('@stellar/freighter-api', () => freighterMocks);

const telemetryMock = vi.hoisted(() => ({
    recordWalletTelemetry: vi.fn(),
}));

vi.mock('../../utils/walletTelemetry', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/walletTelemetry')>();
    return { ...actual, recordWalletTelemetry: telemetryMock.recordWalletTelemetry };
});

function mockResponse(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn().mockResolvedValue(body),
    } as unknown as Response;
}

function WalletProbe() {
    const wallet = useWallet();

    return (
        <div>
            <button type="button" onClick={wallet.connect}>
                Connect
            </button>
            <button type="button" onClick={wallet.disconnect}>
                Disconnect
            </button>
            <div data-testid="address">{wallet.address ?? ''}</div>
            <div data-testid="network">{wallet.network ?? ''}</div>
            <div data-testid="balance">{wallet.balance ?? ''}</div>
            <div data-testid="balanceStatus">{wallet.balanceStatus}</div>
            <div data-testid="balanceError">{wallet.balanceError ?? ''}</div>
            <div data-testid="connectionError">{wallet.error ?? ''}</div>
            <div data-testid="isConnecting">{String(wallet.isConnecting)}</div>
        </div>
    );
}

function UnsafeProbe() {
    useWallet();
    return null;
}

function renderWallet() {
    return render(
        <WalletProvider>
            <WalletProbe />
        </WalletProvider>,
    );
}

describe('WalletContext Horizon USDC balance path', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.resetAllMocks();
        freighterMocks.isAllowed.mockResolvedValue({ isAllowed: false });
        freighterMocks.setAllowed.mockResolvedValue(undefined);
        freighterMocks.requestAccess.mockResolvedValue(true);
        freighterMocks.getAddress.mockResolvedValue({ address: 'GCONNECTED', error: null });
        freighterMocks.getNetworkDetails.mockResolvedValue({ network: 'TESTNET' });
        globalThis.fetch = vi.fn();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    test('loads the real USDC balance after connecting', async () => {
        let resolveFetch: (value: Response) => void = () => undefined;
        vi.mocked(globalThis.fetch).mockReturnValue(
            new Promise<Response>((resolve) => {
                resolveFetch = resolve;
            }),
        );

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('loading'));

        resolveFetch(
            mockResponse(200, {
                balances: [
                    {
                        asset_type: 'credit_alphanum4',
                        asset_code: 'USDC',
                        asset_issuer: USDC_ISSUERS.TESTNET,
                        balance: '42.2500000',
                    },
                ],
            }),
        );

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('success'));
        expect(screen.getByTestId('address')).toHaveTextContent('GCONNECTED');
        expect(screen.getByTestId('network')).toHaveTextContent('TESTNET');
        expect(screen.getByTestId('balance')).toHaveTextContent('42.2500000');
        expect(globalThis.fetch).toHaveBeenCalledWith('https://horizon-testnet.stellar.org/accounts/GCONNECTED', expect.any(Object));
    });

    test('marks no-trustline when a connected public account has no Circle USDC balance line', async () => {
        freighterMocks.isAllowed.mockResolvedValue({ isAllowed: true });
        freighterMocks.getNetworkDetails.mockResolvedValue({ network: 'PUBLIC' });
        vi.mocked(globalThis.fetch).mockResolvedValue(
            mockResponse(200, {
                balances: [{ asset_type: 'native', balance: '10.0000000' }],
            }),
        );

        renderWallet();

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('no_trustline'));
        expect(screen.getByTestId('network')).toHaveTextContent('PUBLIC');
        expect(screen.getByTestId('balance')).toHaveTextContent('0.00');
    });

    test('surfaces Horizon errors without keeping a stale balance', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse(500, {}));

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('error'));
        expect(screen.getByTestId('balance')).toHaveTextContent('');
        expect(screen.getByTestId('balanceError')).toHaveTextContent('Horizon balance request failed with status 500.');

        error.mockRestore();
    });

    test('uses the generic balance error when network details throw a non-Error value', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        // getNetworkDetails fails in fetchNetworkAndBalance — no prior call in performConnect
        freighterMocks.getNetworkDetails.mockRejectedValue('offline');

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('error'));
        expect(screen.getByTestId('balanceError')).toHaveTextContent('Unable to load USDC balance.');

        error.mockRestore();
    });

    test('surfaces wallet access denial and address errors', async () => {
        freighterMocks.requestAccess.mockResolvedValueOnce(false);

        const { rerender } = renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('connectionError')).toHaveTextContent('Wallet access denied.'));

        freighterMocks.requestAccess.mockResolvedValueOnce(true);
        freighterMocks.getAddress.mockResolvedValueOnce({ address: null, error: 'Address unavailable.' });

        rerender(
            <WalletProvider>
                <WalletProbe />
            </WalletProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('connectionError')).toHaveTextContent('Address unavailable.'));
    });

    test('uses the fallback address error when Freighter returns no address message', async () => {
        freighterMocks.getAddress.mockResolvedValueOnce({ address: null, error: null });

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() =>
            expect(screen.getByTestId('connectionError')).toHaveTextContent('Failed to get wallet address.'),
        );
    });

    test('logs automatic connection-check errors without crashing the provider', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        freighterMocks.isAllowed.mockRejectedValue(new Error('Freighter unavailable.'));

        renderWallet();

        await waitFor(() => expect(error).toHaveBeenCalledWith('Check connection error', expect.any(Error)));
        expect(screen.getByTestId('balanceStatus')).toHaveTextContent('idle');

        error.mockRestore();
    });

    test('uses the generic connection error when Freighter throws a non-Error value', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        freighterMocks.setAllowed.mockRejectedValue('locked');

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() =>
            expect(screen.getByTestId('connectionError')).toHaveTextContent(
                'Failed to connect wallet. Make sure Freighter is installed and unlocked.',
            ),
        );

        error.mockRestore();
    });

    test('surfaces Freighter Error messages during connect', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        freighterMocks.setAllowed.mockRejectedValue(new Error('Freighter is locked.'));

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('connectionError')).toHaveTextContent('Freighter is locked.'));

        error.mockRestore();
    });

    test('full connect -> disconnect flow clears all state without throwing', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(
            mockResponse(200, {
                balances: [
                    {
                        asset_type: 'credit_alphanum4',
                        asset_code: 'USDC',
                        asset_issuer: USDC_ISSUERS.TESTNET,
                        balance: '25.0000000',
                    },
                ],
            }),
        );

        renderWallet();

        // Connect
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
        await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('GCONNECTED'));
        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('success'));
        expect(screen.getByTestId('network')).toHaveTextContent('TESTNET');
        expect(screen.getByTestId('balance')).toHaveTextContent('25.0000000');

        // Disconnect — must not throw (previously threw ReferenceError due to missing refs)
        expect(() => fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))).not.toThrow();

        // All state should be cleared
        expect(screen.getByTestId('address')).toHaveTextContent('');
        expect(screen.getByTestId('network')).toHaveTextContent('');
        expect(screen.getByTestId('balance')).toHaveTextContent('');
        expect(screen.getByTestId('balanceStatus')).toHaveTextContent('idle');
        expect(screen.getByTestId('balanceError')).toHaveTextContent('');
    });

    test('disconnect resets the loaded balance state', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(
            mockResponse(200, {
                balances: [
                    {
                        asset_type: 'credit_alphanum4',
                        asset_code: 'USDC',
                        asset_issuer: USDC_ISSUERS.TESTNET,
                        balance: '9.0000000',
                    },
                ],
            }),
        );

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('success'));

        fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));

        expect(screen.getByTestId('address')).toHaveTextContent('');
        expect(screen.getByTestId('network')).toHaveTextContent('');
        expect(screen.getByTestId('balance')).toHaveTextContent('');
        expect(screen.getByTestId('balanceStatus')).toHaveTextContent('idle');
    });

    test('enforces bounded concurrency during rapid connect() calls', async () => {
        let resolveAccess: (value: boolean) => void = () => {};
        freighterMocks.requestAccess.mockReturnValue(
            new Promise<boolean>((resolve) => {
                resolveAccess = resolve;
            }),
        );
        vi.mocked(globalThis.fetch).mockResolvedValue(
            mockResponse(200, {
                balances: [{ asset_type: 'native', balance: '10.0000000' }],
            })
        );

        renderWallet();

        // Rapid double click
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        resolveAccess(true);

        await waitFor(() => {
            // requestAccess should only be called once despite two clicks
            expect(freighterMocks.requestAccess).toHaveBeenCalledTimes(1);
        });

        // The second connect should have been ignored and logged to telemetry
        expect(telemetryMock.recordWalletTelemetry).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'wallet.connect.ignored',
                reason: 'already_in_flight',
            })
        );
    });

    test('throws when useWallet is rendered outside the provider', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(() => render(<UnsafeProbe />)).toThrow('useWallet must be used within a WalletProvider');

        error.mockRestore();
    });
});

describe('WalletContext mount-time auto-reconnect and concurrency guards', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers({ shouldAdvanceTimers: true });
        freighterMocks.isAllowed.mockResolvedValue({ isAllowed: false });
        freighterMocks.setAllowed.mockResolvedValue(undefined);
        freighterMocks.requestAccess.mockResolvedValue(true);
        freighterMocks.getAddress.mockResolvedValue({ address: 'GAUTO', error: null });
        freighterMocks.getNetworkDetails.mockResolvedValue({ network: 'TESTNET' });
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    test('auto-reconnects and loads balance when Freighter reports an allowed address', async () => {
        freighterMocks.isAllowed.mockResolvedValue({ isAllowed: true });
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

        renderWallet();

        await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('GAUTO'));
        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('success'));
        expect(screen.getByTestId('balance')).toHaveTextContent('12.5000000');
    });

    test('does not auto-reconnect when Freighter reports not allowed', async () => {
        freighterMocks.isAllowed.mockResolvedValue({ isAllowed: false });

        renderWallet();

        await waitFor(() => expect(freighterMocks.isAllowed).toHaveBeenCalled());
        expect(screen.getByTestId('address')).toHaveTextContent('');
        expect(screen.getByTestId('balanceStatus')).toHaveTextContent('idle');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('ignores a stale address when Freighter reports an error during auto-reconnect', async () => {
        freighterMocks.isAllowed.mockResolvedValue({ isAllowed: true });
        freighterMocks.getAddress.mockResolvedValue({ address: null, error: 'Address unavailable.' });

        renderWallet();

        await waitFor(() => expect(freighterMocks.getAddress).toHaveBeenCalled());
        expect(screen.getByTestId('address')).toHaveTextContent('');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('times out a connect request that never resolves', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        freighterMocks.setAllowed.mockImplementation(() => new Promise(() => undefined));

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await act(async () => {
            vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + 1);
        });

        await waitFor(() => expect(screen.getByTestId('connectionError')).toHaveTextContent(/Timed out/i));
        expect(screen.getByTestId('address')).toHaveTextContent('');

        error.mockRestore();
    });

    test('ignores a stale balance response after disconnect', async () => {
        let resolveFetch: (value: Response) => void = () => undefined;
        vi.mocked(globalThis.fetch).mockReturnValue(
            new Promise<Response>((resolve) => {
                resolveFetch = resolve;
            }),
        );

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('loading'));

        fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));

        await act(async () => {
            resolveFetch(
                mockResponse(200, {
                    balances: [
                        {
                            asset_type: 'credit_alphanum4',
                            asset_code: 'USDC',
                            asset_issuer: USDC_ISSUERS.TESTNET,
                            balance: '999.0000000',
                        },
                    ],
                }),
            );
        });

        expect(screen.getByTestId('address')).toHaveTextContent('');
        expect(screen.getByTestId('balance')).toHaveTextContent('');
        expect(screen.getByTestId('balanceStatus')).toHaveTextContent('idle');
    });

    test('ignores a stale balance response from a previous address after reconnecting', async () => {
        const pending: Array<(value: Response) => void> = [];
        vi.mocked(globalThis.fetch).mockImplementation(
            () =>
                new Promise<Response>((resolve) => {
                    pending.push(resolve);
                }),
        );

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('loading'));

        fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));

        freighterMocks.getAddress.mockResolvedValue({ address: 'GAUTO', error: null });
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('GAUTO'));
        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('loading'));

        // Resolve the stale first request with a different balance.
        await act(async () => {
            pending[0](
                mockResponse(200, {
                    balances: [
                        {
                            asset_type: 'credit_alphanum4',
                            asset_code: 'USDC',
                            asset_issuer: USDC_ISSUERS.TESTNET,
                            balance: '111.0000000',
                        },
                    ],
                }),
            );
        });

        // The stale response must not overwrite the newer pending request.
        expect(screen.getByTestId('balance')).toHaveTextContent('');
        expect(screen.getByTestId('balanceStatus')).toHaveTextContent('loading');

        await act(async () => {
            pending[pending.length - 1](
                mockResponse(200, {
                    balances: [
                        {
                            asset_type: 'credit_alphanum4',
                            asset_code: 'USDC',
                            asset_issuer: USDC_ISSUERS.TESTNET,
                            balance: '7.0000000',
                        },
                    ],
                }),
            );
        });

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('success'));
        expect(screen.getByTestId('balance')).toHaveTextContent('7.0000000');
    });

    test('ignores a stale error from an earlier address after reconnecting', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const pending: Array<(value: Response) => void> = [];
        vi.mocked(globalThis.fetch).mockImplementation(
            () =>
                new Promise<Response>((resolve) => {
                    pending.push(resolve);
                }),
        );

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('loading'));

        fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));

        freighterMocks.getAddress.mockResolvedValue({ address: 'GAUTO', error: null });
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('GAUTO'));
        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('loading'));

        // Resolve the stale first request with a failure.
        await act(async () => {
            pending[0](mockResponse(500, {}));
        });

        expect(screen.getByTestId('balanceStatus')).toHaveTextContent('loading');
        expect(screen.getByTestId('balanceError')).toHaveTextContent('');

        await act(async () => {
            pending[pending.length - 1](
                mockResponse(200, {
                    balances: [
                        {
                            asset_type: 'credit_alphanum4',
                            asset_code: 'USDC',
                            asset_issuer: USDC_ISSUERS.TESTNET,
                            balance: '3.0000000',
                        },
                    ],
                }),
            );
        });

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('success'));
        expect(screen.getByTestId('balanceError')).toHaveTextContent('');
        expect(screen.getByTestId('balance')).toHaveTextContent('3.0000000');

        error.mockRestore();
    });

    test('ignores a stale connect result when disconnected mid-progress', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let resolveAccess: (value: boolean) => void = () => undefined;
        freighterMocks.requestAccess.mockReturnValue(
            new Promise<boolean>((resolve) => {
                resolveAccess = resolve;
            }),
        );

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(freighterMocks.requestAccess).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));

        await act(async () => {
            resolveAccess(true);
        });

        expect(screen.getByTestId('address')).toHaveTextContent('');
        expect(screen.getByTestId('connectionError')).toHaveTextContent('');
        expect(globalThis.fetch).not.toHaveBeenCalled();

        error.mockRestore();
    });

    test('coalesces concurrent connect clicks into a single Freighter request', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(
            mockResponse(200, {
                balances: [
                    {
                        asset_type: 'credit_alphanum4',
                        asset_code: 'USDC',
                        asset_issuer: USDC_ISSUERS.TESTNET,
                        balance: '1.0000000',
                    },
                ],
            }),
        );

        renderWallet();
        const connectButton = screen.getByRole('button', { name: /^connect$/i });
        fireEvent.click(connectButton);
        fireEvent.click(connectButton);
        fireEvent.click(connectButton);

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('success'));

        expect(freighterMocks.requestAccess).toHaveBeenCalledTimes(1);
        expect(freighterMocks.getAddress).toHaveBeenCalledTimes(1);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    test('recovers after a timeout and allows a subsequent successful connect', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        freighterMocks.setAllowed.mockImplementationOnce(() => new Promise(() => undefined));
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

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        // wait a tick so the connect click can be processed
        await Promise.resolve();

        await act(async () => {
            vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + 1);
        });

        await waitFor(() => expect(screen.getByTestId('connectionError')).toHaveTextContent(/Timed out/i));

        freighterMocks.setAllowed.mockResolvedValue(undefined);
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('balanceStatus')).toHaveTextContent('success'));
        expect(screen.getByTestId('address')).toHaveTextContent('GAUTO');
        expect(screen.getByTestId('connectionError')).toHaveTextContent('');

        error.mockRestore();
    });

    test('records wallet telemetry on a failed connect without exposing the address', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        freighterMocks.requestAccess.mockResolvedValue(false);

        renderWallet();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        await waitFor(() => expect(screen.getByTestId('connectionError')).toHaveTextContent('Wallet access denied.'));

        const calls = telemetryMock.recordWalletTelemetry.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        for (const [payload] of calls) {
            expect(JSON.stringify(payload)).not.toContain('GAUTO');
            expect(JSON.stringify(payload)).not.toContain('GCONNECTED');
        }

        error.mockRestore();
    });
});