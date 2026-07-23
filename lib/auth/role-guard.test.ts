import { describe, it, expect } from 'vitest';
import { assertRole, VEHICLE_TRIP_FINANCIAL_ROLES, CRITICAL_FINANCE_FIELDS_ROLES } from './role-guard';

function sessionWithRole(role: string | null | undefined) {
  return { user: role != null ? { role } : {} };
}

describe('VEHICLE_TRIP_FINANCIAL_ROLES (Этап 2 — защита финансовых полей рейса)', () => {
  it('is the same role set as critical Trip payment fields, not a narrower/wider one', () => {
    expect(VEHICLE_TRIP_FINANCIAL_ROLES).toBe(CRITICAL_FINANCE_FIELDS_ROLES);
  });

  it('allows admin/owner/director/accountant to change financial fields', () => {
    for (const role of ['admin', 'owner', 'director', 'accountant']) {
      const result = assertRole(sessionWithRole(role), VEHICLE_TRIP_FINANCIAL_ROLES, 'test');
      expect(result.ok, `role ${role} should be allowed`).toBe(true);
    }
  });

  it('blocks dispatcher from changing financial fields', () => {
    const result = assertRole(sessionWithRole('dispatcher'), VEHICLE_TRIP_FINANCIAL_ROLES, 'изменение финансовых полей рейса');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toContain('изменение финансовых полей рейса');
    }
  });

  it('blocks a request with no session/role at all (401, not 403)', () => {
    const result = assertRole(null, VEHICLE_TRIP_FINANCIAL_ROLES, 'test');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('blocks an unknown/garbage role', () => {
    const result = assertRole(sessionWithRole('some_random_role'), VEHICLE_TRIP_FINANCIAL_ROLES, 'test');
    expect(result.ok).toBe(false);
  });
});
