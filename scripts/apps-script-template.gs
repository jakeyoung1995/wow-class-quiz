/**
 * Google Apps Script — WoW Class Quiz backend
 * --------------------------------------------
 * Handles three POST types from the website:
 *   - type: 'feedback'  → appends a row to the Feedback sheet
 *   - type: 'subscribe' → adds an email to the Subscribers sheet
 *   - type: 'unsubscribe' → removes an email from the Subscribers sheet
 *
 * And one GET that the tier-update Python script calls:
 *   - GET /exec?action=list_subscribers&key=YOUR_SECRET → returns JSON array of emails
 *
 * Setup:
 *   1. Open https://script.google.com → New project
 *   2. Paste this file into Code.gs
 *   3. Create a new Google Sheet, copy its ID (the long string in the URL)
 *   4. Put it in the SHEET_ID constant below
 *   5. Set SECRET_KEY below to a random string (also set it as GitHub Secret SUBSCRIBER_FETCH_KEY)
 *   6. Deploy → New Deployment → Web App → Execute as: Me → Access: Anyone
 *   7. Copy the Web App URL. That's your endpoint.
 *      - For feedback + subscribe: it's the same URL the existing widget already posts to
 *      - For the tier updater: set GitHub Secret SUBSCRIBER_FETCH_URL to: <web app url>?action=list_subscribers
 */

const SHEET_ID    = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';   // The Sheet that backs this script
const SECRET_KEY  = 'PASTE_A_RANDOM_STRING_HERE';        // Used to authenticate the tier script GET

const FEEDBACK_TAB    = 'Feedback';
const SUPPORT_TAB     = 'Support';
const SUBSCRIBERS_TAB = 'Subscribers';

