# Sprint 10: Central de Notificações Inteligentes

## 1. Resumo Executivo

Sistema completo de notificações inteligentes para o GLPI Control Center. O sistema observa eventos em todos os módulos e gera notificações automaticamente, mantendo módulos completamente desacoplados através de um Event Bus.

### Resultados
- 7 novos arquivos de notificações
- 4 arquivos integrados com eventos
- Badge em tempo real
- Painel lateral estilo Google Workspace
- Filtros, busca e agrupamento por data
- Persistência via Repository Pattern
- Pronto para Email, WhatsApp, Push, Teams, Slack

---

## 2. Fluxograma

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FLUXO DE NOTIFICAÇÃO                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │ Workflow  │───>│              │    │              │                  │
│  └──────────┘    │              │    │              │                  │
│  ┌──────────┐    │ Notification │    │ Notification │                  │
│  │Projectors│───>│ Events       │───>│ Templates    │                  │
│  └──────────┘    │ .dispatch()  │    │ .apply()     │                  │
│  ┌──────────┐    │              │    │              │                  │
│  │ Reports  │───>│              │    │              │                  │
│  └──────────┘    └──────────────┘    └──────┬───────┘                  │
│  ┌──────────┐                               │                          │
│  │  Auth    │───>───────────────────────────>│                          │
│  └──────────┘                               │                          │
│  ┌──────────┐                               │                          │
│  │Dashboard │───>───────────────────────────>│                          │
│  └──────────┘                               ▼                          │
│                                    ┌──────────────┐                    │
│                                    │ Notifications│                    │
│                                    │ .receive()   │                    │
│                                    └──────┬───────┘                    │
│                                           │                            │
│                                    ┌──────▼───────┐                    │
│                                    │  Storage     │                    │
│                                    │  .save()     │                    │
│                                    └──────┬───────┘                    │
│                                           │                            │
│                                    ┌──────▼───────┐                    │
│                                    │  UI          │                    │
│                                    │  .render()   │                    │
│                                    └──────────────┘                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Arquivos Criados

| Arquivo | Responsabilidade | Linhas |
|---------|------------------|--------|
| `notifications.config.js` | Configuração de categorias, tipos, eventos, ações | ~180 |
| `notifications_events.js` | Event Bus (Observer Pattern) | ~200 |
| `notifications_storage.js` | Repository Pattern (localStorage) | ~220 |
| `notifications_templates.js` | Templates de mensagens | ~180 |
| `notifications.js` | Módulo principal (orquestrador) | ~300 |
| `notifications_center.js` | Lógica do painel lateral | ~200 |
| `notifications_ui.js` | Renderização UI | ~280 |
| `notifications.css` | Estilos completos | ~450 |

**Total: ~2,010 linhas de código**

---

## 4. Arquivos Modificados

| Arquivo | Mudanças |
|---------|----------|
| `index.html` | Adicionado sino, painel, scripts de notificações |
| `app.js` | Inicialização dos módulos de notificações |
| `workflow.js` | Dispatch de eventos WORKFLOW_CREATED, WORKFLOW_ERROR |
| `auth.js` | Dispatch de eventos AUTH_LOGIN, AUTH_LOGOUT, AUTH_DOMAIN_DENIED |
| `projectors.js` | Dispatch de evento PROJECTOR_MAINT_DONE |
| `report_export.js` | Dispatch de eventos REPORT_EXPORTED, REPORT_ERROR |

---

## 5. Detalhes dos Módulos

### 5.1 notifications.config.js

Define toda a configuração driven:

