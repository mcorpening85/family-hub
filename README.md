# Family Hub

A kid-friendly family calendar for a wall tablet (Fire or Android) and your phones.

- **Calendar**: shows your family Google Calendar; add and edit events from the tablet
- **Tasks and habits**: assign to anyone; kids tap big picture tiles to mark them done
- **Stars**: kids earn stars instantly; parents can give or take stars away
- **Rewards**: you set rewards and star prices; kids spend stars in the reward shop
- **Streaks**: bonus stars for doing a habit several days in a row, plus a weekly chart
- **Dinner plan, shared lists, weather and clock**
- **Parent area** behind a 4-digit PIN

All data lives in a Google Sheet you own. The app itself is a plain web page
(no build step) that installs to the home screen.

## Try it first

Open the app and tap **Just try it on this device (demo)**. Everything works,
but data stays on that one device and the calendar is not connected to Google.

## Setup (about 15 minutes, once)

### 1. Create the Google Sheet backend

Sign in to Google as the account that owns (or can edit) the family calendar.

1. Create a new Google Sheet and name it `Family Hub`.
2. **Extensions > Apps Script**. Delete the sample code, paste in everything
   from [`apps-script/Code.gs`](apps-script/Code.gs), and save.
3. In **Project Settings** (gear icon), check the time zone is yours.
4. Back in the editor, choose the function `setup` and press **Run**. Approve
   the permissions Google asks for (your sheet and your calendar). It creates
   the tabs and shows your **family key**. Copy it.
   (Later: the sheet has a **Family Hub > Show family key** menu.)
5. **Deploy > New deployment > Web app**. Set *Execute as: Me* and
   *Who has access: Anyone*. Deploy and copy the **Web app URL**
   (ends in `/exec`).

"Anyone" means anyone *with the URL* can reach the script, but it refuses
every request that does not include your family key. Treat the key like a
password.

If you later paste in a newer `Code.gs`: **Deploy > Manage deployments > edit
> Version: New version**, so the URL stays the same.

### 2. Put the app online

The app is static files, so any free host works:

- **GitHub Pages**: repo **Settings > Pages > Deploy from a branch > main / root**.
  Free GitHub accounts need the repo to be public for this. That is safe:
  the code contains no keys or family data.
- Or connect the repo to Cloudflare Pages or Netlify (both work with private repos).

### 3. Connect each device

1. Open the app's address in Chrome (Android) or Silk (Fire tablet).
2. Paste the Web app URL and family key, tap **Connect**.
3. First time only: add your family members, choose a parent PIN.
4. Install it: browser menu > **Add to Home screen**.

For the other devices, use **Parents > Settings > Add another device > Copy
link** and open that link on the phone; it connects in one tap.

### Wall tablet tips

- Fire tablet: turn off the lock-screen ads, and set
  **Settings > Display > Screen timeout** to the longest value (or enable
  *Stay awake* in Developer options while charging).
- For a true kiosk (full screen, always on), install *Fully Kiosk Browser*
  and point it at the app's address.
- The app returns to the home screen and re-locks the parent area after
  3 minutes without a touch.

## How it works

| Thing | Where it lives |
| --- | --- |
| People, tasks, stars, rewards, meals, lists, settings | Tabs in your Google Sheet |
| Events | Your Google Calendar (via the Apps Script) |
| The app | Static files in this repo |

You can edit the sheet by hand; the app picks changes up within a minute.
Forgot the PIN? Clear the `pin` row's value in the `settings` tab.

The PIN keeps kids out of the parent area; it is not bank-grade security.
Anyone holding the family key can read and change the family data.

## Development

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 and use demo mode.

- `js/store.js` data layer (demo and Google backends, star and streak rules)
- `js/views-*.js` screens
- `apps-script/Code.gs` Google Sheet and Calendar backend
