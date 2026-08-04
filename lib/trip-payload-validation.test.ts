import { describe, it, expect } from 'vitest';
import { validateTripPayload } from './trip-payload-validation';

const validOwnTransport = {
  clientId: 'client-1',
  routeFrom: 'Ереван',
  routeTo: 'Москва',
  tripDate: '2026-08-01',
  clientRate: 100000,
  tripType: 'own_transport',
  vehicleId: 'vehicle-1',
  driverId: 'driver-1',
};

const validExpedition = {
  clientId: 'client-1',
  routeFrom: 'Ереван',
  routeTo: 'Москва',
  tripDate: '2026-08-01',
  clientRate: 100000,
  tripType: 'expedition',
  carrierRate: 80000,
};

describe('validateTripPayload (RC-1 — wired into POST/PUT /api/trips 01.08.2026)', () => {
  it('accepts a fully valid own_transport payload', () => {
    expect(validateTripPayload(validOwnTransport, { isCreate: true })).toEqual({ ok: true });
  });

  it('accepts a fully valid expedition payload without vehicle/driver', () => {
    expect(validateTripPayload(validExpedition, { isCreate: true })).toEqual({ ok: true });
  });

  it('rejects a missing clientId', () => {
    const result = validateTripPayload({ ...validOwnTransport, clientId: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('клиента');
  });

  it('rejects a missing route (either end)', () => {
    expect(validateTripPayload({ ...validOwnTransport, routeFrom: '' }).ok).toBe(false);
    expect(validateTripPayload({ ...validOwnTransport, routeTo: '   ' }).ok).toBe(false);
  });

  it('rejects a missing or invalid trip date', () => {
    expect(validateTripPayload({ ...validOwnTransport, tripDate: '' }).ok).toBe(false);
    expect(validateTripPayload({ ...validOwnTransport, tripDate: 'not-a-date' }).ok).toBe(false);
  });

  it('rejects a zero or negative client rate', () => {
    expect(validateTripPayload({ ...validOwnTransport, clientRate: 0 }).ok).toBe(false);
    expect(validateTripPayload({ ...validOwnTransport, clientRate: -100 }).ok).toBe(false);
  });

  it('rejects own_transport without a vehicle', () => {
    const result = validateTripPayload({ ...validOwnTransport, vehicleId: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('машину');
  });

  it('rejects own_transport without a driver', () => {
    const result = validateTripPayload({ ...validOwnTransport, driverId: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('водителя');
  });

  it('does not require vehicle/driver for expedition', () => {
    expect(validateTripPayload(validExpedition, { isCreate: true }).ok).toBe(true);
  });

  it('rejects a negative carrier rate on expedition', () => {
    const result = validateTripPayload({ ...validExpedition, carrierRate: -1 });
    expect(result.ok).toBe(false);
  });

  it('allows a null/absent carrier rate on expedition (rate not agreed yet)', () => {
    expect(validateTripPayload({ ...validExpedition, carrierRate: null }).ok).toBe(true);
  });

  it('defaults tripType to own_transport when absent, and still requires vehicle/driver', () => {
    const { tripType, ...withoutType } = validOwnTransport;
    expect(validateTripPayload(withoutType).ok).toBe(true);
    const { tripType: _t, vehicleId, ...brokenWithoutType } = validOwnTransport;
    expect(validateTripPayload(brokenWithoutType).ok).toBe(false);
  });
});
