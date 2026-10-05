# Sultan Clothing — mobile app

Expo app sharing accounts, products, orders and the bag with the website at
`https://sultanng.netlify.app`. Signed in as the same customer, the phone and the
browser show the same bag, because both read the same rows rather than keeping
their own copy.

## Running it

```bash
npm install
npm start          # Expo Go, over the local network
```

`npm start` is `expo start --lan --go`. The phone and the development machine must be
on the same network; `--lan` hands out an `exp://<your-ip>:8081` address that Expo Go
can actually receive.

| Command | Opens in | Google sign-in |
| --- | --- | --- |
| `npm start` | Expo Go | no |
| `npm run client` | the development build | yes |

`expo-dev-client` is a dependency, so plain `npx expo start` looks for a development
build. `--go` forces Expo Go back on, which is what keeps the app usable on a phone
before the build exists.

Configuration comes from `.env` (gitignored):

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | API base, e.g. `https://sultanng.netlify.app/api` |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

## Sign-in

Email and password works in Expo Go. Google sign-in does not, and cannot.

The app declares its own URL scheme (`sultan`, in `app.json`). Expo Go registers
only its own `exp://` scheme, so when the browser is sent to `sultan://auth`
nothing on the device handles it and iOS reports *"Safari can't open the page
because it couldn't connect to the server"*. Only a build that owns the `sultan`
scheme can receive the callback, so Google sign-in needs a development build.
`authRedirectUrl()` in `src/lib/auth.js` derives the address at runtime and keeps
the Expo Go path working for everything else.

The callback must also be on the Supabase project's redirect allow-list:

```
sultan://auth
exp://**
```

`exp://**` is what makes Google sign-in attemptable in Expo Go at all; it is not
what makes it succeed.

## Development build (needed for Google sign-in)

`eas.json` defines a `development` profile that produces a build with
`expo-dev-client`.

Prerequisite: an **Apple Developer account**. EAS builds and signs iOS in the
cloud, so this works from Windows, but Apple charges for the membership and EAS
needs those credentials.

```bash
npm install -g eas-cli
eas login
eas build:configure          # first run only: creates the project, sets bundle ID

npm run build:dev            # eas build --profile development --platform ios
```

Scan the QR code from the build's output, then start the bundler and open the
installed app:

```bash
npm run client
```

Other profiles in `eas.json`: `preview` for an internal TestFlight/TestFlight-style
build, `production` for the store.

## Layout

```
src/app/                expo-router routes
  (tabs)/               Shop, Bag, Orders, Account
  product/[slug].js     product detail
  checkout.js           checkout
  orders/[orderNumber]  order detail
  sign-in.js            email + Google
src/lib/
  api.js                Supabase client and the fetch wrapper every call goes through
  auth.js               session handling, sign-in, sign-out
  cart.js               bag store: local when signed out, server when signed in
  shop.js               catalogue
src/components/ui.js    shared styling and primitives
```

## How the bag stays in sync

Signed out, the bag is local (AsyncStorage) and the app works fully offline. On
sign-in it is merged into the account's cart so nothing is lost.

Two things that are easy to get wrong, both handled in `src/lib/cart.js`:

- **Writes are queued, not gated.** A `if (syncing) return` guard discards any
  change made while a request is in flight, so two quick taps send only the first
  and the devices drift. Requests are chained instead.
- **Only unsynced lines are merged.** `merge_cart` *adds* quantities rather than
  replacing them, so re-merging lines the server already has inflates the bag on
  every load. Lines adopted from a server response are tagged `synced: true`.

The server joins cart rows to `products` in application code rather than in a
PostgREST select. `cart_items` has no foreign key to `products.slug`, so an
embedded select fails with `PGRST200` and every cart read 422s.

## Checks

```bash
npx expo-doctor        # 21/21
node --check src/lib/cart.js
```