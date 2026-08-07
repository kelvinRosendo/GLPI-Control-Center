# Sprint 9.5: Google OAuth, Controle de Acesso e Perfis de Usuário

## 1. Visão Geral

Sistema completo de autenticação, autorização e gerenciamento de sessões para o GLPI Control Center.

### Objetivos
- Autenticação via Google OAuth 2.0
- Controle de acesso baseado em funções (RBAC)
- Perfis de usuário com permissões granulares
- Sidebar dinâmica baseada no perfil
- Sessão persistente via localStorage
- Arquitetura preparada para futuras integrações (AD, Azure AD, LDAP, SSO)

---

## 2. Arquitetura

### 2.1 Fluxo de Autenticação

```
┌─────────────────────────────────────────────────────────────────┐
│                        INICIALIZAÇÃO                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. auth.config.js          Carrega configurações               │
│  2. permissions.js          Define perfis e permissões          │
│  3. user_context.js         Gerencia sessão do usuário          │
│  4. auth_guard.js           Verifica autenticação               │
│  5. auth.js                 Inicializa Google OAuth             │
│  6. app.js                  Inicia aplicação                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Fluxo de Login

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Tela Login  │────>│ Google OAuth │────>│ Validação    │
│              │     │              │     │ Domínio      │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                          ┌───────▼───────┐
                                          │ Criar Sessão  │
                                          │ UserContext   │
                                          └───────┬───────┘
                                                  │
                                          ┌───────▼───────┐
                                          │ App.onLogin   │
                                          │ Success()     │
                                          └───────────────┘
```

### 2.3 Fluxo de Proteção de Rota

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Usuário     │────>│ AuthGuard    │────>│ Verificar    │
│  clica módulo│     │ .guard()     │     │ Sessão       │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                          ┌───────▼───────┐
                                          │ Verificar     │
                                          │ Permissão     │
                                          └───────┬───────┘
                                                  │
                                    ┌─────────────┴─────────────┐
                                    │                           │
                              ┌─────▼─────┐             ┌───────▼───────┐
                              │ Permitido │             │ Negado        │
                              │ Render    │             │ showAccess    │
                              └───────────┘             │ Denied()      │
                                                        └───────────────┘
