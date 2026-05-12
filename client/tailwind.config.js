/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx}'],
    theme: {
        extend: {
            colors: {
                brand: {
                    DEFAULT: '#2E7D32',
                    light:   '#4CAF50',
                    dark:    '#1B5E20',
                },
                accent: {
                    DEFAULT: '#1565C0',
                    light:   '#1976D2',
                },
            },
            fontFamily: {
                bangla: ['"Noto Sans Bengali"', '"Hind Siliguri"', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
