# Database Migrations Guide

This directory contains the schema migration infrastructure for the Smart Student Commute Companion backend.

## Structure

```
backend/migrations/
├── cli.js                  # CLI executable entry point
├── migrationRunner.js      # Core migration engine managing transactions and tracking
├── scripts/                # Ordered migration scripts
│   └── 001_initial_schema.js
└── README.md
```

## Migration Commands

Execute commands from the backend directory:

```bash
# Apply all pending migrations
npm run db:migrate

# Rollback the most recently applied migration
npm run db:rollback

# Check applied vs pending migrations
npm run db:status
```

## Creating a New Migration

1. Create a new JavaScript file in `backend/migrations/scripts/` named with a sequential 3-digit prefix and descriptive snake_case name:
   `backend/migrations/scripts/002_add_user_profiles.js`
2. Export `name`, `up(db)`, and `down(db)` functions:
   ```javascript
   module.exports = {
     name: '002_add_user_profiles',

     up(db) {
       db.exec(`
         CREATE TABLE IF NOT EXISTS user_profiles (
           id TEXT PRIMARY KEY,
           college_email TEXT UNIQUE NOT NULL,
           created_at INTEGER NOT NULL
         );
       `);
     },

     down(db) {
       db.exec(`
         DROP TABLE IF EXISTS user_profiles;
       `);
     }
   };
   ```
3. Run `npm run db:migrate` to apply the migration inside a safe transaction.
4. Verify using `npm run db:status`.
