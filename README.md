# Board 2027 floorplan — Netlify site

An editable 3D floorplan, locked behind a sign-in page. Nothing loads until someone signs
in. The owner can create a personal login for each person, as view-only or as an editor.

## What's in this folder

| Path | What it is |
|---|---|
| `public/index.html` | The whole page (3D hall, editor, stand list) |
| `netlify/edge-functions/lock.js` | The lock on the whole site: shows the sign-in page until someone is signed in |
| `netlify/functions/api.mjs` | Server code: sign-in, personal logins, saved bookings, Claude |
| `netlify.toml`, `package.json` | Settings Netlify reads when it builds the site |

## Deploy

This repository is connected to Netlify. Any change pushed to `main` redeploys the site
within a minute or two. Never deploy by dragging files onto Netlify: that skips the
server code, including the password lock.

## Settings to add in Netlify (environment variables)

| Name | Value |
|---|---|
| `EDIT_PASSWORD` | The owner password. Required: the site stays closed until it is set. Full access, and the only way to manage logins. |
| `VIEW_PASSWORD` | Optional shared view-only password. Delete it if everyone should have a personal login. |
| `ANTHROPIC_API_KEY` | Your Anthropic API key. Required for "Design with Claude". |
| `CLAUDE_MODEL` | Optional. Leave unset for the fast default (`claude-haiku-4-5-20251001`). |

Redeploy after changing any of these.

## Using it

- **Owner:** on the sign-in page, leave the username empty and enter `EDIT_PASSWORD`.
- **Create a login for someone:** signed in as owner, press **Logins** (top left), enter a
  username, a password and whether they can edit, then press **Create login**. Send them the
  site address, username and password yourself. Passwords are stored scrambled and can't be shown again.
- **Reset someone's password:** create the login again with the same username.
- **Remove someone:** press **Remove** next to their name, then confirm.
- **Shared view password:** if `VIEW_PASSWORD` is set, anyone can sign in with an empty username and that password, view-only.
- **Edit:** owners and editors get the edit form when they click a stand.
- **Other people's changes** appear within about 5 seconds.
- A sign-in lasts 8 hours, or until **Sign out** is pressed.

## Good to know

- Bookings are kept in Netlify's built-in storage for this site, so they survive redeploys.
- The page starts with the two stands that were on the plan when this was exported (G10 and H01-02).
- A removed login loses the bookings and editing straight away. The empty hall can stay visible in a
  browser that was already signed in for up to 8 hours. To sign everyone out at once, change `EDIT_PASSWORD` and redeploy.
- Check the lock after every deploy: open the site in a private window and confirm it shows the sign-in page.
- "Design with Claude" is billed to your Anthropic API account, and only signed-in editors can use it.
- Merging or splitting plots, and adding hand-built stands, still means editing `public/index.html`.
