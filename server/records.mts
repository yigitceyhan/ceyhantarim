import { HttpError } from './access.mjs';

export type RecordData = Record<string, any>;
export type SharedData = { garaj: RecordData[]; giderler: RecordData[]; kiralar: RecordData[]; satislar: RecordData[]; config: RecordData };
export const collections = ['garaj', 'giderler', 'kiralar', 'satislar'] as const;

function text(value: unknown, max = 1000) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, 'Metin alanı geçersiz veya çok uzun.');
  return value.trim();
}

function amount(value: unknown, signed = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (!signed && value < 0) || Math.abs(value) > 1e12) {
    throw new HttpError(400, 'Tutarlar geçerli bir sayı olmalıdır.');
  }
  return value;
}

function identifier(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new HttpError(400, 'Kayıt numarası geçersiz.');
  return value;
}

function timestamp(value: unknown) {
  const source = text(value, 60);
  if (!source || !Number.isFinite(Date.parse(source))) throw new HttpError(400, 'Kayıt tarihi geçersiz.');
  return new Date(source).toISOString();
}

export function tractor(source: RecordData) {
  const result = {
    id: identifier(source.id), marka: text(source.marka, 100), model: text(source.model, 150),
    yil: text(String(source.yil || ''), 10), plaka: text(source.plaka, 100),
    alisFiyati: amount(source.alisFiyati), hedefFiyat: amount(source.hedefFiyat || 0),
    saticiAd: text(source.saticiAd, 150), saticiTel: text(source.saticiTel, 60),
    notlar: text(source.notlar, 3000), tarihISO: timestamp(source.tarihISO),
  };
  if (!result.marka || !result.model || !result.plaka) throw new HttpError(400, 'Marka, model ve plaka zorunludur.');
  return result;
}

export function expense(source: RecordData) {
  const result = {
    id: identifier(source.id), traktorId: identifier(source.traktorId), plaka: text(source.plaka, 100),
    markaModel: text(source.markaModel, 300), tur: text(source.tur, 150),
    tutar: amount(source.tutar), aciklama: text(source.aciklama, 3000), tarihISO: timestamp(source.tarihISO),
    ekleyenAd: text(source.ekleyenAd, 150), ekleyenId: text(source.ekleyenId, 100),
  };
  if (result.tutar <= 0 || !result.tur) throw new HttpError(400, 'Gider türü ve sıfırdan büyük bir tutar gereklidir.');
  return result;
}

export function settings(source: RecordData = {}) {
  const result: RecordData = {
    companyName: text(source.companyName, 150) || 'CEYHAN TARIM',
    companyAddress: text(source.companyAddress, 500), companyPhone: text(source.companyPhone, 60),
    currency: text(source.currency, 10) || '₺', darkMode: !!source.darkMode,
    autoDarkMode: !!source.autoDarkMode, binlikOtomatik: source.binlikOtomatik !== false,
    sessionTimeoutMin: [0, 5, 15, 30].includes(source.sessionTimeoutMin) ? source.sessionTimeoutMin : 0,
    lastBackupISO: source.lastBackupISO ? timestamp(source.lastBackupISO) : null,
  };
  const defaults = {
    markalar: ['Deutz-Fahr', 'Same', 'Massey Ferguson', 'New Holland', 'Case IH', 'Tümosan', 'Erkunt', 'Hattat', 'John Deere', 'Landini', 'Kubota', 'Başak', 'Diğer'],
    giderTurleri: ['Sanayi & Usta İşçiliği', 'Yedek Parça & Yağ', 'Noter & Devir Ücreti', 'Nakliye, Çekici & Mazot', 'Lastik & Kaporta Boya'],
    kiraKalemleri: ['Dükkan / Depo Kirası', 'Elektrik, Su, İnternet Faturası', 'Eleman Maaşı & Yemek', 'Muhasebe & Vergi Ödemeleri', 'Ofis Mutfak & Ağırlama'],
  };
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    const values = source[key] ?? defaults[key];
    if (!Array.isArray(values) || values.length > 200) throw new HttpError(400, 'Ayar listesi geçersiz.');
    result[key] = [...new Set(values.map(value => text(value, 150)).filter(Boolean))];
  }
  return result;
}

export function validateData(source: RecordData): SharedData {
  if (!source || typeof source !== 'object') throw new HttpError(400, 'Geçersiz yedek verisi.');
  if (source.config !== undefined && (!source.config || typeof source.config !== 'object' || Array.isArray(source.config))) {
    throw new HttpError(400, 'Yedek ayarları geçersiz.');
  }
  const result: SharedData = { garaj: [], giderler: [], kiralar: [], satislar: [], config: settings(source.config) };
  for (const collection of collections) {
    if (!Array.isArray(source[collection]) || source[collection].length > 10000) throw new HttpError(400, 'Kayıt listesi geçersiz veya çok büyük.');
    const seen = new Set();
    for (const record of source[collection]) {
      if (!record || typeof record !== 'object' || seen.has(record.id)) throw new HttpError(400, 'Tekrarlanan veya geçersiz kayıt.');
      seen.add(record.id);
      if (collection === 'garaj') result.garaj.push(tractor(record));
      if (collection === 'giderler') result.giderler.push(expense(record));
      if (collection === 'kiralar') {
        const item = { id: identifier(record.id), kalem: text(record.kalem, 150), tutar: amount(record.tutar), tarihISO: timestamp(record.tarihISO) };
        if (!item.kalem || item.tutar <= 0) throw new HttpError(400, 'Dükkan gideri geçersiz.');
        result.kiralar.push(item);
      }
      if (collection === 'satislar') {
        result.satislar.push({
          id: identifier(record.id), plaka: text(record.plaka, 100), markaModel: text(record.markaModel, 300),
          sabitMaliyet: amount(record.sabitMaliyet), satisCirosu: amount(record.satisCirosu), sabitNetKar: amount(record.sabitNetKar, true),
          aliciAd: text(record.aliciAd, 150), aliciTel: text(record.aliciTel, 60),
          orijinalTraktor: record.orijinalTraktor ? tractor(record.orijinalTraktor) : null,
          iliskiliTakasId: record.iliskiliTakasId ? identifier(record.iliskiliTakasId) : null,
          tarihISO: timestamp(record.tarihISO),
        });
      }
    }
  }
  return result;
}

export function visibleData(data: SharedData, role: string): SharedData {
  if (role === 'admin') return data;
  return {
    garaj: data.garaj.map(item => ({
      id: item.id, marka: item.marka, model: item.model, yil: item.yil,
      plaka: item.plaka, hedefFiyat: item.hedefFiyat, notlar: item.notlar, tarihISO: item.tarihISO,
    })),
    giderler: data.giderler.filter(item => data.garaj.some(tractor => tractor.id === item.traktorId)).map(item => ({
      id: item.id, traktorId: item.traktorId, plaka: item.plaka, markaModel: item.markaModel,
      tur: item.tur, tutar: item.tutar, aciklama: item.aciklama, tarihISO: item.tarihISO,
      ekleyenAd: item.ekleyenAd,
    })),
    kiralar: [], satislar: [],
    config: {
      companyName: data.config.companyName, companyAddress: data.config.companyAddress,
      currency: data.config.currency, markalar: data.config.markalar,
      giderTurleri: data.config.giderTurleri, binlikOtomatik: data.config.binlikOtomatik,
    },
  };
}
