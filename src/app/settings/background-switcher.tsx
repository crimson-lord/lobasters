
'use client';
import { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, Trash2, Ban } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

const BACKGROUND_IMAGE_KEY = 'custom-background-image';
const BACKGROUND_ZOOM_KEY = 'custom-background-zoom';
const BACKGROUND_POSITION_X_KEY = 'custom-background-position-x';
const BACKGROUND_POSITION_Y_KEY = 'custom-background-position-y';
const BACKGROUND_BLUR_KEY = 'custom-background-blur';


const prebuiltBackgrounds = [
  '/backgrounds/image1.png',
  '/backgrounds/image2.png',
  '/backgrounds/image3.png',
  '/backgrounds/image4.png',
];

export function BackgroundSwitcher() {
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [blur, setBlur] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    try {
      const storedImage = localStorage.getItem(BACKGROUND_IMAGE_KEY);
      if (storedImage) {
        setBackgroundImage(storedImage);
      }
      const storedZoom = localStorage.getItem(BACKGROUND_ZOOM_KEY);
      setZoom(storedZoom ? parseFloat(storedZoom) : 1);

      const storedX = localStorage.getItem(BACKGROUND_POSITION_X_KEY);
      const storedY = localStorage.getItem(BACKGROUND_POSITION_Y_KEY);
      setPosition({
        x: storedX ? parseInt(storedX, 10) : 50,
        y: storedY ? parseInt(storedY, 10) : 50,
      });
      
      const storedBlur = localStorage.getItem(BACKGROUND_BLUR_KEY);
      setBlur(storedBlur ? parseInt(storedBlur, 10) : 4);

    } catch (e) {
      console.error("Could not access local storage", e);
    }
  }, []);

  const dispatchStorageEvent = () => {
     window.dispatchEvent(new Event('storage'));
  }
  
  const setActiveBackground = (bg: string | null) => {
    try {
      if (bg) {
        localStorage.setItem(BACKGROUND_IMAGE_KEY, bg);
      } else {
        localStorage.removeItem(BACKGROUND_IMAGE_KEY);
        // Also reset zoom and position when image is removed
        handleZoomChange(1);
        handlePositionChange(50, 'x');
        handlePositionChange(50, 'y');
        handleBlurChange(4);
      }
      setBackgroundImage(bg);
      setError(null);
      dispatchStorageEvent();
    } catch (err: any) {
       if (err.name === 'QuotaExceededError') {
        setError('Could not save image. Local storage quota exceeded.');
      } else {
        setError('An unexpected error occurred while saving the background.');
      }
    }
  };

  const processFile = (file: File | undefined) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        setError('Invalid file type. Please upload an image.');
        return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setError('Image size cannot exceed 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setActiveBackground(result);
    };
    reader.onerror = () => {
      setError('Failed to read the selected file.');
    };
    reader.readAsDataURL(file);
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFile(event.target.files?.[0]);
    // reset file input
    if(event.target) {
        event.target.value = '';
    }
  };

  const handleDeleteImage = () => {
    setActiveBackground(null);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };
  
  const handleSelectPrebuilt = (bgPath: string | null) => {
    setActiveBackground(bgPath);
  };

  const handleZoomChange = (value: number) => {
    try {
      localStorage.setItem(BACKGROUND_ZOOM_KEY, String(value));
      setZoom(value);
      dispatchStorageEvent();
    } catch (e) {
      setError('Could not save setting.');
    }
  };

  const handlePositionChange = (value: number, axis: 'x' | 'y') => {
    try {
      const newPosition = { ...position, [axis]: value };
      localStorage.setItem(BACKGROUND_POSITION_X_KEY, String(newPosition.x));
      localStorage.setItem(BACKGROUND_POSITION_Y_KEY, String(newPosition.y));
      setPosition(newPosition);
      dispatchStorageEvent();
    } catch (e) {
      setError('Could not save setting.');
    }
  }

  const handleBlurChange = (value: number) => {
    try {
      localStorage.setItem(BACKGROUND_BLUR_KEY, String(value));
      setBlur(value);
      dispatchStorageEvent();
    } catch (e) {
      setError('Could not save setting.');
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    processFile(event.dataTransfer.files?.[0]);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // A bit of a hack to prevent flickering when dragging over child elements
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
        return;
    }
    setIsDragging(false);
  };


  return (
    <Tabs defaultValue="upload" className="w-full">
      <TabsList>
        <TabsTrigger value="upload">Upload Your Own</TabsTrigger>
        <TabsTrigger value="pre-built">Pre-built</TabsTrigger>
      </TabsList>
      <TabsContent value="upload" className="mt-4">
        <div className="p-4 border rounded-md space-y-4">
          <h4 className="font-semibold">Your Background</h4>
          {error && (
             <Alert variant="destructive">
               <AlertTitle>Upload Failed</AlertTitle>
               <AlertDescription>{error}</AlertDescription>
             </Alert>
          )}
          {backgroundImage && !prebuiltBackgrounds.includes(backgroundImage) ? (
            <div className="space-y-4">
              <div className="relative w-full h-48 rounded-md overflow-hidden border">
                <div 
                    className="w-full h-full bg-no-repeat transition-all duration-100"
                    style={{
                        backgroundImage: `url(${backgroundImage})`,
                        backgroundSize: `${zoom * 100}%`,
                        backgroundPosition: `${position.x}% ${position.y}%`,
                    }}
                />
                 <div
                    className="absolute inset-0"
                    style={{
                        backdropFilter: `blur(${blur}px)`,
                    }}
                 />
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="zoom-slider">Zoom ({zoom.toFixed(1)}x)</Label>
                  <Slider 
                    id="zoom-slider"
                    value={[zoom]}
                    onValueChange={([v]) => handleZoomChange(v)}
                    min={1} max={5} step={0.1} 
                  />
                </div>
                <div>
                  <Label htmlFor="blur-slider">Blur Amount ({blur}px)</Label>
                  <Slider 
                    id="blur-slider"
                    value={[blur]}
                    onValueChange={([v]) => handleBlurChange(v)}
                    min={0} max={40} step={1} 
                  />
                </div>
                 <div>
                  <Label htmlFor="pos-y-slider">Vertical Position</Label>
                  <Slider 
                    id="pos-y-slider"
                    value={[position.y]}
                    onValueChange={([v]) => handlePositionChange(v, 'y')}
                    min={0} max={100} step={1} 
                  />
                </div>
              </div>
              <Button onClick={handleDeleteImage} variant="destructive" className="w-full">
                <Trash2 className="mr-2 h-4 w-4" /> Delete Image
              </Button>
            </div>
          ) : (
            <div 
              onClick={triggerFileInput}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              className={cn(
                "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                isDragging ? "border-primary bg-primary/10" : ""
              )}
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">{isDragging ? 'Drop image to upload' : 'Click or drag & drop to upload'}</p>
              <p className="text-xs text-muted-foreground">(Max 5MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/gif, image/webp"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="pre-built" className="mt-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 border rounded-md">
            {prebuiltBackgrounds.map((bg) => (
                <div 
                    key={bg}
                    onClick={() => handleSelectPrebuilt(bg)}
                    className={cn(
                        "relative aspect-video bg-black rounded-md border-2 cursor-pointer transition-all overflow-hidden group",
                        backgroundImage === bg ? 'border-primary' : 'border-transparent hover:border-primary/50'
                    )}
                >
                    <Image 
                      src={bg} 
                      alt={`Background preview ${bg}`} 
                      layout="fill" 
                      objectFit="cover" 
                      className="group-hover:scale-105 transition-transform"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                     {backgroundImage === bg && (
                        <div className="absolute inset-0 bg-primary/50 flex items-center justify-center">
                            <p className="text-primary-foreground font-bold">Selected</p>
                        </div>
                    )}
                </div>
            ))}
             <div 
                onClick={() => handleSelectPrebuilt(null)}
                className={cn(
                    "relative aspect-video bg-muted/30 rounded-md border-2 cursor-pointer transition-all overflow-hidden group flex flex-col items-center justify-center",
                    backgroundImage === null ? 'border-primary' : 'border-transparent hover:border-primary/50'
                )}
            >
                <Ban className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-semibold text-muted-foreground mt-2">None</p>
                 {backgroundImage === null && (
                    <div className="absolute inset-0 bg-primary/50 flex items-center justify-center">
                        <p className="text-primary-foreground font-bold">Selected</p>
                    </div>
                )}
            </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
