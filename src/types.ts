export type RoleCode =
  | 'ROLE_SUPER_ADMIN'
  | 'ROLE_OPERATOR'
  | 'ROLE_DISPOSISI'
  | 'ROLE_PIMPINAN';

export type AgendaCategory =
  | 'Rapat Internal'
  | 'Rapat Eksternal'
  | 'Kunjungan / Dinas'
  | 'Undangan Resmi'
  | 'Lainnya';

export type AgendaStatus = 'Terjadwal' | 'Draft' | 'Selesai' | 'Dibatalkan';

export type DisposisiStatus =
  | 'Menunggu Disposisi'
  | 'Disetujui Pimpinan'
  | 'Diwakilkan'
  | 'Hadir Dikonfirmasi';

export type ActiveView =
  | 'dashboard'
  | 'ebuddy'
  | 'kalender'
  | 'rekap_harian'
  | 'broadcast_wa'
  | 'master_unit'
  | 'super_admin';

export type CardTheme = 'bpbd' | 'putih' | 'gelap';
export type CardMode = 'harian' | 'tunggal' | 'bulanan';
export type PosterIllustrationKey =
  | 'auto'
  | 'senam'
  | 'apel'
  | 'cuaca'
  | 'hotel_fgd'
  | 'rapat'
  | 'k3_zoom'
  | 'zoom'
  | 'digital_ai'
  | 'pesantren'
  | 'sekolah_edukasi'
  | 'damkar'
  | 'kunjungan';

export interface UserAccount {
  id: string;
  nip: string;
  username: string;
  email: string;
  password?: string;
  namaLengkap: string;
  jabatan: string;
  bidang: string;
  roleKode: RoleCode;
  isActive: boolean;
  lastLogin?: string;
}

export interface AuthSession {
  userId: string;
  remember: boolean;
  loginAt: number;
  expiresAt: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  nip: string;
  nama: string;
  roleKode: RoleCode | 'GUEST';
  eventType: string;
  status: 'SUKSES' | 'GAGAL' | 'PERINGATAN';
  detail: string;
}

export interface MasterUnitItem {
  id: string;
  tipe: 'Unit / Bidang' | 'Lokasi / Ruangan';
  kode: string;
  nama: string;
  keterangan: string;
}

export interface AgendaItem {
  id: string;
  judul: string;
  tanggal: string;
  jamMulai: string;
  jamSelesai: string;
  sampaiSelesai?: boolean;
  lokasi: string;
  penyelenggara: string;
  pakaian: string;
  nomorSurat: string;
  kategori: AgendaCategory;
  status: AgendaStatus;
  statusDisposisi: DisposisiStatus;
  pejabatPendamping: string;
  isConfidential: boolean;
  isUpdated?: boolean;
  zoomUrl?: string;
  ilustrasi?: PosterIllustrationKey;
  catatan: string;
  sumber: 'Manual' | 'e-Buddy';
  createdBy: string;
  createdAt: string;
}

export interface ConflictInfo {
  agenda: AgendaItem;
  overlapMinutes: number;
}

export interface ExtractedEBuddyResult {
  judul: string;
  tanggal: string;
  jamMulai: string;
  jamSelesai: string;
  sampaiSelesai: boolean;
  lokasi: string;
  penyelenggara: string;
  pakaian: string;
  nomorSurat: string;
  kategori: AgendaCategory;
  zoomUrl: string;
  catatan: string;
  detectedFields: string[];
}

export const AUDIT_STORAGE_KEY = 'siaga_bpbd_audit_v3';
export const MASTER_STORAGE_KEY = 'siaga_bpbd_master_v3';
export const SESSION_LOCAL_KEY = 'siaga_bpbd_session_local_v3';
export const SESSION_TEMP_KEY = 'siaga_bpbd_session_temp_v3';
export const ORG_TITLE_KEY = 'siaga_bpbd_org_title_v3';
export const LOCKOUT_STORAGE_KEY = 'siaga_bpbd_lockout_v3';

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export const ROLE_META: Record<
  RoleCode,
  { label: string; shortLabel: string; description: string }
