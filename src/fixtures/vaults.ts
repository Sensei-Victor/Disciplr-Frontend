/**
 * fixtures/vaults.ts
 *
 * Mock vault dataset for the local/offline data layer. Copied verbatim from
 * VaultDetail.tsx's original MOCK_VAULTS — the canonical source.
 *
 * Consumed by `src/services/vaultService.ts`, which exposes the Promise-based
 * seam the page components depend on. See docs/VAULT_DATA_LAYER.md.
 */

import type { Vault } from "../types/vault";

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

export const MASTER_VAULTS: Record<string, Vault> = {
  // Vault 1: active vault
  "1": {
    id: "1",
    name: "Alpha Vault",
    status: "active",
    amount: 12500,
    currency: "USDC",
    createdAt: daysFromNow(-30),
    deadline: daysFromNow(30),
    creatorAddress: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
    verifierAddress: "GVERIF3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    successAddress: "GSUCC3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    failureAddress: "GFAIL3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    contractAddress: "GCONT3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    milestones: [
      {
        id: "m1",
        title: "Phase 1 Complete",
        description: "Complete initial development phase",
        criteria: "All unit tests passing, code reviewed",
        status: "validated",
        validatedAt: daysFromNow(-15),
        evidenceUrl: "https://github.com/org/repo/pull/42",
      },
      {
        id: "m2",
        title: "Beta Launch",
        description: "Launch beta version to 100 users",
        criteria: "Beta deployed, 100 active users onboarded",
        status: "pending",
      },
    ],
    transactions: [
      {
        id: "tx1",
        type: "create",
        hash: "a3f9d1c8e2b74056af3d9c1b2e8f0a4d",
        timestamp: daysFromNow(-30),
        amount: 12500,
      },
      {
        id: "tx2",
        type: "validate",
        hash: "b4e0c2d9f3a85167bg4e0d2c3f9a5e8b",
        timestamp: daysFromNow(-15),
      },
    ],
  },
  // Vault 2: completed vault (release) without a verifier address
  "2": {
    id: "2",
    name: "Beta Reserve",
    status: "completed",
    amount: 4200.5,
    currency: "USDC",
    createdAt: daysFromNow(-40),
    deadline: daysFromNow(-10),
    creatorAddress: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
    successAddress: "GSUCC3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    failureAddress: "GFAIL3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    contractAddress: "GCONT4KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    milestones: [
      {
        id: "m1",
        title: "Project Delivery",
        description: "Deliver final project",
        criteria: "All deliverables submitted and approved",
        status: "validated",
        validatedAt: daysFromNow(-15),
        evidenceUrl: "https://docs.example.com/delivery",
      },
    ],
    transactions: [
      {
        id: "tx1",
        type: "create",
        hash: "e7b3f5a2c6d18490ej7b3a5f6c2d8b1e",
        timestamp: daysFromNow(-40),
        amount: 4200.5,
      },
      {
        id: "tx2",
        type: "validate",
        hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
        timestamp: daysFromNow(-15),
      },
      {
        id: "tx3",
        type: "release",
        hash: "c5f1d3e0a4b96278ch5f1e3d4a0b6f9c",
        timestamp: daysFromNow(-10),
        amount: 4200.5,
      },
    ],
  },
  // Vault 3: failed vault (redirect)
  "3": {
    id: "3",
    name: "Gamma Fund",
    status: "failed",
    amount: 8800,
    currency: "USDC",
    createdAt: daysFromNow(-50),
    deadline: daysFromNow(-20),
    creatorAddress: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
    failureAddress: "GFAIL3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    successAddress: "GSUCC3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    contractAddress: "GCONT5KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    milestones: [
      {
        id: "m1",
        title: "Milestone 1",
        description: "First milestone",
        criteria: "Criteria not met",
        status: "failed",
      },
    ],
    transactions: [
      {
        id: "tx1",
        type: "create",
        hash: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
        timestamp: daysFromNow(-50),
        amount: 8800,
      },
      {
        id: "tx2",
        type: "redirect",
        hash: "d6a2e4f1b5c07389di6a2f4e5b1c7a0d",
        timestamp: daysFromNow(-20),
        amount: 8800,
      },
    ],
  },
  // Vault 4: cancelled vault with mixed milestone statuses and redirect destination
  "4": {
    id: "4",
    name: "Delta Cancelled",
    status: "cancelled",
    amount: 5000,
    currency: "USDC",
    createdAt: daysFromNow(-50),
    deadline: daysFromNow(-20),
    creatorAddress: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
    failureAddress: "GFAIL3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    successAddress: "GSUCC3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    contractAddress: "GCONT5KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    milestones: [
      {
        id: "m1",
        title: "Milestone 1",
        description: "First milestone",
        criteria: "Criteria met",
        status: "validated",
        validatedAt: daysFromNow(-30),
      },
      {
        id: "m2",
        title: "Milestone 2",
        description: "Second milestone",
        criteria: "Criteria not met",
        status: "failed",
      },
      {
        id: "m3",
        title: "Milestone 3",
        description: "Third milestone",
        criteria: "Pending criteria",
        status: "pending",
      },
    ],
    transactions: [
      {
        id: "tx1",
        type: "create",
        hash: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
        timestamp: daysFromNow(-50),
        amount: 5000,
      },
      {
        id: "tx2",
        type: "redirect",
        hash: "d6a2e4f1b5c07389di6a2f4e5b1c7a0d",
        timestamp: daysFromNow(-20),
        amount: 5000,
      },
    ],
  },
  // Vault 5: pending_validation vault — used to test Validate Milestone button
  "5": {
    id: "5",
    name: "Epsilon Pending",
    status: "pending_validation",
    amount: 7500,
    currency: "USDC",
    createdAt: daysFromNow(-60),
    deadline: daysFromNow(90),
    creatorAddress: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
    verifierAddress: "GVERIF3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    successAddress: "GSUCC3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    failureAddress: "GFAIL3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    contractAddress: "GCONT6KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    milestones: [
      {
        id: "m1",
        title: "Milestone Alpha",
        description: "First deliverable",
        criteria: "Submitted and under review",
        status: "pending",
      },
    ],
    transactions: [
      {
        id: "tx1",
        type: "create",
        hash: "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6",
        timestamp: daysFromNow(-60),
        amount: 7500,
      },
    ],
  },
};
