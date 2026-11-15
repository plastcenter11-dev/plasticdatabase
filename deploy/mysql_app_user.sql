-- A database account just for the program. The program must NOT run as root: if the server is ever
-- broken into, root can read and change every database on the machine, this account only this one.
-- Run once as root (mysql -u root -p < deploy/mysql_app_user.sql) after replacing the password, then put
-- the new user and password in backend/.env (DB_USER / DB_PASS).

CREATE USER IF NOT EXISTS 'plasticdb_app'@'localhost' IDENTIFIED BY 'CHANGE_ME_LONG_RANDOM_PASSWORD';

-- the program's own database: tables are created / altered at start-up, so DDL is needed here
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, LOCK TABLES,
      CREATE TEMPORARY TABLES, SHOW VIEW, TRIGGER, EVENT
   ON plasticdatabase.* TO 'plasticdb_app'@'localhost';

-- the backup restore test (scripts/verify_backup.js) builds and drops a scratch database
GRANT ALL PRIVILEGES ON plasticdb_restore_test.* TO 'plasticdb_app'@'localhost';

-- mysqldump needs this to read the table list without asking for more
GRANT PROCESS ON *.* TO 'plasticdb_app'@'localhost';

FLUSH PRIVILEGES;
