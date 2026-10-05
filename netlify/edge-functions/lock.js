// Locks the whole site. Nothing is served until the visitor has signed in on the login page.
// Signing in is handled by /api/session, which sets a signed session cookie; this file only
// checks that cookie, so it stays fast. If EDIT_PASSWORD is missing the site stays closed.
export const config = { path: "/*" };

const enc = new TextEncoder();
const OPEN_PATHS = new Set(["/api/session", "/api/logout"]);

function bytes(b64url) {
  let s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function signedIn(req, secret) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)fp_session=([^;]+)/);
  if (!m) return false;
  const [body, sig] = m[1].split(".");
  if (!body || !sig) return false;
  try {
    const raw = await crypto.subtle.digest("SHA-256", enc.encode("floorplan-session:" + secret));
    const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("HMAC", key, bytes(sig), enc.encode(body)))) return false;
    const p = JSON.parse(new TextDecoder().decode(bytes(body)));
    return typeof p.e === "number" && p.e > Date.now() / 1000;
  } catch {
    return false;
  }
}

const loginPage = (failed) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Board 2027 floorplan · Sign in</title>
<style>
:root{--bg:#e7e9e4;--panel:#fafaf7;--fg:#1d2321;--muted:#5d6661;--line:#c9cdc6;--accent:#e2621b}
@media (prefers-color-scheme:dark){:root{--bg:#141817;--panel:#1c211f;--fg:#e8ebe6;--muted:#9aa39d;--line:#39413d;--accent:#f07a35;color-scheme:dark}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px;box-sizing:border-box}
form{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:24px;display:grid;gap:12px;width:100%;max-width:320px;box-sizing:border-box}
h1{font-size:22px;margin:0}
p{margin:0;color:var(--muted);font-size:13px}
label{display:grid;gap:4px;font-size:13px;color:var(--muted)}
input{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:8px}
button{font:inherit;font-weight:600;color:#fff;background:var(--fg);border:0;border-radius:4px;padding:9px;cursor:pointer}
@media (prefers-color-scheme:dark){button{color:#141817}}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.err{color:var(--accent)}
</style></head><body>
<form method="post" action="/api/session">
  <h1>Board 2027 floorplan</h1>
  <p>Sign in to view the plan. If you were given only a password, leave the username empty.</p>
  ${failed ? '<p class="err" role="alert">That username or password didn’t work.</p>' : ""}
  <label>Username<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
  <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Sign in</button>
</form>
</body></html>`;

export default async (req, context) => {
  const secret = Netlify.env.get("EDIT_PASSWORD") || "";
  if (!secret) {
    return new Response("This site is locked: EDIT_PASSWORD has not been set in Netlify.", {
      status: 503,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }
  const url = new URL(req.url);
  if (OPEN_PATHS.has(url.pathname)) return context.next();
  if (await signedIn(req, secret)) return context.next();

  const wantsPage = req.method === "GET" && (req.headers.get("accept") || "").includes("text/html");
  if (!wantsPage) {
    return new Response(JSON.stringify({ code: "not_granted", message: "Sign in required" }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return new Response(loginPage(url.searchParams.get("login") === "failed"), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
};
