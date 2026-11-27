import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Building2,
  Calendar,
  CheckCircle2,
  Clipboard,
  ClipboardPaste,
  Copy,
  Database,
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
  MapPin,
  Menu,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { DashboardView } from './DashboardView';
import {
  buildSingleAgendaText,
  buildWhatsAppCaption,
  copyPosterToClipboard,
  downloadPosterFile,
  renderBroadcastPosterCanvas,
  resolvePosterIllustrationKey,
  sharePosterWithImage,
} from './posterCanvas';
import {
  deleteAgendaFromSupabase,
  deleteUserFromSupabase,
  fetchAgendasFromSupabase,
  fetchConflictsFromSupabase,
  fetchUsersFromSupabase,
  generateAgendaUuid,
  insertAgendaToSupabase,
  insertUserToSupabase,
  isSupabaseConfigured,
  normalizeRoleCode,
  sanitizeZoomUrl,
  subscribeAgendasRealtime,
  subscribeUsersRealtime,
  syncImportedAgendasToSupabase,
  syncImportedUsersToSupabase,
  toggleUserStatusInSupabase,
  updateAgendaInSupabase,
  updateUserInSupabase,
} from './supabaseClient';
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
  LOCKOUT_DURATION_MS,
  LOCKOUT_STORAGE_KEY,
  MASTER_STORAGE_KEY,
  MAX_FAILED_ATTEMPTS,
  MasterUnitItem,
  ORG_TITLE_KEY,
  POSTER_ILLUSTRATION_OPTIONS,
  PosterIllustrationKey,
  ROLE_META,
  RoleCode,
  SESSION_DURATION_MS,
  SESSION_LOCAL_KEY,
  SESSION_TEMP_KEY,
  UserAccount,
  createInitialMasterUnits,
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
  statusDisposisi: AgendaItem['statusDisposisi'];
  pejabatPendamping: string;
  isConfidential: boolean;
  isUpdated: boolean;
  zoomUrl: string;
  ilustrasi: PosterIllustrationKey;
  catatan: string;
  sumber: 'Manual' | 'e-Buddy';
}

interface BackupPayload {
  app?: string;
  version?: number;
  exportedAt?: string;
  orgTitle?: string;
  agendas: AgendaItem[];
  masterUnits?: MasterUnitItem[];
  users?: UserAccount[];
  auditLogs?: AuditLogEntry[];
}

interface ImportPreviewState {
  fileName: string;
  exportedAt?: string;
  orgTitle?: string;
  agendas: AgendaItem[];
  masterUnits?: MasterUnitItem[];
  users?: UserAccount[];
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

  // Persistent States (Supabase-backed for akun_asn & agenda)
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(isSupabaseConfigured);
  const [isSavingUser, setIsSavingUser] = useState<boolean>(false);

  const [agendas, setAgendas] = useState<AgendaItem[]>([]);
  const [isLoadingAgendas, setIsLoadingAgendas] = useState<boolean>(isSupabaseConfigured);
  const [isSavingAgenda, setIsSavingAgenda] = useState<boolean>(false);
  const [supabaseError, setSupabaseError] = useState<string>(() =>
    isSupabaseConfigured
      ? ''
      : 'Environment variables VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum dikonfigurasi.'
  );

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

