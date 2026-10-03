# Sultan Clothing

A shop for Sultan Clothing: browse the collection, add pieces to a bag that survives a page
reload, sign in, check out, and keep every order against the account so it can be reopened later.
The owner has a console for orders, stock and subscribers.

Nothing here is static. There is a Node server that serves the pages, the API, and the order
storage. The shop runs in two modes:

- **Demo mode** (default when Supabase keys are absent) keeps products, orders and sessions in
  memory and prints emails to the terminal. Useful for looking around; everything is reset when
  the server restarts.
- **Live mode** uses Supabase for products, orders and accounts, Mailgun for email, and Google for
  sign-in. Orders persist for good.

---

## Requirements

- Node.js 20 or newer (`node --version`)
- A Supabase project, a Mailgun sending domain, and a Google OAuth web client for live mode

On Windows, `npm` may be blocked by the PowerShell execution policy. Use `npm.cmd` instead:

```powershell
npm.cmd install
```

---

## 1. Install

```bash
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill in `.env`:

| Variable | What it is |
| --- | --- |
| `PORT` | Port the server listens on. Default `3000`. |
| `SITE_URL` | Public site URL. |
| `SHOP_NAME`, `SHOP_EMAIL` | Shop name and the address that receives owner notifications. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_ANON_KEY` | Safe to use in the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Bypasses row level security. Never send this to a browser. |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID of type *Web application*. |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM` | Mailgun sending credentials. |
| `ADMIN_EMAILS` | Comma separated addresses allowed to open `admin.html`. |
| `DEMO_MODE` | Set to `true` to force the in-memory store even with keys present. |

`.env` is never served and is in `.gitignore`.

## 3. Create the database

In the Supabase dashboard, open the SQL editor, paste the whole of `db/schema.sql` and run it. It
creates `products`, `orders`, `order_items` and `newsletter_subscribers`, enables row level
security, and defines the `place_order` function that writes an order and its items in one
transaction using server-side prices.

## 4. Load the catalogue

```bash
npm run seed
```

This upserts the eight pieces from `server/data/catalogue.js` and prints the product slugs.

## 5. Run

```bash
npm start          # or: npm run dev  (restarts on file changes)
```

Open <http://localhost:3000>. The startup banner lists which integrations are configured.

---

## Google sign-in setup

1. In Google Cloud, enable the **Google Identity** APIs.
2. Create an OAuth client of type **Web application**.
3. Add `http://localhost:3000` as an authorised JavaScript origin, plus your real domain when
   you deploy.
4. Put the client ID in `GOOGLE_CLIENT_ID`.

In the browser the Google button posts the credential to Supabase, which verifies it. Supabase
signs the user in and the access token is what the API checks. Email and password sign-in is
available as a fallback; for Google sign-in to work in Supabase, enable the Google provider under
Authentication → Providers.

---

## Mailgun setup

1. Add and verify your sending domain in Mailgun.
2. Copy the API key and domain into `.env`.
3. `MAILGUN_FROM` must be an address on the verified domain, for example
   `Sultan Clothing <orders@mg.yourdomain.com>`.

The shop sends four emails: an order confirmation to the customer, a new-order notice to
`SHOP_EMAIL`, a status update when the owner changes an order status, and a welcome note after a
newsletter signup. If Mailgun is not configured, each message is logged instead of sent and the
UI says so.

### Why a sandbox domain is not enough to launch

Mailgun's free tier creates a **sandbox domain** (`sandbox*.mailgun.org`) that only delivers to
addresses explicitly listed under **Sending → Domains → Authorized recipients**. Mail to anyone else
is rejected by Mailgun before it leaves their infrastructure.

What this looks like in practice, from the Mailgun event log:

```
delivered  to=you@example.com    subject=Welcome to Sultan Clothing
rejected   to=                   subject=Sultan Clothing - order SLT-2026-01001 confirmed
```

The order is still created and the customer sees success. The confirmation is simply never
delivered, so the customer has no record of their order and no reason to trust the payment went
through. This is a Mailgun rule, not a fault in the code, and no code change fixes it.

Two further reasons a real domain is needed:

- **Deliverability.** Gmail, Outlook and Yahoo reject mail from unconfigured senders. SPF and DKIM
  records have to be added at the registrar's DNS, which is only possible for a domain you control.
- **Sender address.** Order confirmations would come from a `sandbox*.mailgun.org` address rather
  than something from the shop's own name.

### Moving to a real domain

