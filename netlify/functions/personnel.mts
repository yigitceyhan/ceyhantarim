import { randomBytes } from 'node:crypto';
import { admin } from '@netlify/identity';
import { authorize, checkOrigin, failure, HttpError, json, ownerEmail, readBody } from '../../server/access.mjs';

export default async (request: Request) => {
  try {
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'Desteklenmeyen işlem.' }, 405);
    if (request.method !== 'GET') checkOrigin(request);
    const current = await authorize();
    if (current.role !== 'admin') throw new HttpError(403, 'Personel hesaplarını yalnızca patron yönetebilir.');
    if (request.method === 'POST') {
      const body = await readBody(request);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 150 || email === ownerEmail()) {
        throw new HttpError(400, 'Geçerli bir personel adı ve e-posta adresi girin.');
      }
      const created = await admin.createUser({ email, password: randomBytes(32).toString('base64url'), data: { app_metadata: { roles: ['staff'] }, user_metadata: { full_name: name } } });
      await admin.updateUser(created.id, { app_metadata: { ...created.appMetadata, roles: ['staff'] }, user_metadata: { full_name: name } });
      return json({ ok: true }, 201);
    }
    if (request.method === 'DELETE') {
      const body = await readBody(request);
      if (typeof body.id !== 'string' || body.id === current.id) throw new HttpError(400, 'Bu hesap kaldırılamaz.');
      const target = await admin.getUser(body.id);
      if (target.email?.toLowerCase() === ownerEmail() || !target.roles?.includes('staff')) throw new HttpError(403, 'Bu hesap kaldırılamaz.');
      await admin.deleteUser(target.id);
      return json({ ok: true });
    }
    const users = [];
    for (let page = 1; page <= 100; page += 1) {
      const batch = await admin.listUsers({ page, perPage: 100 });
      users.push(...batch.filter(user => user.roles?.includes('staff')).map(user => ({ id: user.id, name: user.name || 'Personel', email: user.email })));
      if (batch.length < 100) break;
    }
    return json({ users });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 422) {
      return json({ error: 'Bu e-posta zaten kayıtlı. Hesap listesini kontrol edin veya giriş ekranından şifre yenileme bağlantısı isteyin.' }, 409);
    }
    return failure(error);
  }
};
