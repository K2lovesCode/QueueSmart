import { 
  users, teachers, parentSessions, queueEntries, meetings,
  type User, type InsertUser, type Teacher, type InsertTeacher,
  type ParentSession, type InsertParentSession, type QueueEntry, 
  type InsertQueueEntry, type Meeting, type InsertMeeting
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Teachers
  getTeacher(id: string): Promise<Teacher | undefined>;
  getTeacherByCode(code: string): Promise<Teacher | undefined>;
  getTeacherByUserId(userId: string): Promise<Teacher | undefined>;
  getAllTeachers(): Promise<Teacher[]>;
  createTeacher(teacher: InsertTeacher, userId: string): Promise<Teacher>;
  updateTeacher(id: string, updates: Partial<Teacher>): Promise<Teacher | undefined>;
  
  // Parent Sessions
  getParentSession(sessionId: string): Promise<ParentSession | undefined>;
  createParentSession(session: InsertParentSession): Promise<ParentSession>;
  
  // Queue Entries
  getQueueEntry(id: string): Promise<QueueEntry | undefined>;
  getQueueEntriesForTeacher(teacherId: string): Promise<QueueEntry[]>;
  getQueueEntriesForParent(parentSessionId: string): Promise<QueueEntry[]>;
  createQueueEntry(entry: InsertQueueEntry): Promise<QueueEntry>;
  updateQueueEntry(id: string, updates: Partial<QueueEntry>): Promise<QueueEntry | undefined>;
  getNextQueuePosition(teacherId: string): Promise<number>;
  
  // Meetings
  getCurrentMeeting(teacherId: string): Promise<Meeting | undefined>;
  createMeeting(meeting: InsertMeeting): Promise<Meeting>;
  endMeeting(meetingId: string): Promise<Meeting | undefined>;
  extendMeeting(meetingId: string, extensionSeconds: number): Promise<Meeting | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Teachers
  async getTeacher(id: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
    return teacher || undefined;
  }

  async getTeacherByCode(code: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.uniqueCode, code));
    return teacher || undefined;
  }

  async getTeacherByUserId(userId: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, userId));
    return teacher || undefined;
  }

  async getAllTeachers(): Promise<Teacher[]> {
    return await db.select().from(teachers).where(eq(teachers.isActive, true)).orderBy(asc(teachers.name));
  }

  async createTeacher(insertTeacher: InsertTeacher, userId: string): Promise<Teacher> {
    const uniqueCode = this.generateUniqueCode(insertTeacher.name);
    const [teacher] = await db.insert(teachers).values({
      ...insertTeacher,
      userId,
      uniqueCode,
    }).returning();
    return teacher;
  }

  async updateTeacher(id: string, updates: Partial<Teacher>): Promise<Teacher | undefined> {
    const [teacher] = await db.update(teachers)
      .set(updates)
      .where(eq(teachers.id, id))
      .returning();
    return teacher || undefined;
  }

  // Parent Sessions
  async getParentSession(sessionId: string): Promise<ParentSession | undefined> {
    const [session] = await db.select().from(parentSessions).where(eq(parentSessions.sessionId, sessionId));
    return session || undefined;
  }

  async createParentSession(insertSession: InsertParentSession): Promise<ParentSession> {
    const [session] = await db.insert(parentSessions).values(insertSession).returning();
    return session;
  }

  // Queue Entries
  async getQueueEntry(id: string): Promise<QueueEntry | undefined> {
    const [entry] = await db.select().from(queueEntries).where(eq(queueEntries.id, id));
    return entry || undefined;
  }

  async getQueueEntriesForTeacher(teacherId: string): Promise<QueueEntry[]> {
    return await db.select()
      .from(queueEntries)
      .where(and(
        eq(queueEntries.teacherId, teacherId),
        eq(queueEntries.status, "waiting")
      ))
      .orderBy(asc(queueEntries.position));
  }

  async getQueueEntriesForParent(parentSessionId: string): Promise<QueueEntry[]> {
    return await db.select()
      .from(queueEntries)
      .where(eq(queueEntries.parentSessionId, parentSessionId))
      .orderBy(desc(queueEntries.joinedAt));
  }

  async createQueueEntry(insertEntry: InsertQueueEntry): Promise<QueueEntry> {
    const position = await this.getNextQueuePosition(insertEntry.teacherId);
    const [entry] = await db.insert(queueEntries).values({
      ...insertEntry,
      position,
    }).returning();
    return entry;
  }

  async updateQueueEntry(id: string, updates: Partial<QueueEntry>): Promise<QueueEntry | undefined> {
    const [entry] = await db.update(queueEntries)
      .set(updates)
      .where(eq(queueEntries.id, id))
      .returning();
    return entry || undefined;
  }

  async getNextQueuePosition(teacherId: string): Promise<number> {
    const entries = await db.select()
      .from(queueEntries)
      .where(and(
        eq(queueEntries.teacherId, teacherId),
        eq(queueEntries.status, "waiting")
      ))
      .orderBy(desc(queueEntries.position))
      .limit(1);
    
    return entries.length > 0 ? entries[0].position + 1 : 1;
  }

  // Meetings
  async getCurrentMeeting(teacherId: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select()
      .from(meetings)
      .where(and(
        eq(meetings.teacherId, teacherId),
        sql`${meetings.endedAt} IS NULL`
      ))
      .orderBy(desc(meetings.startedAt))
      .limit(1);
    return meeting || undefined;
  }

  async createMeeting(insertMeeting: InsertMeeting): Promise<Meeting> {
    const [meeting] = await db.insert(meetings).values(insertMeeting).returning();
    return meeting;
  }

  async endMeeting(meetingId: string): Promise<Meeting | undefined> {
    const now = new Date();
    const [meeting] = await db.update(meetings)
      .set({ 
        endedAt: now,
        duration: sql`EXTRACT(EPOCH FROM (${now} - ${meetings.startedAt}))`
      })
      .where(eq(meetings.id, meetingId))
      .returning();
    return meeting || undefined;
  }

  async extendMeeting(meetingId: string, extensionSeconds: number): Promise<Meeting | undefined> {
    const [meeting] = await db.update(meetings)
      .set({ 
        wasExtended: true,
        extendedBy: sql`${meetings.extendedBy} + ${extensionSeconds}`
      })
      .where(eq(meetings.id, meetingId))
      .returning();
    return meeting || undefined;
  }

  private generateUniqueCode(teacherName: string): string {
    const namePrefix = teacherName.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 6);
    const randomSuffix = Math.floor(Math.random() * 99) + 1;
    return `${namePrefix}${randomSuffix}`;
  }
}

export const storage = new DatabaseStorage();
