import Link from "next/link";
import { Mark } from "./Mark";
import { RegistryCount } from "./RegistryCount";

export function TopBar() {
  return (
    <header className="no-print h-14 border-b border-line flex items-center justify-between px-4 sm:px-8 lg:px-20">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/" className="flex items-center gap-3 no-underline text-ink whitespace-nowrap">
          <Mark size={28} />
          <span className="font-display font-bold text-[20px] tracking-[-0.02em]">Ghost Shelf</span>
        </Link>
        <span className="hidden md:inline text-[15px] text-ink-muted ml-2 whitespace-nowrap">For the reference desk</span>
      </div>
      <nav className="flex items-center gap-4 sm:gap-7 text-[15px] whitespace-nowrap" aria-label="Pages">
        <Link href="/invented" className="text-ink no-underline tnum">
          <span className="hidden sm:inline">Invented titles</span>
          <span className="sm:hidden">Invented</span> · <RegistryCount />
        </Link>
        <Link href="/lists" className="text-ink-muted no-underline hidden sm:inline">Reading lists</Link>
        <Link href="/about" className="text-ink-muted no-underline">About</Link>
      </nav>
    </header>
  );
}
