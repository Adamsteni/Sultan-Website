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

## Layout

```
db/schema.sql              tables, row level security, place_order
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
