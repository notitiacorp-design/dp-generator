import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { runFeedbackLoop } from '../../../lib/ai/feedback-loop';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/feedback-loop
 * Body : { imageBase64?: string, panelCount?: number }
 * Exécute la boucle complète (Vision → Homographie → Rendu → Vérification → Ajustement)
 * et sauvegarde le résultat final + les logs dans /public/results.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, panelCount } = body;

    let inputB64 = imageBase64;
    if (!inputB64) {
      // Image par défaut : sample_roof.jpg
      const buf = fs.readFileSync(path.join(process.cwd(), 'sample_roof.jpg'));
      inputB64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
    }

    const result = await runFeedbackLoop({
      imageBase64: inputB64,
      panelCount: panelCount ? Number(panelCount) : 14,
      workDir: process.cwd(),
      outputDir: path.join(process.cwd(), 'renders', 'feedback_loop'),
    });

    // Persistance pour URL directe statique
    const outDir = path.join(process.cwd(), 'public', 'results');
    fs.mkdirSync(outDir, { recursive: true });
    const clean = result.finalImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const stamp = Date.now();
    fs.writeFileSync(path.join(outDir, 'solar-matrix-final.jpg'), Buffer.from(clean, 'base64'));
    fs.writeFileSync(
      path.join(outDir, 'feedback-log.json'),
      JSON.stringify(
        {
          success: result.success,
          stamp,
          elapsedMs: result.elapsedMs,
          iterations: result.iterations,
          finalChecks: result.finalChecks,
          finalStatuses: result.finalStatuses,
          visionReview: result.visionReview,
          quadPx: result.quadPx,
          velux: result.velux,
          finalImage: `/results/solar-matrix-final.jpg?t=${stamp}`,
        },
        null,
        2
      )
    );

    return NextResponse.json({
      success: result.success,
      imageUrl: `/results/solar-matrix-final.jpg?t=${stamp}`,
      elapsedMs: result.elapsedMs,
      iterations: result.iterations,
      finalChecks: result.finalChecks,
      finalStatuses: result.finalStatuses,
      visionReview: result.visionReview,
      quadPx: result.quadPx,
      velux: result.velux,
    });
  } catch (error: any) {
    console.error('[API] FeedbackLoop error:', error);
    return NextResponse.json({ error: error?.message || 'Erreur serveur' }, { status: 500 });
  }
}