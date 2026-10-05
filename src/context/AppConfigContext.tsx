import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useWallet, type WalletNetwork } from './WalletContext';
import { explorerBaseUrl as getExplorerBaseUrl } from '../utils/explorer';
import { HORIZON_URLS, USDC_ISSUERS } from '../utils/horizon';
import {
    APP_EXPECTED_NETWORK,
    resolveExpectedNetwork,
} from '../utils/networkMismatch';

export interface AppConfig {
    network: WalletNetwork;
    horizonUrl: string;
    usdcIssuer: string;
    explorerBaseUrl: string;
}

const AppConfigContext = createContext<AppConfig | undefined>(undefined);

/**
 * Centralizes network-aware configuration so the app consumes a unified source of truth.
 *
 * @param props Component properties containing child elements.
 * @returns React context provider element wrapping children with active AppConfig.
 */
export function AppConfigProvider({ children }: { children: ReactNode }) {
    const { network: walletNetwork } = useWallet();
    const network = walletNetwork ? resolveExpectedNetwork(walletNetwork) : APP_EXPECTED_NETWORK;

    const value = useMemo<AppConfig>(
        () => ({
            network,
            horizonUrl: HORIZON_URLS[network],
            usdcIssuer: USDC_ISSUERS[network],
            explorerBaseUrl: getExplorerBaseUrl(network),
        }),
        [network],
    );

    return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

/**
 * Accesses active AppConfig context.
 *
 * @returns Current AppConfig instance.
 * @throws Error if used outside AppConfigProvider.
 */
export function useAppConfig() {
    const context = useContext(AppConfigContext);
    if (context === undefined) {
        throw new Error('useAppConfig must be used within an AppConfigProvider');
    }
    return context;
}

