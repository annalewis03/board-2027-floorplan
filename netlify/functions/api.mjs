// Board 2027 floorplan API
//   POST   /api/session       anyone: sign in (form post), sets the session cookie
//   POST   /api/logout        anyone: sign out
//   GET    /api/me            signed in: who am I and what may I do
//   GET    /api/stands        signed in: all saved stands
//   PUT    /api/stands/:key   editors: save one stand
//   DELETE /api/stands/:key   editors: clear one stand
//   POST   /api/design        editors: ask Claude for a stand design
//   GET    /api/users         owner: list personal logins
//   POST   /api/users         owner: create or replace a login
//   DELETE /api/users/:name   owner: remove a login
// Settings (Netlify > Environment variables):
//   EDIT_PASSWORD      required. The owner password: full access, manages logins. Also signs sessions.
//   VIEW_PASSWORD      optional. A shared view-only password. Delete it to allow personal logins only.
//   ANTHROPIC_API_KEY  required for "Design with Claude"
//   CLAUDE_MODEL       optional, defaults to a fast model
import { getStore } from "@netlify/blobs";
import { timingSafeEqual, createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

export const config = { path: "/api/*" };

const STORE = "board-2027";
const BLOB = "stands";
const USERS = "users";
const KEY_RE = /^[A-Z]\d{2}(-\d{2})?$/;
const USER_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const SESSION_SECONDS = 8 * 60 * 60;
const PBKDF2_ROUNDS = 100000;

// What the plan looked like when the site was first exported. Used until the first save.
const INITIAL = {
  "G10": {
    "accent": "#1f6fb2",
    "brief": "BOARD design (blue and green) with similar structure to now, less congested in the stand",
    "design": "custom",
    "example": false,
    "extras": {
      "fascia": true,
      "halo": false,
      "plant": false,
      "store": false,
      "tv": false
    },
    "floor": "charcoal",
    "items": [
      {
        "color": "",
        "d": 1,
        "h": 1,
        "r": 0.3,
        "rot": 0,
        "text": "",
        "type": "counter",
        "w": 1,
        "x": -0.9,
        "y": 0,
        "z": -0.1
      },
      {
        "color": "",
        "d": 1,
        "h": 1,
        "r": 0.3,
        "rot": 0,
        "text": "",
        "type": "stool",
        "w": 1,
        "x": -0.9,
        "y": 0,
        "z": -0.65
      },
      {
        "color": "",
        "d": 1,
        "h": 1,
        "r": 0.3,
        "rot": 0,
        "text": "",
        "type": "meetingTable",
        "w": 1,
        "x": 0.6,
        "y": 0,
        "z": -0.1
      },
      {
        "color": "",
        "d": 1,
        "h": 1,
        "r": 0.3,
        "rot": 90,
        "text": "",
        "type": "chair",
        "w": 1,
        "x": -0.1,
        "y": 0,
        "z": -0.1
      },
      {
        "color": "",
        "d": 1,
        "h": 1,
        "r": 0.3,
        "rot": 270,
        "text": "",
        "type": "chair",
        "w": 1,
        "x": 1.25,
        "y": 0,
        "z": -0.1
      },
      {
        "color": "",
        "d": 1,
        "h": 1,
        "r": 0.3,
        "rot": 0,
        "text": "",
        "type": "pod",
        "w": 1,
        "x": 0.3,
        "y": 0,
        "z": -1
      },
      {
        "color": "#1f6fb2",
        "d": 1,
        "h": 1.4,
        "r": 0.3,
        "rot": 0,
        "text": "Grow Beyond",
        "type": "panel",
        "w": 0.8,
        "x": -1,
        "y": 1,
        "z": 0
      },
      {
        "color": "#2e8b57",
        "d": 1,
        "h": 1.4,
        "r": 0.3,
        "rot": 0,
        "text": "Build the Future",
        "type": "panel",
        "w": 0.8,
        "x": 1,
        "y": 1,
        "z": 0
      },
      {
        "color": "#1f6fb2",
        "d": 1.2,
        "h": 1,
        "r": 0.3,
        "rot": 0,
        "text": "",
        "type": "rug",
        "w": 1.6,
        "x": 0.6,
        "y": 0,
        "z": -0.1
      }
    ],
    "sponsor": "BOARD",
    "status": "available",
    "wall": "#173c30"
  },
  "H01-02": {
    "accent": "#2f7f29",
    "brief": "",
    "design": "reception",
    "example": true,
    "extras": {
      "fascia": true,
      "halo": false,
      "plant": false,
      "store": false,
      "tv": false
    },
    "floor": "grey",
    "items": [],
    "sponsor": "BOARD",
    "status": "available",
    "wall": "#1b429d"
  }
};

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
const fail = (status, code, message) => json({ code, message }, status);

const same = (a, b) => {
  const h = (v) => createHash("sha256").update(v).digest();
  return timingSafeEqual(h(a), h(b));
};
const b64u = (v) => Buffer.from(v).toString("base64url");
const sessionKey = () => createHash("sha256").update("floorplan-session:" + (process.env.EDIT_PASSWORD || "")).digest();
const hashPassword = (password, salt, rounds) => pbkdf2Sync(password, salt, rounds, 32, "sha256");
const cookie = (value, maxAge) => `fp_session=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

function signSession(user, role) {
  const body = b64u(JSON.stringify({ u: user, r: role, e: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  return body + "." + b64u(createHmac("sha256", sessionKey()).update(body).digest());
}

function readSession(req) {
  if (!process.env.EDIT_PASSWORD) return null;
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)fp_session=([^;]+)/);
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig) return null;
  try {
    const want = createHmac("sha256", sessionKey()).update(body).digest();
    const got = Buffer.from(sig, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof p.e !== "number" || p.e <= Date.now() / 1000) return null;
    return { user: typeof p.u === "string" ? p.u : null, role: p.r };
  } catch {
    return null;
  }
}

const getUsers = async (store) => (await store.get(USERS, { type: "json", consistency: "strong" })) || {};

// Who is asking. A personal login is re-checked against the saved logins on every request,
// so removing a login or changing its role takes effect straight away for the data.
async function identify(req, store) {
  const s = readSession(req);
  if (!s) return null;
  if (s.user === null) return s.role === "admin" || s.role === "viewer" ? { user: null, role: s.role } : null;
  const u = (await getUsers(store))[s.user];
  return u ? { user: s.user, role: u.role === "editor" ? "editor" : "viewer" } : null;
}

async function checkLogin(store, username, password) {
  const edit = process.env.EDIT_PASSWORD || "", view = process.env.VIEW_PASSWORD || "";
  if (!edit || !password) return null;
  const name = String(username || "").trim().toLowerCase();
  if (!name) {
    if (same(password, edit)) return { user: null, role: "admin" };
    if (view && same(password, view)) return { user: null, role: "viewer" };
    return null;
  }
  if (!USER_RE.test(name)) return null;
  const u = (await getUsers(store))[name];
  if (!u) return null;
  const got = hashPassword(password, Buffer.from(u.salt, "base64"), u.rounds || PBKDF2_ROUNDS);
  const want = Buffer.from(u.hash, "base64");
  return got.length === want.length && timingSafeEqual(got, want)
    ? { user: name, role: u.role === "editor" ? "editor" : "viewer" }
    : null;
}

// read-modify-write with a retry, so two people saving at once don't lose either change
async function mutate(store, key, initial, change) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    const current = res && res.data != null ? res.data : initial;
    const etag = res && res.data != null ? res.etag || null : null;
    const next = { ...current };
    change(next);
    const out = await store.setJSON(key, next, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (!out || out.modified !== false) return next;
  }
  throw new Error("busy");
}

async function readStands(store) {
  const data = await store.get(BLOB, { type: "json", consistency: "strong" });
  return data == null ? INITIAL : data;
}

async function design(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fail(503, "not_configured", "ANTHROPIC_API_KEY is not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (r.status === 429) return fail(429, "rate_limited", "Claude is busy");
  if (!r.ok) return fail(502, "unavailable", "Claude request failed (" + r.status + ")");
  const out = await r.json();
  const text = (out.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  try {
    return json({ design: JSON.parse(text.slice(a, b + 1)) });
  } catch {
    return fail(422, "invalid_json", "Claude's reply was not valid JSON");
  }
}

const redirect = (to, headers = {}) => new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", ...headers } });

export default async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [resource, key] = parts;
  const store = getStore(STORE);
  try {
    // sign in and out: plain form posts from the login page and the Sign out button
    if (resource === "session" && req.method === "POST") {
      const form = await req.formData().catch(() => null);
      const who = form ? await checkLogin(store, form.get("username"), String(form.get("password") || "")) : null;
      if (!who) {
        await new Promise((r) => setTimeout(r, 500)); // slow down guessing
        return redirect("/?login=failed");
      }
      return redirect("/", { "set-cookie": cookie(signSession(who.user, who.role), SESSION_SECONDS) });
    }
    if (resource === "logout" && req.method === "POST") return redirect("/", { "set-cookie": cookie("", 0) });

    const me = await identify(req, store);
    if (!me) return fail(401, "not_granted", "Sign in required");

    // changes must come from this site's own pages
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== url.host) return fail(403, "not_granted", "Cross-site request refused");
    }
    const canEdit = me.role === "editor" || me.role === "admin";

    if (resource === "me" && req.method === "GET") return json({ user: me.user, role: me.role });
    if (resource === "stands" && !key && req.method === "GET") return json({ stands: await readStands(store) });

    if (resource === "stands" && key && (req.method === "PUT" || req.method === "DELETE")) {
      if (!canEdit) return fail(403, "not_granted", "View-only login");
      if (!KEY_RE.test(key)) return fail(400, "invalid_argument", "Unknown stand");
      if (req.method === "DELETE") {
        await mutate(store, BLOB, INITIAL, (s) => { delete s[key]; });
        return json({ ok: true });
      }
      const raw = await req.text();
      if (raw.length > 20000) return fail(413, "invalid_argument", "Stand data too large");
      let data;
      try { data = JSON.parse(raw); } catch { return fail(400, "invalid_argument", "Bad JSON"); }
      if (!data || typeof data !== "object" || Array.isArray(data)) return fail(400, "invalid_argument", "Bad stand data");
      await mutate(store, BLOB, INITIAL, (s) => { s[key] = data; });
      return json({ ok: true });
    }

    if (resource === "design" && req.method === "POST") {
      if (!canEdit) return fail(403, "not_granted", "View-only login");
      const body = await req.json().catch(() => null);
      const prompt = body && typeof body.prompt === "string" ? body.prompt : "";
      if (!prompt || prompt.length > 12000) return fail(400, "invalid_argument", "Bad prompt");
      return await design(prompt);
    }

    if (resource === "users") {
      if (me.role !== "admin") return fail(403, "not_granted", "Owner only");
      if (req.method === "GET" && !key) {
        const users = await getUsers(store);
        return json({ users: Object.entries(users).map(([name, u]) => ({ name, role: u.role, created: u.created })).sort((a, b) => a.name.localeCompare(b.name)) });
      }
      if (req.method === "POST" && !key) {
        const body = await req.json().catch(() => null);
        const name = body && typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
        const password = body && typeof body.password === "string" ? body.password : "";
        const role = body && body.role === "editor" ? "editor" : "viewer";
        if (!USER_RE.test(name)) return fail(400, "invalid_argument", "Username: 2 to 32 letters, numbers, dots, dashes or underscores");
        if (password.length < 8 || password.length > 200) return fail(400, "invalid_argument", "Password: at least 8 characters");
        const salt = randomBytes(16);
        const record = { role, salt: salt.toString("base64"), hash: hashPassword(password, salt, PBKDF2_ROUNDS).toString("base64"), rounds: PBKDF2_ROUNDS, created: new Date().toISOString() };
        await mutate(store, USERS, {}, (u) => { u[name] = record; });
        return json({ ok: true, name, role });
      }
      if (req.method === "DELETE" && key) {
        const name = key.toLowerCase();
        if (!USER_RE.test(name)) return fail(400, "invalid_argument", "Unknown login");
        await mutate(store, USERS, {}, (u) => { delete u[name]; });
        return json({ ok: true });
      }
    }
    return fail(404, "not_found", "No such route");
  } catch (e) {
    return fail(503, "unavailable", "Storage is busy, try again");
  }
};