1. Buy a domain from any registrar. This is the only purchase the shop needs, and it costs roughly
   $10–15 a year.
2. In Mailgun, **Sending → Domains → Add domain**, then choose a region and add the two DNS
   records Mailgun gives you (TXT for verification, then SPF and DKIM).
3. Update `MAILGUN_DOMAIN` and `MAILGUN_FROM` in `.env` and in the Netlify environment variables:

   ```
   MAILGUN_DOMAIN=mg.yourdomain.com
   MAILGUN_FROM=Sultan Clothing <orders@mg.yourdomain.com>
   ```

4. Redeploy, then confirm under **Sending → Logs** that new messages show `delivered` for a
   recipient who is not an authorised recipient on the sandbox.

Nothing else in the codebase changes. The same four emails start reaching real customers.

---

## Owner access

Only addresses in `ADMIN_EMAILS` can open `admin.html`. The check is done on the server for every
admin request, so hiding the link in the browser is not what keeps the console closed. A signed-in
customer who is not on the list sees an explanation instead.

The console covers order volume and revenue, live products, units in stock, stock value,
subscribers, order search and status changes, price and stock edits, and a CSV export.

---

## Payments

Card entry is validated in test mode only: the number must pass a Luhn check, the expiry must be a
future `MM/YY`, and the security code must be 3 or 4 digits. No card is charged and no card data is
stored. Customers can also choose pay on delivery.

To take real payments, put a payment provider in front of `POST /api/orders` and only create the
order after the provider confirms it.

---

## Deploying to Netlify

Netlify has no long-running Node server, so the Express app runs as a serverless function behind
`serverless-http`. Static files and images are served by the CDN from `public/`.

`netlify.toml` wires it up: the build runs `npm run vendor` (which copies the Supabase browser SDK
out of `node_modules` into `public/vendor`, because a function cannot serve static assets from
`node_modules`), the publish directory is `public`, and `/api/*` is redirected to the function.

### Connect the repository

1. In Netlify, **Add new site → Import an existing project**, and pick `Adamsteni/Sultan-Website`.
2. Leave build command and publish directory as they are — `netlify.toml` sets both.
3. Deploy. The first build installs dependencies and copies the vendor file.

### Set the environment variables

Site configuration → Environment variables. Add all of these:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID |
| `MAILGUN_API_KEY` | Mailgun API key |
| `MAILGUN_DOMAIN` | Your Mailgun sending domain |
| `MAILGUN_FROM` | `Sultan Clothing <orders@yourdomain>` |
| `SHOP_EMAIL` | The address that receives order notifications |
| `ADMIN_EMAILS` | Your own email address |
| `SITE_URL` | `https://your-site.netlify.app` |

Leave `DEMO_MODE` unset. If the service role key is missing the app falls back to the in-memory
demo store, which **does not work on Netlify** because each request runs in a fresh function and
would lose every order. The app detects this and `/api/health` returns 503 with an explanation
rather than quietly dropping orders.

### Run the database once

Run `db/schema.sql` in the Supabase SQL editor, then `npm run seed` from your machine against the
same project. Netlify deploys code only; it does not touch your database.

### After deploying

- Sign in and confirm the console at `/admin.html` opens.
- Check `https://your-site.netlify.app/api/health`. It should say `"status":"ok"` and
  `"database":{"ok":true,"detail":"supabase"}`.
- Add `https://your-site.netlify.app` as an authorised JavaScript origin in the Google Cloud OAuth
  client, then redeploy.
- Once a custom domain is attached, add that domain as an origin too and update `SITE_URL`.

### Netlify limits worth knowing

- Functions cap at 26 seconds of runtime and 6 MB zipped. The Mailgun calls are the slowest step
  in placing an order.
- The free plan allows 125k function invocations a month.
- Cold starts of a few hundred milliseconds are normal on first hit after idle.

### Deploying somewhere with a real server

Render, Railway and Fly.io all run `npm start` with no adapter and no Netlify limits. The only
requirement is setting the same environment variables.

---

## Production status

Recorded so the next person knows exactly what is finished and what is not.

### Working and verified

