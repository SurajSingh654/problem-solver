// ============================================================================
// ProbSolver v3.0 — Email Service
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Resend as the provider: Simple API, good deliverability, free tier
//    covers development. All emails go through one function (sendEmail)
//    that handles the Resend API call and graceful degradation.
//
// 2. Graceful degradation: If RESEND_API_KEY is not set, emails are
//    logged to console instead of sent. This means local development
//    works without Resend configured — you just read codes from logs.
//
// 3. HTML emails: Each email type has a branded HTML template with
//    inline styles (email clients strip <style> tags). Templates use
//    the ProbSolver brand gradient and clean typography.
//
// 4. New templates for v3.0: Team invitation, team approved, team
//    rejected. These join the existing verification, welcome, and
//    password reset templates.
//
// ============================================================================

import { Resend } from "resend";
import {
  RESEND_API_KEY,
  EMAIL_FROM,
  EMAIL_ENABLED,
  CLIENT_URL,
} from "../config/env.js";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ── Core send function ───────────────────────────────────────

async function sendEmail(to, subject, html) {
  if (!EMAIL_ENABLED || !resend) {
    console.log("\n📧 EMAIL (not sent — no API key):");
    console.log(`   To:      ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body:    [HTML email]\n`);
    return { success: true, simulated: true };
  }

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });
    return { success: true, id: result.id };
  } catch (err) {
    console.error(`Email send failed to ${to}:`, err.message);
    throw err;
  }
}

// ── Shared template wrapper ──────────────────────────────────

function emailWrapper(content) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:500px;background:#1a1d27;border-radius:16px;border:1px solid #2a2d3a;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#7c6ff7,#4f8cf7);padding:24px 32px;">
          <h1 style="margin:0;font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.3px;">ProbSolver</h1>
        </td></tr>
        <!-- Content -->
        <tr><td style="padding:32px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #2a2d3a;">
          <p style="margin:0;font-size:11px;color:#6b7280;">
            ProbSolver — Team Interview Intelligence Platform
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function codeBlock(code) {
  return `<div style="background:#0f1117;border:1px solid #2a2d3a;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
    <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#7c6ff7;font-family:monospace;">${code}</span>
  </div>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#d1d5db;">${text}</p>`;
}

function heading(text) {
  return `<h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f3f4f6;">${text}</h2>`;
}

