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
} from 'lucide-react';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type AgendaCategory =
  | 'Rapat Internal'
  | 'Rapat Eksternal'
  | 'Kunjungan / Dinas'
  | 'Undangan Resmi'
  | 'Lainnya';

type AgendaStatus = 'Terjadwal' | 'Selesai' | 'Dibatalkan';

type ActiveView = 'harian' | 'bulanan' | 'ebuddy' | 'kartu';

type CardTheme = 'putih' | 'biru' | 'gelap';

type CardMode = 'harian' | 'tunggal' | 'bulanan';

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
  catatan: string;
  sumber: 'Manual' | 'e-Buddy';
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

const STORAGE_KEY = 'agenda_ebuddy_items_v1';
const ORG_TITLE_KEY = 'agenda_ebuddy_org_title_v1';

const CATEGORIES: AgendaCategory[] = [
  'Rapat Internal',
  'Rapat Eksternal',
  'Kunjungan / Dinas',
  'Undangan Resmi',
  'Lainnya',
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
  candidate: { id?: string; tanggal: string; jamMulai: string; jamSelesai: string; status?: AgendaStatus }
): ConflictInfo[] {
  if (candidate.status === 'Dibatalkan') return [];
  const startA = timeToMinutes(candidate.jamMulai);
  const endA = timeToMinutes(candidate.jamSelesai);
  if (endA <= startA) return [];

  const conflicts: ConflictInfo[] = [];
  for (const item of agendas) {
    if (candidate.id && item.id === candidate.id) continue;
    if (item.status === 'Dibatalkan') continue;
    if (item.tanggal !== candidate.tanggal) continue;

    const startB = timeToMinutes(item.jamMulai);
    const endB = timeToMinutes(item.jamSelesai);
    if (startA < endB && endA > startB) {
      const overlapMinutes = Math.min(endA, endB) - Math.max(startA, startB);
      conflicts.push({ agenda: item, overlapMinutes });
    }
  }
  return conflicts.sort((a, b) => timeToMinutes(a.agenda.jamMulai) - timeToMinutes(b.agenda.jamMulai));
}

function findNextAvailableSlot(
  agendas: AgendaItem[],
  tanggal: string,
  durationMinutes: number,
  excludeId?: string
): { jamMulai: string; jamSelesai: string } | null {
  const safeDuration = Math.max(30, durationMinutes || 60);
  const dayStart = 7 * 60 + 30; // 07:30
  const dayEnd = 19 * 60; // 19:00

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
// E-BUDDY OFFICIAL LETTER EXTRACTOR (CLIENT-SIDE INDONESIAN NLP/REGEX)
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

  // 1. Nomor Surat
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

  // 2. Judul / Acara / Perihal
  let judul = '';
  const acaraMatch = text.match(
    /(?:Acara|Kegiatan|Agenda|Sub\s*Acara)\s*[:\-]\s*([^\n]+)/i
  );
  const halMatch = text.match(
    /(?:Perihal|Hal)\s*[:\-]\s*([^\n]+)/i
  );
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
      (l) => l.length > 8 && !/^(Yth|Kepada|Nomor|Lampiran|Sifat|Hari|Tanggal|Pukul|Tempat|Pakaian)/i.test(l)
    );
    if (candidateLine) judul = candidateLine.slice(0, 100);
  }

  // 3. Tanggal
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

  // 4. Jam Mulai & Jam Selesai
  let jamMulai = '09:00';
  let jamSelesai = '11:00';
  let catatanSelesai = '';

  const rangeTimeRegex = /(\d{1,2})[.:](\d{2})\s*(?:WIB|WITA|WIT)?\s*(?:-|–|s\.?d\.?|s\/d|sampai(?:\s+dengan)?)\s*(\d{1,2})[.:](\d{2})/i;
  const untilDoneRegex = /(?:Pukul|Jam|Waktu)\s*[:\-]?\s*(\d{1,2})[.:](\d{2})\s*(?:WIB|WITA|WIT)?\s*(?:-|–|s\.?d\.?|s\/d)?\s*(?:selesai|Selesai)/i;
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
    detectedFields.push('Waktu Mulai (s.d. selesai)');
  } else if (singleMatch) {
    const h1 = String(Math.min(23, Number(singleMatch[1]))).padStart(2, '0');
    const m1 = String(Math.min(59, Number(singleMatch[2]))).padStart(2, '0');
    jamMulai = `${h1}:${m1}`;
    jamSelesai = minutesToTime(timeToMinutes(jamMulai) + 90);
    detectedFields.push('Waktu Mulai');
  }

  // 5. Lokasi / Tempat
  let lokasi = '';
  const lokasiMatch = text.match(
    /(?:Tempat|Lokasi|Bertempat\s+di|Ruangan)\s*[:\-]?\s*([^\n]+)/i
  );
  if (lokasiMatch) {
    lokasi = lokasiMatch[1].replace(/^di\s+/i, '').trim();
    detectedFields.push('Lokasi');
  } else if (/zoom|google meet|teams|daring|virtual/i.test(text)) {
    const linkMatch = text.match(/https?:\/\/[^\s]+/i);
    lokasi = linkMatch ? `Daring (${linkMatch[0]})` : 'Daring / Video Conference';
    detectedFields.push('Lokasi Daring');
  }

  // 6. Pakaian / Dresscode
  let pakaian = '';
  const pakaianMatch = text.match(
    /(?:Pakaian|Dresscode|Seragam)\s*[:\-]\s*([^\n]+)/i
  );
  if (pakaianMatch) {
    pakaian = pakaianMatch[1].trim();
    detectedFields.push('Pakaian');
  }

  // 7. Penyelenggara / Disposisi
  let penyelenggara = '';
  const disposisiMatch = text.match(
    /(?:Disposisi(?:\s+Kepada)?|Penyelenggara|Pengirim|Dari|Yth\.)\s*[:\-]?\s*([^\n]+)/i
  );
  if (disposisiMatch) {
    penyelenggara = disposisiMatch[1].trim();
    detectedFields.push('Penyelenggara / Disposisi');
  }

  // 8. Kategori Otomatis
  let kategori: AgendaCategory = 'Rapat Internal';
  if (/kunjungan|tinjauan|lapangan|peresmian|monitoring|sidak/i.test(text)) {
    kategori = 'Kunjungan / Dinas';
  } else if (/undangan|lampiran|nomor\s*[:\-]/i.test(text) && /yth\.|hormat kami|mengharap kehadiran/i.test(text)) {
    kategori = 'Undangan Resmi';
  } else if (/kementerian|gubernur|bupati|walikota|provinsi|mitra|zoom|eksternal|forum/i.test(text)) {
    kategori = 'Rapat Eksternal';
  }

  // 9. Catatan tambahan (Meeting ID / Link / Catatan Disposisi)
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
    penyelenggara: penyelenggara || 'Sekretariat / Pimpinan',
    pakaian: pakaian || 'Menyesuaikan',
    nomorSurat,
    kategori,
    catatan: extraNotes.join(' · '),
    detectedFields,
  };
}