> = {
  ROLE_SUPER_ADMIN: {
    label: 'Super Admin (Admin Sistem)',
    shortLabel: 'Super Admin',
    description: 'Akses penuh seluruh modul, edit & hapus data, master unit, akun ASN, dan audit log.',
  },
  ROLE_OPERATOR: {
    label: 'Operator (Pengadministrasi Umum)',
    shortLabel: 'Operator',
    description: 'Input & ekstrak surat e-Buddy, kelola jadwal, dan studio broadcast WhatsApp.',
  },
  ROLE_DISPOSISI: {
    label: 'Pejabat Disposisi (Sekretaris)',
    shortLabel: 'Pejabat Disposisi',
    description: 'Verifikasi bentrok, tetapkan pejabat pendamping, ubah disposisi, dan pantau log.',
  },
  ROLE_PIMPINAN: {
    label: 'Pimpinan (Eksekutif / Viewer)',
    shortLabel: 'Pimpinan',
    description: 'Mode baca dashboard real-time, konfirmasi hadir, dan unduh laporan/poster.',
  },
};

export const CATEGORIES: AgendaCategory[] = [
  'Rapat Internal',
  'Rapat Eksternal',
  'Kunjungan / Dinas',
  'Undangan Resmi',
  'Lainnya',
];

export const DISPOSISI_STATUSES: DisposisiStatus[] = [
  'Menunggu Disposisi',
  'Disetujui Pimpinan',
  'Diwakilkan',
  'Hadir Dikonfirmasi',
];

export const POSTER_ILLUSTRATION_OPTIONS: {
  value: PosterIllustrationKey;
  label: string;
}[] = [
  { value: 'auto', label: 'Otomatis (Sesuai Jenis Kegiatan)' },
  { value: 'senam', label: 'Senam / Olahraga ASN' },
  { value: 'apel', label: 'Apel / Gladi Kesiapsiagaan' },
  { value: 'cuaca', label: 'Cuaca / Angin Kencang (Anemometer)' },
  { value: 'hotel_fgd', label: 'FGD / Seminar Hotel' },
  { value: 'rapat', label: 'Rapat Koordinasi / Pendopo' },
  { value: 'k3_zoom', label: 'Pelatihan K3 / Zoom + APAR' },
  { value: 'zoom', label: 'Zoom Meeting / Daring Pusdalops' },
  { value: 'digital_ai', label: 'Pelatihan Digital / AI / Medsos' },
  { value: 'pesantren', label: 'Simulasi Pesantren / Santri' },
  { value: 'sekolah_edukasi', label: 'Edukasi Sekolah / Destana' },
  { value: 'damkar', label: 'Damkar / Simulasi Pemadaman Api' },
  { value: 'kunjungan', label: 'Kunjungan / Survei Lapangan' },
];

export const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const HARI_SINGKAT_SENIN = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
export const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function createInitialMasterUnits(): MasterUnitItem[] {
  return [
    { id: 'mu-1', tipe: 'Unit / Bidang', kode: 'SET-BPBD', nama: 'Sekretariat BPBD', keterangan: 'Subbag Umum, Kepegawaian & Perencanaan' },
    { id: 'mu-2', tipe: 'Unit / Bidang', kode: 'BID-PK', nama: 'Bidang Pencegahan & Kesiapsiagaan', keterangan: 'Mitigasi, Destana & Edukasi Kebencanaan' },
    { id: 'mu-3', tipe: 'Unit / Bidang', kode: 'BID-KL', nama: 'Bidang Kedaruratan & Logistik', keterangan: 'TRC, Pusdalops & Penanganan Darurat' },
    { id: 'mu-4', tipe: 'Unit / Bidang', kode: 'BID-RR', nama: 'Bidang Rehabilitasi & Rekonstruksi', keterangan: 'Pemulihan Infrastruktur & Sosial' },
    { id: 'mu-5', tipe: 'Unit / Bidang', kode: 'DAMKAR', nama: 'Bidang Damkarmat', keterangan: 'Pemadam Kebakaran & Penyelamatan' },
    { id: 'mu-6', tipe: 'Lokasi / Ruangan', kode: 'LOC-01', nama: 'Ruang Rapat Pusdalops BPBD Sidoarjo', keterangan: 'Jl. Sultan Agung No. 19, Gajah Timur, Magersari, Sidoarjo' },
    { id: 'mu-7', tipe: 'Lokasi / Ruangan', kode: 'LOC-02', nama: 'Pendopo Delta Wibawa Kab. Sidoarjo', keterangan: 'Jl. Jenggolo No. 44A, Kec. Sidoarjo' },
    { id: 'mu-8', tipe: 'Lokasi / Ruangan', kode: 'LOC-03', nama: 'Ruang Rapat Setda Kab. Sidoarjo', keterangan: 'Kompleks Kantor Bupati Sidoarjo' },
    { id: 'mu-9', tipe: 'Lokasi / Ruangan', kode: 'LOC-04', nama: 'Daring (Zoom Meeting)', keterangan: 'Video Conference Resmi' },
  ];
}

