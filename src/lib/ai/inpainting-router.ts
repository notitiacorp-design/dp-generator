import { InpaintingParams, InpaintingResult } from '../../types/dp';
import sharp from 'sharp';
import { generateSolarMatrix, Point2D } from './solar-matrix';
import { renderPhotomontage } from '../canvas/photomontage';

export interface InpaintingProvider {
  name: string;
  generateInsertion(params: InpaintingParams): Promise<InpaintingResult>;
}

/**
 * Routeur Déterministe Haute Fidélité (Moteur CAO Graphique Sharp / SVG) :
 * - Garantit exactement le nombre de modules demandés (ex: 14 panneaux -> 2x7)
 * - Rendu au pixel près sans dépendre des hallucinations d'un modèle de diffusion
 * - Reflets vitrage monocristallin Full Black, micro-lignes de cellules, cadre fin et ombres portées
 * - Invariance absolue sur le reste de la scène
 */
export class RealGenerativeInpaintingProvider implements InpaintingProvider {
  name = 'Deterministic_HD_Solar_Renderer';

  async generateInsertion(params: InpaintingParams): Promise<InpaintingResult> {
    const startTime = Date.now();

    const panelCount = params.panelCount || 14;
    const integrationType = params.integrationType || 'en surimposition sur rails discrets';

    const cleanImg = params.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imgBuf = Buffer.from(cleanImg, 'base64');
    const meta = await sharp(imgBuf).metadata();
    const w = meta.width || 1200;
    const h = meta.height || 800;

    if (!params.roofPolygon || !Array.isArray(params.roofPolygon) || params.roofPolygon.length === 0) {
      throw new Error('[InpaintingProvider] Impossible d\'appliquer le calepinage : Aucun polygone de toiture fourni par l\'analyse Vision.');
    }

    const rawPoly = params.roofPolygon;
    let quadCorners: [Point2D, Point2D, Point2D, Point2D];

    if (rawPoly.length === 4 && typeof rawPoly[0] === 'number' && typeof rawPoly[1] === 'number') {
      const yminNorm = (rawPoly[0] as unknown as number) > 1 ? (rawPoly[0] as unknown as number) / 1000 : (rawPoly[0] as unknown as number);
      const xminNorm = (rawPoly[1] as unknown as number) > 1 ? (rawPoly[1] as unknown as number) / 1000 : (rawPoly[1] as unknown as number);
      const ymaxNorm = (rawPoly[2] as unknown as number) > 1 ? (rawPoly[2] as unknown as number) / 1000 : (rawPoly[2] as unknown as number);
      const xmaxNorm = (rawPoly[3] as unknown as number) > 1 ? (rawPoly[3] as unknown as number) / 1000 : (rawPoly[3] as unknown as number);

      const pxMin = Math.round(xminNorm * w);
      const pyMin = Math.round(yminNorm * h);
      const pxMax = Math.round(xmaxNorm * w);
      const pyMax = Math.round(ymaxNorm * h);

      quadCorners = [
        { x: pxMin, y: pyMin }, // Top-Left
        { x: pxMax, y: pyMin }, // Top-Right
        { x: pxMax, y: pyMax }, // Bottom-Right
        { x: pxMin, y: pyMax }, // Bottom-Left
      ];
    } else {
      const points: Point2D[] = (rawPoly as any[]).map((pt) => {
        // Détection de l'ordre [y, x] (convention Vision IA) vs [x, y]
        const val1 = pt[0];
        const val2 = pt[1];
        const n1 = val1 > 1 ? val1 / 1000 : val1;
        const n2 = val2 > 1 ? val2 / 1000 : val2;

        return {
          x: Math.round(n2 * w),
          y: Math.round(n1 * h),
        };
      });

      if (points.length >= 4) {
        // On trie géométriquement les 4 points pour garantir [TL, TR, BR, BL] dans l'ordre de perspective
        const sortedByY = [...points].sort((a, b) => a.y - b.y);
        const topTwo = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x); // TL, TR
        const botTwo = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x); // BL, BR

        quadCorners = [
          topTwo[0], // Top-Left (p0)
          topTwo[1], // Top-Right (p1)
          botTwo[1], // Bottom-Right (p2)
          botTwo[0], // Bottom-Left (p3)
        ];
      } else {
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        quadCorners = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
      }
    }

    // 1. GÉNÉRATION DIRECTE HAUTE DÉFINITION DÉTERMINISTE (Moteur photomontage texture réaliste)
    console.log(`[InpaintingProvider] Rendu photomontage réaliste pour ${panelCount} modules sur toiture...`);
    const { resultBuffer, rows, cols } = await renderPhotomontage(
      imgBuf,
      quadCorners,
      panelCount,
      integrationType
    );

    const duration = Date.now() - startTime;
    const b64Out = `data:image/jpeg;base64,${resultBuffer.toString('base64')}`;

    console.log(`[InpaintingProvider] Succès du calepinage déterministe HD (${panelCount} panneaux, ${rows}x${cols}) en ${duration}ms.`);

    return {
      imageUrl: b64Out,
      imageBase64: b64Out,
      providerUsed: 'Deterministic_HD_Solar_Matrix',
      executionTimeMs: duration,
    };
  }
}

export function getInpaintingRouter(): InpaintingProvider {
  return new RealGenerativeInpaintingProvider();
}
