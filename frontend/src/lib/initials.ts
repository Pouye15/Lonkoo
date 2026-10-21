/** Initiales pour les avatars (« Aminata S. » → « AS »). */
export function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\s-]/gu, "").trim().split(/[\s-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? [parts[0]?.[0], parts[1]?.[0]] : [parts[0]?.[0], parts[0]?.[1]];
  return letters.filter(Boolean).join("").toUpperCase() || "?";
}
