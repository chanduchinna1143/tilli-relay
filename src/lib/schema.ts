import { pgTable, pgEnum, text, timestamp, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const teamRoleEnum = pgEnum("team_role", ["owner", "editor", "viewer"]);

// ─── Teams ───────────────────────────────────────────────────────────────────

export const teams = pgTable("teams", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: teamRoleEnum("role").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("team_member_unique").on(t.teamId, t.userId),
]);

// ─── Requests ────────────────────────────────────────────────────────────────

export const requests = pgTable("requests", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  curl: text("curl").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
}, (t) => [
  index("requests_team_id_idx").on(t.teamId),
]);

// ─── Folders ─────────────────────────────────────────────────────────────────

export const folders = pgTable("folders", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
}, (t) => [
  index("folders_team_id_idx").on(t.teamId),
]);

// ─── Collections ─────────────────────────────────────────────────────────────

export const collections = pgTable("collections", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  description: text("description"),
  folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
}, (t) => [
  index("collections_team_id_idx").on(t.teamId),
]);

// ─── Collection ↔ Request junction ──────────────────────────────────────────

export const collectionRequests = pgTable("collection_requests", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (t) => [
  uniqueIndex("collection_request_unique").on(t.collectionId, t.requestId),
]);

// ─── Environments ────────────────────────────────────────────────────────────

export const environments = pgTable("environments", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("environments_team_id_idx").on(t.teamId),
]);

export const environmentVariables = pgTable("environment_variables", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  environmentId: text("environment_id").references(() => environments.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  isSecret: boolean("is_secret").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("env_var_env_key_unique").on(t.environmentId, t.key),
]);

// ─── Per-user active environment selection ───────────────────────────────────

export const userActiveEnvironments = pgTable("user_active_environments", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  environmentId: text("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_active_env_team_unique").on(t.userId, t.teamId),
]);

// ─── History (personal only, no teamId) ──────────────────────────────────────

export const historyEntries = pgTable("history_entries", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  url: text("url").notNull(),
  curl: text("curl").notNull(),
  statusCode: integer("status_code").notNull(),
  timeMs: integer("time_ms").notNull(),
  responseHeaders: text("response_headers").notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Activity Logs (team audit trail) ────────────────────────────────────────

export const activityLogs = pgTable("activity_logs", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // e.g. "request.created", "member.added"
  resourceType: text("resource_type").notNull(), // "request" | "collection" | "folder" | "environment" | "member"
  resourceId: text("resource_id").notNull(),
  resourceName: text("resource_name"),
  metadata: text("metadata"), // JSON string
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("activity_logs_team_id_idx").on(t.teamId),
  index("activity_logs_created_at_idx").on(t.createdAt),
]);

// ─── Shared Requests ─────────────────────────────────────────────────────────

export const sharedRequests = pgTable("shared_requests", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  requestId: text("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
  sharedByUserId: text("shared_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
