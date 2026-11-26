import headerHeroSrc from './assets/images/bpbd_header_jayandaru_v2_1795689517335.jpg';
import actApelSrc from './assets/images/poster_act_apel_1795732541541.jpg';
import actCuacaSrc from './assets/images/poster_act_cuaca_1795732541813.jpg';
import actDamkarSrc from './assets/images/poster_act_damkar_1795663073443.jpg';
import actDigitalAiSrc from './assets/images/poster_act_digital_ai_1795736360078.jpg';
import actHotelFgdSrc from './assets/images/poster_act_hotel_fgd_1795736358946.jpg';
import actK3ZoomSrc from './assets/images/poster_act_k3_zoom_1795736359160.jpg';
import actKunjunganSrc from './assets/images/poster_act_kunjungan_1795736361840.jpg';
import actLapanganSrc from './assets/images/poster_act_lapangan_sidoarjo_1795663106684.jpg';
import actPesantrenSrc from './assets/images/poster_act_pesantren_1795736361107.jpg';
import actRapatSrc from './assets/images/poster_act_rapat_1795663074204.jpg';
import actSenamSrc from './assets/images/poster_act_senam_1795732540938.jpg';
import actZoomPusdalopsSrc from './assets/images/poster_act_zoom_pusdalops_1795736359326.jpg';
import {
  AgendaItem,
  BULAN_ID,
  CardMode,
  CardTheme,
  PosterIllustrationKey,
  formatRentangWaktu,
  formatTanggalLengkap,
} from './types';

export interface PosterRenderOptions {
  agendas: AgendaItem[];
  selectedDate: string;
  selectedMonth: string; // YYYY-MM
  cardMode: CardMode;
  cardTheme: CardTheme;
  focusedAgenda: AgendaItem | null;
  orgTitle: string;
  showUpdatedBadge: boolean;
  showZoomUrl: boolean;
  showIllustration: boolean;
}

const BPBD_LOGO_SRC = '/assets/aistudio/images__14__e7f780c6.jpeg';

const imageCache = new Map<string, HTMLImageElement | null>();
const loadingSet = new Set<string>();