```

---

## 3. Arquivos

### 3.1 Novos Arquivos (Sprint 9.5)

| Arquivo | Responsabilidade |
|---------|------------------|
| `auth.config.js` | Configuração do Google OAuth, domínios permitidos, configurações de sessão |
| `permissions.js` | Definição de perfis, módulos, permissões por perfil, ações por módulo |
| `user_context.js` | Gerenciamento de sessão, getters do usuário, persistência, delegação de permissões |
| `auth_guard.js` | Verificação de autenticação, proteção de rotas, monitoramento de sessão |

### 3.2 Arquivos Atualizados

| Arquivo | Mudanças |
|---------|----------|
| `auth.js` | Reescrito completamente - Google OAuth 2.0, modo demo, validação de domínio |
| `app.js` | Integração com AuthGuard, onLoginSuccess usa UserContext, logout |
| `ui_render.js` | renderTabs() usa módulos visíveis do perfil do usuário |
| `index.html` | Nova tela de login Google, scripts adicionados, elementos de user info |
| `styles.css` | Novos estilos para login Google e user info no topbar |

---

## 4. Detalhes dos Módulos

### 4.1 auth.config.js

```javascript
window.AUTH_CONFIG = {
  google: {
    clientId: 'SEU_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  },
  allowedDomains: ['colegiosatelite.com.br'],
  session: {
    storageKey: 'glpi_cc_session',
    tokenRefreshIntervalMs: 1800000, // 30 min
  },
  messages: {
    domainNotAllowed: 'Apenas emails @colegiosatelite.com.br são permitidos.',
    genericError: 'Erro ao autenticar. Tente novamente.',
  },
};
```

### 4.2 permissions.js

#### Perfis (7)

| Perfil | Cor | Label | Descrição |
|--------|-----|-------|-----------|
| `ADMIN` | `#ef4444` | Administrador | Acesso total |
| `TI` | `#3b82f6` | Tecnologia da Informação | Acesso técnico completo |
| `COORDENADORA` | `#10b981` | Coordenadora | Acesso pedagógico |
| `VICE_DIRETORA` | `#8b5cf6` | Vice-Diretora | Supervisão geral |
| `DIRETORA` | `#f59e0b` | Diretora | Gestão estratégica |
| `SUPORTE` | `#06b6d4` | Suporte | Suporte técnico |
| `VISUALIZADOR` | `#6b7280` | Visualizador | Somente leitura |

#### Módulos

| Módulo | Label | Nível Mínimo |
|--------|-------|--------------|
| `home` | Home | VISUALIZADOR |
| `computadores` | Computadores | VISUALIZADOR |
| `geekiees` | Geekiees | VISUALIZADOR |
| `apoio` | Carrinhos | VISUALIZADOR |
| `projetores` | Projetores | VISUALIZADOR |
| `impressoras` | Impressoras | VISUALIZADOR |
| `chamados` | Chamados | VISUALIZADOR |
| `relatorios` | Relatórios | COORDENADORA |
| `auditoria` | Auditoria | TI |
| `assistente` | Assistente | VISUALIZADOR |

#### Exemplo de Permissões por Perfil

```javascript
ROLE_PERMISSIONS = {
  VISUALIZADOR: {
    home: { view: true, edit: false, delete: false },
    computadores: { view: true, edit: false, delete: false },
    // ...
  },
  TI: {
    home: { view: true, edit: true, delete: false },
    computadores: { view: true, edit: true, delete: true },
    auditoria: { view: true, edit: true, delete: true },
    // ...
  },
  ADMIN: {
    // Tudo true
  },
};
```

### 4.3 user_context.js

#### API

```javascript
// Criar sessão
const session = window.UserContext.createSession({
  sub: 'google_id',
  name: 'João Silva',
  email: 'joao@colegiosatelite.com.br',
  picture: 'https://...',
  access_token: 'jwt_token',
}, 'COORDENADORA');

// Obter usuário atual
const user = window.UserContext.getCurrentUser();
// { id, nome, email, foto, perfil, provedor, dataLogin, ultimoAcesso }

// Verificar permissões
window.UserContext.canAccessModule('auditoria'); // true/false
window.UserContext.canDo('computadores', 'edit'); // true/false

// Módulos visíveis
const modules = window.UserContext.getVisibleModules();
// ['home', 'computadores', 'geekiees', ...]

// Gerenciamento de sessão
window.UserContext.isSessionValid(); // true/false
window.UserContext.refreshSession(); // boolean
window.UserContext.invalidate(); // void

// Restaurar sessão (localStorage)
const restored = window.UserContext.restoreSession(); // boolean
```

### 4.4 auth_guard.js

#### API

```javascript
// Inicializar
window.AuthGuard.init(); // retorna true se há sessão

// Verificar autenticação
window.AuthGuard.checkAuth(); // redireciona para login se não

// Verificar módulo
window.AuthGuard.checkModule('auditoria'); // redireciona se não

// Verificar ação
window.AuthGuard.checkAction('computadores', 'edit'); // boolean

// Guard completo
window.AuthGuard.guard('auditoria'); // verifica tudo
```

---

## 5. Integração com Módulos Existentes

### 5.1 audit.js

```javascript
// ANTES
_getCurrentUser() {
  return window.Globals?.getUsuario?.() || 'admin';
}

// DEPOIS
_getCurrentUser() {
  const user = window.UserContext?.getCurrentUser();
  return user?.nome || user?.email || 'desconhecido';
}
```

### 5.2 dashboard.js

```javascript
// Adicionar ao dashboard
const user = window.UserContext?.getCurrentUser();
if (user) {
  dashboardData.usuario = user.nome;
  dashboardData.perfil = user.perfil;
  dashboardData.ultimoLogin = user.dataLogin;
}
```

### 5.3 Relatórios

```javascript
// Em reports.js, onde gera relatório
const user = window.UserContext?.getCurrentUser();
event.usuario = user?.nome || 'sistema';
```

---

## 6. Configuração do Google OAuth

### 6.1 Criar Projeto no Google Cloud Console

1. Acesse https://console.cloud.google.com
2. Crie um novo projeto ou selecione um existente
3. Ative o **Google Identity Services API**
4. Vá em **Credentials** > **Create Credentials** > **OAuth client ID**
5. Configure o **OAuth consent screen**:
   - User Type: Internal
   - App name: GLPI Control Center
   - Support email: seu@email.com
6. Crie o **OAuth client ID**:
   - Application type: Web application
   - Authorized origins: `http://localhost:3000`, `https://seudominio.com`
   - Authorized redirect URIs: `https://seudominio.com/`

### 6.2 Configurar auth.config.js

```javascript
window.AUTH_CONFIG = {
  google: {
    clientId: '123456789-abcdefg.apps.googleusercontent.com',
  },
  // ...
};
```

---

## 7. Modo Demo

Quando o Google Client ID não está configurado ou o script do Google não carrega:

1. Aparece botão "Entrar (Modo Demo)"
2. Usuário digita qualquer email @colegiosatelite.com.br
3. Nome é gerado automaticamente do email
4. Perfil padrão: COORDENADORA

---

## 8. Eventos

### 8.1 Eventos Emitidos

| Evento | Quando |
|--------|--------|
| `guard:unauthenticated` | Tentativa de acesso sem autenticação |
| `guard:expired` | Sessão expirada |
| `guard:denied` | Permissão negada para módulo |
| `guard:passed` | Acesso permitido |
| `guard:access-denied` | UI de acesso negado exibida |

### 8.2 Escutar Eventos

```javascript
document.addEventListener('guard:denied', (e) => {
  console.log('Acesso negado ao módulo:', e.detail.module);
});
```

---

## 9. Persistência

### 9.1 localStorage

Chave: `glpi_cc_session`

```json
{
  "usuario": {
    "id": "google_123",
    "nome": "João Silva",
    "email": "joao@colegiosatelite.com.br",
    "foto": "https://...",
    "perfil": "COORDENADORA",
    "provedor": "google"
  },
  "dataLogin": "2026-08-07T10:00:00.000Z",
  "ultimoAcesso": "2026-08-07T10:30:00.000Z",
  "tokenAcesso": "jwt_token"
}
```

### 9.2 Renovação Automática

- A cada 30 minutos, `refreshSession()` é chamado
- `ultimoAcesso` é atualizado
- Se sessão inválida, redireciona para login

---

## 10. Segurança

### 10.1 Domínio Permitido

- Apenas emails `@colegiosatelite.com.br` são aceitos
- Outros domínios recebem mensagem de erro amigável
- Validação ocorre tanto no client quanto deve ocorrer no backend

### 10.2 Token

- Token JWT é armazenado em localStorage (para MVP)
- Em produção, considerar httpOnly cookies
- Token é revogado no logout via Google

### 10.3 XSS

- Todos os inputs são sanitizados com `_escapeHtml()`
- Não há eval() ou innerHTML com dados não sanitizados

---

## 11. Preparação para Futuras Integrações

### 11.1 Active Directory / Azure AD

```javascript
// Em auth.config.js, adicionar provider:
providers: {
  google: { /* config atual */ },
  azure: {
    clientId: 'azure-client-id',
    tenantId: 'azure-tenant-id',
  },
  ldap: {
    url: 'ldap://ad.colegiosatelite.com.br',
    baseDN: 'DC=colegiosatelite,DC=com,DC=br',
  },
}
```

### 11.2 Backend de Perfis

```javascript
// Atualizar _determineProfile para buscar do backend:
async function _determineProfile(email) {
  const response = await fetch(`/api/users/profile?email=${email}`);
  const data = await response.json();
  return data.profile || 'VISUALIZADOR';
}
```

### 11.3 SSO

```javascript
// Adicionar provider SAML/OIDC:
providers: {
  saml: {
    entryPoint: 'https://sso.colegiosatelite.com.br/saml',
    issuer: 'glpi-control-center',
  },
}
```

---

## 12. Checklist de Implementação

- [x] `auth.config.js` criado
- [x] `permissions.js` criado
- [x] `user_context.js` criado
- [x] `auth_guard.js` criado
- [x] `auth.js` reescrito com Google OAuth
- [x] `app.js` atualizado com integração auth
- [x] `ui_render.js` atualizado com sidebar dinâmica
- [x] `index.html` atualizado com nova tela login
- [x] `styles.css` atualizado com novos estilos
- [ ] `dashboard.js` atualizado com info do usuário (pendente)
- [ ] `audit.js` atualizado com UserContext (pendente)
- [ ] Testes de integração
- [ ] Documentação de deploy

---

## 13. Aprendizados

### 13.1 Google Identity Services

- O novo Google Identity Services (GIS) substitui o antigo `gapi.auth2`
- O botão "Sign in with Google" pode ser renderizado automaticamente ou customizado
- O callback recebe um JWT token que precisa ser decodificado

### 13.2 RBAC em Frontend

- Permissões no frontend são apenas para UX (esconder botões, menus)
- Validação real deve ocorrer no backend
- Usar `Permissions.hasModuleAccess()` para decidir o que renderizar

### 13.3 Sessão em localStorage

- localStorage é persistente entre reloads
- Não expira automaticamente (precisa de renovação manual)
- É acessível por qualquer script no mesmo domínio (risco de XSS)

---

**Sprint 9.5 Concluído em:** 07/08/2026
**Próximo Sprint:** Sprint 10 - Integração Backend e APIs REST
