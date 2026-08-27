
export type ThemeCategory = 'gradient';

export type Theme = {
  name: string;
  category: ThemeCategory;
  colors: {
    primary: string;
    primaryForeground: string;
    secondary: string;
    accent: string;
    background: string;
  };
  gradient?: string;
};

export const themes: Theme[] = [
  // Gradient
  {
    name: 'ocean-breeze',
    category: 'gradient',
    colors: {
      primary: '200 80% 50%',
      primaryForeground: '200 10% 95%',
      secondary: '200 50% 12%',
      accent: '170 80% 40%',
      background: '200 50% 5%',
    },
    gradient: 'linear-gradient(to right, hsl(200, 80%, 50%), hsl(170, 80%, 40%))',
  },
  {
    name: 'sunset',
    category: 'gradient',
    colors: {
      primary: '15 90% 55%',
      primaryForeground: '20 10% 95%',
      secondary: '20 50% 12%',
      accent: '45 100% 50%',
      background: '20 50% 5%',
    },
    gradient: 'linear-gradient(to right, hsl(15, 90%, 55%), hsl(45, 100%, 50%))',
  },
  {
    name: 'nebula',
    category: 'gradient',
    colors: {
      primary: '260 80% 65%',
      primaryForeground: '260 10% 95%',
      secondary: '260 40% 12%',
      accent: '300 85% 60%',
      background: '260 40% 5%',
    },
    gradient: 'linear-gradient(to right, hsl(260, 80%, 65%), hsl(300, 85%, 60%))',
  },
  {
    name: 'purple-haze',
    category: 'gradient',
    colors: {
      primary: '280 80% 60%',
      primaryForeground: '280 10% 95%',
      secondary: '280 50% 12%',
      accent: '320 85% 65%',
      background: '280 50% 5%',
    },
    gradient: 'linear-gradient(to right, hsl(280, 80%, 60%), hsl(320, 85%, 65%))',
  },
  {
    name: 'emerald-water',
    category: 'gradient',
    colors: {
      primary: '150 80% 40%',
      primaryForeground: '150 10% 95%',
      secondary: '150 50% 12%',
      accent: '170 85% 35%',
      background: '150 50% 5%',
    },
    gradient: 'linear-gradient(to right, hsl(150, 80%, 40%), hsl(170, 85%, 35%))',
  },
  {
    name: 'cosmic-fusion',
    category: 'gradient',
    colors: {
      primary: '240 70% 50%',
      primaryForeground: '240 10% 95%',
      secondary: '240 40% 12%',
      accent: '270 75% 55%',
      background: '240 40% 5%',
    },
    gradient: 'linear-gradient(to right, hsl(240, 70%, 50%), hsl(270, 75%, 55%))',
  },
  {
    name: 'solar-flare',
    category: 'gradient',
    colors: {
      primary: '50 100% 50%',
      primaryForeground: '50 100% 5%',
      secondary: '40 60% 12%',
      accent: '30 95% 55%',
      background: '40 60% 5%',
    },
    gradient: 'linear-gradient(to right, hsl(50, 100%, 50%), hsl(30, 95%, 55%))',
  },
  {
    name: 'aurora',
    category: 'gradient',
    colors: {
      primary: '130 70% 50%',
      primaryForeground: '130 10% 95%',
      secondary: '130 40% 12%',
      accent: '190 75% 55%',
      background: '130 40% 5%',
    },
    gradient: 'linear-gradient(to right, hsl(130, 70%, 50%), hsl(190, 75%, 55%))',
  },
  {
    name: 'royal-gold',
    category: 'gradient',
    colors: {
      primary: '220 85% 60%',
      primaryForeground: '220 10% 98%',
      secondary: '230 45% 18%',
      accent: '45 80% 55%',
      background: '230 45% 10%',
    },
    gradient: 'linear-gradient(to right, hsl(220, 85%, 60%), hsl(45, 80%, 55%))',
  },
  {
    name: 'crimson-night',
    category: 'gradient',
    colors: {
      primary: '340 90% 55%',
      primaryForeground: '340 10% 98%',
      secondary: '350 30% 15%',
      accent: '280 40% 40%',
      background: '350 30% 8%',
    },
    gradient: 'linear-gradient(to right, hsl(340, 90%, 55%), hsl(280, 40%, 40%))',
  },
  {
    name: 'minty-fresh',
    category: 'gradient',
    colors: {
      primary: '150 75% 45%',
      primaryForeground: '150 10% 98%',
      secondary: '160 35% 18%',
      accent: '170 80% 60%',
      background: '160 35% 10%',
    },
    gradient: 'linear-gradient(to right, hsl(150, 75%, 45%), hsl(170, 80%, 60%))',
  },
  {
    name: 'electric-violet',
    category: 'gradient',
    colors: {
      primary: '265 95% 65%',
      primaryForeground: '265 10% 98%',
      secondary: '270 50% 17%',
      accent: '310 90% 70%',
      background: '270 50% 9%',
    },
    gradient: 'linear-gradient(to right, hsl(265, 95%, 65%), hsl(310, 90%, 70%))',
  },
  {
    name: 'fiery-coral',
    category: 'gradient',
    colors: {
      primary: '10 90% 60%',
      primaryForeground: '10 10% 98%',
      secondary: '15 50% 15%',
      accent: '30 95% 65%',
      background: '15 50% 8%',
    },
    gradient: 'linear-gradient(to right, hsl(10, 90%, 60%), hsl(30, 95%, 65%))',
  },
  {
    name: 'deep-sea',
    category: 'gradient',
    colors: {
      primary: '210 80% 55%',
      primaryForeground: '210 10% 98%',
      secondary: '215 40% 15%',
      accent: '190 70% 45%',
      background: '215 40% 9%',
    },
    gradient: 'linear-gradient(to right, hsl(210, 80%, 55%), hsl(190, 70%, 45%))',
  },
  {
    name: 'lavender-sky',
    category: 'gradient',
    colors: {
      primary: '250 80% 70%',
      primaryForeground: '250 10% 98%',
      secondary: '255 40% 18%',
      accent: '230 85% 75%',
      background: '255 40% 11%',
    },
    gradient: 'linear-gradient(to right, hsl(250, 80%, 70%), hsl(230, 85%, 75%))',
  },
];