function loadCachedImage(src: string, onLoaded?: () => void): HTMLImageElement | null {
  if (imageCache.has(src)) {
    return imageCache.get(src) || null;
  }
  if (!loadingSet.has(src)) {
    loadingSet.add(src);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(src, img);
      loadingSet.delete(src);
      onLoaded?.();
    };
    img.onerror = () => {
      imageCache.set(src, null);
      loadingSet.delete(src);
    };
    img.src = src;
  }
  return null;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3
): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines) {
    const consumedWords = lines.join(' ').split(/\s+/).length;
    if (consumedWords < words.length) {
      let last = lines[maxLines - 1];
      while (last.length > 4 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

function drawVectorBpbdEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1E3A8A';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.48);
  ctx.lineTo(cx + r * 0.44, cy + r * 0.34);
  ctx.lineTo(cx - r * 0.44, cy + r * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const ILLUSTRATION_SRC_MAP: Record<Exclude<PosterIllustrationKey, 'auto'>, string> = {
  senam: actSenamSrc,
  apel: actApelSrc,
  cuaca: actCuacaSrc,
  hotel_fgd: actHotelFgdSrc,
  rapat: actRapatSrc,
  k3_zoom: actK3ZoomSrc,
  zoom: actZoomPusdalopsSrc,
  digital_ai: actDigitalAiSrc,
  pesantren: actPesantrenSrc,
  sekolah_edukasi: actLapanganSrc,
  damkar: actDamkarSrc,
  kunjungan: actKunjunganSrc,
};

export function resolvePosterIllustrationKey(
  item: AgendaItem
): Exclude<PosterIllustrationKey, 'auto'> {
  if (item.ilustrasi && item.ilustrasi !== 'auto' && ILLUSTRATION_SRC_MAP[item.ilustrasi]) {
    return item.ilustrasi;
  }
  const hay = `${item.judul} ${item.lokasi} ${item.penyelenggara} ${item.catatan || ''}`.toLowerCase();
  const isOnline =
    /zoom|daring|virtual|google meet|webinar|online|teleconference/.test(hay) ||
    Boolean(item.zoomUrl);

  if (isOnline && /k3|kebakaran|damkar|apar|safety|pemadam/.test(hay)) {
    return 'k3_zoom';
  }
  if (
    /\bai\b|kecerdasan buatan|medsos|media sosial|konten|pusdatin|infografis|sistem informasi|e-buddy|aplikasi|website|peringatan dini|dashboard|publikasi/.test(
      hay
    )
  ) {
    return 'digital_ai';
  }
  if (isOnline) {
    return 'zoom';
  }
  if (/senam|olahraga|kebugaran|jalan sehat|car free day|jogging|jumat sehat/.test(hay)) {
    return 'senam';
  }
  if (/apel|gladi|upacara|gelar pasukan|baris|patroli/.test(hay)) {
    return 'apel';
  }
  if (/pesantren|santri|pondok|madrasah|pramuka|ra muslimat|\bmi |\bmts |\bma /.test(hay)) {
    return 'pesantren';
  }
  if (
    /sekolah|smp|sma|smk|sdn|\bsd |\btk |siswa|pelajar|kampus|universitas|spab|destana|satlinmas|edukasi|mitigasi/.test(
      hay
    )
  ) {
    return 'sekolah_edukasi';
  }
  if (
    /angin|cuaca|anemometer|bmkg|iklim|puting beliung|hidrometeorologi|banjir|genangan|hujan|longsor/.test(
      hay
    )
  ) {
    return 'cuaca';
  }
  if (/damkar|kebakaran|pemadam|apar|rescue|sar|evakuasi|api|\bk3\b/.test(hay)) {
    return 'damkar';
  }
  if (
    /fgd|focus group|seminar|simposium|lokakarya|workshop|hotel|ballroom|rakornas|provinsi|jatim|bimtek|pelatihan/.test(
      hay
    )
  ) {
    return 'hotel_fgd';
  }
  if (
    /kunjungan|survei|survey|monitoring|tinjauan|cek lokasi|posko|logistik|bantuan|penyerahan|antar surat|dinas luar/.test(
      hay
    ) ||
    item.kategori === 'Kunjungan / Dinas'
  ) {
    return 'kunjungan';
  }
  if (/sosialisasi|penyuluhan|simulasi|masyarakat|desa|kecamatan/.test(hay)) {
    return 'sekolah_edukasi';
  }
  return 'rapat';
}

function pickActivityPhotoSrc(item: AgendaItem): string {
  return ILLUSTRATION_SRC_MAP[resolvePosterIllustrationKey(item)];
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / Math.max(1, img.height);
  const boxRatio = w / Math.max(1, h);
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawRowPhotoRight(
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  cardBgColor: string,
  item: AgendaItem,
  onReady?: () => void
) {
  const photoW = 240;
  const photoX = cardX + cardW - photoW;
  const photoImg = loadCachedImage(pickActivityPhotoSrc(item), onReady);

  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.clip();

  if (photoImg) {
    drawImageCover(ctx, photoImg, photoX, cardY, photoW, cardH);
  } else {
    const grad = ctx.createLinearGradient(photoX, cardY, photoX + photoW, cardY + cardH);
    grad.addColorStop(0, '#E2E8F0');
    grad.addColorStop(1, '#CBD5E1');
    ctx.fillStyle = grad;
    ctx.fillRect(photoX, cardY, photoW, cardH);
  }

  // Smooth editorial feather fade into card background without obscuring right visual subject
  const fadeGrad = ctx.createLinearGradient(photoX, 0, photoX + 78, 0);
  fadeGrad.addColorStop(0, cardBgColor);
  fadeGrad.addColorStop(0.24, cardBgColor);
  fadeGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(photoX - 4, cardY, 84, cardH);
  ctx.restore();
}

function drawClockIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Crisp inner clock hands (outer white ring is already drawn around iconCx/iconCy)
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + 7.5, cy + 4.5);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLocationPinIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.fillStyle = '#EA580C';
  ctx.beginPath();
  ctx.arc(cx, cy - 2.5, 5.8, Math.PI * 0.85, Math.PI * 2.15);
  ctx.lineTo(cx, cy + 7.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy - 2.5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSidoarjoSkylineSilhouette(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseY: number,
  isDark: boolean
) {
  ctx.save();

  ctx.fillStyle = isDark ? 'rgba(30, 58, 95, 0.25)' : 'rgba(186, 203, 224, 0.42)';
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  ctx.lineTo(0, baseY - 38);
  ctx.quadraticCurveTo(180, baseY - 96, 360, baseY - 52);
  ctx.quadraticCurveTo(560, baseY - 112, 780, baseY - 64);
  ctx.quadraticCurveTo(940, baseY - 104, width, baseY - 46);
  ctx.lineTo(width, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(11, 34, 62, 0.34)';
  ctx.fillRect(0, baseY - 8, width, 12);

  ctx.fillRect(28, baseY - 50, 34, 42);
  ctx.fillRect(68, baseY - 72, 42, 64);
  ctx.fillRect(118, baseY - 42, 30, 34);

  ctx.fillRect(210, baseY - 88, 7, 80);
  ctx.fillRect(262, baseY - 88, 7, 80);
  ctx.lineWidth = 2;
  ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(11, 34, 62, 0.34)';
  [175, 190, 290, 308].forEach((tx, idx) => {
    ctx.beginPath();
    ctx.moveTo(idx < 2 ? 213 : 265, baseY - 84);
    ctx.lineTo(tx, baseY - 12);
    ctx.stroke();
  });

  for (let tx = 335; tx <= 455; tx += 34) {
    ctx.beginPath();
    ctx.arc(tx, baseY - 22, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  const mx = 510;
  ctx.fillRect(mx - 22, baseY - 28, 44, 20);
  ctx.fillRect(mx - 14, baseY - 58, 28, 30);
  ctx.beginPath();
  ctx.moveTo(mx, baseY - 122);
  ctx.lineTo(mx + 12, baseY - 58);
  ctx.lineTo(mx - 12, baseY - 58);
  ctx.closePath();
  ctx.fill();

  const sx = 720;
  ctx.fillRect(sx - 18, baseY - 30, 36, 22);
  ctx.beginPath();
  ctx.moveTo(sx, baseY - 94);
  ctx.lineTo(sx + 11, baseY - 30);
  ctx.lineTo(sx - 11, baseY - 30);
  ctx.closePath();
  ctx.fill();

  ctx.fillRect(615, baseY - 46, 46, 38);
  ctx.fillRect(780, baseY - 52, 42, 44);
  ctx.fillRect(834, baseY - 76, 30, 68);
  ctx.fillRect(880, baseY - 44, 48, 36);
  ctx.fillRect(940, baseY - 88, 22, 80);
  ctx.fillRect(974, baseY - 60, 48, 52);
  ctx.fillRect(1030, baseY - 40, 50, 32);

  ctx.restore();
}

export function renderBroadcastPosterCanvas(
  canvas: HTMLCanvasElement,
  opts: PosterRenderOptions,
  onImageReady?: () => void
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = 1080;
  const scale = 2;
  const itemsToRender =
    opts.cardMode === 'tunggal' && opts.focusedAgenda
      ? [opts.focusedAgenda]
      : opts.agendas.slice(0, 12);

  const headerHeight = 236;
  const skylineHeight = 86;
  const footerHeight = 96;
  const badgeX = 24;
  const badgeW = 166;
  const cardX = 56;
  const cardRightMargin = 28;
  const cardW = width - cardX - cardRightMargin; // 996px
  const textX = badgeX + badgeW + 18; // 208px

  const rightEdge = cardX + cardW - 12; // 1040px
  const picZoneRight = opts.showIllustration ? rightEdge - 216 : rightEdge; // 824px
  const picW = 192;
  const picX = picZoneRight - picW; // 632px
  const textMaxW = picX - textX - 16; // ~408px when photo shown, ~620px when hidden

  const isDark = opts.cardTheme === 'gelap';
  const isCleanWhite = opts.cardTheme === 'putih';
  const cardBgColor = isDark ? '#12243B' : '#FFFFFF';

  const rowLayouts = itemsToRender.map((item) => {
    ctx.font = '700 22px "Poppins", system-ui, sans-serif';
    const titleLines = wrapTextLines(ctx, item.judul, textMaxW, 3);
    ctx.font = '500 17px "Poppins", system-ui, sans-serif';
    const locLines = wrapTextLines(ctx, `di ${item.lokasi}`, textMaxW - 22, 2);

    const hasBadgeTop = opts.showUpdatedBadge && Boolean(item.isUpdated);
    const hasZoomLine = opts.showZoomUrl && Boolean(item.zoomUrl);

    const contentH =
      (hasBadgeTop ? 24 : 0) +
      titleLines.length * 28 +
      locLines.length * 22 +
      (hasZoomLine ? 22 : 0) +
      30;
    const rowH = Math.max(114, contentH);
    return { item, titleLines, locLines, hasBadgeTop, hasZoomLine, rowH };
  });

  const bodyPaddingY = 24;
  const rowGap = 11;
  const rowsTotalH =
    rowLayouts.length > 0
      ? rowLayouts.reduce((acc, r) => acc + r.rowH + rowGap, 0) - rowGap
      : 200;

  const totalHeight = Math.max(
    780,
    headerHeight + bodyPaddingY * 2 + rowsTotalH + skylineHeight + footerHeight
  );

  // 2x HiDPI Canvas output (2160px wide) for razor-sharp WhatsApp image sharing
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Base Canvas Background
  if (isDark) {
    ctx.fillStyle = '#0B1626';
    ctx.fillRect(0, 0, width, totalHeight);
  } else if (isCleanWhite) {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, width, totalHeight);
  } else {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, totalHeight);
    bgGrad.addColorStop(0, '#EEF4FA');
    bgGrad.addColorStop(0.6, '#E8EFF7');
    bgGrad.addColorStop(1, '#DFE9F4');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, totalHeight);
  }

  // =========================================================================
  // 1. EDITORIAL HEADER BANNER (With Monumen Jayandaru Sidoarjo Photo)
  // =========================================================================
  const heroImg = loadCachedImage(headerHeroSrc, onImageReady);

  ctx.save();
  ctx.fillStyle = isDark ? '#061220' : '#081D36';
  ctx.fillRect(0, 0, width, headerHeight);

  if (heroImg) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(590, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, headerHeight);
    ctx.lineTo(525, headerHeight);
    ctx.closePath();
    ctx.clip();

    drawImageCover(ctx, heroImg, 515, 0, width - 515, headerHeight);

    const edgeFade = ctx.createLinearGradient(525, 0, 615, 0);
    edgeFade.addColorStop(0, isDark ? 'rgba(6,18,32,0.55)' : 'rgba(8,29,54,0.48)');
    edgeFade.addColorStop(1, 'rgba(8,29,54,0)');
    ctx.fillStyle = edgeFade;
    ctx.fillRect(520, 0, 105, headerHeight);

    const rightVig = ctx.createLinearGradient(width - 220, 0, width, 130);
    rightVig.addColorStop(0, 'rgba(8,22,40,0)');
    rightVig.addColorStop(1, 'rgba(8,22,40,0.78)');
    ctx.fillStyle = rightVig;
    ctx.fillRect(width - 230, 0, 230, 145);
    ctx.restore();
  }

  // Diagonal orange accent ribbon + thin gold hairline
  ctx.beginPath();
  ctx.moveTo(582, 0);
  ctx.lineTo(604, 0);
  ctx.lineTo(538, headerHeight);
  ctx.lineTo(516, headerHeight);
  ctx.closePath();
  ctx.fillStyle = '#EA580C';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(606, 0);
  ctx.lineTo(611, 0);
  ctx.lineTo(545, headerHeight);
  ctx.lineTo(540, headerHeight);
  ctx.closePath();
  ctx.fillStyle = '#FBBF24';
  ctx.fill();

  // Bottom curved orange edge bar across header
  ctx.fillStyle = '#EA580C';
  ctx.fillRect(0, headerHeight - 6, width, 6);
  ctx.restore();

  // Top-right tagline with crisp shadow
  ctx.save();
  ctx.textAlign = 'right';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 19px "Poppins", system-ui, sans-serif';
  ctx.fillText('Sidoarjo', width - 26, 36);
  ctx.fillText('Tangguh', width - 26, 58);
  ctx.fillStyle = '#FDE68A';
  ctx.font = '700 15px "Poppins", system-ui, sans-serif';
  ctx.fillText('Selamat', width - 26, 80);
  ctx.fillText('Bersama', width - 26, 100);
  ctx.restore();

  // Left Circular BPBD Logo
  const logoImg = loadCachedImage(BPBD_LOGO_SRC, onImageReady);
  const logoCx = 84;
  const logoCy = 78;
  const logoR = 46;
  if (logoImg) {
    ctx.save();
    ctx.fillStyle = '#EA580C';
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, logoCx - logoR, logoCy - logoR, logoR * 2, logoR * 2);
    ctx.restore();
  } else {
    drawVectorBpbdEmblem(ctx, logoCx, logoCy, logoR);
  }

  // Main Header Titles with subtle crisp drop shadow
  ctx.save();
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 42px "Poppins", system-ui, sans-serif';
  ctx.fillText(
    opts.cardMode === 'bulanan' ? 'REKAP BULANAN' : 'AGENDA KEGIATAN',
    148,
    74
  );
  ctx.fillStyle = '#FBBF24';
  ctx.font = '800 33px "Poppins", system-ui, sans-serif';
  ctx.fillText((opts.orgTitle || 'BPBD KAB. SIDOARJO').toUpperCase(), 148, 118);
  ctx.restore();

  // Orange Date Banner Pill
  let bannerText = formatTanggalLengkap(opts.selectedDate);
  if (opts.cardMode === 'bulanan') {
    const [yy, mm] = opts.selectedMonth.split('-').map(Number);
    bannerText = `Periode ${BULAN_ID[(mm || 1) - 1]} ${yy}`;
  } else if (opts.cardMode === 'tunggal' && opts.focusedAgenda) {
    bannerText = formatTanggalLengkap(opts.focusedAgenda.tanggal);
  }

  ctx.save();
  const pillGrad = ctx.createLinearGradient(32, 152, 526, 204);
  pillGrad.addColorStop(0, '#EA580C');
  pillGrad.addColorStop(1, '#F97316');
  drawRoundedRect(ctx, 32, 152, 496, 52, 26);
  ctx.fillStyle = pillGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.34)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.4;
  drawRoundedRect(ctx, 54, 167, 22, 22, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(54, 175);
  ctx.lineTo(76, 175);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 22px "Poppins", system-ui, sans-serif';
  ctx.fillText(bannerText, 90, 186);
  ctx.restore();

  // =========================================================================
  // 2. TIMELINE SPINE & AGENDA CARDS
  // =========================================================================
  let cursorY = headerHeight + bodyPaddingY;

  if (rowLayouts.length === 0) {
    ctx.save();
    drawRoundedRect(ctx, 36, cursorY, width - 72, 175, 18);
    ctx.fillStyle = cardBgColor;
    ctx.fill();
    ctx.strokeStyle = isDark ? '#1E3A5F' : '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = isDark ? '#CBD5E1' : '#64748B';
    ctx.textAlign = 'center';
    ctx.font = '700 25px "Poppins", system-ui, sans-serif';
    ctx.fillText('Tidak ada agenda terjadwal pada periode ini.', width / 2, cursorY + 80);
    ctx.font = '500 18px "Poppins", system-ui, sans-serif';
    ctx.fillText('Silakan pilih tanggal lain atau tambah agenda baru.', width / 2, cursorY + 114);
    ctx.restore();
  } else {
    const spineX = badgeX + 32; // 56px
    const firstCenterY = cursorY + rowLayouts[0].rowH / 2;
    const lastCenterY =
      cursorY + rowsTotalH - rowLayouts[rowLayouts.length - 1].rowH / 2;

    if (rowLayouts.length > 1) {
      ctx.save();
      ctx.strokeStyle = isDark ? '#334155' : '#64748B';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(spineX, firstCenterY);
      ctx.lineTo(spineX, lastCenterY);
      ctx.stroke();
      ctx.restore();
    }

    rowLayouts.forEach((layout, idx) => {
      const { item, titleLines, locLines, hasBadgeTop, hasZoomLine, rowH } = layout;
      const cardY = cursorY;

      // Card Container
      ctx.save();
      ctx.shadowColor = isDark ? 'rgba(0,0,0,0.35)' : 'rgba(15, 23, 42, 0.09)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      drawRoundedRect(ctx, cardX, cardY, cardW, rowH, 16);
      ctx.fillStyle = cardBgColor;
      ctx.fill();
      ctx.restore();

      ctx.save();
      drawRoundedRect(ctx, cardX, cardY, cardW, rowH, 16);
      ctx.strokeStyle = isDark ? '#1F3B5C' : isCleanWhite ? '#CBD5E1' : '#DCE5F0';
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();

      // Right-aligned activity-matched documentary photograph
      if (opts.showIllustration) {
        drawRowPhotoRight(ctx, cardX, cardY, cardW, rowH, cardBgColor, item, onImageReady);
      }

      // Protruding Stadium Time Badge + Circular Clock Icon
      const isOnline =
        /zoom|daring|virtual|meet/i.test(item.lokasi) || item.kategori === 'Rapat Eksternal';
      const badgeColor = isOnline ? '#0B4F8A' : idx % 2 === 0 ? '#EA580C' : '#0B4F8A';
      const badgeH = item.sampaiSelesai ? 68 : 62;
      const badgeY = cardY + rowH / 2 - badgeH / 2;

      ctx.save();
      drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 34);
      ctx.fillStyle = badgeColor;
      ctx.fill();

      const iconCx = spineX;
      const iconCy = badgeY + badgeH / 2;
      ctx.fillStyle = badgeColor;
      ctx.beginPath();
      ctx.arc(iconCx, iconCy, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      drawClockIcon(ctx, iconCx, iconCy);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.font = '800 24px "Poppins", system-ui, sans-serif';
      ctx.fillText(
        item.jamMulai.replace(':', '.'),
        badgeX + 64,
        badgeY + (item.sampaiSelesai ? 29 : 31)
      );
      ctx.font = '700 13px "Poppins", system-ui, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(
        item.sampaiSelesai ? 'WIB - Selesai' : 'WIB',
        badgeX + 64,
        badgeY + 49
      );
      ctx.restore();

      // Middle Content Block
      let textY = cardY + 28;

      if (hasBadgeTop && opts.showUpdatedBadge && item.isUpdated) {
        ctx.save();
        drawRoundedRect(ctx, textX, textY - 14, 112, 19, 5);
        ctx.fillStyle = '#DCFCE7';
        ctx.fill();
        ctx.fillStyle = '#15803D';
        ctx.font = '800 11px "Poppins", system-ui, sans-serif';
        ctx.fillText('UPDATE / BARU', textX + 9, textY);
        ctx.restore();
        textY += 22;
      }

      ctx.save();
      ctx.textAlign = 'left';
      ctx.fillStyle = isDark ? '#F8FAFC' : '#0F172A';
      ctx.font = '700 22px "Poppins", system-ui, sans-serif';
      titleLines.forEach((line) => {
        ctx.fillText(line, textX, textY);
        textY += 28;
      });

      // Vector orange map-pin + crisp location text
      drawLocationPinIcon(ctx, textX + 7, textY - 5);
      ctx.fillStyle = isDark ? '#CBD5E1' : '#334155';
      ctx.font = '500 17px "Poppins", system-ui, sans-serif';
      locLines.forEach((line) => {
        ctx.fillText(line, textX + 20, textY);
        textY += 22;
      });

      if (hasZoomLine && item.zoomUrl) {
        ctx.fillStyle = isDark ? '#60A5FA' : '#1D4ED8';
        ctx.font = '600 14px "JetBrains Mono", monospace';
        const zoomDisplay =
          item.zoomUrl.length > 44 ? `${item.zoomUrl.slice(0, 43)}…` : item.zoomUrl;
        ctx.fillText(`Zoom: ${zoomDisplay}`, textX, textY + 2);
      }
      ctx.restore();

      // Soft Peach PIC Tag before photo zone
      const picText = item.pejabatPendamping || item.penyelenggara || 'Sekretariat BPBD';
      ctx.save();
      ctx.font = '700 15px "Poppins", system-ui, sans-serif';
      const picLines = wrapTextLines(ctx, picText, picW - 38, 2);
      const picH = Math.max(40, picLines.length * 19 + 16);
      const picY = cardY + rowH / 2 - picH / 2;

      drawRoundedRect(ctx, picX, picY, picW, picH, 10);
      ctx.fillStyle = isDark ? 'rgba(30,41,59,0.96)' : 'rgba(255, 243, 230, 0.98)';
      ctx.fill();
      ctx.strokeStyle = isDark ? '#334155' : '#FED7AA';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      ctx.fillStyle = '#EA580C';
      ctx.beginPath();
      ctx.arc(picX + 16, picY + picH / 2 - 4, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(picX + 16, picY + picH / 2 + 6, 6.5, Math.PI, 0);
      ctx.fill();

      ctx.fillStyle = isDark ? '#FDBA74' : '#431407';
      ctx.textAlign = 'left';
      picLines.forEach((pLine, lIdx) => {
        ctx.fillText(pLine, picX + 29, picY + 23 + lIdx * 18);
      });
      ctx.restore();

      cursorY += rowH + rowGap;
    });
  }

  // =========================================================================
  // 3. SIDOARJO SKYLINE SILHOUETTE + SWEEPING WAVE FOOTER
  // =========================================================================
  const footerY = totalHeight - footerHeight;
  drawSidoarjoSkylineSilhouette(ctx, width, footerY + 6, isDark);

  ctx.save();
  ctx.fillStyle = '#081B33';
  ctx.fillRect(0, footerY, width, footerHeight);

  ctx.beginPath();
  ctx.moveTo(0, footerY);
  ctx.lineTo(540, footerY);
  ctx.quadraticCurveTo(615, footerY, 690, footerY - 24);
  ctx.lineTo(width, footerY - 24);
  ctx.lineTo(width, footerY + 14);
  ctx.quadraticCurveTo(655, footerY + 14, 575, footerY + 6);
  ctx.lineTo(0, footerY + 6);
  ctx.closePath();
  ctx.fillStyle = '#EA580C';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(640, footerY + 10);
  ctx.quadraticCurveTo(780, footerY - 10, width, footerY - 12);
  ctx.lineTo(width, footerY + 12);
  ctx.quadraticCurveTo(790, footerY + 18, 640, footerY + 14);
  ctx.closePath();
  ctx.fillStyle = '#0E4D8B';
  ctx.fill();

  // Bottom-left compass/helm emblem
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(58, footerY + 52, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(58, footerY + 52, 6, 0, Math.PI * 2);
  ctx.stroke();
  for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 4) {
    ctx.beginPath();
    ctx.moveTo(58 + Math.cos(ang) * 8, footerY + 52 + Math.sin(ang) * 8);
    ctx.lineTo(58 + Math.cos(ang) * 20, footerY + 52 + Math.sin(ang) * 20);
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FBBF24';
  ctx.font = '800 22px "Poppins", system-ui, sans-serif';
  ctx.fillText('SIAP  ·  CEPAT  ·  TEPAT  ·  HUMANIS', 92, footerY + 59);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 20px "Poppins", system-ui, sans-serif';
  ctx.fillText('Sidoarjo Tangguh', width - 34, footerY + 45);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 15px "Poppins", system-ui, sans-serif';
  ctx.fillText('Masyarakat Selamat, Bersama Kita Lebih Kuat', width - 34, footerY + 71);
  ctx.restore();
}

export function downloadPosterFile(
  canvas: HTMLCanvasElement,
  filenameBase: string,
  format: 'png' | 'jpeg'
) {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const filename = `${filenameBase}.${ext}`;

  const triggerLink = (href: string, revokeLater: boolean) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (revokeLater) {
      setTimeout(() => URL.revokeObjectURL(href), 30000);
    }
  };

  if (typeof canvas.toBlob === 'function') {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          triggerLink(URL.createObjectURL(blob), true);
        } else {
          triggerLink(canvas.toDataURL(mime, 0.98), false);
        }
      },
      mime,
      0.98
    );
  } else {
    triggerLink(canvas.toDataURL(mime, 0.98), false);
  }
}

