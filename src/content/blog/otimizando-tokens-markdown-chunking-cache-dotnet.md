---
title: "Otimizando RAG e Redução de Tokens com Markdown Chunking e Cache no .NET"
subtitle: "Como reduzi em mais de 80% o consumo de tokens nas consultas de políticas sem precisar de um banco vetorial"
description: "Estratégia prática de engenharia no .NET: conversão de HTML para Markdown no adapter de infraestrutura, chunking estrutural por cabeçalhos e cache com sliding expiration."
date: 2026-10-03
updated: 2026-10-07
tags: [dotnet, csharp, ai, clean-architecture, performance, nuvemshop]
category: tech
author: "Diego Fernandes"
draft: false
---

Um grande desafio que encontrei (tanto de latência quanto de custo) integrando um agente de IA na plataforma da Nuvemshop, é a injeção de contexto.

As lojas possuem páginas extensas de termos de uso, políticas de troca, devolução e regras de frete. A API da Nuvemshop entrega todo esse conteúdo em **HTML bruto**.

Se eu simplesmente enviasse o HTML retornado da API para a tool de busca do agente, consumiria milhares de tokens desnecessários com tags como `<div>`, `<p>`, `<span>` e estilos embutidos, além de poluir a atenção do modelo.

Hoje, reestruturei essa funcionalidade na minha API para resolver o problema de uma vez.

---

## O Desafio Arquitetural e Clean Architecture

A primeira discussão crítica foi: **onde deve residir a responsabilidade de converter o HTML?**

Seguindo os princípios de **Clean Architecture e DDD**:
- O formato HTML é um detalhe de entrega específico da API externa da Nuvemshop.
- A camada de **Application** não deve saber que a política veio em HTML, JSON ou texto puro.
- Portanto, a library de conversão (`ReverseMarkdown`) foi isolaad na camada de **Infra**, entregando para a aplicação um modelo limpo em Markdown.

```csharp
// Infrastructure: Conversão isolada no Adapter externo
public async Task<StorePolicies> GetPoliciesAsync(string storeId, CancellationToken ct = default)
{
    var rawHtmlPolicies = await _httpClient.GetFromJsonAsync<NuvemshopRawPolicies>($"/v1/{storeId}/policies", ct);
    
    var converter = new ReverseMarkdown.Converter();
    
    return new StorePolicies(
        RefundPolicy: converter.Convert(rawHtmlPolicies.RefundHtml),
        ShippingPolicy: converter.Convert(rawHtmlPolicies.ShippingHtml)
    );
}
```

---

## Chunking Estrutural sem Banco Vetorial

Adicionar um vector db (PgVector, Qdrant, Pinecone) para fazer RAG agora adiciona complexidade operacional e custo desnecessários pra esse projeto. Meu único cliente aqui é o Ecommerce da minha esposa 😁

Implementei uma abordagem que julguei eficiente o bastante para o momento:

1. **Quebra por Cabeçalhos**: O serviço de politica divide o Markdown em seções baseadas em títulos (`#`, `##`, `###`).
2. **Scoring Ponderado**: O termo buscado pelo usuário pontua mais alto se coincidir com o título da seção (peso 3x) do que com o corpo do texto (peso 1x).
3. **Retorno Enxuto**: Apenas a seção relevante com limite de caracteres é retornada para o agente.

---

## Gerenciamento de Memória com Sliding Expiration

Como estamos falando de uma aplicação stateless, não tem como saber com precisão o segundo exato em que o comprador fecha a aba do chat na loja.

Para evitar chamadas HTTP repetitivas à API da Nuvemshop a cada mensagem do mesmo comprador, utilizei o `IMemoryCache` do .NET com **Sliding Expiration**:

```csharp
public async Task<string> SearchPolicyAsync(string storeId, string query, CancellationToken ct = default)
{
    var cacheKey = $"policies_{storeId}";

    var policies = await _cache.GetOrCreateAsync(cacheKey, async entry =>
    {
        // Renova o cache por mais 15 minutos se houver novas mensagens na loja
        entry.SetSlidingExpiration(TimeSpan.FromMinutes(15));
        
        // Garante que o cache expire totalmente após 2 horas de inatividade
        entry.SetAbsoluteExpiration(TimeSpan.FromHours(2));

        return await _nuvemshopClient.GetPoliciesAsync(storeId, ct);
    });

    return ChunkAndScorePolicy(policies, query);
}
```
*nao ficou exatamente assim mas da pra entender a ideia.*

Essa estratégia garante que:
* Enquanto houver compradores conversando na mesma loja, as políticas permanecem na memória.
* Quando o tráfego da loja zera, o IMemoryCache expira as entradas automaticamente e libera a memória, mantendo o consumo de RAM sob controle na minha humilde VPS.

---

## Resultados Práticos

* **Redução de Tokens**: As respostas das tools caíram de uma média de ~2.400 tokens (HTML completo) para ~280 tokens (chunk em Markdown relevante), gerando uma **economia de mais de 85% em tokens**.
* **Latência**: Redução no tempo de resposta do modelo, que agora processa prompts  mais concisos.
* **Testabilidade**: Com a separação de responsabilidades, criei testes de unidade tanto para a conversão de tags na infraestrutura quanto para os cenários de scoring no domínio.