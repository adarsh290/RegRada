import cron from "node-cron";
import nodemailer from "nodemailer";
import Circular from "../models/Circular";
import Submission from "../models/Submission";

// ── Email Transporter ────────────────────────────────────────
// Uses ethereal.email for dev (catches all emails, no real sending).
// Set SMTP_* env vars in production for real email delivery.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "regradar-notifications@ethereal.email",
    pass: process.env.SMTP_PASS || "",
  },
});

const FROM_EMAIL = process.env.FROM_EMAIL || "RegRadar Notifications <noreply@regradar.com>";
const CO_EMAIL = process.env.CO_EMAIL || "compliance.officer@regradar.com";

function buildOverdueEmail(items: any[]) {
  const rows = items.map(m => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${m.map_id}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${m.action_title}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${m.department}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;color:#f87171;">${m.days_overdue} days</td>
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
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${m.map_id}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${m.action_title}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;">${m.circular_title || "N/A"}</td>
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

    const circulars = await Circular.find();

    // ── 1. Overdue MAPs ──────────────────────────────────────
    const overdue: any[] = [];
    const escalated: any[] = [];

    for (const circ of circulars) {
      for (const map of circ.maps) {
        if (map.status === "escalated") {
          escalated.push({ ...map.toObject(), circular_title: circ.title });
        }

        if (map.status === "verified") continue;
        if (!map.deadline || map.deadline === "Not specified") continue;
        const deadlineDate = new Date(map.deadline);
        if (isNaN(deadlineDate.getTime())) continue;
        deadlineDate.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - deadlineDate.getTime();
        const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (daysOverdue > 0) {
          overdue.push({ ...map.toObject(), days_overdue: daysOverdue });
        }
      }
    }

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

  // Run immediately on startup for dev visibility
  sendNotifications();

  cron.schedule("0 8 * * *", sendNotifications);
}
