import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";

interface MetricsSummary {
  totalLocations: number;
  reportsLast30Days: number;
  successShareLast30Days: number;
  lastUpdated: string;
}

/**
 * /about — the consolidated eight-section static page (spec.md §14). Plain,
 * honest, no hero gradients, no animated bouncing icons. Constitution VII:
 * privacy is one paragraph and the erase button.
 */
export default function AboutRoute() {
  const metrics = useQuery({
    queryKey: ["metrics-summary"],
    queryFn: ({ signal }) => api<MetricsSummary>("/api/metrics/summary", { signal }),
    staleTime: 5 * 60_000,
  });

  return (
    <main className="mx-auto max-w-prose px-4 py-8 text-neutral-900">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm text-blue-700 hover:underline focus:outline-none focus:underline"
        >
          ← Back to the map
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">About NaloxoneLocate</h1>
      </header>

      <Toc />

      <Section id="what" title="What this is">
        <p>
          A community map of naloxone access in Australia. Anonymous. No accounts.
          Built by peers. The pin colour reflects how recently visitors reported
          getting (or not getting) naloxone — and how they were treated when they
          asked.
        </p>
      </Section>

      <Section id="recognise" title="How to recognise an overdose">
        <p>
          Loss of consciousness, slow or absent breathing, blue lips, gurgling or
          snoring sounds, pinpoint pupils.{" "}
          <strong>If you see any of these, call 000.</strong> Paramedics carry
          naloxone — they are statistically the fastest path.
        </p>
        <p className="mt-3">
          The seven-step DRSABCD framework — Danger, Response, Send for help,
          Airway, Breathing, Compressions, Defibrillator — appears in Now mode
          on the map. Tap the <strong>Now</strong> toggle, or open the home-screen
          shortcut to <code>/emergency</code>, to see it on top of a stripped-down
          map of the closest pins.
        </p>
      </Section>

      <Section id="nasal" title="How to use a nasal naloxone spray">
        <ol className="list-decimal pl-5 space-y-2">
          <li>Tilt the person&rsquo;s head back; support their neck.</li>
          <li>Insert the nozzle into one nostril until your fingers touch the bottom of their nose.</li>
          <li>Press the plunger firmly to release the dose.</li>
          <li>Stay with them. If breathing doesn&rsquo;t resume in 2-3 minutes, give a second dose in the other nostril.</li>
        </ol>
        <p className="mt-3 text-sm text-neutral-600">
          Diagram placeholder — a community-illustrated version lands before
          first launch.
        </p>
      </Section>

      <Section id="injectable" title="How to use injectable naloxone">
        <ol className="list-decimal pl-5 space-y-2">
          <li>Remove the cap from the syringe.</li>
          <li>Inject into the upper outer thigh muscle (through clothes if needed).</li>
          <li>Press the plunger fully.</li>
          <li>Stay with them. If breathing doesn&rsquo;t resume in 2-3 minutes, give a second dose.</li>
        </ol>
        <p className="mt-3 text-sm text-neutral-600">
          Diagram placeholder — illustrated version lands before first launch.
        </p>
      </Section>

      <Section id="numbers" title="The map by the numbers">
        {metrics.isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : metrics.isError || !metrics.data ? (
          <p className="text-sm text-red-700">Could not load metrics right now.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
            <Counter
              label="locations on the map"
              value={metrics.data.totalLocations.toLocaleString()}
            />
            <Counter
              label="reports in the last 30 days"
              value={metrics.data.reportsLast30Days.toLocaleString()}
            />
            <Counter
              label="got naloxone in the last 30 days"
              value={`${Math.round(metrics.data.successShareLast30Days * 100)}%`}
            />
          </ul>
        )}
        {metrics.data ? (
          <p className="mt-2 text-xs text-neutral-500">
            Last updated {new Date(metrics.data.lastUpdated).toLocaleString("en-AU")}
          </p>
        ) : null}
      </Section>

      <Section id="trust" title="How we know what we know">
        <p>
          Every pin&rsquo;s colour reflects only the last 72 hours of reports,
          weighted so a fresh report counts twice as much as a two-day-old one.
          A long-term reliability score lives in the detail sheet, never on the
          pin. A separate signal — verification level — appears as a badge.
          And a guardian note from a community partner sits above all of that,
          because a person speaking carries weight that the algorithm does not.
        </p>
        <p className="mt-3">
          The most important data we collect is structured: when ID was asked,
          when Medicare was demanded, when staff were difficult, when there was
          a wait, when there was a charge. Those signals are surfaced in the
          detail sheet as headline facts (&ldquo;ID rarely asked here,&rdquo;
          &ldquo;Cost reported in recent visits&rdquo;) so a person can decide
          whether to walk in before they walk in.
        </p>
      </Section>

      <Section id="privacy" title="Privacy">
        <p>
          We do not have accounts. Your device gets a random key stored only in
          your browser. Reports are anonymous. You can erase the key any time.
        </p>
        <p className="mt-3">
          <Link
            href="/me"
            className="text-blue-700 hover:underline focus:outline-none focus:underline"
          >
            Open My Places to forget this device →
          </Link>
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <ul className="space-y-1">
          <li>
            <a className="text-blue-700 hover:underline" href="mailto:guardians@example.org">
              guardians@example.org
            </a>{" "}
            — community partners issuing notes
          </li>
          <li>
            <a className="text-blue-700 hover:underline" href="mailto:partners@example.org">
              partners@example.org
            </a>{" "}
            — health services, NSPs, AOD orgs
          </li>
          <li>
            <a className="text-blue-700 hover:underline" href="mailto:hello@example.org">
              hello@example.org
            </a>{" "}
            — everything else
          </li>
        </ul>
      </Section>
    </main>
  );
}

function Toc() {
  const items: Array<[string, string]> = [
    ["what", "What this is"],
    ["recognise", "How to recognise an overdose"],
    ["nasal", "How to use a nasal naloxone spray"],
    ["injectable", "How to use injectable naloxone"],
    ["numbers", "The map by the numbers"],
    ["trust", "How we know what we know"],
    ["privacy", "Privacy"],
    ["contact", "Contact"],
  ];
  return (
    <nav aria-label="On this page" className="mb-8 rounded-xl bg-neutral-50 px-4 py-3">
      <ul className="space-y-1 text-sm">
        {items.map(([id, label]) => (
          <li key={id}>
            <a className="text-blue-700 hover:underline" href={`#${id}`}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-6">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-neutral-600">{label}</div>
    </li>
  );
}
