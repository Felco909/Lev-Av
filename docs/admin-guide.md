# Руководство администратора — LevAV TMS

## Запуск / остановка

```
PRODUCTION_START.bat   — запуск (проверки окружения → сборка при необходимости → npm start)
SAFE_SHUTDOWN.bat      — остановка Next.js (Postgres — служба Windows, работает постоянно, не трогается)
RESTART_LOCAL_TMS.bat  — SAFE_SHUTDOWN + PRODUCTION_START
HEALTH_CHECK.bat       — проверка окружения без запуска (Node/npm/.env/БД/порт/хранилище)
```

Пересборка после изменений в коде:
```
Remove-Item -Recurse -Force .next
npm run build
npm start
```
Либо: `set FORCE_FULL_BUILD=1` перед `PRODUCTION_START.bat` — пересоберёт автоматически и сам остановит предыдущий процесс на порту 3000.

## Проверка работоспособности

1. `HEALTH_CHECK.bat --no-pause` → `[RESULT] READY`, `FAIL=0`.
2. Открыть http://192.168.0.100:3000 (или localhost на самой машине) — Dashboard должен загрузиться без ошибок.
3. `npm test` — автотесты формул должны быть все зелёными (111 тестов на 01.08.2026).
4. Проверить логи бэкапов (см. ниже) — за сегодня должна быть запись `END backup success` без последующего WARN.

## Резервное копирование

| Что | Скрипт | Расписание | Хранится |
|---|---|---|---|
| База данных | `scripts/pg-backup-daily.ps1` | 13:00 ежедневно | 30 файлов, `C:\Users\user\LevAv_Postgres_Backups\db\` |
| Вложения заявок | `scripts/attachments-backup-daily.ps1` | 13:15 ежедневно | 14 архивов, `...\attachments\` |
| Off-site копия | `scripts/copy-sql-backup-to-google-drive.ps1` (переиспользуется для обоих) | после каждого локального бэкапа | `G:\Мой диск\LevAv_DB_Backups\` и `...\LevAv_Attachments_Backups\` |

Логи: `C:\Users\user\LevAv_Postgres_Backups\logs\{pg_backup,attachments_backup,google_drive_backup}.log`.

**Google Drive копирование** самовосстанавливается при зависании `GoogleDriveFS.exe` (авто-перезапуск процесса + ожидание монтирования диска G: до 45 сек, см. `copy-sql-backup-to-google-drive.ps1`). Если WARN всё же появляется несколько дней подряд — проверить вручную:
```
Test-Path "G:\"
Get-Process GoogleDriveFS
```

**Восстановление БД из бэкапа:**
```
psql -h localhost -p 5434 -U postgres -d levav_prod_local -f <файл>.sql
```
(Файл в plain SQL формате, `--clean --if-exists` — можно применять на существующую БД, старые объекты будут пересозданы.)

**Восстановление вложений:** распаковать `.zip` из `attachments/` в `storage/uploads/` (перезаписать).

## Плановые задачи Windows Task Scheduler

`LevAV Company Base Check` (каждые 5 мин), `LevAV PostgreSQL Daily Backup` (13:00), `LevAV Wialon Mileage Sync` (06:00), `LevAV Attachments Daily Backup` (13:15) — все зарегистрированы с `LogonType=S4U` (не создают видимых окон). Проверка: `Get-ScheduledTask | Where TaskName -like 'LevAV*'`.

## Восстановление после аварийного завершения

- **Postgres** — служба Windows `LevAV_Postgres` (Automatic), перезапускается сама при перезагрузке ОС. Проверка: `Get-Service LevAV_Postgres`.
- **Next.js** — не служба, требует ручного/скриптового перезапуска (`PRODUCTION_START.bat`). Порт 3000 при повторном запуске освобождается автоматически (`scripts/port-3000-recovery.ps1`), включая зависшие процессы этого же проекта.
- Данные не теряются при падении Next.js — вся запись идёт через Prisma-транзакции в Postgres, который переживает падение веб-слоя независимо.

## Известные проблемные зоны (см. также CLAUDE.md)

1. OneDrive/Postgres — БД физически хранится вне OneDrive (`C:\LevAV_DB\...`), инцидент закрыт 07.07.2026.
2. PDF — только table + HTML4-атрибуты в шаблонах (LibreOffice игнорирует CSS grid/flex/border на table).
3. Postgres как служба Windows (не консольный процесс) — решение краш-инцидента от 13.07.2026.
4. PDF-экспорт занимает ~13-14 сек (LibreOffice создаёт новый профиль на каждый вызов — осознанное решение против бага с блокировкой профиля при параллельных вызовах; не оптимизировать без явного запроса).
5. `storage/uploads/` не синхронизируется OneDrive автоматически (клиент OneDrive сейчас не запущен) — резервируется отдельным скриптом (см. выше), это единственная защита.

## Роли пользователей

Управляются через `User.role`. Критичные финансовые поля — только `admin/owner/director/accountant`. `dispatcher` — обычная работа + номера документов + генерация PDF/DOCX.
