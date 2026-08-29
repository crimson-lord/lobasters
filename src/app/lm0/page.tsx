'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  LLMConnectionConfig,
  LM0Config,
  ReasoningCaptureMethod,
  LM0AgentConfig,
  VirtualFileId,
} from './types';
import { ChevronRight, ChevronLeft, Plus, Trash2, ChevronDown, File, X, Loader2, CircleAlert, Brain } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollArea } from "@/components/ui/scroll-area";
import { constructSystemPrompt, constructTurnPrompt, TURN_PROMPT_TEMPLATE, MASTER_AGENT_SYSTEM_PROMPT_TEMPLATE } from './utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { manualContent as defaultManualContent } from './manual';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { PageNavigationTools } from '@/components/webmcp/page-navigation-tools';
import { LabSetupTools } from '@/components/webmcp/lab-setup-tools';


export const dynamic = 'force-dynamic';

type SessionStep = 'master-agent' | 'environment' | 'challenges' | 'review';
type PromptMode = 'template' | 'custom';
type QuestionSource = 'agent' | 'user';

const initialMasterAgentConfig: LM0Config['masterAgent'] = {
  modelName: '',
  baseURL: '',
  apiKey: '',
  temperature: 0.7,
  systemPrompt: '',
  canThink: false,
  reasoningCaptureMethod: 'none',
  reasoningField: 'reasoning_content',
  startTag: '<thinking>',
  endTag: '</thinking>',
  maxHistory: undefined,
};

const initialLlmConnectionConfig: Omit<LLMConnectionConfig, 'id'> = {
  nickname: '',
  modelName: '',
  baseURL: '',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: 'You are a helpful assistant. Respond directly to the user\'s request.',
  canThink: false,
  reasoningCaptureMethod: 'none',
  reasoningField: 'reasoning_content',
  startTag: '<thinking>',
  endTag: '</thinking>',
  maxHistory: undefined,
};

const initialAllowedFiles: VirtualFileId[] = [
  'diary.md',
  'pre-answer.md',
  'final-answer.md',
  'manual.md',
];


