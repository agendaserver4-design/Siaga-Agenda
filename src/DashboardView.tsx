import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart3,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  FileSpreadsheet,
  FileText,
  Filter,
  Image as ImageIcon,
  Lock,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { buildSingleAgendaText } from './posterCanvas';
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
  buildAtasanReminderWhatsAppUrl,
  formatDurasi,
  formatRentangWaktu,
  formatTanggalLengkap,
  formatTanggalPendek,
  getLocalISODate,
  getPermissions,
  isAgendaDueSoonWIB,
  timeToMinutes,
} from './types';

interface DashboardViewProps {
  activeView: Extract<ActiveView, 'dashboard' | 'kalender' | 'rekap_harian' | 'master_unit'>;
  role: RoleCode;
  visibleAgendas: AgendaItem[];
  masterUnits: MasterUnitItem[];
  selectedDate: string;
  onChangeDate: (iso: string) => void;
  selectedMonth: string;
  onChangeMonth: (ym: string) => void;
  onOpenNewAgenda: (preset?: Partial<AgendaItem>) => void;
  onOpenEditAgenda: (item: AgendaItem) => void;
  onRequestDeleteAgenda: (item: AgendaItem) => void;
  onToggleStatus: (item: AgendaItem) => void;
  onRemindAtasan: (item: AgendaItem) => void;
  onOpenSinglePoster: (item: AgendaItem) => void;
  onOpenMasterModal: (unit?: MasterUnitItem) => void;
  onRequestDeleteMaster: (unit: MasterUnitItem) => void;
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

function getCategoryStyle(kategori: AgendaCategory) {
  switch (kategori) {
    case 'Kunjungan / Dinas':
      return {
        card: 'bg-orange-50/75 border-orange-300',
        chip: 'bg-orange-600 text-white',
        dot: 'bg-orange-500',
      };
    case 'Rapat Eksternal':
      return {
        card: 'bg-blue-50/75 border-blue-300',
        chip: 'bg-blue-600 text-white',
        dot: 'bg-blue-600',
      };
    case 'Undangan Resmi':
      return {
        card: 'bg-teal-50/75 border-teal-300',
        chip: 'bg-teal-600 text-white',
        dot: 'bg-teal-600',
      };
    case 'Rapat Internal':
      return {
        card: 'bg-indigo-50/75 border-indigo-300',
        chip: 'bg-indigo-600 text-white',
        dot: 'bg-indigo-600',
      };
    default:
      return {
        card: 'bg-amber-50/75 border-amber-300',
        chip: 'bg-amber-600 text-white',
        dot: 'bg-amber-500',
      };
  }
}

function shiftMonthYM(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

const SIDOARJO_LOGO_SRC = '/assets/aistudio/Coat_of_Arms_of_Sidoarjo_Regency__2__55bcc6f5.png';
const BPBD_LOGO_SRC = '/assets/aistudio/images__14__e7f780c6.jpeg';

const cachedLogoDataUrls: { sidoarjo?: string; bpbd?: string } = {};

function imageToPngDataUrl(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 240;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        const scale = Math.min((size - 20) / img.width, (size - 20) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function ensureLogosLoaded() {
  if (!cachedLogoDataUrls.sidoarjo) {
    const s = await imageToPngDataUrl(SIDOARJO_LOGO_SRC);
    if (s) cachedLogoDataUrls.sidoarjo = s;
  }
  if (!cachedLogoDataUrls.bpbd) {
    const b = await imageToPngDataUrl(BPBD_LOGO_SRC);
    if (b) cachedLogoDataUrls.bpbd = b;
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  activeView,
  role,
  visibleAgendas,
  masterUnits,
  selectedDate,
  onChangeDate,
  selectedMonth,
  onChangeMonth,
  onOpenNewAgenda,
  onOpenEditAgenda,
  onRequestDeleteAgenda,
  onToggleStatus,
  onRemindAtasan,
  onOpenSinglePoster,
  onOpenMasterModal,
  onRequestDeleteMaster,
  onNotify,
}) => {
  const perms = useMemo(() => getPermissions(role), [role]);
  const todayISO = useMemo(() => getLocalISODate(), []);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Dashboard filters (no conflict filter)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState<'Semua' | AgendaCategory>('Semua');
  const [filterStatus, setFilterStatus] = useState<'Semua' | AgendaStatus>('Semua');

  // Kalender toggle
  const [calendarMode, setCalendarMode] = useState<'harian' | 'bulanan'>('harian');

  // Rekap multi-scope (Harian / Bulanan / Tahunan)
  const [rekapScope, setRekapScope] = useState<RekapScope>('harian');
  const [selectedYear, setSelectedYear] = useState<string>(() => selectedDate.slice(0, 4));
  const [rekapPicFilter, setRekapPicFilter] = useState('Semua');
  const [rekapStatusFilter, setRekapStatusFilter] = useState<'Semua' | AgendaStatus>('Semua');
  const [rekapCatFilter, setRekapCatFilter] = useState<'Semua' | AgendaCategory>('Semua');

  // Master Unit search/filter
  const [masterSearch, setMasterSearch] = useState('');
  const [masterTypeFilter, setMasterTypeFilter] = useState<'Semua' | MasterUnitItem['tipe']>('Semua');

  // Compact list -> click to view Detail Agenda modal
  const [detailAgendaId, setDetailAgendaId] = useState<string | null>(null);
  const activeDetailAgenda = useMemo(
    () => (detailAgendaId ? visibleAgendas.find((a) => a.id === detailAgendaId) || null : null),
    [detailAgendaId, visibleAgendas]
  );

  // Preload official Sidoarjo & BPBD logos so PDF downloads immediately on click
  useEffect(() => {
    void ensureLogosLoaded();
  }, []);

  // Selected day agendas
  const dayAgendasAll = useMemo(() => {
    return visibleAgendas
      .filter((a) => a.tanggal === selectedDate)
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
  }, [visibleAgendas, selectedDate]);

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

  const monthActiveCount = useMemo(
    () => monthAgendas.filter((a) => a.status !== 'Dibatalkan').length,
    [monthAgendas]
  );

  const monthCompletedCount = useMemo(
    () => monthAgendas.filter((a) => a.status === 'Selesai').length,
    [monthAgendas]
  );

  // 7-day activity chart around selectedDate
  const sevenDaySeries = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO(selectedDate, i - 3);
      const [y, m, d] = iso.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const items = visibleAgendas.filter((a) => a.tanggal === iso && a.status !== 'Dibatalkan');
      const completed = items.filter((a) => a.status === 'Selesai').length;
      return {
        iso,
        label: `${String(d).padStart(2, '0')} ${BULAN_ID[m - 1].slice(0, 3)}`,
        hari: HARI_ID[dt.getDay()].slice(0, 3),
        total: items.length,
        completed,
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
      if (filterStatus !== 'Semua' && item.status !== filterStatus) return false;
      if (q) {
        const hay = `${item.judul} ${item.lokasi} ${item.penyelenggara} ${item.pejabatPendamping}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dayAgendasAll, filterCat, filterStatus, searchQuery]);

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
      return {
        iso,
        hari: HARI_ID[dayDt.getDay()],
        tglSingkat: formatTanggalPendek(iso),
        count: items.length,
        isWeekend: dayDt.getDay() === 0 || dayDt.getDay() === 6,
      };
    });
  }, [selectedDate, visibleAgendas]);

  // Month calendar grid cells (Monday-first)
  const monthCells = useMemo(() => {
    const firstDay = new Date(curYear || 2026, (curMonth || 1) - 1, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalDays = new Date(curYear || 2026, curMonth || 1, 0).getDate();
    const cells: Array<{
      iso: string | null;
      day: number | null;
      items: AgendaItem[];
      isWeekend: boolean;
    }> = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ iso: null, day: null, items: [], isWeekend: false });
    }
    for (let day = 1; day <= totalDays; day++) {
      const iso = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dt = new Date(curYear || 2026, (curMonth || 1) - 1, day);
      const items = visibleAgendas
        .filter((a) => a.tanggal === iso && a.status !== 'Dibatalkan')
        .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
      cells.push({
        iso,
        day,
        items,
        isWeekend: dt.getDay() === 0 || dt.getDay() === 6,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ iso: null, day: null, items: [], isWeekend: false });
    }
    return cells;
  }, [curYear, curMonth, visibleAgendas]);

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
    const aktif = rekapFiltered.filter((a) => a.status === 'Terjadwal').length;
    const updated = rekapFiltered.filter((a) => Boolean(a.isUpdated)).length;
    const selesai = rekapFiltered.filter((a) => a.status === 'Selesai').length;
    return { total, aktif, updated, selesai };
  }, [rekapFiltered]);

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

  const handleDownloadExcel = () => {
    try {
      const showDateCol = rekapScope !== 'harian';
      const header = [
        'No',
        ...(showDateCol ? ['Tanggal'] : []),
        'Waktu (WIB)',
        'Nama Kegiatan',
        'Lokasi',
        'Kategori',
        'Bidang / Penyelenggara',
        'PIC / Pendamping',
        'Status',
      ];

      const dataRows = rekapFiltered.map((item, idx) => [
        idx + 1,
        ...(showDateCol ? [formatTanggalPendek(item.tanggal)] : []),
        formatRentangWaktu(item),
        item.judul,
        item.lokasi,
        item.kategori,
        item.penyelenggara,
        item.pejabatPendamping || '-',
        item.status,
      ]);

      const sheetData: (string | number)[][] = [
        ['PEMERINTAH KABUPATEN SIDOARJO'],
        [`LAPORAN REKAPITULASI AGENDA (${rekapScope.toUpperCase()}) - BPBD KABUPATEN SIDOARJO`],
        [`Periode: ${rekapPeriodTitle} | Total Agenda: ${rekapStats.total}`],
        [],
        header,
        ...(dataRows.length > 0
          ? dataRows
          : [['-', ...(showDateCol ? ['-'] : []), '-', 'Tidak ada agenda pada periode ini.']]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws['!cols'] = [
        { wch: 5 },
        ...(showDateCol ? [{ wch: 15 }] : []),
        { wch: 19 },
        { wch: 42 },
        { wch: 30 },
        { wch: 20 },
        { wch: 26 },
        { wch: 24 },
        { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap Agenda');

      const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      triggerBlobDownload(blob, `Rekap_Agenda_BPBD_${rekapFilenameKey}.xlsx`);
      onNotify(`Mengunduh Excel (.xlsx) rekap ${rekapScope}...`, 'success');
    } catch {
      onNotify('Gagal membuat file Excel. Silakan coba lagi.', 'warning');
    }
  };

  const handleDownloadPdfPrint = async () => {
    try {
      await ensureLogosLoaded();
      const showDateCol = rekapScope !== 'harian';
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // Kop Surat Resmi BPBD Kab. Sidoarjo dengan Logo Sidoarjo (kiri) & Logo BPBD (kanan)
      doc.setFillColor(4, 42, 32);
      doc.roundedRect(14, 11, 269, 26, 2, 2, 'F');

      if (cachedLogoDataUrls.sidoarjo) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(18, 14, 20, 20, 2, 2, 'F');
        doc.addImage(cachedLogoDataUrls.sidoarjo, 'PNG', 19, 15, 18, 18);
      }

      if (cachedLogoDataUrls.bpbd) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(259, 14, 20, 20, 2, 2, 'F');
        doc.addImage(cachedLogoDataUrls.bpbd, 'PNG', 260, 15, 18, 18);
      }

      const centerX = 148.5;
      doc.setTextColor(167, 243, 208);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('PEMERINTAH KABUPATEN SIDOARJO', centerX, 18.5, { align: 'center' });

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14.5);
      doc.text('BADAN PENANGGULANGAN BENCANA DAERAH (BPBD)', centerX, 25.5, {
        align: 'center',
      });

      doc.setTextColor(209, 250, 229);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        'Jl. Sultan Agung No. 19, Gajah Timur, Magersari, Kec. Sidoarjo, Kabupaten Sidoarjo, Jawa Timur 61212',
        centerX,
        31.5,
        { align: 'center' }
      );

      // Info Periode
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(
        `Laporan Rekapitulasi Agenda (${rekapScope.toUpperCase()}) - ${rekapPeriodTitle}`,
        14,
        45
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Total: ${rekapStats.total} agenda  |  Terjadwal: ${rekapStats.aktif}  |  Selesai: ${rekapStats.selesai}`,
        14,
        50.5
      );

      const headRow = [
        'No',
        ...(showDateCol ? ['Tanggal'] : []),
        'Waktu (WIB)',
        'Nama Kegiatan',
        'Lokasi',
        'Bidang',
        'PIC / Pendamping',
        'Status',
      ];

      const bodyRows =
        rekapFiltered.length === 0
          ? [
              [
                '-',
                ...(showDateCol ? ['-'] : []),
                '-',
                'Tidak ada agenda pada periode ini.',
                '-',
                '-',
                '-',
                '-',
              ],
            ]
          : rekapFiltered.map((item, idx) => [
              String(idx + 1),
              ...(showDateCol ? [formatTanggalPendek(item.tanggal)] : []),
              formatRentangWaktu(item),
              item.catatan ? `${item.judul}\nCatatan: ${item.catatan}` : item.judul,
              item.lokasi,
              item.penyelenggara,
              item.pejabatPendamping || '-',
              item.status,
            ]);

      autoTable(doc, {
        head: [headRow],
        body: bodyRows,
        startY: 55,
        margin: { left: 14, right: 14, bottom: 14 },
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          cellPadding: 2.8,
          textColor: [15, 23, 42],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          valign: 'top',
        },
        headStyles: {
          fillColor: [6, 78, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
        },
        alternateRowStyles: {
          fillColor: [242, 247, 244],
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
        },
      });

      const pdfBlob = doc.output('blob');
      triggerBlobDownload(pdfBlob, `Rekap_Agenda_BPBD_${rekapFilenameKey}.pdf`);
      onNotify(`Mengunduh PDF (.pdf) rekap ${rekapScope}...`, 'success');
    } catch {
      onNotify('Gagal membuat file PDF. Silakan coba lagi.', 'warning');
    }
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
  // VIEW 1: DASHBOARD AGENDA (Colorful Executive UI, Zero Conflict Clutter)
  // =========================================================================
  if (activeView === 'dashboard') {
    return (
      <div className="space-y-6">
        {/* Executive Hero Summary Card */}
        <section className="rounded-2xl border border-emerald-200/80 bg-white p-5 sm:p-6 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            <div className="lg:col-span-7 space-y-3">
              <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-800">
                <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                <span>Monitoring {activeMonthLabel} · BPBD Kab. Sidoarjo</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Ringkasan eksekutif agenda kegiatan, ekstraksi e-Buddy, dan rekap harian.
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                Dashboard terpadu untuk memantau agenda harian pimpinan dan bidang, serta menyiapkan laporan resmi dan kartu broadcast WhatsApp.
              </p>
            </div>

            <div className="lg:col-span-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5">
                <p className="text-xs font-medium text-slate-500">Periode Aktif</p>
                <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                  {monthStartLabel} - {monthEndLabel}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5">
                <p className="text-xs font-medium text-slate-500">Agenda Selesai (Bulan)</p>
                <p className="mt-1 text-sm font-bold text-emerald-700 tabular-nums">
                  {monthCompletedCount} Kegiatan
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5">
                <p className="text-xs font-medium text-slate-500">Agenda Hari Ini</p>
                <p className="mt-1 text-sm font-bold text-emerald-800 tabular-nums">
                  {dayActiveAgendas.length} Kegiatan
                </p>
              </div>
              <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-3.5">
                <p className="text-xs font-medium text-slate-500">Total Agenda Bulan Ini</p>
                <p className="mt-1 text-sm font-bold text-teal-700 tabular-nums">
                  {monthActiveCount} Kegiatan
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 2 Vibrant Emerald-Harmonized KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-[#043927] to-[#065F46] p-5 text-white shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                  TOTAL AGENDA HARI INI
                </p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">
                  {dayActiveAgendas.length}
                </p>
                <p className="mt-1 text-xs font-medium text-emerald-100">
                  {formatTanggalPendek(selectedDate)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="mt-4 pt-3 border-t border-white/15 text-xs text-emerald-50/90">
              Akumulasi jadwal aktif non-batal pada tanggal terpilih.
            </p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-[#C2410C] via-[#EA580C] to-[#F97316] p-5 text-white shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-orange-100">
                  TOTAL AGENDA BULAN INI
                </p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">
                  {monthActiveCount}
                </p>
                <p className="mt-1 text-xs font-medium text-orange-100">
                  {activeMonthLabel}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="mt-4 pt-3 border-t border-white/15 text-xs text-orange-50">
              {monthCompletedCount} selesai terlaksana sepanjang bulan berjalan.
            </p>
          </div>
        </section>

        {/* 2-Column Analytics Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-2xl border border-emerald-200/70 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-700" />
                  Aktivitas Agenda 7 Hari Sekitar Tanggal Terpilih
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Perbandingan total jadwal aktif dan agenda selesai per hari.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#065F46] inline-block" />
                  Total Agenda
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                  Selesai
                </span>
              </div>
            </div>

            <div className="h-52 flex items-end gap-2 sm:gap-4 pt-4 pb-2 border-b border-slate-100">
              {sevenDaySeries.map((point) => {
                const isSelected = point.iso === selectedDate;
                const totalPct = Math.round((point.total / maxChartVal) * 100);
                const compPct = Math.round((point.completed / maxChartVal) * 100);
                return (
                  <button
                    key={point.iso}
                    type="button"
                    onClick={() => onChangeDate(point.iso)}
                    className={`flex-1 h-full flex flex-col justify-end items-center rounded-xl px-1.5 py-2 transition ${
                      isSelected ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-[11px] font-bold text-slate-700 tabular-nums mb-1.5">
                      {point.total}
                    </span>
                    <div className="w-full max-w-[44px] h-32 flex items-end justify-center gap-1">
                      <div
                        className="w-4 rounded-t-md bg-[#065F46] transition-all"
                        style={{ height: `${Math.max(point.total > 0 ? 12 : 4, totalPct)}%` }}
                      />
                      <div
                        className="w-4 rounded-t-md bg-emerald-400 transition-all"
                        style={{ height: `${Math.max(point.completed > 0 ? 12 : 4, compPct)}%` }}
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
                      point.iso === selectedDate ? 'text-emerald-700' : 'text-slate-700'
                    }`}
                  >
                    {point.hari}
                  </div>
                  <div className="text-slate-500">{point.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-emerald-200/70 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Top Bidang / Penyelenggara</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Distribusi volume kegiatan aktif berdasarkan unit pengampu.
                  </p>
                </div>
                <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-800 shrink-0">
                  Top {topBidangRanking.list.length}
                </span>
              </div>

              <div className="space-y-3.5">
                {topBidangRanking.list.map((row, idx) => {
                  const pct = Math.round((row.count / topBidangRanking.maxCount) * 100);
                  const barColors = [
                    'bg-[#064E3B]',
                    'bg-emerald-600',
                    'bg-teal-600',
                    'bg-amber-500',
                    'bg-lime-600',
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

        {/* Daily Agenda Control Bar & List (Search + Category + Status, No Conflict Filter) */}
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
                placeholder="Cari kegiatan, lokasi, bidang, atau PIC..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-700"
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
            <div className="md:col-span-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'Semua' | AgendaStatus)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white text-slate-800"
              >
                <option value="Semua">Semua Status</option>
                <option value="Terjadwal">Terjadwal</option>
                <option value="Draft">Draft</option>
                <option value="Selesai">Selesai</option>
                <option value="Dibatalkan">Dibatalkan</option>
              </select>
            </div>
          </div>

          {filteredDayAgendas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 p-10 text-center">
              <Calendar className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                Tidak ada agenda yang sesuai filter pada {formatTanggalPendek(selectedDate)}.
              </p>
              {perms.canCreateAgenda && (
                <button
                  type="button"
                  onClick={() => onOpenNewAgenda({ tanggal: selectedDate })}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#064E3B] text-white text-xs font-semibold hover:bg-[#043927]"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Agenda di Tanggal Ini
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
              {filteredDayAgendas.map((item) => {
                const catSt = getCategoryStyle(item.kategori);
                const dueSoon = isAgendaDueSoonWIB(item, nowMs);
                const waUrl = buildAtasanReminderWhatsAppUrl(item);
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailAgendaId(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailAgendaId(item.id);
                      }
                    }}
                    className={`w-full text-left px-3.5 py-3 hover:bg-emerald-50/45 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
                      dueSoon ? 'bg-orange-50/55 border-l-4 border-l-red-500' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${catSt.dot}`} />
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#064E3B] text-white px-2 py-0.5 text-[11px] font-bold font-mono tabular-nums">
                          {formatRentangWaktu(item)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${statusColorClass(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>
                        {dueSoon && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-orange-600 to-red-600 text-white px-2 py-0.5 text-[10px] font-extrabold shadow-xs animate-pulse">
                            ⏰ 1 Jam Lagi - Segera Ingatkan Atasan
                          </span>
                        )}
                        {item.isUpdated && (
                          <span className="inline-flex items-center rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-bold">
                            BARU
                          </span>
                        )}
                        {item.isConfidential && (
                          <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 leading-snug line-clamp-1">
                        {item.judul}
                      </h4>

                      <p className="text-xs text-slate-500 truncate">
                        {item.lokasi} &middot; PIC: {item.pejabatPendamping || item.penyelenggara}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemindAtasan(item);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition shadow-2xs ${
                          item.sudahDiingatkan
                            ? 'bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{item.sudahDiingatkan ? '✓ Sudah Diingatkan' : 'Ingatkan Atasan (WA)'}</span>
                      </a>

                      <div className="flex items-center gap-1 text-emerald-700">
                        <span className="hidden md:inline text-[11px] font-bold">Detail</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* POP-UP DETAIL AGENDA SAAT DIKLIK */}
        {activeDetailAgenda && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
            onClick={() => setDetailAgendaId(null)}
          >
            <div
              className="w-full max-w-lg max-h-[88vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-emerald-200 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 bg-gradient-to-r from-[#03241A] via-[#064E3B] to-[#047857] text-white flex items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-bold font-mono text-amber-300">
                      <Clock className="w-3 h-3" />
                      {formatRentangWaktu(activeDetailAgenda)}
                    </span>
                    <span className="text-[11px] text-emerald-100">
                      ({formatDurasi(activeDetailAgenda.jamMulai, activeDetailAgenda.jamSelesai, activeDetailAgenda.sampaiSelesai)})
                    </span>
                    <span className="rounded bg-emerald-400/20 border border-emerald-300/30 px-2 py-0.5 text-[10px] font-bold text-white">
                      {activeDetailAgenda.kategori}
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold leading-snug">
                    {activeDetailAgenda.judul}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailAgendaId(null)}
                  className="p-1.5 rounded-lg text-emerald-100 hover:bg-white/10 hover:text-white shrink-0"
                  aria-label="Tutup detail agenda"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${statusColorClass(
                      activeDetailAgenda.status
                    )}`}
                  >
                    Status: {activeDetailAgenda.status}
                  </span>
                  {isAgendaDueSoonWIB(activeDetailAgenda, nowMs) && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-orange-600 to-red-600 text-white px-2.5 py-0.5 text-[11px] font-extrabold shadow-xs">
                      ⏰ 1 Jam Lagi - Segera Ingatkan Atasan
                    </span>
                  )}
                  {activeDetailAgenda.isUpdated && (
                    <span className="inline-flex items-center rounded-md bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-bold">
                      UPDATE / BARU
                    </span>
                  )}
                  {activeDetailAgenda.isConfidential && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 text-amber-300 px-2 py-0.5 text-[10px] font-bold">
                      <Lock className="w-3 h-3" />
                      TERBATAS
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-slate-500 font-medium">Tanggal</p>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {formatTanggalLengkap(activeDetailAgenda.tanggal)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-slate-500 font-medium">Lokasi / Tempat</p>
                    <p className="font-bold text-slate-900 mt-0.5 flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
                      <span>{activeDetailAgenda.lokasi}</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-slate-500 font-medium">Bidang / Penyelenggara</p>
                    <p className="font-bold text-slate-900 mt-0.5 flex items-start gap-1">
                      <Building2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                      <span>{activeDetailAgenda.penyelenggara}</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-slate-500 font-medium">PIC / Pendamping</p>
                    <p className="font-bold text-slate-900 mt-0.5 flex items-start gap-1">
                      <Users className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                      <span>{activeDetailAgenda.pejabatPendamping || '-'}</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-slate-500 font-medium">Pakaian / Seragam</p>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {activeDetailAgenda.pakaian || '-'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-slate-500 font-medium">Nomor WhatsApp Atasan</p>
                    <p className="font-bold text-slate-900 font-mono mt-0.5">
                      {activeDetailAgenda.noWaAtasan || 'Belum diisi (pilih kontak di WA)'}
                    </p>
                  </div>
                </div>

                {activeDetailAgenda.zoomUrl && (
                  <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-3 text-xs">
                    <p className="font-bold text-blue-900 mb-1 flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5" />
                      Tautan Rapat Daring (Zoom)
                    </p>
                    <a
                      href={activeDetailAgenda.zoomUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 underline break-all font-medium"
                    >
                      {activeDetailAgenda.zoomUrl}
                    </a>
                  </div>
                )}

                {activeDetailAgenda.catatan && (
                  <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-3 text-xs">
                    <p className="font-bold text-amber-900 mb-0.5">Catatan / Arahan</p>
                    <p className="text-slate-700 leading-relaxed">{activeDetailAgenda.catatan}</p>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <a
                    href={buildAtasanReminderWhatsAppUrl(activeDetailAgenda)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onRemindAtasan(activeDetailAgenda)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-2xs ${
                      activeDetailAgenda.sudahDiingatkan
                        ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>
                      {activeDetailAgenda.sudahDiingatkan
                        ? '✓ Sudah Diingatkan'
                        : 'Ingatkan Atasan (WA)'}
                    </span>
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard?.writeText(
                          buildSingleAgendaText(activeDetailAgenda)
                        );
                        onNotify('Teks agenda disalin ke clipboard.', 'success');
                      } catch {
                        onNotify('Gagal menyalin teks agenda.', 'warning');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Salin Teks
                  </button>
                  {perms.canOpenCardStudio && (
                    <button
                      type="button"
                      onClick={() => {
                        setDetailAgendaId(null);
                        onOpenSinglePoster(activeDetailAgenda);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 text-xs font-bold text-orange-800"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      Kartu WA
                    </button>
                  )}
                  {perms.canEditAgenda && (
                    <button
                      type="button"
                      onClick={() => {
                        setDetailAgendaId(null);
                        onOpenEditAgenda(activeDetailAgenda);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                      Edit
                    </button>
                  )}
                  {perms.canEditAgenda && activeDetailAgenda.status !== 'Dibatalkan' && (
                    <button
                      type="button"
                      onClick={() => onToggleStatus(activeDetailAgenda)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700"
                    >
                      {activeDetailAgenda.status === 'Selesai' ? 'Buka Lagi' : 'Tandai Selesai'}
                    </button>
                  )}
                  {perms.canDeleteAgenda(activeDetailAgenda) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDetailAgendaId(null);
                        onRequestDeleteAgenda(activeDetailAgenda);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: KALENDER & LINIMASA WIB (Colorful & Clean, No Concurrent Alerts)
  // =========================================================================
  if (activeView === 'kalender') {
    return (
      <div className="space-y-5">
        {/* Vibrant Emerald Gradient Calendar Header Card */}
        <div className="rounded-2xl bg-gradient-to-r from-[#03241A] via-[#064E3B] to-[#0D9488] text-white p-5 sm:p-6 shadow-sm">
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
              <p className="text-xs text-emerald-100 mt-1 max-w-xl">
                Agenda berkategori tampil berwarna sesuai jenis kegiatan untuk memudahkan pemantauan jadwal harian maupun bulanan.
              </p>
            </div>

            <div className="inline-flex rounded-xl bg-white/12 p-1 border border-white/15 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setCalendarMode('harian')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                  calendarMode === 'harian'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-emerald-100 hover:text-white'
                }`}
              >
                Linimasa WIB
              </button>
              <button
                type="button"
                onClick={() => setCalendarMode('bulanan')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                  calendarMode === 'bulanan'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-emerald-100 hover:text-white'
                }`}
              >
                Kalender Bulanan
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center gap-3 text-[11px] font-semibold">
            {CATEGORIES.map((cat) => {
              const st = getCategoryStyle(cat);
              return (
                <span key={cat} className="inline-flex items-center gap-1.5 text-emerald-50">
                  <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                  {cat}
                </span>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200/70 bg-white p-5 shadow-sm space-y-4">
          {calendarMode === 'harian' ? (
            <>
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
                    className="px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold text-emerald-800"
                  >
                    Hari Ini
                  </button>
                </div>
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
                          ? 'bg-gradient-to-br from-[#042A20] to-[#047857] border-emerald-700 text-white shadow-md ring-2 ring-emerald-300'
                          : wd.count > 0
                          ? 'bg-gradient-to-br from-emerald-50/80 to-teal-50/70 border-emerald-200 text-slate-900 hover:border-emerald-300'
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
                                : 'bg-emerald-700 text-white'
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
                              : wd.count > 0
                              ? 'bg-emerald-700 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {wd.count} agenda
                        </span>
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

                  return (
                    <div
                      key={hour}
                      className={`rounded-xl border p-3.5 transition ${
                        activeInSlot.length > 0
                          ? 'border-emerald-200 bg-emerald-50/35'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-extrabold text-slate-800">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              activeInSlot.length > 0 ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                          />
                          {slotLabel}
                        </span>
                        <div className="flex items-center gap-2">
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
                              className="text-[11px] font-bold text-emerald-700 hover:underline"
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
                            const dueSoon = isAgendaDueSoonWIB(item, nowMs);
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
                                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusColorClass(
                                      item.status
                                    )}`}
                                  >
                                    {item.status}
                                  </span>
                                </div>
                                {dueSoon && (
                                  <div className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-orange-600 to-red-600 text-white px-2 py-0.5 text-[10px] font-extrabold">
                                    ⏰ 1 Jam Lagi - Segera Ingatkan Atasan
                                  </div>
                                )}
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
                                  <a
                                    href={buildAtasanReminderWhatsAppUrl(item)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => onRemindAtasan(item)}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition ${
                                      item.sudahDiingatkan
                                        ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                                        : 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                                    }`}
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                    <span>
                                      {item.sudahDiingatkan
                                        ? '✓ Sudah Diingatkan'
                                        : 'Ingatkan Atasan (WA)'}
                                    </span>
                                  </a>
                                  {perms.canEditAgenda && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenEditAgenda(item)}
                                      className="px-2 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-700"
                                    >
                                      Edit
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
                  <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Total {activeMonthLabel}: {monthAgendas.length} agenda
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-extrabold text-white">
                {HARI_SINGKAT_SENIN.map((d, idx) => (
                  <div
                    key={d}
                    className={`py-2 rounded-lg ${
                      idx >= 5 ? 'bg-amber-600' : 'bg-[#042A20]'
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
                          ? 'border-emerald-600 bg-emerald-50/85 ring-2 ring-emerald-500 shadow-xs'
                          : cell.isWeekend
                          ? 'border-slate-200 bg-amber-50/25 hover:border-amber-300'
                          : 'border-slate-200 bg-white hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-extrabold tabular-nums w-6 h-6 rounded-full inline-flex items-center justify-center ${
                            isToday
                              ? 'bg-amber-500 text-slate-950'
                              : isSel
                              ? 'bg-[#042A20] text-white'
                              : 'text-slate-800'
                          }`}
                        >
                          {cell.day}
                        </span>
                        {cell.items.length > 0 && (
                          <span className="rounded-md bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-bold">
                            {cell.items.length}
                          </span>
                        )}
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
                      className="px-3 py-1.5 rounded-lg bg-[#042A20] text-white text-xs font-bold"
                    >
                      Buka Linimasa WIB
                    </button>
                    {perms.canCreateAgenda && (
                      <button
                        type="button"
                        onClick={() => onOpenNewAgenda({ tanggal: selectedDate })}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold"
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
                      const dueSoon = isAgendaDueSoonWIB(item, nowMs);
                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3 flex flex-col justify-between gap-2 ${catSt.card}`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-block font-mono text-[10px] font-bold px-2 py-0.5 rounded ${catSt.chip}`}
                              >
                                {formatRentangWaktu(item)}
                              </span>
                              {dueSoon && (
                                <span className="inline-flex items-center gap-1 rounded bg-gradient-to-r from-orange-600 to-red-600 text-white px-1.5 py-0.5 text-[10px] font-extrabold">
                                  ⏰ 1 Jam Lagi - Segera Ingatkan Atasan
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-extrabold text-slate-900 line-clamp-2">
                              {item.judul}
                            </p>
                            <p className="text-[11px] text-slate-700 truncate">
                              📍 {item.lokasi} · 👤 {item.pejabatPendamping || item.penyelenggara}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <a
                              href={buildAtasanReminderWhatsAppUrl(item)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => onRemindAtasan(item)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                                item.sudahDiingatkan
                                  ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                                  : 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                              }`}
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>
                                {item.sudahDiingatkan ? '✓ Sudah Diingatkan' : 'Ingatkan Atasan (WA)'}
                              </span>
                            </a>
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
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <img
                  src={SIDOARJO_LOGO_SRC}
                  alt="Logo Kabupaten Sidoarjo"
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 object-contain rounded-lg border border-slate-200 bg-white p-1"
                />
                <img
                  src={BPBD_LOGO_SRC}
                  alt="Logo BPBD Kabupaten Sidoarjo"
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 object-cover rounded-lg border border-slate-200 bg-white p-0.5"
                />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Pemerintah Kabupaten Sidoarjo
                  </p>
                  <p className="text-xs font-extrabold text-slate-800">
                    BPBD Kabupaten Sidoarjo
                  </p>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                Rekap Agenda (Harian, Bulanan &amp; Tahunan)
              </h2>
              <p className="text-sm text-slate-600">
                Pilih rentang rekap per hari, bulan, atau tahun, lalu unduh langsung sebagai Excel (.xlsx) atau PDF (.pdf).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Download Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPdfPrint}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#042A20] hover:bg-[#064E3B] text-white text-sm font-semibold shadow-xs cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Download PDF (.pdf)</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setRekapScope('harian')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  rekapScope === 'harian'
                    ? 'bg-[#042A20] text-white shadow-xs'
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
                    ? 'bg-emerald-700 text-white shadow-xs'
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
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Tahun
              </button>
            </div>

            <span className="text-xs font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              Periode Laporan: {rekapPeriodTitle}
            </span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
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

            <div className="flex flex-wrap items-center justify-end gap-2">
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
                className="text-xs font-bold text-emerald-700 hover:underline"
              >
                Reset ke Periode Sekarang
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Total Agenda Laporan</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">
                {rekapStats.total}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Agenda Terjadwal</p>
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
              <p className="text-xs font-medium text-slate-500">Agenda Selesai</p>
              <p className="mt-2 text-2xl font-extrabold text-teal-700 tabular-nums">
                {rekapStats.selesai}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#042A20] text-white text-xs uppercase tracking-wider">
                  <th className="py-3 px-3.5">No</th>
                  {showDateColumn && <th className="py-3 px-3.5 whitespace-nowrap">Tanggal</th>}
                  <th className="py-3 px-3.5 whitespace-nowrap">Waktu (WIB)</th>
                  <th className="py-3 px-3.5">Kegiatan &amp; Lokasi</th>
                  <th className="py-3 px-3.5">Bidang / PIC</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rekapFiltered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={showDateColumn ? 7 : 6}
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
                        {isAgendaDueSoonWIB(item, nowMs) && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded bg-gradient-to-r from-orange-600 to-red-600 text-white px-2 py-0.5 text-[10px] font-extrabold">
                            ⏰ 1 Jam Lagi - Segera Ingatkan Atasan
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-xs">
                        <div className="font-semibold text-slate-800">{item.penyelenggara}</div>
                        <div className="text-slate-500">{item.pejabatPendamping || '-'}</div>
                      </td>
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
                        <a
                          href={buildAtasanReminderWhatsAppUrl(item)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => onRemindAtasan(item)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition ${
                            item.sudahDiingatkan
                              ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                              : 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                          }`}
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>
                            {item.sudahDiingatkan ? '✓ Sudah Diingatkan' : 'Ingatkan Atasan (WA)'}
                          </span>
                        </a>
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
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
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
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#042A20] hover:bg-[#064E3B] text-white text-sm font-semibold shrink-0"
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
