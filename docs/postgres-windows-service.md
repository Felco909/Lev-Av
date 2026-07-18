# PostgreSQL как служба Windows (LevAV_Postgres)

## Причина

До 13.07.2026 PostgreSQL запускался через `pg_ctl.exe ... start` прямо из консольного
окна `PRODUCTION_START.bat`, которое затем держало `npm run start` в foreground. На Windows
дочерние процессы Postgres (backend/WAL writer/checkpointer/autovacuum/...) создаются через
`EXEC_BACKEND` и наследуют ту же консоль, что и postmaster. Любой console control event
в этой консоли (закрытие окна, Ctrl+C, logoff, сон/пробуждение сессии) рассылается всем
процессам консоли — из-за этого случайный дочерний процесс Postgres падал с
`exception 0xC000013A` (`STATUS_CONTROL_C_EXIT`), что запускало полный crash-restart
кластера. Это происходило 78 раз с 06.05.2026 по 13.07.2026, последний раз вызвал полный
простой БД.

Решение: PostgreSQL зарегистрирован как настоящая служба Windows — работает в Session 0,
без какой-либо консоли, и не может получить console control event в принципе.

## Текущая конфигурация

- Имя службы: `LevAV_Postgres`
- Тип запуска: `Automatic` (поднимается при загрузке Windows, не зависит от батников)
- `PGDATA`: `C:\LevAV_DB\pgdata_localprod_utf8` (не менялся)
- Порт: `5434`
- Лог: `LOCAL_DB_RUNTIME\pg_local_utf8.log` (без изменений)
- Обычному пользователю (`win-h4e5l2o21cs\user`) через `sc sdset` выданы права
  start/stop/query на эту службу — `PRODUCTION_START.bat`/`SAFE_SHUTDOWN.bat` управляют
  ей (`net start` / `net stop`) без запроса UAC.
- `SAFE_SHUTDOWN.bat` больше не останавливает Postgres — служба работает постоянно;
  батник останавливает только Next.js.

## Как это было настроено (для повторения на другой машине)

Из PowerShell "от имени администратора" (разово):
```powershell
$PG_BIN  = "<PROJECT_DIR>\LOCAL_DB_RUNTIME\pgsql_full\pgsql\bin"
$PG_DATA = "C:\LevAV_DB\pgdata_localprod_utf8"
$PG_LOG  = "<PROJECT_DIR>\LOCAL_DB_RUNTIME\pg_local_utf8.log"

& "$PG_BIN\pg_ctl.exe" register -N "LevAV_Postgres" -D $PG_DATA -l $PG_LOG -S auto -o "-p 5434"
net start LevAV_Postgres

$sid = (New-Object System.Security.Principal.NTAccount("<COMPUTERNAME>","<user>")).Translate([System.Security.Principal.SecurityIdentifier]).Value
$current = (sc.exe sdshow LevAV_Postgres) -join ""
$idx = $current.IndexOf("S:")
$dPart = $current.Substring(0, $idx); $sPart = $current.Substring($idx)
$newSddl = "$dPart(A;;RPWPDTLOCR;;;$sid)$sPart"
sc.exe sdset LevAV_Postgres $newSddl
```

## Откат

Служба не трогает файлы данных — снять регистрацию можно в любой момент:
```
net stop LevAV_Postgres
pg_ctl unregister -N "LevAV_Postgres"
```
После этого вернуть старые версии `PRODUCTION_START.bat`/`SAFE_SHUTDOWN.bat` через git
(`git checkout -- PRODUCTION_START.bat SAFE_SHUTDOWN.bat`), если нужно вернуться к
консольному запуску.

## Проверка

```
sc query LevAV_Postgres
pg_isready -h localhost -p 5434 -d levav_prod_local
```
