const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["Features", "/features"],
      ["Category engines", "/engines"],
      ["Pricing", "/pricing"],
      ["Integrations", "/integrations"],
      ["Changelog", "/changelog"],
    ],
  },
  {
    title: "Use cases",
    links: [
      ["Streamers and clippers", "/use-cases/streamers"],
      ["Podcasters", "/use-cases/podcasters"],
      ["Agencies and editors", "/use-cases/agencies"],
      ["Compare", "/compare"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Guides", "/guides"],
      ["FAQ", "/faq"],
      ["About", "/about"],
      ["Partners", "/partners"],
      ["Contact", "/contact"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy policy", "/privacy"],
      ["Terms of service", "/terms"],
      ["Refund policy", "/refunds"],
      ["Security", "/security"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer relative overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <p className="hud text-muted">
              <span className="text-signal">/</span> Shortlark
            </p>
            <p className="mt-5 max-w-sm text-[23px] leading-[1.15] tracking-[-0.02em]">
              AI that finds the Shorts and Reels hiding in your long streams, then posts them for you
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            {COLUMNS.map((c) => (
              <div key={c.title}>
                <p className="hud text-muted">{c.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map(([label, href]) => (
                    <li key={label}>
                      <a href={href} className="text-[16px] text-text transition-colors hover:text-signal">
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex justify-end border-t border-line pt-6">
          <p className="hud text-faint">© {new Date().getFullYear()} Shortlark. All rights reserved.</p>
        </div>
      </div>

      {/* The wordmark, set as large as the page allows and cropped by the bottom edge. */}
      <p className="footer-mark pointer-events-none select-none" aria-hidden="true">
        shortlark
      </p>
    </footer>
  );
}