```javascript
// Categorias
categories: {
  INFO, SUCCESS, WARNING, ERROR, SYSTEM, AUDIT,
  WORKFLOW, PROJECTORS, REPORTS, AUTH, INTEGRATIONS
}

// 24 eventos automáticos pré-configurados
events: {
  WORKFLOW_CREATED, WORKFLOW_CANCELLED, WORKFLOW_COMPLETED, WORKFLOW_ERROR,
  PORTAL_OPENED, PORTAL_IFRAME_BLOCKED, PORTAL_FALLBACK,
  PROJECTOR_LAMP_HIGH, PROJECTOR_LAMP_CRITICAL, PROJECTOR_MAINT_OVERDUE, PROJECTOR_MAINT_DONE,
  DASHBOARD_UPDATED, DASHBOARD_ERROR,
  REPORT_EXPORTED, REPORT_VIEWED, REPORT_ERROR,
  AUTH_LOGIN, AUTH_LOGOUT, AUTH_SESSION_EXPIRED, AUTH_DOMAIN_DENIED,
  INTEGRATION_STARTED, INTEGRATION_SUCCESS, INTEGRATION_ERROR, INTEGRATION_CANCELLED,
}
```

### 5.2 notifications_events.js (Event Bus)

```javascript
// Subscrever
window.NotificationEvents.on('workflow:created', callback);

// Despachar
window.NotificationEvents.dispatch('workflow:created', { id: 123 });

// Conveniência
window.NotificationEvents.dispatchWorkflow('created', { id: 123 });
window.NotificationEvents.dispatchProjector('lamp_high', { id: 456 });

// wildcard
window.NotificationEvents.on('workflow:*', callback);
window.NotificationEvents.on('*', callback);
```

### 5.3 notifications_storage.js (Repository Pattern)

```javascript
// CRUD
window.NotificationsStorage.findAll();
window.NotificationsStorage.findById(id);
window.NotificationsStorage.save(notification);
window.NotificationsStorage.remove(id);

// Consultas
window.NotificationsStorage.countUnread();
window.NotificationsStorage.findUnread();
window.NotificationsStorage.findByCategory('ERROR');
window.NotificationsStorage.search('query');
window.NotificationsStorage.findByDateGroups();

// Manutenção
window.NotificationsStorage.maintenance();
window.NotificationsStorage.cleanupExpired();
window.NotificationsStorage.enforceMaxLimit();
```

### 5.4 notifications.js (Orquestrador)

```javascript
// Receber notificação
window.Notifications.receive({
  eventKey: 'WORKFLOW_CREATED',
  data: { id: 123, ativo: 'PC-001' },
  usuario: 'João',
  origem: 'workflow',
});

// Criar manualmente
window.Notifications.create({
  titulo: 'Aviso Manual',
  mensagem: 'Mensagem customizada',
  categoria: 'SYSTEM',
});

// Ações
window.Notifications.markAsRead(id);
window.Notifications.markAllAsRead();
window.Notifications.dismiss(id);
window.Notifications.dismissAll();
window.Notifications.executeAction(id);

// Consultas
window.Notifications.getAll();
window.Notifications.getUnreadCount();
window.Notifications.getGrouped();
window.Notifications.search(query);
window.Notifications.getFiltered('UNREAD');
```

### 5.5 notifications_center.js

```javascript
// Painel
window.NotificationsCenter.open();
window.NotificationsCenter.close();
window.NotificationsCenter.toggle();
window.NotificationsCenter.isOpen();

// Filtros
window.NotificationsCenter.setFilter('ERRORS');
window.NotificationsCenter.getFilters();

// Busca
window.NotificationsCenter.setSearch('query');
window.NotificationsCenter.clearSearch();

// Dados processados
window.NotificationsCenter.getData();
```

### 5.6 notifications_ui.js

```javascript
// Inicializar
window.NotificationsUI.init();

// Widget do dashboard
window.NotificationsUI.renderDashboardWidget('container-id');
```

---

## 6. Integração com Módulos

### 6.1 Workflow (workflow.js)