// Optional Slack webhook for new-subscriber pings. Leave blank to disable.
// If you want this, create an Incoming Webhook in Slack and paste the URL below.
// Format: https://hooks.slack.com/services/{TEAM_ID}/{CHANNEL_ID}/{TOKEN}
const SLACK_WEBHOOK = '';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const type = (payload.type || '').toLowerCase();

    if (type === 'subscribe') {
      return handleSubscribe(payload);
    }
    if (type === 'unsubscribe') {
      return handleUnsubscribe(payload);
    }
    if (type === 'support') {
      return handleSupport(payload);
    }
    // Default: treat as feedback (preserves backward compatibility with the existing widget)
    return handleFeedback(payload);

  } catch (err) {
    return ContentService.createTextOutput('error: ' + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function doGet(e) {
  const action = (e.parameter.action || '').toLowerCase();
  const key = e.parameter.key || '';

  if (action === 'list_subscribers') {
    if (!secureEquals(key, SECRET_KEY)) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const emails = listSubscribers();
    return ContentService.createTextOutput(JSON.stringify({ emails: emails }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput('ok')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ─── Safety helpers ─────────────────────────────────────
/**
 * Neutralise spreadsheet formula injection.
 *
 * Everything written to the sheet arrives from a public endpoint that is
 * embedded in the site's HTML, so anyone can post anything. A value starting
 * with = + - or @ is executed as a formula when the sheet is opened, which
 * can exfiltrate other cells (=IMPORTXML(...&A1)) or just corrupt the sheet.
 * Prefixing with an apostrophe forces Sheets to treat it as literal text.
 */
function safeCell(value) {
  var text = (value === null || value === undefined) ? '' : String(value);
  if (text.length > 1000) text = text.slice(0, 1000);   // bound runaway input
  if (/^[=+\-@\t\r]/.test(text)) return "'" + text;
  return text;
}

/** Basic shape check — not RFC-complete, just enough to reject junk. */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

// ─── Feedback ───────────────────────────────────────────
function handleFeedback(p) {
  const sheet = getSheet(FEEDBACK_TAB, ['Timestamp', 'Quiz Type', 'Top Class', 'Rating', 'Recommend', 'Comment']);
  sheet.appendRow([
    new Date(),
    safeCell(p.quizType),
    safeCell(p.topClass),
    safeCell(p.rating),
    safeCell(p.recommend),
    safeCell(p.comment)
  ]);
  notifySlack('📝 New feedback: ' + String(p.quizType || '?') + ' — ' + String(p.rating || '?') +
              '★ — ' + (p.comment ? '"' + String(p.comment).slice(0, 140) + '"' : '(no comment)'));
  return ok();
}

// ─── Support ────────────────────────────────────────────
// Gets its own tab so support requests are not buried among star ratings.
// Until this is deployed, support messages fall through to handleFeedback with
// quizType 'support' — nothing is lost either way, so redeploying is an
// improvement rather than a prerequisite.
function handleSupport(p) {
  const sheet = getSheet(SUPPORT_TAB, ['Timestamp', 'Email', 'Message', 'Context', 'Status']);
  sheet.appendRow([
    new Date(),
    safeCell(p.email),
    safeCell(p.message),
    safeCell(p.context),
    'new'
  ]);
  notifySlack('🆘 Support request from ' + String(p.email || 'unknown') + ': "' +
              String(p.message || '').slice(0, 200) + '"');
  return ok();
}

// ─── Subscribe ──────────────────────────────────────────
function handleSubscribe(p) {
  const email = (p.email || '').trim().toLowerCase();
  // indexOf('@') accepted "@" and "a@b" — anything with an at-sign became a
  // real recipient for the weekly tier-shift mailout.
  if (!isValidEmail(email)) {
    return ContentService.createTextOutput('invalid_email').setMimeType(ContentService.MimeType.TEXT);
  }
  const sheet = getSheet(SUBSCRIBERS_TAB, ['Email', 'Source', 'Signup Date', 'Active']);
  const data = sheet.getDataRange().getValues();
  // Skip if already subscribed
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().toLowerCase() === email && data[i][3] !== false) {
      return ok();
    }
  }
  sheet.appendRow([safeCell(email), safeCell(p.source || 'unknown'), new Date(), true]);
  notifySlack(`✉️ New subscriber: ${email} (source: ${p.source || '?'})`);
  return ok();
}

// ─── Unsubscribe ────────────────────────────────────────
function handleUnsubscribe(p) {
  const email = (p.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return ContentService.createTextOutput('invalid_email').setMimeType(ContentService.MimeType.TEXT);
  }
  // Require the per-address token. Without this anyone who knows a subscriber's
  // address can unsubscribe them by posting a single request.
  if ((p.token || '') !== unsubscribeToken(email)) {
    return ContentService.createTextOutput('invalid_token').setMimeType(ContentService.MimeType.TEXT);
  }
  const sheet = getSheet(SUBSCRIBERS_TAB, ['Email', 'Source', 'Signup Date', 'Active']);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().toLowerCase() === email) {
      sheet.getRange(i + 1, 4).setValue(false);
    }
  }
  return ok();
}

/**
 * Deterministic per-address unsubscribe token: HMAC(email, SECRET_KEY),
 * truncated. Deterministic so the mailer can regenerate it without storing
 * anything extra, and unguessable without SECRET_KEY.
 */
function unsubscribeToken(email) {
  const raw = Utilities.computeHmacSha256Signature(email, SECRET_KEY);
  return raw.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('').slice(0, 20);
}

// ─── List subscribers (for tier-shift email script) ─────
function listSubscribers() {
  const sheet = getSheet(SUBSCRIBERS_TAB, ['Email', 'Source', 'Signup Date', 'Active']);
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] && row[3] !== false) out.push((row[0] || '').toString().trim().toLowerCase());
  }
  return out;
}

// ─── Helpers ───────────────────────────────────────────
function getSheet(name, headers) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) sheet.appendRow(headers);
  }
  return sheet;
}

/** Length-independent comparison, so a wrong key leaks no timing signal. */
function secureEquals(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ok() {
  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}

function notifySlack(text) {
  if (!SLACK_WEBHOOK) return;
  try {
    UrlFetchApp.fetch(SLACK_WEBHOOK, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
  } catch (err) {
    // ignore
  }
}
