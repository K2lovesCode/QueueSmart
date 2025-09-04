import { useState, useEffect } from 'react';
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
import { Shield, Settings, Download, Plus, X, Printer, Copy, Edit3, Check, RotateCcw } from 'lucide-react';

export default function AdminInterface() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [newTeacher, setNewTeacher] = useState({
    name: '',
    subject: ''
  });
  const [newTeacherCredentials, setNewTeacherCredentials] = useState<{
    email: string;
    password: string;
    teacher: any;
  } | null>(null);
  const [editingPassword, setEditingPassword] = useState(false);
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

  // Get all teachers (for setup)
  const { data: teachers = [], refetch: refetchTeachers } = useQuery({
    queryKey: ['/api/admin/teachers'],
    enabled: isLoggedIn
  });

  // Get teachers with queue data (for monitoring)
  const { data: teachersWithQueues = [], refetch: refetchTeachersWithQueues } = useQuery({
    queryKey: ['/api/admin/teachers-with-queues'],
    enabled: isLoggedIn
  });

  // Get admin stats
  const { data: stats = {} as any } = useQuery({
    queryKey: ['/api/admin/stats'],
    enabled: isLoggedIn
  });

  // WebSocket for real-time updates
  const { lastMessage } = useWebSocket({
    userType: 'admin'
  });

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'queue_update' || lastMessage.type === 'meeting_ended' || lastMessage.type === 'meeting_started') {
        // Refetch both stats and teacher queue data
        refetchTeachersWithQueues();
        queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      }
    }
  }, [lastMessage, refetchTeachersWithQueues, queryClient]);

  // Add teacher mutation
  const addTeacherMutation = useMutation({
    mutationFn: async (teacherData: typeof newTeacher) => {
      const generatedPassword = generatePassword();
      const payload = {
        ...teacherData,
        password: generatedPassword
      };
      const response = await apiRequest('POST', '/api/admin/teachers', payload);
      const data = await response.json();
      return { ...data, generatedPassword };
    },
    onSuccess: (data) => {
      refetchTeachers();
      setNewTeacher({ name: '', subject: '' });
      
      // Store the credentials for display
      const email = data.name.toLowerCase().replace(/\s+/g, '.') + '@school.edu';
      setNewTeacherCredentials({
        email,
        password: data.generatedPassword,
        teacher: data
      });
      setEditingPassword(false);
      
      toast({
        title: 'Teacher added successfully',
        description: 'Login credentials generated. You can now print them.'
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

  // Generate school-friendly password
  const generatePassword = () => {
    const words = ['Apple', 'Blue', 'Cat', 'Dog', 'Easy', 'Fast', 'Good', 'Hope', 'Joy', 'Kind', 'Love', 'Moon', 'Nice', 'Open', 'Play', 'Quick', 'Rain', 'Star', 'Tree', 'View', 'Wind', 'Year'];
    const numbers = '123456789';
    
    // Pick a random word and add 2-3 numbers
    const word = words[Math.floor(Math.random() * words.length)];
    const num1 = numbers[Math.floor(Math.random() * numbers.length)];
    const num2 = numbers[Math.floor(Math.random() * numbers.length)];
    const num3 = numbers[Math.floor(Math.random() * numbers.length)];
    
    return `${word}${num1}${num2}${num3}`;
  };

  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTeacher.name && newTeacher.subject) {
      addTeacherMutation.mutate(newTeacher);
    }
  };

  const handlePrintCredentials = () => {
    if (!newTeacherCredentials) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Teacher Login Credentials</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
              .credentials { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .field { margin: 10px 0; }
              .label { font-weight: bold; color: #555; }
              .value { font-size: 16px; margin-left: 10px; }
              .instructions { margin-top: 30px; line-height: 1.6; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Parent-Teacher Meeting System</h1>
              <h2>Teacher Login Credentials</h2>
            </div>
            
            <div class="credentials">
              <div class="field">
                <span class="label">Teacher Name:</span>
                <span class="value">${newTeacherCredentials.teacher.name}</span>
              </div>
              <div class="field">
                <span class="label">Subject:</span>
                <span class="value">${newTeacherCredentials.teacher.subject}</span>
              </div>
              <div class="field">
                <span class="label">Queue Code:</span>
                <span class="value">${newTeacherCredentials.teacher.uniqueCode}</span>
              </div>
              <hr style="margin: 20px 0;">
              <div class="field">
                <span class="label">Email/Username:</span>
                <span class="value">${newTeacherCredentials.email}</span>
              </div>
              <div class="field">
                <span class="label">Password:</span>
                <span class="value">${newTeacherCredentials.password}</span>
              </div>
            </div>
            
            <div class="instructions">
              <h3>Instructions for Teacher:</h3>
              <ol>
                <li>Go to the Teacher Dashboard</li>
                <li>Login with the email and password provided above</li>
                <li>Your queue code is <strong>${newTeacherCredentials.teacher.uniqueCode}</strong> - share this with parents</li>
                <li>Parents can scan your QR code or enter your queue code manually</li>
                <li>Use the meeting controls to manage your queue during parent-teacher meetings</li>
              </ol>
              
              <p style="margin-top: 20px; font-size: 14px; color: #666;">
                Keep these credentials secure. Contact the admin if you need to reset your password.
              </p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const copyCredentials = async () => {
    if (!newTeacherCredentials) return;
    
    const credentialsText = `Teacher Login Credentials

Teacher: ${newTeacherCredentials.teacher.name}
Subject: ${newTeacherCredentials.teacher.subject}
Queue Code: ${newTeacherCredentials.teacher.uniqueCode}

Login Details:
Email: ${newTeacherCredentials.email}
Password: ${newTeacherCredentials.password}

Instructions:
1. Go to the Teacher Dashboard
2. Login with the email and password above
3. Share your queue code (${newTeacherCredentials.teacher.uniqueCode}) with parents
4. Parents can scan QR code or enter queue code manually`;

    try {
      await navigator.clipboard.writeText(credentialsText);
      toast({
        title: 'Credentials copied',
        description: 'Login credentials copied to clipboard'
      });
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: 'Unable to copy to clipboard',
        variant: 'destructive'
      });
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
                    {(teachers as any[]).map((teacher: any) => (
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

              {/* Generated Login Credentials */}
              {newTeacherCredentials && (
                <Card className="mt-6 border-green-200 bg-green-50" data-testid="card-generated-credentials">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-lg font-semibold text-green-800">Generated Login Credentials</h4>
                      <Button
                        onClick={() => setNewTeacherCredentials(null)}
                        variant="ghost"
                        size="sm"
                        data-testid="button-close-credentials"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="bg-white rounded-lg p-4 mb-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Teacher</div>
                          <div className="font-medium" data-testid="text-credentials-teacher">
                            {newTeacherCredentials.teacher.name}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Subject</div>
                          <div className="font-medium" data-testid="text-credentials-subject">
                            {newTeacherCredentials.teacher.subject}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Queue Code</div>
                          <div className="font-bold text-primary" data-testid="text-credentials-code">
                            {newTeacherCredentials.teacher.uniqueCode}
                          </div>
                        </div>
                      </div>
                      
                      <hr className="my-4" />
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Login Email</div>
                          <div className="font-mono text-sm" data-testid="text-credentials-email">
                            {newTeacherCredentials.email}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Password</div>
                          <div className="flex items-center space-x-2">
                            {editingPassword ? (
                              <div className="flex items-center space-x-1">
                                <Input
                                  value={newTeacherCredentials.password}
                                  onChange={(e) => setNewTeacherCredentials({
                                    ...newTeacherCredentials,
                                    password: e.target.value
                                  })}
                                  className="font-mono text-sm h-8"
                                  data-testid="input-edit-password"
                                />
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => setEditingPassword(false)}
                                  data-testid="button-save-password"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => {
                                    setNewTeacherCredentials({
                                      ...newTeacherCredentials,
                                      password: generatePassword()
                                    });
                                  }}
                                  data-testid="button-regenerate-password"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <span className="font-mono text-sm" data-testid="text-credentials-password">
                                  {newTeacherCredentials.password}
                                </span>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => setEditingPassword(true)}
                                  data-testid="button-edit-password"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex space-x-3">
                      <Button 
                        onClick={handlePrintCredentials}
                        className="flex-1"
                        data-testid="button-print-credentials"
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Print Credentials
                      </Button>
                      <Button 
                        onClick={copyCredentials}
                        variant="secondary"
                        className="flex-1"
                        data-testid="button-copy-credentials"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy to Clipboard
                      </Button>
                    </div>
                    
                    <div className="mt-4 space-y-2">
                      <div className="text-sm text-green-700 bg-green-100 p-3 rounded">
                        <strong>Give these credentials to the teacher:</strong> They need both the email and password to access their dashboard and manage their queue.
                      </div>
                      <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                        💡 <strong>Auto-Generated:</strong> School-friendly password created (word + numbers). Click the edit icon to customize if needed.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        )}

        {/* Live Event Monitoring */}
        <Card className="shadow-lg" data-testid="card-live-monitoring">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold text-foreground mb-4">Live Event Status</h3>
            <div className="grid gap-4" data-testid="container-teacher-cards">
              {(teachersWithQueues as any[]).map((teacher: any) => (
                <TeacherCard
                  key={teacher.id}
                  teacher={teacher}
                  currentMeeting={teacher.currentMeeting}
                  nextParent={teacher.nextParent}
                  queueSize={teacher.queueSize}
                  avgWaitTime={teacher.avgWaitTime}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
