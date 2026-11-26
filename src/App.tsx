import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  FileText,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Download,
  Copy,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  UserCheck,
  Shirt,
  Hash,
  Image as ImageIcon,
  CalendarDays,
  Menu,
  X,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ArrowRight,
  SlidersHorizontal,
  Eye,
  EyeOff,
  LogOut,
  ShieldCheck,
  Users,
  ClipboardList,
  Lock,
  HelpCircle,
  UserPlus,
} from 'lucide-react';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type RoleCode =
  | 'ROLE_SUPER_ADMIN'
  | 'ROLE_OPERATOR'
  | 'ROLE_DISPOSISI'
  | 'ROLE_PIMPINAN';

type AgendaCategory =
  | 'Rapat Internal'
  | 'Rapat Eksternal'
  | 'Kunjungan / Dinas'
  | 'Undangan Resmi'
  | 'Lainnya';

type AgendaStatus = 'Terjadwal' | 'Draft' | 'Selesai' | 'Dibatalkan';

type DisposisiStatus =
  | 'Menunggu Disposisi'
  | 'Disetujui Pimpinan'
  | 'Diwakilkan'
  | 'Hadir Dikonfirmasi';

type ActiveView = 'harian' | 'bulanan' | 'ebuddy' | 'kartu' | 'pengguna' | 'audit';

type CardTheme = 'putih' | 'biru' | 'gelap';

type CardMode = 'harian' | 'tunggal' | 'bulanan';

interface UserAccount {
  id: string;
  nip: string;
  username: string;
  email: string;
  password: string;
  namaLengkap: string;
  jabatan: string;
  bidang: string;
  roleKode: RoleCode;
  isActive: boolean;
  lastLogin?: string;
}

interface AuthSession {
  userId: string;
  remember: boolean;
  loginAt: number;
  expiresAt: number;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  nip: string;
  nama: string;
  roleKode: RoleCode | 'GUEST';
  eventType: string;
  status: 'SUKSES' | 'GAGAL' | 'PERINGATAN';
  detail: string;
}

interface AgendaItem {
  id: string;
  judul: string;
  tanggal: string; // YYYY-MM-DD
  jamMulai: string; // HH:mm
  jamSelesai: string; // HH:mm
  lokasi: string;
  penyelenggara: string;
  pakaian: string;
  nomorSurat: string;
  kategori: AgendaCategory;
  status: AgendaStatus;
  statusDisposisi: DisposisiStatus;
  pejabatPendamping: string;
  isConfidential: boolean;
  catatan: string;
  sumber: 'Manual' | 'e-Buddy';
  createdBy: string;
  createdAt: string;
}

interface ConflictInfo {
  agenda: AgendaItem;
  overlapMinutes: number;
}

interface ExtractedEBuddyResult {
  judul: string;
  tanggal: string;
  jamMulai: string;
  jamSelesai: string;
  lokasi: string;
  penyelenggara: string;
  pakaian: string;
  nomorSurat: string;
  kategori: AgendaCategory;
  catatan: string;
  detectedFields: string[];
}

const STORAGE_KEY = 'siaga_bpbd_agendas_v2';
const USERS_STORAGE_KEY = 'siaga_bpbd_users_v2';
const AUDIT_STORAGE_KEY = 'siaga_bpbd_audit_v2';
const SESSION_LOCAL_KEY = 'siaga_bpbd_session_local_v2';
const SESSION_TEMP_KEY = 'siaga_bpbd_session_temp_v2';
const ORG_TITLE_KEY = 'siaga_bpbd_org_title_v2';
const LOCKOUT_STORAGE_KEY = 'siaga_bpbd_lockout_v2';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 jam kerja
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 menit

const ROLE_META: Record<
  RoleCode,
  { label: string; shortLabel: string; description: string }
> = {
  ROLE_SUPER_ADMIN: {
    label: 'Super Admin (Admin Sistem)',
    shortLabel: 'Super Admin',
    description: 'Akses penuh seluruh modul, manajemen akun, template kop, dan audit log.',
  },
  ROLE_OPERATOR: {
    label: 'Operator (Pengadministrasi Umum)',
    shortLabel: 'Operator',
    description: 'Input & ekstrak surat e-Buddy, kelola jadwal, dan studio kartu WhatsApp.',
  },
  ROLE_DISPOSISI: {
    label: 'Pejabat Disposisi (Sekretaris)',
    shortLabel: 'Pejabat Disposisi',
    description: 'Verifikasi bentrok, tetapkan pejabat pendamping, ubah disposisi, dan pantau log.',
  },
  ROLE_PIMPINAN: {
    label: 'Pimpinan (Eksekutif / Viewer)',
    shortLabel: 'Pimpinan',
    description: 'Mode baca dashboard real-time, konfirmasi hadir, dan unduh kartu/rekap.',
  },
};

const CATEGORIES: AgendaCategory[] = [
  'Rapat Internal',
  'Rapat Eksternal',
  'Kunjungan / Dinas',
  'Undangan Resmi',
  'Lainnya',
];

const DISPOSISI_STATUSES: DisposisiStatus[] = [
  'Menunggu Disposisi',
  'Disetujui Pimpinan',
  'Diwakilkan',
  'Hadir Dikonfirmasi',
];

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const HARI_SINGKAT_SENIN = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

// ============================================================================
// INITIAL USERS & PERMISSIONS
// ============================================================================

function createInitialUsers(): UserAccount[] {
  return [
    {
      id: 'usr-1',
      nip: '199004122015031002',
      username: 'admin.siaga',
      email: 'admin.siaga@sidoarjokab.go.id',
      password: 'Bpbd2026!',
      namaLengkap: 'Rizky Pratama, S.Kom',
      jabatan: 'Pranata Komputer Ahli Pertama',
      bidang: 'Sekretariat',
      roleKode: 'ROLE_SUPER_ADMIN',
      isActive: true,
    },
    {
      id: 'usr-2',
      nip: '199408212019032005',
      username: 'operator.sekretariat',
      email: 'sekretariat@sidoarjokab.go.id',
      password: 'Bpbd2026!',
      namaLengkap: 'Siti Aminah, A.Md',
      jabatan: 'Pengadministrasi Umum',
      bidang: 'Subbag Umum & Kepegawaian',
      roleKode: 'ROLE_OPERATOR',
      isActive: true,
    },
    {
      id: 'usr-3',
      nip: '197805152005011008',
      username: 'sekretaris.bpbd',
      email: 'sekretaris.bpbd@sidoarjokab.go.id',
      password: 'Bpbd2026!',
      namaLengkap: 'H. Agus Salim, S.Sos, M.Si',
      jabatan: 'Sekretaris BPBD',
      bidang: 'Sekretariat',
      roleKode: 'ROLE_DISPOSISI',
      isActive: true,
    },
    {
      id: 'usr-4',
      nip: '197211031998031004',
      username: 'kalaksa.bpbd',
      email: 'kalaksa.bpbd@sidoarjokab.go.id',
      password: 'Bpbd2026!',
      namaLengkap: 'Ir. Dwijo Prawito, M.T',
      jabatan: 'Kepala Pelaksana BPBD',
      bidang: 'Pimpinan',
      roleKode: 'ROLE_PIMPINAN',
      isActive: true,
    },
  ];
}

function getPermissions(role: RoleCode) {
  return {
    canCreateAgenda: role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_OPERATOR',
    canEditAgenda:
      role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_OPERATOR' || role === 'ROLE_DISPOSISI',
    canDeleteAgenda: (item: AgendaItem) => {
      if (role === 'ROLE_SUPER_ADMIN') return true;
      if (role === 'ROLE_OPERATOR') {
        return item.status === 'Draft' || item.status === 'Dibatalkan';
      }
      return false;
    },
    canUseEBuddy: role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_OPERATOR',
    canEditDisposition: role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_DISPOSISI',
    canConfirmPresence: role === 'ROLE_PIMPINAN' || role === 'ROLE_SUPER_ADMIN',
    canOpenCardStudio:
      role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_OPERATOR' || role === 'ROLE_DISPOSISI',
    canExportReports: true,
    canManageUsers: role === 'ROLE_SUPER_ADMIN',
    canViewAuditLog: role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_DISPOSISI',
    canExportAuditLog: role === 'ROLE_SUPER_ADMIN',
    canAccessConfidential:
      role === 'ROLE_SUPER_ADMIN' || role === 'ROLE_DISPOSISI' || role === 'ROLE_PIMPINAN',
  };
}

// ============================================================================
// DATE & TIME UTILITIES
// ============================================================================

function getLocalISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return getLocalISODate(dt);
}

function formatTanggalLengkap(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const hari = HARI_ID[dt.getDay()];
  const bulan = BULAN_ID[dt.getMonth()];
  return `${hari}, ${d} ${bulan} ${y}`;
}