| Area | How it was confirmed |
| --- | --- |
| Catalogue, product pages, filters | `test:browser`, `test:journey` |
| Add to cart, quantities, size, persistence across reloads | `test:journey` |
| Checkout, Nigerian states, delivery threshold | `test:journey` |
| Sign in, sign out, reopen, sign in again, orders still there | `test:journey` |
| Order storage in Supabase | `/api/health` reports `"detail":"supabase"` |
| Google sign-in | Working live against Google Cloud OAuth |
| Mailgun | Delivering; `Sending → Logs` shows `delivered` |
| Admin console and CSV export | `smoke`, `netlify-check` |
| Serverless deployment | `netlify-check` invokes the function as Netlify does |
| Cart stored per account, shared across devices | 21 checks in `smoke`: merge, clamping, per-customer isolation, checkout clearing |
| Mobile app bundle | `expo-doctor` 21/21; Android export succeeds |

### Not verified

The app has not been run on a physical phone. It bundles and every endpoint it calls is tested, but
layout, image loading and the Google consent flow have not been seen on real hardware. Treat the
screen recording as the first real run.

### Known gaps

**No payment is taken.** Card details are validated in test mode and discarded. Nothing is charged
and no card data is stored, so the shop cannot yet accept money by card. Customers can pay on
delivery.

