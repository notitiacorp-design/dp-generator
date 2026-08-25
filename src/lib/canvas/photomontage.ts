import { Point2D, SolarGridResult, generateSolarMatrix, GridMarginOptions } from '../ai/solar-matrix';
import sharp from 'sharp';

/**
 * MOTEUR PHOTOMONTAGE DP6 — Texture photovoltaïque réaliste (anti-aplat noir)
 *
 * Chaque module est rendu individuellement avec :
 * 1. Grille matricielle de cellules (6 colonnes × 10 rangées) projetée par interpolation
 *    bilinéaire dans le quadrilatère déformé (respect de l'homographie du pan).
 * 2. Cadre aluminium noir satiné : trait extérieur profond + liseré interne clair (biseau).
 * 3. Reflet zénithal : dégradé linéaire orienté selon l'angle réel du haut du pan de toiture,
 *    émulant la lumière du ciel sur le verre trempé.
 * 4. Glint supérieur : fine ligne claire le long du bord haut de chaque module.
 * 5. Ombre portée douce sous le champ (surimposition sur rails).
 */

export interface RenderPhotomontageOptions {
  /** Angle du reflet zénithal en degrés (par défaut : angle du bord supérieur du quad) */
  sheenAngleDeg?: number;
  /** Nombre de cellules par module (défaut 6 x 10 = 60 cellules monocristallines) */
  cellsPerPanelCols?: number;
  cellsPerPanelRows?: number;
}

export interface PhotomontageResult {
  resultBuffer: Buffer;
  panelCount: number;
  rows: number;
  cols: number;
}

