import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'August',
    description: 'August OSRS-parity client and server documentation',
    base: '/August/',
    head: [
        ['meta', { property: 'og:title', content: 'August' }],
        ['meta', { property: 'og:description', content: 'August OSRS-parity client and server documentation' }],
        ['meta', { name: 'theme-color', content: '#4a9eff' }],
    ],
    themeConfig: {
        siteTitle: 'August',
        nav: [
            { text: 'Home', link: '/' },
            { text: 'Overview', link: '/overview' },
            { text: 'Setup', link: '/setup' },
            { text: 'Contribute', link: '/contributing/' },
        ],
        sidebar: [
            {
                text: 'Getting Started',
                items: [
                    { text: 'Repository Overview', link: '/overview' },
                    { text: 'Setup', link: '/setup' },
                    { text: 'FAQ', link: '/faq' },
                ],
            },
            {
                text: 'Architecture',
                items: [
                    { text: 'Architecture', link: '/architecture' },
                    { text: 'Project Map', link: '/project-map' },
                ],
            },
            {
                text: 'Content and Operations',
                items: [
                    { text: 'Gamemodes', link: '/gamemodes' },
                    { text: 'Content Modules', link: '/content-modules' },
                    { text: 'Hosting', link: '/hosting' },
                    { text: 'Manual Testing', link: '/testing/manual/' },
                ],
            },
            {
                text: 'Contributing',
                items: [
                    { text: 'Policy Index', link: '/contributing/' },
                    { text: 'Repository Layout', link: '/contributing/repository-layout' },
                    { text: 'Naming', link: '/contributing/naming' },
                    { text: 'Testing', link: '/contributing/testing' },
                    { text: 'Generated Data', link: '/contributing/generated-data' },
                    { text: 'Experiments', link: '/contributing/experiments' },
                    { text: 'Environment and Migrations', link: '/contributing/environment-and-migrations' },
                ],
            },
            {
                text: 'Status and History',
                items: [
                    { text: 'OSRS Parity', link: '/osrs-parity-checklist' },
                    { text: 'Migration Audit', link: '/refactor-audit' },
                    { text: 'Cleanup Roadmap', link: '/cleanup-roadmap' },
                ],
            },
        ],
        socialLinks: [
            { icon: 'discord', link: 'https://discord.gg/3dzttF2q73' },
            { icon: 'github', link: 'https://github.com/NotAnIronman/August' },
        ],
        footer: {
            message: 'Fan project. Not affiliated with Jagex Ltd.',
        },
        editLink: {
            pattern: 'https://github.com/NotAnIronman/August/edit/main/apps/docs/:path',
            text: 'Edit this page on GitHub',
        },
    },
});
