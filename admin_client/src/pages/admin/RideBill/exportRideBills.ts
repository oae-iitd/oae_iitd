export const RIDE_BILL_REPORT_LINE_1 = "Office of Accessible Education (OAE)";
export const RIDE_BILL_REPORT_LINE_2 = "IIT Delhi";

export type RideBillExportRow = {
  rideId: string;
  student: string;
  driverName: string;
  route: string;
  /** Display (e.g. ₹…) */
  fare: string;
  /** Numeric fare for Grand Total */
  fareAmount: number;
  status: string;
  date: string;
  reason: string;
};

/** Local date/time as dd/mm/yy, h:mm AM/PM */
export function formatDdMmYyTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) {
    return typeof isoOrDate === "string" && isoOrDate.trim() ? isoOrDate : "—";
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const time = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dd}/${mm}/${yy}, ${time}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatINR(amount: number): string {
  const hasDecimals = Math.abs(amount % 1) > 1e-9;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function grandTotalFare(rows: RideBillExportRow[]): number {
  return rows.reduce((sum, r) => sum + (Number.isFinite(r.fareAmount) ? r.fareAmount : 0), 0);
}

/** Opens a printable report; use the browser’s Print → Save as PDF */
export function printRideBillsPdf(rows: RideBillExportRow[]): void {
  const generated = formatDdMmYyTime(new Date());
  const bodyRows = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.rideId)}</td><td>${escapeHtml(r.student)}</td><td>${escapeHtml(r.driverName)}</td><td>${escapeHtml(r.route)}</td><td>${escapeHtml(r.fare)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.reason)}</td></tr>`,
    )
    .join("");
  const footerRow =
    rows.length > 0
      ? `<tfoot><tr><td colspan="4"><strong>Grand Total</strong></td><td><strong>${escapeHtml(formatINR(grandTotalFare(rows)))}</strong></td><td colspan="3"></td></tr></tfoot>`
      : "";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Ride bills — ${escapeHtml(RIDE_BILL_REPORT_LINE_1)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 12mm; color: #111; font-size: 10pt; }
  .hdr { text-align: center; margin-bottom: 14px; }
  .hdr .l1 { font-size: 14pt; font-weight: 700; margin: 0 0 4px; }
  .hdr .l2 { font-size: 12pt; font-weight: 600; margin: 0; }
  .meta { text-align: center; font-size: 9pt; color: #444; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #222; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: 600; font-size: 9pt; }
  td { font-size: 9pt; }
  tfoot td { background: #f5f5f5; font-weight: 600; }
  @media print { body { padding: 8mm; } }
</style></head><body>
  <div class="hdr">
    <p class="l1">${escapeHtml(RIDE_BILL_REPORT_LINE_1)}</p>
    <p class="l2">${escapeHtml(RIDE_BILL_REPORT_LINE_2)}</p>
  </div>
  <p class="meta">Ride bills report · Dated: ${escapeHtml(generated)} · ${rows.length} row(s)</p>
  <table>
    <thead><tr>
      <th>Ride ID</th><th>Student</th><th>Driver Name</th><th>Route</th><th>Fare</th><th>Status</th><th>Date</th><th>Reason</th>
    </tr></thead>
    <tbody>${bodyRows}</tbody>
    ${footerRow}
  </table>
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const w = window.open(blobUrl, "_blank");
  if (!w) {
    URL.revokeObjectURL(blobUrl);
    throw new Error("popup_blocked");
  }

  const revokeLater = () => {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
  };

  const triggerPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
    revokeLater();
  };

  if (w.document.readyState === "complete") {
    setTimeout(triggerPrint, 200);
  } else {
    w.addEventListener("load", () => setTimeout(triggerPrint, 200), { once: true });
  }
}
