import Link from "next/link";
import localFont from "next/font/local";
import "./blog.css";

// Bundled, like the root layout's fonts (see app/layout.tsx).
const body = localFont({
  src: [
    { path: "../fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/ibm-plex-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`bl ${body.variable}`}>
      <header className="bl-top">
        <div className="bl-brand">
          <Link href="/" className="bl-home" aria-label="Zeqqat home">
            <span className="bl-logo" aria-hidden="true">Z</span>
            <span className="bl-name">Zeqqat</span>
          </Link>
          <Link href="/blog" className="bl-section">/ blog</Link>
        </div>
        <Link href="/blog" className="bl-top-link">All posts</Link>
      </header>
      <main className="bl-main">
        <div className="bl-col">{children}</div>
      </main>
      <footer className="bl-foot">
        <span>© {new Date().getFullYear()} Zeqqat</span>
      </footer>
    </div>
  );
}
