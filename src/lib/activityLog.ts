import { db } from "./db";
import { activityLogs, userActiveEnvironments, environments } from "./schema";
import { eq, and } from "drizzle-orm";

/**
 * Resolve the user's currently active environment name for a team.
 */
async function resolveActiveEnvName(userId: string, teamId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: environments.name })
    .from(userActiveEnvironments)
    .innerJoin(environments, eq(environments.id, userActiveEnvironments.environmentId))
    .where(
      and(
        eq(userActiveEnvironments.userId, userId),
        eq(userActiveEnvironments.teamId, teamId)
      )
    )
    .limit(1);
  return row?.name ?? null;
}

/**
 * Log an activity entry for a team. Fire-and-forget — never blocks the caller.
 * Automatically resolves and includes the user's active environment name.
 */
export function logActivity(
  teamId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  resourceName?: string,
  metadata?: Record<string, unknown>
): void {
  (async () => {
    try {
      // Resolve the user's active environment for this team
      const envName = await resolveActiveEnvName(userId, teamId);

      const fullMetadata: Record<string, unknown> = { ...metadata };
      if (envName) {
        fullMetadata.environment = envName;
      }

      await db.insert(activityLogs).values({
        teamId,
        userId,
        action,
        resourceType,
        resourceId,
        resourceName: resourceName ?? null,
        metadata: Object.keys(fullMetadata).length > 0 ? JSON.stringify(fullMetadata) : null,
      });
    } catch (err) {
      console.error("[activityLog] Failed to log activity:", err);
    }
  })();
}
