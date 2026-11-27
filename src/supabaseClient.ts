import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AgendaCategory,
  AgendaItem,
  AgendaStatus,
  CATEGORIES,
  ConflictInfo,
  DISPOSISI_STATUSES,
  DisposisiStatus,
  POSTER_ILLUSTRATION_OPTIONS,
  PosterIllustrationKey,
  getConflictsForCandidate,
} from './types';

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const rawSupabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(
  rawSupabaseUrl && rawSupabaseAnonKey && isValidHttpUrl(rawSupabaseUrl)
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawSupabaseUrl, rawSupabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    })
  : null;

export function generateAgendaUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function sanitizeZoomUrl(raw?: string | null): string | undefined {
  const val = (raw || '').trim();
  if (!val) return undefined;
  try {
    const parsed = new URL(val);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const VALID_STATUSES: AgendaStatus[] = ['Terjadwal', 'Draft', 'Selesai', 'Dibatalkan'];
const VALID_ILLUSTRATIONS = new Set(POSTER_ILLUSTRATION_OPTIONS.map((o) => o.value));

function normalizeTimeValue(raw: unknown, fallback: string): string {
  const str = String(raw || '').trim();
  const match = str.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : fallback;
}

export function mapAgendaRowFromDb(row: Record<string, unknown>): AgendaItem {
  const rawCategory = String(row.kategori || 'Rapat Internal') as AgendaCategory;
  const rawStatus = String(row.status || 'Terjadwal') as AgendaStatus;
  const rawDisposisi = String(
    row.status_disposisi ?? row.statusDisposisi ?? 'Menunggu Disposisi'
  ) as DisposisiStatus;
  const rawIlustrasi = String(row.ilustrasi || 'auto') as PosterIllustrationKey;

  return {
    id: String(row.id || generateAgendaUuid()),
    judul: String(row.judul || 'Agenda Tanpa Judul'),
    tanggal: String(row.tanggal || '').slice(0, 10),
    jamMulai: normalizeTimeValue(row.jam_mulai ?? row.jamMulai, '09:00'),
    jamSelesai: normalizeTimeValue(row.jam_selesai ?? row.jamSelesai, '11:00'),
    sampaiSelesai: Boolean(row.sampai_selesai ?? row.sampaiSelesai),
    lokasi: String(row.lokasi || 'Menunggu konfirmasi'),
    penyelenggara: String(row.penyelenggara || 'Sekretariat BPBD'),
    pakaian: String(row.pakaian || 'Menyesuaikan'),
    nomorSurat: String(row.nomor_surat ?? row.nomorSurat ?? ''),
    kategori: CATEGORIES.includes(rawCategory) ? rawCategory : 'Rapat Internal',
    status: VALID_STATUSES.includes(rawStatus) ? rawStatus : 'Terjadwal',
    statusDisposisi: DISPOSISI_STATUSES.includes(rawDisposisi)
      ? rawDisposisi
      : 'Menunggu Disposisi',
    pejabatPendamping: String(row.pejabat_pendamping ?? row.pejabatPendamping ?? ''),
    isConfidential: Boolean(row.is_confidential ?? row.isConfidential),
    isUpdated: Boolean(row.is_updated ?? row.isUpdated),
    zoomUrl: sanitizeZoomUrl((row.zoom_url ?? row.zoomUrl) as string | undefined),
    ilustrasi: VALID_ILLUSTRATIONS.has(rawIlustrasi) ? rawIlustrasi : 'auto',
    catatan: String(row.catatan || ''),
    sumber: row.sumber === 'e-Buddy' ? 'e-Buddy' : 'Manual',
    createdBy: String(row.created_by ?? row.createdBy ?? 'Operator'),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
  };
}

export function mapAgendaToDbPayload(item: AgendaItem) {
  return {
    id: item.id,
    judul: item.judul,
    tanggal: item.tanggal,
    jam_mulai: item.jamMulai,
    jam_selesai: item.jamSelesai,
    sampai_selesai: Boolean(item.sampaiSelesai),
    lokasi: item.lokasi,
    penyelenggara: item.penyelenggara,
    pakaian: item.pakaian,
    nomor_surat: item.nomorSurat,
    kategori: item.kategori,
    status: item.status,
    status_disposisi: item.statusDisposisi,
    pejabat_pendamping: item.pejabatPendamping,
    is_confidential: Boolean(item.isConfidential),
    is_updated: Boolean(item.isUpdated),
    zoom_url: sanitizeZoomUrl(item.zoomUrl) || null,
    ilustrasi: item.ilustrasi || 'auto',
    catatan: item.catatan,
    sumber: item.sumber,
    created_by: item.createdBy,
    created_at: item.createdAt,
  };
}

function mapAgendaPatchToDbPayload(patch: Partial<AgendaItem>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (patch.judul !== undefined) payload.judul = patch.judul;
  if (patch.tanggal !== undefined) payload.tanggal = patch.tanggal;
  if (patch.jamMulai !== undefined) payload.jam_mulai = patch.jamMulai;
  if (patch.jamSelesai !== undefined) payload.jam_selesai = patch.jamSelesai;
  if (patch.sampaiSelesai !== undefined) payload.sampai_selesai = Boolean(patch.sampaiSelesai);
  if (patch.lokasi !== undefined) payload.lokasi = patch.lokasi;
  if (patch.penyelenggara !== undefined) payload.penyelenggara = patch.penyelenggara;
  if (patch.pakaian !== undefined) payload.pakaian = patch.pakaian;
  if (patch.nomorSurat !== undefined) payload.nomor_surat = patch.nomorSurat;
  if (patch.kategori !== undefined) payload.kategori = patch.kategori;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.statusDisposisi !== undefined) payload.status_disposisi = patch.statusDisposisi;
  if (patch.pejabatPendamping !== undefined) payload.pejabat_pendamping = patch.pejabatPendamping;
  if (patch.isConfidential !== undefined) payload.is_confidential = Boolean(patch.isConfidential);
  if (patch.isUpdated !== undefined) payload.is_updated = Boolean(patch.isUpdated);
  if (patch.zoomUrl !== undefined) payload.zoom_url = sanitizeZoomUrl(patch.zoomUrl) || null;
  if (patch.ilustrasi !== undefined) payload.ilustrasi = patch.ilustrasi || 'auto';
  if (patch.catatan !== undefined) payload.catatan = patch.catatan;
  if (patch.sumber !== undefined) payload.sumber = patch.sumber;
  return payload;
}

function formatSupabaseError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Terjadi kesalahan koneksi Supabase.';
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [e.message, e.details, e.hint].filter(Boolean);
  return parts.join(' — ') || 'Gagal berkomunikasi dengan database Supabase.';
}

function assertClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Konfigurasi Supabase belum tersedia. Isi environment variables VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.'
    );
  }
  return supabase;
}

export async function fetchAgendasFromSupabase(): Promise<AgendaItem[]> {
  const client = assertClient();
  const { data, error } = await client
    .from('agendas')
    .select('*')
    .order('tanggal', { ascending: true })
    .order('jam_mulai', { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return (data || []).map((row) => mapAgendaRowFromDb(row as Record<string, unknown>));
}

export async function fetchConflictsFromSupabase(candidate: {
  id?: string;
  tanggal: string;
  jamMulai: string;
  jamSelesai: string;
  status?: AgendaStatus;
}): Promise<ConflictInfo[]> {
  if (candidate.status === 'Dibatalkan' || candidate.status === 'Draft') return [];
  const client = assertClient();
  const { data, error } = await client
    .from('agendas')
    .select('*')
    .eq('tanggal', candidate.tanggal)
    .neq('status', 'Dibatalkan')
    .neq('status', 'Draft');

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  const dayAgendas = (data || []).map((row) => mapAgendaRowFromDb(row as Record<string, unknown>));
  return getConflictsForCandidate(dayAgendas, candidate);
}

export async function insertAgendaToSupabase(item: AgendaItem): Promise<AgendaItem> {
  const client = assertClient();
  const payload = mapAgendaToDbPayload(item);
  const { data, error } = await client.from('agendas').insert(payload).select('*').single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return mapAgendaRowFromDb(data as Record<string, unknown>);
}

export async function updateAgendaInSupabase(
  id: string,
  patch: Partial<AgendaItem>
): Promise<AgendaItem> {
  const client = assertClient();
  const payload = mapAgendaPatchToDbPayload(patch);
  const { data, error } = await client
    .from('agendas')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return mapAgendaRowFromDb(data as Record<string, unknown>);
}

export async function deleteAgendaFromSupabase(id: string): Promise<void> {
  const client = assertClient();
  const { error } = await client.from('agendas').delete().eq('id', id);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
}

function normalizeIdsForUuidIfNeeded(items: AgendaItem[]): AgendaItem[] {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return items.map((item) => ({
    ...item,
    id: uuidRegex.test(item.id) ? item.id : generateAgendaUuid(),
  }));
}

export async function syncImportedAgendasToSupabase(
  items: AgendaItem[],
  mode: 'merge' | 'replace'
): Promise<{ saved: AgendaItem[]; addedCount: number }> {
  const client = assertClient();

  const upsertWithUuidFallback = async (rowsToUpsert: AgendaItem[]) => {
    const payloads = rowsToUpsert.map(mapAgendaToDbPayload);
    const { error } = await client.from('agendas').upsert(payloads, { onConflict: 'id' });
    if (error && error.code === '22P02') {
      const uuidPayloads = normalizeIdsForUuidIfNeeded(rowsToUpsert).map(mapAgendaToDbPayload);
      const retry = await client.from('agendas').upsert(uuidPayloads, { onConflict: 'id' });
      if (retry.error) {
        throw new Error(formatSupabaseError(retry.error));
      }
      return;
    }
    if (error) {
      throw new Error(formatSupabaseError(error));
    }
  };

  if (mode === 'replace') {
    const existing = await fetchAgendasFromSupabase();
    if (existing.length > 0) {
      const existingIds = existing.map((a) => a.id);
      const { error: delError } = await client.from('agendas').delete().in('id', existingIds);
      if (delError) {
        throw new Error(formatSupabaseError(delError));
      }
    }
    if (items.length === 0) {
      return { saved: [], addedCount: 0 };
    }
    await upsertWithUuidFallback(items);
    const saved = await fetchAgendasFromSupabase();
    return { saved, addedCount: saved.length };
  }

  const existing = await fetchAgendasFromSupabase();
  const existingIds = new Set(existing.map((a) => a.id));
  const newItems = items.filter((a) => !existingIds.has(a.id));
  if (newItems.length === 0) {
    return { saved: existing, addedCount: 0 };
  }
  await upsertWithUuidFallback(newItems);
  const refreshed = await fetchAgendasFromSupabase();
  return { saved: refreshed, addedCount: newItems.length };
}

export function subscribeAgendasRealtime(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel('agendas-realtime-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agendas' }, () => {
      onChange();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
