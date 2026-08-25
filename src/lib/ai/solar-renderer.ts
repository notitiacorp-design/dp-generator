import { Point2D, SolarGridResult, generateSolarMatrix, GridMarginOptions } from './solar-matrix';
import sharp from 'sharp';

export interface RenderPhotovoltaicOptions {
  width: number;
  height: number;
  quad: [Point2D, Point2D, Point2D, Point2D];
  panelCount: number;
  integrationType?: string;
  marginOptions?: GridMarginOptions;
}

/**
 * Moteur de rendu graphique SVG/Sharp déterministe HD avec déformation projective (Homographie)
 * Dessine chaque panneau individuellement avec :
 * - Cadre aluminium noir fin
 * - Surface photovoltaïque bleu nuit/noir profond (Full Black)
 * - Dégradé subtil de réflexion du ciel (reflets vitrage)
 * - Cellules monocristallines avec micro-lignes de busbars
 * - Ombre portée réaliste (drop shadow) sur les tuiles sous les panneaux
 */
export function generatePhotovoltaicFieldSvg(
  width: number,
  height: number,
  gridResult: SolarGridResult
): { svgContent: string } {
  const defs = `
    <defs>
      <!-- Ombre portée douce sous le champ solaire pour marquer la surimposition sur les tuiles -->
      <filter id="solarDropShadow" x="-20%" y="-20%" width="150%" height="150%">
        <feDropShadow dx="2" dy="5" stdDeviation="4" flood-color="#030508" flood-opacity="0.6" />
      </filter>

      <!-- Dégradé de verre antireflet monocristallin Full Black -->
      <linearGradient id="pvGlassReflection" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1b2334" stop-opacity="0.98" />
        <stop offset="25%" stop-color="#121724" stop-opacity="1" />
        <stop offset="70%" stop-color="#080b12" stop-opacity="1" />
        <stop offset="100%" stop-color="#151d2c" stop-opacity="0.98" />
      </linearGradient>

      <!-- Reflet spéculaire vitré linéaire directionnel -->
      <linearGradient id="specularGlint" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.0" />
        <stop offset="40%" stop-color="#ffffff" stop-opacity="0.05" />
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
      </linearGradient>
    </defs>
  `;

  // Construction des polygones de chaque panneau
  const panelElements = gridResult.panels
    .map((panel) => {
      const [c0, c1, c2, c3] = panel.polygon;
      const pts = `${c0.x.toFixed(1)},${c0.y.toFixed(1)} ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${c3.x.toFixed(1)},${c3.y.toFixed(1)}`;

      // Calcul des lignes internes (busbars / cellules) par interpolation bilinéaire
      const midLeftTop = { x: (c0.x * 2 + c3.x) / 3, y: (c0.y * 2 + c3.y) / 3 };
      const midRightTop = { x: (c1.x * 2 + c2.x) / 3, y: (c1.y * 2 + c2.y) / 3 };

      const midLeftBot = { x: (c0.x + c3.x * 2) / 3, y: (c0.y + c3.y * 2) / 3 };
      const midRightBot = { x: (c1.x + c2.x * 2) / 3, y: (c1.y + c2.y * 2) / 3 };

      const midTop = { x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 };
      const midBot = { x: (c3.x + c2.x) / 2, y: (c3.y + c2.y) / 2 };

      return `
        <g id="panel-${panel.index}">
          <!-- Fond du panneau avec dégradé monocristallin Full Black -->
          <polygon points="${pts}" fill="url(#pvGlassReflection)" stroke="#090c12" stroke-width="1.0" />
          
          <!-- Lignes de cellules internes très subtiles (grid monocristallin) -->
          <line x1="${midLeftTop.x.toFixed(1)}" y1="${midLeftTop.y.toFixed(1)}" x2="${midRightTop.x.toFixed(1)}" y2="${midRightTop.y.toFixed(1)}" stroke="#242e42" stroke-width="0.5" stroke-opacity="0.35" />
          <line x1="${midLeftBot.x.toFixed(1)}" y1="${midLeftBot.y.toFixed(1)}" x2="${midRightBot.x.toFixed(1)}" y2="${midRightBot.y.toFixed(1)}" stroke="#242e42" stroke-width="0.5" stroke-opacity="0.35" />
          <line x1="${midTop.x.toFixed(1)}" y1="${midTop.y.toFixed(1)}" x2="${midBot.x.toFixed(1)}" y2="${midBot.y.toFixed(1)}" stroke="#242e42" stroke-width="0.5" stroke-opacity="0.35" />

          <!-- Reflet vitrage spéculaire -->
          <polygon points="${pts}" fill="url(#specularGlint)" />

          <!-- Cadre aluminium noir anodisé fin (bord extérieur) -->
          <polygon points="${pts}" fill="none" stroke="#040609" stroke-width="1.2" stroke-linejoin="round" />
        </g>
      `;
    })
    .join('\n');

  const svgContent = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <g filter="url(#solarDropShadow)">
        ${panelElements}
      </g>
    </svg>
  `;

  return { svgContent };
}

/**
 * Applique le champ photovoltaïque haute définition directement sur le buffer de l'image source
 */
export async function renderPhotovoltaicOverlay(
  originalBuffer: Buffer,
  quad: [Point2D, Point2D, Point2D, Point2D],
  panelCount: number,
  integrationType = 'en surimposition sur rails discrets',
  marginOptions?: GridMarginOptions
): Promise<{ resultBuffer: Buffer; panelCount: number; rows: number; cols: number }> {
  const meta = await sharp(originalBuffer).metadata();
  const width = meta.width || 1200;
  const height = meta.height || 800;

  // 1. Calcul géométrique exact par Homographie projective (ex: 14 -> 2 rangées de 7 modules avec ratio 1.7x1.0m)
  const gridResult = generateSolarMatrix(quad, panelCount, {
    marginTop: 0.15,    // Marge de 30 cm sous le faîtage (zéro panneau dans le ciel)
    marginBottom: 0.15, // Marge de 30 cm au-dessus de la gouttière
    marginLeft: 0.08,   // Marge rive gauche / Velux
    marginRight: 0.08,  // Marge rive droite
    aspectRatioWoverH: 1.0 / 1.72, // Ratio portrait panneau
    ...marginOptions,
  });

  // 2. Génération du rendu vectoriel HD avec perspective, reflets et ombres
  const { svgContent } = generatePhotovoltaicFieldSvg(width, height, gridResult);
  const svgBuffer = Buffer.from(svgContent);

  // 3. Rendu rasterisé haute fidélité du calque SVG avec canal alpha
  const renderedSvgPng = await sharp(svgBuffer)
    .resize(width, height)
    .png()
    .toBuffer();

  // 4. Fusion déterministe sur l'image d'origine (invariance absolue du reste de la scène)
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
