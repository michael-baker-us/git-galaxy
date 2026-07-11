import type { UniverseSnapshot } from "@git-galaxy/shared";

export async function fetchUniverse(): Promise<UniverseSnapshot> {
  const res = await fetch("/api/universe");
  if (!res.ok) throw new Error(`universe fetch failed: ${res.status}`);
  return (await res.json()) as UniverseSnapshot;
}
