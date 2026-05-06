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
      const { data, error } = await supabase.from("potential_payments").select("*");
      if (error) throw error;
      return json(200, { payments: data || [] });
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
        const { error } = await supabase.from("potential_payments").delete().eq("id", id).eq("owner_profile_id", ownerId);
        if (error) throw error;
        return json(200, { ok: true });
      }

      if (body.upsert && body.payment) {
        const p = body.payment;
        const section = String(p.section || "");
        if (!["implementation", "widgets", "license"].includes(section)) {
          return json(400, { error: "Invalid section" });
        }
        const paid = Boolean(p.paid);
        const upd = Boolean(p.upd);
        const updInvoiceId = p.upd_invoice_id ? String(p.upd_invoice_id).trim() : "";
        const row = {
          id: p.id,
          owner_profile_id: p.owner_profile_id,
          section,
          company_name: String(p.company_name || "").trim(),
          amount: String(p.amount || "").trim(),
          payment_date: String(p.payment_date || "").trim(),
          paid,
          upd,
          upd_invoice_id: updInvoiceId || null,
          created_at: p.created_at,
        };
        if (!row.owner_profile_id || !row.company_name) {
          return json(400, { error: "owner_profile_id and company_name are required" });
        }
        const { data, error } = await supabase.from("potential_payments").upsert(row, { onConflict: "id" }).select("*");
        if (error) throw error;
        return json(200, { ok: true, saved: (data && data[0]) || null, fn: "payments@paid-upd-v2" });
      }

      return json(400, { error: "Unknown POST body" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: e?.message || String(e) });
  }
};
