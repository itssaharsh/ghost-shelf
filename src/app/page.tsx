import { Desk } from "@/components/desk/Desk";
import { activeSources } from "@/lib/check";
import { collection } from "@/lib/collection";
import { presets } from "@/lib/presets";
import { hasQlooKey } from "@/lib/qloo";

export default function Page() {
  return (
    <main className="flex-1">
      <h1 className="sr-only">Ghost Shelf: check a title, show the patron, find three held books</h1>
      <Desk presets={presets} sources={activeSources()} collectionSize={collection.meta.size} qlooConfigured={hasQlooKey()} demo={process.env.NEXT_PUBLIC_DEMO === "1"} />
    </main>
  );
}
