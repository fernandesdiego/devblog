---
title: "Integrando Gemini com Semantic Kernel e Microsoft.Extensions.AI no .NET"
subtitle: "Resolvendo tool calling e conectando o SDK oficial do Google"
description: "Como conectar o SDK oficial Google.GenAI ao Semantic Kernel usando o IChatClient do .NET."
date: 2026-10-01
updated: 2026-10-08
tags: [dotnet, csharp, ai, semantic-kernel, gemini, aspire]
category: tech
author: "Diego Fernandes"
draft: false
---

Quando fui integrar os modelos do Google Gemini no Semantic Kernel usando os endpoints de compatibilidade da OpenAI, tive problemas com streaming truncado e falhas de serialização nos schemas do Gemini. Os endpoints do Google compatíveis com OpenAI ainda estão em beta, então isso era esperado.

Para resolver isso, mudei para o SDK oficial `Google.GenAI` e conectei ao Semantic Kernel através do **`Microsoft.Extensions.AI`** (`IChatClient`). 

O `IChatCompletionService` continua existindo no Semantic Kernel, mas agora o framework tem adaptadores bidirecionais para o `IChatClient` (`.AsChatClient()` e `.AsChatCompletionService()`). Isso permitiu usar o client oficial do Google com middleware unificado.

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

Durante os testes de integração, me deparei com um cenário curioso: a primeira mensagem era processada com sucesso (`200 OK`), mas na segunda mensagem, quando o modelo chamava uma ferramenta de consulta no banco, o fluxo parava sem lançar exceções.

Investigando os spans do **OpenTelemetry** no dashboard do **.NET Aspire**:

```json
{
  "name": "POST",
  "url.full": "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?*",
  "http.response.status_code": 200
}
```

O endpoint retornava 200, mas a execução não prosseguia.

O motivo estava no middleware de invocação:

1. **`UseFunctionInvocation()` vs `UseKernelFunctionInvocation()`**: O pacote `Microsoft.Extensions.AI` puro expõe `UseFunctionInvocation()`. Mas quando você usa o Semantic Kernel com plugins registrados no container (`IServiceProvider`), o método correto é o **`UseKernelFunctionInvocation()`**. Ele garante que o pipeline receba o `IServiceProvider` (`sp`) para resolver e instanciar os `KernelPlugin` em tempo de execução.
2. **Resolução de Spans e Logs**: Registre o exporter do OpenTelemetry explicitamente no `Program.cs` para capturar diagnósticos internos e limites de cota retornados pelo SDK do Google (como `Google.GenAI.ServerError: high demand`).

---

## Conclusão

Essa mudança simplificou a integração:
- Dá para usar o SDK oficial do provedor sem depender de conectores de terceiros.
- O Semantic Kernel continua funcionando como orquestrador através dos adaptadores de `IChatClient`.
- Trocar ou combinar modelos no mesmo backend virou apenas uma questão de injeção de dependência.