import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function genSlug() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

export const listBranches = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("branches")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { branches: data ?? [] };
});

export const addBranch = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(120),
      location: z.string().max(200).optional().nullable(),
      notes: z.string().max(500).optional().nullable(),
      pin: z.string().max(20).optional().nullable(),
      slug: z.string().min(3).max(40).regex(/^[a-z0-9-]+$/).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("branches")
      .insert({
        name: data.name,
        location: data.location ?? null,
        notes: data.notes ?? null,
        pin: data.pin ?? null,
        slug: data.slug ?? genSlug(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { branch: row };
  });

export const deleteBranch = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("branches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBranchBySlug = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1).max(40) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("branches")
      .select("id, name, location, slug, active")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { branch: null, requiresPin: false };
    // separately check pin existence without leaking value
    const { data: pinRow } = await supabaseAdmin.from("branches").select("pin").eq("id", row.id).maybeSingle();
    return { branch: row, requiresPin: !!(pinRow?.pin && pinRow.pin.length > 0) };
  });

export const verifyBranchPin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1).max(40), pin: z.string().min(1).max(20) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("branches")
      .select("id, name, slug, pin")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: false };
    return { ok: row.pin === data.pin, branch: row.pin === data.pin ? { id: row.id, name: row.name, slug: row.slug } : null };
  });

export const updateBranchPin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid(), pin: z.string().max(20).nullable() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("branches").update({ pin: data.pin && data.pin.length ? data.pin : null }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });