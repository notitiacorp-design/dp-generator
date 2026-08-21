import { InpaintingParams, InpaintingResult } from '../../types/dp';
import sharp from 'sharp';

export interface InpaintingProvider {
  name: string;
  generateInsertion(params: InpaintingParams): Promise<InpaintingResult>;
}

/**
 * Routeur Inpainting d'IA Générative Professionnelle
 * Supporte fal.ai (FLUX.1 Fill Pro / Dev) et Replicate (Stable Diffusion / Flux Inpainting).
 * Génère un masque propre et ciblé sur la toiture et injecte la simulation photoréaliste.
 */
export class GenerativeAiInpaintingProvider implements InpaintingProvider {
  name = 'GenerativeAI_FluxFill';
  private falKey: string;
  private replicateToken: string;

  constructor() {
    this.falKey = process.env.FAL_KEY || process.env.FAL_API_KEY || '';
    this.replicateToken = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '';
  }

  async generateInsertion(params: InpaintingParams): Promise<InpaintingResult> {
    const startTime = Date.now();

    // Construction du prompt architectural strict
    const prompt =
      params.prompt ||
      `Photorealistic all-black sleek monocrystalline solar panel array neatly mounted on roof tiles, architectural rendering, natural sunlight reflections, realistic shadows, sharp perspective lines matching the roof slope, flush integrated mounting rails, French residential house facade, 8k resolution, photorealism.`;

    // 1. Préparation de l'image et du masque toiture ciblé
    const { imageBase64, maskBase64 } = await this.prepareImageAndMask(params);

    // 2. Appel API fal.ai (FLUX.1 Fill [pro] ou [dev])
    if (this.falKey) {
      try {
        console.log('[Inpainting] Appel API fal.ai FLUX.1 Fill...');
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

        if (response.ok) {
          const data = await response.json();
          const resultUrl = data.images?.[0]?.url;
          if (resultUrl) {
            // Téléchargement du binaire haute résolution
            const imgRes = await fetch(resultUrl);
            const imgBuf = Buffer.from(await imgRes.arrayBuffer());
            const b64Out = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;
            return {
              imageUrl: b64Out,
              imageBase64: b64Out,
              providerUsed: 'fal.ai_FLUX.1_Fill_Pro',
              executionTimeMs: Date.now() - startTime,
            };
          }
        } else {
          const errText = await response.text();
          console.warn('[Inpainting fal.ai] Erreur API:', errText);
        }
      } catch (err) {
        console.error('[Inpainting fal.ai] Échec requête:', err);
      }
    }

    // 3. Appel API Replicate (Fallback Flux Inpainting)
    if (this.replicateToken) {
      try {
        console.log('[Inpainting] Appel API Replicate Flux Inpainting...');
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

        if (repRes.ok) {
          const prediction = await repRes.json();
          // Poll prediction
          let resultPrediction = prediction;
          while (resultPrediction.status !== 'succeeded' && resultPrediction.status !== 'failed') {
            await new Promise((r) => setTimeout(r, 1500));
            const pollRes = await fetch(resultPrediction.urls.get, {
              headers: { Authorization: `Token ${this.replicateToken}` },
            });
            resultPrediction = await pollRes.json();
          }

          if (resultPrediction.status === 'succeeded' && resultPrediction.output) {
            const outUrl = Array.isArray(resultPrediction.output) ? resultPrediction.output[0] : resultPrediction.output;
            const imgRes = await fetch(outUrl);
            const imgBuf = Buffer.from(await imgRes.arrayBuffer());
            const b64Out = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;
            return {
              imageUrl: b64Out,
              imageBase64: b64Out,
              providerUsed: 'Replicate_FLUX.1_Fill',
              executionTimeMs: Date.now() - startTime,
            };
          }
        }
      } catch (err) {
        console.error('[Inpainting Replicate] Échec requête:', err);
      }
    }

    // 4. Moteur Calepinage Continu Photométrique (Châssis continu homogène sans découpe gadget)
    return this.renderContinuousHomogeneousArray(params, startTime);
  }

