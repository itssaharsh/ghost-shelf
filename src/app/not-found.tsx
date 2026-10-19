import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 px-4 sm:px-8 lg:px-20 py-12 flex flex-col gap-3 max-w-[60ch]">
      <h1 className="m-0 font-display font-bold text-[24px]">No such page on the desk.</h1>
      <p className="m-0 text-[17px] text-ink-muted">The desk is at the front door, the invented titles have their own page, and the rest is in About.</p>
      <p className="m-0 text-[17px]">
        <Link href="/" className="text-accent underline underline-offset-2">
          Back to the desk
        </Link>
      </p>
    </main>
  );
}
