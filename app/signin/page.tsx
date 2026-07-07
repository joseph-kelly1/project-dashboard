import { doSignIn } from "../actions";

export default function SignIn() {
  return (
    <div className="signin-wrap">
      <div className="signin-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- static svg, no optimization needed */}
        <img
          src="/logo.svg"
          alt="Project Ledger"
          width={48}
          height={48}
          style={{ margin: "0 auto" }}
        />
        <h1>Project Ledger</h1>
        <p className="muted">
          Personal dashboard — sign-in is locked to a single GitHub account.
        </p>
        <form action={doSignIn}>
          <button className="btn" type="submit">
            Sign in with GitHub
          </button>
        </form>
      </div>
    </div>
  );
}
