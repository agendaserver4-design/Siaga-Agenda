import headerHeroSrc from './assets/images/bpbd_header_hero_1795663073402.jpg';
import actDamkarSrc from './assets/images/poster_act_damkar_1795663073443.jpg';
import actLapanganSrc from './assets/images/poster_act_lapangan_sidoarjo_1795663106684.jpg';
import actRapatSrc from './assets/images/poster_act_rapat_1795663074204.jpg';
import actZoomSrc from './assets/images/poster_act_zoom_1795663074280.jpg';
import {
  AgendaCategory,
  AgendaItem,
  BULAN_ID,
  CardMode,
  CardTheme,
  formatRentangWaktu,
  formatTanggalLengkap,
  getConflictsForCandidate,
} from './types';

export interface PosterRenderOptions {
  agendas: AgendaItem[];
  allAgendasForConflict: AgendaItem[];
  selectedDate: string;
  selectedMonth: string; // YYYY-MM
  cardMode: CardMode;
  cardTheme: CardTheme;
  focusedAgenda: AgendaItem | null;
  orgTitle: string;
  showUpdatedBadge: boolean;
  showConflictBadge: boolean;
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

function pickActivityPhotoSrc(item: AgendaItem): string {
  const hay = `${item.judul} ${item.lokasi} ${item.penyelenggara}`.toLowerCase();
  if (/zoom|daring|virtual|meet|webinar|online/.test(hay)) {
    return actZoomSrc;
  }
  if (/damkar|kebakaran|pemadam|rescue|sar|api|simulasi/.test(hay)) {
    return actDamkarSrc;
  }
  if (/sosialisasi|edukasi|desa|sekolah|sma|sd |ra |tk |satlinmas|masyarakat|destana/.test(hay)) {
    return actLapanganSrc;
  }
  if (item.kategori === 'Kunjungan / Dinas') {
    return actDamkarSrc;
  }
  return actRapatSrc;
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
  const photoW = 196;
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

  // Smooth horizontal fade from card background into the photograph like IMG-20261125-WA0006
  const fadeGrad = ctx.createLinearGradient(photoX, 0, photoX + 76, 0);
  fadeGrad.addColorStop(0, cardBgColor);
  fadeGrad.addColorStop(0.35, cardBgColor);
  fadeGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(photoX - 4, cardY, 84, cardH);
  ctx.restore();
}

function drawBadgeGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  kategori: AgendaCategory,
  isOnline: boolean
) {
  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isOnline) {
    drawRoundedRect(ctx, cx - 10, cy - 8, 20, 13, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 9);
    ctx.lineTo(cx + 5, cy + 9);
    ctx.moveTo(cx, cy + 5);
    ctx.lineTo(cx, cy + 9);
    ctx.stroke();
  } else if (kategori === 'Kunjungan / Dinas') {
    // Flame / action icon
    ctx.beginPath();
    ctx.moveTo(cx, cy - 11);
    ctx.bezierCurveTo(cx + 9, cy - 3, cx + 10, cy + 7, cx, cy + 10);
    ctx.bezierCurveTo(cx - 10, cy + 7, cx - 9, cy - 3, cx, cy - 11);
    ctx.stroke();
  } else if (kategori === 'Undangan Resmi') {
    // Building / Pendopo icon
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy - 3);
    ctx.lineTo(cx, cy - 11);
    ctx.lineTo(cx + 11, cy - 3);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeRect(cx - 8, cy - 3, 16, 12);
  } else {
    // Group meeting icon
    ctx.beginPath();
    ctx.arc(cx, cy - 5, 4.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 8, 8, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSidoarjoSkylineSilhouette(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseY: number,
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;

  // Ground strip
  ctx.fillRect(0, baseY - 6, width, 10);

  // Left city blocks + trees
  ctx.fillRect(36, baseY - 46, 36, 40);
  ctx.fillRect(80, baseY - 68, 42, 62);
  ctx.fillRect(130, baseY - 38, 30, 32);

  // Bridge / Tower silhouette (left-center)
  ctx.fillRect(218, baseY - 82, 8, 76);
  ctx.fillRect(268, baseY - 82, 8, 76);
  ctx.beginPath();
  ctx.moveTo(182, baseY - 18);
  ctx.quadraticCurveTo(222, baseY - 76, 222, baseY - 76);
  ctx.lineTo(226, baseY - 76);
  ctx.lineTo(272, baseY - 76);
  ctx.lineTo(312, baseY - 18);
  ctx.lineTo(304, baseY - 18);
  ctx.lineTo(270, baseY - 64);
  ctx.lineTo(224, baseY - 64);
  ctx.lineTo(190, baseY - 18);
  ctx.closePath();
  ctx.fill();

  // Mid city & trees
  for (let tx = 340; tx <= 460; tx += 36) {
    ctx.beginPath();
    ctx.arc(tx, baseY - 22, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  // Monumen Jayandaru inspired central-right spire
  const mx = 615;
  ctx.fillRect(mx - 22, baseY - 26, 44, 20);
  ctx.fillRect(mx - 14, baseY - 56, 28, 30);
  ctx.beginPath();
  ctx.moveTo(mx, baseY - 122);
  ctx.lineTo(mx + 12, baseY - 56);
  ctx.lineTo(mx - 12, baseY - 56);
  ctx.closePath();
  ctx.fill();

  // Right office & tower silhouettes
  ctx.fillRect(700, baseY - 48, 44, 42);
  ctx.fillRect(755, baseY - 76, 32, 70);
  ctx.fillRect(800, baseY - 40, 52, 34);
  ctx.fillRect(885, baseY - 94, 22, 88);
  ctx.fillRect(920, baseY - 62, 48, 56);
  ctx.fillRect(980, baseY - 38, 60, 32);

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
  const itemsToRender =
    opts.cardMode === 'tunggal' && opts.focusedAgenda
      ? [opts.focusedAgenda]
      : opts.agendas.slice(0, 12);

  const headerHeight = 258;
  const skylineHeight = 84;
  const footerHeight = 96;
  const paddingX = 36;

  const isDark = opts.cardTheme === 'gelap';
  const isCleanWhite = opts.cardTheme === 'putih';
  const cardBgColor = isDark ? '#12243B' : '#FFFFFF';

  const rowLayouts = itemsToRender.map((item) => {
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    const textMaxW = opts.showIllustration ? 430 : 605;
    const titleLines = wrapTextLines(ctx, item.judul, textMaxW, 3);
    ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
    const locLines = wrapTextLines(ctx, `di ${item.lokasi}`, textMaxW, 2);

    const hasBadgeTop =
      (opts.showUpdatedBadge && Boolean(item.isUpdated)) ||
      (opts.showConflictBadge &&
        getConflictsForCandidate(opts.allAgendasForConflict, item).length > 0);
    const hasZoomLine = opts.showZoomUrl && Boolean(item.zoomUrl);

    const contentH =
      (hasBadgeTop ? 26 : 0) +
      titleLines.length * 30 +
      locLines.length * 23 +
      (hasZoomLine ? 24 : 0) +
      30;
    const rowH = Math.max(114, contentH);
    return { item, titleLines, locLines, hasBadgeTop, hasZoomLine, rowH };
  });

  const bodyPaddingY = 26;
  const rowGap = 12;
  const rowsTotalH =
    rowLayouts.length > 0
      ? rowLayouts.reduce((acc, r) => acc + r.rowH + rowGap, 0) - rowGap
      : 200;

  const totalHeight = Math.max(
    780,
    headerHeight + bodyPaddingY * 2 + rowsTotalH + skylineHeight + footerHeight
  );
  canvas.width = width;
  canvas.height = totalHeight;

  // Base Canvas Background
  ctx.fillStyle = isDark ? '#0B1626' : '#F1F5F9';
  ctx.fillRect(0, 0, width, totalHeight);

  // =========================================================================
  // 1. EDITORIAL HEADER BANNER (Matches IMG-20261125-WA0006)
  // =========================================================================
  const heroImg = loadCachedImage(headerHeroSrc, onImageReady);

  ctx.save();
  ctx.fillStyle = isDark ? '#061220' : '#0A213C';
  ctx.fillRect(0, 0, width, headerHeight);

  if (heroImg) {
    // Draw hero photograph on right 60% of header
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(485, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, headerHeight);
    ctx.lineTo(420, headerHeight);
    ctx.closePath();
    ctx.clip();

    drawImageCover(ctx, heroImg, 410, 0, width - 410, headerHeight);

    // Smooth dark navy fade from left into hero photo
    const heroFade = ctx.createLinearGradient(420, 0, 680, 0);
    heroFade.addColorStop(0, isDark ? '#061220' : '#0A213C');
    heroFade.addColorStop(0.42, isDark ? 'rgba(6,18,32,0.75)' : 'rgba(10,33,60,0.72)');
    heroFade.addColorStop(1, 'rgba(10,33,60,0.12)');
    ctx.fillStyle = heroFade;
    ctx.fillRect(410, 0, width - 410, headerHeight);

    // Subtle right vignette for legibility of top-right tagline
    const rightVig = ctx.createLinearGradient(width - 200, 0, width, 120);
    rightVig.addColorStop(0, 'rgba(10,33,60,0)');
    rightVig.addColorStop(1, 'rgba(8,22,40,0.78)');
    ctx.fillStyle = rightVig;
    ctx.fillRect(width - 220, 0, 220, 140);
    ctx.restore();
  }

  // Diagonal orange accent ribbon separating text zone and hero photo
  ctx.beginPath();
  ctx.moveTo(575, 0);
  ctx.lineTo(594, 0);
  ctx.lineTo(525, headerHeight);
  ctx.lineTo(506, headerHeight);
  ctx.closePath();
  ctx.fillStyle = '#EA580C';
  ctx.fill();

  // Subtle gold hairline beside diagonal ribbon
  ctx.beginPath();
  ctx.moveTo(598, 0);
  ctx.lineTo(602, 0);
  ctx.lineTo(533, headerHeight);
  ctx.lineTo(529, headerHeight);
  ctx.closePath();
  ctx.fillStyle = '#F59E0B';
  ctx.fill();
  ctx.restore();

  // Top-right tagline
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 17px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Sidoarjo', width - 28, 36);
  ctx.fillText('Tangguh', width - 28, 56);
  ctx.fillStyle = '#FDBA74';
  ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Selamat', width - 28, 78);
  ctx.fillText('Bersama', width - 28, 96);
  ctx.restore();

  // Left Circular BPBD Logo
  const logoImg = loadCachedImage(BPBD_LOGO_SRC, onImageReady);
  const logoCx = 88;
  const logoCy = 86;
  const logoR = 48;
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

  // Main Header Titles
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 42px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    opts.cardMode === 'bulanan' ? 'REKAP BULANAN' : 'AGENDA KEGIATAN',
    154,
    82
  );
  ctx.fillStyle = '#FBBF24';
  ctx.font = '800 34px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText((opts.orgTitle || 'BPBD KAB. SIDOARJO').toUpperCase(), 154, 126);
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
  const pillGrad = ctx.createLinearGradient(36, 168, 530, 224);
  pillGrad.addColorStop(0, '#EA580C');
  pillGrad.addColorStop(1, '#F97316');
  drawRoundedRect(ctx, 36, 168, 496, 54, 27);
  ctx.fillStyle = pillGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Calendar icon inside pill
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.3;
  drawRoundedRect(ctx, 58, 183, 22, 22, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(58, 191);
  ctx.lineTo(80, 191);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 23px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(bannerText, 94, 203);
  ctx.restore();

  // =========================================================================
  // 2. TIMELINE BODY & AGENDA CARDS
  // =========================================================================
  let cursorY = headerHeight + bodyPaddingY;

  if (rowLayouts.length === 0) {
    ctx.save();
    drawRoundedRect(ctx, paddingX, cursorY, width - paddingX * 2, 175, 18);
    ctx.fillStyle = cardBgColor;
    ctx.fill();
    ctx.strokeStyle = isDark ? '#1E3A5F' : '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = isDark ? '#CBD5E1' : '#64748B';
    ctx.textAlign = 'center';
    ctx.font = '700 25px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Tidak ada agenda terjadwal pada periode ini.', width / 2, cursorY + 80);
    ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Silakan pilih tanggal lain atau tambah agenda baru.', width / 2, cursorY + 114);
    ctx.restore();
  } else {
    // Draw vertical timeline spine behind the left badges like IMG-20261125-WA0006
    const spineX = paddingX + 42;
    const firstCenterY = cursorY + rowLayouts[0].rowH / 2;
    const lastCenterY =
      cursorY +
      rowsTotalH -
      rowLayouts[rowLayouts.length - 1].rowH / 2;

    if (rowLayouts.length > 1) {
      ctx.save();
      ctx.strokeStyle = isDark ? '#334155' : '#94A3B8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(spineX, firstCenterY);
      ctx.lineTo(spineX, lastCenterY);
      ctx.stroke();
      ctx.restore();
    }

    rowLayouts.forEach((layout, idx) => {
      const { item, titleLines, locLines, hasBadgeTop, hasZoomLine, rowH } = layout;
      const cardX = paddingX;
      const cardW = width - paddingX * 2;
      const cardY = cursorY;

      // Card container with soft shadow
      ctx.save();
      ctx.shadowColor = isDark ? 'rgba(0,0,0,0.28)' : 'rgba(15, 23, 42, 0.06)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      drawRoundedRect(ctx, cardX, cardY, cardW, rowH, 16);
      ctx.fillStyle = cardBgColor;
      ctx.fill();
      ctx.restore();

      ctx.save();
      drawRoundedRect(ctx, cardX, cardY, cardW, rowH, 16);
      ctx.strokeStyle = isDark ? '#1F3B5C' : isCleanWhite ? '#CBD5E1' : '#E2E8F0';
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();

      // Optional right-aligned faded documentary photograph (matching IMG-20261125-WA0006)
      if (opts.showIllustration) {
        drawRowPhotoRight(ctx, cardX, cardY, cardW, rowH, cardBgColor, item, onImageReady);
      }

      // Left Stadium Time Badge + Circular Icon
      const isOnline =
        /zoom|daring|virtual|meet/i.test(item.lokasi) || item.kategori === 'Rapat Eksternal';
      const badgeColor = isOnline ? '#0B4F8A' : idx % 2 === 0 ? '#EA580C' : '#0B4F8A';
      const badgeX = cardX + 14;
      const badgeH = item.sampaiSelesai ? 70 : 62;
      const badgeY = cardY + rowH / 2 - badgeH / 2;
      const badgeW = 148;

      ctx.save();
      drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 32);
      ctx.fillStyle = badgeColor;
      ctx.fill();

      // Left circular ring inside stadium pill
      const iconCx = badgeX + 29;
      const iconCy = badgeY + badgeH / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(iconCx, iconCy, 20, 0, Math.PI * 2);
      ctx.fill();
      drawBadgeGlyph(ctx, iconCx, iconCy, item.kategori, isOnline);

      // Time text inside pill
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.font = '800 22px "JetBrains Mono", monospace';
      ctx.fillText(item.jamMulai.replace(':', '.'), badgeX + 58, badgeY + (item.sampaiSelesai ? 29 : 31));
      ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(
        item.sampaiSelesai ? 'WIB - Selesai' : `s.d ${item.jamSelesai.replace(':', '.')}`,
        badgeX + 58,
        badgeY + (item.sampaiSelesai ? 49 : 48)
      );
      ctx.restore();

      // Middle Content Block
      const textX = badgeX + badgeW + 18;
      let textY = cardY + 26;

      if (hasBadgeTop) {
        let pillOffsetX = textX;
        const conflicts = opts.showConflictBadge
          ? getConflictsForCandidate(opts.allAgendasForConflict, item)
          : [];
        if (opts.showUpdatedBadge && item.isUpdated) {
          ctx.save();
          drawRoundedRect(ctx, pillOffsetX, textY - 14, 108, 19, 5);
          ctx.fillStyle = '#DCFCE7';
          ctx.fill();
          ctx.fillStyle = '#15803D';
          ctx.font = '800 11px "Plus Jakarta Sans", system-ui, sans-serif';
          ctx.fillText('UPDATE / BARU', pillOffsetX + 8, textY);
          pillOffsetX += 116;
          ctx.restore();
        }
        if (conflicts.length > 0) {
          ctx.save();
          drawRoundedRect(ctx, pillOffsetX, textY - 14, 102, 19, 5);
          ctx.fillStyle = '#FEE2E2';
          ctx.fill();
          ctx.fillStyle = '#DC2626';
          ctx.font = '800 11px "Plus Jakarta Sans", system-ui, sans-serif';
          ctx.fillText(`BENTROK (${conflicts.length})`, pillOffsetX + 8, textY);
          ctx.restore();
        }
        textY += 22;
      }

      ctx.save();
      ctx.textAlign = 'left';
      ctx.fillStyle = isDark ? '#F8FAFC' : '#0F172A';
      ctx.font = '700 23px "Plus Jakarta Sans", system-ui, sans-serif';
      titleLines.forEach((line) => {
        ctx.fillText(line, textX, textY);
        textY += 29;
      });

      ctx.fillStyle = isDark ? '#94A3B8' : '#475569';
      ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
      locLines.forEach((line) => {
        ctx.fillText(line, textX, textY);
        textY += 22;
      });

      if (hasZoomLine && item.zoomUrl) {
        ctx.fillStyle = isDark ? '#60A5FA' : '#1D4ED8';
        ctx.font = '600 15px "JetBrains Mono", monospace';
        const zoomDisplay =
          item.zoomUrl.length > 46 ? `${item.zoomUrl.slice(0, 45)}…` : item.zoomUrl;
        ctx.fillText(`Zoom: ${zoomDisplay}`, textX, textY + 2);
      }
      ctx.restore();

      // PIC Pill Tag positioned cleanly before photo fade zone
      const rightEdge = cardX + cardW - 14;
      const picZoneRight = opts.showIllustration ? rightEdge - 148 : rightEdge;
      const picW = 204;
      const picX = picZoneRight - picW;
      const picText = item.pejabatPendamping || item.penyelenggara || 'Sekretariat BPBD';
      ctx.save();
      ctx.font = '700 15px "Plus Jakarta Sans", system-ui, sans-serif';
      const picLines = wrapTextLines(ctx, picText, picW - 36, 2);
      const picH = Math.max(38, picLines.length * 19 + 16);
      const picY = cardY + rowH / 2 - picH / 2;

      drawRoundedRect(ctx, picX, picY, picW, picH, 10);
      ctx.fillStyle = isDark ? 'rgba(30,41,59,0.94)' : 'rgba(255, 247, 237, 0.96)';
      ctx.fill();
      ctx.strokeStyle = isDark ? '#334155' : '#FED7AA';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#EA580C';
      ctx.beginPath();
      ctx.arc(picX + 16, picY + picH / 2 - 4, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(picX + 16, picY + picH / 2 + 6, 6.5, Math.PI, 0);
      ctx.fill();

      ctx.fillStyle = isDark ? '#FDBA74' : '#7C2D12';
      ctx.textAlign = 'left';
      picLines.forEach((pLine, lIdx) => {
        ctx.fillText(pLine, picX + 28, picY + 22 + lIdx * 18);
      });
      ctx.restore();

      cursorY += rowH + rowGap;
    });
  }

  // =========================================================================
  // 3. SIDOARJO SKYLINE SILHOUETTE + NAVY/ORANGE FOOTER
  // =========================================================================
  const footerY = totalHeight - footerHeight;
  drawSidoarjoSkylineSilhouette(
    ctx,
    width,
    footerY + 6,
    isDark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(15, 42, 74, 0.16)'
  );

  ctx.save();
  // Angled orange top accent border on footer
  ctx.fillStyle = '#EA580C';
  ctx.fillRect(0, footerY, width, 5);

  ctx.fillStyle = '#091E36';
  ctx.fillRect(0, footerY + 5, width, footerHeight - 5);

  // Subtle decorative compass/helm mark on bottom left
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(58, footerY + 50, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(58, footerY + 50, 6, 0, Math.PI * 2);
  ctx.stroke();
  for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 4) {
    ctx.beginPath();
    ctx.moveTo(58 + Math.cos(ang) * 8, footerY + 50 + Math.sin(ang) * 8);
    ctx.lineTo(58 + Math.cos(ang) * 21, footerY + 50 + Math.sin(ang) * 21);
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FBBF24';
  ctx.font = '800 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('SIAP  ·  CEPAT  ·  TEPAT  ·  HUMANIS', 92, footerY + 57);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Sidoarjo Tangguh', width - 36, footerY + 43);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 15px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Masyarakat Selamat, Bersama Kita Lebih Kuat', width - 36, footerY + 69);
  ctx.restore();
}

export function downloadPosterFile(
  canvas: HTMLCanvasElement,
  filenameBase: string,
  format: 'png' | 'jpeg'
) {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const url = canvas.toDataURL(mime, 0.95);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
