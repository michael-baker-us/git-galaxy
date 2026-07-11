import type { GalaxySnapshot } from "@git-galaxy/shared";

export async function fetchGalaxy(): Promise<GalaxySnapshot> {
  const res = await fetch("/api/galaxy");
  if (!res.ok) throw new Error(`galaxy fetch failed: ${res.status}`);
  return (await res.json()) as GalaxySnapshot;
}