```javascript
// Chamado criado com sucesso
if (window.NotificationEvents) {
  window.NotificationEvents.dispatchWorkflow('created', {
    id: result.ticketId,
    ativo: this.workflowData.asset?.nome || 'Ativo',
    usuario: window.UserContext?.getCurrentUser()?.nome || 'Sistema',
  });
}

// Erro ao criar chamado
if (window.NotificationEvents) {
  window.NotificationEvents.dispatchWorkflow('error', {
    erro: err.message,
    ativo: this.workflowData.asset?.nome || 'Ativo',
    usuario: window.UserContext?.getCurrentUser()?.nome || 'Sistema',
  });
}
```

### 6.2 Auth (auth.js)

```javascript
// Login bem-sucedido
if (window.NotificationEvents) {
  window.NotificationEvents.dispatchAuth('login', {
    usuario: googleUser.name,
    email: googleUser.email,
  });
}

// Logout
if (window.NotificationEvents) {
  window.NotificationEvents.dispatchAuth('logout', {
    usuario: user?.nome || 'desconhecido',
  });
}

// Domínio negado
if (window.NotificationEvents) {
  window.NotificationEvents.dispatchAuth('domain_denied', {
    email: email,
    reason: reason,
  });
}
```

### 6.3 Projetores (projectors.js)

```javascript
// Manutenção registrada
if (window.NotificationEvents && updates.maintenanceDate) {
  window.NotificationEvents.dispatchProjector('maint_done', {
    id: glpiId,
    nome: `Projetor #${glpiId}`,
    usuario: window.UserContext?.getCurrentUser()?.nome || 'Sistema',
  });
}
```

### 6.4 Relatórios (report_export.js)

```javascript
// Exportação concluída
if (window.NotificationEvents) {
  window.NotificationEvents.dispatchReport('exported', {
    nome: config?.titulo || 'Relatório',
    format: format,
    count: data.length,
    usuario: window.UserContext?.getCurrentUser()?.nome || 'Sistema',
  });
}

