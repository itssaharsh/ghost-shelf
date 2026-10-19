import { ListsDesk } from "@/components/lists/ListsDesk";
import { hasQlooKey } from "@/lib/qloo";

export const metadata = { title: "Reading lists · Ghost Shelf" };

export default function ListsPage() {
  return (
    <main className="flex-1 px-4 sm:px-8 lg:px-20 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-2 max-w-[70ch]">
        <h1 className="m-0 font-display font-bold text-[28px] tracking-[-0.01em]">Reading-list requests</h1>
        <p className="m-0 text-[17px] text-ink-muted">The second desk: a patron&rsquo;s form becomes five to ten held books with reasons, you approve it, and a draft reply appears. Nothing is sent from this demo.</p>
      </header>
      <ListsDesk qlooConfigured={hasQlooKey()} />
    </main>
  );
}
