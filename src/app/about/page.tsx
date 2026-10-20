import Link from "next/link";
import { coverCount } from "@/lib/covers";
import { collection } from "@/lib/collection";

export const metadata = { title: "About · Ghost Shelf", description: "A desk tool for book titles a chatbot made up." };

const REPO = "https://github.com/itssaharsh/ghost-shelf";

const LIVE_VS_SIMULATED: [string, string][] = [
  ["The three checks", "Live. The demo collection is a real table; Open Library and the Internet Archive (or Google Books with a key) are queried at check time, with the source's own link and the elapsed time on each drawer."],
  ["The patron card", "Live, from the checks. It never says a book does not exist: it says in how many sources there is no record, and keeps the caveat."],
  ["Recovery (the three held books)", "Live through Qloo's Search and Insights calls, filtered to the collection's own Qloo entity ids, with explainability giving each reason. Only when Qloo does not answer (or no key is set) does the shelf fall back to sample mode: a deterministic pick from the collection, labelled on screen, not ranked by taste."],
  ["Covers", "Live from Open Library by cover id, resolved once for the collection and served through this site; never fetched by ISBN at request time."],
  ["Reserve", "Simulated: holds go to this demo's own holds table, labelled 'demo holds list', not to a library system."],
  ["The registry of invented titles", "This demo's own table. It ships with the ten titles printed in the newspaper insert, marked example; what you log joins them."],
  ["Reading lists", "Live recovery, five to ten held titles; the reply is a draft shown on screen and never sent."],
  ["The collection", "Real: about 3,000 of the most-borrowed 2025 titles at Seattle Public Library, from the city's public-domain checkout dataset."],
];

export default function AboutPage() {
  return (
    <main className="flex-1 px-4 sm:px-8 lg:px-20 py-10 flex flex-col gap-10 max-w-[80ch]">
      <section className="flex flex-col gap-4">
        <h1 className="m-0 font-display font-bold text-[32px] leading-[1.15] tracking-[-0.01em]">A desk tool for book titles a chatbot made up.</h1>
        <p className="m-0 text-[20px] leading-[1.45]">
          Ghost Shelf checks the title against the catalog, Open Library and a third public source, shows the patron what it found, then uses Qloo, a taste database, to turn what they named (a film, a band, an author) into three books the library holds.
        </p>
        <ul className="m-0 pl-5 text-[17px] leading-[1.5] flex flex-col gap-1.5">
          <li>Three checks with receipts on every claimed title, each with its source link and time.</li>
          <li>Recovery from a film or a band, not only from an author: Qloo&rsquo;s cross-category matching, limited to about {collection.meta.size.toLocaleString("en-US")} held titles.</li>
          <li>Every invented title you log joins a registry other desks can read; it ships with the ten printed in a newspaper in May 2025.</li>
        </ul>
        <p className="m-0 flex flex-wrap gap-x-5 gap-y-2 text-[17px]">
          <Link href="/" className="text-accent underline underline-offset-2">Try it on the desk</Link>
          <a href={REPO} className="text-accent underline underline-offset-2">The repository</a>
          <a href={`${REPO}#readme`} className="text-accent underline underline-offset-2">The write-up</a>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-display font-bold text-[20px]">How it works</h2>
        <ol className="m-0 pl-5 text-[17px] leading-[1.5] flex flex-col gap-1.5">
          <li>Type the title the patron asked for.</li>
          <li>Read the card: no record in 3 sources, or found and where.</li>
          <li>Add what they liked and reserve the books on the three books that fit.</li>
        </ol>
        <p className="m-0 text-[17px] leading-[1.5] text-ink-muted">
          The desk runs as a small agent: it checks three sources, decides the branch, asks Qloo for held books that fit what the patron named, and reserves and logs on the librarian&rsquo;s say-so. The run log under the card lists each step with its second.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-display font-bold text-[20px]">What is live and what is simulated</h2>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label="Table, scrolls sideways on narrow screens">
          <table className="w-full border-collapse text-[15px] min-w-[560px]">
            <tbody>
              {LIVE_VS_SIMULATED.map(([part, note]) => (
                <tr key={part} className="border-b border-line align-top">
                  <th scope="row" className="text-left font-display font-bold py-2.5 pr-4 w-[30%]">{part}</th>
                  <td className="py-2.5">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-display font-bold text-[20px]">Limits</h2>
        <p className="m-0 text-[17px] leading-[1.5]">
          Recent and small-press titles may be missing from the sources checked, so the card never says a book does not exist. The catalog is a demo collection built from Seattle Public Library&rsquo;s public-domain checkout data; holds go to a demo holds list, not a live library system. No chatbot is run on this site: the ten example titles come from a documented newspaper insert, and the comparison with a chatbot is left to the reader.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-display font-bold text-[20px]">Sources</h2>
        <ul className="m-0 pl-5 text-[15px] leading-[1.5] flex flex-col gap-1.5">
          <li>
            The ten invented titles: CBS News Chicago on the Chicago Sun-Times summer reading insert of 18 May 2025,{" "}
            <a href="https://www.cbsnews.com/chicago/news/summer-reading-ai-generated-titles-chicago-sun-times" className="text-accent underline underline-offset-2">cbsnews.com</a>. The presets name the real authors the insert attributed them to.
          </li>
          <li>
            The demo collection: Seattle Public Library, Checkouts by Title (public domain), <a href="https://data.seattle.gov/Community/Checkouts-by-Title/tmmm-ytt6" className="text-accent underline underline-offset-2">data.seattle.gov</a>. The {collection.meta.size.toLocaleString("en-US")} most-borrowed book titles with ISBNs, January to September 2025.
          </li>
          <li>
            Open Library search and covers (<a href="https://openlibrary.org/developers/api" className="text-accent underline underline-offset-2">developers/api</a>); cover ids known for {coverCount.toLocaleString("en-US")} of the held titles.
          </li>
          <li>
            Internet Archive advanced search (<a href="https://archive.org/advancedsearch.php" className="text-accent underline underline-offset-2">archive.org</a>), the keyless third source; Google Books takes its place when a key is set.
          </li>
          <li>
            Qloo Insights API, hackathon edition (<a href="https://docs.qloo.com/" className="text-accent underline underline-offset-2">docs.qloo.com</a>): Search to resolve what the patron named, Insights for books with the collection as the results filter and explainability on.
          </li>
        </ul>
        <p className="m-0 text-[15px] text-ink-muted">Built for the Qloo Agentic Hackathon, October 2026. Planning (idea research, UI spec) came before the first commit on 19 October 2026; all code was written inside the hackathon window.</p>
      </section>
    </main>
  );
}
