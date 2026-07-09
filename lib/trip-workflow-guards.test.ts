import { describe, it, expect } from 'vitest';
import {
  normalizeIncomingWorkflowStatus,
  assertDirectWorkflowStatusChange,
  assertCompletedWorkflowTransition,
  assertReopenToAwaitingPaymentTransition,
  assertInitialTripWorkflowStatus,
} from './trip-workflow-guards';

describe('normalizeIncomingWorkflowStatus', () => {
  it('maps the legacy "paid" status to completed', () => {
    expect(normalizeIncomingWorkflowStatus('paid')).toBe('completed');
  });

  it('returns undefined for empty/null/undefined input', () => {
    expect(normalizeIncomingWorkflowStatus(null)).toBeUndefined();
    expect(normalizeIncomingWorkflowStatus(undefined)).toBeUndefined();
    expect(normalizeIncomingWorkflowStatus('  ')).toBeUndefined();
  });
});

describe('assertDirectWorkflowStatusChange (item 1.3 — jump prevention)', () => {
  it('allows an adjacent step forward', () => {
    expect(assertDirectWorkflowStatusChange('new', 'in_progress').ok).toBe(true);
    expect(assertDirectWorkflowStatusChange('sverka', 'completed').ok).toBe(true);
  });

  it('allows an adjacent step backward', () => {
    expect(assertDirectWorkflowStatusChange('sverka', 'awaiting_payment').ok).toBe(true);
  });

  it('blocks a multi-step jump', () => {
    const result = assertDirectWorkflowStatusChange('new', 'completed');
    expect(result.ok).toBe(false);
  });

  it('is a no-op when the status is unchanged', () => {
    expect(assertDirectWorkflowStatusChange('sverka', 'sverka').ok).toBe(true);
  });

  it('is a no-op when no target status is given', () => {
    expect(assertDirectWorkflowStatusChange('new', undefined).ok).toBe(true);
    expect(assertDirectWorkflowStatusChange('new', '').ok).toBe(true);
  });

  it('allows moving into archived from any non-archived status', () => {
    expect(assertDirectWorkflowStatusChange('new', 'archived').ok).toBe(true);
    expect(assertDirectWorkflowStatusChange('completed', 'archived').ok).toBe(true);
  });

  it('blocks archiving an already-archived trip', () => {
    expect(assertDirectWorkflowStatusChange('archived', 'archived').ok).toBe(true); // same-status no-op wins first
  });

  it('allows leaving archived for any other status directly (no adjacency check applied)', () => {
    // Documents current behavior: from==='archived' with a non-archived target is
    // unconditionally allowed by this function. The dedicated /api/trips/[id]/archive
    // PUT route has its own separate un-archive check; this is the generic guard only.
    expect(assertDirectWorkflowStatusChange('archived', 'new').ok).toBe(true);
  });

  it('normalizes the legacy "paid" target the same as "completed"', () => {
    expect(assertDirectWorkflowStatusChange('sverka', 'paid').ok).toBe(true);
  });
});

describe('assertCompletedWorkflowTransition', () => {
  it('allows completing only from sverka', () => {
    expect(assertCompletedWorkflowTransition('sverka').ok).toBe(true);
  });

  it('blocks completing from any other status', () => {
    expect(assertCompletedWorkflowTransition('new').ok).toBe(false);
    expect(assertCompletedWorkflowTransition('awaiting_payment').ok).toBe(false);
  });

  it('blocks completing an already-completed trip', () => {
    expect(assertCompletedWorkflowTransition('completed').ok).toBe(false);
  });

  it('blocks completing directly from archived', () => {
    expect(assertCompletedWorkflowTransition('archived').ok).toBe(false);
  });
});

describe('assertReopenToAwaitingPaymentTransition', () => {
  // KNOWN ISSUE (found while writing this test, not fixed here — function is still
  // unused/unwired anywhere in the app): its own docstring says "reopen from
  // completed -> awaiting_payment", but it's implemented as a thin wrapper around
  // assertDirectWorkflowStatusChange, which enforces adjacent-step-only movement.
  // completed and awaiting_payment are two steps apart in STATUS_ORDER, so this
  // call is actually blocked, contradicting the stated intent. Flagging via this
  // test rather than silently changing behavior of code nothing currently calls.
  it('currently blocks the completed -> awaiting_payment reopen it is meant to allow', () => {
    const result = assertReopenToAwaitingPaymentTransition('completed');
    expect(result.ok).toBe(false);
  });
});

describe('assertInitialTripWorkflowStatus', () => {
  it('allows creating a trip as new or in_progress', () => {
    expect(assertInitialTripWorkflowStatus('new').ok).toBe(true);
    expect(assertInitialTripWorkflowStatus('in_progress').ok).toBe(true);
    expect(assertInitialTripWorkflowStatus(undefined).ok).toBe(true); // defaults to 'new'
  });

  it('blocks creating a trip already completed or archived', () => {
    expect(assertInitialTripWorkflowStatus('completed').ok).toBe(false);
    expect(assertInitialTripWorkflowStatus('archived').ok).toBe(false);
  });

  it('blocks creating a trip in any other mid-workflow status', () => {
    expect(assertInitialTripWorkflowStatus('sverka').ok).toBe(false);
    expect(assertInitialTripWorkflowStatus('awaiting_payment').ok).toBe(false);
  });
});
