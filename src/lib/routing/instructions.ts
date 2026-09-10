import type { LatLng, RouteInstruction, RouteInstructionType } from "@/lib/types";

/**
 * Normalisation of engine-specific manoeuvre codes into RouteInstructionType.
 * Every adapter converts its own format here so that nothing downstream
 * depends on a provider's vocabulary.
 */

/** Valhalla maneuver `type` codes (see valhalla/docs/api/turn-by-turn). */
export function valhallaManeuverType(code: number | undefined): RouteInstructionType {
  switch (code) {
    case 1:
    case 2:
    case 3:
      return "depart";
    case 4:
    case 5:
    case 6:
      return "arrive";
    case 7:
    case 8:
      return "continue";
    case 9:
      return "turn_slight_right";
    case 10:
      return "turn_right";
    case 11:
      return "turn_sharp_right";
    case 12:
    case 13:
      return "u_turn";
    case 14:
      return "turn_sharp_left";
    case 15:
      return "turn_left";
    case 16:
      return "turn_slight_left";
    case 17:
    case 18:
    case 19:
    case 20:
    case 21:
    case 22:
    case 23:
    case 24:
    case 25:
      return "keep_right";
    case 26:
    case 27:
      return "roundabout";
    case 28:
    case 29:
      return "ferry";
    case 35:
    case 36:
      return "keep_left";
    default:
      return "other";
  }
}

/** GraphHopper instruction `sign` values. */
export function graphhopperSignType(sign: number | undefined): RouteInstructionType {
  switch (sign) {
    case -98:
    case -8:
      return "u_turn";
    case -7:
      return "keep_left";
    case -3:
      return "turn_sharp_left";
    case -2:
      return "turn_left";
    case -1:
      return "turn_slight_left";
    case 0:
      return "continue";
    case 1:
      return "turn_slight_right";
    case 2:
      return "turn_right";
    case 3:
      return "turn_sharp_right";
    case 4:
      return "arrive";
    case 5:
      return "waypoint";
    case 6:
      return "roundabout";
    case 7:
      return "keep_right";
    case 8:
      return "u_turn";
    default:
      return "other";
  }
}

/** openrouteservice step `type` values. */
export function orsStepType(type: number | undefined): RouteInstructionType {
  switch (type) {
    case 0:
      return "turn_left";
    case 1:
      return "turn_right";
    case 2:
      return "turn_sharp_left";
    case 3:
      return "turn_sharp_right";
    case 4:
      return "turn_slight_left";
    case 5:
      return "turn_slight_right";
    case 6:
      return "continue";
    case 7:
      return "roundabout";
    case 8:
      return "roundabout";
    case 9:
      return "u_turn";
    case 10:
      return "arrive";
    case 11:
      return "depart";
    case 12:
      return "keep_left";
    case 13:
      return "keep_right";
    default:
      return "other";
  }
}

/** OSRM step maneuver `type` + `modifier`. */
export function osrmManeuverType(type: string | undefined, modifier: string | undefined): RouteInstructionType {
  if (type === "depart") return "depart";
  if (type === "arrive") return "arrive";
  if (type === "roundabout" || type === "rotary" || type === "roundabout turn" || type === "exit roundabout") return "roundabout";
  if (modifier === "uturn") return "u_turn";
  if (type === "fork" || type === "off ramp" || type === "on ramp") return modifier?.includes("left") ? "keep_left" : "keep_right";
  switch (modifier) {
    case "left":
      return "turn_left";
    case "slight left":
      return "turn_slight_left";
    case "sharp left":
      return "turn_sharp_left";
    case "right":
      return "turn_right";
    case "slight right":
      return "turn_slight_right";
    case "sharp right":
      return "turn_sharp_right";
    case "straight":
      return "continue";
    default:
      return type === "continue" || type === "new name" ? "continue" : "other";
  }
}

export interface InstructionInput {
  distanceM: number;
  durationS?: number;
  type: RouteInstructionType;
  streetName?: string;
  pointIndex: number;
  text?: string;
}

/** Attaches coordinates to normalised instructions, dropping invalid indices. */
export function buildInstructions(coordinates: readonly LatLng[], inputs: readonly InstructionInput[]): RouteInstruction[] {
  const out: RouteInstruction[] = [];
  for (const i of inputs) {
    const p = coordinates[Math.min(Math.max(0, i.pointIndex), coordinates.length - 1)];
    if (!p) continue;
    out.push({
      distanceM: Math.max(0, Math.round(i.distanceM)),
      durationS: i.durationS !== undefined ? Math.max(0, Math.round(i.durationS)) : undefined,
      type: i.type,
      streetName: i.streetName || undefined,
      coordinates: { lat: p.lat, lng: p.lng },
      pointIndex: i.pointIndex,
      text: i.text || undefined,
    });
  }
  return out;
}

/** Number of real turns (excludes depart / arrive / continue / waypoint). */
export function countTurns(instructions: readonly RouteInstruction[]): number {
  return instructions.filter((i) => !["depart", "arrive", "continue", "waypoint", "other"].includes(i.type)).length;
}
