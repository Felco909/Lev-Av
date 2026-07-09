import { describe, it, expect } from 'vitest';
import {
  isFinanciallyCompletedStatus,
  isArchivedStatus,
  validateTripArchiveTransition,
} from './trip-archive-rules';

describe('isFinanciallyCompletedStatus / isArchivedStatus', () => {
  it('recognizes completed (and the legacy "paid" alias) as financially completed', () => {
    expect(isFinanciallyCompletedStatus('completed')).toBe(true);
    expect(isFinanciallyCompletedStatus('paid')).toBe(true);
    expect(isFinanciallyCompletedStatus('sverka')).toBe(false);
  });

  it('recognizes archived case-insensitively', () => {
    expect(isArchivedStatus('archived')).toBe(true);
    expect(isArchivedStatus('ARCHIVED')).toBe(true);
    expect(isArchivedStatus('completed')).toBe(false);
    expect(isArchivedStatus(null)).toBe(false);
  });
});

describe('validateTripArchiveTransition (item 1.1 in the audit — status + tax code only)', () => {
  it('blocks archiving from a non-completed status before checking anything else', () => {
    const result = validateTripArchiveTransition({ status: 'sverka', taxCode: 'AM-123' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(['Статус']);
  });

  it('blocks archiving a completed trip with no tax code', () => {
    const result = validateTripArchiveTransition({ status: 'completed', taxCode: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(['Налоговый код']);
  });

  it('blocks archiving when tax code is only whitespace', () => {
    const result = validateTripArchiveTransition({ status: 'completed', taxCode: '   ' });
    expect(result.ok).toBe(false);
  });

  it('allows archiving a completed trip with a tax code — invoice/act numbers are not required', () => {
    const result = validateTripArchiveTransition({ status: 'completed', taxCode: 'AM-123' });
    expect(result.ok).toBe(true);
  });
});
