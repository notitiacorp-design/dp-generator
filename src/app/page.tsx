'use client';

import React, { useCallback, useRef, useState } from 'react';
import type {
  AddressSearchResult,
  CadastreParcelInfo,
  DPPackGenerationRequest,
} from '@/types/dp';

type Step = 1 | 2 | 3;

// ---------------------------------------------------------------- helpers
function fmtFilename(date: Date, commune: string) {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const safe = (commune || 'Commune').replace(/[^a-zA-Z0-9-_]/g, '_').toUpperCase();
  return `DP_Solaire_${safe}_${d}.pdf`;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------- component
export default function Home() {
  const [step, setStep] = useState<Step>(1);

  // Étape 1 — adresse, cadastre & demandeur
  const [addressQuery, setAddressQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AddressSearchResult[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<AddressSearchResult | null>(null);
  const [parcelInfo, setParcelInfo] = useState<CadastreParcelInfo | null>(null);
  const [loadingParcel, setLoadingParcel] = useState(false);
  const [searching, setSearching] = useState(false);
  const [demandeur, setDemandeur] = useState({
    nom: 'LEFEBVRE',
    prenom: 'Thomas',
    societe: '',
    telephone: '06 12 34 56 78',
    email: 'thomas.lefebvre@pro-solaire.fr',
    adresse: '14 Allée des Cerisiers',
    codePostal: '77200',
    ville: 'Torcy',
  });
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Étape 2 — toiture & puissance
  const [roofImage, setRoofImage] = useState<string | null>(null);
  const [panelCount, setPanelCount] = useState(14);
  const [powerKwc, setPowerKwc] = useState(5.95);
  const [poseType, setPoseType] = useState('SURIMPOSE');
  const [dp7Image, setDp7Image] = useState<string | null>(null);
  const [dp8Image, setDp8Image] = useState<string | null>(null);
  const [insertionImage, setInsertionImage] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [displayAfter, setShowAfter] = useState(true);
  const [progress, setProgress] = useState({ msg: '', pct: 0 });
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Étape 3 — export
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState('Dossier_DP_Solaire.pdf');

  const QUICK_COUNTS = [6, 8, 10, 12, 14];

  // ---------------- adresse (BAN autocomplete)
  const handleSearchAddress = useCallback((q: string) => {
    setAddressQuery(q);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (q.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/cadastre?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success) setSearchResults((data.results || []).slice(0, 6));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  }, []);

  const handleSelectAddress = useCallback(async (addr: AddressSearchResult) => {
    setSelectedAddress(addr);
    setAddressQuery(addr.label);
    setSearchResults([]);
    setLoadingParcel(true);
    try {
      const res = await fetch(
        `/api/cadastre?lat=${addr.coordinates[1]}&lon=${addr.coordinates[0]}`
      );
      const data = await res.json();
      if (data.success && data.parcel) setParcelInfo(data.parcel);
    } finally {
      setLoadingParcel(false);
    }
  }, []);

  // ---------------- photo (upload + drag&drop)
  const onFile = useCallback(async (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const b64 = await readAsDataURL(file);
    setRoofImage(b64);
    setInsertionImage(null);
    setPdfBlobUrl(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      onFile(e.dataTransfer.files?.[0]);
    },
    [onFile]
  );

  // ---------------- calcul insertion DP6
  const handleCalculateInsertion = async () => {
    if (!roofImage) {
      setError('Ajoutez d’abord une photo de toiture.');
      return;
    }
    setCalculating(true);
    setError(null);
    setInsertionImage(null);
    const integrationLabels: Record<string, string> = {
      SURIMPOSE: 'en surimposition sur rails discrets',
      INTEGRE: 'intégré au bâti',
      SOL: 'structure au sol',
    };
    const run = async (label: string, pct: number) => {
      setProgress({ msg: label, pct });
      await new Promise((r) => setTimeout(r, 250));
    };
    try {
      await run('Analyse de la toiture par Vision (IA)...', 30);
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
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Erreur serveur HTTP ${res.status}`);
      setProgress({ msg: 'Calcul de l’homographie et pose des panneaux...', pct: 65 });
      await new Promise((r) => setTimeout(r, 300));
      if (data.result) {
        setInsertionImage(data.result.imageUrl || data.result.imageBase64);
      }
      setProgress({ msg: 'Photomontage DP6 généré.', pct: 100 });
    } catch (e: any) {
      setError(`Échec inférence IA : ${e.message}`);
      setProgress({ msg: '', pct: 0 });
    } finally {
      setTimeout(() => setCalculating(false), 300);
    }
  };

  // ---------------- génération PDF
  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    setError(null);
    try {
      const commune = selectedAddress?.city || 'Torcy';
      const cp = selectedAddress?.postcode || '77200';
      const adrLabel = selectedAddress?.label || demandeurAdresseDefault;
      const coord = selectedAddress?.coordinates || [2.6565, 48.8514];

      const payload: DPPackGenerationRequest = {
        cerfaData: {
          demandeur: {
            nom: demandeur.nom,
            prenom: demandeur.prenom,
            email: demandeur.email,
            telephone: demandeur.telephone,
            adresse: demandeur.adresse,
            codePostal: demandeur.codePostal,
            ville: demandeur.ville,
            qualite: 'PROPRIETAIRE',
          },
          terrain: {
            adresse: adrLabel,
            commune,
            codePostal: cp,
            section: parcelInfo?.section || 'BD',
            numeroParcelle: parcelInfo?.numero || '0141',
            superficieTerrainM2: parcelInfo?.contenance || 597,
            coordonnees: coord,
          },
          projet: {
            type: 'SOLAR_PANELS',
            puissanceKwc: powerKwc,
            nombrePanneaux: panelCount,
            typePose: poseType as any,
            descriptionCourte: `Installation de ${panelCount} capteurs photovoltaïques (${powerKwc} kWc) en surimposition de toiture existante en champ continu régulier.`,
          },
          pieces: { dp1: true, dp2: true, dp3: false, dp6: true, dp7: !!dp7Image, dp8: !!dp8Image },
        },
        parcelGeometry: (parcelInfo as any)?.geometry || undefined,
        dp6BeforeImageBase64: roofImage || undefined,
        dp6AfterImageBase64: insertionImage || undefined,
        dp7ImageBase64: dp7Image || undefined,
        dp8ImageBase64: dp8Image || undefined,
      };

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Erreur serveur HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
      setPdfName(fmtFilename(new Date(), commune));
    } catch (e: any) {
      setError(`Échec génération PDF : ${e.message}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // ---------------- test prérempli 1 clic
  const handleTestPreRempli = async () => {
    setStep(1);
    setAddressQuery('14 Allée des Cerisiers 77200 Torcy');
    setSelectedAddress({
      label: '14 Allée des Cerisiers 77200 Torcy',
      postcode: '77200',
      city: 'Torcy',
      citycode: '77463',
      context: '77, Seine-et-Marne, Île-de-France',
      type: 'housenumber',
      score: 0.9,
      coordinates: [2.6565, 48.8514],
    } as AddressSearchResult);
    setPanelCount(14);
    setPowerKwc(5.95);
    try {
      const res = await fetch('/sample_roof.jpg');
      const blob = await res.blob();
      const b64 = await readAsDataURL(blob as File);
      setRoofImage(b64);
      setInsertionImage(null);
      setPdfBlobUrl(null);
      setParcelInfo({ section: 'BD', numero: '0141', contenance: 597, commune: 'Torcy', codeCommune: '77463', id: 'parcelle.xxx', coordinates: [2.6565, 48.8514] } as CadastreParcelInfo);
      setStep(2);
    } catch {
      setError('Impossible de charger l’exemple.');
    }
  };

  const goToStep3 = async () => {
    setStep(3);
    if (!pdfBlobUrl) await handleGeneratePdf();
  };

  const demandeurAdresseDefault = '14 Allée des Cerisiers 77200 Torcy';

  // ---------------------------------------------------------------- UI
  const cf = {
    bg: 'bg-zinc-950',
    panel: 'bg-zinc-900 border-zinc-800',
    panelSoft: 'bg-zinc-800/60',
    border: 'border-zinc-800',
    input: 'bg-zinc-900 border-zinc-700 placeholder-zinc-500 text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
    text: 'text-zinc-100',
    muted: 'text-zinc-400',
    accent: 'text-blue-400',
    primary: 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40',
    emerald: 'text-emerald-400',
    badge: 'bg-emerald-900/40 border border-emerald-700/40 text-emerald-300',
    chip: 'bg-zinc-800 border border-zinc-700 text-zinc-300',
    label: 'text-[10px] uppercase tracking-widest text-zinc-500 font-semibold',
  };

  const steppers: { n: Step; label: string }[] = [
    { n: 1, label: 'Adresse & Cadastre' },
    { n: 2, label: 'Toiture & Puissance' },
    { n: 3, label: 'Dossier & Téléchargement' },
  ];

  return (
    <div className={`min-h-screen ${cf.bg} ${cf.text} font-sans antialiased flex flex-col`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 border-b ${cf.border} ${cf.panel} px-6 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center font-bold text-white text-sm">DP</div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Notitia DP Pro</div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Déclaration Préalable Solaire & Cadastre</div>
          </div>
          <span className={`ml-2 hidden sm:inline-flex items-center px-2.5 py-1 rounded ${cf.badge} text-[11px] font-medium`}>Conforme Cerfa 13404*12 & IGN</span>
        </div>
        <button
          onClick={handleTestPreRempli}
          className="inline-flex items-center gap-1.5 rounded px-3.5 py-2 text-xs font-semibold border border-zinc-700 text-zinc-200 hover:bg-zinc-800 transition"
        >
          <span aria-hidden>⚡</span> Tester avec un exemple prérempli
        </button>
      </header>

      {/* Stepper */}
      <nav className={`px-6 py-4 border-b ${cf.border} ${cf.panelSoft}`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {steppers.map((s, i) => (
            <React.Fragment key={s.n}>
              <button
                onClick={() => (s.n < step ? setStep(s.n) : s.n === 3 && goToStep3())}
                className={`flex items-center gap-2.5 ${s.n <= step ? cf.accent : 'text-zinc-600 hover:text-zinc-400'}`}
              >
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border ${
                  s.n < step ? 'bg-emerald-500 border-emerald-500 text-white'
                  : s.n === step ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-zinc-700 text-zinc-500'}`}>{s.n < step ? '✓' : s.n}</span>
                <span className="text-xs font-medium hidden sm:block">{s.label}</span>
              </button>
              {i < steppers.length - 1 && <div className={`h-px flex-1 mx-3 ${s.n < step ? 'bg-emerald-500' : cf.border}`} />}
            </React.Fragment>
          ))}
        </div>
      </nav>

      <main className="flex-1 w-full max-w-5xl mx-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-xs text-red-300 font-mono">{error}</div>
        )}

        {/* ============ ETAPE 1 : ADRESSE & CADASTRE ============ */}
        {step === 1 && (
          <div className="grid md:grid-cols-3 gap-5">
            <div className={`md:col-span-2 ${cf.panel} border rounded-xl p-5`}>
              <div className={cf.label}>Adresse du chantier — Base Adresse Nationale</div>
              <div className="relative mt-2">
                <input
                  type="text"
                  value={addressQuery}
                  onChange={(e) => handleSearchAddress(e.target.value)}
                  placeholder="Saisissez l'adresse du chantier (ex : 14 Allée des Cerisiers 77200 Torcy)..."
                  className={`w-full rounded-lg ${cf.input} px-4 py-3 text-sm outline-none`}
                />
                {searching && <div className="absolute right-3 top-3 h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                {searchResults.length > 0 && (
                  <div className={`absolute top-full left-0 right-0 mt-1 ${cf.panel} border ${cf.border} rounded-lg shadow-2xl z-20 overflow-hidden divide-y divide-zinc-800`}>
                    {searchResults.map((r, i) => (
                      <button key={i} onClick={() => handleSelectAddress(r)}
                        className="w-full text-left px-4 py-3 text-xs hover:bg-zinc-800 flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-200">{r.label}</span>
                        <span className="text-[10px] font-mono text-zinc-500">{r.citycode}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Commune', parcelInfo?.commune || selectedAddress?.city || '—'],
                  ['Section', parcelInfo?.section || '—'],
                  ['Numéro', parcelInfo?.numero || '—'],
                  ['Superficie', parcelInfo?.contenance ? `${parcelInfo.contenance} m²` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className={`${cf.panelSoft} border ${cf.border} rounded-lg p-3`}>
                    <div className={cf.label}>{k}</div>
                    <div className="mt-1 text-sm font-semibold font-mono text-zinc-200">
                      {loadingParcel ? <span className="inline-block h-3 w-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /> : v}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px]">{/* spacer */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded ${cf.badge}`}>Source IGN Apicarto</span>
              </div>

              {/* Demandeur — identité & contact */}
              <div className={`mt-5 pt-4 border-t ${cf.border}`}>
                <div className={cf.label}>Demandeur de la déclaration</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={cf.label}>Nom</label>
                    <input type="text" value={demandeur.nom} onChange={(e) => setDemandeur({ ...demandeur, nom: e.target.value })}
                      placeholder="Nom" className={`w-full mt-1 rounded-lg ${cf.input} px-3 py-2 text-sm outline-none`} />
                  </div>
                  <div>
                    <label className={cf.label}>Prénom</label>
                    <input type="text" value={demandeur.prenom} onChange={(e) => setDemandeur({ ...demandeur, prenom: e.target.value })}
                      placeholder="Prénom" className={`w-full mt-1 rounded-lg ${cf.input} px-3 py-2 text-sm outline-none`} />
                  </div>
                  <div>
                    <label className={cf.label}>Société / SIRET (facultatif)</label>
                    <input type="text" value={demandeur.societe} onChange={(e) => setDemandeur({ ...demandeur, societe: e.target.value })}
                      placeholder="Ex : PRO-SOLAIRE SAS" className={`w-full mt-1 rounded-lg ${cf.input} px-3 py-2 text-sm outline-none`} />
                  </div>
                  <div>
                    <label className={cf.label}>Adresse de contact</label>
                    <input type="text" value={demandeur.adresse} onChange={(e) => setDemandeur({ ...demandeur, adresse: e.target.value })}
                      placeholder="N° et voie" className={`w-full mt-1 rounded-lg ${cf.input} px-3 py-2 text-sm outline-none`} />
                  </div>
                  <div>
                    <label className={cf.label}>Téléphone</label>
                    <input type="tel" value={demandeur.telephone} onChange={(e) => setDemandeur({ ...demandeur, telephone: e.target.value })}
                      placeholder="06 12 34 56 78" className={`w-full mt-1 rounded-lg ${cf.input} px-3 py-2 text-sm outline-none`} />
                  </div>
                  <div>
                    <label className={cf.label}>Email</label>
                    <input type="email" value={demandeur.email} onChange={(e) => setDemandeur({ ...demandeur, email: e.target.value })}
                      placeholder="contact@exemple.fr" className={`w-full mt-1 rounded-lg ${cf.input} px-3 py-2 text-sm outline-none`} />
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-zinc-500">Le téléphone est inscrit chiffre par chiffre dans les cases du Cerfa ; l'email au-dessus du symbole @.</p>
              </div>
            </div>
            <div className={`${cf.panel} border rounded-xl p-5 flex flex-col justify-between`}>
              <div>
                <div className={cf.label}>Conformité réglementaire</div>
                <ul className="mt-3 space-y-2.5 text-xs text-zinc-300">
                  <li className="flex items-start gap-2"><span className={cf.emerald}>✓</span>Extraction automatique de la parcelle</li>
                  <li className="flex items-start gap-2"><span className={cf.emerald}>✓</span>Plan de situation DP1 (IGN HD)</li>
                  <li className="flex items-start gap-2"><span className={cf.emerald}>✓</span>Remplissage du Cerfa 13404 officiel</li>
                  <li className="flex items-start gap-2"><span className={cf.emerald}>✓</span>Photomontage DP6 (évitement ouvrants)</li>
                </ul>
              </div>
              <button onClick={() => setStep(2)} className={`mt-6 w-full rounded-lg ${cf.primary} py-3 text-sm font-semibold`}>
                Valider et passer à la toiture →
              </button>
            </div>
          </div>
        )}

        {/* ============ ETAPE 2 : TOITURE & PUISSANCE ============ */}
        {step === 2 && (
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              {/* Dropzone */}
              <div className={`${cf.panel} border rounded-xl p-5`}>
                <div className={cf.label}>1. Photographie du bâtiment (toiture)</div>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`mt-3 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
                    dragOver ? 'border-blue-500 bg-blue-950/30' : cf.border
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                  {roofImage ? (
                    <div className="flex items-center gap-3 justify-center">
                      <img src={roofImage} alt="toiture" className="h-20 w-28 rounded-md object-cover border border-zinc-700" />
                      <div className="text-left">
                        <div className="text-sm text-zinc-200">Image chargée ✓</div>
                        <div className="text-[11px] text-zinc-500">Cliquez pour remplacer — déposez une nouvelle photo</div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-2xl mb-1">🖼️</div>
                      <div className="text-sm text-zinc-300">Déposez une photo de toiture ici</div>
                      <div className="text-[11px] text-zinc-500 mt-1">ou cliquez pour parcourir (JPG / PNG)</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Paramètres puissance */}
              <div className={`${cf.panel} border rounded-xl p-5`}>
                <div className={cf.label}>2. Spécifications du générateur solaire</div>
                <div className="mt-3">
                  <div className="text-[11px] font-medium text-zinc-500 mb-1.5">Nombre de modules (rapide)</div>
                  <div className="flex gap-2">
                    {QUICK_COUNTS.map((c) => (
                      <button key={c} onClick={() => { setPanelCount(c); setPowerKwc(Number((c * 0.425).toFixed(2))); }}
                        className={`flex-1 rounded-lg py-2.5 text-sm font-semibold border transition ${
                          panelCount === c ? 'bg-blue-600 border-blue-600 text-white' : `${cf.chip} hover:bg-zinc-700`}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className={cf.label}>Modules</label>
                      <input type="number" value={panelCount} onChange={(e) => { const v = parseInt(e.target.value) || 0; setPanelCount(v); setPowerKwc(Number((v * 0.425).toFixed(2))); }}
                        className={`w-full mt-1 rounded-lg ${cf.input} px-3 py-2 text-sm outline-none`} />
                    </div>
                    <div>
                      <label className={cf.label}>Puissance crête (kWc)</label>
                      <input type="number" step="0.1" value={powerKwc} onChange={(e) => setPowerKwc(parseFloat(e.target.value) || 0)}
                        className={`w-full mt-1 rounded-lg ${cf.input} px-3 py-2 text-sm outline-none`} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className={cf.label}>Mode d'intégration</label>
                    <select value={poseType} onChange={(e) => setPoseType(e.target.value)}
                      className={`w-full mt-1 rounded-lg ${cf.input} px-3 py-2 text-sm outline-none`}>
                      <option value="SURIMPOSE">Surimposition sur toiture (Standard)</option>
                      <option value="INTEGRE">Intégration au bâti (IAB)</option>
                      <option value="SOL">Structure au sol / Ombrière</option>
                    </select>
                  </div>

                  {/* Photos complémentaires DP7 / DP8 (facultatives, ABF le cas échéant) */}
                  <div className="mt-4 pt-3 border-t border-zinc-800">
                    <div className="text-[11px] font-medium text-zinc-500 mb-2">Photos complémentaires (facultatif — DP7 / DP8)</div>
                    <div className="grid grid-cols-2 gap-3">
                      {([['DP7', dp7Image, setDp7Image, 'Vue proche / rue'], ['DP8', dp8Image, setDp8Image, 'Vue lointaine']] as const).map(([tag, img, setter, hint]) => (
                        <div key={tag}>
                          <label className={`flex items-center gap-2 cursor-pointer rounded-lg border border-dashed ${img ? 'border-emerald-700 bg-emerald-950/20' : 'border-zinc-700 hover:border-zinc-500'} px-3 py-2.5 text-xs transition`}>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setter(await readAsDataURL(f)); }} />
                            <span className={img ? 'text-emerald-400' : 'text-zinc-400'}>{img ? '✓' : '+'} {tag}</span>
                            <span className="text-zinc-500 truncate">{img ? 'photo chargée' : hint}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className={`w-1/3 rounded-lg border ${cf.border} py-2.5 text-xs font-medium hover:bg-zinc-800`}>← Retour</button>
                <button onClick={handleCalculateInsertion} disabled={calculating || !roofImage}
                  className={`flex-1 rounded-lg ${cf.primary} py-2.5 text-sm font-semibold`}>
                  {calculating ? 'Calcul en cours...' : insertionImage ? "Recalculer l'insertion (DP6)" : "Générer l'insertion paysagère (DP6)"}
                </button>
              </div>

              {/* Barre de progression */}
              {calculating && (
                <div className={`${cf.panel} border rounded-xl p-4`}>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span className="text-zinc-300">{progress.msg}</span>
                    <span className={cf.accent}>{progress.pct}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-300" style={{ width: `${progress.pct}%` }} />
                  </div>
                  <div className="mt-2 flex gap-3 text-[10px] text-zinc-500 font-mono">
                    <span className={progress.pct >= 30 ? cf.emerald : ''}>• Vision toiture</span>
                    <span className={progress.pct >= 65 ? cf.emerald : ''}>• Homographie</span>
                    <span className={progress.pct >= 100 ? cf.emerald : ''}>• Cerfa</span>
                  </div>
                </div>
              )}

              <button onClick={goToStep3} disabled={!roofImage || (calculating || generatingPdf)}
                className={`w-full rounded-xl ${cf.primary} py-3.5 text-sm font-bold`}>
                {generatingPdf ? 'Génération du dossier en cours...' : 'Télécharger mon dossier complet (PDF) →'}
              </button>
            </div>

            {/* Comparateur avant / après */}
            <div className={`${cf.panel} border rounded-xl overflow-hidden flex flex-col`}>
              <div className="flex items-center justify-between border-b border-zinc-800 p-3">
                <div className={cf.label}>Photomontage DP6</div>
                <div className="inline-flex rounded-lg bg-zinc-800 p-0.5 border border-zinc-700">
                  <ViewBtn active={!insertionImage ? true : false} label="Avant" onClick={() => setShowAfter(false)} />
                  <ViewBtn active={!!insertionImage} label="Après" onClick={() => setShowAfter(true)} />
                </div>
              </div>
              <div className="flex-1 min-h-[420px] bg-zinc-950 flex items-center justify-center p-4 relative">
                {(() => {
                  const showAfter = displayAfter && !!insertionImage;
                  const src = showAfter ? insertionImage : roofImage;
                  return src ? (
                    <img src={src} alt="DP6" className="max-h-[420px] max-w-full object-contain rounded" />
                  ) : (
                    <div className="text-center text-xs text-zinc-500 space-y-1">
                      <div className="text-3xl">🖼️</div>
                      <div>Ajoutez une photo pour voir le rendu</div>
                    </div>
                  );
                })()}
                <div className="absolute bottom-3 right-3 bg-zinc-900/80 backdrop-blur border border-zinc-700/60 rounded px-2.5 py-1 text-[10px] text-zinc-300 font-mono">
                  {displayAfter && insertionImage ? `DP6 : ${panelCount} modules` : 'DP6 : État existant'}
                </div>
              </div>
              <div className="border-t border-zinc-800 p-3 text-[11px] text-zinc-500 flex items-center justify-between">
                <span>Évitement ouvrants & Velux actif</span><span className="font-mono">Résolution 300 DPI</span>
              </div>
            </div>
          </div>
        )}

        {/* ============ ETAPE 3 : DOSSIER & TELECHARGEMENT ============ */}
        {step === 3 && (
          <div className={`${cf.panel} border rounded-xl p-6`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-zinc-100">Dossier de Déclaration Préalable</h2>
                <p className="text-xs text-zinc-400 mt-1">Cerfa 13404*12 complété (Cadre 5) · DP1 situation IGN · DP2 plan de masse · DP6 insertion · Notice technique</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(2)} className="rounded-lg border border-zinc-700 px-4 py-2.5 text-xs font-medium hover:bg-zinc-800">← Modifier</button>
                {pdfBlobUrl ? (
                  <a href={pdfBlobUrl} download={pdfName}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg">
                    ⬇ Télécharger le dossier complet officiel (PDF 6-8 pages)
                  </a>
                ) : (
                  <button onClick={handleGeneratePdf} disabled={generatingPdf}
                    className={`rounded-lg ${cf.primary} px-5 py-3 text-sm font-bold`}>
                    {generatingPdf ? 'Compilation...' : 'Télécharger mon dossier complet (PDF)'}
                  </button>
                )}
              </div>
            </div>
            <div className="mt-6 h-[600px] rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center">
              {generatingPdf ? (
                <div className="flex flex-col items-center gap-3 text-xs text-zinc-400">
                  <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Compilation du Cerfa officiel...
                </div>
              ) : pdfBlobUrl ? (
                <iframe src={pdfBlobUrl} className="h-full w-full border-0" title="Aperçu PDF" />
              ) : (
                <div className="text-xs text-zinc-500">Cliquez sur « Télécharger mon dossier complet (PDF) » pour compiler le dossier.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ViewBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-medium transition ${active ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}>
      {label}
    </button>
  );
}