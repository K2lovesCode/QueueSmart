import { 
  users, teachers, parentSessions, queueEntries, meetings,
  type User, type InsertUser, type Teacher, type InsertTeacher,
  type ParentSession, type InsertParentSession, type QueueEntry, 
  type InsertQueueEntry, type Meeting, type InsertMeeting
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, isNull } from "drizzle-orm";
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
  
  // Parent Meeting Status
  isParentInActiveMeeting(parentSessionId: string): Promise<boolean>;
  
  // Queue Entries
  getQueueEntry(id: string): Promise<QueueEntry | undefined>;
  getQueueEntriesForTeacher(teacherId: string): Promise<any[]>;
  getQueueEntriesForParent(parentSessionId: string): Promise<any[]>;
  getAllQueueEntriesForTeacher(teacherId: string): Promise<any[]>;
  isParentInTeacherQueue(parentSessionId: string, teacherId: string): Promise<boolean>;
  createQueueEntry(entry: InsertQueueEntry): Promise<QueueEntry>;
  updateQueueEntry(id: string, updates: Partial<QueueEntry>): Promise<QueueEntry | undefined>;
  deleteQueueEntry(id: string): Promise<void>;
  
  // Meetings
  getMeeting(id: string): Promise<Meeting | undefined>;
  createMeetingIfTeacherFree(params: { teacherId: string; queueEntryId: string }): Promise<{ success: boolean; meeting?: Meeting }>;
  endMeeting(meetingId: string): Promise<void>;
  getActiveMeetingForTeacher(teacherId: string): Promise<Meeting | undefined>;
  getActiveMeetingForParent(parentSessionId: string): Promise<Meeting | undefined>;
  
  // Admin
  generateUniqueCode(teacherName: string): Promise<string>;
}

class DatabaseStorage implements IStorage {
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

  async getTeacher(id: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
    return teacher || undefined;
  }

  async getTeacherByCode(code: string): Promise<Teacher | undefined> {
    // CASE SENSITIVITY FIX: Normalize teacher codes to uppercase for matching
    const normalizedCode = code.toUpperCase().trim();
    const [teacher] = await db.select().from(teachers).where(eq(teachers.uniqueCode, normalizedCode));
    return teacher || undefined;
  }

