import { ACCOUNT_A } from '@/__tests__/fixtures/stellarAddresses';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { AddressDisplay } from '../AddressDisplay';
import { truncateMiddle } from '../../utils/truncate';

const ELLIPSIS = '...';

const LONG = ACCOUNT_A;
const SHORT = 'GSHORT';
const INVALID = 'GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L'; // 44 chars

describe('AddressDisplay', () => {
    describe('truncation', () => {
        it('truncates a long address to head+tail chars', () => {
            render(<AddressDisplay address={LONG} />);
            expect(screen.getByRole('text')).toHaveTextContent(`${LONG.slice(0, 6)}...${LONG.slice(-4)}`);
        });

        it('does not truncate a short address', () => {
            render(<AddressDisplay address={SHORT} />);
            expect(screen.getByRole('text')).toHaveTextContent(SHORT);
        });

        it('respects custom chars and tailChars', () => {
            render(<AddressDisplay address={LONG} chars={4} tailChars={6} />);
            expect(screen.getByRole('text')).toHaveTextContent(`${LONG.slice(0, 4)}...${LONG.slice(-6)}`);
        });
    });

    describe('accessibility & invalid marking', () => {
        it('marks a checksum-corrupted address invalid and hides its explorer link', () => {
            const corrupted = `${LONG.slice(0, -1)}A`;
            render(<AddressDisplay address={corrupted} network="TESTNET" />);
            const el = screen.getByRole('text');
            expect(el).toHaveAttribute('title', `Invalid address: ${corrupted}`);
            expect(el).toHaveAttribute('aria-label', `Invalid address ${corrupted}`);
            expect(el).toHaveStyle({ textDecoration: 'line-through' });
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        it('exposes the full address in title and aria-label for valid addresses', () => {
            render(<AddressDisplay address={LONG} />);
            const el = screen.getByRole('text');
            expect(el).toHaveAttribute('title', LONG);
            expect(el).toHaveAttribute('aria-label', `Address ${LONG}`);
            expect(el).not.toHaveStyle({ textDecoration: 'line-through' });
        });

        it('marks invalid addresses with warning labels and styles', () => {
            render(<AddressDisplay address={INVALID} />);
            const el = screen.getByRole('text');
            expect(el).toHaveAttribute('title', `Invalid address: ${INVALID}`);
            expect(el).toHaveAttribute('aria-label', `Invalid address ${INVALID}`);
            expect(el).toHaveStyle({ textDecoration: 'line-through' });
            expect(el).toHaveStyle({ color: 'var(--error)' });
        });

        it('renders valid addresses with default color and no strikethrough', () => {
            render(<AddressDisplay address={LONG} />);
            const el = screen.getByRole('text');
            expect(el).toHaveStyle({ textDecoration: 'none' });
            // JSDOM resolves 'inherit' to a computed value; check the raw inline style instead.
            expect((el as HTMLElement).style.color).toBe('inherit');
        });
    });

    describe('copy button', () => {
        beforeEach(() => {
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: vi.fn().mockResolvedValue(undefined) },
                configurable: true,
            });
        });

        it('copies the full address and announces success', async () => {
            render(<AddressDisplay address={LONG} />);
            const btn = screen.getByRole('button', { name: /copy address/i });
            fireEvent.click(btn);
            await waitFor(() =>
                expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument(),
            );
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LONG);
        });

        it('reverts the copy label after 1.5 s', async () => {
            vi.useFakeTimers();
            render(<AddressDisplay address={LONG} />);
            fireEvent.click(screen.getByRole('button', { name: /copy address/i }));
            // flush the clipboard Promise, then advance timers
            await act(async () => { await Promise.resolve(); });
            await act(async () => { vi.advanceTimersByTime(1500); });
            expect(screen.getByRole('button', { name: /copy address/i })).toBeInTheDocument();
            vi.useRealTimers();
        });

        it('does not throw when clipboard API is unavailable', () => {
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: vi.fn().mockRejectedValue(new Error('no clipboard')) },
                configurable: true,
            });
            render(<AddressDisplay address={LONG} />);
            expect(() =>
                fireEvent.click(screen.getByRole('button', { name: /copy address/i })),
            ).not.toThrow();
        });
    });

    describe('explorer link', () => {
        it('renders a testnet explorer link when network is TESTNET', () => {
            render(<AddressDisplay address={LONG} network="TESTNET" />);
            const link = screen.getByRole('link', { name: /view.*on stellar expert/i });
            expect(link).toHaveAttribute(
                'href',
                `https://stellar.expert/explorer/testnet/account/${LONG}`,
            );
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        });

        it('renders a public explorer link when network is PUBLIC', () => {
            render(<AddressDisplay address={LONG} network="PUBLIC" />);
            expect(screen.getByRole('link', { name: /view.*on stellar expert/i })).toHaveAttribute(
                'href',
                `https://stellar.expert/explorer/public/account/${LONG}`,
            );
        });

        it('hides the explorer link when network is omitted', () => {
            render(<AddressDisplay address={LONG} />);
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        it('hides the explorer link when network is null', () => {
            render(<AddressDisplay address={LONG} network={null} />);
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        it('hides the explorer link when address is invalid', () => {
            render(<AddressDisplay address={INVALID} network="TESTNET" />);
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });
    });

    describe('truncateMiddle property-based boundaries', () => {
        // Seeded for deterministic, reproducible property runs.
        const RUN = { seed: 485, numRuns: 300 } as const;
        const value = fc.string();
        const head = fc.nat({ max: 40 });
        // tail ≥ 1: tail of 0 hits the String.slice(-0) quirk (returns the
        // whole string), which is covered separately as an edge case below.
        const tail = fc.integer({ min: 1, max: 40 });

        it('output never exceeds head + tail + ellipsis length', () => {
            fc.assert(
                fc.property(value, head, tail, (v, h, t) => {
                    const out = truncateMiddle(v, h, t);
                    // Either a pass-through (≤ original) or the bounded truncated form.
                    expect(out.length).toBeLessThanOrEqual(
                        Math.max(v.length, h + t + ELLIPSIS.length),
                    );
                }),
                RUN,
            );
        });

        // Build a value whose length is ≤ head + tail + 3 (a pass-through case).
        const shortCase = fc
            .record({ h: head, t: tail })
            .chain(({ h, t }) =>
                fc
                    .string({ maxLength: h + t + ELLIPSIS.length })
                    .map((v) => ({ v, h, t })),
            );

        // Build a value strictly longer than head + tail + 3 (a truncated case).
        const longCase = fc
            .record({ h: head, t: tail })
            .chain(({ h, t }) =>
                fc
                    .string({ minLength: h + t + ELLIPSIS.length + 1 })
                    .map((v) => ({ v, h, t })),
            );

        it('passes short values through unchanged (length ≤ head + tail + 3)', () => {
            fc.assert(
                fc.property(shortCase, ({ v, h, t }) => {
                    expect(truncateMiddle(v, h, t)).toBe(v);
                }),
                RUN,
            );
        });

        it('preserves head and tail substrings when truncated', () => {
            fc.assert(
                fc.property(longCase, ({ v, h, t }) => {
                    const out = truncateMiddle(v, h, t);
                    expect(out.startsWith(v.slice(0, h))).toBe(true);
                    expect(out.includes(ELLIPSIS)).toBe(true);
                    expect(out.endsWith(v.slice(-t))).toBe(true);
                }),
                RUN,
            );
        });

        it('handles edge cases: empty string, boundary length, large head/tail, zero tail', () => {
            expect(truncateMiddle('', 6, 4)).toBe('');
            // exactly the boundary length (head + tail + 3) passes through.
            const boundary = 'a'.repeat(6 + 4 + 3);
            expect(truncateMiddle(boundary, 6, 4)).toBe(boundary);
            // one over the boundary gets truncated.
            const over = 'a'.repeat(6 + 4 + 4);
            expect(truncateMiddle(over, 6, 4)).toBe(`${'a'.repeat(6)}...${'a'.repeat(4)}`);
            // head/tail larger than the string → pass-through.
            expect(truncateMiddle('abc', 50, 50)).toBe('abc');
            // zero tail: slice(-0) returns the whole string, so the tail
            // segment is the full address (documents current behaviour).
            const src = 'GA2C5RFPE6G6KXHEIRHZXSNBR3';
            expect(truncateMiddle(src, 6, 0)).toBe(`GA2C5R...${src}`);
        });
    });
});
