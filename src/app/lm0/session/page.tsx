
'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import {
  LM0State,
  VirtualFileId,
  Challenge,
  HubMessage,
  HistoryEntry,
} from '../types';
import { Bot, FileText, CheckSquare, ListTodo, Play, Pause, Square, AlertCircle, RefreshCw, HelpCircle, Code, BookCopy, BookOpen, MessageSquare, ShieldAlert, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLM0Engine } from '../engine';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LM0SessionPage() {
  const { state, dispatch } = useLM0Engine();
  const [isInitialized, setIsInitialized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const configStr = sessionStorage.getItem('lm0_config');
    if (configStr) {
      try {
        const config = JSON.parse(configStr);
        dispatch({ type: 'START_SESSION', payload: { config } });
        setIsInitialized(true);
      } catch (e) {
        console.error("Failed to parse config from session storage", e);
        router.push('/lm0'); // Redirect back if config is invalid
      }
    } else {
       // If no config, redirect back to the setup page
       router.push('/lm0');
    }
  }, [dispatch, router]);
  
  const renderContent = () => {
    if (!isInitialized) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <p>Loading session...</p>
            </div>
        )
    }

    if (state.status === 'finished' || state.status === 'error') {
      return (
        <ScrollArea className="h-full w-full">
            <div className="p-4 md:p-8">
                 <FinalReportView state={state} onReset={() => router.push('/lm0')} />
            </div>
        </ScrollArea>
      );
    } else {
      return <SessionView state={state} dispatch={dispatch} />;
    }
  };

  return (
    <div className="h-screen max-h-screen w-full flex flex-col text-foreground overflow-hidden">
      {renderContent()}
    </div>
  );
}


// ###############################
// #### SESSION VIEW COMPONENTS
// ###############################

interface SessionViewProps {
  state: LM0State;
  dispatch: React.Dispatch<any>;
}

function SessionView({ state, dispatch }: SessionViewProps) {
  return (
    <div className="flex flex-1 flex-col animate-fade-in-up p-4 md:p-8 gap-4 overflow-hidden">
      <header className="flex-shrink-0">
        <SessionHeader state={state} dispatch={dispatch} />
      </header>
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 h-full min-h-0">
            <VirtualFilesystemPanel files={state.virtualFiles} />
        </div>
        <div className="lg:col-span-1 h-full min-h-0">
            <AgentLogPanel log={state.log} history={state.history} />
        </div>
         <div className="lg:col-span-1 h-full min-h-0">
            <HubPanel messages={state.hubMessages} />
        </div>
        <div className="lg:col-span-1 h-full min-h-0">
            <ErrorLogPanel errors={state.errors} errorCount={state.errorCount} />
        </div>
      </main>
    </div>
  );
}

function SessionHeader({ state, dispatch }: { state: LM0State; dispatch: React.Dispatch<any>}) {
  const { status, challenges, config } = state;
  const completed = challenges.filter(c => c.isCompleted).length;
  const total = challenges.length;
  const router = useRouter();

  let statusText: string;
  let StatusIcon: React.ElementType = Bot;

  const showChallengeCounter = config?.questionSource === 'agent';
  
  switch (status) {
    case 'running':
      statusText = showChallengeCounter ? `Running... (${completed}/${total} challenges complete)` : 'Running...';
      StatusIcon = Play;
      break;
    case 'paused':
      statusText = showChallengeCounter ? `Paused. (${completed}/${total} challenges complete)` : 'Paused.';
      StatusIcon = Pause;
      break;
    case 'finished':
      statusText = `Finished!`;
      StatusIcon = CheckSquare;
      break;
    case 'error':
      statusText = `Error occurred. Session halted.`;
      StatusIcon = AlertCircle;
      break;
    default:
      statusText = "Initializing...";
      StatusIcon = Bot;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <StatusIcon className={cn("h-6 w-6", status === 'running' && "text-green-500")} />
          <div>
            <CardTitle className="text-xl">LAB Session</CardTitle>
            <p className="text-sm text-muted-foreground">{statusText}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === 'running' && (
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'PAUSE_SESSION' })}>
              <Pause className="h-4 w-4 mr-2" /> Pause
            </Button>
          )}
           {status === 'paused' && (
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'RESUME_SESSION' })}>
              <Play className="h-4 w-4 mr-2" /> Resume
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={() => {
              dispatch({ type: 'FINISH_SESSION' });
          }}>
            <Square className="h-4 w-4 mr-2" /> Stop Session
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

