import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  ClipboardPaste,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { DashboardView } from './DashboardView';
import {
  buildWhatsAppCaption,
  copyPosterToClipboard,
  downloadPosterFile,
  renderBroadcastPosterCanvas,
} from './posterCanvas';
import {
  AUDIT_STORAGE_KEY,
  ActiveView,
  AgendaCategory,
  AgendaItem,
  AgendaStatus,
  AuditLogEntry,
  AuthSession,
  CATEGORIES,
  CardMode,
  CardTheme,
  DISPOSISI_STATUSES,
  DisposisiStatus,
  LOCKOUT_DURATION_MS,
  LOCKOUT_STORAGE_KEY,
  MASTER_STORAGE_KEY,
  MAX_FAILED_ATTEMPTS,
  MasterUnitItem,
  ORG_TITLE_KEY,
  ROLE_META,
  RoleCode,
  SESSION_DURATION_MS,
  SESSION_LOCAL_KEY,
  SESSION_TEMP_KEY,
  STORAGE_KEY,
  USERS_STORAGE_KEY,
  UserAccount,
  createInitialAgendas,
  createInitialMasterUnits,
  createInitialUsers,
  extractEBuddyText,
  findNextAvailableSlot,
  formatRentangWaktu,
  formatTanggalLengkap,
  getConflictsForCandidate,
  getEBuddyTemplates,
  getLocalISODate,
  getPermissions,
  minutesToTime,
  timeToMinutes,
} from './types';

const SIDOARJO_LOGO = '/assets/aistudio/Coat_of_Arms_of_Sidoarjo_Regency__2__55bcc6f5.png';
const BPBD_LOGO = '/assets/aistudio/images__14__e7f780c6.jpeg';

interface ToastMessage {
  id: string;
  text: string;
  tone: 'success' | 'warning' | 'info';
}

interface AgendaFormState {
  id?: string;
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
  status: AgendaStatus;
  statusDisposisi: DisposisiStatus;
  pejabatPendamping: string;
  isConfidential: boolean;
  isUpdated: boolean;
  zoomUrl: string;
  catatan: string;
  sumber: 'Manual' | 'e-Buddy';
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const todayISO = useMemo(() => getLocalISODate(), []);

