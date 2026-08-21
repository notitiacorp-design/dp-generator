/**
 * Types pour le générateur de dossier de Déclaration Préalable (DP)
 */

export interface AddressSearchResult {
  label: string;
  score: number;
  housenumber?: string;
  street?: string;
  postcode: string;
  citycode: string;
  city: string;
  context: string;
  type: string;
  coordinates: [number, number]; // [lon, lat]
}

export interface CadastreParcelInfo {
  id: string; // ex: 34032000AC0123
  commune: string;
  codeCommune: string;
  section: string;
  numero: string;
  contenance: number; // m²
  coordinates: [number, number]; // [lon, lat] centroid
  geometry?: any;
}

export interface RoofDetectionResult {
  hasRoof: boolean;
  confidence: number;
  roofPolygon: Array<[number, number]>; // [[x1, y1], [x2, y2], ...] normalisé 0-1000
  pitchEstimateDeg?: number;
  orientation?: 'SUD' | 'SUD-EST' | 'SUD-OUEST' | 'EST' | 'OUEST' | 'NORD';
  suggestedPanelCount?: number;
  suggestedPeakPowerKWp?: number;
}

export interface InpaintingParams {
  imageBase64: string;
  maskBase64?: string;
  roofPolygon?: Array<[number, number]>; // Coordonnées [ymin, xmin, ymax, xmax] ou [[y1, x1], [y2, x2], ...] normalisées 0-1000 issues de l'API Vision
  projectType: 'SOLAR_PANELS' | 'PERGOLA' | 'VERANDA' | 'CARPORT';
  panelCount?: number;
  panelColor?: string;
  prompt?: string;
}

export interface InpaintingResult {
  imageUrl: string;
  imageBase64?: string;
  providerUsed: string;
  executionTimeMs: number;
}

export interface CerfaFormData {
  // Demandeur
  demandeur: {
    nom: string;
    prenom: string;
    dateNaissance?: string;
    lieuNaissance?: string;
    adresse: string;
    codePostal: string;
    ville: string;
    telephone: string;
    email: string;
    qualite: 'PROPRIETAIRE' | 'MANDATAIRE' | 'LOCATAIRE';
  };
  // Terrain
  terrain: {
    adresse: string;
    codePostal: string;
    commune: string;
    prefixeSection?: string;
    section: string;
    numeroParcelle: string;
    superficieTerrainM2: number;
    coordonnees: [number, number]; // [lon, lat]
  };
  // Projet
  projet: {
    type: 'SOLAR_PANELS' | 'PERGOLA' | 'VERANDA' | 'CARPORT' | 'AUTRE';
    descriptionCourte: string;
    puissanceKwc?: number;
    nombrePanneaux?: number;
    surfaceCapteursM2?: number;
    typePose: 'SURIMPOSE' | 'INTEGRE' | 'SOL';
    empriseSolM2?: number;
    surfacePlancherCreeM2?: number;
    hauteurMaxM?: number;
    datePrevueDebut?: string;
  };
  // Pièces jointes fournies
  pieces: {
    dp1: boolean; // Plan de situation
    dp2: boolean; // Plan de masse
    dp3: boolean; // Plan en coupe
    dp6: boolean; // Document graphique d'insertion paysagère
    dp7: boolean; // Photographie environnement proche
    dp8: boolean; // Photographie environnement lointain
  };
}

export interface DPPackGenerationRequest {
  cerfaData: CerfaFormData;
  dp1ImageBase64?: string;
  dp2ImageBase64?: string;
  dp6BeforeImageBase64?: string;
  dp6AfterImageBase64?: string;
  dp7ImageBase64?: string;
  dp8ImageBase64?: string;
}
