import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) throw new Error("Usage: node scripts/grant-superadmin.mjs account@example.com");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Configure the Supabase URL and server-only secret key in the root .env.");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let target;
for (let page = 1; page <= 10000; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error("Could not read Supabase users.");
  target = data.users.find(user => user.email?.toLowerCase() === email);
  if (target || data.users.length < 1000) break;
}
if (!target?.email_confirmed_at) throw new Error("The account must exist and have a confirmed email before granting SuperAdmin.");
const { error } = await admin.from("account_roles").upsert({ user_id: target.id, role: "superadmin", enabled: true, updated_at: new Date().toISOString() });
if (error) throw new Error("Role grant failed. Apply the accounts_and_admin migration first.");
console.log(`SuperAdmin granted to ${email}.`);
