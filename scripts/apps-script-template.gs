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
    if (key !== SECRET_KEY) {
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

// ─── Feedback ───────────────────────────────────────────
function handleFeedback(p) {
  const sheet = getSheet(FEEDBACK_TAB, ['Timestamp', 'Quiz Type', 'Top Class', 'Rating', 'Recommend', 'Comment']);
  sheet.appendRow([
    new Date(),
    p.quizType || '',
    p.topClass || '',
    p.rating   || '',
    p.recommend || '',
    p.comment  || ''
  ]);
  notifySlack(`📝 New feedback: ${p.quizType || '?'} — ${p.rating || '?'}★ — ${p.comment ? '"' + p.comment.slice(0, 140) + '"' : '(no comment)'}`);
  return ok();
}

// ─── Subscribe ──────────────────────────────────────────
function handleSubscribe(p) {
  const email = (p.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') === -1) {
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
  sheet.appendRow([email, p.source || 'unknown', new Date(), true]);
  notifySlack(`✉️ New subscriber: ${email} (source: ${p.source || '?'})`);
  return ok();
}

// ─── Unsubscribe ────────────────────────────────────────
function handleUnsubscribe(p) {
  const email = (p.email || '').trim().toLowerCase();
  if (!email) return ContentService.createTextOutput('invalid_email').setMimeType(ContentService.MimeType.TEXT);
  const sheet = getSheet(SUBSCRIBERS_TAB, ['Email', 'Source', 'Signup Date', 'Active']);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().toLowerCase() === email) {
      sheet.getRange(i + 1, 4).setValue(false);
    }
  }
  return ok();
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
