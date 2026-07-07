# Lev&AV LLC TMS - Final Production Lock

## Main Production Workspace
- Primary production workspace (single source of truth):
  - `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM`

## Folders That Must Not Be Deleted
- `app/`
- `components/`
- `lib/`
- `prisma/`
- `scripts/`
- `.git/`
- `BACKUP_RESTORE_POINT/`
- `SYSTEM_BACKUP_INFO/`
- `DAILY_BACKUP/`
- `LAN_CLIENT_WORKSTATION/` (комплект ярлыка для доп. ПК)

## PostgreSQL backups (вне проекта)
- Каталог по умолчанию: `D:\LevAv_Backups\` (дампы, логи). Инструкция: `SYSTEM_BACKUP_INFO\POSTGRES_BACKUP_RESTORE.md`. Ручной запуск: `scripts\RUN_PG_BACKUP_NOW.bat`.

## Main Launcher
- **Главный ПК (сервер):** только `PRODUCTION_START.bat` в этой папке проекта.
- **Дополнительные ПК:** не запускать проект и не открывать `localhost:3000`. Скопировать на рабочий стол папку **`LAN_CLIENT_WORKSTATION`**, в файле `LAN_SERVER_URL.txt` указать `http://<IP_главного_ПК>:3000`, запуск — **`OPEN_LEVAV_TMS.bat`** или ярлык **`LevAV_TMS_LAN.url`** (подробности в `LAN_CLIENT_WORKSTATION/README_RU.txt`).
- Safe stop (на сервере): `SAFE_SHUTDOWN.bat`

## DATABASE_URL Location
- Runtime DB connection is read from local file:
  - `.env` -> `DATABASE_URL`
- Prisma datasource config:
  - `prisma/schema.prisma`

## Runtime Processes
- На **главном ПК:** `node` — production `next start` (см. `package.json`), слушает **0.0.0.0:3000** (LAN + localhost).
- Порт: `3000`
- Браузер на главном ПК: `http://localhost:3000`
- Браузер на **остальных ПК:** `http://<LAN_IP_главного>:3000` (см. вывод `PRODUCTION_START.bat` и комплект `LAN_CLIENT_WORKSTATION`)

## Critically Important Files
- `package.json`
- `package-lock.json`
- `next.config.js`
- `prisma/schema.prisma`
- `.env` (local only, never commit)
- `PRODUCTION_START.bat`
- `SAFE_SHUTDOWN.bat`
- `HEALTH_CHECK.bat`
- `PROJECT_RECOVERY.bat`
- `TECHNICAL_BASELINE.md`
- `SAFE_UPDATE_RULES.md`
- `FINAL_SYSTEM_REPORT.md`

## Lock Rules
- Do not run another TMS project from this workspace.
- Do not create additional **server** launcher `.bat` files in the project root unless explicitly approved. Исключение: комплект **`LAN_CLIENT_WORKSTATION`** — только для доп. ПК, без Node/Postgres.
- Do not auto-modify `DATABASE_URL`.
- Do not perform destructive DB operations from automation scripts.
