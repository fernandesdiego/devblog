---
title: "Da Transição do IChatCompletionService para o Microsoft.Extensions.AI: Integrando Gemini no .NET"
subtitle: "Como migrei para o novo padrão de IA da Microsoft e resolvi problemas de tool calling com Semantic Kernel"
description: "A evolução do ecossistema de IA no .NET: conectando o SDK oficial do Google (Google.GenAI) ao Semantic Kernel através do IChatClient do Microsoft.Extensions.AI."
date: 2026-10-01
updated: 2026-10-07
tags: [dotnet, csharp, ai, semantic-kernel, gemini, aspire]
category: tech
author: "Diego Fernandes"
draft: false
---

Historicamente, cada biblioteca de orquestração de IA no .NET (como o Semantic Kernel com seu `IChatCompletionService` ou o LangChain.NET) definia suas próprias abstrações proprietárias para serviços de chat. Quando a Microsoft lançou o **`Microsoft.Extensions.AI`**, ela introduziu o **`IChatClient`**: uma abstração no nível do runtime/BCL para todo o ecossistema .NET, unificando provedores da mesma forma que o `ILogger` e o `IHttpClientFactory` unificaram logging e chamadas HTTP.

O `IChatCompletionService` continua existindo e ativo dentro do Semantic Kernel, mas agora o framework oferece suporte nativo e adaptadores bidirecionais para o `IChatClient` via métodos de extensão (`.AsChatClient()` e `.AsChatCompletionService()`).

Quando fui integrar os modelos mais recentes do Google Gemini (como o `gemini-1.5-flash`) via endpoints de compatibilidade da OpenAI, comecei a esbarrar em inconsistências de payloads, streaming truncado e falhas de serialização. O que eu já deveria esperar, pois os endpoints do Google compatíveis com OpenAI ainda estão em beta.

A solução definitiva foi adotar o SDK oficial `Google.GenAI` e conectá-lo ao Semantic Kernel usando a camada unificada do **`Microsoft.Extensions.AI`**.

---

## O Problema: Conectores Legados vs SDKs Nativos

O conector experimental da OpenAI no Semantic Kernel sofria para lidar com diferenças de schema e peculiaridades do protocolo v1beta do Gemini. Além disso, usar camadas de emulação de API costuma gerar falhas silenciosas na resolução de tipos e na execução de ferramentas (*tool calling* / *function calling*).

Adotar o `IChatClient` permitiu usar o client oficial da Google com um pipeline de middleware unificado, desacoplando a infraestrutura do conector legado do SK.

---

## A Estrutura da Solução no .NET

No `DependencyInjection.cs` da camada de Infrastructure, inicializei o cliente oficial `Google.GenAI.Client`, converti para `IChatClient`, acoplei o middleware de invocação de funções e registrei de volta como `IChatCompletionService` para o Semantic Kernel:

```csharp
// Infrastructure: Inicializa o SDK oficial do Google
var genAiClient = new Google.GenAI.Client(apiKey: activeProfile.ApiKey);

builder.Services.AddKeyedSingleton<IChatCompletionService>("chatAgent", (sp, key) =>
{
    // 1. Converte o client do Google para o padrão IChatClient do Microsoft.Extensions.AI
    var baseChatClient = Microsoft.Extensions.AI.GoogleGenAIExtensions
        .AsIChatClient(genAiClient, activeProfile.ChatModel);

    // 2. Acopla o middleware do Semantic Kernel para resolução de ferramentas
    var chatClient = new Microsoft.Extensions.AI.ChatClientBuilder(baseChatClient)
        .UseKernelFunctionInvocation()
        .Build(sp);

    // 3. Adapta de volta para a interface nativa do Semantic Kernel com injeção de dependência
    return Microsoft.SemanticKernel.ChatCompletion.ChatClientExtensions
        .AsChatCompletionService(chatClient, sp);
});
```

---

## O Ponto de Atenção: Invocação de Tools e OpenTelemetry

Durante os testes de integração, me deparei com um cenário curioso: a primeira mensagem era processada com sucesso (`200 OK`), mas a partir da segunda mensagem — quando o modelo deveria invocar ferramentas de consulta no banco —, o fluxo parecia travar sem lançar exceções explícitas.

Investigando os spans do **OpenTelemetry** no dashboard do **.NET Aspire**:

```json
{
  "name": "POST",
  "url.full": "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?*",
  "http.response.status_code": 200
}
```

O endpoint retornava 200, mas a execução parava.

O motivo estava na diferença entre os middlewares:

1. **`UseFunctionInvocation()` vs `UseKernelFunctionInvocation()`**: O pacote `Microsoft.Extensions.AI` puro expõe `UseFunctionInvocation()`. No entanto, quando você está utilizando o Semantic Kernel com plugins registrados no container de injeção de dependência (`IServiceProvider`), o método correto é o **`UseKernelFunctionInvocation()`** (fornecido pelo pacote de integração do Semantic Kernel). Ele garante que o pipeline passe o `IServiceProvider` (`sp`) para resolver e instanciar os `KernelPlugin` em tempo de execução.
2. **Resolução de Spans e Logs**: Sempre registre o exporter do OpenTelemetry explicitamente no `Program.cs` para capturar diagnósticos internos e limites de cota retornados pelo SDK do Google (como `Google.GenAI.ServerError: high demand`).

---

## Conclusão

A chegada do `Microsoft.Extensions.AI` traz uma maturidade enorme para o ecossistema .NET:
- **Padrão único de mercado**: Provedores agora podem focar em implementar `IChatClient` uma única vez.
- **Interoperabilidade**: O Semantic Kernel continua sendo um excelente orquestrador, mas sem precisar manter dezenas de conectores proprietários para cada provedor.
- **Flexibilidade**: Trocar ou combinar modelos de diferentes provedores no mesmo backend virou uma questão de injeção de dependência.

Se eu fosse começar um projeto com IA em .NET hoje, adotaria o `Microsoft.Extensions.AI` desde o dia um.