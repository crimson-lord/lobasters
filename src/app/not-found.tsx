'use client';

import { Bot, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

const messages = [
    "404 – This Page Went AFK",
    "404 – Even Our AI Gave Up",
    "404 – Page Took a Wrong Turn at the Internet",
    "404 – You Found… Nothing.",
    "404 – We Looked Everywhere. Literally Everywhere.",
    "We asked the AI. The AI asked us. Nobody knows.",
    "Our AI searched the multiverse. This page doesn’t exist.",
    "This URL was last seen running away.",
    "The page exists in theory. Not in reality.",
    "Fun fact: This page never existed.",
    "404 errors are just plot twists.",
    "AI confidence: 99%. Page existence: 0%.",
    "If you’re lost, imagine how we feel.",
    "our budget is not enough to build this page sorry",
    "404 — The AI checked every timeline. This page never existed.",
];

const buttonTexts = [
    "Take Me Somewhere Safe",
    "Return to Base",
    "Undo Whatever I Just Did",
    "Back to Reality",
    "Teleport Home",
];


export default function NotFound() {
  const [message, setMessage] = useState('');
  const [buttonText, setButtonText] = useState('');

  useEffect(() => {
    // Random selection on client-side to avoid hydration mismatch
    setMessage(messages[Math.floor(Math.random() * messages.length)]);
    setButtonText(buttonTexts[Math.floor(Math.random() * buttonTexts.length)]);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
      <Bot className="w-24 h-24 mb-6 text-primary animate-pulse-strong" />
      <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Oops! Page Not Found
      </h1>
      <p className="mt-4 text-lg text-muted-foreground max-w-md">
        {message}
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Link href="/dashboard">
          <Button>
            <Home className="mr-2 h-4 w-4" />
            {buttonText || 'Go back home'}
          </Button>
        </Link>
      </div>
    </div>
  );
}
