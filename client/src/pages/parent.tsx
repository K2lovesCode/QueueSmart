import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';
import QRScanner from '@/components/QRScanner';
import QueueCard from '@/components/QueueCard';
import { apiRequest } from '@/lib/queryClient';
import { Smartphone, Plus, Camera, Hash } from 'lucide-react';

export default function ParentInterface() {
  const [location] = useLocation();
  const [sessionId] = useState(() => localStorage.getItem('ptm_session_id') || crypto.randomUUID());
  const [currentStep, setCurrentStep] = useState<'welcome' | 'join' | 'child-info' | 'dashboard'>('welcome');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [parentName, setParentName] = useState('');
  const [childName, setChildName] = useState('');
  const [childGrade, setChildGrade] = useState('Not specified');
  const [teacherCode, setTeacherCode] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if coming from QR code URL
  useEffect(() => {
    const pathMatch = location.match(/^\/queue\/(.+)$/);
    if (pathMatch) {
      const code = pathMatch[1];
      setTeacherCode(code.toUpperCase());
      handleTeacherCodeSubmit(code.toUpperCase());
    }
  }, [location]);

  // Store session ID in localStorage
  useEffect(() => {
    localStorage.setItem('ptm_session_id', sessionId);
  }, [sessionId]);

  // Check if parent session exists
  const { data: parentSession } = useQuery({
    queryKey: ['/api/parent/session', sessionId],
    enabled: !!sessionId
  });

  // Get parent's queues
  const { data: allQueues = [], refetch: refetchQueues } = useQuery({
    queryKey: ['/api/parent', sessionId, 'queues'],
    enabled: !!parentSession
  });

  // Filter to only show active queues (not completed or skipped)
  const parentQueues = allQueues.filter((queue: any) =>
    queue.status === 'waiting' || queue.status === 'next' || queue.status === 'current'
  );

  // WebSocket for real-time updates
  const { lastMessage } = useWebSocket({
    sessionId,
    userType: 'parent',
    parentSessionId: parentSession?.id
  });

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'status_update' || lastMessage.type === 'queue_update') {
        refetchQueues();
        if (lastMessage.message) {
          toast({
            title: lastMessage.message,
            description: lastMessage.description || 'Your queue status has been updated',
            duration: 5000
          });
        }
      } else if (lastMessage.type === 'delay_notification') {
        toast({
          title: 'Meeting Delayed',
          description: lastMessage.message,
          duration: 5000
        });
      } else if (lastMessage.type === 'queue_removed') {
        refetchQueues();
        toast({
          title: 'Queue Update',
          description: 'You have been removed from the queue',
          duration: 5000
        });
      }
    }
  }, [lastMessage, refetchQueues, toast]);

  // Auto-refresh queue data every 30 seconds to prevent stale data
  useEffect(() => {
    const interval = setInterval(() => {
      refetchQueues();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetchQueues]);

  // Create parent session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest('POST', '/api/parent/session', {
        sessionId,
        parentName: name
      });
      return response.json();
    },
    onSuccess: () => {
      setCurrentStep('join');
      queryClient.invalidateQueries({ queryKey: ['/api/parent/session', sessionId] });
    }
  });

  // Join queue mutation
  const joinQueueMutation = useMutation({
    mutationFn: async (data: { teacherCode: string; childName: string }) => {
      console.log('Joining queue with data:', { sessionId, ...data });
      const response = await apiRequest('POST', '/api/parent/join-queue', {
        sessionId,
        ...data
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join queue');
      }
      return response.json();
    },
    onSuccess: () => {
      setCurrentStep('dashboard');
      setChildName('');
      setTeacherCode('');
      setSelectedTeacher(null);
      refetchQueues();
      toast({
        title: 'Successfully joined queue',
        description: 'You\'ll be notified when it\'s your turn'
      });
    },
    onError: (error) => {
      console.log('Join queue error:', error.message);
      if (error.message.includes('already in this teacher\'s queue')) {
        // Parent is already in queue, just go to dashboard
        setCurrentStep('dashboard');
        refetchQueues();
        toast({
          title: 'Already in queue',
          description: 'You\'re already in this teacher\'s queue',
        });
      } else {
        toast({
          title: 'Error joining queue',
          description: error.message,
          variant: 'destructive'
        });
      }
    }
  });

  // Set initial step based on session (only on first load)
  useEffect(() => {
    if (parentSession && currentStep === 'welcome') {
      setCurrentStep(parentQueues.length > 0 ? 'dashboard' : 'join');
    }
  }, [parentSession, parentQueues, currentStep]);

  const handleParentNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parentName.trim()) {
      createSessionMutation.mutate(parentName.trim());
    }
  };

  const handleTeacherCodeSubmit = async (code: string) => {
    try {
      console.log('Looking up teacher with code:', code);
      const response = await fetch(`/api/teachers/by-code/${code}`);
      if (!response.ok) {
        throw new Error('Teacher not found');
      }
      const teacher = await response.json();
      console.log('Teacher found:', teacher);
      setSelectedTeacher(teacher);
      setCurrentStep('child-info');
    } catch (error) {
      console.log('Teacher lookup failed:', error);
      toast({
        title: 'Invalid code',
        description: 'Please check the teacher code and try again',
        variant: 'destructive'
      });
    }
  };

  const handleQRScan = (result: string) => {
    try {
      const qrData = JSON.parse(result);
      if (qrData.type === 'teacher_queue' && qrData.code) {
        handleTeacherCodeSubmit(qrData.code);
        setShowQRScanner(false);
      }
    } catch (error) {
      toast({
        title: 'Invalid QR code',
        description: 'Please scan a valid teacher QR code',
        variant: 'destructive'
      });
    }
  };

  const handleChildInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Child info form submitted:', { childName, selectedTeacher });
    
    if (!childName.trim()) {
      console.log('Child name is empty');
      toast({
        title: 'Missing Information',
        description: 'Please enter your child\'s name',
        variant: 'destructive'
      });
      return;
    }
    
    if (!selectedTeacher) {
      console.log('No teacher selected');
      toast({
        title: 'No Teacher Selected',
        description: 'Please go back and select a teacher',
        variant: 'destructive'
      });
      return;
    }
    
    console.log('Calling join queue mutation with:', {
      teacherCode: selectedTeacher.uniqueCode,
      childName: childName.trim()
    });
    
    joinQueueMutation.mutate({
      teacherCode: selectedTeacher.uniqueCode,
      childName: childName.trim()
    });
  };

  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (teacherCode.trim()) {
      handleTeacherCodeSubmit(teacherCode.trim().toUpperCase());
    }
  };

  if (currentStep === 'welcome') {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto space-y-6">
          <Card className="shadow-lg" data-testid="card-welcome">
            <CardContent className="p-6 text-center">
              <div className="mb-6">
                <Smartphone className="text-primary text-4xl mb-3 mx-auto" />
                <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome to PTM</h2>
                <p className="text-muted-foreground">Let's get you set up for today's parent-teacher meetings</p>
              </div>
              <form onSubmit={handleParentNameSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="parent-name" className="block text-sm font-medium text-foreground mb-2">
                    Your Name
                  </Label>
                  <Input
                    id="parent-name"
                    type="text"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    placeholder="Enter your name"
                    required
                    data-testid="input-parent-name"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={createSessionMutation.isPending}
                  data-testid="button-get-started"
                >
                  {createSessionMutation.isPending ? 'Setting up...' : 'Get Started'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (currentStep === 'join') {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto space-y-6">
          <Card className="shadow-lg" data-testid="card-join-queue">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-foreground mb-2">Join a Teacher's Queue</h2>
                <p className="text-muted-foreground">Scan the QR code or enter the teacher's unique code</p>
              </div>
              
              {/* QR Scanner */}
              <div className="bg-muted rounded-lg p-6 text-center mb-4">
                <Camera className="text-4xl text-muted-foreground mb-3 mx-auto" />
                <p className="text-sm text-muted-foreground mb-3">Point your camera at the QR code</p>
                <Button 
                  onClick={() => setShowQRScanner(true)}
                  data-testid="button-scan-qr"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Scan QR Code
                </Button>
              </div>

              {/* Manual Code Entry */}
              <div className="border-t border-border pt-4">
                <p className="text-center text-muted-foreground mb-3">or enter the code manually</p>
                <form onSubmit={handleManualCodeSubmit} className="space-y-3">
                  <Input
                    type="text"
                    value={teacherCode}
                    onChange={(e) => setTeacherCode(e.target.value.toUpperCase())}
                    placeholder="e.g. JONES7"
                    className="text-center uppercase"
                    data-testid="input-teacher-code"
                  />
                  <Button 
                    type="submit" 
                    variant="secondary" 
                    className="w-full"
                    data-testid="button-join-queue"
                  >
                    <Hash className="mr-2 h-4 w-4" />
                    Join Queue
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          <QRScanner
            isOpen={showQRScanner}
            onClose={() => setShowQRScanner(false)}
            onScan={handleQRScan}
          />
        </div>
      </div>
    );
  }

  if (currentStep === 'child-info' && selectedTeacher) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto space-y-6">
          <Card className="shadow-lg" data-testid="card-child-info">
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Child Information</h2>
              <p className="text-muted-foreground mb-6">
                Please provide your child's details for{' '}
                <span className="font-medium text-foreground" data-testid="text-selected-teacher">
                  {selectedTeacher.name}
                </span>
              </p>
              
              <form onSubmit={handleChildInfoSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="child-name" className="block text-sm font-medium text-foreground mb-2">
                    Child's Name
                  </Label>
                  <Input
                    id="child-name"
                    type="text"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    placeholder="Enter child's name"
                    required
                    data-testid="input-child-name"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={joinQueueMutation.isPending}
                  data-testid="button-join-teacher-queue"
                >
                  {joinQueueMutation.isPending ? 'Joining...' : 'Join Queue'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-foreground">Your Queues</h2>
          <p className="text-muted-foreground">We'll notify you when it's time</p>
        </div>

        <div className="space-y-4" data-testid="container-queue-list">
          {parentQueues.map((queue: any) => (
            <QueueCard
              key={queue.id}
              status={queue.status === 'waiting' ? 'waiting' : queue.status === 'next' ? 'next' : 'current'}
              teacherName={queue.teacher?.name || 'Teacher'}
              subject={queue.teacher?.subject || ''}
              childName={queue.childName}
              grade={queue.childGrade}
            />
          ))}
        </div>

        <Button 
          onClick={() => setCurrentStep('join')} 
          variant="secondary" 
          className="w-full"
          data-testid="button-join-another"
        >
          <Plus className="mr-2 h-4 w-4" />
          Join Another Queue
        </Button>
      </div>
    </div>
  );
}