  async getTeacherByUserId(userId: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, userId));
    return teacher || undefined;
  }

  async getAllTeachers(): Promise<Teacher[]> {
    return await db.select().from(teachers);
  }

  async createTeacher(insertTeacher: InsertTeacher, userId: string): Promise<Teacher> {
    const uniqueCode = await this.generateUniqueCode(insertTeacher.name);
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

  async getParentSession(sessionId: string): Promise<ParentSession | undefined> {
    const [session] = await db.select().from(parentSessions).where(eq(parentSessions.id, sessionId));
    return session || undefined;
  }

  async createParentSession(session: InsertParentSession): Promise<ParentSession> {
    const [newSession] = await db.insert(parentSessions).values(session).returning();
    return newSession;
  }

  async isParentInActiveMeeting(parentSessionId: string): Promise<boolean> {
    const [meeting] = await db.select().from(meetings)
      .where(and(
        eq(meetings.parentSessionId, parentSessionId),
        isNull(meetings.endedAt)
      ));
    return !!meeting;
  }

  async getQueueEntry(id: string): Promise<QueueEntry | undefined> {
    const [entry] = await db.select().from(queueEntries).where(eq(queueEntries.id, id));
    return entry || undefined;
  }

  async getQueueEntriesForTeacher(teacherId: string): Promise<any[]> {
    return await db.select({
      id: queueEntries.id,
      teacherId: queueEntries.teacherId,
      parentSessionId: queueEntries.parentSessionId,
      childName: queueEntries.childName,
      status: queueEntries.status,
      position: queueEntries.position,
      joinedAt: queueEntries.joinedAt,
      startedAt: queueEntries.startedAt,
      parentName: parentSessions.parentName
    })
    .from(queueEntries)
    .leftJoin(parentSessions, eq(queueEntries.parentSessionId, parentSessions.id))
    .where(and(
      eq(queueEntries.teacherId, teacherId),
      isNull(queueEntries.completedAt)
    ))
    .orderBy(asc(queueEntries.position));
  }

  async getQueueEntriesForParent(parentSessionId: string): Promise<any[]> {
    return await db.select({
      id: queueEntries.id,
      teacherId: queueEntries.teacherId,
      parentSessionId: queueEntries.parentSessionId,
      childName: queueEntries.childName,
      status: queueEntries.status,
      position: queueEntries.position,
      joinedAt: queueEntries.joinedAt,
      startedAt: queueEntries.startedAt,
      teacherName: teachers.name,
      teacherSubject: teachers.subject
    })
    .from(queueEntries)
    .leftJoin(teachers, eq(queueEntries.teacherId, teachers.id))
    .where(and(
      eq(queueEntries.parentSessionId, parentSessionId),
      isNull(queueEntries.completedAt)
    ))
    .orderBy(desc(queueEntries.joinedAt));
  }

  async getAllQueueEntriesForTeacher(teacherId: string): Promise<any[]> {
    return await db.select({
      id: queueEntries.id,
      teacherId: queueEntries.teacherId,
      parentSessionId: queueEntries.parentSessionId,
      childName: queueEntries.childName,
      status: queueEntries.status,
      position: queueEntries.position,
      joinedAt: queueEntries.joinedAt,
      startedAt: queueEntries.startedAt,
      completedAt: queueEntries.completedAt,
      parentName: parentSessions.parentName
    })
    .from(queueEntries)
    .leftJoin(parentSessions, eq(queueEntries.parentSessionId, parentSessions.id))
    .where(eq(queueEntries.teacherId, teacherId))
    .orderBy(desc(queueEntries.joinedAt));
  }

  async isParentInTeacherQueue(parentSessionId: string, teacherId: string): Promise<boolean> {
    const [entry] = await db.select().from(queueEntries)
      .where(and(
        eq(queueEntries.parentSessionId, parentSessionId),
        eq(queueEntries.teacherId, teacherId),
        isNull(queueEntries.completedAt)
      ));
    return !!entry;
  }

  async createQueueEntry(entry: InsertQueueEntry): Promise<QueueEntry> {
    return await db.transaction(async (trx) => {
      // Get current max position for this teacher
      const [maxPositionResult] = await trx.select({ 
        maxPosition: sql<number>`COALESCE(MAX(position), 0)` 
      }).from(queueEntries)
        .where(and(
          eq(queueEntries.teacherId, entry.teacherId),
          isNull(queueEntries.completedAt)
        ))
        .for('update'); // Lock to prevent race conditions

      const nextPosition = (maxPositionResult?.maxPosition || 0) + 1;

      const [newEntry] = await trx.insert(queueEntries).values({
        ...entry,
        position: nextPosition
      }).returning();

      return newEntry;
    }, { isolationLevel: 'serializable' });
  }

  async updateQueueEntry(id: string, updates: Partial<QueueEntry>): Promise<QueueEntry | undefined> {
    const [entry] = await db.update(queueEntries)
      .set(updates)
      .where(eq(queueEntries.id, id))
      .returning();
    return entry || undefined;
  }

  async deleteQueueEntry(id: string): Promise<void> {
    await db.delete(queueEntries).where(eq(queueEntries.id, id));
  }

  async getMeeting(id: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));
    return meeting || undefined;
  }

  async createMeetingIfTeacherFree(params: { teacherId: string; queueEntryId: string }): Promise<{ success: boolean; meeting?: Meeting }> {
    try {
      const meeting = await db.transaction(async (trx) => {
        // Check if teacher is free
        const [existingMeeting] = await trx.select().from(meetings)
          .where(and(
            eq(meetings.teacherId, params.teacherId),
            isNull(meetings.endedAt)
          ))
          .for('update');

        if (existingMeeting) {
          throw new Error('Teacher is busy');
        }

        // Get queue entry details
        const [queueEntry] = await trx.select().from(queueEntries)
          .where(eq(queueEntries.id, params.queueEntryId))
          .for('update');

        if (!queueEntry) {
          throw new Error('Queue entry not found');
        }

        // Create meeting
        const [newMeeting] = await trx.insert(meetings).values({
          teacherId: params.teacherId,
          parentSessionId: queueEntry.parentSessionId,
          queueEntryId: params.queueEntryId,
          startedAt: new Date()
        }).returning();

        return newMeeting;
      }, { isolationLevel: 'serializable' });

      return { success: true, meeting };
    } catch (error) {
      return { success: false };
    }
  }

  async endMeeting(meetingId: string): Promise<void> {
    await db.update(meetings)
      .set({ endedAt: new Date() })
      .where(eq(meetings.id, meetingId));
  }

  async getActiveMeetingForTeacher(teacherId: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings)
      .where(and(
        eq(meetings.teacherId, teacherId),
        isNull(meetings.endedAt)
      ));
    return meeting || undefined;
  }

  async getActiveMeetingForParent(parentSessionId: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings)
      .where(and(
        eq(meetings.parentSessionId, parentSessionId),
        isNull(meetings.endedAt)
      ));
    return meeting || undefined;
  }

  async generateUniqueCode(teacherName: string): Promise<string> {
    const namePrefix = teacherName
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .substring(0, 3);

    let attempts = 0;
    do {
      const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const code = namePrefix + randomSuffix;
      
      const existing = await this.getTeacherByCode(code);
      if (!existing) {
        return code;
      }
      
      attempts++;
    } while (attempts < 100);
    
    return `${namePrefix}${Date.now().toString().slice(-3)}`;
  }
}

export const storage = new DatabaseStorage();