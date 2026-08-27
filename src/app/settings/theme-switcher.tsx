
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { themes, Theme, ThemeCategory } from './themes';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown } from 'lucide-react';


function AnimatedOrb({ theme }: { theme: Theme }) {
  const orbStyle = theme.gradient
    ? { background: theme.gradient }
    : { backgroundColor: `hsl(${theme.colors.primary})` };

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 15, stiffness: 200 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const { clientX, clientY, currentTarget } = e;
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      className="absolute inset-0 z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      <motion.div
        className="absolute h-8 w-8 rounded-full"
        style={{
          x: smoothMouseX,
          y: smoothMouseY,
          translateX: '-50%',
          translateY: '-50%',
          boxShadow: `0 0 16px 4px hsl(${theme.colors.primary})`,
          ...orbStyle,
        }}
      />
    </motion.div>
  );
}


function ThemePreview({ theme: t }: { theme: Theme }) {
  const [isHovered, setIsHovered] = React.useState(false);
  const { setTheme, theme: activeTheme } = useTheme();

  return (
    <button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setTheme(t.name)}
      className={cn(
        'flex w-full flex-col items-center justify-center rounded-md border-2 p-2 transition-all hover:scale-105',
        activeTheme === t.name ? 'border-primary' : 'border-transparent'
      )}
    >
      <div
        className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-md"
        style={{
          backgroundColor: '#000',
          border: `1px solid hsl(var(--border))`,
        }}
      >
        <AnimatePresence>{isHovered && <AnimatedOrb theme={t} />}</AnimatePresence>
      </div>
      <div className="mt-2 flex w-full">
        <div 
          className="h-4 w-full rounded-md" 
          style={t.gradient ? { background: t.gradient } : { backgroundColor: `hsl(${t.colors.primary})` }}
        ></div>
      </div>
      <p className="mt-2 text-xs font-semibold capitalize">
        {t.name.replace(/-/g, ' ')}
      </p>
    </button>
  );
}

function ThemeCategorySection({ category, themes }: { category: ThemeCategory, themes: Theme[] }) {
    const [isOpen, setIsOpen] = React.useState(true);
    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between py-2">
                    <h3 className="text-lg font-semibold capitalize">{category} Themes</h3>
                    <ChevronDown className={cn("h-5 w-5 transition-transform", isOpen && "rotate-180")} />
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 py-4">
                    {themes.map((t) => (
                        <ThemePreview key={t.name} theme={t} />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

export function ThemeSwitcher() {
  const categories: ThemeCategory[] = ['gradient'];
  const groupedThemes = themes.reduce((acc, t) => {
    if (!acc[t.category]) {
      acc[t.category] = [];
    }
    acc[t.category].push(t);
    return acc;
  }, {} as Record<ThemeCategory, typeof themes>);


  return (
    <div className="space-y-2">
      {categories.map((category) => (
        groupedThemes[category] && <ThemeCategorySection key={category} category={category} themes={groupedThemes[category]} />
      ))}
    </div>
  );
}
