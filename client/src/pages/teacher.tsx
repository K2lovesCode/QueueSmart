import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';
import { apiRequest } from '@/lib/queryClient';
import { Presentation, Check, UserX } from 'lucide-react';

export default function TeacherInterface() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get teacher data after login
  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const response = await apiRequest('POST', '/api/teacher/login', credentials);
      return response.json();
    },
    onSuccess: (data) => {
      setIsLoggedIn(true);
      setTeacherId(data.teacher.id);
    },
    onError: () => {
      toast({
        title: 'Invalid credentials',
        description: 'Please check your email and password',
        variant: 'destructive'
      });
    }
  });

  // Get teacher data
  const { data: teacher } = useQuery({
    queryKey: ['/api/teacher', teacherId],
    enabled: !!teacherId && isLoggedIn
  });

  // Get teacher's queue
  const { data: queue = [], refetch: refetchQueue } = useQuery({
    queryKey: ['/api/teacher', teacherId, 'queue'],
    enabled: !!teacherId && isLoggedIn
  });

  // Get current meeting
  const { data: currentMeeting, refetch: refetchMeeting } = useQuery({
    queryKey: ['/api/teacher', teacherId, 'current-meeting'],
    enabled: !!teacherId && isLoggedIn
  });

  // WebSocket for real-time updates
  const { lastMessage } = useWebSocket({
    userType: 'teacher',
    teacherId: teacherId || undefined
  });

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'queue_update' || lastMessage.type === 'meeting_ended') {
        refetchQueue();
        refetchMeeting();
      }
    }
  }, [lastMessage, refetchQueue, refetchMeeting]);


  // End meeting mutation
  const endMeetingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/teacher/${teacherId}/end-meeting`);
      return response.json();
    },
    onSuccess: () => {
      refetchQueue();
      refetchMeeting();
      toast({
        title: 'Meeting ended',
        description: 'Next parent has been notified'
      });
    }
  });


  // Skip no-show mutation
  const skipNoShowMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/teacher/${teacherId}/skip-no-show`);
      return response.json();
    },
    onSuccess: () => {
      refetchQueue();
      refetchMeeting();
      toast({
        title: 'Parent skipped',
        description: 'Next parent has been notified'
      });
    }
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      loginMutation.mutate({ email, password });
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setTeacherId(null);
    setEmail('');
    setPassword('');
    toast({
      title: 'Logged out',
      description: 'You have been successfully logged out'
    });
  };


  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg" data-testid="card-teacher-login">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <Presentation className="text-primary text-4xl mb-3 mx-auto" />
              <h2 className="text-2xl font-semibold text-foreground">Teacher Login</h2>
              <p className="text-muted-foreground">Access your queue dashboard</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="teacher-email">Email</Label>
                <Input
                  id="teacher-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teacher@school.edu"
                  required
                  data-testid="input-teacher-email"
                />
              </div>
              <div>
                <Label htmlFor="teacher-password">Password</Label>
                <Input
                  id="teacher-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  data-testid="input-teacher-password"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-teacher-login">
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const queueArray = Array.isArray(queue) ? queue : [];
  const currentParent = queueArray.find((entry: any) => entry.status === 'current');
  const nextParent = queueArray.find((entry: any) => entry.status === 'next') || queueArray.find((entry: any) => entry.status === 'waiting');
  const waitingParents = queueArray.filter((entry: any) => entry.status === 'waiting' && entry.id !== nextParent?.id);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="shadow-lg" data-testid="card-teacher-header">
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-teacher-name">
                  {(teacher as any)?.name || 'Loading...'}
                </h2>
                <p className="text-muted-foreground" data-testid="text-teacher-subject">
                  {(teacher as any)?.subject || ''}
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Queue Code</div>
                  <div className="text-xl font-bold text-primary" data-testid="text-queue-code">
                    {(teacher as any)?.uniqueCode || ''}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-teacher-logout"
                >
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Log Out
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Current Meeting */}
          <Card className="shadow-lg" data-testid="card-current-meeting">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Current Meeting</h3>
              <div className="text-center space-y-4">
                {currentMeeting ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-2xl font-semibold text-green-700" data-testid="text-current-parent">
                      {(currentMeeting as any)?.queueEntry?.parentName || 'Unknown Parent'}
                    </div>
                    <div className="text-green-600" data-testid="text-current-student">
                      Student: {(currentMeeting as any)?.queueEntry?.childName || 'Unknown Student'}
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-muted-foreground" data-testid="text-no-current-meeting">
                      No active meeting
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Queue Management */}
          <Card className="shadow-lg" data-testid="card-queue-management">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Up Next & Queue</h3>
              
              {/* Next Parent */}
              {nextParent && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <div className="text-sm text-yellow-600 font-medium">NEXT</div>
                  <div className="font-semibold text-yellow-700" data-testid="text-next-parent-name">
                    {nextParent.parentSession?.parentName || 'Unknown Parent'}
                  </div>
                  <div className="text-sm text-yellow-600">
                    Student: <span data-testid="text-next-child">{nextParent.childName}</span>
                  </div>
                </div>
              )}

              {/* Waiting List */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">
                  Waiting ({waitingParents.length})
                </div>
                <div className="space-y-2" data-testid="container-waiting-list">
                  {waitingParents.map((parent: any, index: number) => (
                    <div key={parent.id} className="flex justify-between items-center py-2 px-3 bg-muted rounded-md">
                      <div>
                        <div className="text-sm font-medium text-foreground" data-testid={`text-waiting-parent-${index}`}>
                          {parent.parentSession?.parentName || 'Unknown Parent'}
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid={`text-waiting-student-${index}`}>
                          Student: {parent.childName}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid={`text-wait-time-${index}`}>
                        Position {parent.position}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Control Buttons */}
        <Card className="shadow-lg" data-testid="card-meeting-controls">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Meeting Controls</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button 
                onClick={() => endMeetingMutation.mutate()}
                disabled={endMeetingMutation.isPending || !currentMeeting}
                className="py-3 px-6 flex items-center justify-center"
                data-testid="button-end-meeting"
              >
                <Check className="mr-2 h-4 w-4" />
                {endMeetingMutation.isPending ? 'Ending...' : 'End Meeting'}
              </Button>
              <Button 
                onClick={() => skipNoShowMutation.mutate()}
                disabled={skipNoShowMutation.isPending}
                variant="destructive"
                className="py-3 px-6 flex items-center justify-center"
                data-testid="button-skip-no-show"
              >
                <UserX className="mr-2 h-4 w-4" />
                {skipNoShowMutation.isPending ? 'Skipping...' : 'Skip / No-Show'}
              </Button>
            </div>
            <div className="mt-4 text-sm text-muted-foreground text-center">
              <i className="fas fa-info-circle mr-1"></i>
              The system automatically handles conflicts and notifications
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
