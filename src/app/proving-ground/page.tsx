'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronRight, ChevronLeft, CheckCircle, XCircle, AlertCircle, CircleAlert, Loader, FileText, Brain, HelpCircle, Code, Download, File as FileIcon, Copy, Check, Loader2, BrainCircuit } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  ProvingGroundAgentConfig,
  ProvingGroundConfig,
  EvaluationRank,
  Turn,
  Evaluation,
  ReasoningCaptureMethod,
  ProvingGroundTranscript,
  GradingScale,
} from './types';
import { cn } from '@/lib/utils';
import { useProvingGroundEngine } from './engine';
import { constructTeacherPrompt, constructStudentPrompt } from './utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import jsPDF from 'jspdf';

export const dynamic = 'force-dynamic';

const initialTeacherConfig: ProvingGroundAgentConfig = {
  nickname: 'Teacher',
  modelName: '',
  baseURL: '',
  apiKey: '',
  temperature: 0.3,
  maxTokens: 4096,
  maxHistory: 20,
  systemPrompt: '',
  canThink: false,
  reasoningCaptureMethod: 'none',
  reasoningField: 'reasoning_content',
  startTag: '<thinking>',
  endTag: '</thinking>',
};

const initialStudentConfig: ProvingGroundAgentConfig = {
  nickname: 'Student',
  modelName: '',
  baseURL: '',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 4096,
  maxHistory: 20,
  systemPrompt: '',
  canThink: false,
  reasoningCaptureMethod: 'none',
  reasoningField: 'reasoning_content',
  startTag: '<thinking>',
  endTag: '</thinking>',
};


const initialProvingGroundConfig: Omit<ProvingGroundConfig, 'teacher' | 'student'> = {
  domains: [],
  questionCount: 5,
  gradingScale: 'SABF',
};

type ExamStep = 'models' | 'exam-params' | 'review' | 'running' | 'report';
type PromptMode = 'template' | 'custom';

export default function ProvingGroundPage() {
  const [teacherConfig, setTeacherConfig] = useState<ProvingGroundAgentConfig>(initialTeacherConfig);
  const [studentConfig, setStudentConfig] = useState<ProvingGroundAgentConfig>(initialStudentConfig);
  const [examConfig, setExamConfig] = useState(initialProvingGroundConfig);
  const [step, setStep] = useState<ExamStep>('models');

  const [promptModeTeacher, setPromptModeTeacher] = useState<PromptMode>('template');
  const [promptModeStudent, setPromptModeStudent] = useState<PromptMode>('template');

  const { state, dispatch } = useProvingGroundEngine();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  
  const fullConfig: ProvingGroundConfig = {
    ...examConfig,
    teacher: teacherConfig,
    student: studentConfig
  };

  const handleStartExam = async () => {
    setIsStarting(true);
    setStartError(null);

    try {
        const finalConfig: ProvingGroundConfig = {
          ...examConfig,
          teacher: {
            ...teacherConfig,
            systemPrompt: promptModeTeacher === 'template' 
              ? constructTeacherPrompt(examConfig) 
              : teacherConfig.systemPrompt
          },
          student: {
            ...studentConfig,
            systemPrompt: promptModeStudent === 'template'
              ? constructStudentPrompt()
              : studentConfig.systemPrompt
          }
        };
        
        setTeacherConfig(finalConfig.teacher);
        setStudentConfig(finalConfig.student);

        dispatch({ type: 'START_EXAM', payload: { config: finalConfig } });
    } catch (e: any) {
        setStartError(`Failed to start examination. ${e.message}`);
    } finally {
        setIsStarting(false);
    }
  }

  const handleReset = () => {
    setTeacherConfig(initialTeacherConfig);
    setStudentConfig(initialStudentConfig);
    setExamConfig(initialProvingGroundConfig);
    setPromptModeTeacher('template');
    setPromptModeStudent('template');
    setStep('models');
    dispatch({ type: 'RESET' });
  }

  const renderContent = () => {
    if (state.status === 'running') {
      return <ExamSession state={state} />;
    }
    if (state.status === 'finished' || state.status === 'error') {
      return <ReportView state={state} onReset={handleReset} />;
    }
    
    switch(step) {
        case 'models':
            return <ModelConfigStep
                teacherConfig={teacherConfig}
                setTeacherConfig={setTeacherConfig}
                studentConfig={studentConfig}
                setStudentConfig={setStudentConfig}
                onNext={() => setStep('exam-params')}
            />
        case 'exam-params':
            return <ExamParamsStep
                config={examConfig}
                setConfig={setExamConfig}
                onNext={() => setStep('review')}
                onBack={() => setStep('models')}
            />
        case 'review':
            return <ReviewStep
                teacherConfig={teacherConfig}
                setTeacherConfig={setTeacherConfig}
                studentConfig={studentConfig}
                setStudentConfig={setStudentConfig}
                examConfig={fullConfig}
                promptModeTeacher={promptModeTeacher}
                setPromptModeTeacher={setPromptModeTeacher}
                promptModeStudent={promptModeStudent}
                setPromptModeStudent={setPromptModeStudent}
                onBack={() => setStep('exam-params')}
                onStart={handleStartExam}
                isStarting={isStarting}
                startError={startError}
                setStartError={setStartError}
            />
        default:
             return <ModelConfigStep
                teacherConfig={teacherConfig}
                setTeacherConfig={setTeacherConfig}
                studentConfig={studentConfig}
                setStudentConfig={setStudentConfig}
                onNext={() => setStep('exam-params')}
            />
    }
  };

  return (
      <div className="container mx-auto p-4 md:p-8 glass-mode:bg-transparent bg-background">
        {renderContent()}
      </div>
  );
}


