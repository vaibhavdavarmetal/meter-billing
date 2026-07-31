# Meter Billing App — Setup Guide

This gets your app live on the internet for **free**, so tenants can submit
meter photos from their phones and you generate bills from anywhere.

You do this **once**. After that, it just runs every month.

Total time: about 30–40 minutes. No coding needed — only copy, paste, click.

---

## What you'll create (3 free accounts)

1. **GitHub** — holds the app's code.
2. **Vercel** — runs the app and gives you the public link. (Free.)
3. **Anthropic** — the AI that reads meter photos. (Pay-per-use, but reading
   ~8 meter photos a month costs a few rupees — effectively nothing. You add a
   small amount of credit, e.g. ₹400, and it lasts a very long time.)

---

## STEP 1 — Put the code on GitHub

1. Go to https://github.com and sign up (free).
2. Click the **+** (top right) → **New repository**.
3. Name it `meter-billing`. Leave everything else default. Click **Create repository**.
4. On the next page, click **uploading an existing file**.
5. Drag in ALL the files from this project folder (the whole thing).
6. Click **Commit changes**.

Your code now lives on GitHub.

---

## STEP 2 — Get your Anthropic API key

1. Go to https://console.anthropic.com and sign in.
2. Left menu → **API Keys** → **Create Key**. Name it `meter-app`.
3. **Copy the key** (starts with `sk-ant-...`) and paste it somewhere safe for a moment.
   You won't be able to see it again later.
4. Left menu → **Billing** → add a small amount of credit (e.g. $5).

---

## STEP 3 — Deploy on Vercel

1. Go to https://vercel.com and click **Sign up** → **Continue with GitHub**
   (this links the two accounts automatically).
2. Click **Add New… → Project**.
3. Find `meter-billing` in the list → click **Import**.
4. Before clicking Deploy, open **Environment Variables** and add these:

   | Name | Value |
   |------|-------|
   | `ANTHROPIC_API_KEY` | your `sk-ant-...` key from Step 2 |

5. Click **Deploy**. Wait ~1 minute.
6. You'll get a live link like `https://meter-billing-xxx.vercel.app`. **That's your app.**

---

## STEP 4 — Turn on photo storage (so meter photos are saved)

1. In your Vercel project → top menu **Storage** → **Create Database** →
   choose **Blob** → **Create**. Connect it to this project when asked.
2. Also create a **KV** database the same way (this stores the readings).
   Connect it to the project.
3. Go to **Deployments** → click the latest → **Redeploy** so it picks up the storage.

That's it. The app is live.

---

## STEP 5 — Set up your tenants (one-time)

Open the file `lib/config.js` on GitHub (click the file → pencil icon to edit).
Change the tenant names and, importantly, note each tenant's **slug**
(the short id like `home-first`, `rent-1`).

Each tenant's personal link is your app URL + `?t=` + their slug:

```
https://meter-billing-xxx.vercel.app/?t=home-first
https://meter-billing-xxx.vercel.app/?t=rent-1
```

Send each tenant **their own link** once (on WhatsApp). They save it. Every
month they just open it, photograph the meter, confirm the number, submit.

Also change `ADMIN_PASSWORD` in that same file to your own password.
After editing on GitHub, Vercel redeploys automatically in ~1 minute.

---

## EVERY MONTH — your routine

1. Tenants open their links and submit (you can WhatsApp a reminder).
2. You open `https://meter-billing-xxx.vercel.app/admin`.
3. Enter your password + the month.
4. You'll see every tenant's submitted reading and their meter photo.
5. Type in each tenant's **previous** reading the first month only — after that
   you carry last month's current forward.
6. For the rental house, type the **actual total bill** you paid — it splits
   proportionally.
7. Tap **Send bill on WhatsApp** for each tenant. Done.

---

## Notes & honest limitations

- **The AI reading is a helper, not the source of truth.** The tenant always
  sees the number and confirms/corrects it, and you can view the photo yourself.
  This is deliberate — it prevents a misread digit from creating a wrong bill.
- **Free tiers are generous** for a handful of tenants. You won't hit limits.
- **If a tenant won't use the link**, you or your mother can open their link and
  submit on their behalf from a photo they WhatsApp you. Nobody has to travel.
- Want me to change tenant counts, languages (e.g. Hindi for tenants),
  add "who has paid" tracking, or wire these readings into the phone app you
  already have — just ask.
