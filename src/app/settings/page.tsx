
'use client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";
import { ProfileIcon, AppearanceIcon } from "@/components/ui/icons";

import { ThemeSwitcher } from './theme-switcher';
import { Separator } from "@/components/ui/separator";
import { BackgroundSwitcher } from "./background-switcher";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";

export const dynamic = 'force-dynamic';

const TRANSPARENT_MODE_KEY = 'transparent-mode-enabled';

export default function SettingsPage() {
    const router = useRouter();

    const [isTransparent, setIsTransparent] = useState(false);

    useEffect(() => {
        try {
            const storedValue = localStorage.getItem(TRANSPARENT_MODE_KEY);
            const initialValue = storedValue === 'true';
            setIsTransparent(initialValue);
            if (initialValue) {
                document.body.classList.add('glass-mode');
            } else {
                document.body.classList.remove('glass-mode');
            }
        } catch (e) {
            console.error("Could not access local storage", e);
        }
    }, []);

    const handleTransparencyChange = (checked: boolean) => {
        setIsTransparent(checked);
        try {
            localStorage.setItem(TRANSPARENT_MODE_KEY, String(checked));
            if (checked) {
                document.body.classList.add('glass-mode');
            } else {
                document.body.classList.remove('glass-mode');
            }
            // Dispatch event to notify other components if needed
            window.dispatchEvent(new Event('storage'));
        } catch (e) {
            console.error("Could not access local storage", e);
        }
    };


    const sidebarItems = [
      { value: 'appearance', label: 'Appearance', icon: <AppearanceIcon /> },
    ];

    return (
        <div className="container mx-auto py-10 flex flex-col h-screen glass-mode:bg-transparent bg-background">
            <div className="flex-shrink-0">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold">Settings</h1>
                    <Button variant="outline" onClick={() => router.back()}>
                        Back to Dashboard
                    </Button>
                </div>
            </div>
            <div className="flex-grow flex gap-8 overflow-hidden">
                <Tabs defaultValue="appearance" className="flex-grow flex gap-8">
                    <TabsList className="sidebar-group flex flex-col h-auto justify-start p-1 bg-transparent rounded-md w-1/5 space-y-1">
                        {sidebarItems.map(item => (
                            <TabsTrigger 
                                key={item.value} 
                                value={item.value} 
                                className={cn(
                                    "w-full justify-start gap-2 p-2",
                                    "text-muted-foreground data-[state=active]:text-foreground", 
                                    "bg-transparent data-[state=active]:bg-muted/50",
                                    "hover:bg-muted/50 hover:text-foreground",
                                    "transition-all duration-300",
                                    "group-hover:not-hover:blur-[1px] group-hover:not-hover:scale-95",
                                    "relative before:absolute before:left-[-10px] before:top-[5px] before:h-[80%] before:w-[5px]",
                                    "before:bg-primary before:rounded-md before:opacity-0 data-[state=active]:before:opacity-100"
                                )}
                            >
                                <span className="text-lg">{item.icon}</span>
                                {item.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <div className="flex-1 overflow-y-auto pr-4 no-scrollbar">

                        <TabsContent value="appearance">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Appearance</CardTitle>
                                    <CardDescription>
                                        Customize the look and feel of your dashboard.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div>
                                        <h3 className="text-lg font-semibold mb-2">Theme</h3>
                                        <p className="text-sm text-muted-foreground mb-4">Select a theme for your dashboard.</p>
                                        <ThemeSwitcher />
                                    </div>
                                    <Separator />
                                     <div className="space-y-4">
                                        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                            <div className="space-y-0.5">
                                                <h3 className="text-base font-semibold">Transparent Mode</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    Enable a liquid glass effect across the app.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={isTransparent}
                                                onCheckedChange={handleTransparencyChange}
                                                aria-label="Toggle Transparent Mode"
                                            />
                                        </div>
                                    </div>
                                    <Separator />
                                    <div>
                                        <h3 className="text-lg font-semibold mb-2">Background</h3>
                                        <p className="text-sm text-muted-foreground mb-4">Choose a background for your workspace.</p>
                                        <BackgroundSwitcher />
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    );
}
