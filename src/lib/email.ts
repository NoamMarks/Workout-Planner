/**
 * Email Service — Resend API integration
 *
 * Uses the Resend REST API directly via fetch (browser-compatible).
 * Falls back to console logging when VITE_RESEND_API_KEY is not set.
 *
 * Security note: In production, API calls should go through a backend proxy.
 * This direct approach is acceptable for the current SPA prototype.
 */

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY as string | undefined;
const FROM_ADDRESS = 'IronTrack <onboarding@resend.dev>';

function isResendConfigured(): boolean {
  return !!RESEND_API_KEY && RESEND_API_KEY !== '';
}

// ─── HTML Template ──────────────────────────────────────────────────────────

function buildEmailHtml(code: string, purpose: 'signup' | 'reset'): string {
  const title = purpose === 'signup' ? 'Verify Your Email' : 'Password Reset';
  const subtitle = purpose === 'signup'
    ? 'Enter this code to complete your IronTrack registration.'
    : 'Enter this code to reset your IronTrack password.';
  const footer = purpose === 'signup'
    ? 'If you didn\'t create an account, you can safely ignore this email.'
    : 'If you didn\'t request a password reset, you can safely ignore this email. This code expires in 10 minutes.';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" style="max-width:480px;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="display:inline-block;background:#fff;width:40px;height:40px;line-height:40px;text-align:center;font-weight:900;font-size:18px;color:#0a0a0a;">
                IT
              </div>
              <span style="display:block;color:#fff;font-size:14px;font-weight:700;letter-spacing:4px;text-transform:uppercase;font-family:'Courier New',monospace;margin-top:8px;">
                IRONTRACK
              </span>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <h1 style="color:#ffffff;font-size:28px;font-weight:700;margin:0;font-style:italic;letter-spacing:-0.5px;">
                ${title}
              </h1>
            </td>
          </tr>
          <!-- Subtitle -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="color:#a1a1aa;font-size:12px;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:2px;margin:0;">
                ${subtitle}
              </p>
            </td>
          </tr>
          <!-- Code box -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="background:#141414;border:1px solid #27272a;padding:24px 40px;display:inline-block;">
                <span style="font-family:'Courier New',monospace;font-size:40px;font-weight:700;letter-spacing:12px;color:#22c55e;">
                  ${code}
                </span>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="border-top:1px solid #27272a;padding-top:24px;">
              <p style="color:#52525b;font-size:11px;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1px;margin:0;line-height:1.6;">
                ${footer}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Send via Resend API ────────────────────────────────────────────────────

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn('[IronTrack Email] Resend API error:', res.status, body);
      return false;
    }
    console.log(`%c[IronTrack Email] Sent to ${to}`, 'color: #22c55e; font-weight: bold;');
    return true;
  } catch (err) {
    console.warn('[IronTrack Email] Network error:', err);
    return false;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function sendVerificationEmailViaResend(email: string, code: string): Promise<void> {
  if (isResendConfigured()) {
    const html = buildEmailHtml(code, 'signup');
    const sent = await sendViaResend(email, 'IronTrack — Verify Your Email', html);
    if (sent) return;
  }
  // Fallback to console
  console.log(
    `%c[IronTrack Verification] Code for ${email}: ${code}`,
    'color: #22c55e; font-weight: bold; font-size: 14px;'
  );
}

export async function sendPasswordResetEmailViaResend(email: string, code: string): Promise<void> {
  if (isResendConfigured()) {
    const html = buildEmailHtml(code, 'reset');
    const sent = await sendViaResend(email, 'IronTrack — Password Reset Code', html);
    if (sent) return;
  }
  // Fallback to console
  console.log(
    `%c[PASSWORD RESET CODE] Code for ${email}: ${code}`,
    'color: #f59e0b; font-weight: bold; font-size: 14px;'
  );
}