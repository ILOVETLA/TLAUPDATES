# JoJo's Bizarre Game — Update Log site

A static GitHub Pages site with a private visual editor. You edit in your browser at `admin.html`; every change is **committed to your GitHub repo automatically** and visitors see it within about a minute, with no rebuild.

## Set it up (10 minutes)

1. **Create a public repo** on GitHub (e.g. `jojo-updates`) and upload everything in this folder to the `main` branch (including the hidden `.nojekyll` file).
2. **Turn on Pages:** repo → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. **Make your access token** (this is what keeps everyone else out):
   GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate.
   - Repository access: **Only select repositories** → this repo only
   - Permissions → Repository → **Contents: Read and write** (nothing else)
   - Expiration: 90 days (renew when it expires)
4. Open `https://YOUR-NAME.github.io/jojo-updates/admin.html`, enter `YOUR-NAME/jojo-updates`, paste the token, and choose a passphrase (12+ characters). The token is stored **encrypted** in your browser; you only type the passphrase next time.

Custom domain? Put `{ "repo": "YOUR-NAME/jojo-updates" }` in `config.json` so the public site knows where to read data from.

## How the auto-sync works

- The editor saves ~2.5 s after you stop typing (or press Ctrl+S) as a commit to a branch called **`site-data`** (created for you). Open *GitHub tab → View history* to roll back any change.
- Visitors' browsers read `data/site.json` from that branch through GitHub and re-check every 60 seconds, so edits go live in seconds. Saving to a separate branch also avoids GitHub Pages' limit on rebuilds per hour.
- Images/audio/mp4 you **Upload** in the editor are committed to `assets/` on the same branch (max 25 MB each; use a YouTube link for long videos).
- Don't add branch protection to `site-data`, or auto-saves will be refused.

## What you can do

| | |
|---|---|
| **Blocks** | Title, Description, Text Box, Code, Update Panel, New Ability, New Quest, New Skin, Balance Changes, New Map Zone, New Mechanic, Stand Showcase, Image Box, Video Box, Hero Banner, Version History, Sound Effect, Link Buttons, Countdown, "To Be Continued" |
| **Layout** | Drag any block anywhere on the 12-column grid (✥ handle), resize from the corner, arrow keys nudge, Ctrl+D duplicates, Del deletes, Ctrl+Z / Ctrl+Shift+Z undo/redo |
| **Image Box** | Rotates in 3D to face the cursor (strength adjustable, off for visitors who prefer reduced motion) |
| **Video Box** | Paste a YouTube link or an .mp4/.webm — autoplays, always muted, loops |
| **Look tab** | Background (colour / image / video / YouTube), darkening, halftone dots, background music + volume |
| **Theme tab** | 4 colours (background, primary, accent, text) that recolour every block, plus presets |
| **Pages tab** | Add / rename / reorder pages — they become the top menu |
| **Extras** | Preview mode, JSON backup/import, mobile layout for visitors, countdowns |

Background music note: browsers never allow sound before a visitor interacts, so it starts on their first click/tap/key and a 🔊 button lets them mute it.

## Security — what is and isn't protected

GitHub Pages is static, so there's no server to check a login. Instead **GitHub itself is the lock**: only a request carrying *your* token can change the repo, so anyone who finds `admin.html` can look at the sign-in screen but cannot save anything.

What's in place:
- Token is encrypted in the browser with AES-256-GCM (key from your passphrase via PBKDF2, 600k iterations); the passphrase never leaves memory. Wrong-passphrase attempts are slowed down.
- The editor verifies with GitHub that the token can really write to the repo, auto-locks after 15 idle minutes, and refuses to run inside another site's frame.
- Strict Content-Security-Policy, no `innerHTML` anywhere, and every link/media URL is validated (only `https:` or same-site paths), so a bad entry can't inject script.
- The public site never loads any editor code.

What you should do:
- Turn on **two-factor authentication** on your GitHub account — your token is the real key.
- Use a fine-grained token limited to this one repo and Contents only; set an expiry.
- If a device is lost: GitHub → Settings → Developer settings → revoke the token. That instantly ends all access.
- Use "Forget this device" (GitHub tab) on shared computers, or untick *Remember me* at sign-in to keep the token in memory only.

Limits: the page's data is public by nature (it's your public update log), and a client-side passphrase can't stop someone who has already stolen both your browser profile and your passphrase — which is why a revocable, repo-scoped token matters.

## Files

```
index.html  admin.html  config.json  favicon.svg
css/site.css  css/admin.css
js/schema.js   block types + validation (add new block types here)
js/render.js   how each block looks
js/editor.js   drag/resize/autosave     js/admin.js  sign-in
js/vault.js    token encryption         js/github.js GitHub API
data/site.json starter content
```
