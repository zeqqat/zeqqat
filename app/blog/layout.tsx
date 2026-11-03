import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";
import "./blog.css";

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`bl ${body.variable}`}>
      <header className="bl-top">
        <Link href="/blog" className="bl-brand" aria-label="Zeqqat blog home">
          <span className="bl-logo" aria-hidden="true">Z</span>
          <span className="bl-name">Zeqqat</span>
          <span className="bl-section">/ blog</span>
        </Link>
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
