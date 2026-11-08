# VOXEL

A small static HTML/CSS/JavaScript Minecraft Bedrock mod sharing site backed by Supabase.

## Configure Supabase

1. In Supabase, run [`supabase/voxel.sql`](supabase/voxel.sql) in **SQL Editor**. This creates/adds the `mods` columns, enables public reads, creates an atomic download counter RPC, and creates the public `mods` Storage bucket. It does not grant anonymous database writes or Storage uploads.
2. In `index.html`, replace `SUPABASE_PUBLISHABLE_KEY` with your project's publishable/anon key if it differs. A publishable key is expected to be public; never use a service-role key in the browser.
3. Install and log in to the Supabase CLI, link the project, and set a server-side admin secret. The admin code is never embedded in the site source.

```sh
supabase login
supabase link --project-ref iiwqjdcbpgggtdgvvepj
supabase secrets set ADMIN_CODE='voxeladmin'
```

For production, choose a long unique secret instead of `voxeladmin`, and enter that same secret in the prompts on the website. Optionally restrict browser origins:

```sh
supabase secrets set ALLOWED_ORIGIN='https://your-site.example'
```

Deploy the Edge Function:

```sh
supabase functions deploy admin --no-verify-jwt
```

`--no-verify-jwt` allows this function to receive the site's publishable key without requiring user accounts. The function independently validates `admin_code` for every upload, edit, and delete, and uses the server-side `SUPABASE_SERVICE_ROLE_KEY`; never expose that key. Supabase supplies `SUPABASE_URL`; if your project runtime does not provide `SUPABASE_SERVICE_ROLE_KEY` automatically, set it as a function secret from the project's service-role key:

```sh
supabase secrets set SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVICE_ROLE_KEY'
```

## Use

Serve `index.html` from any static web host or open it locally. Search is client-side over public mod records. Upload, edit, and delete ask for the admin code; mod files must end in `.mcpack`, `.mcaddon`, or `.zip` and each uploaded object is limited to 100 MiB. Downloads use public Storage URLs and atomically increment the database count via `increment_mod_downloads`.

The `mods` bucket is public so anyone can retrieve uploaded content. The service-role key and admin secret remain server-side. Do not add anonymous insert/update/delete policies to the `mods` table or write policies to the `mods` bucket.
