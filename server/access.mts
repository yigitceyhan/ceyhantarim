import { admin, getUser } from '@netlify/identity';

export const ownerEmail = () => (process.env.CEYHAN_OWNER_EMAIL || 'Thelock4355@gmail.com').trim().toLowerCase();

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function authorize() {
  const session = await getUser();
  if (!session) throw new HttpError(401, 'Oturumunuz kapandı. Lütfen tekrar giriş yapın.');
  let user;
  try {
    user = await admin.getUser(session.id);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      throw new HttpError(401, 'Hesap erişiminiz kaldırıldı.');
    }
    throw error;
  }
  if (!user.confirmedAt) throw new HttpError(403, 'Önce e-posta adresinizi doğrulayın.');
  const role = user.email?.toLowerCase() === ownerEmail() ? 'admin' : 'staff';
  if (role === 'staff' && !user.roles?.includes('staff')) {
    throw new HttpError(403, 'Bu hesap yetkili değil. Patron hesabından personel erişimi tanımlanmalıdır.');
  }
  return { id: user.id, name: user.name || 'Personel', role };
}

export function checkOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    throw new HttpError(403, 'Bu işlem yalnızca uygulama içinden yapılabilir.');
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  return json({ error: 'Sunucuya ulaşılamadı. Kaydın durumunu kontrol edip tekrar deneyin.' }, 503);
}

export async function readBody(request: Request) {
  const source = await request.text();
  if (Buffer.byteLength(source) > 5_000_000) throw new HttpError(413, 'Dosya çok büyük. En fazla 5 MB yükleyebilirsiniz.');
  try {
    const body = JSON.parse(source);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, 'Geçersiz işlem verisi.');
  }
}