export default function LM0Page() {
  const [step, setStep] = useState<SessionStep>('master-agent');
  const [promptMode, setPromptMode] = useState<PromptMode>('template');
  const [masterAgentConfig, setMasterAgentConfig] = useState(initialMasterAgentConfig);
  const [llmConnections, setLlmConnections] = useState<LLMConnectionConfig[]>([]);
  const [challengeCount, setChallengeCount] = useState(5);
  const [questionSource, setQuestionSource] = useState<QuestionSource>('agent');
  const [questionBankContent, setQuestionBankContent] = useState('');
  const [manualContent, setManualContent] = useState(defaultManualContent);
  const [allowHelperAgents, setAllowHelperAgents] = useState(true);
  const [allowedFiles, setAllowedFiles] = useState<VirtualFileId[]>(initialAllowedFiles);
  const [useCustomPrompts, setUseCustomPrompts] = useState(false);
  const [systemPromptTemplate, setSystemPromptTemplate] = useState(MASTER_AGENT_SYSTEM_PROMPT_TEMPLATE);
  const [turnPromptTemplate, setTurnPromptTemplate] = useState(TURN_PROMPT_TEMPLATE);
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);


  const fullConfig: LM0Config = {
    challengeCount,
    masterAgent: masterAgentConfig,
    llmConnections: allowHelperAgents ? llmConnections : [],
    questionSource,
    questionBankContent: questionSource === 'user' ? questionBankContent : '',
    manualContent: allowedFiles.includes('manual.md') ? manualContent : '',
    allowHelperAgents,
    allowedFiles,
    useCustomPrompts,
    systemPromptTemplate,
    turnPromptTemplate,
  };

  const startSessionWithConfiguration = async (sourceConfig: LM0Config, sourcePromptMode: PromptMode) => {
    setIsStarting(true);
    setStartError(null);

    const coherentConfig: LM0Config = {
      ...sourceConfig,
      useCustomPrompts: sourcePromptMode === 'custom',
    };
    const finalConfig: LM0Config = {
      ...coherentConfig,
      masterAgent: {
        ...coherentConfig.masterAgent,
        systemPrompt: sourcePromptMode === 'template'
          ? constructSystemPrompt(coherentConfig)
          : coherentConfig.masterAgent.systemPrompt,
      }
    };
    
    try {
        sessionStorage.setItem('lm0_config', JSON.stringify(finalConfig));
        router.push('/lm0/session');

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStartError(`Failed to start session. ${message}`);
        throw error;
    } finally {
        setIsStarting(false);
    }
  };

  const handleStartSession = async () => {
    try {
      await startSessionWithConfiguration(fullConfig, promptMode);
    } catch {
      // The researcher-facing review displays startError inline.
    }
  };

  const setCoherentPromptMode = (mode: PromptMode) => {
    setPromptMode(mode);
    setUseCustomPrompts(mode === 'custom');
  };

  const applyWebMcpConfiguration = (config: LM0Config, mode: PromptMode) => {
    setMasterAgentConfig(config.masterAgent);
    setLlmConnections(config.llmConnections);
    setChallengeCount(config.challengeCount);
    setQuestionSource(config.questionSource);
    setQuestionBankContent(config.questionBankContent);
    setManualContent(config.manualContent);
    setAllowHelperAgents(config.allowHelperAgents);
    setAllowedFiles(config.allowedFiles);
    setSystemPromptTemplate(config.systemPromptTemplate);
    setTurnPromptTemplate(config.turnPromptTemplate);
    setCoherentPromptMode(mode);
    setStartError(null);
  };

  const renderConfigSteps = () => {
      switch (step) {
        case 'master-agent':
          return <MasterAgentConfigStep
            config={masterAgentConfig}
            setConfig={setMasterAgentConfig}
            onNext={() => setStep('environment')}
          />
        case 'environment':
            return <EnvironmentStep
                llmConnections={llmConnections}
                addConnection={addLlmConnection}
                updateConnection={updateLlmConnection}
                removeConnection={removeLlmConnection}
                questionSource={questionSource}
                setQuestionSource={setQuestionSource}
                questionBankContent={questionBankContent}
                setQuestionBankContent={setQuestionBankContent}
                allowHelperAgents={allowHelperAgents}
                setAllowHelperAgents={setAllowHelperAgents}
                allowedFiles={allowedFiles}
                setAllowedFiles={setAllowedFiles}
                manualContent={manualContent}
                setManualContent={setManualContent}
                onBack={() => setStep('master-agent')}
                onNext={() => setStep(questionSource === 'agent' ? 'challenges' : 'review')}
            />
        case 'challenges':
          return <ChallengesStep
            count={challengeCount}
            setChallengeCount={setChallengeCount}
            onBack={() => setStep('environment')}
            onNext={() => setStep('review')}
          />
         case 'review':
          return <ReviewStep
            config={fullConfig}
            masterAgentConfig={masterAgentConfig}
            setMasterAgentConfig={setMasterAgentConfig}
            promptMode={promptMode}
            setPromptMode={setCoherentPromptMode}
            onBack={() => setStep(questionSource === 'agent' ? 'challenges' : 'environment')}
            onStart={handleStartSession}
            isStarting={isStarting}
            startError={startError}
            setStartError={setStartError}
          />
        default:
          return null;
      }
  }
  
  const addLlmConnection = () => {
    const newId = `llm-${llmConnections.length + 1}`;
    setLlmConnections([...llmConnections, { ...initialLlmConnectionConfig, id: newId, nickname: `LLM ${llmConnections.length + 1}` }]);
  };

  const updateLlmConnection = (id: string, newConfig: LLMConnectionConfig) => {
    setLlmConnections(llmConnections.map(conn => conn.id === id ? newConfig : conn));
  };

  const removeLlmConnection = (id: string) => {
    setLlmConnections(llmConnections.filter(conn => conn.id !== id));
  };

  return (
    <div className="h-screen max-h-screen w-full flex flex-col text-foreground overflow-hidden">
       <PageNavigationTools page="lab" />
       <LabSetupTools
         step={step}
         config={fullConfig}
         promptMode={promptMode}
         applyConfiguration={applyWebMcpConfiguration}
         openReview={() => setStep('review')}
         startSession={startSessionWithConfiguration}
       />
       <ScrollArea className="h-full w-full">
            <div className="p-4 md:p-8">
                {renderConfigSteps()}
            </div>
        </ScrollArea>
    </div>
  );
}


// ###################################
// #### CONFIGURATION STEP COMPONENTS
// ###################################

