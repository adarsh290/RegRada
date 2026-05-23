import cron from "node-cron";
import nodemailer from "nodemailer";
import Circular from "../models/Circular";

// ── Email Transporter ────────────────────────────────────────
// Uses ethereal.email for dev (catches all emails, no real sending).
// Set SMTP_* env vars in production for real email delivery.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: Number(process.env.SMTP_PORT) || 587,
  // BUG-BE2-036: Use true if port is 465 (SMTPS), otherwise false
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER || "regradar-notifications@ethereal.email",
    pass: process.env.SMTP_PASS || "",
  },
});

const FROM_EMAIL = process.env.FROM_EMAIL || "RegRadar Notifications <noreply@regradar.com>";
const CO_EMAIL = process.env.CO_EMAIL || "compliance.officer@regradar.com";

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return "";
  const s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildOverdueEmail(items: any[]) {
  const rows = items.map(m => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${escapeHtml(m.map_id)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${escapeHtml(m.action_title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${escapeHtml(m.department)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;color:#f87171;">${escapeHtml(m.days_overdue)} days</td>
    </tr>`).join("");

  return `
    <div style="font-family:sans-serif;background:#0f1117;color:#e2e8f0;padding:32px;">
      <h2 style="color:#60a5fa;">RegRadar — ⚠️ Overdue MAPs Detected</h2>
      <p>The following compliance action points have breached their deadlines:</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;background:#1a1d27;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#1e2235;color:#94a3b8;text-transform:uppercase;font-size:11px;">
            <th style="padding:10px 12px;text-align:left;">MAP ID</th>
            <th style="padding:10px 12px;text-align:left;">Action</th>
            <th style="padding:10px 12px;text-align:left;">Department</th>
            <th style="padding:10px 12px;text-align:left;">Overdue By</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:24px;color:#94a3b8;font-size:12px;">RegRadar Autonomous Monitoring · ${new Date().toLocaleDateString()}</p>
    </div>`;
}

function buildEscalatedEmail(maps: any[]) {
  const rows = maps.map(m => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${escapeHtml(m.map_id)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${escapeHtml(m.action_title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${escapeHtml(m.circular_title || "N/A")}</td>
    </tr>`).join("");

  return `
    <div style="font-family:sans-serif;background:#0f1117;color:#e2e8f0;padding:32px;">
      <h2 style="color:#fbbf24;">RegRadar — 🚨 Escalated MAPs Require Your Action</h2>
      <p>The following tasks have been repeatedly rejected by departments and require your manual review:</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;background:#1a1d27;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#1e2235;color:#94a3b8;text-transform:uppercase;font-size:11px;">
            <th style="padding:10px 12px;text-align:left;">MAP ID</th>
            <th style="padding:10px 12px;text-align:left;">Action</th>
            <th style="padding:10px 12px;text-align:left;">Circular</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;color:#94a3b8;">Please log into RegRadar and navigate to the Audit Dashboard → Action Required.</p>
      <p style="margin-top:24px;color:#94a3b8;font-size:12px;">RegRadar Autonomous Monitoring · ${new Date().toLocaleDateString()}</p>
    </div>`;
}

async function sendNotifications() {
  console.log("⏰ [Cron] Running daily compliance notification check...");

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── 1. Overdue MAPs ──────────────────────────────────────
    // BUG-BE2-013: Add $limit to prevent loading entire collection into memory
    const overdueAgg = await Circular.aggregate([
      { $unwind: "$maps" },
      { $match: { 
          "maps.status": { $nin: ["verified", "escalated"] },
          "maps.deadline": { $nin: [null, "", "Not specified"] }
      }},
      { $limit: 5000 } // Safety cap — tune per deployment
    ]);

    const overdue: any[] = [];
    for (const doc of overdueAgg) {
      const map = doc.maps;
      const deadlineDate = new Date(map.deadline);
      if (isNaN(deadlineDate.getTime())) continue;
      deadlineDate.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - deadlineDate.getTime();
      const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (daysOverdue > 0) {
        overdue.push({ ...map, circular_title: doc.title, days_overdue: daysOverdue });
      }
    }

    const escalatedAgg = await Circular.aggregate([
      { $unwind: "$maps" },
      { $match: { "maps.status": "escalated" } },
      { $limit: 5000 } // Safety cap
    ]);

    
    const escalated = escalatedAgg.map(doc => ({ ...doc.maps, circular_title: doc.title }));

    // ── 2. Send Overdue Alert to CO ──────────────────────────
    if (overdue.length > 0) {
      await transporter.sendMail({
        from: FROM_EMAIL,
        to: CO_EMAIL,
        subject: `⚠️ RegRadar: ${overdue.length} Overdue MAPs Detected`,
        html: buildOverdueEmail(overdue),
      });
      console.log(`📧 [Cron] Sent overdue alert for ${overdue.length} MAPs to CO`);
    }

    // ── 3. Send Escalated Alert to CO ────────────────────────
    if (escalated.length > 0) {
      await transporter.sendMail({
        from: FROM_EMAIL,
        to: CO_EMAIL,
        subject: `🚨 RegRadar: ${escalated.length} Disputed MAPs Require Your Action`,
        html: buildEscalatedEmail(escalated),
      });
      console.log(`📧 [Cron] Sent escalation alert for ${escalated.length} MAPs to CO`);
    }

    if (overdue.length === 0 && escalated.length === 0) {
      console.log("✅ [Cron] All clear — no overdue or escalated MAPs.");
    }
  } catch (err) {
    console.error("❌ [Cron] Notification check failed:", err);
  }
}

/**
 * Starts the daily notification cron job.
 * Runs every day at 08:00 AM server time.
 */
export function startCronService() {
  console.log("⏰ Cron service started — notifications scheduled daily at 08:00 AM");

  // Run with a 30-second grace period on startup for dev visibility to prevent crash-loop storms
  setTimeout(() => {
    console.log("⏰ [Cron] Running initial startup notification check...");
    // BUG-BE2-027: Catch rejected promise to prevent unhandled rejection crash
    sendNotifications().catch(console.error);
  }, 30000);

  cron.schedule("0 8 * * *", sendNotifications);
}
