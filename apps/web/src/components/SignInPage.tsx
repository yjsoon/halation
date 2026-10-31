import type { ReactNode } from "react";

/** A quiet sign-in surface above the illustrated Halation landscape. */
export function SignInPage({ children }: { children: ReactNode }) {
  return (
    <main className="signin-page">
      <div className="signin-content">
        <header className="signin-brand">
          <h1>Halation</h1>
          <h2>Clarity for a longer view</h2>
        </header>
        {children}
      </div>
      <div className="signin-landscape" aria-hidden="true" />
    </main>
  );
}
