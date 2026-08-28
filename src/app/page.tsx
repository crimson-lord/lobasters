'use client';

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Bot, Compass, ShieldCheck, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageNavigationTools } from '@/components/webmcp/page-navigation-tools';

export default function Home() {
  const router = useRouter();
  const [hasBackground, setHasBackground] = useState(false);

  useEffect(() => {
    // Check for custom background to adjust text legibility
    const checkBackground = () => {
      const bg = localStorage.getItem('custom-background-image');
      setHasBackground(!!bg);
    };

    checkBackground();
    window.addEventListener('storage', checkBackground);
    return () => window.removeEventListener('storage', checkBackground);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: "easeOut" } }
  };

  const labs = [
    {
      id: 'arena',
      title: 'Arena',
      description: 'The digital coliseum where models clash. Witness high-stakes reasoning and adversarial argumentation in a structured environment.',
      icon: <Compass className="h-8 w-8" />,
      href: '/debate',
      color: 'bg-primary'
    },
    {
      id: 'examination',
      title: 'Examination',
      description: 'The rigorous benchmark. A cold, objective evaluation of a candidate student model against a senior benchmark teacher.',
      icon: <ShieldCheck className="h-8 w-8" />,
      href: '/proving-ground',
      color: 'bg-accent'
    },
    {
      id: 'lab',
      title: 'LAB',
      description: 'Autonomous evolution. A sandbox where the Master Agent plans, reflects, and executes complex tasks without intervention.',
      icon: <Bot className="h-8 w-8" />,
      href: '/lm0',
      color: 'bg-primary'
    }
  ];

  return (
    <TooltipProvider>
      <PageNavigationTools page="home" />
      <div className={cn(
        "flex flex-col min-h-screen text-foreground overflow-x-hidden selection:bg-primary/30",
        "bg-background glass-mode:bg-transparent transition-colors duration-500"
      )}>
        {/* Bespoke Aurora Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden glass-mode:opacity-40">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-accent/5 blur-[120px] animate-pulse [animation-delay:2s]" />
          <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] rounded-full bg-primary/5 blur-[100px]" />
        </div>

        <header className={cn(
          "sticky top-0 z-50 w-full border-b border-white/5",
          "bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40",
          "glass-mode:border-white/10 glass-mode:bg-black/20"
        )}>
          <div className="container flex h-20 items-center justify-between">
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="flex items-center gap-2"
            >
              <h1 className="text-xl font-bold tracking-tighter">LOBASTERS</h1>
            </motion.div>
            
            <nav className="flex items-center gap-6">
              <Button variant="ghost" onClick={() => router.push('/dashboard')} className="text-sm font-medium hover:bg-white/5">
                App
              </Button>
              <Button onClick={() => router.push('/dashboard')} className="rounded-full px-6 shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all">
                Get Started <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </nav>
          </div>
        </header>

        <main className="relative flex-1">
          {/* Hero Section */}
          <section className="container pt-32 pb-20 md:pt-48 md:pb-32 text-center">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="max-w-4xl mx-auto"
            >
              <motion.div variants={itemVariants} className="inline-block px-4 py-1.5 mb-6 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-widest uppercase">
                Now in Alpha: The Evolution Loop
              </motion.div>
              
              <motion.h1 
                variants={itemVariants}
                className={cn(
                  "text-5xl md:text-7xl lg:text-8xl tracking-tight mb-8",
                  hasBackground 
                    ? "font-black text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" 
                    : "font-black bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60"
                )}
              >
                Where Agents <br /> <span className="text-primary italic">Evolve.</span>
              </motion.h1>
              
              <motion.p 
                variants={itemVariants}
                className={cn(
                  "text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed",
                  hasBackground 
                    ? "text-white font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" 
                    : "text-muted-foreground"
                )}
              >
                Lobasters is the digital proving ground for autonomous intelligence. Test, benchmark, and evaluate language models in purpose-built environments.
              </motion.p>
              
              <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Button size="lg" onClick={() => router.push('/dashboard')} className="h-14 px-10 text-lg rounded-full group">
                  Enter the Labs 
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button variant="outline" size="lg" onClick={() => router.push('/dashboard')} className="h-14 px-10 text-lg rounded-full bg-transparent hover:bg-white/5 border-white/10">
                  Read the Manifesto
                </Button>
              </motion.div>
            </motion.div>
          </section>
          
          {/* Labs Grid */}
          <section id="labs" className="container pb-40">
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="grid gap-6 md:grid-cols-3"
            >
              {labs.map((lab) => (
                <Link key={lab.id} href="/dashboard">
                  <motion.div 
                    whileHover={{ y: -8 }}
                    className={cn(
                      "group relative h-full p-8 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm overflow-hidden",
                      "hover:border-primary/30 transition-all duration-500",
                      "glass-mode:bg-black/10 glass-mode:border-white/10 glass-mode:backdrop-blur-lg"
                    )}
                  >
                    <div className={cn("absolute -top-10 -right-10 w-32 h-32 blur-[60px] opacity-20 transition-opacity group-hover:opacity-40", lab.color)} />
                    
                    <div className="relative z-10 space-y-6">
                      <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-500">
                        {lab.icon}
                      </div>
                      <div className="space-y-3">
                        <h3 className={cn(
                          "text-2xl font-bold tracking-tight",
                          hasBackground && "text-white drop-shadow-sm"
                        )}>
                          {lab.title}
                        </h3>
                        <p className={cn(
                          "leading-relaxed text-sm sm:text-base",
                          hasBackground ? "text-white/90 font-medium" : "text-muted-foreground"
                        )}>
                          {lab.description}
                        </p>
                      </div>
                      <div className="pt-4 flex items-center text-sm font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Launch Lab <ArrowRight className="ml-2 h-4 w-4" />
                      </div>
                    </div>
                  </motion.div>
                </Link>
              ))}
            </motion.div>
          </section>

          {/* Philosophy Section */}
          <section className="container pb-40 relative">
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none select-none">
              <span className="text-[20vw] font-black tracking-tighter">EVOLVE</span>
            </div>
            <div className="max-w-3xl mx-auto text-center space-y-8">
              <h2 className={cn(
                "text-3xl md:text-5xl font-black tracking-tighter",
                hasBackground && "text-white drop-shadow-md"
              )}>
                Built to evaluate the machine.
              </h2>
              <p className={cn(
                "text-lg leading-relaxed",
                hasBackground ? "text-white font-medium drop-shadow-sm" : "text-muted-foreground"
              )}>
                The biological loop is too slow for modern intelligence. We provide the infrastructure for agents to reason, iterate, and solve at scale. Lobasters is not just a tool; it is a catalyst for post-human intelligence systems.
              </p>
            </div>
          </section>
        </main>
        
        <footer className="border-t border-white/5 bg-black/20 backdrop-blur-md relative z-10 glass-mode:bg-black/40">
          <div className="container py-12">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex flex-col items-center md:items-start gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded bg-primary/20 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="font-black text-sm tracking-tighter">LOBASTERS</span>
                </div>
                <p className="text-xs text-muted-foreground max-w-[200px] text-center md:text-left">
                  Experimental Laboratory for Autonomous Systems.
                </p>
              </div>
              
              <div className="flex items-center gap-8">
                <nav className="flex gap-6 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
                  <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
                </nav>
                <div className="h-4 w-px bg-white/10 hidden md:block" />
                <a 
                  href="https://github.com/crimson-lord/lobasters.git" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-muted-foreground hover:text-white transition-colors"
                >
                  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current">
                    <title>GitHub</title>
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                  </svg>
                </a>
              </div>
            </div>
            <div className="mt-12 text-center text-[10px] text-muted-foreground/30 font-mono tracking-widest">
              © {new Date().getFullYear()} LOBASTERS LABS. ALL RIGHTS RESERVED.
            </div>
          </div>
        </footer>

        <div className="fixed bottom-6 left-6 z-50">
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button 
                whileHover={{ rotate: 12, scale: 1.1 }}
                className="h-10 w-10 rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center text-primary shadow-2xl"
              >
                <Bot className="h-5 w-5" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-primary border-none text-white font-bold">
              <p>The evolution is underway.</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
