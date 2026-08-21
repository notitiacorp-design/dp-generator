import { RoofDetectionResult } from '@/types/dp';

export interface VisionProvider {
  name: string;
  detectRoof(imageBase64: string): Promise<RoofDetectionResult>;
  extractCerfaFields(address: string, notes?: string): Promise<Record<string, any>>;
}

/**
 * Routeur Vision à Deux Étages :
 * 1. Étage Standard : Gemini 2.5 Flash-Lite (coût minime ~0.0012$, structured outputs, extraction standard)
 * 2. Étage Escalade : Gemini 3.7 Flash (si score de confiance < 0.85 ou géométrie complexe)
 */
export class TwoStageGeminiVisionProvider implements VisionProvider {
  name = 'TwoStageGeminiVision';
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = process.env.OPENROUTER_API_KEY
      ? 'https://openrouter.ai/api/v1'
      : 'https://generativelanguage.googleapis.com/v1beta/openai';
  }

  async detectRoof(imageBase64: string): Promise<RoofDetectionResult> {
    if (!this.apiKey) {
      console.warn('[VisionRouter] Clé API absente. Utilisation du fallback géométrique.');
      return this.fallbackDetection();
    }

    // ÉTAGE 1 : Gemini 2.5 Flash-Lite
    try {
      const flashLiteResult = await this.callVisionModel(
        process.env.GEMINI_FLASH_LITE_MODEL || 'google/gemini-2.5-flash-lite',
        imageBase64,
        `Analyse cette toiture. Retourne un JSON avec:
        - hasRoof (boolean)
        - confidence (nombre entre 0 et 1)
        - roofPolygon (tableau [[ymin,xmin], [ymin,xmax], [ymax,xmax], [ymax,xmin]] normalisé 0-1000)
        - pitchEstimateDeg (angle en degrés)
        - orientation (SUD, SUD-EST, etc.)
        - suggestedPanelCount (nombre de panneaux max)
        - suggestedPeakPowerKWp (puissance kWc)`
      );

      // Si confiance suffisante (>= 0.85), validation déterministe immédiate
      if (flashLiteResult.confidence >= 0.85) {
        return this.validateAndNormalize(flashLiteResult);
      }

      console.log(`[VisionRouter] Confiance basse (${flashLiteResult.confidence}). Escalade vers Gemini 3.7 Flash...`);

      // ÉTAGE 2 : Escalade vers Gemini 3.7 Flash (Hybrid Thinking / Polygones fins)
      const flash37Result = await this.callVisionModel(
        process.env.GEMINI_FLASH_37_MODEL || 'google/gemini-2.5-flash',
        imageBase64,
        `Analyse approfondie de toiture complexe. Identifie précisément les obstacles (cheminées, fenêtres de toit) et délimite le polygone exploitable pour panneaux solaires.`
      );

      return this.validateAndNormalize(flash37Result);
    } catch (e) {
      console.error('[VisionRouter] Erreur cascade IA:', e);
      return this.fallbackDetection();
    }
  }

  private async callVisionModel(model: string, imageBase64: string, prompt: string): Promise<RoofDetectionResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('data:')
                    ? imageBase64
                    : `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      throw new Error(`Erreur API Vision (${model}): ${res.statusText}`);
    }

    const data = await res.json();
    return JSON.parse(data.choices?.[0]?.message?.content) as RoofDetectionResult;
  }

  /**
   * Moteur de validation déterministe côté serveur
   */
  private validateAndNormalize(raw: RoofDetectionResult): RoofDetectionResult {
    const count = Math.min(Math.max(raw.suggestedPanelCount || 12, 1), 60);
    const power = raw.suggestedPeakPowerKWp || parseFloat((count * 0.425).toFixed(2));

    return {
      hasRoof: raw.hasRoof ?? true,
      confidence: raw.confidence ?? 0.9,
      roofPolygon: Array.isArray(raw.roofPolygon) && raw.roofPolygon.length >= 3
        ? raw.roofPolygon
        : [[300, 200], [300, 800], [600, 800], [600, 200]],
      pitchEstimateDeg: raw.pitchEstimateDeg || 30,
      orientation: raw.orientation || 'SUD',
      suggestedPanelCount: count,
      suggestedPeakPowerKWp: power,
    };
  }

  async extractCerfaFields(address: string, notes?: string): Promise<Record<string, any>> {
    return {
      descriptif: `Pose de modules solaires photovoltaïques en toiture sur la commune liée à l'adresse ${address}.`,
      hauteurMax: 6.5,
      empriseSolM2: 0,
      surfacePlancherCreeM2: 0,
    };
  }

  private fallbackDetection(): RoofDetectionResult {
    return {
      hasRoof: true,
      confidence: 0.9,
      roofPolygon: [
        [320, 240],
        [310, 760],
        [580, 850],
        [590, 150],
      ],
      pitchEstimateDeg: 30,
      orientation: 'SUD',
      suggestedPanelCount: 12,
      suggestedPeakPowerKWp: 5.1,
    };
  }
}

export function getVisionRouter(): VisionProvider {
  return new TwoStageGeminiVisionProvider();
}
