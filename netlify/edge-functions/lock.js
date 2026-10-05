// Locks the whole site: the browser asks for a password before any page or data loads.
// Accepts VIEW_PASSWORD (viewers) or EDIT_PASSWORD (editors). The username box can be left blank.
// If VIEW_PASSWORD is not set the site stays closed, so a missing setting can never expose it.
export const config = { path: "/*" };

const ask = (status, text) =>
  new Response(text, {
    status,
    headers: {
      "www-authenticate": 'Basic realm="Board 2027 floorplan", charset="UTF-8"',
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });

async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest("SHA-256", enc.encode(v))));
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}

function passwordFrom(req) {
  const h = req.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("basic ")) return null;
  try {
    const bytes = Uint8Array.from(atob(h.slice(6).trim()), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const i = text.indexOf(":");
    return i < 0 ? null : text.slice(i + 1);
  } catch {
    return null;
  }
}

export default async (req, context) => {
  const view = Netlify.env.get("VIEW_PASSWORD") || "";
  const edit = Netlify.env.get("EDIT_PASSWORD") || "";
  if (!view) return new Response("This site is locked: VIEW_PASSWORD has not been set in Netlify.", { status: 503, headers: { "cache-control": "no-store" } });
  const given = passwordFrom(req);
  if (given === null || given === "") return ask(401, "Password required.");
  const ok = (await same(given, view)) || (edit !== "" && (await same(given, edit)));
  if (!ok) return ask(401, "Password required.");
  return context.next();
};
