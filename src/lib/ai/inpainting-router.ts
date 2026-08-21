import { InpaintingParams, InpaintingResult } from '../../types/dp';
import sharp from 'sharp';

export interface InpaintingProvider {
  name: string;
  generateInsertion(params: InpaintingParams): Promise<InpaintingResult>;
}

/**
 * Routeur Inpainting Réel : Exécution d'inférence par API distante (fal.ai FLUX.1 Fill ou Replicate)
 * Envoie l'image d'origine, le masque PNG généré à partir de la toiture, et le prompt architectural.
 * AUCUN FALLBACK DESSINÉ EN LOCAL : En cas d'erreur ou d'absence de clé, lève une erreur 500 explicite.
 */
export class RealGenerativeInpaintingProvider implements InpaintingProvider {
  name = 'Real_Generative_Inpainting_API';
  private falKey: string;
  private replicateToken: string;

  constructor() {
    this.falKey = process.env.FAL_KEY || process.env.FAL_API_KEY || '';
    this.replicateToken = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '';
  }

  async generateInsertion(params: InpaintingParams): Promise<InpaintingResult> {
    const startTime = Date.now();

    if (!this.falKey && !this.replicateToken) {
      const errMsg = '[InpaintingProvider] ÉCHEC CRITIQUE : Aucune clé API configurée (FAL_KEY ou REPLICATE_API_TOKEN). Inférence IA impossible sans accès API.';
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const prompt =
      params.prompt ||
      `Photorealistic all-black sleek monocrystalline solar panel array neatly mounted on roof tiles, architectural rendering, natural sunlight reflections, realistic shadows, sharp perspective lines matching the roof slope, flush integrated mounting rails, French residential house facade, 8k resolution, photorealism.`;

    // Étape A : Génération du masque noir et blanc sur la toiture
    const { imageBase64, maskBase64 } = await this.buildRoofMask(params);

    // 1. Priorité FAL.AI (FLUX.1 Fill [pro])
    if (this.falKey) {
      console.log(`[InpaintingProvider] Appel API fal.ai (FLUX.1 Fill Pro)...`);
      try {
        const response = await fetch('https://fal.run/fal-ai/flux-pro/v1/fill', {
          method: 'POST',
          headers: {
            Authorization: `Key ${this.falKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            image_url: imageBase64,
            mask_url: maskBase64,
            output_format: 'jpeg',
            num_images: 1,
            safety_tolerance: '2',
          }),
        });

        const duration = Date.now() - startTime;

        if (!response.ok) {
          const errText = await response.text();
          const err = `[InpaintingProvider] Erreur HTTP ${response.status} de fal.ai (${duration}ms): ${errText}`;
          console.error(err);
          throw new Error(err);
        }

        const data = await response.json();
        const resultUrl = data.images?.[0]?.url;

        if (!resultUrl) {
          throw new Error('[InpaintingProvider] fal.ai n\'a retourné aucune URL d\'image générée.');
        }

        console.log(`[InpaintingProvider] Succès fal.ai FLUX.1 Fill (${duration}ms). Image reçue : ${resultUrl}`);

        // Téléchargement du binaire haute résolution
        const imgRes = await fetch(resultUrl);
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        const b64Out = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;

        return {
          imageUrl: resultUrl,
          imageBase64: b64Out,
          providerUsed: 'fal.ai_FLUX.1_Fill_Pro',
          executionTimeMs: duration,
        };
      } catch (err: any) {
        console.error('[InpaintingProvider] Échec fal.ai:', err.message);
        if (!this.replicateToken) {
          throw err;
        }
        console.log('[InpaintingProvider] Bascule vers Replicate...');
      }
    }

    // 2. Fallback REPLICATE (FLUX.1 Fill Pro / Dev)
    if (this.replicateToken) {
      console.log(`[InpaintingProvider] Appel API Replicate (FLUX.1 Fill)...`);
      try {
        const repRes = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            Authorization: `Token ${this.replicateToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: 'fb88289504103225307b9ae288640c777449306d4f5b3f2ae50ccbe507e6f994', // flux-fill-pro
            input: {
              prompt,
              image: imageBase64,
              mask: maskBase64,
              output_format: 'jpg',
              guidance_scale: 30,
            },
          }),
        });

        if (!repRes.ok) {
          const errText = await repRes.text();
          throw new Error(`[InpaintingProvider] Erreur Replicate création prediction (${repRes.status}): ${errText}`);
        }

        const prediction = await repRes.json();
        let resultPrediction = prediction;

        while (resultPrediction.status !== 'succeeded' && resultPrediction.status !== 'failed' && resultPrediction.status !== 'canceled') {
          await new Promise((r) => setTimeout(r, 1500));
          const pollRes = await fetch(resultPrediction.urls.get, {
            headers: { Authorization: `Token ${this.replicateToken}` },
          });
          resultPrediction = await pollRes.json();
        }

        const duration = Date.now() - startTime;

        if (resultPrediction.status !== 'succeeded' || !resultPrediction.output) {
          throw new Error(`[InpaintingProvider] Échec prédiction Replicate: ${resultPrediction.error || 'Statut ' + resultPrediction.status}`);
        }

        const outUrl = Array.isArray(resultPrediction.output) ? resultPrediction.output[0] : resultPrediction.output;
        console.log(`[InpaintingProvider] Succès Replicate FLUX.1 Fill (${duration}ms). Image reçue : ${outUrl}`);

        const imgRes = await fetch(outUrl);
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        const b64Out = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;

        return {
          imageUrl: outUrl,
          imageBase64: b64Out,
          providerUsed: 'Replicate_FLUX.1_Fill_Pro',
          executionTimeMs: duration,
        };
      } catch (err: any) {
        console.error('[InpaintingProvider] Échec Replicate:', err.message);
        throw err;
      }
    }

    throw new Error('[InpaintingProvider] Aucun provider IA disponible.');
  }

  /**
   * Création du masque binaire (Noir = préservé, Blanc = zone à inpainter par l'IA)
   */
  private async buildRoofMask(params: InpaintingParams): Promise<{ imageBase64: string; maskBase64: string }> {
    const cleanImg = params.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imgBuf = Buffer.from(cleanImg, 'base64');
    const meta = await sharp(imgBuf).metadata();
    const w = meta.width || 1200;
    const h = meta.height || 800;

    // Définition du polygone de masque selon coordonnées toiture
    const maskSvg = `
      <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="black" />
        <polygon points="${Math.round(w * 0.58)},${Math.round(h * 0.30)} ${Math.round(w * 0.90)},${Math.round(h * 0.35)} ${Math.round(w * 0.86)},${Math.round(h * 0.70)} ${Math.round(w * 0.55)},${Math.round(h * 0.65)}" fill="white" />
      </svg>
    `;

    const maskBuf = await sharp(Buffer.from(maskSvg)).png().toBuffer();

    return {
      imageBase64: `data:image/jpeg;base64,${cleanImg}`,
      maskBase64: `data:image/png;base64,${maskBuf.toString('base64')}`,
    };
  }
}

export function getInpaintingRouter(): InpaintingProvider {
  return new RealGenerativeInpaintingProvider();
}
