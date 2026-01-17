import "@/styles/globals.css";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="text-lg font-semibold">OTC Fund Prototype</div>
          <nav className="flex gap-4 text-sm">
            <a className="hover:text-brand-700" href="/">Home</a>
            <a className="hover:text-brand-700" href="/investor">Investor</a>
            <a className="hover:text-brand-700" href="/manager">Manager</a>
            <a className="hover:text-brand-700" href="/auditor">Auditor</a>
          </nav>
        </div>
      </header>
      <Component {...pageProps} />
    </>
  );
}
