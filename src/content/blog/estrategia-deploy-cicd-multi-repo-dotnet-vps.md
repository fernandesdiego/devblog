---
title: "Estratégia de CI/CD e Deploy para Arquitetura Multi-Repo: .NET API, Dashboard e Widget"
subtitle: "Como estruturei a entrega entre três repositórios independentes em uma VPS e Cloudflare"
description: "Decisões sobre monorepo vs multi-repo, roteamento de APIs com Cloudflare e pipelines de automação para um ecossistema com API .NET e Web Components."
date: 2026-10-01
tags: [devops, cicd, dotnet, cloudflare, arquitetura, vps]
category: tech
author: "Diego Fernandes"
draft: false
---

Ao desenhar a arquitetura de um SaaS que envolve uma API de backend em .NET, um dashboard administrativo em React e um widget embeddável distribuído para lojas parceiras, uma das  decisões críticas que tomei foi a organização dos repositórios e a estratégia de entrega (CI/CD).

Recentemente, avaliei o dilema clássico: **Monorepo ou Multi-Repo?** E como viabilizar um deploy simples e de baixo custo.

---

## O Dilema: Monorepo vs Repositórios Separados

A tentação inicial de colocar tudo em um único repositório é forte, mas para o meu caso de uso, as responsabilidades e cadências de deploy são completamente distintas:

1. **Backend**: Web API em .NET 8 / C#, banco PostgreSQL, EF Core, integrações com gateways de pagamento (Stripe) e marketplaces (Nuvemshop).
2. **Frontend Dashboard**: SPA estático focado na gestão do lojista.
3. **Widget de Atendimento**: Web Component ultraleve empacotado que precisa de cache agressivo e distribuição via CDN para não impactar o carregamento das lojas.

---

## Roteamento e Prefixo `/api`

Durante o desenvolvimento dos endpoints, optei por seguir o padrão `/api/[controller]/` em todos os endpoints. Ao conectar a VPS com o domínio, avaliei duas opções de exposição:

* **Opção A**: Alterar todos os controllers do .NET para remover o prefixo `/api` e deixar o reverse proxy lidar com a reescrita de URL.
* **Opção B**: Manter a convenção padrão `[Route("api/[controller]")]` no .NET e configurar o Cloudflare / NGINX para fazer o encaminhamento transparente.

A **Opção B** foi a minha escolha. Modificar rotas no código apenas para acomodar regras externas de proxy criaria um acoplamento desnecessário, fora o trabalho pra alterar **todas** as rotas e quebra contratos de testes de integração existentes.

Exemplo de configuração limpa do NGINX na VPS:

```nginx
server {
    listen 80;
    server_name api.mydomain.com;

    # minha api
    location /api/ {
        proxy_pass http://localhost:5000;
        #[...]
    }

    #spa
    location / {
        root /var/www/frontend;
        index index.html;
    }
}
```

---

## Pipeline de CI/CD com GitHub Actions

Para a entrega contínua da API .NET, estruturei um pipeline simples no GitHub Actions que roda os testes e executa o deploy via SSH depois reinicia o serviço no `systemd`:
*Totalmente vibecodado btw, sem paciencia pra estruturar yaml*
```yaml
name: Deploy Backend API

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Run Tests
        run: dotnet test --configuration Release --verbosity normal

      - name: Publish API
        run: dotnet publish ChatAgent.Api -c Release -o ./publish

      - name: Deploy to VPS via SSH
        uses: appleboy/scp-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          source: "./publish/*"
          target: "/opt/backendservice"

      - name: Restart Service
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: sudo systemctl restart backend.service
```

---

## O veredito 
Acho que por enquanto esse setup está bom. O deploy está redondo. O widget é atualizado automaticamente pela Cloudflare pages quando faço push na master, e as pipellines do backend e frontend estão rodando perfeitas.