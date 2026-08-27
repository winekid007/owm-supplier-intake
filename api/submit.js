const Busboy = require("busboy");

const PARENT_FOLDER_ID =
  process.env.DRIVE_PARENT_FOLDER_ID || "1pmImjkziGdmUpCo2TWWc5wHcwLXl1EbX";

const NOTIFY_TO = [
  "info@onewinemarket.com",
  "erika@onewinemarket.com",
  "info@shopwineslash.com",
];

const FIELD_LABELS = {
  supplier_company: "Supplier / winery",
  contact_name: "Contact name",
  email: "Email",
  phone: "Phone",
  website: "Website",
  account_for: "Set up on this account",
  product_name: "Catalog product name",
  brand: "Brand / producer",
  wine_name: "Wine / cuvee",
  vintage: "Vintage",
  varietal: "Varietal / blend",
  appellation: "Appellation / AVA",
  region_country: "Region / country",
  wine_type: "Wine type",
  bottle_size: "Bottle size",
  case_pack: "Bottles per case",
  sku: "SKU / producer code",
  upc: "UPC / GTIN",
  abv: "Alcohol %",
  closure: "Closure",
  trade_bottle_price: "Trade bottle price",
  srp: "Suggested retail (SRP)",
  cost_fob: "Cost / FOB to OneWineMarket",
  case_price: "One-case total",
  two_case_bottle_price: "Two-case bottle price",
  three_case_bottle_price: "Three-case / restaurant bottle price",
  channel: "Channel",
  min_order_bottles: "Minimum order (bottles)",
  inventory_available: "Inventory available",
  ship_from: "Ship-from / warehouse",
  allocation_notes: "Allocation notes",
  tasting_notes: "Tasting notes",
  producer_story: "Producer / farming story",
  pairing_notes: "Pairing notes",
  scores_press: "Scores / press",
  video_url: "Video URL",
  document_links: "Document links",
  other_notes: "Other notes",
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { files: 20, fileSize: 12 * 1024 * 1024, fields: 80 },
    });
    const fields = {};
    const files = [];
    bb.on("field", (name, val) => {
      fields[name] = val;
    });
    bb.on("file", (name, stream, info) => {
      const chunks = [];
      let truncated = false;
      stream.on("limit", () => {
        truncated = true;
      });
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", () => {
        const buffer = Buffer.concat(chunks);
        if (!info.filename || !buffer.length) return;
        files.push({
          field: name,
          filename: info.filename,
          mime: info.mimeType || "application/octet-stream",
          buffer,
          truncated,
        });
      });
    });
    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, files }));
    req.pipe(bb);
  });
}

async function googleAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN || "",
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error("Google Drive authorization failed. Check intake credentials.");
  }
  return json.access_token;
}

async function driveJson(token, path, init) {
  const resp = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await resp.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(json.error?.message || `Drive HTTP ${resp.status}`);
  }
  return json;
}

function safeName(value, fallback) {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function formatBody(fields, folderUrl, uploaded) {
  const lines = ["OneWineMarket supplier product submission", ""];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const val = (fields[key] || "").trim();
    if (val) lines.push(`${label}: ${val}`);
  }
  lines.push("");
  lines.push(`Google Drive folder: ${folderUrl}`);
  if (uploaded.length) {
    lines.push("Uploaded files:");
    for (const f of uploaded) lines.push(`- ${f.name} (${f.link})`);
  } else {
    lines.push("No files uploaded.");
  }
  return lines.join("\n");
}

async function createFolder(token, name) {
  return driveJson(token, "/files?fields=id,webViewLink,name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [PARENT_FOLDER_ID],
    }),
  });
}

async function uploadFile(token, folderId, file) {
  const metadata = {
    name: file.filename,
    parents: [folderId],
  };
  const boundary = "owm_intake_" + Date.now();
  const head =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${file.mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([
    Buffer.from(head, "utf8"),
    file.buffer,
    Buffer.from(tail, "utf8"),
  ]);
  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || `Upload failed for ${file.filename}`);
  return json;
}

async function shareFolder(token, folderId) {
  for (const email of NOTIFY_TO) {
    try {
      await driveJson(token, `/files/${folderId}/permissions?sendNotificationEmail=false`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user",
          role: "writer",
          emailAddress: email,
        }),
      });
    } catch {
      // Sharing is best-effort; the owner still has the folder.
    }
  }
}

function thankYouText(fields) {
  const who = (fields.contact_name || fields.supplier_company || "there").trim();
  const wine = (fields.product_name || fields.wine_name || "your wine").trim();
  return [
    `Hi ${who},`,
    "",
    `Thank you for sending ${wine} to OneWineMarket.`,
    "",
    "We received the submission and will use it to set the product up in the account catalog. The team has been notified.",
    "",
    "If we need a bottle shot, tech sheet, or pricing clarification, we will reply to this email.",
    "",
    "OneWineMarket",
    "info@onewinemarket.com",
  ].join("\n");
}

async function sendEmails({ fields, folderUrl, uploaded, textBody }) {
  const wine =
    (fields.product_name || fields.wine_name || fields.brand || "New product").trim();
  const supplier = (fields.supplier_company || fields.contact_name || "Supplier").trim();
  const payload = {
    _subject: `Supplier product submission — ${supplier} — ${wine}`,
    _template: "box",
    _cc: NOTIFY_TO.slice(1).join(","),
    name: fields.contact_name || supplier,
    email: fields.email || "info@onewinemarket.com",
    company: fields.supplier_company || "",
    product: wine,
    drive_folder: folderUrl,
    files: uploaded.map((f) => f.name).join(", ") || "None",
    message: textBody,
  };
  if (fields.email) {
    payload._autoresponse = thankYouText(fields);
  }

  const resp = await fetch("https://formsubmit.co/ajax/info@onewinemarket.com", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  let json = {};
  try {
    json = await resp.json();
  } catch {
    json = {};
  }
  return { ok: resp.ok, status: resp.status, json };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  try {
    const { fields, files } = await parseForm(req);
    if ((fields.company_website || fields._gotcha || "").trim()) {
      res.status(200).json({ ok: true, skipped: true });
      return;
    }

    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      throw new Error("Drive credentials are not configured on the intake server.");
    }

    const token = await googleAccessToken();
    const folderName = [
      stamp(),
      safeName(fields.supplier_company, "Supplier"),
      safeName(fields.product_name || fields.wine_name, "Product"),
    ].join(" — ");
    const folder = await createFolder(token, folderName);
    await shareFolder(token, folder.id);

    const uploaded = [];
    for (const file of files) {
      if (file.truncated) continue;
      const saved = await uploadFile(token, folder.id, file);
      uploaded.push({
        name: saved.name,
        link: saved.webViewLink,
        id: saved.id,
      });
    }

    const textBody = formatBody(fields, folder.webViewLink, uploaded);
    const summary = {
      filename: "submission.txt",
      mime: "text/plain",
      buffer: Buffer.from(textBody, "utf8"),
    };
    await uploadFile(token, folder.id, summary);

    const email = await sendEmails({
      fields,
      folderUrl: folder.webViewLink,
      uploaded,
      textBody,
    });

    res.status(200).json({
      ok: true,
      folderUrl: folder.webViewLink,
      uploaded: uploaded.length,
      email,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || "Submission failed",
    });
  }
};

module.exports.config = {
  api: { bodyParser: false },
  maxDuration: 60,
};
