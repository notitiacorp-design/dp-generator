import sharp from 'sharp';

interface ObstacleAvoidanceParams {
  roofWidth: number;
  roofHeight: number;
  obstacleBox?: { x: number; y: number; w: number; h: number }; // BBox obstacle (ex. Velux / Lucarne)
  panelCount: number;
}

export function generateSmartSolarGrid(params: ObstacleAvoidanceParams) {
  const { roofWidth, roofHeight, obstacleBox, panelCount } = params;
  
  // Par défaut sur la toiture sample_roof.jpg (1280x853):
  // Pan de toit principal : x: 350 -> 1000, y: 250 -> 600
  // Le Velux/Fenêtre de toit est situé approximativement à x: 620 -> 760, y: 320 -> 480
  const velux = obstacleBox || {
    x: Math.round(roofWidth * 0.48),
    y: Math.round(roofHeight * 0.36),
    w: Math.round(roofWidth * 0.14),
    h: Math.round(roofHeight * 0.20),
  };

  const margin = 20; // Marge de sécurité stricte autour de l'obstacle

  const panelW = Math.round(roofWidth * 0.058); // ~75px
  const panelH = Math.round(roofHeight * 0.11);  // ~95px
  const gap = 8;

  // Création des positions candidates sur le pan de toiture (en excluant strictement la zone Velux + marge)
  const candidateSlots: { x: number; y: number; skewX: number; skewY: number }[] = [];

  // Zone 1 : À gauche de la fenêtre de toit (colonnes)
  const leftStartX = Math.round(roofWidth * 0.24);
  const leftEndX = velux.x - margin;
  
  // Zone 2 : À droite de la fenêtre de toit (colonnes)
  const rightStartX = velux.x + velux.w + margin;
  const rightEndX = Math.round(roofWidth * 0.82);

  // Rangées verticales
  const startY = Math.round(roofHeight * 0.32);
  const rows = 2;

  // Remplissage zone gauche
  let curX = leftStartX;
  while (curX + panelW <= leftEndX) {
    for (let r = 0; r < rows; r++) {
      const py = startY + r * (panelH + gap);
      candidateSlots.push({ x: curX + r * 6, y: py, skewX: -8, skewY: 1 });
    }
    curX += panelW + gap;
  }

  // Remplissage zone droite
  curX = rightStartX;
  while (curX + panelW <= rightEndX) {
    for (let r = 0; r < rows; r++) {
      const py = startY + r * (panelH + gap);
      candidateSlots.push({ x: curX + r * 6, y: py, skewX: -8, skewY: 1 });
    }
    curX += panelW + gap;
  }

  // Si on a besoin de plus de panneaux, rangée inférieure sous la zone dégagée
  if (candidateSlots.length < panelCount) {
    const bottomY = velux.y + velux.h + margin;
    if (bottomY + panelH <= Math.round(roofHeight * 0.70)) {
      let bX = leftStartX;
      while (bX + panelW <= rightEndX && candidateSlots.length < panelCount) {
        candidateSlots.push({ x: bX + 12, y: bottomY, skewX: -8, skewY: 1 });
        bX += panelW + gap;
      }
    }
  }

  return candidateSlots.slice(0, panelCount);
}
