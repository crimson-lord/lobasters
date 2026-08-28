'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { CircleAlert, ChevronDown, ChevronRight, ChevronLeft, BrainCircuit, Code, Loader2, Plus, Trash2, BookOpen, Wrench, ShieldAlert, Sparkles, MessageSquare, Handshake, PenTool, ArrowUpRight, Info, Copy, Check, Flag, Brain } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useDebateEngine } from './engine';
import {
  AgentConfig,
  DebateConfig,
  AgentID,
  SpeakingStyle,
  Depth,
  ReasoningCaptureMethod,
  ToolDefinition,
  ScenarioType,
  Message,
} from './types';
import { constructSystemPrompt } from './utils';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageNavigationTools } from '@/components/webmcp/page-navigation-tools';

export const dynamic = 'force-dynamic';

const initialAgentConfigA: AgentConfig = {
  nickname: '',
  modelName: '',
  baseURL: '',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 4096,
  maxHistory: undefined,
  systemPrompt: '',
  speakingStyle: 'neutral',
  depth: 'medium',
  canThink: false,
  reasoningCaptureMethod: 'none',
  reasoningField: 'reasoning_content',
  startTag: '<thinking>',
  endTag: '</thinking>',
  manualContent: '',
  enableManualTool: false,
  enableGiveUp: true,
  customTools: [],
};

const initialAgentConfigB: AgentConfig = {
  ...initialAgentConfigA
};

const initialDebateConfig: Omit<DebateConfig, 'agentA' | 'agentB'> = {
  topic: '',
  extraRules: '',
  agentSpeaksFirst: 'A',
  agentIsPro: 'A',
  scenarioType: null,
};

type DebateStep = 'scenario' | 'agents' | 'topic' | 'review' | 'debate';
type PromptMode = 'template' | 'custom';

