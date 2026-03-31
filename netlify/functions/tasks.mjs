import { createClient } from "@supabase/supabase-js";

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

/** День из query (?day=); у Netlify при редиректе иногда параметры в разных полях */
function getDayQuery(event) {
  let day = event.queryStringParameters?.day;
  if (day) return day;
  const mv = event.multiValueQueryStringParameters?.day;
  if (Array.isArray(mv) && mv[0]) return mv[0];
  if (typeof event.rawQuery === "string" && event.rawQuery.length) {
    const q = new URLSearchParams(event.rawQuery);
    const d = q.get("day");
    if (d) return d;
  }
  const path = event.path || "";
  const qIdx = path.indexOf("?");
  if (qIdx >= 0) {
    const q = new URLSearchParams(path.slice(qIdx + 1));
    const d = q.get("day");
    if (d) return d;
  }
  return null;
}

export async function handler(event) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return json(503, {
      error: "Server is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify → Site settings → Environment variables.",
    });
  }

  const supabase = createClient(url, key);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: {} };
  }

  try {
    if (event.httpMethod === "GET") {
      const day = getDayQuery(event);
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return json(400, { error: "Query ?day=YYYY-MM-DD is required" });
      }
      const { data, error } = await supabase.from("tasks").select("*").eq("day", day);
      if (error) throw error;
      return json(200, { tasks: data || [] });
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }

      if (body.deleteCompleted) {
        const scope = body.scope;
        if (scope === "all") {
          const { error } = await supabase.from("tasks").delete().eq("done", true);
          if (error) throw error;
        } else if (scope === "profile" && body.profileId) {
          const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("done", true)
            .eq("owner_profile_id", body.profileId);
          if (error) throw error;
        } else {
          return json(400, { error: "Invalid deleteCompleted payload" });
        }
        return json(200, { ok: true });
      }

      if (body.upsert && body.task) {
        const t = body.task;
        const row = {
          id: t.id,
          owner_profile_id: t.owner_profile_id,
          text: t.text,
          day: t.day,
          done: Boolean(t.done),
          created_at: t.created_at,
          done_at: t.done_at ?? null,
          done_comment: t.done_comment || "",
        };
        const { error } = await supabase.from("tasks").upsert(row, { onConflict: "id" });
        if (error) throw error;
        return json(200, { ok: true });
      }

      return json(400, { error: "Unknown POST body" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: e?.message || String(e) });
  }
}
