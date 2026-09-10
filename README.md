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
13. [Scoring, Route DNA et explications](#scoring-route-dna-et-explications)
14. [Sécurité et robustesse](#sécurité-et-robustesse)
15. [Limitations actuelles](#limitations-actuelles)
16. [Roadmap](#roadmap)

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
| `ROUTING_PROVIDER` | `valhalla` | Moteur de routing : `valhalla`, `graphhopper`, `openrouteservice`, `osrm`, `mock` (tests) |
| `ROUTING_VALHALLA_URL` | `https://valhalla1.openstreetmap.de` | Instance Valhalla (publique FOSSGIS par défaut, à auto-héberger en production) |
| `GRAPHHOPPER_API_KEY` | – | Clé GraphHopper (https://www.graphhopper.com/) — boucles natives, altitude et surfaces incluses |
| `OPENROUTESERVICE_API_KEY` | – | Clé openrouteservice (https://openrouteservice.org/dev/#/signup) — boucles natives |
| `ROUTING_OSRM_URL` | – | URL d'une instance OSRM auto-hébergée (profils `bike` / `foot`) |
| `ROUTING_TIMEOUT_MS` / `ROUTING_CONCURRENCY` | `20000` / `3` | Délai et parallélisme des appels de routing |
| `GEOCODING_PROVIDER` | `photon` | `photon`, `nominatim` ou `mock` |
| `GEOCODING_USER_AGENT` | `circuit-app/0.1 (…)` | User-Agent exigé par Photon / Nominatim — mettez un contact |
| `ELEVATION_PROVIDER` | `open-meteo` | `open-meteo`, `opentopodata`, `valhalla` (endpoint `/height`) ou `mock` |
| `ELEVATION_SAMPLE_POINTS` | `300` | Points échantillonnés par parcours pour le profil |
| `NEXT_PUBLIC_MAP_PROVIDER` | `openfreemap` | `openfreemap` (sans clé) ou `maptiler` |
| `NEXT_PUBLIC_MAPTILER_KEY` | – | Clé **publique** MapTiler (https://cloud.maptiler.com/account/keys/), à restreindre par domaine : ajoute Outdoor / Topo / Satellite |
| `RATE_LIMIT_PER_MINUTE` | `60` | Limite de requêtes par IP sur les API internes |
| `GPX_MAX_FILE_BYTES` | `10485760` | Taille maximale d'un GPX importé |

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
                    # langage naturel, favoris + import GPX, éditeur — contre un build de production
                    # et les fournisseurs mock (aucun service externe requis).
```

Les tests E2E utilisent le navigateur Playwright ; installez-le une fois avec `npx playwright install chromium` si nécessaire.

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

`src/lib/route-generator/loop.ts` :

1. plusieurs **directions** sont réparties autour du départ (graine aléatoire → « Surprends-moi » ou reproductible) ;
2. pour chaque direction, des points intermédiaires sont placés sur un cercle (triangle ou quadrilatère arrondi) dont le rayon est déduit de la distance cible et d'un facteur de détour empirique ;
3. le moteur de routing calcule l'itinéraire réel (`départ → via… → départ`) et sa **distance réelle** ;
4. le rayon est **ajusté** (mise à jour amortie) pour les candidats hors tolérance, en un ou deux passages ;
5. les boucles hors tolérance (±5 %, élargie progressivement jusqu'à ±10 %) et celles qui repassent trop sur la même route (taux de recouvrement estimé par rasterisation du tracé) sont écartées ;
6. les meilleures sont conservées ; la meilleure garde le coût « équilibré », les suivantes sont recalculées avec les coûts **Rapide** et **Aventure** ;
7. surfaces (si disponibles) et altitudes sont récupérées, puis chaque variante est **notée**.

Une génération représente en général 8 à 15 appels de routing (moins avec un moteur offrant des boucles natives).

## Scoring, Route DNA et explications

`src/lib/scoring/scorers.ts` définit des **scorers indépendants** (respect de la distance, diversité du tracé, dénivelé, compatibilité du revêtement, sécurité estimée, environnement naturel, pistes cyclables, adéquation à l'activité, fluidité) ; chacun renvoie une valeur 0..1 et un poids dépendant du contexte (style, activité, préférences). Le total est une moyenne pondérée sur 100. Ajouter un critère = ajouter un objet `Scorer` à la liste.

Le **Route DNA** et les **explications** dérivent des mêmes statistiques ; ils sont signalés comme estimations lorsque les surfaces ou l'altitude sont partielles.

## Sécurité et robustesse

- Validation Zod stricte de toutes les entrées API (coordonnées bornées, distances plausibles, champs inconnus refusés).
- Clés API uniquement côté serveur ; rate limiting par IP en mémoire (remplaçable par Redis) ; cache LRU/TTL des géocodages.
- Timeouts sur tous les appels externes ; erreurs converties en codes applicatifs et **messages compréhensibles** (lieu introuvable, point non routable / en pleine mer, aucun parcours, distance irréaliste, service indisponible, délai dépassé, GPX invalide ou trop volumineux). Aucune stack trace n'atteint l'interface.
- GPX importés : taille limitée, DOCTYPE et entités ignorés, coordonnées vérifiées, rien n'est exécuté.
- Annulation des requêtes obsolètes (recherche de lieux, génération, recalcul) et chargements visuels.

## Limitations actuelles

- Les instances publiques (Valhalla FOSSGIS, Photon, Open-Meteo, OpenFreeMap) sont adaptées au développement et à un usage personnel, pas à un trafic important.
- Les surfaces dépendent du moteur : Valhalla les fournit via `/trace_attributes` (appel supplémentaire, parfois partiel), OSRM ne les fournit pas — les scores concernés sont alors neutralisés et signalés.
- Le mode A → B avec distance imposée insère un seul détour ; les demandes très éloignées de la distance directe ne sont satisfaites qu'approximativement.
- Le dénivelé cible influence le coût de routing (`use_hills`) et le scoring, mais n'est pas garanti.
- Favoris, historique et liens de partage reposent sur le navigateur (localStorage / URL) tant qu'il n'y a pas de compte utilisateur.
- L'analyseur en langage naturel est à base de règles (FR/EN) : couverture volontairement limitée.
- Le rate limiting et les caches sont en mémoire (une instance).

## Roadmap

- Compte utilisateur et stockage serveur des parcours (`RouteRepository`), URLs de partage résolues côté serveur.
- Analyseur en langage naturel adossé à un LLM (interface `RouteIntentParser`).
- Export FIT / TCX / KML (registre `EXPORTERS`).
- Calibration de l'estimation de durée selon le niveau de l'utilisateur (profils `ActivityProfile` surchargés).
- Données contextuelles le long du parcours : météo et vent, fontaines, cafés, toilettes, points de vue, ateliers vélo, bornes de recharge, zones dangereuses, routes fermées, travaux, état des sentiers.
- Popularité / heatmap communautaire, qualité du revêtement, analyse de pente et segments raides, scores sécurité / nature / tranquillité / qualité VTT.
- Navigation turn-by-turn, PWA et mode hors ligne, synchronisation Garmin / Strava.
