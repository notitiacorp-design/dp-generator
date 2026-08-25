import { readFileSync, writeFileSync } from 'fs';
import sharp from 'sharp';
import { renderPhotomontage } from './src/lib/canvas/photomontage';

async function main() {
  const buf = readFileSync('./sample_roof.jpg');
  const meta = await sharp(buf).metadata();
  const W = meta.width || 1200, H = meta.height || 800;
  // Quad synthétique couvrant le pan de toiture central (test de lisibilité)
  const quad: any = [
    { x: W * 0.12, y: H * 0.18 },
    { x: W * 0.88, y: H * 0.22 },
    { x: W * 0.90, y: H * 0.82 },
    { x: W * 0.10, y: H * 0.78 },
  ];
  const res = await renderPhotomontage(buf, quad, 14);
  writeFileSync('/tmp/photomontage_test.jpg', res.resultBuffer);
  console.log(`rendu ${res.rows}x${res.cols} = ${res.panelCount} modules -> /tmp/photomontage_test.jpg`);
}
main().catch(e => { console.error(e); process.exit(1); });
