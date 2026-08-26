import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../../components/Modal";
import { Field, Input, Textarea } from "../../components/Input";
import { Button } from "../../components/Button";
import { extractEmailsFromText } from "../../utils/csv";
import { createCampaign } from "../../services/campaigns";

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
  defaultSenderEmail: string;
}

export function ComposeModal({ open, onClose, onScheduled, defaultSenderEmail }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [startTime, setStartTime] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setSubject("");
    setBody("");
    setRecipients([]);
    setInvalidCount(0);
    setStartTime("");
    setDelaySeconds(2);
    setHourlyLimit(100);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { valid, invalidCount } = extractEmailsFromText(text);
    setRecipients(valid);
    setInvalidCount(invalidCount);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (recipients.length === 0) {
      toast.error("Upload a CSV/text file with at least one valid email address.");
      return;
    }
    if (!startTime) {
      toast.error("Please choose a start time.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createCampaign({
        senderEmail: defaultSenderEmail,
        subject,
        body,
        startTime: new Date(startTime).toISOString(),
        delayMs: delaySeconds * 1000,
        hourlyLimit,
        recipients,
      });
      toast.success(`Scheduled ${result.jobCount} emails`);
      reset();
      onScheduled();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? "Failed to schedule campaign");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Compose new email">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Subject">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </Field>

        <Field label="Body">
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} required />
        </Field>

        <Field label="Recipient list (CSV or text file)">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFile}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700 hover:file:bg-indigo-100"
          />
          <p className="mt-1 text-sm text-slate-500">
            Detected emails: <span className="font-medium text-slate-700">{recipients.length}</span>
            {invalidCount > 0 && (
              <span className="text-amber-600"> ({invalidCount} invalid entries skipped)</span>
            )}
          </p>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Start time">
            <Input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </Field>
          <Field label="Delay between emails (seconds)">
            <Input
              type="number"
              min={0}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              required
            />
          </Field>
        </div>

        <Field label="Hourly email limit">
          <Input
            type="number"
            min={1}
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(Number(e.target.value))}
            required
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Scheduling..." : "Schedule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