  // Persistent States
  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = safeParseJson<UserAccount[] | null>(
      localStorage.getItem(USERS_STORAGE_KEY),
      null
    );
    return saved && saved.length > 0 ? saved : createInitialUsers();
  });

  const [agendas, setAgendas] = useState<AgendaItem[]>(() => {
    const saved = safeParseJson<AgendaItem[] | null>(localStorage.getItem(STORAGE_KEY), null);
    return saved && saved.length > 0 ? saved : createInitialAgendas();
  });

  const [masterUnits, setMasterUnits] = useState<MasterUnitItem[]>(() => {
    const saved = safeParseJson<MasterUnitItem[] | null>(
      localStorage.getItem(MASTER_STORAGE_KEY),
      null
    );
    return saved && saved.length > 0 ? saved : createInitialMasterUnits();
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    return safeParseJson<AuditLogEntry[]>(localStorage.getItem(AUDIT_STORAGE_KEY), []);
  });

  const [orgTitle, setOrgTitle] = useState<string>(() => {
    return localStorage.getItem(ORG_TITLE_KEY) || 'BPBD KAB. SIDOARJO';
  });

  // Session restore
  const [session, setSession] = useState<AuthSession | null>(() => {
    const localSess = safeParseJson<AuthSession | null>(
      localStorage.getItem(SESSION_LOCAL_KEY),
      null
    );
    const tempSess = safeParseJson<AuthSession | null>(
      sessionStorage.getItem(SESSION_TEMP_KEY),
      null
    );
    const candidate = localSess || tempSess;
    if (candidate && candidate.expiresAt > Date.now()) {
      return candidate;
    }
    localStorage.removeItem(SESSION_LOCAL_KEY);
    sessionStorage.removeItem(SESSION_TEMP_KEY);
    return null;
  });

  const currentUser = useMemo(() => {
    if (!session) return null;
    return users.find((u) => u.id === session.userId && u.isActive) || null;
  }, [session, users]);

  // Persist changes
  useEffect(() => {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agendas));
  }, [agendas]);

  useEffect(() => {
    localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(masterUnits));
  }, [masterUnits]);

  useEffect(() => {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(ORG_TITLE_KEY, orgTitle);
  }, [orgTitle]);

  // Login State
  const [loginIdentity, setLoginIdentity] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);
  const [lockState, setLockState] = useState<{ failed: number; lockedUntil: number }>(() => {
    return safeParseJson(localStorage.getItem(LOCKOUT_STORAGE_KEY), {
      failed: 0,
      lockedUntil: 0,
    });
  });
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (lockState.lockedUntil > Date.now()) {
      const timer = setInterval(() => setNowTick(Date.now()), 1000);
      return () => clearInterval(timer);
    }
  }, [lockState.lockedUntil]);

  // App Shell & Navigation State
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [selectedMonth, setSelectedMonth] = useState<string>(todayISO.slice(0, 7));
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // e-Buddy extraction state
  const [ebuddyRawText, setEbuddyRawText] = useState('');
  const [ebuddyPreview, setEbuddyPreview] = useState<ReturnType<typeof extractEBuddyText> | null>(
    null
  );
  const ebuddyTemplates = useMemo(() => getEBuddyTemplates(todayISO), [todayISO]);

  // Broadcast WA Studio state
  const [cardTheme, setCardTheme] = useState<CardTheme>('bpbd');
  const [cardMode, setCardMode] = useState<CardMode>('harian');
  const [focusedAgenda, setFocusedAgenda] = useState<AgendaItem | null>(null);
  const [showUpdatedBadge, setShowUpdatedBadge] = useState(true);
  const [showConflictBadge, setShowConflictBadge] = useState(false);
  const [showZoomUrl, setShowZoomUrl] = useState(false);
  const [showIllustration, setShowIllustration] = useState(true);
  const [logoTick, setLogoTick] = useState(0);
  const posterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Modals State
  const [agendaModalOpen, setAgendaModalOpen] = useState(false);
  const [agendaForm, setAgendaForm] = useState<AgendaFormState | null>(null);

  const [disposisiTarget, setDisposisiTarget] = useState<AgendaItem | null>(null);
  const [dispStatus, setDispStatus] = useState<DisposisiStatus>('Disetujui Pimpinan');
  const [dispPendamping, setDispPendamping] = useState('');
  const [dispCatatan, setDispCatatan] = useState('');

  const [masterModalOpen, setMasterModalOpen] = useState(false);
  const [masterForm, setMasterForm] = useState<MasterUnitItem>({
    id: '',
    tipe: 'Unit / Bidang',
    kode: '',
    nama: '',
    keterangan: '',
  });

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState<UserAccount>({
    id: '',
    nip: '',
    username: '',
    email: '',
    password: '',
    namaLengkap: '',
    jabatan: '',
    bidang: 'Sekretariat BPBD',
    roleKode: 'ROLE_OPERATOR',
    isActive: true,
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Super Admin tab state
  const [adminTab, setAdminTab] = useState<'users' | 'audit'>('users');
  const [auditFilter, setAuditFilter] = useState<'ALL' | 'SUKSES' | 'GAGAL' | 'PERINGATAN'>('ALL');

  // Simultaneous-agenda (Bentrok Jam) Pop-Up Notification state
  const [conflictPopupOpen, setConflictPopupOpen] = useState(false);
  const autoShownDatesRef = useRef<Set<string>>(new Set());

  const notify = (text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  };

  const appendAudit = (
    eventType: string,
    status: AuditLogEntry['status'],
    detail: string,
    actor?: UserAccount | null
  ) => {
    const who = actor ?? currentUser;
    const entry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      nip: who?.nip || '-',
      nama: who?.namaLengkap || 'Tamu / Anonim',
      roleKode: who?.roleKode || 'GUEST',
      eventType,
      status,
      detail,
    };
    setAuditLogs((prev) => [entry, ...prev].slice(0, 300));
  };

  // Visibility filter based on confidentiality
  const role: RoleCode = currentUser?.roleKode || 'ROLE_PIMPINAN';
  const perms = useMemo(() => getPermissions(role), [role]);

  const visibleAgendas = useMemo(() => {
    if (perms.canAccessConfidential) return agendas;
    return agendas.filter((a) => !a.isConfidential);
  }, [agendas, perms.canAccessConfidential]);

  // Sidebar badge metrics
  const todayActiveCount = useMemo(() => {
    return visibleAgendas.filter(
      (a) => a.tanggal === selectedDate && a.status !== 'Dibatalkan'
    ).length;
  }, [visibleAgendas, selectedDate]);

  const simultaneousDayItems = useMemo(() => {
    const dayItems = visibleAgendas
      .filter((a) => a.tanggal === selectedDate && a.status !== 'Dibatalkan')
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
    return dayItems
      .map((item) => ({
        item,
        conflicts: getConflictsForCandidate(agendas, item),
      }))
      .filter((entry) => entry.conflicts.length > 0);
  }, [visibleAgendas, agendas, selectedDate]);

  const todayConflictCount = simultaneousDayItems.length;

  // Auto-open Pop-up Notifikasi Agenda Bersamaan when user enters a date with simultaneous agendas
  useEffect(() => {
    if (!currentUser) return;
    if (todayConflictCount > 0 && !autoShownDatesRef.current.has(selectedDate)) {
      autoShownDatesRef.current.add(selectedDate);
      setConflictPopupOpen(true);
    }
  }, [currentUser, selectedDate, todayConflictCount]);

  // Poster agendas list
  const posterAgendas = useMemo(() => {
    if (cardMode === 'bulanan') {
      return visibleAgendas
        .filter((a) => a.tanggal.startsWith(selectedMonth) && a.status !== 'Dibatalkan')
        .sort((a, b) =>
          a.tanggal === b.tanggal
            ? timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai)
            : a.tanggal.localeCompare(b.tanggal)
        );
    }
    return visibleAgendas
      .filter((a) => a.tanggal === selectedDate && a.status !== 'Dibatalkan')
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
  }, [visibleAgendas, cardMode, selectedMonth, selectedDate]);

  useEffect(() => {
    if (activeView !== 'broadcast_wa' || !posterCanvasRef.current) return;
    renderBroadcastPosterCanvas(
      posterCanvasRef.current,
      {
        agendas: posterAgendas,
        allAgendasForConflict: agendas,
        selectedDate,
        selectedMonth,
        cardMode,
        cardTheme,
        focusedAgenda,
        orgTitle,
        showUpdatedBadge,
        showConflictBadge,
        showZoomUrl,
        showIllustration,
      },
      () => setLogoTick((t) => t + 1)
    );
  }, [
    activeView,
    posterAgendas,
    agendas,
    selectedDate,
    selectedMonth,
    cardMode,
    cardTheme,
    focusedAgenda,
    orgTitle,
    showUpdatedBadge,
    showConflictBadge,
    showZoomUrl,
    showIllustration,
    logoTick,
  ]);

  // =========================================================================
  // AUTH HANDLERS
  // =========================================================================
  const remainingLockSeconds = Math.max(
    0,
    Math.ceil((lockState.lockedUntil - nowTick) / 1000)
  );

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (remainingLockSeconds > 0) {
      const m = Math.floor(remainingLockSeconds / 60);
      const s = remainingLockSeconds % 60;
      setLoginError(`Akun terkunci sementara. Coba lagi dalam ${m}m ${s}d.`);
      return;
    }

    const identity = loginIdentity.trim().toLowerCase();
    const pwd = loginPassword;
    if (!identity || !pwd) {
      setLoginError('Harap isi NIP / Username Kedinasan dan Kata Sandi.');
      return;
    }

    const matched = users.find(
      (u) =>
        u.nip.toLowerCase() === identity ||
        u.username.toLowerCase() === identity ||
        u.email.toLowerCase() === identity
    );

    if (!matched || matched.password !== pwd) {
      const nextFailed = lockState.failed + 1;
      const shouldLock = nextFailed >= MAX_FAILED_ATTEMPTS;
      const nextLockState = {
        failed: shouldLock ? 0 : nextFailed,
        lockedUntil: shouldLock ? Date.now() + LOCKOUT_DURATION_MS : 0,
      };
      setLockState(nextLockState);
      localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(nextLockState));
      appendAudit(
        'LOGIN_GAGAL',
        shouldLock ? 'PERINGATAN' : 'GAGAL',
        `Percobaan masuk gagal untuk "${loginIdentity.trim()}" (${nextFailed}/${MAX_FAILED_ATTEMPTS}).`,
        matched || null
      );
      setLoginError(
        shouldLock
          ? 'Terlalu banyak percobaan gagal (5x). Portal dikunci 15 menit demi keamanan.'
          : `NIP/Username atau Kata Sandi salah. Sisa percobaan: ${MAX_FAILED_ATTEMPTS - nextFailed}x.`
      );
      return;
    }

    if (!matched.isActive) {
      appendAudit(
        'LOGIN_NONAKTIF',
        'PERINGATAN',
        `Akun nonaktif (${matched.username}) mencoba masuk.`,
        matched
      );
      setLoginError('Akun ASN ini sedang dinonaktifkan oleh Super Admin.');
      return;
    }

    // Success
    const resetLock = { failed: 0, lockedUntil: 0 };
    setLockState(resetLock);
    localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(resetLock));

    const newSess: AuthSession = {
      userId: matched.id,
      remember: rememberSession,
      loginAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION_MS,
    };
    if (rememberSession) {
      localStorage.setItem(SESSION_LOCAL_KEY, JSON.stringify(newSess));
      sessionStorage.removeItem(SESSION_TEMP_KEY);
    } else {
      sessionStorage.setItem(SESSION_TEMP_KEY, JSON.stringify(newSess));
      localStorage.removeItem(SESSION_LOCAL_KEY);
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === matched.id ? { ...u, lastLogin: new Date().toISOString() } : u))
    );
    setSession(newSess);
    setActiveView('dashboard');
    setLoginPassword('');
    appendAudit(
      'LOGIN_SUKSES',
      'SUKSES',
      `Berhasil masuk sebagai ${ROLE_META[matched.roleKode].shortLabel}.`,
      matched
    );
    notify(`Selamat datang, ${matched.namaLengkap}`, 'success');
  };

  const handleLogout = () => {
    if (currentUser) {
      appendAudit('LOGOUT', 'SUKSES', 'Pengguna keluar dari sesi aktif.', currentUser);
    }
    localStorage.removeItem(SESSION_LOCAL_KEY);
    sessionStorage.removeItem(SESSION_TEMP_KEY);
    setSession(null);
    setMobileMenuOpen(false);
    setLoginError('');
  };

  // Click demo role -> ONLY fill credentials, do NOT auto-submit
  const handleFillDemoCredential = (u: UserAccount) => {
    setLoginIdentity(u.username);
    setLoginPassword(u.password);
    setLoginError('');
    notify(`Kredensial demo ${ROLE_META[u.roleKode].shortLabel} diisi. Klik tombol Masuk.`, 'info');
  };

  // =========================================================================
  // AGENDA CRUD HANDLERS
  // =========================================================================
  const openNewAgendaModal = (preset?: Partial<AgendaItem>) => {
    if (!perms.canCreateAgenda) {
      notify('Peran Anda tidak memiliki izin menambah agenda.', 'warning');
      return;
    }
    setAgendaForm({
      judul: preset?.judul || '',
      tanggal: preset?.tanggal || selectedDate,
      jamMulai: preset?.jamMulai || '09:00',
      jamSelesai: preset?.jamSelesai || '11:00',
      sampaiSelesai: Boolean(preset?.sampaiSelesai),
      lokasi: preset?.lokasi || '',
      penyelenggara: preset?.penyelenggara || 'Sekretariat BPBD',
      pakaian: preset?.pakaian || 'PDH Khaki',
      nomorSurat: preset?.nomorSurat || '',
      kategori: preset?.kategori || 'Rapat Internal',
      status: preset?.status || 'Terjadwal',
      statusDisposisi: preset?.statusDisposisi || 'Menunggu Disposisi',
      pejabatPendamping: preset?.pejabatPendamping || '',
      isConfidential: Boolean(preset?.isConfidential),
      isUpdated: Boolean(preset?.isUpdated ?? true),
      zoomUrl: preset?.zoomUrl || '',
      catatan: preset?.catatan || '',
      sumber: preset?.sumber || 'Manual',
    });
    setAgendaModalOpen(true);
  };

  const openEditAgendaModal = (item: AgendaItem) => {
    if (!perms.canEditAgenda) {
      notify('Peran Anda tidak memiliki izin mengubah agenda.', 'warning');
      return;
    }
    setAgendaForm({
      id: item.id,
      judul: item.judul,
      tanggal: item.tanggal,
      jamMulai: item.jamMulai,
      jamSelesai: item.jamSelesai,
      sampaiSelesai: Boolean(item.sampaiSelesai),
      lokasi: item.lokasi,
      penyelenggara: item.penyelenggara,
      pakaian: item.pakaian,
      nomorSurat: item.nomorSurat,
      kategori: item.kategori,
      status: item.status,
      statusDisposisi: item.statusDisposisi,
      pejabatPendamping: item.pejabatPendamping,
      isConfidential: item.isConfidential,
      isUpdated: Boolean(item.isUpdated),
      zoomUrl: item.zoomUrl || '',
      catatan: item.catatan,
      sumber: item.sumber,
    });
    setAgendaModalOpen(true);
  };

  const handleSaveAgendaForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agendaForm) return;
    if (!agendaForm.judul.trim()) {
      notify('Nama kegiatan wajib diisi.', 'warning');
      return;
    }
    let resolvedEnd = agendaForm.jamSelesai;
    if (agendaForm.sampaiSelesai) {
      if (timeToMinutes(resolvedEnd) <= timeToMinutes(agendaForm.jamMulai)) {
        resolvedEnd = minutesToTime(timeToMinutes(agendaForm.jamMulai) + 120);
      }
    } else if (timeToMinutes(resolvedEnd) <= timeToMinutes(agendaForm.jamMulai)) {
      notify('Jam selesai harus lebih akhir daripada jam mulai.', 'warning');
      return;
    }

    const overlapsAfterSave = getConflictsForCandidate(agendas, {
      id: agendaForm.id,
      tanggal: agendaForm.tanggal,
      jamMulai: agendaForm.jamMulai,
      jamSelesai: resolvedEnd,
      status: agendaForm.status,
    });

    if (agendaForm.id) {
      setAgendas((prev) =>
        prev.map((a) =>
          a.id === agendaForm.id
            ? {
                ...a,
                ...agendaForm,
                jamSelesai: resolvedEnd,
                judul: agendaForm.judul.trim(),
                lokasi: agendaForm.lokasi.trim() || 'Menunggu konfirmasi',
              }
            : a
        )
      );
      appendAudit('EDIT_AGENDA', 'SUKSES', `Memperbarui agenda "${agendaForm.judul.trim()}".`);
      notify('Perubahan agenda berhasil disimpan.', 'success');
    } else {
      const created: AgendaItem = {
        ...agendaForm,
        jamSelesai: resolvedEnd,
        id: `ag-${Date.now()}`,
        judul: agendaForm.judul.trim(),
        lokasi: agendaForm.lokasi.trim() || 'Menunggu konfirmasi',
        createdBy: currentUser?.namaLengkap || 'Operator',
        createdAt: new Date().toISOString(),
      };
      setAgendas((prev) => [created, ...prev]);
      setSelectedDate(created.tanggal);
      appendAudit('TAMBAH_AGENDA', 'SUKSES', `Menambahkan agenda baru "${created.judul}".`);
      notify('Agenda baru berhasil ditambahkan.', 'success');
    }
    setAgendaModalOpen(false);
    setAgendaForm(null);
    if (overlapsAfterSave.length > 0) {
      setSelectedDate(agendaForm.tanggal);
      setConflictPopupOpen(true);
    }
  };

  const handleRequestDeleteAgenda = (item: AgendaItem) => {
    if (!perms.canDeleteAgenda(item)) {
      notify('Hanya Super Admin yang dapat menghapus agenda aktif.', 'warning');
      return;
    }
    setConfirmDialog({
      title: 'Hapus Agenda Kegiatan',
      message: `Yakin ingin menghapus permanen agenda "${item.judul}" (${item.tanggal} · ${item.jamMulai} WIB)?`,
      confirmLabel: 'Ya, Hapus Permanen',
      onConfirm: () => {
        setAgendas((prev) => prev.filter((a) => a.id !== item.id));
        appendAudit('HAPUS_AGENDA', 'PERINGATAN', `Menghapus agenda "${item.judul}".`);
        notify('Agenda berhasil dihapus.', 'success');
        setConfirmDialog(null);
      },
    });
  };

  const handleOpenDisposition = (item: AgendaItem) => {
    setDisposisiTarget(item);
    setDispStatus(item.statusDisposisi);
    setDispPendamping(item.pejabatPendamping);
    setDispCatatan(item.catatan);
  };

  const handleSaveDisposition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposisiTarget) return;
    setAgendas((prev) =>
      prev.map((a) =>
        a.id === disposisiTarget.id
          ? {
              ...a,
              statusDisposisi: dispStatus,
              pejabatPendamping: dispPendamping.trim(),
              catatan: dispCatatan.trim(),
              isUpdated: true,
            }
          : a
      )
    );
    appendAudit(
      'DISPOSISI_AGENDA',
      'SUKSES',
      `Disposisi "${disposisiTarget.judul}" -> ${dispStatus} (${dispPendamping || '-'}).`
    );
    notify('Disposisi surat berhasil diperbarui.', 'success');
    setDisposisiTarget(null);
  };

  const handleConfirmPresence = (item: AgendaItem) => {
    setAgendas((prev) =>
      prev.map((a) =>
        a.id === item.id ? { ...a, statusDisposisi: 'Hadir Dikonfirmasi' } : a
      )
    );
    appendAudit('KONFIRMASI_HADIR', 'SUKSES', `Konfirmasi hadir untuk "${item.judul}".`);
    notify('Kehadiran pada agenda berhasil dikonfirmasi.', 'success');
  };

  const handleToggleStatus = (item: AgendaItem) => {
    const nextStatus: AgendaStatus = item.status === 'Selesai' ? 'Terjadwal' : 'Selesai';
    setAgendas((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, status: nextStatus } : a))
    );
    appendAudit('UBAH_STATUS', 'SUKSES', `Status "${item.judul}" diubah menjadi ${nextStatus}.`);
    notify(`Agenda ditandai ${nextStatus}.`, 'info');
  };

  const handleQuickShiftSlot = (item: AgendaItem, jamMulai: string, jamSelesai: string) => {
    setAgendas((prev) =>
      prev.map((a) =>
        a.id === item.id ? { ...a, jamMulai, jamSelesai, isUpdated: true } : a
      )
    );
    appendAudit(
      'GESER_SLOT',
      'SUKSES',
      `Jadwal "${item.judul}" digeser ke ${jamMulai}-${jamSelesai} WIB.`
    );
    notify(`Jadwal digeser ke slot kosong ${jamMulai} - ${jamSelesai} WIB.`, 'success');
  };

  // =========================================================================
  // e-BUDDY EXTRACTOR HANDLERS
  // =========================================================================
  const handleRunEBuddyExtract = (raw: string) => {
    setEbuddyRawText(raw);
    if (!raw.trim()) {
      setEbuddyPreview(null);
      return;
    }
    const parsed = extractEBuddyText(raw, selectedDate);
    setEbuddyPreview(parsed);
  };

  const handleCommitEBuddyToForm = () => {
    if (!ebuddyPreview) return;
    openNewAgendaModal({
      judul: ebuddyPreview.judul,
      tanggal: ebuddyPreview.tanggal,
      jamMulai: ebuddyPreview.jamMulai,
      jamSelesai: ebuddyPreview.jamSelesai,
      sampaiSelesai: ebuddyPreview.sampaiSelesai,
      lokasi: ebuddyPreview.lokasi,
      penyelenggara: ebuddyPreview.penyelenggara,
      pakaian: ebuddyPreview.pakaian,
      nomorSurat: ebuddyPreview.nomorSurat,
      kategori: ebuddyPreview.kategori,
      zoomUrl: ebuddyPreview.zoomUrl,
      catatan: ebuddyPreview.catatan,
      sumber: 'e-Buddy',
      isUpdated: true,
    });
  };

  // =========================================================================
  // MASTER UNIT & SUPER ADMIN USER HANDLERS
  // =========================================================================
  const openMasterModal = (unit?: MasterUnitItem) => {
    if (unit) {
      setMasterForm(unit);
    } else {
      setMasterForm({
        id: '',
        tipe: 'Unit / Bidang',
        kode: '',
        nama: '',
        keterangan: '',
      });
    }
    setMasterModalOpen(true);
  };

  const handleSaveMasterUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterForm.kode.trim() || !masterForm.nama.trim()) {
      notify('Kode dan Nama Master wajib diisi.', 'warning');
      return;
    }
    if (masterForm.id) {
      setMasterUnits((prev) =>
        prev.map((m) => (m.id === masterForm.id ? { ...masterForm } : m))
      );
      appendAudit('EDIT_MASTER', 'SUKSES', `Mengubah master "${masterForm.nama}".`);
      notify('Data Master berhasil diperbarui.', 'success');
    } else {
      const created: MasterUnitItem = { ...masterForm, id: `mu-${Date.now()}` };
      setMasterUnits((prev) => [created, ...prev]);
      appendAudit('TAMBAH_MASTER', 'SUKSES', `Menambahkan master "${created.nama}".`);
      notify('Master Unit / Lokasi ditambahkan.', 'success');
    }
    setMasterModalOpen(false);
  };

  const handleRequestDeleteMaster = (unit: MasterUnitItem) => {
    if (!perms.canDeleteMaster) {
      notify('Hanya Super Admin yang dapat menghapus data master.', 'warning');
      return;
    }
    setConfirmDialog({
      title: 'Hapus Master Unit / Lokasi',
      message: `Hapus permanen "${unit.nama}" (${unit.kode})?`,
      confirmLabel: 'Hapus Data',
      onConfirm: () => {
        setMasterUnits((prev) => prev.filter((m) => m.id !== unit.id));
        appendAudit('HAPUS_MASTER', 'PERINGATAN', `Menghapus master "${unit.nama}".`);
        notify('Data master berhasil dihapus.', 'success');
        setConfirmDialog(null);
      },
    });
  };

  const openUserModal = (u?: UserAccount) => {
    if (u) {
      setUserForm(u);
    } else {
      setUserForm({
        id: '',
        nip: '',
        username: '',
        email: '',
        password: 'Bpbd2026!',
        namaLengkap: '',
        jabatan: '',
        bidang: 'Sekretariat BPBD',
        roleKode: 'ROLE_OPERATOR',
        isActive: true,
      });
    }
    setUserModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.nip.trim() || !userForm.username.trim() || !userForm.namaLengkap.trim()) {
      notify('NIP, Username, dan Nama Lengkap wajib diisi.', 'warning');
      return;
    }
    if (userForm.id) {
      setUsers((prev) => prev.map((u) => (u.id === userForm.id ? { ...userForm } : u)));
      appendAudit('EDIT_USER', 'SUKSES', `Super Admin memperbarui akun ${userForm.username}.`);
      notify('Akun ASN berhasil diperbarui.', 'success');
    } else {
      const created: UserAccount = { ...userForm, id: `usr-${Date.now()}` };
      setUsers((prev) => [...prev, created]);
      appendAudit('TAMBAH_USER', 'SUKSES', `Super Admin membuat akun ${created.username}.`);
      notify('Akun ASN baru berhasil dibuat.', 'success');
    }
    setUserModalOpen(false);
  };

  const handleToggleUserActive = (u: UserAccount) => {
    if (u.id === currentUser?.id) {
      notify('Tidak dapat menonaktifkan akun yang sedang dipakai.', 'warning');
      return;
    }
    setUsers((prev) =>
      prev.map((usr) => (usr.id === u.id ? { ...usr, isActive: !usr.isActive } : usr))
    );
    appendAudit(
      'STATUS_USER',
      'PERINGATAN',
      `Status akun ${u.username} diubah menjadi ${u.isActive ? 'Nonaktif' : 'Aktif'}.`
    );
  };

  const handleRequestDeleteUser = (u: UserAccount) => {
    if (u.id === currentUser?.id) {
      notify('Akun yang sedang aktif login tidak bisa dihapus.', 'warning');
      return;
    }
    setConfirmDialog({
      title: 'Hapus Akun ASN',
      message: `Hapus permanen akun "${u.namaLengkap}" (${u.username})?`,
      confirmLabel: 'Hapus Akun',
      onConfirm: () => {
        setUsers((prev) => prev.filter((usr) => usr.id !== u.id));
        appendAudit('HAPUS_USER', 'PERINGATAN', `Super Admin menghapus akun ${u.username}.`);
        notify('Akun ASN berhasil dihapus.', 'success');
        setConfirmDialog(null);
      },
    });
  };

  const handleExportAuditCsv = () => {
    const header = ['Waktu', 'NIP', 'Nama', 'Role', 'Event', 'Status', 'Detail'];
    const rows = auditLogs.map((l) => [
      l.timestamp,
      l.nip,
      l.nama,
      l.roleKode,
      l.eventType,
      l.status,
      l.detail,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Audit_Log_SIAGA_BPBD_${todayISO}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Audit Log CSV berhasil diunduh.', 'success');
  };

  // =========================================================================
  // LOGIN GATE RENDER (Matches Screenshots + Dual Logos + Hidden Demo Fill)
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
          {/* Dark Navy Top Header with Left Sidoarjo Logo & Right BPBD Logo */}
          <div className="bg-[#0B2239] text-white p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <img
                  src={SIDOARJO_LOGO}
                  alt="Lambang Kabupaten Sidoarjo"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 sm:w-14 sm:h-14 object-contain bg-white rounded-xl p-1 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-wider uppercase text-sky-300">
                    PEMERINTAH KABUPATEN SIDOARJO
                  </p>
                  <p className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                    BPBD KABUPATEN SIDOARJO
                  </p>
                </div>
              </div>
              <img
                src={BPBD_LOGO}
                alt="Logo BPBD Sidoarjo"
                referrerPolicy="no-referrer"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover bg-white p-0.5 ring-2 ring-amber-400/70 shrink-0"
              />
            </div>

            <div className="space-y-2 pt-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                SIAGA BPBD SIDOARJO
              </h1>
              <p className="text-sm font-medium text-sky-100">
                Sistem Informasi Agenda Kegiatan &amp; Disposisi Real-Time
              </p>
              <p className="text-xs font-bold tracking-wide text-amber-400">
                Siap &bull; Cepat &bull; Tepat &bull; Humanis
              </p>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed pt-1">
                Platform kedinasan untuk mendigitalisasi pemrosesan surat masuk undangan/disposisi dari aplikasi e-Buddy oleh ASN Sekretariat hingga siap disebarkan ke pimpinan dan grup WhatsApp pegawai.
              </p>
            </div>

            <div className="pt-3 border-t border-white/15 text-xs text-slate-300">
              Jl. Raya Kemiri No. 1, Kec. Sidoarjo, Kabupaten Sidoarjo
            </div>
          </div>

          {/* Login Form Card Body */}
          <div className="p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Portal Masuk SIAGA BPBD</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Masuk menggunakan NIP (18 digit), Email Dinas (@sidoarjokab.go.id), atau Username kedinasan Anda.
              </p>
            </div>

            {loginError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  NIP / Username Kedinasan <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={loginIdentity}
                  onChange={(e) => setLoginIdentity(e.target.value)}
                  placeholder="Masukkan 18 digit NIP atau username pegawai..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0B2239]"
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Kata Sandi <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Masukkan kata sandi..."
                    className="w-full pl-3.5 pr-11 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0B2239]"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(e) => setRememberSession(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Pertahankan sesi masuk selama jam kerja (07.30 - 16.00 WIB)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotHelp((p) => !p)}
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline font-semibold shrink-0"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Lupa Kata Sandi / Hubungi Admin</span>
                </button>
              </div>

              {showForgotHelp && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900">
                  Untuk reset kata sandi ASN, hubungi Admin Sekretariat BPBD Kabupaten Sidoarjo (Subbag Umum &amp; Kepegawaian) atau gunakan Super Admin pada modul manajemen pengguna.
                </div>
              )}

              <button
                type="submit"
                disabled={remainingLockSeconds > 0}
                className="w-full py-3 px-4 rounded-xl bg-[#EA580C] hover:bg-[#D94E07] disabled:bg-slate-400 text-white text-sm font-extrabold tracking-wide shadow-sm transition cursor-pointer"
              >
                MASUK KE DASHBOARD SIAGA BPBD
              </button>
            </form>

            {/* Collapsible Hidden Demo Selector (Click fills Username & Password) */}
            <div className="pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDemoAccounts((prev) => !prev)}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 hover:text-slate-800 py-1.5"
              >
                <span>
                  {showDemoAccounts
                    ? 'Sembunyikan Akun Demo Uji Coba'
                    : 'Tampilkan Akun Demo Uji Coba (4 Peran RBAC)'}
                </span>
                {showDemoAccounts ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showDemoAccounts && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-slate-500">
                    Klik salah satu peran untuk mengisi NIP/Username &amp; Kata Sandi ke formulir di atas:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {users.slice(0, 4).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleFillDemoCredential(u)}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/60 hover:border-blue-300 p-3 text-left transition"
                      >
                        <div className="text-xs font-bold text-slate-900">
                          {ROLE_META[u.roleKode].shortLabel}
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 mt-0.5">
                          {u.username}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Akses terbatas untuk ASN &amp; Pegawai BPBD Kabupaten Sidoarjo. Seluruh aktivitas login dan perubahan jadwal tercatat dalam Audit Log.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // AUTHENTICATED SHELL: 7-ITEM DARK NAVY SIDEBAR (Matches Screenshot 1)
  // =========================================================================
  const navItems: Array<{
    id: ActiveView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
    badge?: number;
    badgeColor?: string;
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard Agenda',
      icon: LayoutDashboard,
      visible: true,
      badge: todayActiveCount > 0 ? todayActiveCount : undefined,
      badgeColor: 'text-rose-400',
    },
    {
      id: 'ebuddy',
      label: 'Input Surat / e-Buddy',
      icon: ClipboardPaste,
      visible: perms.canUseEBuddy,
    },
    {
      id: 'kalender',
      label: 'Kalender & Linimasa',
      icon: Calendar,
      visible: true,
    },
    {
      id: 'rekap_harian',
      label: 'Rekap Agenda (Hari/Bln/Thn)',
      icon: FileText,
      visible: true,
    },
    {
      id: 'broadcast_wa',
      label: 'Rekap & Broadcast WA',
      icon: Share2,
      visible: perms.canOpenCardStudio,
      badge: todayConflictCount > 0 ? todayConflictCount : undefined,
      badgeColor: 'text-amber-400',
    },
    {
      id: 'master_unit',
      label: 'Master Unit & Lokasi',
      icon: Building2,
      visible: true,
    },
    {
      id: 'super_admin',
      label: role === 'ROLE_DISPOSISI' ? 'Audit Log Keamanan' : 'Super Admin & Pengguna',
      icon: ShieldCheck,
      visible: perms.canManageUsers || perms.canViewAuditLog,
    },
  ];

  const visibleNavItems = navItems.filter((item) => item.visible);

  const viewTitleMap: Record<ActiveView, string> = {
    dashboard: 'Dashboard Agenda',
    ebuddy: 'Input Surat / e-Buddy',
    kalender: 'Kalender & Linimasa WIB',
    rekap_harian: 'Rekap Agenda (Hari / Bulan / Tahun)',
    broadcast_wa: 'Rekap & Broadcast WhatsApp',
    master_unit: 'Master Unit & Lokasi',
    super_admin:
      role === 'ROLE_DISPOSISI' ? 'Audit Log Keamanan' : 'Super Admin & Pengguna',
  };

  const unitLocations = masterUnits.filter((m) => m.tipe === 'Lokasi / Ruangan');
  const unitBidangs = masterUnits.filter((m) => m.tipe === 'Unit / Bidang');

  const agendaModalConflicts = agendaForm
    ? getConflictsForCandidate(agendas, {
        id: agendaForm.id,
        tanggal: agendaForm.tanggal,
        jamMulai: agendaForm.jamMulai,
        jamSelesai: agendaForm.jamSelesai,
        status: agendaForm.status,
      })
    : [];

  const agendaModalFreeSlot =
    agendaForm && agendaModalConflicts.length > 0
      ? findNextAvailableSlot(
          agendas,
          agendaForm.tanggal,
          timeToMinutes(agendaForm.jamSelesai) - timeToMinutes(agendaForm.jamMulai),
          agendaForm.id
        )
      : null;

  const filteredAuditLogs =
    auditFilter === 'ALL'
      ? auditLogs
      : auditLogs.filter((l) => l.status === auditFilter);

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-900 flex">
      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Dark Navy Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0B2239] text-white flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col min-h-0 flex-1">
          {/* Sidebar Top Brand */}
          <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={BPBD_LOGO}
                alt="BPBD Sidoarjo"
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover bg-white p-0.5 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-extrabold tracking-tight text-white truncate">
                  SIAGA AGENDA BPBD
                </p>
                <p className="text-[11px] text-slate-300 truncate">Kabupaten Sidoarjo</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 7-Item Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveView(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1D3E63] text-white shadow-xs'
                      : 'text-slate-300 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.badge === 'number' && (
                    <span className={`font-mono text-xs font-extrabold ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Bottom User Footer + Logout */}
        <div className="p-4 border-t border-white/10 space-y-3 bg-[#081A2C]">
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-bold text-white truncate">{currentUser.namaLengkap}</p>
            <p className="text-xs font-medium text-sky-400 truncate">
              {ROLE_META[currentUser.roleKode].shortLabel} &middot; {currentUser.bidang}
            </p>
            <p className="font-mono text-[11px] text-slate-400 truncate">
              NIP {currentUser.nip}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/8 hover:bg-white/14 border border-white/10 text-xs font-semibold text-white transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar Sesi (Logout)</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {viewTitleMap[activeView]}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {todayConflictCount > 0 && (
              <button
                type="button"
                onClick={() => setConflictPopupOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold whitespace-nowrap shrink-0"
                title="Lihat Notifikasi Agenda Bersamaan"
              >
                <BellRing className="w-3.5 h-3.5 text-rose-600" />
                <span>Bentrok ({todayConflictCount})</span>
              </button>
            )}
            <span className="hidden sm:inline-block text-xs font-bold text-blue-700 whitespace-nowrap">
              {ROLE_META[currentUser.roleKode].shortLabel}
            </span>
            {perms.canCreateAgenda && (
              <button
                type="button"
                onClick={() => openNewAgendaModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B2239] hover:bg-[#133254] text-white text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Input Agenda</span>
              </button>
            )}
          </div>
        </header>

        {/* Active View Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {(activeView === 'dashboard' ||
            activeView === 'kalender' ||
            activeView === 'rekap_harian' ||
            activeView === 'master_unit') && (
            <DashboardView
              activeView={activeView}
              role={role}
              agendas={agendas}
              visibleAgendas={visibleAgendas}
              masterUnits={masterUnits}
              selectedDate={selectedDate}
              onChangeDate={(iso) => {
                setSelectedDate(iso);
                setSelectedMonth(iso.slice(0, 7));
              }}
              selectedMonth={selectedMonth}
              onChangeMonth={setSelectedMonth}
              onOpenNewAgenda={openNewAgendaModal}
              onOpenEditAgenda={openEditAgendaModal}
              onRequestDeleteAgenda={handleRequestDeleteAgenda}
              onOpenDisposition={handleOpenDisposition}
              onToggleStatus={handleToggleStatus}
              onConfirmPresence={handleConfirmPresence}
              onQuickShiftSlot={handleQuickShiftSlot}
              onOpenSinglePoster={(item) => {
                setFocusedAgenda(item);
                setCardMode('tunggal');
                setActiveView('broadcast_wa');
              }}
              onOpenMasterModal={openMasterModal}
              onRequestDeleteMaster={handleRequestDeleteMaster}
              onOpenConflictPopup={() => setConflictPopupOpen(true)}
              onNotify={notify}
            />
          )}

          {/* VIEW: INPUT SURAT / e-BUDDY (Matches Screenshot 2) */}
          {activeView === 'ebuddy' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-blue-700">
                    Ekstraksi Cepat Surat Masuk &amp; Disposisi
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    Input Agenda dari e-Buddy
                  </h2>
                  <p className="text-sm text-slate-600 max-w-2xl">
                    Klik tombol <strong>Input Agenda Baru</strong> untuk mengisi jadwal secara langsung, atau tempel teks surat masuk e-Buddy di bawah ini.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openNewAgendaModal()}
                  className="w-full py-3.5 px-5 rounded-xl bg-[#0B2239] hover:bg-[#133254] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Input Agenda Baru</span>
                </button>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <Clipboard className="w-4 h-4 text-blue-700" />
                    <span>Ekstrak Teks Surat / Memo e-Buddy</span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600">
                      Uji cepat dengan contoh teks surat masuk:
                    </p>
                    <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                      {ebuddyTemplates.map((tpl) => (
                        <button
                          key={tpl.label}
                          type="button"
                          onClick={() => handleRunEBuddyExtract(tpl.text)}
                          className="text-left px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-blue-50/60 hover:border-blue-300 text-xs font-semibold text-slate-800 transition"
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Tempel teks undangan, disposisi e-Buddy, atau pesan WhatsApp
                    </label>
                    <textarea
                      rows={8}
                      value={ebuddyRawText}
                      onChange={(e) => handleRunEBuddyExtract(e.target.value)}
                      placeholder={`Contoh format:\nNomor Surat: 005/2194/438.1.1/2026\nPerihal: Rapat Koordinasi Hidrometeorologi\nHari/Tanggal: Senin, 23 November 2026\nPukul: 08.00 - 10.30 WIB\nTempat: Ruang Rapat Setda Kab. Sidoarjo\nDisposisi: Kalaksa menugaskan Bid. KL`}
                      className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleRunEBuddyExtract('')}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Bersihkan Teks
                    </button>
                    <button
                      type="button"
                      onClick={() => openNewAgendaModal({ sumber: 'Manual' })}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Isi Form Kosong</span>
                    </button>
                  </div>

                  {ebuddyPreview && (
                    <div className="rounded-xl border border-blue-200 bg-white p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-bold text-slate-900">
                            Hasil Ekstraksi Otomatis ({ebuddyPreview.detectedFields.length} field terdeteksi)
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {ebuddyPreview.detectedFields.map((f) => (
                            <span
                              key={f}
                              className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <div className="rounded-lg bg-slate-50 p-2.5">
                          <span className="text-slate-500">Judul / Perihal:</span>
                          <p className="font-bold text-slate-900 mt-0.5">{ebuddyPreview.judul}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2.5">
                          <span className="text-slate-500">Waktu &amp; Tanggal:</span>
                          <p className="font-bold text-slate-900 mt-0.5">
                            {formatTanggalLengkap(ebuddyPreview.tanggal)} · {formatRentangWaktu(ebuddyPreview)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2.5">
                          <span className="text-slate-500">Lokasi:</span>
                          <p className="font-bold text-slate-900 mt-0.5">{ebuddyPreview.lokasi}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2.5">
                          <span className="text-slate-500">No. Surat / Disposisi:</span>
                          <p className="font-bold text-slate-900 mt-0.5">
                            {ebuddyPreview.nomorSurat || '-'} · {ebuddyPreview.penyelenggara}
                          </p>
                        </div>
                      </div>

                      {(() => {
                        const conflicts = getConflictsForCandidate(agendas, {
                          tanggal: ebuddyPreview.tanggal,
                          jamMulai: ebuddyPreview.jamMulai,
                          jamSelesai: ebuddyPreview.jamSelesai,
                          status: 'Terjadwal',
                        });
                        if (conflicts.length === 0) return null;
                        return (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>
                              Terdeteksi <strong>{conflicts.length} jadwal bentrok</strong> pada jam tersebut:{' '}
                              {conflicts.map((c) => c.agenda.judul).join(', ')}.
                            </span>
                          </div>
                        );
                      })()}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleCommitEBuddyToForm}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Lanjutkan ke Form Simpan Agenda</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW: REKAP & BROADCAST WA (Matches Screenshot 3) */}
          {activeView === 'broadcast_wa' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Left Control Card matching Screenshot 3 */}
                <div className="xl:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <ImageIcon className="w-4 h-4 text-orange-600" />
                    <span>Poster Gambar Grup WA</span>
                  </div>

                  {/* Action Buttons matching Screenshot 3 */}
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!posterCanvasRef.current) return;
                          const ok = await copyPosterToClipboard(posterCanvasRef.current);
                          if (ok) {
                            notify('Gambar poster disalin ke clipboard.', 'success');
                          } else {
                            notify(
                              'Browser membatasi salin gambar langsung; gunakan Unduh PNG.',
                              'warning'
                            );
                          }
                        }}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800"
                      >
                        <Copy className="w-4 h-4" />
                        <span>Salin Gambar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!posterCanvasRef.current) return;
                          downloadPosterFile(
                            posterCanvasRef.current,
                            `Agenda_BPBD_Sidoarjo_${selectedDate}`,
                            'jpeg'
                          );
                          notify('Poster JPG berhasil diunduh.', 'success');
                        }}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-xs font-bold text-sky-900"
                      >
                        <Download className="w-4 h-4" />
                        <span>Unduh JPG</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!posterCanvasRef.current) return;
                        downloadPosterFile(
                          posterCanvasRef.current,
                          `Agenda_BPBD_Sidoarjo_${selectedDate}`,
                          'png'
                        );
                        notify('Poster PNG siap dibagikan ke WhatsApp!', 'success');
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#EA580C] hover:bg-[#D94E07] text-white text-sm font-bold shadow-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>Unduh Gambar WA (PNG)</span>
                    </button>

                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        buildWhatsAppCaption(posterAgendas, selectedDate, orgTitle, showZoomUrl)
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          buildWhatsAppCaption(posterAgendas, selectedDate, orgTitle, showZoomUrl)
                        );
                        notify('Teks broadcast WhatsApp dibuka & disalin.', 'info');
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-bold shadow-xs"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share ke WhatsApp</span>
                    </a>
                  </div>

                  {/* Checkboxes matching Screenshot 3 */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-100 text-sm text-slate-700">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showUpdatedBadge}
                        onChange={(e) => setShowUpdatedBadge(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>Tandai agenda [UPDATE / BARU]</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showConflictBadge}
                        onChange={(e) => setShowConflictBadge(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>Tampilkan penanda Bentrok Jam di poster</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showZoomUrl}
                        onChange={(e) => setShowZoomUrl(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>Sertakan URL tautan Zoom di poster</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showIllustration}
                        onChange={(e) => setShowIllustration(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>Tampilkan foto ilustrasi kegiatan</span>
                    </label>
                  </div>

                  {/* Mode, Date & Theme Controls */}
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Mode Kartu
                        </label>
                        <select
                          value={cardMode}
                          onChange={(e) => setCardMode(e.target.value as CardMode)}
                          className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold bg-white"
                        >
                          <option value="harian">Rekap Harian</option>
                          <option value="tunggal">Satu Agenda</option>
                          <option value="bulanan">Rekap Bulanan</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Tema Poster
                        </label>
                        <select
                          value={cardTheme}
                          onChange={(e) => setCardTheme(e.target.value as CardTheme)}
                          className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold bg-white"
                        >
                          <option value="bpbd">Resmi BPBD Navy</option>
                          <option value="putih">Bersih Klasik</option>
                          <option value="gelap">Mode Malam</option>
                        </select>
                      </div>
                    </div>

                    {cardMode === 'bulanan' ? (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Bulan Rekap
                        </label>
                        <input
                          type="month"
                          value={selectedMonth}
                          onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Tanggal Poster
                        </label>
                        <input
                          type="date"
                          value={selectedDate}
                          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                        />
                      </div>
                    )}

                    {cardMode === 'tunggal' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Pilih Agenda Tunggal
                        </label>
                        <select
                          value={focusedAgenda?.id || ''}
                          onChange={(e) => {
                            const found =
                              visibleAgendas.find((a) => a.id === e.target.value) || null;
                            setFocusedAgenda(found);
                          }}
                          className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                        >
                          <option value="">-- Pilih Agenda --</option>
                          {visibleAgendas.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.tanggal} · {a.jamMulai} · {a.judul.slice(0, 42)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Nama Instansi Header Poster
                      </label>
                      <input
                        type="text"
                        value={orgTitle}
                        onChange={(e) => setOrgTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Live Canvas Poster Preview */}
                <div className="xl:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Pratinjau Poster WhatsApp (Resolusi 1080px)
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      {posterAgendas.length} kegiatan ditampilkan
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-100 p-2 sm:p-3 overflow-auto">
                    <canvas
                      ref={posterCanvasRef}
                      className="w-full max-w-[720px] mx-auto rounded-xl shadow-md block bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: SUPER ADMIN & PENGGUNA + AUDIT LOG */}
          {activeView === 'super_admin' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                      Kontrol Keamanan &amp; Otoritas RBAC
                    </p>
                    <h2 className="text-2xl font-bold text-slate-900 mt-0.5">
                      {perms.canManageUsers
                        ? 'Manajemen Akun ASN & Audit Log'
                        : 'Audit Log Keamanan Sistem'}
                    </h2>
                  </div>

                  {perms.canManageUsers && (
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setAdminTab('users')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${
                          adminTab === 'users'
                            ? 'bg-[#0B2239] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Akun ASN ({users.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminTab('audit')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${
                          adminTab === 'audit'
                            ? 'bg-[#0B2239] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Audit Log ({auditLogs.length})
                      </button>
                    </div>
                  )}
                </div>

                {perms.canManageUsers && adminTab === 'users' ? (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => openUserModal()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B2239] hover:bg-[#133254] text-white text-xs font-bold"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Tambah Akun ASN</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {users.map((u) => (
                        <div
                          key={u.id}
                          className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-3 bg-white"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800">
                                {ROLE_META[u.roleKode].shortLabel}
                              </span>
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                                  u.isActive
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {u.isActive ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 pt-1">
                              {u.namaLengkap}
                            </h4>
                            <p className="text-xs text-slate-600">
                              {u.jabatan} &middot; {u.bidang}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500">
                              NIP: {u.nip} &middot; User: {u.username}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => openUserModal(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleUserActive(u)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                            >
                              {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRequestDeleteUser(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Hapus
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <select
                        value={auditFilter}
                        onChange={(e) =>
                          setAuditFilter(
                            e.target.value as 'ALL' | 'SUKSES' | 'GAGAL' | 'PERINGATAN'
                          )
                        }
                        className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold bg-white"
                      >
                        <option value="ALL">Semua Status Log</option>
                        <option value="SUKSES">SUKSES</option>
                        <option value="GAGAL">GAGAL</option>
                        <option value="PERINGATAN">PERINGATAN</option>
                      </select>
                      {perms.canExportAuditLog && (
                        <button
                          type="button"
                          onClick={handleExportAuditCsv}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B2239] text-white text-xs font-semibold"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Ekspor Audit Log (.CSV)</span>
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold">
                            <th className="py-2.5 px-3">Waktu</th>
                            <th className="py-2.5 px-3">Pengguna / NIP</th>
                            <th className="py-2.5 px-3">Aktivitas</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {filteredAuditLogs.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-500">
                                Belum ada catatan aktivitas audit log.
                              </td>
                            </tr>
                          ) : (
                            filteredAuditLogs.map((log) => (
                              <tr key={log.id}>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                  {new Date(log.timestamp).toLocaleString('id-ID')}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-semibold text-slate-900">{log.nama}</div>
                                  <div className="font-mono text-[11px] text-slate-500">
                                    {log.nip}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                                  {log.eventType}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                      log.status === 'SUKSES'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : log.status === 'PERINGATAN'
                                        ? 'bg-amber-50 text-amber-800'
                                        : 'bg-rose-50 text-rose-700'
                                    }`}
                                  >
                                    {log.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-700">{log.detail}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ===================================================================== */}
      {/* MODAL: ADD / EDIT AGENDA */}
      {/* ===================================================================== */}
      {agendaModalOpen && agendaForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {agendaForm.id ? 'Edit Agenda Kegiatan' : 'Tambah Agenda Kegiatan Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setAgendaModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAgendaForm} className="p-5 space-y-4">
              {agendaModalConflicts.length > 0 && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>
                      Peringatan Bentrok Jam ({agendaModalConflicts.length} agenda beririsan):
                    </span>
                  </div>
                  <p>
                    {agendaModalConflicts
                      .map((c) => `${c.agenda.judul} (${c.agenda.jamMulai}-${c.agenda.jamSelesai})`)
                      .join('; ')}
                  </p>
                  {agendaModalFreeSlot && (
                    <button
                      type="button"
                      onClick={() =>
                        setAgendaForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                jamMulai: agendaModalFreeSlot.jamMulai,
                                jamSelesai: agendaModalFreeSlot.jamSelesai,
                              }
                            : prev
                        )
                      }
                      className="px-2.5 py-1 rounded bg-rose-600 text-white font-semibold hover:bg-rose-700"
                    >
                      Gunakan Slot Kosong ({agendaModalFreeSlot.jamMulai} -{' '}
                      {agendaModalFreeSlot.jamSelesai})
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Kegiatan / Perihal *
                </label>
                <input
                  type="text"
                  required
                  value={agendaForm.judul}
                  onChange={(e) => setAgendaForm({ ...agendaForm, judul: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal *</label>
                  <input
                    type="date"
                    required
                    value={agendaForm.tanggal}
                    onChange={(e) => setAgendaForm({ ...agendaForm, tanggal: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jam Mulai *</label>
                  <input
                    type="time"
                    required
                    value={agendaForm.jamMulai}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setAgendaForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              jamMulai: nextStart,
                              jamSelesai: prev.sampaiSelesai
                                ? minutesToTime(timeToMinutes(nextStart) + 120)
                                : prev.jamSelesai,
                            }
                          : prev
                      );
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {agendaForm.sampaiSelesai
                      ? 'Estimasi Selesai (Deteksi Bentrok)'
                      : 'Jam Selesai *'}
                  </label>
                  <input
                    type="time"
                    required={!agendaForm.sampaiSelesai}
                    value={agendaForm.jamSelesai}
                    onChange={(e) => setAgendaForm({ ...agendaForm, jamSelesai: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      agendaForm.sampaiSelesai
                        ? 'border-amber-300 bg-amber-50/40 text-slate-700'
                        : 'border-slate-300'
                    }`}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agendaForm.sampaiSelesai}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAgendaForm({
                        ...agendaForm,
                        sampaiSelesai: checked,
                        jamSelesai:
                          checked &&
                          timeToMinutes(agendaForm.jamSelesai) <= timeToMinutes(agendaForm.jamMulai)
                            ? minutesToTime(timeToMinutes(agendaForm.jamMulai) + 120)
                            : agendaForm.jamSelesai,
                      });
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
                  />
                  <span>Jam Selesai: s.d. Selesai (contoh: 08.00 WIB - Selesai)</span>
                </label>
                {agendaForm.sampaiSelesai && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-orange-100 text-orange-800">
                    Tampil: {agendaForm.jamMulai} WIB - Selesai
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lokasi / Tempat</label>
                  <input
                    type="text"
                    list="master-lokasi-list"
                    value={agendaForm.lokasi}
                    onChange={(e) => setAgendaForm({ ...agendaForm, lokasi: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                  <datalist id="master-lokasi-list">
                    {unitLocations.map((u) => (
                      <option key={u.id} value={u.nama} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Penyelenggara / Bidang
                  </label>
                  <input
                    type="text"
                    list="master-bidang-list"
                    value={agendaForm.penyelenggara}
                    onChange={(e) =>
                      setAgendaForm({ ...agendaForm, penyelenggara: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                  <datalist id="master-bidang-list">
                    {unitBidangs.map((u) => (
                      <option key={u.id} value={u.nama} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    PIC / Pejabat Pendamping
                  </label>
                  <input
                    type="text"
                    value={agendaForm.pejabatPendamping}
                    onChange={(e) =>
                      setAgendaForm({ ...agendaForm, pejabatPendamping: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Surat</label>
                  <input
                    type="text"
                    value={agendaForm.nomorSurat}
                    onChange={(e) => setAgendaForm({ ...agendaForm, nomorSurat: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kategori</label>
                  <select
                    value={agendaForm.kategori}
                    onChange={(e) =>
                      setAgendaForm({
                        ...agendaForm,
                        kategori: e.target.value as AgendaCategory,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status Agenda</label>
                  <select
                    value={agendaForm.status}
                    onChange={(e) =>
                      setAgendaForm({ ...agendaForm, status: e.target.value as AgendaStatus })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="Terjadwal">Terjadwal</option>
                    <option value="Draft">Draft</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Dibatalkan">Dibatalkan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pakaian / Seragam</label>
                  <input
                    type="text"
                    value={agendaForm.pakaian}
                    onChange={(e) => setAgendaForm({ ...agendaForm, pakaian: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tautan Zoom / Rapat Daring (Opsional)
                </label>
                <input
                  type="url"
                  value={agendaForm.zoomUrl}
                  onChange={(e) => setAgendaForm({ ...agendaForm, zoomUrl: e.target.value })}
                  placeholder="https://zoom.us/j/..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Catatan Tambahan / Instruksi
                </label>
                <textarea
                  rows={2}
                  value={agendaForm.catatan}
                  onChange={(e) => setAgendaForm({ ...agendaForm, catatan: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agendaForm.isUpdated}
                    onChange={(e) => setAgendaForm({ ...agendaForm, isUpdated: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span>Tandai sebagai [UPDATE / BARU]</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agendaForm.isConfidential}
                    onChange={(e) =>
                      setAgendaForm({ ...agendaForm, isConfidential: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="inline-flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    Agenda Sifat Terbatas (Khusus Pimpinan/Disposisi/Super Admin)
                  </span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAgendaModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0B2239] hover:bg-[#133254] text-white text-xs font-bold"
                >
                  Simpan Agenda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DISPOSISI SURAT */}
      {disposisiTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Disposisi &amp; Penugasan</h3>
              <button
                type="button"
                onClick={() => setDisposisiTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveDisposition} className="p-5 space-y-4">
              <p className="text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl">
                {disposisiTarget.judul}
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Status Disposisi
                </label>
                <select
                  value={dispStatus}
                  onChange={(e) => setDispStatus(e.target.value as DisposisiStatus)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  {DISPOSISI_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pejabat / Personel Pendamping (PIC)
                </label>
                <input
                  type="text"
                  value={dispPendamping}
                  onChange={(e) => setDispPendamping(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Arahan / Catatan Disposisi
                </label>
                <textarea
                  rows={3}
                  value={dispCatatan}
                  onChange={(e) => setDispCatatan(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDisposisiTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold"
                >
                  Simpan Disposisi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT MASTER UNIT */}
      {masterModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {masterForm.id ? 'Edit Master Unit / Lokasi' : 'Tambah Master Unit / Lokasi'}
              </h3>
              <button
                type="button"
                onClick={() => setMasterModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveMasterUnit} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Master</label>
                <select
                  value={masterForm.tipe}
                  onChange={(e) =>
                    setMasterForm({
                      ...masterForm,
                      tipe: e.target.value as MasterUnitItem['tipe'],
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="Unit / Bidang">Unit / Bidang</option>
                  <option value="Lokasi / Ruangan">Lokasi / Ruangan</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kode *</label>
                <input
                  type="text"
                  required
                  value={masterForm.kode}
                  onChange={(e) => setMasterForm({ ...masterForm, kode: e.target.value })}
                  placeholder="Contoh: BID-KL atau LOC-05"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama *</label>
                <input
                  type="text"
                  required
                  value={masterForm.nama}
                  onChange={(e) => setMasterForm({ ...masterForm, nama: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan</label>
                <input
                  type="text"
                  value={masterForm.keterangan}
                  onChange={(e) => setMasterForm({ ...masterForm, keterangan: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMasterModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#0B2239] text-white text-xs font-bold"
                >
                  Simpan Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ASN USER (SUPER ADMIN) */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {userForm.id ? 'Edit Akun ASN' : 'Tambah Akun ASN Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="p-5 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">NIP (18 digit) *</label>
                  <input
                    type="text"
                    required
                    value={userForm.nip}
                    onChange={(e) => setUserForm({ ...userForm, nip: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={userForm.namaLengkap}
                  onChange={(e) => setUserForm({ ...userForm, namaLengkap: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jabatan</label>
                  <input
                    type="text"
                    value={userForm.jabatan}
                    onChange={(e) => setUserForm({ ...userForm, jabatan: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bidang</label>
                  <input
                    type="text"
                    value={userForm.bidang}
                    onChange={(e) => setUserForm({ ...userForm, bidang: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Peran RBAC</label>
                  <select
                    value={userForm.roleKode}
                    onChange={(e) =>
                      setUserForm({ ...userForm, roleKode: e.target.value as RoleCode })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="ROLE_SUPER_ADMIN">Super Admin</option>
                    <option value="ROLE_OPERATOR">Operator</option>
                    <option value="ROLE_DISPOSISI">Pejabat Disposisi</option>
                    <option value="ROLE_PIMPINAN">Pimpinan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kata Sandi *</label>
                  <input
                    type="text"
                    required
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#0B2239] text-white text-xs font-bold"
                >
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: IN-APP CONFIRMATION DIALOG */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-600">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: POP-UP NOTIFIKASI AGENDA BERSAMAAN */}
      {conflictPopupOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-rose-200 overflow-hidden">
            <div className="bg-gradient-to-r from-rose-700 to-orange-600 text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <BellRing className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold truncate">
                    Notifikasi Agenda Bersamaan ({simultaneousDayItems.length})
                  </h3>
                  <p className="text-xs text-rose-100 truncate">
                    {formatTanggalLengkap(selectedDate)} · Deteksi Otomatis Bentrok Jam
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConflictPopupOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0"
                aria-label="Tutup pop-up notifikasi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/70">
              {simultaneousDayItems.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm font-semibold text-emerald-800">
                  Seluruh agenda pada tanggal ini sudah aman tanpa bentrok jam.
                </div>
              ) : (
                simultaneousDayItems.map(({ item, conflicts }) => {
                  const freeSlot = perms.canEditAgenda
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
                      className="rounded-xl border border-rose-200 bg-white p-4 shadow-2xs space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B2239] text-white px-2.5 py-1 text-xs font-bold font-mono">
                          {formatRentangWaktu(item)}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                          Bersamaan dengan {conflicts.length} agenda
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900">{item.judul}</h4>
                        <p className="text-xs text-slate-600 mt-0.5">
                          📍 {item.lokasi} · 👤 PIC: <strong>{item.pejabatPendamping || item.penyelenggara}</strong>
                        </p>
                      </div>

                      <div className="rounded-lg bg-rose-50/80 border border-rose-100 p-2.5 text-xs text-rose-900 space-y-1">
                        <p className="font-bold">Beririsan waktu dengan:</p>
                        {conflicts.map((c) => (
                          <div key={c.agenda.id} className="flex items-center justify-between gap-2">
                            <span className="truncate">
                              &bull; {c.agenda.judul} ({formatRentangWaktu(c.agenda)})
                            </span>
                            <span className="font-mono font-bold text-rose-700 shrink-0">
                              {c.overlapMinutes} mnt
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {perms.canEditDisposition && (
                          <button
                            type="button"
                            onClick={() => {
                              setConflictPopupOpen(false);
                              handleOpenDisposition(item);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold text-indigo-800"
                          >
                            Bagi / Ubah PIC Pendamping
                          </button>
                        )}
                        {freeSlot && (
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickShiftSlot(item, freeSlot.jamMulai, freeSlot.jamSelesai)
                            }
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                          >
                            Geser ke Slot Kosong ({freeSlot.jamMulai}-{freeSlot.jamSelesai})
                          </button>
                        )}
                        {perms.canEditAgenda && (
                          <button
                            type="button"
                            onClick={() => {
                              setConflictPopupOpen(false);
                              openEditAgendaModal(item);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700"
                          >
                            Edit Jadwal
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Tip: Bagi PIC berbeda jika dua kegiatan wajib berjalan bersamaan.
              </span>
              <button
                type="button"
                onClick={() => setConflictPopupOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#0B2239] hover:bg-[#133254] text-white text-xs font-bold"
              >
                Tutup Notifikasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl px-4 py-3 shadow-lg border text-xs font-semibold flex items-center gap-2 ${
                t.tone === 'success'
                  ? 'bg-emerald-900 text-white border-emerald-700'
                  : t.tone === 'warning'
                  ? 'bg-amber-900 text-white border-amber-700'
                  : 'bg-[#0B2239] text-white border-slate-700'
              }`}
            >
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
