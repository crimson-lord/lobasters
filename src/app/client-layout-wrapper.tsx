'use client';

import { ThemeProvider } from "@/components/theme-provider";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TRANSPARENT_MODE_KEY = 'transparent-mode-enabled';
const BACKGROUND_IMAGE_KEY = 'custom-background-image';
const BACKGROUND_ZOOM_KEY = 'custom-background-zoom';
const BACKGROUND_POSITION_X_KEY = 'custom-background-position-x';
const BACKGROUND_POSITION_Y_KEY = 'custom-background-position-y';
const BACKGROUND_BLUR_KEY = 'custom-background-blur';


export default function ClientLayoutWrapper({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [background, setBackground] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [blur, setBlur] = useState(4);

  const updateState = () => {
    try {
      // Update background image
      const storedBg = localStorage.getItem(BACKGROUND_IMAGE_KEY);
      setBackground(storedBg);

      // Update zoom
      const storedZoom = localStorage.getItem(BACKGROUND_ZOOM_KEY);
      setZoom(storedZoom ? parseFloat(storedZoom) : 1);

      // Update position
      const storedX = localStorage.getItem(BACKGROUND_POSITION_X_KEY);
      const storedY = localStorage.getItem(BACKGROUND_POSITION_Y_KEY);
      setPosition({
        x: storedX ? parseInt(storedX, 10) : 50,
        y: storedY ? parseInt(storedY, 10) : 50,
      });

      // Update blur
      const storedBlur = localStorage.getItem(BACKGROUND_BLUR_KEY);
      setBlur(storedBlur ? parseInt(storedBlur, 10) : 4);

      // Update glass mode
      const isTransparent = localStorage.getItem(TRANSPARENT_MODE_KEY) === 'true';
      if (isTransparent) {
        document.body.classList.add('glass-mode');
      } else {
        document.body.classList.remove('glass-mode');
      }
    } catch (e) {
      console.error("Could not access local storage.", e);
    }
  }

  useEffect(() => {
    updateState();

    // Listen for changes from the settings page
    window.addEventListener('storage', updateState);

    return () => {
      window.removeEventListener('storage', updateState);
    }
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 z-[-1] transition-all duration-300"
        style={background ? {
          backgroundImage: `url(${background})`,
          backgroundSize: `${zoom * 100}%`,
          backgroundPosition: `${position.x}% ${position.y}%`,
          backgroundRepeat: 'no-repeat',
        } : {}}
      />
      <div
        className="fixed inset-0 z-[-1]"
        style={background && blur > 0 ? { backgroundColor: `rgba(0, 0, 0, ${Math.min(0.5, blur * 0.05)})`, backdropFilter: `blur(${blur}px)` } : {}}
      ></div>
      <div className="relative z-0 flex min-h-screen flex-col">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </div>
    </>
  );
}
