import { fireEvent, render, screen } from '@testing-library/react';
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
    AppConfigProvider,
    useAppConfig,
} from '../AppConfigContext';
import {
    APP_EXPECTED_NETWORK,
    DEFAULT_EXPECTED_NETWORK,
    resolveExpectedNetwork,
} from '../../utils/networkMismatch';
import { useWallet, type WalletNetwork } from '../WalletContext';
import { EXPLORER_BASE_URLS } from '../../utils/explorer';
import { HORIZON_URLS, USDC_ISSUERS } from '../../utils/horizon';

interface MockWalletContextValue {
    network: WalletNetwork | null;
    connect: () => Promise<boolean>;
    disconnect: () => void;
}

const MockWalletCtx = createContext<MockWalletContextValue>({
    network: null,
    connect: async () => true,
    disconnect: () => {},
});

function MockWalletProvider({ children }: { children: ReactNode }) {
    const [network, setNetwork] = useState<WalletNetwork | null>(null);
    const connect = async () => {
        setNetwork('PUBLIC');
        return true;
    };
    const disconnect = () => {
        setNetwork(null);
    };

    return (
        <MockWalletCtx.Provider value={{ network, connect, disconnect }}>
            {children}
        </MockWalletCtx.Provider>
    );
}

vi.mock('../WalletContext', () => ({
    useWallet: () => useContext(MockWalletCtx),
    WalletProvider: ({ children }: { children: ReactNode }) => children,
}));

function AppConfigProbe() {
    const wallet = useWallet();
    const appConfig = useAppConfig();

    return (
        <div>
            <button type="button" onClick={wallet.connect}>
                Connect
            </button>
            <button type="button" onClick={wallet.disconnect}>
                Disconnect
            </button>
            <div data-testid="network">{appConfig.network}</div>
            <div data-testid="horizonUrl">{appConfig.horizonUrl}</div>
            <div data-testid="usdcIssuer">{appConfig.usdcIssuer}</div>
            <div data-testid="explorerBaseUrl">{appConfig.explorerBaseUrl}</div>
        </div>
    );
}

function UnsafeProbe() {
    useAppConfig();
    return null;
}

function renderAppConfig() {
    return render(
        <MockWalletProvider>
            <AppConfigProvider>
                <AppConfigProbe />
            </AppConfigProvider>
        </MockWalletProvider>,
    );
}

describe('AppConfigContext', () => {
    test('defaults to TESTNET config when the wallet is disconnected', () => {
        renderAppConfig();

        expect(screen.getByTestId('network')).toHaveTextContent('TESTNET');
        expect(screen.getByTestId('horizonUrl')).toHaveTextContent(HORIZON_URLS.TESTNET);
        expect(screen.getByTestId('usdcIssuer')).toHaveTextContent(USDC_ISSUERS.TESTNET);
        expect(screen.getByTestId('explorerBaseUrl')).toHaveTextContent(EXPLORER_BASE_URLS.TESTNET);
    });

    test('updates config when the wallet network changes', async () => {
        renderAppConfig();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        expect(screen.getByTestId('network')).toHaveTextContent('PUBLIC');
        expect(screen.getByTestId('horizonUrl')).toHaveTextContent(HORIZON_URLS.PUBLIC);
        expect(screen.getByTestId('usdcIssuer')).toHaveTextContent(USDC_ISSUERS.PUBLIC);
        expect(screen.getByTestId('explorerBaseUrl')).toHaveTextContent(EXPLORER_BASE_URLS.PUBLIC);
    });

    test('reverts to the default TESTNET config after disconnect', async () => {
        renderAppConfig();
        fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

        expect(screen.getByTestId('network')).toHaveTextContent('PUBLIC');

        fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));

        expect(screen.getByTestId('network')).toHaveTextContent('TESTNET');
        expect(screen.getByTestId('horizonUrl')).toHaveTextContent(HORIZON_URLS.TESTNET);
        expect(screen.getByTestId('usdcIssuer')).toHaveTextContent(USDC_ISSUERS.TESTNET);
        expect(screen.getByTestId('explorerBaseUrl')).toHaveTextContent(EXPLORER_BASE_URLS.TESTNET);
    });

    test('resolves fallback network using shared networkMismatch logic', () => {
        expect(DEFAULT_EXPECTED_NETWORK).toBe('TESTNET');
        expect(APP_EXPECTED_NETWORK).toBe('TESTNET');
        expect(resolveExpectedNetwork('PUBLIC')).toBe('PUBLIC');
        expect(resolveExpectedNetwork('TESTNET')).toBe('TESTNET');
        expect(resolveExpectedNetwork('UNKNOWN')).toBe('TESTNET');
        expect(resolveExpectedNetwork(null)).toBe('TESTNET');
    });

    test('throws when useAppConfig is rendered outside the provider', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(() => render(<UnsafeProbe />)).toThrow('useAppConfig must be used within an AppConfigProvider');

        error.mockRestore();
    });
});

