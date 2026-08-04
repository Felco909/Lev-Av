import { describe, it, expect } from 'vitest';
import { getVehicleActivityStatus } from './status';

describe('getVehicleActivityStatus', () => {
  it('is no_signal when there is no last message at all', () => {
    expect(getVehicleActivityStatus(50, null)).toBe('no_signal');
    expect(getVehicleActivityStatus(50, undefined)).toBe('no_signal');
  });

  it('is no_signal when the last message is older than 30 minutes', () => {
    const staleAt = new Date(Date.now() - 31 * 60 * 1000);
    expect(getVehicleActivityStatus(80, staleAt)).toBe('no_signal');
  });

  it('is no_signal for an invalid date string', () => {
    expect(getVehicleActivityStatus(80, 'not-a-date')).toBe('no_signal');
  });

  it('is moving when recent and speed is above the 3 km/h threshold', () => {
    const fresh = new Date(Date.now() - 60 * 1000);
    expect(getVehicleActivityStatus(4, fresh)).toBe('moving');
    expect(getVehicleActivityStatus(80, fresh)).toBe('moving');
  });

  it('is stopped when recent but speed is at or below the 3 km/h threshold', () => {
    const fresh = new Date(Date.now() - 60 * 1000);
    expect(getVehicleActivityStatus(3, fresh)).toBe('stopped');
    expect(getVehicleActivityStatus(0, fresh)).toBe('stopped');
  });

  it('treats a missing/null speed as 0 (stopped, not moving) when recent', () => {
    const fresh = new Date(Date.now() - 60 * 1000);
    expect(getVehicleActivityStatus(null, fresh)).toBe('stopped');
    expect(getVehicleActivityStatus(undefined, fresh)).toBe('stopped');
  });

  it('accepts an ISO string for lastMessageAt, not just a Date object', () => {
    const freshIso = new Date(Date.now() - 60 * 1000).toISOString();
    expect(getVehicleActivityStatus(50, freshIso)).toBe('moving');
  });

  it('is right at the boundary — just under 30 minutes is still live', () => {
    const almostStale = new Date(Date.now() - 29 * 60 * 1000);
    expect(getVehicleActivityStatus(10, almostStale)).toBe('moving');
  });
});
