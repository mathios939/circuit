# Circuit — générateur intelligent de parcours sportifs

Circuit crée en quelques secondes des boucles et itinéraires pour le **vélo de route, le gravel, le VTT, la course à pied, le trail, la randonnée et la marche**, à partir de critères simples (départ, distance, activité) ou d'une phrase en langage naturel :

> « Je veux une boucle VTT de 35 km au départ d'Annecy avec environ 800 m de D+. »

Le moteur explore plusieurs directions, mesure les distances réelles renvoyées par le moteur de routing, ajuste les boucles, les note et propose jusqu'à **trois variantes (Rapide, Équilibrée, Aventure)** que l'on peut comparer, analyser (profil altimétrique, surfaces, Route DNA), modifier sur la carte et exporter en **GPX** compatible Garmin / Wahoo / Hammerhead / Strava / Komoot.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Prérequis](#prérequis)
3. [Installation](#installation)
4. [Variables d'environnement](#variables-denvironnement)
5. [Lancement en développement](#lancement-en-développement)
6. [Build de production](#build-de-production)
7. [Tests](#tests)
8. [Architecture](#architecture)
9. [Fournisseurs cartographiques](#fournisseurs-cartographiques)
10. [Fournisseurs de routing](#fournisseurs-de-routing)
11. [Géocodage et altitude](#géocodage-et-altitude)
12. [Algorithme de boucle](#algorithme-de-boucle)
13. [Quality gate et similarité](#quality-gate-et-similarité)
14. [Dénivelé : méthode de calcul](#dénivelé--méthode-de-calcul)
15. [Scoring, Route DNA et explications](#scoring-route-dna-et-explications)
16. [Fiabilité : fallback, cache, limites, logs](#fiabilité--fallback-cache-limites-logs)
17. [Diagnostics, mode démo et debug](#diagnostics-mode-démo-et-debug)
18. [Sécurité et robustesse](#sécurité-et-robustesse)
19. [Limitations actuelles](#limitations-actuelles)
20. [Roadmap](#roadmap)

---

## Fonctionnalités

**Création**

- Mode **Boucle** (retour au départ), **A → B** (avec distance cible optionnelle : un détour est inséré pour l'atteindre), **Surprends-moi** (direction aléatoire) et **mode avancé** (tolérance, D+ souhaité / maximal, durée visée, surface, dénivelé min/max, préférences : éviter les routes fréquentées, les grands axes, les ferries, les routes privées ; privilégier la nature, les pistes cyclables, les chemins, les singles, les routes calmes, le panorama ; zones à éviter).
- **Langage naturel** : la phrase est transformée en paramètres structurés (analyseur à base de règles FR/EN derrière une interface `RouteIntentParser` prête pour un LLM).
- **3 propositions** par demande, avec scoring et comparaison côte à côte.

**Analyse**

- Distance réelle, D+/D−, altitudes min/max, pente max, durée estimée par activité, difficulté, répartition des surfaces (asphalte / piste / chemin) et des types de voies.
- **Profil altimétrique interactif** synchronisé avec la carte (survol dans les deux sens).
- **Route DNA** (Nature, Calme, Difficulté, Technique, Panorama) présenté comme estimation.
- **Explications** (« Distance très proche de votre objectif », « Attention : portions non goudronnées », « Variante plus calme disponible »…) et détail du score.

**Édition**

- Déplacement des points de passage par glisser-déposer, ajout d'un point (détour), suppression, inversion du sens, **couper une section** (raccourci entre deux points), recalcul automatique, annulation.
- Boutons d'ajustement : **+5 km, −5 km, +200 m D+, −200 m D+, Plus nature, Plus roulant, Plus calme, Plus technique** — le caractère général (direction de la boucle) est conservé.

**Import / export / partage**

- Export **GPX 1.1** propre (métadonnées, track, altitudes, waypoints départ/arrivée) — nom de fichier du type `annecy-vtt-35km.gpx` — et **GeoJSON**. Registre d'exporteurs prêt pour FIT / TCX / KML.
- **Import GPX** (côté navigateur, taille limitée, entités XML non traitées) : affichage, statistiques, profil, édition.
- **Favoris et historique** (stockage local, abstraction `RouteRepository` prête pour un compte utilisateur).
- **Lien de partage** `/route/{id}?d=…` autonome (la géométrie simplifiée est encodée dans l'URL) affichant carte, distance, dénivelé, activité et profil.

**Carte**

- MapLibre GL JS : zoom, déplacement, géolocalisation, plein écran, échelle, plusieurs fonds (standard, clair, topographique ; outdoor et satellite avec une clé MapTiler), clic pour placer départ / arrivée, sens du parcours (flèches), variantes alternatives en filigrane.

**Interface**

- Desktop : panneau de configuration à gauche, grande carte à droite. Mobile : carte plein écran et *bottom sheet*.
- Flux principal en moins d'une minute : activité → départ → distance → Générer → choisir → Télécharger GPX.

## Prérequis

- **Node.js ≥ 20.9** (testé avec Node 22) et npm.
- Un accès Internet pour les services externes par défaut (voir plus bas). Aucun n'exige de clé pour démarrer.

## Installation

```bash
git clone https://github.com/mathios939/circuit.git
cd circuit
npm install
cp .env.example .env.local   # puis adaptez si besoin
```

## Variables d'environnement

Toutes les variables sont documentées dans [`.env.example`](.env.example). Les clés privées ne sont lues que côté serveur (`src/lib/server/env.ts`) ; seules les variables `NEXT_PUBLIC_*` sont exposées au navigateur.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `ROUTING_PROVIDER_PRIMARY` (ou `ROUTING_PROVIDER`) | `valhalla` | Moteur de routing : `valhalla`, `graphhopper`, `openrouteservice`, `osrm`, `mock` (tests, refusé en production) |
| `ROUTING_PROVIDER_FALLBACK` | – | Moteur de secours, utilisé uniquement si le principal est indisponible (timeout, 429, 5xx) |
| `ROUTE_CANDIDATE_COUNT` / `ROUTE_MAX_ITERATIONS` / `ROUTE_MAX_ROUTING_CALLS` | `12` / `2` / `40` | Candidats initiaux, passes d'ajustement de distance, budget d'appels par génération |
| `ROUTING_VALHALLA_URL` | `https://valhalla1.openstreetmap.de` | Instance Valhalla (publique FOSSGIS par défaut, à auto-héberger en production) |
| `GRAPHHOPPER_API_KEY` | – | Clé GraphHopper (https://www.graphhopper.com/) — boucles natives, altitude et surfaces incluses |
| `OPENROUTESERVICE_API_KEY` | – | Clé openrouteservice (https://openrouteservice.org/dev/#/signup) — boucles natives |
| `ROUTING_OSRM_URL` | – | URL d'une instance OSRM auto-hébergée (profils `bike` / `foot`) |
| `ROUTING_TIMEOUT_MS` / `ROUTING_CONCURRENCY` | `20000` / `3` | Délai et parallélisme des appels de routing |
| `GEOCODING_PROVIDER` / `GEOCODING_PROVIDER_FALLBACK` | `photon` / auto | `photon`, `nominatim` ou `mock` ; le secours vaut l'autre service par défaut |
| `GEOCODING_NOMINATIM_EMAIL` | – | Contact transmis à Nominatim (recommandé par sa politique d'usage) |
| `GEOCODING_USER_AGENT` | `circuit-app/0.1 (…)` | User-Agent exigé par Photon / Nominatim — mettez un contact |
| `ELEVATION_PROVIDER` / `ELEVATION_PROVIDER_FALLBACK` | `open-meteo` / `valhalla` | Chaîne d'altitude ; dernier recours implicite : parcours sans altitude |
| `ELEVATION_SAMPLE_POINTS` | `300` | Points échantillonnés par parcours pour le profil |
| `NEXT_PUBLIC_MAP_PROVIDER` | `openfreemap` | `openfreemap` (sans clé) ou `maptiler` |
| `NEXT_PUBLIC_MAPTILER_KEY` | – | Clé **publique** MapTiler (https://cloud.maptiler.com/account/keys/), à restreindre par domaine : ajoute Outdoor / Topo / Satellite |
| `RATE_LIMIT_PER_MINUTE` | `60` | Base des limites par IP ; `RATE_LIMIT_{GEOCODING,GENERATION,CALCULATE,IMPORT}_PER_MINUTE` affinent chaque bucket |
| `NEXT_PUBLIC_DEMO_MODE` | `false` | Mode démo : fournisseurs synthétiques + bandeau explicite |
| `LOG_LEVEL` / `LOG_FORMAT` | `debug`/`pretty` en dev, `info`/`json` en prod | Logs structurés (requestId, provider, durée, statut) |
| `DIAGNOSTICS_ENABLED` | `true` en dev, `false` en prod | Écran `/diagnostics` et sondes `/api/health?probe=1` |
| `NEXT_PUBLIC_DEBUG_ROUTES` | `false` | Panneau debug d'un parcours hors développement |
| `GPX_MAX_FILE_BYTES` | `10485760` | Taille maximale d'un GPX importé |

La configuration est validée au démarrage avec Zod : une valeur invalide ou une clé manquante pour le fournisseur choisi provoque une erreur explicite (visible aussi sur `/api/health`). Le fichier `.env.example` classe chaque variable en obligatoire / optionnelle / production / développement.

Sans aucune clé, l'application fonctionne avec **Valhalla (FOSSGIS) + Photon + Open-Meteo + OpenFreeMap**. Ces services publics sont gratuits mais soumis à un usage raisonnable : pour un déploiement réel, auto-hébergez Valhalla (ou prenez une clé GraphHopper / openrouteservice) et configurez un fournisseur de tuiles.

## Lancement en développement

```bash
npm run dev
```

Ouvrez http://localhost:3000, puis :

1. choisissez **Vélo de route** ;
2. tapez **Annecy** dans « Départ » et sélectionnez la suggestion ;
3. gardez **Boucle** ;
4. entrez **50** km ;
5. cliquez sur **Générer** ;
6. le parcours s'affiche sur la carte, avec distance, dénivelé et profil altimétrique ;
7. modifiez-le si besoin (**Modifier le parcours** → glissez les points) ;
8. cliquez sur **Télécharger GPX**.

Pour développer sans réseau, utilisez les moteurs synthétiques (réservés aux tests, jamais à la production) :

```bash
ROUTING_PROVIDER=mock GEOCODING_PROVIDER=mock ELEVATION_PROVIDER=mock npm run dev
```

## Build de production

```bash
npm run build
npm run start
```

`npm run check` enchaîne typage, lint et tests unitaires. Un endpoint `GET /api/health` résume les fournisseurs configurés (sans secret).

## Tests

```bash
npm run test        # tests unitaires (Vitest) : distance, polylines, GPX, scoring, statistiques,
                    # validation, génération de boucles (moteur mock), langage naturel, partage, éditeur…
npm run test:e2e    # Playwright : flux principal (activité → départ → boucle → GPX), erreurs lisibles,
                    # langage naturel, favoris + import GPX, éditeur, progression, diagnostics — contre
                    # un build de production et les fournisseurs mock (aucun service externe requis).

npm run test:integration   # tests d'intégration OPTIONNELS contre les vrais services (Valhalla, Photon,
                           # Nominatim, Open-Meteo, OpenTopoData, OpenFreeMap, OpenTopoMap, et GraphHopper /
                           # openrouteservice / OSRM / MapTiler si les clés ou URLs sont fournies). Chaque test
                           # se saute lui-même sans réseau ou sans clé : `npm test` n'en dépend jamais.
```

Les tests E2E utilisent le navigateur Playwright ; installez-le une fois avec `npx playwright install chromium` si nécessaire. Ils tournent sur un build de production contre les fournisseurs `mock`, en desktop, iPhone (390 px), Android (412 px) et tablette.

## Architecture

Stack : **Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · MapLibre GL JS · Zustand · Zod · Vitest · Playwright**.

Pourquoi : Next.js fournit à la fois l'interface et les routes API (les clés restent côté serveur) avec un déploiement simple ; MapLibre est un moteur de cartes vectorielles libre et performant, indépendant de tout fournisseur ; TypeScript + Zod sécurisent les frontières (API, fichiers importés) ; Zustand garde l'état client minimal et hors des composants.

```
src/
├── app/                      # pages et API (Next.js App Router)
│   ├── page.tsx              # application principale
│   ├── route/[id]/page.tsx   # page de partage
│   └── api/
│       ├── routes/generate   # POST : génération des variantes
│       ├── routes/calculate  # POST : recalcul via points de passage (éditeur)
│       ├── geocode(/reverse) # GET : recherche de lieux / géocodage inverse
│       ├── nl                # POST : langage naturel → paramètres
│       └── health
├── components/               # UI React (petits composants, sans logique métier)
│   ├── builder/  results/  editor/  map/  library/  share/  layout/  ui/
├── store/route-store.ts      # état client (Zustand) : formulaire, résultats, édition, carte, bibliothèque
├── hooks/
└── lib/                      # logique métier, indépendante de React
    ├── types/                # RouteRequest, RouteResult, RoutePoint, RouteWaypoint, ActivityProfile,
    │                         # SurfaceType, RoutePreferences, RouteStatistics, ElevationPoint…
    ├── activities/           # profils sportifs (vitesses, affinités de surface, bornes de distance)
    ├── geo/                  # Haversine, cap, destination, polylines, échantillonnage, simplification
    ├── routing/              # RoutingProvider + Valhalla, GraphHopper, openrouteservice, OSRM, mock
    ├── elevation/            # ElevationProvider + Open-Meteo, OpenTopoData, Valhalla, mock
    ├── geocoding/            # GeocodingProvider + Photon, Nominatim, mock
    ├── map/                  # fonds de carte (abstraction du fournisseur de tuiles)
    ├── route-generator/      # moteur : candidats, recherche de boucles, A→B, ajustements, assemblage
    ├── scoring/              # scorers pondérés, Route DNA, explications
    ├── stats/                # D+/D−, durée, difficulté, répartitions
    ├── gpx/  export/  share/ # GPX (construction / parsing sûr), registre d'exporteurs, lien de partage
    ├── nl/                   # RouteIntentParser (règles) — prêt pour un LLM
    ├── editor/               # opérations pures sur les points de passage
    ├── storage/              # RouteRepository (localStorage aujourd'hui, serveur demain)
    ├── validation/           # schémas Zod des entrées API
    ├── server/               # env, fetch avec timeout, cache LRU, rate limiting, helpers API
    └── client/               # appels API typés, téléchargement, import GPX côté navigateur
```

Principes : chaque service externe est derrière une interface (`RoutingProvider`, `GeocodingProvider`, `ElevationProvider`, fonds de carte), sélectionnée par l'environnement ; le générateur ne dépend que de ces interfaces ; les composants React n'appellent que le store et des fonctions pures.

## Fournisseurs cartographiques

Les serveurs de tuiles publics d'OpenStreetMap ne sont **pas** utilisés. `src/lib/map/styles.ts` déclare les fonds disponibles :

- **OpenFreeMap** (`liberty`, `bright`) — tuiles vectorielles gratuites sans clé (https://openfreemap.org) ;
- **MapTiler** (`NEXT_PUBLIC_MAPTILER_KEY`) — Standard, Outdoor, Topographique, Satellite ;
- **OpenTopoMap** (raster, usage modéré) pour un rendu topographique sans clé.

Ajouter un fournisseur = ajouter une entrée `Basemap` (URL de style MapLibre ou style inline).

## Fournisseurs de routing

| Fournisseur | Clé | Boucles natives | Altitude | Surfaces | Remarques |
| --- | --- | --- | --- | --- | --- |
| **Valhalla** (défaut) | non | non (moteur interne) | via `/height` | via `/trace_attributes` | Options de coût fines par activité (`bicycle_type`, `use_roads`, `use_hills`, `avoid_bad_surfaces`, `use_tracks`, `max_hiking_difficulty`…), zones à éviter |
| **GraphHopper** | oui | oui (`round_trip`) | oui | oui (`details`) | Modèle personnalisé (priorités par classe de route / surface) |
| **openrouteservice** | oui | oui (`round_trip`) | oui | oui (`extra_info`) | Profils `cycling-road/regular/mountain`, `foot-walking/hiking` |
| **OSRM** | non (auto-hébergé) | non | non | non | Pas d'options de coût : les styles ne diffèrent que par la géométrie et le scoring |
| **mock** | – | – | – | oui | Tests uniquement |

Les préférences utilisateur sont d'abord traduites en une **intention de routing neutre** (`src/lib/routing/intent.ts` : `useRoads`, `useHills`, `useUnpaved`, `useTrails`, `useQuietStreets`, `avoidFerries`…), que chaque fournisseur mappe sur ses propres paramètres. Les règles par sport (un vélo de route n'est jamais envoyé sur les sentiers, le VTT privilégie chemins et singles, la course à pied privilégie parcs, chemins et rues calmes…) vivent donc à un seul endroit.

## Géocodage et altitude

- **Photon** (défaut) : autocomplétion, sans clé, usage raisonnable ; **Nominatim** : sans clé, 1 req/s, pas d'autocomplétion intensive (le champ de recherche est *debouncé* à 300 ms et annule les requêtes obsolètes ; les résultats sont mis en cache côté serveur).
- **Open-Meteo** (défaut) : 100 points par requête ; **OpenTopoData** : 100 points / requête, 1 req/s ; **Valhalla `/height`** : 1 requête par parcours. L'altitude est un enrichissement : en cas d'échec, le parcours est quand même proposé et l'interface indique que le dénivelé est indisponible.

## Algorithme de boucle

`src/lib/route-generator/loop.ts` et `candidates.ts` :

1. **Candidats** : `ROUTE_CANDIDATE_COUNT` (12 par défaut) silhouettes sont réparties autour du départ en mélangeant directions et **stratégies** — `radial_triangle`, `radial_quad`, `biased_loop` (boucle asymétrique), `directional_loop` (boucle allongée aller/retour sur deux corridors parallèles), `wide_loop` — pour éviter que toutes les boucles ressemblent à un triangle artificiel. Une graine (« Surprends-moi » ou reproductible) fixe les directions.
2. **Routing réel** : chaque silhouette (départ → points de passage → départ) est calculée par le moteur ; c'est la distance renvoyée par le moteur qui compte.
3. **Convergence de distance** : l'échelle des candidats les plus prometteurs est ajustée par mise à jour amortie (`ROUTE_MAX_ITERATIONS` passes, budget `ROUTE_MAX_ROUTING_CALLS` appels). Le moteur s'arrête proprement s'il ne converge pas.
4. **Quality gate** (voir ci-dessous) sur chaque boucle routée.
5. **Sélection** : tolérance stricte ±5 %, élargie une seule fois à ±10 % si rien ne convient ; au-delà, la génération échoue explicitement plutôt que de renvoyer 40 ou 62 km pour 50 demandés. Les meilleures boucles sont retenues en écartant celles qui partagent plus de 85 % de leur tracé avec une boucle mieux classée.
6. **Variantes** : la meilleure boucle garde le coût « Équilibrée » ; les suivantes sont recalculées avec les coûts **Rapide** et **Aventure** (et re-vérifiées : une variante hors tolérance ou trop semblable est remplacée ou honnêtement ré-étiquetée « Équilibrée » avec une note).

Une génération représente en général 15 à 30 appels de routing avec les réglages par défaut (moins avec un moteur offrant des boucles natives). Les réglages sont exposés dans `.env.example` ; les timings, le nombre d'appels et de candidats évalués sont renvoyés avec le résultat et visibles dans le panneau debug.

## Quality gate et similarité

`src/lib/route-generator/quality.ts` produit un `RouteQualityReport` pour chaque itinéraire routé :

```json
{ "distanceAccuracy": 0.97, "overlapRatio": 0.08, "outAndBackRatio": 0.04, "uTurnCount": 0,
  "maxDistanceFromStartM": 6120, "waypointCount": 4, "geometryValid": true,
  "activityCompatibility": 0.81, "qualityScore": 89, "rejected": false, "reasons": [] }
```

Un parcours est **rejeté** avant d'être présenté lorsque : la géométrie est cassée (trop courte, sauts anormaux, longueur incohérente avec la distance annoncée, boucle qui ne revient pas au départ), la distance est hors tolérance, plus de 35 % du tracé est un aller-retour, plus de 45 % du tracé est répété, il y a plus de 1,2 demi-tour par km, la boucle est repliée sur elle-même (jamais à plus de 8 % de sa longueur du départ) ou les voies sont incompatibles avec l'activité (données de surface disponibles).

`routeSimilarity(a, b)` (`similarity.ts`) renvoie 0..1 : part de la longueur de chaque tracé située dans les cellules (~50 m, voisinage toléré) utilisées par l'autre, sans tenir compte du sens. Deux propositions à ≥ 0,85 ne sont jamais montrées ensemble.

## Dénivelé : méthode de calcul

`src/lib/stats/elevation-gain.ts` :

1. le parcours est échantillonné (≤ `ELEVATION_SAMPLE_POINTS`, tous les 50 m minimum) et l'altitude interpolée sur chaque point ; les valeurs brutes sont conservées ;
2. la série est **filtrée** : médiane glissante (fenêtre 5, fenêtres symétriques réduites aux extrémités pour ne pas déformer départ et arrivée) qui supprime les pics isolés du MNT, puis moyenne glissante (fenêtre 3) ;
3. le D+ / D− est accumulé avec une **hystérésis** de 4 m : une montée n'est comptée qu'une fois l'altitude montée d'au moins 4 m depuis le dernier extremum confirmé. Ainsi `100, 101, 100.8, 101.2, 105, 110` donne 10 m de D+, et non la somme de chaque oscillation.

Le D+ brut (sans filtre, seuil 0) est calculé en parallèle (`stats.ascentRawM`) et affiché dans le panneau debug pour comparaison. Le profil altimétrique affiche la série filtrée, colorée par classes de pente (0–3, 3–6, 6–10, 10–15, 15 %+, légende masquable) ; le survol donne distance, altitude, pente et position sur la carte.

## Scoring, Route DNA et explications

`src/lib/scoring/scorers.ts` définit des **scorers indépendants** (respect de la distance, diversité du tracé, dénivelé, compatibilité du revêtement, sécurité estimée, environnement naturel, pistes cyclables, adéquation à l'activité, fluidité) ; chacun renvoie une valeur 0..1 et un poids dépendant du contexte (style, activité, préférences). Le total est une moyenne pondérée sur 100. Ajouter un critère = ajouter un objet `Scorer` à la liste.

Le **Route DNA** et les **explications** dérivent des mêmes statistiques ; ils sont signalés comme estimations lorsque les surfaces ou l'altitude sont partielles.

## Fiabilité : fallback, cache, limites, logs

**Fallback automatique.** Chaque famille de service est enveloppée d'une stratégie de secours qui ne se déclenche qu'en cas d'indisponibilité (timeout, 429, 5xx, réseau) — jamais lorsqu'une route est réellement impossible ou qu'un point n'est pas routable, car changer de moteur changerait le comportement demandé :

- géocodage : Photon → Nominatim (ou l'inverse), automatique ;
- altitude : Open-Meteo → Valhalla `/height` → parcours sans altitude (signalé dans l'interface) ;
- routing : `ROUTING_PROVIDER_PRIMARY` → `ROUTING_PROVIDER_FALLBACK`, explicitement configuré.

**Politiques d'usage.** Nominatim et OpenTopoData sont limités à 1 requête/seconde : les adapters sérialisent leurs appels (`createThrottle`). Photon et Nominatim reçoivent le `GEOCODING_USER_AGENT` (et `email` pour Nominatim).

**Cache** (mémoire, LRU + TTL, `src/lib/server/cache.ts`) :

| Cache | Clé | TTL | Taille |
| --- | --- | --- | --- |
| Recherche de lieux | provider + requête normalisée + limite + position arrondie (0,1°) | 6 h | 2 000 |
| Géocodage inverse | provider + position arrondie (4 décimales ≈ 10 m) | 6 h | 2 000 |
| Altitude | position arrondie (5 décimales ≈ 1 m) | 7 jours | 50 000 points |

Les itinéraires eux-mêmes ne sont pas mis en cache : ils dépendent de la graine et des préférences, et le réseau routier change.

**Rate limiting** par IP et par bucket (`src/lib/server/rate-limit.ts`) : `geocoding` (autocomplétion, généreux), `generation` (coûteux, strict), `calculate` (éditeur), `import` (langage naturel), `diagnostics`. Un utilisateur qui tape vite dans l'autocomplétion ne bloque pas ses générations ; chaque bucket a son message.

**Logs structurés** (`src/lib/server/logger.ts`) : chaque requête porte un `requestId` (renvoyé dans l'en-tête `x-request-id`) ; les appels aux fournisseurs et les générations journalisent provider, durée, statut, mode et nombre d'appels. Les clés, tokens et paramètres `key=` sont expurgés. Le `LogSink` est une abstraction : brancher Sentry ou un collecteur revient à fournir un autre sink.

**Instrumentation.** Le résultat d'une génération contient `timings` (candidats, routing, altitude, scoring, total), `routingCalls` et `candidatesEvaluated` ; chaque route contient ses propres temps (détails, altitude, scoring).

## Diagnostics, mode démo et debug

- **`/api/health`** : statut, version, configuration résumée (sans secret). **`/api/health?probe=1`** exécute une sonde sur chaque fournisseur configuré (principal et secours) : une petite route, une recherche « Annecy », une altitude, le style de chaque fond de carte ; renvoie latence, statut HTTP, type d'erreur et message simplifié.
- **`/diagnostics`** : écran de développement affichant ces sondes par famille (Routing, Geocoding, Elevation, Maps). Activé en développement, désactivé en production sauf `DIAGNOSTICS_ENABLED=true`.
- **Mode démo** (`NEXT_PUBLIC_DEMO_MODE=true`) : fournisseurs synthétiques et bandeau « Mode démo » permanent ; jamais présenté comme des données réelles.
- **Panneau debug d'un parcours** (développement, ou `NEXT_PUBLIC_DEBUG_ROUTES=true`) sous chaque résultat : provider, stratégie, cap, itérations, score candidat, erreur de distance, rapport qualité, Route DNA, points, D+ brut vs filtré, instructions, temps de routing / altitude / scoring.
- **Instructions turn-by-turn** : lorsque le moteur les fournit (Valhalla, GraphHopper, openrouteservice, OSRM), elles sont normalisées (`RouteInstruction` : distance, durée, type, rue, coordonnées, texte) et stockées avec le parcours pour de futurs exports.
- **Progression réelle** : la génération est diffusée en flux NDJSON (`progress` puis `result` / `error`) ; l'interface affiche les étapes effectives — création des variantes, calcul des itinéraires (avec le nombre de candidats évalués), analyse de l'altitude, sélection — sans faux pourcentage.

## Sécurité et robustesse

- Validation Zod stricte de toutes les entrées API (coordonnées bornées, distances plausibles, champs inconnus refusés).
- Clés API uniquement côté serveur ; rate limiting par IP en mémoire (remplaçable par Redis) ; cache LRU/TTL des géocodages.
- Timeouts sur tous les appels externes ; erreurs converties en codes applicatifs et **messages compréhensibles** (lieu introuvable, point non routable / en pleine mer, aucun parcours, distance irréaliste, service indisponible, délai dépassé, GPX invalide ou trop volumineux). Aucune stack trace n'atteint l'interface.
- GPX importés : taille limitée, DOCTYPE et entités ignorés, coordonnées vérifiées, rien n'est exécuté.
- Annulation des requêtes obsolètes (recherche de lieux, génération, recalcul) et chargements visuels.

## Limitations actuelles

- **Les fournisseurs réels n'ont pas pu être appelés depuis l'environnement de développement de cette version** (réseau sortant bloqué) : les adapters ont été vérifiés contre les typages officiels des clients (`@routingjs/*`, openrouteservice-js) et les documentations, et sont couverts par `npm run test:integration` à lancer dans un environnement connecté avant toute mise en production.
- Les instances publiques (Valhalla FOSSGIS, Photon, Open-Meteo, OpenFreeMap) sont adaptées au développement et à un usage personnel, pas à un trafic important.
- Les surfaces dépendent du moteur : Valhalla les fournit via `/trace_attributes` (appel supplémentaire, parfois partiel), OSRM ne les fournit pas — les scores concernés sont alors neutralisés et signalés.
- Le mode A → B avec distance imposée insère un seul détour ; les demandes très éloignées de la distance directe ne sont satisfaites qu'approximativement.
- Le dénivelé cible influence le coût de routing (`use_hills`) et le scoring, mais n'est pas garanti.
- Favoris, historique et liens de partage reposent sur le navigateur (localStorage / URL) tant qu'il n'y a pas de compte utilisateur.
- L'analyseur en langage naturel est à base de règles (FR/EN) : couverture volontairement limitée.
- Le rate limiting et les caches sont en mémoire (une instance) ; les logs vont sur la sortie standard (sink remplaçable).
- Les exports restent GPX et GeoJSON ; les instructions turn-by-turn sont stockées mais pas encore exportées (FIT / TCX).

## Roadmap

- Compte utilisateur et stockage serveur des parcours (`RouteRepository`), URLs de partage résolues côté serveur.
- Analyseur en langage naturel adossé à un LLM (interface `RouteIntentParser`).
- Export FIT / TCX / KML (registre `EXPORTERS`).
- Calibration de l'estimation de durée selon le niveau de l'utilisateur (profils `ActivityProfile` surchargés).
- Données contextuelles le long du parcours : météo et vent, fontaines, cafés, toilettes, points de vue, ateliers vélo, bornes de recharge, zones dangereuses, routes fermées, travaux, état des sentiers.
- Popularité / heatmap communautaire, qualité du revêtement, analyse de pente et segments raides, scores sécurité / nature / tranquillité / qualité VTT.
- Navigation turn-by-turn, PWA et mode hors ligne, synchronisation Garmin / Strava.
