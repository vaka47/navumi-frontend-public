import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
	darkMode: ["class"],
	content: [
		"./src/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
    	container: {
    		center: true,
    		padding: '1rem',
    		screens: {
    			'2xl': '1280px'
    		}
    	},
    	extend: {
    		fontFamily: {
    			sans: [
    				'Inter',
    				'sans-serif'
    			]
    		},
    		colors: {
    			background: 'hsl(var(--background))',
    			foreground: 'hsl(var(--foreground))',
    			primary: {
    				DEFAULT: 'hsl(var(--primary))',
    				foreground: 'hsl(var(--primary-foreground))'
    			},
    			secondary: {
    				DEFAULT: 'hsl(var(--secondary))',
    				foreground: 'hsl(var(--secondary-foreground))'
    			},
    			muted: {
    				DEFAULT: 'hsl(var(--muted))',
    				foreground: 'hsl(var(--muted-foreground))'
    			},
    			accent: {
    				DEFAULT: 'hsl(var(--accent))',
    				foreground: 'hsl(var(--accent-foreground))'
    			},
    			destructive: {
    				DEFAULT: 'hsl(var(--destructive))',
    				foreground: 'hsl(var(--destructive-foreground))'
    			},
    			border: 'hsl(var(--border))',
    			input: 'hsl(var(--input))',
    			ring: 'hsl(var(--ring))',
    			gray: {
    				'50': '#f9fafb',
    				'100': '#f3f4f6',
    				'200': '#e5e7eb',
    				'300': '#d1d5db',
    				'400': '#9ca3af',
    				'500': '#6b7280',
    				'600': '#4b5563',
    				'700': '#374151',
    				'800': '#1f2937',
    				'900': '#111827'
    			},
    			card: {
    				DEFAULT: 'hsl(var(--card))',
    				foreground: 'hsl(var(--card-foreground))'
    			},
    			popover: {
    				DEFAULT: 'hsl(var(--popover))',
    				foreground: 'hsl(var(--popover-foreground))'
    			},
    			chart: {
    				'1': 'hsl(var(--chart-1))',
    				'2': 'hsl(var(--chart-2))',
    				'3': 'hsl(var(--chart-3))',
    				'4': 'hsl(var(--chart-4))',
    				'5': 'hsl(var(--chart-5))'
    			}
    		},
    		borderRadius: {
    			lg: 'var(--radius)',
    			md: 'calc(var(--radius) - 2px)',
    			sm: 'calc(var(--radius) - 4px)'
    		},
			height: {
				'screen-dynamic': '100dvh',
			},
			maxHeight: {
				'screen-dynamic': '100dvh',
			},
			keyframes: {
				shake: {
					'0%, 100%': { transform: 'translateX(0)' },
					'25%': { transform: 'translateX(-2px)' },
					'50%': { transform: 'translateX(2px)' },
					'75%': { transform: 'translateX(-1px)' },
				},
			},
			animation: {
				shake: 'shake 0.3s ease-in-out',
			},
    	}
    },
	plugins: [
		require("tailwindcss-animate"),
		plugin(function ({ addBase }) {
			addBase({
				":root": {
					"--background": "0 0% 100%",
					"--foreground": "222.2 84% 4.9%",

					"--card": "0 0% 100%",
					"--card-foreground": "222.2 84% 4.9%",

					"--popover": "0 0% 100%",
					"--popover-foreground": "222.2 84% 4.9%",

					"--primary": "210 100% 56%",
					"--primary-foreground": "0 0% 100%",

					"--secondary": "210 40% 96.1%",
					"--secondary-foreground": "222.2 47.4% 11.2%",

					"--muted": "210 40% 96.1%",
					"--muted-foreground": "215.4 16.3% 46.9%",

					"--accent": "210 100% 56%",
					"--accent-foreground": "0 0% 100%",

					"--destructive": "0 84.2% 60.2%",
					"--destructive-foreground": "210 40% 98%",

					"--border": "214.3 31.8% 91.4%",
					"--input": "214.3 31.8% 91.4%",
					"--ring": "222.2 84% 4.9%",

					"--radius": "0.5rem",
				},
				".dark": {
					"--background": "222.2 84% 4.9%",
					"--foreground": "210 40% 98%",

					"--card": "222.2 84% 4.9%",
					"--card-foreground": "210 40% 98%",

					"--popover": "222.2 84% 4.9%",
					"--popover-foreground": "210 40% 98%",

					"--primary": "210 100% 70%",
					"--primary-foreground": "222.2 47.4% 11.2%",

					"--secondary": "217.2 32.6% 17.5%",
					"--secondary-foreground": "210 40% 98%",

					"--muted": "217.2 32.6% 17.5%",
					"--muted-foreground": "215 20.2% 65.1%",

					"--accent": "217.2 32.6% 17.5%",
					"--accent-foreground": "210 40% 98%",

					"--destructive": "0 62.8% 30.6%",
					"--destructive-foreground": "210 40% 98%",

					"--border": "217.2 32.6% 17.5%",
					"--input": "217.2 32.6% 17.5%",
					"--ring": "212.7 26.8% 83.9%",
				},
			});
		}),
	],
};
export default config;