// Erro na exportação
if (window.NotificationEvents) {
  window.NotificationEvents.dispatchReport('error', {
    erro: err.message,
    nome: config?.titulo || 'Relatório',
  });
}
```

---

## 7. Estrutura de uma Notificação

```javascript
{
  id: 'notif_lx7k2m_abc12',
  titulo: 'Chamado #123 criado',
  mensagem: 'João abriu um chamado para PC-001.',
  categoria: 'WORKFLOW',
  tipo: 'create',
  icone: '🎫',
  usuario: 'João Silva',
  dataHora: '2026-08-07T14:30:00.000Z',
  origem: 'workflow',
  prioridade: 'NORMAL',
  lida: false,
  acao: { tipo: 'OPEN_WORKFLOW', params: { id: 123 } },
  dados: { id: 123, ativo: 'PC-001' },
  expiracao: null,
}
```

---

## 8. Persistência

### Storage Key
`glpi.notifications.items`

### Limites
- Máximo: 100 notificações em memória
- TTL: 30 dias
- Limpeza periódica: a cada 1 hora

### Repository Pattern
```javascript
// Trocar de localStorage para API futuramente:
window.NotificationsStorage = {
  findAll: () => fetch('/api/notifications').then(r => r.json()),
  save: (n) => fetch('/api/notifications', { method: 'POST', body: JSON.stringify(n) }),
  // ...
};
```

---

## 9. Acessibilidade

- **ARIA**: Botões com `title` e `aria-label`
- **Focus**: `:focus-visible` em todos os elementos interativos
- **ESC**: Fecha o painel
- **Keyboard Navigation**: Tab navigation funciona
- **Reduced Motion**: `@media (prefers-reduced-motion: reduce)` desativa animações

---

## 10. Responsividade

| Breakpoint | Comportamento |
|------------|---------------|
| Desktop (>768px) | Painel lateral 400px |
| Tablet (≤768px) | Painel 100% width |
| Mobile (≤480px) | Painel full-screen, botões menores |

---

## 11. Design Patterns Utilizados

| Pattern | Onde |
|---------|------|
| **Observer** | NotificationEvents.on/off/dispatch |
| **Event Bus** | NotificationEvents (centralizado) |
| **Repository** | NotificationsStorage (abstração de persistência) |
| **Factory** | NotificationTemplates.apply() |
| **Configuration Driven** | NOTIFICATIONS_CONFIG (tudo configurável) |
| **Strategy** | Filtros (cada filtro é uma estratégia) |
| **State** | NotificationsCenter (estado do painel) |
| **Singleton** | Módulos window.* |

---

## 12. Bloco de Aprendizado

### 12.1 Observer Pattern

O Observer Pattern define uma dependência um-para-muitos entre objetos. Quando um objeto (Subject) muda de estado, todos os objetos dependentes (Observers) são notificados e atualizados automaticamente.

**No GCC:** `NotificationEvents.on('workflow:created', callback)` registra um observer. Quando o evento é disparado, todos os callbacks são chamados.

**Vantagens:**
- Baixo acoplamento entre módulos
- Fácil de adicionar novos listeners
- Suporte a wildcards (`workflow:*`)

### 12.2 Event Bus

Um Event Bus é um padrão que centraliza a comunicação entre módulos. Em vez de módulos se chamarem diretamente, eles publicam eventos em um "bus" central, e outros módulos se inscrevem nos eventos de interesse.

**No GCC:** `window.NotificationEvents` é o Event Bus. Nenhum módulo conhece diretamente outro.

**Fluxo:**
```
Workflow → dispatch('workflow:created') → Event Bus → Notifications.receive()
```

### 12.3 Auditoria vs Notificação

| Aspecto | Auditoria | Notificação |
|---------|-----------|-------------|
| **Propósito** | Registro para compliance | Comunicar ao usuário |
| **Público** | Administradores | Usuário atual |
| **Dados** | Logs técnicos completos | Mensagens amigáveis |
| **Retenção** | Longa (anos) | Curta (30 dias) |
| **Ação** | Nenhuma (somente leitura) | Pode ter ações |

**Desacoplamento:** Audit e Notification são módulos independentes. Um evento de auditoria PODE gerar uma notificação, mas não OBRIGATORIAMENTE.

### 12.4 Evitando Acoplamento

```javascript
// ❌ ERRADO - Acoplamento direto
window.Workflow.onCreated(function () {
  window.Notifications.create(...); // Workflow conhece Notifications
});

// ✅ CORRETO - Via Event Bus
window.NotificationEvents.on('workflow:created', function (e) {
  window.Notifications.receive(...); // Desacoplado
});
```

### 12.5 Escalando para Milhões

Para escalar:
1. **Backend**: Mover storage para banco (PostgreSQL/MongoDB)
2. **WebSocket**: Push em tempo real
3. **Queue**: Usar Redis/RabbitMQ para filas
4. **Particionamento**: Shard por usuário/data
5. **Cache**: Redis para notificações quentes
6. **Virtualização**: UI com virtual scroll

### 12.6 Migrando para Backend

```javascript
// Storage atual (localStorage)
window.NotificationsStorage = { save, findAll, ... };

// Storage futuro (API)
window.NotificationsStorage = {
  save: (n) => api.post('/notifications', n),
  findAll: () => api.get('/notifications'),
  remove: (id) => api.delete(`/notifications/${id}`),
};
```

### 12.7 Preparação para WebSocket

```javascript
// Futuro: substituir polling por WebSocket
const ws = new WebSocket('wss://api.example.com/notifications');
ws.onmessage = function (event) {
  const notif = JSON.parse(event.data);
  window.Notifications.receive(notif);
};
```

### 12.8 Push Notification

```javascript
// Futuro: registrar service worker
if ('serviceWorker' in navigator) {
  const reg = await navigator.serviceWorker.register('/sw.js');
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: VAPID_KEY,
  });
  // Enviar subscription para backend
}
```

### 12.9 WhatsApp Integration

```javascript
// Futuro: adapter para WhatsApp
window.WhatsAppNotificationAdapter = {
  send: async function (notification) {
    await api.post('/integrations/whatsapp/send', {
      to: notification.userPhone,
      message: `${notification.titulo}\n${notification.mensagem}`,
    });
  },
};
```

### 12.10 Fluxo Completo: Audit.log() → Notificação

```
1. Workflow cria chamado
   → window.Audit.register({ action: 'chamado_aberto', ... })
   → window.NotificationEvents.dispatchWorkflow('created', { id: 123 })

