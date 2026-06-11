import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { environments, userActiveEnvironments } from "@/lib/schema";
import { eq, and, isNull } from "drizzle-orm";
import { withTeamAuth } from "@/lib/withAuth";
import { handleAppError } from "@/lib/errors";
import { parseJsonBody } from "@/lib/request";
import { logActivity } from "@/lib/activityLog";

export const PUT = withTeamAuth("editor", async (req, { session, teamId }, routeCtx) => {
  const { id } = await routeCtx!.params;

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (e) {
    return handleAppError(e);
  }

  try {
    // If setting this environment as active
    if (body.isActive === true) {
      if (teamId) {
        // Team context: per-user selection via user_active_environments
        await db.transaction(async (tx) => {
          await tx.delete(userActiveEnvironments).where(
            and(eq(userActiveEnvironments.userId, session.userId), eq(userActiveEnvironments.teamId, teamId))
          );
          await tx.insert(userActiveEnvironments).values({
            userId: session.userId,
            teamId,
            environmentId: id,
          });
        });
      } else {
        // Personal context: keep existing global behavior
        await db
          .update(environments)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(eq(environments.userId, session.userId), isNull(environments.teamId)));
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.isActive === "boolean" && !teamId) {
      // Only write isActive to the environments table for personal workspaces
      updates.isActive = body.isActive;
    }

    const envFilter = teamId
      ? and(eq(environments.id, id), eq(environments.teamId, teamId))
      : and(eq(environments.id, id), eq(environments.userId, session.userId), isNull(environments.teamId));

    const [updated] = await db
      .update(environments)
      .set(updates)
      .where(envFilter)
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PUT /api/environments/:id]", err);
    return NextResponse.json({ error: "Failed to update environment" }, { status: 500 });
  }
});

export const DELETE = withTeamAuth("editor", async (req, { session, teamId }, routeCtx) => {
  const { id } = await routeCtx!.params;

  try {
    const envFilter = teamId
      ? and(eq(environments.id, id), eq(environments.teamId, teamId))
      : and(eq(environments.id, id), eq(environments.userId, session.userId), isNull(environments.teamId));

    const deleted = await db
      .delete(environments)
      .where(envFilter)
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (teamId) {
      logActivity(teamId, session.userId, "environment.deleted", "environment", id, deleted[0].name);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/environments/:id]", err);
    return NextResponse.json({ error: "Failed to delete environment" }, { status: 500 });
  }
});
