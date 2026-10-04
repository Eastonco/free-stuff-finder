// Same DB_* env vars and defaults the Python side reads (backend/db.py).
export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function dbConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  return {
    host: env.DB_HOST ?? "localhost",
    port: Number(env.DB_PORT ?? 5432),
    user: env.DB_USER ?? "postgres",
    password: env.DB_PASSWORD ?? "postgres",
    database: env.DB_NAME ?? "craigslist",
  };
}
