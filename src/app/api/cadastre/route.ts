import { NextRequest, NextResponse } from 'next/server';
import { searchAddress, getCadastreParcel, getMapTileUrls } from '@/lib/cadastre/api';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const latStr = searchParams.get('lat');
  const lonStr = searchParams.get('lon');

  try {
    // 1. Si requête de géocodage adresse
    if (q) {
      const results = await searchAddress(q, 5);
      return NextResponse.json({ success: true, results });
    }

    // 2. Si coordonnées fournies, lookup parcelle & plans
    if (latStr && lonStr) {
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);

      if (isNaN(lat) || isNaN(lon)) {
        return NextResponse.json({ error: 'Coordonnées GPS invalides' }, { status: 400 });
      }

      const parcel = await getCadastreParcel(lon, lat);
      const mapUrls = getMapTileUrls(lon, lat);

      return NextResponse.json({
        success: true,
        parcel,
        mapUrls,
      });
    }

    return NextResponse.json({ error: 'Paramètre q ou lat/lon requis' }, { status: 400 });
  } catch (error: any) {
    console.error('Erreur API Cadastre:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
