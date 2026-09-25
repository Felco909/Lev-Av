import { describe, it, expect } from 'vitest';
import { nextDwellTrackingState } from './dwellCheck';

const now = new Date();
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('nextDwellTrackingState', () => {
  it('moving: records the message time as lastMovingAt and lastGpsMessageAt', () => {
    const t = minsAgo(1);
    expect(nextDwellTrackingState({ lastMovingAt: minsAgo(60), lastGpsMessageAt: minsAgo(6) }, { speedKmh: 70, lastMessageAt: t }, now))
      .toEqual({ lastMovingAt: t, lastGpsMessageAt: t });
  });

  it('moving: never moves lastMovingAt backwards', () => {
    const baseline = minsAgo(1);
    const older = minsAgo(3);
    expect(nextDwellTrackingState({ lastMovingAt: baseline, lastGpsMessageAt: older }, { speedKmh: 70, lastMessageAt: older }, now)).toBeNull();
  });

  it('stopped: keeps lastMovingAt, only refreshes lastGpsMessageAt', () => {
    const t = minsAgo(1);
    expect(nextDwellTrackingState({ lastMovingAt: minsAgo(300), lastGpsMessageAt: minsAgo(6) }, { speedKmh: 0, lastMessageAt: t }, now))
      .toEqual({ lastGpsMessageAt: t });
  });

  it('stopped on first observation: baseline "now", never a guessed past time', () => {
    const t = minsAgo(1);
    expect(nextDwellTrackingState({ lastMovingAt: null, lastGpsMessageAt: null }, { speedKmh: 0, lastMessageAt: t }, now))
      .toEqual({ lastGpsMessageAt: t, lastMovingAt: now });
  });

  it('no signal: does not set a dwell baseline', () => {
    const stale = minsAgo(120);
    expect(nextDwellTrackingState({ lastMovingAt: null, lastGpsMessageAt: null }, { speedKmh: 0, lastMessageAt: stale }, now))
      .toEqual({ lastGpsMessageAt: stale });
  });

  it('returns null when nothing changed', () => {
    const t = minsAgo(1);
    expect(nextDwellTrackingState({ lastMovingAt: minsAgo(300), lastGpsMessageAt: t }, { speedKmh: 0, lastMessageAt: t }, now)).toBeNull();
  });
});
