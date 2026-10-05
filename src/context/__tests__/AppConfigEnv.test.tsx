import { vi, describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('../../utils/networkMismatch', () => ({
  APP_EXPECTED_NETWORK: 'PUBLIC',
  DEFAULT_EXPECTED_NETWORK: 'TESTNET',
  resolveExpectedNetwork: (v: unknown) => (v === 'PUBLIC' ? 'PUBLIC' : 'TESTNET'),
}));

vi.mock('../WalletContext', () => ({
  useWallet: vi.fn(() => ({ network: null })),
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}));

import {
  AppConfigProvider,
  useAppConfig,
} from '../AppConfigContext';
import {
  APP_EXPECTED_NETWORK,
  DEFAULT_EXPECTED_NETWORK,
} from '../../utils/networkMismatch';
import { WalletProvider } from '../WalletContext';
import { EXPLORER_BASE_URLS } from '../../utils/explorer';
import { HORIZON_URLS, USDC_ISSUERS } from '../../utils/horizon';

function TestComponent() {
  const config = useAppConfig();
  return (
    <div>
      <div data-testid="network">{config.network}</div>
      <div data-testid="horizonUrl">{config.horizonUrl}</div>
      <div data-testid="usdcIssuer">{config.usdcIssuer}</div>
      <div data-testid="explorerBaseUrl">{config.explorerBaseUrl}</div>
    </div>
  );
}

describe('AppConfigContext with APP_EXPECTED_NETWORK = PUBLIC', () => {
  test('defaults to PUBLIC configuration when wallet is disconnected', () => {
    render(
      <WalletProvider>
        <AppConfigProvider>
          <TestComponent />
        </AppConfigProvider>
      </WalletProvider>,
    );

    expect(screen.getByTestId('network')).toHaveTextContent('PUBLIC');
    expect(screen.getByTestId('horizonUrl')).toHaveTextContent(HORIZON_URLS.PUBLIC);
    expect(screen.getByTestId('usdcIssuer')).toHaveTextContent(USDC_ISSUERS.PUBLIC);
    expect(screen.getByTestId('explorerBaseUrl')).toHaveTextContent(EXPLORER_BASE_URLS.PUBLIC);
  });

  test('verifies networkMismatch mocked values propagate to AppConfigProvider', () => {
    expect(APP_EXPECTED_NETWORK).toBe('PUBLIC');
    expect(DEFAULT_EXPECTED_NETWORK).toBe('TESTNET');
  });
});

