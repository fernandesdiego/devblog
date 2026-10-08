---
title: "Build Estático Dependente de API: Fail-Fast ou Snapshot Resiliente"
subtitle: "Deploys sem travas na landing page em Astro"
description: "Arquitetura de pricing no Astro SSG: por que saí do fail-fast radical para um modelo híbrido com timeout e um snapshot."
date: 2026-10-05
updated: 2026-10-08
tags: [astro, dotnet, saas, arquitetura, ssg, stripe]
category: tech
author: "Diego Fernandes"
draft: false
---

Construindo a landing page e a página de preços do meu produto usando **Astro** com SSG, precisei resolver um dilema clássico: *o que deve acontecer se a API de planos estiver fora do ar ou lenta durante o build?*

No começo, fui pelo caminho do **fail-fast radical**: se a API de planos não respondesse durante o build, eu deixava o deploy quebrar propositalmente. A ideia era evitar a todo custo publicar planos desatualizados na página de vendas.

Porém, na prática essa decisão poderia me causar problemas. Um timeout temporário na API iria travar deploys de marketing, SEO ou textos que não tinham nada a ver com preços.

---

## O Cenário: Astro SSG Buscando Planos Dinâmicos

No meu backend, os preços e limites dos planos são sincronizados diretamente com o Stripe.

Na landing page em Astro, eu consumo esse endpoint no build time para gerar o HTML estático, ótimo pra SEO. 

O problema é que acoplar o build estático a um endpoint ao vivo cria uma dependência:

```text
[Deploy no Cloudflare Pages] ──> [Bate na API .NET] ──> [API oscila / Timeout] ──> [Build quebrava]
```

---

## Por que o Fail-Fast Puro se Tornou um Problema

A intenção original era boa: garantir que o cliente nunca visse um preço diferente do que seria cobrado no checkout do Stripe.

Mas na realidade de desenvolvimento solo, isso trouxe fricções:
1. **Deploys Travados sem Necessidade**: Se eu precisasse apenas corrigir uma vírgula ou ajustar um componente visual, o build podia falhar caso a API estivesse reiniciando na VPS.
2. **Propagação de DNS**: Durante migrações de domínio e apontamentos de DNS, a URL da API podia demorar alguns minutos para responder, impedindo qualquer deploy da landing page.

---

## A Nova Arquitetura: Timeout de 5s + Snapshot Versionado

A solução que adotei une o melhor dos dois mundos:
1. **Prioridade para a API**: O build tenta consultar a API primeiro.
2. **Timeout**: Se a API demorar mais de 5s, o request é cancelado para o build não ficar pendurado.
3. **Snapshot dos Planos Vigentes**: Se a chamada falhar ou estourar o timeout, um `console.warn` é disparado e o build usa um arquivo local contendo o snapshot dos planos atuais sincronizados do Stripe.

Veja como ficou a implementação no `Pricing.astro`:

```astro
---
import https from 'node:https';
import fallbackPlans from '../data/plans-fallback.json';

const fetchPlansFromUrl = (baseUrl: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl.replace(/\/$/, '') + '/api/billing/plans');
    const isLocalApi = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

    const req = https.get(url, { rejectUnauthorized: !isLocalApi }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        } else {
          reject(new Error('Status: ' + res.statusCode));
        }
      });
    });

    // Timeout de 5s para não prender a esteira de build
    req.setTimeout(5000, () => {
      req.destroy(new Error('Timeout ao buscar planos da API'));
    });

    req.on('error', reject);
  });
};

const fetchPlans = async () => {
  const primaryUrl = import.meta.env.VITE_API_URL;
  try {
    const res = await fetchPlansFromUrl(primaryUrl);
    const parsed = Array.isArray(res) ? res : (res.value || res.plans || res.data || []);
    if (parsed && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn(`[Pricing] Falha ao consultar API (${primaryUrl}): ${(err as Error).message}. Usando snapshot dos planos.`);
  }

  return fallbackPlans;
};

const plans = await fetchPlans();
---
```

---
