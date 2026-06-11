import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requests } from "@/lib/schema";
import { eq, and, isNull } from "drizzle-orm";
import { withTeamAuth } from "@/lib/withAuth";
import { handleAppError } from "@/lib/errors";
import { logActivity } from "@/lib/activityLog";
import { parseJsonBody } from "@/lib/request";
import { parseCurl } from "@/lib/curl/parser";

async function findRequest(id: string, userId: string, teamId: string | null) {
  if (teamId) {
    return db
      .select()
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.teamId, teamId)))
      .limit(1);
  }
  return db
    .select()
    .from(requests)
    .where(and(eq(requests.id, id), eq(requests.userId, userId), isNull(requests.teamId)))
    .limit(1);
}

export const GET = withTeamAuth("viewer", async (req, { session, teamId }, routeCtx) => {
  const { id } = await routeCtx!.params;

  try {
    const [request] = await findRequest(id, session.userId, teamId);
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(request);
  } catch (err) {
    console.error("[GET /api/requests/:id]", err);
    return NextResponse.json({ error: "Failed to fetch request" }, { status: 500 });
  }
});

export const PUT = withTeamAuth("editor", async (req, { session, teamId }, routeCtx) => {
  const { id } = await routeCtx!.params;

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (e) {
    return handleAppError(e);
  }

  const { name, curl } = body;
  const data: Record<string, string> = {};
  if (name && typeof name === "string") data.name = name.trim();
  if (curl && typeof curl === "string") data.curl = curl;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const [existing] = await findRequest(id, session.userId, teamId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(requests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(requests.id, id))
      .returning();

    if (teamId) {
      let method = "GET";
      try { method = parseCurl(updated.curl).method; } catch {}
      logActivity(teamId, session.userId, "request.updated", "request", id, updated.name, { method });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PUT /api/requests/:id]", err);
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }
});

export const DELETE = withTeamAuth("editor", async (req, { session, teamId }, routeCtx) => {
  const { id } = await routeCtx!.params;

  try {
    const [existing] = await findRequest(id, session.userId, teamId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.delete(requests).where(eq(requests.id, id));

    if (teamId) {
      let method = "GET";
      try { method = parseCurl(existing.curl).method; } catch {}
      logActivity(teamId, session.userId, "request.deleted", "request", id, existing.name, { method });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[DELETE /api/requests/:id]", err);
    return NextResponse.json({ error: "Failed to delete request" }, { status: 500 });
  }
});