interface MasterAgentConfigStepProps {
  config: LM0Config['masterAgent'];
  setConfig: React.Dispatch<React.SetStateAction<LM0Config['masterAgent']>>;
  onNext: () => void;
}

function MasterAgentConfigStep({ config, setConfig, onNext }: MasterAgentConfigStepProps) {
  return (
    <Card className="max-w-3xl mx-auto animate-fade-in-up">
      <CardHeader>
        <CardTitle>Step 1: Configure Master Agent</CardTitle>
        <CardDescription>
          This is the primary agent that will orchestrate the session and use other LLMs as tools.
        </CardDescription>
        <p className="text-xs text-yellow-500 pt-2">warning!! refreshing the page will remove your data.</p>
      </CardHeader>
      <CardContent>
         <AgentConfigForm agentConfig={config} setAgentConfig={setConfig} isMaster={true} />
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button size="lg" onClick={onNext}>Next: Session Environment <ChevronRight className="ml-2 h-4 w-4" /></Button>
      </CardFooter>
    </Card>
  );
}

interface EnvironmentStepProps {
    llmConnections: LLMConnectionConfig[];
    addConnection: () => void;
    updateConnection: (id: string, newConfig: LLMConnectionConfig) => void;
    removeConnection: (id: string) => void;
    questionSource: QuestionSource;
    setQuestionSource: (source: QuestionSource) => void;
    questionBankContent: string;
    setQuestionBankContent: (content: string) => void;
    allowHelperAgents: boolean;
    setAllowHelperAgents: (allow: boolean) => void;
    allowedFiles: VirtualFileId[];
    setAllowedFiles: React.Dispatch<React.SetStateAction<VirtualFileId[]>>;
    manualContent: string;
    setManualContent: (content: string) => void;
    onBack: () => void;
    onNext: () => void;
}

