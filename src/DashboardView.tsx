import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  FileSpreadsheet,
  FileText,
  Filter,
  Image as ImageIcon,
  Lock,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  Video,
} from 'lucide-react';
import {
  ActiveView,
  AgendaCategory,
  AgendaItem,
  AgendaStatus,
  BULAN_ID,
  CATEGORIES,
  HARI_ID,
  HARI_SINGKAT_SENIN,
  MasterUnitItem,
  RoleCode,
  addDaysISO,
  findNextAvailableSlot,
  formatDurasi,
  formatRentangWaktu,
  formatTanggalLengkap,
  formatTanggalPendek,
  getConflictsForCandidate,
  getLocalISODate,
  getPermissions,
  timeToMinutes,
} from './types';

interface DashboardViewProps {
  activeView: Extract<ActiveView, 'dashboard' | 'kalender' | 'rekap_harian' | 'master_unit'>;
  role: RoleCode;
  agendas: AgendaItem[];
  visibleAgendas: AgendaItem[];
  masterUnits: MasterUnitItem[];
  selectedDate: string;
  onChangeDate: (iso: string) => void;
  selectedMonth: string;
  onChangeMonth: (ym: string) => void;
  onOpenNewAgenda: (preset?: Partial<AgendaItem>) => void;
  onOpenEditAgenda: (item: AgendaItem) => void;
  onRequestDeleteAgenda: (item: AgendaItem) => void;
  onOpenDisposition: (item: AgendaItem) => void;
  onToggleStatus: (item: AgendaItem) => void;
  onConfirmPresence: (item: AgendaItem) => void;
  onQuickShiftSlot: (item: AgendaItem, jamMulai: string, jamSelesai: string) => void;
  onOpenSinglePoster: (item: AgendaItem) => void;
  onOpenMasterModal: (unit?: MasterUnitItem) => void;
  onRequestDeleteMaster: (unit: MasterUnitItem) => void;
  onOpenConflictPopup: () => void;
  onNotify: (msg: string, tone?: 'success' | 'warning' | 'info') => void;
}

const HOURS_MATRIX = Array.from({ length: 13 }, (_, idx) => idx + 7); // 07.00 .. 19.00

type RekapScope = 'harian' | 'bulanan' | 'tahunan';

function statusColorClass(status: AgendaStatus) {
  switch (status) {
    case 'Terjadwal':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Selesai':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'Draft':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Dibatalkan':
      return 'bg-rose-50 text-rose-700 border-rose-200';
  }
}

function disposisiColorClass(status: AgendaItem['statusDisposisi']) {
  switch (status) {
    case 'Hadir Dikonfirmasi':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Disetujui Pimpinan':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Diwakilkan':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200';
  }
}

function getCategoryStyle(kategori: AgendaCategory) {
  switch (kategori) {
    case 'Kunjungan / Dinas':
      return {
        card: 'bg-orange-50/75 border-orange-300',
        chip: 'bg-orange-600 text-white',
        softPill: 'bg-orange-100 text-orange-800 border-orange-200',
        dot: 'bg-orange-500',
      };
    case 'Rapat Eksternal':
      return {
        card: 'bg-blue-50/75 border-blue-300',
        chip: 'bg-blue-600 text-white',
        softPill: 'bg-blue-100 text-blue-800 border-blue-200',
        dot: 'bg-blue-600',
      };
    case 'Undangan Resmi':
      return {
        card: 'bg-teal-50/75 border-teal-300',
        chip: 'bg-teal-600 text-white',
        softPill: 'bg-teal-100 text-teal-800 border-teal-200',
        dot: 'bg-teal-600',
      };
    case 'Rapat Internal':
      return {
        card: 'bg-indigo-50/75 border-indigo-300',
        chip: 'bg-indigo-600 text-white',
        softPill: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        dot: 'bg-indigo-600',
      };
    default:
      return {
        card: 'bg-amber-50/75 border-amber-300',
        chip: 'bg-amber-600 text-white',
        softPill: 'bg-amber-100 text-amber-900 border-amber-200',
        dot: 'bg-amber-500',
      };
  }
}

