import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface QueueCardProps {
  status: 'waiting' | 'next' | 'current' | 'skipped';
  teacherName: string;
  subject: string;
  childName: string;
  className?: string;
}

const statusConfig = {
  waiting: {
    bgClass: 'queue-status-gray',
    title: 'IN QUEUE',
    message: "You're all set. We'll notify you when it's getting close.",
    pulseClass: ''
  },
  next: {
    bgClass: 'queue-status-yellow',
    title: 'GETTING CLOSE',
    message: 'You are next in line. Please start making your way to the classroom.',
    pulseClass: 'notification-badge'
  },
  current: {
    bgClass: 'queue-status-green',
    title: 'YOUR TURN NOW!',
    message: 'The teacher is ready for you now. Please enter the classroom.',
    pulseClass: 'notification-badge'
  },
  skipped: {
    bgClass: 'queue-status-blue',
    title: 'TURN SKIPPED',
    message: 'Your turn was skipped because you were in another meeting. You have priority when your current meeting ends.',
    pulseClass: ''
  }
};

export default function QueueCard({ 
  status, 
  teacherName, 
  subject, 
  childName, 
  className 
}: QueueCardProps) {
  const config = statusConfig[status];

  return (
    <Card className={cn("overflow-hidden", className)} data-testid={`card-queue-${status}`}>
      <div className={cn(config.bgClass, config.pulseClass, "text-white p-4 text-center")}>
        <div className="text-lg font-semibold" data-testid={`text-status-${status}`}>
          {config.title}
        </div>
        <div className="text-sm opacity-90" data-testid={`text-message-${status}`}>
          {config.message}
        </div>
      </div>
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium text-foreground" data-testid="text-teacher-name">
            {teacherName}
          </span>
          <span className="text-sm text-muted-foreground" data-testid="text-subject">
            {subject}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          Student: <span data-testid="text-child-name">{childName}</span>
        </div>
      </CardContent>
    </Card>
  );
}