// ============================================================================
// INITIAL SEED DATA & E-BUDDY SAMPLES
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
      judul: 'Rapat Koordinasi Evaluasi Anggaran Triwulan IV',
      tanggal: today,
      jamMulai: '08:30',
      jamSelesai: '10:30',
      lokasi: 'Ruang Rapat Utama Lt. 2',
      penyelenggara: 'Sekretariat Daerah',
      pakaian: 'PDH Khaki',
      nomorSurat: '005/1420/SETDA',
      kategori: 'Rapat Internal',
      status: 'Terjadwal',
      catatan: 'Membawa laporan realisasi per bidang.',
      sumber: 'e-Buddy',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-2',
      judul: 'Sinkronisasi Data Layanan Publik Terpadu (Bentrok Simulasi)',
      tanggal: today,
      jamMulai: '09:45',
      jamSelesai: '11:30',
      lokasi: 'Zoom Meeting (Link Dinas Kominfo)',
      penyelenggara: 'Dinas Kominfo · Disposisi Kabid',
      pakaian: 'PDH Khaki',
      nomorSurat: '005/891/DISKOMINFO',
      kategori: 'Rapat Eksternal',
      status: 'Terjadwal',
      catatan: 'Meeting ID: 842 9910 2211 · Passcode: KOMINFO26',
      sumber: 'e-Buddy',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-3',
      judul: 'Penandatanganan Pakta Integritas & Pengarahan Staf',
      tanggal: today,
      jamMulai: '13:30',
      jamSelesai: '15:00',
      lokasi: 'Aula Gedung B',
      penyelenggara: 'Bagian Organisasi & SDM',
      pakaian: 'Batik Lengan Panjang',
      nomorSurat: '800/312/ORG',
      kategori: 'Undangan Resmi',
      status: 'Terjadwal',
      catatan: 'Hadir 15 menit sebelum acara dimulai.',
      sumber: 'Manual',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-4',
      judul: 'Tinjauan Lapangan Renovasi Gedung Pelayanan Terpadu',
      tanggal: tomorrow,
      jamMulai: '09:00',
      jamSelesai: '11:30',
      lokasi: 'Kawasan Mall Pelayanan Publik',
      penyelenggara: 'Tim Teknis Dinas PU',
      pakaian: 'PDH / Lapangan',
      nomorSurat: '600/119/PUPR',
      kategori: 'Kunjungan / Dinas',
      status: 'Terjadwal',
      catatan: 'Koordinasi titik akses disabilitas.',
      sumber: 'e-Buddy',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-5',
      judul: 'Forum Konsultasi Publik Rencana Kerja Tahun 2027',
      tanggal: plus2,
      jamMulai: '10:00',
      jamSelesai: '12:30',
      lokasi: 'Ballroom Hotel Nusantara',
      penyelenggara: 'Bappeda Provinsi',
      pakaian: 'Batik Resmi / PSL',
      nomorSurat: '050/774/BAPPEDA',
      kategori: 'Undangan Resmi',
      status: 'Terjadwal',
      catatan: 'Menyiapkan bahan paparan 10 slide.',
      sumber: 'e-Buddy',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-6',
      judul: 'Briefing Mingguan Progres Digitalisasi Arsip e-Buddy',
      tanggal: plus4,
      jamMulai: '14:00',
      jamSelesai: '15:30',
      lokasi: 'Ruang Rapat Kecil Lt. 1',
      penyelenggara: 'Subbag Tata Usaha',
      pakaian: 'Bebas Rapi',
      nomorSurat: '',
      kategori: 'Rapat Internal',
      status: 'Terjadwal',
      catatan: 'Evaluasi SLA surat masuk.',
      sumber: 'Manual',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ag-7',
      judul: 'Rapat Finalisasi Materi Paparan Pimpinan',
      tanggal: minus1,
      jamMulai: '10:00',
      jamSelesai: '12:00',
      lokasi: 'Ruang Kerja Pimpinan',
      penyelenggara: 'Tim Sekretariat',
      pakaian: 'PDH',
      nomorSurat: '005/1401/SETDA',
      kategori: 'Rapat Internal',
      status: 'Selesai',
      catatan: 'Notulensi telah dikirim ke grup.',
      sumber: 'Manual',
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
      label: 'Surat Undangan e-Buddy',
      text: `PEMERINTAH DAERAH — TATA NASKAH DINAS ELEKTRONIK (e-Buddy)
Nomor : 005/2048/BAPPEDA/2026
Sifat : Penting
Hal : Undangan Rapat Percepatan Transformasi Digital Layanan Publik

Disposisi : Yth. Kepala Bagian Perencanaan & Tim IT
Mengharap kehadiran Bapak/Ibu pada:
Hari/Tanggal : ${tomorrowFmt}
Pukul : 13.00 - 15.30 WIB
Tempat : Ruang Rapat Anggrek Lt. 3 Gedung Pusat
Acara : Rapat Percepatan Integrasi Sistem e-Buddy & Portal Satu Data
Pakaian : Batik Lengan Panjang
Catatan : Harap membawa dokumen rekap layanan aktif.`,
    },
    {
      label: 'Disposisi Rapat Bentrok (Uji Deteksi)',
      text: `[TERUSAN e-BUDDY]
Nomor Surat: UND-412/SETDA/XI/2026
Dari: Asisten Pemerintahan dan Kesra
Perihal: Rapat Desk Penyusunan Laporan Kinerja Instansi
Hari, Tanggal: ${todayFmt}
Waktu: 09.00 s.d. 11.00 WIB
Lokasi: Ruang Rapat Wijaya Kusuma Lt. 2
Seragam: PDH Khaki
Instruksi: Mohon hadir tepat waktu atau disposisikan pejabat teknis.`,
    },
    {
      label: 'Undangan Zoom Hybrid (s.d. selesai)',
      text: `UNDANGAN RAPAT KOORDINASI NASIONAL
Nomor : 005/99/KEMENDAGRI/2026
Yth. Para Sekretaris Dinas / Kepala Subbagian
Untuk menghadiri acara Pembinaan Tata Kelola Arsip Digital Tahun 2026
Tanggal : ${plus3Fmt}
Jam : 10.00 WIB - selesai
Tempat : Zoom Meeting (https://zoom.us/j/918273645)
Meeting ID : 918 273 645
Passcode : ARSIP26
Dresscode : Bebas Rapi / Batik`,
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
      headerBg: '#0F172A',
      headerText: '#FFFFFF',
      headerSub: '#CBD5E1',
      cardBg: '#FFFFFF',
      cardBorder: '#E2E8F0',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      textMuted: '#64748B',
      accent: '#1D4ED8',
      accentSoft: '#EFF6FF',
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
      accent: '#60A5FA',
      accentSoft: '#1E40AF',
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
      accentSoft: '#064E3B',
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

  // Calculate dynamic height first
  let itemsToRender: AgendaItem[] = [];
  if (mode === 'harian') {
    itemsToRender = dayAgendas.filter((a) => a.status !== 'Dibatalkan');
  } else if (mode === 'tunggal' && singleAgenda) {
    itemsToRender = [singleAgenda];
  } else if (mode === 'bulanan') {
    itemsToRender = monthAgendas.filter((a) => a.status !== 'Dibatalkan').slice(0, 14);
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
    const boxHeight = 460 + titleLines.length * 48 + (singleAgenda.catatan ? 90 : 0) + (conflicts.length > 0 ? 74 : 0);
    cardLayouts.push({ item: singleAgenda, titleLines, metaLines: [], conflicts, boxHeight });
    measuredBodyHeight = boxHeight + 40;
  } else {
    for (const item of itemsToRender) {
      tempCtx.font = `700 28px ${fontSans}`;
      const titleLines = wrapCanvasText(tempCtx, item.judul, contentWidth - 260);

      const metaParts = [
        item.lokasi,
        item.penyelenggara,
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

  // Set high-res canvas dimensions
  canvas.width = width;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, width, totalHeight);

  // Header band
  ctx.fillStyle = p.headerBg;
  ctx.fillRect(0, 0, width, headerHeight);

  // Top label (Organization)
  ctx.fillStyle = p.headerSub;
  ctx.font = `600 20px ${fontSans}`;
  ctx.fillText((orgTitle || 'AGENDA KEGIATAN HARIAN').toUpperCase(), padX, 68);

  // Main Header Title
  ctx.fillStyle = p.headerText;
  ctx.font = `700 42px ${fontSans}`;
  const mainTitle =
    mode === 'harian'
      ? formatTanggalLengkap(selectedDate)
      : mode === 'tunggal'
      ? 'Kartu Agenda Kegiatan'
      : `Rekap ${BULAN_ID[selectedMonth]} ${selectedYear}`;
  ctx.fillText(mainTitle, padX, 130);

  // Subtitle summary line
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
    subLine = `${formatTanggalLengkap(singleAgenda.tanggal)}  ·  ${singleAgenda.kategori}`;
  } else {
    const activeMonthCount = monthAgendas.filter((a) => a.status !== 'Dibatalkan').length;
    subLine = `${activeMonthCount} Total Agenda Bulan Ini${
      activeMonthCount > 14 ? ' (Menampilkan 14 Agenda Pertama)' : ''
    }`;
  }
  ctx.fillText(subLine, padX, 178);

  // Body rendering
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
      ...(showPakaian ? [['Pakaian', item.pakaian || '-'] as [string, string]] : []),
      ...(showNomorSurat && item.nomorSurat ? [['Nomor Surat', item.nomorSurat] as [string, string]] : []),
      ['Status', item.status],
    ];

    for (const [label, val] of rows) {
      ctx.fillStyle = p.textMuted;
      ctx.font = `500 22px ${fontSans}`;
      ctx.fillText(label, padX + 40, innerY);

      ctx.fillStyle = p.textPrimary;
      ctx.font = `600 22px ${fontSans}`;
      ctx.fillText(val.slice(0, 48), padX + 270, innerY);
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

      // Time column on left
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

      // Vertical hairline divider between time and details
      ctx.strokeStyle = p.divider;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padX + 198, cursorY + 24);
      ctx.lineTo(padX + 198, cursorY + boxHeight - 24);
      ctx.stroke();

      // Title
      let textY = cursorY + 50;
      ctx.fillStyle = p.textPrimary;
      ctx.font = `700 28px ${fontSans}`;
      for (const line of titleLines) {
        ctx.fillText(line, bodyX, textY);
        textY += 36;
      }

      // Metadata lines
      textY += 6;
      ctx.fillStyle = p.textSecondary;
      ctx.font = `400 21px ${fontSans}`;
      for (const mLine of metaLines) {
        ctx.fillText(mLine, bodyX, textY);
        textY += 29;
      }

      // Conflict warning bar inside card if overlapping
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

  // Footer
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
  ctx.fillText(`Dicetak dari Agenda e-Buddy  ·  ${formatTanggalLengkap(getLocalISODate())}`, padX, footerY);

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

  const [agendas, setAgendas] = useState<AgendaItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback to seed
    }
    return createInitialAgendas();
  });

  const [orgTitle, setOrgTitle] = useState<string>(() => {
    try {
      return localStorage.getItem(ORG_TITLE_KEY) || 'AGENDA KEGIATAN SEKRETARIAT';
    } catch {
      return 'AGENDA KEGIATAN SEKRETARIAT';
    }
  });

  const [activeView, setActiveView] = useState<ActiveView>('harian');
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'Semua' | AgendaCategory>('Semua');
  const [monthlyOnlyConflict, setMonthlyOnlyConflict] = useState(false);

  // Mobile sidebar state
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Add/Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Omit<AgendaItem, 'id' | 'createdAt'>>({
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
    catatan: '',
    sumber: 'Manual',
  });
  const [formError, setFormError] = useState('');

  // Inline delete confirmation ID
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // e-Buddy Extractor state
  const [ebuddyRawText, setEbuddyRawText] = useState('');
  const [ebuddyPreview, setEbuddyPreview] = useState<ExtractedEBuddyResult | null>(null);

  // WhatsApp PNG Card Studio state
  const [cardMode, setCardMode] = useState<CardMode>('harian');
  const [cardTheme, setCardTheme] = useState<CardTheme>('putih');
  const [cardSingleId, setCardSingleId] = useState<string>('');
  const [showPakaianOnCard, setShowPakaianOnCard] = useState(true);
  const [showSuratOnCard, setShowSuratOnCard] = useState(true);
  const [showConflictOnCard, setShowConflictOnCard] = useState(true);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(agendas));
    } catch {
      // ignore storage quota errors
    }
  }, [agendas]);

  useEffect(() => {
    try {
      localStorage.setItem(ORG_TITLE_KEY, orgTitle);
    } catch {
      // ignore
    }
  }, [orgTitle]);

  const showNotice = useCallback((msg: string) => {
    setCopiedToast(msg);
    setTimeout(() => setCopiedToast(null), 2600);
  }, []);

  // Derived collections
  const dayAgendas = useMemo(() => {
    return agendas
      .filter((a) => a.tanggal === selectedDate)
      .filter((a) => (categoryFilter === 'Semua' ? true : a.kategori === categoryFilter))
      .filter((a) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          a.judul.toLowerCase().includes(q) ||
          a.lokasi.toLowerCase().includes(q) ||
          a.penyelenggara.toLowerCase().includes(q) ||
          a.nomorSurat.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
  }, [agendas, selectedDate, categoryFilter, searchQuery]);

  const allDayAgendasUnfiltered = useMemo(() => {
    return agendas
      .filter((a) => a.tanggal === selectedDate)
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
  }, [agendas, selectedDate]);

  const dayStats = useMemo(() => {
    const active = allDayAgendasUnfiltered.filter((a) => a.status !== 'Dibatalkan');
    let totalMinutes = 0;
    let conflictCount = 0;
    for (const item of active) {
      totalMinutes += Math.max(0, timeToMinutes(item.jamSelesai) - timeToMinutes(item.jamMulai));
      if (getConflictsForCandidate(agendas, item).length > 0) {
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
  }, [allDayAgendasUnfiltered, agendas]);

  const monthPrefix = useMemo(() => {
    return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  const monthAgendas = useMemo(() => {
    return agendas
      .filter((a) => a.tanggal.startsWith(monthPrefix))
      .sort((a, b) => {
        if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
        return timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai);
      });
  }, [agendas, monthPrefix]);

  const filteredMonthAgendas = useMemo(() => {
    return monthAgendas
      .filter((a) => (categoryFilter === 'Semua' ? true : a.kategori === categoryFilter))
      .filter((a) =>
        monthlyOnlyConflict ? getConflictsForCandidate(agendas, a).length > 0 : true
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
  }, [monthAgendas, categoryFilter, monthlyOnlyConflict, searchQuery, agendas]);

  const monthStats = useMemo(() => {
    const active = monthAgendas.filter((a) => a.status !== 'Dibatalkan');
    const conflictItems = active.filter((a) => getConflictsForCandidate(agendas, a).length > 0);
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
  }, [monthAgendas, agendas]);

  // Global conflict count for sidebar badge (unboxed text)
  const totalGlobalConflicts = useMemo(() => {
    return agendas.filter(
      (a) => a.status !== 'Dibatalkan' && getConflictsForCandidate(agendas, a).length > 0
    ).length;
  }, [agendas]);

  // Live conflicts in Add/Edit Form
  const formConflicts = useMemo(() => {
    return getConflictsForCandidate(agendas, {
      id: editingId || undefined,
      tanggal: formState.tanggal,
      jamMulai: formState.jamMulai,
      jamSelesai: formState.jamSelesai,
      status: formState.status,
    });
  }, [agendas, editingId, formState.tanggal, formState.jamMulai, formState.jamSelesai, formState.status]);

  // Live conflicts in e-Buddy preview
  const ebuddyConflicts = useMemo(() => {
    if (!ebuddyPreview) return [];
    return getConflictsForCandidate(agendas, {
      tanggal: ebuddyPreview.tanggal,
      jamMulai: ebuddyPreview.jamMulai,
      jamSelesai: ebuddyPreview.jamSelesai,
      status: 'Terjadwal',
    });
  }, [agendas, ebuddyPreview]);

  // Ensure cardSingleId defaults to something valid
  useEffect(() => {
    if (!cardSingleId && agendas.length > 0) {
      setCardSingleId(agendas[0].id);
    }
  }, [agendas, cardSingleId]);

  // Render WhatsApp PNG Canvas whenever studio inputs change
  useEffect(() => {
    if (activeView !== 'kartu' || !canvasRef.current) return;
    const singleAgenda = agendas.find((a) => a.id === cardSingleId) || agendas[0] || null;
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
      allAgendas: agendas,
      showPakaian: showPakaianOnCard,
      showNomorSurat: showSuratOnCard,
      showConflictAlert: showConflictOnCard,
    });
  }, [
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
    agendas,
    showPakaianOnCard,
    showSuratOnCard,
    showConflictOnCard,
  ]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function openAddModal(presetDate?: string) {
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
      catatan: '',
      sumber: 'Manual',
    });
    setModalOpen(true);
  }

  function openEditModal(item: AgendaItem) {
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
      showNotice('Agenda berhasil diperbarui.');
    } else {
      const newItem: AgendaItem = {
        ...formState,
        id: `ag-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      setAgendas((prev) => [...prev, newItem]);
      setSelectedDate(formState.tanggal);
      showNotice('Agenda baru ditambahkan.');
    }
    setModalOpen(false);
  }

  function handleDeleteAgenda(id: string) {
    setAgendas((prev) => prev.filter((a) => a.id !== id));
    setConfirmDeleteId(null);
    showNotice('Agenda dihapus.');
  }

  function handleToggleStatus(item: AgendaItem) {
    const nextStatus: AgendaStatus = item.status === 'Selesai' ? 'Terjadwal' : 'Selesai';
    setAgendas((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, status: nextStatus } : a))
    );
  }

  function handleApplyNextSlotInForm() {
    const dur = Math.max(30, timeToMinutes(formState.jamSelesai) - timeToMinutes(formState.jamMulai));
    const slot = findNextAvailableSlot(agendas, formState.tanggal, dur, editingId || undefined);
    if (slot) {
      setFormState((prev) => ({ ...prev, jamMulai: slot.jamMulai, jamSelesai: slot.jamSelesai }));
      showNotice(`Slot kosong diterapkan: ${slot.jamMulai} – ${slot.jamSelesai}`);
    } else {
      showNotice('Tidak ada slot kosong di antara 07:30 – 19:00.');
    }
  }

  function handleExtractEBuddy(rawInput?: string) {
    const source = typeof rawInput === 'string' ? rawInput : ebuddyRawText;
    if (!source.trim()) return;
    const extracted = extractEBuddyText(source, selectedDate);
    setEbuddyPreview(extracted);
  }

  function handleSaveEBuddyToAgenda() {
    if (!ebuddyPreview) return;
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
      catatan: ebuddyPreview.catatan.trim(),
      sumber: 'e-Buddy',
      createdAt: new Date().toISOString(),
    };
    setAgendas((prev) => [...prev, newItem]);
    setSelectedDate(newItem.tanggal);
    setActiveView('harian');
    setEbuddyRawText('');
    setEbuddyPreview(null);
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

  function handleDownloadPNG(customMode?: CardMode, customDate?: string, customSingleItem?: AgendaItem) {
    const tempCanvas = document.createElement('canvas');
    const modeToUse = customMode || cardMode;
    const dateToUse = customDate || selectedDate;
    const dayItems = agendas
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
      singleAgenda: customSingleItem || agendas.find((a) => a.id === cardSingleId) || agendas[0] || null,
      monthAgendas,
      allAgendas: agendas,
      showPakaian: showPakaianOnCard,
      showNomorSurat: showSuratOnCard,
      showConflictAlert: showConflictOnCard,
    });

    const filename =
      modeToUse === 'harian'
        ? `agenda-harian-${dateToUse}.png`
        : modeToUse === 'tunggal' && (customSingleItem || agendas.find((a) => a.id === cardSingleId))
        ? `kartu-agenda-${(customSingleItem || agendas.find((a) => a.id === cardSingleId))?.tanggal}.png`
        : `rekap-bulanan-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.png`;

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
      showNotice(`Gambar ${filename} berhasil diunduh.`);
    }, 'image/png');
  }

  function handleCopyWhatsAppText(modeOverride?: CardMode) {
    const m = modeOverride || cardMode;
    let lines: string[] = [];

    if (m === 'harian') {
      const items = allDayAgendasUnfiltered.filter((a) => a.status !== 'Dibatalkan');
      lines.push(`*${orgTitle}*`);
      lines.push(`Jadwal Hari: *${formatTanggalLengkap(selectedDate)}*`);
      lines.push('');
      if (items.length === 0) {
        lines.push('_Tidak ada agenda terjadwal._');
      } else {
        items.forEach((item, idx) => {
          const conflicts = getConflictsForCandidate(agendas, item);
          lines.push(`${idx + 1}. *${item.jamMulai} - ${item.jamSelesai} WIB* | ${item.judul}`);
          lines.push(`   Tempat: ${item.lokasi}`);
          if (item.pakaian) lines.push(`   Pakaian: ${item.pakaian}`);
          if (item.nomorSurat) lines.push(`   No. Surat: ${item.nomorSurat}`);
          if (conflicts.length > 0) {
            lines.push(`   [Peringatan Bentrok ${conflicts[0].overlapMinutes} mnt dengan "${conflicts[0].agenda.judul}"]`);
          }
          lines.push('');
        });
      }
    } else if (m === 'tunggal') {
      const item = agendas.find((a) => a.id === cardSingleId) || agendas[0];
      if (item) {
        lines.push(`*INFORMASI AGENDA KEGIATAN*`);
        lines.push(`Acara: *${item.judul}*`);
        lines.push(`Hari/Tgl: ${formatTanggalLengkap(item.tanggal)}`);
        lines.push(`Waktu: ${item.jamMulai} - ${item.jamSelesai} WIB`);
        lines.push(`Tempat: ${item.lokasi}`);
        lines.push(`Penyelenggara: ${item.penyelenggara}`);
        if (item.pakaian) lines.push(`Pakaian: ${item.pakaian}`);
        if (item.nomorSurat) lines.push(`No. Surat: ${item.nomorSurat}`);
        if (item.catatan) lines.push(`Catatan: ${item.catatan}`);
      }
    } else {
      const items = monthAgendas.filter((a) => a.status !== 'Dibatalkan');
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
      'Pakaian',
      'Nomor Surat',
      'Status',
      'Sumber',
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
        a.pakaian,
        a.nomorSurat,
        a.status,
        a.sumber,
      ]
        .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-agenda-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice('File CSV rekap bulanan berhasil diunduh.');
  }

  function handleResetSampleData() {
    const fresh = createInitialAgendas();
    setAgendas(fresh);
    setSelectedDate(getLocalISODate());
    setSelectedMonth(new Date().getMonth());
    setSelectedYear(new Date().getFullYear());
    setConfirmResetOpen(false);
    showNotice('Data contoh berhasil dimuat ulang.');
  }

  // Calendar Grid Builder (Monday first)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
    const totalDays = lastDay.getDate();
    // JS getDay: 0=Sun..6=Sat -> convert to 0=Mon..6=Sun
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
      const dateISO = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const items = agendas
        .filter((a) => a.tanggal === dateISO && a.status !== 'Dibatalkan')
        .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
      const hasConflict = items.some((it) => getConflictsForCandidate(agendas, it).length > 0);
      cells.push({ dateISO, dayNum: d, items, hasConflict });
    }
    return cells;
  }, [selectedYear, selectedMonth, agendas]);

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
  // NAVIGATION ITEMS
  // ============================================================================

  const navItems: Array<{
    id: ActiveView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    countText?: string;
  }> = [
    {
      id: 'harian',
      label: 'Jadwal Harian',
      icon: Calendar,
      countText: String(dayStats.total),
    },
    {
      id: 'bulanan',
      label: 'Rekap Bulanan',
      icon: CalendarDays,
      countText: String(monthStats.total),
    },
    {
      id: 'ebuddy',
      label: 'Ekstrak e-Buddy',
      icon: Sparkles,
    },
    {
      id: 'kartu',
      label: 'Kartu WhatsApp',
      icon: ImageIcon,
    },
  ];

  // ============================================================================
  // RENDER
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

      {/* Left Sidebar (Desktop fixed, Mobile drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Zone (Single clean line) */}
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200">
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              Agenda e-Buddy
            </span>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden p-2 -mr-2 text-slate-500 hover:text-slate-900"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Primary Navigation */}
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
                      ? 'bg-slate-900 text-white'
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
              <p className="text-xs font-medium text-slate-500">Ringkasan Jadwal</p>
              <div className="mt-2.5 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Total Tersimpan</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {agendas.length}
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
            </div>
          </div>
        </div>

        {/* Sidebar Footer Actions */}
        <div className="p-4 border-t border-slate-200 space-y-2">
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
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb/Title — 1 Primary Action */}
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
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">Ruang Kerja</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">
                {activeView === 'harian' && 'Jadwal & Rekap Harian'}
                {activeView === 'bulanan' && 'Kalender & Rekap Bulanan'}
                {activeView === 'ebuddy' && 'Ekstraksi Teks Surat e-Buddy'}
                {activeView === 'kartu' && 'Studio Kartu Agenda WhatsApp (.PNG)'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => openAddModal(selectedDate)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Tambah Agenda</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
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
                    className="px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
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

              {/* 4-Column Summary Metric Strip (Flat, hairline dividers, tabular numerals) */}
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
                    {dayStats.hours} <span className="text-sm font-sans font-normal text-slate-500">jam</span>
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

              {/* Automatic Conflict Warning Alert (When overlap exists on selected day) */}
              {dayStats.conflictCount > 0 && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-900">
                        Deteksi Bentrok Jadwal Otomatis ({dayStats.conflictCount} kegiatan bertabrakan)
                      </p>
                      <p className="text-sm text-red-700 mt-0.5">
                        Terdapat jam pelaksanaan yang saling tumpang tindih pada tanggal{' '}
                        {formatTanggalPendek(selectedDate)}. Klik tombol Edit pada agenda bertanda
                        bentrok untuk memindahkan ke slot waktu kosong.
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
                    placeholder="Cari judul, lokasi, nomor surat, atau disposisi..."
                    className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                        Tambahkan agenda manual atau tempel teks surat e-Buddy untuk pengisian otomatis.
                      </p>
                    </div>
                    <div className="pt-2 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => openAddModal(selectedDate)}
                        className="px-4 py-2 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 whitespace-nowrap"
                      >
                        Tambah Agenda
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveView('ebuddy')}
                        className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                      >
                        Ekstrak Surat e-Buddy
                      </button>
                    </div>
                  </div>
                ) : (
                  dayAgendas.map((item) => {
                    const conflicts = getConflictsForCandidate(agendas, item);
                    const hasConflict = conflicts.length > 0;
                    const isDone = item.status === 'Selesai';
                    const isCancelled = item.status === 'Dibatalkan';

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
                            {/* Time Block */}
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

                            {/* Details Block */}
                            <div className="min-w-0 flex-1 space-y-1.5">
                              {/* Unboxed metadata kicker line (Zero-pill discipline) */}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{item.kategori}</span>
                                <span aria-hidden="true">·</span>
                                <span>Sumber: {item.sumber}</span>
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
                                      : 'text-blue-700'
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </div>

                              {/* Title */}
                              <h3
                                className={`text-base font-semibold text-slate-900 ${
                                  isDone || isCancelled ? 'line-through text-slate-500' : ''
                                }`}
                              >
                                {item.judul}
                              </h3>

                              {/* Location, Organizer, Dresscode */}
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

                              {item.catatan && (
                                <p className="text-xs text-slate-500 pt-0.5">{item.catatan}</p>
                              )}

                              {/* Conflict Warning Detail */}
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

                          {/* Right: Row Actions */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end md:self-start">
                            {confirmDeleteId === item.id ? (
                              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                                <span className="text-xs font-medium text-red-800 whitespace-nowrap">
                                  Hapus?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAgenda(item.id)}
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
                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  title="Edit Agenda"
                                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                                  aria-label="Edit Agenda"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(item.id)}
                                  title="Hapus Agenda"
                                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  aria-label="Hapus Agenda"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
                    Siap dibagikan ke grup WhatsApp pimpinan atau staf dalam format gambar PNG atau teks rapi.
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
              {/* Month Header & Export Actions */}
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
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Rekap PNG</span>
                  </button>
                </div>
              </div>

              {/* Monthly Stats Strip */}
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
                    {monthStats.uniqueDays} <span className="text-sm font-sans font-normal text-slate-500">hari</span>
                  </p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Estimasi Jam Rapat</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {monthStats.hours} <span className="text-sm font-sans font-normal text-slate-500">jam</span>
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
                              isToday
                                ? 'bg-blue-700 text-white'
                                : 'text-slate-700'
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
                      Klik baris untuk membuka detail harian atau mengedit jadwal.
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
                        <th className="py-3 px-4">Kegiatan & Penyelenggara</th>
                        <th className="py-3 px-4">Lokasi</th>
                        <th className="py-3 px-4 whitespace-nowrap">Status & Bentrok</th>
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
                          const conflicts = getConflictsForCandidate(agendas, item);
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
                                  {item.penyelenggara}
                                  {item.nomorSurat ? ` · ${item.nomorSurat}` : ''}
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
                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  className="text-xs font-medium text-blue-700 hover:underline mr-3"
                                >
                                  Edit
                                </button>
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
          {/* VIEW 3: EKSTRAKSI TEKS SURAT E-BUDDY                             */}
          {/* ================================================================ */}
          {activeView === 'ebuddy' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Raw Input & Templates */}
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Tempel Teks Surat / Disposisi e-Buddy
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Salin isi surat undangan, nota dinas, atau pesan terusan e-Buddy untuk
                    mengekstrak tanggal, waktu, tempat, pakaian, dan nomor surat secara otomatis.
                  </p>
                </div>

                {/* Sample Template Buttons */}
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
                    placeholder={`Contoh format:\nNomor : 005/123/SETDA\nHal : Undangan Rapat Evaluasi\nHari/Tanggal : Kamis, 26 November 2026\nPukul : 09.00 - 11.30 WIB\nTempat : Ruang Rapat Utama\nPakaian : Batik`}
                    className="w-full p-3.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900"
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
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Ekstrak Jadwal Sekarang</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Live Extracted Fields & Conflict Verification */}
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
                    {/* Automatic Conflict Check inside e-Buddy */}
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
                              {ebuddyConflicts[0].agenda.jamMulai}–{ebuddyConflicts[0].agenda.jamSelesai}).
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyNextSlotEBuddy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-700 hover:bg-red-100 rounded-md"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Cari & Terapkan Slot Kosong Terdekat</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs font-medium text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Tidak ada bentrok jadwal pada tanggal & jam tersebut.</span>
                      </div>
                    )}

                    {/* Editable Extracted Fields */}
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
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                            className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={handleSaveEBuddyToAgenda}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap"
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
          {activeView === 'kartu' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Settings Panel */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Pengaturan Kartu WhatsApp
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Gambar beresolusi 1080px tajam dan siap langsung dikirim ke grup atau kontak WhatsApp.
                  </p>
                </div>

                {/* Mode Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">
                    Jenis Kartu
                  </label>
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

                {/* Conditional Date / Single Item Picker */}
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
                      {agendas.map((a) => (
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

                {/* Org Header Title */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Judul Instansi / Bagian (Header Kartu)
                  </label>
                  <input
                    type="text"
                    value={orgTitle}
                    onChange={(e) => setOrgTitle(e.target.value)}
                    placeholder="AGENDA KEGIATAN SEKRETARIAT"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                {/* Theme Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">
                    Tema Warna Kartu
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'putih', label: 'Putih Bersih' },
                        { id: 'biru', label: 'Biru Instansi' },
                        { id: 'gelap', label: 'Gelap Elegan' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setCardTheme(t.id)}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                          cardTheme === t.id
                            ? 'border-blue-700 bg-blue-50 text-blue-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-2.5 pt-1 border-t border-slate-200">
                  <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                    <span>Tampilkan info pakaian / dresscode</span>
                    <input
                      type="checkbox"
                      checked={showPakaianOnCard}
                      onChange={(e) => setShowPakaianOnCard(e.target.checked)}
                      className="w-4 h-4 accent-blue-700"
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                    <span>Tampilkan nomor surat e-Buddy</span>
                    <input
                      type="checkbox"
                      checked={showSuratOnCard}
                      onChange={(e) => setShowSuratOnCard(e.target.checked)}
                      className="w-4 h-4 accent-blue-700"
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                    <span>Tampilkan penanda jadwal bentrok</span>
                    <input
                      type="checkbox"
                      checked={showConflictOnCard}
                      onChange={(e) => setShowConflictOnCard(e.target.checked)}
                      className="w-4 h-4 accent-blue-700"
                    />
                  </label>
                </div>

                {/* Download & Copy Buttons */}
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

              {/* Right Live Canvas Preview */}
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

            <form onSubmit={handleSaveAgenda} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs font-medium text-red-700">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Live Conflict Detection inside Modal */}
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
                  placeholder="Contoh: Rapat Koordinasi Penyusunan RKPD"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                    placeholder="Ruang Rapat Lt. 2 / Zoom"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Penyelenggara / Disposisi
                  </label>
                  <input
                    type="text"
                    value={formState.penyelenggara}
                    onChange={(e) => setFormState({ ...formState, penyelenggara: e.target.value })}
                    placeholder="Sekretariat / Bidang Terkait"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
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
                    placeholder="PDH / Batik / PSL"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                      placeholder="005/..."
                      className="w-full pl-8 pr-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kategori
                  </label>
                  <select
                    value={formState.kategori}
                    onChange={(e) =>
                      setFormState({ ...formState, kategori: e.target.value as AgendaCategory })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Catatan / Keterangan
                  </label>
                  <input
                    type="text"
                    value={formState.catatan}
                    onChange={(e) => setFormState({ ...formState, catatan: e.target.value })}
                    placeholder="Dokumen yang perlu dibawa, passcode Zoom, dll."
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({ ...formState, status: e.target.value as AgendaStatus })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="Terjadwal">Terjadwal</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Dibatalkan">Dibatalkan</option>
                  </select>
                </div>
              </div>

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
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  {editingId ? 'Simpan Perubahan' : 'Simpan Agenda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
