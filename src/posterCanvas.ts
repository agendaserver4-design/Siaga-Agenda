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
  maxLines = 4,
  allowTruncate = true
): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  // Split any single unbroken token (e.g. long URL) that exceeds maxWidth
  const tokens: string[] = [];
  for (const word of words) {
    if (ctx.measureText(word).width <= maxWidth) {
      tokens.push(word);
    } else {
      let chunk = '';
      for (const ch of word) {
        const next = chunk + ch;
        if (ctx.measureText(next).width <= maxWidth) {
          chunk = next;
        } else {
          if (chunk) tokens.push(chunk);
          chunk = ch;
        }
      }
      if (chunk) tokens.push(chunk);
    }
  }

  const lines: string[] = [];
  let current = '';

  for (const token of tokens) {
    const test = current ? `${current} ${token}` : token;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = token;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (allowTruncate && lines.length === maxLines) {
    const consumedWords = lines.join(' ').split(/\s+/).length;
    if (consumedWords < tokens.length) {
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

const logoCropCache = new WeakMap<
  HTMLImageElement,
  { sx: number; sy: number; sw: number; sh: number }
>();

function getCircularLogoCrop(img: HTMLImageElement): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
} {
  const cached = logoCropCache.get(img);
  if (cached) return cached;

  const fallback = {
    sx: 0,
    sy: 0,
    sw: img.naturalWidth || img.width,
    sh: img.naturalHeight || img.height,
  };
  if (typeof document === 'undefined' || !fallback.sw || !fallback.sh) {
    return fallback;
  }

  try {
    const tmp = document.createElement('canvas');
    tmp.width = fallback.sw;
    tmp.height = fallback.sh;
    const tctx = tmp.getContext('2d');
    if (!tctx) return fallback;
    tctx.drawImage(img, 0, 0);
    const { data } = tctx.getImageData(0, 0, tmp.width, tmp.height);
    let minX = tmp.width;
    let minY = tmp.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < tmp.height; y += 2) {
      for (let x = 0; x < tmp.width; x += 2) {
        const idx = (y * tmp.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        if (a > 30 && (r < 236 || g < 236 || b < 236)) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX > minX + 20 && maxY > minY + 20) {
      const boxW = maxX - minX;
      const boxH = maxY - minY;
      const size = Math.max(boxW, boxH);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const inset = Math.max(2, size * 0.015);
      const crop = {
        sx: Math.max(0, cx - size / 2 + inset),
        sy: Math.max(0, cy - size / 2 + inset),
        sw: Math.min(tmp.width, size - inset * 2),
        sh: Math.min(tmp.height, size - inset * 2),
      };
      logoCropCache.set(img, crop);
      return crop;
    }
  } catch {
    // Fallback if canvas pixel read is restricted
  }

  logoCropCache.set(img, fallback);
  return fallback;
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

type ActivityKey = Exclude<PosterIllustrationKey, 'auto'>;

export function resolvePosterIllustrationKey(item: AgendaItem): ActivityKey {
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
    /\bai\b|kecerdasan buatan|artifisial|geospasial|medsos|media sosial|konten|pusdatin|infografis|sistem informasi|e-buddy|aplikasi|website|peringatan dini|dashboard|publikasi/.test(
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
  if (/pesantren|santri|pondok|madrasah|masjid|pramuka|ra muslimat|\bmi |\bmts |\bma /.test(hay)) {
    return 'pesantren';
  }
  if (
    /sekolah|smp|sma|smk|sdn|\bsd |\btk |siswa|murid|pelajar|kampus|universitas|spab|destana|satlinmas|edukasi|mitigasi|satuan pendidikan/.test(
      hay
    )
  ) {
    return 'sekolah_edukasi';
  }
  if (/damkar|kebakaran|pemadam|apar|rescue|sar|evakuasi|api|puting beliung|\bk3\b/.test(hay)) {
    return 'damkar';
  }
  if (/angin|cuaca|anemometer|bmkg|iklim|hidrometeorologi|banjir|genangan|hujan|longsor/.test(hay)) {
    return 'cuaca';
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

// =========================================================================
// ACTIVITY-MATCHED EDITORIAL BACKGROUND & WATERMARK INSIDE EACH CARD
// =========================================================================
interface ActivityBgTheme {
  washLeft: string;
  washRight: string;
  accentColor: string;
  watermarkColor: string;
}

const ACTIVITY_BG_THEMES_LIGHT: Record<ActivityKey, ActivityBgTheme> = {
  senam: {
    washLeft: '#FFFFFF',
    washRight: '#F0F9FF',
    accentColor: 'rgba(14, 165, 233, 0.10)',
    watermarkColor: 'rgba(100, 116, 139, 0.14)',
  },
  apel: {
    washLeft: '#FFFFFF',
    washRight: '#EFF6FF',
    accentColor: 'rgba(29, 78, 216, 0.08)',
    watermarkColor: 'rgba(30, 58, 138, 0.11)',
  },
  cuaca: {
    washLeft: '#FFFFFF',
    washRight: '#ECFEFF',
    accentColor: 'rgba(6, 182, 212, 0.10)',
    watermarkColor: 'rgba(14, 116, 144, 0.12)',
  },
  hotel_fgd: {
    washLeft: '#FFFFFF',
    washRight: '#FFFBEB',
    accentColor: 'rgba(217, 119, 6, 0.09)',
    watermarkColor: 'rgba(180, 83, 9, 0.11)',
  },
  rapat: {
    washLeft: '#FFFFFF',
    washRight: '#F1F5F9',
    accentColor: 'rgba(30, 64, 175, 0.08)',
    watermarkColor: 'rgba(51, 65, 85, 0.11)',
  },
  k3_zoom: {
    washLeft: '#FFFFFF',
    washRight: '#FFF7ED',
    accentColor: 'rgba(234, 88, 12, 0.13)',
    watermarkColor: 'rgba(234, 88, 12, 0.16)',
  },
  zoom: {
    washLeft: '#FFFFFF',
    washRight: '#EFF6FF',
    accentColor: 'rgba(37, 99, 235, 0.10)',
    watermarkColor: 'rgba(29, 78, 216, 0.12)',
  },
  digital_ai: {
    washLeft: '#FFFFFF',
    washRight: '#EEF2FF',
    accentColor: 'rgba(79, 70, 229, 0.10)',
    watermarkColor: 'rgba(55, 48, 163, 0.12)',
  },
  pesantren: {
    washLeft: '#FFFFFF',
    washRight: '#ECFDF5',
    accentColor: 'rgba(5, 150, 105, 0.10)',
    watermarkColor: 'rgba(6, 95, 70, 0.12)',
  },
  sekolah_edukasi: {
    washLeft: '#FFFFFF',
    washRight: '#F0FDFA',
    accentColor: 'rgba(13, 148, 136, 0.09)',
    watermarkColor: 'rgba(15, 118, 110, 0.11)',
  },
  damkar: {
    washLeft: '#FFFFFF',
    washRight: '#FFF7ED',
    accentColor: 'rgba(239, 68, 68, 0.11)',
    watermarkColor: 'rgba(220, 38, 38, 0.14)',
  },
  kunjungan: {
    washLeft: '#FFFFFF',
    washRight: '#F7FEE7',
    accentColor: 'rgba(101, 163, 13, 0.09)',
    watermarkColor: 'rgba(63, 98, 18, 0.11)',
  },
};

function drawActivityWatermark(
  ctx: CanvasRenderingContext2D,
  key: ActivityKey,
  cx: number,
  cy: number,
  cardH: number,
  color: string,
  accent: string
) {
  ctx.save();

  // Soft radial ambient glow behind center-right text (matches subtle flame/smoke glow in reference poster)
  const glowR = Math.max(76, cardH * 0.9);
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, glowR);
  glow.addColorStop(0, accent);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const s = Math.min(1.05, Math.max(0.76, cardH / 120));
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  switch (key) {
    case 'senam': {
      // Dynamic fitness silhouette + outdoor rays
      ctx.beginPath();
      ctx.arc(0, -24, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-26, -12);
      ctx.lineTo(0, -6);
      ctx.lineTo(26, -16);
      ctx.lineTo(14, -2);
      ctx.lineTo(10, 18);
      ctx.lineTo(20, 38);
      ctx.lineTo(8, 40);
      ctx.lineTo(0, 20);
      ctx.lineTo(-10, 40);
      ctx.lineTo(-22, 36);
      ctx.lineTo(-10, 14);
      ctx.lineTo(-12, -2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'apel': {
      // Ceremonial squad formation silhouettes
      [-28, 0, 28].forEach((ox, idx) => {
        const yOff = idx === 1 ? -4 : 2;
        ctx.beginPath();
        ctx.arc(ox, -18 + yOff, 7.5, 0, Math.PI * 2);
        ctx.fill();
        drawRoundedRect(ctx, ox - 9, -7 + yOff, 18, 36, 7);
        ctx.fill();
      });
      break;
    }
    case 'k3_zoom':
    case 'damkar': {
      // Crisp flame & safety silhouette (matches subtle flame/firefighter watermark in reference photo)
      ctx.beginPath();
      ctx.moveTo(0, -40);
      ctx.bezierCurveTo(22, -18, 34, 2, 24, 26);
      ctx.bezierCurveTo(18, 38, -18, 38, -24, 26);
      ctx.bezierCurveTo(-34, 4, -20, -14, -6, -24);
      ctx.bezierCurveTo(-10, -8, 2, -6, 0, -40);
      ctx.closePath();
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(0, 16, 10, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'zoom': {
      // Video meeting grid & signal arcs
      drawRoundedRect(ctx, -34, -24, 68, 44, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-12, 20);
      ctx.lineTo(12, 20);
      ctx.moveTo(-22, 28);
      ctx.lineTo(22, 28);
      ctx.stroke();
      [-16, 16].forEach((gx) => {
        [-8, 8].forEach((gy) => {
          drawRoundedRect(ctx, gx - 11, gy - 6, 22, 12, 3);
          ctx.fill();
        });
      });
      break;
    }
    case 'digital_ai': {
      // Geospatial map grid + AI nodes
      drawRoundedRect(ctx, -34, -26, 68, 52, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-34, -4);
      ctx.lineTo(34, -4);
      ctx.moveTo(-6, -26);
      ctx.lineTo(-6, 26);
      ctx.stroke();
      [
        [-18, -14],
        [14, -14],
        [16, 12],
      ].forEach(([nx, ny]) => {
        ctx.beginPath();
        ctx.arc(nx, ny, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case 'cuaca': {
      // Wind gusts + storm cloud watermark
      ctx.beginPath();
      ctx.arc(-10, -8, 16, Math.PI * 0.5, Math.PI * 1.65);
      ctx.arc(8, -14, 18, Math.PI * 1.1, Math.PI * 1.95);
      ctx.arc(22, -4, 12, Math.PI * 1.4, Math.PI * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-30, 18);
      ctx.quadraticCurveTo(0, 10, 28, 18);
      ctx.moveTo(-22, 28);
      ctx.quadraticCurveTo(6, 20, 34, 28);
      ctx.stroke();
      break;
    }
    case 'pesantren': {
      // Mosque dome & crescent silhouette
      ctx.beginPath();
      ctx.arc(0, -4, 24, Math.PI, 0);
      ctx.lineTo(24, 28);
      ctx.lineTo(-24, 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-34, 2, 7, 26);
      ctx.fillRect(27, 2, 7, 26);
      ctx.beginPath();
      ctx.arc(0, -34, 7, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sekolah_edukasi': {
      // Academic cap & open book silhouette
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(36, -12);
      ctx.lineTo(0, 4);
      ctx.lineTo(-36, -12);
      ctx.closePath();
      ctx.fill();
      drawRoundedRect(ctx, -20, 6, 40, 20, 5);
      ctx.stroke();
      break;
    }
    case 'hotel_fgd':
    case 'rapat': {
      // Executive roundtable / seminar speech bubbles
      drawRoundedRect(ctx, -34, -26, 46, 30, 10);
      ctx.fill();
      drawRoundedRect(ctx, -8, -4, 42, 28, 10);
      ctx.stroke();
      break;
    }
    case 'kunjungan': {
      // Location pin & field route curve
      ctx.beginPath();
      ctx.arc(0, -10, 16, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineTo(0, 26);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-32, 30);
      ctx.quadraticCurveTo(0, 18, 32, 30);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawActivityCardBackground(
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  textX: number,
  picX: number,
  item: AgendaItem,
  isDark: boolean,
  cardBgColor: string,
  onReady?: () => void
) {
  const key = resolvePosterIllustrationKey(item);
  const theme = ACTIVITY_BG_THEMES_LIGHT[key];

  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.clip();

  if (isDark) {
    const darkGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    darkGrad.addColorStop(0, '#12243B');
    darkGrad.addColorStop(0.65, '#172E4C');
    darkGrad.addColorStop(1, '#1B375B');
    ctx.fillStyle = darkGrad;
    ctx.fillRect(cardX, cardY, cardW, cardH);
  } else {
    const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
    bgGrad.addColorStop(0, theme.washLeft);
    bgGrad.addColorStop(0.58, theme.washLeft);
    bgGrad.addColorStop(1, theme.washRight);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(cardX, cardY, cardW, cardH);
  }

  // Subtle diffused activity photo atmosphere across middle-right zone (keeps left text ultra-crisp)
  const photoImg = loadCachedImage(pickActivityPhotoSrc(item), onReady);
  if (photoImg) {
    ctx.save();
    ctx.globalAlpha = isDark ? 0.14 : 0.09;
    const bgPhotoW = 360;
    const bgPhotoX = picX - 140;
    drawImageCover(ctx, photoImg, bgPhotoX, cardY, bgPhotoW, cardH);
    ctx.restore();

    const maskGrad = ctx.createLinearGradient(bgPhotoX - 10, 0, bgPhotoX + 160, 0);
    maskGrad.addColorStop(0, cardBgColor);
    maskGrad.addColorStop(0.45, cardBgColor);
    maskGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = isDark ? 'rgba(18, 36, 59, 0.72)' : maskGrad;
    ctx.fillRect(bgPhotoX - 12, cardY, 175, cardH);
  }

  // Subtle vector watermark placed cleanly at the middle-right end of the title area
  const wmX = Math.max(textX + 260, picX - 58);
  const wmY = cardY + cardH * 0.52;
  drawActivityWatermark(
    ctx,
    key,
    wmX,
    wmY,
    cardH,
    isDark ? 'rgba(148, 163, 184, 0.14)' : theme.watermarkColor,
    isDark ? 'rgba(56, 189, 248, 0.12)' : theme.accentColor
  );

  ctx.restore();
}

function drawRowPhotoRight(
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  picZoneRight: number,
  cardBgColor: string,
  item: AgendaItem,
  onReady?: () => void
) {
  const photoX = picZoneRight - 14;
  const photoW = cardX + cardW - photoX + 2;
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

  const fadeGrad = ctx.createLinearGradient(photoX, 0, photoX + 54, 0);
  fadeGrad.addColorStop(0, cardBgColor);
  fadeGrad.addColorStop(0.28, cardBgColor);
  fadeGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(photoX - 4, cardY, 60, cardH);
  ctx.restore();
}

// =========================================================================
// ACTIVITY-SPECIFIC CIRCULAR TIMELINE BADGE ICONS (Matches Reference Photo)
// =========================================================================
function drawActivityBadgeIcon(
  ctx: CanvasRenderingContext2D,
  key: ActivityKey,
  cx: number,
  cy: number
) {
  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(cx, cy);

  switch (key) {
    case 'senam': {
      // Running / exercise person
      ctx.beginPath();
      ctx.arc(3, -10, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, -3);
      ctx.lineTo(1, -5);
      ctx.lineTo(8, -1);
      ctx.moveTo(1, -5);
      ctx.lineTo(-1, 3);
      ctx.lineTo(-8, 10);
      ctx.moveTo(-1, 3);
      ctx.lineTo(6, 5);
      ctx.lineTo(5, 11);
      ctx.stroke();
      break;
    }
    case 'apel': {
      // Group of 3 standing personnel
      [-7, 0, 7].forEach((ox, idx) => {
        const dy = idx === 1 ? -2 : 0;
        ctx.beginPath();
        ctx.arc(ox, -6 + dy, 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ox - 3.5, 6 + dy);
        ctx.quadraticCurveTo(ox, -1 + dy, ox + 3.5, 6 + dy);
        ctx.stroke();
      });
      break;
    }
    case 'zoom':
    case 'k3_zoom': {
      // Laptop / online meeting screen
      drawRoundedRect(ctx, -10, -8, 20, 13, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-13, 8);
      ctx.lineTo(13, 8);
      ctx.stroke();
      ctx.fillRect(-6, -4, 5, 5);
      ctx.fillRect(1, -4, 5, 5);
      break;
    }
    case 'rapat':
    case 'hotel_fgd': {
      // Discussion bubble & people
      drawRoundedRect(ctx, -10, -9, 15, 10, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(5, 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.quadraticCurveTo(5, 4, 10, 10);
      ctx.stroke();
      break;
    }
    case 'pesantren': {
      // Mosque dome & crescent
      ctx.beginPath();
      ctx.arc(0, -1, 7.5, Math.PI, 0);
      ctx.lineTo(7.5, 9);
      ctx.lineTo(-7.5, 9);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-11, 2);
      ctx.lineTo(-11, 9);
      ctx.moveTo(11, 2);
      ctx.lineTo(11, 9);
      ctx.moveTo(0, -9);
      ctx.lineTo(0, -12);
      ctx.stroke();
      break;
    }
    case 'sekolah_edukasi': {
      // School / graduation icon
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(11, -5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-11, -5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-6, -1);
      ctx.lineTo(-6, 7);
      ctx.quadraticCurveTo(0, 10, 6, 7);
      ctx.lineTo(6, -1);
      ctx.stroke();
      break;
    }
    case 'damkar': {
      // Flame icon
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.bezierCurveTo(7, -4, 9, 2, 6, 8);
      ctx.bezierCurveTo(3, 11, -3, 11, -6, 8);
      ctx.bezierCurveTo(-9, 2, -6, -3, -2, -6);
      ctx.bezierCurveTo(-3, -2, 1, -2, 0, -11);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cuaca': {
      // Cloud + wind lines
      ctx.beginPath();
      ctx.arc(-4, -3, 4.5, Math.PI * 0.5, Math.PI * 1.65);
      ctx.arc(2, -5, 5, Math.PI * 1.1, Math.PI * 1.95);
      ctx.arc(7, -2, 3.5, Math.PI * 1.4, Math.PI * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, 6);
      ctx.lineTo(8, 6);
      ctx.moveTo(-5, 10);
      ctx.lineTo(10, 10);
      ctx.stroke();
      break;
    }
    case 'digital_ai': {
      // Map / dashboard icon
      ctx.beginPath();
      ctx.moveTo(-10, -7);
      ctx.lineTo(-3, -9);
      ctx.lineTo(3, -6);
      ctx.lineTo(10, -8);
      ctx.lineTo(10, 7);
      ctx.lineTo(3, 9);
      ctx.lineTo(-3, 6);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-3, -9);
      ctx.lineTo(-3, 6);
      ctx.moveTo(3, -6);
      ctx.lineTo(3, 9);
      ctx.stroke();
      break;
    }
    case 'kunjungan': {
      // Map pin
      ctx.beginPath();
      ctx.arc(0, -3, 6.2, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineTo(0, 10);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -3, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
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

  // Match exact 2:3 portrait poster dimensions of reference image (842x1264 -> 1080x1620 @2x)
  const width = 1080;
  const targetPosterHeight = 1620;
  const scale = 2;
  const itemsToRender =
    opts.cardMode === 'tunggal' && opts.focusedAgenda
      ? [opts.focusedAgenda]
      : opts.agendas.slice(0, 12);

  const headerHeight = 214;
  const skylineHeight = 50;
  const footerHeight = 84;
  const badgeX = 16;
  const badgeW = 164;
  const cardX = 46;
  const cardRightMargin = 16;
  const cardW = width - cardX - cardRightMargin; // 1018px
  const textX = badgeX + badgeW + 14; // 194px

  const rightEdge = cardX + cardW - 6; // 1058px
  const picZoneRight = opts.showIllustration ? rightEdge - 160 : rightEdge; // 898px
  const picW = opts.showIllustration ? 228 : 272;
  const picX = picZoneRight - picW; // 670px when photo shown
  const textMaxW = picX - textX - 12; // 464px when photo shown

  const isDark = opts.cardTheme === 'gelap';
  const isCleanWhite = opts.cardTheme === 'putih';
  const cardBgColor = isDark ? '#12243B' : '#FFFFFF';

  const bodyAvailableH = targetPosterHeight - headerHeight - skylineHeight - footerHeight; // 1272px

  const measureWithScale = (fontScale: number, rowGapVal: number, padYVal: number) => {
    const titlePx = Math.round(25 * fontScale * 2) / 2;
    const titleLH = Math.round(31 * fontScale);
    const locPx = Math.round(19 * fontScale * 2) / 2;
    const locLH = Math.round(24 * fontScale);
    const zoomPx = Math.round(16 * fontScale * 2) / 2;
    const zoomLH = Math.round(20.5 * fontScale);
    const picPx = Math.round(18 * fontScale * 2) / 2;
    const picLH = Math.round(22.5 * fontScale);
    const minRowH = Math.round(92 * fontScale);
    const vPad = Math.max(12, Math.round(20 * fontScale));
    const badgeTopH = Math.round(20 * fontScale);

    const layouts = itemsToRender.map((item) => {
      ctx.font = `700 ${titlePx}px "Poppins", system-ui, sans-serif`;
      const titleLines = wrapTextLines(ctx, item.judul, textMaxW, 6, false);

      ctx.font = `500 ${locPx}px "Poppins", system-ui, sans-serif`;
      const locLines = wrapTextLines(ctx, `di ${item.lokasi}`, textMaxW, 4, false);

      const hasBadgeTop = opts.showUpdatedBadge && Boolean(item.isUpdated);
      const hasZoomLine = opts.showZoomUrl && Boolean(item.zoomUrl);
      ctx.font = `600 ${zoomPx}px "JetBrains Mono", monospace`;
      const zoomLines =
        hasZoomLine && item.zoomUrl
          ? wrapTextLines(ctx, item.zoomUrl, textMaxW, 3, false)
          : [];

      const picText = item.pejabatPendamping || item.penyelenggara || 'Sekretariat BPBD';
      ctx.font = `700 ${picPx}px "Poppins", system-ui, sans-serif`;
      const picLines = wrapTextLines(ctx, picText, picW - 40, 6, false);
      const picH = Math.max(Math.round(44 * fontScale), picLines.length * picLH + 14);

      const contentH =
        (hasBadgeTop ? badgeTopH : 0) +
        titleLines.length * titleLH +
        locLines.length * locLH +
        zoomLines.length * zoomLH +
        vPad;
      const rowH = Math.max(minRowH, contentH, picH + 14);
      return {
        item,
        titleLines,
        locLines,
        zoomLines,
        picText,
        picLines,
        picH,
        hasBadgeTop,
        hasZoomLine,
        rowH,
      };
    });

    const rowsTotal =
      layouts.length > 0
        ? layouts.reduce((acc, r) => acc + r.rowH + rowGapVal, 0) - rowGapVal
        : 200;

    return {
      titlePx,
      titleLH,
      locPx,
      locLH,
      zoomPx,
      zoomLH,
      picPx,
      picLH,
      badgeTopH,
      rowGapVal,
      padYVal,
      layouts,
      rowsTotal,
      fontScale,
    };
  };

  let chosen = measureWithScale(1, 8, 16);
  if (opts.cardMode !== 'tunggal' && itemsToRender.length > 0) {
    const candidates: Array<[number, number, number]> = [
      [1, 8, 16],
      [0.95, 7, 14],
      [0.9, 6, 12],
      [0.85, 6, 10],
      [0.8, 5, 10],
      [0.75, 5, 8],
    ];
    for (const [fs, rg, py] of candidates) {
      const attempt = measureWithScale(fs, rg, py);
      chosen = attempt;
      if (attempt.rowsTotal + py * 2 <= bodyAvailableH) {
        break;
      }
    }
  }

  let rowGap = chosen.rowGapVal;
  let bodyPaddingY = chosen.padYVal;
  let rowLayouts = chosen.layouts;
  let rowsTotalH = chosen.rowsTotal;

  let totalHeight: number;
  if (opts.cardMode === 'tunggal') {
    totalHeight = Math.max(
      700,
      headerHeight + bodyPaddingY * 2 + rowsTotalH + skylineHeight + footerHeight
    );
  } else {
    const neededBodyH = rowsTotalH + bodyPaddingY * 2;
    if (neededBodyH <= bodyAvailableH) {
      totalHeight = targetPosterHeight;
      if (rowLayouts.length > 1) {
        const slack = bodyAvailableH - neededBodyH;
        const maxExtraGap = Math.min(18, Math.floor((slack * 0.45) / (rowLayouts.length - 1)));
        rowGap += maxExtraGap;
        const remainingSlack = slack - maxExtraGap * (rowLayouts.length - 1);
        const extraPerRow = Math.min(24, Math.floor((remainingSlack * 0.6) / rowLayouts.length));
        if (extraPerRow > 0) {
          rowLayouts = rowLayouts.map((r) => ({ ...r, rowH: r.rowH + extraPerRow }));
        }
        rowsTotalH = rowLayouts.reduce((acc, r) => acc + r.rowH + rowGap, 0) - rowGap;
        bodyPaddingY = Math.max(12, Math.floor((bodyAvailableH - rowsTotalH) / 2));
      } else {
        bodyPaddingY = Math.max(16, Math.floor((bodyAvailableH - rowsTotalH) / 2));
      }
    } else {
      totalHeight = headerHeight + neededBodyH + skylineHeight + footerHeight;
    }
  }

  // 2x HiDPI Canvas output (2160 x 3240 for standard 2:3 poster)
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
    bgGrad.addColorStop(0, '#EDF3FA');
    bgGrad.addColorStop(0.6, '#E6EEF7');
    bgGrad.addColorStop(1, '#DCE8F4');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, totalHeight);
  }

  // =========================================================================
  // 1. EDITORIAL HEADER BANNER (BPBD Kab. Sidoarjo + Jayandaru + Officer)
  // =========================================================================
  const heroImg = loadCachedImage(headerHeroSrc, onImageReady);

  ctx.save();
  ctx.fillStyle = isDark ? '#061220' : '#081F3B';
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

    const edgeFade = ctx.createLinearGradient(525, 0, 620, 0);
    edgeFade.addColorStop(0, isDark ? 'rgba(6,18,32,0.58)' : 'rgba(8,31,59,0.50)');
    edgeFade.addColorStop(1, 'rgba(8,31,59,0)');
    ctx.fillStyle = edgeFade;
    ctx.fillRect(520, 0, 110, headerHeight);

    const rightVig = ctx.createLinearGradient(width - 230, 0, width, 140);
    rightVig.addColorStop(0, 'rgba(8,22,40,0)');
    rightVig.addColorStop(1, 'rgba(8,22,40,0.80)');
    ctx.fillStyle = rightVig;
    ctx.fillRect(width - 240, 0, 240, 150);
    ctx.restore();
  }

  // Diagonal orange ribbon + crisp gold hairline
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

  // Bottom orange edge bar across header
  ctx.fillStyle = '#EA580C';
  ctx.fillRect(0, headerHeight - 6, width, 6);
  ctx.restore();

  // Top-right tagline matching reference poster
  ctx.save();
  ctx.textAlign = 'right';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'italic 700 18px "Poppins", system-ui, sans-serif';
  ctx.fillText('Sidoarjo', width - 24, 34);
  ctx.fillText('Tangguh', width - 24, 56);
  ctx.fillStyle = '#FDE68A';
  ctx.font = 'italic 600 15px "Poppins", system-ui, sans-serif';
  ctx.fillText('Selamat', width - 24, 78);
  ctx.fillText('Bersama', width - 24, 98);
  ctx.restore();

  // Left Circular BPBD Logo (Auto-cropped full-bleed circle matching reference poster)
  const logoImg = loadCachedImage(BPBD_LOGO_SRC, onImageReady);
  const logoCx = 82;
  const logoCy = 72;
  const logoR = 50;
  if (logoImg) {
    const crop = getCircularLogoCrop(logoImg);
    ctx.save();
    ctx.fillStyle = '#EA580C';
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR + 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      logoImg,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      logoCx - logoR,
      logoCy - logoR,
      logoR * 2,
      logoR * 2
    );
    ctx.restore();
  } else {
    drawVectorBpbdEmblem(ctx, logoCx, logoCy, logoR);
  }

  // Main Header Titles (Large & Bold like reference photo)
  ctx.save();
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 50px "Poppins", system-ui, sans-serif';
  ctx.fillText(
    opts.cardMode === 'bulanan' ? 'REKAP BULANAN' : 'AGENDA KEGIATAN',
    148,
    68
  );
  ctx.fillStyle = '#FBBF24';
  const orgUpper = (opts.orgTitle || 'BPBD KAB. SIDOARJO').toUpperCase();
  let orgFontPx = 40;
  ctx.font = `800 ${orgFontPx}px "Poppins", system-ui, sans-serif`;
  while (orgFontPx > 28 && ctx.measureText(orgUpper).width > 395) {
    orgFontPx -= 2;
    ctx.font = `800 ${orgFontPx}px "Poppins", system-ui, sans-serif`;
  }
  ctx.fillText(orgUpper, 148, 116);
  ctx.restore();

  // Sweeping Orange Date Banner Pill (tucked cleanly along bottom of header like reference photo)
  let bannerText = formatTanggalLengkap(opts.selectedDate);
  if (opts.cardMode === 'bulanan') {
    const [yy, mm] = opts.selectedMonth.split('-').map(Number);
    bannerText = `Periode ${BULAN_ID[(mm || 1) - 1]} ${yy}`;
  } else if (opts.cardMode === 'tunggal' && opts.focusedAgenda) {
    bannerText = formatTanggalLengkap(opts.focusedAgenda.tanggal);
  }

  ctx.save();
  const pillGrad = ctx.createLinearGradient(22, 140, 540, 194);
  pillGrad.addColorStop(0, '#EA580C');
  pillGrad.addColorStop(1, '#F97316');
  drawRoundedRect(ctx, 22, 140, 518, 54, 27);
  ctx.fillStyle = pillGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, 44, 155, 24, 24, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(44, 163);
  ctx.lineTo(68, 163);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 25px "Poppins", system-ui, sans-serif';
  ctx.fillText(bannerText, 82, 176);
  ctx.restore();

  // =========================================================================
  // 2. DOTTED TIMELINE SPINE & ACTIVITY-THEMED AGENDA CARDS
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
    const spineX = badgeX + 29; // 45px
    const firstCenterY = cursorY + rowLayouts[0].rowH / 2;
    const lastCenterY =
      cursorY + rowsTotalH - rowLayouts[rowLayouts.length - 1].rowH / 2;

    if (rowLayouts.length > 1) {
      ctx.save();
      ctx.strokeStyle = isDark ? '#475569' : '#334155';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(spineX, firstCenterY);
      ctx.lineTo(spineX, lastCenterY);
      ctx.stroke();
      ctx.restore();
    }

    const { titlePx, titleLH, locPx, locLH, zoomPx, zoomLH, picPx, picLH, badgeTopH, fontScale } =
      chosen;

    rowLayouts.forEach((layout, idx) => {
      const {
        item,
        titleLines,
        locLines,
        zoomLines,
        picText,
        picLines,
        picH,
        hasBadgeTop,
        rowH,
      } = layout;
      const cardY = cursorY;
      const activityKey = resolvePosterIllustrationKey(item);

      // Card Container Shadow
      ctx.save();
      ctx.shadowColor = isDark ? 'rgba(0,0,0,0.38)' : 'rgba(15, 23, 42, 0.10)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;
      drawRoundedRect(ctx, cardX, cardY, cardW, rowH, 15);
      ctx.fillStyle = cardBgColor;
      ctx.fill();
      ctx.restore();

      // Activity-matched Editorial Card Background + Watermark
      drawActivityCardBackground(
        ctx,
        cardX,
        cardY,
        cardW,
        rowH,
        textX,
        picX,
        item,
        isDark,
        cardBgColor,
        onImageReady
      );

      // Right-aligned activity-matched photograph
      if (opts.showIllustration) {
        drawRowPhotoRight(
          ctx,
          cardX,
          cardY,
          cardW,
          rowH,
          picZoneRight,
          cardBgColor,
          item,
          onImageReady
        );
      }

      // Crisp outer card stroke
      ctx.save();
      drawRoundedRect(ctx, cardX, cardY, cardW, rowH, 15);
      ctx.strokeStyle = isDark ? '#1F3B5C' : isCleanWhite ? '#CBD5E1' : '#D5E0EC';
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();

      // Strictly Alternating Orange / Deep Blue Stadium Time Badge + Activity Icon
      const isOrangeBadge = idx % 2 === 0;
      const badgeTopColor = isOrangeBadge ? '#F97316' : '#135D9E';
      const badgeBotColor = isOrangeBadge ? '#EA580C' : '#0B467D';
      const badgeH = Math.min(rowH - 12, item.sampaiSelesai ? 62 : 58);
      const badgeY = cardY + rowH / 2 - badgeH / 2;

      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      const pillG = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
      pillG.addColorStop(0, badgeTopColor);
      pillG.addColorStop(1, badgeBotColor);
      drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 30);
      ctx.fillStyle = pillG;
      ctx.fill();
      ctx.restore();

      ctx.save();
      const iconCx = spineX;
      const iconCy = badgeY + badgeH / 2;
      ctx.fillStyle = badgeBotColor;
      ctx.beginPath();
      ctx.arc(iconCx, iconCy, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      drawActivityBadgeIcon(ctx, activityKey, iconCx, iconCy);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.font = `800 ${Math.round(26 * Math.max(0.92, fontScale))}px "Poppins", system-ui, sans-serif`;
      ctx.fillText(
        item.jamMulai.replace(':', '.'),
        badgeX + 56,
        badgeY + (item.sampaiSelesai ? 29 : 31)
      );
      ctx.font = item.sampaiSelesai
        ? '700 12px "Poppins", system-ui, sans-serif'
        : '700 15px "Poppins", system-ui, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(
        item.sampaiSelesai ? 'WIB - Selesai' : 'WIB',
        badgeX + 56,
        badgeY + badgeH - 10
      );
      ctx.restore();

      // Middle Content Block (Vertically centered inside rowH)
      const blockHeight =
        (hasBadgeTop ? badgeTopH : 0) +
        titleLines.length * titleLH +
        locLines.length * locLH +
        zoomLines.length * zoomLH;
      let textY = Math.max(
        cardY + titlePx + 4,
        cardY + (rowH - blockHeight) / 2 + titlePx * 0.78
      );

      if (hasBadgeTop && opts.showUpdatedBadge && item.isUpdated) {
        ctx.save();
        drawRoundedRect(ctx, textX, textY - 13, 106, 17, 5);
        ctx.fillStyle = '#DCFCE7';
        ctx.fill();
        ctx.fillStyle = '#15803D';
        ctx.font = '800 10.5px "Poppins", system-ui, sans-serif';
        ctx.fillText('UPDATE / BARU', textX + 8, textY - 1);
        ctx.restore();
        textY += badgeTopH;
      }

      ctx.save();
      ctx.textAlign = 'left';
      ctx.fillStyle = isDark ? '#F8FAFC' : '#0F172A';
      ctx.font = `700 ${titlePx}px "Poppins", system-ui, sans-serif`;
      titleLines.forEach((line) => {
        ctx.fillText(line, textX, textY);
        textY += titleLH;
      });

      ctx.fillStyle = isDark ? '#CBD5E1' : '#334155';
      ctx.font = `500 ${locPx}px "Poppins", system-ui, sans-serif`;
      locLines.forEach((line) => {
        ctx.fillText(line, textX, textY);
        textY += locLH;
      });

      if (zoomLines.length > 0) {
        ctx.fillStyle = isDark ? '#60A5FA' : '#1E3A8A';
        ctx.font = `600 ${zoomPx}px "JetBrains Mono", monospace`;
        zoomLines.forEach((zLine) => {
          ctx.fillText(zLine, textX, textY + 1);
          textY += zoomLH;
        });
      }
      ctx.restore();

      // Soft Peach PIC Tag showing COMPLETE name(s) without truncation
      ctx.save();
      const picY = cardY + rowH / 2 - picH / 2;

      drawRoundedRect(ctx, picX, picY, picW, picH, 10);
      ctx.fillStyle = isDark ? 'rgba(30,41,59,0.96)' : 'rgba(255, 241, 226, 0.98)';
      ctx.fill();
      ctx.strokeStyle = isDark ? '#334155' : '#FED7AA';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      // Group vs single person icon matching reference poster
      const isGroupPic = /\bdan\b|,|pegawai|orang|sekretariat|bid\.|trc/i.test(picText);
      const iconCenterY = picY + picH / 2;
      ctx.fillStyle = '#EA580C';
      if (isGroupPic) {
        [-5, 5].forEach((ox) => {
          ctx.beginPath();
          ctx.arc(picX + 17 + ox, iconCenterY - 4, 2.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(picX + 17 + ox, iconCenterY + 5.5, 4.4, Math.PI, 0);
          ctx.fill();
        });
        ctx.fillStyle = '#C2410C';
        ctx.beginPath();
        ctx.arc(picX + 17, iconCenterY - 5, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(picX + 17, iconCenterY + 6, 5.2, Math.PI, 0);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(picX + 17, iconCenterY - 4, 4.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(picX + 17, iconCenterY + 6, 6.6, Math.PI, 0);
        ctx.fill();
      }

      ctx.fillStyle = isDark ? '#FDBA74' : '#3B1707';
      ctx.font = `700 ${picPx}px "Poppins", system-ui, sans-serif`;
      ctx.textAlign = 'left';
      const picTextStartY = picY + (picH - picLines.length * picLH) / 2 + picLH * 0.76;
      picLines.forEach((pLine, lIdx) => {
        ctx.fillText(pLine, picX + 32, picTextStartY + lIdx * picLH);
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
  ctx.quadraticCurveTo(615, footerY, 690, footerY - 22);
  ctx.lineTo(width, footerY - 22);
  ctx.lineTo(width, footerY + 12);
  ctx.quadraticCurveTo(655, footerY + 12, 575, footerY + 6);
  ctx.lineTo(0, footerY + 6);
  ctx.closePath();
  ctx.fillStyle = '#EA580C';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(640, footerY + 10);
  ctx.quadraticCurveTo(780, footerY - 8, width, footerY - 10);
  ctx.lineTo(width, footerY + 12);
  ctx.quadraticCurveTo(790, footerY + 16, 640, footerY + 12);
  ctx.closePath();
  ctx.fillStyle = '#0E4D8B';
  ctx.fill();

  // Bottom-left compass/helm emblem
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(56, footerY + 46, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(56, footerY + 46, 5.5, 0, Math.PI * 2);
  ctx.stroke();
  for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 4) {
    ctx.beginPath();
    ctx.moveTo(56 + Math.cos(ang) * 7.5, footerY + 46 + Math.sin(ang) * 7.5);
    ctx.lineTo(56 + Math.cos(ang) * 19, footerY + 46 + Math.sin(ang) * 19);
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FBBF24';
  ctx.font = '800 23px "Poppins", system-ui, sans-serif';
  ctx.fillText('SIAP  ·  CEPAT  ·  TEPAT  ·  HUMANIS', 88, footerY + 54);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 21px "Poppins", system-ui, sans-serif';
  ctx.fillText('Sidoarjo Tangguh', width - 30, footerY + 40);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 15.5px "Poppins", system-ui, sans-serif';
  ctx.fillText('Masyarakat Selamat, Bersama Kita Lebih Kuat', width - 30, footerY + 65);
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
