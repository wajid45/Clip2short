import "server-only";
import { cookies } from "next/headers";
import type { ThemeChoice } from "@/components/theme-toggle";

export async function getThemeChoice(): Promise<ThemeChoice> {
  const v = (await cookies()).get("sl_theme")?.value;
  return v === "light" || v === "dark" ? v : "system";
}