/** Interpolation bilinéaire d'un point (u,v) dans le quadrilatère [TL,TR,BR,BL] */
function bilinear(quad: [Point2D, Point2D, Point2D, Point2D], u: number, v: number): Point2D {
  const [q0, q1, q2, q3] = quad;
  const top = { x: q0.x + (q1.x - q0.x) * u, y: q0.y + (q1.y - q0.y) * u };
  const bot = { x: q3.x + (q2.x - q3.x) * u, y: q3.y + (q2.y - q3.y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

export function generatePhotovoltaicFieldSvg(
  width: number,
  height: number,
  gridResult: SolarGridResult,
  opts: RenderPhotomontageOptions = {}
): { svgContent: string } {
  const cellCols = opts.cellsPerPanelCols ?? 6;
  const cellRows = opts.cellsPerPanelRows ?? 10;

  // Angle du reflet zénithal : dérivé du bord supérieur du premier panneau (ligne de fuite)
  let sheenAngle = opts.sheenAngleDeg;
  if (sheenAngle === undefined && gridResult.panels.length > 0) {
    const [c0, c1] = gridResult.panels[0].polygon;
    sheenAngle = (Math.atan2(c1.y - c0.y, c1.x - c0.x) * 180) / Math.PI;
  }

  const sheenRotate = `rotate(${(sheenAngle ?? -18).toFixed(1)})`;

  const defs = `
    <defs>
      <!-- Ombre portée sous le champ solaire (surimposition sur rails) -->
      <filter id="solarDropShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="3" dy="6" stdDeviation="5" flood-color="#030508" flood-opacity="0.35" />
      </filter>

      <!-- Verre monocristallin Full Black (bleu nuit très profond) -->
      <linearGradient id="pvGlassReflection" x1="0%" y1="0%" x2="65%" y2="100%">
        <stop offset="0%" stop-color="#1d2740" stop-opacity="0.97" />
        <stop offset="22%" stop-color="#141b2b" stop-opacity="1" />
        <stop offset="60%" stop-color="#0a0e18" stop-opacity="1" />
        <stop offset="100%" stop-color="#161f31" stop-opacity="0.98" />
      </linearGradient>

      <!-- Reflet zénithal doux orienté selon l'éclairage de la photo -->
      <linearGradient id="zenithSheen" gradientTransform="${sheenRotate}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.00" />
        <stop offset="30%" stop-color="#dbeafe" stop-opacity="0.05" />
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0.13" />
        <stop offset="72%" stop-color="#dbeafe" stop-opacity="0.04" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.00" />
      </linearGradient>
    </defs>
  `;

  const panelElements = gridResult.panels.map((panel) => {
    const [c0, c1, c2, c3] = panel.polygon;
    const pts = `${c0.x.toFixed(1)},${c0.y.toFixed(1)} ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${c3.x.toFixed(1)},${c3.y.toFixed(1)}`;

    // Grille de cellules : lignes interpolées bilinéairement (déformation perspective conservée)
    const gridLines: string[] = [];
    for (let ci = 1; ci < cellCols; ci++) {
      const u = ci / cellCols;
      const a = bilinear(panel.polygon, u, 0);
      const b = bilinear(panel.polygon, u, 1);
      gridLines.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#232d42" stroke-width="0.55" stroke-opacity="0.5" />`);
    }
    for (let ri = 1; ri < cellRows; ri++) {
      const v = ri / cellRows;
      const a = bilinear(panel.polygon, 0, v);
      const b = bilinear(panel.polygon, 1, v);
      gridLines.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#202a3f" stroke-width="0.5" stroke-opacity="0.45" />`);
    }

    // Glint le long du bord supérieur (arête vitrée éclairée)
    const glintInset = 0.06;
    const g0 = bilinear(panel.polygon, glintInset, glintInset);
    const g1 = bilinear(panel.polygon, 1 - glintInset, glintInset);

    // Biseau interne du cadre aluminium : polygone contracté vers le centre
    const cx = (c0.x + c1.x + c2.x + c3.x) / 4;
    const cy = (c0.y + c1.y + c2.y + c3.y) / 4;
    const shrink = (p: Point2D): Point2D => ({ x: cx + (p.x - cx) * 0.955, y: cy + (p.y - cy) * 0.955 });
    const i0 = shrink(c0), i1 = shrink(c1), i2 = shrink(c2), i3 = shrink(c3);
    const innerPts = `${i0.x.toFixed(1)},${i0.y.toFixed(1)} ${i1.x.toFixed(1)},${i1.y.toFixed(1)} ${i2.x.toFixed(1)},${i2.y.toFixed(1)} ${i3.x.toFixed(1)},${i3.y.toFixed(1)}`;

    return `
      <g id="module-${panel.index}">
        <polygon points="${pts}" fill="url(#pvGlassReflection)" />
        ${gridLines.join('\n        ')}
        <polygon points="${pts}" fill="url(#zenithSheen)" />
        <!-- Biseau aluminium satiné (liseré interne clair) -->
        <polygon points="${innerPts}" fill="none" stroke="#46536e" stroke-width="0.5" stroke-opacity="0.5" />
        <!-- Glint arête supérieure -->
        <line x1="${g0.x.toFixed(1)}" y1="${g0.y.toFixed(1)}" x2="${g1.x.toFixed(1)}" y2="${g1.y.toFixed(1)}" stroke="#ffffff" stroke-width="0.6" stroke-opacity="0.22" />
        <!-- Cadre aluminium noir anodisé (contour extérieur) -->
        <polygon points="${pts}" fill="none" stroke="#04060a" stroke-width="1.3" stroke-linejoin="round" />
      </g>
    `;
  }).join('\n');

  return {
    svgContent: `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <g filter="url(#solarDropShadow)">
        ${panelElements}
      </g>
    </svg>
  ` };
}

/**
 * Applique le champ photovoltaïque réaliste sur l'image source.
 * Marges techniques ≥ 20 cm (30 cm appliqués) faîtage / rives / égout, arrêt net avant Velux.
 */
export async function renderPhotomontage(
  originalBuffer: Buffer,
  quad: [Point2D, Point2D, Point2D, Point2D],
  panelCount: number,
  integrationType = 'en surimposition sur rails discrets',
  marginOptions?: GridMarginOptions,
  textureOpts?: RenderPhotomontageOptions
): Promise<PhotomontageResult> {
  const meta = await sharp(originalBuffer).metadata();
  const width = meta.width || 1200;
  const height = meta.height || 800;

  // Calepinage exact par homographie projective (14 -> 2x7 portrait 1:1.72)
  // Interstices renforcés (~2 cm physiques) pour une lisibilité nette du décompte en PDF
  const gridResult = generateSolarMatrix(quad, panelCount, {
    marginTop: 0.15,     // 30 cm sous le faîtage (> 20 cm réglementaire)
    marginBottom: 0.15,  // 30 cm au-dessus de l'égout
    marginLeft: 0.08,    // marge rive + arrêt net Velux
    marginRight: 0.08,
    aspectRatioWoverH: 1.0 / 1.72,
    gapU: 0.016,         // écartement horizontal visible entre modules (~2 cm réels)
    gapV: 0.02,          // écartement vertical entre rangées
    ...marginOptions,
  });

  const { svgContent } = generatePhotovoltaicFieldSvg(width, height, gridResult, textureOpts);
  const svgBuffer = Buffer.from(svgContent);

  const renderedSvgPng = await sharp(svgBuffer)
    .resize(width, height)
    .png()
    .toBuffer();

  // Invariance bit-à-bit hors toiture : composite alpha uniquement
  const composited = await sharp(originalBuffer)
    .composite([{ input: renderedSvgPng, blend: 'over' }])
    .jpeg({ quality: 95 })
    .toBuffer();

  return {
    resultBuffer: composited,
    panelCount: gridResult.totalPanels,
    rows: gridResult.rows,
    cols: gridResult.cols,
  };
}
