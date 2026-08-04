import { describe, it, expect } from 'vitest';
import { dedupeCashGapTotal } from './cash-gap-dedup';

describe('dedupeCashGapTotal (RC-1 regression — 01.08.2026 double-count bug)', () => {
  it('sums cashGap once per unique trip id', () => {
    const total = dedupeCashGapTotal([
      { id: 'trip-1', cashGap: 100 },
      { id: 'trip-2', cashGap: 50 },
    ]);
    expect(total).toBe(150);
  });

  it('does not double-count a trip that appears in both client and carrier debt lists', () => {
    // Same trip, same cashGap value, fetched via two different queries — this is
    // exactly the shape that caused the real 6,419,500 vs 6,039,500 discrepancy.
    const clientRows = [{ id: 'trip-1', cashGap: 300 }];
    const carrierRows = [{ id: 'trip-1', cashGap: 300 }];
    expect(dedupeCashGapTotal([...clientRows, ...carrierRows])).toBe(300);
  });

  it('still sums correctly when only one side has a given trip', () => {
    const clientRows = [{ id: 'trip-1', cashGap: 300 }];
    const carrierRows = [{ id: 'trip-2', cashGap: 200 }];
    expect(dedupeCashGapTotal([...clientRows, ...carrierRows])).toBe(500);
  });

  it('ignores rows with zero or negative cashGap', () => {
    expect(dedupeCashGapTotal([{ id: 'a', cashGap: 0 }, { id: 'b', cashGap: -10 }])).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(dedupeCashGapTotal([])).toBe(0);
  });
});
