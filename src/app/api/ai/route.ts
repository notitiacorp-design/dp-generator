import { NextRequest, NextResponse } from 'next/server';
import { getVisionRouter } from '../../../lib/ai/vision-router';
import { getInpaintingRouter } from '../../../lib/ai/inpainting-router';
import { InpaintingParams } from '../../../types/dp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, imageBase64, maskBase64, projectType, panelCount } = body;

    // 1. Détection de toiture & coordonnées spatiales
    if (action === 'detect_roof') {
      if (!imageBase64) {
        return NextResponse.json({ error: 'imageBase64 requis' }, { status: 400 });
      }

      const visionRouter = getVisionRouter();
      const detection = await visionRouter.detectRoof(imageBase64);
      return NextResponse.json({ success: true, detection });
    }

    // 2. Génération Inpainting DP6 / DP7
    if (action === 'inpaint_dp6') {
      if (!imageBase64) {
        return NextResponse.json({ error: 'imageBase64 requis' }, { status: 400 });
      }

      let detectedRoofPolygon = body.roofPolygon;

      // Si le polygone de toiture n'a pas été fourni au préalable, on déclenche l'API Vision Gemini
      if (!detectedRoofPolygon) {
        console.log('[API/AI] Exécution de l\'analyse Vision Gemini pour détection dynamique de toiture...');
        const visionRouter = getVisionRouter();
        const detection = await visionRouter.detectRoof(imageBase64);
        if (!detection || !detection.roofPolygon) {
          throw new Error('[API/AI] Échec de détection de toiture par l\'API Vision (aucun polygone retourné).');
        }
        detectedRoofPolygon = detection.roofPolygon;
      }

      console.log('[API/AI] Transmission du polygone dynamique à l\'inpainting :', detectedRoofPolygon);

      const inpaintingRouter = getInpaintingRouter();
      const params: InpaintingParams = {
        imageBase64,
        maskBase64,
        roofPolygon: detectedRoofPolygon,
        projectType: projectType || 'SOLAR_PANELS',
        panelCount: panelCount || 12,
      };

      const result = await inpaintingRouter.generateInsertion(params);
      return NextResponse.json({ success: true, result, roofPolygon: detectedRoofPolygon });
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (error: any) {
    console.error('Erreur API Inpainting / Vision:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
