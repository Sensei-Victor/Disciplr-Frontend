import { deadlineUrgency } from './vaultUrgency';

export interface AtRiskVault {
  id: string;
  name: string;
  amount: number;
  currency: string;
  status: 'active' | 'pending_validation';
  deadline: string;
  progressPct: number;
}

interface VaultInput {
  id: string;
  name: string;
  amount: number;
  currency: string;
  status: string;
  deadline: string;
  progressPct: number;
}

/**
 * Returns vaults whose deadline urgency is critical or soon, and whose status
 * is active or pending_validation. Completed/failed vaults and vaults with
 * safe urgency (including expired deadlines) are excluded.
 */
export function getAtRiskVaults(vaults: VaultInput[]): AtRiskVault[] {
  return vaults.filter((vault) => {
    const urgency = deadlineUrgency(vault.deadline);
    const isAtRiskUrgency = urgency === 'critical' || urgency === 'soon';
    const isActiveStatus =
      vault.status === 'active' || vault.status === 'pending_validation';
    return isAtRiskUrgency && isActiveStatus;
  }) as AtRiskVault[];
}