**Customer emails need a purchased domain.** Mailgun's sandbox domain only delivers to authorised
recipients. See [Moving to a real domain](#moving-to-a-real-domain).

**Test users are created in Supabase.** Anyone testing sign-in will appear under **Authentication →
Users** in the Supabase dashboard. Delete them when finished.

### Verifying a deployment

```
https://your-site.netlify.app/api/health
```

A healthy deployment returns `"status":"ok"` with `"database":{"ok":true,"detail":"supabase"}` and
all three integrations reporting `ok`.

If it returns `"status":"misconfigured"`, the function has no environment variables. The response
also includes an `env` field naming the variables that arrived and the length of each value, which
locates the problem without exposing any secret.

A site can still render its pages while the API is broken, so check this endpoint rather than judging
by whether the homepage looks right.

---

## Rotating credentials

Because these keys have been shared in development conversations and pasted into Netlify, rotate
them before taking real orders:

- **Supabase** — Project Settings → API Keys → reset the service role and anon keys, then update
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` in Netlify and redeploy.
- **Google** — APIs & Services → Credentials → recreate the client secret. The client ID can stay.
- **Mailgun** — Sending → API Keys → create a new key and delete the old one.
- **Netlify** — remember to mark `SUPABASE_SERVICE_ROLE_KEY` and `MAILGUN_API_KEY` as **Secret** so
  their values never appear in the UI, the API, the CLI or build logs.

`netlify-upload.env` holds real credentials for uploading to Netlify. It is gitignored, but delete it
once the upload succeeds.

---

## The mobile app

`mobile/` holds an Expo app that talks to the same API as the website. There is no separate
backend and no duplicated business logic: `GET /api/products`, `POST /api/cart/items`,
`POST /api/cart/merge`, `POST /api/orders` and the rest are the same endpoints the browser calls,
hitting the same Netlify function.

### What is shared, and how

| Requirement | How it works |
| --- | --- |
| Same backend API | The app calls the deployed Netlify function at `EXPO_PUBLIC_API_URL`. No new endpoints were added for mobile. |
| Same account on web and mobile | Both apps sign in through Supabase. The app stores the session and sends the access token as a bearer token on every request, which is exactly what the website does. |
| Cart shared across devices | The bag is stored in the `cart_items` table keyed to the Supabase user id, not in browser storage. Anything added on either device is visible on the other. |

### Before the app will work

The cart endpoints need a table that the website did not need. Run the schema in Supabase once:

1. Supabase dashboard → **SQL Editor** → **New query**
2. Paste the whole of `db/schema.sql` and run it

Every statement in the file is `create table if not exists` or `create or replace`, so re-running
it is safe and leaves existing products and orders untouched.

Without this the app shows products and orders but the bag will not save. A signed-out visitor can
still add to a bag on the device; anything requiring a session fails with a server error.

### Install it on your phone

The phone needs [Expo Go](https://expo.dev/go) from the Play Store or the App Store. Nothing is
built and no APK is needed — the app runs from the development server.

```
cd mobile
npm install
npx expo start
```

A QR code appears in the terminal. With the phone on the same Wi-Fi, open Expo Go and scan it
(Android: **Scan** in the app; iOS: the built-in camera app).

If the phone cannot see the computer on the network, start in tunnel mode instead:

```
npx expo start --tunnel
```

Both devices need to be on the same network for this to work. A phone on mobile data cannot reach
a dev server running on your laptop.

### Configure the app

`mobile/.env` holds three non-secret values and is gitignored:

```
EXPO_PUBLIC_API_URL=https://sultanng.netlify.app/api
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key>
```

The anon key is safe to ship inside an app — it is the same key the website already exposes in
`/api/config` and Supabase's row level security is what protects the data. The **service role key
must never go here**; it would be readable by anyone who unpacks the app.

### Google sign-in on a phone

Email and password works in the app immediately. Google needs one extra step.

The website is a web origin, which Google already knows. A phone app is a different kind of caller
and is identified by a SHA-1 certificate fingerprint instead. Android rejects the sign-in with
`origin_mismatch` until that fingerprint is registered.

To find it:

```
cd mobile
npx expo prebuild --clean
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android
```

Copy the `SHA1:` value, then in the Google Cloud console:

**APIs & Services → Credentials → your Web application client → Authorized JavaScript origins →
Add an origin**, and paste:

```
sultan://auth
```

Android also reports a client-id error if the app's `android.package` (currently
`com.sultan.clothing`) is not registered as an **Android application** client. If Google rejects
the client id after the origin is added, create an Android OAuth client in the same Google Cloud
project and use that id in `EXPO_PUBLIC_GOOGLE_CLIENT_ID`.

### Recording the demonstration

The brief asks for a screen recording, not an APK, so the useful sequence is the one that proves
each requirement rather than the one that shows the most screens.

1. **Website, signed in.** Add two or three pieces, choosing sizes. Leave the bag open.
2. **Phone.** Open Expo Go and launch the app. Sign in with the *same* account.
3. **The bag is already there.** The badge shows the same count, and the lines match the website.
4. **Back to the website.** Reload. The bag is unchanged — it is one bag, not two.
5. **Add something on the phone.** Then reload the website and show the new item.
6. **Check out on the phone.** Show the order confirmation screen.
7. **Website, Orders tab.** The order appears there too, and the bag is empty on both.

Step 7 is the one worth pausing on. It shows orders and bag are shared state rather than two
separate copies, which is the part a reviewer is most likely to doubt.

Record at a steady pace and narrate what each screen is proving. Most phone screen recorders live
in the notification shade — swipe down twice and tap **Screen record**.

### Cart synchronisation, honestly

The bag updates on the device immediately and is written to the server straight after. It is not
pushed with a websocket, so a change made on the other device appears when the app refetches:

- on launch
- when the Orders or Bag tab is opened
- after sign-in

This is the "refresh by navigating away and back" behaviour from the brief. It is deliberate: a
socket would keep a connection open on a mobile network and drain the battery for very little gain
on a shop this size.

### Running it somewhere else

`EXPO_PUBLIC_API_URL` is the only thing that ties the app to a deployment. Point it at
`http://localhost:4000/api` with the website running locally and the app works against your
machine instead of Netlify.

---

## Layout

```
db/schema.sql              tables, row level security, place_order, cart_items
netlify/functions/api.js   Express app wrapped for Netlify Functions
netlify.toml               build, publish, redirects and headers
scripts/seed.js            catalogue loader
scripts/prepare-vendor.js  copies the Supabase SDK into public/vendor
scripts/smoke.js           API-level checks
scripts/browser-check.js   page rendering checks
scripts/journey.js         end-to-end UI checks
scripts/netlify-check.js   invokes the function the way Netlify does
server/index.js            Express app, API routes, error handling
server/config.js           environment configuration and the admin allowlist
server/auth.js             Supabase and demo session verification
server/validate.js         shipping, payment and cart validation
server/mailer.js           Mailgun delivery and templates
server/data/catalogue.js   products and delivery thresholds
server/repositories/       Supabase and in-memory data access
public/                    pages, modules, styles, images
mobile/src/app/            screens (Expo Router)
mobile/src/lib/api.js      API client, shared with every screen
mobile/src/lib/auth.js     Supabase sign-in, Google browser flow
mobile/src/lib/cart.js     bag store, server-backed when signed in
```

Prices are stored as integer kobo (₦1 = 100). Free delivery applies from ₦150,000; otherwise
delivery is ₦7,500.

---

## Payments, security and operations

Card entry is validated in test mode only: the number must pass a Luhn check, the expiry must be a
future `MM/YY`, and the security code must be 3 or 4 digits. No card is charged and no card data is
stored. Customers can also choose pay on delivery.

To take real payments, put a payment provider in front of `POST /api/orders` and only create the
order after the provider confirms it.

Keep the service role key server side only. `/api/config` deliberately sends only the Supabase URL
and anon key to the browser. Admin access is checked on the server for every admin request, so
hiding the link in the browser is not what keeps the console closed.

On a host with a real server, use a process manager so it restarts on failure.
