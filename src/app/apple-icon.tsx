import { ImageResponse } from "next/og";
import { CircuitMark } from "@/components/layout/CircuitMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon. */
export default function AppleIcon() {
  return new ImageResponse(<CircuitMark size={180} radius={0} />, size);
}
