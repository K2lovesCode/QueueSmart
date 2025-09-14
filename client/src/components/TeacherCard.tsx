import { Card, CardContent } from '@/components/ui/card';
import type { Teacher, QueueEntry, Meeting } from '@shared/schema';
import { cn } from '@/lib/utils';

interface TeacherCardProps {
  teacher: Teacher;
  currentMeeting?: Meeting & { queueEntry?: QueueEntry };
  nextParent?: QueueEntry;
  queueSize: number;
}

export default function TeacherCard({ 
  teacher, 
  currentMeeting, 
  nextParent, 
  queueSize
}: TeacherCardProps) {
  const isHighQueue = queueSize >= 6;
  
  return (
    <Card className={cn(
      "border-border",
      isHighQueue && "border-orange-200 bg-orange-50"
    )} data-testid={`card-teacher-${teacher.id}`}>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h4 className="font-semibold text-foreground" data-testid="text-teacher-name">
              {teacher.name}
            </h4>
            <p className="text-sm text-muted-foreground" data-testid="text-teacher-details">
              {teacher.subject}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-muted-foreground">Code:</span>
            <span className="text-sm font-bold text-primary" data-testid="text-teacher-code">
              {teacher.uniqueCode}
            </span>
            {isHighQueue && (
              <span className="bg-orange-200 text-orange-800 text-xs px-2 py-1 rounded" data-testid="badge-high-queue">
                HIGH QUEUE
              </span>
            )}
          </div>
        </div>
        
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <div className="text-xs text-green-600 font-medium">CURRENT MEETING</div>
            {currentMeeting ? (
              <>
                <div className="text-sm font-semibold text-green-700" data-testid="text-current-parent">
                  {(currentMeeting.queueEntry as any)?.parentSession?.parentName || 'Unknown Parent'}
                </div>
                <div className="text-xs text-green-600">
                  Meeting in progress
                </div>
              </>
            ) : (
              <div className="text-sm text-green-600" data-testid="text-no-meeting">No active meeting</div>
            )}
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <div className="text-xs text-yellow-600 font-medium">NEXT UP</div>
            {nextParent ? (
              <>
                <div className="text-sm font-semibold text-yellow-700" data-testid="text-next-parent">
                  {(nextParent as any)?.parentSession?.parentName || 'Unknown Parent'}
                </div>
                <div className="text-xs text-yellow-600">Ready to go</div>
              </>
            ) : (
              <div className="text-sm text-yellow-600" data-testid="text-no-next">No one waiting</div>
            )}
          </div>
          
          <div className={cn(
            "rounded p-3",
            isHighQueue ? "bg-red-50 border border-red-200" : "bg-blue-50 border border-blue-200"
          )}>
            <div className={cn(
              "text-xs font-medium",
              isHighQueue ? "text-red-600" : "text-blue-600"
            )}>
              QUEUE SIZE
            </div>
            <div className={cn(
              "text-sm font-semibold",
              isHighQueue ? "text-red-700" : "text-blue-700"
            )} data-testid="text-queue-size">
              {queueSize} waiting
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

