import { RoofDetectionResult } from '../../types/dp';
import sharp from 'sharp';

export interface VisionProvider {
  name: string;
  detectRoof(imageBase64: string): Promise<RoofDetectionResult>;
}

/**
 * Routeur Vision Réel : Analyse multimodale par API (Gemini 2.5 Flash / OpenRouter)
 * Envoie la photo en base64 avec prompt système strict exigeant les coordonnées réelles [ymin, xmin, ymax, xmax]
 * de la toiture exploitable sans obstacle.
 * AUCUN FALLBACK DESSINÉ OU COORDONNÉES CODÉES EN DUR : Renvoie une erreur 500 explicite en cas d'échec.
 */
export class RealGeminiVisionProvider implements VisionProvider {
  name = 'Real_Multimodal_Vision_API';
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      '';
    this.baseUrl = process.env.OPENROUTER_API_KEY
      ? 'https://openrouter.ai/api/v1'
      : 'https://generativelanguage.googleapis.com/v1beta/openai';
    this.model =
      process.env.VISION_MODEL ||
      (process.env.OPENROUTER_API_KEY ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash');
  }

  async detectRoof(imageBase64: string): Promise<RoofDetectionResult> {
    if (!this.apiKey) {
      const err = '[VisionProvider] ÉCHEC CRITIQUE : Aucune clé API configurée (GEMINI_API_KEY ou OPENROUTER_API_KEY). Impossible d\'exécuter l\'analyse multimodale.';
      console.error(err);
      throw new Error(err);
    }

    const startTime = Date.now();
    console.log(`[VisionProvider] Appel API Inférence Vision Réelle (${this.model})...`);

    const systemPrompt = `Tu es un expert en métré photovoltaïque, vision par ordinateur et géométrie projective architecturale.
Analyse la photographie de toiture fournie et retourne EXCLUSIVEMENT un objet JSON valide avec les propriétés suivantes :
- hasRoof: (boolean) true si une toiture résidentielle/bâtiment est visible
- confidence: (number) score de confiance entre 0.0 et 1.0
- roofPolygon: tableau ordonné de 4 points [[y, x], [y, x], [y, x], [y, x]] en coordonnées normalisées 0-1000 délimitant STRICTEMENT les 4 coins du pan de toiture libre en vraie perspective :
    * Point 0: Haut-Gauche (coin faîtage / rive gauche ou limite gauche sous le faîtage)
    * Point 1: Haut-Droite (coin faîtage / rive droite sous le faîtage)
    * Point 2: Bas-Droite (coin égout/gouttière / rive droite au-dessus de la gouttière)
    * Point 3: Bas-Gauche (coin égout/gouttière / rive gauche ou bord libre)
  ATTENTION STRICTE :
  - Respecte la perspective réelle : le quadrilatère doit suivre les lignes de fuite des tuiles et des chevrons.
  - Exclus strictement les fenêtres de toit (Velux), cheminées et obstacles.
  - Reste à l'intérieur du pan de toiture (ne déborde ni dans le ciel ni sur la façade).
- pitchEstimateDeg: (number) estimation de la pente de toiture en degrés (ex: 30)
- orientation: (string) orientation estimée (ex: "SUD", "SUD-EST", "EST", "OUEST")
- suggestedPanelCount: (number) nombre optimal de panneaux solaires installables sur le pan libre
- suggestedPeakPowerKWp: (number) puissance crête estimée en kWc`;

    // Normalisation et redimensionnement préliminaire (Sharp max 1600px) pour éviter timeouts et payloads excessifs
    let processedBase64 = imageBase64;
    try {
      const rawData = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const inputBuffer = Buffer.from(rawData, 'base64');
      const resizedBuffer = await sharp(inputBuffer)
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      processedBase64 = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
      console.log(`[VisionProvider] Image optimisée via Sharp (${(resizedBuffer.length / 1024).toFixed(1)} Ko)`);
    } catch (e: any) {
      console.warn('[VisionProvider] Redimensionnement Sharp ignoré, utilisation image source brute:', e?.message);
      processedBase64 = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
    }

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Détecte la zone de toiture exploitable pour pose de panneaux solaires sans recouvrir les fenêtres de toit.',
                },
                {
                  type: 'image_url',
                  image_url: { url: processedBase64 },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      const duration = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text();
        const err = `[VisionProvider] Erreur HTTP ${res.status} de l'API Vision (${this.model}) après ${duration}ms: ${errText}`;
        console.error(err);
        throw new Error(err);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('[VisionProvider] Réponse vide de l\'API Vision');
      }

      console.log(`[VisionProvider] Succès Inférence Vision (${duration}ms). Statut HTTP 200.`);
      const parsed = JSON.parse(content) as RoofDetectionResult;
      return parsed;
    } catch (error: any) {
      console.error(`[VisionProvider] Erreur d'exécution API Vision:`, error.message);
      throw error;
    }
  }
}

export function getVisionRouter(): VisionProvider {
  return new RealGeminiVisionProvider();
}
