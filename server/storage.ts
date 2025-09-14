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
  getNextQueuePosition(teacherId: string): Promise<number>;
  processQueueAfterMeetingEnd(parentSessionId: string, broadcastFn: Function): Promise<void>;
  
  // Meetings
  getCurrentMeeting(teacherId: string): Promise<Meeting | undefined>;
  createMeeting(meeting: InsertMeeting): Promise<Meeting>;
  createMeetingIfTeacherFree(meeting: InsertMeeting): Promise<{ success: boolean; meeting?: Meeting; error?: string }>;
  endMeeting(meetingId: string): Promise<Meeting | undefined>;
  extendMeeting(meetingId: string, extensionSeconds: number): Promise<Meeting | undefined>;
  
  // Thread-safe operations
  advanceQueueForTeacher(teacherId: string, broadcastFn: Function): Promise<{ meeting?: Meeting; nextEntry?: any; skippedEntries?: any[] }>;
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

  // Parent Sessions
  async getParentSession(sessionId: string): Promise<ParentSession | undefined> {
    const [session] = await db.select().from(parentSessions).where(eq(parentSessions.sessionId, sessionId));
    return session || undefined;
  }

  async createParentSession(insertSession: InsertParentSession): Promise<ParentSession> {
    const [session] = await db.insert(parentSessions).values(insertSession).returning();
    return session;
  }

  // Check if parent is currently in any active meeting
  async isParentInActiveMeeting(parentSessionId: string): Promise<boolean> {
    const activeMeetings = await db.select({
      meetingId: meetings.id,
      parentSessionId: queueEntries.parentSessionId
    })
      .from(meetings)
      .innerJoin(queueEntries, eq(meetings.queueEntryId, queueEntries.id))
      .where(and(
        eq(queueEntries.parentSessionId, parentSessionId),
        isNull(meetings.endedAt)
      ));
    
    return activeMeetings.length > 0;
  }

  // Queue Entries
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
      notifiedAt: queueEntries.notifiedAt,
      startedAt: queueEntries.startedAt,
      completedAt: queueEntries.completedAt,
      parentSession: {
        id: parentSessions.id,
        parentName: parentSessions.parentName
      }
    })
      .from(queueEntries)
      .leftJoin(parentSessions, eq(queueEntries.parentSessionId, parentSessions.id))
      .where(and(
        eq(queueEntries.teacherId, teacherId),
        sql`${queueEntries.status} IN ('waiting', 'next', 'current')`
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
      notifiedAt: queueEntries.notifiedAt,
      startedAt: queueEntries.startedAt,
      completedAt: queueEntries.completedAt,
      teacher: {
        id: teachers.id,
        name: teachers.name,
        subject: teachers.subject,
        uniqueCode: teachers.uniqueCode
      }
    })
      .from(queueEntries)
      .leftJoin(teachers, eq(queueEntries.teacherId, teachers.id))
      .where(and(
        eq(queueEntries.parentSessionId, parentSessionId),
        sql`${queueEntries.status} IN ('waiting', 'next', 'current')`
      ))
      .orderBy(asc(queueEntries.position));
  }

  // Get ALL queue entries (including skipped and completed) for a teacher
  async getAllQueueEntriesForTeacher(teacherId: string): Promise<any[]> {
    return await db.select({
      id: queueEntries.id,
      teacherId: queueEntries.teacherId,
      parentSessionId: queueEntries.parentSessionId,
      childName: queueEntries.childName,
      status: queueEntries.status,
      position: queueEntries.position,
      joinedAt: queueEntries.joinedAt,
      notifiedAt: queueEntries.notifiedAt,
      startedAt: queueEntries.startedAt,
      completedAt: queueEntries.completedAt,
      parentSession: {
        id: parentSessions.id,
        parentName: parentSessions.parentName
      }
    })
      .from(queueEntries)
      .leftJoin(parentSessions, eq(queueEntries.parentSessionId, parentSessions.id))
      .where(eq(queueEntries.teacherId, teacherId))
      .orderBy(asc(queueEntries.position));
  }

  // Check if parent is in ANY queue for this teacher (including skipped)
  async isParentInTeacherQueue(parentSessionId: string, teacherId: string): Promise<boolean> {
    const entries = await db.select({ id: queueEntries.id })
      .from(queueEntries)
      .where(and(
        eq(queueEntries.parentSessionId, parentSessionId),
        eq(queueEntries.teacherId, teacherId),
        sql`${queueEntries.status} != 'completed'` // Exclude only completed entries
      ))
      .limit(1);
    
    return entries.length > 0;
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
        sql`${queueEntries.status} IN ('waiting', 'next', 'current')`
      ))
      .orderBy(desc(queueEntries.position))
      .limit(1);
    
    return entries.length > 0 ? entries[0].position + 1 : 1;
  }

  async processQueueAfterMeetingEnd(parentSessionId: string, broadcastFn: Function): Promise<void> {
    // Find any skipped entries for this parent and give them priority
    const skippedEntries = await db.select()
      .from(queueEntries)
      .where(and(
        eq(queueEntries.parentSessionId, parentSessionId),
        eq(queueEntries.status, 'skipped')
      ))
      .orderBy(asc(queueEntries.joinedAt)); // Priority based on when they originally joined

    for (const skippedEntry of skippedEntries) {
      // Use atomic meeting creation to prevent race conditions
      const result = await this.createMeetingIfTeacherFree({
        teacherId: skippedEntry.teacherId,
        queueEntryId: skippedEntry.id
      });
      
      if (result.success && result.meeting) {
        // Successfully started meeting, update queue entry
        await this.updateQueueEntry(skippedEntry.id, {
          status: 'current',
          startedAt: new Date()
        });

        // Send broadcast notification
        broadcastFn({
          type: 'status_update',
          queueEntryId: skippedEntry.id,
          status: 'current',
          message: 'YOUR TURN NOW!'
        }, (ws: any) => ws.userType === 'parent' && ws.parentSessionId === parentSessionId);

        // Broadcast to teacher and admin
        broadcastFn({
          type: 'meeting_started',
          teacherId: skippedEntry.teacherId,
          meeting: result.meeting
        }, (ws: any) => (ws.userType === 'teacher' && ws.teacherId === skippedEntry.teacherId) || ws.userType === 'admin');

        // Only process one skipped entry at a time (parent can only be in one meeting)
        break;
      } else {
        // Teacher is busy, move this parent to first position in waiting queue
        await this.updateQueueEntry(skippedEntry.id, {
          status: 'waiting',
          position: 0 // Give them priority position
        });
        
        // Shift other waiting entries down
        await db.update(queueEntries)
          .set({ position: sql`${queueEntries.position} + 1` })
          .where(and(
            eq(queueEntries.teacherId, skippedEntry.teacherId),
            eq(queueEntries.status, 'waiting'),
            sql`${queueEntries.id} != ${skippedEntry.id}`
          ));
      }
    }
  }

  // Meetings
  async getCurrentMeeting(teacherId: string): Promise<any> {
    const [meeting] = await db.select({
      id: meetings.id,
      teacherId: meetings.teacherId,
      queueEntryId: meetings.queueEntryId,
      startedAt: meetings.startedAt,
      endedAt: meetings.endedAt,
      duration: meetings.duration,
      wasExtended: meetings.wasExtended,
      extendedBy: meetings.extendedBy,
      queueEntry: {
        id: queueEntries.id,
        childName: queueEntries.childName,
        parentName: parentSessions.parentName
      }
    })
      .from(meetings)
      .leftJoin(queueEntries, eq(meetings.queueEntryId, queueEntries.id))
      .leftJoin(parentSessions, eq(queueEntries.parentSessionId, parentSessions.id))
      .where(and(
        eq(meetings.teacherId, teacherId),
        sql`${meetings.endedAt} IS NULL`
      ))
      .orderBy(desc(meetings.startedAt))
      .limit(1);
    return meeting || null;
  }

  async createMeeting(insertMeeting: InsertMeeting): Promise<Meeting> {
    const [meeting] = await db.insert(meetings).values(insertMeeting).returning();
    return meeting;
  }

  // Atomic operation to create meeting only if teacher is free
  async createMeetingIfTeacherFree(insertMeeting: InsertMeeting): Promise<{ success: boolean; meeting?: Meeting; error?: string }> {
    try {
      // Double-check that teacher is still free before creating meeting
      const currentMeeting = await this.getCurrentMeeting(insertMeeting.teacherId);
      
      if (currentMeeting) {
        return { 
          success: false, 
          error: 'Teacher is no longer available' 
        };
      }

      // Also verify parent is not in another meeting
      const queueEntry = await this.getQueueEntry(insertMeeting.queueEntryId);
      if (!queueEntry) {
        return { 
          success: false, 
          error: 'Queue entry not found' 
        };
      }

      const parentInMeeting = await this.isParentInActiveMeeting(queueEntry.parentSessionId);
      if (parentInMeeting) {
        return { 
          success: false, 
          error: 'Parent is already in another meeting' 
        };
      }

      // Create meeting atomically
      const meeting = await this.createMeeting(insertMeeting);
      
      return { 
        success: true, 
        meeting 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Advanced queue management - find next available parent and start meeting
  async advanceQueueForTeacher(teacherId: string, broadcastFn: Function): Promise<{ meeting?: Meeting; nextEntry?: any; skippedEntries?: any[] }> {
    const queue = await this.getQueueEntriesForTeacher(teacherId);
    const skippedEntries: any[] = [];
    let meeting: Meeting | undefined;
    let nextEntry: any;

    // Try each person in queue until we find someone available
    for (const entry of queue) {
      const parentInMeeting = await this.isParentInActiveMeeting(entry.parentSessionId);
      
      if (parentInMeeting) {
        // Parent is busy, mark as skipped
        await this.updateQueueEntry(entry.id, {
          status: 'skipped'
        });
        
        skippedEntries.push(entry);
        
        // Notify parent their turn was skipped
        broadcastFn({
          type: 'status_update',
          queueEntryId: entry.id,
          status: 'skipped',
          message: 'Your turn was skipped because you are currently in another meeting. You will have priority when your current meeting ends.'
        }, (ws: any) => ws.userType === 'parent' && ws.parentSessionId === entry.parentSessionId);
      } else {
        // Parent is available, start meeting
        const result = await this.createMeetingIfTeacherFree({
          teacherId,
          queueEntryId: entry.id
        });
        
        if (result.success && result.meeting) {
          await this.updateQueueEntry(entry.id, {
            status: 'current',
            startedAt: new Date()
          });

          meeting = result.meeting;
          nextEntry = entry;
          
          // Notify parent their turn is now
          broadcastFn({
            type: 'status_update',
            queueEntryId: entry.id,
            status: 'current',
            message: 'YOUR TURN NOW!'
          }, (ws: any) => ws.userType === 'parent' && ws.parentSessionId === entry.parentSessionId);
          
          break; // Found someone, stop looking
        }
      }
    }

    // Update the next available person in queue to "next"
    if (meeting) {
      const updatedQueue = await this.getQueueEntriesForTeacher(teacherId);
      const waitingEntries = updatedQueue.filter(entry => entry.status === 'waiting');
      if (waitingEntries.length > 0) {
        await this.updateQueueEntry(waitingEntries[0].id, {
          status: 'next',
          notifiedAt: new Date()
        });

        broadcastFn({
          type: 'status_update',
          queueEntryId: waitingEntries[0].id,
          status: 'next',
          message: 'GETTING CLOSE'
        }, (ws: any) => ws.userType === 'parent' && ws.parentSessionId === waitingEntries[0].parentSessionId);
      }
    }

    return {
      meeting,
      nextEntry,
      skippedEntries
    };
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

  private async generateUniqueCode(teacherName: string): Promise<string> {
    const namePrefix = teacherName.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 6);
    let attempts = 0;
    let code: string;
    
    do {
      const randomSuffix = Math.floor(Math.random() * 999) + 1;
      code = `${namePrefix}${randomSuffix}`;
      
      // Check if code already exists
      const existing = await this.getTeacherByCode(code);
      if (!existing) {
        return code;
      }
      
      attempts++;
    } while (attempts < 100); // Prevent infinite loop
    
    // Fallback: add timestamp if all attempts failed
    return `${namePrefix}${Date.now().toString().slice(-3)}`;
  }
}

export const storage = new DatabaseStorage();
