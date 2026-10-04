export interface SocialLink {
  url: string;
  label: string;
  icon?: 'github' | 'linkedin' | 'instagram' | 'email' | 'rss' | 'download' | 'arrow-right' | 'arrow-left' | 'sun' | 'moon';
}

export const site = {
  title: 'Diego Fernandes',
  shortTitle: 'diegofernandes',
  description: 'Desenvolvedor Backend especialista no ecossistema .NET construindo soluções web e APIs RESTful.',
  url: 'https://diegofernandes.dev',
  author: {
    name: 'Diego Fernandes',
    email: 'contato@diegofernandes.dev',
    location: 'Londrina, PR',
    resume: '',
  },
  socials: {
    github: { url: 'https://github.com/fernandesdiego', label: 'GitHub', icon: 'github' },
    linkedin: { url: 'https://linkedin.com/in/diego-f', label: 'LinkedIn', icon: 'linkedin' },
    email: { url: 'mailto:contato@diegofernandes.dev', label: 'Email', icon: 'email' },
    rss: { url: '/rss.xml', label: 'RSS', icon: 'rss' },
  } satisfies Record<string, SocialLink>,
};

export type SocialKey = keyof typeof site.socials;

export const withBase = (path: string): string => {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  if (!path.startsWith('/')) return path;
  if (path.startsWith(`${base}/`)) return path;
  return `${base}${path}`;
};
