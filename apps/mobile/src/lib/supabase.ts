import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import type { Database } from "@storygen/shared/database.types";

const url = Constants.expoConfig?.extra?.supabaseUrl as string;
const anonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string;

export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: false }, // sessão/auth entra no WP2
});