2. NotificationEvents processa
   → dispatch('workflow:created', data)
   → Notifica listeners em 'workflow:created'
   → Notifica listeners em 'workflow:*'
   → Notifica listeners em '*'

3. Notifications.js recebe
   → receive({ eventKey: 'WORKFLOW_CREATED', data })
   → NotificationTemplates.apply('workflow_created', data)
   → Monta objeto de notificação
   → NotificationsStorage.save(notif)
   → Emite 'notifications:new'

4. NotificationsUI processa
   → Escuta 'notifications:new'
   → _renderBadge() atualiza contador
   → _renderPanel() atualiza lista (se aberto)

5. Usuário vê
   → Badge mostra "5"
   → Clica no sino
   → Painel abre
   → Vê "Chamado #123 criado"
```

---

## 13. Checklist de Testes

| Teste | Esperado | Status |
|-------|----------|--------|
| Abrir chamado | Notificação WORKFLOW_CREATED criada | ✅ |
| Erro ao abrir chamado | Notificação WORKFLOW_ERROR criada | ✅ |
| Login Google | Notificação AUTH_LOGIN criada | ✅ |
| Logout | Notificação AUTH_LOGOUT criada | ✅ |
| Domínio negado | Notificação AUTH_DOMAIN_DENIED criada | ✅ |
| Registrar manutenção projetor | Notificação PROJECTOR_MAINT_DONE criada | ✅ |
| Exportar relatório | Notificação REPORT_EXPORTED criada | ✅ |
| Erro exportação | Notificação REPORT_ERROR criada | ✅ |
| Badge atualizado | Contador atualiza em tempo real | ✅ |
| Marcar como lida | Badge decrementa | ✅ |
| Excluir notificação | Remove do storage | ✅ |
| Marcar todas como lidas | Badge zera | ✅ |
| Busca | Filtra por título/mensagem | ✅ |
| Filtros | Filtra por categoria | ✅ |
| Agrupamento | Hoje/Ontem/7d/Mais antigas | ✅ |
| Refresh página | Notificações mantidas | ✅ |
| ESC fecha painel | Painel fecha | ✅ |
| Responsividade mobile | Painel full-width | ✅ |
| Reduced Motion | Animações desativadas | ✅ |

---

## 14. Métricas

| Métrica | Valor |
|---------|-------|
| Arquivos criados | 8 |
| Arquivos modificados | 6 |
| Linhas de código | ~2,010 |
| Eventos automáticos | 24 |
| Categorias | 11 |
| Templates | 24 |
| Filtros | 9 |
| Ações | 5 |
| Canais futuros | 8 |

---

## 15. Melhorias para Sprint 11

1. **Widget de Dashboard**: Integrar notificações no painel principal
2. **Sons**: Notificação sonora para eventos críticos
3. **Agrupamento visual**: Colapsar notificações similares
4. **Quick Actions**: Ações rápidas inline
5. **WebSocket**: Push em tempo real
6. **Badges por módulo**: Contadores individuais
7. **Exportar notificações**: Download como JSON/CSV
8. **Preferências**: Configurar quais notificações receber
9. **Programação**: Agendar notificações
10. **Analytics**: Métricas de engajamento

---

**Sprint 10 Concluído em:** 07/08/2026
**Próximo Sprint:** Sprint 11 - Dashboard Analytics e Widget de Notificações
