---
title: "Guardrails de Tool Calling e Anti-Alucinação em Agentes de IA para E-commerce"
subtitle: "Precondições de execução, URLs canônicas e transição humana proativa no .NET"
description: "Como evitei chamadas desnecessárias de ferramentas com e-mails inventados, links quebrados e reduzi a fricção no handoff humano."
date: 2026-10-16
tags: [dotnet, ai, semantic-kernel, prompts, ecommerce, csharp]
category: tech
author: "Diego Fernandes"
draft: false
---

Durante os testes com conversas reais, identifiquei três comportamentos problemáticos:

1. **Alucinação de links**: O agnte inventava URLs para produtos sugeridos (ex: https://minhaloja.com.br/produtos/tenis-preto), levando o comprador a páginas de erro 404.
2. **Uso de ferramentas com dados inventados**: Quando o cliente perguntava "onde está o meu pedido?", o modelo chamava a ferramenta "SearchCustomerOrders" utilizando e-mails fictícios de exemplo (como cliente@example.com)
3. **Problema no handoff**: Ao se deparar com uma dúvida fora do escopo, o agente demorava para oferecer ajuda humana e, quando o cliente pedia a transferência, perguntava novamente: "Qual o motivo da transferência?", irritando quem já havia explicado o problema.

Para resolver essas falhas, estruturei guardrails específicos combinando tipagem de domínio e diretrizes rígidas no System Prompt.

---

## 1. URLs Canônicas no Catálogo e Regra Rígida de Links

Modelos de linguagem adoram completar padrões. Se um cliente pede a recomendação de um tênis, o modelo tende a inventar uma URL baseada no título do produto.

Para eliminar essa alucinação, atualizei o modelo de leitura de catálogo na minha API para expor explicitamente a URL canônica sincronizada da plataforma:

```csharp
public record ProductDto(
    string Id,
    string Name,
    decimal Price,
    string? CanonicalUrl,
    DateTimeOffset? UpdatedAtUtc
);
```

Em seguida, adicionei uma regra mandatória no SystemPromptBuilder:

```markdown
- Strict Link & URL Rules: Never fabricate, synthesize, or guess links or URLs. 
  Only share product links if an exact url property is provided by the tool execution result. 
  If no URL is available in the tool data, provide the exact product name and instruct 
  the customer to search for it on the store.
```

Com essa instrução, se o objeto retornado pela ferramenta de busca de produtos contiver a URL canônica, o agente envia o link real. Caso contrário, ele cita o nome exato do produto e instrui o cliente a buscar na loja, sem inventar links.

---

## 2. Precondição de Execução em Tool Calling

Estavamos desperdiçando tokens e ruests no rastreamento de pedidos.

A ferramenta SearchCustomerOrders exige o e-mail do cliente para localizar compras na Nuvemshop. Quando o cliente dizia apenas "quero saber do meu pedido", o agente tentava adivinhar o e-mail ou usava placeholders presentes no histórico.

Ajustei o System Prompt com uma precondição de bloqueio prévio:

```markdown
- Order Tracking Precondition: Never call SearchCustomerOrders with guessed, placeholder, 
  or synthetic email addresses (e.g., '@example.com' or dummy names). 
  If the customer has not explicitly provided their email address in the current conversation, 
  you MUST ask the customer for their email first before invoking any order lookup tool.
```

O resultado foi imediato: o agente agora pausa a intenção de busca, solicita educadamente o e-mail ao cliente e só dispara a requisição quando possui um dado real, reduzindo o uso da API e evitou respostas falsas de "pedido não encontrado".

---

## 3. Handoff Proativo e Síntese de Conttexto

Um agente de atendimento eficiente precisa saber a hora de sair do caminho. Quando um cliente faz perguntas complexas sobre negociação, fretes atípicos ou reclamações, insistir em respostas automáticas desgasta o relacionamento.

Reestruturei o procedimento de transição com duas decisões de design:

1. **Sugestão proativa**: Em vez de esperar o cliente se irritar e exigir um humano, o agente identifica a limitação e oferece a transferência ativamente ("Gostaria que eu te transferisse para um atendente humano para te ajudar com isso?").
2. **Síntese automática do motivo**: O agente é proibido de perguntar "qual o motivo da transferência?" se o conttexto já estiver evidente na conversa. Ele mesmo resume o problema e passa o parâmetro sintetizado para a ferramenta de transferência:

Essa abordagem elimina perguntas repetitivas e entrega para o atendente humano no painel administrativo um resumo claro do motivo da transferência antes mesmo do atendimento começar.
