import { describe, it, expect } from 'vitest';
import { classifyDwell, formatDwellHours } from './dwell-alerts';

const now = new Date('2026-09-25T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('classifyDwell', () => {
  it('returns null when the vehicle was never observed', () => {
    expect(classifyDwell({ lastMovingAt: null, lastGpsMessageAt: null }, now)).toBeNull();
  });

  it('returns null below the 4 h info threshold', () => {
    expect(classifyDwell({ lastMovingAt: hoursAgo(3.9), lastGpsMessageAt: minsAgo(2) }, now)).toBeNull();
  });

  it('grades dwell as info / warning / critical at 4 / 12 / 24 h', () => {
    expect(classifyDwell({ lastMovingAt: hoursAgo(4), lastGpsMessageAt: minsAgo(2) }, now)).toMatchObject({ kind: 'dwell', hours: 4, severity: 'info' });
    expect(classifyDwell({ lastMovingAt: hoursAgo(11), lastGpsMessageAt: minsAgo(2) }, now)).toMatchObject({ severity: 'info' });
    expect(classifyDwell({ lastMovingAt: hoursAgo(12), lastGpsMessageAt: minsAgo(2) }, now)).toMatchObject({ severity: 'warning' });
    expect(classifyDwell({ lastMovingAt: hoursAgo(24), lastGpsMessageAt: minsAgo(2) }, now)).toMatchObject({ severity: 'critical', hours: 24 });
  });

  it('reports no_signal instead of dwell once the tracker is silent for 2 h+', () => {
    const c = classifyDwell({ lastMovingAt: hoursAgo(30), lastGpsMessageAt: hoursAgo(3) }, now);
    expect(c).toMatchObject({ kind: 'no_signal', hours: 3, severity: 'warning' });
  });

  it('is silent while the signal is stale but under 2 h (no dwell guess either)', () => {
    expect(classifyDwell({ lastMovingAt: hoursAgo(30), lastGpsMessageAt: minsAgo(90) }, now)).toBeNull();
  });

  it('still counts dwell with a fresh signal up to the 30 min staleness limit', () => {
    expect(classifyDwell({ lastMovingAt: hoursAgo(5), lastGpsMessageAt: minsAgo(29) }, now)).toMatchObject({ kind: 'dwell' });
  });
});

describe('formatDwellHours', () => {
  it('formats hours and days', () => {
    expect(formatDwellHours(6)).toBe('6 ч');
    expect(formatDwellHours(24)).toBe('1 дн.');
    expect(formatDwellHours(27)).toBe('1 дн. 3 ч');
  });
});
