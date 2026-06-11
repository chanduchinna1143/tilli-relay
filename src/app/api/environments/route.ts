import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { environments, userActiveEnvironments } from "@/lib/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { withTeamAuth } from "@/lib/withAuth";
import { handleAppError } from "@/lib/errors";
import { parseJsonBody } from "@/lib/request";
import { logActivity } from "@/lib/activityLog";

export const GET = withTeamAuth("viewer", async (req, { session, teamId }) => {
  try {
    const filter = teamId
      ? eq(environments.teamId, teamId)
      : and(eq(environments.userId, session.userId), isNull(environments.teamId));

    const envs = await db
      .select()
      .from(environments)
      .where(filter)
      .orderBy(environments.createdAt);

    // Look up the user's per-user active environment
    const activeFilter = teamId
      ? and(eq(userActiveEnvironments.userId, session.userId), eq(userActiveEnvironments.teamId, teamId))
      : and(eq(userActiveEnvironments.userId, session.userId), isNull(userActiveEnvironments.teamId));

    const [userActive] = await db
      .select({ environmentId: userActiveEnvironments.environmentId })
      .from(userActiveEnvironments)
      .where(activeFilter)
      .limit(1);

    // If user has a per-user selection, use that; otherwise fall back to isActive column
    const activeEnvId = userActive?.environmentId;

    const result = envs.map((env) => ({
      ...env,
      isActive: activeEnvId ? env.id === activeEnvId : env.isActive,
    }));

    // Sort so active environment comes first
    result.sort((a, b) => (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/environments]", err);
    return NextResponse.json({ error: "Failed to fetch environments" }, { status: 500 });
  }
});

export const POST = withTeamAuth("editor", async (req, { session, teamId }) => {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (e) {
    return handleAppError(e);
  }

  const { name } = body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Missing or invalid 'name'" }, { status: 400 });
  }

  try {
    // Check if user/team has any environments — if not, make this one active
    const existFilter = teamId
      ? eq(environments.teamId, teamId)
      : and(eq(environments.userId, session.userId), isNull(environments.teamId));

    const existing = await db
      .select({ id: environments.id })
      .from(environments)
      .where(existFilter)
      .limit(1);

    const isFirst = existing.length === 0;

    const [created] = await db
      .insert(environments)
      .values({
        name: name.trim(),
        userId: session.userId,
        teamId: teamId || null,
        isActive: isFirst,
      })
      .returning();

    // Auto-activate the first environment for the creating user
    if (isFirst) {
      await db.insert(userActiveEnvironments).values({
        userId: session.userId,
        teamId: teamId || null,
        environmentId: created.id,
      });
    }

    if (teamId) {
      logActivity(teamId, session.userId, "environment.created", "environment", created.id, created.name);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST /api/environments]", err);
    return NextResponse.json({ error: "Failed to create environment" }, { status: 500 });
  }
});
