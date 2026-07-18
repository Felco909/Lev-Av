# LevAV_MAIN_SYSTEM — контекст для Claude Code

## Стек
Next.js 16.2.10 (App Router) + React 19.2.7 + Prisma 6.7.0 + PostgreSQL, next-auth 4.24.14, TypeScript 5.2.2.
Документы: `docx`, `exceljs`, локальный LibreOffice для PDF (см. ниже).
Работает на основном ПК, доступ по LAN (статический IP 192.168.0.100), порт 3000.

Апгрейд с Next.js 14.2.28/React 18 на Next.js 16/React 19 уже смёржен в master
(`c3536a7 Merge branch 'upgrade/nextjs-16'`) — версии выше актуальны и закоммичены.
На 18.07.2026 отдельно от этого в рабочем дереве незакоммиченные изменения:
`package.json` (добавлен `@google/generative-ai`), `prisma/schema.prisma` (новые поля
`perDiem2`/`perDiem3` в `VehicleTrip` — суточные №2/№3 для мультистрановых маршрутов,
миграция в БД ещё не накатана). Перед серьёзными правками сверяться с `git status`.

Пересборка после изменений в бэкенде:
```
Remove-Item -Recurse -Force .next
npm run build
npm start
```

## Правила работы (важно!)
- Команды в PowerShell — вставлять ПО ОДНОЙ, не склеивать в один блок (иначе баги конкатенации).
- Для путей со спецсимволами (например `[id]`) — использовать `-LiteralPath`.
- Не читать файлы целиком, если нужен только фрагмент — сначала грепать/искать конкретное место.
- Перед правкой БД/финансового модуля — сначала показать план, потом код.
- Перед `npm run build`/`npm start` в проде — проверить, не запущен ли уже процесс на порту 3000/5434.

## Финансовая логика
Формула прибыли (не менять без явного запроса):
```
profit = clientRateAmd + totalClientExpensesAmd - carrierRateAmd - totalCarrierExpensesAmd
```
Точка истины: `lib/finance/formulas.ts:66` (`computeTripProfitAmd()`), вызывается из
`app/(app)/trips/_components/trip-form.tsx:591` (`profitAmd = useMemo(() => computeTripProfitAmd(...))`).
Формула переехала из инлайна в trip-form.tsx в отдельную функцию — используйте
`computeTripProfitAmd()` как точку истины, а не строку в trip-form.tsx.
В том же `lib/finance/formulas.ts` — смежные, но НЕ идентичные хелперы (`computeExpeditionProfitAmd`,
`computeOwnTransportProfitAmd`, используются в `lib/finance/finance-metrics-service.ts` — там расходы
одной суммой, без раздельных client/carrier expenses). Не путать эти места при правках.

Валюты: AMD/RUB/USD/EUR/GEL. Известный баг (уже исправлен, но следить): конвертация RUB считалась по курсу×1.
Единая логика в `lib/finance/*` (`finance-contract.ts`, `finance-metrics-service.ts`, `formulas.ts`,
`types.ts`, `validation-gate.ts`).
Роли с доступом к критичным финансовым полям (`lib/auth/role-guard.ts`):
`admin`, `owner`, `director`, `accountant` — правка `clientPaidAmount*`/`carrierPaidAmount*`/статусов оплаты.
`dispatcher` дополнительно допущен к номерам счёта/акта и генерации PDF/DOCX по заявке.

## Известные проблемные зоны (не наступать повторно)
1. **OneDrive / Postgres** — это НЕ периодическая проблема, а разовый инцидент, разобранный
   и закрытый 07.07.2026. Причина (подтверждено по реестру и меткам времени): обновление
   клиента OneDrive 01.05.2026 молча включило Known Folder Move для Desktop — БД физически
   оказалась внутри `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM\LOCAL_DB_RUNTIME\...`.
   07.07.2026 данные перенесены в `C:\LevAV_DB\pgdata_localprod_utf8` (переезжали только файлы
   БД, не весь проект — сам проект по-прежнему в OneDrive, и это нормально, лишь бы БД была вне).
   `PG_DATA=` в `PRODUCTION_START.bat`/`HEALTH_CHECK.bat`/`SAFE_SHUTDOWN.bat` уже указывает на
   новый путь. Перед серьёзной работой с БД — свериться, что путь всё ещё `C:\LevAV_DB\...`
   (`Get-CimInstance Win32_Process -Filter "Name='postgres.exe'"`, смотреть аргумент `-D`).
