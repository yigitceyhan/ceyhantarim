import { getDatabase } from '@netlify/database';
import { authorize, checkOrigin, failure, HttpError, json, readBody } from '../../server/access.mjs';
import { collections, expense, settings, validateData, visibleData, type SharedData } from '../../server/records.mjs';

type DatabaseClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>;
  release: () => void;
};

export default async (request: Request) => {
  let client: DatabaseClient | undefined;
  try {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Desteklenmeyen işlem.' }, 405);
    if (request.method === 'POST') checkOrigin(request);
    const user = await authorize();
    const body = request.method === 'POST' ? await readBody(request) : null;
    const database = getDatabase();
    client = await database.pool.connect() as unknown as DatabaseClient;
    await client.query(request.method === 'GET' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    const { rows: states } = await client.query('SELECT * FROM ceyhan_state WHERE id = 1' + (body ? ' FOR UPDATE' : ''));
    const state = states[0];
    if (!state) throw new HttpError(503, 'Ortak veritabanı henüz hazır değil.');
    const params = new URL(request.url).searchParams;
    if (!body && params.get('revision') === String(state.revision) && params.get('role') === user.role) {
      await client.query('COMMIT');
      return json({ revision: state.revision, user, unchanged: true });
    }
    const { rows } = await client.query('SELECT collection, data FROM ceyhan_records ORDER BY data->>\'tarihISO\', id');
    let data: SharedData = { garaj: [], giderler: [], kiralar: [], satislar: [], config: settings(state.config) };
    for (const row of rows) data[row.collection as typeof collections[number]].push(row.data);
    let revision = state.revision;
    if (body) {
      if (body.action === 'expense') {
        if (!body.expense || typeof body.expense !== 'object') throw new HttpError(400, 'Masraf bilgisi gerekli.');
        const item = expense({ ...body.expense, ekleyenAd: user.name, ekleyenId: user.id, tarihISO: new Date().toISOString() });
        const existing = data.giderler.find(record => record.id === item.id);
        if (existing && existing.ekleyenId !== user.id) throw new HttpError(409, 'Kayıt numarası zaten kullanılıyor.');
        if (!existing) {
          const tractor = data.garaj.find(record => record.id === item.traktorId);
          if (!tractor) throw new HttpError(409, 'Bu traktör artık garajda değil. Listeyi yenileyip tekrar deneyin.');
          if (!data.config.giderTurleri.includes(item.tur)) throw new HttpError(400, 'Geçerli bir gider türü seçin.');
          item.plaka = tractor.plaka;
          item.markaModel = tractor.marka + ' ' + tractor.model;
          await client.query('INSERT INTO ceyhan_records (collection, id, data) VALUES ($1, $2, $3::jsonb)', ['giderler', item.id, JSON.stringify(item)]);
          data.giderler.push(item);
          revision += 1;
        }
      } else if (body.action === 'save') {
        if (user.role !== 'admin') throw new HttpError(403, 'Bu işlem yalnızca patron hesabına açıktır.');
        if (!Number.isInteger(body.revision) || body.revision !== revision) {
          throw new HttpError(409, 'Başka bir cihaz kayıtları değiştirdi. Güncel liste yüklendi; işleminizi tekrar yapın.');
        }
        data = validateData(body.data);
        await client.query('DELETE FROM ceyhan_records');
        const entries = collections.flatMap(collection => data[collection].map(item => ({ collection, id: item.id, data: item })));
        if (entries.length) {
          await client.query(
            'INSERT INTO ceyhan_records (collection, id, data) SELECT collection, id, data FROM jsonb_to_recordset($1::jsonb) AS incoming(collection text, id text, data jsonb)',
            [JSON.stringify(entries)],
          );
        }
        revision += 1;
      } else {
        throw new HttpError(400, 'İşlem türü geçersiz.');
      }
      await client.query('UPDATE ceyhan_state SET revision = $1, config = $2::jsonb, updated_at = NOW(), updated_by = $3 WHERE id = 1', [revision, JSON.stringify(data.config), user.id]);
    }
    await client.query('COMMIT');
    return json({ revision, user, data: visibleData(data, user.role) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return failure(error);
  } finally {
    client?.release();
  }
};
