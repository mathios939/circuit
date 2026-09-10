import { ImageResponse } from "next/og";
import { CircuitMark } from "@/components/layout/CircuitMark";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** App icon (favicon + PWA), generated at build time from the brand mark. */
export default function Icon() {
  return new ImageResponse(<CircuitMark size={512} />, size);
}
