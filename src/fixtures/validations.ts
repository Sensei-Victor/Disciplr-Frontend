/**
 * fixtures/validations.ts
 *
 * Mock seed data for the verifier store (pending validations + history).
 * Extracted verbatim from src/Zustand/Store.ts.
 */

import type { ValidationTask } from "../Zustand/Store";

// Helper to keep demo deadlines internally consistent relative to current time
const getDynamicDeadline = (daysFromNow: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
};

export const initialPending: ValidationTask[] = [
  {
    id: 'v-101',
    vaultName: 'Q3 Development Fund',
    owner: 'GWHTYJ4AP5L4VOXVVJMTH6W3JE4232YD6RUBU3JPGLH6MUF6R7XIZPI4',
    amount: '50,000 USDC',
    deadline: getDynamicDeadline(16),
    status: 'pending',
    milestone: 'Beta Release Deployment',
    evidenceUrl: 'https://github.com/example/release-v1',
    criteria: [
      'Deployment URL is live and publicly accessible',
      'All critical bugs from the backlog are resolved',
      'Release notes are published',
    ],
  },
  {
    id: 'v-102',
    vaultName: 'Community Grant #42',
    owner: 'CB2JGUFHTB4DHCXXTKZC7YLJH6VW567J7CIA75XSEJEISXPFPKXY7SBJ',
    amount: '10,000 USDC',
    deadline: getDynamicDeadline(3),
    status: 'pending',
    milestone: 'Design System Figma Delivery',
    evidenceUrl: 'https://figma.com/example-link',
    criteria: [
      'Figma file is shared with the org',
      'All component pages are complete',
    ],
  }
];

export const initialHistory: ValidationTask[] = [
  {
    id: 'v-099',
    vaultName: 'Audit Bounty',
    owner: 'GRL3XUETECYK4FRYBZI5PGJNYAGJD4E3NSK3A5HFV5U667X54CFLL7QL',
    amount: '5,000 USDC',
    deadline: getDynamicDeadline(0),
    status: 'approved',
    milestone: 'Smart Contract Security Audit',
    notes: 'Audit looks solid, all critical issues addressed.',
  }
];
