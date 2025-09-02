import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ParentInterface from "@/pages/parent";
import TeacherInterface from "@/pages/teacher";
import AdminInterface from "@/pages/admin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ParentInterface} />
      <Route path="/parent" component={ParentInterface} />
      <Route path="/teacher" component={TeacherInterface} />
      <Route path="/admin" component={AdminInterface} />
      <Route path="/queue/:code" component={ParentInterface} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
