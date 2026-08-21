# Spécification d'Architecture IA & Stratégie Économique V1 (DP Generator)

Ce document formalise l'architecture d'inférence, la cascade de modèles (Cerveau) et la stratégie de rendu paysager (Image) pour garantir un coût moyen $< 0,10\ \text{€}$ par dossier DP.

---

## 1. Architecture à Deux Étages du « Cerveau » (Vision & JSON Cerfa)

```
                       [Photo Toiture / Données Brutes]
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   Gemini 2.5 Flash-Lite   │ (Coût : ~0,0008 $)
                        │ - Bounding box initiale   │
                        │ - Détection d'obstacles   │
                        │ - Pré-remplissage Cerfa   │
                        └─────────────┬─────────────┘
                                      │
                         Score de confiance ≥ 0.85 ?
                                     ╱ ╲
                                    ╱   ╲
                             OUI   ╱     ╲   NON / Ambigu (toiture complexe)
                                  ▼       ▼
               ┌─────────────────────┐   ┌──────────────────────────┐
               │ Validation Moteur   │   │  Gemini 3.7 Flash        │ (Coût : ~0,003 $)
               │ Déterministe        │   │  (Hybrid Thinking)       │
               │ (Règles Code Urba)  │   │  Polygones 0-1000 fins   │
               └──────────┬──────────┘   └────────────┬─────────────┘
                          │                           │
                          └─────────────┬─────────────┘
                                        ▼
                           [Édition / Validation UI]
                           (Contrôle humain installateur)
```

### Détail des Composants Cerveau :
1. **Étage 1 — Standard (Gemini 2.5 Flash-Lite) :**
   - Rôle : Traitement de 80% des toitures régulières (2 ou 4 pans classiques).
   - Coût : Input 0,10 $/M, Output 0,40 $/M $\rightarrow$ **~0,0012 $ / dossier**.
   - Sortie : Détection toiture + extraction structurée JSON Cerfa.
2. **Étage 2 — Escalade Ciblée (Gemini 3.7 Flash) :**
   - Déclenché uniquement si : Score de confiance $< 0,85$, toiture complexe (lucarnes multiples, ombrages forts, toitures cintrées) ou règles PLU ambiguës.
   - Sortie : Segmentation polygonale fine $0-1000$ et raisonnement spatial.
3. **Garde-fou Déterministe & Édition UI :**
   - Le LLM propose les coordonnées ; un moteur de validation TypeScript vérifie les contraintes physiques (puissance crête vs surface, cohérence cadastrale).
   - L'installateur peut ajuster le polygone sur l'UI avant inpainting.

---

## 2. Stratégie de Rendu Paysager (DP6 & DP7) & Maîtrise des Coûts

### Analyse de la tarification FLUX.1 Pro Fill (fal.ai) :
- **Tarif** : $0,05\ \text{\$/MP}$ avec arrondi au mégapixel supérieur.
- **Impact économique** : 2 générations complètes à 1 MP = **$0,10\ \text{\$}$** d'images brutes, ce qui saturerait le budget cible.

### Matrice Décisionnelle Opérationnelle V1 :

| Pièce | Rôle Réglementaire Mairie | Méthode Retenue V1 | Modèle / Outil | Coût Réel |
|---|---|---|---|---|
| **DP6 (Insertion Paysagère)** | Volet clé : intégration visuelle projetée | Inpainting sous masque strict (1 MP) | **FLUX.1 Pro Fill** *(fal.ai)* | **~0,050 $** |
| **DP7 (Environnement Proche)** | Contexte visuel de la parcelle et rue | Montage déterministe / Cartouche coté | Moteur Canvas/Sharp local | **0,000 $** |
| **DP8 (Environnement Lointain)** | Vue grand angle / paysage lointain | Capture Géoportail / Photo annotée | Open Data IGN + Canvas | **0,000 $** |
| **DP1 & DP2 (Situation & Masse)** | Plans cadastraux normés | Géoréférencement Open Data | API BAN + Apicarto IGN | **0,000 $** |

> **Coût Inférence Total Réel par Dossier V1 :**
> - Cerveau (Flash-Lite / 3.7) : **0,0012 $**
> - Image DP6 (FLUX.1 Pro Fill 1 MP) : **0,0500 $**
> - Image DP7 / DP8 / DP1 / DP2 : **0,0000 $**
> - **TOTAL MOYEN PAR DOSSIER : ~0,051 $ (~0,048 €)** $\rightarrow$ **Objectif $< 0,10\ \text{€}$ respecté avec 50% de marge de sécurité.**

---

## 3. Pistes d'Optimisation V1.1 (A/B Testing)
- **FLUX.2 Dev / Schnell sur Replicate / DeepInfra** : Évaluation du compromis prix (~0,024 $/image) vs fidélité stricte au masque.
- **Mode Overlay Vectoriel 2.5D (Fallback local)** : Disponible sans surcoût pour les chantiers nécessitant un plan technique pur.
