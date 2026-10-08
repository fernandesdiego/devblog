---
title: "Estratégia de Observabilidade e Logs"
subtitle: "Tracing de IA do .NET Aspire para produção na VPS"
description: "Grafana Cloud (Loki + Tempo) com Alloy e OpenTelemetry no .NET 8."
date: 2026-10-04
updated: 2026-10-08
tags: [devops, linux, dotnet, observability, logs, vps, grafana, opentelemetry, ai]
category: tech
author: "Diego Fernandes"
draft: false
---

Embora o `journalctl` resolva em casos mais simples, navegar por milhares de linhas de JSON, rastrear stack traces multilinhas e filtrar requisições simultâneas direto no terminal não foi muito produtivo pra mim.

Hoje avaliei alternativas para transformar a observabilidade da minha aplicação sem sobrecarregar a memória da minha VPS, que ja é pouca 😪

---

## O Problema: Limitações do journalctl

O `journalctl` é como um agregador de logs do sistema, e não exatamente uma ferramenta de análise de produto:
- **Sem Syntax Highlighting**: Mensagens informativas (`INFO`), avisos (`WARN`) e exceções críticas (`ERROR`) aparecem com a mesma cor.
- **Dificuldade com JSON**: Se a sua API .NET usa `ILogger` com Serilog ou JSON Console Formatter, cada log vira um bloco difícil de ler.
- **Filtros Limitados**: Fazer queries como "mostre apenas erros HTTP 500 ocorridos nos últimos 30 minutos" exige combinar `grep`, `awk` ou `jq` que eu nunca lembro como usa.

---

### A Escolha Definitiva: Grafana Cloud

Como desenvolvo isso tudo sozinho e rodo os serviços em um servidor com 4GB de RAM, instalar uma stack pesada como ElasticSearch/Kibana (ELK) está fora de questão.

No fim das contas, a solução que eu implementei e que resolveu o problema foi usar o **[Grafana Cloud](https://grafana.com/products/cloud/)**.

O plano gratuito deles é bem generoso, com **50 GB de logs por mês no Loki** e suporte a **Traces distribuídos no Tempo**, sem ocupar a memória da VPS rodando banco de dados de log local.

#### A. Coletando Logs da VPS com Grafana Alloy

Para enviar os logs da API sem mexer no código, instalei o **Grafana Alloy** rodando como serviço:

O Alloy se conecta diretamente ao `journald` e encaminha o `stdout`/`stderr` da aplicação em tempo real para o Loki:

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

#### B. Tracing de IA: Trazendo a Experiência do .NET Aspire para Produção

Durante o desenvolvimento local no Visual Studio, eu usava o **.NET Aspire** que tem uma tela excelente que formata as requisições de IA do Semantic Kernel como se fossem mensagens de chat, mostrando:
- O prompt enviado para o Gemini/OpenAI
- A resposta gerada
- As ferramentas (*tool calls*) que o modelo decidiu executar
- A contagem exata de tokens de entrada e saída

Ao subir a API para a VPS Linux de produção, eu não tinha mais o dashboard do Aspire rodando. Então a solução foi o **OpenTelemetry** conectado ao **Grafana Tempo**.

Nos serviços da API, precisamos ativar duas flags para que os diagnósticos de IA não sejam omitidos:

```csharp
// 1. Habilita diagnósticos detalhados de IA nos spans do Semantic Kernel
AppContext.SetSwitch("Microsoft.SemanticKernel.Experimental.GenAI.EnableOTelDiagnosticsSensitive", true);

// 2. O mesmo pra OpenAI
AppContext.SetSwitch("OpenAI.Experimental.EnableOpenTelemetry", true);

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

Ao abrir o **Explore > Tempo** no Grafana Cloud e inspecionar uma requisição de chat:
* Os spans de `SemanticKernel.InvokeFunction` ou `chat.completions` aparecem na linha do tempo.
* Clicando na aba **Attributes** do span, vejo os atributos `gen_ai.prompt`, `gen_ai.completion`, `gen_ai.usage.input_tokens` e os JSONs brutos de cada tool executada pelo agente.
* E com a correlação de `TraceId` nos logs do Loki, um clique no log de erro me leva direto para o trace com a conversa completa.

---

#### C. Controlando o Nível de Logs no systemd

Para não lotar a cota gratuita do Grafana com logs de `Debug` desnecessários em produção, ajustei as variáveis de ambiente no arquivo `.env` do serviço:

```text
# Configuração de Logs em Produção
Logging__LogLevel__Default=Information
Logging__LogLevel__Microsoft.AspNetCore=Warning
```

---

Com esse setup consegui manter em produção na VPS o "mesmo nível" de detalhe que eu tinha localmente no Aspire, mantendo o consumo de memória da VPS em níveis mínimos e custo zero.