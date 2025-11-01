/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                'sans': ['"Montserrat"', 'Arial', 'Helvetica', 'sans-serif'],
            },
            colors: {
                primary: {
                    DEFAULT: '#ff2d55', // rosa acceso
                    light: '#ff5e7e',
                    dark: '#c6002b',
                },
                secondary: {
                    DEFAULT: '#ffe600', // giallo vivace
                    light: '#fff685',
                    dark: '#c7b800',
                },
                accent: {
                    DEFAULT: '#00e0b8', // verde acqua
                    light: '#5fffe0',
                    dark: '#00a98b',
                },
                dark: '#171717',
                light: '#f9f9f9',
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'gradient-to-rainbow': 'linear-gradient(90deg, #ff2d55 0%, #ffe600 50%, #00e0b8 100%)',
            },
            boxShadow: {
                'card': '0 4px 24px 0 rgba(255,45,85,0.08), 0 1.5px 4px 0 rgba(0,0,0,0.04)',
                'button': '0 2px 8px 0 rgba(255,45,85,0.15)',
            },
            borderRadius: {
                'xl': '1.25rem',
                '2xl': '2rem',
            },
        },
    },
    plugins: [],
}