function VirtualFilesystemPanel({ files }: { files: LM0State['virtualFiles'] }) {
  const fileIcons: Record<VirtualFileId, React.ReactElement> = {
    'question-bank.md': <HelpCircle className="h-4 w-4" />,
    'todo.md': <ListTodo className="h-4 w-4" />,
    'pre-answer.md': <FileText className="h-4 w-4" />,
    'final-answer.md': <CheckSquare className="h-4 w-4" />,
    'diary.md': <BookCopy className="h-4 w-4" />,
    'manual.md': <BookOpen className="h-4 w-4" />,
  }

  return (
    <Card className="flex flex-col h-full overflow-hidden border bg-background/50 backdrop-blur-sm">
      <CardHeader className="p-4 flex-shrink-0">
        <CardTitle className="text-lg">Virtual Filesystem</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
         <Tabs defaultValue="question-bank.md" className="h-full flex flex-col">
          <TabsList className="mx-2 flex-shrink-0 grid w-auto grid-cols-3 h-auto">
            {Object.keys(files).map((fileId) => (
               <TabsTrigger key={fileId} value={fileId} className="text-xs px-2 py-1 flex items-center gap-1">
                {fileIcons[fileId as VirtualFileId]}
                <span className="hidden sm:inline">{fileId.replace('.md','')}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(files).map(([fileId, file]) => (
            <TabsContent key={fileId} value={fileId} className="flex-1 min-h-0 mt-0">
               <ScrollArea className="h-full">
                 <div className="p-4 prose prose-sm dark:prose-invert max-w-none markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content || `*${fileId} is empty*`}</ReactMarkdown>
                 </div>
               </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AgentLogPanel({ log, history }: { log: string[], history: LM0State['history'] }) {
  const logScrollRef = useRef<HTMLDivElement>(null);
  const rawScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logScrollRef.current) {
        const viewport = logScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
             viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
        }
    }
  }, [log]);
  
    useEffect(() => {
    if (rawScrollRef.current) {
        const viewport = rawScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
             viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
        }
    }
  }, [history]);

  return (
    <Card className="flex flex-col h-full overflow-hidden border bg-background/50 backdrop-blur-sm">
      <Tabs defaultValue="log" className="h-full flex flex-col">
         <CardHeader className="p-0 flex-row justify-between items-center flex-shrink-0">
             <TabsList className="m-2">
                <TabsTrigger value="log">Agent Log</TabsTrigger>
                <TabsTrigger value="raw">Raw Transcript</TabsTrigger>
             </TabsList>
         </CardHeader>
         <TabsContent value="log" className="flex-1 min-h-0 mt-0">
             <ScrollArea className="h-full" ref={logScrollRef}>
              <div className="p-4 space-y-2 text-xs font-mono">
                {log.map((entry, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="whitespace-pre-wrap"
                  >
                    <span className="text-muted-foreground mr-2">{`[${i + 1}]`}</span>
                    {entry}
                  </motion.p>
                ))}
              </div>
            </ScrollArea>
         </TabsContent>
         <TabsContent value="raw" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-full" ref={rawScrollRef}>
              <pre className="text-xs whitespace-pre-wrap font-mono p-4">
                {JSON.stringify(history, null, 2)}
              </pre>
            </ScrollArea>
         </TabsContent>
      </Tabs>
    </Card>
  );
}

function HubPanel({ messages }: { messages: HubMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages]);

  return (
    <Card className="flex flex-col h-full overflow-hidden border bg-background/50 backdrop-blur-sm">
      <CardHeader className="p-4 flex-shrink-0">
        <CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Agent Hub</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-2">
        <ScrollArea className="h-full rounded-md" ref={scrollRef}>
          <div className="p-4 space-y-4">
            {messages.length === 0 && <p className="text-center text-sm text-muted-foreground italic">No helper agent messages yet.</p>}
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="p-3 rounded-lg bg-muted/30 border border-muted/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-xs text-primary">{msg.agentNickname}</span>
                  <span className="text-xs text-muted-foreground">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


function ErrorLogPanel({ errors, errorCount }: { errors: string[], errorCount: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [errors]);

  return (
    <Card className="flex flex-col h-full overflow-hidden border border-destructive/50 bg-destructive/10 backdrop-blur-sm">
      <CardHeader className="p-4 flex-shrink-0 flex-row justify-between items-center">
        <CardTitle className="text-lg flex items-center gap-2 text-destructive"><ShieldAlert className="h-5 w-5" /> Error Log</CardTitle>
        <span className="text-xs font-mono text-destructive bg-destructive/20 px-2 py-1 rounded-md">{errorCount} / 50 Retries</span>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-2">
        <ScrollArea className="h-full rounded-md" ref={scrollRef}>
          <div className="p-4 space-y-3">
            {errors.length === 0 && <p className="text-center text-sm text-destructive/80 italic">No errors yet.</p>}
            {errors.map((error, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="p-2 rounded-lg bg-destructive/10 border border-destructive/30"
              >
                <p className="text-xs font-mono text-destructive">{error}</p>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


// ###############################
// #### FINAL REPORT COMPONENTS
// ###############################

function RawTranscriptDialog({ history }: { history: LM0State['history'] }) {
    const [hasCopied, setHasCopied] = useState(false);

    const copyToClipboard = () => {
        const transcriptText = JSON.stringify(history, null, 2);
        navigator.clipboard.writeText(transcriptText).then(() => {
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
        });
    };

    return (
        <Dialog>
        <DialogTrigger asChild>
            <Button variant="outline" size="sm">
            <Code className="mr-2 h-4 w-4" /> View Raw Transcript
            </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
            <DialogHeader>
            <div className="flex justify-between items-center">
                <div>
                <DialogTitle>Raw Session Transcript</DialogTitle>
                <DialogDescription>
                    The complete, unformatted requests and responses for each agent turn.
                </DialogDescription>
                </div>
                <Button size="sm" variant="outline" onClick={copyToClipboard}>
                {hasCopied ? <Check className="h-4 w-4 mr-2 text-green-500" /> : <Copy className="h-4 w-4 mr-2" />}
                {hasCopied ? 'Copied!' : 'Copy'}
                </Button>
            </div>
            </DialogHeader>
            <ScrollArea className="flex-grow bg-muted/50 rounded-md">
            <pre className="text-xs whitespace-pre-wrap font-mono p-4">
                {JSON.stringify(history, null, 2)}
            </pre>
            </ScrollArea>
        </DialogContent>
        </Dialog>
    );
}

interface FinalReportViewProps {
  state: LM0State;
  onReset: () => void;
}

function FinalReportView({ state, onReset }: FinalReportViewProps) {
  const { status, error, challenges, virtualFiles, history } = state;

  return (
    <div className="animate-fade-in-up space-y-6">
       <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>LAB Session Report</CardTitle>
            <CardDescription>
              {status === 'error' ? `Session stopped with an error.` : 'The agent has completed its session.'}
            </CardDescription>
          </div>
           <div className="flex items-center gap-2">
            <RawTranscriptDialog history={history} />
            <Button onClick={onReset} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" /> Start New Session
            </Button>
          </div>
        </CardHeader>
        {error && (
           <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error Details</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {state.config?.questionSource === 'agent' && (
            <div className="lg:col-span-1">
                <CompletedChallengesSummary challenges={challenges} />
            </div>
        )}
        <div className={cn(state.config?.questionSource === 'agent' ? "lg:col-span-2" : "lg-col-span-3")}>
           <Card className="flex flex-col h-[60vh]">
            <CardHeader>
                <CardTitle>Final Filesystem State</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-hidden">
                <Tabs defaultValue="final-answer.md" className="h-full flex flex-col">
                 <TabsList className="mx-2">
                    {Object.keys(virtualFiles).map((fileId) => (
                    <TabsTrigger key={fileId} value={fileId} className="text-xs px-2 py-1">
                        {fileId}
                    </TabsTrigger>
                    ))}
                </TabsList>
                {Object.entries(virtualFiles).map(([fileId, file]) => (
                     <TabsContent key={fileId} value={fileId} className="flex-1 min-h-0 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content || `*${fileId} is empty*`}</ReactMarkdown>
                            </div>
                        </ScrollArea>
                    </TabsContent>
                ))}
                </Tabs>
            </CardContent>
           </Card>
        </div>
      </div>
    </div>
  )
}

function CompletedChallengesSummary({ challenges }: { challenges: Challenge[]}) {
  return (
    <Card className="flex flex-col h-[60vh]">
      <CardHeader>
        <CardTitle>Challenge Summary</CardTitle>
        <CardDescription>A review of the agent's work on each challenge.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-4 pr-4">
            {challenges.map(c => (
              <div key={c.challengeNumber} className={cn("p-4 border rounded-lg", c.isCompleted ? 'border-green-500/30' : 'border-dashed')}>
                 <div className="flex items-start justify-between">
                  <h4 className="font-semibold text-base mb-2">Challenge #{c.challengeNumber}</h4>
                  {c.isCompleted ? 
                    <div className="flex items-center text-xs text-green-400"><CheckSquare className="h-4 w-4 mr-1" /> Completed</div> :
                    <div className="flex items-center text-xs text-muted-foreground"><Bot className="h-4 w-4 mr-1" /> Incomplete</div>
                  }
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <h5 className="font-semibold text-muted-foreground">Uploaded Question:</h5>
                    <p className="p-2 bg-muted/40 rounded-md mt-1">{c.question || 'Not uploaded.'}</p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-muted-foreground">Uploaded Answer:</h5>
                     <p className="p-2 bg-muted/40 rounded-md mt-1">{c.submittedAnswer || 'Not uploaded.'}</p>
                  </div>
                   <div>
                    <h5 className="font-semibold text-muted-foreground">Final Answer (from file):</h5>
                     <p className="p-2 bg-muted/40 rounded-md mt-1">{c.finalAnswer || 'Not provided.'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
