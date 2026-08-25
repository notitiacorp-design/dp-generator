/**
 * Runner CLI de la boucle de rétroaction solaire.
 * Usage : npx tsx --env-file=.env.local run-feedback-loop.ts [image.jpg] [--iterations N]
 */
import fs from 'fs';
import path from 'path';
import { runFeedbackLoop } from './src/lib/ai/feedback-loop';

async function main() {
  const imagePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.cwd(), 'sample_roof.jpg');
  if (!fs.existsSync(imagePath)) {
    console.error(`Image introuvable : ${imagePath}`);
    process.exit(1);
  }

  // --iterations N : nombre max d'itérations
  const itArg = process.argv.indexOf('--iterations');
  const maxIterations = itArg > -1 ? parseInt(process.argv[itArg + 1], 10) : 6;

  const buf = fs.readFileSync(imagePath);
  const b64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

  console.log(`=== BOUCLE DE RÉTROACTION SOLAIRE ===`);
  console.log(`Image : ${imagePath}`);

  const result = await runFeedbackLoop({
    imageBase64: b64,
    panelCount: 14,
    maxIterations,
    workDir: process.cwd(),
    outputDir: path.join(process.cwd(), 'renders', 'feedback_loop'),
  });

  console.log(`\n=== LOGS PAR ITÉRATION (${result.iterations.length}) ===`);
  for (const it of result.iterations) {
    console.log(`\n--- Itération ${it.iteration} ---`);
    console.log(`Quad px (TL,TR,BR,BL)    : ${it.quadPx.map((p) => `(${p.x},${p.y})`).join(' ')}`);
    console.log(`Quad normalisé 0-1000    : ${it.quadNorm.map((p) => `[${p[0]},${p[1]}]`).join(' ')}`);
    console.log(`Homographie 3x3          : ${it.homography}`);
    console.log(`Marges appliquées        : haut=${(it.margins.marginTop * 100).toFixed(1)}% bas=${(it.margins.marginBottom * 100).toFixed(1)}% g=${(it.margins.marginLeft * 100).toFixed(1)}% d=${(it.margins.marginRight * 100).toFixed(1)}%`);
    console.log(`Grille                   : ${it.grid.rows}x${it.grid.cols} = ${it.grid.panels} panneaux`);
    console.log(`Contrôles pixel          : ${JSON.stringify(it.checks)}`);
    console.log(`Statuts                  : ${Object.entries(it.statuses).map(([k, v]) => `${k}=${v ? 'OK' : 'FAIL'}`).join(' ')}`);
    console.log(`Ajustement               : ${it.adjustment}`);
    console.log(`Rendu                    : ${it.renderPath}`);
  }

  // Sauvegarde finale
  const outDir = path.join(process.cwd(), 'public', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const finalPath = path.join(outDir, 'solar-matrix-final.jpg');
  const clean = result.finalImageBase64.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(finalPath, Buffer.from(clean, 'base64'));

  const logPath = path.join(outDir, 'feedback-log.json');
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
        success: result.success,
        elapsedMs: result.elapsedMs,
        iterations: result.iterations,
        finalChecks: result.finalChecks,
        finalStatuses: result.finalStatuses,
        visionReview: result.visionReview,
        quadPx: result.quadPx,
        velux: result.velux,
        finalImage: '/results/solar-matrix-final.jpg',
      },
      null,
      2
    )
  );

  console.log(`\n=== RÉSULTAT FINAL ===`);
  console.log(`Succès   : ${result.success ? 'OUI ✓' : 'NON (voir logs)'}`);
  console.log(`Durée    : ${result.elapsedMs} ms`);
  console.log(`Vision   : ${JSON.stringify(result.visionReview)}`);
  console.log(`Image    : ${finalPath}`);
  console.log(`Logs     : ${logPath}`);
}

main().catch((e) => {
  console.error('ERREUR BOUCLE :', e);
  process.exit(1);
});