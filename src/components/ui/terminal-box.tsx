'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TerminalBoxProps {
  title: string;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  contentRef?: React.RefObject<HTMLDivElement>;
}

export function TerminalBox({ title, children, headerActions, contentRef }: TerminalBoxProps) {
  return (
    <Card className="flex flex-col h-full overflow-hidden border bg-background/50 backdrop-blur-sm">
      <CardHeader className="flex-row justify-between items-center p-3 border-b flex-shrink-0">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {headerActions}
      </CardHeader>
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {children}
      </div>
    </Card>
  );
}
