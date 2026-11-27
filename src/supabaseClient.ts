import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AgendaCategory,
  AgendaItem,
  AgendaStatus,
  CATEGORIES,
  ConflictInfo,
  KontakAtasanItem,
  POSTER_ILLUSTRATION_OPTIONS,
  PosterIllustrationKey,
  ROLE_META,
  RoleCode,
  UserAccount,
  formatRentangWaktu,
  formatWhatsAppNumber,
  getConflictsForCandidate,
  minutesToTime,
  timeToMinutes,
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

function normalizeTimeToken(raw: string, fallback: string): string {
  const normalized = raw.trim().replace('.', ':');
  const match = normalized.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hh = match[1].padStart(2, '0');
  const mm = match[2];
  return `${hh}:${mm}`;
}

export function parseWaktuRange(rawWaktu: unknown): {
  jamMulai: string;
  jamSelesai: string;
  sampaiSelesai: boolean;
} {
  const text = String(rawWaktu || '').trim();
  if (!text) {
    return { jamMulai: '09:00', jamSelesai: '11:00', sampaiSelesai: false };
  }

  const timeMatches = text.match(/\d{1,2}[:.]\d{2}/g) || [];
  const jamMulai = timeMatches[0] ? normalizeTimeToken(timeMatches[0], '09:00') : '09:00';
  const isSelesai = /selesai/i.test(text);

  if (isSelesai) {
    const estimatedEnd = minutesToTime(timeToMinutes(jamMulai) + 120);
    return { jamMulai, jamSelesai: estimatedEnd, sampaiSelesai: true };
  }

  if (timeMatches.length >= 2) {
    const jamSelesai = normalizeTimeToken(timeMatches[1], '11:00');
    const safeEnd =
      timeToMinutes(jamSelesai) > timeToMinutes(jamMulai)
        ? jamSelesai
        : minutesToTime(timeToMinutes(jamMulai) + 120);
    return { jamMulai, jamSelesai: safeEnd, sampaiSelesai: false };
  }

  return {
    jamMulai,
    jamSelesai: minutesToTime(timeToMinutes(jamMulai) + 120),
    sampaiSelesai: false,
  };
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =========================================================================
// TABEL `agenda` (id, judul, tanggal, waktu, tempat, bidang_pic, status, no_wa_atasan, sudah_diingatkan)
// =========================================================================
const AGENDA_BASE_SELECT_COLUMNS = 'id, judul, tanggal, waktu, tempat, bidang_pic, status';
const AGENDA_SELECT_COLUMNS =
  'id, judul, tanggal, waktu, tempat, bidang_pic, status, no_wa_atasan, sudah_diingatkan';

function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; details?: string };
  const text = `${e.message || ''} ${e.details || ''}`.toLowerCase();
  return (
    e.code === '42703' ||
    e.code === 'PGRST204' ||
    text.includes('no_wa_atasan') ||
    text.includes('sudah_diingatkan')
  );
}