export function getPermissions(role: RoleCode) {
  return {
    canCreateAgenda: role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_OPERATOR',
    canEditAgenda:
      role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_OPERATOR' || role === 'ROLE_DISPOSISI',
    canDeleteAgenda: (item: AgendaItem) => {
      if (role === 'ROLE_SUPER_ADMIN') return true;
      if (role === 'ROLE_OPERATOR') return item.status === 'Draft' || item.status === 'Dibatalkan';
      return false;
    },
    canUseEBuddy: role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_OPERATOR',
    canEditDisposition: role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_DISPOSISI',
    canConfirmPresence: role === 'ROLE_PIMPINAN' || role === 'ROLE_SUPER_ADMIN',
    canOpenCardStudio:
      role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_OPERATOR' || role === 'ROLE_DISPOSISI',
    canManageMaster: role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_OPERATOR',
    canDeleteMaster: role === 'ROLE_SUPER_ADMIN',
    canManageUsers: role === 'ROLE_SUPER_ADMIN',
    canViewAuditLog: role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_DISPOSISI',
    canExportAuditLog: role === 'ROLE_SUPER_ADMIN',
    canAccessConfidential:
      role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_DISPOSISI' || role === 'ROLE_PIMPINAN',
  };
}

export function getLocalISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return getLocalISODate(dt);
}

