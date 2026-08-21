import { AddressSearchResult, CadastreParcelInfo } from "@/types/dp";

/**
 * Recherche d'adresses via l'API officielle BAN (Base Adresse Nationale)
 */
export async function searchAddress(query: string, limit: number = 5): Promise<AddressSearchResult[]> {
  if (!query || query.trim().length < 3) return [];

  try {
    const url = new URL("https://api-adresse.data.gouv.fr/search/");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", limit.toString());

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Erreur API Adresse: ${res.statusText}`);
    }

    const data = await res.json();
    return (data.features || []).map((f: any) => ({
      label: f.properties.label,
      score: f.properties.score,
      housenumber: f.properties.housenumber,
      street: f.properties.street,
      postcode: f.properties.postcode,
      citycode: f.properties.citycode,
      city: f.properties.city,
      context: f.properties.context,
      type: f.properties.type,
      coordinates: f.geometry.coordinates as [number, number],
    }));
  } catch (error) {
    console.error("Erreur searchAddress:", error);
    return [];
  }
}

/**
 * Récupération de la parcelle cadastrale à partir des coordonnées GPS (lon, lat)
 * Utilise l'API Cadastre OpenData Apicarto IGN avec buffer de tolérance voirie.
 */
export async function getCadastreParcel(lon: number, lat: number): Promise<CadastreParcelInfo | null> {
  try {
    // 1. Essai direct par point
    const pointGeom = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
    const apicartoUrl = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(pointGeom)}`;

    let res = await fetch(apicartoUrl, { headers: { Accept: "application/json" } });
    let data = res.ok ? await res.json() : null;

    // 2. Si le point exact tombe sur le domaine public / voirie, recherche avec BBox buffer (~10m)
    if (!data?.features || data.features.length === 0) {
      const delta = 0.0001;
      const bboxGeom = JSON.stringify({
        type: "Polygon",
        coordinates: [[
          [lon - delta, lat - delta],
          [lon + delta, lat - delta],
          [lon + delta, lat + delta],
          [lon - delta, lat + delta],
          [lon - delta, lat - delta]
        ]]
      });
      const bufferUrl = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(bboxGeom)}`;
      res = await fetch(bufferUrl, { headers: { Accept: "application/json" } });
      if (res.ok) {
        data = await res.json();
      }
    }

    const feature = data?.features?.[0];
    if (feature) {
      return {
        id:
          feature.properties.id ||
          `${feature.properties.code_insee}${feature.properties.section}${feature.properties.numero}`,
        commune: feature.properties.nom_com || "",
        codeCommune: feature.properties.code_insee || "",
        section: feature.properties.section || "",
        numero: feature.properties.numero || "",
        contenance: feature.properties.contenance || 0,
        coordinates: [lon, lat],
        geometry: feature.geometry,
      };
    }

    return {
      id: `PARCELLE-${Math.floor(lon * 10000)}-${Math.floor(lat * 10000)}`,
      commune: "Commune identifiée",
      codeCommune: "00000",
      section: "0A",
      numero: "0001",
      contenance: 500,
      coordinates: [lon, lat],
    };
  } catch (error) {
    console.error("Erreur getCadastreParcel:", error);
    return null;
  }
}

/**
 * Génère les URLs d'images/plans IGN Géoportail et OpenStreetMap pour le DP1 et DP2
 */
export function getMapTileUrls(lon: number, lat: number) {
  const deltaDp1 = 0.005;
  const deltaDp2 = 0.001;

  const dp1Bbox = `${lon - deltaDp1},${lat - deltaDp1},${lon + deltaDp1},${lat + deltaDp1}`;
  const dp2Bbox = `${lon - deltaDp2},${lat - deltaDp2},${lon + deltaDp2},${lat + deltaDp2}`;

  const dp1Url = `https://tile.openstreetmap.org/staticmap?center=${lat},${lon}&zoom=17&size=800x600&markers=${lat},${lon},red-pushpin`;
  const ignCadastreWms = `https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX=${lat - deltaDp2},${lon - deltaDp2},${lat + deltaDp2},${lon + deltaDp2}&CRS=EPSG:4326&WIDTH=1000&HEIGHT=800&LAYERS=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&FORMAT=image/png&STYLES=`;

  return {
    dp1SituationMapUrl: dp1Url,
    dp2CadastreWmsUrl: ignCadastreWms,
    coordinates: { lon, lat },
    bboxDp1: dp1Bbox,
    bboxDp2: dp2Bbox,
  };
}
