---
title: "Cálculo de Frete em Tempo Real a Custo Zero e Extensibilidade no .NET"
subtitle: "Como conectei o agente de IA às plataformas de e-commerce sem gateways pagos"
description: "Modelagem em Clean Architecture, consumo nativo de endpoints de frete e tool calling encadeado com Semantic Kernel."
date: 2026-10-17
tags: [dotnet, csharp, ai, clean-architecture, semantic-kernel, nuvemshop]
category: tech
author: "Diego Fernandes"
draft: false
---

Identificamos que uma das perguntas frequentes feitas pelos clientes é "quanto custa o frete para o CEP tal?".

A alternativa mais óbvia seria contratar APIs externas de frete (como Melhor Envio ou Frenet). No entanto, essa abordagem traria alguns problemas, primeiro o custo de cada pergunta de frete, e segundo a que as lojas já possuem regras customizadas de frete configuradas na plataforma (como frete grátis acima de determinado valor, transportadoras próprias ou restrições por região). Um gateway genérico iria exibir um valor no chat e outro no checkout final da loja.

Decidi implementar o cálculo de frete consumindo diretamente as APIs da plataforma de e-commerce onde a loja já está hospedada.

---

Para garantir que o sistema não ficasse acoplado a nenhuma plataforma específica, defini uma assinatura agnóstica na interface do cliente de e-commerce:

`csharp
public interface IEcommerceClient
{
    Task<Result<ShippingCalculationResultDto>> CalculateShippingAsync(
        string storeId, 
        string postalCode, 
        string? variantId, 
        CancellationToken ct = default);
}
`

A resolução do adapter correto em runtime é feita através de uma factory (IProviderFactory.GetECommerce(platform)), permitindo suportar Nuvemshop hoje e plugar Shopify ou VTEX futuramente sem alterar a aplicação.

---

## 2. Consumo de Frete Nativo a Custo  (Adapter Nuvemshop)

Para obter o cálculo nativo da Nuvemshop, implementei duas estratégias:

1. **Temas Modernos (Next.js / Flight RSC)**: Lojas rodando em layouts modernos utilizam Server Actions. O adapter dispara uma requisição POST enviando o cabeçalho Next-Action e processa o stream de resposta pegando o shipping_options.
2. **Temas Tradicionais**: Fallback automático para o endpoint POST /shipping-calculator.
3. **Resolução Automática de produto**: Se o cliente perguntar o frete de um produto sem especificar a cor ou o tamanho, o adapter consulta o catálogo da loja e resolve a primeira variante ativa do item de forma transparente.

---

## 3. Encadeamento de Tools no Semantic Kernel

Para que o modelo de IA consiga calcular o frete com precisão, ele precisa combinar a identificação do produto com a cotação do CEP.

Estruturei duas ferramentas especializadas no Semantic Kernel:

- **ProductSearchTool**: Capaz de receber o nome do produto ou uma URL direta da loja (ex: loja.com/produtos/saia-azul), extrair o slug da URL e localizar o productId correspondente.
- **ShippingCalculationTool**: Higieniza o CEP (removendo caracteres especiais e validando os 8 dígitos numéricos do Brasil) e executa o cálculo via commands.

No System Prompt, adicionei regras de encadeamento e precondições semelhantes às que detalhei no post sobre [guardrails de tool calling](/blog/guardrails-anti-alucinacao-tool-calling-agente-ia):

1. **Pergunta genérica ("Quanto custa o frete para São Paulo?")**: O modelo consulta a ferramenta de políticas gerais (GetStorePolicyAsync) conforme expliquei em [otimização de tokens e busca de políticas](/blog/otimizando-tokens-markdown-chunking-cache-dotnet) e solicita que o cliente informe o produto e o CEP.
2. **Pergunta completa ("Quanto fica o frete da camiseta preta para o CEP 01001-000?")**: O agente encadeia automaticamente a busca do produto (SearchProductsAsync) e repassa o identificador retornado para o cálculo (CalculateShippingAsync).
3. **Prevenção de chutes**: O agente é terminantemente proibido de inventar ou adivinhar o CEP.
