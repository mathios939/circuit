# Circuit

**Choisissez la distance. Circuit trouve la route.**

Circuit génère des boucles et des itinéraires A → B pour le vélo de route, le gravel, le VTT, la course à pied, le trail, la randonnée et la marche. Vous donnez un départ, une distance et une activité ; le moteur explore plusieurs directions sur le réseau réel (OpenStreetMap), écarte les boucles médiocres et vous propose jusqu'à **trois parcours réellement différents**, avec distance, dénivelé, durée estimée, profil, Score Circuit, Route DNA, édition sur la carte et export **GPX**.

> « Je veux une boucle VTT de 35 km au départ d'Annecy avec environ 800 m de D+. »

Les parcours sont **indicatifs** : ils sont calculés automatiquement à partir de données OpenStreetMap parfois incomplètes (surtout pour les chemins et sentiers). Vérifiez les conditions locales avant de partir — voir la page `/about`.

---

## Démarrer

Prérequis : **Node.js ≥ 20.9** et npm. Aucune clé n'est nécessaire pour commencer.

```bash
git clone https://github.com/mathios939/circuit.git
cd circuit
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Flux principal : **activité → départ → distance → « Générer mes parcours » → choisir A / B / C → Télécharger GPX**. Les options avancées (tolérance, D+ souhaité / maximal, surface, préférences) et la saisie en langage naturel restent disponibles sans encombrer l'écran.

Pour développer sans réseau, les moteurs synthétiques (réservés aux tests, refusés en production) :

```bash
ROUTING_PROVIDER=mock GEOCODING_PROVIDER=mock ELEVATION_PROVIDER=mock npm run dev
```

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` / `build` / `start` | Développement, build de production, serveur de production |
| `npm run typecheck` · `lint` · `test` | TypeScript strict, ESLint, tests unitaires Vitest (157 tests) |
| `npm run test:e2e` | Playwright contre un build de production et les fournisseurs mock, sur desktop, Android, iPhone et tablette (aucun service externe) |
| `npm run check` / `check:all` | typecheck + lint + test (+ build + e2e) |
| `npm run test:integration` | Tests d'intégration **optionnels** contre les vrais services (se sautent sans réseau ou sans clé) |
| `npm run campaign` | Campagne de validation réelle (Annecy vélo 50 km, Paris course 10 km, Fontainebleau VTT 35 km, Lyon gravel 70 km, Chamonix trail 20 km, La Rochelle 40 km, Bordeaux 60 km, Paris → Versailles, 10 / 25 / 100 km) avec rapport `reports/campaign.md` |

Intégration continue : `.github/workflows/ci.yml` (install → typecheck → lint → tests unitaires → build → E2E) sur chaque push et pull request ; `.github/workflows/integration.yml` (services réels, campagne optionnelle) en manuel ou hebdomadaire, jamais sur push.

## Configuration