export async function sharePosterWithImage(
  canvas: HTMLCanvasElement,
  filenameBase: string
): Promise<'shared' | 'aborted' | 'fallback'> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );

  if (blob && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const imageFile = new File([blob], `${filenameBase}.png`, { type: 'image/png' });
      const canShareFiles =
        typeof navigator.canShare !== 'function' || navigator.canShare({ files: [imageFile] });
      if (canShareFiles) {
        await navigator.share({
          files: [imageFile],
        });
        return 'shared';
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'aborted';
      }
    }
  }

  downloadPosterFile(canvas, filenameBase, 'png');
  return 'fallback';
}

export async function copyPosterToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return false;
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        resolve(true);
      } catch {
        resolve(false);
      }
    }, 'image/png');
  });
}

export function buildSingleAgendaText(item: AgendaItem, orgTitle = 'BPBD KAB. SIDOARJO'): string {
  const zoomLine = item.zoomUrl ? `\n🔗 Zoom: ${item.zoomUrl}` : '';
  return [
    `*AGENDA ${(orgTitle || 'BPBD KAB. SIDOARJO').toUpperCase()}*`,
    `📅 ${formatTanggalLengkap(item.tanggal)}`,
    `🕒 ${formatRentangWaktu(item)}`,
    `📌 *${item.judul}*`,
    `📍 ${item.lokasi}`,
    `👤 PIC: ${item.pejabatPendamping || item.penyelenggara}${zoomLine}`,
    `\n_SIAP · CEPAT · TEPAT · HUMANIS_`,
  ].join('\n');
}

export function buildWhatsAppCaption(
  agendas: AgendaItem[],
  selectedDate: string,
  orgTitle: string,
  showZoomUrl: boolean
): string {
  const header = `*AGENDA KEGIATAN ${(orgTitle || 'BPBD KAB. SIDOARJO').toUpperCase()}*\n📅 *${formatTanggalLengkap(selectedDate)}*\n────────────────────────`;
  if (agendas.length === 0) {
    return `${header}\nTidak ada agenda terjadwal.\n\n_SIAP · CEPAT · TEPAT · HUMANIS_`;
  }
  const lines = agendas.map((item, idx) => {
    const updateTag = item.isUpdated ? ' [UPDATE]' : '';
    const zoomLine = showZoomUrl && item.zoomUrl ? `\n   🔗 Zoom: ${item.zoomUrl}` : '';
    return `${idx + 1}. *${formatRentangWaktu(item)}*${updateTag}\n   📌 ${item.judul}\n   📍 ${item.lokasi}\n   👤 PIC: ${item.pejabatPendamping || item.penyelenggara}${zoomLine}`;
  });
  return `${header}\n\n${lines.join('\n\n')}\n\n_SIAP · CEPAT · TEPAT · HUMANIS_`;
}
