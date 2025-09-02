import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertTeacherSchema, insertParentSessionSchema, insertQueueEntrySchema, insertMeetingSchema } from "@shared/schema";
import QRCode from "qrcode";
import { nanoid } from "nanoid";

interface ExtendedWebSocket extends WebSocket {
  sessionId?: string;
  userType?: 'parent' | 'teacher' | 'admin';
  teacherId?: string;
  parentSessionId?: string;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // WebSocket connections management
  const connections = new Map<string, ExtendedWebSocket>();

  wss.on('connection', (ws: ExtendedWebSocket, req) => {
    const connectionId = nanoid();
    connections.set(connectionId, ws);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'identify':
            ws.sessionId = message.sessionId;
            ws.userType = message.userType;
            ws.teacherId = message.teacherId;
            ws.parentSessionId = message.parentSessionId;
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      connections.delete(connectionId);
    });
  });

  // Broadcast to specific user types
  function broadcast(message: any, filter?: (ws: ExtendedWebSocket) => boolean) {
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN && (!filter || filter(ws))) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  // Parent Routes
  app.post('/api/parent/session', async (req, res) => {
    try {
      const { sessionId, parentName } = req.body;
      
      let session = await storage.getParentSession(sessionId);
      if (!session) {
        session = await storage.createParentSession({ sessionId, parentName });
      }
      
      res.json(session);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/parent/session/:sessionId', async (req, res) => {
    try {
      const session = await storage.getParentSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/parent/:sessionId/queues', async (req, res) => {
    try {
      const session = await storage.getParentSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const queues = await storage.getQueueEntriesForParent(session.id);
      res.json(queues);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/parent/join-queue', async (req, res) => {
    try {
      const { sessionId, teacherCode, childName, childGrade } = req.body;
      
      const session = await storage.getParentSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const teacher = await storage.getTeacherByCode(teacherCode);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      const queueEntry = await storage.createQueueEntry({
        teacherId: teacher.id,
        parentSessionId: session.id,
        childName,
        childGrade,
        status: 'waiting'
      });

      // Broadcast queue update to teacher
      broadcast({
        type: 'queue_update',
        teacherId: teacher.id,
        queueEntry
      }, (ws) => ws.userType === 'teacher' && ws.teacherId === teacher.id);

      // Broadcast to admin
      broadcast({
        type: 'queue_update',
        teacherId: teacher.id
      }, (ws) => ws.userType === 'admin');

      res.json(queueEntry);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Teacher Routes
  app.get('/api/teacher/:teacherId', async (req, res) => {
    try {
      const teacher = await storage.getTeacher(req.params.teacherId);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      res.json(teacher);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/teacher/:teacherId/queue', async (req, res) => {
    try {
      const queue = await storage.getQueueEntriesForTeacher(req.params.teacherId);
      res.json(queue);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/teacher/:teacherId/current-meeting', async (req, res) => {
    try {
      const meeting = await storage.getCurrentMeeting(req.params.teacherId);
      res.json(meeting || null);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/teacher/:teacherId/end-meeting', async (req, res) => {
    try {
      const teacherId = req.params.teacherId;
      const currentMeeting = await storage.getCurrentMeeting(teacherId);
      
      if (currentMeeting) {
        await storage.endMeeting(currentMeeting.id);
        
        // Update current queue entry to completed
        await storage.updateQueueEntry(currentMeeting.queueEntryId, {
          status: 'completed',
          completedAt: new Date()
        });
      }

      // Get next parent in queue
      const queue = await storage.getQueueEntriesForTeacher(teacherId);
      if (queue.length > 0) {
        const nextEntry = queue[0];
        
        // Update next entry to current
        await storage.updateQueueEntry(nextEntry.id, {
          status: 'current',
          startedAt: new Date()
        });

        // Create new meeting
        await storage.createMeeting({
          teacherId,
          queueEntryId: nextEntry.id
        });

        // Notify parent their turn is now
        broadcast({
          type: 'status_update',
          queueEntryId: nextEntry.id,
          status: 'current',
          message: 'YOUR TURN NOW!'
        }, (ws) => ws.userType === 'parent' && ws.parentSessionId === nextEntry.parentSessionId);

        // Update the second person in queue to "next"
        if (queue.length > 1) {
          await storage.updateQueueEntry(queue[1].id, {
            status: 'next',
            notifiedAt: new Date()
          });

          broadcast({
            type: 'status_update',
            queueEntryId: queue[1].id,
            status: 'next',
            message: 'GETTING CLOSE'
          }, (ws) => ws.userType === 'parent' && ws.parentSessionId === queue[1].parentSessionId);
        }
      }

      // Broadcast updates to teacher and admin
      broadcast({
        type: 'meeting_ended',
        teacherId
      }, (ws) => (ws.userType === 'teacher' && ws.teacherId === teacherId) || ws.userType === 'admin');

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/teacher/:teacherId/extend-meeting', async (req, res) => {
    try {
      const currentMeeting = await storage.getCurrentMeeting(req.params.teacherId);
      if (!currentMeeting) {
        return res.status(404).json({ error: 'No active meeting' });
      }

      await storage.extendMeeting(currentMeeting.id, 300); // 5 minutes

      // Notify next parent about delay
      const queue = await storage.getQueueEntriesForTeacher(req.params.teacherId);
      if (queue.length > 0) {
        const nextEntry = queue[0];
        broadcast({
          type: 'delay_notification',
          queueEntryId: nextEntry.id,
          message: 'Slight delay - meeting extended by 5 minutes'
        }, (ws) => ws.userType === 'parent' && ws.parentSessionId === nextEntry.parentSessionId);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/teacher/:teacherId/skip-no-show', async (req, res) => {
    try {
      const teacherId = req.params.teacherId;
      const queue = await storage.getQueueEntriesForTeacher(teacherId);
      
      if (queue.length > 0) {
        const skippedEntry = queue[0];
        
        // Mark as skipped
        await storage.updateQueueEntry(skippedEntry.id, {
          status: 'skipped',
          completedAt: new Date()
        });

        // Move to next person
        if (queue.length > 1) {
          const nextEntry = queue[1];
          
          await storage.updateQueueEntry(nextEntry.id, {
            status: 'current',
            startedAt: new Date()
          });

          await storage.createMeeting({
            teacherId,
            queueEntryId: nextEntry.id
          });

          broadcast({
            type: 'status_update',
            queueEntryId: nextEntry.id,
            status: 'current',
            message: 'YOUR TURN NOW!'
          }, (ws) => ws.userType === 'parent' && ws.parentSessionId === nextEntry.parentSessionId);
        }
      }

      broadcast({
        type: 'queue_update',
        teacherId
      }, (ws) => (ws.userType === 'teacher' && ws.teacherId === teacherId) || ws.userType === 'admin');

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin Routes
  app.get('/api/admin/teachers', async (req, res) => {
    try {
      const teachers = await storage.getAllTeachers();
      res.json(teachers);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/admin/teachers', async (req, res) => {
    try {
      const teacherData = insertTeacherSchema.parse(req.body);
      
      // Create user account for teacher
      const teacherUser = await storage.createUser({
        username: teacherData.name.toLowerCase().replace(/\s+/g, '.') + '@school.edu',
        password: 'teacher123', // In production, this should be randomly generated
        role: 'teacher',
        name: teacherData.name,
        email: teacherData.name.toLowerCase().replace(/\s+/g, '.') + '@school.edu'
      });

      const teacher = await storage.createTeacher(teacherData, teacherUser.id);
      
      // Generate QR code
      const qrCodeData = JSON.stringify({
        type: 'teacher_queue',
        code: teacher.uniqueCode,
        teacherName: teacher.name,
        subject: teacher.subject
      });
      
      const qrCodeUrl = await QRCode.toDataURL(qrCodeData);
      
      await storage.updateTeacher(teacher.id, { qrCode: qrCodeUrl });

      const updatedTeacher = await storage.getTeacher(teacher.id);
      
      broadcast({
        type: 'teacher_added',
        teacher: updatedTeacher
      }, (ws) => ws.userType === 'admin');

      res.json(updatedTeacher);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/admin/stats', async (req, res) => {
    try {
      const teachers = await storage.getAllTeachers();
      const allQueues = await Promise.all(
        teachers.map(t => storage.getQueueEntriesForTeacher(t.id))
      );
      const activeMeetings = await Promise.all(
        teachers.map(t => storage.getCurrentMeeting(t.id))
      );

      const stats = {
        totalTeachers: teachers.length,
        activeMeetings: activeMeetings.filter(m => m !== undefined).length,
        waitingParents: allQueues.flat().filter(q => q.status === 'waiting').length,
        completedMeetings: 0 // TODO: Implement completed meetings count
      };

      res.json(stats);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get teacher by code (for QR scanning)
  app.get('/api/teachers/by-code/:code', async (req, res) => {
    try {
      const teacher = await storage.getTeacherByCode(req.params.code);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      res.json(teacher);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return httpServer;
}
