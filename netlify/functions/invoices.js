const { createClient } = require("@supabase/supabase-js");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function handler(event) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return json(503, {
      error:
        "Server is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify → Site settings → Environment variables.",
    });
  }

  const supabase = createClient(url, key);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: {} };
  }

  try {
    if (event.httpMethod === "GET") {
      const { data, error } = await supabase.from("deferred_invoices").select("*");
      if (error) throw error;
      return json(200, { invoices: data || [] });
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }

      if (body.deleteById) {
        const id = String(body.id || "").trim();
        const ownerId = String(body.owner_profile_id || "").trim();
        if (!id || !ownerId) {
          return json(400, { error: "id and owner_profile_id are required" });
        }
        const { error } = await supabase
          .from("deferred_invoices")
          .delete()
          .eq("id", id)
          .eq("owner_profile_id", ownerId);
        if (error) throw error;
        return json(200, { ok: true });
      }

      if (body.upsert && body.invoice) {
        const inv = body.invoice;
        const section = String(inv.section || "");
        if (!["implementation", "widgets", "license"].includes(section)) {
          return json(400, { error: "Invalid section" });
        }
        const row = {
          id: inv.id,
          owner_profile_id: inv.owner_profile_id,
          section,
          company_name: String(inv.company_name || "").trim(),
          amount: String(inv.amount || "").trim(),
          invoice_date: String(inv.invoice_date || "").trim(),
          paid: Boolean(inv.paid),
          created_at: inv.created_at,
        };
        if (!row.owner_profile_id || !row.company_name) {
          return json(400, { error: "owner_profile_id and company_name are required" });
        }
        const { error } = await supabase.from("deferred_invoices").upsert(row, { onConflict: "id" });
        if (error) throw error;
        return json(200, { ok: true });
      }

      return json(400, { error: "Unknown POST body" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: e?.message || String(e) });
  }
};

