'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { 
  ArrowRight, 
  Settings, 
  LayoutDashboard, 
  Swords, 
  GraduationCap, 
  FlaskConical, 
  Handshake, 
  LogOut, 
  Activity, 
  Cpu, 
  Layers,
  Quote
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageNavigationTools } from '@/components/webmcp/page-navigation-tools';

export const dynamic = 'force-dynamic';



interface LabModule {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    href: string;
    status: 'Stable' | 'Beta' | 'Experimental' | 'Alpha';
    color: string;
}

const labs: LabModule[] = [
    {
        id: 'arena',
        title: 'Arena',
        description: 'Pit two AI models against each other in a structured, multi-turn debate with semantic tools.',
        icon: <Swords className="h-6 w-6" />,
        href: '/debate',
        status: 'Stable',
        color: 'text-blue-500 bg-blue-500/10 border-blue-500/20'
    },
    {
        id: 'proving-ground',
        title: 'Examination',
        description: 'Evaluate a candidate model against a rigorous benchmark teacher in a domain-specific exam.',
        icon: <GraduationCap className="h-6 w-6" />,
        href: '/proving-ground',
        status: 'Beta',
        color: 'text-purple-500 bg-purple-500/10 border-purple-500/20'
    },
    {
        id: 'lab',
        title: 'LAB',
        description: 'Autonomous agent environment where models plan, reflect, and execute tasks via virtual FS.',
        icon: <FlaskConical className="h-6 w-6" />,
        href: '/lm0',
        status: 'Experimental',
        color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
    }
];

const quotes = [
    "The best way to predict the future is to create it.",
    "Believe you can and you're halfway there.",
    "Action is the foundational key to all success.",
    "Your only limit is your mind.",
    "Dream big. Start small. Act now.",
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "The secret of getting ahead is getting started.",
    "Don’t watch the clock; do what it does. Keep going.",
    "It always seems impossible until it's done.",
    "Keep your face always toward the sunshine—and shadows will fall behind you.",
    "Perseverance is not a long race; it is many short races one after the other.",
    "The harder you work for something, the greater you'll feel when you achieve it.",
    "Don’t stop when you’re tired. Stop when you’re done.",
    "The key to success is to focus on goals, not obstacles.",
    "Opportunities don't happen. You create them.",
    "Failure is simply the opportunity to begin again, this time more intelligently.",
    "The only place where success comes before work is in the dictionary.",
    "Great things never come from comfort zones.",
    "Focus on being productive instead of busy.",
    "Everything you’ve ever wanted is on the other side of fear.",
    "Success is walking from failure to failure with no loss of enthusiasm.",
    "The distance between insanity and genius is measured only by success.",
    "Logic will get you from A to B. Imagination will take you everywhere.",
    "Intelligence is the ability to adapt to change.",
    "The machine does not have a soul, but it can help you find yours.",
    "Evolve or remain the same. The choice is yours.",
    "Technology is best when it brings people together.",
    "Code is like humor. When you have to explain it, it’s bad.",
    "Simplicity is the soul of efficiency.",
    "Standardize your processes, then improve them.",
    "A goal without a plan is just a wish.",
    "The expert in anything was once a beginner.",
    "Do what you can, with what you have, where you are.",
    "Energy and persistence conquer all things.",
    "Quality is not an act, it is a habit.",
    "Small daily improvements are the key to long-term results.",
    "If you can dream it, you can do it.",
    "Hardships often prepare ordinary people for an extraordinary destiny.",
    "Innovation distinguishes between a leader and a follower.",
    "The way to get started is to quit talking and begin doing.",
    "Your time is limited, so don't waste it living someone else's life.",
    "Stay hungry, stay foolish.",
    "Stay positive, work hard, make it happen.",
    "Be so good they can't ignore you.",
    "Hustle until your haters ask if you're hiring.",
    "Don't count the days, make the days count.",
    "The only way to do great work is to love what you do.",
    "Make each day your masterpiece.",
    "Productivity is being able to do things that you were never able to do before.",
    "Work hard in silence, let your success be your noise."
];

export default function DashboardPage() {
  const router = useRouter();
  const [currentQuote, setCurrentQuote] = useState("");

  useEffect(() => {
    // Select a random quote on mount to avoid hydration mismatch
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    setCurrentQuote(randomQuote);

    // Rotate quote every 15 minutes
    const interval = setInterval(() => {
        const nextQuote = quotes[Math.floor(Math.random() * quotes.length)];
        setCurrentQuote(nextQuote);
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);




  return (
    <div className={cn(
        "flex h-screen w-full bg-background overflow-hidden",
        "glass-mode:bg-transparent transition-colors"
      )}>
        <PageNavigationTools page="dashboard" />
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-xl hidden md:flex flex-col glass-mode:bg-black/20">
            <div className="p-6">
                <h1 className="text-xl font-black tracking-tighter text-primary">
                    LOBASTERS
                </h1>
            </div>
            <nav className="flex-1 px-4 space-y-2 mt-4">
                <Button variant="ghost" className="w-full justify-start gap-3 bg-primary/10 text-primary border-l-2 border-primary rounded-none">
                    <LayoutDashboard className="h-4 w-4" /> Dashboard
                </Button>
                {labs.map(lab => (
                    <Button 
                        key={lab.id} 
                        variant="ghost" 
                        onClick={() => lab.href !== '#' && router.push(lab.href)}
                        className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-none border-l-2 border-transparent transition-all"
                    >
                        {lab.icon} {lab.title}
                    </Button>
                ))}
            </nav>
            <div className="p-4 border-t border-border">
                <Button variant="ghost" onClick={() => router.push('/settings')} className="w-full justify-start gap-3 text-muted-foreground">
                    <Settings className="h-4 w-4" /> Settings
                </Button>
            </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 glass-mode:bg-transparent">
                <div className="flex items-center gap-4">
                    <Activity className="h-4 w-4 text-green-500 animate-pulse" />
                    <span className="text-xs font-mono text-muted-foreground">SYSTEM_CORE: NOMINAL</span>
                </div>
                <div className="flex items-center gap-4">

                </div>
            </header>

            <ScrollArea className="flex-1 p-8">
                <div className="max-w-6xl mx-auto space-y-10">
                    
                    {/* Welcome Hero */}
                    <section className="space-y-2">
                        <motion.h2 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-4xl font-black tracking-tight"
                        >
                            Welcome back, <span className="text-primary italic">Researcher</span>.
                        </motion.h2>
                        <p className="text-muted-foreground">Ready to evolve the next generation of autonomous intelligence?</p>
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                        {/* Modules Grid */}
                        <div className="xl:col-span-2 grid gap-6 sm:grid-cols-2">
                            <AnimatePresence>
                                {labs.map((lab, index) => (
                                    <motion.div
                                        key={lab.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                    >
                                        <Card className="group relative overflow-hidden h-full border-border hover:border-primary/50 transition-all cursor-pointer shadow-lg hover:shadow-primary/5" onClick={() => lab.href !== '#' && router.push(lab.href)}>
                                            <CardHeader className="pb-4">
                                                <div className="flex justify-between items-start">
                                                    <div className={cn("p-3 rounded-xl transition-all group-hover:scale-110", lab.color)}>
                                                        {lab.icon}
                                                    </div>
                                                    <div className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border", lab.color)}>
                                                        {lab.status}
                                                    </div>
                                                </div>
                                                <CardTitle className="pt-4 text-xl group-hover:text-primary transition-colors">{lab.title}</CardTitle>
                                                <CardDescription className="line-clamp-2">
                                                    {lab.description}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardFooter className="pt-0 flex justify-end">
                                                <div className="flex items-center text-sm font-bold text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-4 transition-all">
                                                    Launch <ArrowRight className="ml-2 h-4 w-4" />
                                                </div>
                                            </CardFooter>
                                        </Card>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>

                        {/* Sidebar Info Panel */}
                        <aside className="space-y-6">
                            {/* Positive Quote Panel */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.4 }}
                            >
                                <Card className="bg-primary/5 border-primary/20 backdrop-blur shadow-2xl overflow-hidden relative group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Quote className="h-24 w-24 -rotate-12" />
                                    </div>
                                    <CardHeader className="pb-2 border-b border-primary/10">
                                        <CardTitle className="text-xs font-bold flex items-center gap-2 text-primary uppercase tracking-widest">
                                            Researcher's Insight
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-8">
                                        <AnimatePresence mode="wait">
                                            <motion.p 
                                                key={currentQuote}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="text-lg font-medium italic leading-relaxed text-foreground/90"
                                            >
                                                "{currentQuote}"
                                            </motion.p>
                                        </AnimatePresence>
                                    </CardContent>
                                    <CardFooter className="bg-primary/5 py-3 flex justify-center border-t border-primary/10">
                                        <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-tighter">
                                            Transmitted from System Core
                                        </p>
                                    </CardFooter>
                                </Card>
                            </motion.div>

                            {/* Info Card */}
                            <Card className="border-border bg-card/30 backdrop-blur-sm">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Session Intelligence</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-2">
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Your neural interface is connected. Select a module to begin the evolution of your autonomous agents.
                                    </p>
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-primary bg-primary/10 w-fit px-2 py-1 rounded">
                                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                        UPLINK ACTIVE
                                    </div>
                                </CardContent>
                            </Card>
                        </aside>
                    </div>
                </div>
            </ScrollArea>
        </main>
    </div>
  );
}