export function mapAgendaRowFromDb(row: Record<string, unknown>): AgendaItem {
  const parsedWaktu = parseWaktuRange(row.waktu);
  const rawStatus = String(row.status || 'Terjadwal') as AgendaStatus;
  const rawCategory = String(row.kategori || 'Rapat Internal') as AgendaCategory;
  const rawIlustrasi = String(row.ilustrasi || 'auto') as PosterIllustrationKey;
  const bidangPic = String(row.bidang_pic ?? row.pejabat_pendamping ?? row.penyelenggara ?? 'Sekretariat BPBD').trim();

  return {
    id: String(row.id || generateAgendaUuid()),
    judul: String(row.judul || 'Agenda Tanpa Judul'),
    tanggal: String(row.tanggal || '').slice(0, 10),
    jamMulai: row.jam_mulai ? normalizeTimeToken(String(row.jam_mulai), parsedWaktu.jamMulai) : parsedWaktu.jamMulai,
    jamSelesai: row.jam_selesai ? normalizeTimeToken(String(row.jam_selesai), parsedWaktu.jamSelesai) : parsedWaktu.jamSelesai,
    sampaiSelesai:
      typeof row.sampai_selesai === 'boolean' ? row.sampai_selesai : parsedWaktu.sampaiSelesai,
    lokasi: String(row.tempat ?? row.lokasi ?? 'Menunggu konfirmasi'),
    penyelenggara: bidangPic || 'Sekretariat BPBD',
    pakaian: String(row.pakaian || 'Menyesuaikan'),
    nomorSurat: String(row.nomor_surat ?? ''),
    kategori: CATEGORIES.includes(rawCategory) ? rawCategory : 'Rapat Internal',
    status: VALID_STATUSES.includes(rawStatus) ? rawStatus : 'Terjadwal',
    statusDisposisi: 'Menunggu Disposisi',
    pejabatPendamping: bidangPic,
    isConfidential: Boolean(row.is_confidential ?? false),
    isUpdated: Boolean(row.is_updated ?? false),
    zoomUrl: sanitizeZoomUrl((row.zoom_url ?? row.zoomUrl) as string | undefined),
    noWaAtasan: row.no_wa_atasan ? String(row.no_wa_atasan).trim() : '',
    sudahDiingatkan: Boolean(row.sudah_diingatkan ?? false),
    ilustrasi: VALID_ILLUSTRATIONS.has(rawIlustrasi) ? rawIlustrasi : 'auto',
    catatan: String(row.catatan || ''),
    sumber: row.sumber === 'e-Buddy' ? 'e-Buddy' : 'Manual',
    createdBy: String(row.created_by ?? 'Operator'),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export function mapAgendaToDbPayload(item: AgendaItem, includeReminderCols = true) {
  const base = {
    id: item.id,
    judul: item.judul,
    tanggal: item.tanggal,
    waktu: formatRentangWaktu(item),
    tempat: item.lokasi || 'Menunggu konfirmasi',
    bidang_pic: (item.pejabatPendamping || item.penyelenggara || 'Sekretariat BPBD').trim(),
    status: item.status,
  };
  if (!includeReminderCols) return base;
  return {
    ...base,
    no_wa_atasan: item.noWaAtasan?.trim() || null,
    sudah_diingatkan: Boolean(item.sudahDiingatkan),
  };
}

function mapAgendaPatchToDbPayload(
  patch: Partial<AgendaItem>,
  baseItem?: AgendaItem,
  includeReminderCols = true
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (patch.judul !== undefined) payload.judul = patch.judul;
  if (patch.tanggal !== undefined) payload.tanggal = patch.tanggal;
  if (
    patch.jamMulai !== undefined ||
    patch.jamSelesai !== undefined ||
    patch.sampaiSelesai !== undefined
  ) {
    const jamMulai = patch.jamMulai ?? baseItem?.jamMulai ?? '09:00';
    const jamSelesai = patch.jamSelesai ?? baseItem?.jamSelesai ?? '11:00';
    const sampaiSelesai = patch.sampaiSelesai ?? baseItem?.sampaiSelesai ?? false;
    payload.waktu = formatRentangWaktu({ jamMulai, jamSelesai, sampaiSelesai });
  }
  if (patch.lokasi !== undefined) {
    payload.tempat = patch.lokasi || 'Menunggu konfirmasi';
  }
  if (patch.pejabatPendamping !== undefined || patch.penyelenggara !== undefined) {
    const pic = (
      patch.pejabatPendamping ??
      baseItem?.pejabatPendamping ??
      patch.penyelenggara ??
      baseItem?.penyelenggara ??
      'Sekretariat BPBD'
    ).trim();
    payload.bidang_pic = pic || 'Sekretariat BPBD';
  }
  if (patch.status !== undefined) payload.status = patch.status;
  if (includeReminderCols) {
    if (patch.noWaAtasan !== undefined) {
      payload.no_wa_atasan = patch.noWaAtasan.trim() || null;
    }
    if (patch.sudahDiingatkan !== undefined) {
      payload.sudah_diingatkan = Boolean(patch.sudahDiingatkan);
    }
  }
  return payload;
}

export async function fetchAgendasFromSupabase(): Promise<AgendaItem[]> {
  const client = assertClient();
  const { data, error } = await client
    .from('agenda')
    .select(AGENDA_SELECT_COLUMNS)
    .order('tanggal', { ascending: true })
    .order('waktu', { ascending: true });

  if (error && isMissingColumnError(error)) {
    const fallback = await client
      .from('agenda')
      .select(AGENDA_BASE_SELECT_COLUMNS)
      .order('tanggal', { ascending: true })
      .order('waktu', { ascending: true });
    if (fallback.error) {
      throw new Error(formatSupabaseError(fallback.error));
    }
    return (fallback.data || []).map((row) => mapAgendaRowFromDb(row as Record<string, unknown>));
  }

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
    .from('agenda')
    .select(AGENDA_BASE_SELECT_COLUMNS)
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
  const payload = mapAgendaToDbPayload(item, true);
  const { data, error } = await client
    .from('agenda')
    .insert(payload)
    .select(AGENDA_SELECT_COLUMNS)
    .single();

  if (error && isMissingColumnError(error)) {
    const fallbackPayload = mapAgendaToDbPayload(item, false);
    const fallback = await client
      .from('agenda')
      .insert(fallbackPayload)
      .select(AGENDA_BASE_SELECT_COLUMNS)
      .single();
    if (fallback.error) {
      throw new Error(formatSupabaseError(fallback.error));
    }
    return {
      ...mapAgendaRowFromDb(fallback.data as Record<string, unknown>),
      noWaAtasan: item.noWaAtasan?.trim() || '',
      sudahDiingatkan: Boolean(item.sudahDiingatkan),
    };
  }

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return mapAgendaRowFromDb(data as Record<string, unknown>);
}

export async function updateAgendaInSupabase(
  id: string,
  patch: Partial<AgendaItem>,
  baseItem?: AgendaItem
): Promise<AgendaItem> {
  const client = assertClient();
  const payload = mapAgendaPatchToDbPayload(patch, baseItem, true);

  if (Object.keys(payload).length === 0) {
    if (baseItem) {
      return { ...baseItem, ...patch };
    }
    const { data, error } = await client
      .from('agenda')
      .select(AGENDA_SELECT_COLUMNS)
      .eq('id', id)
      .single();
    if (error) throw new Error(formatSupabaseError(error));
    return { ...mapAgendaRowFromDb(data as Record<string, unknown>), ...patch };
  }

  const { data, error } = await client
    .from('agenda')
    .update(payload)
    .eq('id', id)
    .select(AGENDA_SELECT_COLUMNS)
    .single();

  if (error && isMissingColumnError(error)) {
    const fallbackPayload = mapAgendaPatchToDbPayload(patch, baseItem, false);
    if (Object.keys(fallbackPayload).length === 0) {
      throw new Error(
        'Kolom no_wa_atasan / sudah_diingatkan belum dibuat di tabel agenda Supabase.'
      );
    }
    const fallback = await client
      .from('agenda')
      .update(fallbackPayload)
      .eq('id', id)
      .select(AGENDA_BASE_SELECT_COLUMNS)
      .single();
    if (fallback.error) {
      throw new Error(formatSupabaseError(fallback.error));
    }
    return {
      ...mapAgendaRowFromDb(fallback.data as Record<string, unknown>),
      ...patch,
    };
  }

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return mapAgendaRowFromDb(data as Record<string, unknown>);
}

export async function deleteAgendaFromSupabase(id: string): Promise<void> {
  const client = assertClient();
  const { error } = await client.from('agenda').delete().eq('id', id);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
}

function normalizeAgendaIdsForUuidIfNeeded(items: AgendaItem[]): AgendaItem[] {
  return items.map((item) => ({
    ...item,
    id: UUID_REGEX.test(item.id) ? item.id : generateAgendaUuid(),
  }));
}

export async function syncImportedAgendasToSupabase(
  items: AgendaItem[],
  mode: 'merge' | 'replace'
): Promise<{ saved: AgendaItem[]; addedCount: number }> {
  const client = assertClient();

  const upsertWithUuidFallback = async (rowsToUpsert: AgendaItem[]) => {
    const payloads = rowsToUpsert.map((r) => mapAgendaToDbPayload(r, true));
    const { error } = await client.from('agenda').upsert(payloads, { onConflict: 'id' });
    if (error && isMissingColumnError(error)) {
      const basePayloads = rowsToUpsert.map((r) => mapAgendaToDbPayload(r, false));
      const baseRetry = await client.from('agenda').upsert(basePayloads, { onConflict: 'id' });
      if (baseRetry.error) {
        throw new Error(formatSupabaseError(baseRetry.error));
      }
      return;
    }
    if (error && error.code === '22P02') {
      const uuidPayloads = normalizeAgendaIdsForUuidIfNeeded(rowsToUpsert).map((r) =>
        mapAgendaToDbPayload(r, true)
      );
      const retry = await client.from('agenda').upsert(uuidPayloads, { onConflict: 'id' });
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
      const { error: delError } = await client.from('agenda').delete().in('id', existingIds);
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
    .channel('agenda-realtime-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda' }, () => {
      onChange();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// =========================================================================
// TABEL `akun_asn` (id, nama, nip, jabatan, unit_kerja, username, role, status)
// =========================================================================
const AKUN_ASN_SELECT_COLUMNS = 'id, nama, nip, jabatan, unit_kerja, username, role, status';

export function normalizeRoleCode(raw: unknown): RoleCode {
  const val = String(raw || '').trim().toLowerCase();
  if (
    val === 'role_super_admin' ||
    val === 'super admin' ||
    val === 'super_admin' ||
    val === 'superadmin' ||
    val === 'admin'
  ) {
    return 'ROLE_SUPER_ADMIN';
  }
  if (
    val === 'role_disposisi' ||
    val === 'pejabat disposisi' ||
    val === 'disposisi' ||
    val === 'sekretaris'
  ) {
    return 'ROLE_DISPOSISI';
  }
  if (val === 'role_pimpinan' || val === 'pimpinan' || val === 'kalaksa' || val === 'viewer') {
    return 'ROLE_PIMPINAN';
  }
  return 'ROLE_OPERATOR';
}

function statusToIsActive(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  const val = String(raw ?? 'Aktif').trim().toLowerCase();
  if (val === 'nonaktif' || val === 'non-aktif' || val === 'inactive' || val === 'false' || val === '0') {
    return false;
  }
  return true;
}

export function mapUserRowFromDb(row: Record<string, unknown>): UserAccount {
  return {
    id: String(row.id || generateAgendaUuid()),
    namaLengkap: String(row.nama ?? row.namaLengkap ?? ''),
    nip: String(row.nip ?? ''),
    jabatan: String(row.jabatan ?? ''),
    bidang: String(row.unit_kerja ?? row.bidang ?? 'Sekretariat BPBD'),
    username: String(row.username ?? ''),
    email: '',
    roleKode: normalizeRoleCode(row.role ?? row.roleKode),
    isActive: statusToIsActive(row.status ?? row.isActive),
  };
}

export function mapUserToDbPayload(user: UserAccount) {
  return {
    id: user.id,
    nama: user.namaLengkap.trim(),
    nip: user.nip.trim(),
    jabatan: user.jabatan.trim(),
    unit_kerja: (user.bidang || 'Sekretariat BPBD').trim(),
    username: user.username.trim(),
    role: ROLE_META[user.roleKode].shortLabel,
    status: user.isActive ? 'Aktif' : 'Nonaktif',
  };
}

export async function fetchUsersFromSupabase(): Promise<UserAccount[]> {
  const client = assertClient();
  const { data, error } = await client
    .from('akun_asn')
    .select(AKUN_ASN_SELECT_COLUMNS)
    .order('nama', { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return (data || []).map((row) => mapUserRowFromDb(row as Record<string, unknown>));
}

export async function insertUserToSupabase(user: UserAccount): Promise<UserAccount> {
  const client = assertClient();
  const payload = mapUserToDbPayload({
    ...user,
    id: user.id || generateAgendaUuid(),
  });
  const { data, error } = await client
    .from('akun_asn')
    .insert(payload)
    .select(AKUN_ASN_SELECT_COLUMNS)
    .single();

  if (error && error.code === '22P02') {
    const retryPayload = { ...payload, id: generateAgendaUuid() };
    const retry = await client
      .from('akun_asn')
      .insert(retryPayload)
      .select(AKUN_ASN_SELECT_COLUMNS)
      .single();
    if (retry.error) {
      throw new Error(formatSupabaseError(retry.error));
    }
    return mapUserRowFromDb(retry.data as Record<string, unknown>);
  }

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return mapUserRowFromDb(data as Record<string, unknown>);
}

export async function updateUserInSupabase(id: string, user: UserAccount): Promise<UserAccount> {
  const client = assertClient();
  const fullPayload = mapUserToDbPayload({ ...user, id });
  const { id: _ignoreId, ...updateFields } = fullPayload;

  const { data, error } = await client
    .from('akun_asn')
    .update(updateFields)
    .eq('id', id)
    .select(AKUN_ASN_SELECT_COLUMNS)
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return mapUserRowFromDb(data as Record<string, unknown>);
}

export async function toggleUserStatusInSupabase(
  id: string,
  nextActive: boolean
): Promise<UserAccount> {
  const client = assertClient();
  const { data, error } = await client
    .from('akun_asn')
    .update({ status: nextActive ? 'Aktif' : 'Nonaktif' })
    .eq('id', id)
    .select(AKUN_ASN_SELECT_COLUMNS)
    .single();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return mapUserRowFromDb(data as Record<string, unknown>);
}

export async function deleteUserFromSupabase(id: string): Promise<void> {
  const client = assertClient();
  const { error } = await client.from('akun_asn').delete().eq('id', id);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
}

function normalizeUserIdsForUuidIfNeeded(users: UserAccount[]): UserAccount[] {
  return users.map((u) => ({
    ...u,
    id: UUID_REGEX.test(u.id) ? u.id : generateAgendaUuid(),
  }));
}

export async function syncImportedUsersToSupabase(
  usersToSync: UserAccount[],
  mode: 'merge' | 'replace'
): Promise<UserAccount[]> {
  const client = assertClient();

  const upsertWithUuidFallback = async (rowsToUpsert: UserAccount[]) => {
    const payloads = rowsToUpsert.map(mapUserToDbPayload);
    const { error } = await client.from('akun_asn').upsert(payloads, { onConflict: 'id' });
    if (error && error.code === '22P02') {
      const uuidPayloads = normalizeUserIdsForUuidIfNeeded(rowsToUpsert).map(mapUserToDbPayload);
      const retry = await client.from('akun_asn').upsert(uuidPayloads, { onConflict: 'id' });
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
    const existing = await fetchUsersFromSupabase();
    if (existing.length > 0) {
      const existingIds = existing.map((u) => u.id);
      const { error: delError } = await client.from('akun_asn').delete().in('id', existingIds);
      if (delError) {
        throw new Error(formatSupabaseError(delError));
      }
    }
    if (usersToSync.length > 0) {
      await upsertWithUuidFallback(usersToSync);
    }
    return await fetchUsersFromSupabase();
  }

  const existing = await fetchUsersFromSupabase();
  const existingKeys = new Set(
    existing.flatMap((u) => [u.id, u.username.toLowerCase(), u.nip.toLowerCase()].filter(Boolean))
  );
  const newUsers = usersToSync.filter(
    (u) =>
      !existingKeys.has(u.id) &&
      !existingKeys.has(u.username.toLowerCase()) &&
      !existingKeys.has(u.nip.toLowerCase())
  );
  if (newUsers.length > 0) {
    await upsertWithUuidFallback(newUsers);
  }
  return await fetchUsersFromSupabase();
}

export function subscribeUsersRealtime(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel('akun-asn-realtime-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'akun_asn' }, () => {
      onChange();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// =========================================================================
// TABEL `kontak_atasan` (id, nama_jabatan, no_wa, is_default)
// =========================================================================
const KONTAK_ATASAN_SELECT_COLUMNS = 'id, nama_jabatan, no_wa, is_default';

function isMissingKontakTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; details?: string };
  const text = `${e.message || ''} ${e.details || ''}`.toLowerCase();
  return (
    e.code === '42P01' ||
    e.code === 'PGRST205' ||
    (text.includes('kontak_atasan') &&
      (text.includes('does not exist') || text.includes('could not find the table')))
  );
}

export function mapKontakAtasanRowFromDb(row: Record<string, unknown>): KontakAtasanItem {
  return {
    id: String(row.id || generateAgendaUuid()),
    namaJabatan: String(row.nama_jabatan ?? '').trim() || 'Atasan / Pimpinan',
    noWa: formatWhatsAppNumber(String(row.no_wa ?? '')),
    isDefault: Boolean(row.is_default),
  };
}

export async function fetchKontakAtasanFromSupabase(): Promise<KontakAtasanItem[]> {
  const client = assertClient();
  const { data, error } = await client
    .from('kontak_atasan')
    .select(KONTAK_ATASAN_SELECT_COLUMNS)
    .order('is_default', { ascending: false })
    .order('nama_jabatan', { ascending: true });

  if (error && isMissingKontakTableError(error)) {
    return [];
  }
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return (data || []).map((row) => mapKontakAtasanRowFromDb(row as Record<string, unknown>));
}

export async function insertKontakAtasanToSupabase(input: {
  namaJabatan: string;
  noWa: string;
  isDefault: boolean;
}): Promise<KontakAtasanItem> {
  const client = assertClient();
  const normalizedWa = formatWhatsAppNumber(input.noWa);
  if (!normalizedWa) {
    throw new Error('Nomor WhatsApp atasan tidak valid.');
  }

  if (input.isDefault) {
    const { error: resetErr } = await client
      .from('kontak_atasan')
      .update({ is_default: false })
      .eq('is_default', true);
    if (resetErr && isMissingKontakTableError(resetErr)) {
      throw new Error(
        'Tabel kontak_atasan belum dibuat di Supabase. Jalankan SQL CREATE TABLE kontak_atasan terlebih dahulu.'
      );
    }
    if (resetErr) {
      throw new Error(formatSupabaseError(resetErr));
    }
  }

  const baseFields = {
    nama_jabatan: input.namaJabatan.trim() || 'Atasan / Pimpinan',
    no_wa: normalizedWa,
    is_default: Boolean(input.isDefault),
  };

  const { data, error } = await client
    .from('kontak_atasan')
    .insert({ id: generateAgendaUuid(), ...baseFields })
    .select(KONTAK_ATASAN_SELECT_COLUMNS)
    .single();

  if (error && error.code === '22P02') {
    const retry = await client
      .from('kontak_atasan')
      .insert(baseFields)
      .select(KONTAK_ATASAN_SELECT_COLUMNS)
      .single();
    if (retry.error) {
      throw new Error(formatSupabaseError(retry.error));
    }
    return mapKontakAtasanRowFromDb(retry.data as Record<string, unknown>);
  }

  if (error && isMissingKontakTableError(error)) {
    throw new Error(
      'Tabel kontak_atasan belum dibuat di Supabase. Jalankan SQL CREATE TABLE kontak_atasan terlebih dahulu.'
    );
  }
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  return mapKontakAtasanRowFromDb(data as Record<string, unknown>);
}

export async function setDefaultKontakAtasanInSupabase(id: string): Promise<void> {
  const client = assertClient();
  const { error: resetErr } = await client
    .from('kontak_atasan')
    .update({ is_default: false })
    .eq('is_default', true);
  if (resetErr) {
    throw new Error(formatSupabaseError(resetErr));
  }

  const { error } = await client
    .from('kontak_atasan')
    .update({ is_default: true })
    .eq('id', id);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
}

export async function deleteKontakAtasanFromSupabase(id: string): Promise<void> {
  const client = assertClient();
  const { error } = await client.from('kontak_atasan').delete().eq('id', id);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
}

export function subscribeKontakAtasanRealtime(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel('kontak-atasan-realtime-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kontak_atasan' }, () => {
      onChange();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