Toutes les variables sont documentées dans [`.env.example`](.env.example), séparées en **serveur** (clés privées, jamais envoyées au navigateur) et **client** (`NEXT_PUBLIC_*`, intégrées au bundle : aucun secret). La configuration est validée au démarrage (Zod) : une valeur invalide ou une clé manquante bloque avec un message explicite, visible aussi sur `/api/health`.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `ROUTING_PROVIDER_PRIMARY` | `valhalla` | `valhalla`, `graphhopper`, `openrouteservice`, `osrm` ou `mock` (tests) |
| `ROUTING_PROVIDER_FALLBACK` | – | Moteur de secours, utilisé seulement si le principal est indisponible |
| `ROUTING_VALHALLA_URL` | instance FOSSGIS | À remplacer par votre instance en production |
| `GRAPHHOPPER_API_KEY` / `OPENROUTESERVICE_API_KEY` / `ROUTING_OSRM_URL` | – | Requis pour le fournisseur correspondant |
| `ROUTE_CANDIDATE_COUNT` / `ROUTE_MAX_ITERATIONS` / `ROUTE_MAX_ROUTING_CALLS` | `12` / `2` / `40` | Budget d'API d'une génération (15 à 30 appels avec les défauts) |
| `GEOCODING_PROVIDER` | `photon` | `photon` ou `nominatim` (secours automatique vers l'autre) |
| `GEOCODING_USER_AGENT` | générique | **À personnaliser** : Photon et Nominatim demandent un contact |
| `ELEVATION_PROVIDER` / `ELEVATION_PROVIDER_FALLBACK` | `open-meteo` / `valhalla` | Dernier recours : parcours sans altitude, signalé |
| `RATE_LIMIT_PER_MINUTE` | `60` | Base des limites par IP et par bucket (geocoding, generation, calculate, import, diagnostics) |
| `DIAGNOSTICS_ENABLED` | dev : `true`, prod : `false` | Écran `/diagnostics` et sondes `/api/health?probe=1` |
| `NEXT_PUBLIC_MAP_PROVIDER` / `NEXT_PUBLIC_MAPTILER_KEY` | `openfreemap` / – | Fond de carte ; clé MapTiler publique à restreindre par domaine |
| `NEXT_PUBLIC_DEMO_MODE` | `false` | Fournisseurs synthétiques + bandeau « Mode démo » |

### Production

- **Les instances publiques (Valhalla FOSSGIS, Photon, Nominatim, Open-Meteo, OpenFreeMap) ne sont pas une infrastructure de production.** Elles conviennent au développement et à un usage personnel. Pour un service ouvert, auto-hébergez Valhalla ou prenez une clé GraphHopper / openrouteservice, et configurez un fournisseur de tuiles.
- `NODE_ENV=production` refuse les fournisseurs `mock` (sauf `ALLOW_MOCK_PROVIDERS=true`, réservé aux tests E2E) et émet un **avertissement** (logs et `/api/health` → `configuration.warnings`) pour : URL locale, `DIAGNOSTICS_ENABLED=true`, instance FOSSGIS par défaut, `GEOCODING_USER_AGENT` non personnalisé.
- Le rate limiting et les caches sont en mémoire (une instance). Pour plusieurs instances, remplacez-les par un store partagé (`src/lib/server/rate-limit.ts`, `cache.ts`).
- Les logs sont structurés (JSON en production), avec `requestId` et secrets expurgés ; le `LogSink` est remplaçable.

## Architecture

**Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · MapLibre GL JS · Zustand · Zod · Vitest · Playwright.**

```
src/
├── app/                # pages (/, /about, /route/[id], /diagnostics), API, manifest et icônes PWA
├── components/         # UI : builder/ results/ editor/ map/ library/ share/ layout/ ui/
├── store/              # état client (Zustand)
└── lib/                # logique métier, sans React
    ├── activities/     # profils par sport (vitesses, affinités, bornes, noms des variantes)
    ├── routing/  geocoding/  elevation/  map/   # interfaces + fournisseurs (+ fallback, cache, throttle)
    ├── route-generator/                        # config.ts (constantes métier), candidats, boucles, A→B, quality gate, similarité, ajustements
    ├── scoring/        # scorers, Score Circuit + sous-scores, Route DNA, explications
    ├── stats/          # D+/D− filtrés, durée, difficulté, surfaces
    ├── gpx/  export/  share/  nl/  editor/  storage/  validation/
    └── server/         # env (Zod), http (timeouts), cache, rate-limit, logger, diagnostics
```

Chaque service externe est derrière une interface (`RoutingProvider`, `GeocodingProvider`, `ElevationProvider`, fonds de carte) sélectionnée par l'environnement ; le générateur ne dépend que de ces interfaces.

### Moteur de génération

1. **Candidats** — 12 silhouettes réparties autour du départ (5 stratégies : triangle, quadrilatère, boucle asymétrique, boucle directionnelle, boucle large), graine reproductible.
2. **Routing réel** — chaque silhouette est calculée par le moteur ; seule la distance renvoyée compte.
3. **Convergence** — mise à jour amortie de l'échelle des candidats les plus prometteurs, dans un budget d'appels.
4. **Quality gate** (`RouteQualityReport`) — géométrie, précision de distance, aller-retour, recouvrement, demi-tours, repliement, compatibilité avec l'activité, espacement des points de passage → `qualityScore`, `rejected`, `reasons`.
5. **Distance honnête** — tolérance ±5 %, élargie une fois à ±10 % ; au-delà, la meilleure boucle est proposée avec un avertissement explicite (« Nous n'avons pas trouvé de parcours de 50 km suffisamment qualitatif. Meilleure proposition : 55,8 km ») ou la génération échoue.
6. **Variantes distinctes** — la meilleure boucle garde le coût « Équilibrée » ; les autres sont recalculées avec les coûts « Rapide » et « Aventure » (ou « Accessible / Équilibré / Sportif » pour trail, randonnée, VTT, marche). Deux propositions partageant ≥ 85 % de leur tracé ne sont jamais montrées ensemble.

Toutes les constantes métier vivent dans `src/lib/route-generator/config.ts`.

### Dénivelé et durée

Altitudes échantillonnées puis **filtrées** (médiane 5, moyenne 3) et cumulées avec une **hystérésis de 4 m** : `100, 101, 100.8, 101.2, 105, 110` donne 10 m de D+, pas la somme des oscillations. La durée est estimée par activité (vitesse à plat, coût de la montée, facteur de surface) et affichée arrondie (« ≈ 2 h 15 »).

### Score Circuit et Route DNA

Le score (0–100) est une moyenne pondérée de scorers indépendants ; cinq sous-scores (Distance, Nature, Tranquillité, Difficulté, Variété) et le Route DNA (Nature, Calme, Technique pour les activités hors route, Difficulté, Variété, Panorama) sont présentés comme des **estimations** dérivées des attributs OpenStreetMap.

## Sécurité

- Validation Zod stricte de toutes les entrées API ; tailles de corps limitées ; réponses d'erreur sans stack trace, avec message et conseil compréhensibles.
- Clés API côté serveur uniquement ; secrets expurgés des logs ; `/api/health` n'expose aucune clé.
- GPX importé : taille limitée, DOCTYPE et entités XML non traités (pas de XXE), coordonnées vérifiées.
- Rate limiting par IP et par bucket ; timeouts sur chaque appel externe ; URLs des fournisseurs validées (aucune URL fournie par l'utilisateur n'est appelée).
- En-têtes : `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cache-Control: no-store` sur l'API, pas de `X-Powered-By`.
- `/diagnostics` et le panneau debug sont désactivés en production par défaut.

## Validation réelle

Les fournisseurs réels **n'ont pas pu être appelés depuis l'environnement où cette version a été développée** (réseau sortant bloqué). Leurs adapters ont été vérifiés contre les documentations et typages officiels, et sont couverts par `npm run test:integration` et `npm run campaign`, à exécuter dans un environnement connecté avant toute mise en production. Ne considérez pas un service comme validé tant que ces commandes n'ont pas été lancées.

## Limitations

- Mode A → B avec distance imposée : un seul détour est inséré ; les grands écarts ne sont satisfaits qu'approximativement.
- Le D+ cible influence le coût de routing et le scoring, mais n'est pas garanti.
- Favoris, historique et liens de partage reposent sur le navigateur (pas de compte).
- Analyseur en langage naturel à base de règles (FR / EN), couverture volontairement limitée.
- OSRM ne fournit pas les surfaces : les scores concernés sont neutralisés et signalés.
- PWA installable, sans mode hors ligne (le routing exige le réseau).

## Licence des données

Données cartographiques © les contributeurs OpenStreetMap, licence ODbL.