2. **PDF-рендеринг** — после перехода с Abacus.AI (внешний, платный, отвалился по оплате)
   на локальный LibreOffice (`soffice --headless`, `lib/pdf-convert.ts`) выяснилось: LibreOffice
   игнорирует CSS `border`/`width`/`background` на `<table>`, но уважает старые HTML4-атрибуты
   (`border="1"`, `width="100%"`, `bgcolor="..."`). Файл: `lib/document-templates.ts`.
   Не использовать grid/flex/сложный CSS в шаблонах документов — только table + HTML4-атрибуты.
3. **Postgres крэшился с exception 0xC000013A** — разобрано и закрыто 13.07.2026. Причина:
   Postgres запускался консольно (`pg_ctl start` из `PRODUCTION_START.bat`), дочерние процессы
   наследовали ту же консоль, что и `npm run start`; любой console control event (закрытие
   окна/Ctrl+C/logoff) убивал случайный дочерний процесс Postgres → полный crash-restart.
   Повторялось 78 раз с 06.05.2026. Решение: Postgres зарегистрирован как служба Windows
   `LevAV_Postgres` (Automatic, Session 0, без консоли). `SAFE_SHUTDOWN.bat` больше не
   останавливает Postgres — служба работает постоянно, батник останавливает только Next.js.
   Подробности и команды отката: `docs/postgres-windows-service.md`.

## Данные (Prisma)
27 моделей в `prisma/schema.prisma`: заявки/рейсы (`Trip`, `VehicleTrip`, `Expense`, `FleetExpense`),
контрагенты (`Client`, `ClientContact`, `Carrier`, `Supplier`), флот (`Vehicle`, `Driver`,
`Maintenance`, `FuelRecord`, `TireSet`, `DocumentExpiry`, `DriverVehicleHistory`), финансы
(`Payment`, `TripHistory`), документы (`DocumentTemplate`, `TripAttachment`, `PartAttachment`),
закупки (`PartPurchase`, `PartPayment`), сервис (`ServiceRegulation`, `ServiceRecord`), `User`, `Setting`.

## Хранилище файлов
Основной путь вложений — локальный диск (`lib/attachment-service.ts`, `storage/uploads/...`,
`/api/upload/local`, `/api/files`). Часть роутов (`clients/[id]/templates`, `templates`,
`part-purchases*`, `documents/by-client`) всё ещё завязана на S3 (`lib/s3.ts`) — на этой машине
нет `~/.aws/credentials`, поэтому эти конкретные роуты сейчас не работают. Не удивляться и не
чинить как "новый баг" — это известный, ещё не закрытый пункт миграции на локальное хранилище.

## Статусы сделок
Воркфлоу: ... → "На оплату" → "Сверка" (чек-лист долг/налоговый код) → "Завершён".

## Бизнес-контекст (для генерации документов/текстов)
- Компания: ООО «Лев Энд Ав», Ереван, ул. С. Таронци 3/18, ИНН 02248043.
- Директор: А. Зограбян (RU) / Ա. Զոհրաբյան (AM) — это НЕ опечатка, разные языковые варианты.
- ~40–50 сделок/мес, 7 своих машин, маршруты Армения↔Россия↔Грузия/СНГ.

## Инструкции по /compact
При сжатии контекста — сохранять код изменений и результаты тестов/логов,
не сохранять историю обсуждений и промежуточные варианты.

## Что НЕ класть в этот файл
- Длинные логи, дампы БД, старые версии кода — только текущие правила и структура.
- Подробные инструкции по миграциям/redeploy — вынести в отдельные .md и ссылаться по пути,
  например `docs/onedrive-migration.md`, `docs/ati-su-integration.md`.
