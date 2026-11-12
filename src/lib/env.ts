const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not configured. Copy .env.example to .env.local and point it at a PostgreSQL instance.",
  );
}

export const dbUrl = connectionString;
