import { Hono } from 'hono';
import type { Env } from './types';
import { authRoutes } from './routes/auth';
import { schepenenRoutes } from './routes/schepenen';
import { organenRoutes } from './routes/organen';
import { kalenderRoutes } from './routes/kalender';
import { werknotaRoutes } from './routes/werknota';
import { afsprakenRoutes } from './routes/afspraken';
import { usersRoutes } from './routes/users';

const app = new Hono<{ Bindings: Env }>();

app.route('/api/auth', authRoutes);
app.route('/api/schepenen', schepenenRoutes);
app.route('/api/organen', organenRoutes);
app.route('/api/kalender', kalenderRoutes);
app.route('/api/werknota', werknotaRoutes);
app.route('/api/afspraken', afsprakenRoutes);
app.route('/api/users', usersRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ fout: 'Niet gevonden' }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
