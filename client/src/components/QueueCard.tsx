import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Edit2, Check, X } from 'lucide-react';

interface QueueCardProps {
  status: 'waiting' | 'next' | 'current' | 'skipped';
  teacherName: string;
  subject: string;
  childName: string;
  queueEntryId: string;
  onUpdateChildName?: (entryId: string, newChildName: string) => Promise<void>;
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
  queueEntryId,
  onUpdateChildName,
  className 
}: QueueCardProps) {
  const config = statusConfig[status];
  const [isEditing, setIsEditing] = useState(false);
  const [editedChildName, setEditedChildName] = useState(childName);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSaveChildName = async () => {
    if (!editedChildName.trim() || !onUpdateChildName) return;
    
    setIsUpdating(true);
    try {
      await onUpdateChildName(queueEntryId, editedChildName.trim());
      setIsEditing(false);
    } catch (error) {
      setEditedChildName(childName); // Revert on error
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedChildName(childName);
    setIsEditing(false);
  };

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
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground flex-1">
            Student: {isEditing ? (
              <Input
                value={editedChildName}
                onChange={(e) => setEditedChildName(e.target.value)}
                className="inline-block w-auto min-w-[120px] h-6 text-sm"
                data-testid="input-edit-child-name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveChildName();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
              />
            ) : (
              <span data-testid="text-child-name">{childName}</span>
            )}
          </div>
          {onUpdateChildName && (
            <div className="flex items-center gap-1">
              {isEditing ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSaveChildName}
                    disabled={isUpdating || !editedChildName.trim()}
                    data-testid="button-save-child-name"
                    className="h-6 w-6 p-0"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelEdit}
                    disabled={isUpdating}
                    data-testid="button-cancel-edit"
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit-child-name"
                  className="h-6 w-6 p-0"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
