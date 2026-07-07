import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { doSignOut } from "./actions";
import "./globals.css";

// DESIGN.md's Euclid Circular A is commercially licensed; Plus Jakarta Sans
// is the agreed substitute (see BUILD_BRIEF).
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Project Ledger",
  description: "Personal project cost, revenue, and profit tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={jakarta.className}>
        <nav className="nav">
          <Link href="/" className="nav-brand">
            Project Ledger
          </Link>
          <Link href="/">Dashboard</Link>
          <Link href="/subscriptions">Shared subscriptions</Link>
          <Link href="/accounts">Stripe accounts</Link>
          <span className="nav-spacer" />
          <form action={doSignOut}>
            <button className="btn-outline" type="submit">
              Sign out
            </button>
          </form>
        </nav>
        {children}
      </body>
    </html>
  );
}