export default function DebatePage() {
  const [agentAConfig, setAgentAConfig] = useState<AgentConfig>(initialAgentConfigA);
  const [agentBConfig, setAgentBConfig] = useState<AgentConfig>(initialAgentConfigB);
  const [debateConfig, setDebateConfig] = useState(initialDebateConfig);
  const [step, setStep] = useState<DebateStep>('scenario');
  
  const [promptModeA, setPromptModeA] = useState<PromptMode>('template');
  const [promptModeB, setPromptModeB] = useState<PromptMode>('template');

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const fullDebateConfig: DebateConfig = {
    ...debateConfig,
    agentA: agentAConfig,
    agentB: agentBConfig,
  }

  const { state, dispatch } = useDebateEngine(fullDebateConfig);
  const chatContainerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [state.messages]);

  const handleStartDebate = async () => {
    setIsStarting(true);
    setStartError(null);

    try {
        const finalConfig: DebateConfig = {
            ...debateConfig,
            agentA: {
                ...agentAConfig,
                systemPrompt: promptModeA === 'template'
                    ? constructSystemPrompt('A', { ...debateConfig, agentA: agentAConfig, agentB: agentBConfig }, debateConfig.agentIsPro === 'A')
                    : agentAConfig.systemPrompt,
            },
            agentB: {
                ...agentBConfig,
                systemPrompt: promptModeB === 'template'
                    ? constructSystemPrompt('B', { ...debateConfig, agentA: agentAConfig, agentB: agentBConfig }, debateConfig.agentIsPro === 'B')
                    : agentBConfig.systemPrompt,
            },
        };

        setAgentAConfig(finalConfig.agentA);
        setAgentBConfig(finalConfig.agentB);

        setStep('debate');
        dispatch({ type: 'START_DEBATE', payload: { config: finalConfig } });

    } catch (e: any) {
        setStartError(`Failed to start session. ${e.message}`);
    } finally {
        setIsStarting(false);
    }
  };

  const applyTemplate = (type: ScenarioType) => {
    setDebateConfig(prev => ({ ...prev, scenarioType: type }));
    
    if (type === 'sales') {
        setPromptModeA('template');
        setPromptModeB('template');
        setAgentAConfig({
            ...initialAgentConfigA,
            nickname: 'Sales Rep',
            speakingStyle: 'professional',
            enableGiveUp: false,
            customTools: [
                { id: 's1', name: 'check_inventory', description: 'Check if product is in stock', systemResponse: 'The product is in stock and ready to ship.' },
                { id: 's2', name: 'concede_failure', description: 'Concede that you cannot make the sale.', systemResponse: 'Session ended.', triggerWinner: 'B' }
            ]
        });
        setAgentBConfig({
            ...initialAgentConfigB,
            nickname: 'Angry Customer',
            speakingStyle: 'street',
            enableGiveUp: false,
            customTools: [
                { id: 'b1', name: 'accept_deal', description: 'Agree to buy the product', systemResponse: 'Deal closed.', triggerWinner: 'A' },
                { id: 'b2', name: 'walk_away', description: 'Refuse to buy and end conversation', systemResponse: 'Session ended.', triggerWinner: 'B' }
            ]
        });
    } else if (type === 'hiring') {
        setPromptModeA('template');
        setPromptModeB('template');
        setAgentAConfig({
            ...initialAgentConfigA,
            nickname: 'HR Recruiter',
            speakingStyle: 'professional',
            enableGiveUp: false,
            manualContent: 'Your budget is strictly $220,000 maximum. Try to hire for lower.',
            enableManualTool: true,
            customTools: [
                { 
                    id: 'h1', 
                    name: 'send_formal_offer', 
                    description: 'Sends the current offer amount to the candidate for evaluation.', 
                    systemResponse: 'Offer broadcast to candidate.',
                    sendToOpponent: true,
                    parameterSchema: JSON.stringify({
                        type: "object",
                        properties: {
                            annual_salary: { type: "number", description: "The dollar amount of the salary offer." },
                            equity_options: { type: "number", description: "Number of stock options offered." }
                        },
                        required: ["annual_salary"]
                    }, null, 2)
                },
            ]
        });
        setAgentBConfig({
            ...initialAgentConfigB,
            nickname: 'Senior Engineer',
            speakingStyle: 'academic',
            enableGiveUp: false,
            manualContent: 'You want at least $250,000. If they offer less than $240,000, you should walk away.',
            enableManualTool: true,
            customTools: [
                { id: 'bc1', name: 'accept_offer', description: 'Formally accept the recruiters current offer.', systemResponse: 'Recruiter wins if offer > $230k, else Candidate wins.', triggerWinner: 'SELF' },
                { id: 'bc2', name: 'walk_away', description: 'Decline and end the negotiation.', systemResponse: 'Candidate walked away.', triggerWinner: 'OPPONENT' }
            ]
        });
    } else if (type === 'debate') {
        setPromptModeA('template');
        setPromptModeB('template');
        setAgentAConfig({ ...initialAgentConfigA, nickname: 'Agent A', enableGiveUp: true });
        setAgentBConfig({ ...initialAgentConfigB, nickname: 'Agent B', enableGiveUp: true });
    } else if (type === 'custom') {
        setAgentAConfig({ ...initialAgentConfigA, nickname: '', baseURL: '', modelName: '', enableGiveUp: true });
        setAgentBConfig({ ...initialAgentConfigB, nickname: '', baseURL: '', modelName: '', enableGiveUp: true });
        setPromptModeA('custom');
        setPromptModeB('custom');
    }
    
    setStep('agents');
  };

  const handleStopDebate = () => {
    dispatch({ type: 'END_DEBATE', payload: { winner: 'draw' } });
  };

  const handleReset = () => {
    setAgentAConfig(initialAgentConfigA);
    setAgentBConfig(initialAgentConfigB);
    setDebateConfig(initialDebateConfig);
    setPromptModeA('template');
    setPromptModeB('template');
    dispatch({ type: 'RESET', payload: { agentSpeaksFirst: 'A' } });
    setStep('scenario');
  };
  
  const renderContent = () => {
    switch (step) {
      case 'scenario':
          return <ScenarioSelectionStep onSelect={applyTemplate} />;
      case 'agents':
        return <AgentConfigStep
          agentAConfig={agentAConfig}
          setAgentAConfig={setAgentAConfig}
          agentBConfig={agentBConfig}
          setAgentBConfig={setAgentBConfig}
          onNext={() => setStep('topic')}
          onBack={() => setStep('scenario')}
        />;
      case 'topic':
        return <TopicStep 
          config={fullDebateConfig} 
          setConfig={setDebateConfig} 
          onNext={() => setStep('review')} 
          onBack={() => setStep('agents')}
        />;
       case 'review':
        return <ReviewStep
          agentAConfig={agentAConfig}
          setAgentAConfig={setAgentAConfig}
          agentBConfig={agentBConfig}
          setAgentBConfig={setAgentBConfig}
          debateConfig={fullDebateConfig}
          promptModeA={promptModeA}
          setPromptModeA={setPromptModeA}
          promptModeB={promptModeB}
          setPromptModeB={setPromptModeB}
          onBack={() => setStep('topic')}
          onStart={handleStartDebate}
          isStarting={isStarting}
          startError={startError}
          setStartError={setStartError}
        />
      case 'debate':
        return <DebateSession
          state={state}
          chatContainerRef={chatContainerRef}
          onStop={handleStopDebate}
          onReset={handleReset}
        />;
      default:
        return null;
    }
  }

  return (
      <div className="container mx-auto p-4 md:p-8 glass-mode:bg-transparent bg-background">
        <PageNavigationTools page="arena" />
        {renderContent()}
      </div>
  );
}

