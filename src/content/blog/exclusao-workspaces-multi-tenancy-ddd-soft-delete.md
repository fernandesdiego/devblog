---
title: "Exclusão de Workspaces e Multi-Tenancy em DDD: Soft Delete e Desacoplamento"
subtitle: "O ciclo de vida de tenants, vazamento de dados e bloqueios de banco"
description: "Regras de negócio, desanexação de lojas via Aggregate Root no EF Core e encerramento de SSE com Domain Events."
date: 2026-10-11
tags: [dotnet, csharp, ddd, efcore, saas, arquitetura]
category: tech
author: "Diego Fernandes"
draft: false
---

No produto que estou trabalhando, deletar o tenant principal afeta faturamento, integridade de índices no banco, conexões em tempo real e privacidade de dados de terceiros. Um cascade delete descuidado ou um soft delete superficial trariam problemas graves em produção. Decidi estruturar essas regras diretamente no domínio.

---

## 1. O Risco de Colisão de Índices e Vazamento de Dados

A minha aplicação integra lojas virtuaistexternas (como a Nuvemshop). No banco de dados, a tabela de conexões possui um índice de unicidade composto:

```sql
UNIQUE (platform,texternal_id)
```

Se eu apenas marcasse o workspace e a loja como deletados via soft delete, o registro de conexão continuaria existindo na tabela. Caso o lojista tentasse conectar essa mesma loja em outro workspace no futuro (ou se a loja fosse vendida para outro comerciante), a tentativa de conexão falharia por violação de chave única.

Pior ainda: se eu permitisse reaproveitar o registro antigo da loja, o novo proprietário herdaria o histórico de conversas, métricas e mensagens de clientes do dono anterior.

Para resolver isso, fui diretamente no aggregate root Store:

```csharp
public class Store : AggregateRoot
{
    public StoreConnection? StoreConnection { get; private set; }

    public void Disconnect()
    {
        StoreConnection = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SoftDelete()
    {
        IsDeleted = true;
        DeletedAtUtc = DateTime.UtcNow;
        Disconnect();
    }
}
```

Ao chamar store.Disconnect(), removemos o registro de StoreConnection, liberando a chave (platform,texternal_id). Ao mesmo tempo, a entidade Store e suas mensagens históricas permanecem arquivadas no workspace excluído para fins de auditoria, garantindo que qualquer conexão futura crie uma loja totalmente limpa.

---

## 2. A Proteção Contra o Estado de Zero Workspaces

O frontend da aplicação espera que todo usuário autenticado possua pelo menos um workspace pra trabalhar.
Inicialmente, a verificação parecia simples: checar se o usuário possui outros workspaces antes de permitir a exclusão. Porém, surgiu uma falha: um usuário pode ser proprietário de 1 workspace e ser convidado como Agente em outros 3 workspaces.

Se a contagem considerasse todos os workspaces, ele conseguiria deletar o seu único workspace próprio. Ao perder o acesso aos workspaces de terceiros no futuro, ele ficaria com zero workspaces e a interface quebraria.

Ajustei a regra no domínio e no repositório para validar exclusivamente os workspaces próprios:

```csharp
var ownedWorkspacesCount = await _workspaceRepository
    .CountOwnedWorkspacesByUserIdAsync(currentUserId.Value, ct);

if (ownedWorkspacesCount <= 1)
{
    return Result.Failure(WorkspaceErrors.CannotDeleteLastWorkspace);
}
```

Dessa forma, o usuário é impedido de deletar o seu último workspace onde tem papel de Owner.

---

## 3. Bloqueio por Assinatura Ativa no Stripe

Outra decisão foi como lidar com cobranças recorrentes. Se o usuário deletar o workspace mantendo uma assinatura ativa no Stripe, o cartão continuaria sendo faturado nos meses seguintes, gerando contestações e estornos.

A abordagem adotada foi exigir o pré-requisito explícito:

```csharp
if (workspace.Subscription?.IsActive() == true)
{
    return Result.Failure(WorkspaceErrors.ActiveSubscriptionPreventsDeletion);
}
```

Se houver assinatura ativa, a API recusa a exclusão retornando 409 Conflict. O proprietário precisa cancelar a renovação no portal de faturamento antes de encerrar o workspace.

---

## 4. Desconexão de Streams (SSE) via Domain Event

Quando o workspace é deletado, qualquer conexão aberta de Server-Sent Events (SSE) precisa ser fechada imediatamente para evitar que sessões zumbis continuem escutando eventos.

Em vez de chamar o gerenciador de conexões dentro do command handler, desacoplei essa responsabilidade utilizando Domain Events:

```csharp
// No agregado Workspace
public void SoftDelete()
{
    IsDeleted = true;
    DeletedAtUtc = DateTime.UtcNow;
    
    AddDomainEvent(new WorkspaceDeletedDomainEvent(Id));
}
```

O evento é capturado pelo handler na camada de aplicação:

```csharp
public class WorkspaceDeletedDomainEventHandler 
    : INotificationHandler<WorkspaceDeletedDomainEvent>
{
    private readonly ISseConnectionManager _sseConnectionManager;

    public WorkspaceDeletedDomainEventHandler(ISseConnectionManager sseConnectionManager)
    {
        _sseConnectionManager = sseConnectionManager;
    }

    public Task Handle(WorkspaceDeletedDomainEvent notification, CancellationToken ct)
    {
        _sseConnectionManager.RemoveAllWorkspaceConnections(notification.WorkspaceId);
        return Task.CompletedTask;
    }
}
```

Isso mantém o handler focado apenas na persistência e regras de negócio, delegando os efeitos colaterais para a infra.

---

## 5. Confirmação de Nome DELETE

Para evitar exclusões acidentais, exijo que o usuário confirme o nome exato do workspace.

```text
DELETE /api/workspaces/{workspaceId}?confirmName=Meu%20Workspace
```

Muitos proxies reversos e CDNs (como Cloudflare, que uso na frente da minha VPS, conforme detalhei no post sobre [minha estratégia de CI/CD e NGINX](/blog/estrategia-deploy-cicd-multi-repo-dotnet-vps)) descartam o body dos DELETE por padrão. O query parameter garante que a confirmação vai ser recebida.
