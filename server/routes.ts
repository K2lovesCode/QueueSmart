import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertTeacherSchema, insertParentSessionSchema, insertQueueEntrySchema, insertMeetingSchema } from "@shared/schema";
import QRCode from "qrcode";
import { nanoid } from "nanoid";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";

interface ExtendedWebSocket extends WebSocket {
  sessionId?: string;
  userType?: 'parent' | 'teacher' | 'admin';
  teacherId?: string;
  parentSessionId?: string;
  isAuthenticated?: boolean;
}

// JWT secret for WebSocket authentication
// CRITICAL SECURITY FIX: Require JWT_SECRET to be set, fail fast if missing
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required for WebSocket authentication');
  console.error('Please set JWT_SECRET to a cryptographically secure random string');
  process.exit(1);
}

// Validation schemas
const parentSessionSchema = z.object({
  parentName: z.string().min(1).max(100).trim()
});

const joinQueueSchema = z.object({
  teacherCode: z.string().min(4).max(20).trim().toUpperCase(),
  childName: z.string().min(1).max(100).trim()
});

const teacherLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// Environment-aware rate limiting configuration
const RATE_LIMIT_MODE = process.env.RATE_LIMIT_MODE || 'production'; // production | relaxed | disabled
const RL_BYPASS_TOKEN = process.env.RL_BYPASS_TOKEN;
const isProd = RATE_LIMIT_MODE === 'production';

// Rate limit bypass function for development and testing
const shouldBypass = (req: any) => {
  if (RATE_LIMIT_MODE === 'disabled') return true;
  if (!isProd) return true;
  if (RL_BYPASS_TOKEN && req.headers['x-rl-bypass'] === RL_BYPASS_TOKEN) return true;
  return false;
};

// General API rate limiter (per-IP)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isProd ? 300 : 1000, // production: 300/min, relaxed: 1000/min
  message: { error: 'Too many requests from this IP, please try again later.' },
  trustProxy: 1,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldBypass
});

// Auth rate limiter (per-IP)
const authIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProd ? 20 : 100, // production: 20/15m, relaxed: 100/15m
  message: { error: 'Too many authentication attempts from this IP, please try again later.' },
  trustProxy: 1,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldBypass
});

// Auth rate limiter (per-account)
const authAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per account per 15 minutes
  message: { error: 'Too many login attempts for this account, please try again later.' },
  trustProxy: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.email?.toLowerCase()?.trim() || 'unknown',
  skip: shouldBypass
});

// Queue join rate limiter (per-session)
const queueJoinLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isProd ? 30 : 120, // production: 30/min, relaxed: 120/min
  message: { error: 'Too many queue join attempts, please try again later.' },
  trustProxy: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.body?.sessionId || rateLimit.ipKeyGenerator(req, res);
  },
  skip: shouldBypass
});

// JWT token generation for WebSocket authentication
function generateWebSocketToken(sessionId: string, userType: 'parent' | 'teacher' | 'admin', userId?: string): string {
  return jwt.sign(
    { sessionId, userType, userId, iat: Date.now() },
    JWT_SECRET!,
    { expiresIn: '24h' }
  );
}

