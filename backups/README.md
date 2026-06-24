# Database Backup

## File
`voter_platform_backup_20260624.sql.xz` — Full dump of `voter_platform_mt`
Includes: 6 Dhaka South candidates, geo layers, ~1.9M voters, layer definitions, admin user.

## Restore
```bash
xz -d -c voter_platform_backup_20260624.sql.xz | psql postgres://voter:voter@localhost:5432/voter_platform_mt
```

Replace the connection URL with your target database URL.

## Admin login
- Username: `admin`
- Password: `admin123`