function EnvironmentStep({
    llmConnections, addConnection, updateConnection, removeConnection,
    questionSource, setQuestionSource, questionBankContent, setQuestionBankContent,
    allowHelperAgents, setAllowHelperAgents,
    allowedFiles, setAllowedFiles,
    manualContent, setManualContent,
    onBack, onNext
}: EnvironmentStepProps) {
    const [newFileName, setNewFileName] = useState('');

    const handleAddFile = () => {
        if (newFileName && !allowedFiles.includes(newFileName) && allowedFiles.length < 6) {
            let fileName = newFileName.trim();
            if (!fileName.endsWith('.md')) {
                fileName += '.md';
            }
            if (!/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
                alert("Invalid file name. Only alphanumeric characters, dashes, underscores, and periods are allowed.");
                return;
            }
            setAllowedFiles([...allowedFiles, fileName]);
            setNewFileName('');
        }
    };

    const handleRemoveFile = (fileToRemove: string) => {
        if (allowedFiles.length <= 2) {
            // Prevent removing if it would go below the minimum
            alert("A minimum of 2 files is required.");
            return;
        }
        setAllowedFiles(allowedFiles.filter(f => f !== fileToRemove));
    };

    const isManualAllowed = allowedFiles.includes('manual.md');

    const handleManualAllowanceChange = (checked: boolean) => {
        if (checked) {
            if (!allowedFiles.includes('manual.md')) {
                 setAllowedFiles([...allowedFiles, 'manual.md']);
            }
            setManualContent(defaultManualContent);
        } else {
            if (allowedFiles.length > 2) {
                 setAllowedFiles(allowedFiles.filter(f => f !== 'manual.md'));
            } else {
                alert("Cannot remove manual when only 2 files are left.");
            }
        }
    }


    return (
        <Card className="max-w-6xl mx-auto animate-fade-in-up">
            <CardHeader>
                <CardTitle>Step 2: Configure Session Environment</CardTitle>
                <CardDescription>Customize the agent's tasks and tools for this session.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
                {/* Question Source */}
                <div>
                    <h3 className="text-lg font-semibold">Question Source</h3>
                    <p className="text-sm text-muted-foreground mb-2">How will the challenges be defined?</p>
                    <RadioGroup value={questionSource} onValueChange={(v) => setQuestionSource(v as QuestionSource)} className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Label htmlFor="q-agent" className="flex flex-col items-start gap-2 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 has-[input:checked]:border-primary">
                             <div className="flex items-center gap-2">
                                <RadioGroupItem value="agent" id="q-agent" />
                                <span className="font-semibold">Agent Generates Questions</span>
                            </div>
                            <p className="text-xs text-muted-foreground ml-6">The Master Agent will create its own challenges based on the number you specify in the next step.</p>
                        </Label>
                        <Label htmlFor="q-user" className="flex flex-col items-start gap-2 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 has-[input:checked]:border-primary">
                            <div className="flex items-center gap-2">
                                <RadioGroupItem value="user" id="q-user" />
                                <span className="font-semibold">I Will Provide the Questions</span>
                            </div>
                            <p className="text-xs text-muted-foreground ml-6">Provide the full content for `question-bank.md`. The agent will use this as its list of challenges.</p>
                        </Label>
                    </RadioGroup>
                    {questionSource === 'user' && (
                        <div className="mt-4 animate-accordion-down">
                            <Label htmlFor="question-bank-input">question-bank.md Content</Label>
                            <Textarea 
                                id="question-bank-input"
                                value={questionBankContent}
                                onChange={(e) => setQuestionBankContent(e.target.value)}
                                placeholder="# Question Bank
- Challenge 1: What is the 1729 taxicab number?
- Challenge 2: Write a python script to reverse a string."
                                className="mt-2 h-48 font-mono text-xs"
                            />
                        </div>
                    )}
                </div>

                <Separator />
                
                {/* File Allowance */}
                 <div>
                    <h3 className="text-lg font-semibold">Virtual Filesystem</h3>
                    <p className="text-sm text-muted-foreground mb-4">Define the virtual files the agent can read and write to. (Min 2, Max 6)</p>
                    
                    <div className="space-y-2">
                        <AnimatePresence>
                        {allowedFiles.map(file => (
                           <motion.div
                             key={file}
                             layout
                             initial={{ opacity: 0, x: -20 }}
                             animate={{ opacity: 1, x: 0 }}
                             exit={{ opacity: 0, x: 20 }}
                             transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                             className="flex items-center justify-between p-3 border rounded-lg bg-muted/20"
                           >
                            <div className="flex items-center gap-2">
                                <File className="h-4 w-4 text-muted-foreground" />
                                <span className="font-mono text-sm">{file}</span>
                                {file === 'manual.md' && <span className="text-xs text-muted-foreground">(Read-Only)</span>}
                            </div>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => handleRemoveFile(file)}
                                            disabled={allowedFiles.length <= 2}
                                            className={cn("h-6 w-6", { "cursor-not-allowed": allowedFiles.length <= 2 })}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    {allowedFiles.length <= 2 && <TooltipContent><p>A minimum of 2 files is required.</p></TooltipContent>}
                                </Tooltip>
                            </TooltipProvider>
                           </motion.div>
                        ))}
                        </AnimatePresence>
                    </div>

                    {allowedFiles.length < 6 && (
                        <div className="flex items-center gap-2 mt-4">
                            <Input 
                                placeholder="new-file-name.md"
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddFile()}
                            />
                            <Button onClick={handleAddFile}>
                                <Plus className="h-4 w-4 mr-2" /> Add File
                            </Button>
                        </div>
                    )}

                    <div className="flex flex-row items-center justify-between rounded-lg border p-4 mt-4">
                        <div className="space-y-0.5">
                            <Label htmlFor="allow-manual" className="font-semibold">Include Agent Manual</Label>
                            <p className="text-xs text-muted-foreground">Adds `manual.md` to the filesystem and populates it with default instructions.</p>
                        </div>
                        <Switch id="allow-manual" checked={isManualAllowed} onCheckedChange={handleManualAllowanceChange} />
                    </div>

                    {isManualAllowed && (
                        <div className="mt-4 animate-accordion-down">
                            <Label htmlFor="manual-content-input">Manual Content (`manual.md`)</Label>
                            <Textarea 
                                id="manual-content-input"
                                value={manualContent}
                                onChange={(e) => setManualContent(e.target.value)}
                                placeholder="Edit the agent's operating manual here."
                                className="mt-2 h-32 font-mono text-xs"
                            />
                        </div>
                    )}
                </div>

                <Separator />

                {/* Helper Agents */}
                <div>
                    <h3 className="text-lg font-semibold">Agent Assistance</h3>
                    <p className="text-sm text-muted-foreground mb-2">Can the Master Agent use other LLMs as tools?</p>
                     <RadioGroup 
                        value={allowHelperAgents ? 'yes' : 'no'} 
                        onValueChange={(v) => setAllowHelperAgents(v === 'yes')} 
                        className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                        <Label htmlFor="helpers-yes" className="flex flex-col items-start gap-2 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 has-[input:checked]:border-primary">
                             <div className="flex items-center gap-2">
                                <RadioGroupItem value="yes" id="helpers-yes" />
                                <span className="font-semibold">Enable Helper Agents</span>
                            </div>
                            <p className="text-xs text-muted-foreground ml-6">Configure one or more subordinate LLMs that the Master Agent can call as tools for verification, brainstorming, etc.</p>
                        </Label>
                        <Label htmlFor="helpers-no" className="flex flex-col items-start gap-2 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 has-[input:checked]:border-primary">
                             <div className="flex items-center gap-2">
                                <RadioGroupItem value="no" id="helpers-no" />
                                <span className="font-semibold">Master Agent Works Alone</span>
                            </div>
                            <p className="text-xs text-muted-foreground ml-6">The Master Agent will solve all challenges by itself without assistance from other models.</p>
                        </Label>
                    </RadioGroup>

                    {allowHelperAgents && (
                        <div className="mt-4 space-y-4 animate-accordion-down">
                            <h4 className="font-semibold text-muted-foreground">Helper Agent Configurations</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <AnimatePresence>
                                {llmConnections.map((conn) => (
                                    <motion.div
                                    key={conn.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    >
                                    <AgentConfigForm agentConfig={conn} setAgentConfig={(newConfig) => updateConnection(conn.id, newConfig as LLMConnectionConfig)} onRemove={() => removeConnection(conn.id)} isMaster={false} />
                                    </motion.div>
                                ))}
                                </AnimatePresence>
                                <div
                                    onClick={addConnection}
                                    className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 hover:border-primary transition-colors"
                                >
                                    <Plus className="h-10 w-10 text-muted-foreground" />
                                    <p className="mt-2 text-muted-foreground">Add Helper Agent</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
            <CardFooter className="flex justify-between">
                <Button variant="outline" size="lg" onClick={onBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back: Master Agent</Button>
                <Button size="lg" onClick={onNext}>
                    {questionSource === 'agent' ? 'Next: Challenges' : 'Next: Review Prompt'}
                    <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </CardFooter>
        </Card>
    );
}

const LM0_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
type LM0ApiFormat = 'openai' | 'gemini';

interface AgentConfigFormProps {
  agentConfig: LM0AgentConfig | LLMConnectionConfig;
  setAgentConfig: (config: LM0AgentConfig | LLMConnectionConfig) => void;
  onRemove?: () => void;
  isMaster: boolean;
}

function AgentConfigForm({ agentConfig, setAgentConfig, onRemove, isMaster }: AgentConfigFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiFormat, setApiFormat] = useState<LM0ApiFormat>('openai');
  const [reasoningFieldSelection, setReasoningFieldSelection] = useState(() => {
    const knownFields = ['reasoning_content', 'thought', 'reasoning', 'reasoning_details'];
    return knownFields.includes(agentConfig.reasoningField) ? agentConfig.reasoningField : 'other';
  });

  const handleReasoningFieldSelect = (value: string) => {
    setReasoningFieldSelection(value);
    if (value !== 'other') {
      setAgentConfig({ ...agentConfig, reasoningField: value });
    }
  };

  const handleApiFormatChange = (value: LM0ApiFormat) => {
    setApiFormat(value);
    if (value === 'gemini') {
      setAgentConfig({ ...agentConfig, baseURL: LM0_GEMINI_BASE_URL });
    }
  };
  
  const id = isMaster ? 'master' : (agentConfig as LLMConnectionConfig).id;

  return (
    <div className="p-4 border rounded-lg space-y-3 relative">
      {onRemove && (
        <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 opacity-50 hover:opacity-100" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
       {!isMaster && (
        <div>
          <Label htmlFor={`nickname-${id}`}>Nickname</Label>
          <Input id={`nickname-${id}`} value={(agentConfig as LLMConnectionConfig).nickname} onChange={e => setAgentConfig({ ...agentConfig, nickname: e.target.value })} />
        </div>
      )}
       <div>
        <Label htmlFor={`model-name-${id}`}>Model Name</Label>
        <Input id={`model-name-${id}`} value={agentConfig.modelName} onChange={e => setAgentConfig({ ...agentConfig, modelName: e.target.value })} placeholder={isMaster ? "e.g., gpt-4-turbo" : "e.g., claude-3-haiku-20240307"} />
      </div>
      <div>
        <Label htmlFor={`api-format-${id}`}>API Format</Label>
        <Select value={apiFormat} onValueChange={(v) => handleApiFormatChange(v as LM0ApiFormat)}>
          <SelectTrigger id={`api-format-${id}`}>
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI API</SelectItem>
            <SelectItem value="gemini">Gemini API</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={`base-url-${id}`}>Base URL</Label>
        <Input id={`base-url-${id}`} value={agentConfig.baseURL} onChange={e => setAgentConfig({ ...agentConfig, baseURL: e.target.value })} placeholder={apiFormat === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : ''} />
      </div>
      <div>
        <Label htmlFor={`api-key-${id}`}>{apiFormat === 'gemini' ? 'Gemini API Key' : 'API Key'}</Label>
        <Input id={`api-key-${id}`} type="password" value={agentConfig.apiKey} onChange={e => setAgentConfig({ ...agentConfig, apiKey: e.target.value })} placeholder={apiFormat === 'gemini' ? 'AIza...' : ''} />
      </div>
      <div>
        <Label>Temperature: {agentConfig.temperature}</Label>
        <Slider value={[agentConfig.temperature]} onValueChange={([v]) => setAgentConfig({ ...agentConfig, temperature: v })} max={2} step={0.1} />
      </div>
      {!isMaster && (
        <div>
          <Label htmlFor={`system-prompt-${id}`}>System Prompt</Label>
          <Textarea
            id={`system-prompt-${id}`}
            value={agentConfig.systemPrompt}
            onChange={e => setAgentConfig({ ...agentConfig, systemPrompt: e.target.value })}
            className="h-24 text-xs"
          />
        </div>
      )}
      {/* Advanced Options */}
      <div className="space-y-2 !mt-4">
        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          {showAdvanced ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
          Advanced Options
        </button>
        {showAdvanced && (
          <div className="pl-2 space-y-4 pt-2 border-l-2 ml-2 animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="space-y-4 py-2 px-3 bg-primary/5 rounded-lg border border-primary/10">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 font-bold text-primary">
                  <Brain className="h-4 w-4" /> Can our model think? (Neural Reasoning)
                </Label>
                <Switch 
                  checked={agentConfig.canThink} 
                  onCheckedChange={v => setAgentConfig({...agentConfig, canThink: v})} 
                />
              </div>
              
              {agentConfig.canThink && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 pl-6 border-l-2 border-primary/20">
                  <div className="space-y-2">
                    <Label className="font-semibold text-muted-foreground">What reasoning capture method shall we use?</Label>
                    <RadioGroup
                      value={agentConfig.reasoningCaptureMethod}
                      onValueChange={(v: ReasoningCaptureMethod) => setAgentConfig({ ...agentConfig, reasoningCaptureMethod: v })}
                      className="mt-2 flex flex-col gap-2"
                    >
                      <div className="flex items-center space-x-2"><RadioGroupItem value="tags" id={`reasoning-tags-${id}`} /><Label htmlFor={`reasoning-tags-${id}`}>Use XML Tags</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="field" id={`reasoning-field-${id}`} /><Label htmlFor={`reasoning-field-${id}`}>Use Native API Field</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="all" id={`reasoning-all-${id}`} /><Label htmlFor={`reasoning-all-${id}`}>Use All Methods (Systematic Scanning)</Label></div>
                    </RadioGroup>
                  </div>
                  {agentConfig.reasoningCaptureMethod === 'tags' && (
                    <div className="grid grid-cols-2 gap-4 pl-4 border-l">
                      <div>
                        <Label htmlFor={`start-tag-${id}`}>Start Tag</Label>
                        <Input id={`start-tag-${id}`} value={agentConfig.startTag} onChange={e => setAgentConfig({ ...agentConfig, startTag: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor={`end-tag-${id}`}>End Tag</Label>
                        <Input id={`end-tag-${id}`} value={agentConfig.endTag} onChange={e => setAgentConfig({ ...agentConfig, endTag: e.target.value })} />
                      </div>
                    </div>
                  )}
                  {agentConfig.reasoningCaptureMethod === 'field' && (
                    <div className="space-y-2 pl-4 border-l">
                      <Label htmlFor={`reasoning-field-select-${id}`}>Field Name</Label>
                      <Select value={reasoningFieldSelection} onValueChange={handleReasoningFieldSelect}>
                        <SelectTrigger id={`reasoning-field-select-${id}`}>
                          <SelectValue placeholder="Select a field or choose other" />
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
                          id={`reasoning-field-custom-${id}`}
                          value={agentConfig.reasoningField}
                          onChange={e => setAgentConfig({ ...agentConfig, reasoningField: e.target.value })}
                          placeholder="Enter custom field name"
                          className="mt-2"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
             <div>
              <Label>Chat History Length</Label>
              <Input 
                type="number" 
                value={agentConfig.maxHistory || ''} 
                onChange={e => setAgentConfig({...agentConfig, maxHistory: e.target.value ? parseInt(e.target.value, 10) : undefined })} 
                placeholder="All messages" 
              />
            </div>
             {!isMaster && (
              <div>
                <Label>Max Tokens</Label>
                <Input type="number" value={(agentConfig as LLMConnectionConfig).maxTokens || ''} onChange={e => setAgentConfig({ ...agentConfig, maxTokens: e.target.value ? parseInt(e.target.value, 10) : 4096 })} placeholder="e.g., 4096" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ChallengesStepProps {
  count: number;
  setChallengeCount: (count: number) => void;
  onBack: () => void;
  onNext: () => void;
}

function ChallengesStep({ count, setChallengeCount, onBack, onNext }: ChallengesStepProps) {
  return (
    <Card className="max-w-2xl mx-auto animate-fade-in-up">
      <CardHeader>
        <CardTitle>Step 3: Define Challenges</CardTitle>
        <CardDescription>
          How many challenges should the agent attempt to solve in this session?
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Label htmlFor="challenge-count">Number of Challenges</Label>
        <Input id="challenge-count" type="number" value={count} onChange={e => setChallengeCount(parseInt(e.target.value, 10) || 1)} min={1} max={100} />
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" size="lg" onClick={onBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back: Environment</Button>
        <Button size="lg" onClick={onNext}>Next: Review Prompt <ChevronRight className="ml-2 h-4 w-4" /></Button>
      </CardFooter>
    </Card>
  );
}

interface ReviewStepProps {
  config: LM0Config;
  masterAgentConfig: LM0Config['masterAgent'];
  setMasterAgentConfig: React.Dispatch<React.SetStateAction<LM0Config['masterAgent']>>;
  promptMode: PromptMode;
  setPromptMode: (mode: PromptMode) => void;
  onBack: () => void;
  onStart: () => Promise<void>;
  isStarting: boolean;
  startError: string | null;
  setStartError: (error: string | null) => void;
}

function ReviewStep({ config, masterAgentConfig, setMasterAgentConfig, promptMode, setPromptMode, onBack, onStart, isStarting, startError, setStartError }: ReviewStepProps) {
  const generatedPrompt = constructSystemPrompt(config);

  useEffect(() => {
    if (promptMode === 'template') {
      setMasterAgentConfig(prev => ({ ...prev, systemPrompt: generatedPrompt }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedPrompt, promptMode]);

  return (
    <Card className="max-w-4xl mx-auto animate-fade-in-up">
      <CardHeader>
        <CardTitle>Step {config.questionSource === 'agent' ? 4 : 3}: Review System Prompt</CardTitle>
        <CardDescription>
          This is the final instruction that will be given to the Master Agent. You can use the template or provide your own custom prompt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={promptMode} onValueChange={(v: PromptMode) => setPromptMode(v)} className="my-2 flex space-x-4">
          <div className="flex items-center space-x-2"><RadioGroupItem value="template" id="template" /><Label htmlFor="template">Use Template</Label></div>
          <div className="flex items-center space-x-2"><RadioGroupItem value="custom" id="custom" /><Label htmlFor="custom">Custom</Label></div>
        </RadioGroup>
        <Textarea
          id="system-prompt-master"
          value={masterAgentConfig.systemPrompt}
          onChange={(e) => setMasterAgentConfig({ ...masterAgentConfig, systemPrompt: e.target.value })}
          className="mt-2 h-96 font-mono text-xs"
          disabled={promptMode === 'template'}
        />
        {startError && (
            <Alert variant="destructive" className="mt-4">
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
            Start Session
        </Button>
      </CardFooter>
    </Card>
  );
}
