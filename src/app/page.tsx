'use client';

import React, { useState } from 'react';
import { AddressSearchResult, CadastreParcelInfo, RoofDetectionResult } from '@/types/dp';
import { Sun, CheckCircle2, FileText, Upload, Sparkles, MapPin, Download, Loader2 } from 'lucide-react';

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [addressResults, setAddressResults] = useState<AddressSearchResult[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<AddressSearchResult | null>(null);
  const [parcel, setParcel] = useState<CadastreParcelInfo | null>(null);

  // Photo & IA
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectionResult, setDetectionResult] = useState<RoofDetectionResult | null>(null);
  const [isInpainting, setIsInpainting] = useState(false);
  const [inpaintedImage, setInpaintedImage] = useState<string | null>(null);

  // Formulaire demandeur
  const [demandeurNom, setDemandeurNom] = useState('DUPONT');
  const [demandeurPrenom, setDemandeurPrenom] = useState('Jean');
  const [demandeurTel, setDemandeurTel] = useState('06 12 34 56 78');
  const [demandeurEmail, setDemandeurEmail] = useState('jean.dupont@example.com');
  const [panelCount, setPanelCount] = useState<number>(12);

  // Génération PDF
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Recherche d'adresse
  const handleAddressSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 3) {
      setAddressResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/cadastre?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.results) {
        setAddressResults(data.results);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  // Sélection de l'adresse et récupération automatique de la parcelle
  const handleSelectAddress = async (addr: AddressSearchResult) => {
    setSelectedAddress(addr);
    setAddressResults([]);
    setIsSearching(true);
    try {
      const res = await fetch(`/api/cadastre?lat=${addr.coordinates[1]}&lon=${addr.coordinates[0]}`);
      const data = await res.json();
      if (data.parcel) {
        setParcel(data.parcel);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  // Upload et analyse de l'image de toiture
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setPhotoPreview(base64);
      setInpaintedImage(null);

      // Déclenchement automatique de la détection spatiale IA
      setIsAnalyzing(true);
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'detect_roof',
            imageBase64: base64,
          }),
        });
        const data = await res.json();
        if (data.detection) {
          setDetectionResult(data.detection);
          if (data.detection.suggestedPanelCount) {
            setPanelCount(data.detection.suggestedPanelCount);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Génération inpainting DP6
  const handleGenerateInpainting = async () => {
    if (!photoPreview) return;
    setIsInpainting(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inpaint_dp6',
          imageBase64: photoPreview,
          panelCount,
        }),
      });
      const data = await res.json();
      if (data.result?.imageUrl) {
        setInpaintedImage(data.result.imageUrl);
      } else {
        setInpaintedImage(photoPreview);
      }
    } catch (e) {
      console.error(e);
      setInpaintedImage(photoPreview);
    } finally {
      setIsInpainting(false);
    }
  };

  // Téléchargement du Pack DP Complet (PDF)
  const handleDownloadPack = async () => {
    if (!selectedAddress || !parcel) return;
    setIsGeneratingPdf(true);
    try {
      const cerfaData = {
        demandeur: {
          nom: demandeurNom,
          prenom: demandeurPrenom,
          adresse: selectedAddress.label,
          codePostal: selectedAddress.postcode,
          ville: selectedAddress.city,
          telephone: demandeurTel,
          email: demandeurEmail,
          qualite: 'PROPRIETAIRE' as const,
        },
        terrain: {
          adresse: selectedAddress.label,
          codePostal: selectedAddress.postcode,
          commune: selectedAddress.city,
          section: parcel.section,
          numeroParcelle: parcel.numero,
          superficieTerrainM2: parcel.contenance || 450,
          coordonnees: selectedAddress.coordinates,
        },
        projet: {
          type: 'SOLAR_PANELS' as const,
          descriptionCourte: `Installation de ${panelCount} modules solaires photovoltaïques en surimposition de toiture (puissance ~${(panelCount * 0.425).toFixed(1)} kWc).`,
          puissanceKwc: parseFloat((panelCount * 0.425).toFixed(1)),
          nombrePanneaux: panelCount,
          typePose: 'SURIMPOSE' as const,
          empriseSolM2: 0,
        },
        pieces: {
          dp1: true,
          dp2: true,
          dp3: false,
          dp6: true,
          dp7: true,
          dp8: false,
        },
      };

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cerfaData,
          dp6BeforeImageBase64: photoPreview,
          dp6AfterImageBase64: inpaintedImage || photoPreview,
        }),
      });

      if (!res.ok) throw new Error('Échec de la génération PDF');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Dossier_DP_${demandeurNom}_Solaire.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Erreur lors du téléchargement du PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Sun className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">DP Generator</h1>
              <p className="text-sm text-slate-400">Générateur automatique de Déclaration Préalable (Solaire & Habitat)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full">
            <CheckCircle2 className="w-4 h-4" /> Prêt pour dépôt Mairie (Cerfa + DP1 + DP6 + DP7)
          </div>
        </header>

        {/* Stepper Navigation */}
        <div className="grid grid-cols-3 gap-2 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 text-sm">
          <button
            onClick={() => setStep(1)}
            className={`py-2 px-3 rounded-lg font-medium transition ${
              step === 1 ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Adresse & Cadastre
          </button>
          <button
            onClick={() => setStep(2)}
            disabled={!selectedAddress}
            className={`py-2 px-3 rounded-lg font-medium transition ${
              step === 2
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200 disabled:opacity-40'
            }`}
          >
            2. Photo & Pose IA
          </button>
          <button
            onClick={() => setStep(3)}
            disabled={!selectedAddress || !photoPreview}
            className={`py-2 px-3 rounded-lg font-medium transition ${
              step === 3
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200 disabled:opacity-40'
            }`}
          >
            3. Rendu & Export PDF
          </button>
        </div>

        {/* STEP 1 : ADRESSE & CADASTRE */}
        {step === 1 && (
          <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-400" /> Localisation du projet et Open Data Cadastre
            </h2>

            <div className="relative">
              <input
                type="text"
                placeholder="Entrez l'adresse du chantier (ex: 12 Rue de la Paix 75002 Paris)..."
                value={searchQuery}
                onChange={(e) => handleAddressSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {isSearching && (
                <div className="absolute right-4 top-3.5 text-xs text-slate-400 flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" /> Recherche...
                </div>
              )}

              {addressResults.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
                  {addressResults.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectAddress(item)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800/60 last:border-none flex items-center justify-between"
                    >
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-xs text-amber-400 font-mono">{(item.score * 100).toFixed(0)}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedAddress && (
              <div className="bg-slate-950/80 border border-amber-500/20 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Adresse Validée</span>
                  <span className="text-xs text-slate-400">Prêt pour DP1 & DP2</span>
                </div>
                <p className="text-base font-semibold">{selectedAddress.label}</p>

                {parcel && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 font-mono">
                    <div>
                      <span className="text-slate-400 block">Section</span>
                      <span className="font-bold text-slate-200">{parcel.section || '0A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">N° Parcelle</span>
                      <span className="font-bold text-slate-200">{parcel.numero || '0001'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Contenance</span>
                      <span className="font-bold text-slate-200">{parcel.contenance || 450} m²</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Code Commune</span>
                      <span className="font-bold text-slate-200">{parcel.codeCommune || selectedAddress.postcode}</span>
                    </div>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-sm transition shadow-lg shadow-amber-500/10"
                  >
                    Continuer vers l'analyse photo →
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* STEP 2 : PHOTO & POSE IA */}
        {step === 2 && (
          <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Upload className="w-5 h-5 text-amber-400" /> Téléversement de la toiture & Insertion IA (DP6)
            </h2>

            {!photoPreview ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-2xl p-12 cursor-pointer bg-slate-950/40 transition group">
                <Upload className="w-10 h-10 text-slate-500 group-hover:text-amber-400 transition mb-3" />
                <span className="text-sm font-medium text-slate-300">Cliquez ou glissez la photo de la toiture existante</span>
                <span className="text-xs text-slate-500 mt-1">PNG, JPG jusqu'à 10MB</span>
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Photo Avant */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase">1. État Initial (Avant)</span>
                    <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
                      <img src={photoPreview} alt="Toiture avant" className="object-cover w-full h-full" />
                      {isAnalyzing && (
                        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-xs text-amber-400">
                          <Loader2 className="w-6 h-6 animate-spin" /> Détection spatiale des pans de toiture...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Photo Après / Inpainting */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-emerald-400 uppercase">2. Insertion Paysagère DP6 (Après)</span>
                    <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
                      {inpaintedImage ? (
                        <img src={inpaintedImage} alt="Insertion solaire après" className="object-cover w-full h-full" />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500">
                          <Sparkles className="w-8 h-8 mb-2 text-amber-500/40" />
                          Générez l'insertion photoréaliste avec FLUX.1 Fill
                        </div>
                      )}

                      {isInpainting && (
                        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-xs text-amber-400">
                          <Loader2 className="w-6 h-6 animate-spin" /> Inpainting architectural en cours...
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Paramètres de pose */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <label className="text-xs text-slate-400">Nombre de panneaux :</label>
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={panelCount}
                      onChange={(e) => setPanelCount(parseInt(e.target.value) || 12)}
                      className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-amber-400 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">
                      Puissance estimée : <strong className="text-slate-200">{(panelCount * 0.425).toFixed(1)} kWc</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleGenerateInpainting}
                      disabled={isInpainting}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" /> Générer Insertion IA (DP6)
                    </button>

                    <button
                      onClick={() => setStep(3)}
                      className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-xs transition"
                    >
                      Valider et Passer au PDF →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* STEP 3 : RENDU & EXPORT PDF */}
        {step === 3 && (
          <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" /> Synthèse du Dossier et Export PDF Mairie
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold uppercase text-slate-400">Informations Demandeur</span>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Nom"
                    value={demandeurNom}
                    onChange={(e) => setDemandeurNom(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                  />
                  <input
                    type="text"
                    placeholder="Prénom"
                    value={demandeurPrenom}
                    onChange={(e) => setDemandeurPrenom(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                  />
                  <input
                    type="text"
                    placeholder="Téléphone"
                    value={demandeurTel}
                    onChange={(e) => setDemandeurTel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={demandeurEmail}
                    onChange={(e) => setDemandeurEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold uppercase text-slate-400">Pièces Générées dans le Pack</span>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Cerfa 13404 / 13703 pré-rempli
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> DP1 : Plan de situation cadastral
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> DP6 : Insertion paysagère (Avant / Après)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> DP7 : Prise de vue environnementale
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-4 flex justify-center">
              <button
                onClick={handleDownloadPack}
                disabled={isGeneratingPdf}
                className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-base transition flex items-center gap-2 shadow-xl shadow-amber-500/20"
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Assemblage du PDF en cours...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" /> Télécharger le Pack DP Complet (PDF)
                  </>
                )}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