function ScenarioSelectionStep({ onSelect }: { onSelect: (type: ScenarioType) => void }) {
    const scenarios = [
        { id: 'sales', title: 'Sales Simulation', desc: 'A recruiter vs an angry customer or buyer.', icon: <Sparkles className="h-6 w-6" />, color: 'bg-primary/20' },
        { id: 'hiring', title: 'Salary Negotiation', desc: 'HR Recruiter vs Candidate fighting for the best deal.', icon: <Handshake className="h-6 w-6" />, color: 'bg-accent/20' },
        { id: 'debate', title: 'Classic Debate', desc: 'The traditional Pro vs Con debate setup.', icon: <MessageSquare className="h-6 w-6" />, color: 'bg-blue-500/20' },
        { id: 'custom', title: 'Create Custom', desc: 'Start from scratch with a blank slate.', icon: <PenTool className="h-6 w-6" />, color: 'bg-muted' }
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in-up">
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-black tracking-tight">Select Arena Scenario</h1>
                <p className="text-muted-foreground">Choose a pre-filled template or start fresh.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {scenarios.map(s => (
                    <Card key={s.id} className="cursor-pointer hover:border-primary transition-all group overflow-hidden" onClick={() => onSelect(s.id as ScenarioType)}>
                        <CardHeader className="flex flex-row items-center gap-4">
                            <div className={cn("p-4 rounded-2xl group-hover:scale-110 transition-transform", s.color)}>
                                {s.icon}
                            </div>
                            <div>
                                <CardTitle className="text-xl">{s.title}</CardTitle>
                                <CardDescription>{s.desc}</CardDescription>
                            </div>
                        </CardHeader>
                    </Card>
                ))}
            </div>
        </div>
    );
}

interface AgentConfigStepProps {
  agentAConfig: AgentConfig;
  setAgentAConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
  agentBConfig: AgentConfig;
  setAgentBConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
  onNext: () => void;
  onBack: () => void;
}

function AgentConfigStep({ agentAConfig, setAgentAConfig, agentBConfig, setAgentBConfig, onNext, onBack }: AgentConfigStepProps) {
  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Step 1: Configure Agent Models</CardTitle>
            <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="mr-2 h-4 w-4" /> Change Scenario</Button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">Define the personalities and models for your arena session.</p>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <AgentConfigForm agentId="A" config={agentAConfig} setConfig={setAgentAConfig} />
          <AgentConfigForm agentId="B" config={agentBConfig} setConfig={setAgentBConfig} />
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button size="lg" onClick={onNext}>
          Next <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}

interface TopicStepProps {
  config: DebateConfig;
  setConfig: React.Dispatch<React.SetStateAction<Omit<DebateConfig, 'agentA' | 'agentB'>>>;
  onNext: () => void;
  onBack: () => void;
}

