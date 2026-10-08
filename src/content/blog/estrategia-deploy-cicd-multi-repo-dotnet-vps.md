---
title: "CI/CD e Deploy em Multi-Repo: API .NET, Dashboard e Widget"
subtitle: "Como organizei a entrega em três repositórios com VPS e Cloudflare"
description: "Estrutura de deploy em repositórios separados, rotas no NGINX e GitHub Actions."
date: 2026-10-01
updated: 2026-10-08
tags: [devops, cicd, dotnet, cloudflare, arquitetura, vps]
category: tech
author: "Diego Fernandes"
draft: false
---

Meu projeto tem três frentes: uma API de backend em .NET 8, um dashboard administrativo em React e um widget embeddável distribuído para lojas parceiras. Avaliei se valia a pena juntar tudo em um monorepo ou manter separado, e como fazer o deploy na VPS de forma simples.

---

## Monorepo vs Repositórios Separados

Cada parte do projeto tem um ritmo e requisitos de deploy diferentes:

1. **Backend**: Web API em .NET 8, banco PostgreSQL, EF Core, integrações com Stripe e Nuvemshop. Precisa de build de release e migrations.
2. **Frontend Dashboard**: SPA focado no lojista, com deploys rápidos na Cloudflare Pages.
3. **Widget**: Um script leve empacotado que precisa de cache agressivo em CDN para não pesar nas lojas dos clientes.

Optei por manter **repositórios isolados**. Isso deixa o workspace do backend enxuto e evita que alterações no frontend disparem builds desnecessários na API.

---

## O Prefixo `/api` e o Roteamento

Ao apontar o Cloudflare para a VPS com NGINX, avaliei duas opções:
- Alterar todos os controllers do .NET para remover o prefixo `/api` e reescrever no proxy.
- Manter `[Route("api/[controller]")]` no .NET e deixar o NGINX apenas repassar as requisições.

Fiquei com a segunda opção. Mudar rotas no código apenas por causa do proxy cria acoplamento desnecessário e quebra testes de integração.

Configuração do NGINX na VPS:

```nginx
server {
    listen 80;
    server_name api.meudominio.com;

    location / {
        proxy_pass         http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

---

## Pipeline de CI/CD com GitHub Actions

Para a entrega contínua da API, montei um workflow simples no GitHub Actions: roda os testes, gera o publish e reinicia o serviço no `systemd` via SSH.

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
          target: "/var/www/chatagent-api"

      - name: Restart Service
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: sudo systemctl restart chatagent.service
```

---

## Conclusão

- Rodar a API direto no `systemd` com NGINX em uma VPS comum oferece ótimo desempenho e depuração simples com `journalctl`.
- Executar os testes antes do publish no GitHub Actions evita que builds quebrados cheguem ao servidor de produção.