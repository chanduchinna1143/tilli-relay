import { NextRequest, NextResponse } from "next/server";
import { executeCurlArgs } from "@/lib/curl/executor";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { db } from "@/lib/db";
import { environmentVariables, environments, userActiveEnvironments } from "@/lib/schema";
import { eq, and, isNull } from "drizzle-orm";
import { resolveVariablesInTokens } from "@/lib/variables/substitutor";
import { tokenize, sanitizeTokens } from "@/lib/curl/sanitizer";
import { cleanupTempFiles } from "@/lib/upload";
import { requireTeamRole } from "@/lib/teamAuth";
import { handleAppError } from "@/lib/errors";
import { logActivity } from "@/lib/activityLog";
import { decrypt } from "@/lib/crypto";
import { parseJsonBody } from "@/lib/request";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Rate limit: 30 requests per minute per user
  const rl = await checkRateLimit(`execute:${session.userId}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const teamId = req.headers.get("x-team-id");

  if (teamId) {
    try {
      await requireTeamRole(session.userId, teamId, "viewer");
    } catch (e) {
      return handleAppError(e);
    }
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (e) {
    return handleAppError(e);
  }

  const { curl } = body;

  if (!curl || typeof curl !== "string") {
    return NextResponse.json({ error: "Missing or invalid 'curl' field" }, { status: 400 });
  }

  if (curl.length > 50_000) {
    return NextResponse.json({ error: "curl command exceeds maximum length" }, { status: 400 });
  }

  // Tokenize first, then substitute variables per-token to prevent injection.
  // A malicious variable value cannot introduce new argv tokens this way.
  let tokens = tokenize(curl);
  let warning: string | undefined;
  try {
    // Find the user's active environment (per-user selection first, fallback to global isActive)
    let activeEnvId: string | undefined;

    const userActiveFilter = teamId
      ? and(eq(userActiveEnvironments.userId, session.userId), eq(userActiveEnvironments.teamId, teamId))
      : and(eq(userActiveEnvironments.userId, session.userId), isNull(userActiveEnvironments.teamId));

    const [userActive] = await db
      .select({ environmentId: userActiveEnvironments.environmentId })
      .from(userActiveEnvironments)
      .where(userActiveFilter)
      .limit(1);

    if (userActive) {
      activeEnvId = userActive.environmentId;
    } else {
      // Fallback: check environments.isActive column (backward compat)
      const envFilter = teamId
        ? and(eq(environments.teamId, teamId), eq(environments.isActive, true))
        : and(eq(environments.userId, session.userId), isNull(environments.teamId), eq(environments.isActive, true));

      const [activeEnv] = await db
        .select({ id: environments.id })
        .from(environments)
        .where(envFilter)
        .limit(1);

      activeEnvId = activeEnv?.id;
    }

    // Load variables from the resolved active environment
    const userVars = activeEnvId
      ? await db
          .select({ key: environmentVariables.key, value: environmentVariables.value })
          .from(environmentVariables)
          .where(eq(environmentVariables.environmentId, activeEnvId))
      : await db
          .select({ key: environmentVariables.key, value: environmentVariables.value })
          .from(environmentVariables)
          .where(eq(environmentVariables.userId, session.userId));

    if (userVars.length > 0) {
      const varMap = new Map(userVars.map((v) => [v.key, decrypt(v.value)]));
      const { resolved, unresolvedKeys } = resolveVariablesInTokens(tokens, varMap);
      tokens = resolved;
      if (unresolvedKeys.length > 0) {
        warning = `Unresolved variables: ${unresolvedKeys.join(", ")}`;
      }
    }
  } catch (err) {
    console.error("[POST /api/execute] Failed to load variables:", err);
    // Continue with original tokens if variable loading fails
  }

  // Validate the resolved tokens (flag allowlist, URL protocol, etc.)
  const sanitizeResult = sanitizeTokens(tokens);
  if (!sanitizeResult.valid) {
    return NextResponse.json({ error: sanitizeResult.error, warning }, { status: 422 });
  }

  const result = await executeCurlArgs(sanitizeResult.sanitizedArgs);

  // Clean up any temporary upload files referenced in the curl command
  cleanupTempFiles(tokens.join(" ")).catch(() => {});

  if (result.error && result.status === 0) {
    return NextResponse.json({ error: result.error, warning }, { status: 422 });
  }

  // Log execution in team context
  if (teamId) {
    // Extract method and URL from curl for the log entry
    let method = "GET";
    let url = "";
    try {
      const { parseCurl } = await import("@/lib/curl/parser");
      const parsed = parseCurl(curl);
      method = parsed.method;
      url = parsed.url;
    } catch {}
    logActivity(
      teamId,
      session.userId,
      "request.executed",
      "request",
      "",
      `${method} ${url}`,
      { method, status: result.status, timeMs: result.timeMs }
    );
  }

  return NextResponse.json({ ...result, warning });
}