export function formatTanggalLengkap(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${HARI_ID[dt.getDay()]}, ${d} ${BULAN_ID[dt.getMonth()]} ${y}`;
}

export function formatTanggalPendek(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${BULAN_ID[m - 1].slice(0, 3)} ${y}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export function formatDurasi(start: string, end: string, sampaiSelesai?: boolean): string {
  if (sampaiSelesai) return 's.d. Selesai';
  const diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff <= 0) return '0 mnt';
  const jam = Math.floor(diff / 60);
  const mnt = diff % 60;
  if (jam === 0) return `${mnt} mnt`;
  if (mnt === 0) return `${jam} jam`;
  return `${jam} jam ${mnt} mnt`;
}

export function formatRentangWaktu(
  item: Pick<AgendaItem, 'jamMulai' | 'jamSelesai' | 'sampaiSelesai'>
): string {
  if (item.sampaiSelesai) {
    return `${item.jamMulai} WIB - Selesai`;
  }
  return `${item.jamMulai} - ${item.jamSelesai} WIB`;
}

export function getConflictsForCandidate(
  agendas: AgendaItem[],
  candidate: { id?: string; tanggal: string; jamMulai: string; jamSelesai: string; status?: AgendaStatus }
): ConflictInfo[] {
  if (candidate.status === 'Dibatalkan' || candidate.status === 'Draft') return [];
  const startA = timeToMinutes(candidate.jamMulai);
  const endA = timeToMinutes(candidate.jamSelesai);
  if (endA <= startA) return [];

  const conflicts: ConflictInfo[] = [];
  for (const item of agendas) {
    if (candidate.id && item.id === candidate.id) continue;
    if (item.status === 'Dibatalkan' || item.status === 'Draft') continue;
    if (item.tanggal !== candidate.tanggal) continue;
    const startB = timeToMinutes(item.jamMulai);
    const endB = timeToMinutes(item.jamSelesai);
    if (startA < endB && endA > startB) {
      conflicts.push({
        agenda: item,
        overlapMinutes: Math.min(endA, endB) - Math.max(startA, startB),
      });
    }
  }
  return conflicts.sort((a, b) => timeToMinutes(a.agenda.jamMulai) - timeToMinutes(b.agenda.jamMulai));
}

export function findNextAvailableSlot(
  agendas: AgendaItem[],
  tanggal: string,
  durationMinutes: number,
  excludeId?: string
): { jamMulai: string; jamSelesai: string } | null {
  const safeDuration = Math.max(30, durationMinutes || 60);
  for (let start = 7 * 60 + 30; start + safeDuration <= 19 * 60; start += 15) {
    const end = start + safeDuration;
    const candidate = {
      id: excludeId,
      tanggal,
      jamMulai: minutesToTime(start),
      jamSelesai: minutesToTime(end),
      status: 'Terjadwal' as AgendaStatus,
    };
    if (getConflictsForCandidate(agendas, candidate).length === 0) {
      return { jamMulai: candidate.jamMulai, jamSelesai: candidate.jamSelesai };
    }
  }
  return null;
}

const BULAN_MAP: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, pebruari: 2,
  maret: 3, mar: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6,
  juli: 7, jul: 7, agustus: 8, agu: 8, agust: 8, agt: 8,
  september: 9, sep: 9, sept: 9, oktober: 10, okt: 10,
  november: 11, nov: 11, nopember: 11, nop: 11, desember: 12, des: 12,
};

export function extractEBuddyText(rawText: string, defaultDate: string): ExtractedEBuddyResult {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const detectedFields: string[] = [];

  let nomorSurat = '';
  const nomorMatch = text.match(/(?:Nomor(?:\s*Surat)?|No\.?\s*Surat|No\.?)\s*[:\-]\s*([A-Z0-9./\- ]{4,50})/i);
  if (nomorMatch) {
    nomorSurat = nomorMatch[1].split(/\s{2,}|\t/)[0].trim();
    detectedFields.push('Nomor Surat');
  } else {
    const codeMatch = text.match(/\b(\d{3}\/[A-Z0-9.\-]+\/[A-Z0-9.\-\/]+)\b/i);
    if (codeMatch) {
      nomorSurat = codeMatch[1].trim();
      detectedFields.push('Nomor Surat');
    }
  }

  let judul = '';
  const acaraMatch = text.match(/(?:Acara|Kegiatan|Agenda|Sub\s*Acara)\s*[:\-]\s*([^\n]+)/i);
  const halMatch = text.match(/(?:Perihal|Hal)\s*[:\-]\s*([^\n]+)/i);
  const rangkaMatch = text.match(/(?:menghadiri|dalam rangka|mengikuti)\s+(?:acara\s+|kegiatan\s+|rapat\s+)?([^\n.;]{8,120})/i);

  if (acaraMatch && acaraMatch[1].trim().length > 3) {
    judul = acaraMatch[1].trim();
    detectedFields.push('Acara');
  } else if (halMatch && halMatch[1].trim().length > 3) {
    judul = halMatch[1].replace(/^Undangan\s+/i, '').trim();
    detectedFields.push('Perihal');
  } else if (rangkaMatch) {
    judul = rangkaMatch[1].trim();
    detectedFields.push('Konteks Acara');
  } else if (lines.length > 0) {
    const candidateLine = lines.find(
      (l) => l.length > 8 && !/^(Yth|Kepada|Nomor|Lampiran|Sifat|Hari|Tanggal|Pukul|Tempat|Pakaian)/i.test(l)
    );
    if (candidateLine) judul = candidateLine.slice(0, 100);
  }

  let tanggal = defaultDate;
  const monthNamesPattern = Object.keys(BULAN_MAP).join('|');
  const indoDateMatch = text.match(
    new RegExp(`(?:(?:Senin|Selasa|Rabu|Kamis|Jumat|Jum'at|Sabtu|Minggu)\\s*,?\\s*)?(\\d{1,2})\\s+(${monthNamesPattern})\\s+(\\d{4})`, 'i')
  );
  const numericDateMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  const isoDateMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (indoDateMatch) {
    const day = Number(indoDateMatch[1]);
    const month = BULAN_MAP[indoDateMatch[2].toLowerCase()];
    const year = Number(indoDateMatch[3]);
    if (day >= 1 && day <= 31 && month && year >= 2020) {
      tanggal = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      detectedFields.push('Tanggal');
    }
  } else if (isoDateMatch) {
    tanggal = `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
    detectedFields.push('Tanggal');
  } else if (numericDateMatch) {
    const day = Number(numericDateMatch[1]);
    const month = Number(numericDateMatch[2]);
    const year = Number(numericDateMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      tanggal = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      detectedFields.push('Tanggal');
    }
  } else if (/\blusa\b/i.test(text)) {
    tanggal = addDaysISO(defaultDate, 2);
    detectedFields.push('Tanggal (Lusa)');
  } else if (/\bbesok\b/i.test(text)) {
    tanggal = addDaysISO(defaultDate, 1);
    detectedFields.push('Tanggal (Besok)');
  }

  let jamMulai = '09:00';
  let jamSelesai = '11:00';
  let sampaiSelesai = false;
  let catatanSelesai = '';
  const rangeMatch = text.match(/(\d{1,2})[.:](\d{2})\s*(?:WIB|WITA|WIT)?\s*(?:-|–|s\.?d\.?|s\/d|sampai(?:\s+dengan)?)\s*(\d{1,2})[.:](\d{2})/i);
  const untilDoneMatch = text.match(/(?:Pukul|Jam|Waktu)\s*[:\-]?\s*(\d{1,2})[.:](\d{2})\s*(?:WIB|WITA|WIT)?\s*(?:-|–|s\.?d\.?|s\/d)?\s*(?:selesai|Selesai)/i);
  const singleMatch = text.match(/(?:Pukul|Jam|Waktu)\s*[:\-]?\s*(\d{1,2})[.:](\d{2})/i);

  if (rangeMatch) {
    jamMulai = `${String(Math.min(23, Number(rangeMatch[1]))).padStart(2, '0')}:${String(Math.min(59, Number(rangeMatch[2]))).padStart(2, '0')}`;
    jamSelesai = `${String(Math.min(23, Number(rangeMatch[3]))).padStart(2, '0')}:${String(Math.min(59, Number(rangeMatch[4]))).padStart(2, '0')}`;
    if (timeToMinutes(jamSelesai) <= timeToMinutes(jamMulai)) {
      jamSelesai = minutesToTime(timeToMinutes(jamMulai) + 90);
    }
    detectedFields.push('Rentang Waktu');
  } else if (untilDoneMatch) {
    jamMulai = `${String(Math.min(23, Number(untilDoneMatch[1]))).padStart(2, '0')}:${String(Math.min(59, Number(untilDoneMatch[2]))).padStart(2, '0')}`;
    jamSelesai = minutesToTime(timeToMinutes(jamMulai) + 120);
    sampaiSelesai = true;
    catatanSelesai = 'Jadwal s.d. selesai (estimasi deteksi bentrok 2 jam).';
    detectedFields.push('Waktu (s.d. Selesai)');
  } else if (singleMatch) {
    jamMulai = `${String(Math.min(23, Number(singleMatch[1]))).padStart(2, '0')}:${String(Math.min(59, Number(singleMatch[2]))).padStart(2, '0')}`;
    jamSelesai = minutesToTime(timeToMinutes(jamMulai) + 90);
    detectedFields.push('Waktu Mulai');
  }

  let lokasi = '';
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  const zoomUrl = urlMatch ? urlMatch[0] : '';
  const lokasiMatch = text.match(/(?:Tempat|Lokasi|Bertempat\s+di|Ruangan)\s*[:\-]?\s*([^\n]+)/i);
  if (lokasiMatch) {
    lokasi = lokasiMatch[1].replace(/^di\s+/i, '').trim();
    detectedFields.push('Lokasi');
  } else if (/zoom|google meet|teams|daring|virtual/i.test(text)) {
    lokasi = 'Daring (Zoom Meeting)';
    detectedFields.push('Lokasi Daring');
  }

  let pakaian = '';
  const pakaianMatch = text.match(/(?:Pakaian|Dresscode|Seragam)\s*[:\-]\s*([^\n]+)/i);
  if (pakaianMatch) {
    pakaian = pakaianMatch[1].trim();
    detectedFields.push('Pakaian');
  }

  let penyelenggara = '';
  const disposisiMatch = text.match(/(?:Disposisi(?:\s+Kepada)?|Penyelenggara|Pengirim|Dari|Yth\.)\s*[:\-]?\s*([^\n]+)/i);
  if (disposisiMatch) {
    penyelenggara = disposisiMatch[1].trim();
    detectedFields.push('Penyelenggara');
  }

  let kategori: AgendaCategory = 'Rapat Internal';
  if (/kunjungan|tinjauan|lapangan|peresmian|monitoring|sidak|bencana|posko|edukasi|damkar/i.test(text)) {
    kategori = 'Kunjungan / Dinas';
  } else if (/undangan|lampiran|nomor\s*[:\-]/i.test(text) && /yth\.|hormat kami|mengharap kehadiran/i.test(text)) {
    kategori = 'Undangan Resmi';
  } else if (/kementerian|gubernur|bupati|provinsi|mitra|zoom|eksternal|forum|bnpt|bnpb/i.test(text)) {
    kategori = 'Rapat Eksternal';
  }

  const extraNotes: string[] = [];
  if (catatanSelesai) extraNotes.push(catatanSelesai);
  const meetingIdMatch = text.match(/(?:Meeting\s*ID|ID\s*Rapat)\s*[:\-]?\s*([0-9 \-]+)/i);
  const passcodeMatch = text.match(/(?:Passcode|Password|Kode\s*Akses)\s*[:\-]?\s*([^\s\n]+)/i);
  const catatanMatch = text.match(/(?:Catatan|Keterangan|Instruksi)\s*[:\-]\s*([^\n]+)/i);
  if (meetingIdMatch) extraNotes.push(`Meeting ID: ${meetingIdMatch[1].trim()}`);
  if (passcodeMatch) extraNotes.push(`Passcode: ${passcodeMatch[1].trim()}`);
  if (catatanMatch) extraNotes.push(catatanMatch[1].trim());

  return {
    judul: judul || 'Agenda Surat e-Buddy',
    tanggal,
    jamMulai,
    jamSelesai,
    sampaiSelesai,
    lokasi: lokasi || 'Menunggu konfirmasi tempat',
    penyelenggara: penyelenggara || 'Sekretariat BPBD',
    pakaian: pakaian || 'Menyesuaikan',
    nomorSurat,
    kategori,
    zoomUrl,
    catatan: extraNotes.join(' · '),
    detectedFields,
  };
}

export function getEBuddyTemplates(todayISO: string) {
  const tomorrowFmt = formatTanggalLengkap(addDaysISO(todayISO, 1));
  const todayFmt = formatTanggalLengkap(todayISO);
  const plus3Fmt = formatTanggalLengkap(addDaysISO(todayISO, 3));

  return [
    {
      label: 'Contoh 1: Undangan Rapat Hidrometeorologi',
      text: `PEMERINTAH KABUPATEN SIDOARJO — TATA NASKAH DINAS ELEKTRONIK (e-Buddy)
Nomor Surat: 005/2194/438.1.1/2026
Perihal: Rapat Koordinasi Hidrometeorologi & Kesiapsiagaan Banjir
Hari/Tanggal: ${todayFmt}
Pukul: 08.30 - 10.30 WIB
Tempat: Ruang Rapat Setda Kab. Sidoarjo
Pakaian: PDH Khaki
Disposisi: Kalaksa menugaskan Bid. KL`,
    },
    {
      label: 'Contoh 2: Undangan Zoom Evaluasi BNPB',
      text: `UNDANGAN RAKORNAS PENANGGULANGAN BENCANA
Nomor : 005/99/BNPB/2026
Yth. Kepala Pelaksana BPBD Kabupaten Sidoarjo
Untuk menghadiri acara Sinkronisasi Sistem Logistik & Peralatan Kebencanaan
Tanggal : ${plus3Fmt}
Jam : 10.00 WIB - selesai
Tempat : Zoom Meeting (https://zoom.us/j/918273645)
Meeting ID : 918 273 645
Passcode : BNPB26
Dresscode : Seragam PDH / Batik`,
    },
    {
      label: 'Contoh 3: Simulasi Evakuasi Kebakaran',
      text: `[TERUSAN e-BUDDY]
Nomor : 360/2048/BPBD/2026
Hal : Simulasi Evakuasi Kebakaran & Penyelamatan Gedung
Disposisi : Bidang Damkarmat & Bidang PK
Hari/Tanggal : ${tomorrowFmt}
Pukul : 13.00 - 15.30 WIB
Tempat : Halaman Kantor Pemkab Sidoarjo
Pakaian : Seragam PDL Lapangan`,
    },
  ];
}
