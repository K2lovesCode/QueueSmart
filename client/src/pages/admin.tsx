import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';
import TeacherCard from '@/components/TeacherCard';
import { apiRequest } from '@/lib/queryClient';
import { Shield, Settings, Download, Plus, X } from 'lucide-react';

export default function AdminInterface() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [newTeacher, setNewTeacher] = useState({
    name: '',
    subject: ''
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mock admin authentication
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email === 'admin@school.edu' && password === 'admin123') {
      setIsLoggedIn(true);
    } else {
      toast({
        title: 'Invalid credentials',
        description: 'Please check your email and password',
        variant: 'destructive'
      });
    }
  };

  // Get all teachers
  const { data: teachers = [], refetch: refetchTeachers } = useQuery({
    queryKey: ['/api/admin/teachers'],
    enabled: isLoggedIn
  });

  // Get admin stats
  const { data: stats } = useQuery({
    queryKey: ['/api/admin/stats'],
    enabled: isLoggedIn
  });

  // WebSocket for real-time updates
  const { lastMessage } = useWebSocket({
    userType: 'admin'
  });

  // Add teacher mutation
  const addTeacherMutation = useMutation({
    mutationFn: async (teacherData: typeof newTeacher) => {
      const response = await apiRequest('POST', '/api/admin/teachers', teacherData);
      return response.json();
    },
    onSuccess: () => {
      refetchTeachers();
      setNewTeacher({ name: '', subject: '' });
      toast({
        title: 'Teacher added successfully',
        description: 'QR code and unique code have been generated'
      });
    },
    onError: (error) => {
      toast({
        title: 'Error adding teacher',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTeacher.name && newTeacher.subject) {
      addTeacherMutation.mutate(newTeacher);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg" data-testid="card-admin-login">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <Shield className="text-primary text-4xl mb-3 mx-auto" />
              <h2 className="text-2xl font-semibold text-foreground">Admin Login</h2>
              <p className="text-muted-foreground">Access the command center</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@school.edu"
                  required
                  data-testid="input-admin-email"
                />
              </div>
              <div>
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  data-testid="input-admin-password"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-admin-login">
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Statistics */}
        <Card className="shadow-lg" data-testid="card-admin-header">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">PTM Command Center</h2>
                <p className="text-muted-foreground">Live event monitoring and management</p>
              </div>
              <div className="flex space-x-4">
                <Button 
                  onClick={() => setShowSetup(!showSetup)} 
                  variant="secondary"
                  data-testid="button-toggle-setup"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Setup
                </Button>
                <Button data-testid="button-export-qr">
                  <Download className="mr-2 h-4 w-4" />
                  Export QR Codes
                </Button>
              </div>
            </div>
            
            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700" data-testid="stat-total-teachers">
                  {stats?.totalTeachers || 0}
                </div>
                <div className="text-sm text-blue-600">Total Teachers</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700" data-testid="stat-active-meetings">
                  {stats?.activeMeetings || 0}
                </div>
                <div className="text-sm text-green-600">Active Meetings</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-yellow-700" data-testid="stat-waiting-parents">
                  {stats?.waitingParents || 0}
                </div>
                <div className="text-sm text-yellow-600">Parents Waiting</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-700" data-testid="stat-completed-meetings">
                  {stats?.completedMeetings || 0}
                </div>
                <div className="text-sm text-purple-600">Completed Today</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Setup Interface */}
        {showSetup && (
          <Card className="shadow-lg" data-testid="card-setup">
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-foreground">Event Setup & QR Generation</h3>
                <Button 
                  onClick={() => setShowSetup(false)} 
                  variant="ghost" 
                  size="sm"
                  data-testid="button-close-setup"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-lg font-medium text-foreground mb-4">Add New Teacher</h4>
                  <form onSubmit={handleAddTeacher} className="space-y-4">
                    <div>
                      <Label htmlFor="teacher-name">Teacher Name</Label>
                      <Input
                        id="teacher-name"
                        value={newTeacher.name}
                        onChange={(e) => setNewTeacher(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Mrs. Johnson"
                        required
                        data-testid="input-new-teacher-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="teacher-subject">Subject</Label>
                      <Input
                        id="teacher-subject"
                        value={newTeacher.subject}
                        onChange={(e) => setNewTeacher(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="e.g. Mathematics"
                        required
                        data-testid="input-new-teacher-subject"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={addTeacherMutation.isPending}
                      data-testid="button-add-teacher"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {addTeacherMutation.isPending ? 'Adding...' : 'Add Teacher & Generate Codes'}
                    </Button>
                  </form>
                </div>

                {/* Generated Codes Preview */}
                <div>
                  <h4 className="text-lg font-medium text-foreground mb-4">Generated Codes</h4>
                  <div className="space-y-4" data-testid="container-generated-codes">
                    {teachers.map((teacher: any) => (
                      <div key={teacher.id} className="border border-border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="font-medium text-foreground" data-testid={`text-teacher-${teacher.id}-name`}>
                              {teacher.name}
                            </div>
                            <div className="text-sm text-muted-foreground" data-testid={`text-teacher-${teacher.id}-details`}>
                              {teacher.subject}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-primary" data-testid={`text-teacher-${teacher.id}-code`}>
                              {teacher.uniqueCode}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="w-16 h-16 bg-black/10 rounded border flex items-center justify-center">
                            {teacher.qrCode ? (
                              <img src={teacher.qrCode} alt="QR Code" className="w-full h-full" />
                            ) : (
                              <div className="text-xs text-muted-foreground">QR</div>
                            )}
                          </div>
                          <div className="flex space-x-2">
                            <Button 
                              size="sm" 
                              variant="secondary"
                              data-testid={`button-download-qr-${teacher.id}`}
                            >
                              <Download className="mr-1 h-3 w-3" />
                              Download QR
                            </Button>
                            <Button 
                              size="sm" 
                              variant="secondary"
                              data-testid={`button-print-${teacher.id}`}
                            >
                              <i className="fas fa-print mr-1"></i>
                              Print
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Live Event Monitoring */}
        <Card className="shadow-lg" data-testid="card-live-monitoring">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold text-foreground mb-4">Live Event Status</h3>
            <div className="grid gap-4" data-testid="container-teacher-cards">
              {teachers.map((teacher: any) => (
                <TeacherCard
                  key={teacher.id}
                  teacher={teacher}
                  queueSize={Math.floor(Math.random() * 8)}
                  avgWaitTime={Math.floor(Math.random() * 30) + 10}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
