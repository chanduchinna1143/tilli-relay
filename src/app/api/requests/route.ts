import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requests, collectionRequests } from "@/lib/schema";
import { eq, and, desc, isNull, notInArray } from "drizzle-orm";
import { withTeamAuth } from "@/lib/withAuth";
import { handleAppError } from "@/lib/errors";
import { logActivity } from "@/lib/activityLog";
import { parseCurl } from "@/lib/curl/parser";
import { parseJsonBody } from "@/lib/request";

export const GET = withTeamAuth("viewer", async (req, { session, teamId }) => {
  try {
    // Exclude requests that belong to a collection — those show under Collections only
    const linkedIds = db
      .selectDistinct({ id: collectionRequests.requestId })
      .from(collectionRequests);

    const filter = teamId
      ? and(eq(requests.teamId, teamId), notInArray(requests.id, linkedIds))
      : and(eq(requests.userId, session.userId), isNull(requests.teamId), notInArray(requests.id, linkedIds));

    const result = await db
      .select()
      .from(requests)
      .where(filter)
      .orderBy(desc(requests.updatedAt));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/requests]", err);
    return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
  }
});

export const POST = withTeamAuth("editor", async (req, { session, teamId }) => {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (e) {
    return handleAppError(e);
  }

  const { name, curl } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Missing or invalid 'name'" }, { status: 400 });
  }

  if (!curl || typeof curl !== "string") {
    return NextResponse.json({ error: "Missing or invalid 'curl'" }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(requests)
      .values({
        name: name.trim(),
        curl,
        userId: session.userId,
        teamId: teamId || null,
      })
      .returning();

    if (teamId) {
      let method = "GET";
      try { method = parseCurl(created.curl).method; } catch {}
      logActivity(teamId, session.userId, "request.created", "request", created.id, created.name, { method });
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST /api/requests]", err);
    return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
  }
});
