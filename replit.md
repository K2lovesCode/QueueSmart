# Parent-Teacher Meeting Queue Management System

## Overview

A real-time web application designed to manage Parent-Teacher Meeting queues, eliminating scheduling conflicts and reducing parent anxiety. The system replaces fixed time slots with dynamic queue management, providing three distinct interfaces for Parents, Teachers, and School Admins. Parents join queues via QR codes or teacher codes, receive simple status updates, and get notified when their turn approaches. Teachers manage their queues through a control panel, while admins oversee the entire system.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack React Query for server state management
- **Real-time Updates**: WebSocket connection for live queue updates

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with WebSocket support for real-time features
- **Session Management**: Browser session-based authentication for parents, credential-based for teachers/admins
- **Real-time Communication**: WebSocket server for broadcasting queue status changes

### Data Storage Solutions
- **Database**: PostgreSQL with Neon serverless hosting
- **ORM**: Drizzle ORM for type-safe database operations
- **Schema**: Relational design with tables for users, teachers, parent sessions, queue entries, and meetings
- **Migrations**: Drizzle Kit for database schema management

### Authentication and Authorization
- **Parent Authentication**: Session-based using browser session IDs stored in localStorage
- **Teacher/Admin Authentication**: Traditional email/password with secure login
- **Role-based Access**: Three user roles (parent, teacher, admin) with appropriate permissions
- **Session Storage**: PostgreSQL-based session management with connect-pg-simple

### Queue Management System
- **Queue Logic**: Position-based queueing with real-time status updates
- **Status States**: Three simple states for parents (waiting, next, current)
- **Notification System**: WebSocket-based notifications for queue progression
- **Meeting Timer**: Built-in timing system for teacher-parent meetings

### QR Code Integration
- **QR Generation**: Server-side QR code generation for teacher queues
- **QR Scanning**: Client-side camera access for QR code scanning
- **Fallback**: Manual teacher code entry for accessibility

### Mobile-First Design
- **Responsive Layout**: Mobile-optimized interface using Tailwind breakpoints
- **Progressive Enhancement**: Works without app installation
- **Touch-Friendly**: Large buttons and touch targets for mobile devices
- **Offline Considerations**: WebSocket reconnection handling for network interruptions

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Database Connection**: WebSocket-compatible connection string configuration

### Development Tools
- **Vite**: Fast development server with Hot Module Replacement
- **TypeScript**: Type safety across client and server code
- **ESBuild**: Fast bundling for production builds

### UI Libraries
- **Radix UI**: Accessible, unstyled UI primitives for complex components
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Lucide React**: Icon library for consistent iconography

### Real-time Features
- **WebSocket (ws)**: Native WebSocket implementation for real-time communication
- **TanStack React Query**: Server state synchronization and caching

### QR Code Functionality
- **QRCode Library**: Server-side QR code generation
- **Browser Camera API**: Client-side camera access for QR scanning

### Styling and Theming
- **Class Variance Authority**: Type-safe CSS class variants
- **clsx**: Conditional CSS class composition
- **PostCSS**: CSS processing with Autoprefixer

### Deployment
- **Replit Integration**: Development environment optimizations
- **Production Build**: Optimized builds with proper asset handling