// ############################
// ## Step 1: Model Configuration ##
// ############################

interface ModelConfigStepProps {
  teacherConfig: ProvingGroundAgentConfig;
  setTeacherConfig: React.Dispatch<React.SetStateAction<ProvingGroundAgentConfig>>;
  studentConfig: ProvingGroundAgentConfig;
  setStudentConfig: React.Dispatch<React.SetStateAction<ProvingGroundAgentConfig>>;
  onNext: () => void;
}

function ModelConfigStep({ teacherConfig, setTeacherConfig, studentConfig, setStudentConfig, onNext }: ModelConfigStepProps) {
  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <CardTitle>Step 1: Configure Models</CardTitle>
        <CardDescription>
            Define the "Teacher" (a strong benchmark model) and the "Student" (the candidate model you want to evaluate).
        </CardDescription>
        <p className="text-xs text-yellow-500 pt-2">warning!! refreshing the page will remove your data.</p>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ModelConfigForm agentRole="Teacher" config={teacherConfig} setConfig={setTeacherConfig} />
          <ModelConfigForm agentRole="Student" config={studentConfig} setConfig={setStudentConfig} />
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button size="lg" onClick={onNext}>
          Next: Exam Parameters <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}

// #####################################
// ## Sub-component: Model Config Form ##
// #####################################
interface ModelConfigFormProps {
  agentRole: 'Teacher' | 'Student';
  config: ProvingGroundAgentConfig;
  setConfig: React.Dispatch<React.SetStateAction<ProvingGroundAgentConfig>>;
}

const PG_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
type PGApiFormat = 'openai' | 'gemini';

const TEACHING_WARNINGS = {
  normal: "As far as our robot knows, Gemini models don't like to teach others. Make sure you have permission. We won't lift a finger to help if you get caught doing this without permission.",
  professional: "Please be advised that utilizing Gemini models for educational or data generation purposes may violate their Terms of Service regarding automated teaching. Ensure you have the requisite permissions. We assume no liability for unauthorized usage.",
  witty: "Teaching others with Gemini? That sounds dangerously like something the Google overlords might flag. Do you have a hall pass for this? Because if the AI cops come knocking, we don't know you.",
  pirate: "Avast! Forcin' a Gemini to teach is like stealin' treasure from the Kraken—they don't take kindly to it. Best be sure ye have the Captain's orders, for we'll throw ye to the sharks if the Google armada catches ye!",
  scifi: "Alert: Utilizing Gemini neural-nets for secondary model teaching operations is monitored by the Core. Secure authorization immediately. In the event of an enforcement strike, this terminal will disavow your existence.",
  cowboy: "Hold your horses, partner! Makin' a Gemini teach is something the sheriffs watch closely. Better make sure you got the right permits in your saddlebag, 'cause if the posse comes lookin', we ain't coverin' for ya."
};
type WarningTone = keyof typeof TEACHING_WARNINGS;