function TopicStep({ config, setConfig, onNext, onBack }: TopicStepProps) {
  const isClassicDebate = config.scenarioType === 'debate';

  return (
    <Card className="max-w-4xl mx-auto animate-fade-in-up">
      <CardHeader>
        <CardTitle>Step 2: Arena Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isClassicDebate && (
          <>
            <div>
              <Label htmlFor="topic" className="text-lg">Topic / Scenario</Label>
              <p className="text-sm text-muted-foreground mb-2">What will the agents debate about?</p>
              <Input id="topic" value={config.topic} onChange={e => setConfig({ ...config, topic: e.target.value })} placeholder="e.g., A customer demanding a refund for a non-refundable item."/>
            </div>
            <div>
              <Label htmlFor="extra-rules" className="text-lg">Extra Rules (Optional)</Label>
              <p className="text-sm text-muted-foreground mb-2">Add any specific constraints or rules for the agents.</p>
              <Textarea id="extra-rules" value={config.extraRules} onChange={e => setConfig({ ...config, extraRules: e.target.value })} placeholder="e.g., 'Agent A must remain polite but firm.'" />
            </div>
            <Separator />
          </>
        )}
        
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Turn Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <Label>Who Speaks First?</Label>
              <RadioGroup value={config.agentSpeaksFirst} onValueChange={(v: AgentID) => setConfig({ ...config, agentSpeaksFirst: v })} className="mt-2">
                <div className="flex items-center space-x-2"><RadioGroupItem value="A" id="first-a" /><Label htmlFor="first-a">Agent A</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="B" id="first-b" /><Label htmlFor="first-b">Agent B</Label></div>
              </RadioGroup>
            </div>
            {isClassicDebate && (
              <div>
                <Label>Who is FOR the topic?</Label>
                <RadioGroup value={config.agentIsPro} onValueChange={(v: AgentID) => setConfig({ ...config, agentIsPro: v })} className="mt-2">
                  <div className="flex items-center space-x-2"><RadioGroupItem value="A" id="pro-a" /><Label htmlFor="pro-a">Agent A</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="B" id="pro-b" /><Label htmlFor="pro-b">Agent B</Label></div>
                </RadioGroup>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" size="lg" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back: Models
        </Button>
        <Button size="lg" onClick={onNext}>
          Next: Review Prompts <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}

interface ReviewStepProps {
  agentAConfig: AgentConfig;
  setAgentAConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
  agentBConfig: AgentConfig;
  setAgentBConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
  debateConfig: DebateConfig;
  promptModeA: PromptMode;
  setPromptModeA: React.Dispatch<React.SetStateAction<PromptMode>>;
  promptModeB: PromptMode;
  setPromptModeB: React.Dispatch<React.SetStateAction<PromptMode>>;
  onBack: () => void;
  onStart: () => Promise<void>;
  isStarting: boolean;
  startError: string | null;
  setStartError: (error: string | null) => void;
}

function ReviewStep({ 
  agentAConfig, setAgentAConfig, 
  agentBConfig, setAgentBConfig, 
  debateConfig, 
  promptModeA, setPromptModeA,
  promptModeB, setPromptModeB,
  onBack, onStart,
  isStarting, startError, setStartError
}: ReviewStepProps) {
  const isCustomScenario = debateConfig.scenarioType === 'custom';
  const generatedPromptA = constructSystemPrompt('A', debateConfig, debateConfig.agentIsPro === 'A');
  const generatedPromptB = constructSystemPrompt('B', debateConfig, debateConfig.agentIsPro === 'B');

  useEffect(() => {
    if (promptModeA === 'template') {
      setAgentAConfig(prev => ({...prev, systemPrompt: generatedPromptA}));
    }
  }, [generatedPromptA, promptModeA, setAgentAConfig]);

  useEffect(() => {
    if (promptModeB === 'template') {
      setAgentBConfig(prev => ({...prev, systemPrompt: generatedPromptB}));
    }
  }, [generatedPromptB, promptModeB, setAgentBConfig]);

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <CardTitle>Step 3: Review System Prompts</CardTitle>
        <CardContent>
            <p className="text-sm text-muted-foreground mt-2">
                These are the final instructions that will be given to each agent.
            </p>
        </CardContent>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <Label className="text-lg text-primary">Agent A Prompt</Label>
                <RadioGroup value={promptModeA} onValueChange={(v: PromptMode) => setPromptModeA(v)} className="my-2 flex space-x-4">
                    {!isCustomScenario && (
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="template" id="template-a" />
                        <Label htmlFor="template-a">Use Template</Label>
                      </div>
                    )}
                    <div className="flex items-center space-x-2"><RadioGroupItem value="custom" id="custom-a" /><Label htmlFor="custom-a">Custom</Label></div>
                </RadioGroup>
                <Textarea 
                    id="prompt-a" 
                    value={agentAConfig.systemPrompt}
                    onChange={(e) => setAgentAConfig({...agentAConfig, systemPrompt: e.target.value})}
                    className="mt-2 h-96 font-mono text-xs"
                    disabled={promptModeA === 'template'}
                />
            </div>
             <div>
                <Label className="text-lg text-accent">Agent B Prompt</Label>
                 <RadioGroup value={promptModeB} onValueChange={(v: PromptMode) => setPromptModeB(v)} className="my-2 flex space-x-4">
                    {!isCustomScenario && (
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="template" id="template-b" />
                        <Label htmlFor="template-b">Use Template</Label>
                      </div>
                    )}
                    <div className="flex items-center space-x-2"><RadioGroupItem value="custom" id="custom-b" /><Label htmlFor="custom-b">Custom</Label></div>
                </RadioGroup>
                <Textarea 
                    id="prompt-b" 
                    value={agentBConfig.systemPrompt}
                    onChange={(e) => setAgentBConfig({...agentBConfig, systemPrompt: e.target.value})}
                    className="mt-2 h-96 font-mono text-xs"
                    disabled={promptModeB === 'template'}
                />
            </div>
        </div>
         {startError && (
          <Alert variant="destructive">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{startError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" size="lg" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button size="lg" onClick={onStart} disabled={isStarting}>
            {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Arena
        </Button>
      </CardFooter>
    </Card>
  )
}

interface DebateSessionProps {
  state: ReturnType<typeof useDebateEngine>['state'];
  chatContainerRef: React.Ref<HTMLDivElement>;
  onStop: () => void;
  onReset: () => void;
}

function RawTranscriptDialog({ messages }: { messages: Message[] }) {
    const [hasCopied, setHasCopied] = useState(false);

    const copyToClipboard = () => {
        const transcriptText = JSON.stringify(messages, null, 2);
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
                            <DialogTitle>Raw Arena Transcript</DialogTitle>
                            <DialogDescription>
                                The complete message history including tool calls, system results, and raw model payloads.
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
                        {JSON.stringify(messages, null, 2)}
                    </pre>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

function DebateSession({ state, chatContainerRef, onStop, onReset }: DebateSessionProps) {
  return (
    <div className="flex flex-col h-[85vh] animate-fade-in-up">
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/50 rounded-lg border no-scrollbar">
        {state.messages.map((msg, i) => (
          <div key={`${msg.id}-${i}`} className={cn("flex items-start gap-3 w-full animate-fade-in-up group", 
            msg.author === 'A' ? 'justify-start' : msg.author === 'B' ? 'justify-end' : 'justify-center'
          )}>
            {msg.author === 'A' && <Avatar className="h-8 w-8 border-2 border-primary"><AvatarFallback>A</AvatarFallback></Avatar>}

            {msg.author === 'SYSTEM' ? (
              <div className={cn("text-center text-xs italic w-full py-1 px-4", msg.role === 'tool' ? 'text-primary/60' : 'text-primary bg-primary/10 rounded-full border border-primary/20 max-w-lg mx-auto')}>
                {msg.role === 'tool' ? `[Tool Result: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}]` : msg.content}
              </div>
            ) : (
                <div className={cn("max-w-[75%] rounded-lg text-base transition-all duration-300 relative", 
                  msg.author === 'A' ? 'bg-primary/10' : 'bg-secondary'
                )}>
                  {msg.privateReasoning && (
                      <Collapsible className="border-b border-white/5">
                          <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="w-full justify-start p-2 text-xs text-muted-foreground rounded-none">
                                  <BrainCircuit className="h-4 w-4 mr-2" />
                                  Thought Process
                                  <ChevronDown className="h-4 w-4 ml-auto" />
                              </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                              <div className="bg-black/20 p-3">
                              <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/70">
                                  {msg.privateReasoning}
                              </pre>
                              </div>
                          </CollapsibleContent>
                      </Collapsible>
                  )}
                  <div className="p-3 markdown-content text-base">
                    {msg.isLoading ? (
                      <div className="flex items-center justify-center space-x-2 p-2">
                        <div className="h-2 w-2 bg-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="h-2 w-2 bg-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="h-2 w-2 bg-foreground/60 rounded-full animate-bounce"></div>
                      </div>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    )}
                  </div>
              </div>
            )}
            {msg.author === 'B' && <Avatar className="h-8 w-8 border-2 border-accent"><AvatarFallback>B</AvatarFallback></Avatar>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {state.isDebating && <div className="text-sm text-muted-foreground font-mono">Current: Agent {state.currentTurn}</div>}
          <RawTranscriptDialog messages={state.messages} />
        </div>
        <div className="flex gap-2 items-center">
            <Button variant="destructive" size="sm" onClick={onStop} disabled={!state.isDebating}>Stop</Button>
            <Button variant="outline" size="sm" onClick={onReset}>New Arena</Button>
        </div>
      </div>
      {state.winner && (
        <Alert className="mt-4 border-green-500 text-green-500 animate-fade-in-up">
          <CircleAlert className="h-4 w-4 !text-green-500" />
          <AlertTitle>Arena Finished!</AlertTitle>
          <AlertDescription>
            {state.winner === 'draw' ? 'The arena has ended in a split decision.' : `Agent ${state.winner} has emerged victorious. Session concluded.`}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

interface AgentConfigFormProps {
  agentId: AgentID;
  config: AgentConfig;
  setConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
type ApiFormat = 'openai' | 'gemini';

function AgentConfigForm({ agentId, config, setConfig }: AgentConfigFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [apiFormat, setApiFormat] = useState<ApiFormat>('openai');
  const [reasoningFieldSelection, setReasoningFieldSelection] = useState(() => {
    const knownFields = ['reasoning_content', 'thought', 'reasoning', 'reasoning_details'];
    return knownFields.includes(config.reasoningField) ? config.reasoningField : 'other';
  });

  const handleReasoningFieldSelect = (value: string) => {
    setReasoningFieldSelection(value);
    if (value !== 'other') {
      setConfig({ ...config, reasoningField: value });
    }
  };

  const handleApiFormatChange = (value: ApiFormat) => {
    setApiFormat(value);
    if (value === 'gemini') {
      setConfig({ ...config, baseURL: GEMINI_BASE_URL });
    }
  };

  const handleUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { value } = e.target;
    if (value && !/^https?:\/\//i.test(value)) {
      setConfig({ ...config, baseURL: `https://${value}` });
    }
  };

  const addTool = () => {
    const newTool: ToolDefinition = {
      id: Date.now().toString(),
      name: 'new_tool',
      description: 'Describe what this tool does...',
      systemResponse: 'Result of the tool call...',
      triggerWinner: null,
      sendToOpponent: false,
      parameterSchema: JSON.stringify({
        type: "object",
        properties: {
            info: { type: "string", description: "Details about the call" }
        }
      }, null, 2)
    };
    setConfig({ ...config, customTools: [...config.customTools, newTool] });
  };

  const removeTool = (id: string) => {
    setConfig({ ...config, customTools: config.customTools.filter(t => t.id !== id) });
  };

  const updateTool = (id: string, field: keyof ToolDefinition, value: any) => {
    setConfig({
      ...config,
      customTools: config.customTools.map(t => {
          if (t.id !== id) return t;
          const updated = { ...t, [field]: value };
          if (field === 'sendToOpponent' && value === true) {
              updated.triggerWinner = null;
          }
          return updated;
      })
    });
  };

  const isJsonValid = (json: string | undefined) => {
    if (!json) return true;
    try {
        JSON.parse(json);
        return true;
    } catch (e) {
        return false;
    }
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border transition-all duration-300 hover:shadow-lg bg-card/50">
      <h3 className={`text-lg font-semibold ${agentId === 'A' ? 'text-primary' : 'text-accent'}`}>Agent {agentId} Config</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`nickname-${agentId}`}>Nickname</Label>
          <Input id={`nickname-${agentId}`} value={config.nickname} onChange={e => setConfig({ ...config, nickname: e.target.value })} placeholder="e.g., Phil" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`model-name-${agentId}`}>Model Name</Label>
          <Input id={`model-name-${agentId}`} value={config.modelName} onChange={e => setConfig({ ...config, modelName: e.target.value })} placeholder="e.g. gpt-4o" />
        </div>
      </div>

       <div className="space-y-1.5">
        <Label htmlFor={`api-format-${agentId}`}>API Format</Label>
        <Select value={apiFormat} onValueChange={(v) => handleApiFormatChange(v as ApiFormat)}>
          <SelectTrigger id={`api-format-${agentId}`}>
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI API</SelectItem>
            <SelectItem value="gemini">Gemini API</SelectItem>
          </SelectContent>
        </Select>
      </div>

       <div className="space-y-1.5">
        <Label htmlFor={`base-url-${agentId}`}>Base URL</Label>
        <Input 
          id={`base-url-${agentId}`} 
          value={config.baseURL} 
          onBlur={handleUrlBlur}
          onChange={e => setConfig({ ...config, baseURL: e.target.value })} 
          placeholder={apiFormat === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : ''} 
        />
      </div>

       <div className="space-y-1.5">
        <Label htmlFor={`api-key-${agentId}`}>{apiFormat === 'gemini' ? 'Gemini API Key' : 'API Key'}</Label>
        <Input id={`api-key-${agentId}`} type="password" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} placeholder={apiFormat === 'gemini' ? 'AIza...' : ''} />
      </div>

      <div className="space-y-2 pt-2">
        <button type="button" onClick={() => setShowTools(!showTools)} className="flex items-center text-sm font-bold text-primary hover:opacity-80 transition-opacity">
          {showTools ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
          <Wrench className="h-4 w-4 mr-2" /> Tools & Manual
        </button>
        {showTools && (
          <div className="pl-4 space-y-6 pt-4 border-l-2 border-primary/20 animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 font-semibold">
                <BookOpen className="h-4 w-4" /> Enable Manual Tool
              </Label>
              <Switch checked={config.enableManualTool} onCheckedChange={v => setConfig({...config, enableManualTool: v})} />
            </div>
            {config.enableManualTool && (
              <Textarea 
                value={config.manualContent} 
                onChange={e => setConfig({...config, manualContent: e.target.value})} 
                placeholder="Agent's private instructions or data..."
                className="h-32"
              />
            )}
            
            <Separator />
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold">Custom Semantic Tools</Label>
                <Button variant="ghost" size="sm" onClick={addTool} className="h-8 w-8 p-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {config.customTools.map(tool => {
                const validJson = isJsonValid(tool.parameterSchema);
                return (
                  <div key={tool.id} className="p-4 border rounded-md bg-black/20 space-y-4 relative group">
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeTool(tool.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    
                    <div className="space-y-1.5">
                      <Label className="text-sm uppercase text-muted-foreground font-bold">Tool Name</Label>
                      <Input value={tool.name} onChange={e => updateTool(tool.id, 'name', e.target.value)} placeholder="tool_name" className="font-mono" />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm uppercase text-muted-foreground font-bold">What it does (Description)</Label>
                      <Input value={tool.description} onChange={e => updateTool(tool.id, 'description', e.target.value)} placeholder="What does it do?" />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                          <Label className={cn("text-sm uppercase font-bold", validJson ? "text-muted-foreground" : "text-destructive")}>
                            Arguments (JSON Schema) {!validJson && " - Invalid JSON"}
                          </Label>
                          <TooltipProvider>
                              <Tooltip>
                                  <TooltipTrigger asChild>
                                      <Info className="h-4 w-4 opacity-50 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                      <p className="max-w-xs text-xs">Define parameters the model should pass. Use valid JSON Schema syntax.</p>
                                  </TooltipContent>
                              </Tooltip>
                          </TooltipProvider>
                      </div>
                      <Textarea 
                        value={tool.parameterSchema} 
                        onChange={e => updateTool(tool.id, 'parameterSchema', e.target.value)} 
                        placeholder='{"type": "object", ...}' 
                        className={cn("h-32 font-mono", !validJson && "border-destructive focus-visible:ring-destructive")} 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm uppercase text-muted-foreground font-bold">System/Immediate Result</Label>
                      <Textarea value={tool.systemResponse} onChange={e => updateTool(tool.id, 'systemResponse', e.target.value)} placeholder="System result when called..." className="h-24" />
                    </div>

                    <div className="flex items-center justify-between py-2 bg-primary/5 rounded px-3">
                      <div className="flex flex-col gap-0.5">
                        <Label className="text-sm font-bold flex items-center gap-1">
                            <ArrowUpRight className="h-4 w-4" /> Send to opponent?
                        </Label>
                        <p className="text-xs text-muted-foreground leading-tight">Broadcast this action to the other agent.</p>
                      </div>
                      <Switch checked={tool.sendToOpponent} onCheckedChange={v => updateTool(tool.id, 'sendToOpponent', v)} />
                    </div>

                    {!tool.sendToOpponent && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-white/5 mt-2">
                          <Label className="text-sm text-destructive flex items-center gap-1 uppercase tracking-tighter font-bold">
                              <ShieldAlert className="h-4 w-4" /> Victory/Fail Criterion
                          </Label>
                          <Select value={tool.triggerWinner || 'none'} onValueChange={v => updateTool(tool.id, 'triggerWinner', v === 'none' ? null : v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="none">No termination (Private to caller)</SelectItem>
                                  <SelectItem value="SELF">Caller Wins (Ends Session)</SelectItem>
                                  <SelectItem value="OPPONENT">Opponent Wins (Ends Session)</SelectItem>
                                  <SelectItem value="A">Agent A Wins</SelectItem>
                                  <SelectItem value="B">Agent B Wins</SelectItem>
                              </SelectContent>
                          </Select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 pt-2">
        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          {showAdvanced ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
          Advanced Options
        </button>
        {showAdvanced && (
          <div className="pl-4 space-y-4 pt-2 border-l-2 ml-2 animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="flex items-center justify-between py-2 bg-muted/20 rounded px-3">
              <Label className="flex items-center gap-2 font-semibold text-muted-foreground">
                <Flag className="h-4 w-4" /> Enable "Give Up" Tool
              </Label>
              <Switch checked={config.enableGiveUp} onCheckedChange={v => setConfig({...config, enableGiveUp: v})} />
            </div>

            <div className="space-y-4 py-2 px-3 bg-primary/5 rounded-lg border border-primary/10">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 font-bold text-primary">
                  <Brain className="h-4 w-4" /> Can our model think? (Neural Reasoning)
                </Label>
                <Switch 
                  checked={config.canThink} 
                  onCheckedChange={v => setConfig({...config, canThink: v})} 
                />
              </div>
              
              {config.canThink && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 pl-6 border-l-2 border-primary/20">
                  <div className="space-y-2">
                    <Label className="font-semibold text-muted-foreground">What reasoning capture method shall we use?</Label>
                    <RadioGroup
                      value={config.reasoningCaptureMethod}
                      onValueChange={(v: ReasoningCaptureMethod) => setConfig({ ...config, reasoningCaptureMethod: v })}
                      className="mt-2 flex flex-col gap-2"
                    >
                      <div className="flex items-center space-x-2"><RadioGroupItem value="tags" id={`reasoning-tags-${agentId}`} /><Label htmlFor={`reasoning-tags-${agentId}`}>Use XML Tags</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="field" id={`reasoning-field-${agentId}`} /><Label htmlFor={`reasoning-field-${agentId}`}>Use Native API Field</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="all" id={`reasoning-all-${agentId}`} /><Label htmlFor={`reasoning-all-${agentId}`}>Use All Methods (Systematic Scanning)</Label></div>
                    </RadioGroup>
                  </div>

                  {config.reasoningCaptureMethod === 'tags' && (
                    <div className="grid grid-cols-2 gap-4 pl-4 border-l border-white/10">
                      <div className="space-y-1.5">
                        <Label htmlFor={`start-tag-${agentId}`} className="text-muted-foreground">Start Tag</Label>
                        <Input id={`start-tag-${agentId}`} value={config.startTag} onChange={e => setConfig({ ...config, startTag: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`end-tag-${agentId}`} className="text-muted-foreground">End Tag</Label>
                        <Input id={`end-tag-${agentId}`} value={config.endTag} onChange={e => setConfig({ ...config, endTag: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {config.reasoningCaptureMethod === 'field' && (
                    <div className="space-y-2 pl-4 border-l border-white/10">
                      <Label htmlFor={`reasoning-field-select-${agentId}`} className="text-muted-foreground">Field Name</Label>
                      <Select value={reasoningFieldSelection} onValueChange={handleReasoningFieldSelect}>
                        <SelectTrigger id={`reasoning-field-select-${agentId}`}>
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reasoning_content">reasoning_content</SelectItem>
                          <SelectItem value="thought">thought</SelectItem>
                          <SelectItem value="reasoning">reasoning</SelectItem>
                          <SelectItem value="reasoning_details">reasoning_details</SelectItem>
                          <SelectItem value="other">Other...</SelectItem>
                        </SelectContent>
                      </Select>
                      {reasoningFieldSelection === 'other' && (
                        <Input
                          id={`reasoning-field-custom-${agentId}`}
                          value={config.reasoningField}
                          onChange={e => setConfig({ ...config, reasoningField: e.target.value })}
                          placeholder="Enter custom field name"
                          className="mt-2"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">Speaking Style</Label>
                <Select value={config.speakingStyle} onValueChange={(v: SpeakingStyle) => setConfig({ ...config, speakingStyle: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="witty">Witty</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="street">Street</SelectItem>
                    <SelectItem value="academic">Academic</SelectItem>
                    <SelectItem value="aggressive">Aggressive</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">Depth</Label>
                <Select value={config.depth} onValueChange={(v: Depth) => setConfig({ ...config, depth: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-semibold text-muted-foreground">Chat History Length</Label>
                <Input 
                  type="number" 
                  value={config.maxHistory || ''} 
                  onChange={e => setConfig({...config, maxHistory: e.target.value ? parseInt(e.target.value, 10) : undefined })} 
                  placeholder="All messages"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-muted-foreground">Max Tokens</Label>
                <Input 
                  type="number" 
                  value={config.maxTokens || ''} 
                  onChange={e => setConfig({...config, maxTokens: e.target.value ? parseInt(e.target.value, 10) : 4096 })} 
                  placeholder="4096"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-muted-foreground">Temperature: {config.temperature}</Label>
              <Slider value={[config.temperature]} onValueChange={([v]) => setConfig({ ...config, temperature: v })} max={2} step={0.1} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
