import { Desk } from "@/components/desk/Desk";
import { storageMode } from "@/db";
import { activeSources } from "@/lib/check";
import { collection, findHeld } from "@/lib/collection";
import { coverUrl } from "@/lib/covers";
import { presets } from "@/lib/presets";
import { hasQlooKey } from "@/lib/qloo";
import { SampleQloo } from "@/lib/qloo/sample";
import { recover } from "@/lib/recover";

export default async function Page() {
  // Fixture data for ?state= screens: deterministic sample picks for preset 1 and the held real title. No network.
  const first = presets[0];
  const fixture = first && first.seeds.length ? await recover({ runId: "fixture", seeds: first.seeds }, new SampleQloo(collection.all())) : null;
  const heldPreset = presets.find((p) => p.kind === "real-held");
  const hit = heldPreset ? findHeld({ title: heldPreset.title, author: heldPreset.author }) : null;
  const heldExample = hit ? { item: hit.item, coverUrl: coverUrl(hit.item.isbn13) } : undefined;
  return (
    <main className="flex-1">
      <h1 className="sr-only">Ghost Shelf: check a title, show the patron, find three held books</h1>
      <Desk presets={presets} sources={activeSources()} collectionSize={collection.meta.size} qlooConfigured={hasQlooKey()} storage={storageMode()} demo={process.env.NEXT_PUBLIC_DEMO === "1"} fixtureBooks={fixture?.books ?? []} heldExample={heldExample} />
    </main>
  );
}
