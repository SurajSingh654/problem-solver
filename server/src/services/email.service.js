/**
 * EMAIL SERVICE — Send transactional emails via Resend
 */
import { Resend } from "resend";

let resend = null;

function getClient() {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "[Email] RESEND_API_KEY not set — emails will be logged only",
      );
      return null;
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const FROM = process.env.EMAIL_FROM || "ProbSolver <onboarding@resend.dev>";

// ── Send verification code email ───────────────────────
export async function sendVerificationEmail(to, username, code) {
  const client = getClient();

  const html = `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px;
                    background: linear-gradient(135deg, #7c6ff7, #3b82f6);
                    line-height: 48px; text-align: center; font-size: 20px; color: white;">
          ⚡
        </div>
        <h1 style="font-size: 22px; font-weight: 800; color: #eeeef5; margin: 16px 0 4px;">
          Verify your email
        </h1>
        <p style="font-size: 14px; color: #9999bb; margin: 0;">
          Welcome to ProbSolver, ${username}!
        </p>
      </div>

      <div style="background: #18181f; border: 1px solid rgba(255,255,255,0.09);
                  border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
        <p style="font-size: 13px; color: #9999bb; margin: 0 0 16px;">
          Enter this code to verify your email address:
        </p>
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 36px; font-weight: 800;
                    letter-spacing: 8px; color: #7c6ff7; margin: 16px 0;">
          ${code}
        </div>
        <p style="font-size: 12px; color: #55556e; margin: 16px 0 0;">
          This code expires in 15 minutes.
        </p>
      </div>

      <p style="font-size: 12px; color: #55556e; text-align: center;">
        If you didn't create an account on ProbSolver, you can safely ignore this email.
      </p>
    </div>
  `;

  if (!client) {
    console.log(`[Email] Verification code for ${to}: ${code}`);
    console.log("[Email] (Resend not configured — email logged only)");
    return { success: true, logged: true };
  }

  try {
    const result = await client.emails.send({
      from: FROM,
      to,
      subject: `${code} is your ProbSolver verification code`,
      html,
    });

    console.log(`[Email] Verification sent to ${to}: ${result.id || "ok"}`);
    return { success: true, id: result.id };
  } catch (error) {
    console.error(`[Email] Failed to send to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

// ── Send password reset code email ─────────────────────
export async function sendPasswordResetEmail(to, username, code) {
  const client = getClient();

  const html = `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px;
                    background: linear-gradient(135deg, #ef4444, #eab308);
                    line-height: 48px; text-align: center; font-size: 20px; color: white;">
          🔑
        </div>
        <h1 style="font-size: 22px; font-weight: 800; color: #eeeef5; margin: 16px 0 4px;">
          Reset your password
        </h1>
        <p style="font-size: 14px; color: #9999bb; margin: 0;">
          Hi ${username}, we received a password reset request.
        </p>
      </div>

      <div style="background: #18181f; border: 1px solid rgba(255,255,255,0.09);
                  border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
        <p style="font-size: 13px; color: #9999bb; margin: 0 0 16px;">
          Enter this code to reset your password:
        </p>
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 36px; font-weight: 800;
                    letter-spacing: 8px; color: #ef4444; margin: 16px 0;">
          ${code}
        </div>
        <p style="font-size: 12px; color: #55556e; margin: 16px 0 0;">
          This code expires in 15 minutes. If you didn't request this, ignore this email.
        </p>
      </div>
    </div>
  `;

  if (!client) {
    console.log(`[Email] Reset code for ${to}: ${code}`);
    console.log("[Email] (Resend not configured — email logged only)");
    return { success: true, logged: true };
  }

  try {
    const result = await client.emails.send({
      from: FROM,
      to,
      subject: `${code} — Reset your ProbSolver password`,
      html,
    });

    console.log(`[Email] Reset email sent to ${to}: ${result.id || "ok"}`);
    return { success: true, id: result.id };
  } catch (error) {
    console.error(`[Email] Failed to send reset to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

// ── Send welcome email after verification ──────────────
export async function sendWelcomeEmail(to, username) {
  const client = getClient();

  const html = `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px;
                    background: linear-gradient(135deg, #22c55e, #3b82f6);
                    line-height: 48px; text-align: center; font-size: 20px; color: white;">
          🎉
        </div>
        <h1 style="font-size: 22px; font-weight: 800; color: #eeeef5; margin: 16px 0 4px;">
          Welcome to ProbSolver!
        </h1>
        <p style="font-size: 14px; color: #9999bb; margin: 0;">
          Your email is verified, ${username}. You're all set.
        </p>
      </div>

      <div style="background: #18181f; border: 1px solid rgba(255,255,255,0.09);
                  border-radius: 16px; padding: 24px; margin-bottom: 24px;">
        <h3 style="font-size: 14px; color: #eeeef5; margin: 0 0 12px;">
          Here's what to do next:
        </h3>
        <div style="font-size: 13px; color: #9999bb; line-height: 2;">
          📋 Browse problems and start solving<br/>
          🏗️ Try system design and behavioral questions<br/>
          🧠 Take a quiz on any subject<br/>
          ⏱ Run an interview simulation<br/>
          📊 Check your 6D intelligence report
        </div>
      </div>

      <p style="font-size: 12px; color: #55556e; text-align: center;">
        ProbSolver — Team Interview Intelligence Platform
      </p>
    </div>
  `;

  if (!client) {
    console.log(`[Email] Welcome email for ${to} (logged only)`);
    return { success: true, logged: true };
  }

  try {
    await client.emails.send({
      from: FROM,
      to,
      subject: `Welcome to ProbSolver, ${username}! 🎉`,
      html,
    });
    return { success: true };
  } catch (error) {
    console.error(`[Email] Welcome email failed for ${to}:`, error.message);
    return { success: false };
  }
}

// ── Generate a 6-digit verification code ───────────────
export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Check if email service is configured ───────────────
export function isEmailEnabled() {
  return !!process.env.RESEND_API_KEY;
}
