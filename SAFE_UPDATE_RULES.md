# Lev&AV LLC TMS - Safe Update Rules

## Mandatory Rules
1. Before any code/config change, create a Git commit restore point.
2. Never change `DATABASE_URL` automatically in scripts or tooling.
3. Never delete this workspace without a full audit and explicit confirmation.
4. Do not create new TMS projects inside the current workspace.
5. Keep a single launcher: do not create a second `start.bat`.
6. Do not mix test and production configurations in the same runtime file.

## Environment Safety
- `.env` and `.env.local` are local-only and must stay out of Git.
- Use `.env.example` and `.env.local.example` as templates only.
- Any credential rotation must be done explicitly and documented.

## Deployment and Runtime Safety
- Validate port conflicts before startup (port `3000` check).
- Do not run destructive Prisma commands against production connections.
- Prefer additive migrations and safe schema evolution patterns.

## Operational Discipline
- Keep one source of truth workspace:
  - `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM`
- Do not duplicate project trees for quick experiments.
- Any infrastructure update must include:
  - rollback plan
  - startup verification
  - basic health check verification
