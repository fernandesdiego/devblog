export interface Experience {
  role: string;
  company: string;
  companyUrl?: string;
  location: string;
  start: string;
  end: string;
  current?: boolean;
  summary: string;
  bullets: string[];
  badges?: string[];
}

export interface Education {
  degree: string;
  field: string;
  school: string;
  start: string;
  end: string;
}

export interface SkillGroup {
  title: string;
  skills: string[];
}

export const experience: Experience[] = [
  {
    role: 'Engenheiro de Software | Integração de Sistemas',
    company: 'TCS',
    location: 'Remoto, EUA',
    start: '2020',
    end: 'Presente',
    current: true,
    summary: 'Engenheiro de backend responsável por integrações e automações de sistemas corporativos.',
    bullets: [
      'Desenvolvi soluções em PowerShell para automatizar remediação e gerenciamento de endpoints dentro da plataforma Nexthink, melhorando a pontuação de experiência digital em mais de 30 mil dispositivos.',
      'Planejei e executei a migração do ecossistema Nexthink de on-premises (v7) para o Nexthink Infinity Cloud SaaS com zero interrupção nas operações.',
      'Projetei integrações de API entre webhooks do Nexthink e APIs REST do ServiceNow, estabelecendo pipelines automatizados de criação de incidentes e auto-resolução (self-healing), reduzindo o tempo de troubleshooting das equipes de suporte.',
    ],
    badges: ['PowerShell', 'Integração de APIs', 'SaaS', 'Automação'],
  },
  {
    role: 'Contribuidor Open Source Backend',
    company: 'Sharebook',
    location: 'Remoto, BR',
    start: '2022',
    end: 'Presente',
    current: true,
    summary: 'Desenvolvimento voluntário focado em integrações de APIs e melhorias de core.',
    bullets: [
      'Automatizei o gerenciamento de conteúdo de eventos integrando as APIs Web do Sympla e Google/YouTube, sincronizando links de transmissões ao vivo, cronogramas e registros de participantes diretamente na plataforma.',
      'Realizei manutenção e melhorias em endpoints principais da Web API, impulsionando melhorias contínuas e correções de bugs.',
    ],
    badges: ['C#', '.NET Core', 'Web APIs', 'Open Source'],
  },
  {
    role: 'Desenvolvedor .NET & Analista de Suporte',
    company: 'Vikstar Services',
    location: 'Londrina, PR',
    start: '2016',
    end: '2020',
    summary: 'Desenvolvimento de ferramentas de produtividade e aplicações focadas na resolução de problemas internos.',
    bullets: [
      'Desenvolvi uma ferramenta de autoatendimento desktop em .NET+WPF que resolvia cerca de 300 chamados de suporte por mês, melhorando a confiabilidade do sistema e reduzindo a intervenção manual.',
      'Projetei um serviço de background dedicado em .NET para realizar auditorias automatizadas no Registro do Windows e atualizações de serviço, garantindo rigorosa conformidade de segurança para operações bancárias.',
      'Construí ferramentas internas de console para auxiliar no troubleshooting, através da coleta de logs de aplicativos, sistema e informações de hardware.',
      'Desenvolvi um sistema de votação para funcionários em C#/.NET usando WPF e ASP.NET MVC + Entity Framework (SQL), incluindo portal web para o RH e cliente desktop autenticado.',
    ],
    badges: ['C#', '.NET', 'WPF', 'ASP.NET MVC', 'SQL'],
  },
];

export const earlierRoles = [];

export const education: Education[] = [
  {
    degree: 'MBA',
    field: 'Engenharia de Software',
    school: 'UTFPR',
    start: '2023',
    end: '2024',
  },
  {
    degree: 'Graduação',
    field: 'Análise e Desenvolvimento de Sistemas',
    school: 'UNICESUMAR',
    start: '2016',
    end: '2020',
  },
];

export const skillGroups: SkillGroup[] = [
  {
    title: 'Backend',
    skills: ['C#', '.NET Core', 'ASP.NET MVC', 'Web APIs', 'Entity Framework Core', 'SOLID', 'Arquitetura RESTful'],
  },
  {
    title: 'Banco de Dados & Infra',
    skills: ['SQL', 'Linux/Unix', 'Nginx', 'Docker', 'Azure'],
  },
  {
    title: 'Ferramentas & DevOps',
    skills: ['Git', 'CI/CD (GitHub Actions)', 'PowerShell'],
  },
  {
    title: 'Idiomas',
    skills: ['Inglês (C2 - Fluente)', 'Português (Nativo)'],
  },
];

export const typingRoles = [
  'desenvolvedor backend .net',
  'engenheiro de software',
  'especialista em integração',
];