function button(text, url) {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#7c6ff7,#4f8cf7);color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">${text}</a>
  </div>`;
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

// ── Email verification ───────────────────────────────────────

export async function sendVerificationEmail(to, name, code) {
  const html = emailWrapper(`
    ${heading(`Welcome, ${name}!`)}
    ${paragraph("Thanks for signing up for ProbSolver. Enter this code to verify your email:")}
    ${codeBlock(code)}
    ${paragraph('This code expires in <strong style="color:#f3f4f6;">15 minutes</strong>.')}
    ${paragraph("If you didn't create this account, you can safely ignore this email.")}
  `);

  return sendEmail(to, "Verify your ProbSolver account", html);
}

// ── Welcome (after verification) ─────────────────────────────

export async function sendWelcomeEmail(to, name) {
  const html = emailWrapper(`
    ${heading(`You're in, ${name}!`)}
    ${paragraph("Your email is verified and your account is ready. You can now:")}
    ${paragraph('• <strong style="color:#f3f4f6;">Join a team</strong> with a join code from your team admin')}
    ${paragraph('• <strong style="color:#f3f4f6;">Create a team</strong> and invite your colleagues')}
    ${paragraph('• <strong style="color:#f3f4f6;">Practice individually</strong> with AI-generated problems')}
    ${button("Get Started", CLIENT_URL)}
  `);

  return sendEmail(to, "Welcome to ProbSolver!", html);
}

// ── Password reset ───────────────────────────────────────────

export async function sendPasswordResetEmail(to, name, code) {
  const html = emailWrapper(`
    ${heading("Password Reset")}
    ${paragraph(`Hi ${name}, we received a request to reset your password. Enter this code:`)}
    ${codeBlock(code)}
    ${paragraph('This code expires in <strong style="color:#f3f4f6;">15 minutes</strong>.')}
    ${paragraph("If you didn't request this, your account is secure — no action needed.")}
  `);

  return sendEmail(to, "Reset your ProbSolver password", html);
}

// ── Team invitation ──────────────────────────────────────────

export async function sendTeamInviteEmail(to, teamName, joinCode, inviteToken) {
  const joinUrl = `${CLIENT_URL}/join?token=${inviteToken}`;

  const html = emailWrapper(`
    ${heading(`You're invited to ${teamName}`)}
    ${paragraph("A team on ProbSolver has invited you to join. ProbSolver is a team interview intelligence platform with AI-powered mock interviews, coding practice, and readiness tracking.")}
    ${paragraph("You can join using either method:")}
    ${heading("Option 1: Join Code")}
    ${codeBlock(joinCode)}
    ${heading("Option 2: Direct Link")}
    ${button("Join Team", joinUrl)}
    ${paragraph("If you don't have a ProbSolver account yet, you'll be asked to create one first.")}
    ${paragraph('<span style="color:#6b7280;font-size:12px;">This invitation expires in 72 hours.</span>')}
  `);

  return sendEmail(to, `Join ${teamName} on ProbSolver`, html);
}

// ── Team approved ────────────────────────────────────────────

export async function sendTeamApprovedEmail(to, name, teamName, joinCode) {
  const html = emailWrapper(`
    ${heading("Your team is approved!")}
    ${paragraph(`Great news, ${name}! Your team <strong style="color:#f3f4f6;">${teamName}</strong> has been approved and is now active.`)}
    ${paragraph("Share this join code with your team members:")}
    ${codeBlock(joinCode)}
    ${paragraph("You've been automatically switched to your new team. You can start adding problems and inviting members right away.")}
    ${button("Go to Team Dashboard", CLIENT_URL)}
  `);

  return sendEmail(to, `${teamName} is approved — start inviting!`, html);
}

// ── Team rejected ────────────────────────────────────────────

export async function sendTeamRejectedEmail(to, name, teamName, reason) {
  const html = emailWrapper(`
    ${heading("Team Request Update")}
    ${paragraph(`Hi ${name}, your team <strong style="color:#f3f4f6;">${teamName}</strong> was not approved.`)}
    <div style="background:#0f1117;border:1px solid #ef4444;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#fca5a5;"><strong>Reason:</strong> ${reason}</p>
    </div>
    ${paragraph("You can create a new team request or continue practicing individually.")}
    ${paragraph("If you believe this was a mistake, please contact the platform administrator.")}
  `);

  return sendEmail(to, `Update on ${teamName}`, html);
}

// ── Security notification (email change) ─────────────────────

export async function sendEmailChangeNotification(to, name) {
  const html = emailWrapper(`
    ${heading("Email Address Changed")}
    ${paragraph(`Hi ${name}, your ProbSolver account email has been changed. If you didn't make this change, please contact the platform administrator immediately.`)}
  `);

  return sendEmail(to, "ProbSolver — Email address changed", html);
}

// ── Email change verification ────────────────────────────────

export async function sendEmailChangeVerification(to, name, code) {
  const html = emailWrapper(`
    ${heading("Verify New Email")}
    ${paragraph(`Hi ${name}, enter this code to confirm your new email address:`)}
    ${codeBlock(code)}
    ${paragraph('This code expires in <strong style="color:#f3f4f6;">15 minutes</strong>.')}
  `);

  return sendEmail(to, "Verify your new ProbSolver email", html);
}

// ── Member removed from team ─────────────────────────────────

export async function sendMemberRemovedEmail(to, name, teamName) {
  const html = emailWrapper(`
    ${heading("Team Membership Update")}
    ${paragraph(`Hi ${name}, you have been removed from <strong style="color:#f3f4f6;">${teamName}</strong>. You've been switched to your personal practice space.`)}
    ${paragraph("Your personal practice data, quizzes, and mock interview history are still intact.")}
    ${button("Continue Practicing", CLIENT_URL)}
  `);

  return sendEmail(to, `${teamName} — Membership update`, html);
}

// ── Feedback report notification (to admin) ──────────────────
// Sent to FEEDBACK_NOTIFICATION_EMAIL on every new submission.
// Includes full report details so admin can triage from email
// without needing to open the dashboard.
export async function sendFeedbackNotificationEmail(to, report) {
  const typeLabels = {
    BUG: "🐛 Bug Report",
    SUGGESTION: "💡 Suggestion",
    QUESTION: "❓ Question",
  };
  const severityColors = {
    CRITICAL: "#ef4444",
    HIGH: "#f97316",
    MEDIUM: "#eab308",
    LOW: "#22c55e",
  };
  const severityLabel = report.severity;
  const severityColor = severityColors[report.severity] || "#6b7280";
  const typeLabel = typeLabels[report.type] || report.type;

  const html = emailWrapper(`
        ${heading("New Feedback Report")}
        <div style="background:#0f1117;border:1px solid #2a2d3a;border-radius:12px;padding:16px;margin:0 0 16px;">
            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6b7280;width:120px;">Type</td>
                    <td style="padding:4px 0;font-size:12px;color:#f3f4f6;font-weight:600;">${typeLabel}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6b7280;">Severity</td>
                    <td style="padding:4px 0;font-size:12px;font-weight:700;color:${severityColor};">${severityLabel}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6b7280;">From</td>
                    <td style="padding:4px 0;font-size:12px;color:#f3f4f6;">${report.user?.name || "Unknown"} (${report.user?.email || ""})</td>
                </tr>
                ${
                  report.team
                    ? `
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6b7280;">Team</td>
                    <td style="padding:4px 0;font-size:12px;color:#f3f4f6;">${report.team.name}</td>
                </tr>`
                    : ""
                }
                ${
                  report.affectedArea
                    ? `
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6b7280;">Area</td>
                    <td style="padding:4px 0;font-size:12px;color:#f3f4f6;">${report.affectedArea}</td>
                </tr>`
                    : ""
                }
            </table>
        </div>
        <div style="margin-bottom:16px;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f3f4f6;">${report.title}</p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#d1d5db;">${report.description}</p>
        </div>
        ${
          report.stepsToReproduce
            ? `
        <div style="background:#0f1117;border:1px solid #2a2d3a;border-radius:8px;padding:12px;margin-bottom:16px;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Steps to Reproduce</p>
            <p style="margin:0;font-size:12px;line-height:1.6;color:#d1d5db;white-space:pre-wrap;">${report.stepsToReproduce}</p>
        </div>`
            : ""
        }
        ${button("View in Dashboard", `${CLIENT_URL}/super-admin`)}
        <p style="margin:0;font-size:11px;color:#6b7280;">Report ID: ${report.id}</p>
    `);

  const subjectPrefix =
    report.severity === "CRITICAL"
      ? "🚨 CRITICAL"
      : report.severity === "HIGH"
        ? "⚠️ HIGH"
        : "📋";
  return sendEmail(
    to,
    `${subjectPrefix} [ProbSolver] ${typeLabel}: ${report.title}`,
    html,
  );
}
