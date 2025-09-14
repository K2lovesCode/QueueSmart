import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface UseWebSocketOptions {
  sessionId?: string;
  userType: 'parent' | 'teacher' | 'admin';
  teacherId?: string;
  parentSessionId?: string;
  wsToken?: string; // JWT token for authentication
}

export function useWebSocket(options: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    function connectWebSocket() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
        
        // CRITICAL SECURITY FIX: Use JWT authentication instead of identify
        if (ws.current?.readyState === WebSocket.OPEN) {
          if (options.wsToken) {
            // Authenticate with JWT token
            ws.current.send(JSON.stringify({
              type: 'authenticate',
              token: options.wsToken
            }));
          } else {
            // Fallback for parent sessions without explicit token
            ws.current.send(JSON.stringify({
              type: 'identify',
              sessionId: options.sessionId,
              userType: options.userType,
              teacherId: options.teacherId,
              parentSessionId: options.parentSessionId
            }));
          }
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.current.onclose = () => {
        setIsConnected(false);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
    }

    // Initial connection
    connectWebSocket();

    return () => {
      ws.current?.close();
    };
  }, [options.sessionId, options.userType, options.teacherId, options.parentSessionId]);

  const sendMessage = (message: WebSocketMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  };

  return {
    isConnected,
    lastMessage,
    sendMessage
  };
}
