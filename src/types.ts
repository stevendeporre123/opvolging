export type Rol = 'bestuursondersteuning' | 'schepen' | 'raadslid';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_TITEL: string;
  APP_BASE_URL: string;
  MAIL_AFZENDER: string;
  SESSION_SECRET: string;
  RESEND_API_KEY?: string;
  SHAREPOINT_IMPORT_KEY?: string;
}

export interface SessionUser {
  id: number;
  email: string;
  naam: string;
  rol: Rol;
  schepen_id: number | null;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: SessionUser;
  }
}
