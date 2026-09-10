import type { ActivityType, RouteMode, RoutePreferences } from "@/lib/types";

/**
 * Structured intent extracted from a natural-language request.
 * Every field is optional: the UI merges what was understood into the form.
 */
export interface RouteIntent {
  activity?: ActivityType;
  mode?: RouteMode;
  startQuery?: string;
  endQuery?: string;
  distanceKm?: number;
  elevationTargetM?: number;
  elevationMaxM?: number;
  durationMinutes?: number;
  preferences?: RoutePreferences;
  /** Parts of the sentence that were understood, for feedback. */
  matched: string[];
}

/** Abstraction so that an LLM-backed parser can replace the rule-based one. */
export interface RouteIntentParser {
  readonly id: string;
  parse(text: string): Promise<RouteIntent>;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const ACTIVITY_PATTERNS: [ActivityType, RegExp][] = [
  ["trail_running", /\btrail(s)?\b|\btrail[- ]?running\b/],
  ["mtb", /\bvtt\b|\bmtb\b|\bmountain[- ]?bike\b/],
  ["gravel", /\bgravel\b/],
  ["road_cycling", /\bvelo de route\b|\bvelo\b|\broad ?bike\b|\bcyclisme\b|\bcyclo\b|\bbike\b|\bcycling\b|\ba velo\b/],
  ["hiking", /\brando(nnee)?\b|\bhik(e|ing)\b|\btrek\b/],
  ["running", /\bcourse a pied\b|\bcourir\b|\brunning\b|\bfooting\b|\bjogging\b|\brun\b|\bcourse\b/],
  ["walking", /\bmarche\b|\bmarcher\b|\bbalade\b|\bpromenade\b|\bwalk(ing)?\b/],
];

const DISTANCE_RE = /(\d+(?:[.,]\d+)?)\s*(?:km|kms|kilometres?|kilometers?)\b/;
const ELEVATION_RE = /(?:(\d{2,5})\s*(?:m|metres?|meters?)\s*(?:de\s*)?(?:d\+|d\s*\+|denivele(?:\s*positif)?|deniv|elevation|climbing|of climbing|de montee)|(?:d\+|denivele(?:\s*positif)?|deniv)\s*(?:de\s*|d'environ\s*|:)?\s*(?:environ\s*)?(\d{2,5})\s*(?:m|metres?)?)/;
const MAX_ELEVATION_RE = /(?:max(?:imum)?|moins de|pas plus de|sans depasser|under|less than)\s*(?:de\s*)?(\d{2,5})\s*(?:m|metres?)\s*(?:de\s*)?(?:d\+|denivele|deniv|elevation)?/;
const DURATION_RE = /(\d+(?:[.,]\d+)?)\s*(?:h|heures?|hours?)(?:\s*(\d{1,2}))?\b|(\d{2,3})\s*(?:min|minutes?)\b/;
const PLACE = "([a-z][a-z0-9' -]*?)";
const STOP = "(?=\\s+(?:avec|vers|jusqu|en |et |sans|pour|d'environ|de \\d|with|and|to |without|around|near|\\d|,|\\.|$)|,|\\.|$)";
/** "de X vers Y": the last "de" before the destination marker introduces the start. */
const FROM_TO_RE = /(?:^|.*\s)de ([a-z][a-z' -]*?) (?:vers|jusqu'a|jusqu a|a destination de|en direction de) /;
const START_RE = new RegExp(
  `(?:(?:au )?depart (?:de |d')|depart |a partir (?:de |d')|depuis |from |autour (?:de |d')|around |pres (?:de |d')|starting (?:in|at|from) |a )${PLACE}${STOP}`,
);
const END_RE = new RegExp(
  `(?:jusqu'a |jusqu a |vers |to |a destination (?:de |d')|en direction (?:de |d')|arrivee (?:a |en )|arrivee )${PLACE}${STOP}`,
);

/**
 * Rule-based French/English parser. It is deterministic and fast; it does
 * not try to be exhaustive — an LLM-backed parser can be plugged behind the
 * same interface for richer understanding.
 */
export class RuleBasedIntentParser implements RouteIntentParser {
  readonly id = "rules";

  async parse(text: string): Promise<RouteIntent> {
    return parseRouteIntent(text);
  }
}

export function parseRouteIntent(rawText: string): RouteIntent {
  const text = fold(rawText).replace(/\s+/g, " ").trim();
  const intent: RouteIntent = { matched: [] };
  const prefs: RoutePreferences = {};

  for (const [activity, re] of ACTIVITY_PATTERNS) {
    if (re.test(text)) {
      intent.activity = activity;
      intent.matched.push("activité");
      break;
    }
  }

  const distance = DISTANCE_RE.exec(text);
  if (distance) {
    intent.distanceKm = Number(distance[1]!.replace(",", "."));
    intent.matched.push("distance");
  }

  const maxEle = MAX_ELEVATION_RE.exec(text);
  if (maxEle) {
    intent.elevationMaxM = Number(maxEle[1]);
    intent.matched.push("D+ max");
  }
  const ele = ELEVATION_RE.exec(text.replace(MAX_ELEVATION_RE, ""));
  if (ele) {
    intent.elevationTargetM = Number(ele[1] ?? ele[2]);
    intent.matched.push("dénivelé");
  }

  const duration = DURATION_RE.exec(text);
  if (duration && !intent.distanceKm) {
    if (duration[1]) {
      const hours = Number(duration[1].replace(",", "."));
      const minutes = duration[2] ? Number(duration[2]) : 0;
      intent.durationMinutes = Math.round(hours * 60 + minutes);
    } else if (duration[3]) {
      intent.durationMinutes = Number(duration[3]);
    }
    if (intent.durationMinutes) intent.matched.push("durée");
  }

  if (/\bboucle\b|\bloop\b|\bcircuit\b|\bround ?trip\b|\baller[- ]retour\b/.test(text)) {
    intent.mode = "loop";
    intent.matched.push("boucle");
  }

  const end = END_RE.exec(text);
  if (end?.[1]) {
    intent.endQuery = cleanPlace(end[1]);
    intent.mode = "point_to_point";
    intent.matched.push("arrivée");
  }
  const start = FROM_TO_RE.exec(text) ?? START_RE.exec(text);
  if (start?.[1]) {
    const place = cleanPlace(start[1]);
    if (place && place !== intent.endQuery) {
      intent.startQuery = place;
      intent.matched.push("départ");
    }
  }
  if (!intent.mode && intent.startQuery && !intent.endQuery) intent.mode = "loop";

  if (/gros(ses)? routes?|grands? axes?|grosses? routes?|routes? (tres )?frequentee?s?|trafic|busy roads?|main roads?|nationales?|departementales?/.test(text)) {
    prefs.avoidBusyRoads = true;
    intent.matched.push("éviter les grands axes");
  }
  if (/\bcalme\b|\btranquille\b|\bquiet\b|\bpetites routes\b/.test(text)) {
    prefs.preferQuietRoads = true;
    intent.matched.push("calme");
  }
  if (/\bnature\b|\bforet\b|\bforest\b|\bbois\b|\bscenic\b|\bpanoram/.test(text)) {
    prefs.preferNature = true;
    if (/\bscenic\b|\bpanoram/.test(text)) prefs.scenic = true;
    intent.matched.push("nature");
  }
  if (/pistes? cyclables?|voies? vertes?|cycleways?|bike ?paths?/.test(text)) {
    prefs.preferCycleways = true;
    intent.matched.push("pistes cyclables");
  }
  if (/\bsentiers?\b|\bsingles?\b|\bsingletracks?\b|\bchemins?\b|\btrails?\b/.test(text) && intent.activity !== "trail_running") {
    prefs.preferTrails = true;
    intent.matched.push("chemins");
  }
  if (/\bplat\b|\bflat\b|sans denivele|peu de denivele|minimiser le denivele/.test(text)) {
    prefs.elevationMode = "minimize";
    intent.matched.push("plat");
  } else if (/\bvallonne\b|\bhilly\b|beaucoup de denivele|maximiser le denivele|\bmontagne\b|\bcols?\b/.test(text)) {
    prefs.elevationMode = "maximize";
    intent.matched.push("vallonné");
  }
  if (/\bgoudron\b|\basphalte\b|\bpaved\b|\broute uniquement\b/.test(text)) prefs.surface = "paved";
  if (/\bsans ferry\b|\bpas de ferry\b|\bno ferr(y|ies)\b/.test(text)) prefs.avoidFerries = true;

  if (Object.keys(prefs).length > 0) intent.preferences = prefs;
  return intent;
}

function cleanPlace(raw: string): string {
  return raw
    .replace(/\b(avec|environ|d'environ|de|des|du|en|et|sans|pour)\s*$/g, "")
    .trim()
    .split(" ")
    .map((w) => (w.length > 2 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

let parser: RouteIntentParser | undefined;

/** Returns the configured parser (rule-based by default). */
export function getIntentParser(): RouteIntentParser {
  parser ??= new RuleBasedIntentParser();
  return parser;
}
