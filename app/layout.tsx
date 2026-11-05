import type { Metadata } from "next";
import { headers } from "next/headers";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "../components/analytics";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--font-display-src",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Zeqqat: give AI access to your APIs and MCPs, minus the risk",
    template: "%s | Zeqqat",
  },
  description:
    "Control and monitor every agent from one place. Decide what each one can and can't do, add teammates with their own roles, and keep your API keys, env vars and secrets away from the LLM.",
};

// Applied before first paint so a dark-mode reader never sees a white flash;
// a React effect runs after paint, which is exactly too late.
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Analytics nonce={nonce} />
      </body>
    </html>
  );
}
