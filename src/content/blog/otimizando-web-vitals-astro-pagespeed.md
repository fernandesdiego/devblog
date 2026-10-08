---
title: "Otimizando Core Web Vitals no Astro: Como Destravei o LCP e Subi o Score no PageSpeed"
subtitle: "De 61 para 95+ no Lighthouse: eliminando render-blocking de fontes externas e ajustando carregamento"
description: "Um passo a passo prático de otimização de performance no Astro SSG"
date: 2026-10-06
tags: [astro, performance, web-vitals, pagespeed, seo, frontend]
category: tech
author: "Diego Fernandes"
draft: false
---

Quando você constrói uma landing page com **Astro**, a expectativa natural é tirar nota 100 de performance no **Google PageSpeed Insights** logo de cara, afinal estamos falando de HTML estático quase puro (Zero-JS por padrão).

No entanto, ao rodar a primeira análise da landing page tomei um susto: a nota de performance no desktop estava em **61**, com um **LCP** de 3.8 segundos.

---

## O Diagnóstico no PageSpeed Insights

No relatório detalhado do Lighthouse, a causa estava na seção de *Render-blocking requests*:

```
Render-blocking requests — Economia estimada de 3.430 ms
- Google Fonts CSS (fonts.googleapis.com): 400 ms
- Material Symbols CSS: 200 ms
- Bloqueio da thread principal antes do First Contentful Paint
```

Mesmo usando Astro, a forma como as fontes externas estavam sendo importadas no `<head>` travava a renderização completa da tela enquanto o navegador resolvia a conexão.

---

## As Correções Aplicadas

### 1. Eliminar o Bloqueio de Render do Google Fonts

A forma comum de importar fontes externas é colar a tag `<link rel="stylesheet">` padrão:

```html
<!-- ❌ Bloqueia a renderização até baixar o css -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" />
```

Para transformar isso em um carregamento assíncrono sem travar o LCP, apliquei o padrão de `preconnect` e `preload`:

```html
<!-- ✅ Pré-conecta com os domínios da Google e carrega assíncrono -->
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

### 2. Substituir Ícones Pesados por SVGs Nativos

Importar a biblioteca inteira de `Material Symbols Outlined` via CDN para usar apenas 5 ou 6 ícones na landing page adicionava mais de 100 KB de fonte e requisições.

Substituí os ícones por **SVGs inline** diretamente nos componentes do Astro. O Astro compila o SVG no build time, zero requisições de rede extras para o usuário.

---

## O Resultado

- **FCP**: Caiu de 3.8s para **0.4s**.
- **LCP**: Caiu de 3.8s para **0.6s**.
- **Score no PageSpeed**: **61 para 98+** no Desktop e Mobile.

