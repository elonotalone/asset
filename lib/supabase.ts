"use client";

// OceanLeo shared identity — cross-subdomain SSO via a cookie scoped to
// .oceanleo.com. One login on ANY *.oceanleo.com site signs you into ALL of
// them. This file preserves the original supabase()/getAccessToken() API but
// delegates to the centralized client in lib/oceanleo-auth/* so every site
// shares the exact same cookie config (no split-brain). See
// docs/architecture/oceanleo-cross-subdomain-sso.md (oceandino repo).
import { browserClient, accessToken } from "@/lib/oceanleo-auth";

export function supabase() {
  return browserClient();
}

export async function getAccessToken(): Promise<string | null> {
  return accessToken();
}
