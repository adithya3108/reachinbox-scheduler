import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import type { User, EmailJob } from "../types";
import { UserMenu } from "../components/UserMenu";
import { Button } from "../components/Button";
import { EmailTable } from "../components/EmailTable";
import { ComposeModal } from "../features/campaigns/ComposeModal";
import { fetchScheduledEmails, fetchSentEmails } from "../services/emails";
import { logout as logoutRequest } from "../services/auth";

type Tab = "scheduled" | "sent";

export function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("scheduled");
  const [scheduled, setScheduled] = useState<EmailJob[]>([]);
  const [sent, setSent] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  async function loadEmails() {
    setLoading(true);
    try {
      const [s, se] = await Promise.all([fetchScheduledEmails(), fetchSentEmails()]);
      setScheduled(s);
      setSent(se);
    } catch {
      toast.error("Failed to load emails");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmails();
  }, []);

  async function handleLogout() {
    await logoutRequest();
    onLogout();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-800">ReachInbox Scheduler</h1>
          <UserMenu user={user} onLogout={handleLogout} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setTab("scheduled")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "scheduled" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Scheduled Emails
            </button>
            <button
              onClick={() => setTab("sent")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "sent" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Sent Emails
            </button>
          </div>
          <Button onClick={() => setComposeOpen(true)}>Compose New Email</Button>
        </div>

        <EmailTable
          emails={tab === "scheduled" ? scheduled : sent}
          loading={loading}
          mode={tab}
        />
      </main>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={loadEmails}
        defaultSenderEmail={user.email}
      />
    </div>
  );
}
