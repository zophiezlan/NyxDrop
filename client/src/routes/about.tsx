import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { IS_DEMO } from "@/lib/demo";
import { useT } from "@/lib/i18n";

interface MetricsSummary {
  totalLocations: number;
  reportsLast30Days: number;
  successShareLast30Days: number;
  lastUpdated: string;
}

export default function AboutRoute() {
  const t = useT();
  const metrics = useQuery({
    queryKey: ["metrics-summary"],
    queryFn: ({ signal }) => api<MetricsSummary>("/api/metrics/summary", { signal }),
    staleTime: 5 * 60_000,
  });

  return (
    <main className="mx-auto max-w-prose px-4 py-8 text-fg">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm text-blue-700 dark:text-blue-400 hover:underline focus:outline-none focus:underline"
        >
          {t("actions.back_to_map")}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">{t("about.title")}</h1>
      </header>

      {IS_DEMO ? (
        <aside
          role="note"
          aria-labelledby="demo-about-title"
          className="mb-8 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true">⚠</span>
            <h2 id="demo-about-title" className="font-semibold">
              {t("demo.about_title")}
            </h2>
          </div>
          <p className="mt-2 leading-relaxed">{t("demo.about_body")}</p>
        </aside>
      ) : null}

      <Toc t={t} />

      <Section id="what" title={t("about.what_this_is")}>
        <p>
          A community map of naloxone access in Australia. Anonymous. No accounts.
          Built by peers. The pin colour reflects how recently visitors reported
          getting (or not getting) naloxone — and how they were treated when they
          asked.
        </p>
      </Section>

      <Section id="recognise" title={t("about.recognise_overdose")}>
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
          shortcut to <code className="bg-surface-inset px-1 rounded">/emergency</code>, to see it on top of a stripped-down
          map of the closest pins.
        </p>
      </Section>

      <Section id="nasal" title={t("about.use_nasal")}>
        <ol className="list-decimal ps-5 space-y-2">
          <li>Tilt the person&rsquo;s head back; support their neck.</li>
          <li>Insert the nozzle into one nostril until your fingers touch the bottom of their nose.</li>
          <li>Press the plunger firmly to release the dose.</li>
          <li>Stay with them. If breathing doesn&rsquo;t resume in 2-3 minutes, give a second dose in the other nostril.</li>
        </ol>
        <p className="mt-3 text-sm text-fg-muted">
          {t("about.diagram_placeholder")}
        </p>
      </Section>

      <Section id="injectable" title={t("about.use_injectable")}>
        <ol className="list-decimal ps-5 space-y-2">
          <li>Remove the cap from the syringe.</li>
          <li>Inject into the upper outer thigh muscle (through clothes if needed).</li>
          <li>Press the plunger fully.</li>
          <li>Stay with them. If breathing doesn&rsquo;t resume in 2-3 minutes, give a second dose.</li>
        </ol>
        <p className="mt-3 text-sm text-fg-muted">
          {t("about.diagram_placeholder_injectable")}
        </p>
      </Section>

      <Section id="numbers" title={t("about.numbers")}>
        {metrics.isLoading ? (
          <p className="text-sm text-fg-muted">{t("actions.loading")}</p>
        ) : metrics.isError || !metrics.data ? (
          <p className="text-sm text-red-700 dark:text-red-400">{t("about.metrics_error")}</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
            <Counter
              label={t("about.metric_locations")}
              value={metrics.data.totalLocations.toLocaleString()}
            />
            <Counter
              label={t("about.metric_reports")}
              value={metrics.data.reportsLast30Days.toLocaleString()}
            />
            <Counter
              label={t("about.metric_success_rate")}
              value={`${Math.round(metrics.data.successShareLast30Days * 100)}%`}
            />
          </ul>
        )}
        {metrics.data ? (
          <p className="mt-2 text-xs text-fg-muted">
            {t("about.last_updated").replace("{date}", new Date(metrics.data.lastUpdated).toLocaleString("en-AU"))}
          </p>
        ) : null}
        {IS_DEMO ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
            ⚠ {t("demo.about_metrics_caveat")}
          </p>
        ) : null}
      </Section>

      <Section id="trust" title={t("about.trust_model")}>
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
        <p className="mt-3">
          {IS_DEMO ? (
            <>
              <strong>In this prototype</strong>, the site list and every visitor
              report are fabricated for review. The intent is that production
              data will be seeded from three government sources: the{" "}
            </>
          ) : (
            <>The site list is seeded from three government sources: the{" "}</>
          )}
          <a
            href="https://www.health.gov.au/our-work/take-home-naloxone-program"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 dark:text-blue-400 underline"
          >
            Australian Government Take Home Naloxone Program participating-site
            locator
          </a>
          {" "}(nationwide); the{" "}
          <a
            href="https://www.health.nsw.gov.au/aod/Pages/nsp-finder.aspx"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 dark:text-blue-400 underline"
          >
            NSW Health Needle and Syringe Program outlet directory
          </a>
          {" "}(primary services, secondary outlets, and pharmacies); and the{" "}
          <a
            href="https://www.health.vic.gov.au/aod-treatment-services/needle-and-syringe-program"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 dark:text-blue-400 underline"
          >
            Victorian Department of Health NSP outlet directory
          </a>
          . Those registries tell us which operators have signed up to take part
          — they do <strong>not</strong> tell us who actually has stock today,
          or how visitors are treated when they ask. That second layer is what
          this app exists to provide.
        </p>
      </Section>

      <Section id="privacy" title={t("about.privacy")}>
        <p>
          {t("about.privacy_paragraph")}
        </p>
        <p className="mt-3">
          <Link
            href="/me"
            className="text-blue-700 dark:text-blue-400 hover:underline focus:outline-none focus:underline"
          >
            {t("my_places.forget_open")}
          </Link>
        </p>
      </Section>

      <Section id="contact" title={t("about.contact")}>
        <ul className="space-y-1">
          <li>
            <a className="text-blue-700 dark:text-blue-400 underline" href="mailto:guardians@example.org">
              guardians@example.org
            </a>{" "}
            — {t("about.contact_guardians")}
          </li>
          <li>
            <a className="text-blue-700 dark:text-blue-400 underline" href="mailto:partners@example.org">
              partners@example.org
            </a>{" "}
            — {t("about.contact_partners")}
          </li>
          <li>
            <a className="text-blue-700 dark:text-blue-400 underline" href="mailto:hello@example.org">
              hello@example.org
            </a>{" "}
            — {t("about.contact_hello")}
          </li>
        </ul>
      </Section>
    </main>
  );
}

function Toc({ t }: { t: (key: string) => string }) {
  const items: Array<[string, string]> = [
    ["what", t("about.what_this_is")],
    ["recognise", t("about.recognise_overdose")],
    ["nasal", t("about.use_nasal")],
    ["injectable", t("about.use_injectable")],
    ["numbers", t("about.numbers")],
    ["trust", t("about.trust_model")],
    ["privacy", t("about.privacy")],
    ["contact", t("about.contact")],
  ];
  return (
    <nav aria-label={t("about.toc_label")} className="mb-8 rounded-xl bg-surface-inset px-4 py-3">
      <ul className="space-y-1 text-sm">
        {items.map(([id, label]) => (
          <li key={id}>
            <a className="text-blue-700 dark:text-blue-400 underline" href={`#${id}`}>
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
    <li className="rounded-xl border border-nl-border bg-surface px-4 py-3">
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-fg-muted">{label}</div>
    </li>
  );
}
