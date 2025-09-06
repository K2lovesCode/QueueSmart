import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("parent"), // parent, teacher, admin
  name: text("name").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const teachers = pgTable("teachers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  uniqueCode: text("unique_code").notNull().unique(),
  qrCode: text("qr_code"), // Base64 encoded QR code
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const parentSessions = pgTable("parent_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull().unique(), // Browser session ID
  parentName: text("parent_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const queueEntries = pgTable("queue_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").references(() => teachers.id).notNull(),
  parentSessionId: varchar("parent_session_id").references(() => parentSessions.id).notNull(),
  childName: text("child_name").notNull(),
  status: text("status").notNull().default("waiting"), // waiting, next, current, completed, skipped
  position: integer("position").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
  notifiedAt: timestamp("notified_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const meetings = pgTable("meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").references(() => teachers.id).notNull(),
  queueEntryId: varchar("queue_entry_id").references(() => queueEntries.id).notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  duration: integer("duration"), // in seconds
  wasExtended: boolean("was_extended").default(false),
  extendedBy: integer("extended_by").default(0), // in seconds
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  teacher: one(teachers, {
    fields: [users.id],
    references: [teachers.userId],
  }),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  user: one(users, {
    fields: [teachers.userId],
    references: [users.id],
  }),
  queueEntries: many(queueEntries),
  meetings: many(meetings),
}));

export const parentSessionsRelations = relations(parentSessions, ({ many }) => ({
  queueEntries: many(queueEntries),
}));

export const queueEntriesRelations = relations(queueEntries, ({ one }) => ({
  teacher: one(teachers, {
    fields: [queueEntries.teacherId],
    references: [teachers.id],
  }),
  parentSession: one(parentSessions, {
    fields: [queueEntries.parentSessionId],
    references: [parentSessions.id],
  }),
  meeting: one(meetings, {
    fields: [queueEntries.id],
    references: [meetings.queueEntryId],
  }),
}));

export const meetingsRelations = relations(meetings, ({ one }) => ({
  teacher: one(teachers, {
    fields: [meetings.teacherId],
    references: [teachers.id],
  }),
  queueEntry: one(queueEntries, {
    fields: [meetings.queueEntryId],
    references: [queueEntries.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertTeacherSchema = createInsertSchema(teachers).omit({
  id: true,
  userId: true,
  uniqueCode: true,
  qrCode: true,
  createdAt: true,
});

export const insertParentSessionSchema = createInsertSchema(parentSessions).omit({
  id: true,
  createdAt: true,
});

export const insertQueueEntrySchema = createInsertSchema(queueEntries).omit({
  id: true,
  position: true,
  joinedAt: true,
  notifiedAt: true,
  startedAt: true,
  completedAt: true,
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({
  id: true,
  startedAt: true,
  endedAt: true,
  duration: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Teacher = typeof teachers.$inferSelect;
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;
export type ParentSession = typeof parentSessions.$inferSelect;
export type InsertParentSession = z.infer<typeof insertParentSessionSchema>;
export type QueueEntry = typeof queueEntries.$inferSelect;
export type InsertQueueEntry = z.infer<typeof insertQueueEntrySchema>;
export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
