---
title: "Desafios de OAuth 2.0 em Desenvolvimento Local: Integração Nuvemshop e Cloudflare Tunnels"
subtitle: "Como resolvi problemas de redirect URI, HTTPS local e testes em múltiplos dispositivos durante a integração com marketplace"
description: "Como debuguei e estruturei o fluxo de autenticação OAuth 2.0 da Nuvemshop em .NET, lidando com teste em dere local e usando Cloudflare Tunnels."
date: 2026-09-29
tags: [oauth2, nuvemshop, dotnet, backend, security, api]
category: tech
author: "Diego Fernandes"
draft: false
---

Integrar aplicações com marketplaces de e-commerce como a Nuvemshop traz grandes vantagens para distribuição, mas o fluxo de autenticação via **OAuth 2.0** costuma ser uma das etapas mais propensas a erros sutis durante o desenvolvimento local.

Recentemente, ao testar a instalação do aplicativo tanto no meu computador de desenvolvimento quanto em dispositivos na mesma rede local e sandbox da Nuvemshop, enfrentei os clássicos problemas de incompatibilidade de *Redirect URI* e exigência de HTTPS.

Aqui está a solução que encontrei e o que aprendi no caminho trabalhando no desenvolvimento desse backend.

---

## O Fluxo OAuth na Nuvemshop

O fluxo padrão segue a especificação de Authorization Code:

1. O lojista clica em "Instalar Aplicativo" no painel da Nuvemshop.
2. A Nuvemshop redireciona para a URL de autorização da minha aplicação passando o `code`.
3. O backend troca o `code` temporário pelo `access_token` e `user_id` (Store ID) via requisição POST autenticada.
4. O backend persiste as credenciais vinculadas ao lojista e redireciona para a interface do painel.

```csharp
public class NuvemshopAuthService : INuvemshopAuthService
{
    private readonly HttpClient _httpClient;
    private readonly NuvemshopOptions _options;

    public NuvemshopAuthService(HttpClient httpClient, IOptions<NuvemshopOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<NuvemshopTokenResponse> ExchangeCodeForTokenAsync(string code, CancellationToken ct = default)
    {
        var requestPayload = new
        {
            client_id = _options.ClientId,
            client_secret = _options.ClientSecret,
            grant_type = "authorization_code",
            code = code
        };

        var response = await _httpClient.PostAsJsonAsync("https://www.nuvemshop.com.br/apps/authorize/token", requestPayload, ct);
        
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadFromJsonAsync<NuvemshopTokenResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Falha ao desserializar resposta de autenticação da Nuvemshop.");
    }
}
```

---

## Os Desafios do Ambiente Local

### 1. Mismatch de Portas e Callback URLs
Ao configurar o aplicativo no Portal de Parceiros da Nuvemshop, a URL de callback deve coincidir **exatamente** com a URL que faz a requisição. Um erro clássico ocorre quando:
- O frontend Vite/React roda em `https://192.168.1.6:5173`.
- A API .NET roda em `https://localhost:5001`.
- A URL registrada no painel da Nuvemshop aponta para `https://192.168.1.6:5176/login/callback`.

Qualquer divergência de porta ou protocolo resulta em erro `invalid_grant` ou `redirect_uri_mismatch`. E
eu fiz isso algumas vezes durante o desenvolvimento , estava indeciso sobre o endpoint de callback e toda vez tinha que ir la no portal do app na Nuvemshop e trocar.

Decida-se ou vai ter que perder alguns minutos trocando isso toda vez igual eu perdi.🤦‍♂️

### 2. HTTPS Obrigatório e Redirecionamentos na LAN
A Nuvemshop exige https para endpoints de callback. Para testar em outros computadores na mesma rede, certificados autoassinados do Vite/Kestrel foram rejeitados pelo safari quando testei.

Uma solução que adotei para esse cenário foi o **Cloudflare Tunnel**:

```bash
cloudflared tunnel --url http://localhost:[port]
```

Agora tenho um domínio público com TLS válida (`https://meu-app.trycloudflare.com`). Resolvi os problemas com portas locais e IPs dinâmicos de rede local e posso testar webhooks reais enviados pelos servidores da Nuvemshop e Stripe