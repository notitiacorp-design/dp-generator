# Benchmark & Sélection des Modèles IA - Générateur de Dossiers DP (Solaire/Pergola)

Ce document formalise l'analyse comparative et la sélection des modèles IA pour le SaaS d'automatisation de Déclarations Préalables (DP) en mairie.

---

## 1. Objectifs & Contraintes de Performance / Coûts

- **Budget cible par dossier DP** : $< 0,10 €$ d'inférence brute par dossier complet (extraction + inpainting).
- **Latence cible** : $< 5$ secondes par appel d'inférence.
- **Exigences qualitatives** :
  - **Vision / Spatial** : Segmentation polygonale / bounding boxes précises des pans de toiture + extraction structurée JSON stricte (Cerfa & règles d'urbanisme).
  - **Inpainting (DP6/DP7)** : Respect géométrique des lignes de fuite, zéro distorsion des tuiles/façades existantes, pose photoréaliste des modules PV / pergolas.
  - **Modularité** : Abstraction stricte des providers (Google OpenRouter / OpenAI / Fal.ai / Replicate) pilotable par variables d'environnement (`AI_VISION_PROVIDER`, `AI_INPAINTING_PROVIDER`).

---

## 2. Benchmark du Module 1 : Vision & Extraction Spatiale (Toitures/Façades & JSON Cerfa)

### Modèles comparés

| Modèle | Provider / Endpoint | Coût Input / 1M | Coût Output / 1M | Précision Spatiale / Vision | Respect Schéma JSON | Coût estimé / requête |
|---|---|---|---|---|---|---|
| **Gemini 2.5 / 3.7 Flash** *(Sélectionné - Recommandé)* | Google Vertex / OpenRouter | ~0.10 $ | ~0.40 $ | ⭐⭐⭐⭐⭐ (Coord. normalisées 0-1000 natives) | ⭐⭐⭐⭐⭐ (Structured Outputs natif) | **~0.0008 €** |
| **Qwen 2.5 VL 72B / 7B** | Together / DeepInfra / OpenRouter | 0.20 $ - 0.60 $ | 0.40 $ - 1.20 $ | ⭐⭐⭐⭐ (Très fort sur le parsing spatial) | ⭐⭐⭐⭐ | **~0.0015 €** |
| **Claude 3.5 Haiku** | Anthropic API | 0.80 $ | 4.00 $ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **~0.0035 €** |
| **GPT-4o mini** | OpenAI API | 0.15 $ | 0.60 $ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **~0.0012 €** |

### Justification du choix : **Gemini 2.5 / 3.7 Flash (et fallback GPT-4o-mini / Qwen-VL)**
1. **Support natif des coordonnées spatiales** : La famille Gemini Flash excelle dans la détection d'objets avec retour de coordonnées normalisées `[ymin, xmin, ymax, xmax]` ou polygones de toiture pour générer le masque de pose.
2. **Coût dérisoire** : Moins de 0,001 € pour analyser l'image haute résolution et formater les champs Cerfa (nom, adresse, cadastre, calcul d'emprise et descriptif technique Cerfa).
3. **Structured Outputs** : Garantie 100% JSON valide pour injecter directement dans le moteur de fusion Cerfa.

---

## 3. Benchmark du Module 2 : Inpainting & Insertion Paysagère (DP6 & DP7)

### Modèles & Fournisseurs comparés

| Solution / Modèle | Fournisseur / API | Coût par Image | Vitesse | Fidélité Masque / Respect de l'architecture |
|---|---|---|---|---|
| **FLUX.1 Fill [dev/schnell]** *(Sélectionné - Recommandé)* | Fal.ai / Replicate / BFL | **0.025 $ - 0.04 $** | **1.8s - 3.5s** | ⭐⭐⭐⭐⭐ (Cohérence photoréaliste et respect strict du bâti non masqué) |
| **SDXL Inpainting v1.0** | Replicate / Together AI | 0.005 $ - 0.015 $ | 2.0s | ⭐⭐⭐ (Parfois flou sur les jonctions de tuiles et reflets) |
| **BFL Flux Pro 1.1 Inpainting** | BFL / Fal.ai | 0.05 $ | 4.0s | ⭐⭐⭐⭐⭐ (Ultra réaliste, mais limite de budget) |
| **Ideogram 2.0 Inpaint** | Replicate / Ideogram | 0.04 $ - 0.06 $ | 5.0s | ⭐⭐⭐⭐ |
| **Canvas / SVG Vector Layering + Inpainting** | Algorithme interne (Canvas) | **0.000 €** | **< 0.1s** | ⭐⭐⭐⭐⭐ (Parfait pour les calques PV techniques normés) |

### Stratégie Hybride Retenue :
1. **Mode Standard (Technique & Gratuit)** : Rendu vectoriel dynamique sur Canvas (intégration géométrique 2.5D des panneaux solaires orientés selon la pente du toit avec reflets et ombrages normés Mairie). Coût = **0,00 €**.
2. **Mode Photoréaliste IA (Fal.ai FLUX.1 Fill)** : Inpainting architectural piloté par masque polygonal avec prompt conditionné (panneaux solaires monocristallins noirs antireflets intégrés au bâti). Coût = **~0,028 € (0,03 $)**.

---

## 4. Structure de Coût Unitaire par Dossier DP Complet

| Étape du Dossier | Fournisseur / Technologie | Coût Unitaire (€) |
|---|---|---|
| **Géocodage & Cadastre (DP1 & DP2)** | API geo.api.gouv.fr + Carto IGN Open Data | **0,000 €** |
| **Extraction Spatiale & Données Cerfa** | Gemini 3.7/2.5 Flash (Vision + JSON) | **0,001 €** |
| **Insertion Paysagère Proche (DP6)** | Fal.ai FLUX.1 Fill (ou Canvas SVG fallback) | **0,028 €** *(ou 0,00 €)* |
| **Insertion Paysagère Lointaine (DP7)** | Fal.ai FLUX.1 Fill (ou Canvas SVG fallback) | **0,028 €** *(ou 0,00 €)* |
| **Génération & Fusion PDF Cerfa 13404/13703** | Serverless Node.js (`pdf-lib`) | **0,000 €** |
| **TOTAL PAR DOSSIER COMPLET** | **Multi-fournisseur optimisé** | **0,057 €** |

> **Marge brute** : À 199 €/mois pour 50 dossiers (~4 €/dossier) ou 29 € à l'acte, la marge brute sur l'inférence dépasse **98,5%**.
