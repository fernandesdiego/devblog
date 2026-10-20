---
title: "Estratégia de Observabilidade e Logs"
subtitle: "Tracing de IA do .NET Aspire para produção na VPS"
description: "Grafana Cloud (Loki + Tempo) com Alloy e OpenTelemetry no .NET 8."
date: 2026-10-04
updated: 2026-10-18
tags: [devops, linux, dotnet, observability, logs, vps, grafana, opentelemetry, ai]
category: tech
author: "Diego Fernandes"
draft: false
---

Embora o journalctl resolva em casos mais simples, navegar por milhares de linhas de JSON, rastrear stack traces multilinhas e filtrar requisições simultâneas direto no terminal não foi muito produtivo pra mim.

Hoje avaliei alternativas para transformar a observabilidade da minha aplicação sem sobrecarregar a memória da minha VPS, que ja é pouca 😪

---

## O Problema: Limitações do journalctl

O `journalctl` é como um agregador de logs do sistema, e não exatamente uma ferramenta de análise de produto:
- **Sem Syntax Highlighting**: Mensagens informativas (`INFO`), avisos (`WARN`) e exceções críticas (`ERROR`) aparecem com a mesma cor.
- **Dificuldade com JSON**: Se a sua API .NET usa `ILogger` com Serilog ou JSON Console Formatter, cada log vira um bloco difícil de ler.
- **Filtros Limitados**: Fazer queries como "mostre apenas erros HTTP 500 ocorridos nos últimos 30 minutos" exige combinar `grep`, `awk` ou `jq` que eu nunca lembro como usa.

---

## A Escolha Definitiva: Grafana Cloud

Como desenvolvo isso sozinho e rodo os serviços em um servidor com 4GB de RAM, instalar uma stack pesada como ElasticSearch/Kibana (ELK) está fora de questão.

A solução que implementei e que resolveu o problema foi usar o **[Grafana Cloud](https://grafana.com/products/cloud/)**.

O plano gratuito deles atende muito bem, com **50 GB de logs por mês no Loki** e suporte a **Traces distribuídos no Tempo**, sem ocupar a memória da VPS rodando banco de dados de log local.

### 1. Coletando Logs da VPS com Grafana Alloy

Para enviar os logs da API sem mexer no código, instalei o **Grafana Alloy** rodando como serviço no Linux.

O Alloy se conecta diretamente ao journald e encaminha o stdout/stderr da aplicação em tempo real para o Loki:

```text
// /etc/alloy/config.alloy
loki.source.journal "journald" {
  max_age = "12h"
  forward_to = [loki.write.grafana_cloud.receiver]
  labels = {
    job  = "systemd-journal",
    host = "vps-backend",
  }
}

loki.write "grafana_cloud" {
  endpoint {
    url = "https://logs-prod-xxx.grafana.net/loki/api/v1/push"
    basic_auth {
      username = "SEU_USER_ID"
      password = "SEU_GRAFANA_CLOUD_API_KEY"
    }
  }
}
```

Isso me permite rodar queries em **LogQL** direto no navegador:

```text
{host="vps-backend"} | json | level = "Error" and durationMs > 500
```

---

### 2. Tracing de IA: Trazendo a Experiência do .NET Aspire para Produção

Durante o desenvolvimento local no Visual Studio, eu utilizava o **.NET Aspire**, que possui um dashboard excelente que formata as requisições de IA do Semantic Kernel como conversas de chat, exibindo:
- O prompt enviado para o modelo
- A resposta gerada
- As ferramentas (*tool calls*) executadas
- A contagem exata de tokens de entrada e saída

Ao subir a API para a VPS Linux de produção, eu não tinha mais o dashboard do Aspire rodando. A solução foi o **OpenTelemetry** conectado ao **Grafana Tempo**.

Nos serviços da API, precisamos ativar as flags de diagnóstico:

```csharp
// 1. Habilita diagnósticos detalhados de IA nos spans do Semantic Kernel
AppConttext.SetSwitch("Microsoft.SemanticKernel.Experimental.GenAI.EnableOTelDiagnosticsSensitive", true);

// 2. Habilita telemetria no SDK da OpenAI
AppConttext.SetSwitch("OpenAI.Experimental.EnableOpenTelemetry", true);

builder.Services.AddOpenTelemetry()
    .WithTracing(tracing =>
    {
        tracing
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddSource("Microsoft.SemanticKernel*")
            .AddSource("OpenAI*")
            .AddOtlpExporter(otlp =>
            {
                otlp.Endpoint = new Uri(builder.Configuration["Grafana:OtlpEndpoint"]!);
                otlp.Headers = $"Authorization=Bearer {builder.Configuration["Grafana:ApiKey"]}";
            });
    });
```

---

### 3. A Pegadinha dos Prompts no Grafana Tempo: Span Events vs Attributes

Ao testar os traces no **Grafana Tempo**, eu conseguia visualizar os spans e o tempo de execução, mas os ttextos das conversas e os prompts não apareciam na aba principal de atributos.

Investigando o comportamento dos SDKs, descobri alguns detalhes:

1. **Span Events vs Attributes**: Seguindo a convenção do OpenTelemetry para GenAI, o Semantic Kernel não grava o ttexto dos prompts como tags/atributos do span. Ele emite como **Span Events** (especificamente gen_ai.content.prompt e gen_ai.content.completion). No Grafana Tempo, esses eventos não ficam na lista lateral de Attributes, mas em uma aba colapsada chamada **Events** ou **Logs** dentro do span inspecionado.
2. **Proteção de PII no SDK da OpenAI**: O cliente oficial OpenAI v2 omite o corpo de prompts e completions dos traces para evitar vazamento de dados sensíveis. Ele grava apenas métricas de modelo, duração e contagem de tokens (gen_ai.usage.input_tokens).
3. **Microsoft.Extensions.AI (Google Gemini)**: Quando utilizo o cliente do Google via Microsoft.Extensions.AI, é obrigatório configurar explicitamente a captura de dados sensíveis no pipeline:
   ```csharp
   .UseOpenTelemetry(configure: opt => opt.EnableSensitiveData = true)
   ```
4. **Conttexto de Negócio com ActivitySource Próprio**: Os requests de IA frequentemente rodam em background tasks. Quando o endpoint responde 200/202, o trace raiz se encerra. Para não perder o conttexto da conversa, envolvi o fluxo em um ActivitySource próprio da aplicação, adicionando ao span conversation.id, store.id e workspace.id.

---

Com esse setup, consigo monitorar em produção na VPS o mesmo nível de detalhe que eu tinha localmente no Aspire, mantendo a correlação de TraceId entre o Loki e o Tempo com consumo mínimo de recurso.