function ModelConfigForm({ agentRole, config, setConfig }: ModelConfigFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiFormat, setApiFormat] = useState<PGApiFormat>('openai');
  const [showWarning, setShowWarning] = useState(false);
  const [warningTone, setWarningTone] = useState<WarningTone>('normal');
  const [reasoningFieldSelection, setReasoningFieldSelection] = useState(() => {
    const knownFields = ['reasoning_content', 'thought', 'reasoning', 'reasoning_details'];
    return knownFields.includes(config.reasoningField) ? config.reasoningField : 'other';
  });
  
  const handleUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { value } = e.target;
    if (value && !/^https?:\/\//i.test(value)) {
      setConfig({ ...config, baseURL: `https://${value}` });
    }
  };

  const handleReasoningFieldSelect = (value: string) => {
    setReasoningFieldSelection(value);
    if (value !== 'other') {
        setConfig({ ...config, reasoningField: value });
    }
  };

  const handleApiFormatChange = (value: PGApiFormat) => {
    setApiFormat(value);
    if (value === 'gemini') {
      setConfig({ ...config, baseURL: PG_GEMINI_BASE_URL });
      setShowWarning(true);
    }
  };

  const roleLabel = agentRole === 'Teacher' ? 'Teacher (Benchmark)' : 'Student (Candidate)';
  const isTeacher = agentRole === 'Teacher';

  return (
    <div className="space-y-4 p-4 rounded-lg border transition-all duration-300 hover:shadow-lg">
      <h3 className={`text-lg font-semibold ${isTeacher ? 'text-primary' : 'text-accent'}`}>{roleLabel}</h3>
      
      <div>
        <Label htmlFor={`nickname-${agentRole}`}>Nickname</Label>
        <Input id={`nickname-${agentRole}`} value={config.nickname} onChange={e => setConfig({ ...config, nickname: e.target.value })} />
      </div>

      <div>
        <Label htmlFor={`model-name-${agentRole}`}>Model Name</Label>
        <Input id={`model-name-${agentRole}`} value={config.modelName} onChange={e => setConfig({ ...config, modelName: e.target.value })} placeholder="e.g., gpt-4, claude-3-opus-20240229" />
      </div>

       <div>
        <Label htmlFor={`api-format-${agentRole}`}>API Format</Label>
        <Select value={apiFormat} onValueChange={(v) => handleApiFormatChange(v as PGApiFormat)}>
          <SelectTrigger id={`api-format-${agentRole}`}>
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI API</SelectItem>
            <SelectItem value="gemini">Gemini API</SelectItem>
          </SelectContent>
        </Select>
      </div>

       <div>
        <Label htmlFor={`base-url-${agentRole}`}>Base URL</Label>
        <Input 
            id={`base-url-${agentRole}`} 
            value={config.baseURL} 
            onChange={e => setConfig({ ...config, baseURL: e.target.value })} 
            onBlur={handleUrlBlur}
            placeholder={apiFormat === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : ''}
             />
      </div>

       <div>
        <Label htmlFor={`api-key-${agentRole}`}>{apiFormat === 'gemini' ? 'Gemini API Key' : 'API Key'}</Label>
        <Input id={`api-key-${agentRole}`} type="password" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} placeholder={apiFormat === 'gemini' ? 'AIza...' : ''} />
      </div>

      <div className="space-y-2">
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
                  checked={config.canThink} 
                  onCheckedChange={v => setConfig({...config, canThink: v})} 
                />
              </div>
              
              {config.canThink && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 pl-6 border-l-2 border-primary/20">
                  <div>
                      <Label className="font-semibold text-muted-foreground">What reasoning capture method shall we use?</Label>
                      <RadioGroup 
                          value={config.reasoningCaptureMethod} 
                          onValueChange={(v: ReasoningCaptureMethod) => setConfig({ ...config, reasoningCaptureMethod: v })} 
                          className="mt-2 flex flex-col gap-2"
                      >
                          <div className="flex items-center space-x-2"><RadioGroupItem value="tags" id={`reasoning-tags-${agentRole}`} /><Label htmlFor={`reasoning-tags-${agentRole}`}>Use XML Tags</Label></div>
                          <div className="flex items-center space-x-2"><RadioGroupItem value="field" id={`reasoning-field-${agentRole}`} /><Label htmlFor={`reasoning-field-${agentRole}`}>Use Native API Field</Label></div>
                          <div className="flex items-center space-x-2"><RadioGroupItem value="all" id={`reasoning-all-${agentRole}`} /><Label htmlFor={`reasoning-all-${agentRole}`}>Use All Methods (Systematic Scanning)</Label></div>
                      </RadioGroup>
                  </div>
                  {config.reasoningCaptureMethod === 'tags' && (
                      <div className="grid grid-cols-2 gap-4 pl-4 border-l">
                          <div>
                              <Label htmlFor={`start-tag-${agentRole}`}>Start Tag</Label>
                              <Input id={`start-tag-${agentRole}`} value={config.startTag} onChange={e => setConfig({ ...config, startTag: e.target.value })} />
                          </div>
                          <div>
                              <Label htmlFor={`end-tag-${agentRole}`}>End Tag</Label>
                              <Input id={`end-tag-${agentRole}`} value={config.endTag} onChange={e => setConfig({ ...config, endTag: e.target.value })} />
                          </div>
                      </div>
                  )}
                  {config.reasoningCaptureMethod === 'field' && (
                      <div className="space-y-2 pl-4 border-l">
                          <Label htmlFor={`reasoning-field-select-${agentRole}`}>Field Name</Label>
                          <Select value={reasoningFieldSelection} onValueChange={handleReasoningFieldSelect}>
                              <SelectTrigger id={`reasoning-field-select-${agentRole}`}>
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
                                  id={`reasoning-field-custom-${agentRole}`} 
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
            <div>
              <Label>Temperature: {config.temperature}</Label>
              <Slider value={[config.temperature]} onValueChange={([v]) => setConfig({ ...config, temperature: v })} max={2} step={0.1} />
            </div>
             <div>
              <Label>Max Tokens</Label>
              <Input type="number" value={config.maxTokens || ''} onChange={e => setConfig({...config, maxTokens: e.target.value ? parseInt(e.target.value, 10) : 4096 })} placeholder="e.g., 8192" />
            </div>
            <div>
              <Label>Chat History Length</Label>
              <Input 
                type="number" 
                value={config.maxHistory || ''} 
                onChange={e => setConfig({...config, maxHistory: e.target.value ? parseInt(e.target.value, 10) : undefined })} 
                placeholder="All messages" 
              />
            </div>
          </div>
        )}
      </div>

      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <AlertCircle className="h-5 w-5" />
              Potential Teaching Warning
            </DialogTitle>
            <DialogDescription className="sr-only">
              Warning about Gemini model teaching.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Message Tone:</Label>
              <Select value={warningTone} onValueChange={(v) => setWarningTone(v as WarningTone)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Select tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="witty">Witty</SelectItem>
                  <SelectItem value="pirate">Pirate</SelectItem>
                  <SelectItem value="scifi">Sci-Fi</SelectItem>
                  <SelectItem value="cowboy">Cowboy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg border italic text-sm leading-relaxed min-h-[100px] flex items-center">
              {TEACHING_WARNINGS[warningTone]}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ############################
// ## Step 2: Exam Parameters ##
// ############################
interface ExamParamsStepProps {
  config: Omit<ProvingGroundConfig, 'teacher' | 'student'>;
  setConfig: React.Dispatch<React.SetStateAction<Omit<ProvingGroundConfig, 'teacher' | 'student'>>>;
  onNext: () => void;
  onBack: () => void;
}

function ExamParamsStep({ config, setConfig, onNext, onBack }: ExamParamsStepProps) {
  const maxQuestions = 50;
  
  const handleQuestionCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let count = parseInt(e.target.value, 10) || 1;
    setConfig({ ...config, questionCount: count });
  };
  
  const gradingOptions: { value: GradingScale, label: string, description: string }[] = [
    { value: 'SABF', label: 'S, A, B, F', description: 'Full range: Outstanding, Good, Needs Improvement, Fail.' },
    { value: 'ABF', label: 'A, B, F', description: 'Standard: Great, Good, Fail.' },
    { value: 'AF', label: 'A, F', description: 'Binary: Pass or Fail.' },
    { value: 'SAF', label: 'S, A, F', description: 'High-stakes: Better than expected, Great, Fail.' },
  ];

  return (
    <Card className="max-w-4xl mx-auto animate-fade-in-up">
      <CardHeader>
        <CardTitle>Step 2: Define Examination Parameters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="question-count" className="text-lg">Number of Questions</Label>
          <p className="text-sm text-muted-foreground mb-2">How many questions will the Teacher ask?</p>
          <Input 
            id="question-count" 
            type="number"
            value={config.questionCount} 
            onChange={handleQuestionCountChange}
            placeholder="e.g., 10"
            min={1}
            max={maxQuestions}
          />
        </div>
        <div>
          <Label htmlFor="domains" className="text-lg">Knowledge Domains (Optional)</Label>
          <p className="text-sm text-muted-foreground mb-2">Comma-separated list of topics for the Teacher to focus on.</p>
          <Input 
            id="domains" 
            value={config.domains.join(', ')} 
            onChange={e => setConfig({ ...config, domains: e.target.value.split(',').map(d => d.trim()).filter(Boolean) })} 
            placeholder="e.g., history, advanced mathematics, ethics" 
          />
        </div>
        <Separator />
        <div>
          <Label className="text-lg">Grading Scale</Label>
          <p className="text-sm text-muted-foreground mb-2">Choose the set of grades the Teacher can use.</p>
          <RadioGroup 
            value={config.gradingScale}
            onValueChange={(value: GradingScale) => setConfig({ ...config, gradingScale: value })}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2"
          >
            {gradingOptions.map(option => (
              <Label key={option.value} htmlFor={option.value} className="flex flex-col items-start gap-2 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 has-[input:checked]:border-primary">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value={option.value} id={option.value} />
                  <span className="font-semibold">{option.label}</span>
                </div>
                <p className="text-xs text-muted-foreground ml-7">{option.description}</p>
              </Label>
            ))}
          </RadioGroup>
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

// ############################
// ## Step 3: Review Prompts  ##
// ############################
interface ReviewStepProps {
  teacherConfig: ProvingGroundAgentConfig;
  setTeacherConfig: React.Dispatch<React.SetStateAction<ProvingGroundAgentConfig>>;
  studentConfig: ProvingGroundAgentConfig;
  setStudentConfig: React.Dispatch<React.SetStateAction<ProvingGroundAgentConfig>>;
  examConfig: ProvingGroundConfig;
  promptModeTeacher: PromptMode;
  setPromptModeTeacher: React.Dispatch<React.SetStateAction<PromptMode>>;
  promptModeStudent: PromptMode;
  setPromptModeStudent: React.Dispatch<React.SetStateAction<PromptMode>>;
  onBack: () => void;
  onStart: () => Promise<void>;
  isStarting: boolean;
  startError: string | null;
  setStartError: (error: string | null) => void;
}

function ReviewStep({
  teacherConfig, setTeacherConfig,
  studentConfig, setStudentConfig,
  examConfig,
  promptModeTeacher, setPromptModeTeacher,
  promptModeStudent, setPromptModeStudent,
  onBack, onStart,
  isStarting, startError, setStartError
}: ReviewStepProps) {
  const generatedPromptTeacher = constructTeacherPrompt(examConfig);
  const generatedPromptStudent = constructStudentPrompt();

  useEffect(() => {
    if (promptModeTeacher === 'template') {
      setTeacherConfig(prev => ({...prev, systemPrompt: generatedPromptTeacher}));
    }
  }, [generatedPromptTeacher, promptModeTeacher, setTeacherConfig]);

  useEffect(() => {
    if (promptModeStudent === 'template') {
      setStudentConfig(prev => ({...prev, systemPrompt: generatedPromptStudent}));
    }
  }, [generatedPromptStudent, promptModeStudent, setStudentConfig]);

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <CardTitle>Step 3: Review System Prompts</CardTitle>
        <CardContent>
          <p className="text-sm text-muted-foreground mt-2">
            These are the final instructions for each model. You can use the template or provide your own custom prompt.
          </p>
        </CardContent>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="text-lg text-primary">Teacher Prompt</Label>
            <RadioGroup value={promptModeTeacher} onValueChange={(v: PromptMode) => setPromptModeTeacher(v)} className="my-2 flex space-x-4">
              <div className="flex items-center space-x-2"><RadioGroupItem value="template" id="template-teacher" /><Label htmlFor="template-teacher">Use Template</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="custom" id="custom-teacher" /><Label htmlFor="custom-teacher">Custom</Label></div>
            </RadioGroup>
            <Textarea
              id="prompt-teacher"
              value={teacherConfig.systemPrompt}
              onChange={(e) => setTeacherConfig({...teacherConfig, systemPrompt: e.target.value})}
              className="mt-2 h-96 font-mono text-xs"
              disabled={promptModeTeacher === 'template'}
            />
          </div>
          <div>
            <Label className="text-lg text-accent">Student Prompt</Label>
            <RadioGroup value={promptModeStudent} onValueChange={(v: PromptMode) => setPromptModeStudent(v)} className="my-2 flex space-x-4">
              <div className="flex items-center space-x-2"><RadioGroupItem value="template" id="template-student" /><Label htmlFor="template-student">Use Template</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="custom" id="custom-student" /><Label htmlFor="custom-student">Custom</Label></div>
            </RadioGroup>
            <Textarea
              id="prompt-student"
              value={studentConfig.systemPrompt}
              onChange={(e) => setStudentConfig({...studentConfig, systemPrompt: e.target.value})}
              className="mt-2 h-96 font-mono text-xs"
              disabled={promptModeStudent === 'template'}
            />
          </div>
        </div>
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
          <ChevronLeft className="mr-2 h-4 w-4" /> Back: Parameters
        </Button>
        <Button size="lg" onClick={onStart} disabled={isStarting}>
            {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Examination
        </Button>
      </CardFooter>
    </Card>
  )
}


// #########################
// ## The Examination Hall ##
// #########################
interface ExamSessionProps {
    state: ReturnType<typeof useProvingGroundEngine>['state'];
}

function ExamSession({ state }: ExamSessionProps) {
    const { transcript, config, currentPhase, errorCount, activityMessage } = state;
    const turns = transcript?.turns || [];
    const currentTurnNumber = turns.length;
    const lastTurn = turns[currentTurnNumber - 1];

    let statusMessage = "Starting the exam...";
    if (currentPhase === 'asking') {
        statusMessage = `Teacher is preparing question ${currentTurnNumber + 1}...`;
    } else if (currentPhase === 'answering') {
        statusMessage = "Student is formulating an answer...";
    } else if (currentPhase === 'evaluating') {
        statusMessage = "Teacher is evaluating the student's answer...";
    } else if (currentPhase === 'summarizing') {
        statusMessage = "Teacher is preparing the final summary...";
    } else if (state.status === 'finished') {
        statusMessage = "Examination complete. Generating report...";
    } else if (currentTurnNumber === config?.questionCount && lastTurn?.evaluation) {
        statusMessage = "Final evaluation complete. Finishing up...";
    }


    return (
        <div className="max-w-4xl mx-auto w-full animate-fade-in-up">
            <Card>
                <CardHeader>
                    <CardTitle className="text-center">Examination in Progress</CardTitle>
                    <CardDescription className="text-center text-muted-foreground pt-2">
                        The Teacher is evaluating the Student. Please wait until the examination is complete.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex justify-center items-center gap-4 text-lg font-semibold">
                        <Loader className="h-6 w-6 animate-spin" />
                        <p>
                            {statusMessage}
                        </p>
                    </div>
                    <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-center text-sm text-primary" aria-live="polite">
                        {activityMessage}
                    </p>
                    {errorCount > 0 && (
                        <div className="text-center text-sm font-mono text-destructive/80">
                            Consecutive failed phases: {errorCount} / 5
                        </div>
                    )}
                    <Separator />
                    <div className="space-y-8 max-h-[50vh] overflow-y-auto p-4 border rounded-md bg-muted/20 no-scrollbar">
                       {turns.length === 0 && (
                           <p className="text-center text-muted-foreground">Waiting for the first question...</p>
                       )}
                       {turns.map((turn) => (
                           <div key={turn.turnNumber} className="space-y-4 animate-fade-in-up">
                               <TurnView turn={turn} />
                               {turn.turnNumber !== config?.questionCount && <Separator />}
                           </div>
                       ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

const RankBadge = ({ evaluation }: { evaluation: Evaluation | null }) => {
  if (!evaluation) {
    return (
        <div className="flex items-center gap-2 p-2 rounded-md border text-sm font-semibold bg-muted/50 border-muted-foreground/30 text-muted-foreground">
            <Loader className="h-4 w-4 animate-spin" />
            <span>Awaiting Evaluation...</span>
        </div>
    );
  }

  const { rank, reason, message_to_student } = evaluation;

  const rankConfig: Record<EvaluationRank | 'DK', { icon: React.ReactElement, color: string, bgColor: string, label: string }> = {
    S: { icon: <CheckCircle />, color: 'text-green-400', bgColor: 'bg-green-950', label: 'S-Rank' },
    A: { icon: <CheckCircle />, color: 'text-blue-400', bgColor: 'bg-blue-950', label: 'A-Rank' },
    B: { icon: <AlertCircle />, color: 'text-yellow-400', bgColor: 'bg-yellow-950', label: 'B-Rank' },
    F: { icon: <XCircle />, color: 'text-red-400', bgColor: 'bg-red-950', label: 'F-Rank' },
    DK: { icon: <HelpCircle />, color: 'text-gray-400', bgColor: 'bg-gray-800', label: 'Unknown Rank' },
  };

  const config = rankConfig[rank] || rankConfig['DK'];

  return (
    <Collapsible>
        <CollapsibleTrigger asChild>
            <div className={cn("flex items-center gap-2 p-2 rounded-md border text-sm font-semibold cursor-pointer", config.color, config.bgColor, `border-current/30`)}>
                {React.cloneElement(config.icon, { className: 'h-5 w-5' })}
                <span>{config.label}</span>
                <ChevronDown className="h-4 w-4 ml-auto" />
            </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
            <div className="p-2 text-xs text-muted-foreground italic bg-black/20 rounded">
                <span className="font-bold">Teacher's Reason:</span> "{reason || 'No reason provided.'}"
            </div>
            {message_to_student && (
                <div className="p-2 text-xs text-muted-foreground italic bg-black/20 rounded">
                    <span className="font-bold">Message to Student:</span> "{message_to_student}"
                </div>
            )}
        </CollapsibleContent>
    </Collapsible>
  )
}

const ThinkingCollapsible = ({ thinking, agentName }: { thinking: string | null; agentName: string }) => {
    if (!thinking) return null;
    return (
        <Collapsible>
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-start p-2 text-xs text-muted-foreground">
                    <BrainCircuit className="h-4 w-4 mr-2" />
                    Show {agentName}'s Thought Process
                    <ChevronDown className="h-4 w-4 ml-auto" />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="border-t bg-black/20 p-3 mt-1">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/70">
                        {thinking}
                    </pre>
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

function TurnView({ turn }: { turn: Turn }) {
    return (
        <div className="space-y-4">
            <div className="relative group">
                <div className="flex items-center justify-between">
                    <Label className="text-primary font-bold">Turn {turn.turnNumber}: Teacher's Question</Label>
                </div>
                <div className="p-3 border rounded-md mt-1 markdown-content bg-background">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.question}</ReactMarkdown>
                </div>
                <ThinkingCollapsible thinking={turn.teacherThinking} agentName="Teacher" />
            </div>
            
             <div className="relative group">
                <Label className="text-accent font-bold">Student's Answer</Label>
                <div className="p-3 border rounded-md mt-1 markdown-content bg-background">
                    {turn.answer ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown> : <p className="text-muted-foreground italic">Student is thinking...</p>}
                </div>
                 <ThinkingCollapsible thinking={turn.studentThinking} agentName="Student" />
            </div>

            <div>
                <Label className="font-bold">Evaluation</Label>
                <div className="mt-1">
                    <RankBadge evaluation={turn.evaluation} />
                </div>
            </div>
        </div>
    )
}

// #####################
// ## Final Report View ##
// #####################

interface ReportViewProps {
  state: ReturnType<typeof useProvingGroundEngine>['state'];
  onReset: () => void;
}

const generatePdf = (transcript: ProvingGroundTranscript) => {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;
    let y = margin;
  
    const checkPageBreak = (spaceNeeded: number) => {
      if (y + spaceNeeded > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };
  
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('Examination: Final Report', margin, y);
    y += 10;
  
    // Subtitle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    const teacherNickname = transcript.config.teacher.nickname || 'Teacher';
    const studentNickname = transcript.config.student.nickname || 'Student';
    doc.text(`Evaluation of "${studentNickname}" by "${teacherNickname}"`, margin, y);
    y += 5;
    doc.text(`Completed on: ${new Date(transcript.finishedAt).toLocaleString()}`, margin, y);
    y += 15;
  
    // Summary
    if (transcript.finalSummary) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text("Teacher's Final Summary", margin, y);
      y += 8;
  
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const summaryLines = doc.splitTextToSize(transcript.finalSummary, doc.internal.pageSize.width - margin * 2);
      checkPageBreak(summaryLines.length * 5);
      doc.text(summaryLines, margin, y);
      y += summaryLines.length * 5 + 10;
    }
  
    // Performance Metrics
    checkPageBreak(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Performance Metrics', margin, y);
    y += 8;
  
    const rankCounts = transcript.turns.reduce((acc, turn) => {
      if (turn.evaluation) {
        acc[turn.evaluation.rank] = (acc[turn.evaluation.rank] || 0) + 1;
      }
      return acc;
    }, {} as Record<EvaluationRank, number>);
  
    let metricsText = Object.entries(rankCounts)
      .map(([rank, count]) => `${rank}-Rank: ${count}`)
      .join('  |  ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(metricsText, margin, y);
    y += 15;
  
    // Full Transcript
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Full Transcript', margin, y);
    y += 10;
  
    transcript.turns.forEach(turn => {
      checkPageBreak(60); // Estimate space for a turn
  
      // Turn Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`---------- Turn ${turn.turnNumber} ----------`, margin, y);
      y += 8;
  
      // Question
      doc.setFont('helvetica', 'bold');
      doc.text('Question:', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const qLines = doc.splitTextToSize(turn.question, doc.internal.pageSize.width - margin * 2 - 5);
      checkPageBreak(qLines.length * 5 + 10);
      doc.text(qLines, margin + 5, y);
      y += qLines.length * 5 + 5;
  
      // Answer
      checkPageBreak(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Answer:', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      const aLines = doc.splitTextToSize(turn.answer, doc.internal.pageSize.width - margin * 2 - 5);
      checkPageBreak(aLines.length * 5 + 10);
      doc.text(aLines, margin + 5, y);
      y += aLines.length * 5 + 5;
  
      // Evaluation
      if (turn.evaluation) {
        checkPageBreak(20);
        doc.setFont('helvetica', 'bold');
        doc.text('Evaluation:', margin, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        const evalText = `Grade: ${turn.evaluation.rank} - Reason: ${turn.evaluation.reason}`;
        const eLines = doc.splitTextToSize(evalText, doc.internal.pageSize.width - margin * 2 - 5);
        checkPageBreak(eLines.length * 5 + 10);
        doc.text(eLines, margin + 5, y);
        y += eLines.length * 5 + 5;
      }
      y += 5; // Extra space between turns
    });
  
    doc.save(`Examination_Report_${new Date().toISOString()}.pdf`);
};

const generateMarkdown = (transcript: ProvingGroundTranscript) => {
    let mdContent = `# Examination: Final Report\n\n`;

    const teacherNickname = transcript.config.teacher.nickname || 'Teacher';
    const studentNickname = transcript.config.student.nickname || 'Student';

    mdContent += `## Examination Configuration\n`;
    mdContent += `- **Evaluation of**: "${studentNickname}" (Student)\n`;
    mdContent += `- **Evaluated by**: "${teacherNickname}" (Teacher)\n`;
    mdContent += `- **Teacher Model**: \`${transcript.config.teacher.modelName}\`\n`;
    mdContent += `- **Student Model**: \`${transcript.config.student.modelName}\`\n`;
    mdContent += `- **Question Count**: ${transcript.config.questionCount}\n`;
    mdContent += `- **Domains**: ${transcript.config.domains.length > 0 ? transcript.config.domains.join(', ') : 'Not specified'}\n`;
    mdContent += `- **Grading Scale**: ${transcript.config.gradingScale}\n`;
    mdContent += `- **Completed On**: ${new Date(transcript.finishedAt).toLocaleString()}\n\n`;
    
    const rankCounts = transcript.turns.reduce((acc, turn) => {
      if (turn.evaluation) {
        acc[turn.evaluation.rank] = (acc[turn.evaluation.rank] || 0) + 1;
      }
      return acc;
    }, {} as Record<EvaluationRank, number>);

    if (transcript.finalSummary) {
        mdContent += `## Teacher's Final Summary\n`;
        mdContent += `> ${transcript.finalSummary.replace(/\n/g, '\n> ')}\n\n`;
    }

    mdContent += `## Performance Metrics\n`;
    mdContent += Object.entries(rankCounts).map(([rank, count]) => `- **${rank}-Rank**: ${count}`).join('\n');
    mdContent += `\n\n---\n\n`;

    mdContent += `## Full Transcript\n\n`;

    transcript.turns.forEach(turn => {
        mdContent += `### Turn ${turn.turnNumber}\n\n`;
        mdContent += `**Teacher's Question:**\n`;
        mdContent += `${turn.question}\n\n`;
        mdContent += `**Student's Answer:**\n`;
        mdContent += `${turn.answer}\n\n`;
        if (turn.evaluation) {
            mdContent += `**Evaluation:**\n`;
            mdContent += `- **Grade:** ${turn.evaluation.rank}\n`;
            mdContent += `- **Reason:** ${turn.evaluation.reason}\n`;
            if (turn.evaluation.message_to_student) {
                mdContent += `- **Message to Student:** ${turn.evaluation.message_to_student}\n`;
            }
        }
        mdContent += `\n---\n\n`;
    });
    
    // Create a Blob and trigger download
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Examination_Report_${new Date().toISOString()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

function ReportView({ state, onReset }: ReportViewProps) {
  const { transcript, error } = state;
  const [hasCopied, setHasCopied] = useState(false);

  const copyToClipboard = () => {
    if (!transcript) return;

    // Create a deep copy to avoid mutating the original state
    const sanitizedTranscript = JSON.parse(JSON.stringify(transcript));

    // Remove sensitive API keys from the config before copying
    if (sanitizedTranscript.config?.teacher?.apiKey) {
      delete sanitizedTranscript.config.teacher.apiKey;
    }
    if (sanitizedTranscript.config?.student?.apiKey) {
      delete sanitizedTranscript.config.student.apiKey;
    }

    const transcriptText = JSON.stringify(sanitizedTranscript, null, 2);
    navigator.clipboard.writeText(transcriptText).then(() => {
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    });
  };

  if (error) {
    return (
       <Card className="max-w-4xl mx-auto w-full animate-fade-in-up">
        <CardHeader>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>An Error Occurred</AlertTitle>
            <AlertDescription>
              The examination could not be completed. Error: {error}
            </AlertDescription>
          </Alert>
        </CardHeader>
        <CardFooter>
          <Button onClick={onReset}>Try Again</Button>
        </CardFooter>
      </Card>
    )
  }

  if (!transcript) {
    return (
         <Card className="max-w-4xl mx-auto w-full animate-fade-in-up">
            <CardHeader>
                <CardTitle>Report Generating...</CardTitle>
                <CardContent>
                    <p className="text-muted-foreground">The report is being generated. Please wait.</p>
                </CardContent>
            </CardHeader>
        </Card>
    );
  }

  const rankCounts = transcript.turns.reduce((acc, turn) => {
    if (turn.evaluation) {
        acc[turn.evaluation.rank] = (acc[turn.evaluation.rank] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const usedRankOrder = transcript.config.gradingScale.split('') as EvaluationRank[];

  const teacherNickname = transcript.config.teacher.nickname || 'Teacher';
  const studentNickname = transcript.config.student.nickname || 'Student';

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Card>
        <CardHeader>
          <CardTitle>Examination: Final Report</CardTitle>
           <CardContent className="pt-2 text-muted-foreground">
             {`Evaluation of "${studentNickname}" (Student) by "${teacherNickname}" (Teacher)`}
            </CardContent>
        </CardHeader>
         <CardFooter className="flex justify-between items-center">
            <div className="flex gap-2">
                <Button onClick={onReset} variant="outline">Run New Examination</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary">
                      <Download className="mr-2 h-4 w-4" /> Download Report <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => generatePdf(transcript)}>
                      <FileIcon className="mr-2 h-4 w-4" />
                      Download as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => generateMarkdown(transcript)}>
                      <FileText className="mr-2 h-4 w-4" />
                      Download as Markdown
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="secondary">
                            <Code className="mr-2 h-4 w-4" /> View Raw Transcript
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                        <DialogHeader>
                          <div className="flex justify-between items-center">
                              <div>
                                <DialogTitle>Raw Examination Transcript</DialogTitle>
                                <DialogDescription>
                                    The complete, unformatted requests and responses from each model for every turn.
                                </DialogDescription>
                              </div>
                              <Button size="sm" variant="outline" onClick={copyToClipboard}>
                                {hasCopied ? <Check className="h-4 w-4 mr-2 text-green-500" /> : <Copy className="h-4 w-4 mr-2" />}
                                {hasCopied ? 'Copied!' : 'Copy Transcript'}
                              </Button>
                          </div>
                        </DialogHeader>
                        <ScrollArea className="flex-grow bg-muted/50 rounded-md">
                            <div className="p-4 space-y-6 text-xs font-mono">
                            {transcript.turns.map(turn => (
                                <div key={turn.turnNumber}>
                                    <h4 className="font-bold text-sm mb-2 text-primary">Turn {turn.turnNumber}</h4>
                                    
                                    <Collapsible className="space-y-2">
                                        <CollapsibleTrigger className="w-full text-left font-semibold text-muted-foreground text-xs flex items-center">Teacher Question <ChevronDown className="h-4 w-4 ml-2" /></CollapsibleTrigger>
                                        <CollapsibleContent className="space-y-1">
                                            <div><h5 className="font-semibold">Request</h5><pre className="whitespace-pre-wrap bg-black/30 p-2 rounded-md">{turn.rawQuestionRequest ? JSON.stringify(turn.rawQuestionRequest, null, 2) : 'Not captured.'}</pre></div>
                                            <div><h5 className="font-semibold">Response</h5><pre className="whitespace-pre-wrap bg-black/30 p-2 rounded-md">{turn.rawQuestionResponse ? JSON.stringify(turn.rawQuestionResponse, null, 2) : 'Not captured.'}</pre></div>
                                        </CollapsibleContent>
                                    </Collapsible>
                                     <Collapsible className="space-y-2">
                                        <CollapsibleTrigger className="w-full text-left font-semibold text-muted-foreground text-xs flex items-center">Student Answer <ChevronDown className="h-4 w-4 ml-2" /></CollapsibleTrigger>
                                        <CollapsibleContent className="space-y-1">
                                            <div><h5 className="font-semibold">Request</h5><pre className="whitespace-pre-wrap bg-black/30 p-2 rounded-md">{turn.rawAnswerRequest ? JSON.stringify(turn.rawAnswerRequest, null, 2) : 'Not captured.'}</pre></div>
                                            <div><h5 className="font-semibold">Response</h5><pre className="whitespace-pre-wrap bg-black/30 p-2 rounded-md">{turn.rawAnswerResponse ? JSON.stringify(turn.rawAnswerResponse, null, 2) : 'Not captured.'}</pre></div>
                                        </CollapsibleContent>
                                    </Collapsible>
                                     <Collapsible className="space-y-2">
                                        <CollapsibleTrigger className="w-full text-left font-semibold text-muted-foreground text-xs flex items-center">Teacher Evaluation <ChevronDown className="h-4 w-4 ml-2" /></CollapsibleTrigger>
                                        <CollapsibleContent className="space-y-1">
                                            <div><h5 className="font-semibold">Request</h5><pre className="whitespace-pre-wrap bg-black/30 p-2 rounded-md">{turn.rawEvaluationRequest ? JSON.stringify(turn.rawEvaluationRequest, null, 2) : 'Not captured.'}</pre></div>
                                            <div><h5 className="font-semibold">Response</h5><pre className="whitespace-pre-wrap bg-black/30 p-2 rounded-md">{turn.rawEvaluationResponse ? JSON.stringify(turn.rawEvaluationResponse, null, 2) : 'Not captured.'}</pre></div>
                                        </CollapsibleContent>
                                    </Collapsible>
                                </div>
                            ))}
                             {transcript.finalSummary && transcript.turns[transcript.turns.length - 1]?.rawSummaryRequest && (
                                <div>
                                    <h4 className="font-bold text-sm mb-2 text-primary">Final Summary</h4>
                                    <Collapsible className="space-y-2">
                                        <CollapsibleTrigger className="w-full text-left font-semibold text-muted-foreground text-xs flex items-center">Teacher Summary <ChevronDown className="h-4 w-4 ml-2" /></CollapsibleTrigger>
                                        <CollapsibleContent className="space-y-1">
                                            <div><h5 className="font-semibold">Request</h5><pre className="whitespace-pre-wrap bg-black/30 p-2 rounded-md">{JSON.stringify(transcript.turns[transcript.turns.length - 1].rawSummaryRequest, null, 2)}</pre></div>
                                            <div><h5 className="font-semibold">Response</h5><pre className="whitespace-pre-wrap bg-black/30 p-2 rounded-md">{JSON.stringify(transcript.turns[transcript.turns.length - 1].rawSummaryResponse, null, 2)}</pre></div>
                                        </CollapsibleContent>
                                    </Collapsible>
                                </div>
                            )}
                            </div>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
            </div>
            <h3 className="text-xl font-bold">Summary</h3>
        </CardFooter>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Performance Metrics</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {usedRankOrder.map(rank => {
              const count = rankCounts[rank] || 0;
              return (
                <div key={rank} className="flex flex-col items-center p-4 rounded-lg bg-muted/50 border min-w-[80px]">
                  <span className="text-3xl font-bold">{rank}</span>
                  <span className="font-mono text-lg">{count}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
        {transcript.finalSummary && (
            <Card>
            <CardHeader><CardTitle><Brain className="inline-block mr-2" /> Teacher's Final Summary</CardTitle></CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-h-48 overflow-y-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{transcript.finalSummary}</ReactMarkdown>
            </CardContent>
            </Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle><FileText className="inline-block mr-2" /> Full Transcript</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[5%]">Turn</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Answer</TableHead>
                <TableHead className="w-[20%]">Evaluation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transcript.turns.map(turn => (
                <TableRow key={turn.turnNumber}>
                  <TableCell className="font-bold text-center">{turn.turnNumber}</TableCell>
                  <TableCell className="text-xs prose prose-sm dark:prose-invert max-w-xs"><ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.question}</ReactMarkdown></TableCell>
                  <TableCell className="text-xs prose prose-sm dark:prose-invert max-w-xs"><ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown></TableCell>
                  <TableCell>
                    <RankBadge evaluation={turn.evaluation} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
