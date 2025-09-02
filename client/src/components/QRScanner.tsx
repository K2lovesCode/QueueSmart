import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera, X } from 'lucide-react';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startScanning = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsScanning(true);
      }
    } catch (err) {
      setError('Camera access denied or not available');
    }
  };

  const stopScanning = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanning();
    }
  }, [isOpen]);

  const handleManualEntry = () => {
    stopScanning();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="qr-scanner-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scan QR Code
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {!isScanning && !error && (
            <div className="text-center space-y-4">
              <div className="bg-muted rounded-lg p-8">
                <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  Position the QR code within the camera frame
                </p>
              </div>
              <Button 
                onClick={startScanning} 
                className="w-full"
                data-testid="button-start-camera"
              >
                <Camera className="h-4 w-4 mr-2" />
                Start Camera
              </Button>
            </div>
          )}

          {isScanning && (
            <div className="space-y-4">
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full rounded-lg"
                  data-testid="camera-video"
                />
                <div className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none">
                  <div className="absolute top-4 left-4 w-6 h-6 border-l-4 border-t-4 border-primary"></div>
                  <div className="absolute top-4 right-4 w-6 h-6 border-r-4 border-t-4 border-primary"></div>
                  <div className="absolute bottom-4 left-4 w-6 h-6 border-l-4 border-b-4 border-primary"></div>
                  <div className="absolute bottom-4 right-4 w-6 h-6 border-r-4 border-b-4 border-primary"></div>
                </div>
              </div>
              <Button 
                onClick={stopScanning} 
                variant="outline" 
                className="w-full"
                data-testid="button-stop-camera"
              >
                <X className="h-4 w-4 mr-2" />
                Stop Camera
              </Button>
            </div>
          )}

          {error && (
            <div className="text-center space-y-4">
              <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
                <p className="text-sm">{error}</p>
              </div>
              <Button 
                onClick={handleManualEntry} 
                variant="outline" 
                className="w-full"
                data-testid="button-manual-entry"
              >
                Enter Code Manually Instead
              </Button>
            </div>
          )}

          <div className="text-center">
            <Button 
              onClick={onClose} 
              variant="ghost" 
              size="sm"
              data-testid="button-close-scanner"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
