// Drizzle schema. Five small tables; the Qloo entity map and cache live here only (never in the repo, per the hackathon API rule).
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { RedactedRequest, Seed } from "../lib/schemas";

export type RecoveredRef = { isbn13: string; title: string };

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  author: text("author").notNull().default(""),
  verdictKind: text("verdict_kind"),
  checked: integer("checked"),
  failed: jsonb("failed").$type<string[]>(),
  seeds: jsonb("seeds").$type<Seed[]>(),
  mode: text("mode"),
  request: jsonb("request").$type<RedactedRequest>(),
  books: jsonb("books").$type<RecoveredRef[]>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const holds = pgTable("holds", {
  runId: text("run_id").primaryKey(),
  isbn13s: jsonb("isbn13s").$type<string[]>().notNull(),
  title: text("title").notNull().default(""),
  author: text("author").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const registry = pgTable("registry", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  author: text("author").notNull().default(""),
  count: integer("count").notNull().default(1),
  example: boolean("example").notNull().default(false),
  seeds: jsonb("seeds").$type<Seed[]>().notNull().default([]),
  recovered: jsonb("recovered").$type<RecoveredRef[]>().notNull().default([]),
  lastRunId: text("last_run_id"),
  firstSeen: timestamp("first_seen", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const entityMap = pgTable("entity_map", {
  isbn13: text("isbn13").primaryKey(),
  entityId: text("entity_id").notNull(),
  name: text("name"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const qlooCache = pgTable("qloo_cache", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});
