---
title: "Otimizando Core Web Vitals no Astro"
subtitle: "Como reduzi o LCP e subi a nota no PageSpeed Insights"
description: "Eliminando render-blocking de fontes externas e melhorando o carregamento no Astro."
date: 2026-10-06
updated: 2026-10-08
tags: [astro, performance, web-vitals, pagespeed, seo, frontend]
category: tech
author: "Diego Fernandes"
draft: false
---

Ao rodar a primeira análise da minha landing page em Astro no Google PageSpeed Insights, a nota no desktop estava em 61, com um LCP de 3.8 segundos.

---

## O Diagnóstico no PageSpeed Insights

No relatório do Lighthouse, o gargalo estava nas requisições bloqueantes de renderização:

```text
Render-blocking requests:
- Google Fonts CSS (fonts.googleapis.com): 400 ms
- Material Symbols CSS: 200 ms
```

Mesmo usando Astro, importar fontes externas diretamente no `<head>` com tags normais travava a renderização inicial da página.

---

## O que Fiz para Resolver

### 1. Carregamento Assíncrono do Google Fonts

A tag `<link rel="stylesheet">` padrão bloqueia a renderização até baixar a folha de estilos.

Mudei para pré-conexão com `preconnect` e carregamento assíncrono com `preload`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link 
  rel="preload" 
  as="style" 
  href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" 
/>
<link 
  rel="stylesheet" 
  href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" 
  media="print" 
  onload="this.media='all'" 
/>
<noscript>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" />
</noscript>
```

### 2. SVGs Nativos em Vez de Fontes de Ícones

Importar a biblioteca inteira de `Material Symbols Outlined` via CDN para usar apenas 5 ícones na página adicionava requisições bloqueantes desnecessárias.

Substituí por SVGs inline diretamente nos componentes do Astro. O Astro compila o SVG no build e não gera requisições extras de rede.

---

## Resultados

Depois de subir essas alterações:
- FCP (First Contentful Paint): caiu de 3.8s para 0.4s.
- LCP (Largest Contentful Paint): caiu de 3.8s para 0.6s.
- Score no PageSpeed: subiu para 98+ no Desktop e Mobile.