  const loadUsersFromDb = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured) {
      setIsLoadingUsers(false);
      setSupabaseError(
        'Environment variables VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum dikonfigurasi.'
      );
      return;
    }
    if (!silent) {
      setIsLoadingUsers(true);
    }
    try {
      const rows = await fetchUsersFromSupabase();
      setUsers(rows);
      setSupabaseError('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat akun ASN dari Supabase.';
      setSupabaseError(msg);
      if (!silent) {
        notify(`Gagal memuat tabel akun_asn: ${msg}`, 'warning');
      }
    } finally {
      if (!silent) {
        setIsLoadingUsers(false);
      }
    }
  }, []);

  const loadAgendasFromDb = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured) {
      setIsLoadingAgendas(false);
      setSupabaseError(
        'Environment variables VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum dikonfigurasi.'
      );
      return;
    }
    if (!silent) {
      setIsLoadingAgendas(true);
    }
    try {
      const rows = await fetchAgendasFromSupabase();
      setAgendas(rows);
      setSupabaseError('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data dari Supabase.';
      setSupabaseError(msg);
      if (!silent) {
        notify(`Gagal memuat tabel agenda: ${msg}`, 'warning');
      }
    } finally {
      if (!silent) {
        setIsLoadingAgendas(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadUsersFromDb(false);
    void loadAgendasFromDb(false);
    const unsubUsers = subscribeUsersRealtime(() => {
      void loadUsersFromDb(true);
    });
    const unsubAgendas = subscribeAgendasRealtime(() => {
      void loadAgendasFromDb(true);
    });
    return () => {
      unsubUsers();
      unsubAgendas();
    };
  }, [loadUsersFromDb, loadAgendasFromDb]);

  useEffect(() => {
    localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(masterUnits));
  }, [masterUnits]);

  useEffect(() => {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(ORG_TITLE_KEY, orgTitle);
  }, [orgTitle]);

  // Login State & First-Run Bootstrap State
  const [loginIdentity, setLoginIdentity] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [bootstrapAdmin, setBootstrapAdmin] = useState({
    namaLengkap: '',
    nip: '',
    jabatan: 'Kepala Pelaksana / Admin Sistem',
    bidang: 'Sekretariat BPBD',
    username: '',
  });
  const [isBootstrappingAdmin, setIsBootstrappingAdmin] = useState(false);
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
  const [showUpdatedBadge, setShowUpdatedBadge] = useState(false);
  const [showZoomUrl, setShowZoomUrl] = useState(true);
  const [showIllustration, setShowIllustration] = useState(true);
  const [logoTick, setLogoTick] = useState(0);
  const posterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Modals State
  const [agendaModalOpen, setAgendaModalOpen] = useState(false);
  const [agendaForm, setAgendaForm] = useState<AgendaFormState | null>(null);

  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null);
  const [importIncludeUsers, setImportIncludeUsers] = useState(false);
  const [importError, setImportError] = useState('');
  const [showPasteBackup, setShowPasteBackup] = useState(false);
  const [pasteBackupText, setPasteBackupText] = useState('');
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Super Admin tab state & Reminder popup state
  const [adminTab, setAdminTab] = useState<'users' | 'audit'>('users');
  const [auditFilter, setAuditFilter] = useState<'ALL' | 'SUKSES' | 'GAGAL' | 'PERINGATAN'>('ALL');
  const [reminderPopupOpen, setReminderPopupOpen] = useState(false);

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

  // Sidebar badge & click-triggered simultaneous agenda reminder metrics
  const todayActiveCount = useMemo(() => {
    return visibleAgendas.filter(
      (a) => a.tanggal === selectedDate && a.status !== 'Dibatalkan'
    ).length;
  }, [visibleAgendas, selectedDate]);

  const simultaneousDayItems = useMemo(() => {
    return visibleAgendas
      .filter(
        (a) =>
          a.tanggal === selectedDate &&
          a.status !== 'Dibatalkan' &&
          a.status !== 'Draft' &&
          getConflictsForCandidate(agendas, a).length > 0
      )
      .sort((a, b) => timeToMinutes(a.jamMulai) - timeToMinutes(b.jamMulai));
  }, [visibleAgendas, agendas, selectedDate]);

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
    if (activeView === 'broadcast_wa') {
      void loadAgendasFromDb(true);
    }
  }, [activeView, loadAgendasFromDb]);

  useEffect(() => {
    if (activeView !== 'broadcast_wa' || !posterCanvasRef.current) return;
    renderBroadcastPosterCanvas(
      posterCanvasRef.current,
      {
        agendas: posterAgendas,
        selectedDate,
        selectedMonth,
        cardMode,
        cardTheme,
        focusedAgenda,
        orgTitle,
        showUpdatedBadge,
        showZoomUrl,
        showIllustration,
      },
      () => setLogoTick((t) => t + 1)
    );
  }, [
    activeView,
    posterAgendas,
    selectedDate,
    selectedMonth,
    cardMode,
    cardTheme,
    focusedAgenda,
    orgTitle,
    showUpdatedBadge,
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

  const handleLoginSubmit = async (e: React.FormEvent) => {
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
    if (!identity) {
      setLoginError('Harap isi NIP atau Username Kedinasan Anda.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const liveUsers = isSupabaseConfigured ? await fetchUsersFromSupabase() : users;
      if (isSupabaseConfigured) {
        setUsers(liveUsers);
        setSupabaseError('');
      }

      const matched = liveUsers.find(
        (u) =>
          u.nip.toLowerCase() === identity ||
          u.username.toLowerCase() === identity ||
          (u.email && u.email.toLowerCase() === identity)
      );

      const passwordRequired = Boolean(matched?.password);
      if (!matched || (passwordRequired && matched.password !== pwd)) {
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
            : `NIP / Username tidak ditemukan di tabel akun_asn${passwordRequired ? ' atau kata sandi salah' : ''}. Sisa percobaan: ${MAX_FAILED_ATTEMPTS - nextFailed}x.`
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
        setLoginError('Akun ASN ini berstatus Nonaktif pada tabel akun_asn.');
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memverifikasi akun di Supabase.';
      setSupabaseError(msg);
      setLoginError(`Gagal memverifikasi akun ke Supabase: ${msg}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleBootstrapFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBootstrappingAdmin) return;
    if (
      !bootstrapAdmin.namaLengkap.trim() ||
      !bootstrapAdmin.nip.trim() ||
      !bootstrapAdmin.username.trim()
    ) {
      setLoginError('Nama Lengkap, NIP, dan Username wajib diisi untuk membuat Super Admin.');
      return;
    }

    setIsBootstrappingAdmin(true);
    setLoginError('');
    try {
      const created = await insertUserToSupabase({
        id: generateAgendaUuid(),
        namaLengkap: bootstrapAdmin.namaLengkap.trim(),
        nip: bootstrapAdmin.nip.trim(),
        jabatan: bootstrapAdmin.jabatan.trim() || 'Super Admin SIAGA',
        bidang: bootstrapAdmin.bidang.trim() || 'Sekretariat BPBD',
        username: bootstrapAdmin.username.trim(),
        email: '',
        roleKode: 'ROLE_SUPER_ADMIN',
        isActive: true,
      });
      await loadUsersFromDb(true);
      const newSess: AuthSession = {
        userId: created.id,
        remember: rememberSession,
        loginAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      if (rememberSession) {
        localStorage.setItem(SESSION_LOCAL_KEY, JSON.stringify(newSess));
      } else {
        sessionStorage.setItem(SESSION_TEMP_KEY, JSON.stringify(newSess));
      }
      setSession(newSess);
      setActiveView('dashboard');
      appendAudit(
        'BOOTSTRAP_SUPER_ADMIN',
        'SUKSES',
        `Akun Super Admin pertama (${created.username}) disimpan ke tabel akun_asn.`,
        created
      );
      notify(`Akun Super Admin "${created.namaLengkap}" tersimpan di Supabase.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat akun Super Admin di Supabase.';
      setSupabaseError(msg);
      setLoginError(`Gagal menyimpan ke tabel akun_asn: ${msg}`);
    } finally {
      setIsBootstrappingAdmin(false);
    }
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
      ilustrasi: preset?.ilustrasi || 'auto',
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
      ilustrasi: item.ilustrasi || 'auto',
      catatan: item.catatan,
      sumber: item.sumber,
    });
    setAgendaModalOpen(true);
  };

  const modalConflicts = useMemo(() => {
    if (!agendaForm || !agendaForm.tanggal || !agendaForm.jamMulai) return [];
    const endMinutes = agendaForm.sampaiSelesai
      ? Math.max(timeToMinutes(agendaForm.jamMulai) + 120, timeToMinutes(agendaForm.jamSelesai))
      : timeToMinutes(agendaForm.jamSelesai);
    return getConflictsForCandidate(agendas, {
      id: agendaForm.id,
      tanggal: agendaForm.tanggal,
      jamMulai: agendaForm.jamMulai,
      jamSelesai: minutesToTime(endMinutes),
      status: agendaForm.status,
    });
  }, [agendas, agendaForm]);

  const ebuddyConflicts = useMemo(() => {
    if (!ebuddyPreview) return [];
    return getConflictsForCandidate(agendas, {
      tanggal: ebuddyPreview.tanggal,
      jamMulai: ebuddyPreview.jamMulai,
      jamSelesai: ebuddyPreview.jamSelesai,
      status: 'Terjadwal',
    });
  }, [agendas, ebuddyPreview]);

  const handleSaveAgendaForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agendaForm || isSavingAgenda) return;
    if (!agendaForm.judul.trim()) {
      notify('Nama kegiatan wajib diisi.', 'warning');
      return;
    }
    const rawZoom = agendaForm.zoomUrl.trim();
    if (rawZoom && !sanitizeZoomUrl(rawZoom)) {
      notify('URL Zoom harus diawali dengan https:// atau http://.', 'warning');
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

    setIsSavingAgenda(true);
    try {
      const dbConflicts = await fetchConflictsFromSupabase({
        id: agendaForm.id,
        tanggal: agendaForm.tanggal,
        jamMulai: agendaForm.jamMulai,
        jamSelesai: resolvedEnd,
        status: agendaForm.status,
      });

      if (agendaForm.id) {
        const existingItem = agendas.find((a) => a.id === agendaForm.id);
        const updated = await updateAgendaInSupabase(
          agendaForm.id,
          {
            ...agendaForm,
            jamSelesai: resolvedEnd,
            judul: agendaForm.judul.trim(),
            lokasi: agendaForm.lokasi.trim() || 'Menunggu konfirmasi',
            zoomUrl: sanitizeZoomUrl(agendaForm.zoomUrl),
          },
          existingItem
        );
        await loadAgendasFromDb(true);
        if (focusedAgenda?.id === updated.id) {
          setFocusedAgenda(updated);
        }
        setSupabaseError('');
        appendAudit('EDIT_AGENDA', 'SUKSES', `Memperbarui agenda "${updated.judul}" di Supabase.`);
        if (dbConflicts.length > 0) {
          notify(
            `Agenda diperbarui. Perhatian: jadwal beririsan dengan ${dbConflicts.length} kegiatan lain di tanggal ini.`,
            'warning'
          );
        } else {
          notify('Perubahan agenda berhasil disimpan ke Supabase.', 'success');
        }
      } else {
        const createdPayload: AgendaItem = {
          ...agendaForm,
          jamSelesai: resolvedEnd,
          id: generateAgendaUuid(),
          judul: agendaForm.judul.trim(),
          lokasi: agendaForm.lokasi.trim() || 'Menunggu konfirmasi',
          zoomUrl: sanitizeZoomUrl(agendaForm.zoomUrl),
          createdBy: currentUser?.namaLengkap || 'Operator',
          createdAt: new Date().toISOString(),
        };
        const created = await insertAgendaToSupabase(createdPayload);
        await loadAgendasFromDb(true);
        setSelectedDate(created.tanggal);
        setSelectedMonth(created.tanggal.slice(0, 7));
        setSupabaseError('');
        appendAudit('TAMBAH_AGENDA', 'SUKSES', `Menambahkan agenda baru "${created.judul}" ke Supabase.`);
        if (dbConflicts.length > 0) {
          notify(
            `Agenda tersimpan di Supabase. Perhatian: waktu beririsan dengan ${dbConflicts[0].agenda.judul}.`,
            'warning'
          );
        } else {
          notify('Agenda baru berhasil disimpan permanen ke Supabase.', 'success');
        }
      }
      setAgendaModalOpen(false);
      setAgendaForm(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan agenda ke Supabase.';
      setSupabaseError(msg);
      notify(`Gagal menyimpan ke Supabase: ${msg}`, 'warning');
    } finally {
      setIsSavingAgenda(false);
    }
  };

  const handleRequestDeleteAgenda = (item: AgendaItem) => {
    if (!perms.canDeleteAgenda(item)) {
      notify('Hanya Super Admin yang dapat menghapus agenda aktif.', 'warning');
      return;
    }
    setConfirmDialog({
      title: 'Hapus Agenda Kegiatan',
      message: `Yakin ingin menghapus permanen agenda "${item.judul}" (${item.tanggal} · ${item.jamMulai} WIB) dari Supabase?`,
      confirmLabel: 'Ya, Hapus Permanen',
      onConfirm: async () => {
        try {
          await deleteAgendaFromSupabase(item.id);
          await loadAgendasFromDb(true);
          if (focusedAgenda?.id === item.id) {
            setFocusedAgenda(null);
          }
          setSupabaseError('');
          appendAudit('HAPUS_AGENDA', 'PERINGATAN', `Menghapus agenda "${item.judul}" dari Supabase.`);
          notify('Agenda berhasil dihapus dari Supabase.', 'success');
          setConfirmDialog(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Gagal menghapus agenda di Supabase.';
          setSupabaseError(msg);
          notify(`Gagal menghapus dari Supabase: ${msg}`, 'warning');
        }
      },
    });
  };

  const handleToggleStatus = async (item: AgendaItem) => {
    const nextStatus: AgendaStatus = item.status === 'Selesai' ? 'Terjadwal' : 'Selesai';
    try {
      const updated = await updateAgendaInSupabase(item.id, { status: nextStatus }, item);
      await loadAgendasFromDb(true);
      if (focusedAgenda?.id === item.id) {
        setFocusedAgenda(updated);
      }
      setSupabaseError('');
      appendAudit('UBAH_STATUS', 'SUKSES', `Status "${item.judul}" diubah menjadi ${nextStatus} di Supabase.`);
      notify(`Agenda ditandai ${nextStatus}.`, 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui status agenda.';
      setSupabaseError(msg);
      notify(`Gagal update status di Supabase: ${msg}`, 'warning');
    }
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
        namaLengkap: '',
        jabatan: '',
        bidang: 'Sekretariat BPBD',
        roleKode: 'ROLE_OPERATOR',
        isActive: true,
      });
    }
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingUser) return;
    if (!userForm.nip.trim() || !userForm.username.trim() || !userForm.namaLengkap.trim()) {
      notify('NIP, Username, dan Nama Lengkap wajib diisi.', 'warning');
      return;
    }

    setIsSavingUser(true);
    try {
      if (userForm.id) {
        const updated = await updateUserInSupabase(userForm.id, userForm);
        await loadUsersFromDb(true);
        appendAudit(
          'EDIT_USER',
          'SUKSES',
          `Super Admin memperbarui akun ${updated.username} di tabel akun_asn.`
        );
        notify('Akun ASN berhasil diperbarui di Supabase.', 'success');
      } else {
        const created = await insertUserToSupabase({
          ...userForm,
          id: generateAgendaUuid(),
        });
        await loadUsersFromDb(true);
        appendAudit(
          'TAMBAH_USER',
          'SUKSES',
          `Super Admin membuat akun ${created.username} di tabel akun_asn.`
        );
        notify('Akun ASN baru berhasil disimpan ke Supabase.', 'success');
      }
      setSupabaseError('');
      setUserModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan akun ASN ke Supabase.';
      setSupabaseError(msg);
      notify(`Gagal menyimpan ke tabel akun_asn: ${msg}`, 'warning');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleToggleUserActive = async (u: UserAccount) => {
    if (u.id === currentUser?.id) {
      notify('Tidak dapat menonaktifkan akun yang sedang dipakai.', 'warning');
      return;
    }
    const nextActive = !u.isActive;
    try {
      await toggleUserStatusInSupabase(u.id, nextActive);
      await loadUsersFromDb(true);
      setSupabaseError('');
      appendAudit(
        'STATUS_USER',
        'PERINGATAN',
        `Status akun ${u.username} diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'} di Supabase.`
      );
      notify(
        `Status akun "${u.namaLengkap}" diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'}.`,
        'info'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status akun ASN.';
      setSupabaseError(msg);
      notify(`Gagal update status akun_asn: ${msg}`, 'warning');
    }
  };

  const handleRequestDeleteUser = (u: UserAccount) => {
    if (u.id === currentUser?.id) {
      notify('Akun yang sedang aktif login tidak bisa dihapus.', 'warning');
      return;
    }
    setConfirmDialog({
      title: 'Hapus Akun ASN',
      message: `Hapus permanen akun "${u.namaLengkap}" (${u.username}) dari database Supabase?`,
      confirmLabel: 'Hapus Akun',
      onConfirm: async () => {
        try {
          await deleteUserFromSupabase(u.id);
          await loadUsersFromDb(true);
          setSupabaseError('');
          appendAudit(
            'HAPUS_USER',
            'PERINGATAN',
            `Super Admin menghapus akun ${u.username} dari tabel akun_asn.`
          );
          notify('Akun ASN berhasil dihapus dari Supabase.', 'success');
          setConfirmDialog(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Gagal menghapus akun ASN di Supabase.';
          setSupabaseError(msg);
          notify(`Gagal menghapus dari akun_asn: ${msg}`, 'warning');
        }
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
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    notify('Audit Log CSV berhasil diunduh.', 'success');
  };

  // =========================================================================
  // BACKUP & IMPORT DATA (.JSON) HANDLERS
  // =========================================================================
  const buildBackupPayloadString = () => {
    const payload: BackupPayload = {
      app: 'SIAGA-AGENDA-BPBD-SIDOARJO',
      version: 1,
      exportedAt: new Date().toISOString(),
      orgTitle,
      agendas,
      masterUnits,
      users,
      auditLogs,
    };
    return JSON.stringify(payload, null, 2);
  };

  const handleDownloadBackupJson = () => {
    try {
      const jsonString = buildBackupPayloadString();
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Backup_SIAGA_BPBD_${todayISO}.json`;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      appendAudit(
        'BACKUP_DATA',
        'SUKSES',
        `Mengunduh file backup JSON (${agendas.length} agenda, ${masterUnits.length} master unit).`
      );
      notify(`File backup (${agendas.length} agenda) berhasil diunduh.`, 'success');
    } catch {
      notify('Gagal membuat file backup JSON.', 'warning');
    }
  };

  const handleCopyBackupJson = async () => {
    try {
      await navigator.clipboard?.writeText(buildBackupPayloadString());
      notify(`Teks backup JSON (${agendas.length} agenda) disalin ke clipboard.`, 'success');
    } catch {
      notify('Browser membatasi salin clipboard; gunakan tombol Unduh File Backup (.json).', 'warning');
    }
  };

  const normalizeImportedAgenda = (raw: Partial<AgendaItem>, index: number): AgendaItem | null => {
    if (!raw || typeof raw !== 'object') return null;
    const judul = String(raw.judul || '').trim();
    const tanggal = String(raw.tanggal || '').trim();
    if (!judul || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
    const validStatuses: AgendaStatus[] = ['Terjadwal', 'Draft', 'Selesai', 'Dibatalkan'];
    const validCategories: AgendaCategory[] = [...CATEGORIES];
    const jamMulai = /^\d{2}:\d{2}$/.test(String(raw.jamMulai || ''))
      ? String(raw.jamMulai)
      : '08:00';
    const jamSelesai = /^\d{2}:\d{2}$/.test(String(raw.jamSelesai || ''))
      ? String(raw.jamSelesai)
      : '10:00';
    return {
      id: String(raw.id || `ag-imp-${Date.now()}-${index}`),
      judul,
      tanggal,
      jamMulai,
      jamSelesai,
      sampaiSelesai: Boolean(raw.sampaiSelesai),
      lokasi: String(raw.lokasi || 'Menunggu konfirmasi'),
      penyelenggara: String(raw.penyelenggara || 'Sekretariat BPBD'),
      pakaian: String(raw.pakaian || 'Menyesuaikan'),
      nomorSurat: String(raw.nomorSurat || ''),
      kategori: validCategories.includes(raw.kategori as AgendaCategory)
        ? (raw.kategori as AgendaCategory)
        : 'Rapat Internal',
      status: validStatuses.includes(raw.status as AgendaStatus)
        ? (raw.status as AgendaStatus)
        : 'Terjadwal',
      statusDisposisi: raw.statusDisposisi || 'Menunggu Disposisi',
      pejabatPendamping: String(raw.pejabatPendamping || ''),
      isConfidential: Boolean(raw.isConfidential),
      isUpdated: Boolean(raw.isUpdated),
      zoomUrl: raw.zoomUrl ? String(raw.zoomUrl) : undefined,
      ilustrasi: POSTER_ILLUSTRATION_OPTIONS.some((o) => o.value === raw.ilustrasi)
        ? (raw.ilustrasi as PosterIllustrationKey)
        : undefined,
      catatan: String(raw.catatan || ''),
      sumber: raw.sumber === 'e-Buddy' ? 'e-Buddy' : 'Manual',
      createdBy: String(raw.createdBy || 'Import Backup'),
      createdAt: String(raw.createdAt || new Date().toISOString()),
    };
  };

  const readFileTextCompat = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (result) {
            resolve(result);
          } else if (typeof file.text === 'function') {
            file.text().then(resolve).catch(reject);
          } else {
            reject(new Error('Isi file kosong.'));
          }
        };
        reader.onerror = () => {
          if (typeof file.text === 'function') {
            file.text().then(resolve).catch(() => reject(reader.error || new Error('Gagal membaca file.')));
          } else {
            reject(reader.error || new Error('Gagal membaca file.'));
          }
        };
        reader.readAsText(file, 'utf-8');
      } catch (err) {
        if (typeof file.text === 'function') {
          file.text().then(resolve).catch(() => reject(err));
        } else {
          reject(err);
        }
      }
    });
  };

  const parseBackupJsonAndPreview = (rawText: string, sourceName: string) => {
    const cleanedText = rawText.replace(/^\uFEFF/, '').trim();
    if (!cleanedText) {
      setImportError('File atau teks backup kosong.');
      return;
    }

    const parsed = JSON.parse(cleanedText) as unknown;
    let rawAgendas: Partial<AgendaItem>[] = [];
    let rawMaster: MasterUnitItem[] | undefined;
    let rawUsers: UserAccount[] | undefined;
    let exportedAt: string | undefined;
    let parsedOrgTitle: string | undefined;

    if (Array.isArray(parsed)) {
      rawAgendas = parsed as Partial<AgendaItem>[];
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Partial<BackupPayload>;
      if (Array.isArray(obj.agendas)) {
        rawAgendas = obj.agendas;
      }
      if (Array.isArray(obj.masterUnits)) {
        rawMaster = obj.masterUnits.filter(
          (m) => m && typeof m.id === 'string' && typeof m.nama === 'string'
        );
      }
      if (Array.isArray(obj.users)) {
        rawUsers = obj.users
          .map((rawU): UserAccount | null => {
            if (!rawU || typeof rawU !== 'object') return null;
            const r = rawU as unknown as Record<string, unknown>;
            const username = String(r.username || '').trim();
            const nama = String(r.namaLengkap ?? r.nama ?? '').trim();
            if (!username || !nama) return null;
            const rawStatus = r.status ?? r.isActive;
            const isActive =
              typeof rawStatus === 'boolean'
                ? rawStatus
                : String(rawStatus ?? 'Aktif').trim().toLowerCase() !== 'nonaktif';
            return {
              id: String(r.id || generateAgendaUuid()),
              nip: String(r.nip || ''),
              username,
              email: '',
              namaLengkap: nama,
              jabatan: String(r.jabatan || ''),
              bidang: String(r.bidang ?? r.unit_kerja ?? 'Sekretariat BPBD'),
              roleKode: normalizeRoleCode(r.roleKode ?? r.role),
              isActive,
            };
          })
          .filter((x): x is UserAccount => x !== null);
      }
      if (typeof obj.exportedAt === 'string') exportedAt = obj.exportedAt;
      if (typeof obj.orgTitle === 'string' && obj.orgTitle.trim()) {
        parsedOrgTitle = obj.orgTitle.trim();
      }
    }

    const cleanAgendas = rawAgendas
      .map((item, idx) => normalizeImportedAgenda(item, idx))
      .filter((x): x is AgendaItem => x !== null);

    if (
      cleanAgendas.length === 0 &&
      (!rawMaster || rawMaster.length === 0) &&
      (!rawUsers || rawUsers.length === 0)
    ) {
      setImportError(
        'File JSON tidak berisi data agenda, akun ASN, atau master unit yang valid. Pastikan Anda memilih file backup SIAGA (.json).'
      );
      return;
    }

    setImportIncludeUsers(Boolean(perms.canManageUsers && rawUsers && rawUsers.length > 0));
    setImportPreview({
      fileName: sourceName,
      exportedAt,
      orgTitle: parsedOrgTitle,
      agendas: cleanAgendas,
      masterUnits: rawMaster,
      users: rawUsers,
    });
  };

  const handleSelectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    setImportError('');
    setImportPreview(null);
    if (!file) {
      inputEl.value = '';
      return;
    }

    try {
      // Read file BEFORE resetting inputEl.value so Android Chrome content:// URIs stay valid
      const text = await readFileTextCompat(file);
      parseBackupJsonAndPreview(text, file.name);
    } catch {
      setImportError(
        'File gagal dibaca dari penyimpanan perangkat. Coba pilih ulang file .json atau gunakan opsi "Tempel Teks JSON" di bawah.'
      );
    } finally {
      inputEl.value = '';
    }
  };

  const handleParsePastedBackup = () => {
    setImportError('');
    setImportPreview(null);
    try {
      parseBackupJsonAndPreview(pasteBackupText, 'Teks Backup JSON');
    } catch {
      setImportError('Teks JSON tidak valid. Pastikan seluruh isi file backup tersalin utuh.');
    }
  };

  const handleApplyImport = async (mode: 'merge' | 'replace') => {
    if (!importPreview) return;

    try {
      const { saved, addedCount } = await syncImportedAgendasToSupabase(
        importPreview.agendas,
        mode
      );
      await loadAgendasFromDb(true);

      if (
        perms.canManageUsers &&
        importIncludeUsers &&
        importPreview.users &&
        importPreview.users.length > 0
      ) {
        await syncImportedUsersToSupabase(importPreview.users, mode);
        await loadUsersFromDb(true);
      }

      setSupabaseError('');

      if (mode === 'replace') {
        if (importPreview.masterUnits && importPreview.masterUnits.length > 0) {
          setMasterUnits(importPreview.masterUnits);
        }
        if (importPreview.orgTitle) {
          setOrgTitle(importPreview.orgTitle);
        }
        appendAudit(
          'IMPORT_RESTORE_PENUH',
          'PERINGATAN',
          `Memulihkan penuh data dari "${importPreview.fileName}" ke Supabase (${saved.length} agenda).`
        );
        notify(
          `Berhasil memulihkan ${saved.length} agenda dari file backup ke Supabase.`,
          'success'
        );
      } else {
        if (importPreview.masterUnits && importPreview.masterUnits.length > 0) {
          setMasterUnits((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newUnits = importPreview.masterUnits!.filter((m) => !existingIds.has(m.id));
            return [...newUnits, ...prev];
          });
        }
        appendAudit(
          'IMPORT_GABUNG_DATA',
          'SUKSES',
          `Menggabungkan data dari "${importPreview.fileName}" ke Supabase (${addedCount} agenda baru ditambahkan).`
        );
        notify(
          addedCount > 0
            ? `Berhasil menyimpan ${addedCount} agenda baru ke Supabase.`
            : 'Semua data dari file backup sudah tersedia di Supabase.',
          'success'
        );
      }

      setImportPreview(null);
      setImportError('');
      setPasteBackupText('');
      setShowPasteBackup(false);
      setBackupModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan hasil import ke Supabase.';
      setImportError(`Gagal menyimpan ke Supabase: ${msg}`);
      notify(`Gagal import ke Supabase: ${msg}`, 'warning');
    }
  };

  // =========================================================================
  // LOGIN GATE RENDER (Smart ASN Sidoarjo Inspired + Dual Logos + Hidden Demo)
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#03241A] via-[#063E2E] to-[#081F36] flex flex-col justify-between p-4 sm:p-6 lg:p-10">
        {/* Decorative Smart-ASN Style Ambient Glows & Concentric Orbital Rings */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-28 -left-24 w-96 h-96 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-amber-400/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[540px] h-[540px] rounded-full border border-emerald-300/10" />
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-dashed border-emerald-200/15" />
          <div className="hidden lg:block absolute top-[22%] left-[12%] w-3 h-3 rounded-full bg-emerald-400/70 shadow-[0_0_16px_rgba(52,211,153,0.8)]" />
          <div className="hidden lg:block absolute bottom-[24%] left-[44%] w-2.5 h-2.5 rounded-full bg-amber-300/80 shadow-[0_0_14px_rgba(252,211,77,0.8)]" />
        </div>

        {/* Top Official Brand Bar (Dual Logos: Kab. Sidoarjo & BPBD Sidoarjo) */}
        <header className="relative z-10 max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-4 pb-6">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-1.5 shadow-lg">
              <img
                src={SIDOARJO_LOGO}
                alt="Lambang Kabupaten Sidoarjo"
                referrerPolicy="no-referrer"
                className="w-10 h-10 sm:w-11 sm:h-11 object-contain bg-white rounded-xl p-1"
              />
              <img
                src={BPBD_LOGO}
                alt="Logo BPBD Kabupaten Sidoarjo"
                referrerPolicy="no-referrer"
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover bg-white p-0.5"
              />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                Pemerintah Kabupaten Sidoarjo
              </p>
              <p className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                SIAGA AGENDA &middot; BPBD SIDOARJO
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-4 py-1.5 text-xs font-semibold text-emerald-100">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>Portal Kedinasan Terpadu ASN</span>
          </div>
        </header>

        {/* Main 2-Column Hero & Login Card */}
        <main className="relative z-10 max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center my-auto py-2">
          {/* Left Showcase Hero inspired by Smart ASN Sidoarjo */}
          <section className="lg:col-span-7 text-white space-y-6">
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold leading-[1.15] tracking-tight">
                Akselerasi Layanan{' '}
                <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-300 bg-clip-text text-transparent">
                  Agenda Kegiatan
                </span>{' '}
                BPBD Sidoarjo
              </h1>
              <p className="text-sm sm:text-base text-emerald-50/85 leading-relaxed max-w-xl font-normal">
                Platform digital resmi Sekretariat BPBD Kabupaten Sidoarjo untuk pencatatan agenda kegiatan, ekstraksi surat e-Buddy, rekapitulasi jadwal PDF/Excel, hingga publikasi poster WhatsApp real-time.
              </p>
            </div>

            {/* Clean Smart-ASN Style Feature Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 px-3.5 py-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-400/20 text-emerald-300 flex items-center justify-center shrink-0">
                  <ClipboardPaste className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">Input e-Buddy</p>
                  <p className="text-[11px] text-emerald-100/75 truncate">Ekstrak surat cepat</p>
                </div>
              </div>
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 px-3.5 py-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">Rekap Lengkap</p>
                  <p className="text-[11px] text-emerald-100/75 truncate">Ekspor PDF &amp; Excel</p>
                </div>
              </div>
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 px-3.5 py-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-400/20 text-sky-300 flex items-center justify-center shrink-0">
                  <Share2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">Poster WA</p>
                  <p className="text-[11px] text-emerald-100/75 truncate">Unduh PNG / JPG</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-emerald-100/80 pt-1">
              <MapPin className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Jl. Sultan Agung No. 19, Gajah Timur, Magersari, Kec. Sidoarjo, Kabupaten Sidoarjo, Jawa Timur 61212</span>
            </div>
          </section>

          {/* Right Elevated White Login Card */}
          <section className="lg:col-span-5">
            <div className="rounded-3xl bg-white shadow-2xl border border-white/20 p-6 sm:p-8 space-y-5">
              {/* Dual Logo Header Inside Card for Mobile & Clarity */}
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    Akses Pegawai &amp; Pimpinan
                  </span>
                  <h2 className="text-xl font-extrabold text-slate-900 mt-1.5">
                    Portal Masuk SIAGA
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <img
                    src={SIDOARJO_LOGO}
                    alt="Sidoarjo"
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 object-contain rounded-lg border border-slate-100 p-0.5"
                  />
                  <img
                    src={BPBD_LOGO}
                    alt="BPBD"
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover border border-amber-300 p-0.5"
                  />
                </div>
              </div>

              {supabaseError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>{supabaseError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadUsersFromDb(false)}
                    className="px-3 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold"
                  >
                    Muat Ulang dari Supabase
                  </button>
                </div>
              )}

              {loginError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-800 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              {isLoadingUsers && users.length === 0 && !supabaseError ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 text-xs font-semibold text-emerald-800 text-center">
                  Mengambil daftar akun ASN dari Supabase...
                </div>
              ) : !isLoadingUsers && isSupabaseConfigured && !supabaseError && users.length === 0 ? (
                <form onSubmit={handleBootstrapFirstAdmin} className="space-y-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950">
                    Tabel <code className="font-mono font-bold">akun_asn</code> di Supabase masih kosong. Daftarkan <strong>Akun Super Admin Pertama</strong> untuk mulai mengelola sistem:
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nama Lengkap ASN <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={bootstrapAdmin.namaLengkap}
                      onChange={(e) =>
                        setBootstrapAdmin({ ...bootstrapAdmin, namaLengkap: e.target.value })
                      }
                      placeholder="Contoh: Drs. Budi Santoso, M.Si."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        NIP <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={bootstrapAdmin.nip}
                        onChange={(e) =>
                          setBootstrapAdmin({ ...bootstrapAdmin, nip: e.target.value })
                        }
                        placeholder="18 digit NIP"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Username <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={bootstrapAdmin.username}
                        onChange={(e) =>
                          setBootstrapAdmin({ ...bootstrapAdmin, username: e.target.value })
                        }
                        placeholder="admin.bpbd"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Jabatan</label>
                      <input
                        type="text"
                        value={bootstrapAdmin.jabatan}
                        onChange={(e) =>
                          setBootstrapAdmin({ ...bootstrapAdmin, jabatan: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Unit Kerja</label>
                      <input
                        type="text"
                        value={bootstrapAdmin.bidang}
                        onChange={(e) =>
                          setBootstrapAdmin({ ...bootstrapAdmin, bidang: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isBootstrappingAdmin}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#065F46] via-[#047857] to-[#033A2C] hover:opacity-95 disabled:opacity-50 text-white text-sm font-bold tracking-wide shadow-md transition cursor-pointer"
                  >
                    {isBootstrappingAdmin
                      ? 'MENYIMPAN KE SUPABASE...'
                      : 'SIMPAN SUPER ADMIN & MASUK'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      NIP / Username Kedinasan <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={loginIdentity}
                      onChange={(e) => setLoginIdentity(e.target.value)}
                      placeholder="Masukkan NIP atau username terdaftar..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700 transition"
                      autoComplete="username"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Kata Sandi <span className="text-[11px] font-normal text-slate-400">(opsional jika akun tanpa sandi)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Kosongkan jika langsung via NIP/Username..."
                        className="w-full pl-3.5 pr-11 py-2.5 rounded-xl border border-slate-300 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700 transition"
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
                    <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberSession}
                        onChange={(e) => setRememberSession(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span>Ingat sesi jam kerja (8 jam)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotHelp((p) => !p)}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-semibold shrink-0"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Bantuan Akses?</span>
                    </button>
                  </div>

                  {showForgotHelp && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950">
                      Masuk menggunakan NIP atau Username yang berstatus <strong>Aktif</strong> pada tabel <code className="font-mono">akun_asn</code> di Supabase. Hubungi Super Admin BPBD Sidoarjo jika akun Anda belum terdaftar.
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={remainingLockSeconds > 0 || isLoggingIn}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#065F46] via-[#047857] to-[#033A2C] hover:opacity-95 disabled:opacity-50 text-white text-sm font-bold tracking-wide shadow-md transition cursor-pointer"
                  >
                    {isLoggingIn ? 'MEMVERIFIKASI AKUN SUPABASE...' : 'MASUK KE DASHBOARD SIAGA'}
                  </button>
                </form>
              )}

              <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 border-t border-slate-100">
                Akses resmi ASN &amp; Pegawai BPBD Kabupaten Sidoarjo. Data akun &amp; jadwal terhubung langsung ke Supabase.
              </p>
            </div>
          </section>
        </main>

        {/* Bottom Footer */}
        <footer className="relative z-10 max-w-6xl w-full mx-auto pt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-100/60">
          <span>&copy; 2026 BPBD Kabupaten Sidoarjo &middot; Sistem Informasi Agenda</span>
          <span>Sidoarjo Tangguh &middot; Selamat Bersama</span>
        </footer>
      </div>
    );
  }

  // =========================================================================
  // AUTHENTICATED SHELL: 7-ITEM DARK NAVY SIDEBAR
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
      badgeColor: 'text-emerald-400',
    },
    {
      id: 'ebuddy',
      label: 'Input Agenda',
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
      label: 'Rekap Agenda',
      icon: FileText,
      visible: true,
    },
    {
      id: 'broadcast_wa',
      label: 'Rekap & Broadcast WA',
      icon: Share2,
      visible: perms.canOpenCardStudio,
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
    ebuddy: 'Input Agenda',
    kalender: 'Kalender & Linimasa WIB',
    rekap_harian: 'Rekap Agenda',
    broadcast_wa: 'Rekap & Broadcast WhatsApp',
    master_unit: 'Master Unit & Lokasi',
    super_admin:
      role === 'ROLE_DISPOSISI' ? 'Audit Log Keamanan' : 'Super Admin & Pengguna',
  };

  const unitLocations = masterUnits.filter((m) => m.tipe === 'Lokasi / Ruangan');
  const unitBidangs = masterUnits.filter((m) => m.tipe === 'Unit / Bidang');

  const filteredAuditLogs =
    auditFilter === 'ALL'
      ? auditLogs
      : auditLogs.filter((l) => l.status === auditFilter);

  return (
    <div className="min-h-screen bg-[#F2F7F4] text-slate-900 flex">
      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Smart-ASN Emerald Green Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-[#03241A] via-[#042A20] to-[#021C14] text-white flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col min-h-0 flex-1">
          {/* Sidebar Top Brand */}
          <div className="px-4 py-4 border-b border-emerald-400/15 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-1.5 bg-white/10 rounded-xl p-1 shrink-0">
                <img
                  src={SIDOARJO_LOGO}
                  alt="Sidoarjo"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-contain bg-white p-0.5"
                />
                <img
                  src={BPBD_LOGO}
                  alt="BPBD Sidoarjo"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-cover bg-white p-0.5"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-extrabold tracking-tight text-white truncate">
                  SIAGA AGENDA BPBD
                </p>
                <p className="text-[11px] text-emerald-200/80 truncate">Kabupaten Sidoarjo</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-emerald-200 hover:bg-white/10 hover:text-white"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
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
                      ? 'bg-[#0A4D3A] text-white border border-emerald-400/25 shadow-xs'
                      : 'text-emerald-100/75 hover:bg-white/8 hover:text-white'
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

        {/* Sidebar Bottom User Footer + Backup/Import + Logout */}
        <div className="p-4 border-t border-emerald-400/15 space-y-2.5 bg-[#021B13]">
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-bold text-white truncate">{currentUser.namaLengkap}</p>
            <p className="text-xs font-medium text-emerald-300 truncate">
              {ROLE_META[currentUser.roleKode].shortLabel} &middot; {currentUser.bidang}
            </p>
            <p className="font-mono text-[11px] text-emerald-200/60 truncate">
              NIP {currentUser.nip}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setImportError('');
              setImportPreview(null);
              setBackupModalOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/30 text-xs font-bold text-emerald-100 transition cursor-pointer"
          >
            <Database className="w-4 h-4 text-emerald-300" />
            <span>Backup &amp; Import Data</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/8 hover:bg-white/14 border border-emerald-400/15 text-xs font-semibold text-white transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar Sesi (Logout)</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-emerald-100 px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-emerald-50"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {viewTitleMap[activeView]}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden sm:inline-block text-xs font-bold text-emerald-700 whitespace-nowrap">
              {ROLE_META[currentUser.roleKode].shortLabel}
            </span>
            <button
              type="button"
              onClick={() => {
                setImportError('');
                setImportPreview(null);
                setBackupModalOpen(true);
              }}
              title="Backup & Import Data Agenda (.json)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800 transition cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Backup / Import</span>
            </button>
            {simultaneousDayItems.length > 0 && (
              <button
                type="button"
                onClick={() => setReminderPopupOpen(true)}
                title={`${simultaneousDayItems.length} agenda bersamaan pada ${formatTanggalLengkap(selectedDate)} — Klik untuk tampilkan`}
                aria-label="Pengingat agenda bersamaan"
                className="relative w-9 h-9 rounded-full bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center transition shadow-xs cursor-pointer"
              >
                <BellRing className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
                  {simultaneousDayItems.length}
                </span>
              </button>
            )}
          </div>
        </header>

        {/* Active View Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {supabaseError && (
            <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Koneksi Database Supabase Memerlukan Penyesuaian</p>
                  <p className="text-amber-900/90">{supabaseError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadUsersFromDb(false);
                  void loadAgendasFromDb(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs cursor-pointer"
              >
                Coba Hubungkan Ulang
              </button>
            </div>
          )}

          {isLoadingAgendas && agendas.length === 0 && !supabaseError && (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs">
              Memuat data jadwal permanen dari database Supabase...
            </div>
          )}

          {(activeView === 'dashboard' ||
            activeView === 'kalender' ||
            activeView === 'rekap_harian' ||
            activeView === 'master_unit') && (
            <DashboardView
              activeView={activeView}
              role={role}
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
              onToggleStatus={handleToggleStatus}
              onOpenSinglePoster={(item) => {
                setFocusedAgenda(item);
                setCardMode('tunggal');
                setActiveView('broadcast_wa');
              }}
              onOpenMasterModal={openMasterModal}
              onRequestDeleteMaster={handleRequestDeleteMaster}
              onNotify={notify}
            />
          )}

          {/* VIEW: INPUT SURAT / e-BUDDY */}
          {activeView === 'ebuddy' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-100 bg-white p-5 sm:p-6 shadow-sm space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-emerald-700">
                    Input Jadwal &amp; Ekstraksi Surat e-Buddy
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    Input Agenda Kegiatan
                  </h2>
                  <p className="text-sm text-slate-600 max-w-2xl">
                    Klik tombol <strong>Input Agenda Baru</strong> untuk mengisi jadwal secara langsung, atau tempel teks surat masuk e-Buddy di bawah ini.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openNewAgendaModal()}
                  className="w-full py-3.5 px-5 rounded-xl bg-[#064E3B] hover:bg-[#065F46] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Input Agenda Baru</span>
                </button>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <Clipboard className="w-4 h-4 text-emerald-700" />
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
                          className="text-left px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50/70 hover:border-emerald-300 text-xs font-semibold text-slate-800 transition"
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Tempel teks undangan, e-Buddy, atau pesan WhatsApp
                    </label>
                    <textarea
                      rows={8}
                      value={ebuddyRawText}
                      onChange={(e) => handleRunEBuddyExtract(e.target.value)}
                      placeholder={`Contoh format:\nPerihal: Rapat Koordinasi Hidrometeorologi\nHari/Tanggal: Senin, 23 November 2026\nPukul: 08.00 - 10.30 WIB\nTempat: Ruang Rapat Setda Kab. Sidoarjo\nBidang: Bid. KL`}
                      className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700"
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
                    <div className="rounded-xl border border-emerald-200 bg-white p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-emerald-700" />
                          <span className="text-sm font-bold text-slate-900">
                            Hasil Ekstraksi Otomatis ({ebuddyPreview.detectedFields.length} field terdeteksi)
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {ebuddyPreview.detectedFields.map((f) => (
                            <span
                              key={f}
                              className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold"
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
                          <span className="text-slate-500">Bidang / Penyelenggara:</span>
                          <p className="font-bold text-slate-900 mt-0.5">
                            {ebuddyPreview.penyelenggara}
                          </p>
                        </div>
                      </div>

                      {ebuddyConflicts.length > 0 && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-amber-950">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              Terdeteksi {ebuddyConflicts.length} Jadwal Beririsan di Supabase
                            </span>
                          </div>
                          {ebuddyConflicts.slice(0, 3).map((ov) => (
                            <p key={ov.agenda.id} className="text-[11px] pl-5">
                              &bull; {ov.agenda.judul} ({formatRentangWaktu(ov.agenda)}) — irisan{' '}
                              {ov.overlapMinutes} mnt
                            </p>
                          ))}
                        </div>
                      )}

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

                    <button
                      type="button"
                      onClick={async () => {
                        if (!posterCanvasRef.current) return;
                        const res = await sharePosterWithImage(
                          posterCanvasRef.current,
                          `Agenda_BPBD_Sidoarjo_${selectedDate}`
                        );
                        if (res === 'shared') {
                          notify('Poster gambar siap dikirim ke WhatsApp!', 'success');
                        } else if (res === 'fallback') {
                          notify(
                            'Browser/preview membatasi share file langsung; gambar PNG diunduh agar siap dikirim ke WhatsApp.',
                            'info'
                          );
                        }
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-bold shadow-xs cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share Gambar ke WhatsApp</span>
                    </button>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const caption =
                            cardMode === 'tunggal' && focusedAgenda
                              ? buildSingleAgendaText(focusedAgenda, orgTitle)
                              : buildWhatsAppCaption(posterAgendas, selectedDate, orgTitle, showZoomUrl);
                          try {
                            await navigator.clipboard.writeText(caption);
                            notify('Teks agenda WhatsApp berhasil disalin!', 'success');
                          } catch {
                            notify('Gagal menyalin teks; silakan salin dari pratinjau teks.', 'warning');
                          }
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold shadow-xs transition cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Salin Teks Agenda</span>
                      </button>

                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          cardMode === 'tunggal' && focusedAgenda
                            ? buildSingleAgendaText(focusedAgenda, orgTitle)
                            : buildWhatsAppCaption(posterAgendas, selectedDate, orgTitle, showZoomUrl)
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          const caption =
                            cardMode === 'tunggal' && focusedAgenda
                              ? buildSingleAgendaText(focusedAgenda, orgTitle)
                              : buildWhatsAppCaption(posterAgendas, selectedDate, orgTitle, showZoomUrl);
                          navigator.clipboard?.writeText(caption);
                          notify('Membuka WhatsApp dengan teks agenda.', 'info');
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-green-300 bg-green-50 hover:bg-green-100 text-green-900 text-xs font-bold shadow-xs transition"
                      >
                        <Share2 className="w-3.5 h-3.5 text-green-700" />
                        <span>Kirim Teks (wa.me)</span>
                      </a>
                    </div>
                  </div>

                  {/* Preview Box Teks Agenda */}
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        Pratinjau Teks Agenda Siap Salin
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700">
                        {cardMode === 'tunggal' && focusedAgenda
                          ? '1 agenda'
                          : `${posterAgendas.length} agenda`}
                      </span>
                    </div>
                    <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-700 bg-white rounded-lg border border-emerald-100 p-2.5 select-all">
                      {cardMode === 'tunggal' && focusedAgenda
                        ? buildSingleAgendaText(focusedAgenda, orgTitle)
                        : buildWhatsAppCaption(posterAgendas, selectedDate, orgTitle, showZoomUrl)}
                    </pre>
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-100 text-sm text-slate-700">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showUpdatedBadge}
                        onChange={(e) => setShowUpdatedBadge(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                      />
                      <span>Tandai agenda [UPDATE / BARU]</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showZoomUrl}
                        onChange={(e) => setShowZoomUrl(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                      />
                      <span>Sertakan URL tautan Zoom di poster</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showIllustration}
                        onChange={(e) => setShowIllustration(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600"
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

                    {showIllustration &&
                      (cardMode === 'tunggal' && focusedAgenda
                        ? [focusedAgenda]
                        : posterAgendas
                      ).length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                              Ilustrasi Sisi Kanan Per Baris
                            </span>
                            <span className="text-[10px] font-semibold text-emerald-700">
                              Otomatis / Custom
                            </span>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                            {(cardMode === 'tunggal' && focusedAgenda
                              ? [focusedAgenda]
                              : posterAgendas
                            ).map((item) => {
                              const resolvedKey = resolvePosterIllustrationKey(item);
                              const resolvedLabel =
                                POSTER_ILLUSTRATION_OPTIONS.find((o) => o.value === resolvedKey)
                                  ?.label || resolvedKey;
                              return (
                                <div
                                  key={item.id}
                                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 space-y-1"
                                >
                                  <p className="text-[11px] font-semibold text-slate-800 truncate">
                                    {item.jamMulai} · {item.judul}
                                  </p>
                                  <select
                                    value={item.ilustrasi || 'auto'}
                                    onChange={async (e) => {
                                      const nextVal = e.target.value as PosterIllustrationKey;
                                      setAgendas((prev) =>
                                        prev.map((a) =>
                                          a.id === item.id ? { ...a, ilustrasi: nextVal } : a
                                        )
                                      );
                                      if (focusedAgenda?.id === item.id) {
                                        setFocusedAgenda({ ...focusedAgenda, ilustrasi: nextVal });
                                      }
                                      try {
                                        await updateAgendaInSupabase(
                                          item.id,
                                          { ilustrasi: nextVal },
                                          item
                                        );
                                      } catch (err) {
                                        const msg =
                                          err instanceof Error
                                            ? err.message
                                            : 'Gagal menyimpan ilustrasi ke Supabase.';
                                        notify(msg, 'warning');
                                      }
                                    }}
                                    className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-[11px] font-medium text-slate-700"
                                  >
                                    <option value="auto">Otomatis ({resolvedLabel})</option>
                                    {POSTER_ILLUSTRATION_OPTIONS.filter((o) => o.value !== 'auto').map(
                                      (opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                  </div>
                </div>

                {/* Right Live Canvas Poster Preview */}
                <div className="xl:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Pratinjau Poster WhatsApp (Resolusi HD 2160px)
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      {posterAgendas.length} kegiatan ditampilkan
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-100 p-2 sm:p-3 overflow-auto">
                    <canvas
                      ref={posterCanvasRef}
                      className="w-full h-auto max-w-[720px] mx-auto rounded-xl shadow-md block bg-white"
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
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
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
                            ? 'bg-[#064E3B] text-white'
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
                            ? 'bg-[#064E3B] text-white'
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => void loadUsersFromDb(false)}
                        disabled={isLoadingUsers}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-60"
                      >
                        <Database className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{isLoadingUsers ? 'Memuat Supabase...' : 'Segarkan dari Supabase'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openUserModal()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#064E3B] hover:bg-[#065F46] text-white text-xs font-bold"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Tambah Akun ASN</span>
                      </button>
                    </div>

                    {isLoadingUsers && users.length === 0 ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-6 text-center text-xs font-semibold text-emerald-800">
                        Mengambil data Akun ASN langsung dari tabel akun_asn di Supabase...
                      </div>
                    ) : users.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-600">
                        Belum ada data di tabel <code className="font-mono font-bold">akun_asn</code>. Klik <strong>Tambah Akun ASN</strong> untuk menyimpan akun ke Supabase.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {users.map((u) => (
                          <div
                            key={u.id}
                            className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-3 bg-white"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800">
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
                                {u.jabatan || '-'} &middot; {u.bidang}
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
                                <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleUserActive(u)}
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
                    )}
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
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#064E3B] hover:bg-[#065F46] text-white text-xs font-semibold"
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
                    {agendaForm.sampaiSelesai ? 'Estimasi Jam Selesai' : 'Jam Selesai *'}
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

              {modalConflicts.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-xs text-amber-950">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Deteksi Bentrok: {modalConflicts.length} jadwal lain bersamaan di tanggal ini
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const dur = Math.max(
                          60,
                          timeToMinutes(agendaForm.jamSelesai) - timeToMinutes(agendaForm.jamMulai)
                        );
                        const slot = findNextAvailableSlot(
                          agendas,
                          agendaForm.tanggal,
                          dur,
                          agendaForm.id
                        );
                        if (slot) {
                          setAgendaForm({
                            ...agendaForm,
                            jamMulai: slot.jamMulai,
                            jamSelesai: slot.jamSelesai,
                            sampaiSelesai: false,
                          });
                          notify(
                            `Menemukan jam kosong: ${slot.jamMulai} - ${slot.jamSelesai} WIB.`,
                            'info'
                          );
                        } else {
                          notify('Tidak ditemukan slot kosong pada jam kerja tanggal tersebut.', 'warning');
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold cursor-pointer"
                    >
                      Cari Jam Kosong
                    </button>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-amber-900 pl-5">
                    {modalConflicts.slice(0, 3).map((ov) => (
                      <div key={ov.agenda.id}>
                        &bull; <strong>{ov.agenda.judul}</strong> ({formatRentangWaktu(ov.agenda)})
                        — irisan {ov.overlapMinutes} mnt
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                  Foto / Ilustrasi Poster WhatsApp
                </label>
                <select
                  value={agendaForm.ilustrasi}
                  onChange={(e) =>
                    setAgendaForm({
                      ...agendaForm,
                      ilustrasi: e.target.value as PosterIllustrationKey,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  {POSTER_ILLUSTRATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
                    Agenda Sifat Terbatas (Khusus Pimpinan/Super Admin)
                  </span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingAgenda}
                  onClick={() => setAgendaModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingAgenda}
                  className="px-5 py-2 rounded-xl bg-[#064E3B] hover:bg-[#065F46] text-white text-xs font-bold disabled:opacity-60"
                >
                  {isSavingAgenda ? 'Menyimpan ke Supabase...' : 'Simpan Agenda'}
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
                  className="px-4 py-2 rounded-xl bg-[#064E3B] hover:bg-[#065F46] text-white text-xs font-bold"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Unit Kerja / Bidang
                  </label>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status Akun</label>
                  <select
                    value={userForm.isActive ? 'Aktif' : 'Nonaktif'}
                    onChange={(e) =>
                      setUserForm({ ...userForm, isActive: e.target.value === 'Aktif' })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingUser}
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-4 py-2 rounded-xl bg-[#064E3B] hover:bg-[#065F46] text-white text-xs font-bold disabled:opacity-60"
                >
                  {isSavingUser ? 'Menyimpan ke Supabase...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CLICK-TRIGGERED PENGINGAT AGENDA BERSAMAAN */}
      {reminderPopupOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
          onClick={() => setReminderPopupOpen(false)}
        >
          <div
            className="w-full max-w-xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-amber-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-[#03241A] via-[#064E3B] to-[#047857] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 text-amber-300 flex items-center justify-center shrink-0">
                  <BellRing className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold truncate">
                    Pengingat Agenda Bersamaan
                  </h3>
                  <p className="text-[11px] text-emerald-100 truncate">
                    {formatTanggalLengkap(selectedDate)} &middot; {simultaneousDayItems.length} kegiatan beririsan waktu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReminderPopupOpen(false)}
                className="p-1.5 rounded-lg text-emerald-100 hover:bg-white/10 hover:text-white shrink-0"
                aria-label="Tutup pengingat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-3">
              {simultaneousDayItems.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">
                  Tidak ada agenda dengan jam bersamaan pada tanggal ini.
                </p>
              ) : (
                simultaneousDayItems.map((item) => {
                  const overlaps = getConflictsForCandidate(agendas, item);
                  const nextSlot = findNextAvailableSlot(
                    agendas,
                    item.tanggal,
                    timeToMinutes(item.jamSelesai) - timeToMinutes(item.jamMulai),
                    item.id
                  );
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900">
                          {formatRentangWaktu(item)}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          PIC: {item.pejabatPendamping || item.penyelenggara}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">
                        {item.judul}
                      </h4>
                      <p className="text-xs text-slate-600">{item.lokasi}</p>
                      <div className="text-[11px] text-amber-800 space-y-0.5 pt-1 border-t border-amber-200/70">
                        {overlaps.map((ov) => (
                          <div key={ov.agenda.id}>
                            &bull; Bersamaan {ov.overlapMinutes} mnt dengan:{' '}
                            <strong className="text-slate-900">{ov.agenda.judul}</strong> (
                            {formatRentangWaktu(ov.agenda)})
                          </div>
                        ))}
                      </div>
                      {perms.canEditAgenda && (
                        <div className="flex flex-wrap items-center gap-2 pt-1.5">
                          {nextSlot && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await updateAgendaInSupabase(
                                    item.id,
                                    {
                                      jamMulai: nextSlot.jamMulai,
                                      jamSelesai: nextSlot.jamSelesai,
                                      sampaiSelesai: false,
                                      isUpdated: true,
                                    },
                                    item
                                  );
                                  await loadAgendasFromDb(true);
                                  if (focusedAgenda?.id === updated.id) {
                                    setFocusedAgenda(updated);
                                  }
                                  appendAudit(
                                    'GESER_JADWAL',
                                    'SUKSES',
                                    `Menggeser "${item.judul}" ke ${nextSlot.jamMulai}-${nextSlot.jamSelesai} WIB di Supabase.`
                                  );
                                  notify(
                                    `Jadwal digeser ke ${nextSlot.jamMulai} - ${nextSlot.jamSelesai} WIB.`,
                                    'success'
                                  );
                                } catch (err) {
                                  const msg =
                                    err instanceof Error
                                      ? err.message
                                      : 'Gagal menggeser jadwal di Supabase.';
                                  notify(msg, 'warning');
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[#064E3B] hover:bg-[#065F46] text-white text-[11px] font-bold"
                            >
                              Geser ke {nextSlot.jamMulai} - {nextSlot.jamSelesai} WIB
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setReminderPopupOpen(false);
                              openEditAgendaModal(item);
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setReminderPopupOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#064E3B] hover:bg-[#065F46] text-white text-xs font-bold"
              >
                Tutup Pengingat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BACKUP & IMPORT DATA (.JSON) */}
      {backupModalOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/60 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setBackupModalOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[84vh] rounded-2xl bg-white shadow-2xl border border-emerald-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-[#03241A] via-[#064E3B] to-[#047857] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5 text-emerald-200" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold truncate">Backup &amp; Import Data</h3>
                  <p className="text-[11px] text-emerald-100 truncate">
                    Simpan cadangan atau pulihkan jadwal saat pembaruan aplikasi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                className="p-1.5 rounded-lg text-emerald-100 hover:bg-white/10 hover:text-white shrink-0"
                aria-label="Tutup backup dan import"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Current Data Summary */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Total Agenda</p>
                  <p className="text-lg font-extrabold text-emerald-800 tabular-nums">
                    {agendas.length}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Master Unit</p>
                  <p className="text-lg font-extrabold text-emerald-800 tabular-nums">
                    {masterUnits.length}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Akun ASN</p>
                  <p className="text-lg font-extrabold text-emerald-800 tabular-nums">
                    {users.length}
                  </p>
                </div>
              </div>

              {/* Section 1: Export / Backup */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-4 space-y-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-700" />
                    1. Backup Data Sekarang (.json)
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Unduh seluruh data agenda, master unit/lokasi, dan pengaturan dalam satu file cadangan (.json) sebelum melakukan update atau pindah perangkat.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadBackupJson}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#064E3B] hover:bg-[#065F46] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh File Backup (.json)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyBackupJson}
                    className="py-2.5 px-3.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin JSON</span>
                  </button>
                </div>
              </div>

              {/* Section 2: Import / Restore */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-teal-700" />
                    2. Import / Pulihkan Data (.json)
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Pilih file backup <code className="font-mono text-[11px] bg-white px-1 rounded border border-slate-200">.json</code> yang pernah diunduh untuk mengembalikan atau menggabungkan jadwal.
                  </p>
                </div>

                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json,application/json,text/plain"
                  onChange={handleSelectBackupFile}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl border border-teal-300 bg-white hover:bg-teal-50 text-teal-900 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-teal-700" />
                  <span>Pilih File Backup (.json) dari Perangkat</span>
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowPasteBackup((v) => !v)}
                    className="text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
                  >
                    {showPasteBackup
                      ? 'Sembunyikan input tempel teks JSON'
                      : 'Atau tempel teks isi file backup JSON langsung'}
                  </button>
                </div>

                {showPasteBackup && (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <textarea
                      rows={4}
                      value={pasteBackupText}
                      onChange={(e) => setPasteBackupText(e.target.value)}
                      placeholder='Tempel seluruh isi JSON backup di sini (diawali dengan { "app": "SIAGA-AGENDA-BPBD-SIDOARJO" ... })'
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                    />
                    <button
                      type="button"
                      onClick={handleParsePastedBackup}
                      disabled={!pasteBackupText.trim()}
                      className="w-full py-2 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                    >
                      Baca &amp; Pratinjau Teks JSON
                    </button>
                  </div>
                )}

                {importError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{importError}</span>
                  </div>
                )}

                {importPreview && (
                  <div className="rounded-xl border border-emerald-200 bg-white p-3.5 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-emerald-900 truncate">
                        File siap dipulihkan: {importPreview.fileName}
                      </p>
                      {importPreview.exportedAt && (
                        <p className="text-[11px] text-slate-500">
                          Dibuat pada:{' '}
                          {new Date(importPreview.exportedAt).toLocaleString('id-ID')}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-bold">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {importPreview.agendas.length} Agenda
                        </span>
                        {importPreview.masterUnits && (
                          <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                            {importPreview.masterUnits.length} Master Unit
                          </span>
                        )}
                        {importPreview.users && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {importPreview.users.length} Akun ASN
                          </span>
                        )}
                      </div>
                    </div>

                    {perms.canManageUsers &&
                      importPreview.users &&
                      importPreview.users.length > 0 && (
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={importIncludeUsers}
                            onChange={(e) => setImportIncludeUsers(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-700"
                          />
                          <span>Sertakan data Akun ASN dari file backup</span>
                        </label>
                      )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleApplyImport('merge')}
                        className="py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
                      >
                        Gabungkan (Aman)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyImport('replace')}
                        className="py-2 px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold cursor-pointer"
                      >
                        Pulihkan Penuh (Timpa)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                  : 'bg-[#042A20] text-white border-emerald-800'
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
