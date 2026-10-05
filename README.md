# Board 2027 floorplan — Netlify site

An editable 3D floorplan, locked behind a password. Nothing loads until the browser's
password box is answered. A second password unlocks editing and "Design with Claude".

## What's in this folder

| Path | What it is |
|---|---|
| `public/index.html` | The whole page (3D hall, editor, stand list) |
| `netlify/edge-functions/lock.js` | The lock on the whole site: asks for a password before anything loads |
| `netlify/functions/api.mjs` | Server code: saves bookings, checks the passwords, calls Claude |
| `netlify.toml`, `package.json` | Settings Netlify reads when it builds the site |

## Deploy

This repository is connected to Netlify. Any change pushed to `main` redeploys the site
within a minute or two. Never deploy by dragging files onto Netlify: that skips the
server code, including the password lock.

## Settings to add in Netlify (environment variables)

| Name | Value |
|---|---|
| `VIEW_PASSWORD` | The password for viewing. Required: the site stays closed until it is set. |
| `EDIT_PASSWORD` | A different password for your team. Required for editing. |
| `ANTHROPIC_API_KEY` | Your Anthropic API key. Required for "Design with Claude". |
| `CLAUDE_MODEL` | Optional. Leave unset for the fast default (`claude-haiku-4-5-20251001`). |

Redeploy after changing any of these.

## Using it

- **View:** open the site address. The browser asks for a username and password: leave the
  username blank and enter the view password. (The edit password also works here.)
- **Edit:** press "Editor sign in" (top left), enter the edit password, then click a stand.
- **Other people's changes** appear within about 5 seconds.
- The sign-in lasts until the browser tab is closed.

## Good to know

- Bookings are kept in Netlify's built-in storage for this site, so they survive redeploys.
- The page starts with the two stands that were on the plan when this was exported (G10 and H01-02).
- Each password is shared. To remove someone's access, change `VIEW_PASSWORD` or `EDIT_PASSWORD` and redeploy.
- Check the lock after every deploy: open the site in a private window and confirm it asks for a password.
- Browsers remember the view password until they are closed; there is no sign-out for viewing.
- "Design with Claude" is billed to your Anthropic API account, and only signed-in editors can use it.
- Merging or splitting plots, and adding hand-built stands, still means editing `public/index.html`.
