import fs from 'fs';
import path from 'path';


const API_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = process.env.VISION_MODEL || 'google/gemini-2.5-flash';

async function main() {
  const buf = fs.readFileSync(path.join(__dirname, 'sample_roof.jpg'));
  const b64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

  const systemPrompt = `Tu es un expert en métré photovoltaïque et géométrie projective.
Analyse la photographie de toiture et retourne EXCLUSIVEMENT un objet JSON valide :
{
 "hasRoof": boolean,
 "confidence": number,
 "roofQuad": [[y,x],[y,x],[y,x],[y,x]] en coordonnées normalisées 0-1000, les 4 coins du pan de toiture exploitables pour poser des panneaux solaires, dans l'ordre : Haut-Gauche, Haut-Droite, Bas-Droite, Bas-Gauche. Le quadrilatère doit suivre les lignes de fuite des tuiles/chevrons, rester à l'intérieur du pan (pas de ciel, pas de gouttière), et exclure fenêtres de toit (Velux), cheminées et obstacles.
 "velux": {"x1":0-1000,"y1":0-1000,"x2":0-1000,"y2":0-1000} ou null si aucun obstacle,
 "pitchEstimateDeg": number,
 "orientation": "SUD"|"EST"|"OUEST"|"NORD"|"SUD-EST"|"SUD-OUEST",
 "description": "brève description de la scène (type de toit, tuiles, obstacles)"
}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
          { type: 'text', text: 'Détecte le pan de toiture exploitable (exclure Velux/cheminée, rester sous le faîtage et au-dessus de la gouttière).' },
          { type: 'image_url', image_url: { url: b64 } },
        ]},
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    console.error('HTTP', res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  console.log('MODEL:', MODEL);
  console.log(content);
}

main().catch((e) => { console.error(e); process.exit(1); });