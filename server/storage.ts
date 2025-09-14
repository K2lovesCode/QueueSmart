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
  skipNoShowParent(teacherId: string, broadcastFn: Function): Promise<{ success: boolean; error?: string }>;
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
        sql`${queueEntries.status} IN ('waiting', 'next', 'current', 'skipped')`
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
    // CRITICAL FIX: Use SERIALIZABLE transaction with proper locking
    return await db.transaction(async (tx) => {
      try {
        // SERIALIZABLE isolation prevents all race conditions
        // SELECT FOR UPDATE locks the position sequence to prevent duplicates
        const positions = await tx.select({ position: queueEntries.position })
          .from(queueEntries)
          .where(and(
            eq(queueEntries.teacherId, insertEntry.teacherId),
            sql`${queueEntries.status} IN ('waiting', 'next', 'current')`
          ))
          .orderBy(desc(queueEntries.position))
          .limit(1)
          .for('update');
        
        const nextPosition = positions.length > 0 ? positions[0].position + 1 : 1;
        
        // Insert with calculated position atomically
        const [entry] = await tx.insert(queueEntries).values({
          ...insertEntry,
          position: nextPosition,
        }).returning();
        
        return entry;
      } catch (error) {
        console.error('Error creating queue entry:', error);
        throw error;
      }
    }, {
      isolationLevel: 'serializable' // CRITICAL: Prevents all concurrent read-write anomalies
    });
  }

  async updateQueueEntry(id: string, updates: Partial<QueueEntry>): Promise<QueueEntry | undefined> {
    const [entry] = await db.update(queueEntries)
      .set(updates)
      .where(eq(queueEntries.id, id))
      .returning();
    return entry || undefined;
  }

  async getNextQueuePosition(teacherId: string): Promise<number> {
    // This method is now deprecated - position calculation is done atomically in createQueueEntry
    // Keeping for compatibility but recommend using createQueueEntry directly
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
        // Teacher is busy, move this parent to first position in waiting queue atomically
        await db.transaction(async (tx) => {
          // Get all active entries (waiting, next, current) with row lock to prevent conflicts
          const activeEntries = await tx.select()
            .from(queueEntries)
            .where(and(
              eq(queueEntries.teacherId, skippedEntry.teacherId),
              sql`${queueEntries.status} IN ('waiting', 'next', 'current')`
            ))
            .orderBy(desc(queueEntries.position))
            .for('update');
          
          // First, shift all existing entries up by 1 position (in descending order to avoid conflicts)
          for (const entry of activeEntries) {
            await tx.update(queueEntries)
              .set({ position: entry.position + 1 })
              .where(eq(queueEntries.id, entry.id));
          }
          
          // Now set the skipped entry to position 1 (no conflict since we made room)
          await tx.update(queueEntries)
            .set({
              status: 'waiting',
              position: 1
            })
            .where(eq(queueEntries.id, skippedEntry.id));
        });
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
    return await db.transaction(async (tx) => {
      try {
        // Double-check that teacher is still free before creating meeting
        const [currentMeeting] = await tx.select()
          .from(meetings)
          .where(and(
            eq(meetings.teacherId, insertMeeting.teacherId),
            sql`${meetings.endedAt} IS NULL`
          ))
          .limit(1);
        
        if (currentMeeting) {
          return { 
            success: false, 
            error: 'Teacher is no longer available' 
          };
        }

        // Also verify parent is not in another meeting
        const [queueEntry] = await tx.select()
          .from(queueEntries)
          .where(eq(queueEntries.id, insertMeeting.queueEntryId))
          .limit(1);
          
        if (!queueEntry) {
          return { 
            success: false, 
            error: 'Queue entry not found' 
          };
        }

        // Check if parent is already in an active meeting
        const [parentInMeeting] = await tx.select()
          .from(meetings)
          .innerJoin(queueEntries, eq(meetings.queueEntryId, queueEntries.id))
          .where(and(
            eq(queueEntries.parentSessionId, queueEntry.parentSessionId),
            sql`${meetings.endedAt} IS NULL`
          ))
          .limit(1);

        if (parentInMeeting) {
          return { 
            success: false, 
            error: 'Parent is already in another meeting' 
          };
        }

        // Create meeting atomically within transaction
        const [meeting] = await tx.insert(meetings).values(insertMeeting).returning();
        
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
    });
  }

  // Advanced queue management - find next available parent and start meeting
  async advanceQueueForTeacher(teacherId: string, broadcastFn: Function): Promise<{ meeting?: Meeting; nextEntry?: any; skippedEntries?: any[] }> {
    return await db.transaction(async (tx) => {
      // Get queue entries within transaction for consistency
      const queue = await tx.select({
        id: queueEntries.id,
        teacherId: queueEntries.teacherId,
        parentSessionId: queueEntries.parentSessionId,
        childName: queueEntries.childName,
        status: queueEntries.status,
        position: queueEntries.position,
        joinedAt: queueEntries.joinedAt,
        teacher: {
          id: teachers.id,
          name: teachers.name,
          subject: teachers.subject,
        }
      })
        .from(queueEntries)
        .leftJoin(teachers, eq(queueEntries.teacherId, teachers.id))
        .where(and(
          eq(queueEntries.teacherId, teacherId),
          sql`${queueEntries.status} IN ('waiting', 'next')`
        ))
        .orderBy(asc(queueEntries.position));

      const skippedEntries: any[] = [];
      let meeting: Meeting | undefined;
      let nextEntry: any;

      // Try each person in queue until we find someone available
      for (const entry of queue) {
        // Check if parent is already in an active meeting (within transaction)
        const [parentInMeeting] = await tx.select()
          .from(meetings)
          .innerJoin(queueEntries, eq(meetings.queueEntryId, queueEntries.id))
          .where(and(
            eq(queueEntries.parentSessionId, entry.parentSessionId),
            sql`${meetings.endedAt} IS NULL`
          ))
          .limit(1);
        
        if (parentInMeeting) {
          // Parent is busy, mark as skipped
          await tx.update(queueEntries)
            .set({ status: 'skipped' })
            .where(eq(queueEntries.id, entry.id));
          
          skippedEntries.push(entry);
          
          // Notify parent their turn was skipped
          broadcastFn({
            type: 'status_update',
            queueEntryId: entry.id,
            status: 'skipped',
            message: 'Your turn was skipped because you are currently in another meeting. You will have priority when your current meeting ends.'
          }, (ws: any) => ws.userType === 'parent' && ws.parentSessionId === entry.parentSessionId);
        } else {
          // Parent is available, try to start meeting
          try {
            // Create meeting atomically
            const [newMeeting] = await tx.insert(meetings).values({
              teacherId,
              queueEntryId: entry.id
            }).returning();

            // Update queue entry status
            await tx.update(queueEntries)
              .set({ 
                status: 'current',
                startedAt: new Date()
              })
              .where(eq(queueEntries.id, entry.id));

            meeting = newMeeting;
            nextEntry = entry;
            
            // Notify parent their turn is now
            broadcastFn({
              type: 'status_update',
              queueEntryId: entry.id,
              status: 'current',
              message: 'YOUR TURN NOW!'
            }, (ws: any) => ws.userType === 'parent' && ws.parentSessionId === entry.parentSessionId);
            
            break; // Found someone, stop looking
          } catch (error) {
            // Meeting creation failed (likely due to unique constraint), skip this entry
            continue;
          }
        }
      }

      // Update the next available person in queue to "next"
      if (meeting) {
        const waitingEntries = await tx.select()
          .from(queueEntries)
          .where(and(
            eq(queueEntries.teacherId, teacherId),
            eq(queueEntries.status, 'waiting')
          ))
          .orderBy(asc(queueEntries.position))
          .limit(1);

        if (waitingEntries.length > 0) {
          const nextQueueEntry = waitingEntries[0];
          await tx.update(queueEntries)
            .set({ 
              status: 'next',
              notifiedAt: new Date()
            })
            .where(eq(queueEntries.id, nextQueueEntry.id));

          broadcastFn({
            type: 'status_update',
            queueEntryId: nextQueueEntry.id,
            status: 'next',
            message: 'GETTING CLOSE'
          }, (ws: any) => ws.userType === 'parent' && ws.parentSessionId === nextQueueEntry.parentSessionId);
        }
      }

      return {
        meeting,
        nextEntry,
        skippedEntries
      };
    });
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

  async skipNoShowParent(teacherId: string, broadcastFn: Function): Promise<{ success: boolean; error?: string }> {
    return await db.transaction(async (tx) => {
      try {
        // Check if there's an active meeting and end it first
        const currentMeeting = await this.getCurrentMeeting(teacherId);
        if (currentMeeting) {
          await this.endMeeting(currentMeeting.id);
        }
        
        const queue = await this.getQueueEntriesForTeacher(teacherId);
        
        if (queue.length > 0) {
          const skippedEntry = queue[0];
          
          // Mark as skipped
          await this.updateQueueEntry(skippedEntry.id, {
            status: 'skipped',
            completedAt: new Date()
          });

          // Notify the skipped parent
          broadcastFn({
            type: 'queue_removed',
            queueEntryId: skippedEntry.id,
            message: 'You have been removed from the queue'
          }, (ws: any) => ws.userType === 'parent' && ws.parentSessionId === skippedEntry.parentSessionId);

          // Process parent's other skipped entries to reactivate them
          await this.processQueueAfterMeetingEnd(skippedEntry.parentSessionId, broadcastFn);

          // Use improved queue advancement to find next available parent
          const advanceResult = await this.advanceQueueForTeacher(teacherId, broadcastFn);
          
          if (advanceResult.meeting) {
            // Broadcast meeting started to teacher and admin
            broadcastFn({
              type: 'meeting_started',
              teacherId,
              meeting: advanceResult.meeting
            }, (ws: any) => (ws.userType === 'teacher' && ws.teacherId === teacherId) || ws.userType === 'admin');
          }
        }

        // Broadcast meeting ended for UI consistency
        broadcastFn({
          type: 'meeting_ended',
          teacherId
        }, (ws: any) => (ws.userType === 'teacher' && ws.teacherId === teacherId) || ws.userType === 'admin');

        broadcastFn({
          type: 'queue_update',
          teacherId
        }, (ws: any) => (ws.userType === 'teacher' && ws.teacherId === teacherId) || ws.userType === 'admin');

        return { success: true };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
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
