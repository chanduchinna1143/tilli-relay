import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activityLogs, users } from "@/lib/schema";
import { eq, desc, count } from "drizzle-orm";
import { withAuth } from "@/lib/withAuth";
import { requireTeamRole } from "@/lib/teamAuth";
import { handleAppError } from "@/lib/errors";

export const GET = withAuth(async (req, { session }, routeCtx) => {
  const { id } = await routeCtx!.params;

  try {
    await requireTeamRole(session.userId, id, "viewer");
  } catch (e) {
    return handleAppError(e);
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    const entries = await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        resourceType: activityLogs.resourceType,
        resourceId: activityLogs.resourceId,
        resourceName: activityLogs.resourceName,
        metadata: activityLogs.metadata,
        createdAt: activityLogs.createdAt,
        userId: activityLogs.userId,
        actorEmail: users.email,
      })
      .from(activityLogs)
      .innerJoin(users, eq(activityLogs.userId, users.id))
      .where(eq(activityLogs.teamId, id))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(activityLogs)
      .where(eq(activityLogs.teamId, id));

    // Parse metadata JSON strings into objects for the frontend
    const parsed = entries.map((e) => ({
      ...e,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    }));

    return NextResponse.json({ entries: parsed, total });
  } catch (err) {
    console.error("[GET /api/teams/:id/activity]", err);
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  }
});
