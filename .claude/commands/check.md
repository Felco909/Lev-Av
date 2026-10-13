---
description: Health check of TMS, DB, scheduled jobs, bots and host (short report for phone)
---

Run a READ-ONLY health check of this PC (PC1-TMS). Do NOT restart, stop, fix, edit or
delete anything — only collect facts and report. Fixes happen only after the user confirms.

SECURITY: bot logs contain the Telegram bot token inside request URLs
(`/bot<digits>:<secret>/...`). NEVER print raw log lines, `.env` contents or tokens.
Print only `msg` / `err.message` fields, and mask anything matching `\d{8,}:[A-Za-z0-9_-]{30,}`.

Run independent checks in parallel. Use the PowerShell tool unless noted.

## 1. TMS (Next.js, port 3000)
- Listener: `Get-NetTCPConnection -State Listen -LocalPort 3000` → must exist; get the PID's
  command line, expect `next start -H 0.0.0.0 -p 3000` from `LevAV_MAIN_SYSTEM`.
  Started by `PRODUCTION_START.bat` in a console window (not a service, not pm2).
- HTTP: `Invoke-WebRequest http://localhost:3000/login -UseBasicParsing -TimeoutSec 15` → 200,
  and `http://192.168.0.100:3000/api/auth/session` → 200 (LAN access).
  (`/api/health` needs a session → 401 without login is normal, do not report it.)

## 2. Database (PostgreSQL 17, service `LevAV_Postgres`, port 5434)
- `(Get-Service LevAV_Postgres).Status` → Running, StartType Automatic.
- `& C:\LevAV_DB\pgsql\bin\pg_isready.exe -h localhost -p 5434 -d levav_prod_local` → "accepting connections".
- Do NOT call `psql` without `-w` (it hangs on a password prompt).

## 3. TMS logs — errors in the last 2 hours
- Server log: `.runtime\npm_start_last.log` (Next.js stdout/stderr, NO timestamps). If its
  LastWriteTime is within 2 h, grep the last 300 lines for `error|⨯|unhandled|ECONN|Prisma`
  (case-insensitive). `[finance-audit] ... ok` lines are normal.
- Scheduled jobs (Task Scheduler, all `LevAV *`): for each task show State, LastRunTime,
  LastTaskResult (0 = OK). Expected cadence:
  - `LevAV Company Base Check` — every 5 min → LastRunTime older than 15 min is a problem.
    Log `logs\company_base_check.log`: count `FAILED` lines in the last 2 h.
  - `LevAV Wialon Mileage Sync` — daily 06:00, log `logs\wialon_sync.log`.
  - `LevAV PostgreSQL Daily Backup` — daily 13:00, log
    `%USERPROFILE%\LevAv_Postgres_Backups\logs\pg_backup.log`; newest dump in `...\db\` must be
    < 26 h old and end with `PostgreSQL database dump complete`.
  - `LevAV Attachments Daily Backup` — daily 13:15.

## 4. Bots
Only one bot runs on this PC: `calorit-bmi-bot` (Telegram, long polling) under pm2,
folder `%USERPROFILE%\OneDrive\Desktop\ИМТ БОТ`. `levav_cargo_bot` and `LevAvWhatsApp`
are NOT on this machine — say so in one line, don't search for them.
- Status via Bash (PowerShell's ConvertFrom-Json fails on pm2 output):
  `pm2 jlist | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s))console.log(p.name,p.pm2_env.status,'restarts='+p.pm2_env.restart_time,'uptimeMin='+Math.round((Date.now()-p.pm2_env.pm_uptime)/60000))})"`
- Log: `ИМТ БОТ\logs\bot.log` (pino JSON lines, `time` = epoch ms, level 30 = info, 50 = error).
  The file is ~20 MB — read only the tail (last ~3000 lines) with node and report:
  - time of the last level-30 line (last successful action, e.g. `Расчёт завершён`);
  - number of level-50 lines in the last 2 h, plus the 3 most frequent `msg` + `err.message`
    (e.g. `Ошибка polling` / `ETELEGRAM: 502 Bad Gateway` = Telegram-side outage, usually transient);
  - time of the very last line of any level.
  No log lines for days is not by itself an error (few users) — report as info.
- Telegram reachability: read `BOT_TOKEN` from `ИМТ БОТ\.env` inside a node one-liner and call
  `https://api.telegram.org/bot<token>/getMe`; print only `ok` and `result.username`.
  NEVER call `getUpdates` (it conflicts with the running poller).

## 5. Host
- Free space on C: (`Get-PSDrive C`) → problem if < 10 GB.
- CPU: `(Get-CimInstance Win32_Processor).LoadPercentage`; RAM: free/total from
  `Get-CimInstance Win32_OperatingSystem` → problem if CPU > 90 % or free RAM < 10 %.
- Uptime: `(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime`.

## Report format (Russian, short, phone-friendly, no tables wider than 3 columns)
```
PC1-TMS — OK            (or: PC1-TMS — ПРОБЛЕМА)
ТМС ✅ · БД ✅ · Задачи ✅ · Бот ✅ · Диск/CPU/RAM ✅

Проблемы:
1. <что> — <причина/факт из лога>

Предлагаю:
1. <конкретная команда/действие> — выполню только после «да»
```
If everything is OK, skip "Проблемы"/"Предлагаю" and give 1–2 key numbers instead
(e.g. last backup time, bot last activity).
