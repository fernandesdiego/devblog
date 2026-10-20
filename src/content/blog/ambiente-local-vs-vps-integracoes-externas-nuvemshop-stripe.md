---
title: "Ambiente Local vs VPS com Integrações Externas: Nuvemshop, Stripe e Multi-Repo"
subtitle: "Como separei desenvolvimento e produção sem trocar URLs manualmente"
description: "Estratégia para testar localmente integrações com Nuvemshop e Stripe em um ecossistema multi-repo sem quebrar a VPS."
date: 2026-10-08
tags: [devops, dotnet, nuvemshop, stripe, vite, vps]
category: tech
author: "Diego Fernandes"
draft: false
---

O meu projeto depende de integrações externas da Nuvemshop (para autenticação OAuth, webhooks e injeção do widget) e do Stripe (para assinaturas). Toda vez que eu precisava testar um fluxo na minha máquina, eu tinha que acessar o console de parceiros da Nuvemshop e alterar manualmente as URLs de redirecionamento para localhost. Depois do teste, precisava lembrar de desfazer tudo para que o ambiente da VPS continuasse acessível para quem estivesse testando.

Além disso, com a estrutura dividida em vários repositórios, manter essas URLs manualmente era questão de tempo pra acontecer algum problema. Então decidi estruturar a separação desses ambientes.

---

## 1. Aplicativo de DEV na Nuvemshop

A primeira decisão foi parar de compartilhar o mesmo cadastro de aplicativo na Nuvemshop entre local e produção.

Criei um segundo aplicativo exclusivo para DEV no painel de parceiros da Nuvemshop:

- **App de Produção/VPS**: mantém as URLs apontando para os domínios finais (https://app.meudominio.com/oauth/nuvemshop/callback).
- **App de Dev**: tem seu próprio ClientId e ClientSecret, com URLs fixas para desenvolvimento (http://localhost:5173/oauth/nuvemshop/callback).

---

## 2. Separação de Variáveis de Ambiente no Ecossistema Multi-Repo

Com dois aplicativos criados, padronizei o ambiente em cada uma das frentes:

### Backend (.NET API)
No backend, utilizei a separação nativa do ASP.NET Core:
- ppsettings.Development.json: configurado com o ClientId e o ClientSecret do app de testes local.
- ppsettings.Production.json: mantido na VPS com as credenciais do app principal.

`json
// appsettings.Development.json
{
  "Nuvemshop": {
    "ClientId": "45672",
    "ClientSecret": "e38e0aa000421...",
    "RedirectUrl": "http://localhost:5173/oauth/nuvemshop/callback"
  }
}
`

### Frontends (React, Landing e Widget)
Nos projetos em Vite e Astro, criei arquivos .env.development e .env.production.

No dashboard em React:
`ini
# .env.development
VITE_API_URL=https://localhost:7129
VITE_WIDGET_URL=http://localhost:4173

# .env.production
VITE_API_URL=https://app.meudominio.com
VITE_WIDGET_URL=https://widget-cfp.pages.dev
`

Quando rodo pm run dev, o Vite pega automaticamente o arquivo de dev e aponta para a API e o widget locais. No deploy pelo GitHub Actions (que descrevi no post sobre [minha estratégia de CI/CD na VPS](/blog/estrategia-deploy-cicd-multi-repo-dotnet-vps)), o build gera o pacote estático com as variáveis de produção.

---

## 4. Webhooks do Stripe sem Conflito entre Ambientes

Tanto a VPS quanto o ambiente local utilizam chaves de teste (sandbox) do Stripe. O risco nesse cenário era um evento de assinatura disparado no Stripe cair no ambiente errado.

Para evitar isso:
- O webhook cadastrado no dashboard do Stripe aponta exclusivamente para a URL pública da VPS.
- No desenvolvimento local, não registro endpoints de webhook no painel web. Em vez disso, utilizo a **Stripe CLI** para encaminhar os eventos sob demanda:

`bash
stripe listen --forward-to localhost:7129/api/billing/webhook
`

A CLI do Stripe gera um webhook secret exclusivo para a sessão do terminal. Eu coloco esse secret no meu appsettings.Development.json. Dessa forma, os eventos gerados pelos meus testes locais são capturados apenas pelo meu processo local, sem interferir no processamento da VPS.

