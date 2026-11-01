import type { JobStatus, SymbolCode } from "../types/market";

interface AnnouncementText {
  submitting: string;
  queued: string;
  running: string;
  jobReady: string;
  priceCompleteAnnouncement: string;
  analysisCompleteAnnouncement: string;
}

// Text only: React renders this in the existing polite live region, never as HTML.
export function demoAnnouncement(text: AnnouncementText, symbol: SymbolCode, status: JobStatus, hasInsight: boolean, errorText: string | null, submitting = false): string {
  if (status === "QUEUED" && submitting) return `${symbol}: ${text.submitting}`;
  if (status === "QUEUED") return `${symbol}: ${text.queued}`;
  if (status === "RUNNING") return `${symbol}: ${text.running}`;
  // A terminal SUCCEEDED record can legitimately omit a result. Do not
  // announce a price/analysis success while the visible panel says unavailable.
  if (errorText) return `${symbol}: ${errorText}`;
  if (status === "SUCCEEDED") {
    return (hasInsight ? text.analysisCompleteAnnouncement : text.priceCompleteAnnouncement).replace("{symbol}", symbol);
  }
  return text.jobReady;
}
