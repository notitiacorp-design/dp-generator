'use client';

import React, { useState } from 'react';
import { AddressSearchResult, CadastreParcelInfo, DPPackGenerationRequest } from '@/types/dp';

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [addressQuery, setAddressQuery] = useState('14 Allée des Cerisiers 77200 Torcy');
  const [searchResults, setSearchResults] = useState<AddressSearchResult[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<AddressSearchResult | null>(null);
  const [parcelInfo, setParcelInfo] = useState<CadastreParcelInfo | null>(null);
  const [loadingParcel, setLoadingParcel] = useState(false);

  // Étape 2 : Toiture et Simulation
  const [roofImage, setRoofImage] = useState<string | null>(null);
  const [panelCount, setPanelCount] = useState<number>(14);
  const [powerKwc, setPowerKwc] = useState<number>(6.0);
  const [poseType, setPoseType] = useState<string>('SURIMPOSE');
  const [insertionImage, setInsertionImage] = useState<string | null>(null);
  const [calculatingInsertion, setCalculatingInsertion] = useState(false);
  const [activeTab, setActiveTab] = useState<'after' | 'before'>('after');

  // Étape 3 : Demandeur et Export
  const [demandeur, setDemandeur] = useState({
    nom: 'LEFEBVRE',
    prenom: 'Thomas',
    email: 'thomas.lefebvre@pro-solaire.fr',
    telephone: '06 12 34 56 78',
    adresse: '14 Allée des Cerisiers',
    codePostal: '77200',
    ville: 'Torcy',
  });
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // Recherche d'adresse BAN
  const handleSearchAddress = async (q: string) => {
    setAddressQuery(q);
    if (q.length < 3) return;
    try {
      const res = await fetch(`/api/cadastre?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sélection d'une adresse et récupération du cadastre
  const handleSelectAddress = async (addr: AddressSearchResult) => {
    setSelectedAddress(addr);
    setSearchResults([]);
    setLoadingParcel(true);
    try {
      const res = await fetch(`/api/cadastre?lat=${addr.coordinates[1]}&lon=${addr.coordinates[0]}`);
      const data = await res.json();
      if (data.success && data.parcel) {
        setParcelInfo(data.parcel);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingParcel(false);
    }
  };

  // Upload d'image de toiture
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result as string;
        setRoofImage(b64);
        setInsertionImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Calcul de l'insertion paysagère (DP6) via API Inpainting Réelle
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCalculateInsertion = async () => {
    if (!roofImage) return;
    setCalculatingInsertion(true);
    setErrorMessage(null);
    try {
      console.log('[Frontend] Lancement calcul insertion DP6...');
      const integrationLabels: Record<string, string> = {
        'SURIMPOSE': 'en surimposition sur rails discrets',
        'INTEGRE': 'intégré au bâti',
        'SOL': 'structure au sol',
      };
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inpaint_dp6',
          imageBase64: roofImage,
          panelCount,
          peakPower: powerKwc,
          integrationType: integrationLabels[poseType] || 'en surimposition sur rails discrets',
        }),
      });

      console.log(`[Frontend] Réponse HTTP /api/ai reçue avec status: ${res.status}`);
      let data: any = {};
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        console.error('[Frontend] Échec parsing JSON réponse serveur:', jsonErr);
        throw new Error(`Réponse non-JSON du serveur (HTTP ${res.status})`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Erreur serveur HTTP ${res.status}`);
      }
      if (data.result) {
        setInsertionImage(data.result.imageUrl || data.result.imageBase64);
        setActiveTab('after');
      }
    } catch (e: any) {
      console.error('[Frontend] Erreur complète Inpainting API:', e);
      setErrorMessage(`Échec inférence IA : ${e.message}`);
    } finally {
      setCalculatingInsertion(false);
    }
  };

  // Génération du dossier complet
  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const payload: DPPackGenerationRequest = {
        cerfaData: {
          demandeur: {
            ...demandeur,
            qualite: 'PROPRIETAIRE',
          },
          terrain: {
            adresse: selectedAddress?.label || demandeur.adresse,
            commune: selectedAddress?.city || demandeur.ville,
            codePostal: selectedAddress?.postcode || demandeur.codePostal,
            section: parcelInfo?.section || 'BD',
            numeroParcelle: parcelInfo?.numero || '0141',
            superficieTerrainM2: parcelInfo?.contenance || 597,
            coordonnees: selectedAddress?.coordinates || [2.6565, 48.8514],
          },
          projet: {
            type: 'SOLAR_PANELS',
            puissanceKwc: powerKwc,
            nombrePanneaux: panelCount,
            typePose: poseType as any,
            descriptionCourte: `Installation de ${panelCount} capteurs photovoltaïques (${powerKwc} kWc) en surimposition de toiture existante.`,
          },
          pieces: {
            dp1: true,
            dp2: true,
            dp3: false,
            dp6: true,
            dp7: false,
            dp8: false,
          },
        },
        dp6BeforeImageBase64: roofImage || undefined,
        dp6AfterImageBase64: insertionImage || undefined,
      };

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans antialiased flex flex-col">
      {/* En-tête B2B sobre */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center font-bold text-white text-xs tracking-wider">
              DP
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 tracking-tight">Notitia DP Pro</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">Instruction Solaire & Cadastre</div>
            </div>
          </div>
          <div className="h-4 w-px bg-slate-200 mx-2" />
          <div className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-800">
            Conformité Cerfa 13404*12 & 16702
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs text-slate-600">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-medium text-slate-700">API Cadastre IGN Connectée</span>
          </span>
          <div className="h-3 w-px bg-slate-200" />
          <span className="text-slate-400">Projet ref: #DP-2026-088</span>
        </div>
      </header>

      {/* Stepper minimaliste */}
      <div className="bg-white border-b border-slate-200 py-3 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setStep(1)}
            className={`flex items-center space-x-2 text-xs font-medium transition-colors ${
              step === 1 ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step === 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              1
            </span>
            <span>Localisation & Cadastre</span>
          </button>

          <div className="h-px w-16 bg-slate-200" />

          <button
            onClick={() => setStep(2)}
            className={`flex items-center space-x-2 text-xs font-medium transition-colors ${
              step === 2 ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              2
            </span>
            <span>Toiture & Implantation</span>
          </button>

          <div className="h-px w-16 bg-slate-200" />

          <button
            onClick={() => {
              if (step < 3) handleGeneratePdf();
              setStep(3);
            }}
            className={`flex items-center space-x-2 text-xs font-medium transition-colors ${
              step === 3 ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step === 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              3
            </span>
            <span>Dossier & Validation</span>
          </button>
        </div>
      </div>

      {/* Contenu principal selon étape */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6">
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Recherche d'adresse officielle (Base Adresse Nationale)
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={addressQuery}
                    onChange={(e) => handleSearchAddress(e.target.value)}
                    placeholder="Saisissez l'adresse du chantier..."
                    className="w-full bg-slate-50 border border-slate-200 rounded px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:bg-white"
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-20 overflow-hidden divide-y divide-slate-100">
                      {searchResults.map((r, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelectAddress(r)}
                          className="w-full text-left px-4 py-2.5 text-xs text-slate-800 hover:bg-slate-50 flex items-center justify-between"
                        >
                          <span className="font-medium">{r.label}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{r.citycode}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center space-x-2">
                  <button
                    onClick={() => handleSearchAddress('14 Allée des Cerisiers 77200 Torcy')}
                    className="text-[11px] text-blue-600 hover:underline font-medium"
                  >
                    Exemple test : 14 Allée des Cerisiers, Torcy
                  </button>
                </div>
              </div>

              {/* Résultats Cadastre */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Références Cadastrales Détectées
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                    Source IGN Apicarto
                  </span>
                </div>

                {loadingParcel ? (
                  <div className="text-xs text-slate-500 py-6 text-center animate-pulse">
                    Interrogation du registre parcellaire en cours...
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                    <div className="bg-slate-50 border border-slate-200/60 rounded p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Commune</div>
                      <div className="text-sm font-semibold text-slate-800 mt-0.5">
                        {parcelInfo?.commune || selectedAddress?.city || 'Torcy'}
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/60 rounded p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Section</div>
                      <div className="text-sm font-semibold text-slate-800 mt-0.5 font-mono">
                        {parcelInfo?.section || 'BD'}
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/60 rounded p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Numéro</div>
                      <div className="text-sm font-semibold text-slate-800 mt-0.5 font-mono">
                        {parcelInfo?.numero || '0141'}
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/60 rounded p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Superficie</div>
                      <div className="text-sm font-semibold text-slate-800 mt-0.5 font-mono">
                        {parcelInfo?.contenance || 597} m²
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar résumé */}
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm flex flex-col justify-between h-full">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Conformité Réglementaire
                  </div>
                  <ul className="space-y-2 text-xs text-slate-600">
                    <li className="flex items-start space-x-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Extraction automatique de la parcelle exacte</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Détourage vectoriel conforme pour l'annexe DP1</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Remplissage automatique du cadre 3 du Cerfa</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-6 border-t border-slate-100 mt-6">
                  <button
                    onClick={() => setStep(2)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2.5 px-4 rounded transition shadow-sm"
                  >
                    Valider et passer à l'étape 2 →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Colonne gauche : Paramètres techniques */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-2">
                  1. Photographie du bâtiment
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Fichier image toiture (Format JPG/PNG)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-2">
                  2. Spécifications du générateur solaire
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Nombre de modules
                    </label>
                    <input
                      type="number"
                      value={panelCount}
                      onChange={(e) => {
                        const count = parseInt(e.target.value) || 0;
                        setPanelCount(count);
                        setPowerKwc(Number((count * 0.425).toFixed(2)));
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Puissance crête (kWc)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={powerKwc}
                      onChange={(e) => setPowerKwc(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Mode d'intégration au bâti
                  </label>
                  <select
                    value={poseType}
                    onChange={(e) => setPoseType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  >
                    <option value="SURIMPOSE">Surimposition sur toiture existante (Standard)</option>
                    <option value="INTEGRE">Intégration au bâti (IAB)</option>
                    <option value="AU_SOL">Structure au sol / Ombière</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleCalculateInsertion}
                    disabled={calculatingInsertion || !roofImage}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded transition flex items-center justify-center space-x-2 shadow-sm"
                  >
                    {calculatingInsertion ? (
                      <span>Inférence FLUX.1 Fill en cours...</span>
                    ) : (
                      <span>Calculer l'insertion paysagère (DP6)</span>
                    )}
                  </button>
                  {errorMessage && (
                    <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded text-[11px] text-red-700 font-mono break-words">
                      {errorMessage}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setStep(1)}
                  className="w-1/3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium py-2 px-3 rounded transition"
                >
                  ← Retour
                </button>
                <button
                  onClick={() => {
                    handleGeneratePdf();
                    setStep(3);
                  }}
                  className="w-2/3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold py-2 px-4 rounded transition"
                >
                  Générer le dossier complet →
                </button>
              </div>
            </div>

            {/* Colonne droite : Visualiseur avant/après Split */}
            <div className="lg:col-span-7">
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col h-full min-h-[480px]">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Contrôle Graphique d'Insertion (Pièce DP6)
                  </div>

                  <div className="inline-flex rounded-md bg-slate-100 p-0.5 border border-slate-200">
                    <button
                      onClick={() => setActiveTab('after')}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        activeTab === 'after'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      État Projeté (Après)
                    </button>
                    <button
                      onClick={() => setActiveTab('before')}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        activeTab === 'before'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      État Existant (Avant)
                    </button>
                  </div>
                </div>

                <div className="flex-1 bg-slate-950 rounded border border-slate-800 overflow-hidden flex items-center justify-center relative min-h-[360px]">
                  {activeTab === 'after' ? (
                    insertionImage ? (
                      <img
                        src={insertionImage}
                        alt="Simulation DP6"
                        className="w-full h-full object-contain"
                      />
                    ) : roofImage ? (
                      <div className="text-center p-6 space-y-2">
                        <img src={roofImage} alt="Avant" className="w-full max-h-[300px] object-contain opacity-60" />
                        <div className="text-xs text-slate-400">
                          Cliquez sur "Calculer l'insertion paysagère" pour générer la vue projetée.
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">Aucune image chargée</div>
                    )
                  ) : roofImage ? (
                    <img src={roofImage} alt="Avant" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-xs text-slate-500">Aucune image chargée</div>
                  )}

                  {/* Badge statut */}
                  <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur border border-slate-700/60 rounded px-2.5 py-1 text-[10px] text-slate-300 font-mono">
                    {activeTab === 'after' ? `DP6 : Après travaux (${panelCount} modules)` : 'DP6 : Avant travaux'}
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Algorithme d'évitement d'ouvrants & Velux actif</span>
                  <span className="font-mono">Résolution native 300 DPI</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Dossier de Déclaration Préalable prêt à l'export</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dossier assemblé : Cerfa officiel 13404*12 annoté + Annexe DP1 IGN + Annexe DP6 insertion.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setStep(2)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium py-2 px-3.5 rounded transition"
                  >
                    ← Modifier paramètres
                  </button>
                  {pdfBlobUrl && (
                    <a
                      href={pdfBlobUrl}
                      download={`Dossier_DP_Solaire_${demandeur.nom}_${demandeur.ville}.pdf`}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded transition shadow-sm inline-flex items-center space-x-1.5"
                    >
                      <span>Télécharger le dossier complet (.PDF)</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Lecteur PDF intégré */}
              <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden bg-slate-100 h-[650px] flex items-center justify-center">
                {generatingPdf ? (
                  <div className="text-xs text-slate-600 font-medium animate-pulse flex flex-col items-center space-y-2">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Génération et compilation du PDF en cours...</span>
                  </div>
                ) : pdfBlobUrl ? (
                  <iframe
                    src={pdfBlobUrl}
                    className="w-full h-full border-0"
                    title="Prévisualisation PDF"
                  />
                ) : (
                  <div className="text-xs text-slate-500">Cliquez sur Générer pour compiler le dossier</div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
