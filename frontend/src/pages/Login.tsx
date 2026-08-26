import { googleLoginUrl } from "../services/auth";

export function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-800">ReachInbox Scheduler</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in to schedule and track your email campaigns.</p>
        <a
          href={googleLoginUrl()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Continue with Google
        </a>
      </div>
    </div>
  );
}
