import type { EmailJob } from "../types";
import { StatusBadge } from "./StatusBadge";
import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";

interface Props {
  emails: EmailJob[];
  loading: boolean;
  mode: "scheduled" | "sent";
}

export function EmailTable({ emails, loading, mode }: Props) {
  if (loading) return <LoadingState label="Loading emails..." />;

  if (emails.length === 0) {
    return (
      <EmptyState
        title={mode === "scheduled" ? "No scheduled emails" : "No sent emails yet"}
        subtitle={
          mode === "scheduled"
            ? "Compose a campaign to schedule your first emails."
            : "Once emails are sent, they'll show up here."
        }
      />
    );
  }

  const timeLabel = mode === "scheduled" ? "Scheduled time" : "Sent time";

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-slate-500">Email</th>
            <th className="px-4 py-2 text-left font-medium text-slate-500">Subject</th>
            <th className="px-4 py-2 text-left font-medium text-slate-500">{timeLabel}</th>
            <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {emails.map((email) => (
            <tr key={email.id}>
              <td className="px-4 py-2 text-slate-800">{email.recipient}</td>
              <td className="px-4 py-2 text-slate-600">{email.campaign.subject}</td>
              <td className="px-4 py-2 text-slate-500">
                {new Date(
                  mode === "scheduled" ? email.scheduledAt : email.sentAt ?? email.scheduledAt
                ).toLocaleString()}
              </td>
              <td className="px-4 py-2">
                <StatusBadge status={email.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