  /**
   * Génère un masque noir et blanc de toiture sur la zone continue libre
   */
  private async prepareImageAndMask(params: InpaintingParams): Promise<{ imageBase64: string; maskBase64: string }> {
    const cleanImg = params.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imgBuf = Buffer.from(cleanImg, 'base64');
    const meta = await sharp(imgBuf).metadata();
    const w = meta.width || 1200;
    const h = meta.height || 800;

    // Masque B&W : Zone continue homogène sur le pan droit de toiture
    const maskSvg = `
      <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="black" />
        <polygon points="${Math.round(w * 0.58)},${Math.round(h * 0.32)} ${Math.round(w * 0.88)},${Math.round(h * 0.36)} ${Math.round(w * 0.85)},${Math.round(h * 0.68)} ${Math.round(w * 0.56)},${Math.round(h * 0.64)}" fill="white" />
      </svg>
    `;

    const maskBuf = await sharp(Buffer.from(maskSvg)).png().toBuffer();
    return {
      imageBase64: `data:image/jpeg;base64,${cleanImg}`,
      maskBase64: `data:image/png;base64,${maskBuf.toString('base64')}`,
    };
  }

  /**
   * Rendu de Calepinage Continu Homogène Métier (Champ unifié compact en perspective)
   */
  private async renderContinuousHomogeneousArray(params: InpaintingParams, startTime: number): Promise<InpaintingResult> {
    const cleanImg = params.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imgBuf = Buffer.from(cleanImg, 'base64');
    const meta = await sharp(imgBuf).metadata();
    const w = meta.width || 1200;
    const h = meta.height || 800;

    // Bloc continu compact professionnel (ex: 2 rangées de 6 panneaux = 12 à 14 modules posés d'un seul tenant)
    // Emplacement : Pan de toiture libre à droite du Velux pour respect absolu des règles de l'art
    const startX = Math.round(w * 0.60);
    const startY = Math.round(h * 0.34);
    const cols = 5;
    const rows = 2;
    const modW = Math.round(w * 0.052);
    const modH = Math.round(h * 0.12);
    const spacing = 3;

    let modulesSvg = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mx = startX + c * (modW + spacing) + r * 10;
        const my = startY + r * (modH + spacing);
        modulesSvg += `
          <rect x="${mx}" y="${my}" width="${modW}" height="${modH}" rx="1" fill="#080c14" stroke="#1e293b" stroke-width="1.2" />
          <rect x="${mx + 1.5}" y="${my + 1.5}" width="${modW - 3}" height="${modH - 3}" fill="url(#photovoltaicCell)" />
          <line x1="${mx + 1}" y1="${my + modH / 2}" x2="${mx + modW - 1}" y2="${my + modH / 2}" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="0.8" />
          <line x1="${mx + modW / 2}" y1="${my + 1}" x2="${mx + modW / 2}" y2="${my + modH - 1}" stroke="#38bdf8" stroke-opacity="0.25" stroke-width="0.8" />
        `;
      }
    }

    const fieldWidth = cols * (modW + spacing) + rows * 10 + 10;
    const fieldHeight = rows * (modH + spacing) + 8;

    const overlaySvg = `
      <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="photovoltaicCell" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#090d16" />
            <stop offset="50%" stop-color="#020408" />
            <stop offset="100%" stop-color="#111c2e" />
          </linearGradient>
          <linearGradient id="glassSheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.5" />
            <stop offset="60%" stop-color="#ffffff" stop-opacity="0.0" />
          </linearGradient>
        </defs>

        <g transform="skewX(-10) skewY(2)">
          <!-- Ombrage global du champ photovoltaïque continu sous toiture -->
          <rect x="${startX - 4}" y="${startY - 2}" width="${fieldWidth + 10}" height="${fieldHeight + 8}" rx="4" fill="rgba(0,0,0,0.45)" />
          
          <!-- Châssis rail aluminium noir continu de l'installation -->
          <rect x="${startX - 2}" y="${startY - 2}" width="${fieldWidth + 4}" height="${fieldHeight + 4}" rx="3" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
          
          <!-- Modules photovoltaïques intégrés -->
          ${modulesSvg}

          <!-- Reflet de surface du verre antireflet homogène -->
          <polygon points="${startX},${startY} ${startX + fieldWidth},${startY} ${startX},${startY + fieldHeight}" fill="url(#glassSheen)" opacity="0.35" />
        </g>
      </svg>
    `;

    const composited = await sharp(imgBuf)
      .composite([{ input: Buffer.from(overlaySvg), blend: 'over' }])
      .jpeg({ quality: 98 })
      .toBuffer();

    const outB64 = `data:image/jpeg;base64,${composited.toString('base64')}`;
    return {
      imageUrl: outB64,
      imageBase64: outB64,
      providerUsed: 'Deterministic_ContinuousArray_Field',
      executionTimeMs: Date.now() - startTime,
    };
  }
}

export function getInpaintingRouter(): InpaintingProvider {
  return new GenerativeAiInpaintingProvider();
}
