// Vercel serverless function: emails demo requests to Will via Resend.
// Requires env var RESEND_API_KEY (set in Vercel project settings).

const TO = 'will@dockpulse.io';
const FROM = 'DockPulse <noreply@mail.dockpulse.io>';

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function clean(s, max) {
  return String(s || '').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const wantsJson = (req.headers['content-type'] || '').includes('application/json');
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // Honeypot: bots fill hidden fields. Pretend success.
  if (body.dp_trap_7) {
    console.log('demo-request: honeypot filled, dropping');
    return wantsJson ? res.status(200).json({ ok: true }) : res.redirect(303, '/?sent=1#demo');
  }

  const name = clean(body.name, 120);
  const company = clean(body.company, 160);
  const email = clean(body.email, 200);
  const phone = clean(body.phone, 40);
  const fleet = clean(body.fleet_size, 40);
  const message = clean(body.message, 3000);

  if (!name || !company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Name, company, and a valid email are required.' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set');
    return res.status(500).json({ ok: false, error: 'Email is not configured.' });
  }

  const rows = [['Name', name], ['Company', company], ['Email', email], ['Phone', phone || '—'], ['Fleet size', fleet || '—'], ['Message', message || '—']];
  const html = `<h2 style="font-family:sans-serif">New DockPulse demo request</h2>
<table style="font-family:sans-serif;border-collapse:collapse">${rows.map(([k, v]) =>
    `<tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold;vertical-align:top">${k}</td><td style="padding:6px 12px;border:1px solid #ddd;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject: `Demo request: ${company} (${name})`,
        html,
        text,
      }),
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).json({ ok: false, error: 'Could not send.' });
    }
  } catch (e) {
    console.error('Resend fetch failed', e);
    return res.status(502).json({ ok: false, error: 'Could not send.' });
  }

  console.log('demo-request: sent via Resend for', company);
  return wantsJson ? res.status(200).json({ ok: true }) : res.redirect(303, '/?sent=1#demo');
};
