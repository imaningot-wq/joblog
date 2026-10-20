# Facility Job Log — Setup Guide

A Progressive Web App (PWA) your technicians open in their phone browser and "Add to Home screen". It looks and behaves like an app, with no app store needed.

## How it works

```
 Technician phone (PWA)            Your Google account (free)
 ┌──────────────────────┐         ┌──────────────────────────────────┐
 │ Pick facility        │  GET →  │ Google Sheet                     │
 │ Pick ticket          │ ←────── │  • "Tickets" tab  (your Excel)   │
 │ Attend / Work Done   │         │  • "Submissions" tab (records)   │
 │ Photos + remarks     │  POST → │ Apps Script (the small "server") │
 └──────────────────────┘         │ Google Drive folder (photos)     │
   hosted on GitHub Pages         │  Facility / Ticket No / *.jpg    │
                                  └──────────────────────────────────┘
 You (admin.html): upload Excel → replaces "Tickets" tab;
                   view records + photo thumbnails; download Excel.
```

- GitHub Pages hosts the app (free, HTTPS — required for a PWA and the camera).
- Google Sheet + Apps Script + Drive store the data and photos (free, nothing to maintain).

## Folder contents

| Path | What it is |
|---|---|
| `app/` | The website. Upload everything in this folder to GitHub. |
| `app/config.js` | The only file you edit — paste your Apps Script URL here. |
| `app/index.html` | Technician app. |
| `app/admin.html` | Your admin page (upload Excel, view records, download Excel). |
| `backend/Code.gs` | Paste into Google Apps Script. |
| `sample/tickets-template.xlsx` | Example Excel layout. |

## Step 1 — Google Sheet + Apps Script (about 10 minutes)

1. Go to [sheets.new](https://sheets.new) and name the sheet, e.g. **Facility Job Log**.
2. Menu **Extensions → Apps Script**. Delete the sample code and paste the whole of `backend/Code.gs`.
3. At the top of the file, change:
   - `TECH_PIN` — the PIN you give technicians (e.g. `5821`)
   - `ADMIN_KEY` — your own password for the admin page
4. Click **Save**. Select the function **setup** in the toolbar dropdown and click **Run**. Approve the permissions (choose your account → Advanced → Go to project → Allow). This creates the *Tickets* and *Submissions* tabs and a Drive folder named **Facility Job Log Photos**.
5. Click **Deploy → New deployment** → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (ends in `/exec`).

> If you later change `Code.gs`, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** so the URL stays the same.

## Step 2 — Put the app on GitHub Pages (about 5 minutes)

1. Open `app/config.js` and paste the URL: `API_URL: 'https://script.google.com/macros/s/XXXX/exec',`
2. On GitHub: **New repository** → name it e.g. `joblog` → Public → Create.
3. **Add file → Upload files** → drag in **everything inside the `app/` folder** (not the folder itself; `index.html` must be at the top level) → Commit.
4. Repository **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → Save.
5. After about 1 minute your app is live at `https://<your-username>.github.io/joblog/`.
   Admin page: `https://<your-username>.github.io/joblog/admin.html`

## Step 3 — Load your tickets

1. Open the admin page, sign in with your `ADMIN_KEY`.
2. **Ticket list** tab → choose your Excel → check the preview → **Replace ticket list**.

Excel rules:
- First sheet is used; first row = headers.
- Must have a **Facility** column (also recognised: Location, Store, Outlet, Branch, Site) and a **Ticket No** column (also: Ticket, Report No, Ref).
- Every other column (Main Category, Category, Sub Category, Title, Description, Priority, …) is shown to technicians automatically. Add or remove columns freely.
- To add or remove facilities or tickets: edit your Excel and upload again. Technicians see the change the next time they open the app or tap **Refresh**.
- You can also edit the *Tickets* tab in the Google Sheet directly. Same result.

## Step 4 — Give it to technicians

Send them the link and the PIN. On the phone:
- **Android (Chrome):** open link → menu ⋮ → **Install app** / **Add to Home screen**.
- **iPhone (Safari):** open link → Share button → **Add to Home Screen**.

They type their name and PIN once; the phone remembers it.

## What you receive

Each submission adds a row to the **Submissions** tab:

Submission ID · Timestamp · Technician · Facility · Ticket No · Type (Attend / Work Done / Attend + Work Done) · Remarks · Main Category · Category · Sub Category · Title · Attend photo links · Work Done photo links · Photo count · Photo folder link · GPS latitude/longitude · Map link · Device time

Photos are saved in Drive as `Facility Job Log Photos / KFC Kota Bharu / TKT-24101 / TKT-24101_Attend_20261020-101500_01.jpg`, stamped with date, time, facility and ticket. In **admin.html → Records** you can filter by facility, technician or type, see thumbnails, and **Download Excel**.

## Good to know

- **Photo privacy:** `SHARE_PHOTOS_BY_LINK = true` makes each photo viewable by anyone who has its link (links are long and unguessable). This is what lets thumbnails show in admin.html. Set it to `false` to keep photos private; you'll then view them in Drive instead.
- **PIN security:** the PIN keeps casual visitors out; it is not bank-grade security. Change `TECH_PIN` (then redeploy a new version) if a technician leaves.
- **Photo size:** photos are resized to 1600px and compressed (~200–400 KB each) so uploads work on mobile data. Adjust in `config.js`.
- **Limits:** a free Google account handles thousands of submissions a month; Drive gives 15 GB free (roughly 40,000+ photos).
- **No signal:** the app opens offline, but a record can only be submitted with a connection. If sending fails, nothing is lost on screen; the technician taps Submit again when signal returns.
