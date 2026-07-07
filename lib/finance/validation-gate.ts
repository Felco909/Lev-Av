export interface ValidationGateConfig {
  enabled: boolean;
  sampleRate: number;
}

function normalizeSampleRate(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Passive internal validation gate.
 * No writes, no user-facing effects.
 */
export function getValidationGateConfig(env: NodeJS.ProcessEnv): ValidationGateConfig {
  const forcedValidation = String(env.FINANCE_INTERNAL_VALIDATION || '').toLowerCase() === 'true';
  const debugMode = env.NODE_ENV !== 'production';
  const enabled = forcedValidation || debugMode;
  const sampleRate = normalizeSampleRate(
    env.FINANCE_INTERNAL_VALIDATION_SAMPLE,
    debugMode ? 0.25 : 0
  );
  return { enabled, sampleRate };
}

export function shouldSample(sampleRate: number): boolean {
  if (sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  return Math.random() <= sampleRate;
}