function shiftMonthYM(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  activeView,
  role,
  agendas,
  visibleAgendas,
  masterUnits,
  selectedDate,
  onChangeDate,
  selectedMonth,
  onChangeMonth,
  onOpenNewAgenda,
  onOpenEditAgenda,
  onRequestDeleteAgenda,
  onOpenDisposition,
  onToggleStatus,
  onConfirmPresence,
  onQuickShiftSlot,
  onOpenSinglePoster,
  onOpenMasterModal,
  onRequestDeleteMaster,
  onOpenConflictPopup,
  onNotify,
}) => {
  const perms = useMemo(() => getPermissions(role), [role]);
  const todayISO = useMemo(() => getLocalISODate(), []);

  // Dashboard filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState<'Semua' | AgendaCategory>('Semua');
  const [onlyConflicts, setOnlyConflicts] = useState(false);

  // Kalender toggle
  const [calendarMode, setCalendarMode] = useState<'harian' | 'bulanan'>('harian');

  // Rekap multi-scope (Harian / Bulanan / Tahunan)
  const [rekapScope, setRekapScope] = useState<RekapScope>('harian');
  const [selectedYear, setSelectedYear] = useState<string>(() => selectedDate.slice(0, 4));
  const [rekapPicFilter, setRekapPicFilter] = useState('Semua');
  const [rekapStatusFilter, setRekapStatusFilter] = useState<'Semua' | AgendaStatus>('Semua');
  const [rekapCatFilter, setRekapCatFilter] = useState<'Semua' | AgendaCategory>('Semua');
  const [includeDisposisiInReport, setIncludeDisposisiInReport] = useState(true);

  // Master Unit search/filter
  const [masterSearch, setMasterSearch] = useState('');
  const [masterTypeFilter, setMasterTypeFilter] = useState<'Semua' | MasterUnitItem['tipe']>('Semua');

  // Selected day agendas
  const dayAgendasAll = useMemo(() => {
    return visibleAgendas
      .filter((a) => a.tanggal === selectedDate)
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
  }, [visibleAgendas, selectedDate]);

  const conflictMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getConflictsForCandidate>>();
    for (const item of visibleAgendas) {
      map.set(item.id, getConflictsForCandidate(agendas, item));
    }
    return map;
  }, [visibleAgendas, agendas]);

  // Month stats for Hero & Dashboard KPIs
  const [curYear, curMonth] = selectedMonth.split('-').map(Number);
  const activeMonthLabel = `${BULAN_ID[(curMonth || 1) - 1]} ${curYear}`;
  const daysInSelectedMonth = new Date(curYear || 2026, curMonth || 1, 0).getDate();
  const monthStartLabel = `01 ${BULAN_ID[(curMonth || 1) - 1].slice(0, 3)} ${curYear}`;
  const monthEndLabel = `${String(daysInSelectedMonth).padStart(2, '0')} ${BULAN_ID[(curMonth || 1) - 1].slice(0, 3)} ${curYear}`;

  const monthAgendas = useMemo(
    () => visibleAgendas.filter((a) => a.tanggal.startsWith(selectedMonth)),
    [visibleAgendas, selectedMonth]
  );

  const dayActiveAgendas = useMemo(
    () => dayAgendasAll.filter((a) => a.status !== 'Dibatalkan'),
    [dayAgendasAll]
  );

  const dayConfirmedCount = useMemo(
    () =>
      dayActiveAgendas.filter(
        (a) =>
          a.statusDisposisi === 'Disetujui Pimpinan' ||
          a.statusDisposisi === 'Hadir Dikonfirmasi'
      ).length,
    [dayActiveAgendas]
  );

  const dayPendingDisposisiCount = useMemo(
    () =>
      dayActiveAgendas.filter(
        (a) => a.statusDisposisi === 'Menunggu Disposisi' || Boolean(a.isUpdated)
      ).length,
    [dayActiveAgendas]
  );

  const dayConflictItems = useMemo(
    () => dayActiveAgendas.filter((a) => (conflictMap.get(a.id)?.length || 0) > 0),
    [dayActiveAgendas, conflictMap]
  );

  const monthCompletedCount = useMemo(
    () => monthAgendas.filter((a) => a.status === 'Selesai').length,
    [monthAgendas]
  );
  const monthPendingCount = useMemo(
    () =>
      monthAgendas.filter(
        (a) => a.status !== 'Dibatalkan' && a.statusDisposisi === 'Menunggu Disposisi'
      ).length,
    [monthAgendas]
  );
  const safeRatioPercent = useMemo(() => {
    if (dayActiveAgendas.length === 0) return 100;
    const safe = dayActiveAgendas.length - dayConflictItems.length;
    return Math.round((safe / dayActiveAgendas.length) * 100);
  }, [dayActiveAgendas, dayConflictItems]);

  // 7-day activity chart around selectedDate
  const sevenDaySeries = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO(selectedDate, i - 3);
      const [y, m, d] = iso.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const items = visibleAgendas.filter((a) => a.tanggal === iso && a.status !== 'Dibatalkan');
      const confirmed = items.filter(
        (a) =>
          a.status === 'Selesai' ||
          a.statusDisposisi === 'Hadir Dikonfirmasi' ||
          a.statusDisposisi === 'Disetujui Pimpinan'
      ).length;
      return {
        iso,
        label: `${String(d).padStart(2, '0')} ${BULAN_ID[m - 1].slice(0, 3)}`,
        hari: HARI_ID[dt.getDay()].slice(0, 3),
        total: items.length,
        confirmed,
      };
    });
  }, [visibleAgendas, selectedDate]);

  const maxChartVal = Math.max(4, ...sevenDaySeries.map((s) => s.total));

  // Top 5 Bidang / PIC ranking
  const topBidangRanking = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of visibleAgendas) {
      if (item.status === 'Dibatalkan') continue;
      const key = (item.penyelenggara || item.pejabatPendamping || 'Sekretariat BPBD').trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const list = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const maxCount = Math.max(1, ...list.map((l) => l.count));
    return { list, maxCount };
  }, [visibleAgendas]);

  // Filtered dashboard day list
  const filteredDayAgendas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dayAgendasAll.filter((item) => {
      if (filterCat !== 'Semua' && item.kategori !== filterCat) return false;
      if (onlyConflicts && (conflictMap.get(item.id)?.length || 0) === 0) return false;
      if (q) {
        const hay = `${item.judul} ${item.lokasi} ${item.penyelenggara} ${item.pejabatPendamping} ${item.nomorSurat}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dayAgendasAll, filterCat, onlyConflicts, searchQuery, conflictMap]);

  // Week days (Sunday..Saturday) for Kalender & Linimasa
  const weekDays = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const sundayOffset = -dt.getDay();
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO(selectedDate, sundayOffset + i);
      const [yy, mm, dd] = iso.split('-').map(Number);
      const dayDt = new Date(yy, mm - 1, dd);
      const items = visibleAgendas.filter((a) => a.tanggal === iso && a.status !== 'Dibatalkan');
      const hasConflict = items.some((a) => (conflictMap.get(a.id)?.length || 0) > 0);
      return {
        iso,
        hari: HARI_ID[dayDt.getDay()],
        tglSingkat: formatTanggalPendek(iso),
        count: items.length,
        hasConflict,
        isWeekend: dayDt.getDay() === 0 || dayDt.getDay() === 6,
      };
    });
  }, [selectedDate, visibleAgendas, conflictMap]);

  // Month calendar grid cells (Monday-first)
  const monthCells = useMemo(() => {
    const firstDay = new Date(curYear || 2026, (curMonth || 1) - 1, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalDays = new Date(curYear || 2026, curMonth || 1, 0).getDate();
    const cells: Array<{
      iso: string | null;
      day: number | null;
      items: AgendaItem[];
      hasConflict: boolean;
      isWeekend: boolean;
    }> = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ iso: null, day: null, items: [], hasConflict: false, isWeekend: false });
    }
    for (let day = 1; day <= totalDays; day++) {
      const iso = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dt = new Date(curYear || 2026, (curMonth || 1) - 1, day);
      const items = visibleAgendas
        .filter((a) => a.tanggal === iso && a.status !== 'Dibatalkan')
        .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
      const hasConflict = items.some((a) => (conflictMap.get(a.id)?.length || 0) > 0);
      cells.push({
        iso,
        day,
        items,
        hasConflict,
        isWeekend: dt.getDay() === 0 || dt.getDay() === 6,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ iso: null, day: null, items: [], hasConflict: false, isWeekend: false });
    }
    return cells;
  }, [curYear, curMonth, visibleAgendas, conflictMap]);

  // Rekap Period Filtering (Harian / Bulanan / Tahunan)
  const uniquePicOptions = useMemo(() => {
    const set = new Set<string>();
    visibleAgendas.forEach((a) => {
      if (a.pejabatPendamping) set.add(a.pejabatPendamping);
      if (a.penyelenggara) set.add(a.penyelenggara);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [visibleAgendas]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>(['2024', '2025', '2026', '2027', '2028']);
    years.add(todayISO.slice(0, 4));
    years.add(selectedYear);
    visibleAgendas.forEach((a) => {
      if (/^\d{4}/.test(a.tanggal)) years.add(a.tanggal.slice(0, 4));
    });
    return Array.from(years).sort();
  }, [visibleAgendas, todayISO, selectedYear]);

  const rekapPeriodAgendas = useMemo(() => {
    return visibleAgendas
      .filter((item) => {
        if (rekapScope === 'harian') return item.tanggal === selectedDate;
        if (rekapScope === 'bulanan') return item.tanggal.startsWith(selectedMonth);
        return item.tanggal.startsWith(`${selectedYear}-`);
      })
      .sort((a, b) =>
        a.tanggal === b.tanggal
          ? timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai)
          : a.tanggal.localeCompare(b.tanggal)
      );
  }, [visibleAgendas, rekapScope, selectedDate, selectedMonth, selectedYear]);

  const rekapFiltered = useMemo(() => {
    return rekapPeriodAgendas.filter((item) => {
      if (rekapStatusFilter !== 'Semua' && item.status !== rekapStatusFilter) return false;
      if (rekapCatFilter !== 'Semua' && item.kategori !== rekapCatFilter) return false;
      if (
        rekapPicFilter !== 'Semua' &&
        item.pejabatPendamping !== rekapPicFilter &&
        item.penyelenggara !== rekapPicFilter
      ) {
        return false;
      }
      return true;
    });
  }, [rekapPeriodAgendas, rekapStatusFilter, rekapCatFilter, rekapPicFilter]);

  const rekapStats = useMemo(() => {
    const total = rekapFiltered.length;
    const aktif = rekapFiltered.filter(
      (a) => a.status === 'Terjadwal' || a.status === 'Selesai'
    ).length;
    const updated = rekapFiltered.filter((a) => Boolean(a.isUpdated)).length;
    const paralel = rekapFiltered.filter((a) => (conflictMap.get(a.id)?.length || 0) > 0).length;
    return { total, aktif, updated, paralel };
  }, [rekapFiltered, conflictMap]);

  const rekapPeriodTitle = useMemo(() => {
    if (rekapScope === 'harian') return formatTanggalLengkap(selectedDate);
    if (rekapScope === 'bulanan') {
      const [yy, mm] = selectedMonth.split('-').map(Number);
      return `Bulan ${BULAN_ID[(mm || 1) - 1]} ${yy}`;
    }
    return `Tahun ${selectedYear}`;
  }, [rekapScope, selectedDate, selectedMonth, selectedYear]);

  const rekapFilenameKey =
    rekapScope === 'harian'
      ? `Harian_${selectedDate}`
      : rekapScope === 'bulanan'
      ? `Bulanan_${selectedMonth}`
      : `Tahunan_${selectedYear}`;

  // Export handlers for Rekap (Harian / Bulanan / Tahunan)
  const handleDownloadExcel = () => {
    const showDateCol = rekapScope !== 'harian';
    const rowsHtml = rekapFiltered
      .map(
        (item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        ${showDateCol ? `<td>${escapeHtml(formatTanggalPendek(item.tanggal))}</td>` : ''}
        <td>${escapeHtml(formatRentangWaktu(item))}</td>
        <td>${escapeHtml(item.judul)}</td>
        <td>${escapeHtml(item.lokasi)}</td>
        <td>${escapeHtml(item.kategori)}</td>
        <td>${escapeHtml(item.penyelenggara)}</td>
        <td>${escapeHtml(item.pejabatPendamping || '-')}</td>
        <td>${escapeHtml(item.status)}</td>
        ${
          includeDisposisiInReport
            ? `<td>${escapeHtml(item.nomorSurat || '-')}</td><td>${escapeHtml(item.statusDisposisi)}</td>`
            : ''
        }
      </tr>`
      )
      .join('');

    const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>
      <h3>LAPORAN REKAPITULASI AGENDA (${rekapScope.toUpperCase()}) — BPBD KABUPATEN SIDOARJO</h3>
      <p>Periode: ${escapeHtml(rekapPeriodTitle)} | Total: ${rekapStats.total} agenda</p>
      <table border="1" cellspacing="0" cellpadding="6">
        <thead>
          <tr style="background:#0B2239;color:#ffffff;">
            <th>No</th>
            ${showDateCol ? '<th>Tanggal</th>' : ''}
            <th>Waktu</th>
            <th>Nama Kegiatan</th>
            <th>Lokasi</th>
            <th>Kategori</th>
            <th>Bidang / Penyelenggara</th>
            <th>PIC / Pendamping</th>
            <th>Status</th>
            ${includeDisposisiInReport ? '<th>Nomor Surat</th><th>Status Disposisi</th>' : ''}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body></html>`;

    const blob = new Blob(['\ufeff', htmlDoc], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_Agenda_BPBD_${rekapFilenameKey}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify(`Laporan Excel ${rekapScope} (.xls) berhasil diunduh.`, 'success');
  };

  const handleDownloadPdfPrint = () => {
    const showDateCol = rekapScope !== 'harian';
    const colCount = (showDateCol ? 8 : 7) + (includeDisposisiInReport ? 2 : 0);
    const rowsHtml =
      rekapFiltered.length === 0
        ? `<tr><td colspan="${colCount}" style="text-align:center;padding:18px;color:#64748b;">Tidak ada agenda pada periode ini.</td></tr>`
        : rekapFiltered
            .map(
              (item, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        ${showDateCol ? `<td style="white-space:nowrap;">${escapeHtml(formatTanggalPendek(item.tanggal))}</td>` : ''}
        <td style="white-space:nowrap;">${escapeHtml(formatRentangWaktu(item))}</td>
        <td><strong>${escapeHtml(item.judul)}</strong>${item.catatan ? `<br/><small style="color:#475569;">${escapeHtml(item.catatan)}</small>` : ''}</td>
        <td>${escapeHtml(item.lokasi)}</td>
        <td>${escapeHtml(item.penyelenggara)}</td>
        <td>${escapeHtml(item.pejabatPendamping || '-')}</td>
        <td>${escapeHtml(item.status)}</td>
        ${
          includeDisposisiInReport
            ? `<td>${escapeHtml(item.nomorSurat || '-')}</td><td>${escapeHtml(item.statusDisposisi)}</td>`
            : ''
        }
      </tr>`
            )
            .join('');

    const htmlDoc = `<!DOCTYPE html>
    <html lang="id"><head><meta charset="utf-8" />
    <title>Rekap Agenda BPBD Sidoarjo - ${escapeHtml(rekapFilenameKey)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
      .kop { border-bottom: 3px solid #0B2239; padding-bottom: 12px; margin-bottom: 16px; }
      .kop h2 { margin: 0; font-size: 16px; color: #0B2239; }
      .kop h1 { margin: 4px 0 0; font-size: 20px; color: #0B2239; }
      .meta { margin: 10px 0 18px; font-size: 13px; color: #334155; }
      table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
      th, td { border: 1px solid #cbd5e1; padding: 7px; vertical-align: top; text-align: left; }
      th { background: #0B2239; color: #ffffff; }
      @media print { body { margin: 12px; } }
    </style></head><body>
      <div class="kop">
        <h2>PEMERINTAH KABUPATEN SIDOARJO</h2>
        <h1>BADAN PENANGGULANGAN BENCANA DAERAH (BPBD)</h1>
        <div style="font-size:12px;color:#475569;margin-top:4px;">Jl. Raya Kemiri No. 1, Kec. Sidoarjo, Kabupaten Sidoarjo</div>
      </div>
      <div class="meta">
        <strong>Laporan Rekapitulasi Agenda (${escapeHtml(rekapScope.toUpperCase())})</strong> &mdash; ${escapeHtml(rekapPeriodTitle)}
        &nbsp;|&nbsp; Total: ${rekapStats.total} agenda
      </div>
      <table>
        <thead>
          <tr>
            <th>No</th>
            ${showDateCol ? '<th>Tanggal</th>' : ''}
            <th>Waktu</th>
            <th>Nama Kegiatan</th>
            <th>Lokasi</th>
            <th>Bidang</th>
            <th>PIC / Pendamping</th>
            <th>Status</th>
            ${includeDisposisiInReport ? '<th>No. Surat</th><th>Disposisi</th>' : ''}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const frameWin = iframe.contentWindow;
    const frameDoc = frameWin?.document;
    if (frameDoc && frameWin) {
      frameDoc.open();
      frameDoc.write(htmlDoc);
      frameDoc.close();
      setTimeout(() => {
        frameWin.focus();
        frameWin.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1200);
      }, 250);
    }
    onNotify(`Dialog cetak / simpan PDF ${rekapScope} disiapkan.`, 'info');
  };

  // Master Unit filtered list
  const filteredMasterUnits = useMemo(() => {
    const q = masterSearch.trim().toLowerCase();
    return masterUnits.filter((u) => {
      if (masterTypeFilter !== 'Semua' && u.tipe !== masterTypeFilter) return false;
      if (q) {
        const hay = `${u.kode} ${u.nama} ${u.keterangan} ${u.tipe}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [masterUnits, masterSearch, masterTypeFilter]);

  // =========================================================================
  // VIEW 1: DASHBOARD AGENDA (Colorful Executive UI)
  // =========================================================================
  if (activeView === 'dashboard') {
    return (
      <div className="space-y-6">
        {/* Simultaneous Agenda Alert Strip if any conflicts today */}
        {dayConflictItems.length > 0 && (
          <div className="rounded-2xl border border-rose-300 bg-gradient-to-r from-rose-600 to-orange-600 p-4 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-extrabold">
                  Perhatian: {dayConflictItems.length} Agenda Berjalan Bersamaan pada{' '}
                  {formatTanggalPendek(selectedDate)}!
                </p>
                <p className="text-xs text-rose-50 mt-0.5">
                  Segera cek pembagian PIC pendamping atau geser ke slot waktu kosong agar tidak terjadi bentrok kehadiran.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenConflictPopup}
              className="px-4 py-2 rounded-xl bg-white text-rose-700 hover:bg-rose-50 text-xs font-extrabold shrink-0 shadow-xs"
            >
              Lihat Pop-Up Bentrok
            </button>
          </div>
        )}

        {/* Executive Hero Summary Card */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            <div className="lg:col-span-7 space-y-3">
              <div className="inline-flex items-center gap-2 rounded-lg bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800">
                <Calendar className="w-3.5 h-3.5 text-teal-700" />
                <span>Monitoring {activeMonthLabel} · BPBD Kab. Sidoarjo</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Ringkasan eksekutif agenda kegiatan, disposisi e-Buddy, dan kontrol bentrok jadwal.
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                Dashboard terpadu untuk memantau agenda harian pimpinan dan bidang, mendeteksi bentrok jam secara otomatis, serta menyiapkan rekap resmi dan kartu broadcast WhatsApp.
              </p>
            </div>

            <div className="lg:col-span-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-medium text-slate-500">Periode Aktif</p>
                <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                  {monthStartLabel} - {monthEndLabel}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-medium text-slate-500">Agenda Selesai (Bulan)</p>
                <p className="mt-1 text-sm font-bold text-emerald-700 tabular-nums">
                  {monthCompletedCount} Kegiatan
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-medium text-slate-500">Disposisi Pending</p>
                <p className="mt-1 text-sm font-bold text-amber-700 tabular-nums">
                  {monthPendingCount} Surat
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-medium text-slate-500">Bebas Bentrok Hari Ini</p>
                <p className="mt-1 text-sm font-bold text-teal-700 tabular-nums">
                  {safeRatioPercent}% Aman
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4 Vibrant Colored KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-600 p-5 text-white shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-100">
                  TOTAL AGENDA HARI INI
                </p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">
                  {dayActiveAgendas.length}
                </p>
                <p className="mt-1 text-xs font-medium text-teal-100">
                  {formatTanggalPendek(selectedDate)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="mt-4 pt-3 border-t border-white/15 text-xs text-teal-50">
              Akumulasi jadwal aktif non-batal pada tanggal terpilih.
            </p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-green-600 p-5 text-white shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">
                  DISETUJUI &amp; DIKONFIRMASI
                </p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">
                  {dayConfirmedCount}
                </p>
                <p className="mt-1 text-xs font-medium text-emerald-100">
                  Siap jalan / Hadir terverifikasi
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="mt-4 pt-3 border-t border-white/15 text-xs text-emerald-50">
              Disposisi pimpinan dan kehadiran pejabat sudah terkonfirmasi.
            </p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-amber-600 to-amber-500 p-5 text-white shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-100">
                  PERLU DISPOSISI / UPDATE
                </p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">
                  {dayPendingDisposisiCount}
                </p>
                <p className="mt-1 text-xs font-medium text-amber-100">
                  Menunggu arahan / baru diperbarui
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="mt-4 pt-3 border-t border-white/15 text-xs text-amber-50">
              Perlu diinfokan ke pejabat pendamping &amp; grup WA pegawai.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (dayConflictItems.length > 0) {
                onOpenConflictPopup();
              } else {
                setOnlyConflicts((prev) => !prev);
              }
            }}
            className="text-left rounded-2xl bg-gradient-to-br from-blue-700 to-sky-600 p-5 text-white shadow-sm flex flex-col justify-between hover:brightness-105 transition focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100">
                  POTENSI BENTROK JAM
                </p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">
                  {dayConflictItems.length}
                </p>
                <p className="mt-1 text-xs font-medium text-sky-100">
                  {dayConflictItems.length > 0
                    ? 'Klik untuk pop-up detail bentrok'
                    : 'Tidak ada jadwal bersamaan'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="mt-4 pt-3 border-t border-white/15 text-xs text-sky-50">
              Jadwal jam paralel antar undangan pada hari yang sama.
            </p>
          </button>
        </section>

        {/* 2-Column Analytics Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Aktivitas Agenda 7 Hari Sekitar Tanggal Terpilih
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Perbandingan total jadwal aktif dan agenda terkonfirmasi per hari.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" />
                  Total Agenda
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                  Terkonfirmasi
                </span>
              </div>
            </div>

            <div className="h-52 flex items-end gap-2 sm:gap-4 pt-4 pb-2 border-b border-slate-100">
              {sevenDaySeries.map((point) => {
                const isSelected = point.iso === selectedDate;
                const totalPct = Math.round((point.total / maxChartVal) * 100);
                const confPct = Math.round((point.confirmed / maxChartVal) * 100);
                return (
                  <button
                    key={point.iso}
                    type="button"
                    onClick={() => onChangeDate(point.iso)}
                    className={`flex-1 h-full flex flex-col justify-end items-center rounded-xl px-1.5 py-2 transition ${
                      isSelected ? 'bg-slate-100/90 ring-1 ring-slate-300' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-[11px] font-bold text-slate-700 tabular-nums mb-1.5">
                      {point.total}
                    </span>
                    <div className="w-full max-w-[44px] h-32 flex items-end justify-center gap-1">
                      <div
                        className="w-4 rounded-t-md bg-blue-600 transition-all"
                        style={{ height: `${Math.max(point.total > 0 ? 12 : 4, totalPct)}%` }}
                      />
                      <div
                        className="w-4 rounded-t-md bg-emerald-500 transition-all"
                        style={{ height: `${Math.max(point.confirmed > 0 ? 12 : 4, confPct)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-7 gap-2 pt-2 text-center">
              {sevenDaySeries.map((point) => (
                <div key={point.iso} className="text-[11px] leading-tight">
                  <div
                    className={`font-bold ${
                      point.iso === selectedDate ? 'text-blue-700' : 'text-slate-700'
                    }`}
                  >
                    {point.hari}
                  </div>
                  <div className="text-slate-500">{point.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Top Bidang / Penyelenggara</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Distribusi volume kegiatan aktif berdasarkan unit pengampu.
                  </p>
                </div>
                <span className="rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-bold text-teal-800 shrink-0">
                  Top {topBidangRanking.list.length}
                </span>
              </div>

              <div className="space-y-3.5">
                {topBidangRanking.list.map((row, idx) => {
                  const pct = Math.round((row.count / topBidangRanking.maxCount) * 100);
                  const barColors = [
                    'bg-blue-600',
                    'bg-teal-600',
                    'bg-emerald-600',
                    'bg-amber-500',
                    'bg-indigo-600',
                  ];
                  return (
                    <div key={row.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 truncate">{row.name}</span>
                        <span className="font-bold text-slate-700 tabular-nums shrink-0">
                          {row.count} agenda
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColors[idx % barColors.length]}`}
                          style={{ width: `${Math.max(10, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {topBidangRanking.list.length === 0 && (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    Belum ada data agenda aktif.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Total basis data terlihat</span>
              <span className="font-bold text-slate-800 tabular-nums">
                {visibleAgendas.length} agenda
              </span>
            </div>
          </div>
        </section>

        {/* Daily Agenda Control Bar & List */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Daftar Agenda — {formatTanggalLengkap(selectedDate)}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Menampilkan {filteredDayAgendas.length} dari {dayAgendasAll.length} agenda pada tanggal terpilih.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onChangeDate(addDaysISO(selectedDate, -1))}
                className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                -1 Hr
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && onChangeDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white"
              />
              <button
                type="button"
                onClick={() => onChangeDate(addDaysISO(selectedDate, 1))}
                className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                +1 Hr
              </button>
              <button
                type="button"
                onClick={() => onChangeDate(todayISO)}
                className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800"
              >
                Hari Ini
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kegiatan, lokasi, nomor surat, atau PIC..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
              />
            </div>
            <div className="md:col-span-3">
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value as 'Semua' | AgendaCategory)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white text-slate-800"
              >
                <option value="Semua">Semua Kategori</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOnlyConflicts((p) => !p)}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  onlyConflicts
                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{onlyConflicts ? 'Hanya Bentrok (Aktif)' : 'Filter Jadwal Bentrok'}</span>
              </button>
            </div>
          </div>

          {filteredDayAgendas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-10 text-center">
              <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                Tidak ada agenda yang sesuai filter pada {formatTanggalPendek(selectedDate)}.
              </p>
              {perms.canCreateAgenda && (
                <button
                  type="button"
                  onClick={() => onOpenNewAgenda({ tanggal: selectedDate })}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B2239] text-white text-xs font-semibold hover:bg-[#133254]"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Agenda di Tanggal Ini
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDayAgendas.map((item) => {
                const conflicts = conflictMap.get(item.id) || [];
                const canDelete = perms.canDeleteAgenda(item);
                const freeSlot =
                  conflicts.length > 0 && perms.canEditAgenda
                    ? findNextAvailableSlot(
                        agendas,
                        item.tanggal,
                        timeToMinutes(item.jamSelesai) - timeToMinutes(item.jamMulai),
                        item.id
                      )
                    : null;

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 transition ${
                      conflicts.length > 0
                        ? 'border-rose-300 bg-rose-50/35'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B2239] text-white px-2.5 py-1 text-xs font-bold font-mono tabular-nums">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            {formatRentangWaktu(item)}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            ({formatDurasi(item.jamMulai, item.jamSelesai, item.sampaiSelesai)})
                          </span>
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusColorClass(
                              item.status
                            )}`}
                          >
                            {item.status}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${disposisiColorClass(
                              item.statusDisposisi
                            )}`}
                          >
                            {item.statusDisposisi}
                          </span>
                          {item.isUpdated && (
                            <span className="inline-flex items-center rounded-md bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-bold tracking-wide">
                              UPDATE / BARU
                            </span>
                          )}
                          {item.isConfidential && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 text-amber-300 px-2 py-0.5 text-[10px] font-bold">
                              <Lock className="w-3 h-3" />
                              TERBATAS
                            </span>
                          )}
                          {conflicts.length > 0 && (
                            <button
                              type="button"
                              onClick={onOpenConflictPopup}
                              className="inline-flex items-center gap-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 text-[11px] font-bold"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Bentrok {conflicts.length} Jadwal
                            </button>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-slate-900 leading-snug">
                          {item.judul}
                        </h4>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                            <span>{item.lokasi}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{item.penyelenggara}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span className="font-semibold text-slate-800">
                              PIC: {item.pejabatPendamping || '-'}
                            </span>
                          </span>
                          {item.nomorSurat && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
                              No: {item.nomorSurat}
                            </span>
                          )}
                        </div>

                        {item.zoomUrl && (
                          <div className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-medium">
                            <Video className="w-3.5 h-3.5" />
                            <a
                              href={item.zoomUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline break-all"
                            >
                              {item.zoomUrl}
                            </a>
                          </div>
                        )}

                        {conflicts.length > 0 && (
                          <div className="rounded-lg border border-rose-200 bg-white/90 p-2.5 text-xs text-rose-800 flex flex-wrap items-center justify-between gap-2">
                            <span>
                              Bertabrakan dengan:{' '}
                              <strong>
                                {conflicts
                                  .map((c) => `${c.agenda.judul} (${c.agenda.jamMulai})`)
                                  .join(', ')}
                              </strong>
                            </span>
                            {freeSlot && (
                              <button
                                type="button"
                                onClick={() =>
                                  onQuickShiftSlot(item, freeSlot.jamMulai, freeSlot.jamSelesai)
                                }
                                className="px-2.5 py-1 rounded-md bg-rose-600 text-white font-semibold hover:bg-rose-700 shrink-0"
                              >
                                Pindah ke Slot Kosong ({freeSlot.jamMulai} - {freeSlot.jamSelesai})
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap lg:flex-col items-stretch sm:items-center lg:items-end gap-1.5 shrink-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {perms.canEditAgenda && (
                            <button
                              type="button"
                              onClick={() => onOpenEditAgenda(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                              Edit
                            </button>
                          )}
                          {perms.canEditDisposition && (
                            <button
                              type="button"
                              onClick={() => onOpenDisposition(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-800"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Disposisi
                            </button>
                          )}
                          {perms.canConfirmPresence &&
                            item.statusDisposisi !== 'Hadir Dikonfirmasi' && (
                              <button
                                type="button"
                                onClick={() => onConfirmPresence(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Konfirmasi Hadir
                              </button>
                            )}
                          {perms.canEditAgenda && item.status !== 'Dibatalkan' && (
                            <button
                              type="button"
                              onClick={() => onToggleStatus(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700"
                            >
                              {item.status === 'Selesai' ? 'Buka Lagi' : 'Tandai Selesai'}
                            </button>
                          )}
                          {perms.canOpenCardStudio && (
                            <button
                              type="button"
                              onClick={() => onOpenSinglePoster(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 text-xs font-semibold text-orange-800"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              Kartu WA
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => onRequestDeleteAgenda(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: KALENDER & LINIMASA WIB (Colorful, Vibrant & Executive)
  // =========================================================================
  if (activeView === 'kalender') {
    return (
      <div className="space-y-5">
        {/* Vibrant Gradient Calendar Header Card */}
        <div className="rounded-2xl bg-gradient-to-r from-[#0B2239] via-[#123760] to-[#1D4ED8] text-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <Calendar className="w-3.5 h-3.5" />
                Matriks Waktu &amp; Kalender Berwarna (WIB)
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold mt-2">
                {calendarMode === 'harian'
                  ? formatTanggalLengkap(selectedDate)
                  : `Kalender Bulanan — ${activeMonthLabel}`}
              </h2>
              <p className="text-xs text-sky-100 mt-1 max-w-xl">
                Agenda berkategori tampil berwarna sesuai jenis kegiatan. Jadwal pada jam bersamaan langsung disorot berdampingan.
              </p>
            </div>

            <div className="inline-flex rounded-xl bg-white/12 p-1 border border-white/15 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setCalendarMode('harian')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                  calendarMode === 'harian'
                    ? 'bg-[#EA580C] text-white shadow-sm'
                    : 'text-sky-100 hover:text-white'
                }`}
              >
                Linimasa WIB
              </button>
              <button
                type="button"
                onClick={() => setCalendarMode('bulanan')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                  calendarMode === 'bulanan'
                    ? 'bg-[#EA580C] text-white shadow-sm'
                    : 'text-sky-100 hover:text-white'
                }`}
              >
                Kalender Bulanan
              </button>
            </div>
          </div>

          {/* Color Category Legend */}
          <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center gap-3 text-[11px] font-semibold">
            {CATEGORIES.map((cat) => {
              const st = getCategoryStyle(cat);
              return (
                <span key={cat} className="inline-flex items-center gap-1.5 text-sky-50">
                  <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                  {cat}
                </span>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          {calendarMode === 'harian' ? (
            <>
              {/* Date Stepper */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeDate(addDaysISO(selectedDate, -1))}
                    className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    aria-label="Hari sebelumnya"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => e.target.value && onChangeDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-800 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => onChangeDate(addDaysISO(selectedDate, 1))}
                    className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    aria-label="Hari berikutnya"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeDate(todayISO)}
                    className="px-3 py-2 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-xs font-bold text-teal-800"
                  >
                    Hari Ini
                  </button>
                </div>

                {dayConflictItems.length > 0 && (
                  <button
                    type="button"
                    onClick={onOpenConflictPopup}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    <span>{dayConflictItems.length} Agenda Bersamaan</span>
                  </button>
                )}
              </div>

              {/* Colorful 7-Day Weekly Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {weekDays.map((wd) => {
                  const isSelected = wd.iso === selectedDate;
                  return (
                    <button
                      key={wd.iso}
                      type="button"
                      onClick={() => onChangeDate(wd.iso)}
                      className={`rounded-xl border p-3.5 text-left transition ${
                        isSelected
                          ? 'bg-gradient-to-br from-[#0B2239] to-[#1D4ED8] border-blue-700 text-white shadow-md ring-2 ring-blue-300'
                          : wd.hasConflict
                          ? 'bg-gradient-to-br from-rose-50 to-orange-50 border-rose-300 text-slate-900 hover:border-rose-400'
                          : wd.count > 0
                          ? 'bg-gradient-to-br from-teal-50/80 to-emerald-50/70 border-teal-200 text-slate-900 hover:border-teal-300'
                          : wd.isWeekend
                          ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={`text-xs font-semibold ${
                            isSelected ? 'text-amber-300' : 'text-slate-500'
                          }`}
                        >
                          {wd.hari}
                        </p>
                        {wd.iso === todayISO && (
                          <span
                            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                              isSelected
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-blue-600 text-white'
                            }`}
                          >
                            Hari Ini
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-extrabold mt-0.5">{wd.tglSingkat}</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            isSelected
                              ? 'bg-white/15 text-white'
                              : wd.hasConflict
                              ? 'bg-rose-600 text-white'
                              : wd.count > 0
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {wd.count} agenda
                        </span>
                        {wd.hasConflict && (
                          <AlertTriangle
                            className={`w-4 h-4 ${
                              isSelected ? 'text-amber-300' : 'text-rose-600'
                            }`}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Colorful Hourly Time Matrix */}
              <div className="space-y-2.5 pt-2">
                {HOURS_MATRIX.map((hour) => {
                  const slotStartMin = hour * 60;
                  const slotEndMin = (hour + 1) * 60;
                  const slotLabel = `${String(hour).padStart(2, '0')}.00 WIB`;

                  const activeInSlot = dayActiveAgendas.filter((a) => {
                    const s = timeToMinutes(a.jamMulai);
                    const e = timeToMinutes(a.jamSelesai);
                    return s < slotEndMin && e > slotStartMin;
                  });

                  const isParallel = activeInSlot.length > 1;

                  return (
                    <div
                      key={hour}
                      className={`rounded-xl border p-3.5 transition ${
                        isParallel
                          ? 'border-rose-300 bg-gradient-to-r from-rose-50/70 to-orange-50/40'
                          : activeInSlot.length === 1
                          ? 'border-sky-200 bg-sky-50/35'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-extrabold text-slate-800">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isParallel
                                ? 'bg-rose-600'
                                : activeInSlot.length === 1
                                ? 'bg-blue-600'
                                : 'bg-slate-300'
                            }`}
                          />
                          {slotLabel}
                        </span>
                        <div className="flex items-center gap-2">
                          {isParallel && (
                            <button
                              type="button"
                              onClick={onOpenConflictPopup}
                              className="inline-flex items-center gap-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 text-[11px] font-bold"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              {activeInSlot.length} Jadwal Bersamaan
                            </button>
                          )}
                          {perms.canCreateAgenda && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenNewAgenda({
                                  tanggal: selectedDate,
                                  jamMulai: `${String(hour).padStart(2, '0')}:00`,
                                  jamSelesai: `${String(Math.min(23, hour + 2)).padStart(2, '0')}:00`,
                                })
                              }
                              className="text-[11px] font-bold text-blue-700 hover:underline"
                            >
                              + Isi Slot Ini
                            </button>
                          )}
                        </div>
                      </div>

                      {activeInSlot.length === 0 ? (
                        <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Slot waktu kosong</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {activeInSlot.map((item) => {
                            const catSt = getCategoryStyle(item.kategori);
                            return (
                              <div
                                key={`${hour}-${item.id}`}
                                className={`rounded-xl border p-3 shadow-2xs space-y-1.5 ${catSt.card}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-md ${catSt.chip}`}
                                  >
                                    {formatRentangWaktu(item)}
                                  </span>
                                  <span
                                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold bg-white ${disposisiColorClass(
                                      item.statusDisposisi
                                    )}`}
                                  >
                                    {item.statusDisposisi}
                                  </span>
                                </div>
                                <p className="text-xs font-extrabold text-slate-900 line-clamp-2">
                                  {item.judul}
                                </p>
                                <p className="text-[11px] text-slate-700 truncate">
                                  📍 {item.lokasi}
                                </p>
                                <p className="text-[11px] font-bold text-slate-800 truncate">
                                  👤 {item.pejabatPendamping || item.penyelenggara}
                                </p>
                                <div className="pt-1.5 flex flex-wrap items-center gap-1.5">
                                  {perms.canEditAgenda && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenEditAgenda(item)}
                                      className="px-2 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-700"
                                    >
                                      Edit
                                    </button>
                                  )}
                                  {perms.canEditDisposition && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenDisposition(item)}
                                      className="px-2 py-1 rounded-md bg-white border border-indigo-200 hover:bg-indigo-50 text-[11px] font-semibold text-indigo-700"
                                    >
                                      Disposisi
                                    </button>
                                  )}
                                  {perms.canDeleteAgenda(item) && (
                                    <button
                                      type="button"
                                      onClick={() => onRequestDeleteAgenda(item)}
                                      className="px-2 py-1 rounded-md bg-white border border-rose-200 hover:bg-rose-50 text-[11px] font-semibold text-rose-700"
                                    >
                                      Hapus
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Colorful Monthly Calendar Grid + Selected Day Detail Panel */
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeMonth(shiftMonthYM(selectedMonth, -1))}
                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => e.target.value && onChangeMonth(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => onChangeMonth(shiftMonthYM(selectedMonth, 1))}
                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeMonth(todayISO.slice(0, 7));
                      onChangeDate(todayISO);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-xs font-bold text-teal-800"
                  >
                    Bulan Ini
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                    Total {activeMonthLabel}: {monthAgendas.length} agenda
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-extrabold text-white">
                {HARI_SINGKAT_SENIN.map((d, idx) => (
                  <div
                    key={d}
                    className={`py-2 rounded-lg ${
                      idx >= 5 ? 'bg-orange-600' : 'bg-[#0B2239]'
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {monthCells.map((cell, idx) => {
                  if (!cell.iso || !cell.day) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="min-h-[96px] rounded-xl bg-slate-50/60 border border-dashed border-slate-100"
                      />
                    );
                  }
                  const isSel = cell.iso === selectedDate;
                  const isToday = cell.iso === todayISO;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => onChangeDate(cell.iso!)}
                      className={`min-h-[98px] rounded-xl border p-2 text-left flex flex-col justify-between transition ${
                        isSel
                          ? 'border-blue-600 bg-blue-50/85 ring-2 ring-blue-500 shadow-xs'
                          : cell.hasConflict
                          ? 'border-rose-300 bg-rose-50/45 hover:border-rose-400'
                          : cell.isWeekend
                          ? 'border-slate-200 bg-orange-50/25 hover:border-orange-300'
                          : 'border-slate-200 bg-white hover:border-teal-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-extrabold tabular-nums w-6 h-6 rounded-full inline-flex items-center justify-center ${
                            isToday
                              ? 'bg-[#EA580C] text-white'
                              : isSel
                              ? 'bg-[#0B2239] text-white'
                              : 'text-slate-800'
                          }`}
                        >
                          {cell.day}
                        </span>
                        <div className="flex items-center gap-1">
                          {cell.hasConflict && (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          {cell.items.length > 0 && (
                            <span className="rounded-md bg-teal-600 text-white px-1.5 py-0.5 text-[10px] font-bold">
                              {cell.items.length}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 mt-1.5 overflow-hidden">
                        {cell.items.slice(0, 2).map((ag) => {
                          const catSt = getCategoryStyle(ag.kategori);
                          return (
                            <div
                              key={ag.id}
                              className={`truncate text-[10px] font-bold px-1.5 py-0.5 rounded ${catSt.chip}`}
                            >
                              {ag.jamMulai} {ag.judul}
                            </div>
                          );
                        })}
                        {cell.items.length > 2 && (
                          <div className="text-[10px] font-bold text-slate-600 pl-1">
                            +{cell.items.length - 2} lagi
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Date Detail Drawer below Monthly Grid */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">
                      Agenda pada {formatTanggalLengkap(selectedDate)} ({dayActiveAgendas.length})
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCalendarMode('harian')}
                      className="px-3 py-1.5 rounded-lg bg-[#0B2239] text-white text-xs font-bold"
                    >
                      Buka Linimasa WIB
                    </button>
                    {perms.canCreateAgenda && (
                      <button
                        type="button"
                        onClick={() => onOpenNewAgenda({ tanggal: selectedDate })}
                        className="px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-bold"
                      >
                        + Tambah Agenda
                      </button>
                    )}
                  </div>
                </div>

                {dayActiveAgendas.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    Tidak ada agenda terjadwal pada tanggal ini.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {dayActiveAgendas.map((item) => {
                      const catSt = getCategoryStyle(item.kategori);
                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3 flex items-start justify-between gap-2 ${catSt.card}`}
                        >
                          <div className="space-y-1 min-w-0">
                            <span
                              className={`inline-block font-mono text-[10px] font-bold px-2 py-0.5 rounded ${catSt.chip}`}
                            >
                              {formatRentangWaktu(item)}
                            </span>
                            <p className="text-xs font-extrabold text-slate-900 line-clamp-2">
                              {item.judul}
                            </p>
                            <p className="text-[11px] text-slate-700 truncate">
                              📍 {item.lokasi} · 👤 {item.pejabatPendamping || item.penyelenggara}
                            </p>
                          </div>
                          {perms.canEditAgenda && (
                            <button
                              type="button"
                              onClick={() => onOpenEditAgenda(item)}
                              className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 shrink-0"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: REKAP AGENDA (HARIAN / BULANAN / TAHUNAN + EXCEL & PDF)
  // =========================================================================
  if (activeView === 'rekap_harian') {
    const showDateColumn = rekapScope !== 'harian';
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-blue-700">
                Laporan Resmi BPBD Kabupaten Sidoarjo
              </p>
              <h2 className="text-2xl font-bold text-slate-900 mt-0.5">
                Rekap Agenda (Harian, Bulanan &amp; Tahunan)
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Pilih rentang rekap per hari, bulan, atau tahun, lalu unduh langsung sebagai Excel (.xls) atau PDF (.pdf).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Download Excel (.xls)</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPdfPrint}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B2239] hover:bg-[#133254] text-white text-sm font-semibold shadow-xs"
              >
                <FileText className="w-4 h-4" />
                <span>Download PDF (.pdf)</span>
              </button>
            </div>
          </div>

          {/* 3-Tab Quick Period Scope Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setRekapScope('harian')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  rekapScope === 'harian'
                    ? 'bg-[#0B2239] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Hari
              </button>
              <button
                type="button"
                onClick={() => setRekapScope('bulanan')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  rekapScope === 'bulanan'
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Bulan
              </button>
              <button
                type="button"
                onClick={() => setRekapScope('tahunan')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  rekapScope === 'tahunan'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Tahun
              </button>
            </div>

            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">
              Periode Laporan: {rekapPeriodTitle}
            </span>
          </div>

          {/* Dynamic Period & Attribute Filter Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Period Selector based on Scope */}
              <div className="lg:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {rekapScope === 'harian'
                    ? 'Tanggal Laporan'
                    : rekapScope === 'bulanan'
                    ? 'Bulan Laporan'
                    : 'Tahun Laporan'}
                </label>

                {rekapScope === 'harian' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onChangeDate(addDaysISO(selectedDate, -1))}
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0"
                    >
                      -1 Hr
                    </button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => e.target.value && onChangeDate(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => onChangeDate(addDaysISO(selectedDate, 1))}
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0"
                    >
                      +1 Hr
                    </button>
                  </div>
                )}

                {rekapScope === 'bulanan' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onChangeMonth(shiftMonthYM(selectedMonth, -1))}
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0"
                    >
                      -1 Bln
                    </button>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => e.target.value && onChangeMonth(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => onChangeMonth(shiftMonthYM(selectedMonth, 1))}
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0"
                    >
                      +1 Bln
                    </button>
                  </div>
                )}

                {rekapScope === 'tahunan' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedYear(String(Number(selectedYear) - 1))}
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0"
                    >
                      -1 Thn
                    </button>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-800"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          Tahun {y}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setSelectedYear(String(Number(selectedYear) + 1))}
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0"
                    >
                      +1 Thn
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Filter Bidang / PIC
                </label>
                <div className="relative">
                  <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={rekapPicFilter}
                    onChange={(e) => setRekapPicFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800"
                  >
                    <option value="Semua">Semua Bidang / Personel</option>
                    {uniquePicOptions.map((pic) => (
                      <option key={pic} value={pic}>
                        {pic}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Filter Kategori
                </label>
                <select
                  value={rekapCatFilter}
                  onChange={(e) => setRekapCatFilter(e.target.value as 'Semua' | AgendaCategory)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800"
                >
                  <option value="Semua">Semua Kategori</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Filter Status Agenda
                </label>
                <select
                  value={rekapStatusFilter}
                  onChange={(e) => setRekapStatusFilter(e.target.value as 'Semua' | AgendaStatus)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800"
                >
                  <option value="Semua">Semua Status</option>
                  <option value="Terjadwal">Terjadwal</option>
                  <option value="Draft">Draft</option>
                  <option value="Selesai">Selesai</option>
                  <option value="Dibatalkan">Dibatalkan</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeDisposisiInReport}
                  onChange={(e) => setIncludeDisposisiInReport(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Sertakan disposisi &amp; nomor surat di laporan</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  onChangeDate(todayISO);
                  onChangeMonth(todayISO.slice(0, 7));
                  setSelectedYear(todayISO.slice(0, 4));
                  setRekapPicFilter('Semua');
                  setRekapCatFilter('Semua');
                  setRekapStatusFilter('Semua');
                }}
                className="text-xs font-bold text-blue-700 hover:underline"
              >
                Reset ke Periode Sekarang
              </button>
            </div>
          </div>

          {/* 4 Stat Counters */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Total Agenda Laporan</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">
                {rekapStats.total}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Agenda Aktif / Berjalan</p>
              <p className="mt-2 text-2xl font-extrabold text-emerald-700 tabular-nums">
                {rekapStats.aktif}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Agenda Update / Baru</p>
              <p className="mt-2 text-2xl font-extrabold text-amber-600 tabular-nums">
                {rekapStats.updated}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Jadwal Jam Paralel</p>
              <p className="mt-2 text-2xl font-extrabold text-rose-600 tabular-nums">
                {rekapStats.paralel}
              </p>
            </div>
          </div>

          {/* Detailed Report Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#0B2239] text-white text-xs uppercase tracking-wider">
                  <th className="py-3 px-3.5">No</th>
                  {showDateColumn && <th className="py-3 px-3.5 whitespace-nowrap">Tanggal</th>}
                  <th className="py-3 px-3.5 whitespace-nowrap">Waktu (WIB)</th>
                  <th className="py-3 px-3.5">Kegiatan &amp; Lokasi</th>
                  <th className="py-3 px-3.5">Bidang / PIC</th>
                  {includeDisposisiInReport && (
                    <th className="py-3 px-3.5">No. Surat &amp; Disposisi</th>
                  )}
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rekapFiltered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(showDateColumn ? 7 : 6) + (includeDisposisiInReport ? 1 : 0)}
                      className="py-10 text-center text-slate-500"
                    >
                      Tidak ada agenda pada {rekapPeriodTitle}.
                    </td>
                  </tr>
                ) : (
                  rekapFiltered.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3.5 font-mono text-xs text-slate-500">{idx + 1}</td>
                      {showDateColumn && (
                        <td className="py-3 px-3.5 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {formatTanggalPendek(item.tanggal)}
                        </td>
                      )}
                      <td className="py-3 px-3.5 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                        {formatRentangWaktu(item)}
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-slate-900">{item.judul}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{item.lokasi}</div>
                      </td>
                      <td className="py-3 px-3.5 text-xs">
                        <div className="font-semibold text-slate-800">{item.penyelenggara}</div>
                        <div className="text-slate-500">{item.pejabatPendamping || '-'}</div>
                      </td>
                      {includeDisposisiInReport && (
                        <td className="py-3 px-3.5 text-xs">
                          <div className="font-mono text-slate-700">{item.nomorSurat || '-'}</div>
                          <span
                            className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${disposisiColorClass(
                              item.statusDisposisi
                            )}`}
                          >
                            {item.statusDisposisi}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${statusColorClass(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap space-x-1">
                        {perms.canEditAgenda && (
                          <button
                            type="button"
                            onClick={() => onOpenEditAgenda(item)}
                            className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                          >
                            Edit
                          </button>
                        )}
                        {perms.canDeleteAgenda(item) && (
                          <button
                            type="button"
                            onClick={() => onRequestDeleteAgenda(item)}
                            className="px-2 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700"
                          >
                            Hapus
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 4: MASTER UNIT & LOKASI
  // =========================================================================
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Referensi Data Kelembagaan
            </p>
            <h2 className="text-2xl font-bold text-slate-900 mt-0.5">Master Unit &amp; Lokasi</h2>
            <p className="text-sm text-slate-600 mt-1">
              Daftar bidang BPBD dan lokasi rapat resmi yang otomatis muncul sebagai saran pada formulir input agenda.
            </p>
          </div>
          {perms.canManageMaster && (
            <button
              type="button"
              onClick={() => onOpenMasterModal()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B2239] hover:bg-[#133254] text-white text-sm font-semibold shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Unit / Lokasi</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={masterSearch}
              onChange={(e) => setMasterSearch(e.target.value)}
              placeholder="Cari kode, nama bidang, atau lokasi ruangan..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="md:col-span-4">
            <select
              value={masterTypeFilter}
              onChange={(e) =>
                setMasterTypeFilter(e.target.value as 'Semua' | MasterUnitItem['tipe'])
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            >
              <option value="Semua">Semua Tipe Master</option>
              <option value="Unit / Bidang">Unit / Bidang</option>
              <option value="Lokasi / Ruangan">Lokasi / Ruangan</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredMasterUnits.map((unit) => (
            <div
              key={unit.id}
              className="rounded-xl border border-slate-200 bg-white p-4 flex items-start justify-between gap-3 hover:border-slate-300"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                    {unit.kode}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                      unit.tipe === 'Unit / Bidang'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-orange-50 text-orange-700'
                    }`}
                  >
                    {unit.tipe}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">{unit.nama}</h4>
                <p className="text-xs text-slate-500">{unit.keterangan || '-'}</p>
              </div>

              {(perms.canManageMaster || perms.canDeleteMaster) && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {perms.canManageMaster && (
                    <button
                      type="button"
                      onClick={() => onOpenMasterModal(unit)}
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      title="Edit Master Data"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {perms.canDeleteMaster && (
                    <button
                      type="button"
                      onClick={() => onRequestDeleteMaster(unit)}
                      className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                      title="Hapus Master Data (Super Admin)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