function formatTanggalPendek(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${BULAN_ID[m - 1].slice(0, 3)} ${y}`;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDurasi(start: string, end: string): string {
  const diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff <= 0) return '0 mnt';
  const jam = Math.floor(diff / 60);
  const mnt = diff % 60;
  if (jam === 0) return `${mnt} mnt`;
  if (mnt === 0) return `${jam} jam`;
  return `${jam} jam ${mnt} mnt`;
}

// ============================================================================
// CONFLICT DETECTION ENGINE
// ============================================================================

function getConflictsForCandidate(
  agendas: AgendaItem[],
  candidate: {
    id?: string;
    tanggal: string;
    jamMulai: string;
    jamSelesai: string;
    status?: AgendaStatus;
  }
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
      const overlapMinutes = Math.min(endA, endB) - Math.max(startA, startB);
      conflicts.push({ agenda: item, overlapMinutes });
    }
  }
  return conflicts.sort(
    (a, b) => timeToMinutes(a.agenda.jamMulai) - timeToMinutes(b.agenda.jamMulai)
  );
}

function findNextAvailableSlot(
  agendas: AgendaItem[],
  tanggal: string,
  durationMinutes: number,
  excludeId?: string
): { jamMulai: string; jamSelesai: string } | null {
  const safeDuration = Math.max(30, durationMinutes || 60);
  const dayStart = 7 * 60 + 30;
  const dayEnd = 19 * 60;

  for (let start = dayStart; start + safeDuration <= dayEnd; start += 15) {
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

// ============================================================================
// E-BUDDY OFFICIAL LETTER EXTRACTOR
// ============================================================================

const BULAN_MAP: Record<string, number> = {
  januari: 1, jan: 1,
  februari: 2, feb: 2, pebruari: 2,
  maret: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  agustus: 8, agu: 8, agust: 8, agt: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11, nopember: 11, nop: 11,
  desember: 12, des: 12,
};

function extractEBuddyText(rawText: string, defaultDate: string): ExtractedEBuddyResult {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const detectedFields: string[] = [];

  let nomorSurat = '';
  const nomorMatch = text.match(
    /(?:Nomor(?:\s*Surat)?|No\.?\s*Surat|No\.?)\s*[:\-]\s*([A-Z0-9./\- ]{4,50})/i
  );
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
  const rangkaMatch = text.match(
    /(?:menghadiri|dalam rangka|mengikuti)\s+(?:acara\s+|kegiatan\s+|rapat\s+)?([^\n.;]{8,120})/i
  );

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
      (l) =>
        l.length > 8 &&
        !/^(Yth|Kepada|Nomor|Lampiran|Sifat|Hari|Tanggal|Pukul|Tempat|Pakaian)/i.test(l)
    );
    if (candidateLine) judul = candidateLine.slice(0, 100);
  }

  let tanggal = defaultDate;
  const monthNamesPattern = Object.keys(BULAN_MAP).join('|');
  const indoDateRegex = new RegExp(
    `(?:(?:Senin|Selasa|Rabu|Kamis|Jumat|Jum'at|Sabtu|Minggu)\\s*,?\\s*)?(\\d{1,2})\\s+(${monthNamesPattern})\\s+(\\d{4})`,
    'i'
  );
  const indoDateMatch = text.match(indoDateRegex);
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
  let catatanSelesai = '';

  const rangeTimeRegex =
    /(\d{1,2})[.:](\d{2})\s*(?:WIB|WITA|WIT)?\s*(?:-|–|s\.?d\.?|s\/d|sampai(?:\s+dengan)?)\s*(\d{1,2})[.:](\d{2})/i;
  const untilDoneRegex =
    /(?:Pukul|Jam|Waktu)\s*[:\-]?\s*(\d{1,2})[.:](\d{2})\s*(?:WIB|WITA|WIT)?\s*(?:-|–|s\.?d\.?|s\/d)?\s*(?:selesai|Selesai)/i;
  const singleTimeRegex = /(?:Pukul|Jam|Waktu)\s*[:\-]?\s*(\d{1,2})[.:](\d{2})/i;

  const rangeMatch = text.match(rangeTimeRegex);
  const untilDoneMatch = text.match(untilDoneRegex);
  const singleMatch = text.match(singleTimeRegex);

  if (rangeMatch) {
    const h1 = String(Math.min(23, Number(rangeMatch[1]))).padStart(2, '0');
    const m1 = String(Math.min(59, Number(rangeMatch[2]))).padStart(2, '0');
    const h2 = String(Math.min(23, Number(rangeMatch[3]))).padStart(2, '0');
    const m2 = String(Math.min(59, Number(rangeMatch[4]))).padStart(2, '0');
    jamMulai = `${h1}:${m1}`;
    jamSelesai = `${h2}:${m2}`;
    if (timeToMinutes(jamSelesai) <= timeToMinutes(jamMulai)) {
      jamSelesai = minutesToTime(timeToMinutes(jamMulai) + 90);
    }
    detectedFields.push('Rentang Waktu');
  } else if (untilDoneMatch) {
    const h1 = String(Math.min(23, Number(untilDoneMatch[1]))).padStart(2, '0');
    const m1 = String(Math.min(59, Number(untilDoneMatch[2]))).padStart(2, '0');
    jamMulai = `${h1}:${m1}`;
    jamSelesai = minutesToTime(timeToMinutes(jamMulai) + 120);
    catatanSelesai = 'Durasi estimasi 2 jam (surat tertulis: s.d. selesai).';
    detectedFields.push('Waktu Mulai');
  } else if (singleMatch) {
    const h1 = String(Math.min(23, Number(singleMatch[1]))).padStart(2, '0');
    const m1 = String(Math.min(59, Number(singleMatch[2]))).padStart(2, '0');
    jamMulai = `${h1}:${m1}`;
    jamSelesai = minutesToTime(timeToMinutes(jamMulai) + 90);
    detectedFields.push('Waktu Mulai');
  }

  let lokasi = '';
  const lokasiMatch = text.match(/(?:Tempat|Lokasi|Bertempat\s+di|Ruangan)\s*[:\-]?\s*([^\n]+)/i);
  if (lokasiMatch) {
    lokasi = lokasiMatch[1].replace(/^di\s+/i, '').trim();
    detectedFields.push('Lokasi');
  } else if (/zoom|google meet|teams|daring|virtual/i.test(text)) {
    const linkMatch = text.match(/https?:\/\/[^\s]+/i);
    lokasi = linkMatch ? `Daring (${linkMatch[0]})` : 'Daring / Video Conference';
    detectedFields.push('Lokasi Daring');
  }

  let pakaian = '';
  const pakaianMatch = text.match(/(?:Pakaian|Dresscode|Seragam)\s*[:\-]\s*([^\n]+)/i);
  if (pakaianMatch) {
    pakaian = pakaianMatch[1].trim();
    detectedFields.push('Pakaian');
  }

  let penyelenggara = '';
  const disposisiMatch = text.match(
    /(?:Disposisi(?:\s+Kepada)?|Penyelenggara|Pengirim|Dari|Yth\.)\s*[:\-]?\s*([^\n]+)/i
  );
  if (disposisiMatch) {
    penyelenggara = disposisiMatch[1].trim();
    detectedFields.push('Penyelenggara');
  }

  let kategori: AgendaCategory = 'Rapat Internal';
  if (/kunjungan|tinjauan|lapangan|peresmian|monitoring|sidak|bencana|posko/i.test(text)) {
    kategori = 'Kunjungan / Dinas';
  } else if (
    /undangan|lampiran|nomor\s*[:\-]/i.test(text) &&
    /yth\.|hormat kami|mengharap kehadiran/i.test(text)
  ) {
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
    lokasi: lokasi || 'Menunggu konfirmasi tempat',
    penyelenggara: penyelenggara || 'Sekretariat BPBD Sidoarjo',
    pakaian: pakaian || 'Menyesuaikan',
    nomorSurat,
    kategori,
    catatan: extraNotes.join(' · '),
    detectedFields,
  };
}

// ============================================================================
// INITIAL SEED DATA & E-BUDDY SAMPLES (BPBD KABUPATEN SIDOARJO)
// ============================================================================

function createInitialAgendas(): AgendaItem[] {
  const today = getLocalISODate();
  const tomorrow = addDaysISO(today, 1);
  const plus2 = addDaysISO(today, 2);
  const plus4 = addDaysISO(today, 4);
  const minus1 = addDaysISO(today, -1);

  return [
    {
      id: 'ag-1',
      judul: 'Rapat Koordinasi Kesiapsiagaan Hidrometeorologi Kab. Sidoarjo',
      tanggal: today,
      jamMulai: '08:30',
      jamSelesai: '10:30',
      lokasi: 'Ruang Rapat Pusdalops BPBD Sidoarjo',
      penyelenggara: 'Bidang Pencegahan & Kesiapsiagaan',
      pakaian: 'PDH Khaki / Seragam BPBD',
      nomorSurat: '360/1420/438.5.17/2026',
      kategori: 'Rapat Internal',
      status: 'Terjadwal',
      statusDisposisi: 'Disetujui Pimpinan',
      pejabatPendamping: 'Kabid PK & Tim Pusdalops',
      isConfidential: false,
      catatan: 'Membawa peta titik rawan genangan dan logistik aktif.',
      sumber: 'e-Buddy',
      createdBy: 'Siti Aminah, A.Md',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-2',
      judul: 'Sinkronisasi Data Kebencanaan & Sistem Peringatan Dini (Bentrok Simulasi)',
      tanggal: today,
      jamMulai: '09:45',
      jamSelesai: '11:30',
      lokasi: 'Zoom Meeting (BPBD Provinsi Jawa Timur)',
      penyelenggara: 'BPBD Provinsi Jawa Timur',
      pakaian: 'PDH Khaki',
      nomorSurat: '360/891/BPBD-JATIM/2026',
      kategori: 'Rapat Eksternal',
      status: 'Terjadwal',
      statusDisposisi: 'Menunggu Disposisi',
      pejabatPendamping: 'Belum ditetapkan',
      isConfidential: false,
      catatan: 'Meeting ID: 842 9910 2211 · Passcode: SIAGA26',
      sumber: 'e-Buddy',
      createdBy: 'Siti Aminah, A.Md',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-3',
      judul: 'Rapat Terbatas Evaluasi Anggaran Belanja Tak Terduga (BTT)',
      tanggal: today,
      jamMulai: '13:30',
      jamSelesai: '15:00',
      lokasi: 'Ruang Rapat Pendopo Delta Wibawa',
      penyelenggara: 'Sekretariat Daerah Kab. Sidoarjo',
      pakaian: 'Batik Lengan Panjang',
      nomorSurat: '900/312/SETDA/2026',
      kategori: 'Undangan Resmi',
      status: 'Terjadwal',
      statusDisposisi: 'Hadir Dikonfirmasi',
      pejabatPendamping: 'Sekretaris BPBD',
      isConfidential: true,
      catatan: 'Agenda sifat terbatas — hanya Pimpinan & Pejabat Disposisi.',
      sumber: 'e-Buddy',
      createdBy: 'H. Agus Salim, S.Sos, M.Si',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-4',
      judul: 'Tinjauan Lapangan Normalisasi Saluran & Posko Siaga Kecamatan',
      tanggal: tomorrow,
      jamMulai: '09:00',
      jamSelesai: '11:30',
      lokasi: 'Kecamatan Waru & Taman, Kab. Sidoarjo',
      penyelenggara: 'Bidang Kedaruratan & Logistik',
      pakaian: 'Seragam Lapangan BPBD',
      nomorSurat: '360/119/KL-BPBD/2026',
      kategori: 'Kunjungan / Dinas',
      status: 'Terjadwal',
      statusDisposisi: 'Disetujui Pimpinan',
      pejabatPendamping: 'Kabid KL & TRC BPBD',
      isConfidential: false,
      catatan: 'Koordinasi titik pompa portabel dan posko kecamatan.',
      sumber: 'e-Buddy',
      createdBy: 'Siti Aminah, A.Md',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-5',
      judul: 'Forum Koordinasi Rehabilitasi & Rekonstruksi Pasca Bencana',
      tanggal: plus2,
      jamMulai: '10:00',
      jamSelesai: '12:30',
      lokasi: 'Aula Kantor BPBD Jl. Raya Kemiri No. 1',
      penyelenggara: 'Bidang Rehabilitasi & Rekonstruksi',
      pakaian: 'Batik Resmi',
      nomorSurat: '360/774/RR-BPBD/2026',
      kategori: 'Undangan Resmi',
      status: 'Draft',
      statusDisposisi: 'Menunggu Disposisi',
      pejabatPendamping: 'Kabid RR',
      isConfidential: false,
      catatan: 'Menunggu persetujuan jadwal final dari Sekretaris BPBD.',
      sumber: 'Manual',
      createdBy: 'Siti Aminah, A.Md',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-6',
      judul: 'Briefing Mingguan Progres Digitalisasi Surat e-Buddy Sekretariat',
      tanggal: plus4,
      jamMulai: '14:00',
      jamSelesai: '15:30',
      lokasi: 'Ruang Rapat Sekretariat Lt. 1',
      penyelenggara: 'Subbag Umum & Kepegawaian',
      pakaian: 'PDH / Bebas Rapi',
      nomorSurat: '',
      kategori: 'Rapat Internal',
      status: 'Terjadwal',
      statusDisposisi: 'Diwakilkan',
      pejabatPendamping: 'Kasubag Umum',
      isConfidential: false,
      catatan: 'Evaluasi SLA penerimaan surat masuk.',
      sumber: 'Manual',
      createdBy: 'Rizky Pratama, S.Kom',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-7',
      judul: 'Apel Gelar Pasukan & Pengecekan Peralatan SAR BPBD Sidoarjo',
      tanggal: minus1,
      jamMulai: '07:30',
      jamSelesai: '09:30',
      lokasi: 'Halaman Mako BPBD Kab. Sidoarjo',
      penyelenggara: 'Sekretariat BPBD Kab. Sidoarjo',
      pakaian: 'Seragam PDL Lengkap',
      nomorSurat: '360/1401/BPBD/2026',
      kategori: 'Rapat Internal',
      status: 'Selesai',
      statusDisposisi: 'Hadir Dikonfirmasi',
      pejabatPendamping: 'Seluruh Pejabat Struktural',
      isConfidential: false,
      catatan: 'Dokumentasi dan berita acara selesai.',
      sumber: 'Manual',
      createdBy: 'Siti Aminah, A.Md',
      createdAt: new Date().toISOString(),
    },
  ];
}

function getEBuddyTemplates(todayISO: string) {
  const tomorrowFmt = formatTanggalLengkap(addDaysISO(todayISO, 1));
  const todayFmt = formatTanggalLengkap(todayISO);
  const plus3Fmt = formatTanggalLengkap(addDaysISO(todayISO, 3));

  return [
    {
      label: 'Undangan Rapat e-Buddy',
      text: `PEMERINTAH KABUPATEN SIDOARJO — TATA NASKAH DINAS ELEKTRONIK (e-Buddy)
Nomor : 360/2048/BPBD/2026
Sifat : Penting
Hal : Undangan Rapat Percepatan Desa Tangguh Bencana (Destana)

Disposisi : Yth. Kepala Bidang Pencegahan & Kesiapsiagaan
Mengharap kehadiran Bapak/Ibu pada:
Hari/Tanggal : ${tomorrowFmt}
Pukul : 13.00 - 15.30 WIB
Tempat : Ruang Rapat Pusdalops BPBD Jl. Raya Kemiri No. 1
Acara : Rapat Koordinasi Pembentukan Desa Tangguh Bencana Tahun 2026
Pakaian : Batik Lengan Panjang
Catatan : Harap membawa dokumen rekap desa binaan.`,
    },
    {
      label: 'Disposisi Rapat Bentrok (Uji Deteksi)',
      text: `[TERUSAN e-BUDDY]
Nomor Surat: UND-412/SETDA-SDA/XI/2026
Dari: Asisten Pemerintahan dan Kesra Kab. Sidoarjo
Perihal: Rapat Desk Penyusunan Laporan Kinerja Instansi Daerah
Hari, Tanggal: ${todayFmt}
Waktu: 09.00 s.d. 11.00 WIB
Lokasi: Ruang Rapat Delta Graha Setda Sidoarjo
Seragam: PDH Khaki
Instruksi: Mohon hadir tepat waktu atau disposisikan pejabat pendamping.`,
    },
    {
      label: 'Undangan Zoom BNPB (s.d. selesai)',
      text: `UNDANGAN RAKORNAS PENANGGULANGAN BENCANA
Nomor : 005/99/BNPB/2026
Yth. Kepala Pelaksana BPBD Kabupaten/Kota se-Jawa Timur
Untuk menghadiri acara Sinkronisasi Sistem Logistik & Peralatan Kebencanaan
Tanggal : ${plus3Fmt}
Jam : 10.00 WIB - selesai
Tempat : Zoom Meeting (https://zoom.us/j/918273645)
Meeting ID : 918 273 645
Passcode : BNPB26
Dresscode : Seragam PDH / Batik`,
    },
  ];
}

// ============================================================================
// WHATSAPP PNG CARD RENDERER (HTML5 CANVAS)
// ============================================================================

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderWhatsAppCardCanvas(
  canvas: HTMLCanvasElement,
  options: {
    mode: CardMode;
    theme: CardTheme;
    orgTitle: string;
    selectedDate: string;
    selectedMonth: number;
    selectedYear: number;
    dayAgendas: AgendaItem[];
    singleAgenda: AgendaItem | null;
    monthAgendas: AgendaItem[];
    allAgendas: AgendaItem[];
    showPakaian: boolean;
    showNomorSurat: boolean;
    showConflictAlert: boolean;
  }
) {
  const {
    mode,
    theme,
    orgTitle,
    selectedDate,
    selectedMonth,
    selectedYear,
    dayAgendas,
    singleAgenda,
    monthAgendas,
    allAgendas,
    showPakaian,
    showNomorSurat,
    showConflictAlert,
  } = options;

  const palettes = {
    putih: {
      bg: '#F8FAFC',
      headerBg: '#0F2A4A',
      headerText: '#FFFFFF',
      headerSub: '#CBD5E1',
      cardBg: '#FFFFFF',
      cardBorder: '#E2E8F0',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      textMuted: '#64748B',
      accent: '#E65100',
      conflictBg: '#FEF2F2',
      conflictBorder: '#FECACA',
      conflictText: '#B91C1C',
      divider: '#E2E8F0',
    },
    biru: {
      bg: '#0F2744',
      headerBg: '#091A30',
      headerText: '#FFFFFF',
      headerSub: '#93C5FD',
      cardBg: '#16355B',
      cardBorder: '#264E7D',
      textPrimary: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#94A3B8',
      accent: '#FB923C',
      conflictBg: '#450A0A',
      conflictBorder: '#991B1B',
      conflictText: '#FCA5A5',
      divider: '#264E7D',
    },
    gelap: {
      bg: '#09090B',
      headerBg: '#18181B',
      headerText: '#FAFAFA',
      headerSub: '#A1A1AA',
      cardBg: '#18181B',
      cardBorder: '#27272A',
      textPrimary: '#FAFAFA',
      textSecondary: '#D4D4D8',
      textMuted: '#A1A1AA',
      accent: '#10B981',
      conflictBg: '#450A0A',
      conflictBorder: '#991B1B',
      conflictText: '#FCA5A5',
      divider: '#27272A',
    },
  };

  const p = palettes[theme];
  const width = 1080;
  const padX = 64;
  const contentWidth = width - padX * 2;

  const tempCtx = canvas.getContext('2d');
  if (!tempCtx) return;

  const fontSans = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const fontMono = '"JetBrains Mono", ui-monospace, monospace';

  let itemsToRender: AgendaItem[] = [];
  if (mode === 'harian') {
    itemsToRender = dayAgendas.filter((a) => a.status !== 'Dibatalkan' && a.status !== 'Draft');
  } else if (mode === 'tunggal' && singleAgenda) {
    itemsToRender = [singleAgenda];
  } else if (mode === 'bulanan') {
    itemsToRender = monthAgendas
      .filter((a) => a.status !== 'Dibatalkan' && a.status !== 'Draft')
      .slice(0, 14);
  }

  let measuredBodyHeight = 0;
  const cardLayouts: Array<{
    item: AgendaItem;
    titleLines: string[];
    metaLines: string[];
    conflicts: ConflictInfo[];
    boxHeight: number;
  }> = [];

  if (itemsToRender.length === 0) {
    measuredBodyHeight = 320;
  } else if (mode === 'tunggal' && singleAgenda) {
    tempCtx.font = `700 38px ${fontSans}`;
    const titleLines = wrapCanvasText(tempCtx, singleAgenda.judul, contentWidth - 80);
    const conflicts = showConflictAlert ? getConflictsForCandidate(allAgendas, singleAgenda) : [];
    const boxHeight =
      500 +
      titleLines.length * 48 +
      (singleAgenda.catatan ? 90 : 0) +
      (conflicts.length > 0 ? 74 : 0);
    cardLayouts.push({ item: singleAgenda, titleLines, metaLines: [], conflicts, boxHeight });
    measuredBodyHeight = boxHeight + 40;
  } else {
    for (const item of itemsToRender) {
      tempCtx.font = `700 28px ${fontSans}`;
      const titleLines = wrapCanvasText(tempCtx, item.judul, contentWidth - 260);

      const metaParts = [
        item.lokasi,
        item.penyelenggara,
        item.pejabatPendamping ? `Disposisi: ${item.pejabatPendamping}` : '',
        showPakaian && item.pakaian ? `Pakaian: ${item.pakaian}` : '',
        showNomorSurat && item.nomorSurat ? `Surat: ${item.nomorSurat}` : '',
      ].filter(Boolean);

      tempCtx.font = `400 21px ${fontSans}`;
      const metaLines = wrapCanvasText(tempCtx, metaParts.join('  ·  '), contentWidth - 260);
      const conflicts = showConflictAlert ? getConflictsForCandidate(allAgendas, item) : [];

      const boxHeight = Math.max(
        140,
        52 + titleLines.length * 36 + metaLines.length * 29 + (conflicts.length > 0 ? 48 : 0) + 28
      );
      cardLayouts.push({ item, titleLines, metaLines, conflicts, boxHeight });
      measuredBodyHeight += boxHeight + 20;
    }
  }

  const headerHeight = 230;
  const footerHeight = 110;
  const minHeight = 1080;
  const totalHeight = Math.max(minHeight, headerHeight + 44 + measuredBodyHeight + footerHeight);

  canvas.width = width;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, width, totalHeight);

  ctx.fillStyle = p.headerBg;
  ctx.fillRect(0, 0, width, headerHeight);

  ctx.fillStyle = p.headerSub;
  ctx.font = `600 20px ${fontSans}`;
  ctx.fillText((orgTitle || 'BPBD KABUPATEN SIDOARJO — AGENDA PIMPINAN').toUpperCase(), padX, 68);

  ctx.fillStyle = p.headerText;
  ctx.font = `700 42px ${fontSans}`;
  const mainTitle =
    mode === 'harian'
      ? formatTanggalLengkap(selectedDate)
      : mode === 'tunggal'
      ? 'Kartu Agenda & Disposisi'
      : `Rekap ${BULAN_ID[selectedMonth]} ${selectedYear}`;
  ctx.fillText(mainTitle, padX, 130);

  ctx.fillStyle = p.headerSub;
  ctx.font = `500 22px ${fontSans}`;
  let subLine = '';
  if (mode === 'harian') {
    const conflictCount = itemsToRender.filter(
      (i) => getConflictsForCandidate(allAgendas, i).length > 0
    ).length;
    subLine = `${itemsToRender.length} Kegiatan Terjadwal  ·  ${
      conflictCount > 0 ? `${conflictCount} Jadwal Bentrok` : 'Tidak Ada Bentrok'
    }`;
  } else if (mode === 'tunggal' && singleAgenda) {
    subLine = `${formatTanggalLengkap(singleAgenda.tanggal)}  ·  ${singleAgenda.statusDisposisi}`;
  } else {
    const activeMonthCount = monthAgendas.filter(
      (a) => a.status !== 'Dibatalkan' && a.status !== 'Draft'
    ).length;
    subLine = `${activeMonthCount} Total Agenda Bulan Ini${
      activeMonthCount > 14 ? ' (Menampilkan 14 Agenda Pertama)' : ''
    }`;
  }
  ctx.fillText(subLine, padX, 178);

  let cursorY = headerHeight + 36;

  if (itemsToRender.length === 0) {
    drawRoundedRect(ctx, padX, cursorY, contentWidth, 240, 16);
    ctx.fillStyle = p.cardBg;
    ctx.fill();
    ctx.strokeStyle = p.cardBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = p.textPrimary;
    ctx.font = `600 28px ${fontSans}`;
    ctx.fillText('Tidak ada agenda terjadwal', padX + 44, cursorY + 106);

    ctx.fillStyle = p.textMuted;
    ctx.font = `400 22px ${fontSans}`;
    ctx.fillText('Tambahkan agenda baru atau ekstrak dari surat e-Buddy.', padX + 44, cursorY + 148);
  } else if (mode === 'tunggal' && cardLayouts.length === 1) {
    const layout = cardLayouts[0];
    const item = layout.item;

    drawRoundedRect(ctx, padX, cursorY, contentWidth, layout.boxHeight, 18);
    ctx.fillStyle = p.cardBg;
    ctx.fill();
    ctx.strokeStyle = layout.conflicts.length > 0 ? p.conflictBorder : p.cardBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    let innerY = cursorY + 56;
    ctx.fillStyle = p.accent;
    ctx.font = `600 26px ${fontMono}`;
    ctx.fillText(`${item.jamMulai} – ${item.jamSelesai} WIB`, padX + 40, innerY);

    innerY += 56;
    ctx.fillStyle = p.textPrimary;
    ctx.font = `700 38px ${fontSans}`;
    for (const line of layout.titleLines) {
      ctx.fillText(line, padX + 40, innerY);
      innerY += 48;
    }

    innerY += 16;
    ctx.strokeStyle = p.divider;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX + 40, innerY);
    ctx.lineTo(padX + contentWidth - 40, innerY);
    ctx.stroke();

    innerY += 46;
    const rows: Array<[string, string]> = [
      ['Tempat / Lokasi', item.lokasi],
      ['Penyelenggara', item.penyelenggara],
      ['Disposisi / Pendamping', `${item.statusDisposisi} (${item.pejabatPendamping || '-'})`],
      ...(showPakaian ? [['Pakaian', item.pakaian || '-'] as [string, string]] : []),
      ...(showNomorSurat && item.nomorSurat
        ? [['Nomor Surat', item.nomorSurat] as [string, string]]
        : []),
      ['Status', item.status],
    ];

    for (const [label, val] of rows) {
      ctx.fillStyle = p.textMuted;
      ctx.font = `500 22px ${fontSans}`;
      ctx.fillText(label, padX + 40, innerY);

      ctx.fillStyle = p.textPrimary;
      ctx.font = `600 22px ${fontSans}`;
      ctx.fillText(val.slice(0, 46), padX + 290, innerY);
      innerY += 44;
    }

    if (item.catatan) {
      innerY += 8;
      ctx.fillStyle = p.textMuted;
      ctx.font = `500 20px ${fontSans}`;
      ctx.fillText(`Catatan: ${item.catatan.slice(0, 74)}`, padX + 40, innerY);
      innerY += 40;
    }

    if (layout.conflicts.length > 0) {
      innerY += 12;
      drawRoundedRect(ctx, padX + 40, innerY - 30, contentWidth - 80, 52, 10);
      ctx.fillStyle = p.conflictBg;
      ctx.fill();
      ctx.fillStyle = p.conflictText;
      ctx.font = `600 21px ${fontSans}`;
      ctx.fillText(
        `Peringatan Bentrok: Bertabrakan dengan ${layout.conflicts[0].agenda.judul.slice(0, 38)}`,
        padX + 58,
        innerY + 4
      );
    }
  } else {
    for (const layout of cardLayouts) {
      const { item, titleLines, metaLines, conflicts, boxHeight } = layout;

      drawRoundedRect(ctx, padX, cursorY, contentWidth, boxHeight, 14);
      ctx.fillStyle = p.cardBg;
      ctx.fill();
      ctx.strokeStyle = conflicts.length > 0 ? p.conflictBorder : p.cardBorder;
      ctx.lineWidth = 2;
      ctx.stroke();

      const timeX = padX + 32;
      const bodyX = padX + 225;

      ctx.fillStyle = conflicts.length > 0 ? p.conflictText : p.accent;
      ctx.font = `600 25px ${fontMono}`;
      ctx.fillText(item.jamMulai, timeX, cursorY + 52);

      ctx.fillStyle = p.textMuted;
      ctx.font = `500 20px ${fontMono}`;
      ctx.fillText(`s.d. ${item.jamSelesai}`, timeX, cursorY + 84);

      if (mode === 'bulanan') {
        ctx.fillStyle = p.textSecondary;
        ctx.font = `600 18px ${fontSans}`;
        ctx.fillText(formatTanggalPendek(item.tanggal), timeX, cursorY + 114);
      }

      ctx.strokeStyle = p.divider;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padX + 198, cursorY + 24);
      ctx.lineTo(padX + 198, cursorY + boxHeight - 24);
      ctx.stroke();

      let textY = cursorY + 50;
      ctx.fillStyle = p.textPrimary;
      ctx.font = `700 28px ${fontSans}`;
      for (const line of titleLines) {
        ctx.fillText(line, bodyX, textY);
        textY += 36;
      }

      textY += 6;
      ctx.fillStyle = p.textSecondary;
      ctx.font = `400 21px ${fontSans}`;
      for (const mLine of metaLines) {
        ctx.fillText(mLine, bodyX, textY);
        textY += 29;
      }

      if (conflicts.length > 0) {
        textY += 4;
        ctx.fillStyle = p.conflictText;
        ctx.font = `600 20px ${fontSans}`;
        ctx.fillText(
          `! Bentrok waktu (${conflicts[0].overlapMinutes} mnt) dengan "${conflicts[0].agenda.judul.slice(0, 34)}"`,
          bodyX,
          textY + 12
        );
      }

      cursorY += boxHeight + 20;
    }
  }

  const footerY = totalHeight - 54;
  ctx.strokeStyle = p.divider;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, footerY - 36);
  ctx.lineTo(width - padX, footerY - 36);
  ctx.stroke();

  ctx.fillStyle = p.textMuted;
  ctx.font = `500 20px ${fontSans}`;
  const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  ctx.fillText(
    `SIAGA-AGENDA BPBD Sidoarjo  ·  ${formatTanggalLengkap(getLocalISODate())}`,
    padX,
    footerY
  );

  ctx.textAlign = 'right';
  ctx.font = `500 20px ${fontMono}`;
  ctx.fillText(`Pukul ${nowStr} WIB`, width - padX, footerY);
  ctx.textAlign = 'left';
}

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================

