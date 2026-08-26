import type { EmailStatus } from "../types";

const styles: Record<EmailStatus, string> = {
  SCHEDULED: "bg-slate-100 text-slate-700",
  PROCESSING: "bg-amber-100 text-amber-700",
  SENT: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
