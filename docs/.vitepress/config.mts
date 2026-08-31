import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'August',
    description: 'August OSRS-parity client and server documentation',
    base: '/',
    head: [
        ['meta', { property: 'og:title', content: 'August' }],
        ['meta', { property: 'og:description', content: 'August OSRS-parity client and server documentation' }],
        ['meta', { name: 'theme-color', content: '#4a9eff' }],
    ],
    themeConfig: {
        logo: '/xrsps.png',
        siteTitle: false,
        nav: [
            { text: 'Home', link: '/' },
            { text: 'Docs', link: '/setup' }
        ],
        sidebar: [
            {
                text: 'Getting Started',
                items: [
                    { text: 'Setup', link: '/setup' },
                    { text: 'FAQ', link: '/faq' },
                ],
            },
            {
                text: 'Documentation',
                items: [
                    { text: 'Architecture', link: '/ARCHITECTURE' },
                    { text: 'Project Map', link: '/PROJECT_MAP' },
                    { text: 'Gamemodes', link: '/gamemodes' },
                    { text: 'Extrascripts', link: '/extrascripts' },
                    { text: 'Hosting', link: '/hosting' },
                    { text: 'OSRS Parity', link: '/OSRS_PARITY_CHECKLIST' },
                    { text: 'Refactor Audit', link: '/REFACTOR_AUDIT' },
                    { text: 'Cleanup Roadmap', link: '/CLEANUP_ROADMAP' },
                ],
            },
        ],
        socialLinks: [
            { icon: 'discord', link: 'https://discord.gg/3dzttF2q73' },
            { icon: 'github', link: 'https://github.com/xrsps/xrsps-typescript' },
        ],
        footer: {
            message: 'Fan project. Not affiliated with Jagex Ltd.',
        },
        editLink: {
            pattern: 'https://github.com/xrsps/xrsps-typescript/edit/main/docs/:path',
            text: 'Edit this page on GitHub',
        },
    },
});