export default function App() {
  const todayISO = useMemo(() => getLocalISODate(), []);

  // Users State
  const [users, setUsers] = useState<UserAccount[]>(() => {
    try {
      const saved = localStorage.getItem(USERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return createInitialUsers();
  });

  // Audit Log State (Append-only)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'log-init',
        timestamp: new Date().toISOString(),
        nip: '199004122015031002',
        nama: 'Rizky Pratama, S.Kom',
        roleKode: 'ROLE_SUPER_ADMIN',
        eventType: 'INISIALISASI_SISTEM',
        status: 'SUKSES',
        detail: 'Sistem SIAGA-AGENDA BPBD Kabupaten Sidoarjo siap digunakan.',
      },
    ];
  });

  // Auth Session State
  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const raw =
        localStorage.getItem(SESSION_LOCAL_KEY) || sessionStorage.getItem(SESSION_TEMP_KEY);
      if (!raw) return null;
      const parsed: AuthSession = JSON.parse(raw);
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        localStorage.removeItem(SESSION_LOCAL_KEY);
        sessionStorage.removeItem(SESSION_TEMP_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const currentUser = useMemo(() => {
    if (!session) return null;
    return users.find((u) => u.id === session.userId && u.isActive) || null;
  }, [session, users]);

  // Login Form State
  const [loginIdentity, setLoginIdentity] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [showDemoPanel, setShowDemoPanel] = useState(false);
  const [demoFilledNotice, setDemoFilledNotice] = useState('');
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LOCKOUT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.count || 0;
      }
    } catch {
      // ignore
    }
    return 0;
  });
  const [lockoutUntil, setLockoutUntil] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LOCKOUT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.until || 0;
      }
    } catch {
      // ignore
    }
    return 0;
  });
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Agendas & Org Title State
  const [agendas, setAgendas] = useState<AgendaItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return createInitialAgendas();
  });

  const [orgTitle, setOrgTitle] = useState<string>(() => {
    try {
      return localStorage.getItem(ORG_TITLE_KEY) || 'BPBD KABUPATEN SIDOARJO — AGENDA PIMPINAN';
    } catch {
      return 'BPBD KABUPATEN SIDOARJO — AGENDA PIMPINAN';
    }
  });

  // Active Navigation & Filters
  const [activeView, setActiveView] = useState<ActiveView>('harian');
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'Semua' | AgendaCategory>('Semua');
  const [monthlyOnlyConflict, setMonthlyOnlyConflict] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Add/Edit Agenda Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Omit<AgendaItem, 'id' | 'createdAt' | 'createdBy'>>({
    judul: '',
    tanggal: todayISO,
    jamMulai: '09:00',
    jamSelesai: '10:30',
    lokasi: '',
    penyelenggara: '',
    pakaian: 'PDH / Batik',
    nomorSurat: '',
    kategori: 'Rapat Internal',
    status: 'Terjadwal',
    statusDisposisi: 'Menunggu Disposisi',
    pejabatPendamping: '',
    isConfidential: false,
    catatan: '',
    sumber: 'Manual',
  });
  const [formError, setFormError] = useState('');

  // Disposisi Quick Modal
  const [disposisiModalItem, setDisposisiModalItem] = useState<AgendaItem | null>(null);
  const [disposisiDraftStatus, setDisposisiDraftStatus] =
    useState<DisposisiStatus>('Disetujui Pimpinan');
  const [disposisiDraftPejabat, setDisposisiDraftPejabat] = useState('');

  // User Management Modal (Super Admin)
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<Omit<UserAccount, 'id'>>({
    nip: '',
    username: '',
    email: '',
    password: '',
    namaLengkap: '',
    jabatan: '',
    bidang: 'Sekretariat',
    roleKode: 'ROLE_OPERATOR',
    isActive: true,
  });
  const [userFormError, setUserFormError] = useState('');

  // Inline confirm & toast
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  // e-Buddy Extractor State
  const [ebuddyRawText, setEbuddyRawText] = useState('');
  const [ebuddyPreview, setEbuddyPreview] = useState<ExtractedEBuddyResult | null>(null);

  // WhatsApp PNG Card Studio State
  const [cardMode, setCardMode] = useState<CardMode>('harian');
  const [cardTheme, setCardTheme] = useState<CardTheme>('putih');
  const [cardSingleId, setCardSingleId] = useState<string>('');
  const [showPakaianOnCard, setShowPakaianOnCard] = useState(true);
  const [showSuratOnCard, setShowSuratOnCard] = useState(true);
  const [showConflictOnCard, setShowConflictOnCard] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Persist states
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(agendas));
    } catch {
      // ignore
    }
  }, [agendas]);

  useEffect(() => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch {
      // ignore
    }
  }, [users]);

  useEffect(() => {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditLogs.slice(0, 200)));
    } catch {
      // ignore
    }
  }, [auditLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(ORG_TITLE_KEY, orgTitle);
    } catch {
      // ignore
    }
  }, [orgTitle]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCKOUT_STORAGE_KEY,
        JSON.stringify({ count: failedAttempts, until: lockoutUntil })
      );
    } catch {
      // ignore
    }
  }, [failedAttempts, lockoutUntil]);

  // Countdown tick for brute-force lockout & idle session timeout check
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (lockoutUntil > 0 && now >= lockoutUntil) {
        setLockoutUntil(0);
        setFailedAttempts(0);
      }
      if (session && session.expiresAt && now > session.expiresAt) {
        localStorage.removeItem(SESSION_LOCAL_KEY);
        sessionStorage.removeItem(SESSION_TEMP_KEY);
        setSession(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil, session]);

  const showNotice = useCallback((msg: string) => {
    setCopiedToast(msg);
    setTimeout(() => setCopiedToast(null), 2600);
  }, []);

  const appendAuditLog = useCallback(
    (
      eventType: string,
      status: 'SUKSES' | 'GAGAL' | 'PERINGATAN',
      detail: string,
      actor?: { nip: string; nama: string; roleKode: RoleCode | 'GUEST' }
    ) => {
      const entry: AuditLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        nip: actor?.nip || currentUser?.nip || '-',
        nama: actor?.nama || currentUser?.namaLengkap || 'Anonim',
        roleKode: actor?.roleKode || currentUser?.roleKode || 'GUEST',
        eventType,
        status,
        detail,
      };
      setAuditLogs((prev) => [entry, ...prev].slice(0, 200));
    },
    [currentUser]
  );

  // Permissions for active user
  const perms = useMemo(() => {
    return getPermissions(currentUser?.roleKode || 'ROLE_PIMPINAN');
  }, [currentUser]);

  // Visible agendas honoring Row-Level Security (isConfidential)
  const visibleAgendas = useMemo(() => {
    if (!currentUser) return [];
    if (perms.canAccessConfidential) return agendas;
    return agendas.filter(
      (a) => !a.isConfidential || a.createdBy === currentUser.namaLengkap
    );
  }, [agendas, currentUser, perms.canAccessConfidential]);

  // Derived collections
  const dayAgendas = useMemo(() => {
    return visibleAgendas
      .filter((a) => a.tanggal === selectedDate)
      .filter((a) => (categoryFilter === 'Semua' ? true : a.kategori === categoryFilter))
      .filter((a) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          a.judul.toLowerCase().includes(q) ||
          a.lokasi.toLowerCase().includes(q) ||
          a.penyelenggara.toLowerCase().includes(q) ||
          a.nomorSurat.toLowerCase().includes(q) ||
          a.pejabatPendamping.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
  }, [visibleAgendas, selectedDate, categoryFilter, searchQuery]);

  const allDayAgendasUnfiltered = useMemo(() => {
    return visibleAgendas
      .filter((a) => a.tanggal === selectedDate)
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
  }, [visibleAgendas, selectedDate]);

  const dayStats = useMemo(() => {
    const active = allDayAgendasUnfiltered.filter(
      (a) => a.status !== 'Dibatalkan' && a.status !== 'Draft'
    );
    let totalMinutes = 0;
    let conflictCount = 0;
    for (const item of active) {
      totalMinutes += Math.max(0, timeToMinutes(item.jamSelesai) - timeToMinutes(item.jamMulai));
      if (getConflictsForCandidate(visibleAgendas, item).length > 0) {
        conflictCount++;
      }
    }
    const selesaiCount = allDayAgendasUnfiltered.filter((a) => a.status === 'Selesai').length;
    const hours = (totalMinutes / 60).toFixed(1).replace(/\.0$/, '');
    return {
      total: active.length,
      hours,
      conflictCount,
      selesaiCount,
    };
  }, [allDayAgendasUnfiltered, visibleAgendas]);

  const monthPrefix = useMemo(() => {
    return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  const monthAgendas = useMemo(() => {
    return visibleAgendas
      .filter((a) => a.tanggal.startsWith(monthPrefix))
      .sort((a, b) => {
        if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
        return timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai);
      });
  }, [visibleAgendas, monthPrefix]);

  const filteredMonthAgendas = useMemo(() => {
    return monthAgendas
      .filter((a) => (categoryFilter === 'Semua' ? true : a.kategori === categoryFilter))
      .filter((a) =>
        monthlyOnlyConflict ? getConflictsForCandidate(visibleAgendas, a).length > 0 : true
      )
      .filter((a) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          a.judul.toLowerCase().includes(q) ||
          a.lokasi.toLowerCase().includes(q) ||
          a.penyelenggara.toLowerCase().includes(q) ||
          a.nomorSurat.toLowerCase().includes(q)
        );
      });
  }, [monthAgendas, categoryFilter, monthlyOnlyConflict, searchQuery, visibleAgendas]);

  const monthStats = useMemo(() => {
    const active = monthAgendas.filter((a) => a.status !== 'Dibatalkan' && a.status !== 'Draft');
    const conflictItems = active.filter(
      (a) => getConflictsForCandidate(visibleAgendas, a).length > 0
    );
    const totalMinutes = active.reduce(
      (sum, a) => sum + Math.max(0, timeToMinutes(a.jamSelesai) - timeToMinutes(a.jamMulai)),
      0
    );
    const uniqueDays = new Set(active.map((a) => a.tanggal)).size;
    return {
      total: active.length,
      conflicts: conflictItems.length,
      hours: Math.round(totalMinutes / 60),
      uniqueDays,
    };
  }, [monthAgendas, visibleAgendas]);

  const totalGlobalConflicts = useMemo(() => {
    return visibleAgendas.filter(
      (a) =>
        a.status !== 'Dibatalkan' &&
        a.status !== 'Draft' &&
        getConflictsForCandidate(visibleAgendas, a).length > 0
    ).length;
  }, [visibleAgendas]);

  const formConflicts = useMemo(() => {
    return getConflictsForCandidate(agendas, {
      id: editingId || undefined,
      tanggal: formState.tanggal,
      jamMulai: formState.jamMulai,
      jamSelesai: formState.jamSelesai,
      status: formState.status,
    });
  }, [agendas, editingId, formState.tanggal, formState.jamMulai, formState.jamSelesai, formState.status]);

  const ebuddyConflicts = useMemo(() => {
    if (!ebuddyPreview) return [];
    return getConflictsForCandidate(agendas, {
      tanggal: ebuddyPreview.tanggal,
      jamMulai: ebuddyPreview.jamMulai,
      jamSelesai: ebuddyPreview.jamSelesai,
      status: 'Terjadwal',
    });
  }, [agendas, ebuddyPreview]);

  useEffect(() => {
    if (!cardSingleId && visibleAgendas.length > 0) {
      setCardSingleId(visibleAgendas[0].id);
    }
  }, [visibleAgendas, cardSingleId]);

  useEffect(() => {
    if (!currentUser || activeView !== 'kartu' || !canvasRef.current) return;
    const singleAgenda =
      visibleAgendas.find((a) => a.id === cardSingleId) || visibleAgendas[0] || null;
    renderWhatsAppCardCanvas(canvasRef.current, {
      mode: cardMode,
      theme: cardTheme,
      orgTitle,
      selectedDate,
      selectedMonth,
      selectedYear,
      dayAgendas: allDayAgendasUnfiltered,
      singleAgenda,
      monthAgendas,
      allAgendas: visibleAgendas,
      showPakaian: showPakaianOnCard,
      showNomorSurat: showSuratOnCard,
      showConflictAlert: showConflictOnCard,
    });
  }, [
    currentUser,
    activeView,
    cardMode,
    cardTheme,
    orgTitle,
    selectedDate,
    selectedMonth,
    selectedYear,
    allDayAgendasUnfiltered,
    cardSingleId,
    monthAgendas,
    visibleAgendas,
    showPakaianOnCard,
    showSuratOnCard,
    showConflictOnCard,
  ]);

  // ============================================================================
  // AUTHENTICATION HANDLERS
  // ============================================================================

  function completeUserLogin(matchedUser: UserAccount, remember: boolean, methodLabel: string) {
    const now = Date.now();
    const newSession: AuthSession = {
      userId: matchedUser.id,
      remember,
      loginAt: now,
      expiresAt: now + SESSION_DURATION_MS,
    };

    if (remember) {
      localStorage.setItem(SESSION_LOCAL_KEY, JSON.stringify(newSession));
      sessionStorage.removeItem(SESSION_TEMP_KEY);
    } else {
      sessionStorage.setItem(SESSION_TEMP_KEY, JSON.stringify(newSession));
      localStorage.removeItem(SESSION_LOCAL_KEY);
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === matchedUser.id ? { ...u, lastLogin: new Date().toISOString() } : u
      )
    );
    setSession(newSession);
    setFailedAttempts(0);
    setLockoutUntil(0);
    setLoginError('');
    setLoginPassword('');

    // Pengalihan berbasis role sesuai spesifikasi RBAC 1.2
    if (matchedUser.roleKode === 'ROLE_OPERATOR') {
      setActiveView('ebuddy');
    } else {
      setActiveView('harian');
    }

    appendAuditLog(
      'LOGIN_BERHASIL',
      'SUKSES',
      `Masuk melalui ${methodLabel} (${ROLE_META[matchedUser.roleKode].shortLabel}).`,
      {
        nip: matchedUser.nip,
        nama: matchedUser.namaLengkap,
        roleKode: matchedUser.roleKode,
      }
    );
    showNotice(`Selamat datang, ${matchedUser.namaLengkap}.`);
  }

  function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');

    if (lockoutUntil > Date.now()) {
      const sisaDetik = Math.ceil((lockoutUntil - Date.now()) / 1000);
      const menit = Math.floor(sisaDetik / 60);
      const detik = sisaDetik % 60;
      setLoginError(
        `Akun dikunci sementara selama 15 menit karena 5 kali kesalahan sandi. Coba lagi dalam ${menit}m ${detik}d.`
      );
      return;
    }

    const identity = loginIdentity.trim().toLowerCase();
    const password = loginPassword;

    if (!identity) {
      setLoginError('Masukkan 18 digit NIP, username, atau email dinas (@sidoarjokab.go.id).');
      return;
    }
    if (!password || password.length < 8) {
      setLoginError('Kata sandi minimal 8 karakter kombinasi huruf & angka.');
      return;
    }

    const matched = users.find(
      (u) =>
        u.nip.toLowerCase() === identity ||
        u.username.toLowerCase() === identity ||
        u.email.toLowerCase() === identity
    );

    if (!matched || matched.password !== password) {
      const nextCount = failedAttempts + 1;
      setFailedAttempts(nextCount);
      if (nextCount >= MAX_FAILED_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_DURATION_MS;
        setLockoutUntil(until);
        appendAuditLog(
          'AKUN_TERKUNCI',
          'PERINGATAN',
          `Proteksi brute-force aktif setelah 5x gagal login untuk identitas "${loginIdentity.trim()}".`,
          { nip: matched?.nip || loginIdentity.trim(), nama: matched?.namaLengkap || 'Tidak Dikenal', roleKode: matched?.roleKode || 'GUEST' }
        );
        setLoginError(
          'Terlalu banyak percobaan gagal (5x). Akses masuk dikunci sementara selama 15 menit dan dicatat di Audit Log.'
        );
      } else {
        appendAuditLog(
          'LOGIN_GAGAL',
          'GAGAL',
          `Percobaan gagal (${nextCount}/${MAX_FAILED_ATTEMPTS}) untuk identitas "${loginIdentity.trim()}".`,
          { nip: loginIdentity.trim(), nama: matched?.namaLengkap || 'Tidak Dikenal', roleKode: matched?.roleKode || 'GUEST' }
        );
        setLoginError(
          `NIP/Username atau kata sandi tidak sesuai. Sisa percobaan: ${
            MAX_FAILED_ATTEMPTS - nextCount
          } kali.`
        );
      }
      return;
    }

    if (!matched.isActive) {
      appendAuditLog(
        'LOGIN_DITOLAK',
        'PERINGATAN',
        `Akun non-aktif (${matched.nip}) mencoba masuk.`,
        { nip: matched.nip, nama: matched.namaLengkap, roleKode: matched.roleKode }
      );
      setLoginError('Akun ASN ini berstatus non-aktif. Hubungi Super Admin Sekretariat.');
      return;
    }

    completeUserLogin(matched, rememberSession, 'Kredensial NIP/Sandi');
  }

  function handleFillDemoCredentials(role: RoleCode) {
    const demoUser = users.find((u) => u.roleKode === role && u.isActive);
    if (!demoUser) {
      setLoginError(`Tidak ditemukan akun aktif untuk peran ${ROLE_META[role].shortLabel}.`);
      return;
    }
    setLoginIdentity(demoUser.username);
    setLoginPassword(demoUser.password);
    setLoginError('');
    setDemoFilledNotice(
      `User dan kata sandi ${ROLE_META[role].shortLabel} telah diisi. Klik "MASUK KE DASHBOARD SIAGA BPBD" untuk masuk.`
    );
  }

  function handleLogout() {
    if (currentUser) {
      appendAuditLog(
        'LOGOUT',
        'SUKSES',
        `Pengguna keluar dari sistem SIAGA-AGENDA.`,
        {
          nip: currentUser.nip,
          nama: currentUser.namaLengkap,
          roleKode: currentUser.roleKode,
        }
      );
    }
    localStorage.removeItem(SESSION_LOCAL_KEY);
    sessionStorage.removeItem(SESSION_TEMP_KEY);
    setSession(null);
    setActiveView('harian');
    setMobileNavOpen(false);
    setDemoFilledNotice('');
    setShowDemoPanel(false);
  }

  // ============================================================================
  // AGENDA & DISPOSISI HANDLERS
  // ============================================================================

  function openAddModal(presetDate?: string) {
    if (!perms.canCreateAgenda) return;
    setEditingId(null);
    setFormError('');
    setFormState({
      judul: '',
      tanggal: presetDate || selectedDate,
      jamMulai: '09:00',
      jamSelesai: '10:30',
      lokasi: '',
      penyelenggara: '',
      pakaian: 'PDH / Batik',
      nomorSurat: '',
      kategori: 'Rapat Internal',
      status: 'Terjadwal',
      statusDisposisi: 'Menunggu Disposisi',
      pejabatPendamping: '',
      isConfidential: false,
      catatan: '',
      sumber: 'Manual',
    });
    setModalOpen(true);
  }

  function openEditModal(item: AgendaItem) {
    if (!perms.canEditAgenda) return;
    setEditingId(item.id);
    setFormError('');
    setFormState({
      judul: item.judul,
      tanggal: item.tanggal,
      jamMulai: item.jamMulai,
      jamSelesai: item.jamSelesai,
      lokasi: item.lokasi,
      penyelenggara: item.penyelenggara,
      pakaian: item.pakaian,
      nomorSurat: item.nomorSurat,
      kategori: item.kategori,
      status: item.status,
      statusDisposisi: item.statusDisposisi,
      pejabatPendamping: item.pejabatPendamping,
      isConfidential: item.isConfidential,
      catatan: item.catatan,
      sumber: item.sumber,
    });
    setModalOpen(true);
  }

  function handleSaveAgenda(e: React.FormEvent) {
    e.preventDefault();
    if (!formState.judul.trim()) {
      setFormError('Judul agenda wajib diisi.');
      return;
    }
    if (!formState.tanggal) {
      setFormError('Tanggal wajib dipilih.');
      return;
    }
    if (timeToMinutes(formState.jamSelesai) <= timeToMinutes(formState.jamMulai)) {
      setFormError('Jam selesai harus lebih akhir dari jam mulai.');
      return;
    }

    if (editingId) {
      setAgendas((prev) =>
        prev.map((item) => (item.id === editingId ? { ...item, ...formState } : item))
      );
      appendAuditLog('EDIT_AGENDA', 'SUKSES', `Memperbarui agenda "${formState.judul}".`);
      showNotice('Agenda berhasil diperbarui.');
    } else {
      const newItem: AgendaItem = {
        ...formState,
        id: `ag-${Date.now()}`,
        createdBy: currentUser?.namaLengkap || 'Operator',
        createdAt: new Date().toISOString(),
      };
      setAgendas((prev) => [...prev, newItem]);
      setSelectedDate(formState.tanggal);
      appendAuditLog(
        'TAMBAH_AGENDA',
        'SUKSES',
        `Menambahkan agenda "${newItem.judul}" pada ${newItem.tanggal} (${newItem.jamMulai}-${newItem.jamSelesai}).`
      );
      showNotice('Agenda baru ditambahkan.');
    }
    setModalOpen(false);
  }

  function handleDeleteAgenda(item: AgendaItem) {
    if (!perms.canDeleteAgenda(item)) {
      showNotice('Peran Anda hanya diizinkan menghapus agenda berstatus Draft atau Dibatalkan.');
      return;
    }
    setAgendas((prev) => prev.filter((a) => a.id !== item.id));
    setConfirmDeleteId(null);
    appendAuditLog('HAPUS_AGENDA', 'PERINGATAN', `Menghapus agenda "${item.judul}".`);
    showNotice('Agenda dihapus.');
  }

  function handleToggleStatus(item: AgendaItem) {
    if (!perms.canEditAgenda) return;
    const nextStatus: AgendaStatus = item.status === 'Selesai' ? 'Terjadwal' : 'Selesai';
    setAgendas((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, status: nextStatus } : a))
    );
    appendAuditLog(
      'UBAH_STATUS_AGENDA',
      'SUKSES',
      `Status "${item.judul}" diubah menjadi ${nextStatus}.`
    );
  }

  function handleConfirmPimpinanPresence(item: AgendaItem) {
    if (!perms.canConfirmPresence) return;
    setAgendas((prev) =>
      prev.map((a) =>
        a.id === item.id ? { ...a, statusDisposisi: 'Hadir Dikonfirmasi' } : a
      )
    );
    appendAuditLog(
      'KONFIRMASI_HADIR',
      'SUKSES',
      `Pimpinan mengonfirmasi kehadiran pada "${item.judul}".`
    );
    showNotice('Kehadiran pimpinan dikonfirmasi.');
  }

  function openDisposisiModal(item: AgendaItem) {
    setDisposisiModalItem(item);
    setDisposisiDraftStatus(item.statusDisposisi);
    setDisposisiDraftPejabat(item.pejabatPendamping);
  }

  function handleSaveDisposisi(e: React.FormEvent) {
    e.preventDefault();
    if (!disposisiModalItem || !perms.canEditDisposition) return;
    setAgendas((prev) =>
      prev.map((a) =>
        a.id === disposisiModalItem.id
          ? {
              ...a,
              statusDisposisi: disposisiDraftStatus,
              pejabatPendamping: disposisiDraftPejabat.trim() || '-',
            }
          : a
      )
    );
    appendAuditLog(
      'DISPOSISI_AGENDA',
      'SUKSES',
      `Disposisi "${disposisiModalItem.judul}" -> ${disposisiDraftStatus} (${
        disposisiDraftPejabat.trim() || '-'
      }).`
    );
    setDisposisiModalItem(null);
    showNotice('Status disposisi & pendamping disimpan.');
  }

  function handleApplyNextSlotInForm() {
    const dur = Math.max(
      30,
      timeToMinutes(formState.jamSelesai) - timeToMinutes(formState.jamMulai)
    );
    const slot = findNextAvailableSlot(agendas, formState.tanggal, dur, editingId || undefined);
    if (slot) {
      setFormState((prev) => ({ ...prev, jamMulai: slot.jamMulai, jamSelesai: slot.jamSelesai }));
      showNotice(`Slot kosong diterapkan: ${slot.jamMulai} – ${slot.jamSelesai}`);
    } else {
      showNotice('Tidak ada slot kosong di antara 07:30 – 19:00.');
    }
  }

  // ============================================================================
  // E-BUDDY HANDLERS
  // ============================================================================

  function handleExtractEBuddy(rawInput?: string) {
    const source = typeof rawInput === 'string' ? rawInput : ebuddyRawText;
    if (!source.trim()) return;
    const extracted = extractEBuddyText(source, selectedDate);
    setEbuddyPreview(extracted);
  }

  function handleSaveEBuddyToAgenda() {
    if (!ebuddyPreview || !perms.canUseEBuddy) return;
    if (timeToMinutes(ebuddyPreview.jamSelesai) <= timeToMinutes(ebuddyPreview.jamMulai)) {
      showNotice('Perbaiki jam selesai agar lebih akhir dari jam mulai.');
      return;
    }
    const newItem: AgendaItem = {
      id: `ag-${Date.now()}`,
      judul: ebuddyPreview.judul.trim() || 'Agenda e-Buddy',
      tanggal: ebuddyPreview.tanggal,
      jamMulai: ebuddyPreview.jamMulai,
      jamSelesai: ebuddyPreview.jamSelesai,
      lokasi: ebuddyPreview.lokasi.trim() || '-',
      penyelenggara: ebuddyPreview.penyelenggara.trim() || '-',
      pakaian: ebuddyPreview.pakaian.trim() || '-',
      nomorSurat: ebuddyPreview.nomorSurat.trim(),
      kategori: ebuddyPreview.kategori,
      status: 'Terjadwal',
      statusDisposisi: 'Menunggu Disposisi',
      pejabatPendamping: 'Menunggu arahan Sekretaris',
      isConfidential: false,
      catatan: ebuddyPreview.catatan.trim(),
      sumber: 'e-Buddy',
      createdBy: currentUser?.namaLengkap || 'Operator',
      createdAt: new Date().toISOString(),
    };
    setAgendas((prev) => [...prev, newItem]);
    setSelectedDate(newItem.tanggal);
    setActiveView('harian');
    setEbuddyRawText('');
    setEbuddyPreview(null);
    appendAuditLog(
      'EKSTRAK_EBUDDY',
      'SUKSES',
      `Menyimpan surat e-Buddy "${newItem.judul}" (${newItem.nomorSurat || 'Tanpa Nomor'}).`
    );
    showNotice('Hasil ekstraksi e-Buddy disimpan ke jadwal.');
  }

  function handleApplyNextSlotEBuddy() {
    if (!ebuddyPreview) return;
    const dur = Math.max(
      30,
      timeToMinutes(ebuddyPreview.jamSelesai) - timeToMinutes(ebuddyPreview.jamMulai)
    );
    const slot = findNextAvailableSlot(agendas, ebuddyPreview.tanggal, dur);
    if (slot) {
      setEbuddyPreview({
        ...ebuddyPreview,
        jamMulai: slot.jamMulai,
        jamSelesai: slot.jamSelesai,
      });
      showNotice(`Slot bebas bentrok ditemukan: ${slot.jamMulai} – ${slot.jamSelesai}`);
    } else {
      showNotice('Semua slot 07:30 – 19:00 pada tanggal tersebut penuh.');
    }
  }

  // ============================================================================
  // USER MANAGEMENT HANDLERS (SUPER ADMIN)
  // ============================================================================

  function openAddUserModal() {
    setEditingUserId(null);
    setUserFormError('');
    setUserForm({
      nip: '',
      username: '',
      email: '',
      password: 'Bpbd2026!',
      namaLengkap: '',
      jabatan: '',
      bidang: 'Sekretariat',
      roleKode: 'ROLE_OPERATOR',
      isActive: true,
    });
    setUserModalOpen(true);
  }

  function openEditUserModal(u: UserAccount) {
    setEditingUserId(u.id);
    setUserFormError('');
    setUserForm({
      nip: u.nip,
      username: u.username,
      email: u.email,
      password: u.password,
      namaLengkap: u.namaLengkap,
      jabatan: u.jabatan,
      bidang: u.bidang,
      roleKode: u.roleKode,
      isActive: u.isActive,
    });
    setUserModalOpen(true);
  }

  function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!perms.canManageUsers) return;
    if (!userForm.nip.trim() || !userForm.namaLengkap.trim() || !userForm.username.trim()) {
      setUserFormError('NIP, Username, dan Nama Lengkap wajib diisi.');
      return;
    }
    if (userForm.password.length < 8) {
      setUserFormError('Kata sandi minimal 8 karakter.');
      return;
    }

    if (editingUserId) {
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUserId ? { ...u, ...userForm } : u))
      );
      appendAuditLog(
        'UBAH_PENGGUNA',
        'SUKSES',
        `Memperbarui akun ${userForm.namaLengkap} (${ROLE_META[userForm.roleKode].shortLabel}).`
      );
      showNotice('Data akun ASN diperbarui.');
    } else {
      const newUsr: UserAccount = {
        ...userForm,
        id: `usr-${Date.now()}`,
      };
      setUsers((prev) => [...prev, newUsr]);
      appendAuditLog(
        'TAMBAH_PENGGUNA',
        'SUKSES',
        `Menambahkan akun baru ${newUsr.namaLengkap} (${ROLE_META[newUsr.roleKode].shortLabel}).`
      );
      showNotice('Akun ASN baru ditambahkan.');
    }
    setUserModalOpen(false);
  }

  function handleToggleUserActive(u: UserAccount) {
    if (!perms.canManageUsers || u.id === currentUser?.id) return;
    setUsers((prev) =>
      prev.map((usr) => (usr.id === u.id ? { ...usr, isActive: !usr.isActive } : usr))
    );
    appendAuditLog(
      'STATUS_PENGGUNA',
      'PERINGATAN',
      `Mengubah status akun ${u.namaLengkap} menjadi ${!u.isActive ? 'Aktif' : 'Non-Aktif'}.`
    );
  }

  function handleDeleteUser(u: UserAccount) {
    if (!perms.canManageUsers || u.id === currentUser?.id) return;
    setUsers((prev) => prev.filter((usr) => usr.id !== u.id));
    setConfirmDeleteUserId(null);
    appendAuditLog(
      'HAPUS_PENGGUNA',
      'PERINGATAN',
      `Menghapus akun ASN ${u.namaLengkap} (NIP: ${u.nip}).`
    );
    showNotice(`Akun ${u.namaLengkap} dihapus.`);
  }

  // ============================================================================
  // EXPORT & WHATSAPP PNG HANDLERS
  // ============================================================================

  function handleDownloadPNG(
    customMode?: CardMode,
    customDate?: string,
    customSingleItem?: AgendaItem
  ) {
    const tempCanvas = document.createElement('canvas');
    const modeToUse = customMode || cardMode;
    const dateToUse = customDate || selectedDate;
    const dayItems = visibleAgendas
      .filter((a) => a.tanggal === dateToUse)
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));

    renderWhatsAppCardCanvas(tempCanvas, {
      mode: modeToUse,
      theme: cardTheme,
      orgTitle,
      selectedDate: dateToUse,
      selectedMonth,
      selectedYear,
      dayAgendas: dayItems,
      singleAgenda:
        customSingleItem || visibleAgendas.find((a) => a.id === cardSingleId) || visibleAgendas[0] || null,
      monthAgendas,
      allAgendas: visibleAgendas,
      showPakaian: showPakaianOnCard,
      showNomorSurat: showSuratOnCard,
      showConflictAlert: showConflictOnCard,
    });

    const filename =
      modeToUse === 'harian'
        ? `siaga-bpbd-harian-${dateToUse}.png`
        : modeToUse === 'tunggal' &&
          (customSingleItem || visibleAgendas.find((a) => a.id === cardSingleId))
        ? `siaga-bpbd-agenda-${
            (customSingleItem || visibleAgendas.find((a) => a.id === cardSingleId))?.tanggal
          }.png`
        : `siaga-bpbd-bulanan-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.png`;

    tempCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      appendAuditLog('UNDUH_PNG_WA', 'SUKSES', `Mengunduh poster WhatsApp (${filename}).`);
      showNotice(`Gambar ${filename} berhasil diunduh.`);
    }, 'image/png');
  }

  function handleCopyWhatsAppText(modeOverride?: CardMode) {
    const m = modeOverride || cardMode;
    const lines: string[] = [];

    if (m === 'harian') {
      const items = allDayAgendasUnfiltered.filter(
        (a) => a.status !== 'Dibatalkan' && a.status !== 'Draft'
      );
      lines.push(`*${orgTitle}*`);
      lines.push(`Jadwal Hari: *${formatTanggalLengkap(selectedDate)}*`);
      lines.push('');
      if (items.length === 0) {
        lines.push('_Tidak ada agenda terjadwal._');
      } else {
        items.forEach((item, idx) => {
          const conflicts = getConflictsForCandidate(visibleAgendas, item);
          lines.push(`${idx + 1}. *${item.jamMulai} - ${item.jamSelesai} WIB* | ${item.judul}`);
          lines.push(`   Tempat: ${item.lokasi}`);
          if (item.pejabatPendamping) lines.push(`   Disposisi: ${item.statusDisposisi} (${item.pejabatPendamping})`);
          if (item.pakaian) lines.push(`   Pakaian: ${item.pakaian}`);
          if (item.nomorSurat) lines.push(`   No. Surat: ${item.nomorSurat}`);
          if (conflicts.length > 0) {
            lines.push(
              `   [Peringatan Bentrok ${conflicts[0].overlapMinutes} mnt dengan "${conflicts[0].agenda.judul}"]`
            );
          }
          lines.push('');
        });
      }
    } else if (m === 'tunggal') {
      const item = visibleAgendas.find((a) => a.id === cardSingleId) || visibleAgendas[0];
      if (item) {
        lines.push(`*INFORMASI AGENDA BPBD SIDOARJO*`);
        lines.push(`Acara: *${item.judul}*`);
        lines.push(`Hari/Tgl: ${formatTanggalLengkap(item.tanggal)}`);
        lines.push(`Waktu: ${item.jamMulai} - ${item.jamSelesai} WIB`);
        lines.push(`Tempat: ${item.lokasi}`);
        lines.push(`Penyelenggara: ${item.penyelenggara}`);
        lines.push(`Disposisi: ${item.statusDisposisi} (${item.pejabatPendamping || '-'})`);
        if (item.pakaian) lines.push(`Pakaian: ${item.pakaian}`);
        if (item.nomorSurat) lines.push(`No. Surat: ${item.nomorSurat}`);
        if (item.catatan) lines.push(`Catatan: ${item.catatan}`);
      }
    } else {
      const items = monthAgendas.filter((a) => a.status !== 'Dibatalkan' && a.status !== 'Draft');
      lines.push(`*REKAP AGENDA ${BULAN_ID[selectedMonth].toUpperCase()} ${selectedYear}*`);
      lines.push(`${orgTitle}`);
      lines.push(`Total: ${items.length} Kegiatan`);
      lines.push('');
      items.forEach((item, idx) => {
        lines.push(
          `${idx + 1}. ${formatTanggalPendek(item.tanggal)} (${item.jamMulai}-${item.jamSelesai}) — *${item.judul}* @ ${item.lokasi}`
        );
      });
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      showNotice('Teks jadwal format WhatsApp disalin.');
    });
  }

  function handleExportCSV() {
    const headers = [
      'Tanggal',
      'Jam Mulai',
      'Jam Selesai',
      'Judul',
      'Kategori',
      'Lokasi',
      'Penyelenggara',
      'Status Disposisi',
      'Pejabat Pendamping',
      'Pakaian',
      'Nomor Surat',
      'Status',
      'Sifat Rahasia',
    ];
    const rows = monthAgendas.map((a) =>
      [
        a.tanggal,
        a.jamMulai,
        a.jamSelesai,
        a.judul,
        a.kategori,
        a.lokasi,
        a.penyelenggara,
        a.statusDisposisi,
        a.pejabatPendamping,
        a.pakaian,
        a.nomorSurat,
        a.status,
        a.isConfidential ? 'Ya' : 'Tidak',
      ]
        .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-siaga-bpbd-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice('File CSV rekap bulanan berhasil diunduh.');
  }

  function handleExportAuditCSV() {
    if (!perms.canExportAuditLog) return;
    const headers = ['Waktu', 'NIP', 'Nama', 'Role', 'Event', 'Status', 'Detail'];
    const rows = auditLogs.map((l) =>
      [l.timestamp, l.nip, l.nama, l.roleKode, l.eventType, l.status, l.detail]
        .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-siaga-bpbd-${getLocalISODate()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice('Audit Log CSV berhasil diunduh.');
  }

  function handleResetSampleData() {
    const fresh = createInitialAgendas();
    setAgendas(fresh);
    setSelectedDate(getLocalISODate());
    setSelectedMonth(new Date().getMonth());
    setSelectedYear(new Date().getFullYear());
    setConfirmResetOpen(false);
    appendAuditLog('RESET_DATA_CONTOH', 'PERINGATAN', 'Mengembalikan data agenda contoh awal.');
    showNotice('Data contoh berhasil dimuat ulang.');
  }

  // Calendar Grid Builder
  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
    const totalDays = lastDay.getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: Array<{
      dateISO: string | null;
      dayNum: number | null;
      items: AgendaItem[];
      hasConflict: boolean;
    }> = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ dateISO: null, dayNum: null, items: [], hasConflict: false });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateISO = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(
        d
      ).padStart(2, '0')}`;
      const items = visibleAgendas
        .filter((a) => a.tanggal === dateISO && a.status !== 'Dibatalkan')
        .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
      const hasConflict = items.some(
        (it) => getConflictsForCandidate(visibleAgendas, it).length > 0
      );
      cells.push({ dateISO, dayNum: d, items, hasConflict });
    }
    return cells;
  }, [selectedYear, selectedMonth, visibleAgendas]);

  function changeMonth(delta: number) {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setSelectedMonth(m);
    setSelectedYear(y);
  }

  const ebuddyTemplates = useMemo(() => getEBuddyTemplates(todayISO), [todayISO]);

  // ============================================================================
  // LOGIN VIEW (EXACT VISUAL MATCH TO SCREENSHOT + RBAC SPECIFICATION)
  // ============================================================================

  if (!currentUser) {
    const isLocked = lockoutUntil > nowTick;
    const remainingSec = isLocked ? Math.ceil((lockoutUntil - nowTick) / 1000) : 0;

    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          {/* Top Navy Header Block — Logo Kiri (Sidoarjo) & Logo Kanan (BPBD) */}
          <div className="bg-[#0F2A4A] px-6 sm:px-8 py-7 text-white space-y-5">
            <div className="flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <img
                  src="/assets/aistudio/Coat_of_Arms_of_Sidoarjo_Regency__2__55bcc6f5.png"
                  alt="Logo Kabupaten Sidoarjo"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 sm:w-14 sm:h-14 object-contain shrink-0"
                />
                <div className="leading-tight min-w-0">
                  <p className="text-[11px] font-semibold tracking-wider text-sky-300 uppercase truncate">
                    Pemerintah Kabupaten Sidoarjo
                  </p>
                  <p className="text-sm sm:text-base font-bold tracking-wide text-white truncate">
                    BPBD KABUPATEN SIDOARJO
                  </p>
                </div>
              </div>
              <img
                src="/assets/aistudio/images__14__e7f780c6.jpeg"
                alt="Logo BPBD Kabupaten Sidoarjo"
                referrerPolicy="no-referrer"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white p-0.5 object-contain shrink-0"
              />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance">
                SIAGA BPBD SIDOARJO
              </h1>
              <p className="text-sm text-slate-200">
                Sistem Informasi Agenda Kegiatan &amp; Disposisi Real-Time
              </p>
              <p className="text-xs font-semibold text-amber-400 pt-0.5">
                Siap · Cepat · Tepat · Humanis
              </p>
            </div>

            <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200/95">
              SIAGA BPBD Sidoarjo adalah aplikasi web yang dirancang untuk mendigitalisasi alur
              pengelolaan agenda kegiatan kedinasan di lingkungan Badan Penanggulangan Bencana
              Daerah (BPBD) Kabupaten Sidoarjo. Sistem ini memproses surat masuk
              undangan/disposisi dari aplikasi e-Buddy, mendeteksi bentrok jadwal otomatis, serta
              menyiapkan kartu agenda WhatsApp grup pegawai.
            </p>

            <div className="pt-3 border-t border-white/15">
              <p className="text-xs text-slate-300">
                Jl. Raya Kemiri No. 1, Kec. Sidoarjo, Kabupaten Sidoarjo
              </p>
            </div>
          </div>

          {/* Bottom White Portal Form Block */}
          <div className="px-6 sm:px-8 py-7 space-y-5">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Portal Masuk SIAGA BPBD
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Masuk menggunakan NIP (18 digit), Email Dinas (@sidoarjokab.go.id), atau Username
                kedinasan Anda.
              </p>
            </div>

            {loginError && (
              <div
                role="alert"
                className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800"
              >
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            {isLocked && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2.5 text-xs font-medium text-amber-900">
                <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="font-mono tabular-nums">
                  Sistem terkunci sementara ({Math.floor(remainingSec / 60)}m {remainingSec % 60}d
                  tersisa). Atau gunakan tombol Masuk Demo Cepat di bawah.
                </span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identity"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  NIP / Username Kedinasan <span className="text-red-600">*</span>
                </label>
                <input
                  id="login-identity"
                  type="text"
                  value={loginIdentity}
                  onChange={(e) => setLoginIdentity(e.target.value)}
                  placeholder="Masukkan 18 digit NIP atau email/username pegawai..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2A4A]"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Kata Sandi <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Masukkan kata sandi (minimal 8 karakter)..."
                    className="w-full pl-3.5 pr-11 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2A4A]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded"
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(e) => setRememberSession(e.target.checked)}
                    className="w-4 h-4 accent-blue-700 rounded"
                  />
                  <span>Pertahankan sesi masuk selama jam kerja (07.30 – 16.00 WIB)</span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowForgotHelp((v) => !v)}
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline font-medium text-left whitespace-nowrap shrink-0"
                >
                  <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Lupa Kata Sandi / Hubungi Admin Sekretariat</span>
                </button>
              </div>

              {showForgotHelp && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1.5">
                  <p className="font-semibold text-slate-900">
                    Bantuan Reset Kata Sandi &amp; Kredensial Uji Coba
                  </p>
                  <p>
                    Hubungi Admin Sistem / Pranata Komputer Sekretariat BPBD Kabupaten Sidoarjo
                    untuk reset sandi akun ASN. Untuk pengujian, semua akun demo menggunakan kata
                    sandi standar: <code className="font-mono font-semibold text-slate-900">Bpbd2026!</code>
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 bg-[#E65100] hover:bg-[#CC4700] text-white font-semibold text-sm rounded-lg transition-colors tracking-wide focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65100]"
              >
                MASUK KE DASHBOARD SIAGA BPBD
              </button>
            </form>

            {/* Demo Panel Toggle (Hidden by default; clicking a role fills username & password) */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowDemoPanel((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <span>{showDemoPanel ? 'Sembunyikan Akun Demo' : 'Tampilkan Akun Demo Uji Coba'}</span>
                </button>
                {showDemoPanel && (
                  <span className="text-[11px] text-slate-400">
                    Klik untuk isi user &amp; sandi
                  </span>
                )}
              </div>

              {showDemoPanel && (
                <div className="space-y-2.5">
                  {demoFilledNotice && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{demoFilledNotice}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        'ROLE_SUPER_ADMIN',
                        'ROLE_OPERATOR',
                        'ROLE_DISPOSISI',
                        'ROLE_PIMPINAN',
                      ] as RoleCode[]
                    ).map((role) => {
                      const usr = users.find((u) => u.roleKode === role);
                      const isFilled = usr && loginIdentity === usr.username;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => handleFillDemoCredentials(role)}
                          className={`p-2.5 text-left border rounded-lg transition-colors ${
                            isFilled
                              ? 'border-[#0F2A4A] bg-slate-100'
                              : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {ROLE_META[role].shortLabel}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">
                            {usr?.username || role}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
              Akses terbatas untuk ASN &amp; Pegawai BPBD Kabupaten Sidoarjo. Seluruh aktivitas login
              dan perubahan jadwal tercatat dalam Audit Log (maksimal 5 percobaan gagal).
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // AUTHENTICATED RBAC NAVIGATION ITEMS
  // ============================================================================

  const allNavItems: Array<{
    id: ActiveView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    countText?: string;
    visible: boolean;
  }> = [
    {
      id: 'harian',
      label: 'Jadwal Harian',
      icon: Calendar,
      countText: String(dayStats.total),
      visible: true,
    },
    {
      id: 'bulanan',
      label: 'Rekap Bulanan',
      icon: CalendarDays,
      countText: String(monthStats.total),
      visible: true,
    },
    {
      id: 'ebuddy',
      label: 'Ekstrak e-Buddy',
      icon: Sparkles,
      visible: perms.canUseEBuddy,
    },
    {
      id: 'kartu',
      label: 'Kartu WhatsApp',
      icon: ImageIcon,
      visible: perms.canOpenCardStudio,
    },
    {
      id: 'pengguna',
      label: 'Manajemen Akun',
      icon: Users,
      countText: String(users.length),
      visible: perms.canManageUsers,
    },
    {
      id: 'audit',
      label: 'Riwayat Audit Log',
      icon: ClipboardList,
      countText: String(auditLogs.length),
      visible: perms.canViewAuditLog,
    },
  ];
  const navItems = allNavItems.filter((n) => n.visible);

  // ============================================================================
  // MAIN WORKSPACE SHELL
  // ============================================================================

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Toast Notice */}
      {copiedToast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium border border-slate-800"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{copiedToast}</span>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Zone (Single clean line) */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/assets/aistudio/Coat_of_Arms_of_Sidoarjo_Regency__2__55bcc6f5.png"
                alt="Logo Sidoarjo"
                referrerPolicy="no-referrer"
                className="w-7 h-7 object-contain shrink-0"
              />
              <span className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap truncate">
                SIAGA BPBD
              </span>
              <img
                src="/assets/aistudio/images__14__e7f780c6.jpeg"
                alt="Logo BPBD"
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-contain shrink-0"
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden p-2 -mr-2 text-slate-500 hover:text-slate-900"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Primary Navigation (Filtered by RBAC) */}
          <nav className="p-4 space-y-1" aria-label="Menu Utama">
            {navItems.map((nav) => {
              const Icon = nav.icon;
              const isActive = activeView === nav.id;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => {
                    setActiveView(nav.id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-[#0F2A4A] text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{nav.label}</span>
                  </span>
                  {nav.countText !== undefined && (
                    <span
                      className={`font-mono tabular-nums text-xs ${
                        isActive ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {nav.countText}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Summary Block (Hairline separated, zero pills) */}
          <div className="mx-4 mt-2 pt-4 border-t border-slate-200 space-y-3">
            <div className="px-2">
              <p className="text-xs font-medium text-slate-500">Ringkasan Akses Anda</p>
              <div className="mt-2.5 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Agenda Terlihat</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {visibleAgendas.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Bentrok Aktif</span>
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      totalGlobalConflicts > 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {totalGlobalConflicts}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                {ROLE_META[currentUser.roleKode].description}
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar Footer Actions */}
        <div className="p-4 border-t border-slate-200 space-y-2">
          {perms.canCreateAgenda && (
            <>
              {!confirmResetOpen ? (
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Muat Ulang Data Contoh</span>
                </button>
              ) : (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <p className="text-xs text-slate-700">Kembalikan jadwal contoh awal?</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetSampleData}
                      className="px-2.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800 whitespace-nowrap"
                    >
                      Ya, Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResetOpen(false)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Keluar dari Sesi</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar with Active Role Info + Logout + Role-Gated Primary Action */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden md:inline whitespace-nowrap">
                SIAGA BPBD Sidoarjo
              </span>
              <span className="text-slate-300 hidden md:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">
                {activeView === 'harian' && 'Jadwal & Rekap Harian'}
                {activeView === 'bulanan' && 'Kalender & Rekap Bulanan'}
                {activeView === 'ebuddy' && 'Ekstraksi Teks Surat e-Buddy'}
                {activeView === 'kartu' && 'Studio Kartu Agenda WhatsApp (.PNG)'}
                {activeView === 'pengguna' && 'Manajemen Pengguna & Hak Akses'}
                {activeView === 'audit' && 'Riwayat Audit Log Sistem'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Clean unboxed active role & user metadata (Zero-pill discipline) */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-[#0F2A4A] shrink-0" />
              <span className="font-semibold text-slate-900 whitespace-nowrap">
                {currentUser.namaLengkap}
              </span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{ROLE_META[currentUser.roleKode].shortLabel}</span>
            </div>

            {perms.canCreateAgenda && (
              <button
                type="button"
                onClick={() => openAddModal(selectedDate)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E65100] hover:bg-[#CC4700] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Tambah Agenda</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              title="Keluar (Logout)"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Keluar</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* View-Only Banner for ROLE_PIMPINAN */}
          {currentUser.roleKode === 'ROLE_PIMPINAN' && (
            <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-700">
              <span>
                <strong className="font-semibold text-slate-900">Mode Eksekutif (View-Only):</strong>{' '}
                Anda dapat memantau seluruh agenda pimpinan (termasuk agenda terbatas),
                mengonfirmasi kehadiran, dan mengunduh poster/rekap.
              </span>
              <span className="font-mono text-slate-500 whitespace-nowrap">
                {currentUser.jabatan}
              </span>
            </div>
          )}

          {/* ================================================================ */}
          {/* VIEW 1: JADWAL & REKAP HARIAN                                    */}
          {/* ================================================================ */}
          {activeView === 'harian' && (
            <div className="space-y-6">
              {/* Date Navigation & Quick Actions Toolbar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Tanggal Dipilih</p>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5 text-balance">
                    {formatTanggalLengkap(selectedDate)}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors"
                      aria-label="Hari sebelumnya"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(todayISO)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        selectedDate === todayISO
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Hari Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors"
                      aria-label="Hari berikutnya"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                    aria-label="Pilih tanggal"
                    className="px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F2A4A]"
                  />

                  <button
                    type="button"
                    onClick={() => handleDownloadPNG('harian', selectedDate)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span>Unduh Kartu WA (.PNG)</span>
                  </button>
                </div>
              </div>

              {/* 4-Column Summary Metric Strip */}
              <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Agenda Aktif</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {dayStats.total}
                  </p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Total Durasi</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {dayStats.hours}{' '}
                    <span className="text-sm font-sans font-normal text-slate-500">jam</span>
                  </p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Status Bentrok</p>
                  <p
                    className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                      dayStats.conflictCount > 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {dayStats.conflictCount > 0 ? `${dayStats.conflictCount} Bentrok` : 'Aman'}
                  </p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Sudah Selesai</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {dayStats.selesaiCount}
                  </p>
                </div>
              </div>

              {/* Automatic Conflict Warning Alert */}
              {dayStats.conflictCount > 0 && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-900">
                        Deteksi Bentrok Jadwal Otomatis ({dayStats.conflictCount} kegiatan
                        bertabrakan)
                      </p>
                      <p className="text-sm text-red-700 mt-0.5">
                        Terdapat jam pelaksanaan yang saling tumpang tindih pada tanggal{' '}
                        {formatTanggalPendek(selectedDate)}. Pejabat Disposisi dapat menetapkan
                        perwakilan atau mengedit jadwal ke slot waktu kosong.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Search & Category Segmented Filter */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari judul, lokasi, nomor surat, atau pendamping..."
                    className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F2A4A]"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
                  {(['Semua', ...CATEGORIES] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        categoryFilter === cat
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Daily Agenda List */}
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
                {dayAgendas.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        Belum ada agenda pada {formatTanggalPendek(selectedDate)}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">
                        {perms.canCreateAgenda
                          ? 'Tambahkan agenda manual atau tempel teks surat e-Buddy untuk pengisian otomatis.'
                          : 'Belum ada jadwal yang dipublikasikan untuk tanggal ini.'}
                      </p>
                    </div>
                    {perms.canCreateAgenda && (
                      <div className="pt-2 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => openAddModal(selectedDate)}
                          className="px-4 py-2 text-sm font-medium bg-[#E65100] text-white rounded-lg hover:bg-[#CC4700] whitespace-nowrap"
                        >
                          Tambah Agenda
                        </button>
                        {perms.canUseEBuddy && (
                          <button
                            type="button"
                            onClick={() => setActiveView('ebuddy')}
                            className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                          >
                            Ekstrak Surat e-Buddy
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  dayAgendas.map((item) => {
                    const conflicts = getConflictsForCandidate(visibleAgendas, item);
                    const hasConflict = conflicts.length > 0;
                    const isDone = item.status === 'Selesai';
                    const isCancelled = item.status === 'Dibatalkan';
                    const canDeleteThis = perms.canDeleteAgenda(item);

                    return (
                      <div
                        key={item.id}
                        className={`p-4 sm:p-5 transition-colors ${
                          hasConflict ? 'bg-red-50/40' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          {/* Left: Time + Content */}
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 min-w-0 flex-1">
                            <div className="sm:w-36 shrink-0">
                              <div
                                className={`font-mono tabular-nums text-base font-semibold ${
                                  hasConflict
                                    ? 'text-red-700'
                                    : isCancelled
                                    ? 'text-slate-400 line-through'
                                    : 'text-slate-900'
                                }`}
                              >
                                {item.jamMulai} – {item.jamSelesai}
                              </div>
                              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                                {formatDurasi(item.jamMulai, item.jamSelesai)}
                              </div>
                            </div>

                            <div className="min-w-0 flex-1 space-y-1.5">
                              {/* Unboxed metadata kicker line (Zero-pill discipline) */}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{item.kategori}</span>
                                <span aria-hidden="true">·</span>
                                <span>{item.sumber}</span>
                                {item.nomorSurat && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono tabular-nums">{item.nomorSurat}</span>
                                  </>
                                )}
                                <span aria-hidden="true">·</span>
                                <span
                                  className={`font-medium ${
                                    isDone
                                      ? 'text-emerald-700'
                                      : isCancelled
                                      ? 'text-slate-400'
                                      : item.status === 'Draft'
                                      ? 'text-amber-700'
                                      : 'text-blue-700'
                                  }`}
                                >
                                  {item.status}
                                </span>
                                {item.isConfidential && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-semibold text-amber-700">
                                      Sifat Terbatas
                                    </span>
                                  </>
                                )}
                              </div>

                              <h3
                                className={`text-base font-semibold text-slate-900 ${
                                  isDone || isCancelled ? 'line-through text-slate-500' : ''
                                }`}
                              >
                                {item.judul}
                              </h3>

                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{item.lokasi || '-'}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{item.penyelenggara || '-'}</span>
                                </span>
                                {item.pakaian && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <Shirt className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>{item.pakaian}</span>
                                  </span>
                                )}
                              </div>

                              {/* Disposisi line */}
                              <div className="text-xs text-slate-600 pt-0.5">
                                <span className="font-medium text-slate-800">
                                  Disposisi: {item.statusDisposisi}
                                </span>
                                {item.pejabatPendamping && (
                                  <span className="text-slate-500">
                                    {' '}
                                    · Pendamping: {item.pejabatPendamping}
                                  </span>
                                )}
                              </div>

                              {item.catatan && (
                                <p className="text-xs text-slate-500">{item.catatan}</p>
                              )}

                              {hasConflict && (
                                <div className="pt-1.5 flex items-start gap-2 text-xs font-medium text-red-700">
                                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                  <span>
                                    Bentrok {conflicts[0].overlapMinutes} menit dengan{' '}
                                    <strong className="font-semibold">
                                      "{conflicts[0].agenda.judul}"
                                    </strong>{' '}
                                    ({conflicts[0].agenda.jamMulai}–{conflicts[0].agenda.jamSelesai})
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right: Role-Gated Row Actions */}
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end md:self-start">
                            {confirmDeleteId === item.id ? (
                              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                                <span className="text-xs font-medium text-red-800 whitespace-nowrap">
                                  Hapus?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAgenda(item)}
                                  className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 whitespace-nowrap"
                                >
                                  Ya
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <>
                                {perms.canConfirmPresence &&
                                  item.statusDisposisi !== 'Hadir Dikonfirmasi' && (
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmPimpinanPresence(item)}
                                      className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-medium whitespace-nowrap"
                                    >
                                      Konfirmasi Hadir
                                    </button>
                                  )}

                                {perms.canEditDisposition && (
                                  <button
                                    type="button"
                                    onClick={() => openDisposisiModal(item)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium whitespace-nowrap"
                                  >
                                    Disposisi
                                  </button>
                                )}

                                {perms.canEditAgenda && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStatus(item)}
                                    title={isDone ? 'Tandai Terjadwal' : 'Tandai Selesai'}
                                    className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                                      isDone
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                        : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                    }`}
                                    aria-label={isDone ? 'Tandai Terjadwal' : 'Tandai Selesai'}
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}

                                {perms.canOpenCardStudio ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCardMode('tunggal');
                                      setCardSingleId(item.id);
                                      setActiveView('kartu');
                                    }}
                                    title="Buat Kartu WhatsApp PNG"
                                    className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-700 hover:bg-slate-50 transition-colors"
                                    aria-label="Buat Kartu WhatsApp"
                                  >
                                    <ImageIcon className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadPNG('tunggal', item.tanggal, item)}
                                    title="Unduh Kartu PNG"
                                    className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-700 hover:bg-slate-50 transition-colors"
                                    aria-label="Unduh Kartu PNG"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                )}

                                {perms.canEditAgenda && (
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(item)}
                                    title="Edit Agenda"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs font-medium transition-colors whitespace-nowrap"
                                    aria-label="Edit Agenda"
                                  >
                                    <Pencil className="w-3.5 h-3.5 shrink-0" />
                                    <span>Edit</span>
                                  </button>
                                )}

                                {canDeleteThis && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(item.id)}
                                    title="Hapus Agenda"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 text-xs font-medium transition-colors whitespace-nowrap"
                                    aria-label="Hapus Agenda"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Hapus</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Quick Daily WhatsApp Text Copy Bar */}
              {dayAgendas.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-slate-500">
                    Siap dibagikan ke grup WhatsApp pimpinan atau pegawai BPBD Sidoarjo dalam format
                    gambar PNG atau teks rapi.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyWhatsAppText('harian')}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Teks WA</span>
                    </button>
                    {perms.canOpenCardStudio && (
                      <button
                        type="button"
                        onClick={() => {
                          setCardMode('harian');
                          setActiveView('kartu');
                        }}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Kustomisasi Kartu PNG</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* VIEW 2: KALENDER & REKAP BULANAN                                 */}
          {/* ================================================================ */}
          {activeView === 'bulanan' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => changeMonth(-1)}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md"
                      aria-label="Bulan sebelumnya"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setSelectedMonth(now.getMonth());
                        setSelectedYear(now.getFullYear());
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-white rounded-md whitespace-nowrap"
                    >
                      Bulan Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => changeMonth(1)}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md"
                      aria-label="Bulan berikutnya"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {BULAN_ID[selectedMonth]} {selectedYear}
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyWhatsAppText('bulanan')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Rekap WA</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Unduh CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadPNG('bulanan')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-[#0F2A4A] hover:bg-slate-800 rounded-lg whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Rekap PNG</span>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Total Kegiatan</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {monthStats.total}
                  </p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Hari Terisi</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {monthStats.uniqueDays}{' '}
                    <span className="text-sm font-sans font-normal text-slate-500">hari</span>
                  </p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Estimasi Jam Rapat</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {monthStats.hours}{' '}
                    <span className="text-sm font-sans font-normal text-slate-500">jam</span>
                  </p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Bentrok Bulan Ini</p>
                  <p
                    className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                      monthStats.conflicts > 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {monthStats.conflicts > 0 ? `${monthStats.conflicts} Jadwal` : '0'}
                  </p>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                  {HARI_SINGKAT_SENIN.map((day) => (
                    <div
                      key={day}
                      className="py-2.5 text-center text-xs font-semibold text-slate-600"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
                  {calendarDays.map((cell, idx) => {
                    if (!cell.dateISO || !cell.dayNum) {
                      return <div key={`empty-${idx}`} className="min-h-24 bg-slate-50/60" />;
                    }
                    const isToday = cell.dateISO === todayISO;
                    const isSelected = cell.dateISO === selectedDate;
                    return (
                      <button
                        key={cell.dateISO}
                        type="button"
                        onClick={() => {
                          setSelectedDate(cell.dateISO!);
                          setActiveView('harian');
                        }}
                        className={`min-h-24 p-2 text-left flex flex-col justify-between transition-colors hover:bg-blue-50/40 ${
                          isSelected ? 'bg-blue-50/60' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span
                            className={`font-mono tabular-nums text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-md ${
                              isToday ? 'bg-[#0F2A4A] text-white' : 'text-slate-700'
                            }`}
                          >
                            {cell.dayNum}
                          </span>
                          {cell.hasConflict && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-red-600">
                              <AlertTriangle className="w-3 h-3" />
                              <span className="hidden sm:inline">Bentrok</span>
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 space-y-1 w-full">
                          {cell.items.slice(0, 2).map((it) => (
                            <div
                              key={it.id}
                              className="text-[11px] leading-tight text-slate-700 truncate"
                            >
                              <span className="font-mono text-slate-400 mr-1">{it.jamMulai}</span>
                              <span>{it.judul}</span>
                            </div>
                          ))}
                          {cell.items.length > 2 && (
                            <div className="text-[11px] font-medium text-blue-700 font-mono tabular-nums">
                              +{cell.items.length - 2} lainnya
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Monthly Summary Data Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Tabel Rekap Agenda {BULAN_ID[selectedMonth]} {selectedYear}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Menampilkan agenda sesuai hak akses peran Anda.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMonthlyOnlyConflict((v) => !v)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                        monthlyOnlyConflict
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {monthlyOnlyConflict ? 'Menampilkan Bentrok Saja' : 'Filter: Bentrok Saja'}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4 whitespace-nowrap">Tanggal</th>
                        <th className="py-3 px-4 whitespace-nowrap">Waktu</th>
                        <th className="py-3 px-4">Kegiatan &amp; Disposisi</th>
                        <th className="py-3 px-4">Lokasi</th>
                        <th className="py-3 px-4 whitespace-nowrap">Status &amp; Bentrok</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredMonthAgendas.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-slate-500">
                            Tidak ada agenda yang sesuai filter pada bulan ini.
                          </td>
                        </tr>
                      ) : (
                        filteredMonthAgendas.map((item) => {
                          const conflicts = getConflictsForCandidate(visibleAgendas, item);
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                                {formatTanggalPendek(item.tanggal)}
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums text-xs font-medium text-slate-900 whitespace-nowrap">
                                {item.jamMulai}–{item.jamSelesai}
                              </td>
                              <td className="py-3 px-4 max-w-xs">
                                <div className="font-medium text-slate-900 truncate">
                                  {item.judul}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {item.statusDisposisi}
                                  {item.pejabatPendamping ? ` · ${item.pejabatPendamping}` : ''}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-600 max-w-[200px] truncate">
                                {item.lokasi}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="text-xs">
                                  <span
                                    className={
                                      item.status === 'Selesai'
                                        ? 'text-emerald-700 font-medium'
                                        : item.status === 'Dibatalkan'
                                        ? 'text-slate-400'
                                        : 'text-slate-700'
                                    }
                                  >
                                    {item.status}
                                  </span>
                                  {conflicts.length > 0 && (
                                    <span className="ml-2 inline-flex items-center gap-1 text-red-600 font-semibold">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      Bentrok
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                {confirmDeleteId === `month-${item.id}` ? (
                                  <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 px-2 py-1 rounded">
                                    <span className="text-xs text-red-800">Hapus?</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAgenda(item)}
                                      className="text-xs font-semibold text-red-700 hover:underline"
                                    >
                                      Ya
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="text-xs text-slate-600 hover:text-slate-900"
                                    >
                                      Batal
                                    </button>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-3">
                                    {perms.canEditAgenda && (
                                      <button
                                        type="button"
                                        onClick={() => openEditModal(item)}
                                        className="text-xs font-medium text-blue-700 hover:underline"
                                      >
                                        Edit
                                      </button>
                                    )}
                                    {perms.canDeleteAgenda(item) && (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(`month-${item.id}`)}
                                        className="text-xs font-medium text-red-600 hover:underline"
                                      >
                                        Hapus
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedDate(item.tanggal);
                                        setActiveView('harian');
                                      }}
                                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                                    >
                                      Lihat Hari
                                    </button>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* VIEW 3: EKSTRAKSI TEKS SURAT E-BUDDY (OPERATOR & SUPER ADMIN)    */}
          {/* ================================================================ */}
          {activeView === 'ebuddy' && perms.canUseEBuddy && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Tempel Teks Surat / Disposisi e-Buddy
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Salin isi surat undangan atau nota dinas e-Buddy untuk mengekstrak tanggal,
                    waktu, tempat, pakaian, dan nomor surat secara otomatis.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Contoh Cepat Uji Ekstraksi:</p>
                  <div className="flex flex-wrap gap-2">
                    {ebuddyTemplates.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => {
                          setEbuddyRawText(tpl.text);
                          handleExtractEBuddy(tpl.text);
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors whitespace-nowrap"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="ebuddy-textarea" className="sr-only">
                    Teks Surat e-Buddy
                  </label>
                  <textarea
                    id="ebuddy-textarea"
                    rows={12}
                    value={ebuddyRawText}
                    onChange={(e) => setEbuddyRawText(e.target.value)}
                    placeholder={`Contoh format:\nNomor : 360/123/BPBD/2026\nHal : Undangan Rapat Koordinasi\nHari/Tanggal : Kamis, 26 November 2026\nPukul : 09.00 - 11.30 WIB\nTempat : Ruang Rapat Pusdalops BPBD\nPakaian : PDH / Batik`}
                    className="w-full p-3.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F2A4A] text-slate-900"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEbuddyRawText('');
                      setEbuddyPreview(null);
                    }}
                    className="px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    Bersihkan
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExtractEBuddy()}
                    disabled={!ebuddyRawText.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#E65100] text-white rounded-lg hover:bg-[#CC4700] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Ekstrak Jadwal Sekarang</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Pratinjau Hasil Ekstraksi
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Periksa atau sesuaikan kolom sebelum menyimpan ke kalender.
                    </p>
                  </div>
                  {ebuddyPreview && (
                    <span className="text-xs font-mono tabular-nums text-emerald-700 font-medium">
                      {ebuddyPreview.detectedFields.length} bidang terdeteksi
                    </span>
                  )}
                </div>

                {!ebuddyPreview ? (
                  <div className="py-16 text-center space-y-2">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm font-medium text-slate-700">
                      Belum ada teks surat yang diekstrak
                    </p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Pilih salah satu contoh di sebelah kiri atau tempel teks surat e-Buddy lalu
                      klik Ekstrak Jadwal.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {ebuddyConflicts.length > 0 ? (
                      <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg space-y-2">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-red-800">
                            <p className="font-semibold">
                              Jadwal Surat Ini Bentrok dengan Agenda Lain!
                            </p>
                            <p className="mt-0.5">
                              Bertabrakan {ebuddyConflicts[0].overlapMinutes} menit dengan{' '}
                              <strong>"{ebuddyConflicts[0].agenda.judul}"</strong> (
                              {ebuddyConflicts[0].agenda.jamMulai}–
                              {ebuddyConflicts[0].agenda.jamSelesai}).
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyNextSlotEBuddy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-700 hover:bg-red-100 rounded-md"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Cari &amp; Terapkan Slot Kosong Terdekat</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs font-medium text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Tidak ada bentrok jadwal pada tanggal &amp; jam tersebut.</span>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Judul Acara / Kegiatan
                        </label>
                        <input
                          type="text"
                          value={ebuddyPreview.judul}
                          onChange={(e) =>
                            setEbuddyPreview({ ...ebuddyPreview, judul: e.target.value })
                          }
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Tanggal
                          </label>
                          <input
                            type="date"
                            value={ebuddyPreview.tanggal}
                            onChange={(e) =>
                              setEbuddyPreview({ ...ebuddyPreview, tanggal: e.target.value })
                            }
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Jam Mulai
                          </label>
                          <input
                            type="time"
                            value={ebuddyPreview.jamMulai}
                            onChange={(e) =>
                              setEbuddyPreview({ ...ebuddyPreview, jamMulai: e.target.value })
                            }
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Jam Selesai
                          </label>
                          <input
                            type="time"
                            value={ebuddyPreview.jamSelesai}
                            onChange={(e) =>
                              setEbuddyPreview({ ...ebuddyPreview, jamSelesai: e.target.value })
                            }
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Lokasi / Ruangan / Link
                          </label>
                          <input
                            type="text"
                            value={ebuddyPreview.lokasi}
                            onChange={(e) =>
                              setEbuddyPreview({ ...ebuddyPreview, lokasi: e.target.value })
                            }
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Penyelenggara / Disposisi
                          </label>
                          <input
                            type="text"
                            value={ebuddyPreview.penyelenggara}
                            onChange={(e) =>
                              setEbuddyPreview({ ...ebuddyPreview, penyelenggara: e.target.value })
                            }
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Nomor Surat
                          </label>
                          <input
                            type="text"
                            value={ebuddyPreview.nomorSurat}
                            onChange={(e) =>
                              setEbuddyPreview({ ...ebuddyPreview, nomorSurat: e.target.value })
                            }
                            className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Pakaian
                          </label>
                          <input
                            type="text"
                            value={ebuddyPreview.pakaian}
                            onChange={(e) =>
                              setEbuddyPreview({ ...ebuddyPreview, pakaian: e.target.value })
                            }
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Kategori
                          </label>
                          <select
                            value={ebuddyPreview.kategori}
                            onChange={(e) =>
                              setEbuddyPreview({
                                ...ebuddyPreview,
                                kategori: e.target.value as AgendaCategory,
                              })
                            }
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Catatan Tambahan
                        </label>
                        <input
                          type="text"
                          value={ebuddyPreview.catatan}
                          onChange={(e) =>
                            setEbuddyPreview({ ...ebuddyPreview, catatan: e.target.value })
                          }
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={handleSaveEBuddyToAgenda}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#0F2A4A] text-white rounded-lg hover:bg-slate-800 whitespace-nowrap"
                      >
                        <span>Simpan ke Jadwal</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* VIEW 4: STUDIO KARTU WHATSAPP (.PNG)                             */}
          {/* ================================================================ */}
          {activeView === 'kartu' && perms.canOpenCardStudio && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Pengaturan Kartu WhatsApp
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Gambar beresolusi 1080px tajam dan siap langsung dikirim ke grup WhatsApp
                    pegawai BPBD Sidoarjo.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">Jenis Kartu</label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        { id: 'harian', label: 'Harian' },
                        { id: 'tunggal', label: '1 Agenda' },
                        { id: 'bulanan', label: 'Bulanan' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setCardMode(m.id)}
                        className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          cardMode === m.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {cardMode === 'harian' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Tanggal Jadwal Harian
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                    />
                  </div>
                )}

                {cardMode === 'tunggal' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Pilih Agenda yang Ditampilkan
                    </label>
                    <select
                      value={cardSingleId}
                      onChange={(e) => setCardSingleId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      {visibleAgendas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {formatTanggalPendek(a.tanggal)} ({a.jamMulai}) — {a.judul}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {cardMode === 'bulanan' && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-sm font-medium text-slate-800">
                      {BULAN_ID[selectedMonth]} {selectedYear}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => changeMonth(-1)}
                        className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-100"
                        aria-label="Bulan sebelumnya"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => changeMonth(1)}
                        className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-100"
                        aria-label="Bulan berikutnya"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Judul Kop Instansi (Header Kartu)
                    {currentUser.roleKode !== 'ROLE_SUPER_ADMIN' && (
                      <span className="text-slate-400 font-normal"> · Dikelola Super Admin</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={orgTitle}
                    onChange={(e) => setOrgTitle(e.target.value)}
                    disabled={currentUser.roleKode !== 'ROLE_SUPER_ADMIN'}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">
                    Tema Warna Kartu
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'putih', label: 'Putih Bersih' },
                        { id: 'biru', label: 'Biru BPBD' },
                        { id: 'gelap', label: 'Gelap Elegan' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setCardTheme(t.id)}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                          cardTheme === t.id
                            ? 'border-[#0F2A4A] bg-slate-100 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5 pt-1 border-t border-slate-200">
                  <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                    <span>Tampilkan info pakaian / dresscode</span>
                    <input
                      type="checkbox"
                      checked={showPakaianOnCard}
                      onChange={(e) => setShowPakaianOnCard(e.target.checked)}
                      className="w-4 h-4 accent-[#0F2A4A]"
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                    <span>Tampilkan nomor surat e-Buddy</span>
                    <input
                      type="checkbox"
                      checked={showSuratOnCard}
                      onChange={(e) => setShowSuratOnCard(e.target.checked)}
                      className="w-4 h-4 accent-[#0F2A4A]"
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                    <span>Tampilkan penanda jadwal bentrok</span>
                    <input
                      type="checkbox"
                      checked={showConflictOnCard}
                      onChange={(e) => setShowConflictOnCard(e.target.checked)}
                      className="w-4 h-4 accent-[#0F2A4A]"
                    />
                  </label>
                </div>

                <div className="pt-2 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => handleDownloadPNG()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Gambar Kartu (.PNG)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyWhatsAppText()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Salin Caption Teks WhatsApp</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Pratinjau Langsung Gambar PNG (1080px)
                  </span>
                  <span className="text-xs font-mono text-slate-400">image/png</span>
                </div>
                <div className="bg-slate-100 rounded-lg p-3 sm:p-5 flex justify-center overflow-auto max-h-[760px] border border-slate-200">
                  <canvas
                    ref={canvasRef}
                    className="max-w-full h-auto rounded-lg shadow-md"
                    style={{ maxHeight: '700px', width: 'auto' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* VIEW 5: MANAJEMEN AKUN & ROLE (SUPER ADMIN ONLY)                 */}
          {/* ================================================================ */}
          {activeView === 'pengguna' && perms.canManageUsers && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Manajemen Akun ASN &amp; Role RBAC
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Kelola akun pegawai BPBD Sidoarjo, tetapkan peran akses, atau nonaktifkan akun.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openAddUserModal}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#0F2A4A] text-white hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Tambah Akun ASN</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4 whitespace-nowrap">NIP (18 Digit)</th>
                        <th className="py-3 px-4">Nama &amp; Jabatan</th>
                        <th className="py-3 px-4 whitespace-nowrap">Username / Email</th>
                        <th className="py-3 px-4 whitespace-nowrap">Role RBAC</th>
                        <th className="py-3 px-4 whitespace-nowrap">Status</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                            {u.nip}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{u.namaLengkap}</div>
                            <div className="text-xs text-slate-500">
                              {u.jabatan} · {u.bidang}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            <div className="font-mono text-slate-800">{u.username}</div>
                            <div>{u.email}</div>
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                            {ROLE_META[u.roleKode].shortLabel}
                          </td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap">
                            <span
                              className={
                                u.isActive
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-red-600 font-semibold'
                              }
                            >
                              {u.isActive ? 'Aktif' : 'Non-Aktif'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {confirmDeleteUserId === u.id ? (
                              <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded">
                                <span className="text-xs text-red-800">Hapus akun?</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  className="text-xs font-semibold text-red-700 hover:underline"
                                >
                                  Ya
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUserId(null)}
                                  className="text-xs text-slate-600 hover:text-slate-900"
                                >
                                  Batal
                                </button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => openEditUserModal(u)}
                                  className="text-xs font-medium text-blue-700 hover:underline"
                                >
                                  Edit
                                </button>
                                {u.id !== currentUser.id && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleUserActive(u)}
                                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                                    >
                                      {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteUserId(u.id)}
                                      className="text-xs font-medium text-red-600 hover:underline"
                                    >
                                      Hapus
                                    </button>
                                  </>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* VIEW 6: AUDIT LOG (SUPER ADMIN & PEJABAT DISPOSISI)              */}
          {/* ================================================================ */}
          {activeView === 'audit' && perms.canViewAuditLog && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Riwayat Audit Log Aktivitas Sistem
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Catatan append-only aktivitas otentikasi, disposisi, dan perubahan agenda.
                  </p>
                </div>
                {perms.canExportAuditLog && (
                  <button
                    type="button"
                    onClick={handleExportAuditCSV}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Ekspor Audit CSV</span>
                  </button>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4 whitespace-nowrap">Waktu</th>
                        <th className="py-3 px-4 whitespace-nowrap">Pengguna / NIP</th>
                        <th className="py-3 px-4 whitespace-nowrap">Aktivitas</th>
                        <th className="py-3 px-4 whitespace-nowrap">Status</th>
                        <th className="py-3 px-4">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-medium text-slate-900">{log.nama}</div>
                            <div className="font-mono text-slate-500">{log.nip}</div>
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                            {log.eventType}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`font-semibold ${
                                log.status === 'SUKSES'
                                  ? 'text-emerald-700'
                                  : log.status === 'GAGAL'
                                  ? 'text-red-600'
                                  : 'text-amber-700'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700">{log.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==================================================================== */}
      {/* ADD / EDIT AGENDA MODAL                                              */}
      {/* ==================================================================== */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agenda-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full shadow-xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="agenda-modal-title" className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit Agenda Kegiatan' : 'Tambah Agenda Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="Tutup modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveAgenda}
              className="p-6 space-y-4 max-h-[82vh] overflow-y-auto"
            >
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs font-medium text-red-700">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {formConflicts.length > 0 && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg space-y-2">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-red-800">
                      <p className="font-semibold">
                        Bentrok Terdeteksi ({formConflicts.length} jadwal lain di waktu ini)
                      </p>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside">
                        {formConflicts.map((c) => (
                          <li key={c.agenda.id}>
                            <strong>{c.agenda.judul}</strong> ({c.agenda.jamMulai}–
                            {c.agenda.jamSelesai}, selisih {c.overlapMinutes} mnt)
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyNextSlotInForm}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-700 hover:bg-red-100 rounded-md"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pindahkan ke Slot Kosong Terdekat</span>
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Judul Acara / Kegiatan *
                </label>
                <input
                  type="text"
                  required
                  value={formState.judul}
                  onChange={(e) => setFormState({ ...formState, judul: e.target.value })}
                  placeholder="Contoh: Rapat Koordinasi Kesiapsiagaan"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal *
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.tanggal}
                    onChange={(e) => setFormState({ ...formState, tanggal: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam Mulai *
                  </label>
                  <input
                    type="time"
                    required
                    value={formState.jamMulai}
                    onChange={(e) => setFormState({ ...formState, jamMulai: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam Selesai *
                  </label>
                  <input
                    type="time"
                    required
                    value={formState.jamSelesai}
                    onChange={(e) => setFormState({ ...formState, jamSelesai: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Lokasi / Ruangan / Link Rapat
                  </label>
                  <input
                    type="text"
                    value={formState.lokasi}
                    onChange={(e) => setFormState({ ...formState, lokasi: e.target.value })}
                    placeholder="Ruang Rapat Pusdalops / Zoom"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Penyelenggara / Bidang
                  </label>
                  <input
                    type="text"
                    value={formState.penyelenggara}
                    onChange={(e) => setFormState({ ...formState, penyelenggara: e.target.value })}
                    placeholder="Sekretariat BPBD / Bidang PK"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pejabat Pendamping / Arahan Disposisi
                  </label>
                  <input
                    type="text"
                    value={formState.pejabatPendamping}
                    onChange={(e) =>
                      setFormState({ ...formState, pejabatPendamping: e.target.value })
                    }
                    placeholder="Sekretaris BPBD / Kabid KL"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status Disposisi
                  </label>
                  <select
                    value={formState.statusDisposisi}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        statusDisposisi: e.target.value as DisposisiStatus,
                      })
                    }
                    disabled={!perms.canEditDisposition}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50"
                  >
                    {DISPOSISI_STATUSES.map((ds) => (
                      <option key={ds} value={ds}>
                        {ds}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pakaian / Dresscode
                  </label>
                  <input
                    type="text"
                    value={formState.pakaian}
                    onChange={(e) => setFormState({ ...formState, pakaian: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nomor Surat (Opsional)
                  </label>
                  <div className="relative">
                    <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={formState.nomorSurat}
                      onChange={(e) => setFormState({ ...formState, nomorSurat: e.target.value })}
                      placeholder="360/..."
                      className="w-full pl-8 pr-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
                  <select
                    value={formState.kategori}
                    onChange={(e) =>
                      setFormState({ ...formState, kategori: e.target.value as AgendaCategory })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Catatan / Keterangan
                  </label>
                  <input
                    type="text"
                    value={formState.catatan}
                    onChange={(e) => setFormState({ ...formState, catatan: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({ ...formState, status: e.target.value as AgendaStatus })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Terjadwal">Terjadwal</option>
                    <option value="Draft">Draft</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Dibatalkan">Dibatalkan</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formState.isConfidential}
                  onChange={(e) =>
                    setFormState({ ...formState, isConfidential: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#0F2A4A]"
                />
                <span>Tandai sebagai Agenda Sifat Terbatas / Rahasia (khusus Pimpinan &amp; Disposisi)</span>
              </label>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#E65100] hover:bg-[#CC4700] rounded-lg transition-colors whitespace-nowrap"
                >
                  {editingId ? 'Simpan Perubahan' : 'Simpan Agenda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* DISPOSISI MODAL (PEJABAT DISPOSISI / SUPER ADMIN)                    */}
      {/* ==================================================================== */}
      {disposisiModalItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Tetapkan Disposisi &amp; Pendamping
              </h3>
              <button
                type="button"
                onClick={() => setDisposisiModalItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveDisposisi} className="p-5 space-y-4">
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 p-3 rounded-lg">
                <p className="font-semibold text-slate-900">{disposisiModalItem.judul}</p>
                <p className="mt-1 font-mono">
                  {formatTanggalPendek(disposisiModalItem.tanggal)} · {disposisiModalItem.jamMulai}–
                  {disposisiModalItem.jamSelesai}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Status Disposisi
                </label>
                <select
                  value={disposisiDraftStatus}
                  onChange={(e) => setDisposisiDraftStatus(e.target.value as DisposisiStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {DISPOSISI_STATUSES.map((ds) => (
                    <option key={ds} value={ds}>
                      {ds}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pejabat Pendamping / Perwakilan
                </label>
                <input
                  type="text"
                  value={disposisiDraftPejabat}
                  onChange={(e) => setDisposisiDraftPejabat(e.target.value)}
                  placeholder="Contoh: Sekretaris BPBD / Kabid KL"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDisposisiModalItem(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#0F2A4A] text-white rounded-lg hover:bg-slate-800"
                >
                  Simpan Disposisi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* USER MANAGEMENT MODAL (SUPER ADMIN)                                  */}
      {/* ==================================================================== */}
      {userModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingUserId ? 'Edit Akun ASN' : 'Tambah Akun ASN Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="p-6 space-y-3.5">
              {userFormError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {userFormError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    NIP (18 Digit) *
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.nip}
                    onChange={(e) => setUserForm({ ...userForm, nip: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Username Kedinasan *
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lengkap &amp; Gelar *
                </label>
                <input
                  type="text"
                  required
                  value={userForm.namaLengkap}
                  onChange={(e) => setUserForm({ ...userForm, namaLengkap: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jabatan</label>
                  <input
                    type="text"
                    value={userForm.jabatan}
                    onChange={(e) => setUserForm({ ...userForm, jabatan: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Bidang</label>
                  <input
                    type="text"
                    value={userForm.bidang}
                    onChange={(e) => setUserForm({ ...userForm, bidang: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Dinas
                  </label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kata Sandi (min. 8 karakter) *
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Role RBAC</label>
                <select
                  value={userForm.roleKode}
                  onChange={(e) =>
                    setUserForm({ ...userForm, roleKode: e.target.value as RoleCode })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {(Object.keys(ROLE_META) as RoleCode[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_META[r].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#0F2A4A] text-white rounded-lg hover:bg-slate-800"
                >
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