// Verify WebSocket JWT token
function verifyWebSocketToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET!);
  } catch (error) {
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Apply general rate limiting to all API routes
  app.use('/api', generalLimiter);

  // WebSocket connections management
  const connections = new Map<string, ExtendedWebSocket>();

  wss.on('connection', (ws: ExtendedWebSocket, req) => {
    const connectionId = nanoid();
    connections.set(connectionId, ws);
    ws.isAuthenticated = false;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'authenticate':
            // Secure WebSocket authentication using JWT token
            const tokenPayload = verifyWebSocketToken(message.token);
            if (tokenPayload) {
              ws.sessionId = tokenPayload.sessionId;
              ws.userType = tokenPayload.userType;
              ws.teacherId = tokenPayload.userId;
              ws.parentSessionId = tokenPayload.sessionId;
              ws.isAuthenticated = true;
              
              ws.send(JSON.stringify({ type: 'authenticated', success: true }));
            } else {
              ws.send(JSON.stringify({ type: 'authenticated', success: false, error: 'Invalid token' }));
              ws.close();
            }
            break;
          default:
            // Reject any messages from unauthenticated connections
            if (!ws.isAuthenticated) {
              ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
              ws.close();
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.close();
      }
    });

    ws.on('close', () => {
      connections.delete(connectionId);
    });
    
    // Close unauthenticated connections after 10 seconds
    setTimeout(() => {
      if (!ws.isAuthenticated) {
        ws.close();
      }
    }, 10000);
  });

  // Broadcast to specific user types (only authenticated connections)
  function broadcast(message: any, filter?: (ws: ExtendedWebSocket) => boolean) {
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN && ws.isAuthenticated && (!filter || filter(ws))) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  // Parent Routes
  app.post('/api/parent/session', async (req, res) => {
    try {
      // Validate input and prevent session fixation
      const validatedData = parentSessionSchema.parse(req.body);
      console.log('Creating parent session with input:', {
        clientSessionId: req.body.sessionId,
        parentName: validatedData.parentName
      });
      
      // Server generates secure session ID - never trust client input
      const secureSessionId = `device-${Date.now()}-${nanoid()}`;
      console.log('Generated server sessionId:', secureSessionId);
      
      const session = await storage.createParentSession({
        sessionId: secureSessionId,
        parentName: validatedData.parentName
      });
      
      // Generate WebSocket authentication token
      const wsToken = generateWebSocketToken(secureSessionId, 'parent');
      
      const response = { ...session, wsToken };
      console.log('Returning session response:', response);
      res.json(response);
    } catch (error) {
      console.error('Error creating parent session:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
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
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
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
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/parent/join-queue', queueJoinLimiter, async (req, res) => {
    try {
      // Validate input with proper sanitization
      const { sessionId } = req.body;
      const validatedData = joinQueueSchema.parse({ teacherCode: req.body.teacherCode, childName: req.body.childName });
      
      
      const session = await storage.getParentSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const teacher = await storage.getTeacherByCode(validatedData.teacherCode);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      // Check if parent is already in this specific teacher's queue (including skipped entries)
      const parentAlreadyInQueue = await storage.isParentInTeacherQueue(session.id, teacher.id);
      
      if (parentAlreadyInQueue) {
        return res.status(400).json({ error: 'You are already in this teacher\'s queue' });
      }

      const existingQueue = await storage.getQueueEntriesForTeacher(teacher.id);
      const isFirstInQueue = existingQueue.length === 0;

      // CRITICAL FIX: Check if parent is in active meeting BEFORE creating queue entry
      let initialStatus = 'waiting';
      if (isFirstInQueue) {
        const parentInMeeting = await storage.isParentInActiveMeeting(session.id);
        initialStatus = parentInMeeting ? 'skipped' : 'current';
      }

      // Use transaction to prevent position collision race condition
      const queueEntry = await storage.createQueueEntry({
        teacherId: teacher.id,
        parentSessionId: session.id,
        childName: validatedData.childName,
        status: initialStatus
      });

      // If first person and parent is available, try to create meeting atomically
      if (isFirstInQueue && initialStatus === 'current') {
        const meetingResult = await storage.createMeetingIfTeacherFree({
          teacherId: teacher.id,
          queueEntryId: queueEntry.id
        });
        
        if (meetingResult.success && meetingResult.meeting) {
          await storage.updateQueueEntry(queueEntry.id, {
            status: 'current',
            startedAt: new Date()
          });

          // Notify parent their turn is now
          broadcast({
            type: 'status_update',
            queueEntryId: queueEntry.id,
            status: 'current',
            message: 'YOUR TURN NOW!'
          }, (ws) => ws.userType === 'parent' && ws.parentSessionId === session.id);

          // Broadcast meeting started to teachers and admins
          broadcast({
            type: 'meeting_started',
            teacherId: teacher.id,
            meeting: meetingResult.meeting
          }, (ws) => (ws.userType === 'teacher' && ws.teacherId === teacher.id) || ws.userType === 'admin');
        } else {
          // Meeting creation failed, mark as waiting and notify parent
          await storage.updateQueueEntry(queueEntry.id, {
            status: 'waiting'
          });
          
          broadcast({
            type: 'status_update',
            queueEntryId: queueEntry.id,
            status: 'waiting',
            message: 'You are in the queue. We\'ll notify you when it\'s getting close.'
          }, (ws) => ws.userType === 'parent' && ws.parentSessionId === session.id);
        }
      } else if (isFirstInQueue && initialStatus === 'skipped') {
        // Notify parent their turn was skipped
        broadcast({
          type: 'status_update',
          queueEntryId: queueEntry.id,
          status: 'skipped',
          message: 'Your turn was skipped because you are currently in another meeting. You will have priority when your current meeting ends.'
        }, (ws) => ws.userType === 'parent' && ws.parentSessionId === session.id);
      }

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
      console.error('Error joining queue:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Teacher Routes
  app.post('/api/teacher/login', authIpLimiter, authAccountLimiter, async (req, res) => {
    try {
      // Validate input data with proper sanitization
      const validatedData = teacherLoginSchema.parse(req.body);
      
      const user = await storage.getUserByUsername(validatedData.email);
      if (!user || user.role !== 'teacher') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // CRITICAL SECURITY FIX: Use bcrypt to verify hashed passwords
      const isPasswordValid = await bcrypt.compare(validatedData.password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const teacher = await storage.getTeacherByUserId(user.id);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher profile not found' });
      }

      // Generate WebSocket authentication token for teacher
      const wsToken = generateWebSocketToken(teacher.id, 'teacher', teacher.id);
      
      res.json({ user, teacher, wsToken });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/teacher/:teacherId', async (req, res) => {
    try {
      const teacher = await storage.getTeacher(req.params.teacherId);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      res.json(teacher);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/teacher/:teacherId/queue', async (req, res) => {
    try {
      const queue = await storage.getQueueEntriesForTeacher(req.params.teacherId);
      res.json(queue);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/teacher/:teacherId/current-meeting', async (req, res) => {
    try {
      const meeting = await storage.getCurrentMeeting(req.params.teacherId);
      res.json(meeting || null);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
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

        // Get the completed entry to notify the parent and process their other queues
        const completedEntry = await storage.getQueueEntry(currentMeeting.queueEntryId);
        if (completedEntry) {
          broadcast({
            type: 'queue_removed',
            queueEntryId: completedEntry.id,
            message: 'Your meeting has ended. Thank you!'
          }, (ws) => ws.userType === 'parent' && ws.parentSessionId === completedEntry.parentSessionId);
          
          // Process any skipped queues for this parent with broadcast function
          await storage.processQueueAfterMeetingEnd(completedEntry.parentSessionId, broadcast);
        }
      }

      // Use the improved queue advancement logic
      const advanceResult = await storage.advanceQueueForTeacher(teacherId, broadcast);
      
      if (advanceResult.meeting) {
        // Broadcast meeting started to teacher and admin
        broadcast({
          type: 'meeting_started',
          teacherId,
          meeting: advanceResult.meeting
        }, (ws) => (ws.userType === 'teacher' && ws.teacherId === teacherId) || ws.userType === 'admin');
      }

      // Broadcast updates to teacher and admin
      broadcast({
        type: 'meeting_ended',
        teacherId
      }, (ws) => (ws.userType === 'teacher' && ws.teacherId === teacherId) || ws.userType === 'admin');

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
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
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/teacher/:teacherId/skip-no-show', async (req, res) => {
    try {
      const teacherId = req.params.teacherId;
      
      // Use atomic transaction-wrapped skip operation
      const result = await storage.skipNoShowParent(teacherId, broadcast);
      
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Admin Routes
  app.post('/api/admin/login', authIpLimiter, authAccountLimiter, async (req, res) => {
    try {
      // Validate admin login input
      const validatedData = adminLoginSchema.parse(req.body);
      
      const user = await storage.getUserByUsername(validatedData.email);
      if (!user || user.role !== 'admin') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // CRITICAL SECURITY FIX: Use bcrypt to verify hashed passwords
      const isPasswordValid = await bcrypt.compare(validatedData.password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate WebSocket authentication token for admin
      const wsToken = generateWebSocketToken(user.id, 'admin', user.id);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        },
        wsToken
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  app.get('/api/admin/teachers', async (req, res) => {
    try {
      const teachers = await storage.getAllTeachers();
      res.json(teachers);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/admin/teachers', async (req, res) => {
    try {
      const { name, subject, password } = req.body;
      
      // Validate only the teacher data, not the password
      const teacherData = insertTeacherSchema.parse({ name, subject });
      
      // Create user account for teacher
      const username = teacherData.name.toLowerCase().replace(/\s+/g, '.') + '@school.edu';
      const teacherUser = await storage.createUser({
        username,
        password: password || 'teacher123', // Use provided password or default
        role: 'teacher',
        name: teacherData.name,
        email: username
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
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
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
        activeMeetings: activeMeetings.filter(m => m !== null).length,
        waitingParents: allQueues.flat().filter(q => q.status === 'waiting' || q.status === 'next').length,
        completedMeetings: allQueues.flat().filter(q => q.status === 'completed').length
      };

      res.json(stats);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get detailed teacher information with queue data for admin
  app.get('/api/admin/teachers-with-queues', async (req, res) => {
    try {
      const teachers = await storage.getAllTeachers();
      const teachersWithQueues = await Promise.all(
        teachers.map(async (teacher) => {
          const queue = await storage.getQueueEntriesForTeacher(teacher.id);
          const currentMeeting = await storage.getCurrentMeeting(teacher.id);
          const queueSize = queue.filter(q => q.status === 'waiting' || q.status === 'next').length;
          const nextParent = queue.find(q => q.status === 'next') || queue.find(q => q.status === 'waiting');
          
          // Calculate estimated wait time based on queue position
          const waitingEntries = queue.filter(q => q.status === 'waiting');
          const avgMeetingTime = 15; // Average meeting duration in minutes
          const avgWaitTime = queueSize > 0 ? queueSize * avgMeetingTime : 0;

          return {
            ...teacher,
            queueSize,
            avgWaitTime,
            currentMeeting,
            nextParent
          };
        })
      );

      res.json(teachersWithQueues);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Regenerate all QR codes and teacher codes
  app.post('/api/admin/regenerate-codes', async (req, res) => {
    try {
      console.log('Starting regeneration of all codes...');
      const teachers = await storage.getAllTeachers();
      console.log(`Found ${teachers.length} teachers to update`);
      
      const updatedTeachers = [];
      
      // Process teachers sequentially to avoid unique key conflicts
      for (const teacher of teachers) {
        console.log(`Regenerating code for teacher: ${teacher.name}`);
        
        // Generate new unique code
        const uniqueCode = await generateUniqueCode(teacher.name);
        console.log(`Generated new code: ${uniqueCode} for ${teacher.name}`);
        
        // Generate new QR code
        const qrCodeData = JSON.stringify({
          type: 'teacher_queue',
          code: uniqueCode,
          teacher: teacher.name,
          subject: teacher.subject
        });
        const qrCodeUrl = await QRCode.toDataURL(qrCodeData);
        
        // Update teacher with new codes
        const updatedTeacher = await storage.updateTeacher(teacher.id, { 
          uniqueCode, 
          qrCode: qrCodeUrl 
        });
        
        console.log(`Updated teacher ${teacher.name} with new code: ${updatedTeacher?.uniqueCode}`);
        updatedTeachers.push(updatedTeacher);
      }

      console.log(`Successfully updated ${updatedTeachers.length} teachers`);

      // Broadcast update to all admin users
      broadcast({
        type: 'codes_regenerated',
        teachers: updatedTeachers
      }, (ws) => ws.userType === 'admin');

      res.json({ 
        success: true, 
        message: 'All codes regenerated successfully',
        updatedCount: updatedTeachers.length,
        teachers: updatedTeachers
      });
    } catch (error) {
      console.error('Error regenerating codes:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Helper function to generate unique codes
  async function generateUniqueCode(teacherName: string): Promise<string> {
    const baseCode = teacherName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .substring(0, 4);
    
    // Start with timestamp-based suffix for better uniqueness
    const timestamp = Date.now().toString().slice(-4);
    let code = baseCode + timestamp;
    
    let attempts = 0;
    while (attempts < 20) {
      const existingTeacher = await storage.getTeacherByCode(code);
      if (!existingTeacher) {
        return code;
      }
      
      // Generate more random suffix
      const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      code = baseCode + randomSuffix;
      attempts++;
    }
    
    // Final fallback to completely random code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return code;
  }

  // Get teacher by code (for QR scanning)
  app.get('/api/teachers/by-code/:code', async (req, res) => {
    try {
      const teacher = await storage.getTeacherByCode(req.params.code);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      res.json(teacher);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return httpServer;
}
