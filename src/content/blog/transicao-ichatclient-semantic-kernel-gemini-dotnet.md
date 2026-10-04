---
title: "Da Transição do IChatCompletionService para o Microsoft.Extensions.AI: Integrando Gemini no .NET"
subtitle: "Como migrei para o novo padrão de IA da Microsoft e resolvi problemas de tool calling com Semantic Kernel"
description: "A evolução do ecossistema de IA no .NET: saindo de conectores legados para o IChatClient da Microsoft com o SDK oficial da Google e Semantic Kernel."
date: 2026-10-01
tags: [dotnet, csharp, ai, semantic-kernel, gemini, aspire]
category: tech
author: "Diego Fernandes"
draft: false
---

No início, cada framework (Semantic Kernel, LangChain.NET, etc) criava suas próprias abstrações proprietárias de chat, como o `IChatCompletionService`.

Quando fui integrar os novos modelos do Google Gemini (como o `gemini-1.5-flash` e versões mais recentes) via endpoints compatíveis com OpenAI, comecei a esbarrar em inconsistências de payloads, streaming truncado e erros de serialização. O que eu ja deveria esperar, pois os endpoints do google que sao OpenAI-Comptible ainda estao em beta

A solução definitiva foi adotar a nova iniciativa oficial da Microsoft: o **`Microsoft.Extensions.AI`** e sua interface central, **`IChatClient`**.

---

## O Problema: Conectores Proprietários vs SDKs Nativos

O Semantic Kernel dependia de conectores específicos (`Microsoft.SemanticKernel.Connectors.OpenAI`, `Google`, etc.). O grande problema dessa abordagem é que qualquer atualização na API dos provedores exigia que o conector do Semantic Kernel fosse atualizado.

Ao mesmo tempo, usar a camada "OpenAI-compatible" do Google causava falhas silenciosas na resolução de tipos e nas chamadas de tools.

A Microsoft decidiu resolver isso padronizando o ecossistema com o pacote `Microsoft.Extensions.AI.Abstractions`. Agora, os provedores (Google, Azure, OpenAI, Ollama) implementam diretamente `IChatClient`, e o Semantic Kernel consome qualquer cliente que implemente essa interface.

---

## A Estrutura da Solução

Instalei o SDK oficial `Google.GenAI` e registrei o cliente configurando a injeção de dependência no `DependencyInjection.cs` da camada de Infra:

```csharp
public static IServiceCollection AddAiInfrastructure(this IServiceCollection services, IConfiguration configuration)
{
    var geminiApiKey = configuration["Google:ApiKey"] 
        ?? throw new InvalidOperationException("Google API Key is missing.");

    // Registra o IChatClient nativo com middleware de invocação de funções
    services.AddChatClient(sp =>
    {
        var googleClient = new GoogleGenAIClient(new GoogleGenAIOptions
        {
            ApiKey = geminiApiKey
        });

        return googleClient
            .AsChatClient(modelId: "gemini-1.5-flash")
            .AsBuilder()
            .UseKernelFunctionInvocation() // para resolução de tools do Semantic Kernel
            .Build(sp);
    });

    return services;
}
```

---

## O Ponto de Atenção: Invocação de Tools e OpenTelemetry

Durante os testes de integração, me deparei com um cenário curioso: a primeira mensagem era processada com sucesso (`200 OK`), mas a partir da segunda mensagem em que o modelo deveria invocar ferramentas de consulta no banco, o fluxo parecia "travar" sem lançar exceções explícitas.

Investigando os spans do **OpenTelemetry** no dashboard do **.NET Aspire**:

```json
{
  "name": "POST",
  "url.full": "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?*",
  "http.response.status_code": 200
}
```

O motivo? Ao transicionar para o pipeline de middlewares do `IChatClient`, é necessário garantir que o middleware correto do Semantic Kernel seja acoplado:

1. **`UseFunctionInvocation()`** vs **`UseKernelFunctionInvocation()`**: Quando você utiliza o Kernel do Semantic Kernel com plugins injetados no container, o middleware precisa ter acesso ao `IServiceProvider` (`sp`) para instanciar e executar os plugins corretamente.
2. **Resolução de Spans e Logs**: Registrar o exporter do OpenTelemetry explicitamente no `Program.cs` para capturar os erros retornados internamente pelo SDK do Google.

---


Se eu fosse começar um projeto com IA em .NET hoje, começaria direto pelo `Microsoft.Extensions.AI`.